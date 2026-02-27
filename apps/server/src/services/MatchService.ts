import { randomUUID } from "crypto";
import Redis from "ioredis";
import {
  Action,
  MatchStatus,
  MatchOutcome,
  hashState,
  calculateElo,
  createMatchRecord,
  updateMatch,
  upsertPlayer,
  incrementPlayerStats,
  findPlayerByAddress,
  upsertPlayerGameStats,
  findPlayerGameStats,
  createMatchMoves,
  findMatchById,
  listMatches,
  storeWsToken,
  consumeWsToken,
  addToQueue,
  removeFromQueue,
  findOpponentInQueue,
  getQueueSize as redisQueueSize,
  getQueueEntries as redisQueueEntries,
  storePendingMatch,
  consumePendingMatch,
  deleteGameSession,
  deleteActiveMatchForPlayer,
  storeActiveMatchForPlayer,
} from "@dorkfun/core";
import { GameRegistry, MatchOrchestrator } from "@dorkfun/engine";
import { SettlementService } from "./SettlementService";
import { RoomManager } from "../ws/rooms";
import config from "../config";
import log from "../logger";

export interface MatchInfo {
  matchId: string;
  gameId: string;
  status: MatchStatus;
  players: string[];
  orchestrator: MatchOrchestrator | null;
  winner: string | null;
  createdAt: Date;
  completedAt: Date | null;
  /** Updated on each move — used for stale game detection */
  lastActivityAt: Date;
  /** Stake per player in wei ("0" = free match) */
  stakeWei: string;
}

/**
 * Manages match lifecycle: creation, matchmaking, game play, completion.
 * Uses PostgreSQL for persistence and Redis for queue/tokens.
 * Active matches keep orchestrators in memory for fast game play.
 */
export class MatchService {
  /** In-memory cache of active matches with their orchestrators */
  private activeMatches = new Map<string, MatchInfo>();
  /** Map from invite code to matchId (short-lived, in-memory is fine) */
  private inviteCodes = new Map<string, string>();

  constructor(
    private gameRegistry: GameRegistry,
    private redis: Redis,
    private settlement: SettlementService | null = null
  ) {}

  async createMatch(
    gameId: string,
    players: string[],
    settings?: Record<string, unknown>,
    stakeWei: string = "0"
  ): Promise<MatchInfo> {
    const game = this.gameRegistry.get(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }

    // Silently zero stake for single-player games or when settlement is not configured
    const effectiveStake =
      game.minPlayers < 2 || !this.settlement ? "0" : stakeWei;
    const isStaked = effectiveStake !== "0";

    // Enforce global minimum stake from on-chain Escrow contract
    if (isStaked && this.settlement) {
      const minimumStakeWei = await this.settlement.getMinimumStake();
      if (minimumStakeWei !== "0" && BigInt(effectiveStake) < BigInt(minimumStakeWei)) {
        throw new Error(
          `Stake ${effectiveStake} is below the minimum required stake of ${minimumStakeWei} wei`
        );
      }
    }

    const matchId = randomUUID();

    // Staked matches start as WAITING (not ACTIVE) until deposits are confirmed
    const initialStatus = isStaked ? MatchStatus.WAITING : MatchStatus.ACTIVE;
    const orchestrator = isStaked
      ? null
      : new MatchOrchestrator({ game, players, matchId, settings });

    const now = new Date();
    const match: MatchInfo = {
      matchId,
      gameId,
      status: initialStatus,
      players,
      orchestrator,
      winner: null,
      createdAt: now,
      completedAt: null,
      lastActivityAt: now,
      stakeWei: effectiveStake,
    };

    // Persist to database
    await createMatchRecord({
      id: matchId,
      game_id: gameId,
      status: initialStatus,
      players: JSON.stringify(players),
      winner: null,
      transcript_hash: null,
      settlement_tx_hash: null,
      stake_wei: isStaked ? effectiveStake : null,
      completed_at: null,
    });

    // Ensure players exist
    for (const address of players) {
      await upsertPlayer({
        address,
        display_name: address.slice(0, 10),
        rating: 1200,
        games_played: 0,
        games_won: 0,
        games_drawn: 0,
      });
    }

    // Track active match for reconnection
    for (const address of players) {
      await storeActiveMatchForPlayer(this.redis, address, matchId, gameId, effectiveStake);
    }

    // Create on-chain escrow for staked matches (fire and forget, log errors)
    if (isStaked && this.settlement) {
      const gameIdBytes32 = SettlementService.matchIdToBytes32(gameId);
      this.settlement
        .createEscrow(matchId, gameIdBytes32, players, effectiveStake)
        .catch((err) =>
          log.error({ matchId, err: err.message }, "Failed to create on-chain escrow")
        );
    }

    this.activeMatches.set(matchId, match);
    log.info({ matchId, gameId, players, stakeWei: effectiveStake }, "Match created");
    return match;
  }

  /**
   * Read the global minimum stake from the on-chain Escrow contract.
   * Returns "0" when settlement is not configured or no minimum is set.
   */
  async getMinimumStake(): Promise<string> {
    if (!this.settlement) return "0";
    return this.settlement.getMinimumStake();
  }

  getMatch(matchId: string): MatchInfo | undefined {
    return this.activeMatches.get(matchId);
  }

  async getMatchFromDb(matchId: string) {
    return findMatchById(matchId);
  }

  listActiveMatches(): MatchInfo[] {
    return Array.from(this.activeMatches.values()).filter(
      (m) => m.status === MatchStatus.ACTIVE || m.status === MatchStatus.WAITING
    );
  }

  listAllMatches(): MatchInfo[] {
    return Array.from(this.activeMatches.values());
  }

  async listMatchesFromDb(limit = 50) {
    return listMatches(limit);
  }

  submitMove(
    matchId: string,
    playerId: string,
    action: Action
  ): {
    success: boolean;
    terminal: boolean;
    winner?: string | null;
    reason?: string;
    error?: string;
  } {
    const match = this.activeMatches.get(matchId);
    if (!match) return { success: false, terminal: false, error: "Match not found" };
    if (!match.orchestrator) return { success: false, terminal: false, error: "No orchestrator" };

    try {
      const result = match.orchestrator.submitAction(playerId, action);

      // Update last activity timestamp
      match.lastActivityAt = new Date();

      if (result.terminal && result.outcome) {
        match.status = MatchStatus.COMPLETED;
        match.winner = result.outcome.winner;
        match.completedAt = new Date();

        // Persist completion to DB (fire and forget)
        this.persistMatchCompletion(matchId, result.outcome.winner, result.outcome.reason);

        log.info(
          { matchId, winner: result.outcome.winner, reason: result.outcome.reason },
          "Match completed"
        );
      }

      return {
        success: true,
        terminal: result.terminal,
        winner: result.outcome?.winner,
        reason: result.outcome?.reason,
      };
    } catch (err: any) {
      return { success: false, terminal: false, error: err.message };
    }
  }

  private async persistMatchCompletion(matchId: string, winner: string | null, _reason: string) {
    try {
      const match = this.activeMatches.get(matchId);
      const transcript = match?.orchestrator?.getTranscript();
      const transcriptHash = transcript
        ? hashState({ entries: transcript, matchId })
        : null;

      await updateMatch(matchId, {
        status: MatchStatus.COMPLETED,
        winner,
        completed_at: new Date(),
        transcript_hash: transcriptHash,
      });

      // Persist transcript moves
      if (transcript) {
        await createMatchMoves(
          transcript.map((entry) => ({
            match_id: matchId,
            sequence: entry.sequence,
            player_address: entry.playerAddress,
            action: JSON.stringify(entry.action),
            state_hash: entry.stateHash,
            prev_hash: entry.prevHash,
          }))
        );
      }

      // Clean up Redis sessions for all players
      if (match) {
        for (const playerId of match.players) {
          await deleteGameSession(this.redis, matchId, playerId);
          await deleteActiveMatchForPlayer(this.redis, playerId);
        }
      }

      // Update player stats + Elo ratings
      if (match && match.players.length === 2) {
        const [addrA, addrB] = match.players;
        const playerA = await findPlayerByAddress(addrA);
        const playerB = await findPlayerByAddress(addrB);

        if (playerA && playerB) {
          const isDraw = winner === null;
          const outcome: MatchOutcome = isDraw
            ? "draw"
            : winner === addrA
              ? "win_a"
              : "win_b";

          // Calculate Elo for overall ratings
          const elo = calculateElo(
            playerA.rating,
            playerB.rating,
            playerA.games_played,
            playerB.games_played,
            outcome
          );

          // Earnings for staked matches: winner profits the opponent's stake
          const earningsA =
            !isDraw && winner === addrA && match.stakeWei !== "0"
              ? match.stakeWei
              : undefined;
          const earningsB =
            !isDraw && winner === addrB && match.stakeWei !== "0"
              ? match.stakeWei
              : undefined;

          // Update overall stats
          await incrementPlayerStats(addrA, winner === addrA, isDraw, elo.newRatingA, earningsA);
          await incrementPlayerStats(addrB, winner === addrB, isDraw, elo.newRatingB, earningsB);

          // Fetch per-game stats so the game-specific Elo uses game-specific ratings/K-factor
          const gameStatsA = await findPlayerGameStats(addrA, match.gameId);
          const gameStatsB = await findPlayerGameStats(addrB, match.gameId);

          const gameElo = calculateElo(
            gameStatsA?.rating ?? 1200,
            gameStatsB?.rating ?? 1200,
            gameStatsA?.games_played ?? 0,
            gameStatsB?.games_played ?? 0,
            outcome
          );

          await upsertPlayerGameStats(
            addrA, match.gameId,
            winner === addrA, isDraw, !isDraw && winner !== addrA,
            gameElo.newRatingA, earningsA
          );
          await upsertPlayerGameStats(
            addrB, match.gameId,
            winner === addrB, isDraw, !isDraw && winner !== addrB,
            gameElo.newRatingB, earningsB
          );
        }
      }

      // Single-player stats (no Elo, just win/loss tracking)
      if (match && match.players.length === 1) {
        const addr = match.players[0];
        const won = winner === addr;
        const player = await findPlayerByAddress(addr);
        // Update overall stats without changing rating
        await incrementPlayerStats(addr, won, false, player?.rating ?? 1200);
        // Update per-game stats without changing rating
        await upsertPlayerGameStats(
          addr, match.gameId,
          won, false, !won,
          player?.rating ?? 1200
        );
      }

      // On-chain settlement sequence for staked matches
      if (this.settlement && match && match.stakeWei !== "0" && transcript) {
        // 1. Register match players
        await this.settlement.registerMatchPlayers(matchId, match.players);
        // 2. Propose settlement
        const txHash = await this.settlement.proposeSettlement(matchId, winner, transcript);
        if (txHash) {
          await updateMatch(matchId, { settlement_tx_hash: txHash });
        }
        // 3. Schedule finalization after dispute window
        this.settlement.scheduleFinalization(matchId, config.disputeWindowMs);
      } else if (this.settlement && transcript) {
        // Free match: just propose settlement (no escrow involved)
        const txHash = await this.settlement.proposeSettlement(matchId, winner, transcript);
        if (txHash) {
          await updateMatch(matchId, { settlement_tx_hash: txHash });
        }
      }
    } catch (err: any) {
      log.error({ err: err.message, matchId }, "Failed to persist match completion");
    }
  }

  /**
   * Forfeit a match — called when a player times out or abandons.
   */
  async forfeitMatch(matchId: string, forfeitingPlayerId: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== MatchStatus.ACTIVE) return;

    const winner = match.players.find((p) => p !== forfeitingPlayerId) || null;
    match.status = MatchStatus.COMPLETED;
    match.winner = winner;
    match.completedAt = new Date();

    this.persistMatchCompletion(matchId, winner, `${forfeitingPlayerId} forfeited`);
    log.info({ matchId, forfeitingPlayerId, winner }, "Match forfeited");
  }

  /**
   * Clean up completed matches older than the given age from memory.
   */
  cleanupCompletedMatches(maxAgeMs: number): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [matchId, match] of this.activeMatches) {
      if (
        match.status === MatchStatus.COMPLETED &&
        match.completedAt &&
        now - match.completedAt.getTime() > maxAgeMs
      ) {
        this.activeMatches.delete(matchId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      log.info({ cleaned }, "Cleaned up completed matches from memory");
    }
    return cleaned;
  }

  /**
   * Clean up matches that have been ACTIVE or WAITING with no activity for
   * longer than maxAgeMs. Uses lastActivityAt for ACTIVE matches and
   * createdAt for WAITING matches.
   *
   * - WAITING matches (never got a second player): mark COMPLETED, no winner.
   * - ACTIVE matches (game stalled): mark COMPLETED, no winner, persist transcript.
   *
   * Optionally broadcasts GAME_OVER and closes rooms via the roomManager.
   */
  async cleanupStaleMatches(maxAgeMs: number, roomManager?: RoomManager): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [matchId, match] of this.activeMatches) {
      const referenceTime = match.status === MatchStatus.ACTIVE
        ? match.lastActivityAt
        : match.createdAt;
      const age = now - referenceTime.getTime();

      if (age <= maxAgeMs) continue;

      if (match.status === MatchStatus.WAITING) {
        match.status = MatchStatus.COMPLETED;
        match.winner = null;
        match.completedAt = new Date();

        await updateMatch(matchId, {
          status: MatchStatus.COMPLETED,
          winner: null,
          completed_at: new Date(),
        });

        // Clean up invite code if any
        for (const [code, mid] of this.inviteCodes) {
          if (mid === matchId) {
            this.inviteCodes.delete(code);
            break;
          }
        }

        // Clean up Redis sessions
        for (const playerId of match.players) {
          await deleteGameSession(this.redis, matchId, playerId);
          await deleteActiveMatchForPlayer(this.redis, playerId);
        }

        if (roomManager) {
          roomManager.removeRoom(matchId);
        }

        this.activeMatches.delete(matchId);
        log.info({ matchId, ageSec: Math.round(age / 1000) }, "Cleaned up stale WAITING match");
        cleaned++;

      } else if (match.status === MatchStatus.ACTIVE) {
        match.status = MatchStatus.COMPLETED;
        match.winner = null;
        match.completedAt = new Date();

        // Persist any existing transcript
        const transcript = match.orchestrator?.getTranscript();
        const transcriptHash = transcript
          ? hashState({ entries: transcript, matchId })
          : null;

        await updateMatch(matchId, {
          status: MatchStatus.COMPLETED,
          winner: null,
          completed_at: new Date(),
          transcript_hash: transcriptHash,
        });

        if (transcript && transcript.length > 0) {
          await createMatchMoves(
            transcript.map((entry) => ({
              match_id: matchId,
              sequence: entry.sequence,
              player_address: entry.playerAddress,
              action: JSON.stringify(entry.action),
              state_hash: entry.stateHash,
              prev_hash: entry.prevHash,
            }))
          );
        }

        // Clean up Redis sessions
        for (const playerId of match.players) {
          await deleteGameSession(this.redis, matchId, playerId);
          await deleteActiveMatchForPlayer(this.redis, playerId);
        }

        // Notify connected players and close the room
        if (roomManager) {
          roomManager.broadcastToAll(matchId, {
            type: "GAME_OVER",
            matchId,
            payload: {
              winner: null,
              draw: true,
              reason: "Match abandoned due to inactivity",
            },
            sequence: 0,
            prevHash: "",
            timestamp: Date.now(),
          });
          roomManager.removeRoom(matchId);
        }

        this.activeMatches.delete(matchId);
        log.info({ matchId, ageSec: Math.round(age / 1000) }, "Cleaned up stale ACTIVE match");
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.info({ cleaned }, "Cleaned up stale matches");
    }
    return cleaned;
  }

  // --- Matchmaking queue (Redis-backed) ---

  async joinQueue(
    playerId: string,
    gameId: string,
    existingTicket?: string,
    settings?: Record<string, unknown>,
    stakeWei: string = "0"
  ): Promise<{ ticket: string; matchId?: string; opponent?: string; stakeWei?: string }> {
    const game = this.gameRegistry.get(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }

    // Silently zero stake for single-player games or when settlement is not configured
    const effectiveStake =
      game.minPlayers < 2 || !this.settlement ? "0" : stakeWei;

    // Solo-start shortcut for single-player games — skip the queue entirely
    if (game.minPlayers === 1) {
      const match = await this.createMatch(gameId, [playerId], settings);
      const token = randomUUID();
      await storeWsToken(this.redis, token, match.matchId, playerId);
      log.info({ matchId: match.matchId, playerId }, "Solo match created instantly");
      return { ticket: token, matchId: match.matchId };
    }

    // Check if a match was already created for this player (by an opponent joining)
    const pending = await consumePendingMatch(this.redis, gameId, playerId, effectiveStake);
    if (pending) {
      log.info(
        { matchId: pending.matchId, playerId, opponent: pending.opponent },
        "Player discovered pending match"
      );
      return {
        ticket: "",
        matchId: pending.matchId,
        opponent: pending.opponent,
        stakeWei: pending.stakeWei,
      };
    }

    // Check if there's someone already waiting (stake-scoped)
    const opponent = await findOpponentInQueue(this.redis, gameId, playerId, effectiveStake);
    if (opponent) {
      // Match found!
      const match = await this.createMatch(
        gameId,
        [opponent.playerId, playerId],
        undefined,
        effectiveStake
      );

      // Generate WS tokens for both players
      const token1 = randomUUID();
      const token2 = randomUUID();
      await storeWsToken(this.redis, token1, match.matchId, opponent.playerId);
      await storeWsToken(this.redis, token2, match.matchId, playerId);

      // Store pending match notification so the opponent discovers the match on next poll
      await storePendingMatch(
        this.redis,
        gameId,
        opponent.playerId,
        match.matchId,
        playerId,
        effectiveStake
      );

      log.info(
        { matchId: match.matchId, player1: opponent.playerId, player2: playerId, stakeWei: effectiveStake },
        "Match found via queue"
      );

      return {
        ticket: token2,
        matchId: match.matchId,
        opponent: opponent.playerId,
        stakeWei: effectiveStake,
      };
    }

    // No match found — reuse existing ticket if provided (poll), otherwise create new entry
    if (existingTicket) {
      // Refresh the queue entry TTL with the same ticket
      await addToQueue(this.redis, gameId, playerId, existingTicket, effectiveStake);
      return { ticket: existingTicket };
    }

    const ticket = randomUUID();
    await addToQueue(this.redis, gameId, playerId, ticket, effectiveStake);
    log.info({ playerId, gameId, ticket, stakeWei: effectiveStake }, "Player joined queue");
    return { ticket };
  }

  async leaveQueue(ticket: string, gameId?: string, stakeWei: string = "0"): Promise<boolean> {
    if (gameId) {
      return removeFromQueue(this.redis, gameId, ticket, stakeWei);
    }
    // Try known games
    for (const game of this.gameRegistry.list()) {
      const removed = await removeFromQueue(this.redis, game.gameId, ticket, stakeWei);
      if (removed) return true;
    }
    return false;
  }

  async getQueueSize(gameId: string, stakeWei: string = "0"): Promise<number> {
    return redisQueueSize(this.redis, gameId, stakeWei);
  }

  async getQueueStatus(): Promise<
    Array<{
      gameId: string;
      gameName: string;
      entries: Array<{ playerId: string; displayName: string; ticket: string }>;
    }>
  > {
    const results = [];
    for (const game of this.gameRegistry.list()) {
      const entries = await redisQueueEntries(this.redis, game.gameId);
      const enriched = await Promise.all(
        entries.map(async (e) => {
          const player = await findPlayerByAddress(e.playerId);
          return {
            playerId: e.playerId,
            displayName: player?.display_name ?? e.playerId.slice(0, 10),
            ticket: e.ticket,
          };
        })
      );
      results.push({
        gameId: game.gameId,
        gameName: game.name,
        entries: enriched,
      });
    }
    return results;
  }

  // --- Private matches ---

  async createPrivateMatch(
    playerId: string,
    gameId: string,
    settings?: Record<string, unknown>,
    stakeWei: string = "0"
  ): Promise<{ matchId: string; inviteCode: string; stakeWei: string }> {
    const game = this.gameRegistry.get(gameId);
    if (!game) {
      throw new Error(`Unknown game: ${gameId}`);
    }

    // Silently zero stake for single-player games or when settlement is not configured
    const effectiveStake =
      game.minPlayers < 2 || !this.settlement ? "0" : stakeWei;

    // Solo-start: single-player games start immediately, no invite needed
    if (game.minPlayers === 1) {
      const match = await this.createMatch(gameId, [playerId], settings);
      log.info({ matchId: match.matchId, playerId }, "Solo private match created instantly");
      return { matchId: match.matchId, inviteCode: "", stakeWei: "0" };
    }

    const matchId = randomUUID();
    const inviteCode = randomUUID().slice(0, 8).toUpperCase();

    const now = new Date();
    const match: MatchInfo = {
      matchId,
      gameId,
      status: MatchStatus.WAITING,
      players: [playerId],
      orchestrator: null,
      winner: null,
      createdAt: now,
      completedAt: null,
      lastActivityAt: now,
      stakeWei: effectiveStake,
    };

    await createMatchRecord({
      id: matchId,
      game_id: gameId,
      status: MatchStatus.WAITING,
      players: JSON.stringify([playerId]),
      winner: null,
      transcript_hash: null,
      settlement_tx_hash: null,
      stake_wei: effectiveStake !== "0" ? effectiveStake : null,
      completed_at: null,
    });

    // Ensure player exists in DB
    await upsertPlayer({
      address: playerId,
      display_name: playerId.slice(0, 10),
      rating: 1200,
      games_played: 0,
      games_won: 0,
      games_drawn: 0,
    });

    // Track active match for reconnection
    await storeActiveMatchForPlayer(this.redis, playerId, matchId, gameId, effectiveStake);

    this.activeMatches.set(matchId, match);
    this.inviteCodes.set(inviteCode, matchId);
    log.info({ matchId, playerId, inviteCode, stakeWei: effectiveStake }, "Private match created");
    return { matchId, inviteCode, stakeWei: effectiveStake };
  }

  async acceptPrivateMatch(
    playerId: string,
    inviteCode: string
  ): Promise<{ matchId: string; wsToken: string; stakeWei: string } | null> {
    const matchId = this.inviteCodes.get(inviteCode);
    if (!matchId) return null;

    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== MatchStatus.WAITING) return null;

    this.inviteCodes.delete(inviteCode);

    match.players.push(playerId);
    match.lastActivityAt = new Date();

    const game = this.gameRegistry.get(match.gameId);
    if (!game) return null;

    const isStaked = match.stakeWei !== "0";

    if (isStaked) {
      // Staked private match: stay in WAITING until deposits are confirmed
      // Create on-chain escrow now that both players are known
      if (this.settlement) {
        const gameIdBytes32 = SettlementService.matchIdToBytes32(match.gameId);
        this.settlement
          .createEscrow(matchId, gameIdBytes32, match.players, match.stakeWei)
          .catch((err) =>
            log.error({ matchId, err: err.message }, "Failed to create on-chain escrow")
          );
      }
    } else {
      // Free match: activate immediately
      match.status = MatchStatus.ACTIVE;
      match.orchestrator = new MatchOrchestrator({
        game,
        players: match.players,
        matchId,
      });
    }

    await updateMatch(matchId, {
      status: match.status,
      players: JSON.stringify(match.players),
    });

    // Ensure accepting player exists in DB
    await upsertPlayer({
      address: playerId,
      display_name: playerId.slice(0, 10),
      rating: 1200,
      games_played: 0,
      games_won: 0,
      games_drawn: 0,
    });

    // Track active match for both players
    for (const p of match.players) {
      await storeActiveMatchForPlayer(this.redis, p, matchId, match.gameId, match.stakeWei);
    }

    const wsToken = randomUUID();
    await storeWsToken(this.redis, wsToken, matchId, playerId);

    log.info({ matchId, playerId, stakeWei: match.stakeWei }, "Private match accepted");
    return { matchId, wsToken, stakeWei: match.stakeWei };
  }

  /**
   * Activate a staked match after all deposits have been confirmed on-chain.
   * Transitions the match from WAITING → ACTIVE and creates the orchestrator.
   */
  async activateStakedMatch(matchId: string): Promise<boolean> {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== MatchStatus.WAITING) return false;

    const game = this.gameRegistry.get(match.gameId);
    if (!game) return false;

    match.status = MatchStatus.ACTIVE;
    match.lastActivityAt = new Date();
    match.orchestrator = new MatchOrchestrator({
      game,
      players: match.players,
      matchId,
    });

    await updateMatch(matchId, { status: MatchStatus.ACTIVE });

    log.info({ matchId, stakeWei: match.stakeWei }, "Staked match activated (deposits confirmed)");
    return true;
  }

  // --- WS Token management (Redis-backed) ---

  async generateWsToken(matchId: string, playerId: string): Promise<string> {
    const token = randomUUID();
    await storeWsToken(this.redis, token, matchId, playerId);
    return token;
  }

  async validateWsToken(token: string): Promise<{ matchId: string; playerId: string } | null> {
    return consumeWsToken(this.redis, token);
  }
}
