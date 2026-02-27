import { GameState, Observation } from "@dorkfun/core";
import { ConnectFourData, cloneBoard } from "./state";

export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const data = state.data as unknown as ConnectFourData;
  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneBoard(data.board),
      colors: { ...data.colors },
      lastMove: data.lastMove ? { ...data.lastMove } : null,
    },
  };
}
