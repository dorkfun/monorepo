import { useState, useEffect } from "react";
import * as api from "../../transport/httpClient.js";

const cache = new Map<string, string | null>();

/**
 * React hook that resolves ENS names for a list of addresses via the server API.
 * Caches results in memory across hook instances.
 */
export function useEnsNames(addresses: string[]): Record<string, string | null> {
  const [names, setNames] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    for (const a of addresses) {
      if (cache.has(a)) initial[a] = cache.get(a)!;
    }
    return initial;
  });

  useEffect(() => {
    const unresolved = addresses.filter((a) => a && !cache.has(a));
    if (unresolved.length === 0) return;

    api
      .resolveEns(unresolved)
      .then((result) => {
        for (const [addr, name] of Object.entries(result)) {
          cache.set(addr, name);
        }
        setNames((prev) => ({ ...prev, ...result }));
      })
      .catch(() => {});
  }, [addresses.join(",")]);

  return names;
}
