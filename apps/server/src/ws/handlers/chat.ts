import WebSocket from "ws";
import { WsMessage, getChatHistory, createChatMessage } from "@dorkfun/core";
import { RoomManager, SpectatorConnection } from "../rooms";
import log from "../../logger";

/**
 * Handles WebSocket connections for the chat channel.
 * Both spectators and players can chat here.
 * Messages are persisted to the database and history is sent on join.
 */
export function handleChatConnection(
  ws: WebSocket,
  matchId: string,
  roomManager: RoomManager
): void {
  let displayName = "anonymous";
  let conn: SpectatorConnection | null = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "JOIN") {
        displayName = msg.displayName || "anonymous";
        conn = { ws, displayName };
        // Chat connections are tracked as spectators for broadcast purposes
        roomManager.addSpectator(matchId, conn);
        log.info({ matchId, displayName }, "Chat user joined");

        // Send chat history to the newly connected client
        sendChatHistory(ws, matchId);
      } else if (msg.type === "CHAT") {
        const chatMsg: WsMessage = {
          type: "CHAT",
          matchId,
          payload: {
            sender: displayName,
            displayName,
            message: msg.message,
          },
          sequence: 0,
          prevHash: "",
          timestamp: Date.now(),
        };
        roomManager.broadcastToAll(matchId, chatMsg);

        // Persist to database
        persistChatMessage(matchId, displayName, displayName, msg.message);
      }
    } catch (err: any) {
      log.error({ err: err.message, matchId }, "Chat message error");
    }
  });

  ws.on("close", () => {
    if (conn) {
      roomManager.removeSpectator(matchId, conn);
      log.info({ matchId, displayName }, "Chat user left");
    }
  });
}

async function sendChatHistory(
  ws: WebSocket,
  matchId: string
): Promise<void> {
  try {
    const rows = await getChatHistory(matchId);

    if (rows.length === 0) return;

    const history = rows.map((r) => ({
      sender: r.display_name || r.sender,
      displayName: r.display_name,
      message: r.message,
      timestamp: new Date(r.created_at).getTime(),
    }));

    const msg: WsMessage = {
      type: "CHAT_HISTORY",
      matchId,
      payload: { messages: history },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  } catch (err: any) {
    log.error({ err: err.message, matchId }, "Failed to send chat history");
  }
}

export async function persistChatMessage(
  matchId: string,
  sender: string,
  displayName: string,
  message: string
): Promise<void> {
  try {
    await createChatMessage({
      match_id: matchId,
      sender,
      display_name: displayName,
      message,
    });
  } catch (err: any) {
    log.error({ err: err.message, matchId }, "Failed to persist chat message");
  }
}
