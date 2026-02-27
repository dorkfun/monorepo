import { strict as assert } from "assert";
import { GameConfig, GameState, Action } from "@dorkfun/core";
import { HexModule } from "./rules";
import { HexData, BOARD_SIZE, checkWin, emptyBoard, cloneBoard } from "./state";

const P1 = "0xPlayer1";
const P2 = "0xPlayer2";
const CONFIG: GameConfig = { gameId: "hex", version: "0.1.0" };

function getData(state: GameState): HexData {
  return state.data as unknown as HexData;
}

function place(row: number, col: number): Action {
  return { type: "place", data: { row, col } };
}

function swap(): Action {
  return { type: "swap", data: {} };
}

describe("HexModule", () => {
  describe("init", () => {
    it("should initialize a game with empty 11x11 board", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(state.gameId, "hex");
      assert.deepEqual(state.players, [P1, P2]);
      assert.equal(state.currentPlayer, P1);
      assert.equal(state.turnNumber, 0);
      assert.equal(data.board.length, BOARD_SIZE);
      for (let r = 0; r < BOARD_SIZE; r++) {
        assert.equal(data.board[r].length, BOARD_SIZE);
        for (let c = 0; c < BOARD_SIZE; c++) {
          assert.equal(data.board[r][c], "");
        }
      }
    });

    it("should assign Red to first player and Blue to second", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.colors[P1], "R");
      assert.equal(data.colors[P2], "B");
      assert.equal(data.activeColor, "R");
    });

    it("should start with swapAvailable false", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.swapAvailable, false);
      assert.equal(data.swapped, false);
      assert.equal(data.firstMove, null);
      assert.equal(data.lastMove, null);
    });

    it("should start with no terminal status", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.terminalStatus, null);
      assert.equal(data.winnerColor, null);
    });

    it("should throw for wrong number of players", () => {
      assert.throws(
        () => HexModule.init(CONFIG, [P1], "seed"),
        /exactly 2 players/
      );
      assert.throws(
        () => HexModule.init(CONFIG, [P1, P2, "0xP3"], "seed"),
        /exactly 2 players/
      );
    });
  });

  describe("validateAction", () => {
    it("should accept valid placement on empty cell", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(HexModule.validateAction(state, P1, place(0, 0)), true);
      assert.equal(HexModule.validateAction(state, P1, place(5, 5)), true);
      assert.equal(HexModule.validateAction(state, P1, place(10, 10)), true);
    });

    it("should reject moves from wrong player", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(HexModule.validateAction(state, P2, place(0, 0)), false);
    });

    it("should reject placement on occupied cell", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const next = HexModule.applyAction(state, P1, place(5, 5));
      // P2's turn now, try to place on (5,5) which is occupied
      assert.equal(HexModule.validateAction(next, P2, place(5, 5)), false);
    });

    it("should reject out-of-bounds placement", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(
        HexModule.validateAction(state, P1, { type: "place", data: { row: -1, col: 0 } }),
        false
      );
      assert.equal(
        HexModule.validateAction(state, P1, { type: "place", data: { row: 0, col: 11 } }),
        false
      );
      assert.equal(
        HexModule.validateAction(state, P1, { type: "place", data: { row: 11, col: 0 } }),
        false
      );
    });

    it("should reject swap on turn 0", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(HexModule.validateAction(state, P1, swap()), false);
    });

    it("should accept swap on turn 1 when available", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const afterFirst = HexModule.applyAction(state, P1, place(5, 5));
      // P2 can swap on turn 1
      assert.equal(HexModule.validateAction(afterFirst, P2, swap()), true);
    });

    it("should reject swap after turn 1", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, place(3, 3)); // P2 places instead of swapping
      // Now it's turn 2, P1's turn - swap should be rejected
      assert.equal(HexModule.validateAction(s2, P1, swap()), false);
    });

    it("should reject invalid action types", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const badAction: Action = { type: "invalid", data: {} };
      assert.equal(HexModule.validateAction(state, P1, badAction), false);
    });

    it("should reject actions on terminal state", () => {
      // Build a winning Red path: straight down column 0
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 0)); // Red
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 10)); // Blue
        }
      }
      // Game should be terminal now
      assert.equal(HexModule.isTerminal(state), true);
      assert.equal(
        HexModule.validateAction(state, state.currentPlayer, place(5, 5)),
        false
      );
    });
  });

  describe("applyAction - place", () => {
    it("should place stone and switch turns", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const next = HexModule.applyAction(state, P1, place(3, 4));
      const data = getData(next);

      assert.equal(data.board[3][4], "R");
      assert.equal(next.currentPlayer, P2);
      assert.equal(next.turnNumber, 1);
      assert.equal(data.activeColor, "B");
    });

    it("should set swapAvailable to true after first move", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const next = HexModule.applyAction(state, P1, place(5, 5));
      const data = getData(next);

      assert.equal(data.swapAvailable, true);
      assert.deepEqual(data.firstMove, { row: 5, col: 5 });
    });

    it("should set swapAvailable to false after second move", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, place(3, 3));
      const data = getData(s2);

      assert.equal(data.swapAvailable, false);
    });

    it("should record lastMove", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const next = HexModule.applyAction(state, P1, place(7, 2));
      const data = getData(next);

      assert.deepEqual(data.lastMove, { row: 7, col: 2 });
    });

    it("should not mutate original state", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const origBoard = getData(state).board.map((r) => [...r]);
      HexModule.applyAction(state, P1, place(0, 0));
      assert.deepEqual(getData(state).board, origBoard);
    });
  });

  describe("swap rule", () => {
    it("should swap colors correctly after first move", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      // P1 plays Red at (5,5)
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      // P2 swaps
      const s2 = HexModule.applyAction(s1, P2, swap());
      const data = getData(s2);

      // P2 now owns Red, P1 now owns Blue
      assert.equal(data.colors[P2], "R");
      assert.equal(data.colors[P1], "B");
      assert.equal(data.swapped, true);
      assert.equal(data.swapAvailable, false);
    });

    it("should give turn to the player with Blue after swap", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, swap());

      // P1 is now Blue and it's their turn
      assert.equal(s2.currentPlayer, P1);
      assert.equal(getData(s2).activeColor, "B");
    });

    it("should preserve the first stone on the board after swap", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, swap());
      const data = getData(s2);

      // The stone at (5,5) is still "R"
      assert.equal(data.board[5][5], "R");
    });

    it("should set lastMove to firstMove after swap", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(3, 7));
      const s2 = HexModule.applyAction(s1, P2, swap());
      const data = getData(s2);

      assert.deepEqual(data.lastMove, { row: 3, col: 7 });
      assert.deepEqual(data.firstMove, { row: 3, col: 7 });
    });

    it("should reject swap when it is not available", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      // Turn 0: swap not available yet
      assert.equal(HexModule.validateAction(state, P1, swap()), false);
    });

    it("should reject swap after it has been passed (turn 2+)", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      // P2 places instead of swapping
      const s2 = HexModule.applyAction(s1, P2, place(3, 3));
      // Turn 2: swap should be unavailable
      const data = getData(s2);
      assert.equal(data.swapAvailable, false);
      assert.equal(HexModule.validateAction(s2, P1, swap()), false);
    });

    it("should allow normal gameplay to continue after swap", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, swap());

      // P1 now plays Blue
      const s3 = HexModule.applyAction(s2, P1, place(0, 0));
      const data = getData(s3);
      assert.equal(data.board[0][0], "B");
      assert.equal(s3.currentPlayer, P2);
      assert.equal(data.activeColor, "R");
    });
  });

  describe("win detection - Red", () => {
    it("should detect Red winning by connecting top to bottom (straight column)", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");

      // Red plays column 5 from top to bottom, Blue plays column 9
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 5)); // Red
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 9)); // Blue
        }
      }

      assert.equal(HexModule.isTerminal(state), true);
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P1);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.reason, "connected");
      assert.equal(outcome.scores[P1], 1);
      assert.equal(outcome.scores[P2], 0);
    });

    it("should detect Red winning with a winding path", () => {
      // Build a winding Red path from row 0 to row 10
      // Path: (0,5) -> (1,5) -> (2,4) -> (3,4) -> (4,3) -> (5,3) ->
      //        (6,3) -> (7,3) -> (8,3) -> (9,3) -> (10,3)
      const redMoves: [number, number][] = [
        [0, 5], [1, 5], [2, 4], [3, 4], [4, 3],
        [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3],
      ];
      // Blue plays far away and doesn't interfere
      const blueMoves: [number, number][] = [
        [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
        [5, 0], [6, 0], [7, 0], [8, 0], [9, 0],
      ];

      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let i = 0; i < redMoves.length; i++) {
        state = HexModule.applyAction(
          state,
          state.currentPlayer,
          place(redMoves[i][0], redMoves[i][1])
        );
        if (i < blueMoves.length) {
          state = HexModule.applyAction(
            state,
            state.currentPlayer,
            place(blueMoves[i][0], blueMoves[i][1])
          );
        }
      }

      assert.equal(HexModule.isTerminal(state), true);
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P1);
      assert.equal(outcome.reason, "connected");
    });
  });

  describe("win detection - Blue", () => {
    it("should detect Blue winning by connecting left to right (straight row)", () => {
      // Blue needs to connect col 0 to col 10.
      // Since Red goes first, we need to let Blue build a row path.
      let state = HexModule.init(CONFIG, [P1, P2], "seed");

      // Red plays row 0, Blue plays row 5 across all columns
      for (let c = 0; c < BOARD_SIZE; c++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(0, c)); // Red in row 0
        if (c < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(5, c)); // Blue in row 5
        }
      }
      // Red has filled row 0 (11 stones). But that's a row, not top-bottom for Red.
      // Blue has 10 stones in row 5. Place the last Blue stone.
      // Actually Red just played (0,10) which is the 11th red stone.
      // Red has a straight row in row 0, but Red needs top-to-bottom (column path).
      // Row 0 is only row 0, doesn't connect to row 10.
      // So Red has NOT won. Blue needs one more stone.

      // Wait - let's recount. Red plays first each pair.
      // After the loop: Red placed at (0,0), (0,1), ..., (0,10) = 11 moves
      // Blue placed at (5,0), (5,1), ..., (5,9) = 10 moves
      // Total turns = 21, currently P2's turn. Blue needs (5,10).
      state = HexModule.applyAction(state, state.currentPlayer, place(5, 10)); // Blue completes row 5

      assert.equal(HexModule.isTerminal(state), true);
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P2);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.reason, "connected");
      assert.equal(outcome.scores[P2], 1);
      assert.equal(outcome.scores[P1], 0);
    });

    it("should detect Blue winning with a winding path", () => {
      // Blue path from col 0 to col 10:
      // (5,0) -> (5,1) -> (4,2) -> (4,3) -> (4,4) ->
      // (3,5) -> (3,6) -> (3,7) -> (3,8) -> (3,9) -> (3,10)
      const blueMoves: [number, number][] = [
        [5, 0], [5, 1], [4, 2], [4, 3], [4, 4],
        [3, 5], [3, 6], [3, 7], [3, 8], [3, 9], [3, 10],
      ];
      // Red plays in bottom rows, not forming a path
      const redMoves: [number, number][] = [
        [10, 0], [10, 1], [10, 2], [10, 3], [10, 4],
        [10, 5], [10, 6], [10, 7], [10, 8], [10, 9], [10, 10],
      ];

      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let i = 0; i < blueMoves.length; i++) {
        state = HexModule.applyAction(
          state,
          state.currentPlayer,
          place(redMoves[i][0], redMoves[i][1])
        ); // Red
        state = HexModule.applyAction(
          state,
          state.currentPlayer,
          place(blueMoves[i][0], blueMoves[i][1])
        ); // Blue
      }

      assert.equal(HexModule.isTerminal(state), true);
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P2);
      assert.equal(outcome.reason, "connected");
    });
  });

  describe("BFS correctness", () => {
    it("should detect a winding connected path", () => {
      // Winding Red path that uses hex adjacency:
      // (0,0) -> (1,0) -> (1,1) -> (2,0) -> (3,0) ->
      // (4,0) -> (5,0) -> (6,0) -> (7,0) -> (8,0) ->
      // (9,0) -> (10,0)
      const board = emptyBoard();
      board[0][0] = "R";
      board[1][0] = "R";
      board[1][1] = "R";
      board[2][0] = "R";
      board[3][0] = "R";
      board[4][0] = "R";
      board[5][0] = "R";
      board[6][0] = "R";
      board[7][0] = "R";
      board[8][0] = "R";
      board[9][0] = "R";
      board[10][0] = "R";

      assert.equal(checkWin(board, "R"), true);
    });

    it("should detect a zigzag path using hex neighbors", () => {
      // Zigzag path using [-1,1] and [1,0] neighbors:
      // (0,5) -> (1,4) -> (2,4) -> (3,3) -> (4,3) ->
      // (5,2) -> (6,2) -> (7,1) -> (8,1) -> (9,0) -> (10,0)
      const board = emptyBoard();
      board[0][5] = "R";
      board[1][4] = "R"; // neighbor of (0,5): [1,-1] = (1,4) YES
      board[2][4] = "R"; // neighbor of (1,4): [1,0] = (2,4) YES
      board[3][3] = "R"; // neighbor of (2,4): [1,-1] = (3,3) YES
      board[4][3] = "R"; // neighbor of (3,3): [1,0] = (4,3) YES
      board[5][2] = "R"; // neighbor of (4,3): [1,-1] = (5,2) YES
      board[6][2] = "R"; // neighbor of (5,2): [1,0] = (6,2) YES
      board[7][1] = "R"; // neighbor of (6,2): [1,-1] = (7,1) YES
      board[8][1] = "R"; // neighbor of (7,1): [1,0] = (8,1) YES
      board[9][0] = "R"; // neighbor of (8,1): [1,-1] = (9,0) YES
      board[10][0] = "R"; // neighbor of (9,0): [1,0] = (10,0) YES

      assert.equal(checkWin(board, "R"), true);
    });

    it("should NOT detect a win for a disconnected near-path", () => {
      // Red stones that almost connect but have a gap
      const board = emptyBoard();
      // Top half
      board[0][5] = "R";
      board[1][5] = "R";
      board[2][5] = "R";
      board[3][5] = "R";
      board[4][5] = "R";
      // Gap at row 5
      // Bottom half
      board[6][5] = "R";
      board[7][5] = "R";
      board[8][5] = "R";
      board[9][5] = "R";
      board[10][5] = "R";

      assert.equal(checkWin(board, "R"), false);
    });

    it("should NOT detect a win for a path that doesn't reach the far side", () => {
      const board = emptyBoard();
      // Red path from row 0 to row 8 (doesn't reach row 10)
      for (let r = 0; r <= 8; r++) {
        board[r][5] = "R";
      }
      assert.equal(checkWin(board, "R"), false);
    });

    it("should not confuse Red and Blue paths", () => {
      const board = emptyBoard();
      // Blue stones in a column (this is NOT a Blue win - Blue needs left-right)
      for (let r = 0; r < BOARD_SIZE; r++) {
        board[r][5] = "B";
      }
      // This is column, which would be a Red path, but these are Blue stones
      assert.equal(checkWin(board, "R"), false);
      // Blue needs col 0 to col 10, not row 0 to row 10
      assert.equal(checkWin(board, "B"), false);
    });

    it("should detect Blue path from left to right", () => {
      const board = emptyBoard();
      // Blue row path
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[3][c] = "B";
      }
      assert.equal(checkWin(board, "B"), true);
    });
  });

  describe("edge win", () => {
    it("should detect Red winning along the left edge (column 0)", () => {
      const board = emptyBoard();
      for (let r = 0; r < BOARD_SIZE; r++) {
        board[r][0] = "R";
      }
      assert.equal(checkWin(board, "R"), true);
    });

    it("should detect Red winning along the right edge (column 10)", () => {
      const board = emptyBoard();
      for (let r = 0; r < BOARD_SIZE; r++) {
        board[r][10] = "R";
      }
      assert.equal(checkWin(board, "R"), true);
    });

    it("should detect Blue winning along the top edge (row 0)", () => {
      const board = emptyBoard();
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[0][c] = "B";
      }
      assert.equal(checkWin(board, "B"), true);
    });

    it("should detect Blue winning along the bottom edge (row 10)", () => {
      const board = emptyBoard();
      for (let c = 0; c < BOARD_SIZE; c++) {
        board[10][c] = "B";
      }
      assert.equal(checkWin(board, "B"), true);
    });
  });

  describe("minimum moves to win", () => {
    it("should allow Red to win in exactly 11 moves (straight column path)", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");

      // Red plays column 5 top to bottom, Blue plays column 8
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 5)); // Red
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 8)); // Blue
        }
      }

      assert.equal(HexModule.isTerminal(state), true);
      // Red made 11 moves, Blue made 10 moves = 21 total turns
      assert.equal(state.turnNumber, 21);

      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P1);
    });

    it("should allow Blue to win in exactly 11 moves (straight row path)", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");

      // Red plays row 0, Blue plays row 5
      for (let c = 0; c < BOARD_SIZE; c++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(0, c)); // Red row 0
        if (c < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(5, c)); // Blue row 5
        }
      }
      // Red has 11 stones in row 0 (not a top-bottom path, just one row)
      // Blue has 10 stones. Need one more Blue stone.
      state = HexModule.applyAction(state, state.currentPlayer, place(5, 10));

      assert.equal(HexModule.isTerminal(state), true);
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.winner, P2);
    });
  });

  describe("no draws", () => {
    it("should never produce a draw outcome", () => {
      // Play a game where Red wins
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 3));
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 7));
        }
      }
      const outcome = HexModule.getOutcome(state);
      assert.equal(outcome.draw, false);
    });
  });

  describe("immutability and determinism", () => {
    it("should produce identical states for identical inputs", () => {
      const state1 = HexModule.init(CONFIG, [P1, P2], "seed");
      const state2 = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.deepEqual(state1, state2);

      const next1 = HexModule.applyAction(state1, P1, place(5, 5));
      const next2 = HexModule.applyAction(state2, P1, place(5, 5));
      assert.deepEqual(next1, next2);
    });

    it("should not mutate the original state on place", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const dataBefore = JSON.parse(JSON.stringify(getData(state)));
      HexModule.applyAction(state, P1, place(3, 4));
      const dataAfter = getData(state);
      assert.deepEqual(dataAfter, dataBefore);
    });

    it("should not mutate the original state on swap", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const dataBefore = JSON.parse(JSON.stringify(getData(s1)));
      HexModule.applyAction(s1, P2, swap());
      const dataAfter = getData(s1);
      assert.deepEqual(dataAfter, dataBefore);
    });
  });

  describe("getObservation", () => {
    it("should return full public state", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      state = HexModule.applyAction(state, P1, place(5, 5));

      const obs = HexModule.getObservation(state, P1);
      assert.equal(obs.gameId, "hex");
      assert.deepEqual(obs.players, [P1, P2]);
      assert.equal(obs.currentPlayer, P2);
      assert.equal(obs.turnNumber, 1);

      const pubData = obs.publicData as Record<string, unknown>;
      const board = pubData.board as string[][];
      assert.equal(board[5][5], "R");
      assert.equal(pubData.activeColor, "B");
      assert.equal(pubData.swapAvailable, true);
    });

    it("should return same observation for both players", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      state = HexModule.applyAction(state, P1, place(0, 0));

      const obs1 = HexModule.getObservation(state, P1);
      const obs2 = HexModule.getObservation(state, P2);

      assert.deepEqual(obs1.publicData, obs2.publicData);
    });

    it("should clone the board in observation (not share reference)", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      state = HexModule.applyAction(state, P1, place(5, 5));

      const obs = HexModule.getObservation(state, P1);
      const pubBoard = (obs.publicData as Record<string, unknown>).board as string[][];
      pubBoard[5][5] = "X"; // mutate observation board

      // Original state should be unaffected
      assert.equal(getData(state).board[5][5], "R");
    });
  });

  describe("getLegalActions", () => {
    it("should return all 121 moves for new game (current player)", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const actions = HexModule.getLegalActions(state, P1);
      assert.equal(actions.length, 121); // 11*11
    });

    it("should return empty for non-current player", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const actions = HexModule.getLegalActions(state, P2);
      assert.equal(actions.length, 0);
    });

    it("should include swap on turn 1", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const actions = HexModule.getLegalActions(s1, P2);
      // 120 empty cells + 1 swap = 121
      assert.equal(actions.length, 121);
      const swapActions = actions.filter((a) => a.type === "swap");
      assert.equal(swapActions.length, 1);
    });

    it("should not include swap after turn 1", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, place(3, 3));
      const actions = HexModule.getLegalActions(s2, P1);
      const swapActions = actions.filter((a) => a.type === "swap");
      assert.equal(swapActions.length, 0);
    });

    it("should decrease as pieces are placed", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      const s1 = HexModule.applyAction(state, P1, place(5, 5));
      const s2 = HexModule.applyAction(s1, P2, place(3, 3));

      const actions = HexModule.getLegalActions(s2, P1);
      assert.equal(actions.length, 119); // 121 - 2
    });

    it("should return empty for terminal state", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 5));
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 8));
        }
      }
      assert.equal(HexModule.isTerminal(state), true);
      const actions = HexModule.getLegalActions(state, P1);
      assert.equal(actions.length, 0);
      const actions2 = HexModule.getLegalActions(state, P2);
      assert.equal(actions2.length, 0);
    });
  });

  describe("isTerminal", () => {
    it("should return false for new game", () => {
      const state = HexModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(HexModule.isTerminal(state), false);
    });

    it("should return false for game in progress", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      state = HexModule.applyAction(state, P1, place(5, 5));
      state = HexModule.applyAction(state, P2, place(3, 3));
      assert.equal(HexModule.isTerminal(state), false);
    });

    it("should return true when Red connects top to bottom", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      for (let r = 0; r < BOARD_SIZE; r++) {
        state = HexModule.applyAction(state, state.currentPlayer, place(r, 5));
        if (r < BOARD_SIZE - 1) {
          state = HexModule.applyAction(state, state.currentPlayer, place(r, 9));
        }
      }
      assert.equal(HexModule.isTerminal(state), true);
    });
  });

  describe("UI", () => {
    it("should render the board", () => {
      let state = HexModule.init(CONFIG, [P1, P2], "seed");
      state = HexModule.applyAction(state, P1, place(0, 0));
      const obs = HexModule.getObservation(state, P1);
      const rendered = HexModule.ui!.renderBoard(obs.publicData);
      assert.ok(rendered.includes("hex-r"));
      assert.ok(rendered.includes("a"));
      assert.ok(rendered.includes("k"));
    });

    it("should parse coordinate input", () => {
      const action = HexModule.ui!.parseInput("f6", {});
      assert.notEqual(action, null);
      assert.equal(action!.type, "place");
      assert.equal((action!.data as { row: number }).row, 5);
      assert.equal((action!.data as { col: number }).col, 5);
    });

    it("should parse swap input", () => {
      const action = HexModule.ui!.parseInput("swap", {});
      assert.notEqual(action, null);
      assert.equal(action!.type, "swap");
    });

    it("should parse edge coordinates", () => {
      // a1 -> (0,0)
      const a1 = HexModule.ui!.parseInput("a1", {});
      assert.equal((a1!.data as { row: number }).row, 0);
      assert.equal((a1!.data as { col: number }).col, 0);

      // k11 -> (10,10)
      const k11 = HexModule.ui!.parseInput("k11", {});
      assert.equal((k11!.data as { row: number }).row, 10);
      assert.equal((k11!.data as { col: number }).col, 10);
    });

    it("should reject invalid input", () => {
      assert.equal(HexModule.ui!.parseInput("z1", {}), null);
      assert.equal(HexModule.ui!.parseInput("a0", {}), null);
      assert.equal(HexModule.ui!.parseInput("a12", {}), null);
      assert.equal(HexModule.ui!.parseInput("", {}), null);
    });

    it("should format place actions", () => {
      const formatted = HexModule.ui!.formatAction(place(5, 5));
      assert.equal(formatted, "f6");
    });

    it("should format swap actions", () => {
      const formatted = HexModule.ui!.formatAction(swap());
      assert.equal(formatted, "swap");
    });

    it("should render swap status when available", () => {
      const status = HexModule.ui!.renderStatus({ swapAvailable: true });
      assert.equal(status, "Swap available");
    });

    it("should render null status when swap not available", () => {
      const status = HexModule.ui!.renderStatus({ swapAvailable: false });
      assert.equal(status, null);
    });

    it("should get player label", () => {
      const colors = { [P1]: "R", [P2]: "B" };
      assert.equal(HexModule.ui!.getPlayerLabel(P1, { colors }), "Red (\u2195)");
      assert.equal(HexModule.ui!.getPlayerLabel(P2, { colors }), "Blue (\u2194)");
    });
  });

  describe("cloneBoard", () => {
    it("should create an independent copy", () => {
      const board = emptyBoard();
      board[5][5] = "R";
      const clone = cloneBoard(board);
      clone[5][5] = "B";
      assert.equal(board[5][5], "R"); // original unchanged
      assert.equal(clone[5][5], "B");
    });
  });
});
