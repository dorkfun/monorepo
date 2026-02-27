const BASE = import.meta.env.VITE_API_URL || "";

export async function listGames() {
  const res = await fetch(`${BASE}/api/games`);
  return res.json();
}

export async function listMatches() {
  const res = await fetch(`${BASE}/api/matches`);
  return res.json();
}

export async function getMatch(matchId: string) {
  const res = await fetch(`${BASE}/api/matches/${matchId}`);
  return res.json();
}

export async function listQueues() {
  const res = await fetch(`${BASE}/api/queues`);
  return res.json();
}

export async function listArchive(gameId?: string, limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (gameId) params.set("gameId", gameId);
  const res = await fetch(`${BASE}/api/archive?${params}`);
  return res.json();
}

export async function getLeaderboard(limit = 50, offset = 0, sort: "rating" | "earnings" = "rating") {
  const res = await fetch(`${BASE}/api/leaderboard?limit=${limit}&offset=${offset}&sort=${sort}`);
  return res.json();
}

export async function getGameLeaderboard(gameId: string, limit = 50, offset = 0, sort: "rating" | "earnings" = "rating") {
  const res = await fetch(`${BASE}/api/leaderboard/${gameId}?limit=${limit}&offset=${offset}&sort=${sort}`);
  return res.json();
}

export async function resolveEns(addresses: string[]): Promise<Record<string, string | null>> {
  const res = await fetch(`${BASE}/api/ens/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  });
  const data = await res.json();
  return data.names;
}
