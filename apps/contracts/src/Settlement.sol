// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {IDisputeResolution} from "./interfaces/IDisputeResolution.sol";

interface IEscrowSettlement {
    function createEscrow(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer) external;
    function settleToWinner(bytes32 matchId, address winner) external;
    function settleDraw(bytes32 matchId) external;
    function markDisputed(bytes32 matchId) external;
    function refund(bytes32 matchId) external;
}

contract Settlement is ISettlement, Ownable2Step {
    error NotServer();
    error ZeroAddress();
    error AlreadyProposed(bytes32 matchId);
    error ZeroTranscriptHash();
    error WinnerNotAPlayer(address winner);
    error NotProposed(bytes32 matchId);
    error DisputeWindowOpen(bytes32 matchId, uint256 deadline);
    error DisputeWindowClosed(bytes32 matchId);
    error NotAPlayer(address caller);
    error CannotDisputeOwnProposal();
    error NotDisputeContract();
    error NotDisputed(bytes32 matchId);
    error PlayersAlreadyRegistered(bytes32 matchId);
    error DisputeWindowTooShort(uint256 provided, uint256 minimum);

    uint256 public constant MIN_DISPUTE_WINDOW = 5 minutes;

    address public server;
    IEscrowSettlement public escrow;
    IDisputeResolution public disputeResolution;
    uint256 public disputeWindow;

    mapping(bytes32 => SettlementProposal) private _proposals;
    mapping(bytes32 => mapping(address => bool)) private _isMatchPlayer;
    mapping(bytes32 => address[]) private _matchPlayers;

    modifier onlyServer() {
        if (msg.sender != server) revert NotServer();
        _;
    }

    constructor(address _escrow, uint256 _disputeWindow, address _server) Ownable(msg.sender) {
        if (_escrow == address(0)) revert ZeroAddress();
        if (_server == address(0)) revert ZeroAddress();
        if (_disputeWindow < MIN_DISPUTE_WINDOW) revert DisputeWindowTooShort(_disputeWindow, MIN_DISPUTE_WINDOW);
        escrow = IEscrowSettlement(_escrow);
        disputeWindow = _disputeWindow;
        server = _server;
    }

    function setServer(address _server) external onlyOwner {
        if (_server == address(0)) revert ZeroAddress();
        address oldServer = server;
        server = _server;
        emit ServerUpdated(oldServer, _server);
    }

    function setDisputeResolution(address _disputeResolution) external onlyOwner {
        if (_disputeResolution == address(0)) revert ZeroAddress();
        address oldAddr = address(disputeResolution);
        disputeResolution = IDisputeResolution(_disputeResolution);
        emit DisputeResolutionUpdated(oldAddr, _disputeResolution);
    }

    function setDisputeWindow(uint256 _disputeWindow) external onlyOwner {
        if (_disputeWindow < MIN_DISPUTE_WINDOW) revert DisputeWindowTooShort(_disputeWindow, MIN_DISPUTE_WINDOW);
        uint256 oldWindow = disputeWindow;
        disputeWindow = _disputeWindow;
        emit DisputeWindowUpdated(oldWindow, _disputeWindow);
    }

    /// @notice Creates a match by atomically registering players and creating the escrow.
    function createMatch(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer)
        external
        onlyServer
    {
        if (_matchPlayers[matchId].length != 0) revert PlayersAlreadyRegistered(matchId);

        for (uint256 i = 0; i < players.length; i++) {
            _isMatchPlayer[matchId][players[i]] = true;
        }
        _matchPlayers[matchId] = players;

        // H-1/M-1: Create escrow atomically with player registration
        escrow.createEscrow(matchId, gameId, players, stakePerPlayer);

        emit MatchCreated(matchId, gameId);
    }

    function registerMatchPlayers(bytes32 matchId, address[] calldata players) external onlyServer {
        // M-2: Prevent overwriting existing player registrations
        if (_matchPlayers[matchId].length != 0) revert PlayersAlreadyRegistered(matchId);

        for (uint256 i = 0; i < players.length; i++) {
            _isMatchPlayer[matchId][players[i]] = true;
        }
        _matchPlayers[matchId] = players;
    }

    function proposeSettlement(bytes32 matchId, address winner, bytes32 transcriptHash) external onlyServer {
        if (_proposals[matchId].proposedAt != 0) revert AlreadyProposed(matchId);
        if (transcriptHash == bytes32(0)) revert ZeroTranscriptHash();

        // winner == address(0) indicates a draw
        if (winner != address(0)) {
            if (!_isMatchPlayer[matchId][winner]) revert WinnerNotAPlayer(winner);
        }

        uint256 deadline = block.timestamp + disputeWindow;

        _proposals[matchId] = SettlementProposal({
            matchId: matchId,
            proposedWinner: winner,
            transcriptHash: transcriptHash,
            proposedBy: msg.sender,
            proposedAt: block.timestamp,
            disputeDeadline: deadline,
            status: SettlementStatus.Proposed
        });

        emit SettlementProposed(matchId, winner, transcriptHash, deadline);
    }

    function finalizeSettlement(bytes32 matchId) external {
        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Proposed) revert NotProposed(matchId);
        if (block.timestamp < proposal.disputeDeadline) {
            revert DisputeWindowOpen(matchId, proposal.disputeDeadline);
        }

        proposal.status = SettlementStatus.Finalized;

        if (proposal.proposedWinner == address(0)) {
            escrow.settleDraw(matchId);
        } else {
            escrow.settleToWinner(matchId, proposal.proposedWinner);
        }

        emit SettlementFinalized(matchId, proposal.proposedWinner);
    }

    function disputeSettlement(bytes32 matchId, bytes32 challengerTranscriptHash) external {
        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Proposed) revert NotProposed(matchId);
        if (block.timestamp >= proposal.disputeDeadline) revert DisputeWindowClosed(matchId);
        if (!_isMatchPlayer[matchId][msg.sender]) revert NotAPlayer(msg.sender);
        if (msg.sender == proposal.proposedBy) revert CannotDisputeOwnProposal();

        proposal.status = SettlementStatus.Disputed;
        escrow.markDisputed(matchId);

        disputeResolution.openDispute(matchId, msg.sender, proposal.transcriptHash, challengerTranscriptHash);

        emit SettlementDisputed(matchId, msg.sender);
    }

    function onDisputeResolved(bytes32 matchId, bool proposalValid) external {
        if (msg.sender != address(disputeResolution)) revert NotDisputeContract();

        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Disputed) revert NotDisputed(matchId);

        if (proposalValid) {
            proposal.status = SettlementStatus.Finalized;
            if (proposal.proposedWinner == address(0)) {
                escrow.settleDraw(matchId);
            } else {
                escrow.settleToWinner(matchId, proposal.proposedWinner);
            }
            emit SettlementFinalized(matchId, proposal.proposedWinner);
        } else {
            proposal.status = SettlementStatus.Finalized;
            escrow.refund(matchId);
        }
    }

    function getProposal(bytes32 matchId) external view returns (SettlementProposal memory) {
        return _proposals[matchId];
    }

    function getMatchPlayers(bytes32 matchId) external view returns (address[] memory) {
        return _matchPlayers[matchId];
    }
}
