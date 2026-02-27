import {
  GameState,
  Action,
  Outcome,
  Observation,
  TranscriptEntry,
  hashState,
  chainHash,
} from "@dorkfun/core";
import { IGameModule } from "./interfaces/IGameModule";

export interface MatchOrchestratorOptions {
  game: IGameModule;
  players: string[];
  matchId: string;
  rngSeed?: string;
  settings?: Record<string, unknown>;
}

/**
 * Orchestrates a single match: manages turns, validates moves,
 * applies state transitions, and builds the transcript.
 */
export class MatchOrchestrator {
  private game: IGameModule;
  private state: GameState;
  private matchId: string;
  private transcript: TranscriptEntry[] = [];
  private prevHash: string;

  constructor(opts: MatchOrchestratorOptions) {
    this.game = opts.game;
    this.matchId = opts.matchId;

    const config = {
      gameId: opts.game.gameId,
      version: "0.1.0",
      settings: opts.settings,
    };
    this.state = opts.game.init(config, opts.players, opts.rngSeed || "0");
    this.prevHash = hashState(this.state);
  }

  getState(): GameState {
    return this.state;
  }

  getCurrentPlayer(): string {
    return this.state.currentPlayer;
  }

  isTerminal(): boolean {
    return this.game.isTerminal(this.state);
  }

  getOutcome(): Outcome {
    return this.game.getOutcome(this.state);
  }

  getObservation(playerId: string): Observation {
    return this.game.getObservation(this.state, playerId);
  }

  getLegalActions(playerId: string): Action[] {
    return this.game.getLegalActions(this.state, playerId);
  }

  getTranscript(): TranscriptEntry[] {
    return this.transcript;
  }

  /** Returns the game module's per-move timeout override, or undefined to use server default. */
  getMoveTimeoutMs(): number | null | undefined {
    return this.game.moveTimeoutMs;
  }

  /**
   * Submit a move. Returns the new state observation or throws if invalid.
   */
  submitAction(
    playerId: string,
    action: Action
  ): { observation: Observation; terminal: boolean; outcome?: Outcome } {
    if (this.isTerminal()) {
      throw new Error("Game is already over");
    }

    if (this.state.currentPlayer !== playerId) {
      throw new Error(
        `Not your turn. Current player: ${this.state.currentPlayer}`
      );
    }

    if (!this.game.validateAction(this.state, playerId, action)) {
      throw new Error("Invalid action");
    }

    this.state = this.game.applyAction(this.state, playerId, action);
    const stateHash = hashState(this.state);

    const entry: TranscriptEntry = {
      sequence: this.transcript.length,
      playerAddress: playerId,
      action,
      stateHash,
      prevHash: this.prevHash,
      timestamp: Date.now(),
    };

    this.prevHash = chainHash(this.prevHash, entry);
    this.transcript.push(entry);

    const terminal = this.game.isTerminal(this.state);
    const observation = this.game.getObservation(this.state, playerId);

    return {
      observation,
      terminal,
      outcome: terminal ? this.game.getOutcome(this.state) : undefined,
    };
  }
}
