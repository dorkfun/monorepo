export * from "./types/game";
export * from "./types/match";
export * from "./types/protocol";
export * from "./libs/Encoding";
export * from "./libs/Crypto";
export { TranscriptBuilder } from "./libs/TranscriptBuilder";

// Database layer
export * from "./database";

// Validation
export {
  isEvmAddress,
  buildAuthMessage,
  verifySignature,
  validateAuth,
  AUTH_MESSAGE_MAX_AGE_MS,
} from "./validation";

// ENS
export { EnsResolver } from "./libs/EnsResolver";
export { formatAddress } from "./libs/formatAddress";
export { formatRelativeTime } from "./libs/relativeTime";

// Elo rating
export { calculateElo } from "./elo";
export type { EloResult, MatchOutcome } from "./elo";
