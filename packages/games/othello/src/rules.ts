import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { OthelloUI } from "./ui";
import {
  CellValue,
  OthelloData,
  initialBoard,
  cloneBoard,
  countPieces,
  getFlips,
  hasLegalMove,
  isBoardFull,
  BOARD_SIZE,
} from "./state";
import {
  isPlaceAction,
  isPassAction,
  getLegalActionsForPlayer,
} from "./actions";
import { getObservationForPlayer } from "./observation";

export const OthelloModule: IGameModule = {
  gameId: "othello",
  name: "Othello",
  description:
    "Place discs to outflank your opponent. Most discs wins.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: OthelloUI,

  init(
    config: GameConfig,
    players: string[],
    _rngSeed: string
  ): GameState {
    if (players.length !== 2) {
      throw new Error("Othello requires exactly 2 players");
    }

    const colors: Record<string, CellValue> = {
      [players[0]]: "B",
      [players[1]]: "W",
    };

    const data: OthelloData = {
      board: initialBoard(),
      colors,
      activeColor: "B",
      consecutivePasses: 0,
      lastMove: null,
      terminalStatus: null,
      winnerColor: null,
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

    const gameData = state.data as unknown as OthelloData;

    if (gameData.terminalStatus !== null) {
      return false;
    }

    const color = gameData.colors[playerId];
    if (!color) return false;

    if (isPlaceAction(action)) {
      const { row, col } = action.data;
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
        return false;
      }
      return getFlips(gameData.board, row, col, color).length > 0;
    }

    if (isPassAction(action)) {
      // Pass is only legal if the player has no legal placements
      return !hasLegalMove(gameData.board, color);
    }

    return false;
  },

  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    const gameData = state.data as unknown as OthelloData;
    const color = gameData.colors[playerId];

    if (!color) {
      throw new Error(`Player ${playerId} has no color assigned`);
    }

    const otherPlayer = state.players.find((p) => p !== playerId)!;
    const otherColor: CellValue = color === "B" ? "W" : "B";

    let newBoard = cloneBoard(gameData.board);
    let newConsecutivePasses = gameData.consecutivePasses;
    let newLastMove: OthelloData["lastMove"] = null;

    if (isPlaceAction(action)) {
      const { row, col } = action.data;
      const flips = getFlips(gameData.board, row, col, color);

      if (flips.length === 0) {
        throw new Error("Invalid placement: no flips");
      }

      // Place the disc
      newBoard[row][col] = color;

      // Flip all captured discs
      for (const flip of flips) {
        newBoard[flip.row][flip.col] = color;
      }

      newConsecutivePasses = 0;
      newLastMove = { row, col };
    } else if (isPassAction(action)) {
      newConsecutivePasses = gameData.consecutivePasses + 1;
      newLastMove = null;
    } else {
      throw new Error("Invalid action type");
    }

    // Determine terminal status
    let terminalStatus: OthelloData["terminalStatus"] = null;
    let winnerColor: CellValue | null = null;

    if (newConsecutivePasses >= 2) {
      terminalStatus = "double_pass";
    } else if (isBoardFull(newBoard)) {
      terminalStatus = "board_full";
    }

    if (terminalStatus !== null) {
      const pieces = countPieces(newBoard);
      if (pieces.B > pieces.W) {
        winnerColor = "B";
      } else if (pieces.W > pieces.B) {
        winnerColor = "W";
      } else {
        winnerColor = null; // draw
      }
    }

    const newData: OthelloData = {
      board: newBoard,
      colors: { ...gameData.colors },
      activeColor: otherColor,
      consecutivePasses: newConsecutivePasses,
      lastMove: newLastMove,
      terminalStatus,
      winnerColor,
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
    const gameData = state.data as unknown as OthelloData;
    return gameData.terminalStatus !== null;
  },

  getOutcome(state: GameState): Outcome {
    const gameData = state.data as unknown as OthelloData;
    const pieces = countPieces(gameData.board);

    if (gameData.terminalStatus === null) {
      return {
        winner: null,
        draw: false,
        scores: {},
        reason: "game_in_progress",
      };
    }

    const scores: Record<string, number> = {};

    if (pieces.B === pieces.W) {
      // Draw
      for (const player of state.players) {
        scores[player] = 0.5;
      }
      return {
        winner: null,
        draw: true,
        scores,
        reason: gameData.terminalStatus,
      };
    }

    const winColor: CellValue = pieces.B > pieces.W ? "B" : "W";
    const winnerPlayer =
      Object.entries(gameData.colors).find(
        ([_, c]) => c === winColor
      )?.[0] ?? null;

    for (const player of state.players) {
      scores[player] = player === winnerPlayer ? 1 : 0;
    }

    return {
      winner: winnerPlayer,
      draw: false,
      scores,
      reason: gameData.terminalStatus,
    };
  },

  getObservation(state: GameState, playerId: string): Observation {
    return getObservationForPlayer(state, playerId);
  },

  getLegalActions(state: GameState, playerId: string): Action[] {
    return getLegalActionsForPlayer(state, playerId);
  },
};
