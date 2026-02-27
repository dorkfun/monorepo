import { Action, GameState } from "@dorkfun/core";
import { ConnectFourData, getDropRow, COLS } from "./state";

/** A Connect Four action: drop a piece into a column (0-6) */
export interface DropAction extends Action {
  type: "drop";
  data: { column: number };
}

export function isDropAction(action: Action): action is DropAction {
  return (
    action.type === "drop" &&
    typeof action.data.column === "number" &&
    action.data.column >= 0 &&
    action.data.column <= 6
  );
}

export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  if (state.currentPlayer !== playerId) {
    return [];
  }

  const gameData = state.data as unknown as ConnectFourData;
  const actions: Action[] = [];

  for (let col = 0; col < COLS; col++) {
    if (getDropRow(gameData.board, col) !== null) {
      actions.push({ type: "drop", data: { column: col } });
    }
  }

  return actions;
}
