export enum MatchStatus {
  WAITING = "waiting",
  ACTIVE = "active",
  COMPLETED = "completed",
  SETTLED = "settled",
  DISPUTED = "disputed",
}

export interface MatchRecord {
  id: string;
  gameId: string;
  status: MatchStatus;
  players: string[];
  winner: string | null;
  transcriptHash: string | null;
  settlementTxHash: string | null;
  stakeWei: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface TranscriptEntry {
  sequence: number;
  playerAddress: string;
  action: unknown;
  stateHash: string;
  prevHash: string;
  timestamp: number;
}

export interface MatchTranscript {
  matchId: string;
  gameId: string;
  entries: TranscriptEntry[];
  rootHash: string;
}
