export interface ConfigData {
  serverUrl: string;
  wsUrl: string;
  privateKey: string;
  /** RPC URL for on-chain deposit transactions */
  rpcUrl: string;
}

export const CONFIG_KEYS: (keyof ConfigData)[] = [
  "serverUrl",
  "wsUrl",
  "privateKey",
  "rpcUrl",
];

export const DEFAULTS: ConfigData = {
  serverUrl: "https://engine.dork.fun",
  wsUrl: "wss://engine.dork.fun",
  privateKey: "",
  rpcUrl: "https://eth.llamarpc.com",
};

export const ENV_MAP: Record<keyof ConfigData, string> = {
  serverUrl: "SERVER_URL",
  wsUrl: "SERVER_WS_URL",
  privateKey: "PRIVATE_KEY",
  rpcUrl: "RPC_URL",
};
