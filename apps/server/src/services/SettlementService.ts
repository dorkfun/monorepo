import { ethers } from "ethers";
import { hashState } from "@dorkfun/core";
import log from "../logger";

const SETTLEMENT_ABI = [
  "function createMatch(bytes32 matchId, bytes32 gameId, address[] players, uint256 stakePerPlayer) external",
  "function cancelMatch(bytes32 matchId) external",
  "function proposeSettlement(bytes32 matchId, address winner, bytes32 transcriptHash) external",
  "function finalizeSettlement(bytes32 matchId) external",
  "function getProposal(bytes32 matchId) external view returns (tuple(bytes32 matchId, address proposedWinner, bytes32 transcriptHash, address proposedBy, uint256 proposedAt, uint256 disputeDeadline, uint8 status))",
  "event MatchCreated(bytes32 indexed matchId, bytes32 indexed gameId)",
  "event SettlementProposed(bytes32 indexed matchId, address indexed proposedWinner, bytes32 transcriptHash, uint256 disputeDeadline)",
  "event SettlementFinalized(bytes32 indexed matchId, address indexed winner)",
];

const ESCROW_ABI = [
  "function depositStake(bytes32 matchId) external payable",
  "function getEscrow(bytes32 matchId) external view returns (tuple(bytes32 matchId, bytes32 gameId, address[] players, uint256 stakePerPlayer, uint256 totalStake, uint8 status, uint256 createdAt))",
  "function isFullyFunded(bytes32 matchId) external view returns (bool)",
  "function feeBps() external view returns (uint16)",
  "function treasury() external view returns (address)",
  "function minimumStake() external view returns (uint256)",
  "event EscrowCreated(bytes32 indexed matchId, bytes32 indexed gameId, uint256 stakePerPlayer, uint256 playerCount)",
  "event EscrowFullyFunded(bytes32 indexed matchId)",
  "event FeeCollected(bytes32 indexed matchId, address indexed treasury, uint256 amount)",
];

export interface SettlementConfig {
  rpcUrl: string;
  privateKey: string;
  settlementAddress: string;
  escrowAddress: string;
  gameOnchainIds: Record<string, string>;
}

/**
 * Bridges the off-chain server to on-chain settlement contracts.
 * Proposes settlement after match completion and finalizes after dispute window.
 */
export class SettlementService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private settlement: ethers.Contract;
  private escrow: ethers.Contract;
  private pendingFinalizations = new Map<string, ReturnType<typeof setTimeout>>();
  private gameOnchainIds: Record<string, string>;
  readonly escrowAddress: string;

  constructor(private config: SettlementConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.settlement = new ethers.Contract(
      config.settlementAddress,
      SETTLEMENT_ABI,
      this.wallet
    );
    this.escrow = new ethers.Contract(
      config.escrowAddress,
      ESCROW_ABI,
      this.wallet
    );
    this.escrowAddress = config.escrowAddress;
    this.gameOnchainIds = config.gameOnchainIds;

    log.info(
      { address: this.wallet.address, settlement: config.settlementAddress, escrow: config.escrowAddress },
      "SettlementService initialized"
    );
  }

  /**
   * Resolve a server-side game ID (e.g. "chess") to its on-chain bytes32.
   * Returns null if the game has no on-chain registration (e.g. single-player games).
   */
  getGameIdBytes32(gameId: string): string | null {
    return this.gameOnchainIds[gameId] ?? null;
  }

  /**
   * Called after a match completes. Proposes on-chain settlement.
   * matchId should be a UUID string — we convert to bytes32.
   */
  async proposeSettlement(
    matchId: string,
    winner: string | null,
    transcript: unknown[]
  ): Promise<string | null> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);
      const transcriptHash = hashState({ entries: transcript, matchId });
      const winnerAddress = winner || ethers.ZeroAddress;

      log.info({ matchId, winner: winnerAddress }, "Proposing on-chain settlement");

      const tx = await this.settlement.proposeSettlement(
        matchIdBytes32,
        winnerAddress,
        ethers.id(transcriptHash)
      );
      const receipt = await tx.wait();

      log.info(
        { matchId, txHash: receipt.hash, blockNumber: receipt.blockNumber },
        "Settlement proposed on-chain"
      );

      return receipt.hash as string;
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to propose settlement");
      return null;
    }
  }

  /**
   * Finalize a settlement after the dispute window has passed.
   */
  async finalizeSettlement(matchId: string): Promise<string | null> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);

      log.info({ matchId }, "Finalizing on-chain settlement");

      const tx = await this.settlement.finalizeSettlement(matchIdBytes32);
      const receipt = await tx.wait();

      log.info(
        { matchId, txHash: receipt.hash },
        "Settlement finalized on-chain"
      );

      return receipt.hash as string;
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to finalize settlement");
      return null;
    }
  }

  /**
   * Cancel an on-chain match and trigger escrow refunds for depositors.
   * Called when deposits time out or a staked match is cleaned up.
   */
  async cancelMatch(matchId: string): Promise<string | null> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);

      log.info({ matchId }, "Cancelling on-chain match (triggering refund)");

      const tx = await this.settlement.cancelMatch(matchIdBytes32);
      const receipt = await tx.wait();

      log.info(
        { matchId, txHash: receipt.hash },
        "On-chain match cancelled, refunds triggered"
      );

      return receipt.hash as string;
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to cancel on-chain match");
      return null;
    }
  }

  /**
   * Schedule automatic finalization after the dispute window.
   */
  scheduleFinalization(matchId: string, delayMs: number): void {
    const timer = setTimeout(async () => {
      this.pendingFinalizations.delete(matchId);
      await this.finalizeSettlement(matchId);
    }, delayMs);
    this.pendingFinalizations.set(matchId, timer);
    log.info({ matchId, delayMs }, "Scheduled settlement finalization");
  }

  /**
   * Get the on-chain proposal status for a match.
   */
  async getProposal(matchId: string): Promise<unknown | null> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);
      return await this.settlement.getProposal(matchIdBytes32);
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to get proposal");
      return null;
    }
  }

  // --- On-chain match + escrow operations ---

  /**
   * Create a match on-chain via Settlement.createMatch().
   * This atomically registers players AND creates the escrow.
   */
  async createMatch(
    matchId: string,
    gameIdBytes32: string,
    players: string[],
    stakePerPlayer: string
  ): Promise<string | null> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);

      log.info(
        { matchId, gameIdBytes32, players, stakePerPlayer },
        "Creating on-chain match (players + escrow)"
      );

      const tx = await this.settlement.createMatch(
        matchIdBytes32,
        gameIdBytes32,
        players,
        stakePerPlayer
      );
      const receipt = await tx.wait();

      log.info(
        { matchId, txHash: receipt.hash },
        "On-chain match created"
      );

      return receipt.hash as string;
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to create on-chain match");
      return null;
    }
  }

  /**
   * Check if the escrow for a match is fully funded (all players deposited).
   */
  async isFullyFunded(matchId: string): Promise<boolean> {
    try {
      const matchIdBytes32 = uuidToBytes32(matchId);
      return await this.escrow.isFullyFunded(matchIdBytes32);
    } catch (err: any) {
      log.error({ matchId, err: err.message }, "Failed to check escrow funding");
      return false;
    }
  }

  /**
   * Read the global minimum stake from the Escrow contract.
   * Returns "0" if no minimum is set or on error.
   */
  async getMinimumStake(): Promise<string> {
    try {
      const min: bigint = await this.escrow.minimumStake();
      return min.toString();
    } catch (err: any) {
      log.error({ err: err.message }, "Failed to read minimumStake from escrow");
      return "0";
    }
  }

  /**
   * Get the bytes32-encoded match ID for a UUID (used by clients for deposit calls).
   */
  static matchIdToBytes32(matchId: string): string {
    return uuidToBytes32(matchId);
  }

  /**
   * On server startup, check completed staked matches and reconcile on-chain state.
   * - Proposed but not finalized: finalize immediately (if deadline passed) or re-schedule
   * - Already finalized: skip
   * Returns the number of matches that needed action.
   */
  async reconcileOnStartup(
    completedStakedMatches: { id: string; settlement_tx_hash: string | null }[]
  ): Promise<number> {
    let reconciled = 0;

    for (const match of completedStakedMatches) {
      if (!match.settlement_tx_hash) continue; // Un-proposed — handled by MatchService

      try {
        const matchIdBytes32 = uuidToBytes32(match.id);
        const proposal = await this.settlement.getProposal(matchIdBytes32);
        const status = Number(proposal.status); // 0=None, 1=Proposed, 2=Finalized, 3=Disputed

        if (status === 1) {
          // Proposed but not finalized
          const deadline = Number(proposal.disputeDeadline);
          const now = Math.floor(Date.now() / 1000);

          if (now >= deadline) {
            log.info({ matchId: match.id }, "Reconcile: finalizing stale settlement proposal");
            await this.finalizeSettlement(match.id);
            reconciled++;
          } else {
            const remainingMs = (deadline - now) * 1000 + 5000; // +5s buffer for block timestamps
            log.info({ matchId: match.id, remainingMs }, "Reconcile: re-scheduling settlement finalization");
            this.scheduleFinalization(match.id, remainingMs);
            reconciled++;
          }
        } else if (status === 2) {
          log.debug({ matchId: match.id }, "Reconcile: settlement already finalized");
        } else if (status === 3) {
          log.warn({ matchId: match.id }, "Reconcile: settlement is disputed — requires manual intervention");
        }
      } catch (err: any) {
        log.error({ matchId: match.id, err: err.message }, "Reconcile: failed to check settlement status");
      }
    }

    if (reconciled > 0) {
      log.info({ reconciled }, "Settlement reconciliation complete");
    }
    return reconciled;
  }

  shutdown(): void {
    for (const timer of this.pendingFinalizations.values()) {
      clearTimeout(timer);
    }
    this.pendingFinalizations.clear();
  }
}

/**
 * Convert a UUID string to a bytes32 hex string.
 * Strips dashes and left-pads to 32 bytes.
 */
function uuidToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  return "0x" + hex.padStart(64, "0");
}
