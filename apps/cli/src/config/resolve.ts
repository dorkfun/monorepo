import { ConfigData, DEFAULTS, ENV_MAP, CONFIG_KEYS } from "./defaults.js";
import { readConfigFile } from "./configFile.js";

const cliOverrides: Partial<ConfigData> = {};

export function setCliOverride<K extends keyof ConfigData>(
  key: K,
  value: ConfigData[K],
): void {
  cliOverrides[key] = value;
}

export async function resolveConfig(): Promise<ConfigData> {
  const fileConfig = await readConfigFile();
  const resolved: ConfigData = { ...DEFAULTS };

  for (const key of CONFIG_KEYS) {
    if (fileConfig[key] !== undefined && fileConfig[key] !== "") {
      resolved[key] = fileConfig[key]!;
    }

    const envVal = process.env[ENV_MAP[key]];
    if (envVal !== undefined && envVal !== "") {
      resolved[key] = envVal;
    }

    if (cliOverrides[key] !== undefined && cliOverrides[key] !== "") {
      resolved[key] = cliOverrides[key]!;
    }
  }

  return resolved;
}
