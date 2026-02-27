/** Cell values: "R" for Red, "Y" for Yellow, or "" for empty */
export type CellValue = "R" | "Y" | "";

/**
 * 6 rows x 7 columns board.
 * Row 0 is the bottom row, row 5 is the top row.
 * board[row][col]
 */
export type Board = CellValue[][];

/** The game-specific data stored in GameState.data */
export interface ConnectFourData {
  board: Board;
  /** Maps player address to their color (R or Y) */
  colors: Record<string, CellValue>;
  /** The last move made, or null if no moves yet */
  lastMove: { row: number; col: number } | null;
}

export const ROWS = 6;
export const COLS = 7;

/** Create an empty 6x7 board filled with "" */
export function emptyBoard(): Board {
  const board: Board = [];
  for (let r = 0; r < ROWS; r++) {
    board.push(new Array<CellValue>(COLS).fill(""));
  }
  return board;
}

/** Deep clone a board */
export function cloneBoard(board: Board): Board {
  return board.map((r) => [...r]);
}

/**
 * Find the lowest empty row in a column.
 * Iterates from row 0 (bottom) upward.
 * Returns the row index, or null if the column is full.
 */
export function getDropRow(board: Board, col: number): number | null {
  for (let r = 0; r < ROWS; r++) {
    if (board[r][col] === "") {
      return r;
    }
  }
  return null;
}

/**
 * Check for a winner by scanning all cells in 4 directions:
 * horizontal [0,1], vertical [1,0], diagonal-up [1,1], diagonal-down [1,-1].
 * Returns the winning CellValue ("R" or "Y") or "" if no winner.
 */
export function checkWinner(board: Board): CellValue {
  const directions: [number, number][] = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal up-right
    [1, -1], // diagonal up-left
  ];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell === "") continue;

      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step++) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[nr][nc] !== cell) break;
          count++;
        }
        if (count >= 4) {
          return cell;
        }
      }
    }
  }

  return "";
}

/**
 * Check if the board is full.
 * The board is full when the top row (row 5) has no empty cells.
 */
export function isBoardFull(board: Board): boolean {
  return board[ROWS - 1].every((cell) => cell !== "");
}
