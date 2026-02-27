import { SeededRng } from "./prng";
import { SudokuGrid, getCandidates, countSolutions } from "./solver";

export type Difficulty = "easy" | "medium" | "hard";

/** Target clue count ranges by difficulty */
const CLUE_RANGES: Record<Difficulty, [number, number]> = {
  easy: [36, 45],
  medium: [28, 35],
  hard: [22, 27],
};

/**
 * Generate a complete valid Sudoku grid using backtracking
 * with randomized candidate ordering (driven by PRNG for determinism).
 */
function generateSolvedGrid(rng: SeededRng): SudokuGrid {
  const grid: SudokuGrid = Array.from({ length: 9 }, () => Array(9).fill(0));

  function fill(pos: number): boolean {
    if (pos === 81) return true;
    const row = Math.floor(pos / 9);
    const col = pos % 9;

    const candidates = getCandidates(grid, row, col);
    rng.shuffle(candidates);

    for (const v of candidates) {
      grid[row][col] = v;
      if (fill(pos + 1)) return true;
      grid[row][col] = 0;
    }
    return false;
  }

  fill(0);
  return grid;
}

/**
 * Generate a Sudoku puzzle by removing cells from a solved grid.
 * Ensures unique solution at each removal step.
 * Returns { puzzle, solution }.
 */
export function generatePuzzle(
  rngSeed: string,
  difficulty: Difficulty
): { puzzle: SudokuGrid; solution: SudokuGrid } {
  const rng = new SeededRng(rngSeed);
  const solution = generateSolvedGrid(rng);
  const puzzle = solution.map((row) => [...row]);

  const [minClues, maxClues] = CLUE_RANGES[difficulty];
  const targetClues = minClues + rng.nextInt(maxClues - minClues + 1);

  // Build a list of all 81 cell positions and shuffle them
  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push([r, c]);
    }
  }
  rng.shuffle(positions);

  let cluesRemaining = 81;

  for (const [r, c] of positions) {
    if (cluesRemaining <= targetClues) break;

    const saved = puzzle[r][c];
    puzzle[r][c] = 0;

    if (countSolutions(puzzle, 2) !== 1) {
      // Removing this cell creates multiple solutions; restore it
      puzzle[r][c] = saved;
    } else {
      cluesRemaining--;
    }
  }

  return { puzzle, solution };
}
