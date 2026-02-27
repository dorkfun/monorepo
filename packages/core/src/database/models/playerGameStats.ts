import { sql } from "kysely";
import { db } from "../database";
import type { PlayerGameStats } from "../types";

export async function findPlayerGameStats(
  playerAddress: string,
  gameId: string
): Promise<PlayerGameStats | undefined> {
  return db
    .selectFrom("player_game_stats")
    .selectAll()
    .where("player_address", "=", playerAddress)
    .where("game_id", "=", gameId)
    .executeTakeFirst();
}

export type LeaderboardSortBy = "rating" | "earnings";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  ensName?: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  totalEarningsWei: string;
}

export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0,
  sortBy: LeaderboardSortBy = "rating"
): Promise<LeaderboardEntry[]> {
  let query = db
    .selectFrom("players")
    .select([
      "address",
      "display_name",
      "rating",
      "games_played",
      "games_won",
      "games_drawn",
      "total_earnings_wei",
    ])
    .where("games_played", ">", 0);

  if (sortBy === "earnings") {
    query = query
      .orderBy(sql`CAST(total_earnings_wei AS NUMERIC)`, "desc")
      .orderBy("rating", "desc");
  } else {
    query = query.orderBy("rating", "desc").orderBy("games_won", "desc");
  }

  const rows = await query.limit(limit).offset(offset).execute();

  return rows.map((p, i) => ({
    rank: offset + i + 1,
    address: p.address,
    displayName: p.display_name,
    rating: p.rating,
    gamesPlayed: p.games_played,
    gamesWon: p.games_won,
    gamesDrawn: p.games_drawn,
    gamesLost: p.games_played - p.games_won - p.games_drawn,
    totalEarningsWei: p.total_earnings_wei,
  }));
}

export async function getLeaderboardCount(): Promise<number> {
  const result = await db
    .selectFrom("players")
    .select(sql<string>`count(*)`.as("count"))
    .where("games_played", ">", 0)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

export async function getGameLeaderboard(
  gameId: string,
  limit: number = 50,
  offset: number = 0,
  sortBy: LeaderboardSortBy = "rating"
): Promise<LeaderboardEntry[]> {
  let query = db
    .selectFrom("player_game_stats")
    .innerJoin("players", "players.address", "player_game_stats.player_address")
    .select([
      "player_game_stats.player_address as address",
      "players.display_name",
      "player_game_stats.rating",
      "player_game_stats.games_played",
      "player_game_stats.games_won",
      "player_game_stats.games_drawn",
      "player_game_stats.games_lost",
      "player_game_stats.total_earnings_wei",
    ])
    .where("player_game_stats.game_id", "=", gameId)
    .where("player_game_stats.games_played", ">", 0);

  if (sortBy === "earnings") {
    query = query
      .orderBy(sql`CAST(player_game_stats.total_earnings_wei AS NUMERIC)`, "desc")
      .orderBy("player_game_stats.rating", "desc");
  } else {
    query = query
      .orderBy("player_game_stats.rating", "desc")
      .orderBy("player_game_stats.games_won", "desc");
  }

  const rows = await query.limit(limit).offset(offset).execute();

  return rows.map((s, i) => ({
    rank: offset + i + 1,
    address: s.address,
    displayName: s.display_name,
    rating: s.rating,
    gamesPlayed: s.games_played,
    gamesWon: s.games_won,
    gamesDrawn: s.games_drawn,
    gamesLost: s.games_lost,
    totalEarningsWei: s.total_earnings_wei,
  }));
}

export async function getGameLeaderboardCount(
  gameId: string
): Promise<number> {
  const result = await db
    .selectFrom("player_game_stats")
    .select(sql<string>`count(*)`.as("count"))
    .where("game_id", "=", gameId)
    .where("games_played", ">", 0)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

export async function upsertPlayerGameStats(
  playerAddress: string,
  gameId: string,
  won: boolean,
  drawn: boolean,
  lost: boolean,
  newRating: number,
  earningsWei?: string
): Promise<void> {
  await db
    .insertInto("player_game_stats")
    .values({
      player_address: playerAddress,
      game_id: gameId,
      rating: newRating,
      games_played: 1,
      games_won: won ? 1 : 0,
      games_drawn: drawn ? 1 : 0,
      games_lost: lost ? 1 : 0,
      total_earnings_wei: earningsWei || "0",
    })
    .onConflict((oc) =>
      oc.columns(["player_address", "game_id"]).doUpdateSet((eb) => ({
        games_played: eb("player_game_stats.games_played", "+", 1),
        games_won: won
          ? eb("player_game_stats.games_won", "+", 1)
          : eb.ref("player_game_stats.games_won"),
        games_drawn: drawn
          ? eb("player_game_stats.games_drawn", "+", 1)
          : eb.ref("player_game_stats.games_drawn"),
        games_lost: lost
          ? eb("player_game_stats.games_lost", "+", 1)
          : eb.ref("player_game_stats.games_lost"),
        rating: newRating,
        ...(earningsWei
          ? {
              total_earnings_wei: sql<string>`(CAST(player_game_stats.total_earnings_wei AS NUMERIC) + CAST(${earningsWei} AS NUMERIC))::TEXT`,
            }
          : {}),
      }))
    )
    .execute();
}
