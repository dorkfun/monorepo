import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { GameRegistry } from "@dorkfun/engine";
import { ChessModule } from "@dorkfun/game-chess";
import { TicTacToeModule } from "@dorkfun/game-tictactoe";
import { SudokuModule } from "@dorkfun/game-sudoku";
import { ConnectFourModule } from "@dorkfun/game-connectfour";
import { CheckersModule } from "@dorkfun/game-checkers";
import { OthelloModule } from "@dorkfun/game-othello";
import { HexModule } from "@dorkfun/game-hex";
import { migrateToLatest, closeDb, createRedisClient, pruneStaleQueueEntries, EnsResolver } from "@dorkfun/core";
import config from "./config";
import log from "./logger";
import { MatchService } from "./services/MatchService";
import { SettlementService } from "./services/SettlementService";
import { RoomManager } from "./ws/rooms";
import { createHttpWsServer } from "./ws/server";

(async function main() {
  // 1. Initialize database
  await migrateToLatest({ log: (msg) => log.info(msg) });

  // 2. Initialize Redis
  const redis = createRedisClient();
  redis.on("connect", () => log.info("Redis connected"));
  redis.on("error", (err) => log.error({ err: err.message }, "Redis error"));

  // 3. Set up game registry with available games
  const gameRegistry = new GameRegistry();
  gameRegistry.register(ChessModule);
  gameRegistry.register(TicTacToeModule);
  gameRegistry.register(SudokuModule);
  gameRegistry.register(ConnectFourModule);
  gameRegistry.register(CheckersModule);
  gameRegistry.register(OthelloModule);
  gameRegistry.register(HexModule);
  log.info({ games: gameRegistry.list().map((g) => g.gameId) }, "Games registered");

  // 4. Set up services
  let settlementService: SettlementService | null = null;
  if (config.settlementEnabled) {
    settlementService = new SettlementService({
      rpcUrl: config.rpcUrl,
      privateKey: config.serverPrivateKey,
      settlementAddress: config.settlementAddress,
      escrowAddress: config.escrowAddress,
    });
    log.info("On-chain settlement + staking enabled");
  } else {
    log.info("On-chain settlement disabled (missing RPC_URL / keys / contract addresses)");
  }

  const matchService = new MatchService(gameRegistry, redis, settlementService);
  const roomManager = new RoomManager();

  // 4b. ENS resolver (optional — uses mainnet RPC for reverse lookups)
  const ensRpcUrl = process.env.ENS_RPC_URL || config.rpcUrl || "https://eth.llamarpc.com";
  const ensResolver = new EnsResolver(ensRpcUrl);
  log.info({ rpc: ensRpcUrl }, "ENS resolver initialized");

  // 5. Start HTTP + WebSocket server
  const { httpServer } = createHttpWsServer(matchService, roomManager, gameRegistry, redis, settlementService, ensResolver);
  httpServer.listen(config.port, () => {
    log.info({ port: config.port }, "HTTP/WS server listening");
  });

  // 6. Periodic cleanup of completed matches from memory (every 5 minutes)
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  const MATCH_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
  const cleanupInterval = setInterval(() => {
    matchService.cleanupCompletedMatches(MATCH_MAX_AGE_MS);
  }, CLEANUP_INTERVAL_MS);

  // 7. Periodic cleanup of stale ACTIVE/WAITING matches (every 5 minutes)
  const staleCleanupInterval = setInterval(() => {
    matchService.cleanupStaleMatches(config.staleMatchTimeoutMs, roomManager);
  }, CLEANUP_INTERVAL_MS);

  // 8. Periodic pruning of stale queue entries (every 10 seconds)
  //    Removes tickets from queue sets whose qentry: detail has expired in Redis.
  //    With a 30s TTL and 2s client polling, dead clients drop off within ~40s.
  const QUEUE_PRUNE_INTERVAL_MS = 10 * 1000;
  const queuePruneInterval = setInterval(async () => {
    const pruned = await pruneStaleQueueEntries(redis);
    if (pruned > 0) {
      log.info({ pruned }, "Pruned stale queue entries");
    }
  }, QUEUE_PRUNE_INTERVAL_MS);

  log.info("dork.fun server started");

  // Graceful shutdown
  const shutdown = async () => {
    log.info("Shutting down...");
    clearInterval(cleanupInterval);
    clearInterval(staleCleanupInterval);
    clearInterval(queuePruneInterval);
    settlementService?.shutdown();
    httpServer.close();
    await redis.quit();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
})();
