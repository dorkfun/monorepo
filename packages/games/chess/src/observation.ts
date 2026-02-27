import { GameState, Observation } from "@dorkfun/core";
import { ChessData, cloneBoard } from "./state";

/**
 * Chess is a complete information game, so the observation
 * is the full state for both players.
 */
export function getObservationForPlayer(
  state: GameState,
  _playerId: string
): Observation {
  const data = state.data as unknown as ChessData;

  return {
    gameId: state.gameId,
    players: state.players,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    publicData: {
      board: cloneBoard(data.board),
      colors: { ...data.colors },
      activeColor: data.activeColor,
      castlingRights: { ...data.castlingRights },
      enPassantTarget: data.enPassantTarget
        ? { ...data.enPassantTarget }
        : null,
      halfMoveClock: data.halfMoveClock,
      fullMoveNumber: data.fullMoveNumber,
      inCheck: data.inCheck,
      terminalStatus: data.terminalStatus,
      winnerColor: data.winnerColor,
      lastMove: data.lastMove ? { ...data.lastMove } : null,
    },
  };
}
