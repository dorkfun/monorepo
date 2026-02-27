import React from "react";
import { Box, Text } from "ink";
import { formatAddress } from "@dorkfun/core";
import { colors } from "../theme.js";

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp?: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  maxLines?: number;
  players?: string[];
}

export function ChatPanel({ messages, maxLines = 8, players }: ChatPanelProps) {
  const visible = messages.slice(-maxLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={colors.border}
      paddingX={1}
      width={30}
    >
      <Text color={colors.dimmed} bold>
        CHAT
      </Text>
      {visible.length === 0 ? (
        <Text color={colors.dimmed}>No messages yet</Text>
      ) : (
        visible.map((msg, i) => {
          const senderColor = players
            ? msg.sender === players[0]
              ? colors.cyan
              : msg.sender === players[1]
                ? colors.secondary
                : colors.dimmed
            : colors.secondary;
          return (
            <Text key={i}>
              <Text color={senderColor}>{msg.sender.startsWith("0x") ? formatAddress(msg.sender) : msg.sender}: </Text>
              <Text color={colors.white}>{msg.message}</Text>
            </Text>
          );
        })
      )}
    </Box>
  );
}
