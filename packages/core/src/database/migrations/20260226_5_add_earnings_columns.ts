import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add lifetime earnings column to players (overall leaderboard)
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS total_earnings_wei TEXT NOT NULL DEFAULT '0'`.execute(
    db
  );

  // Add lifetime earnings column to player_game_stats (per-game leaderboard)
  await sql`ALTER TABLE player_game_stats ADD COLUMN IF NOT EXISTS total_earnings_wei TEXT NOT NULL DEFAULT '0'`.execute(
    db
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE player_game_stats DROP COLUMN IF EXISTS total_earnings_wei`.execute(
    db
  );
  await sql`ALTER TABLE players DROP COLUMN IF EXISTS total_earnings_wei`.execute(
    db
  );
}
