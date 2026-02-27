import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("players")
    .ifNotExists()
    .addColumn("address", "varchar(42)", (col) => col.primaryKey())
    .addColumn("display_name", "varchar(255)", (col) => col.notNull())
    .addColumn("rating", "integer", (col) => col.notNull().defaultTo(1200))
    .addColumn("games_played", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("games_won", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("players").execute();
}
