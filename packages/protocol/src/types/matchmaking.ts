import { PlayerId, GameId, MatchId } from "./common";

export interface JoinQueueRequest {
  player: PlayerId;
  game: GameId;
  authSignature: string;
  stakeAmount?: string;
}

export interface JoinQueueResponse {
  queueTicket: string;
}

export interface LeaveQueueRequest {
  queueTicket: string;
}

export interface LeaveQueueResponse {
  success: boolean;
}

export interface WatchQueueRequest {
  queueTicket: string;
}

export interface QueuePositionUpdate {
  position: number;
  estimatedWaitSeconds: number;
}

export interface MatchFound {
  matchId: MatchId;
  opponent: PlayerId;
  websocketUrl: string;
  websocketToken: string;
}

export interface QueueCancelled {
  reason: string;
}

export type QueueEvent =
  | { type: "position_update"; data: QueuePositionUpdate }
  | { type: "match_found"; data: MatchFound }
  | { type: "cancelled"; data: QueueCancelled };

export interface CreatePrivateMatchRequest {
  player: PlayerId;
  game: GameId;
  authSignature: string;
  stakeAmount?: string;
}

export interface CreatePrivateMatchResponse {
  matchId: MatchId;
  inviteCode: string;
}

export interface AcceptMatchRequest {
  player: PlayerId;
  inviteCode: string;
  authSignature: string;
}

export interface AcceptMatchResponse {
  matchId: MatchId;
  websocketUrl: string;
  websocketToken: string;
}
