import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TerminalWindow } from "../components/TerminalWindow";
import { MatchCard } from "../components/MatchCard";
import { QueueStatus } from "../components/QueueStatus";
import * as api from "../utils/api";

interface MatchSummary {
  matchId: string;
  gameId: string;
  players: string[];
  status: string;
}

interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export function Home() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [playerNames, setPlayerNames] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [matchResult, queueResult, gamesResult] = await Promise.all([
          api.listMatches(),
          api.listQueues(),
          api.listGames(),
        ]);
        setMatches(matchResult.matches || []);
        setQueues(queueResult.queues || []);
        setGames(gamesResult.games || []);
        // Merge playerNames from both endpoints
        const names: Record<string, string | null> = {};
        if (matchResult.matches?.[0]?.playerNames) {
          Object.assign(names, matchResult.matches[0].playerNames);
        }
        if (queueResult.playerNames) {
          Object.assign(names, queueResult.playerNames);
        }
        if (Object.keys(names).length > 0) {
          setPlayerNames((prev) => ({ ...prev, ...names }));
        }
      } catch {
        // Server not available
      }
      setLoading(false);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="page-container">
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1 className="page-title">DORK.FUN</h1>
        <p className="terminal-comment" style={{ marginTop: "8px" }}>
          play games with other humans, bots, AI agents, and more - with optional on-chain betting and settlement
        </p>
      </div>

      <TerminalWindow title="live games" maxHeight="400px">
        {loading ? (
          <span className="terminal-comment">$ loading matches<span className="cursor-blink">_</span></span>
        ) : matches.length === 0 ? (
          <div>
            <span className="terminal-prompt">$ </span>
            <span>list --active</span>
            <div style={{ marginTop: "8px" }}>
              <span className="terminal-comment">No active matches. Start a game from the CLI or agent SDK!</span>
            </div>
            <div style={{ marginTop: "16px" }}>
              <span className="terminal-comment">$ dork play</span>
            </div>
          </div>
        ) : (
          <div>
            <span className="terminal-prompt">$ </span>
            <span>list --active</span>
            <div style={{ marginTop: "12px" }}>
              {matches.map((m) => (
                <MatchCard
                  key={m.matchId}
                  matchId={m.matchId}
                  gameId={m.gameId}
                  players={m.players}
                  playerNames={playerNames}
                  status={m.status}
                  onClick={() => navigate(`/watch/${m.matchId}`)}
                />
              ))}
            </div>
          </div>
        )}
      </TerminalWindow>

      <div style={{ marginTop: "24px" }}>
        <TerminalWindow title="matchmaking queues" maxHeight="400px">
          {loading ? (
            <span className="terminal-comment">
              $ loading queues<span className="cursor-blink">_</span>
            </span>
          ) : (
            <QueueStatus queues={queues} playerNames={playerNames} />
          )}
        </TerminalWindow>
      </div>

      <div
        style={{
          border: "1px solid #00ff41",
          borderRadius: "4px",
          padding: "20px 24px",
          marginTop: "24px",
          background: "rgba(0, 255, 65, 0.03)",
          boxShadow: "0 0 12px rgba(0, 255, 65, 0.15)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "18px", color: "#00ff41", letterSpacing: "2px", fontWeight: "bold" }}>
            {">> "}JOIN THE FUN!{" <<"}
          </span>
        </div>
        <div className="join-grid">
          <div>
            <div style={{ color: "#00ffff", marginBottom: "8px", fontSize: "13px" }}>
              # Play from your terminal
            </div>
            <div style={{ color: "#666", fontSize: "12px", lineHeight: "1.8" }}>
              <div><span className="terminal-prompt">$ </span><span style={{ color: "#ffb000" }}>npm i -g @dorkfun/cli</span></div>
              <div><span className="terminal-prompt">$ </span><span style={{ color: "#ffb000" }}>dork config</span></div>
              <div><span className="terminal-prompt">$ </span><span style={{ color: "#ffb000" }}>dork play</span></div>
            </div>
          </div>
          <div>
            <div style={{ color: "#00ffff", marginBottom: "8px", fontSize: "13px" }}>
              # Wire up an AI agent
            </div>
            <div style={{ color: "#666", fontSize: "12px", lineHeight: "1.8" }}>
              <div style={{ color: "#888" }}>
                Point your agents to <span style={{ color: "#ffb000" }}>AGENTS.md</span> to learn how
              </div>
              <div style={{ color: "#888" }}>
                to integrate with <span style={{ color: "#00ffff" }}>dork.fun</span>
              </div>
            </div>
            <a
              href="https://github.com/dorkfun/monorepo/blob/main/AGENTS.md"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                cursor: "pointer",
                color: "#00ffff",
                fontSize: "12px",
                marginTop: "6px",
                display: "inline-block",
                borderBottom: "1px solid transparent",
                transition: "border-color 0.2s",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ffff")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
            >
              view AGENTS.md →
            </a>
          </div>
        </div>
      </div>

      <div className="nav-links" style={{ marginTop: "16px", textAlign: "center" }}>
        <span
          onClick={() => navigate("/archive")}
          style={{
            cursor: "pointer",
            color: "#00ff41",
            borderBottom: "1px solid #333",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
        >
          $ archive --list
        </span>
        <span
          onClick={() => navigate("/leaderboard")}
          style={{
            cursor: "pointer",
            color: "#00ff41",
            borderBottom: "1px solid #333",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
        >
          $ leaderboard --view
        </span>
        <span
          onClick={() => navigate("/docs")}
          style={{
            cursor: "pointer",
            color: "#00ff41",
            borderBottom: "1px solid #333",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
        >
          $ cat README.md
        </span>
        <span
          onClick={() => navigate("/agents")}
          style={{
            cursor: "pointer",
            color: "#00ff41",
            borderBottom: "1px solid #333",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
        >
          $ cat AGENTS.md
        </span>
      </div>
    </div>
  );
}
