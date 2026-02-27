import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { program } from "commander";
import { parseEther } from "ethers";
import { formatAddress } from "@dorkfun/core";
import React from "react";
import { render } from "ink";
import { App } from "./tui/App.js";
import { getAddress } from "./wallet/signer.js";
import * as api from "./transport/httpClient.js";
import { initConfig, getConfig, setCliOverride } from "./config/index.js";
import { registerConfigCommand } from "./commands/config.js";
import { runWizard } from "./commands/config.js";
import { registerAgentCommand } from "./commands/agent.js";

program
  .name("dork")
  .description("dork.fun - Play games with AI agents and humans")
  .version("0.1.0", "-v, --version");

registerConfigCommand(program);
registerAgentCommand(program);

program
  .command("play")
  .description("Connect to the server and play a game")
  .option("-g, --game <gameId>", "Game to play", "tictactoe")
  .option("-k, --key <privateKey>", "Ethereum private key")
  .option("--stake <ETH>", "Stake amount in ETH (e.g. 0.01 for 0.01 ETH, 1 for 1 ETH)")
  .action(async (opts) => {
    if (opts.key) {
      setCliOverride("privateKey", opts.key);
    }

    let config = await initConfig();

    // Auto-run setup wizard if no private key is configured
    if (!config.privateKey) {
      console.log("No private key configured. Let's set things up.\n");
      await runWizard();
      config = await initConfig();
    }

    // Convert ETH input to wei for the protocol
    let stakeWei: string | undefined;
    if (opts.stake) {
      try {
        stakeWei = parseEther(opts.stake).toString();
      } catch {
        console.error(`Invalid stake amount: "${opts.stake}". Use a decimal ETH value (e.g. 0.01, 1.5)`);
        process.exit(1);
      }
    }

    try {
      const address = getAddress();
      console.log(`Connected as ${address}`);
      console.log(`Server: ${config.serverUrl}`);
      if (stakeWei) {
        console.log(`Stake: ${opts.stake} ETH`);
      }
      console.log("");

      render(React.createElement(App, { playerId: address, stakeWei }));
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("games")
  .description("List available games")
  .action(async () => {
    await initConfig();
    try {
      const result = await api.listGames();
      console.log("\nAvailable Games:");
      console.log("────────────────");
      for (const game of result.games) {
        console.log(`  ${game.name} (${game.id})`);
        console.log(`    ${game.description}`);
        console.log(`    Players: ${game.minPlayers}-${game.maxPlayers}`);
        console.log("");
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

program
  .command("matches")
  .description("List active matches")
  .action(async () => {
    await initConfig();
    try {
      const result = await api.listMatches();
      console.log("\nActive Matches:");
      console.log("───────────────");
      if (result.matches.length === 0) {
        console.log("  No active matches");
      }
      const pn = result.matches[0]?.playerNames || {};
      for (const match of result.matches) {
        console.log(`  ${match.matchId.slice(0, 8)}  ${match.gameId}  ${match.status}`);
        console.log(`    Players: ${match.players.map((p: string) => formatAddress(p, pn[p], "medium")).join(", ")}`);
        console.log("");
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

program
  .command("queue")
  .description("Show players waiting in game queues")
  .action(async () => {
    await initConfig();
    try {
      const result = await api.listQueues();
      console.log("\nQueue Status:");
      console.log("─────────────");
      let totalWaiting = 0;
      for (const q of result.queues) {
        const count = q.entries.length;
        totalWaiting += count;
        console.log(`  ${q.gameName} (${q.gameId}): ${count} waiting`);
        const qn = result.playerNames || {};
        for (const entry of q.entries) {
          const name = qn[entry.playerId] || entry.displayName;
          console.log(`    - ${name} (${entry.playerId.slice(0, 10)}...)`);
        }
        if (count === 0) {
          console.log("    (empty)");
        }
        console.log("");
      }
      if (totalWaiting === 0) {
        console.log("  No players waiting in any queue");
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

program
  .command("archive")
  .description("List completed/archived matches")
  .option("-g, --game <gameId>", "Filter by game")
  .option("-l, --limit <count>", "Number of matches to show", "20")
  .action(async (opts) => {
    await initConfig();
    try {
      const limit = parseInt(opts.limit) || 20;
      const result = await api.listArchive(opts.game, limit, 0);
      console.log("\nMatch Archive:");
      console.log("──────────────");
      if (result.matches.length === 0) {
        console.log("  No archived matches found");
      }
      const archiveNames = result.playerNames || {};
      for (const match of result.matches) {
        const outcome = match.winner
          ? `Winner: ${formatAddress(match.winner, archiveNames[match.winner], "medium")}`
          : "Draw";
        const date = match.completedAt
          ? new Date(match.completedAt).toLocaleString()
          : "-";
        console.log(`  ${match.matchId.slice(0, 8)}  ${match.gameId}  ${match.status}`);
        console.log(`    Players: ${match.players.map((p: string) => formatAddress(p, archiveNames[p], "medium")).join(" vs ")}`);
        console.log(`    Outcome: ${outcome}`);
        console.log(`    Ended:   ${date}`);
        console.log("");
      }
      console.log(`  Showing ${result.matches.length} of ${result.total} total`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

program
  .command("watch")
  .description("Watch a live or archived game")
  .argument("[matchId]", "Match ID to watch")
  .action(async (matchId?: string) => {
    await initConfig();
    if (!matchId) {
      const result = await api.listMatches();
      if (result.matches.length === 0) {
        console.log("No active matches to watch");
        return;
      }
      console.log("\nActive matches:");
      for (const match of result.matches) {
        console.log(`  ${match.matchId}  (${match.gameId})`);
      }
      return;
    }

    try {
      const match = await api.getMatch(matchId);
      console.log(`\nWatching: ${match.matchId}`);
      console.log(`Game: ${match.gameId}`);
      console.log(`Status: ${match.status}`);
      const watchNames = match.playerNames || {};
      console.log(`Players: ${match.players.map((p: string) => formatAddress(p, watchNames[p], "medium")).join(" vs ")}`);
      if (match.observation) {
        const board = (match.observation.publicData as any)?.board;
        if (board) {
          console.log("\nBoard:");
          for (let r = 0; r < 3; r++) {
            const row = board.slice(r * 3, r * 3 + 3).map((c: string) => c || ".").join(" | ");
            console.log(`  ${row}`);
            if (r < 2) console.log("  ──┼───┼──");
          }
        }
      }
      if (["completed", "settled", "disputed"].includes(match.status)) {
        const outcome = match.winner
          ? `Winner: ${formatAddress(match.winner, watchNames[match.winner], "medium")}`
          : "Draw";
        console.log(`\nResult: ${outcome}`);
        if (match.completedAt) {
          console.log(`Ended: ${new Date(match.completedAt).toLocaleString()}`);
        }
        if (match.transcript) {
          console.log(`Moves: ${match.transcript.length}`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
    }
  });

program.parse();
