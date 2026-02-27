// Database singleton (lazy proxy)
export { db, closeDb, getPoolConfig } from "./database";

// Types
export type {
  Database,
  PlayersTable,
  Player,
  NewPlayer,
  PlayerUpdate,
  PlayerGameStatsTable,
  PlayerGameStats,
  NewPlayerGameStats,
  PlayerGameStatsUpdate,
  MatchesTable,
  Match,
  NewMatch,
  MatchUpdate,
  MatchMovesTable,
  MatchMove,
  NewMatchMove,
  MatchMoveUpdate,
  ChatMessagesTable,
  ChatMessage,
  NewChatMessage,
  ChatMessageUpdate,
} from "./types";

// Models
export {
  findPlayerByAddress,
  createPlayer,
  upsertPlayer,
  updatePlayer,
  incrementPlayerStats,
} from "./models/players";

export {
  findPlayerGameStats,
  getLeaderboard,
  getLeaderboardCount,
  getGameLeaderboard,
  getGameLeaderboardCount,
  upsertPlayerGameStats,
} from "./models/playerGameStats";

export type { LeaderboardEntry, LeaderboardSortBy } from "./models/playerGameStats";

export {
  findMatchById,
  listMatches,
  listArchivedMatches,
  createMatch as createMatchRecord,
  updateMatch,
} from "./models/matches";

export {
  findMovesByMatchId,
  createMatchMove,
  createMatchMoves,
} from "./models/matchMoves";

export {
  findChatMessagesByMatchId,
  getChatHistory,
  createChatMessage,
} from "./models/chatMessages";

// Migration
export { migrateToLatest } from "./migrate";
export type { MigrateOptions } from "./migrate";

// Redis
export {
  createRedisClient,
  storeWsToken,
  consumeWsToken,
  addToQueue,
  removeFromQueue,
  findOpponentInQueue,
  getQueueSize,
  getQueueEntries,
  pruneStaleQueueEntries,
  storePendingMatch,
  consumePendingMatch,
  storeGameSession,
  getGameSession,
  deleteGameSession,
  storeActiveMatchForPlayer,
  getActiveMatchForPlayer,
  deleteActiveMatchForPlayer,
} from "./redis";

export type { QueueEntry } from "./redis";

// Config
export { getDatabaseUrl, getRedisUrl } from "./config";
