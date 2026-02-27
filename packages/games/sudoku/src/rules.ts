import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { SudokuUI } from "./ui";
import { SudokuData, Difficulty, cloneGrid, isClueCell } from "./state";
import {
  isPlaceDigitAction,
  isClearCellAction,
  isResignAction,
  getLegalActionsForPlayer,
} from "./actions";
import { getObservationForPlayer } from "./observation";
import { generatePuzzle } from "./generator";
import { isSolved } from "./solver";

export const SudokuModule: IGameModule = {
  gameId: "sudoku",
  name: "Sudoku",
  description:
    "Classic 9x9 Sudoku puzzle. Fill the grid so every row, column, and 3x3 box contains 1-9.",
  minPlayers: 1,
  maxPlayers: 1,
  moveTimeoutMs: 3_600_000, // 60 minutes — puzzle games need much more think time
  ui: SudokuUI,

  init(config: GameConfig, players: string[], rngSeed: string): GameState {
    if (players.length !== 1) {
      throw new Error("Sudoku requires exactly 1 player");
    }

    const difficulty: Difficulty =
      (config.settings?.difficulty as Difficulty) || "medium";

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      throw new Error(
        `Invalid difficulty: ${difficulty}. Must be easy, medium, or hard.`
      );
    }

    const { puzzle, solution } = generatePuzzle(rngSeed, difficulty);

    const data: SudokuData = {
      board: cloneGrid(puzzle),
      puzzle: cloneGrid(puzzle),
      solution,
      difficulty,
      resigned: false,
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
    if (state.currentPlayer !== playerId) return false;

    const data = state.data as unknown as SudokuData;
    if (data.resigned) return false;

    if (isResignAction(action)) return true;

    if (isPlaceDigitAction(action)) {
      const { row, col } = action.data;
      return !isClueCell(data.puzzle, row, col);
    }

    if (isClearCellAction(action)) {
      const { row, col } = action.data;
      return !isClueCell(data.puzzle, row, col) && data.board[row][col] !== 0;
    }

    return false;
  },

  applyAction(
    state: GameState,
    _playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    const data = state.data as unknown as SudokuData;

    if (isResignAction(action)) {
      const newData: SudokuData = {
        board: cloneGrid(data.board),
        puzzle: cloneGrid(data.puzzle),
        solution: cloneGrid(data.solution),
        difficulty: data.difficulty,
        resigned: true,
      };
      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: state.currentPlayer,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    if (isPlaceDigitAction(action)) {
      const { row, col, value } = action.data;
      const newBoard = cloneGrid(data.board);
      newBoard[row][col] = value;

      const newData: SudokuData = {
        board: newBoard,
        puzzle: cloneGrid(data.puzzle),
        solution: cloneGrid(data.solution),
        difficulty: data.difficulty,
        resigned: false,
      };
      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: state.currentPlayer,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    if (isClearCellAction(action)) {
      const { row, col } = action.data;
      const newBoard = cloneGrid(data.board);
      newBoard[row][col] = 0;

      const newData: SudokuData = {
        board: newBoard,
        puzzle: cloneGrid(data.puzzle),
        solution: cloneGrid(data.solution),
        difficulty: data.difficulty,
        resigned: false,
      };
      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: state.currentPlayer,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    throw new Error("Invalid action type");
  },

  isTerminal(state: GameState): boolean {
    const data = state.data as unknown as SudokuData;
    if (data.resigned) return true;
    return isSolved(data.board);
  },

  getOutcome(state: GameState): Outcome {
    const data = state.data as unknown as SudokuData;
    const player = state.players[0];

    if (data.resigned) {
      return {
        winner: null,
        draw: false,
        scores: { [player]: 0 },
        reason: "resigned",
      };
    }

    if (isSolved(data.board)) {
      return {
        winner: player,
        draw: false,
        scores: { [player]: 1 },
        reason: "puzzle_solved",
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
