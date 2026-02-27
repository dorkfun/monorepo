import { formatAddress } from "../utils/formatAddress";

interface MatchCardProps {
  matchId: string;
  gameId: string;
  players: string[];
  playerNames?: Record<string, string | null>;
  status: string;
  onClick: () => void;
}

export function MatchCard({ matchId, gameId, players, playerNames, status, onClick }: MatchCardProps) {
  const shortId = matchId.slice(0, 8);
  const isLive = status === "active";

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${isLive ? "#00ff41" : "#333"}`,
        padding: "12px",
        cursor: "pointer",
        marginBottom: "8px",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = isLive ? "#00ff41" : "#333")
      }
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span className="terminal-highlight">{gameId}</span>
        <span className={isLive ? "terminal-prompt pulse" : "terminal-comment"}>
          {isLive ? "● LIVE" : "○ " + status}
        </span>
      </div>
      <div className="terminal-comment" style={{ fontSize: "12px" }}>
        id: {shortId} | players: {players.map((p) => formatAddress(p, playerNames?.[p])).join(" vs ")}
      </div>
    </div>
  );
}
