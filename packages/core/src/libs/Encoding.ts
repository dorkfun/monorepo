/**
 * Canonical JSON encoding for deterministic hashing.
 * Keys are sorted alphabetically, no whitespace, no undefined values.
 */
export function canonicalEncode(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((sorted, key) => {
          if (value[key] !== undefined) {
            sorted[key] = value[key];
          }
          return sorted;
        }, {});
    }
    return value;
  });
}
