import { useEffect, useState, useRef } from "react";
import { resolveEns } from "../utils/api";

/**
 * React hook that resolves ENS names for a list of addresses via the server API.
 * Returns a map from address to ENS name (or null).
 */
export function useEnsNames(addresses: string[]): Record<string, string | null> {
  const [names, setNames] = useState<Record<string, string | null>>({});
  const resolved = useRef(new Set<string>());

  useEffect(() => {
    const unresolved = addresses.filter(
      (a) => a && !resolved.current.has(a)
    );
    if (unresolved.length === 0) return;

    resolveEns(unresolved)
      .then((result) => {
        for (const addr of unresolved) {
          resolved.current.add(addr);
        }
        setNames((prev) => ({ ...prev, ...result }));
      })
      .catch(() => {});
  }, [addresses.join(",")]);

  return names;
}
