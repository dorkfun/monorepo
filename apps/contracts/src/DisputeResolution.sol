// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IDisputeResolution} from "./interfaces/IDisputeResolution.sol";

interface ISettlementCallback {
    function onDisputeResolved(bytes32 matchId, bool proposalValid) external;
}

contract DisputeResolution is IDisputeResolution, Ownable2Step {
    error NotSettlement();
    error ZeroAddress();
    error DisputeAlreadyExists(bytes32 matchId);
    error ZeroHash();
    error DisputeNotOpen(bytes32 matchId);
    error NotResolver();
    error ReviewPeriodNotMet(bytes32 matchId, uint256 earliest);

    address public settlementContract;
    address public resolver;

    uint256 public constant MIN_REVIEW_PERIOD = 1 hours;

    mapping(bytes32 => Dispute) private _disputes;

    modifier onlySettlement() {
        if (msg.sender != settlementContract) revert NotSettlement();
        _;
    }

    constructor(address _settlement, address _resolver) Ownable(msg.sender) {
        if (_settlement == address(0)) revert ZeroAddress();
        if (_resolver == address(0)) revert ZeroAddress();
        settlementContract = _settlement;
        resolver = _resolver;
    }

    function setSettlementContract(address _settlement) external onlyOwner {
        if (_settlement == address(0)) revert ZeroAddress();
        address oldSettlement = settlementContract;
        settlementContract = _settlement;
        emit SettlementContractUpdated(oldSettlement, _settlement);
    }

    function setResolver(address _resolver) external onlyOwner {
        if (_resolver == address(0)) revert ZeroAddress();
        address oldResolver = resolver;
        resolver = _resolver;
        emit ResolverUpdated(oldResolver, _resolver);
    }

    /// @notice Opens a dispute for a match. Called by Settlement contract.
    function openDispute(
        bytes32 matchId,
        address challenger,
        bytes32 proposalTranscriptHash,
        bytes32 challengerTranscriptHash
    ) external onlySettlement {
        if (_disputes[matchId].openedAt != 0) revert DisputeAlreadyExists(matchId);
        if (challengerTranscriptHash == bytes32(0)) revert ZeroHash();

        _disputes[matchId] = Dispute({
            matchId: matchId,
            challenger: challenger,
            proposalTranscriptHash: proposalTranscriptHash,
            challengerTranscriptHash: challengerTranscriptHash,
            openedAt: block.timestamp,
            status: DisputeStatus.Open
        });

        emit DisputeOpened(matchId, challenger, challengerTranscriptHash);
    }

    /// @notice Resolves a dispute. Only callable by the authorized resolver after
    ///         the minimum review period has elapsed.
    /// @param matchId The match to resolve
    /// @param proposalValid Whether the original settlement proposal was valid
    function resolveDispute(bytes32 matchId, bool proposalValid) external {
        if (msg.sender != resolver) revert NotResolver();

        Dispute storage dispute = _disputes[matchId];
        if (dispute.status != DisputeStatus.Open) revert DisputeNotOpen(matchId);

        // H-5: Enforce minimum review period
        uint256 earliest = dispute.openedAt + MIN_REVIEW_PERIOD;
        if (block.timestamp < earliest) revert ReviewPeriodNotMet(matchId, earliest);

        if (proposalValid) {
            dispute.status = DisputeStatus.ResolvedValid;
        } else {
            dispute.status = DisputeStatus.ResolvedInvalid;
        }

        emit DisputeResolved(matchId, dispute.status);

        // Callback to settlement to finalize based on dispute outcome
        ISettlementCallback(settlementContract).onDisputeResolved(matchId, proposalValid);
    }

    function getDispute(bytes32 matchId) external view returns (Dispute memory) {
        return _disputes[matchId];
    }
}
