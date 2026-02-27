import * as path from "path";
import { promises as fs } from "fs";
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { Database } from "./types";
import { getDatabaseUrl } from "./config";
import { getPoolConfig } from "./database";

export interface MigrateOptions {
  /** Override DATABASE_URL from env */
  databaseUrl?: string;
  /** Optional log function; defaults to console.log */
  log?: (message: string) => void;
}

export async function migrateToLatest(
  options: MigrateOptions = {}
): Promise<void> {
  const log = options.log ?? console.log;
  const connectionString = options.databaseUrl ?? getDatabaseUrl();

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool(getPoolConfig(connectionString)),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  log("Running database migrations...");

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      log(`Migration "${it.migrationName}" executed successfully`);
    } else if (it.status === "Error") {
      log(`Migration "${it.migrationName}" failed`);
    }
  });

  if (error) {
    await db.destroy();
    throw error;
  }

  log("Database migrations complete");
  await db.destroy();
}
