import React from "react";
import { Box, Text } from "ink";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";
import { useEnsNames } from "../hooks/useEnsNames.js";

interface StatusBarProps {
  playerAddress: string;
  serverUrl: string;
  connected: boolean;
}

export function StatusBar({ playerAddress, serverUrl, connected }: StatusBarProps) {
  const ensNames = useEnsNames(playerAddress ? [playerAddress] : []);
  const shortAddr = playerAddress
    ? formatAddress(playerAddress, ensNames[playerAddress])
    : "Not connected";

  return (
    <Box
      borderStyle="single"
      borderColor={colors.border}
      paddingX={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <Text color={colors.primary} bold>
        DORK.FUN v0.1.0
      </Text>
      <Text color={colors.dimmed}>
        {connected ? "●" : "○"} {shortAddr} | {serverUrl}
      </Text>
    </Box>
  );
}
