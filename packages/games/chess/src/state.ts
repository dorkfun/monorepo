/** Piece color */
export type Color = "white" | "black";

/** Piece kind */
export type PieceKind =
  | "king"
  | "queen"
  | "rook"
  | "bishop"
  | "knight"
  | "pawn";

/** A piece on the board */
export interface Piece {
  color: Color;
  kind: PieceKind;
}

/** Square coordinates: file 0-7 (a-h), rank 0-7 (1-8) */
export interface Square {
  file: number;
  rank: number;
}

/**
 * Board representation: 8x8 array indexed as board[rank][file].
 * null means empty square.
 * rank 0 = rank 1 (white's back rank), rank 7 = rank 8 (black's back rank).
 */
export type Board = (Piece | null)[][];

/** Castling availability flags */
export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

/** The game-specific data stored in GameState.data */
export interface ChessData {
  board: Board;
  /** Maps player address to color */
  colors: Record<string, Color>;
  /** Which side is to move */
  activeColor: Color;
  /** Castling availability */
  castlingRights: CastlingRights;
  /**
   * En passant target square, or null.
   * This is the square behind the pawn that just double-advanced
   * (i.e., the square where a capturing pawn would land).
   */
  enPassantTarget: Square | null;
  /** Half-move clock for the 50-move rule (resets on pawn move or capture) */
  halfMoveClock: number;
  /** Full move number (starts at 1, increments after black moves) */
  fullMoveNumber: number;
  /**
   * History of position hashes for threefold repetition detection.
   * Each entry is a FEN-like string of board + activeColor + castlingRights + enPassantTarget.
   */
  positionHistory: string[];
  /** Whether the active side's king is in check */
  inCheck: boolean;
  /**
   * Terminal status. null = game in progress.
   */
  terminalStatus:
    | null
    | "checkmate"
    | "stalemate"
    | "fifty_move"
    | "threefold_repetition"
    | "insufficient_material"
    | "resignation";
  /** The winning color when terminalStatus is "checkmate" or "resignation", else null */
  winnerColor: Color | null;
  /** The last move made (from → to), or null at game start */
  lastMove: { from: Square; to: Square } | null;
}

// ---------------------------------------------------------------------------
// Board initialization
// ---------------------------------------------------------------------------

function backRank(color: Color): (Piece | null)[] {
  const kinds: PieceKind[] = [
    "rook",
    "knight",
    "bishop",
    "queen",
    "king",
    "bishop",
    "knight",
    "rook",
  ];
  return kinds.map((kind) => ({ color, kind }));
}

function pawnRank(color: Color): (Piece | null)[] {
  return Array.from({ length: 8 }, () => ({ color, kind: "pawn" as PieceKind }));
}

function emptyRank(): (Piece | null)[] {
  return Array.from({ length: 8 }, () => null);
}

/** Returns the standard chess starting position board */
export function initialBoard(): Board {
  return [
    backRank("white"), // rank 0 = rank 1
    pawnRank("white"),  // rank 1 = rank 2
    emptyRank(),
    emptyRank(),
    emptyRank(),
    emptyRank(),
    pawnRank("black"),  // rank 6 = rank 7
    backRank("black"), // rank 7 = rank 8
  ];
}

// ---------------------------------------------------------------------------
// Board utilities
// ---------------------------------------------------------------------------

/** Deep-clone the board */
export function cloneBoard(board: Board): Board {
  return board.map((rank) =>
    rank.map((cell) => (cell ? { ...cell } : null))
  );
}

/** Check if a square is within bounds (0-7 for both file and rank) */
export function isInBounds(sq: Square): boolean {
  return sq.file >= 0 && sq.file <= 7 && sq.rank >= 0 && sq.rank <= 7;
}

/** Get piece at a square, or null if empty or out of bounds */
export function pieceAt(board: Board, sq: Square): Piece | null {
  if (!isInBounds(sq)) return null;
  return board[sq.rank][sq.file];
}

/** Get the opponent color */
export function opponentColor(color: Color): Color {
  return color === "white" ? "black" : "white";
}

/** Find the king square for a given color. Throws if not found. */
export function findKing(board: Board, color: Color): Square {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file];
      if (p && p.color === color && p.kind === "king") {
        return { file, rank };
      }
    }
  }
  throw new Error(`King not found for ${color}`);
}

/** Compare two squares for equality */
export function squareEquals(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank;
}

// ---------------------------------------------------------------------------
// Attack detection
// ---------------------------------------------------------------------------

const KNIGHT_OFFSETS: [number, number][] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

const KING_OFFSETS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

const DIAGONAL_DIRS: [number, number][] = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

const CARDINAL_DIRS: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

/**
 * Check if a given square is attacked by any piece of the given color.
 * Uses reverse-lookup: from the target square, check if attackers exist in expected positions.
 */
export function isSquareAttackedBy(
  board: Board,
  sq: Square,
  byColor: Color
): boolean {
  // 1. Pawn attacks
  const pawnDir = byColor === "white" ? -1 : 1; // rank direction pawns come FROM
  for (const df of [-1, 1]) {
    const fromSq: Square = { file: sq.file + df, rank: sq.rank + pawnDir };
    if (isInBounds(fromSq)) {
      const p = board[fromSq.rank][fromSq.file];
      if (p && p.color === byColor && p.kind === "pawn") return true;
    }
  }

  // 2. Knight attacks
  for (const [dr, df] of KNIGHT_OFFSETS) {
    const fromSq: Square = { file: sq.file + df, rank: sq.rank + dr };
    if (isInBounds(fromSq)) {
      const p = board[fromSq.rank][fromSq.file];
      if (p && p.color === byColor && p.kind === "knight") return true;
    }
  }

  // 3. King attacks (adjacency)
  for (const [dr, df] of KING_OFFSETS) {
    const fromSq: Square = { file: sq.file + df, rank: sq.rank + dr };
    if (isInBounds(fromSq)) {
      const p = board[fromSq.rank][fromSq.file];
      if (p && p.color === byColor && p.kind === "king") return true;
    }
  }

  // 4. Sliding attacks - diagonals (bishop/queen)
  for (const [dr, df] of DIAGONAL_DIRS) {
    let r = sq.rank + dr;
    let f = sq.file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const p = board[r][f];
      if (p) {
        if (
          p.color === byColor &&
          (p.kind === "bishop" || p.kind === "queen")
        ) {
          return true;
        }
        break; // blocked by a piece
      }
      r += dr;
      f += df;
    }
  }

  // 5. Sliding attacks - cardinal (rook/queen)
  for (const [dr, df] of CARDINAL_DIRS) {
    let r = sq.rank + dr;
    let f = sq.file + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const p = board[r][f];
      if (p) {
        if (
          p.color === byColor &&
          (p.kind === "rook" || p.kind === "queen")
        ) {
          return true;
        }
        break;
      }
      r += dr;
      f += df;
    }
  }

  return false;
}

/** Check if the given color's king is in check */
export function isInCheck(board: Board, color: Color): boolean {
  const kingSq = findKing(board, color);
  return isSquareAttackedBy(board, kingSq, opponentColor(color));
}

// ---------------------------------------------------------------------------
// Insufficient material detection
// ---------------------------------------------------------------------------

/** Detect insufficient material for forced checkmate */
export function hasInsufficientMaterial(board: Board): boolean {
  const pieces: { color: Color; kind: PieceKind; file: number; rank: number }[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file];
      if (p) {
        pieces.push({ color: p.color, kind: p.kind, file, rank });
      }
    }
  }

  // Filter out kings
  const nonKings = pieces.filter((p) => p.kind !== "king");

  // K vs K
  if (nonKings.length === 0) return true;

  // K+minor vs K (one bishop or one knight)
  if (nonKings.length === 1) {
    const p = nonKings[0];
    if (p.kind === "bishop" || p.kind === "knight") return true;
  }

  // K+B vs K+B with same-color bishops
  if (nonKings.length === 2) {
    const [a, b] = nonKings;
    if (
      a.kind === "bishop" &&
      b.kind === "bishop" &&
      a.color !== b.color && // opposing sides
      (a.file + a.rank) % 2 === (b.file + b.rank) % 2 // same square color
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Position hashing for threefold repetition
// ---------------------------------------------------------------------------

const PIECE_CHARS: Record<string, string> = {
  "white-king": "K",
  "white-queen": "Q",
  "white-rook": "R",
  "white-bishop": "B",
  "white-knight": "N",
  "white-pawn": "P",
  "black-king": "k",
  "black-queen": "q",
  "black-rook": "r",
  "black-bishop": "b",
  "black-knight": "n",
  "black-pawn": "p",
};

/**
 * Generate a FEN-like position string for threefold repetition detection.
 * Includes: board layout, active color, castling rights, en passant target.
 * Excludes: move clocks (not relevant for repetition per FIDE rules).
 */
export function hashPosition(
  board: Board,
  activeColor: Color,
  castlingRights: CastlingRights,
  enPassantTarget: Square | null
): string {
  // Board layout (FEN board portion)
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    let rankStr = "";
    for (let file = 0; file < 8; file++) {
      const p = board[rank][file];
      if (p) {
        if (empty > 0) {
          rankStr += empty;
          empty = 0;
        }
        rankStr += PIECE_CHARS[`${p.color}-${p.kind}`];
      } else {
        empty++;
      }
    }
    if (empty > 0) rankStr += empty;
    ranks.push(rankStr);
  }

  const boardStr = ranks.join("/");

  // Active color
  const colorStr = activeColor === "white" ? "w" : "b";

  // Castling rights
  let castleStr = "";
  if (castlingRights.whiteKingside) castleStr += "K";
  if (castlingRights.whiteQueenside) castleStr += "Q";
  if (castlingRights.blackKingside) castleStr += "k";
  if (castlingRights.blackQueenside) castleStr += "q";
  if (castleStr === "") castleStr = "-";

  // En passant target
  const epStr = enPassantTarget
    ? String.fromCharCode(97 + enPassantTarget.file) + (enPassantTarget.rank + 1)
    : "-";

  return `${boardStr} ${colorStr} ${castleStr} ${epStr}`;
}

// ---------------------------------------------------------------------------
// Raw move application (no legality check)
// ---------------------------------------------------------------------------

/**
 * Apply a move on a cloned board. Handles castling, en passant, and promotion.
 * Does NOT validate legality. Returns the new board.
 */
export function makeRawMove(
  board: Board,
  from: Square,
  to: Square,
  enPassantTarget: Square | null,
  promotion?: PieceKind
): Board {
  const newBoard = cloneBoard(board);
  const piece = newBoard[from.rank][from.file];
  if (!piece) throw new Error("No piece at source square");

  // Determine what to place at the destination
  const destPiece: Piece = promotion
    ? { color: piece.color, kind: promotion }
    : piece;

  // Handle castling: king moving 2 squares horizontally
  if (piece.kind === "king" && Math.abs(to.file - from.file) === 2) {
    // Move king
    newBoard[to.rank][to.file] = destPiece;
    newBoard[from.rank][from.file] = null;

    // Move rook
    if (to.file > from.file) {
      // Kingside: rook from h-file to f-file
      const rookFile = 7;
      const rookDestFile = 5;
      newBoard[from.rank][rookDestFile] = newBoard[from.rank][rookFile];
      newBoard[from.rank][rookFile] = null;
    } else {
      // Queenside: rook from a-file to d-file
      const rookFile = 0;
      const rookDestFile = 3;
      newBoard[from.rank][rookDestFile] = newBoard[from.rank][rookFile];
      newBoard[from.rank][rookFile] = null;
    }
    return newBoard;
  }

  // Handle en passant: pawn moving diagonally to empty square = ep target
  if (
    piece.kind === "pawn" &&
    enPassantTarget &&
    to.file !== from.file &&
    squareEquals(to, enPassantTarget)
  ) {
    // Place pawn at destination
    newBoard[to.rank][to.file] = destPiece;
    newBoard[from.rank][from.file] = null;
    // Remove captured pawn (one rank behind the destination, from the attacker's perspective)
    const capturedRank = piece.color === "white" ? to.rank - 1 : to.rank + 1;
    newBoard[capturedRank][to.file] = null;
    return newBoard;
  }

  // Standard move (including captures and promotion)
  newBoard[to.rank][to.file] = destPiece;
  newBoard[from.rank][from.file] = null;
  return newBoard;
}
