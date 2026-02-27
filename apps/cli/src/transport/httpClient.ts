import { buildAuthMessage } from "@dorkfun/core";
import { getConfig } from "../config/runtime.js";
import { signMessage } from "../wallet/signer.js";

async function request(path: string, opts?: RequestInit): Promise<any> {
  const base = getConfig().serverUrl;
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Build the authentication payload for endpoints that require proof of
 * EVM address ownership: { playerId, signature, timestamp }.
 */
async function buildAuth(playerId: string) {
  const timestamp = Date.now();
  const message = buildAuthMessage(playerId, timestamp);
  const signature = await signMessage(message);
  return { playerId, signature, timestamp };
}

export async function listGames() {
  return request("/api/games");
}

export async function listMatches() {
  return request("/api/matches");
}

export async function getMatch(matchId: string) {
  return request(`/api/matches/${matchId}`);
}

export async function joinQueue(playerId: string, gameId: string, ticket?: string, stakeWei?: string) {
  const auth = await buildAuth(playerId);
  return request("/api/matchmaking/join", {
    method: "POST",
    body: JSON.stringify({ ...auth, gameId, ticket, stakeWei }),
  });
}

export async function leaveQueue(ticket: string) {
  return request("/api/matchmaking/leave", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

export async function createPrivateMatch(playerId: string, gameId: string, stakeWei?: string) {
  const auth = await buildAuth(playerId);
  return request("/api/matches/private", {
    method: "POST",
    body: JSON.stringify({ ...auth, gameId, stakeWei }),
  });
}

export async function acceptPrivateMatch(playerId: string, inviteCode: string) {
  const auth = await buildAuth(playerId);
  return request("/api/matches/accept", {
    method: "POST",
    body: JSON.stringify({ ...auth, inviteCode }),
  });
}

export async function checkActiveMatch(playerId: string) {
  const auth = await buildAuth(playerId);
  return request("/api/matches/active", {
    method: "POST",
    body: JSON.stringify(auth),
  });
}

export async function listQueues() {
  return request("/api/queues");
}

export async function listArchive(gameId?: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (gameId) params.set("gameId", gameId);
  return request(`/api/archive?${params}`);
}

export async function getLeaderboard(limit = 50, offset = 0, sort: "rating" | "earnings" = "rating") {
  return request(`/api/leaderboard?limit=${limit}&offset=${offset}&sort=${sort}`);
}

export async function getGameLeaderboard(gameId: string, limit = 50, offset = 0, sort: "rating" | "earnings" = "rating") {
  return request(`/api/leaderboard/${gameId}?limit=${limit}&offset=${offset}&sort=${sort}`);
}

export async function resolveEns(addresses: string[]): Promise<Record<string, string | null>> {
  const result = await request("/api/ens/resolve", {
    method: "POST",
    body: JSON.stringify({ addresses }),
  });
  return result.names;
}
