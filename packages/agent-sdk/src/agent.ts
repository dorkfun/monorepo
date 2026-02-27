import { WsMessage, Observation, Action } from "@dorkfun/core";
import { HttpClient } from "./http";
import { GameWebSocket } from "./ws";
import {
  AgentConfig,
  EscrowInfo,
  GameContext,
  GameResult,
  Strategy,
  PlayOptions,
  PrivatePlayOptions,
} from "./types";

const QUEUE_POLL_INTERVAL_MS = 2000;

function deriveWsUrl(serverUrl: string): string {
  return serverUrl.replace(/^http/, "ws");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DorkAgent {
  private readonly http: HttpClient;
  private readonly wsBaseUrl: string;
  private readonly playerId: string;
  private readonly displayName: string;
  private readonly signMessage: (message: string) => Promise<string>;
  private wsClient: GameWebSocket | null = null;
  private aborted = false;

  constructor(config: AgentConfig) {
    this.http = new HttpClient(config.serverUrl, config.signMessage);
    this.wsBaseUrl = config.wsUrl || deriveWsUrl(config.serverUrl);
    this.playerId = config.playerId;
    this.displayName = config.displayName || config.playerId;
    this.signMessage = config.signMessage;
  }

  /**
   * Check for an active match and reconnect if one exists.
   * Returns the game result if reconnection succeeds, or null if no active match.
   */
  async reconnect(
    strategy: Strategy,
    opts: PlayOptions = {}
  ): Promise<GameResult | null> {
    const log = opts.onLog || (() => {});

    const check = await this.http.checkActiveMatch(this.playerId);
    if (!check.hasActiveMatch || !check.matchId || !check.wsToken) {
      return null;
    }

    log("reconnect", `Found active match ${check.matchId}, reconnecting...`);
    return this.playMatch(
      check.matchId,
      check.wsToken,
      "?",
      check.gameId || "unknown",
      strategy,
      opts
    );
  }

  /**
   * Join the public matchmaking queue, wait for an opponent, then play a
   * complete game using the provided strategy. Resolves when the game ends.
   */
  async play(
    gameId: string,
    strategy: Strategy,
    opts: PlayOptions = {}
  ): Promise<GameResult> {
    const log = opts.onLog || (() => {});
    log("match", `Joining queue for ${gameId}...`);

    // 1. Join matchmaking queue
    let res = await this.http.joinQueue(this.playerId, gameId, undefined, opts.stakeWei);

    // 2. Poll until matched, reusing the same ticket
    while (res.status === "queued" && !this.aborted) {
      log("match", "Waiting for opponent...");
      await sleep(QUEUE_POLL_INTERVAL_MS);
      res = await this.http.joinQueue(this.playerId, gameId, res.ticket, opts.stakeWei);
    }

    if (this.aborted) {
      throw new Error("Agent was closed before a match was found");
    }

    const { matchId, wsToken, opponent } = res as {
      matchId: string;
      wsToken: string;
      opponent: string;
    };

    log("match", `Matched! matchId=${matchId} opponent=${opponent}`);

    // 3. Play the game over WebSocket
    return this.playMatch(matchId, wsToken, opponent, gameId, strategy, opts);
  }

  /**
   * Create or join a private match, then play a complete game.
   * If opts.inviteCode is provided, joins an existing private match.
   * Otherwise creates a new one and logs the invite code.
   */
  async playPrivate(
    gameId: string,
    strategy: Strategy,
    opts: PrivatePlayOptions = {}
  ): Promise<GameResult> {
    const log = opts.onLog || (() => {});

    let matchId: string;
    let wsToken: string;
    let opponent = "?";

    if (opts.inviteCode) {
      // Join existing private match
      log("match", `Accepting invite ${opts.inviteCode}...`);
      const res = await this.http.acceptPrivateMatch(
        this.playerId,
        opts.inviteCode
      );
      matchId = res.matchId;
      wsToken = res.wsToken;
    } else {
      // Create private match
      log("match", `Creating private match for ${gameId}...`);
      const res = await this.http.createPrivateMatch(this.playerId, gameId, opts.stakeWei);
      matchId = res.matchId;
      wsToken = res.wsToken;
      log("match", `Invite code: ${res.inviteCode}`);
      log("match", "Waiting for opponent to join...");
    }

    return this.playMatch(matchId, wsToken, opponent, gameId, strategy, opts);
  }

  /** Disconnect and abort any pending operations. */
  close(): void {
    this.aborted = true;
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
  }

  private playMatch(
    matchId: string,
    wsToken: string,
    opponent: string,
    gameId: string,
    strategy: Strategy,
    opts: PlayOptions
  ): Promise<GameResult> {
    const log = opts.onLog || (() => {});

    return new Promise<GameResult>(async (resolve, reject) => {
      let syncInterval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
      };

      try {
        const ws = new GameWebSocket(this.wsBaseUrl);
        ws.setSignFunction(this.signMessage);
        this.wsClient = ws;

        // Track opponent and turn state
        let currentOpponent = opponent;
        let agentIsMyTurn = false;
        let lastObservation: Observation | null = null;

        const tryMakeMove = async (
          ctx: GameContext
        ) => {
          if (!ctx.yourTurn || ctx.legalActions.length === 0) return;
          try {
            if (opts.moveDelay) {
              await sleep(opts.moveDelay);
            }
            const action = await Promise.resolve(
              strategy.chooseAction(ctx)
            );
            log("move", `Action: ${JSON.stringify(action)}`);
            ws.sendAction(matchId, action);
          } catch (err: any) {
            log("error", `Strategy error: ${err.message}`);
          }
        };

        ws.on("GAME_STATE", async (msg: WsMessage) => {
          const payload = msg.payload as {
            observation?: Observation;
            yourTurn?: boolean;
            legalActions?: Action[];
            message?: string;
          };

          // Skip non-observation messages (e.g. "Both players connected")
          if (!payload.observation) return;

          const obs = payload.observation;
          lastObservation = obs;

          // Identify opponent
          if (currentOpponent === "?") {
            currentOpponent =
              obs.players.find((p) => p !== this.playerId) || "?";
          }

          agentIsMyTurn = payload.yourTurn ?? false;

          const ctx: GameContext = {
            matchId,
            gameId,
            observation: obs,
            yourTurn: agentIsMyTurn,
            legalActions: payload.legalActions ?? [],
            opponent: currentOpponent,
            turnNumber: obs.turnNumber,
          };

          strategy.onStateUpdate?.(ctx);
          await tryMakeMove(ctx);
        });

        ws.on("SYNC_RESPONSE", async (msg: WsMessage) => {
          const payload = msg.payload as {
            yourTurn: boolean;
            currentPlayer: string;
            legalActions?: Action[];
            matchStatus: string;
          };

          if (payload.matchStatus === "completed") return;

          // Only act on desync: server says it's our turn but we think it isn't
          if (payload.yourTurn && !agentIsMyTurn && lastObservation) {
            log("sync", "Desync corrected: server says it is our turn");
            agentIsMyTurn = true;

            const ctx: GameContext = {
              matchId,
              gameId,
              observation: lastObservation,
              yourTurn: true,
              legalActions: (payload.legalActions ?? []) as Action[],
              opponent: currentOpponent,
              turnNumber: lastObservation.turnNumber,
            };

            await tryMakeMove(ctx);
          } else if (!payload.yourTurn && agentIsMyTurn) {
            agentIsMyTurn = false;
          }
        });

        ws.on("GAME_OVER", (msg: WsMessage) => {
          cleanup();

          const payload = msg.payload as {
            winner: string | null;
            draw: boolean;
            reason: string;
          };

          const result: GameResult = {
            matchId,
            winner: payload.winner,
            draw: payload.draw,
            reason: payload.reason,
            you: this.playerId,
            didWin: payload.winner === this.playerId,
          };

          log(
            "over",
            result.draw
              ? `Draw — ${result.reason}`
              : result.didWin
                ? `You won! ${result.reason}`
                : `You lost. ${result.reason}`
          );

          strategy.onGameOver?.(result);
          ws.close();
          this.wsClient = null;
          resolve(result);
        });

        ws.on("DEPOSIT_REQUIRED", async (msg: WsMessage) => {
          const payload = msg.payload as {
            stakeWei: string;
            matchIdBytes32: string;
            escrowAddress: string;
          };
          log("stake", `Deposit required: ${payload.stakeWei} wei to ${payload.escrowAddress}`);

          if (opts.sendDeposit) {
            try {
              const txHash = await opts.sendDeposit({
                address: payload.escrowAddress,
                stakeWei: payload.stakeWei,
                matchIdBytes32: payload.matchIdBytes32,
              });
              log("stake", `Deposit tx sent: ${txHash}`);
            } catch (err: any) {
              log("error", `Deposit failed: ${err.message}`);
            }
          } else {
            log("stake", "No sendDeposit handler — waiting for external deposit");
          }
        });

        ws.on("DEPOSITS_CONFIRMED", (_msg: WsMessage) => {
          log("stake", "All deposits confirmed — game starting");
        });

        ws.on("ERROR", (msg: WsMessage) => {
          const payload = msg.payload as { error: string };
          log("error", payload.error);
        });

        ws.on("close", () => {
          cleanup();
          // Only reject if we haven't resolved yet
          reject(new Error("WebSocket connection lost"));
        });

        // Connect and authenticate
        await ws.connect(matchId);
        ws.sendHello(wsToken, this.playerId);
        log("ws", "Connected and authenticated");

        // Start periodic state sync
        syncInterval = setInterval(() => {
          if (ws.isConnected) {
            ws.sendSyncRequest(matchId, agentIsMyTurn);
          }
        }, 8000);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}
