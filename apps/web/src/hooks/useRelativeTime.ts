import { useState, useEffect } from "react";
import { formatRelativeTime } from "@dorkfun/core";

/**
 * Returns a live-updating relative time string for a given timestamp.
 * Updates every second. Returns "" when timestamp is null.
 */
export function useRelativeTime(timestamp: number | null): string {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (timestamp === null) {
      setDisplay("");
      return;
    }

    setDisplay(formatRelativeTime(timestamp));

    const interval = setInterval(() => {
      setDisplay(formatRelativeTime(timestamp));
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return display;
}
