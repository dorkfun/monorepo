import { formatStake } from "../utils/formatStake";

interface QueueGame {
  gameId: string;
  gameName: string;
  entries: Array<{
    playerId: string;
    displayName: string;
    stakeWei?: string;
  }>;
}

interface QueueStatusProps {
  queues: QueueGame[];
  playerNames?: Record<string, string | null>;
  ethPriceUsd?: number | null;
}

export function QueueStatus({ queues, playerNames, ethPriceUsd }: QueueStatusProps) {
  const totalWaiting = queues.reduce((sum, q) => sum + q.entries.length, 0);

  return (
    <div>
      <span className="terminal-prompt">$ </span>
      <span>queue --status</span>
      <div style={{ marginTop: "12px" }}>
        {totalWaiting === 0 ? (
          <span className="terminal-comment">No players waiting in any queue</span>
        ) : (
          queues
            .filter((q) => q.entries.length > 0)
            .map((q) => (
              <div key={q.gameId} style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="terminal-highlight">{q.gameName}</span>
                  <span className="terminal-value">
                    {q.entries.length} waiting
                  </span>
                </div>
                {q.entries.map((e) => (
                  <div
                    key={e.playerId}
                    className="terminal-comment"
                    style={{ fontSize: "12px", marginLeft: "12px" }}
                  >
                    {playerNames?.[e.playerId] || e.displayName} ({e.playerId.slice(0, 8)}...)
                    {e.stakeWei && e.stakeWei !== "0" && (
                      <span style={{ color: "#ffb000", marginLeft: "8px" }}>
                        [{formatStake(e.stakeWei, ethPriceUsd ?? null)}]
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
