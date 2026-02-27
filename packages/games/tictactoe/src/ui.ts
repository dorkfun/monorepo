import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";

export const TicTacToeUI: GameUISpec = {
  playerLabels: ["X", "O"],

  pieces: {
    X: { symbol: "X", label: "X" },
    O: { symbol: "O", label: "O" },
  },

  inputHint: "Enter 1-9 to place your mark",

  maxTurns: 9,

  renderBoard(publicData: Record<string, unknown>): string {
    const board = publicData.board as string[] | undefined;
    if (!board) return "Waiting for game state...";
    const cell = (i: number) => {
      if (board[i] === "X") return ` <span class="ttt-x">X</span> `;
      if (board[i] === "O") return ` <span class="ttt-o">O</span> `;
      return ` ${i + 1} `;
    };

    return [
      `${cell(0)}│${cell(1)}│${cell(2)}`,
      "───┼───┼───",
      `${cell(3)}│${cell(4)}│${cell(5)}`,
      "───┼───┼───",
      `${cell(6)}│${cell(7)}│${cell(8)}`,
    ].join("\n");
  },

  renderStatus(_publicData: Record<string, unknown>): string | null {
    return null;
  },

  parseInput(raw: string, _publicData: Record<string, unknown>): Action | null {
    const trimmed = raw.trim();
    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= 9) {
      return { type: "place", data: { position: num - 1 } };
    }
    return null;
  },

  formatAction(action: Action): string {
    if (action.type === "place") {
      const pos = (action.data as { position: number }).position;
      return `cell ${pos + 1}`;
    }
    return action.type;
  },

  getPlayerLabel(
    playerId: string,
    publicData: Record<string, unknown>
  ): string {
    const marks = publicData.marks as Record<string, string> | undefined;
    return marks?.[playerId] || "?";
  },
};
