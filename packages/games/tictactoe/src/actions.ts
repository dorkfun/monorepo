import { Action, GameState } from "@dorkfun/core";
import { TicTacToeData } from "./state";

/** A tic-tac-toe action: place your mark at a cell position (0-8) */
export interface PlaceMoveAction extends Action {
  type: "place";
  data: { position: number };
}

export function isPlaceMoveAction(action: Action): action is PlaceMoveAction {
  return (
    action.type === "place" &&
    typeof action.data.position === "number" &&
    action.data.position >= 0 &&
    action.data.position <= 8
  );
}

export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  if (state.currentPlayer !== playerId) {
    return [];
  }

  const gameData = state.data as unknown as TicTacToeData;
  const actions: Action[] = [];

  for (let i = 0; i < 9; i++) {
    if (gameData.board[i] === "") {
      actions.push({ type: "place", data: { position: i } });
    }
  }

  return actions;
}
