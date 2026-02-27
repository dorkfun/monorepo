import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add games_drawn column to existing players table
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS games_drawn INTEGER NOT NULL DEFAULT 0`.execute(
    db
  );

  // Create per-game stats table for game-specific leaderboards
  await db.schema
    .createTable("player_game_stats")
    .ifNotExists()
    .addColumn("player_address", "varchar(42)", (col) =>
      col.notNull().references("players.address")
    )
    .addColumn("game_id", "varchar(255)", (col) => col.notNull())
    .addColumn("rating", "integer", (col) => col.notNull().defaultTo(1200))
    .addColumn("games_played", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_won", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_drawn", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_lost", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  // Add composite primary key (idempotent via DO block)
  await sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_game_stats_pkey') THEN
      ALTER TABLE player_game_stats ADD CONSTRAINT player_game_stats_pkey PRIMARY KEY (player_address, game_id);
    END IF;
  END $$`.execute(db);

  // Indexes for leaderboard queries
  await db.schema
    .createIndex("idx_player_game_stats_rating")
    .ifNotExists()
    .on("player_game_stats")
    .columns(["game_id", "rating"])
    .execute();

  await db.schema
    .createIndex("idx_players_rating")
    .ifNotExists()
    .on("players")
    .column("rating")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("player_game_stats").ifExists().execute();
  await sql`ALTER TABLE players DROP COLUMN IF EXISTS games_drawn`.execute(db);
  await db.schema.dropIndex("idx_players_rating").ifExists().execute();
}
