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
  findActiveMatches,
  findCompletedStakedMatches,
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

// Migration — NOT re-exported here to avoid pulling `fs` into browser bundles.
// Server-only consumers should import from "@dorkfun/core/migrate" instead.

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
  getAllQueueEntriesForGame,
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
