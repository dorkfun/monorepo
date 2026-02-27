import { sql } from "kysely";
import { db } from "../database";
import { Player, NewPlayer, PlayerUpdate } from "../types";

export async function findPlayerByAddress(
  address: string
): Promise<Player | undefined> {
  return db
    .selectFrom("players")
    .where("address", "=", address)
    .selectAll()
    .executeTakeFirst();
}

export async function createPlayer(player: NewPlayer): Promise<Player> {
  return db
    .insertInto("players")
    .values(player)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function upsertPlayer(player: NewPlayer): Promise<void> {
  await db
    .insertInto("players")
    .values(player)
    .onConflict((oc) => oc.column("address").doNothing())
    .execute();
}

export async function updatePlayer(
  address: string,
  update: PlayerUpdate
): Promise<void> {
  await db
    .updateTable("players")
    .set(update)
    .where("address", "=", address)
    .execute();
}

export async function incrementPlayerStats(
  address: string,
  won: boolean,
  drawn: boolean = false,
  newRating?: number,
  earningsWei?: string
): Promise<void> {
  await db
    .updateTable("players")
    .set((eb) => ({
      games_played: eb("games_played", "+", 1),
      games_won: won ? eb("games_won", "+", 1) : eb.ref("games_won"),
      games_drawn: drawn ? eb("games_drawn", "+", 1) : eb.ref("games_drawn"),
      ...(newRating !== undefined ? { rating: newRating } : {}),
      ...(earningsWei
        ? {
            total_earnings_wei: sql<string>`(CAST(total_earnings_wei AS NUMERIC) + CAST(${earningsWei} AS NUMERIC))::TEXT`,
          }
        : {}),
    }))
    .where("address", "=", address)
    .execute();
}
