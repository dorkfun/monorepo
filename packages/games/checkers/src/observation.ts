import { GameState, Observation } from "@dorkfun/core";
import { CheckersData, cloneBoard } from "./state";

/**
 * Checkers is a complete information game, so the observation
 * is the full state for all players.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const data = state.data as unknown as CheckersData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneBoard(data.board),
      colors: { ...data.colors },
      activeColor: data.activeColor,
      drawClock: data.drawClock,
      lastMove: data.lastMove
        ? {
            from: { ...data.lastMove.from },
            to: { ...data.lastMove.to },
          }
        : null,
      terminalStatus: data.terminalStatus,
      winnerColor: data.winnerColor,
    },
  };
}
