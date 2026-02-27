import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TerminalWindow } from "../components/TerminalWindow";
import { useKeyboardNav } from "../hooks/useKeyboardNav";
import { formatAddress } from "../utils/formatAddress";
import * as api from "../utils/api";

interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  ensName?: string | null;
  rating: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  totalEarningsWei: string;
}

interface Tab {
  id: string;
  label: string;
}

type SortBy = "rating" | "earnings";

const PAGE_SIZE = 25;

export function LeaderboardPage() {
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<Tab[]>([{ id: "overall", label: "Overall" }]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<SortBy>("rating");

  // Fetch available games for tab list
  useEffect(() => {
    api
      .listGames()
      .then((res) => {
        const gameTabs = (res.games || []).map((g: any) => ({
          id: g.id,
          label: g.name,
        }));
        setTabs([{ id: "overall", label: "Overall" }, ...gameTabs]);
      })
      .catch(() => {});
  }, []);

  const onTabChange = useCallback(() => {
    setPage(0);
  }, []);

  const { selectedIndex, activeTab, setActiveTab } = useKeyboardNav({
    itemCount: entries.length,
    tabCount: tabs.length,
    onTabChange,
    onEscape: () => navigate("/"),
  });

  // Fetch leaderboard data
  useEffect(() => {
    setLoading(true);
    const currentTab = tabs[activeTab];
    if (!currentTab) return;

    const fetchFn =
      currentTab.id === "overall"
        ? api.getLeaderboard(PAGE_SIZE, page * PAGE_SIZE, sortBy)
        : api.getGameLeaderboard(currentTab.id, PAGE_SIZE, page * PAGE_SIZE, sortBy);

    fetchFn
      .then((res) => {
        setEntries(res.players || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [activeTab, page, tabs, sortBy]);

  // Pagination keys (n/p) and sort toggle (s)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && (page + 1) * PAGE_SIZE < total) setPage((p) => p + 1);
      if (e.key === "p" && page > 0) setPage((p) => p - 1);
      if (e.key === "s") {
        setSortBy((s) => (s === "rating" ? "earnings" : "rating"));
        setPage(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, total]);

  const formatWei = (wei: string) => {
    try {
      const eth = (Number(wei) / 1e18).toFixed(6);
      return eth.replace(/\.?0+$/, "");
    } catch {
      return "0";
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        <span className="terminal-comment keyboard-hint">
          esc: back | arrows: navigate | tab: switch | s: sort | n/p: page
        </span>
      </div>

      <TerminalWindow title="leaderboard">
        <div className="terminal-line">
          <span className="terminal-prompt">$ </span>
          <span>leaderboard --view {tabs[activeTab]?.label?.toLowerCase()} --sort {sortBy}</span>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ margin: "12px 0 8px" }}>
          {tabs.map((tab, i) => (
            <span
              key={tab.id}
              onClick={() => {
                setActiveTab(i);
                setPage(0);
              }}
              className={`leaderboard-tab${i === activeTab ? " active" : ""}`}
            >
              {tab.label}
            </span>
          ))}
          <span style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            <span
              onClick={() => { setSortBy("rating"); setPage(0); }}
              className={`leaderboard-tab${sortBy === "rating" ? " active" : ""}`}
              style={{ fontSize: "11px" }}
            >
              by Rating
            </span>
            <span
              onClick={() => { setSortBy("earnings"); setPage(0); }}
              className={`leaderboard-tab${sortBy === "earnings" ? " active" : ""}`}
              style={{ fontSize: "11px" }}
            >
              by Earnings
            </span>
          </span>
        </div>

        {/* Table header */}
        <div className="leaderboard-table">
          <pre
            style={{
              margin: "8px 0 4px",
              fontWeight: "bold",
              lineHeight: "1.6",
            }}
          >
            <span className="terminal-value">
              {"  #   Player           Rating    W    D    L   GP  Earnings"}
            </span>
            {"\n"}
            <span className="terminal-comment">
              {"  --- --------------- ------ ---- ---- ---- ---- ----------"}
            </span>
          </pre>
        </div>

        {loading ? (
          <div style={{ marginTop: "8px" }}>
            <span className="terminal-comment">
              loading rankings<span className="cursor-blink">_</span>
            </span>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ marginTop: "8px" }}>
            <span className="terminal-comment">
              No ranked players yet. Play a game first!
            </span>
          </div>
        ) : (
          <div className="leaderboard-table">
          <pre style={{ lineHeight: "1.6", margin: 0 }}>
            {entries.map((e, i) => (
              <div
                key={e.address}
                className={`leaderboard-row${i === selectedIndex ? " selected" : ""}`}
              >
                {i === selectedIndex ? " > " : "   "}
                {String(e.rank).padStart(3)}
                {"  "}
                {(e.ensName || e.displayName || formatAddress(e.address)).padEnd(15)}
                {" "}
                {String(e.rating).padStart(6)}
                {"  "}
                {String(e.gamesWon).padStart(3)}
                {"  "}
                {String(e.gamesDrawn).padStart(3)}
                {"  "}
                {String(e.gamesLost).padStart(3)}
                {"  "}
                {String(e.gamesPlayed).padStart(3)}
                {"  "}
                {(e.totalEarningsWei !== "0" ? formatWei(e.totalEarningsWei) + " ETH" : "-").padStart(10)}
              </div>
            ))}
          </pre>
          </div>
        )}

        {/* Pagination */}
        <div style={{ marginTop: "12px" }}>
          <span className="terminal-comment">
            page {page + 1}/{totalPages}
            {(page + 1) * PAGE_SIZE < total ? " | [n]ext" : ""}
            {page > 0 ? " | [p]rev" : ""}
            {" | [s]ort: "}{sortBy}
          </span>
        </div>
      </TerminalWindow>
    </div>
  );
}
