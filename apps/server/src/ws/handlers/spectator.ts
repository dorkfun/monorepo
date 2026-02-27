import WebSocket from "ws";
import { WsMessage } from "@dorkfun/core";
import { MatchService } from "../../services/MatchService";
import { RoomManager, SpectatorConnection } from "../rooms";
import log from "../../logger";

/**
 * Handles WebSocket connections for spectators watching a game.
 * Spectators receive game state updates but cannot submit actions.
 */
export function handleSpectatorConnection(
  ws: WebSocket,
  matchId: string,
  matchService: MatchService,
  roomManager: RoomManager
): void {
  let displayName = "anonymous";
  let spectatorConn: SpectatorConnection | null = null;

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WsMessage;

      if (msg.type === "SPECTATE_JOIN") {
        displayName = (msg.payload as { displayName: string }).displayName || "anonymous";
        spectatorConn = { ws, displayName };
        roomManager.addSpectator(matchId, spectatorConn);

        log.info({ matchId, displayName }, "Spectator joined");

        // Send current game state
        const match = matchService.getMatch(matchId);
        if (match?.orchestrator) {
          const obs = match.orchestrator.getObservation(match.players[0]);
          const stateMsg: WsMessage = {
            type: "SPECTATE_STATE",
            matchId,
            payload: {
              observation: obs,
              players: match.players,
              gameId: match.gameId,
              status: match.status,
              spectatorCount: roomManager.getSpectatorCount(matchId),
              lastMoveAt: match.lastActivityAt.getTime(),
            },
            sequence: 0,
            prevHash: "",
            timestamp: Date.now(),
          };
          ws.send(JSON.stringify(stateMsg));
        }
      }
    } catch (err: any) {
      log.error({ err: err.message, matchId }, "Spectator message error");
    }
  });

  ws.on("close", () => {
    if (spectatorConn) {
      roomManager.removeSpectator(matchId, spectatorConn);
      log.info({ matchId, displayName }, "Spectator left");
    }
  });
}
