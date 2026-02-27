import { Action, GameState } from "@dorkfun/core";
import {
  Board,
  CastlingRights,
  ChessData,
  Color,
  Piece,
  PieceKind,
  Square,
  isInBounds,
  isInCheck,
  isSquareAttackedBy,
  makeRawMove,
  opponentColor,
  pieceAt,
} from "./state";

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export interface ChessMoveAction extends Action {
  type: "move";
  data: {
    from: Square;
    to: Square;
    promotion?: PieceKind;
  };
}

export interface ChessResignAction extends Action {
  type: "resign";
  data: Record<string, never>;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isChessMoveAction(action: Action): action is ChessMoveAction {
  if (action.type !== "move") return false;
  const d = action.data as Record<string, unknown>;
  const from = d.from as Square | undefined;
  const to = d.to as Square | undefined;
  if (!from || !to) return false;
  if (
    typeof from.file !== "number" ||
    typeof from.rank !== "number" ||
    typeof to.file !== "number" ||
    typeof to.rank !== "number"
  )
    return false;
  if (!isInBounds(from) || !isInBounds(to)) return false;
  if (d.promotion !== undefined) {
    const valid: PieceKind[] = ["queen", "rook", "bishop", "knight"];
    if (!valid.includes(d.promotion as PieceKind)) return false;
  }
  return true;
}

export function isChessResignAction(
  action: Action
): action is ChessResignAction {
  return action.type === "resign";
}

// ---------------------------------------------------------------------------
// Pseudo-legal move generation (per piece type)
// ---------------------------------------------------------------------------

interface RawMove {
  from: Square;
  to: Square;
  promotion?: PieceKind;
}

function addIfValid(
  moves: RawMove[],
  board: Board,
  from: Square,
  to: Square,
  ownColor: Color
): void {
  if (!isInBounds(to)) return;
  const target = board[to.rank][to.file];
  if (target && target.color === ownColor) return; // can't capture own piece
  moves.push({ from, to });
}

function generatePawnMoves(
  board: Board,
  sq: Square,
  color: Color,
  enPassantTarget: Square | null
): RawMove[] {
  const moves: RawMove[] = [];
  const dir = color === "white" ? 1 : -1;
  const startRank = color === "white" ? 1 : 6;
  const promoRank = color === "white" ? 7 : 0;

  // Single push
  const oneAhead: Square = { file: sq.file, rank: sq.rank + dir };
  if (isInBounds(oneAhead) && !board[oneAhead.rank][oneAhead.file]) {
    if (oneAhead.rank === promoRank) {
      for (const kind of ["queen", "rook", "bishop", "knight"] as PieceKind[]) {
        moves.push({ from: sq, to: oneAhead, promotion: kind });
      }
    } else {
      moves.push({ from: sq, to: oneAhead });
    }

    // Double push (only if single push was possible)
    if (sq.rank === startRank) {
      const twoAhead: Square = { file: sq.file, rank: sq.rank + 2 * dir };
      if (!board[twoAhead.rank][twoAhead.file]) {
        moves.push({ from: sq, to: twoAhead });
      }
    }
  }

  // Diagonal captures
  for (const df of [-1, 1]) {
    const capSq: Square = { file: sq.file + df, rank: sq.rank + dir };
    if (!isInBounds(capSq)) continue;

    const target = board[capSq.rank][capSq.file];
    const isCapture = target && target.color !== color;
    const isEnPassant =
      enPassantTarget &&
      capSq.file === enPassantTarget.file &&
      capSq.rank === enPassantTarget.rank;

    if (isCapture || isEnPassant) {
      if (capSq.rank === promoRank) {
        for (const kind of ["queen", "rook", "bishop", "knight"] as PieceKind[]) {
          moves.push({ from: sq, to: capSq, promotion: kind });
        }
      } else {
        moves.push({ from: sq, to: capSq });
      }
    }
  }

  return moves;
}

function generateKnightMoves(
  board: Board,
  sq: Square,
  color: Color
): RawMove[] {
  const moves: RawMove[] = [];
  const offsets: [number, number][] = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, df] of offsets) {
    addIfValid(moves, board, sq, { file: sq.file + df, rank: sq.rank + dr }, color);
  }
  return moves;
}

function generateSlidingMoves(
  board: Board,
  sq: Square,
  color: Color,
  directions: [number, number][]
): RawMove[] {
  const moves: RawMove[] = [];
  for (const [dr, df] of directions) {
    let r = sq.rank + dr;
    let f = sq.file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const target = board[r][f];
      if (target) {
        if (target.color !== color) {
          moves.push({ from: sq, to: { file: f, rank: r } });
        }
        break; // blocked
      }
      moves.push({ from: sq, to: { file: f, rank: r } });
      r += dr;
      f += df;
    }
  }
  return moves;
}

function generateBishopMoves(
  board: Board,
  sq: Square,
  color: Color
): RawMove[] {
  return generateSlidingMoves(board, sq, color, [
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ]);
}

function generateRookMoves(
  board: Board,
  sq: Square,
  color: Color
): RawMove[] {
  return generateSlidingMoves(board, sq, color, [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ]);
}

function generateQueenMoves(
  board: Board,
  sq: Square,
  color: Color
): RawMove[] {
  return [
    ...generateBishopMoves(board, sq, color),
    ...generateRookMoves(board, sq, color),
  ];
}

function generateKingMoves(
  board: Board,
  sq: Square,
  color: Color,
  castlingRights: CastlingRights
): RawMove[] {
  const moves: RawMove[] = [];
  const offsets: [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];
  for (const [dr, df] of offsets) {
    addIfValid(moves, board, sq, { file: sq.file + df, rank: sq.rank + dr }, color);
  }

  // Castling
  const enemy = opponentColor(color);
  const kingInCheck = isSquareAttackedBy(board, sq, enemy);
  if (kingInCheck) return moves; // can't castle out of check

  const backRank = color === "white" ? 0 : 7;

  // Kingside
  const ksRight =
    color === "white"
      ? castlingRights.whiteKingside
      : castlingRights.blackKingside;
  if (ksRight) {
    const rookSq = board[backRank][7];
    const fEmpty = !board[backRank][5];
    const gEmpty = !board[backRank][6];
    if (
      rookSq &&
      rookSq.color === color &&
      rookSq.kind === "rook" &&
      fEmpty &&
      gEmpty &&
      !isSquareAttackedBy(board, { file: 5, rank: backRank }, enemy) &&
      !isSquareAttackedBy(board, { file: 6, rank: backRank }, enemy)
    ) {
      moves.push({ from: sq, to: { file: 6, rank: backRank } });
    }
  }

  // Queenside
  const qsRight =
    color === "white"
      ? castlingRights.whiteQueenside
      : castlingRights.blackQueenside;
  if (qsRight) {
    const rookSq = board[backRank][0];
    const bEmpty = !board[backRank][1];
    const cEmpty = !board[backRank][2];
    const dEmpty = !board[backRank][3];
    if (
      rookSq &&
      rookSq.color === color &&
      rookSq.kind === "rook" &&
      bEmpty &&
      cEmpty &&
      dEmpty &&
      !isSquareAttackedBy(board, { file: 3, rank: backRank }, enemy) &&
      !isSquareAttackedBy(board, { file: 2, rank: backRank }, enemy)
    ) {
      moves.push({ from: sq, to: { file: 2, rank: backRank } });
    }
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Full pseudo-legal generation for one piece
// ---------------------------------------------------------------------------

function generatePieceMoves(
  board: Board,
  sq: Square,
  piece: Piece,
  castlingRights: CastlingRights,
  enPassantTarget: Square | null
): RawMove[] {
  switch (piece.kind) {
    case "pawn":
      return generatePawnMoves(board, sq, piece.color, enPassantTarget);
    case "knight":
      return generateKnightMoves(board, sq, piece.color);
    case "bishop":
      return generateBishopMoves(board, sq, piece.color);
    case "rook":
      return generateRookMoves(board, sq, piece.color);
    case "queen":
      return generateQueenMoves(board, sq, piece.color);
    case "king":
      return generateKingMoves(board, sq, piece.color, castlingRights);
  }
}

// ---------------------------------------------------------------------------
// Legal move generation (pseudo-legal + check filter)
// ---------------------------------------------------------------------------

/**
 * Generate all legal moves for the active color.
 * 1. Generate all pseudo-legal moves.
 * 2. For each, apply on a cloned board and discard if own king is in check.
 */
export function generateAllLegalMoves(
  board: Board,
  activeColor: Color,
  castlingRights: CastlingRights,
  enPassantTarget: Square | null
): ChessMoveAction[] {
  const pseudoLegal: RawMove[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.color === activeColor) {
        const sq: Square = { file, rank };
        pseudoLegal.push(
          ...generatePieceMoves(board, sq, piece, castlingRights, enPassantTarget)
        );
      }
    }
  }

  // Filter: discard moves that leave own king in check
  const legal: ChessMoveAction[] = [];
  for (const mv of pseudoLegal) {
    const newBoard = makeRawMove(board, mv.from, mv.to, enPassantTarget, mv.promotion);
    if (!isInCheck(newBoard, activeColor)) {
      const data: { from: Square; to: Square; promotion?: PieceKind } = {
        from: { file: mv.from.file, rank: mv.from.rank },
        to: { file: mv.to.file, rank: mv.to.rank },
      };
      if (mv.promotion) data.promotion = mv.promotion;
      legal.push({ type: "move", data } as ChessMoveAction);
    }
  }

  return legal;
}

// ---------------------------------------------------------------------------
// Public API for the rules module
// ---------------------------------------------------------------------------

/**
 * Get all legal actions for a player. Returns [] if not their turn or game is terminal.
 */
export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  if (state.currentPlayer !== playerId) return [];

  const data = state.data as unknown as ChessData;
  if (data.terminalStatus !== null) return [];

  const moves = generateAllLegalMoves(
    data.board,
    data.activeColor,
    data.castlingRights,
    data.enPassantTarget
  );

  // Add resign action
  return [...moves, { type: "resign", data: {} }];
}
