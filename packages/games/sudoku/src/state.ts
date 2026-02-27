import { SudokuGrid } from "./solver";

export type Difficulty = "easy" | "medium" | "hard";

/** The game-specific data stored in GameState.data */
export interface SudokuData {
  /** Current board state (player's working grid). 0 = empty */
  board: SudokuGrid;
  /** The original puzzle (clue cells). 0 = empty (player can fill) */
  puzzle: SudokuGrid;
  /** The solved grid (hidden from observation, used for win check) */
  solution: SudokuGrid;
  /** Difficulty level */
  difficulty: Difficulty;
  /** Whether the player has resigned */
  resigned: boolean;
}

/** Clone a 9x9 grid */
export function cloneGrid(grid: SudokuGrid): SudokuGrid {
  return grid.map((row) => [...row]);
}

/** Check if a cell is a clue (given) cell */
export function isClueCell(
  puzzle: SudokuGrid,
  row: number,
  col: number
): boolean {
  return puzzle[row][col] !== 0;
}
