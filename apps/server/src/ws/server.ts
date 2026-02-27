import http from "http";
import { parse as parseUrl } from "url";
import express from "express";
import Redis from "ioredis";
import { WebSocketServer, WebSocket } from "ws";
import { GameRegistry } from "@dorkfun/engine";
import { EnsResolver } from "@dorkfun/core";
import { MatchService } from "../services/MatchService";
import { SettlementService } from "../services/SettlementService";
import { RoomManager } from "./rooms";
import { handleGamePlayConnection } from "./handlers/gamePlay";
import { handleSpectatorConnection } from "./handlers/spectator";
import { handleChatConnection } from "./handlers/chat";
import { bindRoutes } from "../routes/index";
import log from "../logger";

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

export function createHttpWsServer(matchService: MatchService, roomManager: RoomManager, gameRegistry: GameRegistry, redis: Redis, settlement: SettlementService | null = null, ensResolver: EnsResolver | null = null): { app: express.Express; httpServer: http.Server } {
  const app = express();

  // CORS — allow cross-origin requests from any origin
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Bind REST routes
  bindRoutes(app, matchService, gameRegistry, redis, ensResolver);

  const httpServer = http.createServer(app);

  // Create separate WebSocket servers for each path
  const gameWss = new WebSocketServer({ noServer: true });
  const spectateWss = new WebSocketServer({ noServer: true });
  const chatWss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade for WebSocket
  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = parseUrl(request.url || "");

    if (!pathname) {
      socket.destroy();
      return;
    }

    // /ws/game/:matchId
    const gameMatch = pathname.match(/^\/ws\/game\/([^/]+)$/);
    if (gameMatch) {
      gameWss.handleUpgrade(request, socket, head, (ws) => {
        gameWss.emit("connection", ws, request, gameMatch[1]);
      });
      return;
    }

    // /ws/spectate/:matchId
    const spectateMatch = pathname.match(/^\/ws\/spectate\/([^/]+)$/);
    if (spectateMatch) {
      spectateWss.handleUpgrade(request, socket, head, (ws) => {
        spectateWss.emit("connection", ws, request, spectateMatch[1]);
      });
      return;
    }

    // /ws/chat/:matchId
    const chatMatch = pathname.match(/^\/ws\/chat\/([^/]+)$/);
    if (chatMatch) {
      chatWss.handleUpgrade(request, socket, head, (ws) => {
        chatWss.emit("connection", ws, request, chatMatch[1]);
      });
      return;
    }

    socket.destroy();
  });

  gameWss.on("connection", (ws: WebSocket, _request: http.IncomingMessage, matchId: string) => {
    log.info({ matchId }, "Game WebSocket connection");
    setupHeartbeat(ws);
    handleGamePlayConnection(ws, matchId, matchService, roomManager, redis, settlement);
  });

  spectateWss.on("connection", (ws: WebSocket, _request: http.IncomingMessage, matchId: string) => {
    log.info({ matchId }, "Spectator WebSocket connection");
    setupHeartbeat(ws);
    handleSpectatorConnection(ws, matchId, matchService, roomManager);
  });

  chatWss.on("connection", (ws: WebSocket, _request: http.IncomingMessage, matchId: string) => {
    log.info({ matchId }, "Chat WebSocket connection");
    setupHeartbeat(ws);
    handleChatConnection(ws, matchId, roomManager);
  });

  return { app, httpServer };
}

function setupHeartbeat(ws: WebSocket): void {
  let alive = true;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  const interval = setInterval(() => {
    if (!alive) {
      clearInterval(interval);
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
    pongTimer = setTimeout(() => {
      if (!alive) {
        clearInterval(interval);
        ws.terminate();
      }
    }, PONG_TIMEOUT_MS);
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("pong", () => {
    alive = true;
    if (pongTimer) {
      clearTimeout(pongTimer);
      pongTimer = null;
    }
  });

  ws.on("close", () => {
    clearInterval(interval);
    if (pongTimer) clearTimeout(pongTimer);
  });
}
