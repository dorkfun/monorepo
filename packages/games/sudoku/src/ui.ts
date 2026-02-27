import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";

export const SudokuUI: GameUISpec = {
  playerLabels: ["Player"],

  pieces: {
    "1": { symbol: "1", label: "1" },
    "2": { symbol: "2", label: "2" },
    "3": { symbol: "3", label: "3" },
    "4": { symbol: "4", label: "4" },
    "5": { symbol: "5", label: "5" },
    "6": { symbol: "6", label: "6" },
    "7": { symbol: "7", label: "7" },
    "8": { symbol: "8", label: "8" },
    "9": { symbol: "9", label: "9" },
  },

  inputHint:
    'Enter "R C V" to place (e.g. "3 5 7"), "clear R C" to clear, or "resign"',

  maxTurns: null,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as number[][] | undefined;
    const puzzle = publicData.puzzle as number[][] | undefined;
    if (!board || !puzzle) return "Waiting for game state...";

    // Build a conflict set for player-entered cells
    const conflicts = new Set<string>();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c] !== 0 || board[r][c] === 0) continue;
        const val = board[r][c];
        // Check row
        for (let cc = 0; cc < 9; cc++) {
          if (cc !== c && board[r][cc] === val) { conflicts.add(`${r},${c}`); break; }
        }
        if (conflicts.has(`${r},${c}`)) continue;
        // Check column
        for (let rr = 0; rr < 9; rr++) {
          if (rr !== r && board[rr][c] === val) { conflicts.add(`${r},${c}`); break; }
        }
        if (conflicts.has(`${r},${c}`)) continue;
        // Check 3x3 box
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let rr = br; rr < br + 3; rr++) {
          for (let cc = bc; cc < bc + 3; cc++) {
            if (rr !== r || cc !== c) {
              if (board[rr][cc] === val) { conflicts.add(`${r},${c}`); }
            }
          }
        }
      }
    }

    const lines: string[] = [];
    lines.push("    1 2 3   4 5 6   7 8 9");
    lines.push("  +-------+-------+-------+");

    for (let r = 0; r < 9; r++) {
      if (r > 0 && r % 3 === 0) {
        lines.push("  +-------+-------+-------+");
      }
      let row = `${r + 1} |`;
      for (let c = 0; c < 9; c++) {
        if (c > 0 && c % 3 === 0) row += "|";
        const val = board[r][c];
        if (val === 0) {
          row += " .";
        } else if (puzzle[r][c] !== 0) {
          // Clue cell — original puzzle number
          row += ` <span class="sudoku-clue">${val}</span>`;
        } else if (conflicts.has(`${r},${c}`)) {
          // Player-entered cell with a conflict
          row += ` <span class="sudoku-error">${val}</span>`;
        } else {
          // Player-entered cell, no conflict
          row += ` <span class="sudoku-player">${val}</span>`;
        }
        if (c % 3 === 2) row += " ";
      }
      row += "|";
      lines.push(row);
    }
    lines.push("  +-------+-------+-------+");

    const difficulty = publicData.difficulty as string;
    lines.push(`  Difficulty: ${difficulty}`);

    return lines.join("\n");
  },

  renderStatus(publicData: Record<string, unknown>): string | null {
    const resigned = publicData.resigned as boolean;
    if (resigned) return "You resigned.";

    const board = publicData.board as number[][] | undefined;
    if (!board) return null;

    let empty = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) empty++;
      }
    }
    if (empty === 0) return "Board is full! Checking solution...";
    return `${empty} cells remaining`;
  },

  parseInput(
    raw: string,
    _publicData: Record<string, unknown>
  ): Action | null {
    const trimmed = raw.trim().toLowerCase();

    if (trimmed === "resign") {
      return { type: "resign", data: {} };
    }

    // "clear R C"
    const clearMatch = trimmed.match(/^clear\s+(\d)\s+(\d)$/);
    if (clearMatch) {
      const row = parseInt(clearMatch[1], 10) - 1;
      const col = parseInt(clearMatch[2], 10) - 1;
      if (row >= 0 && row <= 8 && col >= 0 && col <= 8) {
        return { type: "clear", data: { row, col } };
      }
      return null;
    }

    // "R C V" — place digit
    const placeMatch = trimmed.match(/^(\d)\s+(\d)\s+(\d)$/);
    if (placeMatch) {
      const row = parseInt(placeMatch[1], 10) - 1;
      const col = parseInt(placeMatch[2], 10) - 1;
      const value = parseInt(placeMatch[3], 10);
      if (
        row >= 0 &&
        row <= 8 &&
        col >= 0 &&
        col <= 8 &&
        value >= 1 &&
        value <= 9
      ) {
        return { type: "place", data: { row, col, value } };
      }
      return null;
    }

    return null;
  },

  formatAction(action: Action): string {
    if (action.type === "place") {
      const { row, col, value } = action.data as {
        row: number;
        col: number;
        value: number;
      };
      return `place ${value} at (${row + 1},${col + 1})`;
    }
    if (action.type === "clear") {
      const { row, col } = action.data as { row: number; col: number };
      return `clear (${row + 1},${col + 1})`;
    }
    if (action.type === "resign") {
      return "resign";
    }
    return action.type;
  },

  getPlayerLabel(
    _playerId: string,
    _publicData: Record<string, unknown>
  ): string {
    return "Player";
  },
};
