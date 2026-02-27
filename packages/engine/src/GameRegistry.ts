import { IGameModule } from "./interfaces/IGameModule";

/**
 * In-memory registry of available game modules.
 */
export class GameRegistry {
  private games = new Map<string, IGameModule>();

  register(game: IGameModule): void {
    this.games.set(game.gameId, game);
  }

  get(gameId: string): IGameModule | undefined {
    return this.games.get(gameId);
  }

  list(): IGameModule[] {
    return Array.from(this.games.values());
  }

  has(gameId: string): boolean {
    return this.games.has(gameId);
  }
}
