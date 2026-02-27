import { GameId, PlayerId } from "./common";

export interface GameInfo {
  gameId: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportsSpectators: boolean;
  rulesMarkdown: string;
  activeMatches: number;
  playersInQueue: number;
}

export interface ListGamesRequest {}

export interface ListGamesResponse {
  games: GameInfo[];
}

export interface GetGameRequest {
  gameId: GameId;
}

export interface GetLeaderboardRequest {
  gameId: GameId;
  limit: number;
}

export interface LeaderboardEntry {
  player: PlayerId;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}
