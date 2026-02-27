import { GameState, Observation } from "@dorkfun/core";
import { HexData, cloneBoard } from "./state";

/**
 * Hex is a complete information game, so the observation
 * is the full state for all players.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const gameData = state.data as unknown as HexData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneBoard(gameData.board),
      colors: { ...gameData.colors },
      activeColor: gameData.activeColor,
      swapAvailable: gameData.swapAvailable,
      swapped: gameData.swapped,
      lastMove: gameData.lastMove
        ? { ...gameData.lastMove }
        : null,
      firstMove: gameData.firstMove
        ? { ...gameData.firstMove }
        : null,
      terminalStatus: gameData.terminalStatus,
      winnerColor: gameData.winnerColor,
    },
  };
}
