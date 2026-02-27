import { Generated, Selectable, Insertable, Updateable } from "kysely";

// ---- players ----

export interface PlayersTable {
  address: string;
  display_name: string;
  rating: number;
  games_played: number;
  games_won: number;
  games_drawn: number;
  total_earnings_wei: Generated<string>;
  created_at: Generated<Date>;
}

export type Player = Selectable<PlayersTable>;
export type NewPlayer = Insertable<PlayersTable>;
export type PlayerUpdate = Updateable<PlayersTable>;

// ---- matches ----

export interface MatchesTable {
  id: string;
  game_id: string;
  status: string;
  players: string; // JSON array
  winner: string | null;
  transcript_hash: string | null;
  settlement_tx_hash: string | null;
  stake_wei: string | null;
  created_at: Generated<Date>;
  completed_at: Date | null;
}

export type Match = Selectable<MatchesTable>;
export type NewMatch = Insertable<MatchesTable>;
export type MatchUpdate = Updateable<MatchesTable>;

// ---- match_moves ----

export interface MatchMovesTable {
  id: Generated<number>;
  match_id: string;
  sequence: number;
  player_address: string;
  action: string; // JSON
  state_hash: string;
  prev_hash: string;
  created_at: Generated<Date>;
}

export type MatchMove = Selectable<MatchMovesTable>;
export type NewMatchMove = Insertable<MatchMovesTable>;
export type MatchMoveUpdate = Updateable<MatchMovesTable>;

// ---- chat_messages ----

export interface ChatMessagesTable {
  id: Generated<number>;
  match_id: string;
  sender: string;
  display_name: string;
  message: string;
  created_at: Generated<Date>;
}

export type ChatMessage = Selectable<ChatMessagesTable>;
export type NewChatMessage = Insertable<ChatMessagesTable>;
export type ChatMessageUpdate = Updateable<ChatMessagesTable>;

// ---- player_game_stats ----

export interface PlayerGameStatsTable {
  player_address: string;
  game_id: string;
  rating: number;
  games_played: number;
  games_won: number;
  games_drawn: number;
  games_lost: number;
  total_earnings_wei: Generated<string>;
}

export type PlayerGameStats = Selectable<PlayerGameStatsTable>;
export type NewPlayerGameStats = Insertable<PlayerGameStatsTable>;
export type PlayerGameStatsUpdate = Updateable<PlayerGameStatsTable>;

// ---- master Database interface ----

export interface Database {
  players: PlayersTable;
  player_game_stats: PlayerGameStatsTable;
  matches: MatchesTable;
  match_moves: MatchMovesTable;
  chat_messages: ChatMessagesTable;
}
