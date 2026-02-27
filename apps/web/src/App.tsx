import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { WatchGame } from "./pages/WatchGame";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { Archive } from "./pages/Archive";
import { Docs } from "./pages/Docs";
import { Agents } from "./pages/Agents";

export function App() {
  return (
    <div className="scanlines">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/watch/:matchId" element={<WatchGame />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/agents" element={<Agents />} />
        </Routes>
        <footer style={{ textAlign: "center", padding: "1rem", opacity: 0.5, fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
          <span>dork.fun © {new Date().getFullYear()}</span>
          <a
            href="https://github.com/dorkfun/monorepo"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="https://x.com/dorkdotfun"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter) profile"
            style={{ color: "inherit", display: "inline-flex" }}
          >
            <svg width="18" height="18" viewBox="0 0 1200 1227" fill="currentColor" aria-hidden="true">
              <path d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z" />
            </svg>
          </a>
        </footer>
      </BrowserRouter>
    </div>
  );
}
