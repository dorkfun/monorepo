/** Cell values: "R" (Red), "B" (Blue), or "" (empty) */
export type CellValue = "R" | "B" | "";

/** 11x11 board represented as a 2D array */
export type Board = CellValue[][];

/** Board dimension */
export const BOARD_SIZE = 11;

/** The game-specific data stored in GameState.data */
export interface HexData {
  board: Board;
  /** Maps player address to their color (R or B) */
  colors: Record<string, CellValue>;
  /** The color of the player whose turn it is */
  activeColor: CellValue;
  /** Whether the swap rule is available (true after first move, on turn 1) */
  swapAvailable: boolean;
  /** Whether a swap has occurred */
  swapped: boolean;
  /** The last move played */
  lastMove: { row: number; col: number } | null;
  /** The first move played (needed for swap rule) */
  firstMove: { row: number; col: number } | null;
  /** Terminal status: null if game in progress, "connected" if a player connected their sides */
  terminalStatus: null | "connected";
  /** The color that won, or null if no winner yet */
  winnerColor: CellValue | null;
}

/** Create an empty 11x11 board */
export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array(BOARD_SIZE).fill("") as CellValue[]
  );
}

/** Deep clone a board */
export function cloneBoard(board: Board): Board {
  return board.map((r) => [...r]);
}

/**
 * Hex adjacency offsets. Each hex cell has 6 neighbors.
 * Using offset (axial) coordinates:
 *   (-1, 0), (-1, +1),
 *   (0, -1),           (0, +1),
 *   (+1, -1), (+1, 0)
 */
const HEX_NEIGHBORS: [number, number][] = [
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
];

/**
 * Check if a given color has won using BFS.
 *
 * Red connects top (row 0) to bottom (row BOARD_SIZE - 1).
 * Blue connects left (col 0) to right (col BOARD_SIZE - 1).
 */
export function checkWin(board: Board, color: CellValue): boolean {
  if (color === "") return false;
  const size = BOARD_SIZE;
  const visited: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const queue: [number, number][] = [];

  if (color === "R") {
    // BFS from top row
    for (let col = 0; col < size; col++) {
      if (board[0][col] === "R") {
        queue.push([0, col]);
        visited[0][col] = true;
      }
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (r === size - 1) return true; // reached bottom
      for (const [dr, dc] of HEX_NEIGHBORS) {
        const nr = r + dr,
          nc = c + dc;
        if (
          nr >= 0 &&
          nr < size &&
          nc >= 0 &&
          nc < size &&
          !visited[nr][nc] &&
          board[nr][nc] === "R"
        ) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
  } else {
    // Blue: BFS from left column
    for (let row = 0; row < size; row++) {
      if (board[row][0] === "B") {
        queue.push([row, 0]);
        visited[row][0] = true;
      }
    }
    while (queue.length > 0) {
      const [r, c] = queue.shift()!;
      if (c === size - 1) return true; // reached right
      for (const [dr, dc] of HEX_NEIGHBORS) {
        const nr = r + dr,
          nc = c + dc;
        if (
          nr >= 0 &&
          nr < size &&
          nc >= 0 &&
          nc < size &&
          !visited[nr][nc] &&
          board[nr][nc] === "B"
        ) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
  }
  return false;
}
