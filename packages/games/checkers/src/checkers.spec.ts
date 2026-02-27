import { strict as assert } from "assert";
import { GameConfig, GameState, Action } from "@dorkfun/core";
import { CheckersModule } from "./rules";
import {
  CheckersData,
  CheckerPiece,
  Coord,
  PieceColor,
  Board,
  BOARD_SIZE,
  emptyBoard,
  isDarkSquare,
  countPieces,
  pieceAt,
} from "./state";
import { getLegalActionsForPlayer } from "./actions";

const P1 = "0xPlayer1";
const P2 = "0xPlayer2";
const CONFIG: GameConfig = { gameId: "checkers", version: "0.1.0" };

function getData(state: GameState): CheckersData {
  return state.data as unknown as CheckersData;
}

function move(
  from: { row: number; col: number },
  to: { row: number; col: number },
  path: { row: number; col: number }[] = []
): Action {
  return { type: "move", data: { from, to, path } };
}

/**
 * Create a custom game state with specific piece placements for targeted testing.
 */
function customState(
  pieces: { coord: Coord; piece: CheckerPiece }[],
  activeColor: PieceColor,
  players = [P1, P2]
): GameState {
  const board = emptyBoard();
  for (const { coord, piece } of pieces) {
    board[coord.row][coord.col] = piece;
  }
  return {
    gameId: "checkers",
    players,
    currentPlayer: activeColor === "black" ? players[0] : players[1],
    turnNumber: 0,
    data: {
      board,
      colors: { [players[0]]: "black", [players[1]]: "white" },
      activeColor,
      drawClock: 0,
      lastMove: null,
      terminalStatus: null,
      winnerColor: null,
    } as unknown as Record<string, unknown>,
  };
}

describe("CheckersModule", () => {
  describe("init", () => {
    it("should initialize a game with 12 pieces per side", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(state.gameId, "checkers");
      assert.deepEqual(state.players, [P1, P2]);
      assert.equal(state.currentPlayer, P1);
      assert.equal(state.turnNumber, 0);
      assert.equal(countPieces(data.board, "black"), 12);
      assert.equal(countPieces(data.board, "white"), 12);
    });

    it("should place black pieces on rows 0-2 dark squares", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      for (let r = 0; r <= 2; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const piece = data.board[r][c];
          if (isDarkSquare(r, c)) {
            assert.ok(piece !== null, `Expected piece at (${r},${c})`);
            assert.equal(piece!.color, "black");
            assert.equal(piece!.type, "man");
          } else {
            assert.equal(piece, null, `Expected null at (${r},${c})`);
          }
        }
      }
    });

    it("should place white pieces on rows 5-7 dark squares", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      for (let r = 5; r <= 7; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const piece = data.board[r][c];
          if (isDarkSquare(r, c)) {
            assert.ok(piece !== null, `Expected piece at (${r},${c})`);
            assert.equal(piece!.color, "white");
            assert.equal(piece!.type, "man");
          } else {
            assert.equal(piece, null, `Expected null at (${r},${c})`);
          }
        }
      }
    });

    it("should have empty rows 3-4", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      for (let r = 3; r <= 4; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          assert.equal(data.board[r][c], null, `Expected null at (${r},${c})`);
        }
      }
    });

    it("should have black going first", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.activeColor, "black");
      assert.equal(state.currentPlayer, P1);
      assert.equal(data.colors[P1], "black");
      assert.equal(data.colors[P2], "white");
    });

    it("should have all pieces on dark squares only", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (!isDarkSquare(r, c)) {
            assert.equal(
              data.board[r][c],
              null,
              `Non-dark square (${r},${c}) should be empty`
            );
          }
        }
      }
    });

    it("should initialize drawClock to 0 and no terminal status", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.drawClock, 0);
      assert.equal(data.lastMove, null);
      assert.equal(data.terminalStatus, null);
      assert.equal(data.winnerColor, null);
    });

    it("should throw for wrong number of players", () => {
      assert.throws(
        () => CheckersModule.init(CONFIG, [P1], "seed"),
        /exactly 2 players/
      );
      assert.throws(
        () => CheckersModule.init(CONFIG, [P1, P2, "0xP3"], "seed"),
        /exactly 2 players/
      );
    });
  });

  describe("simple moves", () => {
    it("should allow black man to move forward diagonally", () => {
      // Black man at (2,1) should be able to move to (3,0) and (3,2)
      const state = customState(
        [{ coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } }],
        "black"
      );
      const actions = CheckersModule.getLegalActions(state, P1);

      assert.equal(actions.length, 2);
      const targets = actions.map((a) => {
        const d = a.data as any;
        return `${d.to.row},${d.to.col}`;
      });
      assert.ok(targets.includes("3,0"));
      assert.ok(targets.includes("3,2"));
    });

    it("should allow white man to move forward diagonally (toward row 0)", () => {
      // White man at (5,2) should be able to move to (4,1) and (4,3)
      const state = customState(
        [{ coord: { row: 5, col: 2 }, piece: { color: "white", type: "man" } }],
        "white"
      );
      const actions = CheckersModule.getLegalActions(state, P2);

      assert.equal(actions.length, 2);
      const targets = actions.map((a) => {
        const d = a.data as any;
        return `${d.to.row},${d.to.col}`;
      });
      assert.ok(targets.includes("4,1"));
      assert.ok(targets.includes("4,3"));
    });

    it("should reject backward move for man", () => {
      // Black man at (3,2): forward is row 4, not row 2
      const state = customState(
        [{ coord: { row: 3, col: 2 }, piece: { color: "black", type: "man" } }],
        "black"
      );

      // Attempt to move backward
      const backwardMove = move({ row: 3, col: 2 }, { row: 2, col: 1 });
      assert.equal(CheckersModule.validateAction(state, P1, backwardMove), false);
    });

    it("should not allow moving to occupied square", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "black", type: "man" } },
        ],
        "black"
      );

      // (2,1) -> (3,2) should be blocked by own piece
      const blocked = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      assert.equal(CheckersModule.validateAction(state, P1, blocked), false);
    });

    it("should apply a simple move correctly", () => {
      const state = customState(
        [{ coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } }],
        "black"
      );

      const action = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(pieceAt(data.board, { row: 2, col: 1 }), null);
      const movedPiece = pieceAt(data.board, { row: 3, col: 2 });
      assert.ok(movedPiece !== null);
      assert.equal(movedPiece!.color, "black");
      assert.equal(movedPiece!.type, "man");
      assert.equal(data.activeColor, "white");
      assert.equal(newState.currentPlayer, P2);
    });
  });

  describe("single jump", () => {
    it("should generate a single jump over opponent", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);
      // Mandatory capture: only the jump should be available
      assert.equal(actions.length, 1);
      const d = actions[0].data as any;
      assert.equal(d.from.row, 2);
      assert.equal(d.from.col, 1);
      assert.equal(d.to.row, 4);
      assert.equal(d.to.col, 3);
      assert.deepEqual(d.path, []);
    });

    it("should remove captured piece after single jump", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 2, col: 1 }, { row: 4, col: 3 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      // Original position empty
      assert.equal(pieceAt(data.board, { row: 2, col: 1 }), null);
      // Captured piece removed
      assert.equal(pieceAt(data.board, { row: 3, col: 2 }), null);
      // Piece at landing
      const landed = pieceAt(data.board, { row: 4, col: 3 });
      assert.ok(landed !== null);
      assert.equal(landed!.color, "black");
    });

    it("should reset drawClock on capture", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      // Manually set drawClock to 10
      (state.data as any).drawClock = 10;

      const action = move({ row: 2, col: 1 }, { row: 4, col: 3 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(data.drawClock, 0);
    });

    it("should increment drawClock on non-capture move", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );
      (state.data as any).drawClock = 5;

      const action = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(data.drawClock, 6);
    });
  });

  describe("mandatory capture", () => {
    it("should enforce mandatory capture: simple moves not allowed when jump exists", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 2, col: 5 }, piece: { color: "black", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // Only jumps should be available
      for (const a of actions) {
        const d = a.data as any;
        const rowDiff = Math.abs(d.to.row - d.from.row);
        assert.ok(
          rowDiff >= 2,
          `Expected jump (rowDiff >= 2), got rowDiff=${rowDiff}`
        );
      }

      // Simple move from (2,5) should NOT be valid
      const simpleMove = move({ row: 2, col: 5 }, { row: 3, col: 4 });
      assert.equal(CheckersModule.validateAction(state, P1, simpleMove), false);
    });

    it("should allow simple moves when no jumps exist", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);
      assert.ok(actions.length > 0);
      // All should be simple moves (rowDiff === 1)
      for (const a of actions) {
        const d = a.data as any;
        const rowDiff = Math.abs(d.to.row - d.from.row);
        assert.equal(rowDiff, 1);
      }
    });
  });

  describe("multi-jump", () => {
    it("should generate double jump sequence", () => {
      // Black man at (0,1), white at (1,2) and (3,4) with empty (2,3) and (4,5)
      const state = customState(
        [
          { coord: { row: 0, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 1, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 3, col: 4 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // Should have a double jump: (0,1) -> (2,3) -> (4,5)
      const doubleJump = actions.find((a) => {
        const d = a.data as any;
        return (
          d.from.row === 0 &&
          d.from.col === 1 &&
          d.to.row === 4 &&
          d.to.col === 5 &&
          d.path.length === 1 &&
          d.path[0].row === 2 &&
          d.path[0].col === 3
        );
      });

      assert.ok(doubleJump, "Should find double jump (0,1)->(2,3)->(4,5)");
    });

    it("should remove all jumped pieces in multi-jump", () => {
      const state = customState(
        [
          { coord: { row: 0, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 1, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 3, col: 4 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move(
        { row: 0, col: 1 },
        { row: 4, col: 5 },
        [{ row: 2, col: 3 }]
      );

      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(pieceAt(data.board, { row: 0, col: 1 }), null);
      assert.equal(pieceAt(data.board, { row: 1, col: 2 }), null); // captured
      assert.equal(pieceAt(data.board, { row: 3, col: 4 }), null); // captured
      const landed = pieceAt(data.board, { row: 4, col: 5 });
      assert.ok(landed !== null);
      assert.equal(landed!.color, "black");
    });

    it("should handle triple jump for king", () => {
      // King at (0,1), opponents at (1,2), (3,4), (5,4) - king can jump all directions
      const state = customState(
        [
          { coord: { row: 0, col: 1 }, piece: { color: "black", type: "king" } },
          { coord: { row: 1, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 3, col: 4 }, piece: { color: "white", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // King can jump in various sequences. Check that multi-jumps exist
      const multiJumps = actions.filter((a) => {
        const d = a.data as any;
        return d.path && d.path.length > 0;
      });

      assert.ok(
        multiJumps.length > 0,
        "King should have multi-jump options"
      );
    });
  });

  describe("king promotion", () => {
    it("should promote black man reaching row 7 to king", () => {
      const state = customState(
        [
          { coord: { row: 6, col: 3 }, piece: { color: "black", type: "man" } },
          { coord: { row: 0, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 6, col: 3 }, { row: 7, col: 4 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      const promoted = pieceAt(data.board, { row: 7, col: 4 });
      assert.ok(promoted !== null);
      assert.equal(promoted!.color, "black");
      assert.equal(promoted!.type, "king");
    });

    it("should promote white man reaching row 0 to king", () => {
      const state = customState(
        [
          { coord: { row: 1, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 6, col: 1 }, piece: { color: "black", type: "man" } },
        ],
        "white"
      );

      const action = move({ row: 1, col: 2 }, { row: 0, col: 1 });
      const newState = CheckersModule.applyAction(state, P2, action);
      const data = getData(newState);

      const promoted = pieceAt(data.board, { row: 0, col: 1 });
      assert.ok(promoted !== null);
      assert.equal(promoted!.color, "white");
      assert.equal(promoted!.type, "king");
    });

    it("should promote black man via jump to row 7", () => {
      const state = customState(
        [
          { coord: { row: 5, col: 2 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 5, col: 2 }, { row: 7, col: 4 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      const promoted = pieceAt(data.board, { row: 7, col: 4 });
      assert.ok(promoted !== null);
      assert.equal(promoted!.type, "king");
      // Captured piece removed
      assert.equal(pieceAt(data.board, { row: 6, col: 3 }), null);
    });
  });

  describe("promotion ends multi-jump", () => {
    it("should stop multi-jump when man promotes", () => {
      // Black man at (3,2), white at (4,3) and (6,3).
      // Jump (3,2)->(5,4) does not promote. Then (5,4)->(7,2) would promote if (6,3) is opponent.
      // Actually let me set up: black man at (5,2), white at (6,3) and white at (6,1).
      // Jump (5,2)->(7,4) promotes immediately. No more jumps.
      // Better setup: black man at (3,4), white at (4,5) and (6,5)
      // Jump (3,4)->(5,6) (no promotion), then would continue if more jumps...
      // For promotion-ends-turn: black man at (5,0), white at (6,1)
      // After jumping (5,0)->(7,2), man promotes. Even if there was another jumpable piece it should stop.

      // Setup: black man at (5,0), white pieces at (6,1) and (7,4) (the latter is irrelevant, just to keep game alive)
      // Another white piece at (6,3) - if the man promoted and could keep jumping, it would go (7,2)->(5,4) - but promotion ends turn
      const state = customState(
        [
          { coord: { row: 5, col: 0 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 1 }, piece: { color: "white", type: "man" } },
          // If promotion didn't end turn, a king at (7,2) could jump (6,3)
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // Should only have a single jump to (7,2) - NOT a double jump through (5,4)
      // because man promotes on reaching row 7 and turn ends
      const jumpActions = actions.filter((a) => {
        const d = a.data as any;
        return d.from.row === 5 && d.from.col === 0;
      });

      for (const a of jumpActions) {
        const d = a.data as any;
        assert.equal(d.to.row, 7, "Jump should land on row 7 (promotion)");
        assert.equal(d.to.col, 2, "Jump should land on col 2");
        assert.deepEqual(d.path, [], "Should not have intermediate stops (single jump promotes)");
      }
    });
  });

  describe("king movement", () => {
    it("should allow king to move in all 4 diagonal directions", () => {
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "king" } },
          { coord: { row: 0, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);
      const targets = actions.map((a) => {
        const d = a.data as any;
        return `${d.to.row},${d.to.col}`;
      });

      assert.ok(targets.includes("5,4"), "King should move forward-right");
      assert.ok(targets.includes("5,2"), "King should move forward-left");
      assert.ok(targets.includes("3,4"), "King should move backward-right");
      assert.ok(targets.includes("3,2"), "King should move backward-left");
    });

    it("should allow king to jump backward", () => {
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "king" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // Should be able to jump backward to (2,1)
      const backJump = actions.find((a) => {
        const d = a.data as any;
        return d.to.row === 2 && d.to.col === 1;
      });

      assert.ok(backJump, "King should be able to jump backward");
    });

    it("should not allow man to jump backward", () => {
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
          // Give white a piece so game doesn't end from no_pieces if black can't do anything
          { coord: { row: 7, col: 6 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // No backward jump to (2,1)
      const backJump = actions.find((a) => {
        const d = a.data as any;
        return d.to.row === 2 && d.to.col === 1;
      });

      assert.equal(backJump, undefined, "Man should not jump backward");
    });
  });

  describe("win - no pieces", () => {
    it("should declare winner when opponent has no pieces left", () => {
      // Black captures last white piece
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "man" } },
          { coord: { row: 5, col: 4 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 4, col: 3 }, { row: 6, col: 5 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(CheckersModule.isTerminal(newState), true);
      assert.equal(data.terminalStatus, "no_pieces");
      assert.equal(data.winnerColor, "black");

      const outcome = CheckersModule.getOutcome(newState);
      assert.equal(outcome.winner, P1);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.scores[P1], 1);
      assert.equal(outcome.scores[P2], 0);
      assert.equal(outcome.reason, "no_pieces");
    });
  });

  describe("win - no moves", () => {
    it("should declare winner when opponent has pieces but no legal moves", () => {
      // White has a piece trapped in corner with no moves
      // White man at (0,1), black pieces blocking all exits
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 0, col: 1 }, piece: { color: "white", type: "man" } },
          // Black needs to make a move that results in white being blocked
          // Actually, let's set up: black's turn, after move white has no moves
          // White man at (0,1) can only go to (-1,0) or (-1,2) - both out of bounds.
          // Wait, white moves toward row 0 (it's already at row 0), so white's forward is -1 which is OOB.
          // So white at row 0 with no capture available = no moves.
          // Let black make a non-threatening move first
          { coord: { row: 4, col: 5 }, piece: { color: "black", type: "man" } },
        ],
        "black"
      );

      // Black moves (4,5) to (5,6) - simple move, no captures
      const action = move({ row: 4, col: 5 }, { row: 5, col: 6 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      // White now has only a man at (0,1), which has no forward moves
      assert.equal(CheckersModule.isTerminal(newState), true);
      assert.equal(data.terminalStatus, "no_moves");
      assert.equal(data.winnerColor, "black");

      const outcome = CheckersModule.getOutcome(newState);
      assert.equal(outcome.winner, P1);
      assert.equal(outcome.scores[P1], 1);
      assert.equal(outcome.scores[P2], 0);
    });
  });

  describe("draw - 40 move rule", () => {
    it("should declare draw when drawClock reaches 80", () => {
      // Set up a state with drawClock at 79, make one more non-capture move
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "king" } },
          { coord: { row: 0, col: 1 }, piece: { color: "white", type: "king" } },
        ],
        "black"
      );
      (state.data as any).drawClock = 79;

      const action = move({ row: 4, col: 3 }, { row: 5, col: 4 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(data.drawClock, 80);
      assert.equal(CheckersModule.isTerminal(newState), true);
      assert.equal(data.terminalStatus, "draw_40_moves");
      assert.equal(data.winnerColor, null);

      const outcome = CheckersModule.getOutcome(newState);
      assert.equal(outcome.winner, null);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.scores[P1], 0.5);
      assert.equal(outcome.scores[P2], 0.5);
      assert.equal(outcome.reason, "draw_40_moves");
    });

    it("should not draw if capture resets drawClock", () => {
      const state = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "king" } },
          { coord: { row: 5, col: 4 }, piece: { color: "white", type: "man" } },
          { coord: { row: 0, col: 1 }, piece: { color: "white", type: "king" } },
        ],
        "black"
      );
      (state.data as any).drawClock = 79;

      // Jump capture resets drawClock
      const action = move({ row: 4, col: 3 }, { row: 6, col: 5 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.equal(data.drawClock, 0);
      assert.equal(data.terminalStatus, null);
    });
  });

  describe("validateAction", () => {
    it("should reject moves from wrong player", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");

      // P2 (white) tries to move but it's black's turn
      const action = move({ row: 5, col: 0 }, { row: 4, col: 1 });
      assert.equal(CheckersModule.validateAction(state, P2, action), false);
    });

    it("should reject invalid action types", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const badAction: Action = { type: "invalid", data: {} };
      assert.equal(CheckersModule.validateAction(state, P1, badAction), false);
    });

    it("should reject moves not in legal actions", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");

      // Try to move a piece that doesn't exist
      const badMove = move({ row: 4, col: 3 }, { row: 5, col: 4 });
      assert.equal(CheckersModule.validateAction(state, P1, badMove), false);
    });

    it("should accept valid legal moves from initial position", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const actions = CheckersModule.getLegalActions(state, P1);

      assert.ok(actions.length > 0, "Should have legal actions from initial position");

      // Each legal action should validate
      for (const a of actions) {
        assert.equal(
          CheckersModule.validateAction(state, P1, a),
          true,
          `Legal action should validate: ${JSON.stringify(a)}`
        );
      }
    });
  });

  describe("state immutability", () => {
    it("should not modify input state when applying action", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const origData = JSON.parse(JSON.stringify(state.data));

      const action = move({ row: 2, col: 1 }, { row: 4, col: 3 });
      CheckersModule.applyAction(state, P1, action);

      // Original state should be unchanged
      assert.deepEqual(state.data, origData);
    });

    it("should not modify input state when applying simple move", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const origBoard = JSON.parse(JSON.stringify(getData(state).board));

      const action = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      CheckersModule.applyAction(state, P1, action);

      assert.deepEqual(getData(state).board, origBoard);
    });
  });

  describe("determinism", () => {
    it("should produce identical states for identical inputs", () => {
      const state1 = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const state2 = CheckersModule.init(CONFIG, [P1, P2], "seed");
      assert.deepEqual(state1, state2);

      const actions1 = CheckersModule.getLegalActions(state1, P1);
      const actions2 = CheckersModule.getLegalActions(state2, P1);
      assert.deepEqual(actions1, actions2);

      const next1 = CheckersModule.applyAction(state1, P1, actions1[0]);
      const next2 = CheckersModule.applyAction(state2, P1, actions2[0]);
      assert.deepEqual(next1, next2);
    });

    it("should produce identical outcomes for identical game sequences", () => {
      // Play a short custom game and verify determinism
      const state1 = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "man" } },
          { coord: { row: 5, col: 4 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );
      const state2 = customState(
        [
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "man" } },
          { coord: { row: 5, col: 4 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 4, col: 3 }, { row: 6, col: 5 });
      const result1 = CheckersModule.applyAction(state1, P1, action);
      const result2 = CheckersModule.applyAction(state2, P1, action);

      assert.deepEqual(result1, result2);
    });
  });

  describe("getObservation", () => {
    it("should return full board state", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const obs = CheckersModule.getObservation(state, P1);

      assert.equal(obs.gameId, "checkers");
      assert.deepEqual(obs.players, [P1, P2]);
      assert.equal(obs.currentPlayer, P1);
      assert.equal(obs.turnNumber, 0);

      const pub = obs.publicData as any;
      assert.ok(pub.board, "Should have board");
      assert.ok(pub.colors, "Should have colors");
      assert.equal(pub.activeColor, "black");
      assert.equal(pub.drawClock, 0);
      assert.equal(pub.lastMove, null);
      assert.equal(pub.terminalStatus, null);
      assert.equal(pub.winnerColor, null);
    });

    it("should return same observation for both players", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const obs1 = CheckersModule.getObservation(state, P1);
      const obs2 = CheckersModule.getObservation(state, P2);

      assert.deepEqual(obs1.publicData, obs2.publicData);
    });

    it("should return deep clone (not reference to internal state)", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const obs = CheckersModule.getObservation(state, P1);
      const pub = obs.publicData as any;

      // Mutate the observation board
      pub.board[0][1] = null;

      // Original state should be unchanged
      const data = getData(state);
      assert.ok(data.board[0][1] !== null, "Original board should not be mutated");
    });
  });

  describe("initial position legal actions", () => {
    it("should generate 7 legal moves for black from initial position", () => {
      // In the initial position, black has pieces on rows 0-2.
      // Only row 2 pieces can move (row 0-1 pieces are blocked by row 1-2 pieces).
      // Row 2 dark squares: (2,1), (2,3), (2,5), (2,7)
      // (2,1) can move to (3,0) and (3,2)
      // (2,3) can move to (3,2) and (3,4)
      // (2,5) can move to (3,4) and (3,6)
      // (2,7) can move to (3,6) only (3,8 is OOB)
      // That's 2+2+2+1 = 7 moves
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const actions = CheckersModule.getLegalActions(state, P1);

      assert.equal(actions.length, 7, `Expected 7 legal moves, got ${actions.length}`);
    });
  });

  describe("edge cases", () => {
    it("should handle piece at board edge correctly", () => {
      // Black man at (2,7) - on right edge
      const state = customState(
        [
          { coord: { row: 2, col: 7 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);
      // Can only move to (3,6), not (3,8) which is OOB
      assert.equal(actions.length, 1);
      const d = actions[0].data as any;
      assert.equal(d.to.row, 3);
      assert.equal(d.to.col, 6);
    });

    it("should handle piece at left edge correctly", () => {
      // Black man at (2,0) - wait, (2,0) is not a dark square ((2+0)%2 = 0).
      // Use (3,0) which is dark ((3+0)%2 = 1)
      const state = customState(
        [
          { coord: { row: 3, col: 0 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);
      // Can only move to (4,1), not (4,-1) which is OOB
      assert.equal(actions.length, 1);
      const d = actions[0].data as any;
      assert.equal(d.to.row, 4);
      assert.equal(d.to.col, 1);
    });

    it("should not allow jumping own pieces", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // (2,1) cannot jump over (3,2) because same color
      const jumpOwn = actions.find((a) => {
        const d = a.data as any;
        return d.from.row === 2 && d.from.col === 1 && d.to.row === 4 && d.to.col === 3;
      });
      assert.equal(jumpOwn, undefined, "Should not jump own pieces");
    });

    it("should not allow jumping to occupied landing square", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 3, col: 2 }, piece: { color: "white", type: "man" } },
          { coord: { row: 4, col: 3 }, piece: { color: "black", type: "man" } }, // blocks landing
          { coord: { row: 6, col: 1 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const actions = CheckersModule.getLegalActions(state, P1);

      // (2,1) cannot jump to (4,3) because it's occupied
      const blockedJump = actions.find((a) => {
        const d = a.data as any;
        return d.from.row === 2 && d.from.col === 1 && d.to.row === 4 && d.to.col === 3;
      });
      assert.equal(blockedJump, undefined, "Should not jump to occupied square");
    });

    it("should record lastMove after applying action", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      const action = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      const newState = CheckersModule.applyAction(state, P1, action);
      const data = getData(newState);

      assert.deepEqual(data.lastMove, {
        from: { row: 2, col: 1 },
        to: { row: 3, col: 2 },
      });
    });

    it("should increment turnNumber after each move", () => {
      const state = customState(
        [
          { coord: { row: 2, col: 1 }, piece: { color: "black", type: "man" } },
          { coord: { row: 6, col: 3 }, piece: { color: "white", type: "man" } },
        ],
        "black"
      );

      assert.equal(state.turnNumber, 0);
      const action = move({ row: 2, col: 1 }, { row: 3, col: 2 });
      const newState = CheckersModule.applyAction(state, P1, action);
      assert.equal(newState.turnNumber, 1);
    });
  });

  describe("UI", () => {
    it("should parse simple move input", () => {
      const ui = CheckersModule.ui!;
      const action = ui.parseInput("c3-d4", {});

      assert.ok(action !== null);
      const d = action!.data as any;
      assert.equal(d.from.row, 2); // "3" -> row 2
      assert.equal(d.from.col, 2); // "c" -> col 2
      assert.equal(d.to.row, 3);   // "4" -> row 3
      assert.equal(d.to.col, 3);   // "d" -> col 3
      assert.deepEqual(d.path, []);
    });

    it("should parse jump input", () => {
      const ui = CheckersModule.ui!;
      const action = ui.parseInput("c3:e5", {});

      assert.ok(action !== null);
      const d = action!.data as any;
      assert.equal(d.from.row, 2);
      assert.equal(d.from.col, 2);
      assert.equal(d.to.row, 4);
      assert.equal(d.to.col, 4);
      assert.deepEqual(d.path, []);
    });

    it("should parse multi-jump input", () => {
      const ui = CheckersModule.ui!;
      const action = ui.parseInput("c3:e5:g3", {});

      assert.ok(action !== null);
      const d = action!.data as any;
      assert.equal(d.from.row, 2);
      assert.equal(d.from.col, 2);
      assert.equal(d.to.row, 2);
      assert.equal(d.to.col, 6);
      assert.equal(d.path.length, 1);
      assert.equal(d.path[0].row, 4);
      assert.equal(d.path[0].col, 4);
    });

    it("should return null for invalid input", () => {
      const ui = CheckersModule.ui!;
      assert.equal(ui.parseInput("", {}), null);
      assert.equal(ui.parseInput("xyz", {}), null);
      assert.equal(ui.parseInput("z9-a1", {}), null);
    });

    it("should format action correctly", () => {
      const ui = CheckersModule.ui!;

      const simpleAction = move({ row: 2, col: 2 }, { row: 3, col: 3 });
      assert.equal(ui.formatAction(simpleAction), "c3\u2192d4");

      const jumpAction = move(
        { row: 2, col: 2 },
        { row: 2, col: 6 },
        [{ row: 4, col: 4 }]
      );
      assert.equal(ui.formatAction(jumpAction), "c3\u2192e5\u2192g3");
    });

    it("should return correct player labels", () => {
      const ui = CheckersModule.ui!;
      const publicData = {
        colors: { [P1]: "black", [P2]: "white" },
      };

      assert.equal(ui.getPlayerLabel(P1, publicData), "Black");
      assert.equal(ui.getPlayerLabel(P2, publicData), "White");
    });

    it("should render board without error", () => {
      const state = CheckersModule.init(CONFIG, [P1, P2], "seed");
      const obs = CheckersModule.getObservation(state, P1);
      const ui = CheckersModule.ui!;
      const rendered = ui.renderBoard(obs.publicData);

      assert.ok(typeof rendered === "string");
      assert.ok(rendered.length > 0);
      // Should contain row numbers
      assert.ok(rendered.includes("1"));
      assert.ok(rendered.includes("8"));
    });
  });

  describe("full game simulation", () => {
    it("should allow a sequence of moves alternating turns", () => {
      let state = CheckersModule.init(CONFIG, [P1, P2], "seed");

      // Black moves
      const blackActions = CheckersModule.getLegalActions(state, P1);
      assert.ok(blackActions.length > 0);
      state = CheckersModule.applyAction(state, P1, blackActions[0]);
      assert.equal(state.currentPlayer, P2);

      // White moves
      const whiteActions = CheckersModule.getLegalActions(state, P2);
      assert.ok(whiteActions.length > 0);
      state = CheckersModule.applyAction(state, P2, whiteActions[0]);
      assert.equal(state.currentPlayer, P1);

      assert.equal(state.turnNumber, 2);
      assert.equal(CheckersModule.isTerminal(state), false);
    });
  });
});
