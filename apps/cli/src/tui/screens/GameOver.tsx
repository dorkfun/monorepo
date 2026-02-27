import React from "react";
import { Box, Text, useInput } from "ink";
import { formatEther } from "ethers";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";
import { useEnsNames } from "../hooks/useEnsNames.js";

interface GameOverProps {
  winner: string | null;
  reason: string;
  playerId: string;
  stakeWei?: string;
  onRematch: () => void;
  onQuit: () => void;
}

export function GameOver({ winner, reason, playerId, stakeWei, onRematch, onQuit }: GameOverProps) {
  const ensNames = useEnsNames(winner ? [winner] : []);
  const isWinner = winner === playerId;
  const isDraw = winner === null;
  const isStaked = stakeWei && stakeWei !== "0";
  const stakeDisplay = isStaked ? formatEther(stakeWei) : null;

  useInput((input) => {
    if (input === "r") onRematch();
    if (input === "q") onQuit();
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} alignItems="center">
      <Text color={colors.primary} bold>
        {"═══════════════════"}
      </Text>
      <Text color={colors.primary} bold>
        {"    GAME OVER    "}
      </Text>
      <Text color={colors.primary} bold>
        {"═══════════════════"}
      </Text>

      <Text>{""}</Text>

      {isDraw ? (
        <Text color={colors.secondary} bold>
          DRAW - {reason}
        </Text>
      ) : isWinner ? (
        <Text color={colors.primary} bold>
          YOU WIN! 🎉
        </Text>
      ) : (
        <Text color={colors.error} bold>
          YOU LOSE
        </Text>
      )}

      {isStaked && (
        <>
          <Text>{""}</Text>
          {isDraw ? (
            <Text color={colors.secondary}>Stake returned: {stakeDisplay} ETH</Text>
          ) : isWinner ? (
            <Text color={colors.primary}>Won: +{stakeDisplay} ETH</Text>
          ) : (
            <Text color={colors.error}>Lost: -{stakeDisplay} ETH</Text>
          )}
        </>
      )}

      <Text>{""}</Text>

      {winner && (
        <Text color={colors.dimmed}>
          Winner: {formatAddress(winner, ensNames[winner], "medium")}
        </Text>
      )}
      <Text color={colors.dimmed}>Reason: {reason}</Text>

      <Text>{""}</Text>
      <Text color={colors.dimmed}>[R] Rematch  [Q] Quit to lobby</Text>
    </Box>
  );
}
