// SPDX-License-Identifier: MIT
/// @title dork.fun - Settlement
/// @notice Manages match outcome proposals and finalization for the dork.fun competitive gaming platform
/// @custom:website https://dork.fun
pragma solidity ^0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISettlement} from "./interfaces/ISettlement.sol";
import {IDisputeResolution} from "./interfaces/IDisputeResolution.sol";

interface IEscrowSettlement {
    function createEscrow(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer) external;
    function settleToWinner(bytes32 matchId, address winner) external;
    function settleDraw(bytes32 matchId) external;
    function markDisputed(bytes32 matchId) external;
    function refund(bytes32 matchId) external;
    function extendEmergencyDeadline(bytes32 matchId, uint256 newDeadline) external;
    function isFullyFunded(bytes32 matchId) external view returns (bool);
}

contract Settlement is ISettlement, Ownable2Step, ReentrancyGuard {
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
    error IncorrectDisputeBond(uint256 required, uint256 provided);
    error NoPendingBondRefund();
    error BondPayoutFailed(address recipient);
    error SettlementAlreadyProposed(bytes32 matchId);
    error EscrowNotFunded(bytes32 matchId);
    error MatchNotFound(bytes32 matchId);
    error DisputeResolutionNotSet();
    error CannotDisputeOwnWin();

    uint256 public constant MIN_DISPUTE_WINDOW = 5 minutes;

    address public server;
    IEscrowSettlement public escrow;
    IDisputeResolution public disputeResolution;
    uint256 public disputeWindow;
    uint256 public disputeBond;

    mapping(bytes32 => SettlementProposal) private _proposals;
    mapping(bytes32 => mapping(address => bool)) private _isMatchPlayer;
    mapping(bytes32 => address[]) private _matchPlayers;
    mapping(bytes32 => uint256) private _proposalDisputeBonds;
    mapping(bytes32 => uint256) private _disputeBonds;
    mapping(bytes32 => address) private _disputeChallengers;
    mapping(address => uint256) private _pendingBondRefunds;

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

    function setDisputeBond(uint256 _disputeBond) external onlyOwner {
        uint256 oldBond = disputeBond;
        disputeBond = _disputeBond;
        emit DisputeBondUpdated(oldBond, _disputeBond);
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

        escrow.createEscrow(matchId, gameId, players, stakePerPlayer);

        emit MatchCreated(matchId, gameId);
    }

    function cancelMatch(bytes32 matchId) external onlyServer {
        if (_matchPlayers[matchId].length == 0) revert MatchNotFound(matchId);
        if (_proposals[matchId].proposedAt != 0) revert SettlementAlreadyProposed(matchId);

        escrow.refund(matchId);

        emit MatchCancelled(matchId);
    }

    function proposeSettlement(bytes32 matchId, address winner, bytes32 transcriptHash) external onlyServer {
        if (address(disputeResolution) == address(0)) revert DisputeResolutionNotSet();
        if (_proposals[matchId].proposedAt != 0) revert AlreadyProposed(matchId);
        if (transcriptHash == bytes32(0)) revert ZeroTranscriptHash();
        if (!escrow.isFullyFunded(matchId)) revert EscrowNotFunded(matchId);

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

        _proposalDisputeBonds[matchId] = disputeBond;

        escrow.extendEmergencyDeadline(matchId, deadline + 1 days);

        emit SettlementProposed(matchId, winner, transcriptHash, deadline);
    }

    function finalizeSettlement(bytes32 matchId) external {
        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Proposed) revert NotProposed(matchId);
        if (block.timestamp < proposal.disputeDeadline) {
            revert DisputeWindowOpen(matchId, proposal.disputeDeadline);
        }

        // If escrow is no longer funded (e.g. emergency withdrawal), finalize as failed
        if (!escrow.isFullyFunded(matchId)) {
            proposal.status = SettlementStatus.Finalized;
            emit SettlementCallbackFailed(matchId);
            return;
        }

        if (proposal.proposedWinner == address(0)) {
            escrow.settleDraw(matchId);
        } else {
            escrow.settleToWinner(matchId, proposal.proposedWinner);
        }

        proposal.status = SettlementStatus.Finalized;
        emit SettlementFinalized(matchId, proposal.proposedWinner);
    }

    function disputeSettlement(bytes32 matchId, bytes32 challengerTranscriptHash) external payable {
        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Proposed) revert NotProposed(matchId);
        if (block.timestamp >= proposal.disputeDeadline) revert DisputeWindowClosed(matchId);
        if (!_isMatchPlayer[matchId][msg.sender]) revert NotAPlayer(msg.sender);
        if (msg.sender == proposal.proposedBy) revert CannotDisputeOwnProposal();
        if (msg.sender == proposal.proposedWinner) revert CannotDisputeOwnWin();

        uint256 requiredBond = _proposalDisputeBonds[matchId];
        if (msg.value != requiredBond) {
            revert IncorrectDisputeBond(requiredBond, msg.value);
        }

        proposal.status = SettlementStatus.Disputed;
        escrow.markDisputed(matchId);

        _disputeChallengers[matchId] = msg.sender;
        if (msg.value > 0) {
            _disputeBonds[matchId] = msg.value;
        }

        escrow.extendEmergencyDeadline(matchId, block.timestamp + 30 days);

        disputeResolution.openDispute(matchId, msg.sender, proposal.transcriptHash, challengerTranscriptHash);

        emit SettlementDisputed(matchId, msg.sender);
    }

    function onDisputeResolved(bytes32 matchId, bool proposalValid) external {
        if (msg.sender != address(disputeResolution)) revert NotDisputeContract();

        SettlementProposal storage proposal = _proposals[matchId];
        if (proposal.status != SettlementStatus.Disputed) revert NotDisputed(matchId);

        uint256 bond = _disputeBonds[matchId];
        address challenger = _disputeChallengers[matchId];

        if (proposalValid) {
            if (bond > 0) {
                _disputeBonds[matchId] = 0;
                _pendingBondRefunds[owner()] += bond;
                emit DisputeBondForfeited(matchId, challenger, bond);
            }

            if (proposal.proposedWinner == address(0)) {
                escrow.settleDraw(matchId);
            } else {
                escrow.settleToWinner(matchId, proposal.proposedWinner);
            }
        } else {
            if (bond > 0) {
                _disputeBonds[matchId] = 0;
                _pendingBondRefunds[challenger] += bond;
                emit DisputeBondReturned(matchId, challenger, bond);
            }

            escrow.refund(matchId);
        }

        proposal.status = SettlementStatus.Finalized;
        emit SettlementFinalized(matchId, proposal.proposedWinner);
    }

    /// @notice Claim pending bond refund (pull-payment pattern).
    function claimBondRefund() external nonReentrant {
        uint256 amount = _pendingBondRefunds[msg.sender];
        if (amount == 0) revert NoPendingBondRefund();

        _pendingBondRefunds[msg.sender] = 0;

        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert BondPayoutFailed(msg.sender);

        emit BondRefundClaimed(msg.sender, amount);
    }

    function pendingBondRefund(address account) external view returns (uint256) {
        return _pendingBondRefunds[account];
    }

    function getProposal(bytes32 matchId) external view returns (SettlementProposal memory) {
        return _proposals[matchId];
    }

    function getMatchPlayers(bytes32 matchId) external view returns (address[] memory) {
        return _matchPlayers[matchId];
    }

    function getDisputeChallenger(bytes32 matchId) external view returns (address) {
        return _disputeChallengers[matchId];
    }
}
