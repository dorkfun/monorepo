export default {
  grpcPort: parseInt(process.env.GRPC_PORT || "50051", 10),
  port: parseInt(process.env.PORT || "8080", 10),
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:dorkfun@localhost:5433/dorkfun",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  disputeWindowMs: parseInt(process.env.DISPUTE_WINDOW_MS || "300000", 10), // 5 minutes
  matchTimeoutMs: parseInt(process.env.MATCH_TIMEOUT_MS || "300000", 10), // 5 min per move
  staleMatchTimeoutMs: parseInt(process.env.STALE_MATCH_TIMEOUT_MS || "3600000", 10), // 60 minutes
  adminSecret: process.env.ADMIN_SECRET || "",

  // On-chain settlement (optional — disabled if no RPC_URL set)
  rpcUrl: process.env.RPC_URL || "",
  serverPrivateKey: process.env.SERVER_PRIVATE_KEY || "",
  settlementAddress: process.env.SETTLEMENT_ADDRESS || "",
  escrowAddress: process.env.ESCROW_ADDRESS || "",

  /** True when all on-chain config is present (staking + settlement enabled) */
  get settlementEnabled(): boolean {
    return !!(this.rpcUrl && this.serverPrivateKey && this.settlementAddress && this.escrowAddress);
  },
};
