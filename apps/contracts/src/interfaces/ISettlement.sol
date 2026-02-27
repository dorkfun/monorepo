// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface ISettlement {
    enum SettlementStatus {
        None,
        Proposed,
        Finalized,
        Disputed
    }

    struct SettlementProposal {
        bytes32 matchId;
        address proposedWinner;
        bytes32 transcriptHash;
        address proposedBy;
        uint256 proposedAt;
        uint256 disputeDeadline;
        SettlementStatus status;
    }

    event SettlementProposed(
        bytes32 indexed matchId, address indexed proposedWinner, bytes32 transcriptHash, uint256 disputeDeadline
    );
    event SettlementFinalized(bytes32 indexed matchId, address indexed winner);
    event SettlementDisputed(bytes32 indexed matchId, address indexed disputedBy);
    event MatchCreated(bytes32 indexed matchId, bytes32 indexed gameId);
    event ServerUpdated(address oldServer, address newServer);
    event DisputeResolutionUpdated(address oldAddress, address newAddress);
    event DisputeWindowUpdated(uint256 oldWindow, uint256 newWindow);

    function createMatch(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer) external;
    function proposeSettlement(bytes32 matchId, address winner, bytes32 transcriptHash) external;
    function finalizeSettlement(bytes32 matchId) external;
    function getProposal(bytes32 matchId) external view returns (SettlementProposal memory);
}
