import { keccak256, toUtf8Bytes } from "ethers";
import { canonicalEncode } from "./Encoding";

/**
 * Hash an object using keccak256 after canonical encoding.
 */
export function hashState(state: unknown): string {
  const encoded = canonicalEncode(state);
  return keccak256(toUtf8Bytes(encoded));
}

/**
 * Compute the hash chain link: H(prevHash || currentData).
 */
export function chainHash(prevHash: string, data: unknown): string {
  const encoded = canonicalEncode(data);
  const combined = prevHash + encoded;
  return keccak256(toUtf8Bytes(combined));
}
