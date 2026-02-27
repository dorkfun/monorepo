import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TerminalWindow } from "../components/TerminalWindow";
import { useEnsNames } from "../hooks/useEnsNames";
import { formatAddress } from "../utils/formatAddress";
import * as api from "../utils/api";

interface ArchivedMatch {
  matchId: string;
  gameId: string;
  status: string;
  players: string[];
  winner: string | null;
  reason: string | null;
  stakeWei: string | null;
  createdAt: string;
  completedAt: string | null;
}

const PAGE_SIZE = 25;

export function Archive() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<ArchivedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [games, setGames] = useState<{ id: string; name: string }[]>([]);
  const [gameFilter, setGameFilter] = useState<string>("");
  const [playerNames, setPlayerNames] = useState<Record<string, string | null>>({});

  useEffect(() => {
    api
      .listGames()
      .then((res) => setGames(res.games || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listArchive(gameFilter || undefined, PAGE_SIZE, page * PAGE_SIZE)
      .then((res) => {
        setMatches(res.matches || []);
        setTotal(res.total || 0);
        if (res.playerNames) setPlayerNames((prev) => ({ ...prev, ...res.playerNames }));
        setLoading(false);
      })
      .catch(() => {
        setMatches([]);
        setLoading(false);
      });
  }, [page, gameFilter]);

  // Pagination keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && (page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
      if (e.key === "p" && page > 0) setPage((p) => p - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, total]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatAddr = (addr: string) => formatAddress(addr, playerNames[addr]);

  const formatWei = (wei: string) => {
    try {
      const eth = (Number(wei) / 1e18).toFixed(6);
      return eth.replace(/\.?0+$/, "");
    } catch {
      return wei + " wei";
    }
  };

  const formatOutcome = (m: ArchivedMatch) => {
    const reasonSuffix = m.reason ? ` (${m.reason})` : "";
    if (m.winner) return `Winner: ${formatAddr(m.winner)}${reasonSuffix}`;
    if (m.status === "completed") return `Draw${reasonSuffix}`;
    return m.status;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

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
          onClick={() => navigate("/")}
          style={{ cursor: "pointer", color: "#666", transition: "color 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
        >
          {"<-"} back
        </span>
        <span className="terminal-comment">n/p: page</span>
      </div>

      <TerminalWindow title="match archive">
        <div className="terminal-line">
          <span className="terminal-prompt">$ </span>
          <span>archive --list{gameFilter ? ` --game ${gameFilter}` : ""}</span>
        </div>

        {/* Game filter */}
        <div className="tab-bar" style={{ margin: "12px 0 8px" }}>
          <span
            onClick={() => { setGameFilter(""); setPage(0); }}
            className={`leaderboard-tab${!gameFilter ? " active" : ""}`}
          >
            All
          </span>
          {games.map((g) => (
            <span
              key={g.id}
              onClick={() => { setGameFilter(g.id); setPage(0); }}
              className={`leaderboard-tab${gameFilter === g.id ? " active" : ""}`}
            >
              {g.name}
            </span>
          ))}
        </div>

        {loading ? (
          <div style={{ marginTop: "8px" }}>
            <span className="terminal-comment">
              loading archive<span className="cursor-blink">_</span>
            </span>
          </div>
        ) : matches.length === 0 ? (
          <div style={{ marginTop: "8px" }}>
            <span className="terminal-comment">No archived matches found.</span>
          </div>
        ) : (
          <div style={{ marginTop: "12px" }}>
            {matches.map((m) => (
              <div
                key={m.matchId}
                onClick={() => navigate(`/watch/${m.matchId}`)}
                style={{
                  border: "1px solid #333",
                  padding: "12px",
                  cursor: "pointer",
                  marginBottom: "8px",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span className="terminal-highlight">{m.gameId}</span>
                  <span className="terminal-comment" style={{ fontSize: "12px" }}>
                    {formatTime(m.completedAt)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="terminal-comment" style={{ fontSize: "12px" }}>
                    {m.players.map((p) => formatAddr(p)).join(" vs ")}
                  </span>
                  <span style={{ fontSize: "12px", color: m.winner ? "#00ff41" : "#ffb000" }}>
                    {formatOutcome(m)}
                  </span>
                </div>
                {m.stakeWei && m.stakeWei !== "0" && (
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>
                    <span className="terminal-comment">stake: {formatWei(m.stakeWei!)} ETH</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        <div style={{ marginTop: "12px" }}>
          <span className="terminal-comment">
            {total} match{total !== 1 ? "es" : ""} | page {page + 1}/{totalPages}
            {(page + 1) * PAGE_SIZE < total ? " | [n]ext" : ""}
            {page > 0 ? " | [p]rev" : ""}
          </span>
        </div>
      </TerminalWindow>
    </div>
  );
}
