import { GameState, Observation } from "@dorkfun/core";
import { SudokuData, cloneGrid } from "./state";

/**
 * Returns the observation for the player.
 * The solution grid is intentionally HIDDEN — it is not included
 * in publicData, preventing the client from seeing the answer.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const data = state.data as unknown as SudokuData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneGrid(data.board),
      puzzle: cloneGrid(data.puzzle),
      difficulty: data.difficulty,
      resigned: data.resigned,
    },
  };
}
