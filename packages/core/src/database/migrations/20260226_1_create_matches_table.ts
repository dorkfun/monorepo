import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("matches")
    .ifNotExists()
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("game_id", "varchar(255)", (col) => col.notNull())
    .addColumn("status", "varchar(50)", (col) => col.notNull())
    .addColumn("players", "text", (col) => col.notNull())
    .addColumn("winner", "varchar(42)")
    .addColumn("transcript_hash", "varchar(66)")
    .addColumn("settlement_tx_hash", "varchar(66)")
    .addColumn("stake_wei", "varchar(78)")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("completed_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("matches").execute();
}
