export type PieceColor = "black" | "white";
export type PieceType = "man" | "king";

export interface CheckerPiece {
  color: PieceColor;
  type: PieceType;
}

export interface Coord {
  row: number;
  col: number;
}

/** 8x8 board. board[row][col]. null = empty. Pieces only on dark squares where (row+col) % 2 === 1 */
export type Board = (CheckerPiece | null)[][];

export interface CheckersData {
  board: Board;
  colors: Record<string, PieceColor>; // player address -> color
  activeColor: PieceColor;
  drawClock: number; // half-moves since last capture, reset on capture
  lastMove: { from: Coord; to: Coord } | null;
  terminalStatus: null | "no_pieces" | "no_moves" | "draw_40_moves";
  winnerColor: PieceColor | null;
}

export const BOARD_SIZE = 8;

/** Create an empty 8x8 board filled with null */
export function emptyBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: (CheckerPiece | null)[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push(null);
    }
    board.push(row);
  }
  return board;
}

/**
 * Set up the initial American checkers board.
 * Black pieces on rows 0-2 (dark squares), white pieces on rows 5-7 (dark squares).
 * Rows 3-4 are empty.
 */
export function initialBoard(): Board {
  const board = emptyBoard();
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!isDarkSquare(r, c)) continue;
      if (r <= 2) {
        board[r][c] = { color: "black", type: "man" };
      } else if (r >= 5) {
        board[r][c] = { color: "white", type: "man" };
      }
    }
  }
  return board;
}

/** Deep clone a board */
export function cloneBoard(board: Board): Board {
  return board.map((r) => r.map((c) => (c ? { ...c } : null)));
}

/** Check if a coordinate is within the 8x8 board */
export function isInBounds(coord: Coord): boolean {
  return (
    coord.row >= 0 &&
    coord.row < BOARD_SIZE &&
    coord.col >= 0 &&
    coord.col < BOARD_SIZE
  );
}

/** Check if a square is dark (playable). Dark squares have (row+col) % 2 === 1 */
export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

/** Get the piece at a coordinate, or null if empty/out of bounds */
export function pieceAt(board: Board, coord: Coord): CheckerPiece | null {
  if (!isInBounds(coord)) return null;
  return board[coord.row][coord.col];
}

/** Get all coordinates containing a piece of the given color */
export function getPiecesOfColor(board: Board, color: PieceColor): Coord[] {
  const coords: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        coords.push({ row: r, col: c });
      }
    }
  }
  return coords;
}

/** Count how many pieces of a given color are on the board */
export function countPieces(board: Board, color: PieceColor): number {
  let count = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        count++;
      }
    }
  }
  return count;
}
