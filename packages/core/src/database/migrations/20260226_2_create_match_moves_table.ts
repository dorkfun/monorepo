import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("match_moves")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("match_id", "uuid", (col) =>
      col.notNull().references("matches.id")
    )
    .addColumn("sequence", "integer", (col) => col.notNull())
    .addColumn("player_address", "varchar(42)", (col) => col.notNull())
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("state_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("prev_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("idx_match_moves_match_id")
    .ifNotExists()
    .on("match_moves")
    .column("match_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_match_moves_match_id").execute();
  await db.schema.dropTable("match_moves").execute();
}
