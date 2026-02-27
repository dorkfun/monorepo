import React from "react";
import { Box, Text } from "ink";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";

interface PlayerInfoProps {
  address: string;
  ensName?: string | null;
  label: string;
  playerIndex: number;
  isCurrentTurn: boolean;
  isYou?: boolean;
}

export function PlayerInfo({ address, ensName, label, playerIndex, isCurrentTurn, isYou }: PlayerInfoProps) {
  const display = formatAddress(address, ensName);
  const labelColor = playerIndex === 0 ? colors.cyan : colors.secondary;

  return (
    <Box flexDirection="row" gap={1}>
      <Text color={labelColor} bold>
        [{label}]
      </Text>
      <Text color={isCurrentTurn ? colors.primary : colors.dimmed}>
        {display}
        {isYou ? " (you)" : ""}
        {isCurrentTurn ? " ◀" : ""}
      </Text>
    </Box>
  );
}
