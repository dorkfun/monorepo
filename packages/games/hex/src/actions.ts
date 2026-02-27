import { Action, GameState } from "@dorkfun/core";
import { HexData, BOARD_SIZE } from "./state";

/** A hex action: place a stone at (row, col) */
export interface PlaceAction extends Action {
  type: "place";
  data: { row: number; col: number };
}

/** A hex action: invoke the swap rule */
export interface SwapAction extends Action {
  type: "swap";
  data: Record<string, never>;
}

/** Type guard for PlaceAction with bounds validation */
export function isPlaceAction(action: Action): action is PlaceAction {
  return (
    action.type === "place" &&
    typeof (action.data as { row?: unknown }).row === "number" &&
    typeof (action.data as { col?: unknown }).col === "number" &&
    (action.data as { row: number }).row >= 0 &&
    (action.data as { row: number }).row < BOARD_SIZE &&
    (action.data as { col: number }).col >= 0 &&
    (action.data as { col: number }).col < BOARD_SIZE
  );
}

/** Type guard for SwapAction */
export function isSwapAction(action: Action): action is SwapAction {
  return action.type === "swap";
}

/**
 * Get all legal actions for a player in the current state.
 * Returns empty array if it's not the player's turn or the game is terminal.
 */
export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  const gameData = state.data as unknown as HexData;

  // No actions if the game is over
  if (gameData.terminalStatus !== null) {
    return [];
  }

  // No actions if it's not this player's turn
  if (state.currentPlayer !== playerId) {
    return [];
  }

  const actions: Action[] = [];

  // All empty cells are legal place actions
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (gameData.board[row][col] === "") {
        actions.push({ type: "place", data: { row, col } });
      }
    }
  }

  // Swap is available only on turn 1 when swapAvailable is true
  if (gameData.swapAvailable && state.turnNumber === 1) {
    actions.push({ type: "swap", data: {} });
  }

  return actions;
}
