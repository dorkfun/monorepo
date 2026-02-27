import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { formatEther } from "ethers";
import Spinner from "ink-spinner";
import { colors } from "../theme.js";
import * as api from "../../transport/httpClient.js";

interface MatchmakingProps {
  playerId: string;
  gameId: string;
  stakeWei?: string;
  onMatched: (matchId: string, wsToken: string, opponent: string) => void;
  onCancel: () => void;
}

export function Matchmaking({ playerId, gameId, stakeWei, onMatched, onCancel }: MatchmakingProps) {
  const [status, setStatus] = useState("Searching for opponent...");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let ticket = "";

    const poll = async () => {
      try {
        const result = await api.joinQueue(playerId, gameId, undefined, stakeWei);

        if (result.status === "matched") {
          if (!cancelled) {
            onMatched(result.matchId, result.wsToken, result.opponent);
          }
        } else {
          ticket = result.ticket;
          setStatus("In queue, waiting for opponent...");

          // Poll every 2 seconds, reusing the same ticket
          const interval = setInterval(async () => {
            if (cancelled) {
              clearInterval(interval);
              return;
            }
            try {
              const retry = await api.joinQueue(playerId, gameId, ticket, stakeWei);
              if (retry.status === "matched") {
                clearInterval(interval);
                if (!cancelled) {
                  onMatched(retry.matchId, retry.wsToken, retry.opponent);
                }
              }
            } catch {
              // Ignore poll errors
            }
          }, 2000);
        }
      } catch (err: any) {
        setError(err.message);
      }
    };

    poll();

    const timer = setInterval(() => {
      if (!cancelled) setElapsed((e) => e + 1);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (ticket) api.leaveQueue(ticket).catch(() => {});
    };
  }, [playerId, gameId, stakeWei]);

  const stakeDisplay = stakeWei ? `${formatEther(stakeWei)} ETH` : "free";

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color={colors.primary} bold>
        {"═══ MATCHMAKING ═══"}
      </Text>
      <Text>{""}</Text>

      {error ? (
        <Text color={colors.error}>Error: {error}</Text>
      ) : (
        <Box>
          <Text color={colors.secondary}>
            <Spinner type="dots" />
          </Text>
          <Text color={colors.white}> {status} ({elapsed}s)</Text>
        </Box>
      )}

      <Text>{""}</Text>
      <Text color={colors.dimmed}>Game: {gameId}</Text>
      {stakeWei && stakeWei !== "0" ? (
        <Text color={colors.warning} bold>Stake: {stakeDisplay}</Text>
      ) : (
        <Text color={colors.dimmed}>Stake: {stakeDisplay}</Text>
      )}
      {stakeWei && stakeWei !== "0" && (
        <Text color={colors.dimmed}>Only opponents with matching stake will be paired</Text>
      )}
      <Text color={colors.dimmed}>Press Ctrl+C to cancel</Text>
    </Box>
  );
}
