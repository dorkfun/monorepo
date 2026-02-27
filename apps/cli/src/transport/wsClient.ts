import WebSocket from "ws";
import { WsMessage, buildAuthMessage } from "@dorkfun/core";
import { getConfig } from "../config/runtime.js";
import { signMessage } from "../wallet/signer.js";

export type MessageHandler = (msg: WsMessage) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

export class GameWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private matchId: string = "";
  private reconnectAttempts = 0;
  private closed = false;
  private helloToken: string = "";
  private helloPlayerId: string = "";
  private wsPath: string = "game";

  connect(matchId: string, path: string = "game"): Promise<void> {
    this.matchId = matchId;
    this.wsPath = path;
    this.closed = false;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${getConfig().wsUrl}/ws/${this.wsPath}/${this.matchId}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", async () => {
        this.reconnectAttempts = 0;

        // Re-authenticate on reconnect
        if (this.helloPlayerId) {
          if (this.helloToken) {
            // First connection — use the one-time token
            this.sendHello(this.helloToken, this.helloPlayerId);
          } else {
            // Reconnection — generate a fresh signature
            try {
              const timestamp = Date.now();
              const message = buildAuthMessage(this.helloPlayerId, timestamp);
              const signature = await signMessage(message);
              this.sendHelloWithSignature(this.helloPlayerId, signature, timestamp);
            } catch {
              // Signing failed — can't reconnect
            }
          }
        }
        resolve();
      });

      this.ws.on("error", (err) => {
        if (this.reconnectAttempts === 0 && !this.closed) {
          reject(err);
        }
      });

      this.ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as WsMessage;
          this.emit(msg.type, msg);
          this.emit("*", msg);
        } catch {
          // Ignore parse errors
        }
      });

      this.ws.on("close", () => {
        if (this.closed) return;
        this.tryReconnect();
      });
    });
  }

  private tryReconnect(): void {
    if (this.closed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit("close", {
        type: "ERROR",
        matchId: this.matchId,
        payload: { error: "Connection lost after max retries" },
        sequence: 0,
        prevHash: "",
        timestamp: Date.now(),
      } as WsMessage);
      return;
    }

    this.reconnectAttempts++;
    this.emit("reconnecting", {
      type: "ERROR",
      matchId: this.matchId,
      payload: { error: `Reconnecting... (attempt ${this.reconnectAttempts})` },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    } as WsMessage);

    setTimeout(() => {
      if (this.closed) return;
      this.doConnect().catch(() => {
        this.tryReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  private emit(type: string, msg: WsMessage): void {
    const handlers = this.handlers.get(type) || [];
    for (const handler of handlers) {
      handler(msg);
    }
  }

  sendHello(token: string, playerId: string): void {
    this.helloToken = token;
    this.helloPlayerId = playerId;
    this.send({
      type: "HELLO",
      matchId: "",
      payload: { token, playerId },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  /** Send a HELLO with signature-based auth (used for reconnection). */
  sendHelloWithSignature(playerId: string, signature: string, timestamp: number): void {
    this.helloPlayerId = playerId;
    // Clear token so future reconnects use signature path
    this.helloToken = "";
    this.send({
      type: "HELLO",
      matchId: "",
      payload: { playerId, signature, timestamp },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  sendAction(matchId: string, action: { type: string; data: Record<string, unknown> }): void {
    this.send({
      type: "ACTION_COMMIT",
      matchId,
      payload: { action },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  sendSpectateJoin(matchId: string, displayName: string): void {
    this.send({
      type: "SPECTATE_JOIN",
      matchId,
      payload: { displayName },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  sendSyncRequest(matchId: string, clientIsMyTurn: boolean): void {
    this.send({
      type: "SYNC_REQUEST",
      matchId,
      payload: { clientIsMyTurn },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  sendForfeit(matchId: string): void {
    this.send({
      type: "FORFEIT",
      matchId,
      payload: {},
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  sendChat(matchId: string, message: string): void {
    this.send({
      type: "CHAT",
      matchId,
      payload: { message },
      sequence: 0,
      prevHash: "",
      timestamp: Date.now(),
    });
  }

  private send(msg: WsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
