import { strict as assert } from "assert";
import { GameConfig, GameState, Action } from "@dorkfun/core";
import { ChessModule } from "./rules";
import { ChessData, Square, Board, Piece, Color, PieceKind, cloneBoard, initialBoard, CastlingRights, hashPosition } from "./state";
import { generateAllLegalMoves } from "./actions";

const PLAYER_W = "0xWhite";
const PLAYER_B = "0xBlack";
const CONFIG: GameConfig = { gameId: "chess", version: "0.1.0" };

function getData(state: GameState): ChessData {
  return state.data as unknown as ChessData;
}

/** Create a move action from algebraic-like notation */
function sq(algebraic: string): Square {
  return {
    file: algebraic.charCodeAt(0) - 97,
    rank: parseInt(algebraic[1]) - 1,
  };
}

function move(from: string, to: string, promotion?: PieceKind): Action {
  const data: Record<string, unknown> = { from: sq(from), to: sq(to) };
  if (promotion) data.promotion = promotion;
  return { type: "move", data };
}

function resign(): Action {
  return { type: "resign", data: {} };
}

/** Create a custom board state for specific test scenarios */
function customState(
  board: Board,
  activeColor: Color,
  opts?: {
    castlingRights?: CastlingRights;
    enPassantTarget?: Square | null;
    halfMoveClock?: number;
    positionHistory?: string[];
  }
): GameState {
  const castlingRights = opts?.castlingRights ?? {
    whiteKingside: false,
    whiteQueenside: false,
    blackKingside: false,
    blackQueenside: false,
  };
  const enPassantTarget = opts?.enPassantTarget ?? null;
  const halfMoveClock = opts?.halfMoveClock ?? 0;
  const currentPlayer = activeColor === "white" ? PLAYER_W : PLAYER_B;
  const positionHistory = opts?.positionHistory ?? [
    hashPosition(board, activeColor, castlingRights, enPassantTarget),
  ];

  const data: ChessData = {
    board,
    colors: { [PLAYER_W]: "white", [PLAYER_B]: "black" },
    activeColor,
    castlingRights,
    enPassantTarget,
    halfMoveClock,
    fullMoveNumber: 1,
    positionHistory,
    inCheck: false,
    terminalStatus: null,
    winnerColor: null,
    lastMove: null,
  };

  return {
    gameId: "chess",
    players: [PLAYER_W, PLAYER_B],
    currentPlayer,
    turnNumber: 0,
    data: data as unknown as Record<string, unknown>,
  };
}

/** Create an empty board */
function emptyBoard(): Board {
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null)
  );
}

/** Place a piece on a board */
function place(
  board: Board,
  square: string,
  color: Color,
  kind: PieceKind
): void {
  const s = sq(square);
  board[s.rank][s.file] = { color, kind };
}

describe("ChessModule", () => {
  describe("init", () => {
    it("should initialize with standard starting position", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const data = getData(state);

      assert.equal(state.gameId, "chess");
      assert.deepEqual(state.players, [PLAYER_W, PLAYER_B]);
      assert.equal(state.currentPlayer, PLAYER_W);
      assert.equal(state.turnNumber, 0);
      assert.equal(data.activeColor, "white");
      assert.equal(data.colors[PLAYER_W], "white");
      assert.equal(data.colors[PLAYER_B], "black");

      // Check back rank pieces
      assert.equal(data.board[0][0]?.kind, "rook");
      assert.equal(data.board[0][1]?.kind, "knight");
      assert.equal(data.board[0][2]?.kind, "bishop");
      assert.equal(data.board[0][3]?.kind, "queen");
      assert.equal(data.board[0][4]?.kind, "king");
      assert.equal(data.board[0][0]?.color, "white");

      // Check pawns
      for (let f = 0; f < 8; f++) {
        assert.equal(data.board[1][f]?.kind, "pawn");
        assert.equal(data.board[1][f]?.color, "white");
        assert.equal(data.board[6][f]?.kind, "pawn");
        assert.equal(data.board[6][f]?.color, "black");
      }

      // Check empty middle ranks
      for (let r = 2; r <= 5; r++) {
        for (let f = 0; f < 8; f++) {
          assert.equal(data.board[r][f], null);
        }
      }

      // Check black back rank
      assert.equal(data.board[7][4]?.kind, "king");
      assert.equal(data.board[7][4]?.color, "black");
    });

    it("should initialize castling rights", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const data = getData(state);
      assert.equal(data.castlingRights.whiteKingside, true);
      assert.equal(data.castlingRights.whiteQueenside, true);
      assert.equal(data.castlingRights.blackKingside, true);
      assert.equal(data.castlingRights.blackQueenside, true);
    });

    it("should throw for wrong number of players", () => {
      assert.throws(
        () => ChessModule.init(CONFIG, [PLAYER_W], "seed"),
        /exactly 2 players/
      );
      assert.throws(
        () => ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B, "0xP3"], "seed"),
        /exactly 2 players/
      );
    });

    it("should start with no en passant, no check, game in progress", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const data = getData(state);
      assert.equal(data.enPassantTarget, null);
      assert.equal(data.inCheck, false);
      assert.equal(data.terminalStatus, null);
      assert.equal(data.halfMoveClock, 0);
      assert.equal(data.fullMoveNumber, 1);
    });
  });

  describe("basic piece movement", () => {
    it("should allow pawn single push", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const next = ChessModule.applyAction(state, PLAYER_W, move("e2", "e3"));
      const data = getData(next);
      assert.equal(data.board[2][4]?.kind, "pawn");
      assert.equal(data.board[2][4]?.color, "white");
      assert.equal(data.board[1][4], null);
      assert.equal(next.currentPlayer, PLAYER_B);
    });

    it("should allow pawn double push from starting rank", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const next = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      const data = getData(next);
      assert.equal(data.board[3][4]?.kind, "pawn");
      assert.equal(data.board[1][4], null);
      // Should set en passant target
      assert.deepEqual(data.enPassantTarget, { file: 4, rank: 2 });
    });

    it("should not allow pawn double push when blocked", () => {
      const board = emptyBoard();
      place(board, "e2", "white", "pawn");
      place(board, "e3", "black", "pawn"); // blocks single push
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e2", "e4"));
      assert.equal(valid, false);
    });

    it("should allow knight movement", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const next = ChessModule.applyAction(state, PLAYER_W, move("g1", "f3"));
      const data = getData(next);
      assert.equal(data.board[2][5]?.kind, "knight");
      assert.equal(data.board[0][6], null);
    });

    it("should allow bishop diagonal movement", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      // Open the diagonal first
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));
      state = ChessModule.applyAction(state, PLAYER_W, move("f1", "c4"));
      const data = getData(state);
      assert.equal(data.board[3][2]?.kind, "bishop");
      assert.equal(data.board[3][2]?.color, "white");
    });

    it("should allow rook movement along files", () => {
      const board = emptyBoard();
      place(board, "a1", "white", "rook");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("a1", "a8"));
      const data = getData(next);
      assert.equal(data.board[7][0]?.kind, "rook");
    });

    it("should not allow capturing own pieces", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      // Try to move knight to d2 where own pawn sits
      const valid = ChessModule.validateAction(state, PLAYER_W, move("b1", "d2"));
      assert.equal(valid, false);
    });

    it("should allow capturing enemy pieces", () => {
      const board = emptyBoard();
      place(board, "e4", "white", "pawn");
      place(board, "d5", "black", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("e4", "d5"));
      const data = getData(next);
      assert.equal(data.board[4][3]?.kind, "pawn");
      assert.equal(data.board[4][3]?.color, "white");
      assert.equal(data.board[3][4], null);
    });

    it("should block sliding pieces", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      // Rook can't move because pieces are in the way
      const valid = ChessModule.validateAction(state, PLAYER_W, move("a1", "a3"));
      assert.equal(valid, false);
    });

    it("should switch turns after each move", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(state.currentPlayer, PLAYER_W);
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      assert.equal(state.currentPlayer, PLAYER_B);
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));
      assert.equal(state.currentPlayer, PLAYER_W);
    });

    it("should increment turn number", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(state.turnNumber, 0);
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      assert.equal(state.turnNumber, 1);
    });
  });

  describe("en passant", () => {
    it("should allow en passant capture", () => {
      const board = emptyBoard();
      place(board, "e5", "white", "pawn");
      place(board, "d7", "black", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      let state = customState(board, "black");

      // Black double-pushes d7-d5
      state = ChessModule.applyAction(state, PLAYER_B, move("d7", "d5"));
      const data1 = getData(state);
      assert.deepEqual(data1.enPassantTarget, { file: 3, rank: 5 });

      // White captures en passant
      state = ChessModule.applyAction(state, PLAYER_W, move("e5", "d6"));
      const data2 = getData(state);
      assert.equal(data2.board[5][3]?.kind, "pawn");
      assert.equal(data2.board[5][3]?.color, "white");
      assert.equal(data2.board[4][3], null); // captured pawn removed
    });

    it("should expire en passant after one move", () => {
      const board = emptyBoard();
      place(board, "e5", "white", "pawn");
      place(board, "d7", "black", "pawn");
      place(board, "a2", "white", "pawn");
      place(board, "h7", "black", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      let state = customState(board, "black");

      // Black double-pushes d7-d5
      state = ChessModule.applyAction(state, PLAYER_B, move("d7", "d5"));
      // White plays something else
      state = ChessModule.applyAction(state, PLAYER_W, move("a2", "a3"));
      // Now en passant should not be available
      const data = getData(state);
      assert.equal(data.enPassantTarget, null);
      // Black plays
      state = ChessModule.applyAction(state, PLAYER_B, move("h7", "h6"));
      // White tries en passant - should be invalid
      const valid = ChessModule.validateAction(state, PLAYER_W, move("e5", "d6"));
      assert.equal(valid, false);
    });
  });

  describe("castling", () => {
    it("should allow white kingside castling", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "g1"));
      const data = getData(next);
      assert.equal(data.board[0][6]?.kind, "king");
      assert.equal(data.board[0][5]?.kind, "rook");
      assert.equal(data.board[0][4], null);
      assert.equal(data.board[0][7], null);
    });

    it("should allow white queenside castling", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "a1", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: false,
          whiteQueenside: true,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "c1"));
      const data = getData(next);
      assert.equal(data.board[0][2]?.kind, "king");
      assert.equal(data.board[0][3]?.kind, "rook");
      assert.equal(data.board[0][4], null);
      assert.equal(data.board[0][0], null);
    });

    it("should allow black kingside castling", () => {
      const board = emptyBoard();
      place(board, "e8", "black", "king");
      place(board, "h8", "black", "rook");
      place(board, "e1", "white", "king");
      const state = customState(board, "black", {
        castlingRights: {
          whiteKingside: false,
          whiteQueenside: false,
          blackKingside: true,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_B, move("e8", "g8"));
      const data = getData(next);
      assert.equal(data.board[7][6]?.kind, "king");
      assert.equal(data.board[7][5]?.kind, "rook");
    });

    it("should not allow castling when king has moved", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: false, // right lost because king moved
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "g1"));
      assert.equal(valid, false);
    });

    it("should not allow castling while in check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "e8", "black", "rook"); // checking the king along e-file
      place(board, "a8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "g1"));
      assert.equal(valid, false);
    });

    it("should not allow castling through check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "f8", "black", "rook"); // attacks f1 (king passes through)
      place(board, "a8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "g1"));
      assert.equal(valid, false);
    });

    it("should not allow castling into check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "g8", "black", "rook"); // attacks g1 (king destination)
      place(board, "a8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "g1"));
      assert.equal(valid, false);
    });

    it("should not allow castling when pieces block", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "f1", "white", "bishop"); // blocks kingside
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "g1"));
      assert.equal(valid, false);
    });

    it("should revoke castling rights when king moves", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "a1", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: true,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "d1"));
      const data = getData(next);
      assert.equal(data.castlingRights.whiteKingside, false);
      assert.equal(data.castlingRights.whiteQueenside, false);
    });

    it("should revoke castling rights when rook moves", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_W, move("h1", "h2"));
      const data = getData(next);
      assert.equal(data.castlingRights.whiteKingside, false);
    });

    it("should revoke castling rights when rook is captured", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "h1", "white", "rook");
      place(board, "a8", "black", "king");
      place(board, "h8", "black", "rook"); // will capture white rook
      const state = customState(board, "black", {
        castlingRights: {
          whiteKingside: true,
          whiteQueenside: false,
          blackKingside: false,
          blackQueenside: false,
        },
      });

      const next = ChessModule.applyAction(state, PLAYER_B, move("h8", "h1"));
      const data = getData(next);
      assert.equal(data.castlingRights.whiteKingside, false);
    });
  });

  describe("pawn promotion", () => {
    it("should promote pawn to queen", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(
        state,
        PLAYER_W,
        move("a7", "a8", "queen")
      );
      const data = getData(next);
      assert.equal(data.board[7][0]?.kind, "queen");
      assert.equal(data.board[7][0]?.color, "white");
    });

    it("should promote pawn to knight", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(
        state,
        PLAYER_W,
        move("a7", "a8", "knight")
      );
      const data = getData(next);
      assert.equal(data.board[7][0]?.kind, "knight");
    });

    it("should promote pawn to rook", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(
        state,
        PLAYER_W,
        move("a7", "a8", "rook")
      );
      const data = getData(next);
      assert.equal(data.board[7][0]?.kind, "rook");
    });

    it("should promote pawn to bishop", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(
        state,
        PLAYER_W,
        move("a7", "a8", "bishop")
      );
      const data = getData(next);
      assert.equal(data.board[7][0]?.kind, "bishop");
    });

    it("should require promotion when pawn reaches last rank", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      // Move without promotion should be invalid
      const valid = ChessModule.validateAction(
        state,
        PLAYER_W,
        move("a7", "a8")
      );
      assert.equal(valid, false);
    });

    it("should allow promotion via capture", () => {
      const board = emptyBoard();
      place(board, "a7", "white", "pawn");
      place(board, "b8", "black", "rook");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(
        state,
        PLAYER_W,
        move("a7", "b8", "queen")
      );
      const data = getData(next);
      assert.equal(data.board[7][1]?.kind, "queen");
      assert.equal(data.board[7][1]?.color, "white");
    });

    it("should allow black pawn promotion", () => {
      const board = emptyBoard();
      place(board, "h2", "black", "pawn");
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      const state = customState(board, "black");

      const next = ChessModule.applyAction(
        state,
        PLAYER_B,
        move("h2", "h1", "queen")
      );
      const data = getData(next);
      assert.equal(data.board[0][7]?.kind, "queen");
      assert.equal(data.board[0][7]?.color, "black");
    });
  });

  describe("check and checkmate", () => {
    it("should detect check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "a5", "white", "rook");
      place(board, "e8", "black", "king");
      const state = customState(board, "white");

      // Move rook to e-file to check black king
      // Actually, rook is on a5. Let's put it directly checking.
      const board2 = emptyBoard();
      place(board2, "e1", "white", "king");
      place(board2, "d1", "white", "rook");
      place(board2, "e8", "black", "king");
      const state2 = customState(board2, "white");

      const next = ChessModule.applyAction(state2, PLAYER_W, move("d1", "e7"));
      // Rook is now on e7, doesn't directly check king on e8... let's do it right
      const next2 = ChessModule.applyAction(state2, PLAYER_W, move("d1", "d8"));
      const data = getData(next2);
      assert.equal(data.inCheck, true);
    });

    it("should detect Fool's Mate (2-move checkmate)", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");

      // 1. f3 e5
      state = ChessModule.applyAction(state, PLAYER_W, move("f2", "f3"));
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));

      // 2. g4 Qh4#
      state = ChessModule.applyAction(state, PLAYER_W, move("g2", "g4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("d8", "h4"));

      assert.equal(ChessModule.isTerminal(state), true);
      const outcome = ChessModule.getOutcome(state);
      assert.equal(outcome.winner, PLAYER_B);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.reason, "checkmate");
      assert.equal(outcome.scores[PLAYER_B], 1);
      assert.equal(outcome.scores[PLAYER_W], 0);
    });

    it("should detect Scholar's Mate (4-move checkmate)", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");

      // 1. e4 e5
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));

      // 2. Bc4 Nc6
      state = ChessModule.applyAction(state, PLAYER_W, move("f1", "c4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("b8", "c6"));

      // 3. Qh5 Nf6
      state = ChessModule.applyAction(state, PLAYER_W, move("d1", "h5"));
      state = ChessModule.applyAction(state, PLAYER_B, move("g8", "f6"));

      // 4. Qxf7#
      state = ChessModule.applyAction(state, PLAYER_W, move("h5", "f7"));

      assert.equal(ChessModule.isTerminal(state), true);
      const outcome = ChessModule.getOutcome(state);
      assert.equal(outcome.winner, PLAYER_W);
      assert.equal(outcome.reason, "checkmate");
    });

    it("must move out of check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      place(board, "e7", "white", "rook"); // checking black king
      const state = customState(board, "black");

      // Black must move king (e7 is blocked by rook)
      const legal = ChessModule.getLegalActions(state, PLAYER_B);
      // Filter out resign
      const moves = legal.filter((a) => a.type === "move");
      // All moves must be king moves away from check
      for (const m of moves) {
        const d = m.data as { from: Square; to: Square };
        assert.equal(d.from.file, 4); // king on e8 = file 4
        assert.equal(d.from.rank, 7); // rank 8 = index 7
      }
      assert.ok(moves.length > 0);
    });

    it("should allow blocking check", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      place(board, "e4", "white", "rook"); // checking black king along e-file
      place(board, "c6", "black", "bishop"); // can block at e4... no, it would need to go to e-file
      // Let's use a better setup
      const board2 = emptyBoard();
      place(board2, "e1", "white", "king");
      place(board2, "e8", "black", "king");
      place(board2, "a8", "white", "rook"); // checking along rank 8
      place(board2, "c7", "black", "rook"); // can block by moving to b8 or similar
      const state2 = customState(board2, "black");

      const legal = ChessModule.getLegalActions(state2, PLAYER_B);
      const moves = legal.filter((a) => a.type === "move");
      // Should include king moves AND rook blocking moves
      const rookMoves = moves.filter(
        (m) =>
          (m.data as { from: Square }).from.file === 2 &&
          (m.data as { from: Square }).from.rank === 6
      );
      assert.ok(rookMoves.length > 0, "Rook should be able to block check");
    });
  });

  describe("stalemate", () => {
    it("should detect stalemate", () => {
      // Classic stalemate: black king on a8, white queen on b6, white king on c8 doesn't work...
      // Use: black king on h8, white queen on g6, white king on f7? No...
      // Simple stalemate: black king on a8, white queen on b6 (controls a7,b7,b8), white king on c7
      // but king on c7 would be adjacent to king on a8... no it wouldn't (2 squares apart).
      // Actually c7 and a8: distance is file=2, rank=1, not adjacent.
      // a8 king: can go to a7 (controlled by queen), b8 (controlled by queen), b7 (controlled by queen+king)
      // That's stalemate if black has no other pieces!

      const board = emptyBoard();
      place(board, "a8", "black", "king");
      place(board, "b6", "white", "queen");
      place(board, "c7", "white", "king");
      const state = customState(board, "black");

      // Generate legal moves to verify
      const legal = ChessModule.getLegalActions(state, PLAYER_B);
      const moves = legal.filter((a) => a.type === "move");
      // Should only have resign (no legal chess moves)
      assert.equal(moves.length, 0);

      // Apply any move as white to trigger stalemate detection...
      // Actually, the stalemate should be detected when we check terminal on this state.
      // But terminalStatus is only set by applyAction. So we need to construct a state
      // where it's already detected, or apply a move that leads to this position.

      // Let's construct a position one move before stalemate:
      const board2 = emptyBoard();
      place(board2, "a8", "black", "king");
      place(board2, "b5", "white", "queen");
      place(board2, "c7", "white", "king");
      const state2 = customState(board2, "white");

      // White moves queen to b6, creating stalemate
      const next = ChessModule.applyAction(state2, PLAYER_W, move("b5", "b6"));
      assert.equal(ChessModule.isTerminal(next), true);
      const outcome = ChessModule.getOutcome(next);
      assert.equal(outcome.winner, null);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.reason, "stalemate");
      assert.equal(outcome.scores[PLAYER_W], 0.5);
      assert.equal(outcome.scores[PLAYER_B], 0.5);
    });
  });

  describe("draw conditions", () => {
    it("should detect insufficient material: K vs K", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      place(board, "a1", "white", "pawn"); // need a move to trigger detection
      const state = customState(board, "white");

      // Promote pawn... wait, that adds material. Let's make the pawn capturable.
      // Better: set up K vs K + one pawn that gets captured
      const board2 = emptyBoard();
      place(board2, "e1", "white", "king");
      place(board2, "e8", "black", "king");
      place(board2, "d2", "black", "pawn"); // white can capture
      const state2 = customState(board2, "white");

      const next = ChessModule.applyAction(state2, PLAYER_W, move("e1", "d2"));
      const data = getData(next);
      assert.equal(data.terminalStatus, "insufficient_material");
      assert.equal(ChessModule.isTerminal(next), true);
      const outcome = ChessModule.getOutcome(next);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.reason, "insufficient_material");
    });

    it("should detect insufficient material: K+B vs K", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "c1", "white", "bishop");
      place(board, "e8", "black", "king");
      place(board, "d2", "black", "pawn");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "d2"));
      assert.equal(getData(next).terminalStatus, "insufficient_material");
    });

    it("should detect insufficient material: K+N vs K", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "c3", "white", "knight");
      place(board, "e8", "black", "king");
      place(board, "d2", "black", "pawn");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "d2"));
      assert.equal(getData(next).terminalStatus, "insufficient_material");
    });

    it("should detect insufficient material: K+B vs K+B same color bishops", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "c1", "white", "bishop"); // dark square (file 2 + rank 0 = even)
      place(board, "e8", "black", "king");
      place(board, "f8", "black", "bishop"); // dark square (file 5 + rank 7 = even)
      place(board, "d2", "black", "pawn"); // remove to trigger check
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "d2"));
      assert.equal(getData(next).terminalStatus, "insufficient_material");
    });

    it("should NOT detect insufficient material with opposite-color bishops", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "c1", "white", "bishop"); // dark square (2+0=even)
      place(board, "e8", "black", "king");
      place(board, "c8", "black", "bishop"); // light square (2+7=odd)
      place(board, "d2", "black", "pawn");
      const state = customState(board, "white");

      const next = ChessModule.applyAction(state, PLAYER_W, move("e1", "d2"));
      assert.notEqual(getData(next).terminalStatus, "insufficient_material");
    });

    it("should detect 50-move rule", () => {
      const board = emptyBoard();
      place(board, "a1", "white", "king");
      place(board, "h8", "black", "king");
      place(board, "a2", "white", "rook");
      const state = customState(board, "white", { halfMoveClock: 99 });

      // One more move without pawn or capture = 100 half-moves
      const next = ChessModule.applyAction(state, PLAYER_W, move("a2", "b2"));
      assert.equal(getData(next).terminalStatus, "fifty_move");
      assert.equal(ChessModule.isTerminal(next), true);
      const outcome = ChessModule.getOutcome(next);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.reason, "fifty_move");
    });

    it("should reset half-move clock on pawn move", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      // Make some moves
      state = ChessModule.applyAction(state, PLAYER_W, move("g1", "f3"));
      assert.equal(getData(state).halfMoveClock, 1);
      state = ChessModule.applyAction(state, PLAYER_B, move("g8", "f6"));
      assert.equal(getData(state).halfMoveClock, 2);
      // Pawn move resets
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      assert.equal(getData(state).halfMoveClock, 0);
    });

    it("should detect threefold repetition", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");

      // Move knights back and forth to repeat position
      // Position 1 (initial)
      // Nf3 Nf6 Ng1 Ng8 -> back to initial position (2nd time)
      // Nf3 Nf6 Ng1 Ng8 -> back to initial position (3rd time = threefold)

      state = ChessModule.applyAction(state, PLAYER_W, move("g1", "f3"));
      state = ChessModule.applyAction(state, PLAYER_B, move("g8", "f6"));
      state = ChessModule.applyAction(state, PLAYER_W, move("f3", "g1"));
      state = ChessModule.applyAction(state, PLAYER_B, move("f6", "g8"));
      // Position repeated 2nd time
      assert.equal(getData(state).terminalStatus, null);

      state = ChessModule.applyAction(state, PLAYER_W, move("g1", "f3"));
      state = ChessModule.applyAction(state, PLAYER_B, move("g8", "f6"));
      state = ChessModule.applyAction(state, PLAYER_W, move("f3", "g1"));
      state = ChessModule.applyAction(state, PLAYER_B, move("f6", "g8"));
      // Position repeated 3rd time = threefold repetition
      assert.equal(getData(state).terminalStatus, "threefold_repetition");
      assert.equal(ChessModule.isTerminal(state), true);
      const outcome = ChessModule.getOutcome(state);
      assert.equal(outcome.draw, true);
      assert.equal(outcome.reason, "threefold_repetition");
    });
  });

  describe("resignation", () => {
    it("should allow resignation", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const next = ChessModule.applyAction(state, PLAYER_W, resign());
      assert.equal(ChessModule.isTerminal(next), true);
      const outcome = ChessModule.getOutcome(next);
      assert.equal(outcome.winner, PLAYER_B);
      assert.equal(outcome.draw, false);
      assert.equal(outcome.reason, "resignation");
    });
  });

  describe("validateAction", () => {
    it("should reject moves from wrong player", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(
        ChessModule.validateAction(state, PLAYER_B, move("e7", "e5")),
        false
      );
    });

    it("should reject invalid action types", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(
        ChessModule.validateAction(state, PLAYER_W, {
          type: "invalid",
          data: {},
        }),
        false
      );
    });

    it("should reject illegal moves (moving into check)", () => {
      const board = emptyBoard();
      place(board, "e1", "white", "king");
      place(board, "e8", "black", "king");
      place(board, "a1", "black", "rook"); // controls rank 1
      const state = customState(board, "white");

      // King can't move to d1 (attacked by rook on a1)
      const valid = ChessModule.validateAction(state, PLAYER_W, move("e1", "d1"));
      assert.equal(valid, false);
    });

    it("should accept valid resign action", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(ChessModule.validateAction(state, PLAYER_W, resign()), true);
    });
  });

  describe("getObservation", () => {
    it("should return complete information for both players", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));

      const obsW = ChessModule.getObservation(state, PLAYER_W);
      const obsB = ChessModule.getObservation(state, PLAYER_B);

      assert.deepEqual(obsW.publicData, obsB.publicData);
      assert.equal(obsW.gameId, "chess");
      assert.equal(obsW.currentPlayer, PLAYER_B);
      assert.equal(obsW.turnNumber, 1);
    });

    it("should deep clone observation data", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const obs = ChessModule.getObservation(state, PLAYER_W);
      const pubBoard = (obs.publicData as { board: Board }).board;

      // Mutating observation should not affect state
      pubBoard[0][0] = null;
      assert.notEqual(getData(state).board[0][0], null);
    });
  });

  describe("getLegalActions", () => {
    it("should return moves for current player", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const actions = ChessModule.getLegalActions(state, PLAYER_W);
      // 20 opening moves for white (16 pawn + 4 knight) + 1 resign
      assert.equal(actions.length, 21);
    });

    it("should return empty for non-current player", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const actions = ChessModule.getLegalActions(state, PLAYER_B);
      assert.equal(actions.length, 0);
    });

    it("should return empty for terminal state", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      state = ChessModule.applyAction(state, PLAYER_W, resign());
      const actionsW = ChessModule.getLegalActions(state, PLAYER_W);
      const actionsB = ChessModule.getLegalActions(state, PLAYER_B);
      assert.equal(actionsW.length, 0);
      assert.equal(actionsB.length, 0);
    });

    it("should include resign action", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const actions = ChessModule.getLegalActions(state, PLAYER_W);
      const hasResign = actions.some((a) => a.type === "resign");
      assert.equal(hasResign, true);
    });
  });

  describe("determinism", () => {
    it("should produce identical states for identical inputs", () => {
      const state1 = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const state2 = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.deepEqual(state1, state2);

      const next1 = ChessModule.applyAction(state1, PLAYER_W, move("e2", "e4"));
      const next2 = ChessModule.applyAction(state2, PLAYER_W, move("e2", "e4"));
      assert.deepEqual(next1, next2);
    });

    it("should not mutate original state", () => {
      const state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      const origBoard = getData(state).board.map((r) =>
        r.map((c) => (c ? { ...c } : null))
      );
      ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      // Original board unchanged
      for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
          assert.deepEqual(getData(state).board[r][f], origBoard[r][f]);
        }
      }
    });
  });

  describe("complete games", () => {
    it("should play Scholar's Mate to completion", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");
      assert.equal(ChessModule.isTerminal(state), false);

      state = ChessModule.applyAction(state, PLAYER_W, move("e2", "e4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));
      state = ChessModule.applyAction(state, PLAYER_W, move("f1", "c4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("b8", "c6"));
      state = ChessModule.applyAction(state, PLAYER_W, move("d1", "h5"));
      state = ChessModule.applyAction(state, PLAYER_B, move("g8", "f6"));
      state = ChessModule.applyAction(state, PLAYER_W, move("h5", "f7"));

      assert.equal(ChessModule.isTerminal(state), true);
      assert.equal(ChessModule.getOutcome(state).winner, PLAYER_W);
      assert.equal(getData(state).terminalStatus, "checkmate");
    });

    it("should play Fool's Mate to completion", () => {
      let state = ChessModule.init(CONFIG, [PLAYER_W, PLAYER_B], "seed");

      state = ChessModule.applyAction(state, PLAYER_W, move("f2", "f3"));
      state = ChessModule.applyAction(state, PLAYER_B, move("e7", "e5"));
      state = ChessModule.applyAction(state, PLAYER_W, move("g2", "g4"));
      state = ChessModule.applyAction(state, PLAYER_B, move("d8", "h4"));

      assert.equal(ChessModule.isTerminal(state), true);
      assert.equal(ChessModule.getOutcome(state).winner, PLAYER_B);
      assert.equal(getData(state).terminalStatus, "checkmate");
    });
  });
});
