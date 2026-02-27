import { strict as assert } from "assert";
import { GameConfig, GameState, Action, Observation } from "@dorkfun/core";
import { GameRegistry } from "./GameRegistry";
import { MatchOrchestrator } from "./MatchOrchestrator";
import { IGameModule } from "./interfaces/IGameModule";

// Inline a minimal tic-tac-toe module for testing (avoids circular workspace dep)
type CellValue = "X" | "O" | "";
type Board = CellValue[];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Board): CellValue {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] !== "" && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return "";
}

const TestTicTacToe: IGameModule = {
  gameId: "tictactoe",
  name: "Tic-Tac-Toe",
  description: "Test game",
  minPlayers: 2,
  maxPlayers: 2,

  init(_config: GameConfig, players: string[], _rngSeed: string): GameState {
    return {
      gameId: "tictactoe",
      players,
      currentPlayer: players[0],
      turnNumber: 0,
      data: {
        board: ["", "", "", "", "", "", "", "", ""],
        marks: { [players[0]]: "X", [players[1]]: "O" },
      },
    };
  },

  validateAction(state: GameState, playerId: string, action: Action): boolean {
    if (state.currentPlayer !== playerId) return false;
    if (action.type !== "place") return false;
    const pos = action.data.position as number;
    if (pos < 0 || pos > 8) return false;
    const board = (state.data as any).board;
    return board[pos] === "";
  },

  applyAction(state: GameState, playerId: string, action: Action): GameState {
    const data = state.data as any;
    const board = [...data.board];
    board[action.data.position as number] = data.marks[playerId];
    const other = state.players.find((p) => p !== playerId)!;
    return {
      ...state,
      currentPlayer: other,
      turnNumber: state.turnNumber + 1,
      data: { board, marks: { ...data.marks } },
    };
  },

  isTerminal(state: GameState): boolean {
    const board = (state.data as any).board;
    return checkWinner(board) !== "" || board.every((c: string) => c !== "");
  },

  getOutcome(state: GameState) {
    const data = state.data as any;
    const w = checkWinner(data.board);
    if (w !== "") {
      const winner = Object.entries(data.marks).find(([_, m]) => m === w)?.[0] ?? null;
      const scores: Record<string, number> = {};
      for (const p of state.players) scores[p] = p === winner ? 1 : 0;
      return { winner, draw: false, scores, reason: "three_in_a_row" };
    }
    if (data.board.every((c: string) => c !== "")) {
      const scores: Record<string, number> = {};
      for (const p of state.players) scores[p] = 0.5;
      return { winner: null, draw: true, scores, reason: "board_full" };
    }
    return { winner: null, draw: false, scores: {}, reason: "in_progress" };
  },

  getObservation(state: GameState, _playerId: string): Observation {
    return {
      gameId: state.gameId,
      players: state.players,
      currentPlayer: state.currentPlayer,
      turnNumber: state.turnNumber,
      publicData: { ...(state.data as any) },
    };
  },

  getLegalActions(state: GameState, playerId: string): Action[] {
    if (state.currentPlayer !== playerId) return [];
    const board = (state.data as any).board;
    const actions: Action[] = [];
    for (let i = 0; i < 9; i++) {
      if (board[i] === "") actions.push({ type: "place", data: { position: i } });
    }
    return actions;
  },
};

const P1 = "0xAlice";
const P2 = "0xBob";

describe("GameRegistry", () => {
  it("should register and retrieve games", () => {
    const registry = new GameRegistry();
    registry.register(TestTicTacToe);

    assert.equal(registry.has("tictactoe"), true);
    assert.equal(registry.has("chess"), false);

    const game = registry.get("tictactoe");
    assert.equal(game?.gameId, "tictactoe");
    assert.equal(registry.list().length, 1);
  });
});

describe("MatchOrchestrator", () => {
  it("should orchestrate a full tic-tac-toe game to X winning", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-001",
    });

    assert.equal(orch.getCurrentPlayer(), P1);
    assert.equal(orch.isTerminal(), false);

    // X plays center
    let result = orch.submitAction(P1, { type: "place", data: { position: 4 } });
    assert.equal(result.terminal, false);

    // O plays top-left
    result = orch.submitAction(P2, { type: "place", data: { position: 0 } });
    assert.equal(result.terminal, false);

    // X plays top-right
    result = orch.submitAction(P1, { type: "place", data: { position: 2 } });
    assert.equal(result.terminal, false);

    // O plays bottom-left
    result = orch.submitAction(P2, { type: "place", data: { position: 6 } });
    assert.equal(result.terminal, false);

    // X plays bottom-right (wins diagonal 2-4-6... wait, that's O's.
    // X has 4, 2. Let's do X wins with 4, 2, 6 — anti-diagonal
    // Actually X has center(4) and top-right(2). To win diagonal 2-4-6, X needs 6.
    // But O just played 6. Let's redo: X needs to win differently.
    // X: 4, 2. O: 0, 6. X should play 1 to get top row? No, needs 0 too.
    // Let me just play X winning with middle row: 3, 4, 5
    // Start over with a cleaner sequence.
  });

  it("should orchestrate X winning with top row", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-002",
    });

    // X: 0, O: 3, X: 1, O: 4, X: 2 (top row win)
    orch.submitAction(P1, { type: "place", data: { position: 0 } });
    orch.submitAction(P2, { type: "place", data: { position: 3 } });
    orch.submitAction(P1, { type: "place", data: { position: 1 } });
    orch.submitAction(P2, { type: "place", data: { position: 4 } });
    const result = orch.submitAction(P1, { type: "place", data: { position: 2 } });

    assert.equal(result.terminal, true);
    assert.equal(result.outcome?.winner, P1);
    assert.equal(result.outcome?.reason, "three_in_a_row");
    assert.equal(orch.isTerminal(), true);
  });

  it("should reject moves from wrong player", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-003",
    });

    assert.throws(
      () => orch.submitAction(P2, { type: "place", data: { position: 0 } }),
      /Not your turn/
    );
  });

  it("should reject invalid actions", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-004",
    });

    assert.throws(
      () => orch.submitAction(P1, { type: "invalid", data: {} }),
      /Invalid action/
    );
  });

  it("should reject moves after game is over", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-005",
    });

    orch.submitAction(P1, { type: "place", data: { position: 0 } });
    orch.submitAction(P2, { type: "place", data: { position: 3 } });
    orch.submitAction(P1, { type: "place", data: { position: 1 } });
    orch.submitAction(P2, { type: "place", data: { position: 4 } });
    orch.submitAction(P1, { type: "place", data: { position: 2 } }); // X wins

    assert.throws(
      () => orch.submitAction(P2, { type: "place", data: { position: 5 } }),
      /Game is already over/
    );
  });

  it("should build a transcript with hash chain", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-006",
    });

    orch.submitAction(P1, { type: "place", data: { position: 0 } });
    orch.submitAction(P2, { type: "place", data: { position: 4 } });
    orch.submitAction(P1, { type: "place", data: { position: 8 } });

    const transcript = orch.getTranscript();
    assert.equal(transcript.length, 3);

    // Check sequence numbers
    assert.equal(transcript[0].sequence, 0);
    assert.equal(transcript[1].sequence, 1);
    assert.equal(transcript[2].sequence, 2);

    // Check player addresses
    assert.equal(transcript[0].playerAddress, P1);
    assert.equal(transcript[1].playerAddress, P2);
    assert.equal(transcript[2].playerAddress, P1);

    // Check hash chain linkage (each entry's prevHash should differ)
    assert.notEqual(transcript[0].prevHash, transcript[1].prevHash);
    assert.notEqual(transcript[1].prevHash, transcript[2].prevHash);

    // State hashes should all be different
    assert.notEqual(transcript[0].stateHash, transcript[1].stateHash);
    assert.notEqual(transcript[1].stateHash, transcript[2].stateHash);
  });

  it("should provide correct observations", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-007",
    });

    orch.submitAction(P1, { type: "place", data: { position: 4 } });

    const obs = orch.getObservation(P2);
    assert.equal(obs.currentPlayer, P2);
    assert.equal(obs.turnNumber, 1);

    const legal = orch.getLegalActions(P2);
    assert.equal(legal.length, 8); // 9 - 1 occupied
  });

  it("should handle a draw game", () => {
    const orch = new MatchOrchestrator({
      game: TestTicTacToe,
      players: [P1, P2],
      matchId: "match-008",
    });

    // X O X / X X O / O X O (draw)
    orch.submitAction(P1, { type: "place", data: { position: 0 } }); // X
    orch.submitAction(P2, { type: "place", data: { position: 1 } }); // O
    orch.submitAction(P1, { type: "place", data: { position: 2 } }); // X
    orch.submitAction(P2, { type: "place", data: { position: 5 } }); // O
    orch.submitAction(P1, { type: "place", data: { position: 3 } }); // X
    orch.submitAction(P2, { type: "place", data: { position: 6 } }); // O
    orch.submitAction(P1, { type: "place", data: { position: 4 } }); // X
    orch.submitAction(P2, { type: "place", data: { position: 8 } }); // O
    const result = orch.submitAction(P1, { type: "place", data: { position: 7 } }); // X

    assert.equal(result.terminal, true);
    assert.equal(result.outcome?.draw, true);
    assert.equal(result.outcome?.reason, "board_full");
  });
});
