import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { ConfigData } from "./defaults.js";

const CONFIG_DIR = join(homedir(), ".dork");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export async function readConfigFile(): Promise<Partial<ConfigData>> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Partial<ConfigData>;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {};
    }
    if (err instanceof SyntaxError) {
      console.error(
        `Warning: ${CONFIG_PATH} is malformed and was ignored. ` +
          `Run "dork config" to recreate it.`,
      );
      return {};
    }
    throw err;
  }
}

export async function writeConfigFile(
  data: Partial<ConfigData>,
): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function updateConfigFile(
  key: keyof ConfigData,
  value: string,
): Promise<Partial<ConfigData>> {
  const existing = await readConfigFile();
  existing[key] = value;
  await writeConfigFile(existing);
  return existing;
}
