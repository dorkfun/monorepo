import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { WsMessage, Observation, formatAddress, formatRelativeTime } from "@dorkfun/core";
import { getGameUI } from "@dorkfun/game-ui";
import { colors } from "../theme.js";
import { ColoredBoard } from "../components/ColoredBoard.js";
import { useEnsNames } from "../hooks/useEnsNames.js";
import { GameWebSocket } from "../../transport/wsClient.js";

interface WatchGameProps {
  matchId: string;
  gameId: string;
  onBack: () => void;
}

export function WatchGame({ matchId, gameId, onBack }: WatchGameProps) {
  const [publicData, setPublicData] = useState<Record<string, unknown>>({});
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [players, setPlayers] = useState<string[]>([]);
  const [turnNumber, setTurnNumber] = useState(0);
  const [status, setStatus] = useState<string>("connecting");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [lastMoveAt, setLastMoveAt] = useState<number | null>(null);
  const [lastMoveAgo, setLastMoveAgo] = useState("");
  const [wsRef] = useState(() => new GameWebSocket());

  const allAddresses = [...players, winner, currentPlayer].filter(Boolean) as string[];
  const ensNames = useEnsNames(allAddresses);

  const ui = getGameUI(gameId);
  const shortId = matchId.slice(0, 8);

  useEffect(() => {
    if (lastMoveAt === null) return;
    setLastMoveAgo(formatRelativeTime(lastMoveAt));
    const interval = setInterval(() => {
      setLastMoveAgo(formatRelativeTime(lastMoveAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastMoveAt]);

  useEffect(() => {
    const connect = async () => {
      try {
        await wsRef.connect(matchId, "spectate");
        setStatus("connected");

        wsRef.sendSpectateJoin(matchId, "spectator");

        wsRef.on("SPECTATE_STATE", (msg: WsMessage) => {
          const payload = msg.payload as any;
          if (payload.observation) {
            applyObservation(payload.observation);
          }
          if (payload.players) setPlayers(payload.players);
          if (payload.status) setStatus(payload.status);
          if (payload.lastMoveAt) setLastMoveAt(payload.lastMoveAt);
        });

        wsRef.on("STEP_RESULT", (msg: WsMessage) => {
          const payload = msg.payload as any;
          if (payload.observation) {
            applyObservation(payload.observation);
          }
          if (payload.nextPlayer) {
            setCurrentPlayer(payload.nextPlayer);
          }
          setLastMoveAt(Date.now());
        });

        wsRef.on("GAME_STATE", (msg: WsMessage) => {
          const payload = msg.payload as any;
          if (payload.observation) {
            applyObservation(payload.observation);
          }
        });

        wsRef.on("GAME_OVER", (msg: WsMessage) => {
          const payload = msg.payload as { winner: string | null; reason: string; draw?: boolean };
          setGameOver(true);
          setWinner(payload.winner);
          setReason(payload.reason);
          setStatus("finished");
        });

        wsRef.on("close", () => {
          setStatus("disconnected");
        });

        wsRef.on("reconnecting", () => {
          setStatus("reconnecting");
        });
      } catch (err: any) {
        setError(`Connection failed: ${err.message}`);
        setStatus("disconnected");
      }
    };

    connect();
    return () => wsRef.close();
  }, [matchId]);

  function applyObservation(obs: Observation) {
    if (obs.publicData) setPublicData(obs.publicData);
    if (obs.currentPlayer) setCurrentPlayer(obs.currentPlayer);
    if (obs.players?.length) setPlayers(obs.players);
    if (obs.turnNumber !== undefined) setTurnNumber(obs.turnNumber);
  }

  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const boardHtml = ui?.renderBoard(publicData) || `[No renderer for ${gameId}]`;
  const statusStr = ui?.renderStatus(publicData);
  const turnDisplay = ui?.maxTurns ? `${turnNumber}/${ui.maxTurns}` : `${turnNumber}`;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text>
        <Text color={colors.primary}>{"$ "}</Text>
        <Text>watch {shortId}</Text>
      </Text>

      <Text>
        <Text color={colors.dimmed}>{"> game: "}</Text>
        <Text>{gameId}</Text>
      </Text>

      {players.length > 0 && ui && (
        <Text>
          <Text color={colors.dimmed}>{"> players: "}</Text>
          <Text color={colors.cyan}>
            {formatAddress(players[0], ensNames[players[0]], "medium")} ({ui.getPlayerLabel(players[0], publicData)})
          </Text>
          <Text color={colors.dimmed}>{" vs "}</Text>
          <Text color={colors.secondary}>
            {formatAddress(players[1], ensNames[players[1]], "medium")} ({ui.getPlayerLabel(players[1], publicData)})
          </Text>
        </Text>
      )}

      <Text>
        <Text color={colors.dimmed}>{"> move: "}</Text>
        <Text>{turnDisplay}</Text>
        {lastMoveAgo ? <Text color={colors.dimmed}>{` (${lastMoveAgo})`}</Text> : null}
      </Text>

      <Text>{""}</Text>

      {error ? (
        <Text color={colors.error}>{error}</Text>
      ) : (
        <Box flexDirection="column">
          <ColoredBoard html={boardHtml} />

          {statusStr && (
            <Text color={colors.warning} bold>{statusStr}</Text>
          )}

          <Text>{""}</Text>

          {gameOver ? (
            <Text>
              <Text color={colors.primary}>{"> "}</Text>
              <Text color={colors.secondary} bold>
                {"GAME OVER - "}
                {winner
                  ? `Winner: ${formatAddress(winner, ensNames[winner], "medium")} (${reason})`
                  : `Draw (${reason})`}
              </Text>
            </Text>
          ) : status === "connected" || status === "ACTIVE" ? (
            <Text>
              <Text color={colors.primary}>{"> "}</Text>
              <Text color={colors.dimmed}>
                {"waiting for "}
                {currentPlayer ? formatAddress(currentPlayer, ensNames[currentPlayer], "medium") : "..."}
                {"... "}
              </Text>
              <Text>{"█"}</Text>
            </Text>
          ) : (
            <Text color={colors.error}>{"connecting..."}</Text>
          )}
        </Box>
      )}

      <Text>{""}</Text>
      <Text color={colors.dimmed}>{"Press Esc to return to lobby"}</Text>
    </Box>
  );
}
