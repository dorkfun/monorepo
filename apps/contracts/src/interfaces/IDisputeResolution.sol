// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

interface IDisputeResolution {
    enum DisputeStatus {
        None,
        Open,
        ResolvedValid,
        ResolvedInvalid
    }

    struct Dispute {
        bytes32 matchId;
        address challenger;
        bytes32 proposalTranscriptHash;
        bytes32 challengerTranscriptHash;
        uint256 openedAt;
        DisputeStatus status;
    }

    event DisputeOpened(bytes32 indexed matchId, address indexed challenger, bytes32 challengerTranscriptHash);
    event DisputeResolved(bytes32 indexed matchId, DisputeStatus resolution);
    event ResolverUpdated(address oldResolver, address newResolver);
    event SettlementContractUpdated(address oldAddress, address newAddress);

    function openDispute(
        bytes32 matchId,
        address challenger,
        bytes32 proposalTranscriptHash,
        bytes32 challengerTranscriptHash
    ) external;
    function resolveDispute(bytes32 matchId, bool proposalValid) external;
    function getDispute(bytes32 matchId) external view returns (Dispute memory);
}
