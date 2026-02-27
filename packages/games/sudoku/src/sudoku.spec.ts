import { strict as assert } from "assert";
import { SeededRng } from "./prng";
import {
  getCandidates,
  isValidPlacement,
  countSolutions,
  isSolved,
} from "./solver";
import { generatePuzzle } from "./generator";
import { SudokuModule } from "./rules";
import { SudokuUI } from "./ui";
import { SudokuData } from "./state";
import { GameState } from "@dorkfun/core";

describe("SeededRng", () => {
  it("produces deterministic output for the same seed", () => {
    const a = new SeededRng("test-seed");
    const b = new SeededRng("test-seed");
    for (let i = 0; i < 100; i++) {
      assert.equal(a.next(), b.next());
    }
  });

  it("produces different output for different seeds", () => {
    const a = new SeededRng("seed-a");
    const b = new SeededRng("seed-b");
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() === b.next()) same++;
    }
    assert.ok(same < 10, "Expected mostly different values");
  });

  it("shuffle is deterministic", () => {
    const a = new SeededRng("shuffle");
    const b = new SeededRng("shuffle");
    const arr1 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const arr2 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    a.shuffle(arr1);
    b.shuffle(arr2);
    assert.deepEqual(arr1, arr2);
  });
});

describe("Solver", () => {
  it("getCandidates returns correct values for empty grid", () => {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates = getCandidates(grid, 0, 0);
    assert.deepEqual(candidates, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("getCandidates excludes row/col/box values", () => {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][1] = 5; // same row
    grid[3][0] = 3; // same col
    grid[1][1] = 7; // same box
    const candidates = getCandidates(grid, 0, 0);
    assert.ok(!candidates.includes(5));
    assert.ok(!candidates.includes(3));
    assert.ok(!candidates.includes(7));
  });

  it("isValidPlacement detects conflicts", () => {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    grid[0][0] = 5;
    assert.equal(isValidPlacement(grid, 0, 1, 5), false); // same row
    assert.equal(isValidPlacement(grid, 1, 0, 5), false); // same col
    assert.equal(isValidPlacement(grid, 1, 1, 5), false); // same box
    assert.equal(isValidPlacement(grid, 0, 1, 3), true); // no conflict
  });

  it("isSolved rejects incomplete grid", () => {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    assert.equal(isSolved(grid), false);
  });

  it("isSolved accepts a valid solution", () => {
    const { solution } = generatePuzzle("test-solved", "easy");
    assert.equal(isSolved(solution), true);
  });
});

describe("Generator", () => {
  it("generates valid puzzle with unique solution", () => {
    const { puzzle, solution } = generatePuzzle("gen-test", "medium");
    assert.equal(isSolved(solution), true);
    assert.equal(countSolutions(puzzle, 2), 1);
  });

  it("is deterministic — same seed produces same puzzle", () => {
    const a = generatePuzzle("determinism", "medium");
    const b = generatePuzzle("determinism", "medium");
    assert.deepEqual(a.puzzle, b.puzzle);
    assert.deepEqual(a.solution, b.solution);
  });

  it("easy puzzles have more clues than hard puzzles", () => {
    const easy = generatePuzzle("difficulty-test", "easy");
    const hard = generatePuzzle("difficulty-test", "hard");
    const countClues = (grid: number[][]) =>
      grid.flat().filter((v) => v !== 0).length;
    assert.ok(
      countClues(easy.puzzle) > countClues(hard.puzzle),
      `Easy clues (${countClues(easy.puzzle)}) should be > hard clues (${countClues(hard.puzzle)})`
    );
  });

  it("easy puzzles have 36-45 clues", () => {
    const { puzzle } = generatePuzzle("easy-range", "easy");
    const clues = puzzle.flat().filter((v) => v !== 0).length;
    assert.ok(clues >= 36 && clues <= 45, `Expected 36-45 clues, got ${clues}`);
  });

  it("hard puzzles have 22-27 clues", () => {
    const { puzzle } = generatePuzzle("hard-range", "hard");
    const clues = puzzle.flat().filter((v) => v !== 0).length;
    assert.ok(clues >= 22 && clues <= 27, `Expected 22-27 clues, got ${clues}`);
  });
});

describe("SudokuModule", () => {
  const PLAYER = "0x1234567890abcdef1234567890abcdef12345678";

  function initGame(
    difficulty: string = "medium",
    seed: string = "test"
  ): GameState {
    return SudokuModule.init(
      { gameId: "sudoku", version: "0.1.0", settings: { difficulty } },
      [PLAYER],
      seed
    );
  }

  describe("init", () => {
    it("initializes with 1 player", () => {
      const state = initGame();
      assert.equal(state.players.length, 1);
      assert.equal(state.currentPlayer, PLAYER);
      assert.equal(state.turnNumber, 0);
    });

    it("throws for 2 players", () => {
      assert.throws(() => {
        SudokuModule.init(
          { gameId: "sudoku", version: "0.1.0" },
          [PLAYER, "0xdeadbeef00000000000000000000000000000000"],
          "test"
        );
      }, /exactly 1 player/);
    });

    it("defaults to medium difficulty", () => {
      const state = SudokuModule.init(
        { gameId: "sudoku", version: "0.1.0" },
        [PLAYER],
        "test"
      );
      const data = state.data as unknown as SudokuData;
      assert.equal(data.difficulty, "medium");
    });

    it("reads difficulty from config.settings", () => {
      const state = initGame("hard");
      const data = state.data as unknown as SudokuData;
      assert.equal(data.difficulty, "hard");
    });

    it("board starts matching the puzzle clues", () => {
      const state = initGame();
      const data = state.data as unknown as SudokuData;
      assert.deepEqual(data.board, data.puzzle);
    });
  });

  describe("validateAction", () => {
    it("rejects action from wrong player", () => {
      const state = initGame();
      assert.equal(
        SudokuModule.validateAction(state, "0x0000000000000000000000000000000000000000", {
          type: "place",
          data: { row: 0, col: 0, value: 1 },
        }),
        false
      );
    });

    it("rejects placing on a clue cell", () => {
      const state = initGame();
      const data = state.data as unknown as SudokuData;
      // Find a clue cell
      let clueR = -1, clueC = -1;
      for (let r = 0; r < 9 && clueR === -1; r++) {
        for (let c = 0; c < 9; c++) {
          if (data.puzzle[r][c] !== 0) {
            clueR = r;
            clueC = c;
            break;
          }
        }
      }
      assert.ok(clueR >= 0, "Should have at least one clue cell");
      assert.equal(
        SudokuModule.validateAction(state, PLAYER, {
          type: "place",
          data: { row: clueR, col: clueC, value: 1 },
        }),
        false
      );
    });

    it("accepts placing on an empty non-clue cell", () => {
      const state = initGame();
      const data = state.data as unknown as SudokuData;
      // Find an empty cell
      let emptyR = -1, emptyC = -1;
      for (let r = 0; r < 9 && emptyR === -1; r++) {
        for (let c = 0; c < 9; c++) {
          if (data.puzzle[r][c] === 0) {
            emptyR = r;
            emptyC = c;
            break;
          }
        }
      }
      assert.ok(emptyR >= 0, "Should have at least one empty cell");
      assert.equal(
        SudokuModule.validateAction(state, PLAYER, {
          type: "place",
          data: { row: emptyR, col: emptyC, value: 1 },
        }),
        true
      );
    });

    it("accepts resign", () => {
      const state = initGame();
      assert.equal(
        SudokuModule.validateAction(state, PLAYER, {
          type: "resign",
          data: {},
        }),
        true
      );
    });
  });

  describe("applyAction + terminal", () => {
    it("place updates the board", () => {
      const state = initGame();
      const data = state.data as unknown as SudokuData;
      // Find an empty cell
      let emptyR = -1, emptyC = -1;
      for (let r = 0; r < 9 && emptyR === -1; r++) {
        for (let c = 0; c < 9; c++) {
          if (data.puzzle[r][c] === 0) {
            emptyR = r;
            emptyC = c;
            break;
          }
        }
      }
      const newState = SudokuModule.applyAction(state, PLAYER, {
        type: "place",
        data: { row: emptyR, col: emptyC, value: 5 },
      });
      const newData = newState.data as unknown as SudokuData;
      assert.equal(newData.board[emptyR][emptyC], 5);
      assert.equal(newState.turnNumber, 1);
      assert.equal(newState.currentPlayer, PLAYER); // stays same in solo
    });

    it("clear removes a digit", () => {
      const state = initGame();
      const data = state.data as unknown as SudokuData;
      let emptyR = -1, emptyC = -1;
      for (let r = 0; r < 9 && emptyR === -1; r++) {
        for (let c = 0; c < 9; c++) {
          if (data.puzzle[r][c] === 0) { emptyR = r; emptyC = c; break; }
        }
      }
      // Place then clear
      const placed = SudokuModule.applyAction(state, PLAYER, {
        type: "place",
        data: { row: emptyR, col: emptyC, value: 5 },
      });
      const cleared = SudokuModule.applyAction(placed, PLAYER, {
        type: "clear",
        data: { row: emptyR, col: emptyC },
      });
      const clearedData = cleared.data as unknown as SudokuData;
      assert.equal(clearedData.board[emptyR][emptyC], 0);
    });

    it("resign makes game terminal with no winner", () => {
      const state = initGame();
      const resigned = SudokuModule.applyAction(state, PLAYER, {
        type: "resign",
        data: {},
      });
      assert.equal(SudokuModule.isTerminal(resigned), true);
      const outcome = SudokuModule.getOutcome(resigned);
      assert.equal(outcome.winner, null);
      assert.equal(outcome.reason, "resigned");
    });

    it("not terminal after init", () => {
      const state = initGame();
      assert.equal(SudokuModule.isTerminal(state), false);
    });

    it("solving the puzzle correctly makes game terminal with player as winner", () => {
      const state = initGame("easy", "solve-test");
      const data = state.data as unknown as SudokuData;
      // Fill in all empty cells with the correct solution values
      let current = state;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (data.puzzle[r][c] === 0) {
            current = SudokuModule.applyAction(current, PLAYER, {
              type: "place",
              data: { row: r, col: c, value: data.solution[r][c] },
            });
          }
        }
      }
      assert.equal(SudokuModule.isTerminal(current), true);
      const outcome = SudokuModule.getOutcome(current);
      assert.equal(outcome.winner, PLAYER);
      assert.equal(outcome.reason, "puzzle_solved");
      assert.equal(outcome.scores[PLAYER], 1);
    });
  });

  describe("observation", () => {
    it("publicData does NOT contain the solution", () => {
      const state = initGame();
      const obs = SudokuModule.getObservation(state, PLAYER);
      assert.equal(
        (obs.publicData as Record<string, unknown>).solution,
        undefined
      );
      assert.ok(obs.publicData.board);
      assert.ok(obs.publicData.puzzle);
      assert.ok(obs.publicData.difficulty);
    });
  });

  describe("getLegalActions", () => {
    it("returns actions for the solo player", () => {
      const state = initGame();
      const actions = SudokuModule.getLegalActions(state, PLAYER);
      assert.ok(actions.length > 0);
      // Should contain at least one place action and the resign action
      assert.ok(actions.some((a) => a.type === "place"));
      assert.ok(actions.some((a) => a.type === "resign"));
    });

    it("returns empty for wrong player", () => {
      const state = initGame();
      const actions = SudokuModule.getLegalActions(
        state,
        "0x0000000000000000000000000000000000000000"
      );
      assert.equal(actions.length, 0);
    });
  });
});

describe("SudokuUI", () => {
  it("renderBoard produces output with grid lines", () => {
    const state = SudokuModule.init(
      { gameId: "sudoku", version: "0.1.0", settings: { difficulty: "easy" } },
      ["0x1234567890abcdef1234567890abcdef12345678"],
      "ui-test"
    );
    const obs = SudokuModule.getObservation(
      state,
      "0x1234567890abcdef1234567890abcdef12345678"
    );
    const board = SudokuUI.renderBoard(obs.publicData);
    assert.ok(board.includes("+-------+-------+-------+"));
    assert.ok(board.includes("Difficulty: easy"));
  });

  it("parseInput handles place action", () => {
    const action = SudokuUI.parseInput("3 5 7", {});
    assert.ok(action);
    assert.equal(action!.type, "place");
    assert.equal((action!.data as { row: number }).row, 2);
    assert.equal((action!.data as { col: number }).col, 4);
    assert.equal((action!.data as { value: number }).value, 7);
  });

  it("parseInput handles clear action", () => {
    const action = SudokuUI.parseInput("clear 3 5", {});
    assert.ok(action);
    assert.equal(action!.type, "clear");
    assert.equal((action!.data as { row: number }).row, 2);
    assert.equal((action!.data as { col: number }).col, 4);
  });

  it("parseInput handles resign", () => {
    const action = SudokuUI.parseInput("resign", {});
    assert.ok(action);
    assert.equal(action!.type, "resign");
  });

  it("parseInput returns null for invalid input", () => {
    assert.equal(SudokuUI.parseInput("hello", {}), null);
    assert.equal(SudokuUI.parseInput("10 1 1", {}), null);
  });

  it("formatAction produces readable strings", () => {
    assert.equal(
      SudokuUI.formatAction({ type: "place", data: { row: 2, col: 4, value: 7 } }),
      "place 7 at (3,5)"
    );
    assert.equal(
      SudokuUI.formatAction({ type: "clear", data: { row: 0, col: 0 } }),
      "clear (1,1)"
    );
    assert.equal(
      SudokuUI.formatAction({ type: "resign", data: {} }),
      "resign"
    );
  });
});
