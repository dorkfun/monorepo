import React, { useState, useEffect } from "react";
import { Box, useInput, useApp } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { Lobby } from "./screens/Lobby.js";
import { Matchmaking } from "./screens/Matchmaking.js";
import { GameBoard } from "./screens/GameBoard.js";
import { GameOver } from "./screens/GameOver.js";
import { WatchList } from "./screens/WatchList.js";
import { WatchGame } from "./screens/WatchGame.js";
import { Leaderboard } from "./screens/Leaderboard.js";
import { getConfig } from "../config/runtime.js";
import * as api from "../transport/httpClient.js";

type Screen =
  | { type: "lobby" }
  | { type: "leaderboard" }
  | { type: "matchmaking"; gameId: string; stakeWei?: string }
  | { type: "game"; matchId: string; wsToken: string; gameId: string; stakeWei?: string }
  | { type: "gameover"; winner: string | null; reason: string; stakeWei?: string }
  | { type: "watchlist" }
  | { type: "watching"; matchId: string; gameId: string };

interface AppProps {
  playerId: string;
  stakeWei?: string;
}

export function App({ playerId, stakeWei: initialStakeWei }: AppProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>({ type: "lobby" });

  // On startup, check if the player has an active match to reconnect to
  useEffect(() => {
    api.checkActiveMatch(playerId).then((res: any) => {
      if (res.hasActiveMatch && res.matchId && res.wsToken) {
        setScreen({
          type: "game",
          matchId: res.matchId,
          wsToken: res.wsToken,
          gameId: res.gameId || "unknown",
          stakeWei: res.stakeWei && res.stakeWei !== "0" ? res.stakeWei : undefined,
        });
      }
    }).catch(() => {
      // Ignore — server might not be reachable yet
    });
  }, [playerId]);

  useInput((input) => {
    if (input === "q" && screen.type === "lobby") {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <StatusBar
        playerAddress={playerId}
        serverUrl={getConfig().serverUrl}
        connected={true}
      />

      {screen.type === "lobby" && (
        <Lobby
          defaultStakeWei={initialStakeWei}
          onPlay={(gameId, stakeWei) => setScreen({ type: "matchmaking", gameId, stakeWei })}
          onWatch={() => setScreen({ type: "watchlist" })}
          onLeaderboard={() => setScreen({ type: "leaderboard" })}
        />
      )}

      {screen.type === "leaderboard" && (
        <Leaderboard onBack={() => setScreen({ type: "lobby" })} />
      )}

      {screen.type === "matchmaking" && (
        <Matchmaking
          playerId={playerId}
          gameId={screen.gameId}
          stakeWei={screen.stakeWei}
          onMatched={(matchId, wsToken, _opponent) =>
            setScreen({ type: "game", matchId, wsToken, gameId: screen.gameId, stakeWei: screen.stakeWei })
          }
          onCancel={() => setScreen({ type: "lobby" })}
        />
      )}

      {screen.type === "game" && (
        <GameBoard
          matchId={screen.matchId}
          wsToken={screen.wsToken}
          playerId={playerId}
          gameId={screen.gameId}
          stakeWei={screen.stakeWei}
          onGameOver={(winner, reason) =>
            setScreen({ type: "gameover", winner, reason, stakeWei: screen.stakeWei })
          }
        />
      )}

      {screen.type === "gameover" && (
        <GameOver
          winner={screen.winner}
          reason={screen.reason}
          playerId={playerId}
          stakeWei={screen.stakeWei}
          onRematch={() => setScreen({ type: "lobby" })}
          onQuit={() => setScreen({ type: "lobby" })}
        />
      )}

      {screen.type === "watchlist" && (
        <WatchList
          onSelect={(matchId, gameId) =>
            setScreen({ type: "watching", matchId, gameId })
          }
          onBack={() => setScreen({ type: "lobby" })}
        />
      )}

      {screen.type === "watching" && (
        <WatchGame
          matchId={screen.matchId}
          gameId={screen.gameId}
          onBack={() => setScreen({ type: "watchlist" })}
        />
      )}
    </Box>
  );
}
