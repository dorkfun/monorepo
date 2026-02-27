import { GameState, Observation } from "@dorkfun/core";
import { TicTacToeData } from "./state";

/**
 * Tic-tac-toe is a complete information game, so the observation
 * is the full state for all players.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const gameData = state.data as unknown as TicTacToeData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: [...gameData.board],
      marks: { ...gameData.marks },
    },
  };
}
