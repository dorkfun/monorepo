// Separate entry point for migration utilities (Node-only, imports `fs`).
// Usage: import { migrateToLatest } from "@dorkfun/core/migrate";
export { migrateToLatest } from "./database/migrate";
export type { MigrateOptions } from "./database/migrate";
