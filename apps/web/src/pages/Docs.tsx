import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import { TerminalWindow } from "../components/TerminalWindow";
import readmeRaw from "../../../../README.md?raw";

export function Docs() {
  const navigate = useNavigate();
  const html = useMemo(() => marked.parse(readmeRaw) as string, []);

  return (
    <div className="page-container">
      <div style={{ marginBottom: "16px" }}>
        <span
          onClick={() => navigate("/")}
          style={{
            cursor: "pointer",
            color: "#00ff41",
            borderBottom: "1px solid #333",
            transition: "border-color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00ff41")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#333")}
        >
          $ cd /
        </span>
      </div>

      <TerminalWindow title="cat README.md">
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </TerminalWindow>
    </div>
  );
}
