import { Request, Response, Express } from "express";
import Redis from "ioredis";
import { GameRegistry } from "@dorkfun/engine";
import {
  MatchStatus,
  EnsResolver,
  getLeaderboard,
  getLeaderboardCount,
  getGameLeaderboard,
  getGameLeaderboardCount,
  isEvmAddress,
  validateAuth,
  getActiveMatchForPlayer,
  deleteActiveMatchForPlayer,
  listArchivedMatches,
  findMatchById,
  findMovesByMatchId,
} from "@dorkfun/core";
import { MatchService } from "../services/MatchService";
import { SettlementService } from "../services/SettlementService";
import { RoomManager } from "../ws/rooms";
import config from "../config";

/**
 * Validate playerId + signature + timestamp from the request body.
 * Returns the authenticated playerId or null (after sending an error response).
 */
function requireAuth(req: Request, res: Response): { playerId: string } | null {
  const { playerId, signature, timestamp } = req.body;
  if (!playerId) {
    res.status(400).json({ error: "playerId required" });
    return null;
  }
  if (!isEvmAddress(playerId)) {
    res.status(400).json({ error: "playerId must be a valid EVM address (0x followed by 40 hex characters)" });
    return null;
  }
  if (!signature || timestamp === undefined || timestamp === null) {
    res.status(400).json({ error: "signature and timestamp required for authentication" });
    return null;
  }
  if (!validateAuth(playerId, signature, timestamp)) {
    res.status(401).json({ error: "Invalid signature or expired timestamp" });
    return null;
  }
  return { playerId };
}

/**
 * Validate admin access via Authorization: Bearer <ADMIN_SECRET> header.
 * Returns true if authorized, false (after sending 401/403) otherwise.
 */
function requireAdmin(req: Request, res: Response): boolean {
  if (!config.adminSecret) {
    res.status(403).json({ error: "Admin endpoints are not configured (ADMIN_SECRET not set)" });
    return false;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header required (Bearer <ADMIN_SECRET>)" });
    return false;
  }
  const token = authHeader.slice(7);
  if (token !== config.adminSecret) {
    res.status(403).json({ error: "Invalid admin secret" });
    return false;
  }
  return true;
}

export function bindRoutes(app: Express, matchService: MatchService, roomManager: RoomManager, gameRegistry: GameRegistry, redis: Redis, ensResolver: EnsResolver | null = null) {
  // Batch ENS resolution endpoint
  app.post("/api/ens/resolve", async (req, res) => {
    if (!ensResolver) {
      res.json({ names: {} });
      return;
    }
    const { addresses } = req.body;
    if (!Array.isArray(addresses) || addresses.length === 0) {
      res.status(400).json({ error: "addresses array required" });
      return;
    }
    const capped = addresses.slice(0, 50);
    const names = await ensResolver.resolveMany(capped);
    res.json({ names });
  });

  // Health check
  app.get("/health/check", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      emergencyMode: matchService.isEmergencyMode(),
    });
  });

  // List available games — pulled dynamically from the game registry
  app.get("/api/games", (_req, res) => {
    const games = gameRegistry.list().map((g) => ({
      id: g.gameId,
      name: g.name,
      description: g.description,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      stakingEnabled: g.minPlayers >= 2 && config.settlementEnabled,
    }));
    res.json({ games });
  });

  // List active matches
  app.get("/api/matches", async (_req, res) => {
    const activeMatches = matchService.listActiveMatches();
    const allPlayers = [...new Set(activeMatches.flatMap((m) => m.players))];
    const playerNames = ensResolver ? await ensResolver.resolveMany(allPlayers) : {};

    const matches = activeMatches.map((m) => ({
      matchId: m.matchId,
      gameId: m.gameId,
      status: m.status,
      players: m.players,
      playerNames,
      stakeWei: m.stakeWei !== "0" ? m.stakeWei : null,
      createdAt: m.createdAt.toISOString(),
    }));
    res.json({ matches });
  });

  // Get match details (checks memory first, falls back to database for archived matches)
  app.get("/api/matches/:matchId", async (req, res) => {
    const match = matchService.getMatch(req.params.matchId);
    if (match) {
      const playerNames = ensResolver ? await ensResolver.resolveMany(match.players) : {};
      const response: Record<string, unknown> = {
        matchId: match.matchId,
        gameId: match.gameId,
        status: match.status,
        players: match.players,
        playerNames,
        winner: match.winner,
        createdAt: match.createdAt.toISOString(),
        completedAt: match.completedAt?.toISOString() ?? null,
      };

      if (match.orchestrator) {
        response.observation = match.orchestrator.getObservation(match.players[0]);
        response.transcript = match.orchestrator.getTranscript();
      }

      res.json(response);
      return;
    }

    // Fall back to database for completed/archived matches
    const dbMatch = await findMatchById(req.params.matchId);
    if (!dbMatch) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    const players = JSON.parse(dbMatch.players);
    const playerNames = ensResolver ? await ensResolver.resolveMany(players) : {};
    const moves = await findMovesByMatchId(dbMatch.id);
    const transcript = moves.map((m) => ({
      sequence: m.sequence,
      playerAddress: m.player_address,
      action: JSON.parse(m.action),
      stateHash: m.state_hash,
      prevHash: m.prev_hash,
    }));

    // Try to reconstruct the final game state by replaying moves
    let observation = null;
    let reason: string | null = dbMatch.reason;
    const gameModule = gameRegistry.get(dbMatch.game_id);
    if (gameModule && transcript.length > 0) {
      try {
        let state = gameModule.init({ gameId: dbMatch.game_id, version: "1" }, players, "0");
        for (const entry of transcript) {
          state = gameModule.applyAction(state, entry.playerAddress, entry.action);
        }
        observation = gameModule.getObservation(state, players[0]);

        // Infer reason from final game state if not stored in DB (older matches)
        if (!reason && gameModule.isTerminal(state)) {
          const outcome = gameModule.getOutcome(state);
          reason = outcome?.reason ?? null;
        }
      } catch {
        // Replay failed (e.g. rng-dependent init) — skip observation
      }
    }

    res.json({
      matchId: dbMatch.id,
      gameId: dbMatch.game_id,
      status: dbMatch.status,
      players,
      playerNames,
      winner: dbMatch.winner,
      reason,
      stakeWei: dbMatch.stake_wei,
      createdAt: dbMatch.created_at.toISOString(),
      completedAt: dbMatch.completed_at?.toISOString() ?? null,
      transcript,
      observation,
    });
  });

  // List archived (completed/settled/disputed) matches
  app.get("/api/archive", async (req, res) => {
    const gameId = req.query.gameId as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { matches: dbMatches, total } = await listArchivedMatches({ gameId, limit, offset });

    const matches = dbMatches.map((m) => ({
      matchId: m.id,
      gameId: m.game_id,
      status: m.status,
      players: JSON.parse(m.players),
      winner: m.winner,
      reason: m.reason,
      stakeWei: m.stake_wei,
      createdAt: m.created_at.toISOString(),
      completedAt: m.completed_at?.toISOString() ?? null,
    }));

    // Resolve ENS names for all players across all matches
    const allAddresses = [...new Set(matches.flatMap((m) => [...m.players, m.winner].filter(Boolean)))];
    const playerNames = ensResolver ? await ensResolver.resolveMany(allAddresses) : {};

    res.json({ matches, playerNames, total, limit, offset });
  });

  // Public config: minimum stake required for staked matches (read from on-chain Escrow)
  app.get("/api/config/minimum-stake", async (_req, res) => {
    const minimumStakeWei = await matchService.getMinimumStake();
    res.json({ minimumStakeWei });
  });

  // Quick matchmaking (requires signature)
  app.post("/api/matchmaking/join", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const { gameId, ticket: existingTicket, settings, stakeWei } = req.body;
    if (!gameId) {
      res.status(400).json({ error: "gameId required" });
      return;
    }

    try {
      const result = await matchService.joinQueue(
        auth.playerId,
        gameId,
        existingTicket,
        settings,
        stakeWei || "0"
      );
      if (result.matchId) {
        const wsToken = await matchService.generateWsToken(result.matchId, auth.playerId);
        const response: Record<string, unknown> = {
          status: "matched",
          matchId: result.matchId,
          opponent: result.opponent,
          wsToken,
          wsUrl: `/ws/game/${result.matchId}`,
        };

        // Include escrow info for staked matches
        const matchStake = result.stakeWei || "0";
        if (matchStake !== "0" && config.settlementEnabled) {
          response.escrow = {
            address: config.escrowAddress,
            stakeWei: matchStake,
            matchIdBytes32: SettlementService.matchIdToBytes32(result.matchId),
          };
        }

        res.json(response);
      } else {
        res.json({
          status: "queued",
          ticket: result.ticket,
        });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Leave queue
  app.post("/api/matchmaking/leave", async (req, res) => {
    const { ticket } = req.body;
    if (!ticket) {
      res.status(400).json({ error: "ticket required" });
      return;
    }

    const success = await matchService.leaveQueue(ticket);
    res.json({ success });
  });

  // Queue status — who is waiting for each game
  app.get("/api/queues", async (_req, res) => {
    try {
      const queues = await matchService.getQueueStatus();

      // Resolve ENS names for queued players
      const allIds = queues.flatMap((q) => q.entries.map((e) => e.playerId));
      const playerNames = ensResolver && allIds.length > 0
        ? await ensResolver.resolveMany(allIds)
        : {};

      res.json({ queues, playerNames });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create private match (requires signature)
  app.post("/api/matches/private", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const { gameId, settings, stakeWei } = req.body;
    if (!gameId) {
      res.status(400).json({ error: "gameId required" });
      return;
    }

    try {
      const result = await matchService.createPrivateMatch(
        auth.playerId,
        gameId,
        settings,
        stakeWei || "0"
      );
      const wsToken = await matchService.generateWsToken(result.matchId, auth.playerId);
      const response: Record<string, unknown> = {
        matchId: result.matchId,
        inviteCode: result.inviteCode,
        wsToken,
        wsUrl: `/ws/game/${result.matchId}`,
      };

      if (result.stakeWei !== "0" && config.settlementEnabled) {
        response.escrow = {
          address: config.escrowAddress,
          stakeWei: result.stakeWei,
          matchIdBytes32: SettlementService.matchIdToBytes32(result.matchId),
        };
      }

      res.json(response);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Accept private match (requires signature)
  app.post("/api/matches/accept", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const { inviteCode } = req.body;
    if (!inviteCode) {
      res.status(400).json({ error: "inviteCode required" });
      return;
    }

    const result = await matchService.acceptPrivateMatch(auth.playerId, inviteCode);
    if (!result) {
      res.status(404).json({ error: "Invalid invite code or match not found" });
      return;
    }

    const response: Record<string, unknown> = {
      matchId: result.matchId,
      wsToken: result.wsToken,
      wsUrl: `/ws/game/${result.matchId}`,
    };

    if (result.stakeWei !== "0" && config.settlementEnabled) {
      response.escrow = {
        address: config.escrowAddress,
        stakeWei: result.stakeWei,
        matchIdBytes32: SettlementService.matchIdToBytes32(result.matchId),
      };
    }

    res.json(response);
  });

  // Check for active match (reconnection discovery, requires signature)
  app.post("/api/matches/active", async (req, res) => {
    const auth = requireAuth(req, res);
    if (!auth) return;

    const activeMatch = await getActiveMatchForPlayer(redis, auth.playerId);
    if (!activeMatch) {
      res.json({ hasActiveMatch: false });
      return;
    }

    // Verify the match is still actually active in memory
    const match = matchService.getMatch(activeMatch.matchId);
    if (!match || match.status === MatchStatus.COMPLETED) {
      await deleteActiveMatchForPlayer(redis, auth.playerId);
      res.json({ hasActiveMatch: false });
      return;
    }

    // Generate a fresh WS token for reconnection
    const wsToken = await matchService.generateWsToken(activeMatch.matchId, auth.playerId);
    const stakeWei = activeMatch.stakeWei || match.stakeWei || "0";
    res.json({
      hasActiveMatch: true,
      matchId: activeMatch.matchId,
      gameId: activeMatch.gameId,
      stakeWei: stakeWei !== "0" ? stakeWei : undefined,
      wsToken,
      wsUrl: `/ws/game/${activeMatch.matchId}`,
    });
  });

  // Overall leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = req.query.sort === "earnings" ? "earnings" as const : "rating" as const;

    const players = await getLeaderboard(limit, offset, sort);
    const total = await getLeaderboardCount();

    // Enrich with ENS names
    if (ensResolver) {
      const names = await ensResolver.resolveMany(players.map((p) => p.address));
      for (const p of players) {
        p.ensName = names[p.address] ?? null;
      }
    }

    res.json({ players, total, limit, offset, sort });
  });

  // Per-game leaderboard
  app.get("/api/leaderboard/:gameId", async (req, res) => {
    const { gameId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = req.query.sort === "earnings" ? "earnings" as const : "rating" as const;

    const players = await getGameLeaderboard(gameId, limit, offset, sort);
    const total = await getGameLeaderboardCount(gameId);

    // Enrich with ENS names
    if (ensResolver) {
      const names = await ensResolver.resolveMany(players.map((p) => p.address));
      for (const p of players) {
        p.ensName = names[p.address] ?? null;
      }
    }

    res.json({ gameId, players, total, limit, offset, sort });
  });

  // --- Admin endpoints (protected by ADMIN_SECRET) ---

  // Emergency kill switch: draw all active matches and block new ones
  app.post("/api/admin/emergency-draw-all", async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const result = await matchService.emergencyDrawAll(roomManager);
    res.json({
      success: true,
      emergencyMode: true,
      drawnMatches: result.drawnMatches,
      cancelledMatches: result.cancelledMatches,
      total: result.drawnMatches + result.cancelledMatches,
    });
  });

  // Resume normal operations after emergency
  app.post("/api/admin/emergency-resume", (req, res) => {
    if (!requireAdmin(req, res)) return;

    matchService.setEmergencyMode(false);
    res.json({ success: true, emergencyMode: false });
  });

  // Check emergency mode status
  app.get("/api/admin/emergency-status", (req, res) => {
    if (!requireAdmin(req, res)) return;

    res.json({ emergencyMode: matchService.isEmergencyMode() });
  });
}
