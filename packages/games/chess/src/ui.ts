import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";
import { Board, Piece, Color, PieceKind, Square } from "./state";

const PIECE_SYMBOLS: Record<string, string> = {
  "white-king": "♔",
  "white-queen": "♕",
  "white-rook": "♖",
  "white-bishop": "♗",
  "white-knight": "♘",
  "white-pawn": "♙",
  "black-king": "♚",
  "black-queen": "♛",
  "black-rook": "♜",
  "black-bishop": "♝",
  "black-knight": "♞",
  "black-pawn": "♟",
};

const FILES = "abcdefgh";
const PROMO_MAP: Record<string, PieceKind> = {
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
};

function squareToAlgebraic(sq: Square): string {
  return FILES[sq.file] + (sq.rank + 1);
}

function algebraicToSquare(s: string): Square | null {
  if (s.length !== 2) return null;
  const file = s.charCodeAt(0) - 97;
  const rank = parseInt(s[1], 10) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return { file, rank };
}

export const ChessUI: GameUISpec = {
  playerLabels: ["White", "Black"],

  pieces: Object.fromEntries(
    Object.entries(PIECE_SYMBOLS).map(([key, symbol]) => [
      key,
      { symbol, label: key.split("-")[1].charAt(0).toUpperCase() },
    ])
  ),

  inputHint: "Enter move (e.g. e2e4) or resign",

  maxTurns: null,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as Board | undefined;
    if (!board) return "Waiting for game state...";

    const lastMove = publicData.lastMove as { from: Square; to: Square } | null | undefined;
    const lines: string[] = [];

    for (let rank = 7; rank >= 0; rank--) {
      let row = `${rank + 1} │`;
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file] as Piece | null;
        const isLastMoveSquare =
          lastMove &&
          ((lastMove.from.rank === rank && lastMove.from.file === file) ||
           (lastMove.to.rank === rank && lastMove.to.file === file));

        if (piece) {
          const key = `${piece.color}-${piece.kind}`;
          const symbol = PIECE_SYMBOLS[key] || "?";
          const colorClass = piece.color === "white" ? "chess-white" : "chess-black";
          const classes = isLastMoveSquare ? `${colorClass} chess-last-move` : colorClass;
          row += ` <span class="${classes}">${symbol}</span>`;
        } else if (isLastMoveSquare) {
          row += ` <span class="chess-last-move">·</span>`;
        } else {
          row += " .";
        }
      }
      lines.push(row);
    }

    lines.push("  └─────────────────");
    lines.push("    a b c d e f g h");

    return lines.join("\n");
  },

  renderStatus(publicData: Record<string, unknown>): string | null {
    const inCheck = publicData.inCheck as boolean | undefined;
    const terminalStatus = publicData.terminalStatus as string | null | undefined;

    if (terminalStatus) return null; // game over handled elsewhere

    if (inCheck) return "Check!";

    const halfMoveClock = publicData.halfMoveClock as number | undefined;
    if (halfMoveClock && halfMoveClock >= 80) {
      return `50-move clock: ${Math.floor(halfMoveClock / 2)}`;
    }

    return null;
  },

  parseInput(
    raw: string,
    _publicData: Record<string, unknown>
  ): Action | null {
    const trimmed = raw.trim().toLowerCase();

    if (trimmed === "resign") {
      return { type: "resign", data: {} };
    }

    // Format: "e2e4" (4 chars) or "e7e8q" (5 chars for promotion)
    if (trimmed.length < 4 || trimmed.length > 5) return null;

    const from = algebraicToSquare(trimmed.slice(0, 2));
    const to = algebraicToSquare(trimmed.slice(2, 4));
    if (!from || !to) return null;

    const data: Record<string, unknown> = { from, to };

    if (trimmed.length === 5) {
      const promoChar = trimmed[4];
      const promoKind = PROMO_MAP[promoChar];
      if (!promoKind) return null;
      data.promotion = promoKind;
    }

    return { type: "move", data };
  },

  formatAction(action: Action): string {
    if (action.type === "resign") return "resign";
    if (action.type !== "move") return action.type;

    const data = action.data as {
      from: Square;
      to: Square;
      promotion?: PieceKind;
    };
    let s = `${squareToAlgebraic(data.from)}→${squareToAlgebraic(data.to)}`;
    if (data.promotion) {
      const initial = data.promotion === "knight" ? "N" : data.promotion.charAt(0).toUpperCase();
      s += `=${initial}`;
    }
    return s;
  },

  getPlayerLabel(
    playerId: string,
    publicData: Record<string, unknown>
  ): string {
    const colors = publicData.colors as Record<string, Color> | undefined;
    if (!colors?.[playerId]) return "?";
    return colors[playerId] === "white" ? "White" : "Black";
  },
};
