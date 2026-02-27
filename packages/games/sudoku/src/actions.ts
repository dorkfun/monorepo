import { Action, GameState } from "@dorkfun/core";
import { SudokuData, isClueCell } from "./state";

/** Place a digit action */
export interface PlaceDigitAction extends Action {
  type: "place";
  data: { row: number; col: number; value: number };
}

/** Clear a cell action */
export interface ClearCellAction extends Action {
  type: "clear";
  data: { row: number; col: number };
}

/** Resign action */
export interface ResignAction extends Action {
  type: "resign";
  data: Record<string, unknown>;
}

export function isPlaceDigitAction(action: Action): action is PlaceDigitAction {
  return (
    action.type === "place" &&
    typeof action.data.row === "number" &&
    typeof action.data.col === "number" &&
    typeof action.data.value === "number" &&
    action.data.row >= 0 &&
    action.data.row <= 8 &&
    action.data.col >= 0 &&
    action.data.col <= 8 &&
    action.data.value >= 1 &&
    action.data.value <= 9
  );
}

export function isClearCellAction(action: Action): action is ClearCellAction {
  return (
    action.type === "clear" &&
    typeof action.data.row === "number" &&
    typeof action.data.col === "number" &&
    action.data.row >= 0 &&
    action.data.row <= 8 &&
    action.data.col >= 0 &&
    action.data.col <= 8
  );
}

export function isResignAction(action: Action): action is ResignAction {
  return action.type === "resign";
}

export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  if (state.currentPlayer !== playerId) return [];

  const data = state.data as unknown as SudokuData;
  if (data.resigned) return [];

  const actions: Action[] = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!isClueCell(data.puzzle, r, c)) {
        // Place any digit 1-9 in this cell
        for (let v = 1; v <= 9; v++) {
          actions.push({ type: "place", data: { row: r, col: c, value: v } });
        }
        // Clear action if cell is currently filled by player
        if (data.board[r][c] !== 0) {
          actions.push({ type: "clear", data: { row: r, col: c } });
        }
      }
    }
  }

  // Always allow resign
  actions.push({ type: "resign", data: {} });

  return actions;
}
