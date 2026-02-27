/**
 * Format an Ethereum address for display.
 * Shows ENS name if available, otherwise truncates the address.
 */
export function formatAddress(
  address: string,
  ensName?: string | null,
  style: "short" | "medium" = "short"
): string {
  if (ensName) return ensName;
  if (style === "medium") return `${address.slice(0, 10)}...`;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
