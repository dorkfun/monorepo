import { TranscriptEntry, MatchTranscript } from "../types/match";
import { hashState, chainHash } from "./Crypto";

/**
 * Builds hash-chained match transcripts as moves are applied.
 * Each entry is linked to the previous via chainHash.
 */
export class TranscriptBuilder {
  private matchId: string;
  private gameId: string;
  private entries: TranscriptEntry[] = [];
  private currentHash: string;

  constructor(matchId: string, gameId: string, initialState: unknown) {
    this.matchId = matchId;
    this.gameId = gameId;
    this.currentHash = hashState(initialState);
  }

  addEntry(
    playerAddress: string,
    action: unknown,
    newState: unknown
  ): TranscriptEntry {
    const stateHash = hashState(newState);

    const entry: TranscriptEntry = {
      sequence: this.entries.length,
      playerAddress,
      action,
      stateHash,
      prevHash: this.currentHash,
      timestamp: Date.now(),
    };

    this.currentHash = chainHash(this.currentHash, entry);
    this.entries.push(entry);

    return entry;
  }

  getTranscript(): MatchTranscript {
    return {
      matchId: this.matchId,
      gameId: this.gameId,
      entries: [...this.entries],
      rootHash: this.currentHash,
    };
  }

  getCurrentHash(): string {
    return this.currentHash;
  }

  getEntryCount(): number {
    return this.entries.length;
  }
}
