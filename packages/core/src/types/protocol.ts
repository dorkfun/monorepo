export type WsMessageType =
  | "HELLO"
  | "ACTION_COMMIT"
  | "ACTION_REVEAL"
  | "STEP_RESULT"
  | "GAME_STATE"
  | "GAME_OVER"
  | "SPECTATE_JOIN"
  | "SPECTATE_STATE"
  | "CHAT"
  | "CHAT_HISTORY"
  | "SYNC_REQUEST"
  | "SYNC_RESPONSE"
  | "DEPOSIT_REQUIRED"
  | "DEPOSITS_CONFIRMED"
  | "FORFEIT"
  | "ERROR";

export interface WsMessage {
  type: WsMessageType;
  matchId: string;
  payload: unknown;
  sequence: number;
  prevHash: string;
  timestamp: number;
}

export interface HelloPayload {
  token: string;
  playerId: string;
}

export interface ActionCommitPayload {
  action: unknown;
  commitment?: string;
}

export interface StepResultPayload {
  state: unknown;
  lastAction: unknown;
  nextPlayer: string | null;
  stateHash: string;
}

export interface GameOverPayload {
  winner: string | null;
  draw: boolean;
  reason: string;
  finalStateHash: string;
}

export interface ChatPayload {
  sender: string;
  message: string;
  displayName: string;
}

export interface SyncRequestPayload {
  clientIsMyTurn: boolean;
}

export interface SyncResponsePayload {
  yourTurn: boolean;
  currentPlayer: string;
  legalActions?: unknown[];
  matchStatus: string;
}

export interface DepositRequiredPayload {
  stakeWei: string;
  matchIdBytes32: string;
  escrowAddress: string;
}
