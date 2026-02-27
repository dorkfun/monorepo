import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { ConnectFourUI } from "./ui";
import {
  CellValue,
  ConnectFourData,
  emptyBoard,
  cloneBoard,
  getDropRow,
  checkWinner,
  isBoardFull,
} from "./state";
import { isDropAction, getLegalActionsForPlayer } from "./actions";
import { getObservationForPlayer } from "./observation";

export const ConnectFourModule: IGameModule = {
  gameId: "connectfour",
  name: "Connect Four",
  description: "Drop pieces to connect four in a row.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: ConnectFourUI,

  init(config: GameConfig, players: string[], _rngSeed: string): GameState {
    if (players.length !== 2) {
      throw new Error("Connect Four requires exactly 2 players");
    }

    const colors: Record<string, CellValue> = {
      [players[0]]: "R",
      [players[1]]: "Y",
    };

    const data: ConnectFourData = {
      board: emptyBoard(),
      colors,
      lastMove: null,
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

    if (!isDropAction(action)) {
      return false;
    }

    const col = action.data.column;
    if (col < 0 || col > 6) {
      return false;
    }

    const gameData = state.data as unknown as ConnectFourData;
    if (getDropRow(gameData.board, col) === null) {
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
    if (!isDropAction(action)) {
      throw new Error("Invalid action type");
    }

    const gameData = state.data as unknown as ConnectFourData;
    const col = action.data.column;
    const color = gameData.colors[playerId];

    if (!color) {
      throw new Error(`Player ${playerId} has no color assigned`);
    }

    const newBoard = cloneBoard(gameData.board);
    const row = getDropRow(newBoard, col);

    if (row === null) {
      throw new Error(`Column ${col} is full`);
    }

    newBoard[row][col] = color;

    const otherPlayer = state.players.find((p) => p !== playerId)!;

    const newData: ConnectFourData = {
      board: newBoard,
      colors: { ...gameData.colors },
      lastMove: { row, col },
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
    const gameData = state.data as unknown as ConnectFourData;
    return checkWinner(gameData.board) !== "" || isBoardFull(gameData.board);
  },

  getOutcome(state: GameState): Outcome {
    const gameData = state.data as unknown as ConnectFourData;
    const winner = checkWinner(gameData.board);

    if (winner !== "") {
      const winnerPlayer =
        Object.entries(gameData.colors).find(
          ([_, color]) => color === winner
        )?.[0] ?? null;

      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = player === winnerPlayer ? 1 : 0;
      }

      return {
        winner: winnerPlayer,
        draw: false,
        scores,
        reason: "four_in_a_row",
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
