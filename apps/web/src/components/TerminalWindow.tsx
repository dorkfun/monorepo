import { ReactNode } from "react";

interface TerminalWindowProps {
  title?: string;
  maxHeight?: string;
  children: ReactNode;
}

export function TerminalWindow({ title = "dorkfun", maxHeight, children }: TerminalWindowProps) {
  return (
    <div className="terminal-window">
      <div className="terminal-titlebar">
        <div className="terminal-dot red" />
        <div className="terminal-dot yellow" />
        <div className="terminal-dot green" />
        <span className="terminal-title">{title}</span>
      </div>
      <div
        className="terminal-body"
        style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
