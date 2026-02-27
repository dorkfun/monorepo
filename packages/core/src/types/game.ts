export interface GameConfig {
  gameId: string;
  version: string;
  settings?: Record<string, unknown>;
}

export interface GameState {
  gameId: string;
  players: string[];
  currentPlayer: string;
  turnNumber: number;
  data: Record<string, unknown>;
}

export interface Action {
  type: string;
  data: Record<string, unknown>;
}

export interface Outcome {
  winner: string | null;
  draw: boolean;
  scores: Record<string, number>;
  reason: string;
}

export interface Observation {
  gameId: string;
  players: string[];
  currentPlayer: string;
  turnNumber: number;
  publicData: Record<string, unknown>;
  privateData?: Record<string, unknown>;
}
