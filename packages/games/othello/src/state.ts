/** Cell values: "B" (Black), "W" (White), or "" (empty) */
export type CellValue = "B" | "W" | "";

/** 8x8 board represented as a 2D array */
export type Board = CellValue[][];

/** Row/column coordinate on the board */
export interface Coord {
  row: number;
  col: number;
}

/** Board dimension */
export const BOARD_SIZE = 8;

/** The game-specific data stored in GameState.data */
export interface OthelloData {
  board: Board;
  /** Maps player address to their color (B or W) */
  colors: Record<string, CellValue>;
  /** The color of the player whose turn it is */
  activeColor: CellValue;
  /** Number of consecutive passes (game ends at 2) */
  consecutivePasses: number;
  /** The last move played, or null if pass/start */
  lastMove: Coord | null;
  /** Terminal status: null if game in progress */
  terminalStatus: null | "board_full" | "double_pass";
  /** The winning color, or null if draw/in-progress */
  winnerColor: CellValue | null;
}

/** All 8 directions for flipping */
const ALL_DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/** Create an empty 8x8 board */
export function emptyBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board.push(new Array(BOARD_SIZE).fill(""));
  }
  return board;
}

/** Create the initial board with the standard center 4 pieces */
export function initialBoard(): Board {
  const board = emptyBoard();
  board[3][3] = "W";
  board[3][4] = "B";
  board[4][3] = "B";
  board[4][4] = "W";
  return board;
}

/** Deep-clone a board */
export function cloneBoard(board: Board): Board {
  return board.map((r) => [...r]);
}

/** Count pieces of each color on the board */
export function countPieces(board: Board): { B: number; W: number } {
  let B = 0;
  let W = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === "B") B++;
      else if (board[r][c] === "W") W++;
    }
  }
  return { B, W };
}

/**
 * Get all opponent pieces that would be flipped by placing `color` at (row, col).
 * Returns an empty array if the cell is occupied or no flips occur.
 */
export function getFlips(
  board: Board,
  row: number,
  col: number,
  color: CellValue
): Coord[] {
  if (board[row][col] !== "") return [];
  const opponent = color === "B" ? "W" : "B";
  const allFlips: Coord[] = [];
  for (const [dr, dc] of ALL_DIRECTIONS) {
    const lineFlips: Coord[] = [];
    let r = row + dr,
      c = col + dc;
    while (
      r >= 0 &&
      r < BOARD_SIZE &&
      c >= 0 &&
      c < BOARD_SIZE &&
      board[r][c] === opponent
    ) {
      lineFlips.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    if (
      lineFlips.length > 0 &&
      r >= 0 &&
      r < BOARD_SIZE &&
      c >= 0 &&
      c < BOARD_SIZE &&
      board[r][c] === color
    ) {
      allFlips.push(...lineFlips);
    }
  }
  return allFlips;
}

/** Check if the given color has at least one legal move on the board */
export function hasLegalMove(board: Board, color: CellValue): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getFlips(board, r, c, color).length > 0) return true;
    }
  }
  return false;
}

/** Check if every cell on the board is occupied */
export function isBoardFull(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell !== ""));
}
