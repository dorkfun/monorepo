import { useState, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";

interface GameState {
  publicData: Record<string, unknown>;
  gameId: string;
  currentPlayer: string;
  players: string[];
  turnNumber: number;
  gameOver: boolean;
  winner: string | null;
  reason: string;
  lastMoveAt: number | null;
}

export function useGameState(matchId: string | null) {
  const wsUrl = matchId
    ? (() => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) {
          const url = new URL(apiUrl);
          return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws/spectate/${matchId}`;
        }
        return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/spectate/${matchId}`;
      })()
    : null;

  const { connected, on, send } = useWebSocket(wsUrl);
  const [state, setState] = useState<GameState>({
    publicData: {},
    gameId: "",
    currentPlayer: "",
    players: [],
    turnNumber: 0,
    gameOver: false,
    winner: null,
    reason: "",
    lastMoveAt: null,
  });

  useEffect(() => {
    if (!connected) return;

    // Join as spectator
    send({
      type: "SPECTATE_JOIN",
      matchId,
      payload: { displayName: "spectator-" + Math.random().toString(36).slice(2, 6) },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });

    const cleanups = [
      on("SPECTATE_STATE", (msg: any) => {
        const obs = msg.payload?.observation;
        if (obs?.publicData) {
          setState((prev) => ({
            ...prev,
            publicData: obs.publicData,
            gameId: msg.payload.gameId || prev.gameId,
            currentPlayer: obs.currentPlayer,
            players: obs.players,
            turnNumber: obs.turnNumber,
            lastMoveAt: msg.payload.lastMoveAt ?? prev.lastMoveAt,
          }));
        }
      }),
      on("STEP_RESULT", (msg: any) => {
        const obs = msg.payload?.observation;
        if (obs?.publicData) {
          setState((prev) => ({
            ...prev,
            publicData: obs.publicData,
            currentPlayer: obs.currentPlayer || msg.payload.nextPlayer,
            turnNumber: obs.turnNumber,
            lastMoveAt: Date.now(),
          }));
        }
      }),
      on("GAME_OVER", (msg: any) => {
        setState((prev) => ({
          ...prev,
          gameOver: true,
          winner: msg.payload.winner,
          reason: msg.payload.reason,
        }));
      }),
    ];

    return () => cleanups.forEach((c) => c());
  }, [connected, matchId, on, send]);

  return { state, connected };
}
