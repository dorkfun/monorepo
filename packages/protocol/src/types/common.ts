export interface PlayerId {
  address: string;
  displayName: string;
}

export interface GameId {
  id: string;
}

export interface MatchId {
  id: string;
}

export enum ProtocolMatchStatus {
  UNKNOWN = 0,
  WAITING = 1,
  ACTIVE = 2,
  COMPLETED = 3,
  SETTLED = 4,
  DISPUTED = 5,
}

export interface MatchSummary {
  matchId: MatchId;
  gameId: GameId;
  players: PlayerId[];
  status: ProtocolMatchStatus;
  createdAt: number;
  winner?: PlayerId;
}
