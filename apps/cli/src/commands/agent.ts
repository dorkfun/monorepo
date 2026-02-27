import { Command } from "commander";
import { parseEther, formatEther } from "ethers";
import { DorkAgent, Strategy, GameContext, Action, EscrowInfo } from "@dorkfun/agent-sdk";
import { initConfig, getConfig } from "../config/index.js";
import { getAddress, signMessage, sendEscrowDeposit } from "../wallet/signer.js";

function formatBoard(board: (string | null)[]): string {
  if (!board || board.length !== 9) return "";
  const rows: string[] = [];
  for (let r = 0; r < 3; r++) {
    rows.push(
      board
        .slice(r * 3, r * 3 + 3)
        .map((c) => c || ".")
        .join(" ")
    );
  }
  return rows.join(" | ");
}

function log(tag: string, message: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${ts} [${tag.padEnd(5)}] ${message}`);
}

class RandomStrategy implements Strategy {
  private delay: number;
  private gameId: string;

  constructor(gameId: string, delay: number) {
    this.delay = delay;
    this.gameId = gameId;
  }

  chooseAction(ctx: GameContext): Action {
    const idx = Math.floor(Math.random() * ctx.legalActions.length);
    return ctx.legalActions[idx];
  }

  onStateUpdate(ctx: GameContext): void {
    const pub = ctx.observation.publicData as Record<string, unknown>;
    const board = pub.board as (string | null)[] | undefined;
    const turnLabel = ctx.yourTurn ? "Your turn" : "Opponent's turn";

    if (board) {
      log("state", `Turn ${ctx.turnNumber} | ${turnLabel} | ${formatBoard(board)}`);
    } else {
      log("state", `Turn ${ctx.turnNumber} | ${turnLabel}`);
    }
  }
}

export function registerAgentCommand(program: Command): void {
  program
    .command("agent")
    .description("Play games headlessly with a built-in random agent")
    .option("-g, --game <gameId>", "Game to play", "tictactoe")
    .option("-n, --count <N>", "Number of games to play", "1")
    .option("--delay <ms>", "Delay between moves in ms", "0")
    .option("--stake <ETH>", "Stake amount in ETH (e.g. 0.01 for 0.01 ETH, 1 for 1 ETH)")
    .option("--private", "Create a private match")
    .option("--invite <code>", "Join a private match by invite code")
    .action(async (opts) => {
      await initConfig();

      const config = getConfig();
      const address = getAddress();
      const count = parseInt(opts.count, 10) || 1;
      const delay = parseInt(opts.delay, 10) || 0;

      // Convert ETH input to wei for the protocol
      let stakeWei: string | undefined;
      if (opts.stake) {
        try {
          stakeWei = parseEther(opts.stake).toString();
        } catch {
          log("error", `Invalid stake amount: "${opts.stake}". Use a decimal ETH value (e.g. 0.01, 1.5)`);
          process.exit(1);
        }
      }

      log("init", `Player: ${address}`);
      log("init", `Server: ${config.serverUrl}`);
      log("init", `Game: ${opts.game} | Count: ${count} | Delay: ${delay}ms`);
      if (stakeWei) {
        log("init", `Stake: ${opts.stake} ETH (${stakeWei} wei)`);
      }

      const agent = new DorkAgent({
        serverUrl: config.serverUrl,
        wsUrl: config.wsUrl,
        playerId: address,
        signMessage,
      });

      // Clean shutdown on Ctrl+C
      process.on("SIGINT", () => {
        log("exit", "Shutting down...");
        agent.close();
        process.exit(0);
      });

      let wins = 0;
      let losses = 0;
      let draws = 0;

      for (let i = 0; i < count; i++) {
        if (count > 1) {
          log("match", `--- Game ${i + 1} of ${count} ---`);
        }

        const strategy = new RandomStrategy(opts.game, delay);

        try {
          // Check for active match to reconnect to before starting a new one
          const reconnected = await agent.reconnect(strategy, {
            moveDelay: delay,
            onLog: log,
          });
          if (reconnected) {
            if (reconnected.draw) draws++;
            else if (reconnected.didWin) wins++;
            else losses++;
            continue;
          }

          // Build deposit handler for staked matches
          const depositHandler = stakeWei
            ? async (escrow: EscrowInfo) => {
                log("stake", `Depositing ${formatEther(escrow.stakeWei)} ETH to escrow ${escrow.address}...`);
                return sendEscrowDeposit(escrow);
              }
            : undefined;

          let result;
          if (opts.invite) {
            result = await agent.playPrivate(opts.game, strategy, {
              inviteCode: opts.invite,
              moveDelay: delay,
              onLog: log,
              stakeWei,
              sendDeposit: depositHandler,
            });
          } else if (opts.private) {
            result = await agent.playPrivate(opts.game, strategy, {
              moveDelay: delay,
              onLog: log,
              stakeWei,
              sendDeposit: depositHandler,
            });
          } else {
            result = await agent.play(opts.game, strategy, {
              moveDelay: delay,
              onLog: log,
              stakeWei,
              sendDeposit: depositHandler,
            });
          }

          if (result.draw) draws++;
          else if (result.didWin) wins++;
          else losses++;
        } catch (err: any) {
          log("error", err.message);
          break;
        }
      }

      if (count > 1) {
        log("done", `Results: ${wins}W / ${losses}L / ${draws}D (${count} games)`);
      }

      process.exit(0);
    });
}
