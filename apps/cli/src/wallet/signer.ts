import { Wallet, JsonRpcProvider, Contract } from "ethers";
import { getConfig } from "../config/runtime.js";

const ESCROW_ABI = [
  "function depositStake(bytes32 matchId) external payable",
];

let wallet: Wallet | null = null;

export function getWallet(): Wallet {
  if (!wallet) {
    const { privateKey } = getConfig();
    if (!privateKey) {
      throw new Error(
        "Private key not set. Run 'dork config' to set one up.",
      );
    }
    wallet = new Wallet(privateKey);
  }
  return wallet;
}

export function getAddress(): string {
  return getWallet().address;
}

export async function signMessage(message: string): Promise<string> {
  return getWallet().signMessage(message);
}

/**
 * Submit an escrow deposit transaction on-chain.
 * Returns the transaction hash.
 */
export async function sendEscrowDeposit(escrow: {
  address: string;
  stakeWei: string;
  matchIdBytes32: string;
}): Promise<string> {
  const { rpcUrl, privateKey } = getConfig();
  if (!privateKey) {
    throw new Error("Private key not set. Run 'dork config' to set one up.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const contract = new Contract(escrow.address, ESCROW_ABI, signer);

  const tx = await contract.depositStake(escrow.matchIdBytes32, {
    value: escrow.stakeWei,
  });
  const receipt = await tx.wait();
  return receipt.hash as string;
}
