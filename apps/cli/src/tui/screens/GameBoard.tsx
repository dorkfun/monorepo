import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { formatEther } from "ethers";
import Spinner from "ink-spinner";
import { WsMessage, Observation, formatRelativeTime } from "@dorkfun/core";
import { getGameUI } from "@dorkfun/game-ui";
import { colors } from "../theme.js";
import { ChatPanel, ChatMessage } from "../components/ChatPanel.js";
import { ColoredBoard } from "../components/ColoredBoard.js";
import { PlayerInfo } from "../components/PlayerInfo.js";
import { useEnsNames } from "../hooks/useEnsNames.js";
import { GameWebSocket } from "../../transport/wsClient.js";
import { sendEscrowDeposit } from "../../wallet/signer.js";

interface GameBoardProps {
  matchId: string;
  wsToken: string;
  playerId: string;
  gameId: string;
  stakeWei?: string;
  onGameOver: (winner: string | null, reason: string) => void;
}

type InputMode = "game" | "chat";
type DepositPhase = "none" | "confirm" | "depositing" | "waiting" | "confirmed";

export function GameBoard({ matchId, wsToken, playerId, gameId, stakeWei, onGameOver }: GameBoardProps) {
  const [publicData, setPublicData] = useState<Record<string, unknown>>({});
  const [currentPlayer, setCurrentPlayer] = useState("");
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [players, setPlayers] = useState<string[]>([]);
  const ensNames = useEnsNames(players);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "disconnected">("connecting");
  const [gameReady, setGameReady] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("game");
  const [inputBuffer, setInputBuffer] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [forfeitConfirm, setForfeitConfirm] = useState(false);
  const [lastMoveAt, setLastMoveAt] = useState<number | null>(null);
  const [lastMoveAgo, setLastMoveAgo] = useState("");
  const [wsRef] = useState(() => new GameWebSocket());

  // Deposit state
  const [depositPhase, setDepositPhase] = useState<DepositPhase>("none");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [escrowPayload, setEscrowPayload] = useState<{
    escrowAddress: string;
    stakeWei: string;
    matchIdBytes32: string;
  } | null>(null);
  const depositInitiated = useRef(false);

  const ui = getGameUI(gameId);

  // Ref to avoid stale closures in the sync interval
  const isMyTurnRef = useRef(false);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

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
        await wsRef.connect(matchId);
        setConnectionStatus("connected");
        wsRef.sendHello(wsToken, playerId);

        wsRef.on("GAME_STATE", (msg: WsMessage) => {
          const payload = msg.payload as any;
          if (payload.observation) {
            const obs = payload.observation as Observation;
            if (obs.publicData) setPublicData(obs.publicData);
            setCurrentPlayer(obs.currentPlayer);
            setPlayers(obs.players);
            setGameReady(true);
          }
          if (payload.yourTurn !== undefined) {
            setIsMyTurn(payload.yourTurn);
          }
          if (payload.lastMoveAt) setLastMoveAt(payload.lastMoveAt);
          if (payload.event === "player_disconnected") {
            setChatMessages((prev) => [...prev, {
              sender: "system",
              message: payload.message,
              timestamp: Date.now(),
            }]);
          }
        });

        wsRef.on("STEP_RESULT", (msg: WsMessage) => {
          const payload = msg.payload as any;
          if (payload.observation?.publicData) {
            setPublicData(payload.observation.publicData);
          }
          setLastMoveAt(Date.now());
        });

        wsRef.on("GAME_OVER", (msg: WsMessage) => {
          const payload = msg.payload as { winner: string | null; reason: string };
          onGameOver(payload.winner, payload.reason);
        });

        wsRef.on("CHAT", (msg: WsMessage) => {
          const payload = msg.payload as ChatMessage;
          setChatMessages((prev) => [...prev, payload]);
        });

        wsRef.on("ERROR", (msg: WsMessage) => {
          setError((msg.payload as { error: string }).error);
          setIsMyTurn(true);
        });

        // Handle deposit gating for staked matches - show confirmation first
        wsRef.on("DEPOSIT_REQUIRED", (msg: WsMessage) => {
          const payload = msg.payload as {
            escrowAddress: string;
            stakeWei: string;
            matchIdBytes32: string;
          };
          setEscrowPayload(payload);
          setDepositPhase("confirm");
        });

        wsRef.on("DEPOSITS_CONFIRMED", () => {
          setDepositPhase("confirmed");
        });

        wsRef.on("SYNC_RESPONSE", (msg: WsMessage) => {
          const payload = msg.payload as {
            yourTurn: boolean;
            currentPlayer: string;
            matchStatus: string;
            lastMoveAt?: number;
          };
          if (payload.matchStatus === "completed") return;
          if (payload.lastMoveAt) setLastMoveAt(payload.lastMoveAt);

          setIsMyTurn((current) => {
            if (current !== payload.yourTurn) {
              setCurrentPlayer(payload.currentPlayer);
              if (payload.yourTurn) setError("");
              return payload.yourTurn;
            }
            return current;
          });
        });

        wsRef.on("reconnecting", () => {
          setConnectionStatus("reconnecting");
        });

        wsRef.on("close", () => {
          setConnectionStatus("disconnected");
        });
      } catch (err: any) {
        setError(`Connection failed: ${err.message}`);
        setConnectionStatus("disconnected");
      }
    };

    connect();

    return () => wsRef.close();
  }, [matchId, wsToken, playerId]);

  // Periodic state sync to recover from stuck turn states
  useEffect(() => {
    if (!gameReady || connectionStatus !== "connected") return;

    const syncIntervalId = setInterval(() => {
      if (wsRef.isConnected) {
        wsRef.sendSyncRequest(matchId, isMyTurnRef.current);
      }
    }, 8000);

    return () => clearInterval(syncIntervalId);
  }, [gameReady, connectionStatus, matchId]);

  const handleSubmitMove = useCallback(() => {
    if (!isMyTurn || !ui || !inputBuffer.trim()) return;

    const action = ui.parseInput(inputBuffer.trim(), publicData);
    if (action) {
      wsRef.sendAction(matchId, action);
      setIsMyTurn(false);
      setError("");
      setInputBuffer("");
    } else {
      setError("Invalid move. " + ui.inputHint);
      setInputBuffer("");
    }
  }, [isMyTurn, inputBuffer, publicData, matchId, ui]);

  const handleSendChat = useCallback(() => {
    if (chatInput.trim()) {
      wsRef.sendChat(matchId, chatInput.trim());
      setChatInput("");
    }
    setInputMode("game");
  }, [chatInput, matchId]);

  const handleDepositConfirm = useCallback(() => {
    if (!escrowPayload || depositInitiated.current) return;
    depositInitiated.current = true;

    setDepositPhase("depositing");
    sendEscrowDeposit({
      address: escrowPayload.escrowAddress,
      stakeWei: escrowPayload.stakeWei,
      matchIdBytes32: escrowPayload.matchIdBytes32,
    })
      .then((txHash) => {
        setDepositTxHash(txHash);
        setDepositPhase("waiting");
      })
      .catch((err: Error) => {
        setError(`Deposit failed: ${err.message}`);
        setDepositPhase("none");
        depositInitiated.current = false;
      });
  }, [escrowPayload]);

  const handleDepositDecline = useCallback(() => {
    wsRef.close();
    onGameOver(null, "Deposit declined");
  }, [onGameOver]);

  useInput((input, key) => {
    // Forfeit confirmation input
    if (forfeitConfirm) {
      if (input === "y" || input === "Y") {
        wsRef.sendForfeit(matchId);
        setForfeitConfirm(false);
      } else {
        setForfeitConfirm(false);
      }
      return;
    }

    // Deposit confirmation input
    if (depositPhase === "confirm") {
      if (input === "y" || input === "Y") {
        handleDepositConfirm();
      } else if (input === "n" || input === "N") {
        handleDepositDecline();
      }
      return;
    }

    if (inputMode === "chat") {
      if (key.return) {
        handleSendChat();
      } else if (key.escape) {
        setChatInput("");
        setInputMode("game");
      } else if (key.backspace || key.delete) {
        setChatInput((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setChatInput((prev) => prev + input);
      }
      return;
    }

    // Game mode
    if (input === "/" && !inputBuffer) {
      setInputMode("chat");
      return;
    }

    if (key.return) {
      handleSubmitMove();
      return;
    }

    if (key.escape) {
      if (!inputBuffer && !error) {
        setForfeitConfirm(true);
      } else {
        setInputBuffer("");
        setError("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInputBuffer((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setInputBuffer((prev) => prev + input);
      if (error) setError("");
    }
  });

  // Deposit confirmation UI - user must explicitly approve before funds leave wallet
  if (depositPhase === "confirm") {
    const stakeDisplay = escrowPayload ? formatEther(escrowPayload.stakeWei) : (stakeWei ? formatEther(stakeWei) : "?");
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={colors.primary} bold>
          Match: {matchId.slice(0, 8)} - Stake Deposit Required
        </Text>
        <Text>{""}</Text>
        <Text color={colors.warning} bold>
          This match requires a stake of {stakeDisplay} ETH
        </Text>
        <Text>{""}</Text>
        <Text color={colors.white}>
          Your stake will be deposited to the on-chain escrow contract.
        </Text>
        <Text color={colors.error}>
          If you lose, you will lose your stake.
        </Text>
        <Text color={colors.white}>
          If you win, you receive your stake plus your opponent{"'"}s.
        </Text>
        <Text>{""}</Text>
        <Text color={colors.primary} bold>
          Press [Y] to deposit and play, [N] to decline and forfeit
        </Text>
      </Box>
    );
  }

  // Deposit phase UI (depositing / waiting for opponent)
  if (depositPhase !== "none" && depositPhase !== "confirmed") {
    const stakeDisplay = stakeWei ? formatEther(stakeWei) : "?";
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={colors.primary} bold>
          Match: {matchId.slice(0, 8)} - Escrow Deposit
        </Text>
        <Text>{""}</Text>

        {depositPhase === "depositing" && (
          <Box>
            <Text color={colors.secondary}>
              <Spinner type="dots" />
            </Text>
            <Text color={colors.white}> Depositing {stakeDisplay} ETH to escrow...</Text>
          </Box>
        )}

        {depositPhase === "waiting" && (
          <Box flexDirection="column">
            <Text color={colors.primary}>Deposit confirmed on-chain!</Text>
            <Text color={colors.dimmed}>TX: {depositTxHash.slice(0, 16)}...</Text>
            <Text>{""}</Text>
            <Box>
              <Text color={colors.secondary}>
                <Spinner type="dots" />
              </Text>
              <Text color={colors.white}> Waiting for opponent deposit...</Text>
            </Box>
          </Box>
        )}

        {error && (
          <>
            <Text>{""}</Text>
            <Text color={colors.error}>{error}</Text>
          </>
        )}

        <Text>{""}</Text>
        <Text color={colors.dimmed}>Stake: {stakeDisplay} ETH</Text>
      </Box>
    );
  }

  const myLabel = gameReady ? (ui?.getPlayerLabel(playerId, publicData) || "?") : "?";
  const boardHtml = gameReady ? (ui?.renderBoard(publicData) || `[No renderer for ${gameId}]`) : "Waiting for game state...";
  const statusStr = gameReady ? ui?.renderStatus(publicData) : null;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={colors.primary} bold>
          Match: {matchId.slice(0, 8)}
          {stakeWei ? ` [${formatEther(stakeWei)} ETH]` : ""}
        </Text>
        <Box>
          {connectionStatus === "reconnecting" && (
            <Text color={colors.warning}>Reconnecting...</Text>
          )}
          {connectionStatus === "disconnected" && (
            <Text color={colors.error}>Disconnected</Text>
          )}
          <Text color={colors.dimmed}> You: {myLabel}</Text>
        </Box>
      </Box>

      <Text>{""}</Text>

      <Box flexDirection="row">
        <Box flexDirection="column" marginRight={2}>
          {players.map((p, i) => (
            <PlayerInfo
              key={p}
              address={p}
              ensName={ensNames[p]}
              label={ui?.getPlayerLabel(p, publicData) || "?"}
              playerIndex={i}
              isCurrentTurn={p === currentPlayer}
              isYou={p === playerId}
            />
          ))}

          <Text>{""}</Text>

          <ColoredBoard html={boardHtml} />

          {statusStr && (
            <Text color={colors.warning} bold>{statusStr}</Text>
          )}

          {lastMoveAgo && (
            <Text color={colors.dimmed}>last move: {lastMoveAgo}</Text>
          )}

          <Text>{""}</Text>

          {forfeitConfirm && (
            <Text color={colors.warning} bold>
              Forfeit this match? [y] yes  [n] cancel
            </Text>
          )}

          {error && <Text color={colors.error}>{error}</Text>}
          {isMyTurn ? (
            <Box flexDirection="column">
              <Text color={colors.primary} bold>
                YOUR TURN - {ui?.inputHint || "Enter your move"}
              </Text>
              <Box>
                <Text color={colors.secondary}>{"> "}</Text>
                <Text color={colors.text}>{inputBuffer}</Text>
                <Text color={colors.dimmed}>{"_"}</Text>
              </Box>
            </Box>
          ) : !error ? (
            <Text color={colors.dimmed}>Waiting for opponent...</Text>
          ) : null}

          <Text color={colors.dimmed}>
            {inputMode === "game" ? "[/] chat  [esc] forfeit" : ""}
          </Text>
        </Box>

        <Box flexDirection="column">
          <ChatPanel messages={chatMessages} players={players} />
          {inputMode === "chat" && (
            <Box>
              <Text color={colors.secondary}>{"> "}</Text>
              <Text color={colors.text}>{chatInput}</Text>
              <Text color={colors.dimmed}>{"_"}</Text>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
