import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { CheckersUI } from "./ui";
import {
  Board,
  CheckersData,
  PieceColor,
  cloneBoard,
  countPieces,
  initialBoard,
  pieceAt,
} from "./state";
import { isMoveAction, getLegalActionsForPlayer } from "./actions";
import { getObservationForPlayer } from "./observation";

export const CheckersModule: IGameModule = {
  gameId: "checkers",
  name: "Checkers",
  description:
    "American draughts. Mandatory captures, multi-jumps, and king promotions.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: CheckersUI,

  init(config: GameConfig, players: string[], _rngSeed: string): GameState {
    if (players.length !== 2) {
      throw new Error("Checkers requires exactly 2 players");
    }

    const data: CheckersData = {
      board: initialBoard(),
      colors: {
        [players[0]]: "black",
        [players[1]]: "white",
      },
      activeColor: "black",
      drawClock: 0,
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
    if (state.currentPlayer !== playerId) return false;
    if (!isMoveAction(action)) return false;

    const legalActions = getLegalActionsForPlayer(state, playerId);
    const moveData = action.data as {
      from: { row: number; col: number };
      to: { row: number; col: number };
      path: { row: number; col: number }[];
    };

    // Check if the submitted action matches one of the legal actions
    return legalActions.some((legal) => {
      const ld = legal.data as {
        from: { row: number; col: number };
        to: { row: number; col: number };
        path: { row: number; col: number }[];
      };
      if (ld.from.row !== moveData.from.row || ld.from.col !== moveData.from.col) return false;
      if (ld.to.row !== moveData.to.row || ld.to.col !== moveData.to.col) return false;
      const actionPath = moveData.path || [];
      if (ld.path.length !== actionPath.length) return false;
      for (let i = 0; i < ld.path.length; i++) {
        if (ld.path[i].row !== actionPath[i].row || ld.path[i].col !== actionPath[i].col) {
          return false;
        }
      }
      return true;
    });
  },

  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    if (!isMoveAction(action)) {
      throw new Error("Invalid action type");
    }

    const oldData = state.data as unknown as CheckersData;
    const moveData = action.data as {
      from: { row: number; col: number };
      to: { row: number; col: number };
      path: { row: number; col: number }[];
    };

    // 1. Clone board
    const newBoard = cloneBoard(oldData.board);

    // 2. Get the piece at from
    const piece = pieceAt(newBoard, moveData.from);
    if (!piece) {
      throw new Error(`No piece at (${moveData.from.row}, ${moveData.from.col})`);
    }

    // 3. Build the full sequence of positions: [from, ...path, to]
    const path = moveData.path || [];
    const fullSequence = [moveData.from, ...path, moveData.to];

    // 4. For each consecutive pair, check for jumps and remove captured pieces
    let anyCapture = false;
    for (let i = 0; i < fullSequence.length - 1; i++) {
      const posA = fullSequence[i];
      const posB = fullSequence[i + 1];
      const rowDiff = Math.abs(posB.row - posA.row);

      if (rowDiff === 2) {
        // It's a jump: compute mid position and remove captured piece
        const midRow = (posA.row + posB.row) / 2;
        const midCol = (posA.col + posB.col) / 2;
        newBoard[midRow][midCol] = null;
        anyCapture = true;
      }
    }

    // 5. Move piece from original from to final to
    newBoard[moveData.from.row][moveData.from.col] = null;

    // 6. Check promotion: man reaching king row becomes king
    let movedPiece = { ...piece };
    const promotionRow = piece.color === "black" ? 7 : 0;
    if (movedPiece.type === "man" && moveData.to.row === promotionRow) {
      movedPiece = { color: movedPiece.color, type: "king" };
    }

    newBoard[moveData.to.row][moveData.to.col] = movedPiece;

    // 7. Update draw clock
    const newDrawClock = anyCapture ? 0 : oldData.drawClock + 1;

    // 8. Switch active color and current player
    const newActiveColor: PieceColor =
      oldData.activeColor === "black" ? "white" : "black";
    const otherPlayer = state.players.find((p) => p !== playerId)!;

    // 9. Record last move
    const newLastMove = {
      from: { row: moveData.from.row, col: moveData.from.col },
      to: { row: moveData.to.row, col: moveData.to.col },
    };

    // 10. Check terminal conditions
    let terminalStatus: CheckersData["terminalStatus"] = null;
    let winnerColor: PieceColor | null = null;

    // Check if opponent has any pieces left
    const opponentPieceCount = countPieces(newBoard, newActiveColor);
    if (opponentPieceCount === 0) {
      terminalStatus = "no_pieces";
      winnerColor = oldData.activeColor; // the player who just moved wins
    }

    // Check if opponent has any legal moves (only if not already terminal)
    if (terminalStatus === null) {
      // Build a temporary state to check legal actions for next player
      const tempData: CheckersData = {
        board: newBoard,
        colors: oldData.colors,
        activeColor: newActiveColor,
        drawClock: newDrawClock,
        lastMove: newLastMove,
        terminalStatus: null,
        winnerColor: null,
      };
      const tempState: GameState = {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: otherPlayer,
        turnNumber: state.turnNumber + 1,
        data: tempData as unknown as Record<string, unknown>,
      };

      const nextPlayerActions = getLegalActionsForPlayer(tempState, otherPlayer);
      if (nextPlayerActions.length === 0) {
        terminalStatus = "no_moves";
        winnerColor = oldData.activeColor; // the player who just moved wins
      }
    }

    // Check 40-move draw rule (80 half-moves without capture)
    if (terminalStatus === null && newDrawClock >= 80) {
      terminalStatus = "draw_40_moves";
      winnerColor = null;
    }

    const newData: CheckersData = {
      board: newBoard,
      colors: { ...oldData.colors },
      activeColor: newActiveColor,
      drawClock: newDrawClock,
      lastMove: newLastMove,
      terminalStatus,
      winnerColor,
    };

    return {
      gameId: state.gameId,
      players: [...state.players],
      currentPlayer: otherPlayer,
      turnNumber: state.turnNumber + 1,
      data: newData as unknown as Record<string, unknown>,
    };
  },

  isTerminal(state: GameState): boolean {
    const data = state.data as unknown as CheckersData;
    return data.terminalStatus !== null;
  },

  getOutcome(state: GameState): Outcome {
    const data = state.data as unknown as CheckersData;

    if (data.winnerColor !== null) {
      // Find the player with the winning color
      const winnerPlayer =
        Object.entries(data.colors).find(
          ([_, color]) => color === data.winnerColor
        )?.[0] ?? null;

      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = player === winnerPlayer ? 1 : 0;
      }

      return {
        winner: winnerPlayer,
        draw: false,
        scores,
        reason: data.terminalStatus || "unknown",
      };
    }

    if (data.terminalStatus === "draw_40_moves") {
      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = 0.5;
      }

      return {
        winner: null,
        draw: true,
        scores,
        reason: "draw_40_moves",
      };
    }

    // Game still in progress
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
