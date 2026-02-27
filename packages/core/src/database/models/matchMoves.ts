import { db } from "../database";
import { MatchMove, NewMatchMove } from "../types";

export async function findMovesByMatchId(
  matchId: string
): Promise<MatchMove[]> {
  return db
    .selectFrom("match_moves")
    .where("match_id", "=", matchId)
    .selectAll()
    .orderBy("sequence", "asc")
    .execute();
}

export async function createMatchMove(move: NewMatchMove): Promise<void> {
  await db.insertInto("match_moves").values(move).execute();
}

export async function createMatchMoves(moves: NewMatchMove[]): Promise<void> {
  if (moves.length === 0) return;
  await db.insertInto("match_moves").values(moves).execute();
}
