import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { TicTacToeUI } from "./ui";
import {
  CellValue,
  TicTacToeData,
  Board,
  emptyBoard,
  checkWinner,
  isBoardFull,
} from "./state";
import { isPlaceMoveAction, getLegalActionsForPlayer } from "./actions";
import { getObservationForPlayer } from "./observation";

export const TicTacToeModule: IGameModule = {
  gameId: "tictactoe",
  name: "Tic-Tac-Toe",
  description: "Classic 3x3 grid game. Get three in a row to win.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: TicTacToeUI,

  init(config: GameConfig, players: string[], _rngSeed: string): GameState {
    if (players.length !== 2) {
      throw new Error("Tic-Tac-Toe requires exactly 2 players");
    }

    const marks: Record<string, CellValue> = {
      [players[0]]: "X",
      [players[1]]: "O",
    };

    const data: TicTacToeData = {
      board: emptyBoard(),
      marks,
    };

    return {
      gameId: config.gameId,
      players,
      currentPlayer: players[0],
      turnNumber: 0,
      data: data as unknown as Record<string, unknown>,
    };
  },

  validateAction(
    state: GameState,
    playerId: string,
    action: Action
  ): boolean {
    if (state.currentPlayer !== playerId) {
      return false;
    }

    if (!isPlaceMoveAction(action)) {
      return false;
    }

    const gameData = state.data as unknown as TicTacToeData;
    const pos = action.data.position;

    if (pos < 0 || pos > 8) {
      return false;
    }

    if (gameData.board[pos] !== "") {
      return false;
    }

    return true;
  },

  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    if (!isPlaceMoveAction(action)) {
      throw new Error("Invalid action type");
    }

    const gameData = state.data as unknown as TicTacToeData;
    const pos = action.data.position;
    const mark = gameData.marks[playerId];

    if (!mark) {
      throw new Error(`Player ${playerId} has no mark assigned`);
    }

    const newBoard = [...gameData.board] as Board;
    newBoard[pos] = mark;

    const otherPlayer = state.players.find((p) => p !== playerId)!;

    const newData: TicTacToeData = {
      board: newBoard,
      marks: { ...gameData.marks },
    };

    return {
      gameId: state.gameId,
      players: state.players,
      currentPlayer: otherPlayer,
      turnNumber: state.turnNumber + 1,
      data: newData as unknown as Record<string, unknown>,
    };
  },

  isTerminal(state: GameState): boolean {
    const gameData = state.data as unknown as TicTacToeData;
    return checkWinner(gameData.board) !== "" || isBoardFull(gameData.board);
  },

  getOutcome(state: GameState): Outcome {
    const gameData = state.data as unknown as TicTacToeData;
    const winner = checkWinner(gameData.board);

    if (winner !== "") {
      const winnerPlayer = Object.entries(gameData.marks).find(
        ([_, mark]) => mark === winner
      )?.[0] ?? null;

      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = player === winnerPlayer ? 1 : 0;
      }

      return {
        winner: winnerPlayer,
        draw: false,
        scores,
        reason: "three_in_a_row",
      };
    }

    if (isBoardFull(gameData.board)) {
      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = 0.5;
      }

      return {
        winner: null,
        draw: true,
        scores,
        reason: "board_full",
      };
    }

    return {
      winner: null,
      draw: false,
      scores: {},
      reason: "game_in_progress",
    };
  },

  getObservation(state: GameState, playerId: string): Observation {
    return getObservationForPlayer(state, playerId);
  },

  getLegalActions(state: GameState, playerId: string): Action[] {
    return getLegalActionsForPlayer(state, playerId);
  },
};
