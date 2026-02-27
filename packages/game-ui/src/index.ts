import { GameUISpec } from "@dorkfun/engine";
import { TicTacToeUI } from "@dorkfun/game-tictactoe";
import { ChessUI } from "@dorkfun/game-chess";
import { SudokuUI } from "@dorkfun/game-sudoku";
import { ConnectFourUI } from "@dorkfun/game-connectfour";
import { CheckersUI } from "@dorkfun/game-checkers";
import { OthelloUI } from "@dorkfun/game-othello";
import { HexUI } from "@dorkfun/game-hex";

const registry = new Map<string, GameUISpec>();
registry.set("tictactoe", TicTacToeUI);
registry.set("chess", ChessUI);
registry.set("sudoku", SudokuUI);
registry.set("connectfour", ConnectFourUI);
registry.set("checkers", CheckersUI);
registry.set("othello", OthelloUI);
registry.set("hex", HexUI);

/**
 * Look up the UI specification for a game by its ID.
 * Returns undefined if the game has no registered UI spec.
 */
export function getGameUI(gameId: string): GameUISpec | undefined {
  return registry.get(gameId);
}

export type { GameUISpec, PieceDisplay } from "@dorkfun/engine";
