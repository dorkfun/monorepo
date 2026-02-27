import { formatAddress } from "../utils/formatAddress";
import { formatStake } from "../utils/formatStake";

interface MatchCardProps {
  matchId: string;
  gameId: string;
  players: string[];
  playerNames?: Record<string, string | null>;
  status: string;
  stakeWei?: string | null;
  ethPriceUsd?: number | null;
  onClick: () => void;
}

export function MatchCard({ matchId, gameId, players, playerNames, status, stakeWei, ethPriceUsd, onClick }: MatchCardProps) {
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
      {stakeWei && stakeWei !== "0" && (
        <div style={{ fontSize: "11px", marginTop: "4px" }}>
          <span style={{ color: "#ffb000" }}>stake: {formatStake(stakeWei, ethPriceUsd ?? null)}</span>
        </div>
      )}
    </div>
  );
}
