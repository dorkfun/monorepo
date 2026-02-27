export type SudokuGrid = number[][]; // 9x9, values 0 (empty) or 1-9

/** Find candidate digits for cell (row, col) */
export function getCandidates(
  grid: SudokuGrid,
  row: number,
  col: number
): number[] {
  const used = new Set<number>();

  // Row
  for (let c = 0; c < 9; c++) if (grid[row][c]) used.add(grid[row][c]);
  // Column
  for (let r = 0; r < 9; r++) if (grid[r][col]) used.add(grid[r][col]);
  // 3x3 box
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c]) used.add(grid[r][c]);
    }
  }

  const result: number[] = [];
  for (let v = 1; v <= 9; v++) {
    if (!used.has(v)) result.push(v);
  }
  return result;
}

/** Check if placing value at (row, col) is valid */
export function isValidPlacement(
  grid: SudokuGrid,
  row: number,
  col: number,
  value: number
): boolean {
  for (let c = 0; c < 9; c++) if (grid[row][c] === value) return false;
  for (let r = 0; r < 9; r++) if (grid[r][col] === value) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === value) return false;
    }
  }
  return true;
}

/**
 * Count solutions up to `limit`. Returns the count (capped at limit).
 * Used to verify unique solution during puzzle generation.
 */
export function countSolutions(grid: SudokuGrid, limit: number = 2): number {
  const g = grid.map((row) => [...row]);
  let count = 0;

  function solve(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === 0) {
          const candidates = getCandidates(g, r, c);
          for (const v of candidates) {
            g[r][c] = v;
            if (solve()) return true;
            g[r][c] = 0;
          }
          return false;
        }
      }
    }
    count++;
    return count >= limit;
  }

  solve();
  return count;
}

/** Check if the grid is completely and correctly solved */
export function isSolved(grid: SudokuGrid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) return false;
    }
  }
  // Verify all rows
  for (let r = 0; r < 9; r++) {
    const rowSet = new Set(grid[r]);
    if (rowSet.size !== 9) return false;
  }
  // Verify all columns
  for (let c = 0; c < 9; c++) {
    const colSet = new Set<number>();
    for (let r = 0; r < 9; r++) colSet.add(grid[r][c]);
    if (colSet.size !== 9) return false;
  }
  // Verify all 3x3 boxes
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const boxSet = new Set<number>();
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          boxSet.add(grid[r][c]);
        }
      }
      if (boxSet.size !== 9) return false;
    }
  }
  return true;
}
