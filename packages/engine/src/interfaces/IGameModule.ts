import { GameConfig, GameState, Action, Outcome, Observation } from "@dorkfun/core";

// ---------------------------------------------------------------------------
// Game UI Specification — shipped by each game module for rendering
// ---------------------------------------------------------------------------

export interface PieceDisplay {
  /** Unicode or ASCII character (e.g. "♔", "X") */
  symbol: string;
  /** Short text label (e.g. "K", "X") */
  label: string;
}

/**
 * UI specification that each game module can provide so that CLI and web
 * apps can render any game generically without hardcoded per-game logic.
 */
export interface GameUISpec {
  /** Player role labels in order (e.g. ["White", "Black"] or ["X", "O"]) */
  playerLabels: string[];

  /** Map of piece/mark identifiers to display info */
  pieces: Record<string, PieceDisplay>;

  /** Hint text shown to the current player (e.g. "Enter 1-9" or "Enter move (e.g. e2e4)") */
  inputHint: string;

  /** Max possible turns, or null if unbounded. Used for "move N/M" display. */
  maxTurns: number | null;

  /** Render the board as an ASCII string from publicData. */
  renderBoard(publicData: Record<string, unknown>): string;

  /** Render a one-line status string (e.g. "Check!"), or null if nothing special. */
  renderStatus(publicData: Record<string, unknown>): string | null;

  /** Parse raw user input into an Action, or return null if invalid. */
  parseInput(raw: string, publicData: Record<string, unknown>): Action | null;

  /** Format an Action as a human-readable string for move history (e.g. "e2→e4"). */
  formatAction(action: Action): string;

  /** Get the display label for a player given their publicData role/mark. */
  getPlayerLabel(playerId: string, publicData: Record<string, unknown>): string;
}

// ---------------------------------------------------------------------------
// Game Definition Standard (GDS) — the 7-function ABI
// ---------------------------------------------------------------------------

/**
 * The 7-function ABI that every game module must implement.
 *
 * Every function must be deterministic given the same inputs.
 * State transitions must be reproducible for verification and dispute resolution.
 */
export interface IGameModule {
  /** Unique identifier for this game (e.g., "tictactoe") */
  readonly gameId: string;

  /** Human-readable name */
  readonly name: string;

  /** Short description of the game */
  readonly description: string;

  /** Number of players required */
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /** UI rendering specification. */
  readonly ui?: GameUISpec;

  /**
   * Per-move timeout in milliseconds.
   * - A number overrides the server default (e.g. 3_600_000 for 60 min).
   * - `null` disables the per-move timer entirely (stale match cleanup still applies).
   * - `undefined` (omitted) falls back to the server's MATCH_TIMEOUT_MS default.
   */
  readonly moveTimeoutMs?: number | null;

  /** Initialize a new game state */
  init(config: GameConfig, players: string[], rngSeed: string): GameState;

  /** Check if an action is valid in the current state */
  validateAction(state: GameState, playerId: string, action: Action): boolean;

  /** Apply an action and return the new state (must be deterministic) */
  applyAction(
    state: GameState,
    playerId: string,
    action: Action,
    rng?: string
  ): GameState;

  /** Check if the game has ended */
  isTerminal(state: GameState): boolean;

  /** Get the outcome of a terminal game state */
  getOutcome(state: GameState): Outcome;

  /** Get the observable state for a specific player (hides private info) */
  getObservation(state: GameState, playerId: string): Observation;

  /** Get all legal actions for a player in the current state */
  getLegalActions(state: GameState, playerId: string): Action[];
}
