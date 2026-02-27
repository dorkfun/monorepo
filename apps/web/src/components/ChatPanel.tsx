import { useState } from "react";
import { formatAddress } from "../utils/formatAddress";

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  disabled?: boolean;
  players?: string[];
}

export function ChatPanel({ messages, onSend, disabled, players }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  return (
    <div className="terminal-window" style={{ marginTop: "16px" }}>
      <div className="terminal-titlebar">
        <div className="terminal-dot red" />
        <div className="terminal-dot yellow" />
        <div className="terminal-dot green" />
        <span className="terminal-title">chat</span>
      </div>
      <div className="terminal-body" style={{ maxHeight: "200px", overflowY: "auto" }}>
        {messages.length === 0 ? (
          <span className="terminal-comment">No messages yet...</span>
        ) : (
          messages.map((msg, i) => {
            const senderClass = players
              ? msg.sender === players[0]
                ? "terminal-highlight"
                : msg.sender === players[1]
                  ? "terminal-value"
                  : "chat-spectator"
              : "terminal-value";
            return (
              <div key={i} className="terminal-line">
                <span className={senderClass}>{msg.sender.startsWith("0x") ? formatAddress(msg.sender) : msg.sender}</span>
                <span className="terminal-comment">: </span>
                <span>{msg.message}</span>
              </div>
            );
          })
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "8px",
          padding: "8px 16px 16px",
          borderTop: "1px solid #333",
        }}
      >
        <span className="terminal-prompt">&gt; </span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={disabled}>
          send
        </button>
      </form>
    </div>
  );
}
