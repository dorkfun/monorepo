# Contributing to dork.fun

Guide for contributing to the dork.fun monorepo — both platform development and game authoring.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Branch & PR Conventions](#branch--pr-conventions)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Building a New Game](#building-a-new-game)
- [Registering Your Game](#registering-your-game)

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker & Docker Compose (for running the full stack locally)
- Foundry (for smart contract work only)

### Setup

```bash
git clone <repo-url>
cd dorkfun
pnpm install
pnpm build
```

### Running locally

```bash
# Full stack (postgres, redis, server, web)
docker compose up --build -d

# Or run individual services for development
pnpm --filter=@dorkfun/server dev    # server on :8080
pnpm --filter=@dorkfun/web dev       # web on :3000
```

---

## Project Structure

```
dorkfun/
├── packages/                  # Shared libraries (not independently deployable)
│   ├── core/                  # Types, crypto, encoding, database, validation
│   ├── protocol/              # Protobuf definitions + generated TypeScript
│   ├── engine/                # Game runner, match orchestrator, IGameModule interface
│   ├── game-ui/               # React UI components for rendering games
│   └── games/                 # Game implementations (one per subdirectory)
│       ├── tictactoe/         # @dorkfun/game-tictactoe
│       └── chess/             # @dorkfun/game-chess
│
├── apps/                      # Deployable applications
│   ├── server/                # HTTP/WS game server (Express + ws)
│   ├── web/                   # React spectator UI (Vite + React)
│   ├── cli/                   # Terminal UI client (Ink)
│   └── contracts/             # Foundry smart contracts
│
├── docker-compose.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

**Key distinction:** `packages/` contains shared libraries consumed by other packages or apps. `apps/` contains standalone, deployable applications. Games live under `packages/games/` because they are library modules consumed by the server, web app, and CLI — not standalone apps.

---

## Development Workflow

### What adequate dev looks like

1. **Read before you write.** Understand the existing code and patterns in the area you're touching before making changes. Check how similar functionality is implemented elsewhere in the repo.
2. **One concern per change.** Keep PRs focused. A bug fix is a bug fix — don't bundle refactors or unrelated improvements.
3. **Tests are required.** All game logic must have test coverage. Platform changes (server, engine, core) should include tests for new behavior.
4. **Build before pushing.** Run `pnpm build` from the root. TypeScript errors in any package block the entire build.
5. **Run the relevant tests.** At minimum, run tests for packages you changed: `pnpm --filter=@dorkfun/<package> test`. Run `pnpm test` for the full suite before opening a PR.

### Common commands

```bash
pnpm build                                    # Build everything
pnpm test                                     # Test everything
pnpm --filter=@dorkfun/game-tictactoe test    # Test a specific package
pnpm --filter=@dorkfun/server dev             # Dev mode for a specific app
cd apps/contracts && forge test               # Smart contract tests
```

### Dependency graph

Build order matters. The dependency chain is:

```
core → protocol → engine → games → game-ui → server/web/cli
```

If you change `core`, everything downstream needs to rebuild. If you change a game, only `game-ui`, `server`, `web`, and `cli` are affected.

---

## Branch & PR Conventions

### Branches

Create feature branches from `main`. Use this naming convention:

| Prefix | Use case | Example |
|--------|----------|---------|
| `feat/` | New features | `feat/connect4-game` |
| `fix/` | Bug fixes | `fix/castling-through-check` |
| `refactor/` | Code restructuring | `refactor/engine-match-lifecycle` |
| `docs/` | Documentation only | `docs/agent-sdk-examples` |
| `chore/` | Tooling, deps, CI | `chore/upgrade-typescript` |
| `game/` | New game implementation | `game/checkers` |

### Pull requests

- **Title format:** `<type>: <short description>` — e.g. `feat: add Connect Four game`, `fix: prevent castling through check`
- Keep titles under 70 characters
- **Description:** Include a summary of what changed and why. For game PRs, describe the game rules and any design decisions
- **Test plan:** List what you tested and how. Include relevant test output
- Link related issues if applicable

### Commits

Write clear commit messages. Prefer a short summary line (<72 chars) followed by a blank line and details if needed. Use imperative mood: "Add connect4 game" not "Added connect4 game".

---

## Code Standards

- **TypeScript** for all packages and apps. Strict mode enabled via `tsconfig.base.json`
- **No `any` types** unless interfacing with untyped external APIs. Use `unknown` and narrow
- **Immutability** in game logic — never mutate `GameState`. Always return new objects from `applyAction`
- **Determinism** in game modules — given the same inputs, every function must produce the same output. No `Math.random()`, no `Date.now()`, no side effects
- **Mocha + Chai** for testing game packages
- **No default exports** — use named exports throughout

---

## Testing

### Game packages

Every game must have comprehensive tests covering:

- Initialization (correct starting state, player assignment)
- Valid and invalid move validation
- Full game sequences played to completion
- All terminal conditions (wins, draws, stalemate, resignation)
- Edge cases specific to the game
- Determinism (same inputs produce same outputs)
- Immutability (input state is not mutated by `applyAction`)

Run with: `pnpm --filter=@dorkfun/game-<name> test`

### Smart contracts

Foundry tests in `apps/contracts/test/`. Run with: `cd apps/contracts && forge test`

---

## Building a New Game

Games are library packages in `packages/games/` that implement the **Game Definition Standard (GDS)** — a 7-function interface defining the game as a deterministic state machine. The platform handles matchmaking, networking, persistence, and settlement automatically.

### Step 1: Scaffold the package

Create a new directory under `packages/games/`:

```
packages/games/your-game/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts          # barrel export
    ├── rules.ts          # IGameModule implementation
    ├── state.ts          # game-specific data types + helpers
    ├── actions.ts        # action types + validation + legal action generation
    ├── observation.ts    # player-visible state transformation
    ├── ui.ts             # GameUISpec for CLI/web rendering
    └── your-game.spec.ts # tests
```

**package.json:**

```json
{
  "name": "@dorkfun/game-yourgame",
  "version": "0.0.1",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "mocha --require ts-node/register --recursive --parallel './src/**/*.spec.ts'"
  },
  "dependencies": {
    "@dorkfun/core": "workspace:*",
    "@dorkfun/engine": "workspace:*"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.10",
    "@types/node": "^24.10.1",
    "mocha": "^11.7.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  }
}
```

**tsconfig.json:**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "target": "esnext",
    "module": "commonjs",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "./src",
    "strict": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Run `pnpm install` from the repo root to link workspace dependencies.

### Step 2: Implement the IGameModule interface

The GDS interface lives in `@dorkfun/engine` and requires metadata fields + 7 functions:

```typescript
import { GameConfig, GameState, Action, Outcome, Observation } from "@dorkfun/core";
import { IGameModule, GameUISpec } from "@dorkfun/engine";

export const YourGameModule: IGameModule = {
  // Metadata
  gameId: "yourgame",           // unique slug
  name: "Your Game",            // human-readable
  description: "A short description of your game.",
  minPlayers: 2,
  maxPlayers: 2,
  ui: YourGameUI,               // GameUISpec (see Step 4)

  // 7 functions — all must be deterministic
  init(config: GameConfig, players: string[], rngSeed: string): GameState { ... },
  validateAction(state: GameState, playerId: string, action: Action): boolean { ... },
  applyAction(state: GameState, playerId: string, action: Action, rng?: string): GameState { ... },
  isTerminal(state: GameState): boolean { ... },
  getOutcome(state: GameState): Outcome { ... },
  getObservation(state: GameState, playerId: string): Observation { ... },
  getLegalActions(state: GameState, playerId: string): Action[] { ... },
};
```

**Function requirements:**

| Function | Purpose | Key rules |
|----------|---------|-----------|
| `init` | Create the initial game state | Must set `currentPlayer` to the first player to move |
| `validateAction` | Check if an action is legal | Return `false` if it's not this player's turn or the move is invalid |
| `applyAction` | Apply a move and return new state | Must be **pure** — do not mutate the input state. Switch `currentPlayer` |
| `isTerminal` | Check if the game has ended | Return `true` for wins, draws, or any game-over condition |
| `getOutcome` | Get the result of a finished game | Only called when `isTerminal` is `true`. Set `winner`, `draw`, `scores`, and `reason` |
| `getObservation` | Get what a player can see | For hidden-info games, filter out opponents' private data |
| `getLegalActions` | List all valid moves for a player | Return `[]` if it's not this player's turn |

### Step 3: Core types

Your game works with these types from `@dorkfun/core`:

```typescript
interface GameState {
  gameId: string;
  players: string[];
  currentPlayer: string;
  turnNumber: number;
  data: Record<string, unknown>;  // your game-specific state lives here
}

interface Action {
  type: string;                    // e.g. "place", "move", "fold"
  data: Record<string, unknown>;   // e.g. { position: 4 }, { from: "e2", to: "e4" }
}

interface Outcome {
  winner: string | null;
  draw: boolean;
  scores: Record<string, number>;  // 1 = win, 0.5 = draw, 0 = loss
  reason: string;
}

interface Observation {
  gameId: string;
  players: string[];
  currentPlayer: string;
  turnNumber: number;
  publicData: Record<string, unknown>;
  privateData?: Record<string, unknown>;  // for hidden-info games
}
```

**Pattern** for typed game data:

```typescript
// Define your types
interface MyGameData { board: number[]; pieces: Map<string, string>; }

// Store as GameState.data
return { ...state, data: myData as unknown as Record<string, unknown> };

// Read back in other functions
const gameData = state.data as unknown as MyGameData;
```

### Step 4: Implement the UI spec

Each game exports a `GameUISpec` that the CLI and web app use for rendering:

```typescript
import { Action } from "@dorkfun/core";
import { GameUISpec } from "@dorkfun/engine";

export const YourGameUI: GameUISpec = {
  playerLabels: ["White", "Black"],
  pieces: {
    K: { symbol: "K", label: "King" },
    // ...
  },
  inputHint: "Enter your move (e.g. e2e4)",
  maxTurns: 200,

  renderBoard(publicData: Record<string, unknown>): string {
    // Return an ASCII representation of the board
  },

  renderStatus(publicData: Record<string, unknown>): string | null {
    // Return optional status text (e.g. "Check!") or null
  },

  parseInput(raw: string, publicData: Record<string, unknown>): Action | null {
    // Parse human input into an Action, or null if invalid
  },

  formatAction(action: Action): string {
    // Format an Action for display (e.g. "e2 → e4")
  },

  getPlayerLabel(playerId: string, publicData: Record<string, unknown>): string {
    // Return a display label for the player (e.g. "White", "X")
  },
};
```

### Step 5: Write tests

Test full game sequences, invalid moves, edge cases, and all terminal conditions:

```typescript
import { expect } from "chai";
import { YourGameModule } from "./rules";

describe("YourGame", () => {
  const config = { gameId: "yourgame", version: "1.0.0" };
  const players = ["alice", "bob"];

  it("should initialize correctly", () => {
    const state = YourGameModule.init(config, players, "seed");
    expect(state.currentPlayer).to.equal("alice");
    expect(YourGameModule.isTerminal(state)).to.be.false;
  });

  it("should reject invalid moves", () => {
    const state = YourGameModule.init(config, players, "seed");
    expect(YourGameModule.validateAction(state, "bob", someAction)).to.be.false;
  });

  it("should detect a win", () => {
    // Play through a winning sequence...
    expect(YourGameModule.isTerminal(finalState)).to.be.true;
    const outcome = YourGameModule.getOutcome(finalState);
    expect(outcome.winner).to.equal("alice");
  });

  it("should not mutate input state", () => {
    const state = YourGameModule.init(config, players, "seed");
    const snapshot = JSON.stringify(state);
    YourGameModule.applyAction(state, "alice", validAction);
    expect(JSON.stringify(state)).to.equal(snapshot);
  });

  it("should be deterministic", () => {
    const s1 = YourGameModule.init(config, players, "seed");
    const s2 = YourGameModule.init(config, players, "seed");
    expect(JSON.stringify(s1)).to.equal(JSON.stringify(s2));
  });
});
```

### Design guidelines

- **Determinism is critical.** Given the same inputs, every function must produce the same output. This enables transcript verification and on-chain dispute resolution
- **Never mutate input state.** Always create new objects in `applyAction`. Use spread operators or structured cloning
- **Store all game data in `GameState.data`.** The platform serializes this to JSON for persistence and hashing
- **Use `rngSeed` for randomness.** If your game needs randomness (e.g. shuffling a deck), derive it deterministically from the seed. Do not use `Math.random()`
- **Keep observations honest.** In hidden-information games (e.g. poker), `getObservation` must not expose another player's private data

---

## Registering Your Game

Once your game module is built and tested, wire it into the platform:

### 1. Server registration

Add the dependency to `apps/server/package.json`:

```json
"dependencies": {
  "@dorkfun/game-yourgame": "workspace:*"
}
```

Import and register in `apps/server/src/index.ts`:

```typescript
import { YourGameModule } from "@dorkfun/game-yourgame";

// In main():
gameRegistry.register(YourGameModule);
```

### 2. Web UI registration

Add the dependency to `packages/game-ui/package.json`:

```json
"dependencies": {
  "@dorkfun/game-yourgame": "workspace:*"
}
```

Import the UI spec in `packages/game-ui/src/index.ts`:

```typescript
import { YourGameUI } from "@dorkfun/game-yourgame";
```

### 3. Vite alias (for dev mode hot-reloading)

Add an alias in `apps/web/vite.config.ts`:

```typescript
"@dorkfun/game-yourgame": path.join(root, "packages/games/yourgame/src/index.ts"),
```

### 4. Dockerfiles

Add COPY directives for your game in both `apps/server/Dockerfile` and `apps/web/Dockerfile`. Follow the pattern used by existing games (tictactoe, chess).

### 5. Install and build

```bash
pnpm install
pnpm build
pnpm --filter=@dorkfun/game-yourgame test
```

That's it — the server automatically handles matchmaking, WebSocket gameplay, persistence, and settlement for your game.
