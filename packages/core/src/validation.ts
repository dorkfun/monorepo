import { verifyMessage, getAddress } from "ethers";

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Returns true if `value` is a valid EVM address (0x followed by 40 hex chars).
 */
export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS_RE.test(value);
}

/** Maximum age of a signed authentication message (5 minutes). */
export const AUTH_MESSAGE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Build the canonical message that clients sign to prove ownership of an EVM address.
 * Both client and server must produce the same string for verification to succeed.
 */
export function buildAuthMessage(playerId: string, timestamp: number): string {
  return `dork.fun authentication for ${playerId} at ${timestamp}`;
}

/**
 * Verify that `signature` was produced by the private key controlling `claimedAddress`.
 * Uses ethers.verifyMessage (EIP-191 personal_sign) and compares checksummed addresses.
 */
export function verifySignature(
  claimedAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    const recovered = verifyMessage(message, signature);
    return getAddress(recovered) === getAddress(claimedAddress);
  } catch {
    return false;
  }
}

/**
 * Validate a full authentication payload: checks timestamp freshness and signature validity.
 * Returns true if the signature proves ownership of the playerId address and the
 * timestamp is within the acceptable window.
 */
export function validateAuth(
  playerId: string,
  signature: string,
  timestamp: number
): boolean {
  const now = Date.now();
  if (Math.abs(now - timestamp) > AUTH_MESSAGE_MAX_AGE_MS) {
    return false;
  }
  const message = buildAuthMessage(playerId, timestamp);
  return verifySignature(playerId, message, signature);
}
