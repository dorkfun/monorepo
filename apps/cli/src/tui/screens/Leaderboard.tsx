import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";
import * as api from "../../transport/httpClient.js";

interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  ensName?: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  totalEarningsWei: string;
}

interface LeaderboardProps {
  onBack: () => void;
}

interface Tab {
  id: string;
  label: string;
}

type SortBy = "rating" | "earnings";

const PAGE_SIZE = 20;

export function Leaderboard({ onBack }: LeaderboardProps) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: "overall", label: "Overall" }]);
  const [activeTab, setActiveTab] = useState(0);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [selectedRow, setSelectedRow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("rating");

  // Fetch game list on mount to populate tabs
  useEffect(() => {
    api
      .listGames()
      .then((res) => {
        const gameTabs = (res.games || []).map((g: any) => ({
          id: g.id,
          label: g.name,
        }));
        setTabs([{ id: "overall", label: "Overall" }, ...gameTabs]);
      })
      .catch(() => {});
  }, []);

  // Fetch leaderboard data when tab, page, or sort changes
  useEffect(() => {
    setLoading(true);
    setError("");
    const currentTab = tabs[activeTab];
    if (!currentTab) return;

    const fetchFn =
      currentTab.id === "overall"
        ? api.getLeaderboard(PAGE_SIZE, page * PAGE_SIZE, sortBy)
        : api.getGameLeaderboard(currentTab.id, PAGE_SIZE, page * PAGE_SIZE, sortBy);

    fetchFn
      .then((res) => {
        setEntries(res.players || []);
        setTotal(res.total || 0);
        setSelectedRow(0);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [activeTab, page, tabs, sortBy]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    // Tab switching
    if (key.tab || key.rightArrow) {
      setActiveTab((t) => (t + 1) % tabs.length);
      setPage(0);
      return;
    }
    if (key.leftArrow) {
      setActiveTab((t) => (t - 1 + tabs.length) % tabs.length);
      setPage(0);
      return;
    }

    // Row navigation
    if (key.upArrow) setSelectedRow((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelectedRow((s) => Math.min(entries.length - 1, s + 1));

    // Pagination
    if (input === "n" && (page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
    if (input === "p" && page > 0) setPage((p) => p - 1);

    // Sort toggle
    if (input === "s") {
      setSortBy((s) => (s === "rating" ? "earnings" : "rating"));
      setPage(0);
    }
  });

  const formatWei = (wei: string) => {
    try {
      const eth = (Number(wei) / 1e18).toFixed(6);
      return eth.replace(/\.?0+$/, "");
    } catch {
      return "0";
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={colors.primary} bold>
        {"═══ LEADERBOARD ═══"}
      </Text>
      <Text>{""}</Text>

      {/* Tab bar */}
      <Box flexDirection="row" gap={2}>
        {tabs.map((tab, i) => (
          <Text
            key={tab.id}
            color={i === activeTab ? colors.primary : colors.dimmed}
            bold={i === activeTab}
          >
            {i === activeTab ? `[${tab.label}]` : ` ${tab.label} `}
          </Text>
        ))}
        <Text color={colors.dimmed}> | </Text>
        <Text
          color={sortBy === "rating" ? colors.primary : colors.dimmed}
          bold={sortBy === "rating"}
        >
          {sortBy === "rating" ? "[Rating]" : " Rating "}
        </Text>
        <Text
          color={sortBy === "earnings" ? colors.primary : colors.dimmed}
          bold={sortBy === "earnings"}
        >
          {sortBy === "earnings" ? "[Earnings]" : " Earnings "}
        </Text>
      </Box>
      <Text>{""}</Text>

      {/* Header row */}
      <Text color={colors.secondary} bold>
        {"     #  Player           Rating    W    D    L   GP   Earnings"}
      </Text>
      <Text color={colors.border}>
        {"   ─── ─────────────── ────── ──── ──── ──── ──── ──────────"}
      </Text>

      {loading && <Text color={colors.dimmed}>  Loading...</Text>}
      {error && <Text color={colors.error}>  Error: {error}</Text>}

      {!loading && !error && entries.length === 0 && (
        <Text color={colors.warning}>  No players ranked yet.</Text>
      )}

      {!loading &&
        !error &&
        entries.map((e, i) => {
          const earnings = e.totalEarningsWei !== "0" ? formatWei(e.totalEarningsWei) + " ETH" : "-";
          return (
            <Box key={e.address} flexDirection="row">
              <Text color={i === selectedRow ? colors.primary : colors.text}>
                {i === selectedRow ? " ▸ " : "   "}
                {String(e.rank).padStart(3)}  {(e.ensName || e.displayName || formatAddress(e.address)).padEnd(15)} {String(e.rating).padStart(6)}  {String(e.gamesWon).padStart(3)}  {String(e.gamesDrawn).padStart(3)}  {String(e.gamesLost).padStart(3)}  {String(e.gamesPlayed).padStart(3)}  {earnings.padStart(10)}
              </Text>
            </Box>
          );
        })}

      <Text>{""}</Text>
      <Text color={colors.dimmed}>
        {"  "}Page {page + 1}/{totalPages} | ←→/Tab: switch view | ↑↓: navigate | n/p: page | s: sort ({sortBy}) | Esc: back
      </Text>
    </Box>
  );
}
