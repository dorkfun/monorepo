import { GameState, Observation } from "@dorkfun/core";
import { OthelloData, cloneBoard } from "./state";

/**
 * Othello is a perfect information game, so the observation
 * is the full state for all players.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const gameData = state.data as unknown as OthelloData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneBoard(gameData.board),
      colors: { ...gameData.colors },
      activeColor: gameData.activeColor,
      consecutivePasses: gameData.consecutivePasses,
      lastMove: gameData.lastMove
        ? { ...gameData.lastMove }
        : null,
      terminalStatus: gameData.terminalStatus,
      winnerColor: gameData.winnerColor,
    },
  };
}
