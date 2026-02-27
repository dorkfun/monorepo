import Redis from "ioredis";
import { getRedisUrl } from "./config";

/**
 * Factory: create a new Redis client from REDIS_URL env.
 * The caller owns the lifecycle (connect, quit).
 */
export function createRedisClient(): Redis {
  const url = getRedisUrl();
  const useTls = url.startsWith("rediss://");

  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(useTls ? { tls: { rejectUnauthorized: false } } : {}),
  });
}

// --- WS Token helpers (Redis-backed, auto-expire) ---

const WS_TOKEN_PREFIX = "wstoken:";
const WS_TOKEN_TTL = 300; // 5 minutes

export async function storeWsToken(
  r: Redis,
  token: string,
  matchId: string,
  playerId: string
): Promise<void> {
  await r.set(
    WS_TOKEN_PREFIX + token,
    JSON.stringify({ matchId, playerId }),
    "EX",
    WS_TOKEN_TTL
  );
}

export async function consumeWsToken(
  r: Redis,
  token: string
): Promise<{ matchId: string; playerId: string } | null> {
  const key = WS_TOKEN_PREFIX + token;
  const data = await r.get(key);
  if (!data) return null;
  await r.del(key);
  return JSON.parse(data);
}

// --- Queue helpers (Redis-backed) ---

const QUEUE_PREFIX = "queue:";
const QUEUE_ENTRY_PREFIX = "qentry:";
const QUEUE_ENTRY_TTL = 30; // 30 seconds — clients poll every 2s, so 15x margin

function queueKey(gameId: string, stakeWei: string = "0"): string {
  return QUEUE_PREFIX + gameId + ":" + stakeWei;
}

export async function addToQueue(
  r: Redis,
  gameId: string,
  playerId: string,
  ticket: string,
  stakeWei: string = "0"
): Promise<void> {
  const key = queueKey(gameId, stakeWei);
  // Remove any existing entries for this player to prevent duplicates
  // (e.g. from repeated poll calls while waiting)
  const existing = await r.smembers(key);
  for (const t of existing) {
    const data = await r.get(QUEUE_ENTRY_PREFIX + t);
    if (!data) {
      await r.srem(key, t);
      continue;
    }
    const entry = JSON.parse(data);
    if (entry.playerId === playerId) {
      await r.srem(key, t);
      await r.del(QUEUE_ENTRY_PREFIX + t);
    }
  }

  await r.sadd(key, ticket);
  await r.set(
    QUEUE_ENTRY_PREFIX + ticket,
    JSON.stringify({ playerId, gameId, ticket, stakeWei }),
    "EX",
    QUEUE_ENTRY_TTL
  );
}

export async function removeFromQueue(
  r: Redis,
  gameId: string,
  ticket: string,
  stakeWei: string = "0"
): Promise<boolean> {
  const key = queueKey(gameId, stakeWei);
  const removed = await r.srem(key, ticket);
  await r.del(QUEUE_ENTRY_PREFIX + ticket);
  return removed > 0;
}

export async function findOpponentInQueue(
  r: Redis,
  gameId: string,
  excludePlayerId: string,
  stakeWei: string = "0"
): Promise<{ playerId: string; ticket: string } | null> {
  const key = queueKey(gameId, stakeWei);
  const tickets = await r.smembers(key);
  for (const ticket of tickets) {
    const data = await r.get(QUEUE_ENTRY_PREFIX + ticket);
    if (!data) {
      await r.srem(key, ticket);
      continue;
    }
    const entry = JSON.parse(data);
    if (entry.playerId !== excludePlayerId) {
      await r.srem(key, ticket);
      await r.del(QUEUE_ENTRY_PREFIX + ticket);
      return { playerId: entry.playerId, ticket };
    }
  }
  return null;
}

export async function getQueueSize(
  r: Redis,
  gameId: string,
  stakeWei: string = "0"
): Promise<number> {
  return r.scard(queueKey(gameId, stakeWei));
}

export interface QueueEntry {
  playerId: string;
  gameId: string;
  ticket: string;
  stakeWei: string;
}

// --- Pending match notification helpers ---

const PENDING_MATCH_PREFIX = "pendingmatch:";
const PENDING_MATCH_TTL = 120; // 2 minutes

export async function storePendingMatch(
  r: Redis,
  gameId: string,
  playerId: string,
  matchId: string,
  opponent: string,
  stakeWei: string = "0"
): Promise<void> {
  await r.set(
    PENDING_MATCH_PREFIX + gameId + ":" + stakeWei + ":" + playerId,
    JSON.stringify({ matchId, opponent, stakeWei }),
    "EX",
    PENDING_MATCH_TTL
  );
}

export async function consumePendingMatch(
  r: Redis,
  gameId: string,
  playerId: string,
  stakeWei: string = "0"
): Promise<{ matchId: string; opponent: string; stakeWei: string } | null> {
  const key = PENDING_MATCH_PREFIX + gameId + ":" + stakeWei + ":" + playerId;
  const data = await r.get(key);
  if (!data) return null;
  await r.del(key);
  return JSON.parse(data);
}

export async function getQueueEntries(
  r: Redis,
  gameId: string,
  stakeWei: string = "0"
): Promise<QueueEntry[]> {
  const key = queueKey(gameId, stakeWei);
  const tickets = await r.smembers(key);
  const entries: QueueEntry[] = [];
  for (const ticket of tickets) {
    const data = await r.get(QUEUE_ENTRY_PREFIX + ticket);
    if (!data) {
      // Stale ticket — TTL expired but set member remains. Clean up.
      await r.srem(key, ticket);
      continue;
    }
    entries.push(JSON.parse(data));
  }
  return entries;
}

/**
 * Get all queue entries for a game across ALL stake levels.
 * Scans for queue:{gameId}:* keys to discover all stake-scoped queues.
 */
export async function getAllQueueEntriesForGame(
  r: Redis,
  gameId: string
): Promise<QueueEntry[]> {
  const pattern = QUEUE_PREFIX + gameId + ":*";
  const keys = await r.keys(pattern);
  const allEntries: QueueEntry[] = [];
  for (const key of keys) {
    const tickets = await r.smembers(key);
    for (const ticket of tickets) {
      const data = await r.get(QUEUE_ENTRY_PREFIX + ticket);
      if (!data) {
        await r.srem(key, ticket);
        continue;
      }
      allEntries.push(JSON.parse(data));
    }
  }
  return allEntries;
}

/**
 * Sweep all queue sets and remove tickets whose qentry: detail has expired.
 * Returns the total number of pruned entries.
 */
export async function pruneStaleQueueEntries(r: Redis): Promise<number> {
  const keys = await r.keys(QUEUE_PREFIX + "*");
  let pruned = 0;
  for (const key of keys) {
    const tickets = await r.smembers(key);
    for (const ticket of tickets) {
      const exists = await r.exists(QUEUE_ENTRY_PREFIX + ticket);
      if (!exists) {
        await r.srem(key, ticket);
        pruned++;
      }
    }
  }
  return pruned;
}

// --- Game session helpers (for reconnection after disconnect) ---

const SESSION_PREFIX = "session:";
const SESSION_TTL = 3600; // 1 hour

/**
 * Store a game session so a player can reconnect to an active match.
 * Created after a successful HELLO authentication.
 */
export async function storeGameSession(
  r: Redis,
  matchId: string,
  playerId: string
): Promise<void> {
  await r.set(
    SESSION_PREFIX + matchId + ":" + playerId,
    JSON.stringify({ matchId, playerId, createdAt: Date.now() }),
    "EX",
    SESSION_TTL
  );
}

/**
 * Look up a game session (non-consuming — session persists for reconnection).
 */
export async function getGameSession(
  r: Redis,
  matchId: string,
  playerId: string
): Promise<{ matchId: string; playerId: string } | null> {
  const key = SESSION_PREFIX + matchId + ":" + playerId;
  const data = await r.get(key);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Delete a game session (called when a match completes or is cleaned up).
 */
export async function deleteGameSession(
  r: Redis,
  matchId: string,
  playerId: string
): Promise<void> {
  await r.del(SESSION_PREFIX + matchId + ":" + playerId);
}

// --- Active match lookup by player (for "do I have an active game?") ---

const ACTIVE_MATCH_PREFIX = "activematch:";
const ACTIVE_MATCH_TTL = 3600; // 1 hour

/**
 * Record that a player is participating in an active match.
 * Used by the reconnect endpoint to find a player's current game.
 */
export async function storeActiveMatchForPlayer(
  r: Redis,
  playerId: string,
  matchId: string,
  gameId: string,
  stakeWei?: string
): Promise<void> {
  await r.set(
    ACTIVE_MATCH_PREFIX + playerId,
    JSON.stringify({ matchId, gameId, stakeWei: stakeWei || "0" }),
    "EX",
    ACTIVE_MATCH_TTL
  );
}

/**
 * Check if a player has an active match they could reconnect to.
 */
export async function getActiveMatchForPlayer(
  r: Redis,
  playerId: string
): Promise<{ matchId: string; gameId: string; stakeWei?: string } | null> {
  const data = await r.get(ACTIVE_MATCH_PREFIX + playerId);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Remove the active match mapping for a player (on match completion/cleanup).
 */
export async function deleteActiveMatchForPlayer(
  r: Redis,
  playerId: string
): Promise<void> {
  await r.del(ACTIVE_MATCH_PREFIX + playerId);
}
