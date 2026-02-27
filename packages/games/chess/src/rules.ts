import {
  GameConfig,
  GameState,
  Action,
  Outcome,
  Observation,
} from "@dorkfun/core";
import { IGameModule } from "@dorkfun/engine";
import { ChessUI } from "./ui";
import {
  ChessData,
  Color,
  CastlingRights,
  Square,
  initialBoard,
  cloneBoard,
  hashPosition,
  makeRawMove,
  isInCheck,
  hasInsufficientMaterial,
  opponentColor,
  pieceAt,
  squareEquals,
} from "./state";
import {
  isChessMoveAction,
  isChessResignAction,
  generateAllLegalMoves,
  getLegalActionsForPlayer,
} from "./actions";
import { getObservationForPlayer } from "./observation";

export const ChessModule: IGameModule = {
  gameId: "chess",
  name: "Chess",
  description: "Classic chess. All standard rules including castling, en passant, and promotion.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: ChessUI,

  init(config: GameConfig, players: string[], _rngSeed: string): GameState {
    if (players.length !== 2) {
      throw new Error("Chess requires exactly 2 players");
    }

    const board = initialBoard();
    const castlingRights: CastlingRights = {
      whiteKingside: true,
      whiteQueenside: true,
      blackKingside: true,
      blackQueenside: true,
    };

    const colors: Record<string, Color> = {
      [players[0]]: "white",
      [players[1]]: "black",
    };

    const posHash = hashPosition(board, "white", castlingRights, null);

    const data: ChessData = {
      board,
      colors,
      activeColor: "white",
      castlingRights,
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
      positionHistory: [posHash],
      inCheck: false,
      terminalStatus: null,
      winnerColor: null,
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
    if (state.currentPlayer !== playerId) return false;

    const data = state.data as unknown as ChessData;
    if (data.terminalStatus !== null) return false;

    if (isChessResignAction(action)) return true;

    if (!isChessMoveAction(action)) return false;

    // Check if this move is among legal moves
    const legalMoves = generateAllLegalMoves(
      data.board,
      data.activeColor,
      data.castlingRights,
      data.enPassantTarget
    );

    return legalMoves.some(
      (m) =>
        m.data.from.file === action.data.from.file &&
        m.data.from.rank === action.data.from.rank &&
        m.data.to.file === action.data.to.file &&
        m.data.to.rank === action.data.to.rank &&
        m.data.promotion === action.data.promotion
    );
  },

  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    _rng?: string
  ): GameState {
    const data = state.data as unknown as ChessData;

    // Handle resignation
    if (isChessResignAction(action)) {
      const activeColor = data.colors[playerId];
      const winner = opponentColor(activeColor);

      const newData: ChessData = {
        ...data,
        board: cloneBoard(data.board),
        colors: { ...data.colors },
        castlingRights: { ...data.castlingRights },
        positionHistory: [...data.positionHistory],
        terminalStatus: "resignation",
        winnerColor: winner,
        lastMove: data.lastMove,
      };

      return {
        gameId: state.gameId,
        players: state.players,
        currentPlayer: state.currentPlayer,
        turnNumber: state.turnNumber + 1,
        data: newData as unknown as Record<string, unknown>,
      };
    }

    if (!isChessMoveAction(action)) {
      throw new Error("Invalid action type");
    }

    const { from, to, promotion } = action.data;
    const movingPiece = pieceAt(data.board, from);
    if (!movingPiece) {
      throw new Error("No piece at source square");
    }

    const capturedPiece = pieceAt(data.board, to);
    const isCapture =
      capturedPiece !== null ||
      (movingPiece.kind === "pawn" &&
        data.enPassantTarget &&
        squareEquals(to, data.enPassantTarget));

    // Apply the raw move
    const newBoard = makeRawMove(
      data.board,
      from,
      to,
      data.enPassantTarget,
      promotion
    );

    // Update castling rights
    const newCastling: CastlingRights = { ...data.castlingRights };

    // King moved
    if (movingPiece.kind === "king") {
      if (movingPiece.color === "white") {
        newCastling.whiteKingside = false;
        newCastling.whiteQueenside = false;
      } else {
        newCastling.blackKingside = false;
        newCastling.blackQueenside = false;
      }
    }

    // Rook moved from starting square
    if (movingPiece.kind === "rook") {
      if (from.rank === 0 && from.file === 0) newCastling.whiteQueenside = false;
      if (from.rank === 0 && from.file === 7) newCastling.whiteKingside = false;
      if (from.rank === 7 && from.file === 0) newCastling.blackQueenside = false;
      if (from.rank === 7 && from.file === 7) newCastling.blackKingside = false;
    }

    // Rook captured at starting square (enemy rook captured)
    if (to.rank === 0 && to.file === 0) newCastling.whiteQueenside = false;
    if (to.rank === 0 && to.file === 7) newCastling.whiteKingside = false;
    if (to.rank === 7 && to.file === 0) newCastling.blackQueenside = false;
    if (to.rank === 7 && to.file === 7) newCastling.blackKingside = false;

    // Update en passant target
    let newEnPassant: Square | null = null;
    if (
      movingPiece.kind === "pawn" &&
      Math.abs(to.rank - from.rank) === 2
    ) {
      // Double push: set en passant target to the square behind the pawn
      newEnPassant = {
        file: to.file,
        rank: (from.rank + to.rank) / 2,
      };
    }

    // Update half-move clock
    const newHalfMoveClock =
      movingPiece.kind === "pawn" || isCapture ? 0 : data.halfMoveClock + 1;

    // Update full move number (increments after black moves)
    const newFullMoveNumber =
      data.activeColor === "black"
        ? data.fullMoveNumber + 1
        : data.fullMoveNumber;

    // Switch active color
    const newActiveColor = opponentColor(data.activeColor);

    // Compute position hash and update history
    const newPosHash = hashPosition(
      newBoard,
      newActiveColor,
      newCastling,
      newEnPassant
    );
    const newHistory = [...data.positionHistory, newPosHash];

    // Determine new current player
    const newCurrentPlayer = state.players.find(
      (p) => data.colors[p] === newActiveColor
    )!;

    // Check for terminal conditions
    const inCheckNow = isInCheck(newBoard, newActiveColor);
    const legalMovesForNext = generateAllLegalMoves(
      newBoard,
      newActiveColor,
      newCastling,
      newEnPassant
    );

    let terminalStatus: ChessData["terminalStatus"] = null;
    let winnerColor: Color | null = null;

    if (legalMovesForNext.length === 0) {
      if (inCheckNow) {
        terminalStatus = "checkmate";
        winnerColor = data.activeColor; // the side that just moved wins
      } else {
        terminalStatus = "stalemate";
      }
    } else if (newHalfMoveClock >= 100) {
      terminalStatus = "fifty_move";
    } else {
      // Threefold repetition
      const count = newHistory.filter((h) => h === newPosHash).length;
      if (count >= 3) {
        terminalStatus = "threefold_repetition";
      } else if (hasInsufficientMaterial(newBoard)) {
        terminalStatus = "insufficient_material";
      }
    }

    const newData: ChessData = {
      board: newBoard,
      colors: { ...data.colors },
      activeColor: newActiveColor,
      castlingRights: newCastling,
      enPassantTarget: newEnPassant,
      halfMoveClock: newHalfMoveClock,
      fullMoveNumber: newFullMoveNumber,
      positionHistory: newHistory,
      inCheck: inCheckNow,
      terminalStatus,
      winnerColor,
      lastMove: { from, to },
    };

    return {
      gameId: state.gameId,
      players: state.players,
      currentPlayer: newCurrentPlayer,
      turnNumber: state.turnNumber + 1,
      data: newData as unknown as Record<string, unknown>,
    };
  },

  isTerminal(state: GameState): boolean {
    const data = state.data as unknown as ChessData;
    return data.terminalStatus !== null;
  },

  getOutcome(state: GameState): Outcome {
    const data = state.data as unknown as ChessData;

    if (
      data.terminalStatus === "checkmate" ||
      data.terminalStatus === "resignation"
    ) {
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
        reason: data.terminalStatus,
      };
    }

    if (
      data.terminalStatus === "stalemate" ||
      data.terminalStatus === "fifty_move" ||
      data.terminalStatus === "threefold_repetition" ||
      data.terminalStatus === "insufficient_material"
    ) {
      const scores: Record<string, number> = {};
      for (const player of state.players) {
        scores[player] = 0.5;
      }

      return {
        winner: null,
        draw: true,
        scores,
        reason: data.terminalStatus,
      };
    }

    // Game in progress
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
