import { Kysely, PostgresDialect } from "kysely";
import { Pool, PoolConfig } from "pg";
import { Database } from "./types";
import { getDatabaseUrl } from "./config";

let _db: Kysely<Database> | null = null;

function isLocalOrDockerHost(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }
  if (!host.includes(".")) {
    return true;
  }
  const ipParts = host.split(".").map(Number);
  if (
    ipParts.length === 4 &&
    ipParts.every((p) => !isNaN(p) && p >= 0 && p <= 255)
  ) {
    if (ipParts[0] === 10) return true;
    if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31)
      return true;
    if (ipParts[0] === 192 && ipParts[1] === 168) return true;
  }
  return false;
}

export function getPoolConfig(connString?: string): PoolConfig {
  const connectionString = connString ?? getDatabaseUrl();
  const poolConfig: PoolConfig = { connectionString };
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");

  if (sslmode === "disable") {
    poolConfig.ssl = false;
  } else if (sslmode) {
    poolConfig.ssl = { rejectUnauthorized: false };
  } else {
    if (isLocalOrDockerHost(url.hostname)) {
      poolConfig.ssl = false;
    } else {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  }

  return poolConfig;
}

function getDbInstance(): Kysely<Database> {
  if (!_db) {
    _db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new Pool(getPoolConfig()),
      }),
    });
  }
  return _db;
}

/**
 * Lazy proxy: accessing any property on `db` triggers connection creation.
 * Importing `db` alone has zero side effects.
 */
export const db: Kysely<Database> = new Proxy({} as Kysely<Database>, {
  get(_target, prop, receiver) {
    const instance = getDbInstance();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Tear down the connection pool. Call on shutdown.
 */
export async function closeDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}
