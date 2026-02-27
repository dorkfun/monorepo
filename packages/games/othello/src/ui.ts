import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";
import { CellValue, Board, BOARD_SIZE } from "./state";

export const OthelloUI: GameUISpec = {
  playerLabels: ["Black", "White"],

  pieces: {
    B: { symbol: "\u25CF", label: "B" },
    W: { symbol: "\u25CB", label: "W" },
  },

  inputHint: "Enter position (e.g. d3) or pass",

  maxTurns: 60,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as Board | undefined;
    if (!board) return "Waiting for game state...";

    const colLetters = "abcdefgh";
    const lines: string[] = [];

    // Column header
    lines.push("    " + colLetters.split("").join("   "));
    // Top border
    lines.push("  \u250C" + "\u2500\u2500\u2500\u252C".repeat(BOARD_SIZE - 1) + "\u2500\u2500\u2500\u2510");

    for (let r = 0; r < BOARD_SIZE; r++) {
      const cells: string[] = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const v = board[r][c] as CellValue;
        if (v === "B") {
          cells.push(` <span class="oth-b">\u25CF</span> `);
        } else if (v === "W") {
          cells.push(` <span class="oth-w">\u25CB</span> `);
        } else {
          cells.push(" . ");
        }
      }
      lines.push(`${r + 1} \u2502${cells.join("\u2502")}\u2502`);

      if (r < BOARD_SIZE - 1) {
        lines.push("  \u251C" + "\u2500\u2500\u2500\u253C".repeat(BOARD_SIZE - 1) + "\u2500\u2500\u2500\u2524");
      }
    }

    // Bottom border
    lines.push("  \u2514" + "\u2500\u2500\u2500\u2534".repeat(BOARD_SIZE - 1) + "\u2500\u2500\u2500\u2518");

    return lines.join("\n");
  },

  renderStatus(publicData: Record<string, unknown>): string | null {
    const board = publicData.board as Board | undefined;
    if (!board) return null;

    let B = 0;
    let W = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === "B") B++;
        else if (board[r][c] === "W") W++;
      }
    }

    return `Black: ${B}  White: ${W}`;
  },

  parseInput(
    raw: string,
    _publicData: Record<string, unknown>
  ): Action | null {
    const trimmed = raw.trim().toLowerCase();

    if (trimmed === "pass") {
      return { type: "pass", data: {} };
    }

    // Parse coordinate like "d3" → col 3, row 2
    if (trimmed.length === 2) {
      const colChar = trimmed[0];
      const rowChar = trimmed[1];
      const col = colChar.charCodeAt(0) - "a".charCodeAt(0);
      const row = parseInt(rowChar, 10) - 1;

      if (col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE) {
        return { type: "place", data: { row, col } };
      }
    }

    return null;
  },

  formatAction(action: Action): string {
    if (action.type === "place") {
      const { row, col } = action.data as { row: number; col: number };
      const colLetter = String.fromCharCode("a".charCodeAt(0) + col);
      return `${colLetter}${row + 1}`;
    }
    return "pass";
  },

  getPlayerLabel(
    playerId: string,
    publicData: Record<string, unknown>
  ): string {
    const colors = publicData.colors as Record<string, string> | undefined;
    if (!colors) return "?";
    const color = colors[playerId];
    if (color === "B") return "Black";
    if (color === "W") return "White";
    return "?";
  },
};
