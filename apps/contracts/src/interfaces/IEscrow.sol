// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IEscrow {
    enum MatchEscrowStatus {
        None,
        Funded,
        Settled,
        Refunded,
        Disputed
    }

    struct MatchEscrow {
        bytes32 matchId;
        bytes32 gameId;
        address[] players;
        uint256 stakePerPlayer;
        uint256 totalStake;
        MatchEscrowStatus status;
        uint256 createdAt;
        uint256 fundingDeadline;
    }

    event EscrowCreated(bytes32 indexed matchId, bytes32 indexed gameId, uint256 stakePerPlayer, uint256 playerCount);
    event StakeDeposited(bytes32 indexed matchId, address indexed player, uint256 amount);
    event EscrowFullyFunded(bytes32 indexed matchId);
    event EscrowSettled(bytes32 indexed matchId, address indexed winner, uint256 payout);
    event EscrowRefunded(bytes32 indexed matchId);
    event EscrowDisputed(bytes32 indexed matchId);
    event FeeCollected(bytes32 indexed matchId, address indexed treasury, uint256 amount);
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);
    event PayoutCredited(bytes32 indexed matchId, address indexed recipient, uint256 amount);
    event PayoutClaimed(address indexed recipient, uint256 amount);
    event EmergencyWithdrawal(bytes32 indexed matchId, address indexed depositor, uint256 amount);
    event SettlementContractUpdated(address oldAddress, address newAddress);
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps, address oldTreasury, address newTreasury);
    event TreasuryFeeAccumulated(bytes32 indexed matchId, uint256 amount);

    function createEscrow(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer) external;
    function depositStake(bytes32 matchId) external payable;
    function claimPayout() external;
    function emergencyWithdraw(bytes32 matchId) external;
    function claimTreasuryFees() external;
    function getEscrow(bytes32 matchId) external view returns (MatchEscrow memory);
    function isFullyFunded(bytes32 matchId) external view returns (bool);
    function pendingWithdrawal(address account) external view returns (uint256);
}
