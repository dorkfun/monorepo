import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { formatEther, parseEther } from "ethers";
import { colors } from "../theme.js";
import * as api from "../../transport/httpClient.js";

interface LobbyProps {
  defaultStakeWei?: string;
  onPlay: (gameId: string, stakeWei?: string) => void;
  onWatch: () => void;
  onLeaderboard: () => void;
}

interface GameSummary {
  id: string;
  name: string;
  description: string;
  stakingEnabled?: boolean;
}

export function Lobby({ defaultStakeWei, onPlay, onWatch, onLeaderboard }: LobbyProps) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Stake input sub-state
  const [stakeMode, setStakeMode] = useState(false);
  const [stakeGameId, setStakeGameId] = useState("");
  const [stakeInput, setStakeInput] = useState(
    defaultStakeWei ? formatEther(defaultStakeWei) : ""
  );

  // Stake confirmation sub-state
  const [confirmMode, setConfirmMode] = useState(false);
  const [pendingStakeWei, setPendingStakeWei] = useState<string | undefined>(undefined);

  useEffect(() => {
    api
      .listGames()
      .then((res) => setGames(res.games))
      .catch((err: Error) => setError(err.message));
  }, []);

  const handleWatch = async () => {
    setStatusMsg("");
    try {
      const result = await api.listMatches();
      if (result.matches.length === 0) {
        setStatusMsg("No active games to watch right now.");
        return;
      }
      onWatch();
    } catch (err: any) {
      setStatusMsg(`Failed to fetch matches: ${err.message}`);
    }
  };

  const handleSelectGame = (gameId: string) => {
    setStakeGameId(gameId);
    setStakeMode(true);
    setStatusMsg("");
  };

  const handleConfirmStake = () => {
    const trimmed = stakeInput.trim();
    if (!trimmed || trimmed === "0") {
      onPlay(stakeGameId);
      return;
    }

    // Check if staking is available for this game
    const game = games.find((g) => g.id === stakeGameId);
    if (game && game.stakingEnabled === false) {
      setStatusMsg("Staking is not available for this game (settlement not configured on server).");
      return;
    }

    try {
      const wei = parseEther(trimmed).toString();
      setPendingStakeWei(wei);
      setConfirmMode(true);
    } catch {
      setStatusMsg(`Invalid amount: "${trimmed}". Enter a decimal ETH value (e.g. 0.01)`);
    }
  };

  const handleFinalConfirm = () => {
    onPlay(stakeGameId, pendingStakeWei);
  };

  const handleCancelConfirm = () => {
    setConfirmMode(false);
    setPendingStakeWei(undefined);
  };

  const options = [
    ...games.map((g) => ({ label: `Play ${g.name}`, action: () => handleSelectGame(g.id) })),
    { label: "Watch live games", action: handleWatch },
    { label: "Leaderboard", action: () => onLeaderboard() },
  ];

  useInput((input, key) => {
    if (confirmMode) {
      if (input === "y" || input === "Y") {
        handleFinalConfirm();
      } else if (input === "n" || input === "N" || key.escape) {
        handleCancelConfirm();
      }
      return;
    }

    if (stakeMode) {
      if (key.return) {
        handleConfirmStake();
      } else if (key.escape) {
        setStakeMode(false);
        setStakeInput(defaultStakeWei ? formatEther(defaultStakeWei) : "");
        setStatusMsg("");
      } else if (key.backspace || key.delete) {
        setStakeInput((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setStakeInput((prev) => prev + input);
      }
      return;
    }

    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
    if (key.return) options[selected]?.action();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={colors.primary} bold>
        {"═══ LOBBY ═══"}
      </Text>
      <Text color={colors.dimmed}>{""}</Text>

      {confirmMode && pendingStakeWei ? (
        <Box flexDirection="column">
          <Text color={colors.warning} bold>
            Confirm Stake
          </Text>
          <Text>{""}</Text>
          <Text color={colors.white}>
            You are about to enter matchmaking with a stake of {formatEther(pendingStakeWei)} ETH
          </Text>
          <Text color={colors.error}>
            If you lose the game, you will lose {formatEther(pendingStakeWei)} ETH
          </Text>
          <Text>{""}</Text>
          <Text color={colors.primary} bold>
            Press [Y] to confirm, [N] to go back
          </Text>
        </Box>
      ) : stakeMode ? (
        <Box flexDirection="column">
          <Text color={colors.white}>Stake for {stakeGameId}:</Text>
          <Text color={colors.dimmed}>Enter ETH amount (or press Enter for free play)</Text>
          <Text>{""}</Text>
          <Box>
            <Text color={colors.secondary}>{"> "}</Text>
            <Text color={colors.text}>{stakeInput || "0"}</Text>
            <Text color={colors.dimmed}> ETH</Text>
            <Text color={colors.dimmed}>{"_"}</Text>
          </Box>
          <Text>{""}</Text>
          <Text color={colors.dimmed}>Enter to confirm, Esc to go back</Text>
        </Box>
      ) : error ? (
        <Text color={colors.error}>Error: {error}</Text>
      ) : (
        options.map((opt, i) => (
          <Text key={i} color={i === selected ? colors.primary : colors.dimmed}>
            {i === selected ? " ▸ " : "   "}
            {opt.label}
          </Text>
        ))
      )}

      {statusMsg && (
        <>
          <Text color={colors.dimmed}>{""}</Text>
          <Text color={colors.warning}>  {statusMsg}</Text>
        </>
      )}

      {!stakeMode && (
        <>
          <Text color={colors.dimmed}>{""}</Text>
          <Text color={colors.dimmed}>Use ↑↓ to select, Enter to confirm, q to quit</Text>
        </>
      )}
    </Box>
  );
}
