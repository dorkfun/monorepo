import { Action, Observation } from "@dorkfun/core";

export interface AgentConfig {
  /** HTTP base URL, e.g. "https://engine.dork.fun" */
  serverUrl: string;
  /** WebSocket base URL. Defaults to serverUrl with wss:// scheme. */
  wsUrl?: string;
  /** Unique player identifier. Must be a valid EVM address (0x + 40 hex chars). */
  playerId: string;
  /** Display name shown to opponents and spectators. Defaults to playerId. */
  displayName?: string;
  /**
   * Signs a message with the player's private key (EIP-191 personal_sign).
   * Required for all authenticated requests. Example with ethers.js:
   * `signMessage: (msg) => wallet.signMessage(msg)`
   */
  signMessage: (message: string) => Promise<string>;
}

export interface ActiveMatchResponse {
  hasActiveMatch: boolean;
  matchId?: string;
  gameId?: string;
  wsToken?: string;
  wsUrl?: string;
}

export interface GameContext {
  matchId: string;
  gameId: string;
  observation: Observation;
  yourTurn: boolean;
  legalActions: Action[];
  opponent: string;
  turnNumber: number;
}

export interface GameResult {
  matchId: string;
  winner: string | null;
  draw: boolean;
  reason: string;
  you: string;
  didWin: boolean;
  stakeWei?: string;
}

export interface Strategy {
  /** Called each time it's your turn. Return the action to play. */
  chooseAction(ctx: GameContext): Action | Promise<Action>;
  /** Called when the game ends. */
  onGameOver?(result: GameResult): void;
  /** Called on every game state update (yours or opponent's turn). */
  onStateUpdate?(ctx: GameContext): void;
}

export interface EscrowInfo {
  address: string;
  stakeWei: string;
  matchIdBytes32: string;
}

export interface PlayOptions {
  /** Delay in ms before submitting each move. Useful for human-like pacing. */
  moveDelay?: number;
  /** Called for each lifecycle event. */
  onLog?(tag: string, message: string): void;
  /** Stake amount in wei. Only for multiplayer games with settlement enabled. */
  stakeWei?: string;
  /**
   * Called when a staked match requires a deposit. The callback should submit
   * the deposit transaction on-chain and return the tx hash. If not provided,
   * the agent will log a warning and wait for external deposit.
   */
  sendDeposit?: (escrow: EscrowInfo) => Promise<string>;
}

export interface PrivatePlayOptions extends PlayOptions {
  /** If provided, join an existing private match. Otherwise create one. */
  inviteCode?: string;
}

export interface JoinQueueResponse {
  status: "matched" | "queued";
  matchId?: string;
  wsToken?: string;
  opponent?: string;
  ticket?: string;
  wsUrl?: string;
  escrow?: EscrowInfo;
}

export interface PrivateMatchResponse {
  matchId: string;
  inviteCode: string;
  wsToken: string;
  wsUrl?: string;
  escrow?: EscrowInfo;
}

export interface AcceptMatchResponse {
  matchId: string;
  wsToken: string;
  wsUrl?: string;
  escrow?: EscrowInfo;
}

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  stakingEnabled?: boolean;
}
