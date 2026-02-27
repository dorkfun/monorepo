export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    "postgres://postgres:dorkfun@localhost:5433/dorkfun"
  );
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}
