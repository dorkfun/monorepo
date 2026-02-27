import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { HexUI } from "./ui";
import {
  CellValue,
  HexData,
  Board,
  BOARD_SIZE,
  emptyBoard,
  cloneBoard,
  checkWin,
} from "./state";
import { isPlaceAction, isSwapAction, getLegalActionsForPlayer } from "./actions";
import { getObservationForPlayer } from "./observation";

export const HexModule: IGameModule = {
  gameId: "hex",
  name: "Hex",
  description:
    "Connect your two sides of the board. Red connects top-bottom, Blue connects left-right. No draws possible.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: HexUI,

  init(config: GameConfig, players: string[], _rngSeed: string): GameState {
    if (players.length !== 2) {
      throw new Error("Hex requires exactly 2 players");
    }

    const colors: Record<string, CellValue> = {
      [players[0]]: "R",
      [players[1]]: "B",
    };

    const data: HexData = {
      board: emptyBoard(),
      colors,
      activeColor: "R",
      swapAvailable: false,
      swapped: false,
      lastMove: null,
      firstMove: null,
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
    // Must be the current player
    if (state.currentPlayer !== playerId) {
      return false;
    }

    const gameData = state.data as unknown as HexData;

    // No actions if the game is terminal
    if (gameData.terminalStatus !== null) {
      return false;
    }

    if (isPlaceAction(action)) {
      const { row, col } = action.data;
      // Bounds are already checked by isPlaceAction (0 to BOARD_SIZE-1)
      // Check cell is empty
      if (gameData.board[row][col] !== "") {
        return false;
      }
      return true;
    }

    if (isSwapAction(action)) {
      // Swap is only available on turn 1 when swapAvailable is true
      return gameData.swapAvailable && state.turnNumber === 1;
    }

    return false;
  },

  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    const gameData = state.data as unknown as HexData;

    if (isPlaceAction(action)) {
      const { row, col } = action.data;
      const activeColor = gameData.activeColor;

      // Clone board and place stone
      const newBoard = cloneBoard(gameData.board);
      newBoard[row][col] = activeColor;

      // Determine new swap availability
      let newSwapAvailable = gameData.swapAvailable;
      let newFirstMove = gameData.firstMove;

      if (state.turnNumber === 0) {
        // After the first move, swap becomes available
        newSwapAvailable = true;
        newFirstMove = { row, col };
      }

      if (state.turnNumber >= 1) {
        // After second move onward, swap is no longer available
        newSwapAvailable = false;
      }

      // Check for win
      let newTerminalStatus = gameData.terminalStatus;
      let newWinnerColor = gameData.winnerColor;

      if (checkWin(newBoard, activeColor)) {
        newTerminalStatus = "connected";
        newWinnerColor = activeColor;
      }

      // Switch active color and current player
      const otherColor: CellValue = activeColor === "R" ? "B" : "R";
      const otherPlayer = state.players.find((p) => p !== playerId)!;

      const newData: HexData = {
        board: newBoard,
        colors: { ...gameData.colors },
        activeColor: otherColor,
        swapAvailable: newSwapAvailable,
        swapped: gameData.swapped,
        lastMove: { row, col },
        firstMove: newFirstMove,
        terminalStatus: newTerminalStatus,
        winnerColor: newWinnerColor,
      };

      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: otherPlayer,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    if (isSwapAction(action)) {
      // Swap the color assignments: the stone on the board stays "R"
      // but now the second player (current player) owns "R" and
      // the first player owns "B".
      const currentPlayerId = playerId; // This is player 2 (who chose to swap)
      const otherPlayerId = state.players.find((p) => p !== currentPlayerId)!;

      // After swap: current player (player 2) gets "R", other player (player 1) gets "B"
      const newColors: Record<string, CellValue> = {
        [currentPlayerId]: "R",
        [otherPlayerId]: "B",
      };

      // Active color becomes "B" (the first player's new color - they go next)
      // Current player becomes the player who is now "B" (the first player / otherPlayerId)
      const newData: HexData = {
        board: cloneBoard(gameData.board),
        colors: newColors,
        activeColor: "B",
        swapAvailable: false,
        swapped: true,
        lastMove: gameData.firstMove ? { ...gameData.firstMove } : null,
        firstMove: gameData.firstMove ? { ...gameData.firstMove } : null,
        terminalStatus: null,
        winnerColor: null,
      };

      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: otherPlayerId,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    throw new Error(`Invalid action type: ${action.type}`);
  },

  isTerminal(state: GameState): boolean {
    const gameData = state.data as unknown as HexData;
    return gameData.terminalStatus !== null;
  },

  getOutcome(state: GameState): Outcome {
    const gameData = state.data as unknown as HexData;

    if (gameData.terminalStatus === "connected" && gameData.winnerColor) {
      // Find the player who owns the winning color
      const winnerPlayer =
        Object.entries(gameData.colors).find(
          ([_, color]) => color === gameData.winnerColor
        )?.[0] ?? null;

      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = player === winnerPlayer ? 1 : 0;
      }

      return {
        winner: winnerPlayer,
        draw: false,
        scores,
        reason: "connected",
      };
    }

    // Game still in progress (no draws possible in Hex)
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
