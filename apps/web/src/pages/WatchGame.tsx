import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getGameUI } from "@dorkfun/game-ui";
import { TerminalWindow } from "../components/TerminalWindow";
import { ChatPanel } from "../components/ChatPanel";
import { LiveIndicator } from "../components/LiveIndicator";
import { useGameState } from "../hooks/useGameState";
import { useChat } from "../hooks/useChat";
import { useEnsNames } from "../hooks/useEnsNames";
import { formatAddress } from "../utils/formatAddress";
import * as api from "../utils/api";

const ARCHIVED_STATUSES = ["completed", "settled", "disputed"];

export function WatchGame() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const [archived, setArchived] = useState<any>(null);

  // Fetch match via REST API (works for both live and archived matches)
  useEffect(() => {
    if (!matchId) return;
    api.getMatch(matchId).then((data) => {
      if (data && ARCHIVED_STATUSES.includes(data.status)) {
        setArchived(data);
      }
    }).catch(() => {});
  }, [matchId]);

  const isArchived = !!archived;

  // Only connect WebSocket for live matches
  const { state, connected } = useGameState(isArchived ? null : (matchId ?? null));
  const { messages, sendMessage, connected: chatConnected } = useChat(matchId ?? null);

  // Merge archived data into display state
  const displayState = isArchived
    ? {
        publicData: archived.observation?.publicData ?? {},
        gameId: archived.gameId || "",
        currentPlayer: "",
        players: archived.players || [],
        turnNumber: archived.observation?.turnNumber ?? archived.transcript?.length ?? 0,
        gameOver: true,
        winner: archived.winner,
        reason: archived.status,
      }
    : state;

  const allAddresses = [...displayState.players, displayState.winner, displayState.currentPlayer].filter(Boolean) as string[];
  const ensNames = useEnsNames(allAddresses);

  const shortId = matchId?.slice(0, 8) ?? "unknown";
  const ui = displayState.gameId ? getGameUI(displayState.gameId) : undefined;
  const boardStr = ui?.renderBoard(displayState.publicData) ?? "";
  const statusStr = ui?.renderStatus(displayState.publicData);
  const turnDisplay = ui?.maxTurns
    ? `${displayState.turnNumber}/${ui.maxTurns}`
    : `${displayState.turnNumber}`;

  return (
    <div className="page-container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <span
          onClick={() => navigate(-1)}
          style={{ cursor: "pointer", color: "#666" }}
        >
          {"← back"}
        </span>
        <LiveIndicator live={!isArchived && connected && !state.gameOver} />
      </div>

      <TerminalWindow title={isArchived ? `archived match ${shortId}` : `watching match ${shortId}`}>
        <div className="terminal-line">
          <span className="terminal-prompt">$ </span>
          <span>{isArchived ? "archive" : "watch"} {shortId}</span>
        </div>
        <div className="terminal-line">
          <span className="terminal-comment">&gt; game: </span>
          <span>{displayState.gameId || "..."}</span>
        </div>
        {displayState.players.length > 0 && ui && (
          <div className="terminal-line">
            <span className="terminal-comment">&gt; players: </span>
            <span className="terminal-highlight">
              {formatAddress(displayState.players[0], ensNames[displayState.players[0]], "medium")} ({ui.getPlayerLabel(displayState.players[0], displayState.publicData)})
            </span>
            {displayState.players[1] && (
              <>
                <span className="terminal-comment"> vs </span>
                <span className="terminal-value">
                  {formatAddress(displayState.players[1], ensNames[displayState.players[1]], "medium")} ({ui.getPlayerLabel(displayState.players[1], displayState.publicData)})
                </span>
              </>
            )}
          </div>
        )}
        <div className="terminal-line">
          <span className="terminal-comment">&gt; move: </span>
          <span>{turnDisplay}</span>
        </div>

        <div style={{ margin: "16px 0" }}>
          <div className="game-board">
            <pre
              style={{ lineHeight: "1.8", fontSize: "16px", whiteSpace: "pre" }}
              dangerouslySetInnerHTML={{ __html: boardStr }}
            />
          </div>
        </div>

        {statusStr && (
          <div className="terminal-line">
            <span style={{ color: "#ffb000", fontWeight: "bold" }}>{statusStr}</span>
          </div>
        )}

        {displayState.gameOver ? (
          <div className="terminal-line">
            <span className="terminal-prompt">&gt; </span>
            <span style={{ color: "#ffb000", fontWeight: "bold" }}>
              GAME OVER -{" "}
              {displayState.winner
                ? `Winner: ${formatAddress(displayState.winner, ensNames[displayState.winner], "medium")} (${displayState.reason})`
                : `Draw (${displayState.reason})`}
            </span>
          </div>
        ) : connected ? (
          <div className="terminal-line">
            <span className="terminal-prompt">&gt; </span>
            <span className="terminal-comment">
              waiting for {displayState.currentPlayer ? formatAddress(displayState.currentPlayer, ensNames[displayState.currentPlayer], "medium") : "..."}...{" "}
            </span>
            <span className="cursor-blink">█</span>
          </div>
        ) : (
          <div className="terminal-line">
            <span className="terminal-error">connecting...</span>
          </div>
        )}
      </TerminalWindow>

      <ChatPanel
        messages={messages}
        onSend={sendMessage}
        disabled={!chatConnected}
        players={displayState.players}
      />
    </div>
  );
}
