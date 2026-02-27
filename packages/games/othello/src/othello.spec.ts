import { strict as assert } from "assert";
import { GameConfig, GameState, Action } from "@dorkfun/core";
import { OthelloModule } from "./rules";
import {
  OthelloData,
  Board,
  CellValue,
  BOARD_SIZE,
  getFlips,
  hasLegalMove,
  countPieces,
  cloneBoard,
  initialBoard,
  emptyBoard,
  isBoardFull,
} from "./state";

const P1 = "0xPlayer1";
const P2 = "0xPlayer2";
const CONFIG: GameConfig = { gameId: "othello", version: "0.1.0" };

function getData(state: GameState): OthelloData {
  return state.data as unknown as OthelloData;
}

function place(row: number, col: number): Action {
  return { type: "place", data: { row, col } };
}

function pass(): Action {
  return { type: "pass", data: {} };
}

describe("OthelloModule", () => {
  // -----------------------------------------------------------------------
  // init
  // -----------------------------------------------------------------------
  describe("init", () => {
    it("should initialize with the standard center 4 pieces", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(data.board[3][3], "W");
      assert.equal(data.board[3][4], "B");
      assert.equal(data.board[4][3], "B");
      assert.equal(data.board[4][4], "W");
    });

    it("should have Black go first", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(state.currentPlayer, P1);
      assert.equal(data.activeColor, "B");
      assert.equal(data.colors[P1], "B");
      assert.equal(data.colors[P2], "W");
    });

    it("should start with 2 pieces each", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const pieces = countPieces(getData(state).board);

      assert.equal(pieces.B, 2);
      assert.equal(pieces.W, 2);
    });

    it("should have correct initial metadata", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      assert.equal(state.gameId, "othello");
      assert.deepEqual(state.players, [P1, P2]);
      assert.equal(state.turnNumber, 0);
      assert.equal(data.consecutivePasses, 0);
      assert.equal(data.lastMove, null);
      assert.equal(data.terminalStatus, null);
      assert.equal(data.winnerColor, null);
    });

    it("should throw for wrong number of players", () => {
      assert.throws(
        () => OthelloModule.init(CONFIG, [P1], "seed"),
        /exactly 2 players/
      );
      assert.throws(
        () => OthelloModule.init(CONFIG, [P1, P2, "0xP3"], "seed"),
        /exactly 2 players/
      );
    });
  });

  // -----------------------------------------------------------------------
  // validateAction
  // -----------------------------------------------------------------------
  describe("validateAction", () => {
    it("should accept a legal placement", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      // Black can play at (2,3) — flips (3,3)→W to B? No, (2,3) flanks
      // Actually let's check: (2,3) with B: board[3][3]=W (opponent),
      // board[4][3]=B (own) — flips (3,3). Valid!
      assert.equal(
        OthelloModule.validateAction(state, P1, place(2, 3)),
        true
      );
    });

    it("should reject placement that produces no flips", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      // (0,0) is far from any piece, no flips possible
      assert.equal(
        OthelloModule.validateAction(state, P1, place(0, 0)),
        false
      );
    });

    it("should reject placement on occupied cell", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      // (3,3) is already "W"
      assert.equal(
        OthelloModule.validateAction(state, P1, place(3, 3)),
        false
      );
    });

    it("should reject moves from wrong player", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(
        OthelloModule.validateAction(state, P2, place(2, 3)),
        false
      );
    });

    it("should reject out-of-range positions", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(
        OthelloModule.validateAction(state, P1, place(-1, 0)),
        false
      );
      assert.equal(
        OthelloModule.validateAction(state, P1, place(0, 8)),
        false
      );
    });

    it("should reject pass when moves exist", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      // Black has legal moves at start, so pass is invalid
      assert.equal(
        OthelloModule.validateAction(state, P1, pass()),
        false
      );
    });

    it("should accept pass when no moves exist", () => {
      // Build a state where the current player has no legal moves
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      // Create a board where Black cannot move but White can
      const board = emptyBoard();
      // Fill edges with Black, one White in corner with no flankable Black
      board[0][0] = "W";
      board[0][1] = "B";
      // Only B on the board — White has no opponent pieces adjacent
      // Actually let's be precise: we need Black's turn with no legal moves.
      // Simplest: a board where all empty cells are not flankable by Black.
      // Let's construct: all cells B except one W with no empty adjacent flanking.

      // Use a simpler approach: manually set up the data
      const customData: OthelloData = {
        board: emptyBoard(),
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };

      // Board with only W pieces and no way for B to flank
      // Place W pieces with no B pieces on the board at all
      customData.board[0][0] = "W";
      customData.board[0][1] = "W";

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 5,
        data: customData as unknown as Record<string, unknown>,
      };

      // Black has no pieces on the board, so cannot form a flank
      assert.equal(hasLegalMove(customData.board, "B"), false);
      assert.equal(
        OthelloModule.validateAction(customState, P1, pass()),
        true
      );
    });

    it("should reject invalid action types", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const badAction: Action = { type: "invalid", data: {} };
      assert.equal(
        OthelloModule.validateAction(state, P1, badAction),
        false
      );
    });
  });

  // -----------------------------------------------------------------------
  // applyAction - place
  // -----------------------------------------------------------------------
  describe("applyAction - place", () => {
    it("should flip opponent pieces in one direction", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      // Black plays at (2,3): flanks W at (3,3) with B at (4,3)
      const next = OthelloModule.applyAction(state, P1, place(2, 3));
      const data = getData(next);

      assert.equal(data.board[2][3], "B"); // placed
      assert.equal(data.board[3][3], "B"); // flipped from W
      assert.equal(data.board[4][3], "B"); // was already B
    });

    it("should switch turn to the other player", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const next = OthelloModule.applyAction(state, P1, place(2, 3));
      const data = getData(next);

      assert.equal(next.currentPlayer, P2);
      assert.equal(data.activeColor, "W");
      assert.equal(next.turnNumber, 1);
    });

    it("should reset consecutivePasses to 0", () => {
      // Start a game, force a pass, then place
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);

      // Manually set consecutivePasses to 1 to test reset
      const modifiedData: OthelloData = {
        ...data,
        consecutivePasses: 1,
      };
      const modifiedState: GameState = {
        ...state,
        data: modifiedData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(
        modifiedState,
        P1,
        place(2, 3)
      );
      assert.equal(getData(next).consecutivePasses, 0);
    });

    it("should record lastMove", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const next = OthelloModule.applyAction(state, P1, place(2, 3));
      const data = getData(next);

      assert.deepEqual(data.lastMove, { row: 2, col: 3 });
    });

    it("should flip in multiple directions", () => {
      let state = OthelloModule.init(CONFIG, [P1, P2], "seed");

      // Play a sequence to set up a multi-direction flip
      // Initial:
      //   col: 3  4
      // row 3: W  B
      // row 4: B  W
      //
      // Black plays (2,4): flanks W at (3,4)? No, (3,4) is B.
      // Let's play a proper opening sequence.

      // B plays (2,3) — flips (3,3)
      state = OthelloModule.applyAction(state, P1, place(2, 3));
      // Board:
      //   col: 3  4
      // row 2: B
      // row 3: B  B
      // row 4: B  W

      // W plays (2,2) — flips (3,3) back to W? Check:
      // (2,2) with W: direction (1,1) → (3,3)=B, (4,4)=W. Flips (3,3). Valid!
      state = OthelloModule.applyAction(state, P2, place(2, 2));
      // Board:
      //   col: 2  3  4
      // row 2:    B
      // row 2: W
      // row 3:    W  B
      // row 4:    B  W

      // B plays (2,4) — direction (1,-1) → (3,3)=W, (4,2)? out. Hmm.
      // Let me check: (2,4) with B: direction (1,0) → (3,4)=B — own piece, no flips down.
      // direction (1,-1) → (3,3)=W → (4,2)=''  — no bookend. Not valid in that direction.
      // direction (0,-1) → (2,3)=B — own piece, no flips. So (2,4) has 0 flips. Not valid.

      // Let's try B plays (4,2):
      // (4,2) with B: direction (-1,1) → (3,3)=W → (2,4)? = ''  — no bookend.
      // direction (-1,0) → (3,2)='' — no.
      // direction (0,1) → (4,3)=B — own piece, no.

      // Let me re-check the board state properly after two moves.
      const d1 = getData(state);

      // After Black (2,3) → flips (3,3):
      // board[2][3] = B, board[3][3] = B(flipped from W), board[3][4] = B, board[4][3] = B, board[4][4] = W
      // After White (2,2) → flips (3,3) back:
      // board[2][2] = W, board[3][3] = W(flipped from B)

      // State should be:
      assert.equal(d1.board[2][2], "W");
      assert.equal(d1.board[2][3], "B");
      assert.equal(d1.board[3][3], "W");
      assert.equal(d1.board[3][4], "B");
      assert.equal(d1.board[4][3], "B");
      assert.equal(d1.board[4][4], "W");

      // B plays (4,2):
      // direction (-1,1) → (3,3)=W → (2,4)='' — no bookend.
      // direction (0,1) → (4,3)=B — own, no flip.
      // So (4,2) isn't valid either. Let me find a valid multi-direction move.

      // B plays at (2,4):
      // Check flips: only direction we care about is any direction with opponent then own.
      // Not great. Let me just play a longer sequence to get a known multi-direction flip.

      // Instead of complex manual setup, let's just verify flipping works in the simple case
      // and separately test multi-direction via getFlips directly.
      const multiBoard = emptyBoard();
      // Set up a position where placing B at (3,3) flips in multiple directions
      // Put W at (3,4), (4,3), (4,4) and B bookends at (3,5), (5,3), (5,5)
      multiBoard[3][4] = "W"; // right of target
      multiBoard[3][5] = "B"; // bookend right
      multiBoard[4][3] = "W"; // below target
      multiBoard[5][3] = "B"; // bookend below
      multiBoard[4][4] = "W"; // diagonal below-right
      multiBoard[5][5] = "B"; // bookend diagonal

      const flips = getFlips(multiBoard, 3, 3, "B");
      assert.equal(flips.length, 3);

      // Check all three flipped cells are present
      const flipSet = new Set(flips.map((f) => `${f.row},${f.col}`));
      assert.ok(flipSet.has("3,4")); // right
      assert.ok(flipSet.has("4,3")); // down
      assert.ok(flipSet.has("4,4")); // diagonal
    });

    it("should flip long chains", () => {
      // Set up a long chain: B at col 0, W at cols 1-5, B at col 7
      // Place B at col 6 to flip cols 1-5? No, need bookend.
      // B at (0,0), W at (0,1),(0,2),(0,3),(0,4),(0,5), B at (0,6).
      // Place B at ... wait, all cells occupied. Let me set up differently.

      // Chain along row 0: empty at (0,0), W at (0,1)-(0,5), B at (0,6)
      const board = emptyBoard();
      for (let c = 1; c <= 5; c++) board[0][c] = "W";
      board[0][6] = "B";

      const flips = getFlips(board, 0, 0, "B");
      assert.equal(flips.length, 5);
      for (let c = 1; c <= 5; c++) {
        assert.ok(
          flips.some((f) => f.row === 0 && f.col === c),
          `Expected flip at (0,${c})`
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // applyAction - pass
  // -----------------------------------------------------------------------
  describe("applyAction - pass", () => {
    it("should increment consecutivePasses", () => {
      // Create a state where the current player must pass
      const customData: OthelloData = {
        board: emptyBoard(),
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };
      customData.board[0][0] = "W";

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 5,
        data: customData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(customState, P1, pass());
      const data = getData(next);

      assert.equal(data.consecutivePasses, 1);
    });

    it("should switch turn on pass", () => {
      const customData: OthelloData = {
        board: emptyBoard(),
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: { row: 2, col: 3 },
        terminalStatus: null,
        winnerColor: null,
      };
      customData.board[0][0] = "W";

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 5,
        data: customData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(customState, P1, pass());
      const data = getData(next);

      assert.equal(next.currentPlayer, P2);
      assert.equal(data.activeColor, "W");
      assert.equal(data.lastMove, null);
    });
  });

  // -----------------------------------------------------------------------
  // Terminal conditions
  // -----------------------------------------------------------------------
  describe("terminal conditions", () => {
    it("should detect board full", () => {
      // Create a nearly full board, one empty cell, place to fill it
      const board = emptyBoard();
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          board[r][c] = "B";
        }
      }
      // Leave (0,0) empty with a flippable W adjacent
      board[0][0] = "";
      board[0][1] = "W";
      // B at (0,2) to bookend the flip
      board[0][2] = "B";

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 58,
        data: customData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(customState, P1, place(0, 0));
      const data = getData(next);

      assert.equal(data.terminalStatus, "board_full");
      assert.equal(OthelloModule.isTerminal(next), true);
    });

    it("should detect double pass", () => {
      const customData: OthelloData = {
        board: emptyBoard(),
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 1, // One pass already
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };
      // No pieces to flip, so pass is legal
      customData.board[0][0] = "W";

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 10,
        data: customData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(customState, P1, pass());
      const data = getData(next);

      assert.equal(data.consecutivePasses, 2);
      assert.equal(data.terminalStatus, "double_pass");
      assert.equal(OthelloModule.isTerminal(next), true);
    });

    it("should not be terminal at start", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      assert.equal(OthelloModule.isTerminal(state), false);
    });
  });

  // -----------------------------------------------------------------------
  // getOutcome
  // -----------------------------------------------------------------------
  describe("getOutcome", () => {
    it("should return Black as winner when Black has more pieces", () => {
      const board = emptyBoard();
      // 5 Black, 3 White
      board[0][0] = "B";
      board[0][1] = "B";
      board[0][2] = "B";
      board[0][3] = "B";
      board[0][4] = "B";
      board[1][0] = "W";
      board[1][1] = "W";
      board[1][2] = "W";

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "W",
        consecutivePasses: 2,
        lastMove: null,
        terminalStatus: "double_pass",
        winnerColor: "B",
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P2,
        turnNumber: 8,
        data: customData as unknown as Record<string, unknown>,
      };

      const outcome = OthelloModule.getOutcome(customState);
      assert.equal(outcome.winner, P1);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.scores[P1], 1);
      assert.equal(outcome.scores[P2], 0);
      assert.equal(outcome.reason, "double_pass");
    });

    it("should return White as winner when White has more pieces", () => {
      const board = emptyBoard();
      board[0][0] = "B";
      board[0][1] = "B";
      board[1][0] = "W";
      board[1][1] = "W";
      board[1][2] = "W";

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 2,
        lastMove: null,
        terminalStatus: "double_pass",
        winnerColor: "W",
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 5,
        data: customData as unknown as Record<string, unknown>,
      };

      const outcome = OthelloModule.getOutcome(customState);
      assert.equal(outcome.winner, P2);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.scores[P1], 0);
      assert.equal(outcome.scores[P2], 1);
    });

    it("should return draw when piece counts are equal", () => {
      const board = emptyBoard();
      board[0][0] = "B";
      board[0][1] = "B";
      board[1][0] = "W";
      board[1][1] = "W";

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 2,
        lastMove: null,
        terminalStatus: "double_pass",
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 4,
        data: customData as unknown as Record<string, unknown>,
      };

      const outcome = OthelloModule.getOutcome(customState);
      assert.equal(outcome.winner, null);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.scores[P1], 0.5);
      assert.equal(outcome.scores[P2], 0.5);
    });

    it("should return game_in_progress for non-terminal state", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const outcome = OthelloModule.getOutcome(state);

      assert.equal(outcome.winner, null);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.reason, "game_in_progress");
    });
  });

  // -----------------------------------------------------------------------
  // Flipping correctness
  // -----------------------------------------------------------------------
  describe("flipping correctness", () => {
    it("should flip along an edge (corner placement)", () => {
      const board = emptyBoard();
      // W at (0,1), B at (0,2). Place B at (0,0) → flips (0,1)
      board[0][1] = "W";
      board[0][2] = "B";

      const flips = getFlips(board, 0, 0, "B");
      assert.equal(flips.length, 1);
      assert.deepEqual(flips[0], { row: 0, col: 1 });
    });

    it("should flip in all 8 directions simultaneously", () => {
      // Place B at center (4,4) surrounded by W in all 8 directions,
      // each with a B bookend
      const board = emptyBoard();

      // Up: W at (3,4), B at (2,4)
      board[3][4] = "W";
      board[2][4] = "B";
      // Down: W at (5,4), B at (6,4)
      board[5][4] = "W";
      board[6][4] = "B";
      // Left: W at (4,3), B at (4,2)
      board[4][3] = "W";
      board[4][2] = "B";
      // Right: W at (4,5), B at (4,6)
      board[4][5] = "W";
      board[4][6] = "B";
      // Up-left: W at (3,3), B at (2,2)
      board[3][3] = "W";
      board[2][2] = "B";
      // Up-right: W at (3,5), B at (2,6)
      board[3][5] = "W";
      board[2][6] = "B";
      // Down-left: W at (5,3), B at (6,2)
      board[5][3] = "W";
      board[6][2] = "B";
      // Down-right: W at (5,5), B at (6,6)
      board[5][5] = "W";
      board[6][6] = "B";

      const flips = getFlips(board, 4, 4, "B");
      assert.equal(flips.length, 8);

      const expected = [
        { row: 3, col: 4 }, // up
        { row: 5, col: 4 }, // down
        { row: 4, col: 3 }, // left
        { row: 4, col: 5 }, // right
        { row: 3, col: 3 }, // up-left
        { row: 3, col: 5 }, // up-right
        { row: 5, col: 3 }, // down-left
        { row: 5, col: 5 }, // down-right
      ];

      for (const exp of expected) {
        assert.ok(
          flips.some((f) => f.row === exp.row && f.col === exp.col),
          `Expected flip at (${exp.row},${exp.col})`
        );
      }
    });

    it("should not flip when no bookend exists", () => {
      const board = emptyBoard();
      // W at (0,1) but no B beyond it
      board[0][1] = "W";

      const flips = getFlips(board, 0, 0, "B");
      assert.equal(flips.length, 0);
    });

    it("should not flip over empty cells", () => {
      const board = emptyBoard();
      // W at (0,1), empty at (0,2), B at (0,3) — gap breaks the chain
      board[0][1] = "W";
      board[0][3] = "B";

      const flips = getFlips(board, 0, 0, "B");
      assert.equal(flips.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("edge cases", () => {
    it("should handle a player being wiped out (all pieces flipped)", () => {
      // Board with 1 W and surrounding B pieces. Place B to flip the last W.
      const board = emptyBoard();
      board[4][4] = "W"; // The only W piece
      board[4][3] = "B"; // B to the left, bookend at (4,5) needed
      board[4][5] = "B";

      // Place B at some other position that doesn't affect:
      // Actually just check that placing at a cell that flips (4,4) removes all W
      // (4,4) is already occupied, so we need a different setup.

      // W at (4,4), B at (4,2) and (4,6). Empty at (4,3) and (4,5) won't work.
      // Let's do: W at (4,3), B at (4,2) and B at (4,4).
      // Place B at (4,5) ... no flips.

      // Simpler: B bookends W. W at (0,1), B at (0,2). Place B at (0,0).
      const board2 = emptyBoard();
      board2[0][1] = "W"; // only W piece
      board2[0][2] = "B";

      const customData: OthelloData = {
        board: board2,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 10,
        data: customData as unknown as Record<string, unknown>,
      };

      const next = OthelloModule.applyAction(customState, P1, place(0, 0));
      const pieces = countPieces(getData(next).board);

      assert.equal(pieces.W, 0); // White wiped out
      assert.equal(pieces.B, 3); // All Black now
    });

    it("should end game with empty squares via double pass", () => {
      // Create a position where neither player can move
      const board = emptyBoard();
      board[0][0] = "B";
      board[7][7] = "W";
      // They are isolated — no flipping possible for either color

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 1,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 20,
        data: customData as unknown as Record<string, unknown>,
      };

      // B passes (no legal moves)
      const next = OthelloModule.applyAction(customState, P1, pass());
      const data = getData(next);

      assert.equal(data.terminalStatus, "double_pass");
      assert.equal(OthelloModule.isTerminal(next), true);

      // Board still has many empty squares
      const pieces = countPieces(data.board);
      assert.equal(pieces.B, 1);
      assert.equal(pieces.W, 1);
      assert.equal(pieces.B + pieces.W, 2); // 62 empty squares
    });
  });

  // -----------------------------------------------------------------------
  // getLegalActions
  // -----------------------------------------------------------------------
  describe("getLegalActions", () => {
    it("should return placement actions when available", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const actions = OthelloModule.getLegalActions(state, P1);

      assert.ok(actions.length > 0);
      assert.ok(actions.every((a) => a.type === "place"));

      // Black's initial legal moves are (2,3), (3,2), (4,5), (5,4)
      assert.equal(actions.length, 4);
    });

    it("should return single pass when no placements available", () => {
      const board = emptyBoard();
      board[0][0] = "W"; // No B pieces → B cannot flank anything

      const customData: OthelloData = {
        board,
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 0,
        lastMove: null,
        terminalStatus: null,
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 5,
        data: customData as unknown as Record<string, unknown>,
      };

      const actions = OthelloModule.getLegalActions(customState, P1);
      assert.equal(actions.length, 1);
      assert.equal(actions[0].type, "pass");
    });

    it("should return empty for non-current player", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const actions = OthelloModule.getLegalActions(state, P2);
      assert.equal(actions.length, 0);
    });

    it("should return empty for terminal state", () => {
      const customData: OthelloData = {
        board: emptyBoard(),
        colors: { [P1]: "B", [P2]: "W" },
        activeColor: "B",
        consecutivePasses: 2,
        lastMove: null,
        terminalStatus: "double_pass",
        winnerColor: null,
      };

      const customState: GameState = {
        gameId: "othello",
        players: [P1, P2],
        currentPlayer: P1,
        turnNumber: 10,
        data: customData as unknown as Record<string, unknown>,
      };

      const actions = OthelloModule.getLegalActions(customState, P1);
      assert.equal(actions.length, 0);
    });
  });

  // -----------------------------------------------------------------------
  // getObservation
  // -----------------------------------------------------------------------
  describe("getObservation", () => {
    it("should return full public state", () => {
      let state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      state = OthelloModule.applyAction(state, P1, place(2, 3));

      const obs = OthelloModule.getObservation(state, P1);
      assert.equal(obs.gameId, "othello");
      assert.deepEqual(obs.players, [P1, P2]);
      assert.equal(obs.currentPlayer, P2);
      assert.equal(obs.turnNumber, 1);

      const pub = obs.publicData as {
        board: Board;
        colors: Record<string, string>;
        activeColor: string;
        consecutivePasses: number;
        lastMove: { row: number; col: number } | null;
        terminalStatus: string | null;
        winnerColor: string | null;
      };

      assert.equal(pub.board[2][3], "B");
      assert.equal(pub.colors[P1], "B");
      assert.equal(pub.colors[P2], "W");
      assert.equal(pub.activeColor, "W");
      assert.equal(pub.consecutivePasses, 0);
      assert.deepEqual(pub.lastMove, { row: 2, col: 3 });
      assert.equal(pub.terminalStatus, null);
      assert.equal(pub.winnerColor, null);
    });

    it("should return same observation for both players", () => {
      let state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      state = OthelloModule.applyAction(state, P1, place(2, 3));

      const obs1 = OthelloModule.getObservation(state, P1);
      const obs2 = OthelloModule.getObservation(state, P2);

      assert.deepEqual(obs1.publicData, obs2.publicData);
    });

    it("should clone the board (not reference original)", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const obs = OthelloModule.getObservation(state, P1);
      const pub = obs.publicData as { board: Board };

      // Mutate the observation board
      pub.board[0][0] = "B";

      // Original should be unchanged
      const data = getData(state);
      assert.equal(data.board[0][0], "");
    });
  });

  // -----------------------------------------------------------------------
  // Determinism and immutability
  // -----------------------------------------------------------------------
  describe("determinism and immutability", () => {
    it("should produce identical states for identical inputs", () => {
      const state1 = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const state2 = OthelloModule.init(CONFIG, [P1, P2], "seed");
      assert.deepEqual(state1, state2);

      const next1 = OthelloModule.applyAction(state1, P1, place(2, 3));
      const next2 = OthelloModule.applyAction(state2, P1, place(2, 3));
      assert.deepEqual(next1, next2);
    });

    it("should not mutate original state on applyAction", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const origBoard = cloneBoard(getData(state).board);
      const origTurn = state.turnNumber;
      const origPlayer = state.currentPlayer;

      OthelloModule.applyAction(state, P1, place(2, 3));

      assert.deepEqual(getData(state).board, origBoard);
      assert.equal(state.turnNumber, origTurn);
      assert.equal(state.currentPlayer, origPlayer);
    });

    it("should not mutate original state on multiple sequential moves", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const snapshot = JSON.parse(JSON.stringify(state));

      let s = OthelloModule.applyAction(state, P1, place(2, 3));
      s = OthelloModule.applyAction(s, P2, place(2, 2));

      assert.deepEqual(state, snapshot);
    });
  });

  // -----------------------------------------------------------------------
  // State helper functions
  // -----------------------------------------------------------------------
  describe("state helpers", () => {
    it("emptyBoard should create 8x8 of empty strings", () => {
      const board = emptyBoard();
      assert.equal(board.length, BOARD_SIZE);
      for (const row of board) {
        assert.equal(row.length, BOARD_SIZE);
        assert.ok(row.every((cell) => cell === ""));
      }
    });

    it("initialBoard should have exactly 4 center pieces", () => {
      const board = initialBoard();
      const pieces = countPieces(board);
      assert.equal(pieces.B, 2);
      assert.equal(pieces.W, 2);
    });

    it("cloneBoard should create an independent copy", () => {
      const board = initialBoard();
      const clone = cloneBoard(board);

      clone[0][0] = "B";
      assert.equal(board[0][0], "");
    });

    it("isBoardFull should detect full board", () => {
      const board = emptyBoard();
      assert.equal(isBoardFull(board), false);

      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          board[r][c] = "B";
        }
      }
      assert.equal(isBoardFull(board), true);
    });

    it("hasLegalMove should return true when moves exist", () => {
      const board = initialBoard();
      assert.equal(hasLegalMove(board, "B"), true);
      assert.equal(hasLegalMove(board, "W"), true);
    });

    it("hasLegalMove should return false when no moves exist", () => {
      const board = emptyBoard();
      board[0][0] = "W";
      // No B on the board, so B cannot flank
      assert.equal(hasLegalMove(board, "B"), false);
    });
  });

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------
  describe("ui", () => {
    it("parseInput should parse coordinate notation", () => {
      const pub = {} as Record<string, unknown>;
      const action = OthelloModule.ui!.parseInput("d3", pub);
      assert.ok(action);
      assert.equal(action!.type, "place");
      assert.equal((action!.data as { row: number }).row, 2); // 3 - 1
      assert.equal((action!.data as { col: number }).col, 3); // d = 3
    });

    it("parseInput should parse pass", () => {
      const pub = {} as Record<string, unknown>;
      const action = OthelloModule.ui!.parseInput("pass", pub);
      assert.ok(action);
      assert.equal(action!.type, "pass");
    });

    it("parseInput should handle uppercase", () => {
      const pub = {} as Record<string, unknown>;
      const action = OthelloModule.ui!.parseInput("A1", pub);
      assert.ok(action);
      assert.equal(action!.type, "place");
      assert.equal((action!.data as { row: number }).row, 0);
      assert.equal((action!.data as { col: number }).col, 0);
    });

    it("parseInput should return null for invalid input", () => {
      const pub = {} as Record<string, unknown>;
      assert.equal(OthelloModule.ui!.parseInput("z9", pub), null);
      assert.equal(OthelloModule.ui!.parseInput("abc", pub), null);
      assert.equal(OthelloModule.ui!.parseInput("", pub), null);
    });

    it("formatAction should format place actions", () => {
      const formatted = OthelloModule.ui!.formatAction(place(2, 3));
      assert.equal(formatted, "d3");
    });

    it("formatAction should format pass actions", () => {
      const formatted = OthelloModule.ui!.formatAction(pass());
      assert.equal(formatted, "pass");
    });

    it("getPlayerLabel should return Black or White", () => {
      const pub = {
        colors: { [P1]: "B", [P2]: "W" },
      } as Record<string, unknown>;

      assert.equal(OthelloModule.ui!.getPlayerLabel(P1, pub), "Black");
      assert.equal(OthelloModule.ui!.getPlayerLabel(P2, pub), "White");
    });

    it("renderBoard should produce output with board content", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);
      const output = OthelloModule.ui!.renderBoard({
        board: data.board,
      });

      assert.ok(output.includes("\u25CF")); // Black piece
      assert.ok(output.includes("\u25CB")); // White piece
      assert.ok(output.length > 0);
    });

    it("renderStatus should return piece counts", () => {
      const state = OthelloModule.init(CONFIG, [P1, P2], "seed");
      const data = getData(state);
      const status = OthelloModule.ui!.renderStatus({
        board: data.board,
      });

      assert.equal(status, "Black: 2  White: 2");
    });
  });

  // -----------------------------------------------------------------------
  // Full game sequence
  // -----------------------------------------------------------------------
  describe("full game sequence", () => {
    it("should play through several moves correctly", () => {
      let state = OthelloModule.init(CONFIG, [P1, P2], "seed");

      // Black's initial legal moves: (2,3), (3,2), (4,5), (5,4)
      // Move 1: Black plays (2,3) — flips (3,3)
      state = OthelloModule.applyAction(state, P1, place(2, 3));
      let data = getData(state);
      assert.equal(data.board[2][3], "B");
      assert.equal(data.board[3][3], "B"); // flipped
      assert.equal(countPieces(data.board).B, 4);
      assert.equal(countPieces(data.board).W, 1);

      // Move 2: White plays (2,2) — flips (3,3)
      state = OthelloModule.applyAction(state, P2, place(2, 2));
      data = getData(state);
      assert.equal(data.board[2][2], "W");
      assert.equal(data.board[3][3], "W"); // flipped back
      assert.equal(countPieces(data.board).B, 3);
      assert.equal(countPieces(data.board).W, 3);

      // Move 3: Black plays (3,2) — check what flips
      // (3,2) with B: direction (0,1) → (3,3)=W → (3,4)=B. Flips (3,3).
      state = OthelloModule.applyAction(state, P1, place(3, 2));
      data = getData(state);
      assert.equal(data.board[3][2], "B");
      assert.equal(data.board[3][3], "B"); // flipped from W
      assert.equal(state.turnNumber, 3);
    });
  });
});
