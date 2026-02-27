import { MatchId, MatchSummary, PlayerId, GameId } from "./common";

export interface GetMatchRequest {
  matchId: MatchId;
}

export interface ProtocolTranscriptEntry {
  sequence: number;
  playerAddress: string;
  action: unknown;
  stateHash: string;
  prevHash: string;
  timestamp: number;
}

export interface MatchDetail {
  summary: MatchSummary;
  moves: ProtocolTranscriptEntry[];
  settlementTxHash?: string;
}

export interface ListMatchesRequest {
  player?: PlayerId;
  game?: GameId;
  limit: number;
  offset: number;
}

export interface ListMatchesResponse {
  matches: MatchSummary[];
  total: number;
}

export interface GetTranscriptRequest {
  matchId: MatchId;
}

export interface TranscriptResponse {
  entries: ProtocolTranscriptEntry[];
  rootHash: string;
}
