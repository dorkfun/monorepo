import { Action, GameState } from "@dorkfun/core";
import {
  Board,
  CheckerPiece,
  CheckersData,
  Coord,
  PieceColor,
  cloneBoard,
  getPiecesOfColor,
  isInBounds,
  pieceAt,
} from "./state";

export interface CheckersMoveAction extends Action {
  type: "move";
  data: {
    from: { row: number; col: number };
    to: { row: number; col: number };
    path: { row: number; col: number }[]; // intermediate landing squares for multi-jumps (empty for simple moves/single jumps)
  };
}

/** Type guard for move actions */
export function isMoveAction(action: Action): action is CheckersMoveAction {
  return (
    action.type === "move" &&
    action.data != null &&
    typeof (action.data as any).from === "object" &&
    typeof (action.data as any).from.row === "number" &&
    typeof (action.data as any).from.col === "number" &&
    typeof (action.data as any).to === "object" &&
    typeof (action.data as any).to.row === "number" &&
    typeof (action.data as any).to.col === "number"
  );
}

/**
 * Get all legal actions for a player in the current state.
 * Implements mandatory capture: if any jump exists, only jumps are legal.
 */
export function getLegalActionsForPlayer(
  state: GameState,
  playerId: string
): Action[] {
  if (state.currentPlayer !== playerId) return [];

  const data = state.data as unknown as CheckersData;
  if (data.terminalStatus !== null) return [];

  const pieces = getPiecesOfColor(data.board, data.activeColor);

  // Phase 1: Generate all jumps for all pieces of activeColor
  const allJumps: Action[] = [];
  for (const coord of pieces) {
    const jumps = generateJumpSequences(data.board, coord, data.activeColor);
    allJumps.push(...jumps);
  }

  // Mandatory capture: if any jump exists, ONLY jumps are legal
  if (allJumps.length > 0) return allJumps;

  // Phase 2: Generate simple moves
  const allMoves: Action[] = [];
  for (const coord of pieces) {
    const moves = generateSimpleMoves(data.board, coord, data.activeColor);
    allMoves.push(...moves);
  }

  return allMoves;
}

/**
 * Get the move directions for a piece.
 * Men move forward only; kings move in all 4 diagonals.
 * Black forward = toward row 7 (+1 row). White forward = toward row 0 (-1 row).
 */
function getDirections(piece: CheckerPiece): [number, number][] {
  if (piece.type === "king") {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  // Men: forward only
  if (piece.color === "black") {
    return [
      [1, -1],
      [1, 1],
    ];
  }
  // white
  return [
    [-1, -1],
    [-1, 1],
  ];
}

/**
 * Generate simple (non-jump) moves for a piece at the given coordinate.
 */
export function generateSimpleMoves(
  board: Board,
  from: Coord,
  _color: PieceColor
): Action[] {
  const piece = pieceAt(board, from);
  if (!piece) return [];

  const directions = getDirections(piece);
  const moves: Action[] = [];

  for (const [dr, dc] of directions) {
    const to: Coord = { row: from.row + dr, col: from.col + dc };
    if (isInBounds(to) && pieceAt(board, to) === null) {
      moves.push({
        type: "move",
        data: { from: { row: from.row, col: from.col }, to: { row: to.row, col: to.col }, path: [] },
      });
    }
  }

  return moves;
}

/**
 * Generate all complete jump sequences for a piece at the given coordinate.
 * Uses recursive backtracking to find all possible multi-jump paths.
 */
export function generateJumpSequences(
  board: Board,
  startFrom: Coord,
  _color: PieceColor
): Action[] {
  const piece = pieceAt(board, startFrom);
  if (!piece) return [];

  return _findJumps(board, startFrom, startFrom, piece, [], new Set<string>());
}

function _findJumps(
  board: Board,
  originalFrom: Coord,
  currentPos: Coord,
  piece: CheckerPiece,
  pathSoFar: Coord[],
  capturedSet: Set<string>
): Action[] {
  const directions = getDirections(piece);
  const results: Action[] = [];
  let foundContinuations = false;

  for (const [dr, dc] of directions) {
    const mid: Coord = {
      row: currentPos.row + dr,
      col: currentPos.col + dc,
    };
    const land: Coord = {
      row: currentPos.row + 2 * dr,
      col: currentPos.col + 2 * dc,
    };

    if (!isInBounds(land)) continue;

    const midKey = `${mid.row},${mid.col}`;
    if (capturedSet.has(midKey)) continue; // already captured in this sequence

    const midPiece = pieceAt(board, mid);
    if (!midPiece || midPiece.color === piece.color) continue; // need opponent piece

    // Landing must be empty (or it's the original position if we've moved away)
    const landPiece = pieceAt(board, land);
    if (landPiece !== null) {
      // Allow landing on original from position if we have moved away from it
      if (
        land.row === originalFrom.row &&
        land.col === originalFrom.col &&
        pathSoFar.length > 0
      ) {
        // The piece has moved away, so the original square is conceptually empty
      } else {
        continue; // landing square is occupied
      }
    }

    // Check promotion: man reaching king row ends turn immediately
    const promotionRow = piece.color === "black" ? 7 : 0;
    if (piece.type === "man" && land.row === promotionRow) {
      // Promoted! Turn ends. This is a complete sequence.
      if (pathSoFar.length === 0) {
        results.push({
          type: "move",
          data: {
            from: { row: originalFrom.row, col: originalFrom.col },
            to: { row: land.row, col: land.col },
            path: [],
          },
        });
      } else {
        results.push({
          type: "move",
          data: {
            from: { row: originalFrom.row, col: originalFrom.col },
            to: { row: land.row, col: land.col },
            path: pathSoFar.map((c) => ({ row: c.row, col: c.col })),
          },
        });
      }
      foundContinuations = true;
      continue;
    }

    // Simulate the jump on a cloned board
    const newBoard = cloneBoard(board);
    newBoard[currentPos.row][currentPos.col] = null;
    newBoard[mid.row][mid.col] = null;
    newBoard[land.row][land.col] = piece;

    const newCaptured = new Set(capturedSet);
    newCaptured.add(midKey);
    const newPath = [...pathSoFar, { row: land.row, col: land.col }];

    // Recurse for more jumps from the landing position
    const subResults = _findJumps(
      newBoard,
      originalFrom,
      land,
      piece,
      newPath,
      newCaptured
    );

    if (subResults.length > 0) {
      results.push(...subResults);
      foundContinuations = true;
    } else {
      // No further jumps - this landing is the end of the sequence
      if (pathSoFar.length === 0) {
        results.push({
          type: "move",
          data: {
            from: { row: originalFrom.row, col: originalFrom.col },
            to: { row: land.row, col: land.col },
            path: [],
          },
        });
      } else {
        results.push({
          type: "move",
          data: {
            from: { row: originalFrom.row, col: originalFrom.col },
            to: { row: land.row, col: land.col },
            path: pathSoFar.map((c) => ({ row: c.row, col: c.col })),
          },
        });
      }
      foundContinuations = true;
    }
  }

  return results;
}
