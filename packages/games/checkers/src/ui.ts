import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";
import { Board, CheckerPiece, BOARD_SIZE } from "./state";

/**
 * Convert algebraic notation (e.g. "c3") to a board coordinate.
 * Column a=0, b=1, ..., h=7. Row "1"=0, "2"=1, ..., "8"=7.
 */
function algebraicToCoord(s: string): { row: number; col: number } | null {
  if (s.length !== 2) return null;
  const colChar = s[0].toLowerCase();
  const rowChar = s[1];
  const col = colChar.charCodeAt(0) - "a".charCodeAt(0);
  const row = parseInt(rowChar, 10) - 1;
  if (isNaN(row) || row < 0 || row >= BOARD_SIZE) return null;
  if (col < 0 || col >= BOARD_SIZE) return null;
  return { row, col };
}

/**
 * Convert a board coordinate to algebraic notation (e.g. {row:2, col:2} -> "c3").
 */
function coordToAlgebraic(coord: { row: number; col: number }): string {
  const colChar = String.fromCharCode("a".charCodeAt(0) + coord.col);
  return `${colChar}${coord.row + 1}`;
}

/**
 * Render a piece as a displayable character.
 */
function pieceChar(piece: CheckerPiece | null): string {
  if (!piece) return " ";
  if (piece.color === "black") {
    return piece.type === "king" ? "\u25CE" : "\u25CB"; // ◎ or ○
  }
  return piece.type === "king" ? "\u25C9" : "\u25CF"; // ◉ or ●
}

/**
 * Render a piece with an HTML span for styling.
 */
function pieceHtml(piece: CheckerPiece | null): string {
  if (!piece) return " ";
  const symbol = pieceChar(piece);
  const cls = piece.color === "black" ? "ck-black" : "ck-white";
  return `<span class="${cls}">${symbol}</span>`;
}

export const CheckersUI: GameUISpec = {
  playerLabels: ["Black", "White"],

  pieces: {
    "black-man": { symbol: "\u25CB", label: "b" },
    "black-king": { symbol: "\u25CE", label: "B" },
    "white-man": { symbol: "\u25CF", label: "w" },
    "white-king": { symbol: "\u25C9", label: "W" },
  },

  inputHint: "Enter move (e.g. c3-d4, c3:e5, c3:e5:g3)",

  maxTurns: null,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as Board | undefined;
    if (!board) return "Waiting for game state...";

    const lines: string[] = [];

    // Render top-down: row 7 at top, row 0 at bottom
    for (let r = BOARD_SIZE - 1; r >= 0; r--) {
      const rowLabel = `${r + 1}`;
      const cells: string[] = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const isDark = (r + c) % 2 === 1;
        if (isDark) {
          const piece = board[r][c];
          cells.push(` ${pieceHtml(piece)} `);
        } else {
          cells.push("   ");
        }
      }
      lines.push(`${rowLabel} \u2502${cells.join("\u2502")}\u2502`);
      if (r > 0) {
        lines.push(`  \u251C${"───\u253C".repeat(BOARD_SIZE - 1)}───\u2524`);
      }
    }

    // Bottom border
    lines.push(`  \u2514${"───\u2534".repeat(BOARD_SIZE - 1)}───\u2518`);

    // Column labels
    const colLabels = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      colLabels.push(` ${String.fromCharCode("a".charCodeAt(0) + c)} `);
    }
    lines.push(`    ${colLabels.join(" ")}`);

    return lines.join("\n");
  },

  renderStatus(_publicData: Record<string, unknown>): string | null {
    return null;
  },

  parseInput(
    raw: string,
    _publicData: Record<string, unknown>
  ): Action | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Determine separator: ":" for jumps, "-" for simple moves
    let segments: string[];
    if (trimmed.includes(":")) {
      segments = trimmed.split(":");
    } else if (trimmed.includes("-")) {
      segments = trimmed.split("-");
    } else {
      return null;
    }

    if (segments.length < 2) return null;

    const coords = segments.map((s) => algebraicToCoord(s.trim()));
    if (coords.some((c) => c === null)) return null;

    const validCoords = coords as { row: number; col: number }[];
    const from = validCoords[0];
    const to = validCoords[validCoords.length - 1];
    const path = validCoords.slice(1, -1);

    return {
      type: "move",
      data: { from, to, path },
    };
  },

  formatAction(action: Action): string {
    if (action.type === "move") {
      const d = action.data as {
        from: { row: number; col: number };
        to: { row: number; col: number };
        path: { row: number; col: number }[];
      };
      const parts = [coordToAlgebraic(d.from)];
      for (const p of d.path) {
        parts.push(coordToAlgebraic(p));
      }
      parts.push(coordToAlgebraic(d.to));
      return parts.join("\u2192"); // arrow separator →
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
    if (color === "black") return "Black";
    if (color === "white") return "White";
    return "?";
  },
};
