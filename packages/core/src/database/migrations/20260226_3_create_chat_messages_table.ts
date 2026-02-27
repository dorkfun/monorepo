import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("chat_messages")
    .ifNotExists()
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("match_id", "uuid", (col) =>
      col.notNull().references("matches.id")
    )
    .addColumn("sender", "varchar(255)", (col) => col.notNull())
    .addColumn("display_name", "varchar(255)", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("idx_chat_messages_match_id")
    .ifNotExists()
    .on("chat_messages")
    .column("match_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_chat_messages_match_id").execute();
  await db.schema.dropTable("chat_messages").execute();
}
