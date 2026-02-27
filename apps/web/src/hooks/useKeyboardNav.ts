import { useEffect, useCallback, useState } from "react";

interface UseKeyboardNavOptions {
  itemCount: number;
  tabCount?: number;
  onTabChange?: (tabIndex: number) => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useKeyboardNav({
  itemCount,
  tabCount = 1,
  onTabChange,
  onEscape,
  enabled = true,
}: UseKeyboardNavOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState(0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(0, i - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(Math.max(0, itemCount - 1), i + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setActiveTab((t) => {
            const next = (t - 1 + tabCount) % tabCount;
            onTabChange?.(next);
            return next;
          });
          setSelectedIndex(0);
          break;
        case "ArrowRight":
        case "Tab":
          e.preventDefault();
          setActiveTab((t) => {
            const next = (t + 1) % tabCount;
            onTabChange?.(next);
            return next;
          });
          setSelectedIndex(0);
          break;
        case "Escape":
          onEscape?.();
          break;
      }
    },
    [enabled, itemCount, tabCount, onTabChange, onEscape]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { selectedIndex, setSelectedIndex, activeTab, setActiveTab };
}
