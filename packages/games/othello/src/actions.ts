import { Action, GameState } from "@dorkfun/core";
import { OthelloData, getFlips, hasLegalMove, BOARD_SIZE } from "./state";

/** An Othello action: place a disc at (row, col) */
export interface PlaceAction extends Action {
  type: "place";
  data: { row: number; col: number };
}

/** An Othello action: pass (when no legal placements exist) */
export interface PassAction extends Action {
  type: "pass";
  data: Record<string, never>;
}

export function isPlaceAction(action: Action): action is PlaceAction {
  return (
    action.type === "place" &&
    typeof action.data.row === "number" &&
    typeof action.data.col === "number"
  );
}

export function isPassAction(action: Action): action is PassAction {
  return action.type === "pass";
}

export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  const gameData = state.data as unknown as OthelloData;

  // Not this player's turn or game is over
  if (state.currentPlayer !== playerId || gameData.terminalStatus !== null) {
    return [];
  }

  const color = gameData.colors[playerId];
  if (!color) return [];

  const actions: Action[] = [];

  // Collect all legal placements
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (getFlips(gameData.board, r, c, color).length > 0) {
        actions.push({ type: "place", data: { row: r, col: c } });
      }
    }
  }

  // If no placements available, the only legal action is to pass
  if (actions.length === 0) {
    return [{ type: "pass", data: {} }];
  }

  return actions;
}
