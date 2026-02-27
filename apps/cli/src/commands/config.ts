import { Command } from "commander";
import { createInterface, Interface as RLInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import {
  resolveConfig,
  readConfigFile,
  updateConfigFile,
  writeConfigFile,
  getConfigPath,
  CONFIG_KEYS,
  DEFAULTS,
  ENV_MAP,
  ConfigData,
} from "../config/index.js";

function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.once("close", () => {
    closed = true;
  });

  return {
    ask(prompt: string): Promise<string> {
      if (closed) return Promise.resolve("");
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => resolve(answer));
        rl.once("close", () => resolve(""));
      });
    },
    close() {
      if (!closed) rl.close();
    },
  };
}

export function registerConfigCommand(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Manage CLI configuration (~/.dork/config.json)");

  configCmd.action(async () => {
    await runWizard();
  });

  configCmd
    .command("set <key> <value>")
    .description("Set a config value")
    .action(async (key: string, value: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`,
        );
        process.exit(1);
      }
      await updateConfigFile(key as keyof ConfigData, value);
      const display = key === "privateKey" ? maskKey(value) : value;
      console.log(`Set ${key} = ${display}`);
    });

  configCmd
    .command("get <key>")
    .description("Get a config value")
    .action(async (key: string) => {
      if (!isValidKey(key)) {
        console.error(
          `Unknown config key: "${key}". Valid keys: ${CONFIG_KEYS.join(", ")}`,
        );
        process.exit(1);
      }
      const resolved = await resolveConfig();
      console.log(resolved[key as keyof ConfigData]);
    });

  configCmd
    .command("list")
    .description("List all config values with sources")
    .action(async () => {
      await printConfigList();
    });
}

export async function runWizard(): Promise<void> {
  const existing = await readConfigFile();
  const prompter = createPrompter();

  console.log("\nDork CLI Configuration");
  console.log("──────────────────────\n");

  try {
    const serverUrl = await prompter.ask(
      `Server URL [${existing.serverUrl || DEFAULTS.serverUrl}]: `,
    );
    const wsUrl = await prompter.ask(
      `WebSocket URL [${existing.wsUrl || DEFAULTS.wsUrl}]: `,
    );
    const privateKeyInput = await prompter.ask(
      `Private key [enter to generate new]: `,
    );

    const data: Partial<ConfigData> = {
      ...existing,
      serverUrl: serverUrl.trim() || existing.serverUrl || DEFAULTS.serverUrl,
      wsUrl: wsUrl.trim() || existing.wsUrl || DEFAULTS.wsUrl,
    };

    if (privateKeyInput.trim()) {
      data.privateKey = privateKeyInput.trim();
    } else if (!existing.privateKey) {
      data.privateKey = "0x" + randomBytes(32).toString("hex");
      console.log(`\nGenerated new private key: ${maskKey(data.privateKey)}`);
    }

    await writeConfigFile(data);
    console.log(`\nConfig saved to ${getConfigPath()}\n`);

    const resolved = await resolveConfig();
    for (const key of CONFIG_KEYS) {
      const value =
        key === "privateKey" ? maskKey(resolved[key]) : resolved[key];
      console.log(`  ${key}: ${value}`);
    }
    console.log("");
  } finally {
    prompter.close();
  }
}

async function printConfigList(): Promise<void> {
  const resolved = await resolveConfig();
  const fileData = await readConfigFile();

  console.log(`\nConfig file: ${getConfigPath()}`);
  console.log("──────────────────────────────────────");

  for (const key of CONFIG_KEYS) {
    const value =
      key === "privateKey" ? maskKey(resolved[key]) : resolved[key];
    const source = getSource(key, fileData);
    console.log(`  ${key}: ${value}  (${source})`);
  }
  console.log("");
}

function isValidKey(key: string): key is keyof ConfigData {
  return CONFIG_KEYS.includes(key as keyof ConfigData);
}

function maskKey(key: string): string {
  if (!key || key.length < 10) return key ? "****" : "(not set)";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

function getSource(
  key: keyof ConfigData,
  fileData: Partial<ConfigData>,
): string {
  const envVal = process.env[ENV_MAP[key]];
  if (envVal !== undefined && envVal !== "") return `env: ${ENV_MAP[key]}`;
  if (fileData[key] !== undefined && fileData[key] !== "") return "config file";
  return "default";
}
