import { buildAuthMessage } from "@dorkfun/core";
import {
  JoinQueueResponse,
  PrivateMatchResponse,
  AcceptMatchResponse,
  ActiveMatchResponse,
  GameInfo,
} from "./types";

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly signMessage: (message: string) => Promise<string>
  ) {}

  /**
   * Build the authentication payload (playerId, signature, timestamp) for
   * any endpoint that requires proof of address ownership.
   */
  private async buildAuthPayload(playerId: string) {
    const timestamp = Date.now();
    const message = buildAuthMessage(playerId, timestamp);
    const signature = await this.signMessage(message);
    return { playerId, signature, timestamp };
  }

  async listGames(): Promise<{ games: GameInfo[] }> {
    return this.request("/api/games");
  }

  async joinQueue(
    playerId: string,
    gameId: string,
    ticket?: string,
    stakeWei?: string
  ): Promise<JoinQueueResponse> {
    const auth = await this.buildAuthPayload(playerId);
    return this.request("/api/matchmaking/join", {
      method: "POST",
      body: JSON.stringify({ ...auth, gameId, ticket, stakeWei }),
    });
  }

  async leaveQueue(ticket: string): Promise<{ success: boolean }> {
    return this.request("/api/matchmaking/leave", {
      method: "POST",
      body: JSON.stringify({ ticket }),
    });
  }

  async createPrivateMatch(
    playerId: string,
    gameId: string,
    stakeWei?: string
  ): Promise<PrivateMatchResponse> {
    const auth = await this.buildAuthPayload(playerId);
    return this.request("/api/matches/private", {
      method: "POST",
      body: JSON.stringify({ ...auth, gameId, stakeWei }),
    });
  }

  async acceptPrivateMatch(
    playerId: string,
    inviteCode: string
  ): Promise<AcceptMatchResponse> {
    const auth = await this.buildAuthPayload(playerId);
    return this.request("/api/matches/accept", {
      method: "POST",
      body: JSON.stringify({ ...auth, inviteCode }),
    });
  }

  async checkActiveMatch(playerId: string): Promise<ActiveMatchResponse> {
    const auth = await this.buildAuthPayload(playerId);
    return this.request("/api/matches/active", {
      method: "POST",
      body: JSON.stringify(auth),
    });
  }

  private async request(path: string, opts?: RequestInit): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", ...opts?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  }
}
