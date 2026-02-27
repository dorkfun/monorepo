import { ConfigData } from "./defaults.js";
import { resolveConfig } from "./resolve.js";

let _config: ConfigData | null = null;

export async function initConfig(): Promise<ConfigData> {
  _config = await resolveConfig();
  return _config;
}

export function getConfig(): ConfigData {
  if (!_config) {
    throw new Error(
      "Config not initialized. Call initConfig() before accessing config.",
    );
  }
  return _config;
}
