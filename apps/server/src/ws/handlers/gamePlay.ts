import WebSocket from "ws";
import Redis from "ioredis";
import {
  WsMessage,
  MatchStatus,
  isEvmAddress,
  validateAuth,
  storeGameSession,
  getGameSession,
  storeActiveMatchForPlayer,
} from "@dorkfun/core";
import { MatchService } from "../../services/MatchService";
import { SettlementService } from "../../services/SettlementService";
import { RoomManager } from "../rooms";
import { persistChatMessage } from "./chat";
import config from "../../config";
import log from "../../logger";

/** Active deposit pollers keyed by matchId (shared across connections) */
const depositPollers = new Map<string, ReturnType<typeof setInterval>>();
const DEPOSIT_POLL_INTERVAL_MS = 5_000; // 5 seconds
const DEPOSIT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Handles WebSocket connections for active game play.
 * Players authenticate with a one-time token (initial connection) or
 * via EVM signature (reconnection). Includes move timeout enforcement
 * and disconnection notifications.
 */
export function handleGamePlayConnection(
  ws: WebSocket,
  matchId: string,
  matchService: MatchService,
  roomManager: RoomManager,
  redis: Redis,
  settlement: SettlementService | null = null
): void {
  let authenticatedPlayerId: string | null = null;
  let messageSequence = 0;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;

      if (msg.type === "HELLO") {
        await handleHello(msg);
      } else if (msg.type === "ACTION_COMMIT") {
        handleAction(msg);
      } else if (msg.type === "CHAT") {
        handleChat(msg);
      } else if (msg.type === "FORFEIT") {
        handleForfeit();
      } else if (msg.type === "SYNC_REQUEST") {
        handleSyncRequest();
      }
    } catch (err: any) {
      sendError(err.message);
    }
  });

  ws.on("close", () => {
    clearMoveTimer();
    if (authenticatedPlayerId) {
      roomManager.removePlayer(matchId, authenticatedPlayerId);
      log.info({ matchId, playerId: authenticatedPlayerId }, "Player disconnected");

      // Notify remaining players about disconnection
      const match = matchService.getMatch(matchId);
      if (match && match.status === MatchStatus.ACTIVE) {
        roomManager.broadcastToAll(matchId, {
          type: "GAME_STATE",
          matchId,
          payload: {
            event: "player_disconnected",
            playerId: authenticatedPlayerId,
            message: `${authenticatedPlayerId} disconnected`,
          },
          sequence: 0,
          prevHash: "",
          timestamp: Date.now(),
        });
      }
    }
  });

  ws.on("error", (err) => {
    log.error({ matchId, playerId: authenticatedPlayerId, err: err.message }, "WebSocket error");
  });

  async function handleHello(msg: WsMessage) {
    const payload = msg.payload as {
      token?: string;
      playerId: string;
      signature?: string;
      timestamp?: number;
    };
    const { playerId } = payload;

    if (!playerId || !isEvmAddress(playerId)) {
      sendError("playerId must be a valid EVM address");
      ws.close();
      return;
    }

    // Path 1: One-time token (initial connection from matchmaking/private match)
    if (payload.token) {
      const validation = await matchService.validateWsToken(payload.token);
      if (validation && validation.matchId === matchId) {
        authenticatedPlayerId = validation.playerId;

        // Create session for future reconnection
        const match = matchService.getMatch(matchId);
        await storeGameSession(redis, matchId, authenticatedPlayerId);
        if (match) {
          await storeActiveMatchForPlayer(redis, authenticatedPlayerId, matchId, match.gameId, match.stakeWei);
        }

        log.info({ matchId, playerId: authenticatedPlayerId }, "Player authenticated via token");
        completeHello();
        return;
      }
    }

    // Path 2: Signature-based reconnection
    if (payload.signature && payload.timestamp !== undefined) {
      const session = await getGameSession(redis, matchId, playerId);
      if (session && validateAuth(playerId, payload.signature, payload.timestamp)) {
        authenticatedPlayerId = playerId;
        log.info({ matchId, playerId }, "Player reconnected via signature");
        completeHello();
        return;
      }
    }

    sendError("Invalid token or signature");
    ws.close();
  }

  /**
   * Common post-authentication logic: add to room, send current game state,
   * start move timer if it's this player's turn, notify when all players connected.
   * For staked matches, handles deposit gating before game starts.
   */
  function completeHello() {
    if (!authenticatedPlayerId) return;

    roomManager.addPlayer(matchId, {
      ws,
      playerId: authenticatedPlayerId,
      displayName: authenticatedPlayerId,
    });

    const match = matchService.getMatch(matchId);

    // Deposit gating for staked matches
    if (match && match.stakeWei !== "0" && match.status === MatchStatus.WAITING && settlement) {
      sendMessage({
        type: "DEPOSIT_REQUIRED",
        matchId,
        payload: {
          stakeWei: match.stakeWei,
          matchIdBytes32: SettlementService.matchIdToBytes32(matchId),
          escrowAddress: settlement.escrowAddress,
        },
        sequence: messageSequence++,
        prevHash: "",
        timestamp: Date.now(),
      });

      // Start polling for deposits if not already polling for this match
      startDepositPoller(match.stakeWei);
      return;
    }

    // Normal flow: send current game state
    sendGameState();
  }

  /**
   * Send current game state to the authenticated player.
   */
  function sendGameState() {
    if (!authenticatedPlayerId) return;

    const match = matchService.getMatch(matchId);
    if (match?.orchestrator) {
      const obs = match.orchestrator.getObservation(authenticatedPlayerId);
      const yourTurn = match.orchestrator.getCurrentPlayer() === authenticatedPlayerId;
      sendMessage({
        type: "GAME_STATE",
        matchId,
        payload: {
          observation: obs,
          yourTurn,
          legalActions: match.orchestrator.getLegalActions(authenticatedPlayerId),
        },
        sequence: messageSequence++,
        prevHash: "",
        timestamp: Date.now(),
      });

      // Start move timer if it's this player's turn
      if (yourTurn) {
        startMoveTimer();
      }
    }

    // Check if all expected players are connected, notify if so
    const room = roomManager.getRoom(matchId);
    if (room && match && room.players.size >= match.players.length) {
      const message = match.players.length === 1
        ? "Game is live!"
        : "Both players connected. Game is live!";
      roomManager.broadcastToAll(matchId, {
        type: "GAME_STATE",
        matchId,
        payload: { message },
        sequence: 0,
        prevHash: "",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Poll the on-chain escrow for deposit confirmation.
   * Shared per match — only one poller runs regardless of how many connections.
   */
  function startDepositPoller(stakeWei: string) {
    if (depositPollers.has(matchId) || !settlement) return;

    const startedAt = Date.now();

    const poller = setInterval(async () => {
      try {
        const funded = await settlement!.isFullyFunded(matchId);
        if (funded) {
          clearInterval(poller);
          depositPollers.delete(matchId);

          // Activate the match (WAITING → ACTIVE, create orchestrator)
          const activated = await matchService.activateStakedMatch(matchId);
          if (!activated) return;

          // Broadcast DEPOSITS_CONFIRMED to all connected players
          roomManager.broadcastToAll(matchId, {
            type: "DEPOSITS_CONFIRMED",
            matchId,
            payload: { stakeWei },
            sequence: 0,
            prevHash: "",
            timestamp: Date.now(),
          });

          // Send game state to all connected players
          const room = roomManager.getRoom(matchId);
          const match = matchService.getMatch(matchId);
          if (room && match?.orchestrator) {
            for (const [pid, conn] of room.players) {
              if (conn.ws.readyState === WebSocket.OPEN) {
                const obs = match.orchestrator.getObservation(pid);
                const yourTurn = match.orchestrator.getCurrentPlayer() === pid;
                conn.ws.send(JSON.stringify({
                  type: "GAME_STATE",
                  matchId,
                  payload: {
                    observation: obs,
                    yourTurn,
                    legalActions: match.orchestrator.getLegalActions(pid),
                  },
                  sequence: 0,
                  prevHash: "",
                  timestamp: Date.now(),
                }));
              }
            }
          }

          log.info({ matchId, stakeWei }, "Deposits confirmed, match activated");
          return;
        }

        // Check timeout
        if (Date.now() - startedAt > DEPOSIT_TIMEOUT_MS) {
          clearInterval(poller);
          depositPollers.delete(matchId);

          roomManager.broadcastToAll(matchId, {
            type: "ERROR",
            matchId,
            payload: {
              error: "Deposit timeout — match cancelled. Any deposited funds will be refunded automatically from the escrow contract.",
            },
            sequence: 0,
            prevHash: "",
            timestamp: Date.now(),
          });
          roomManager.removeRoom(matchId);

          log.warn({ matchId }, "Deposit timeout — staked match cancelled");
        }
      } catch (err: any) {
        log.error({ matchId, err: err.message }, "Deposit poller error");
      }
    }, DEPOSIT_POLL_INTERVAL_MS);

    depositPollers.set(matchId, poller);
  }

  function handleAction(msg: WsMessage) {
    if (!authenticatedPlayerId) {
      sendError("Not authenticated");
      return;
    }

    const match = matchService.getMatch(matchId);
    if (!match?.orchestrator) {
      sendError("Match not found or not active");
      return;
    }

    // Check it's actually this player's turn
    if (match.orchestrator.getCurrentPlayer() !== authenticatedPlayerId) {
      sendError("Not your turn");
      return;
    }

    const action = msg.payload as { action: { type: string; data: Record<string, unknown> } };
    const result = matchService.submitMove(matchId, authenticatedPlayerId, action.action);

    if (!result.success) {
      sendError(result.error || "Invalid move");
      return;
    }

    clearMoveTimer();

    // Broadcast step result to all players and spectators
    const stepResult: WsMessage = {
      type: "STEP_RESULT",
      matchId,
      payload: {
        lastAction: action.action,
        lastPlayer: authenticatedPlayerId,
        observation: match.orchestrator.getObservation(authenticatedPlayerId),
        nextPlayer: result.terminal ? null : match.orchestrator.getCurrentPlayer(),
      },
      sequence: messageSequence++,
      prevHash: "",
      timestamp: Date.now(),
    };

    roomManager.broadcastToAll(matchId, stepResult);

    // Send personalized state to each player
    for (const [pid, conn] of roomManager.getRoom(matchId)?.players || []) {
      if (conn.ws.readyState === WebSocket.OPEN && match.orchestrator) {
        const isNextTurn = !result.terminal && match.orchestrator.getCurrentPlayer() === pid;
        const personalState: WsMessage = {
          type: "GAME_STATE",
          matchId,
          payload: {
            observation: match.orchestrator.getObservation(pid),
            yourTurn: isNextTurn,
            legalActions: match.orchestrator.getLegalActions(pid),
          },
          sequence: messageSequence++,
          prevHash: "",
          timestamp: Date.now(),
        };
        conn.ws.send(JSON.stringify(personalState));
      }
    }

    if (result.terminal) {
      const gameOver: WsMessage = {
        type: "GAME_OVER",
        matchId,
        payload: {
          winner: result.winner,
          draw: result.winner === null,
          reason: result.reason,
        },
        sequence: messageSequence++,
        prevHash: "",
        timestamp: Date.now(),
      };
      roomManager.broadcastToAll(matchId, gameOver);
    }
  }

  function handleForfeit() {
    if (!authenticatedPlayerId) {
      sendError("Not authenticated");
      return;
    }

    const match = matchService.getMatch(matchId);
    if (!match || match.status !== MatchStatus.ACTIVE) {
      sendError("Match not found or not active");
      return;
    }

    clearMoveTimer();

    const opponent = match.players.find((p) => p !== authenticatedPlayerId) || null;
    matchService.forfeitMatch(matchId, authenticatedPlayerId);

    roomManager.broadcastToAll(matchId, {
      type: "GAME_OVER",
      matchId,
      payload: {
        winner: opponent,
        draw: false,
        reason: `${authenticatedPlayerId} forfeited`,
      },
      sequence: messageSequence++,
      prevHash: "",
      timestamp: Date.now(),
    });

    log.info({ matchId, playerId: authenticatedPlayerId, winner: opponent }, "Player forfeited");
  }

  function handleChat(msg: WsMessage) {
    if (!authenticatedPlayerId) return;

    const chatMsg: WsMessage = {
      type: "CHAT",
      matchId,
      payload: {
        sender: authenticatedPlayerId,
        displayName: authenticatedPlayerId,
        message: (msg.payload as { message: string }).message,
      },
      sequence: messageSequence++,
      prevHash: "",
      timestamp: Date.now(),
    };

    roomManager.broadcastToAll(matchId, chatMsg);

    persistChatMessage(matchId, authenticatedPlayerId, authenticatedPlayerId, (msg.payload as { message: string }).message);
  }

  function handleSyncRequest() {
    if (!authenticatedPlayerId) return;

    const match = matchService.getMatch(matchId);
    if (!match?.orchestrator) {
      sendMessage({
        type: "SYNC_RESPONSE",
        matchId,
        payload: {
          yourTurn: false,
          currentPlayer: "",
          matchStatus: match?.status ?? "unknown",
        },
        sequence: messageSequence++,
        prevHash: "",
        timestamp: Date.now(),
      });
      return;
    }

    const currentPlayer = match.orchestrator.getCurrentPlayer();
    const yourTurn = currentPlayer === authenticatedPlayerId;

    sendMessage({
      type: "SYNC_RESPONSE",
      matchId,
      payload: {
        yourTurn,
        currentPlayer,
        legalActions: yourTurn
          ? match.orchestrator.getLegalActions(authenticatedPlayerId)
          : undefined,
        matchStatus: match.status,
      },
      sequence: messageSequence++,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  function startMoveTimer() {
    clearMoveTimer();

    // Resolve per-game timeout: game module override → server default
    const match = matchService.getMatch(matchId);
    const gameMoveTimeout = match?.orchestrator?.getMoveTimeoutMs();
    // null means "no per-move timer" (stale match cleanup still applies)
    if (gameMoveTimeout === null) return;
    const timeoutMs = gameMoveTimeout ?? config.matchTimeoutMs;

    moveTimer = setTimeout(() => {
      if (!authenticatedPlayerId) return;
      const m = matchService.getMatch(matchId);
      if (!m || m.status !== MatchStatus.ACTIVE) return;
      if (m.orchestrator?.getCurrentPlayer() !== authenticatedPlayerId) return;

      log.info({ matchId, playerId: authenticatedPlayerId }, "Move timeout — player forfeits");

      const opponent = m.players.find((p) => p !== authenticatedPlayerId) || null;
      matchService.forfeitMatch(matchId, authenticatedPlayerId);

      roomManager.broadcastToAll(matchId, {
        type: "GAME_OVER",
        matchId,
        payload: {
          winner: opponent,
          draw: false,
          reason: `${authenticatedPlayerId} timed out`,
        },
        sequence: messageSequence++,
        prevHash: "",
        timestamp: Date.now(),
      });
    }, timeoutMs);
  }

  function clearMoveTimer() {
    if (moveTimer) {
      clearTimeout(moveTimer);
      moveTimer = null;
    }
  }

  function sendMessage(msg: WsMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function sendError(error: string) {
    sendMessage({
      type: "ERROR",
      matchId,
      payload: { error },
      sequence: messageSequence++,
      prevHash: "",
      timestamp: Date.now(),
    });
  }
}
