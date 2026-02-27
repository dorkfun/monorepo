import { useState, useEffect } from "react";

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s ago`
      : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m ago`
    : `${hours}h ago`;
}

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
