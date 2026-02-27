import { sql } from "kysely";
import { db } from "../database";
import { Match, NewMatch, MatchUpdate } from "../types";

export async function findMatchById(
  id: string
): Promise<Match | undefined> {
  return db
    .selectFrom("matches")
    .where("id", "=", id)
    .selectAll()
    .executeTakeFirst();
}

export async function listMatches(limit = 50): Promise<Match[]> {
  return db
    .selectFrom("matches")
    .selectAll()
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
}

export async function createMatch(match: NewMatch): Promise<void> {
  await db.insertInto("matches").values(match).execute();
}

export async function listArchivedMatches(options: {
  gameId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ matches: Match[]; total: number }> {
  const { gameId, limit = 50, offset = 0 } = options;
  const archivedStatuses = ["completed", "settled", "disputed"];

  let query = db
    .selectFrom("matches")
    .where("status", "in", archivedStatuses);

  let countQuery = db
    .selectFrom("matches")
    .where("status", "in", archivedStatuses);

  if (gameId) {
    query = query.where("game_id", "=", gameId);
    countQuery = countQuery.where("game_id", "=", gameId);
  }

  const [matches, countResult] = await Promise.all([
    query
      .selectAll()
      .orderBy("completed_at", "desc")
      .limit(limit)
      .offset(offset)
      .execute(),
    countQuery
      .select(sql<number>`count(*)`.as("count"))
      .executeTakeFirst(),
  ]);

  return { matches, total: Number(countResult?.count ?? 0) };
}

export async function findActiveMatches(): Promise<Match[]> {
  return db
    .selectFrom("matches")
    .where("status", "in", ["active", "waiting"])
    .selectAll()
    .orderBy("created_at", "asc")
    .execute();
}

export async function updateMatch(
  id: string,
  update: MatchUpdate
): Promise<void> {
  await db
    .updateTable("matches")
    .set(update)
    .where("id", "=", id)
    .execute();
}
