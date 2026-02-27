import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import type { ChatMessage } from "../components/ChatPanel";

export function useChat(matchId: string | null) {
  const wsUrl = matchId
    ? (() => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (apiUrl) {
          const url = new URL(apiUrl);
          return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws/chat/${matchId}`;
        }
        return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/chat/${matchId}`;
      })()
    : null;

  const { connected, on, send } = useWebSocket(wsUrl);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayName] = useState(
    "spectator-" + Math.random().toString(36).slice(2, 6)
  );

  useEffect(() => {
    if (!connected) return;

    // Join chat
    send({ type: "JOIN", displayName });

    const cleanupChat = on("CHAT", (msg: any) => {
      setMessages((prev) => [
        ...prev,
        {
          sender: msg.payload.displayName || msg.payload.sender,
          message: msg.payload.message,
          timestamp: msg.timestamp,
        },
      ]);
    });

    const cleanupHistory = on("CHAT_HISTORY", (msg: any) => {
      const history: ChatMessage[] = (msg.payload.messages || []).map(
        (m: any) => ({
          sender: m.displayName || m.sender,
          message: m.message,
          timestamp: m.timestamp,
        })
      );
      setMessages((prev) => {
        // Prepend history, avoiding duplicates if history arrives after some live messages
        if (prev.length === 0) return history;
        const earliestLive = prev[0].timestamp;
        const older = history.filter((m) => m.timestamp < earliestLive);
        return [...older, ...prev];
      });
    });

    return () => {
      cleanupChat();
      cleanupHistory();
    };
  }, [connected, displayName, on, send]);

  const sendMessage = useCallback(
    (message: string) => {
      send({ type: "CHAT", message });
    },
    [send]
  );

  return { messages, sendMessage, connected, displayName };
}
