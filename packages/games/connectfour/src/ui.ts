import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";
import { ROWS, COLS } from "./state";

export const ConnectFourUI: GameUISpec = {
  playerLabels: ["Red", "Yellow"],

  pieces: {
    R: { symbol: "\u25CF", label: "R" },
    Y: { symbol: "\u25CF", label: "Y" },
  },

  inputHint: "Enter column 1-7 to drop a piece",

  maxTurns: 42,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as string[][] | undefined;
    if (!board) return "Waiting for game state...";

    const lines: string[] = [];

    // Column headers
    const header = new Array(COLS)
      .fill(0)
      .map((_, i) => ` ${i + 1} `)
      .join(" ");
    lines.push(header);

    // Top border
    lines.push("\u250C" + new Array(COLS).fill("\u2500\u2500\u2500").join("\u252C") + "\u2510");

    // Render rows top-down (row 5 first, row 0 last)
    for (let r = ROWS - 1; r >= 0; r--) {
      const cells: string[] = [];
      for (let c = 0; c < COLS; c++) {
        const val = board[r][c];
        if (val === "R") {
          cells.push(` <span class="c4-r">\u25CF</span> `);
        } else if (val === "Y") {
          cells.push(` <span class="c4-y">\u25CF</span> `);
        } else {
          // Empty cell: show column number as a dim hint
          cells.push(` <span style="opacity:0.3">${c + 1}</span> `);
        }
      }
      lines.push("\u2502" + cells.join("\u2502") + "\u2502");

      if (r > 0) {
        lines.push("\u251C" + new Array(COLS).fill("\u2500\u2500\u2500").join("\u253C") + "\u2524");
      }
    }

    // Bottom border
    lines.push("\u2514" + new Array(COLS).fill("\u2500\u2500\u2500").join("\u2534") + "\u2518");

    return lines.join("\n");
  },

  renderStatus(_publicData: Record<string, unknown>): string | null {
    return null;
  },

  parseInput(raw: string, _publicData: Record<string, unknown>): Action | null {
    const trimmed = raw.trim();
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= 7) {
      return { type: "drop", data: { column: num - 1 } };
    }
    return null;
  },

  formatAction(action: Action): string {
    if (action.type === "drop") {
      const col = (action.data as { column: number }).column;
      return `column ${col + 1}`;
    }
    return action.type;
  },

  getPlayerLabel(
    playerId: string,
    publicData: Record<string, unknown>
  ): string {
    const colors = publicData.colors as Record<string, string> | undefined;
    const color = colors?.[playerId];
    if (color === "R") return "Red";
    if (color === "Y") return "Yellow";
    return "?";
  },
};
