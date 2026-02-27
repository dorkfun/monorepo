import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";
import { BOARD_SIZE, CellValue } from "./state";

export const HexUI: GameUISpec = {
  playerLabels: ["Red (\u2195)", "Blue (\u2194)"],

  pieces: {
    R: { symbol: "R", label: "R" },
    B: { symbol: "B", label: "B" },
  },

  inputHint: "Enter position (e.g. f6) or swap",

  maxTurns: 121, // 11 x 11

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as CellValue[][] | undefined;
    if (!board) return "Waiting for game state...";

    const lines: string[] = [];

    // Column headers: a-k
    const colHeaders =
      "     " +
      Array.from({ length: BOARD_SIZE }, (_, i) =>
        String.fromCharCode(97 + i)
      ).join("  ");
    lines.push(colHeaders);

    for (let row = 0; row < BOARD_SIZE; row++) {
      const rowNum = String(row + 1).padStart(2, " ");
      const indent = " ".repeat(row);
      const cells: string[] = [];

      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = board[row][col];
        if (cell === "R") {
          cells.push('<span class="hex-r">R</span>');
        } else if (cell === "B") {
          cells.push('<span class="hex-b">B</span>');
        } else {
          cells.push(".");
        }
      }

      lines.push(
        `${indent}${rowNum} \\  ${cells.join("  ")}  \\`
      );
    }

    return lines.join("\n");
  },

  renderStatus(publicData: Record<string, unknown>): string | null {
    const swapAvailable = publicData.swapAvailable as boolean | undefined;
    if (swapAvailable) {
      return "Swap available";
    }
    return null;
  },

  parseInput(
    raw: string,
    _publicData: Record<string, unknown>
  ): Action | null {
    const trimmed = raw.trim().toLowerCase();

    // Check for swap command
    if (trimmed === "swap") {
      return { type: "swap", data: {} };
    }

    // Parse coordinate like "f6" -> col=5, row=5
    if (trimmed.length < 2 || trimmed.length > 3) {
      return null;
    }

    const colChar = trimmed.charCodeAt(0);
    // Column: a-k -> 0-10
    if (colChar < 97 || colChar > 97 + BOARD_SIZE - 1) {
      return null;
    }
    const col = colChar - 97;

    // Row: 1-11 -> 0-10
    const rowNum = parseInt(trimmed.slice(1), 10);
    if (isNaN(rowNum) || rowNum < 1 || rowNum > BOARD_SIZE) {
      return null;
    }
    const row = rowNum - 1;

    return { type: "place", data: { row, col } };
  },

  formatAction(action: Action): string {
    if (action.type === "swap") {
      return "swap";
    }
    if (action.type === "place") {
      const { row, col } = action.data as { row: number; col: number };
      const colLetter = String.fromCharCode(97 + col);
      return `${colLetter}${row + 1}`;
    }
    return action.type;
  },

  getPlayerLabel(
    playerId: string,
    publicData: Record<string, unknown>
  ): string {
    const colors = publicData.colors as Record<string, string> | undefined;
    if (!colors) return "?";
    const color = colors[playerId];
    if (color === "R") return "Red (\u2195)";
    if (color === "B") return "Blue (\u2194)";
    return "?";
  },
};
