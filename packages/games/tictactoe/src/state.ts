/** Cell values: "X", "O", or "" for empty */
export type CellValue = "X" | "O" | "";

/** 3x3 board represented as a flat array of 9 cells (row-major) */
export type Board = [
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
  CellValue, CellValue, CellValue,
];

/** The game-specific data stored in GameState.data */
export interface TicTacToeData {
  board: Board;
  /** Maps player address to their mark (X or O) */
  marks: Record<string, CellValue>;
}

/** All possible winning lines (indices into the flat board array) */
export const WIN_LINES: [number, number, number][] = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Board {
  return ["", "", "", "", "", "", "", "", ""];
}

export function checkWinner(board: Board): CellValue {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== "" && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return "";
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== "");
}
