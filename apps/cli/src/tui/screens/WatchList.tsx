import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { formatEther } from "ethers";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";
import { useEnsNames } from "../hooks/useEnsNames.js";
import * as api from "../../transport/httpClient.js";

interface MatchSummary {
  matchId: string;
  gameId: string;
  status: string;
  players: string[];
  stakeWei?: string | null;
  createdAt: string;
}

interface WatchListProps {
  onSelect: (matchId: string, gameId: string) => void;
  onBack: () => void;
}

export function WatchList({ onSelect, onBack }: WatchListProps) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listMatches()
      .then((res) => {
        setMatches(res.matches);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (matches.length === 0) return;
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(matches.length - 1, s + 1));
    if (key.return) {
      const m = matches[selected];
      if (m) onSelect(m.matchId, m.gameId);
    }
  });

  const allPlayers = matches.flatMap((m) => m.players);
  const ensNames = useEnsNames(allPlayers);
  const formatPlayer = (addr: string) => formatAddress(addr, ensNames[addr]);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={colors.primary} bold>
        {"═══ LIVE GAMES ═══"}
      </Text>
      <Text color={colors.dimmed}>{""}</Text>

      {loading && <Text color={colors.dimmed}>Loading matches...</Text>}

      {error && <Text color={colors.error}>Error: {error}</Text>}

      {!loading && !error && matches.length === 0 && (
        <Text color={colors.warning}>No active games to watch right now.</Text>
      )}

      {matches.map((m, i) => (
        <Box key={m.matchId} flexDirection="row">
          <Text color={i === selected ? colors.primary : colors.dimmed}>
            {i === selected ? " ▸ " : "   "}
          </Text>
          <Text color={i === selected ? colors.primary : colors.text}>
            {m.gameId}
          </Text>
          <Text color={colors.dimmed}>
            {"  "}
            {m.players.map(formatPlayer).join(" vs ")}
          </Text>
          <Text color={colors.dimmed}>
            {"  "}[{m.status}]
          </Text>
          {m.stakeWei && m.stakeWei !== "0" && (
            <Text color={colors.warning}>
              {"  "}{formatEther(m.stakeWei)} ETH
            </Text>
          )}
        </Box>
      ))}

      <Text color={colors.dimmed}>{""}</Text>
      <Text color={colors.dimmed}>
        {matches.length > 0
          ? "Use ↑↓ to select, Enter to watch, Esc to go back"
          : "Press Esc to go back"}
      </Text>
    </Box>
  );
}
