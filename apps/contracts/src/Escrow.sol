// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEscrow} from "./interfaces/IEscrow.sol";
import {IGameRegistry} from "./interfaces/IGameRegistry.sol";

contract Escrow is IEscrow, Ownable2Step, ReentrancyGuard {
    error NotSettlement();
    error ZeroAddress();
    error EscrowAlreadyExists(bytes32 matchId);
    error GameNotActive(bytes32 gameId);
    error NeedAtLeastTwoPlayers();
    error ZeroStake();
    error EscrowNotFound(bytes32 matchId);
    error InvalidEscrowStatus(MatchEscrowStatus current);
    error WrongStakeAmount(uint256 expected, uint256 actual);
    error AlreadyDeposited(address player);
    error NotAPlayer(address caller);
    error NotFunded(bytes32 matchId);
    error CannotRefund(bytes32 matchId);
    error PayoutFailed(address recipient);
    error FeeTooHigh(uint16 feeBps);
    error BelowMinimumStake(uint256 required, uint256 provided);
    error NoPendingWithdrawal();
    error EscrowNotTimedOut(bytes32 matchId);
    error NotDepositor(address caller);
    error DuplicatePlayer(address player);
    error TooManyPlayers(uint256 count, uint8 max);
    error NoFeesToClaim();
    error WinnerNotInEscrow(address winner);
    error ZeroWinnerAddress();

    address public settlementContract;
    IGameRegistry public gameRegistry;
    uint16 public feeBps;
    address public treasury;
    uint256 public minimumStake;
    uint256 public accumulatedFees;

    uint256 public constant ESCROW_TIMEOUT = 7 days;

    mapping(bytes32 => MatchEscrow) private _escrows;
    mapping(bytes32 => mapping(address => bool)) private _hasDeposited;
    mapping(address => uint256) private _pendingWithdrawals;

    modifier onlySettlement() {
        if (msg.sender != settlementContract) revert NotSettlement();
        _;
    }

    constructor(address _gameRegistry) Ownable(msg.sender) {
        if (_gameRegistry == address(0)) revert ZeroAddress();
        gameRegistry = IGameRegistry(_gameRegistry);
    }

    function setSettlementContract(address _settlement) external onlyOwner {
        if (_settlement == address(0)) revert ZeroAddress();
        address oldSettlement = settlementContract;
        settlementContract = _settlement;
        emit SettlementContractUpdated(oldSettlement, _settlement);
    }

    function setMinimumStake(uint256 _minimumStake) external onlyOwner {
        uint256 oldMinimum = minimumStake;
        minimumStake = _minimumStake;
        emit MinimumStakeUpdated(oldMinimum, _minimumStake);
    }

    function setFee(uint16 _feeBps, address _treasury) external onlyOwner {
        if (_feeBps > 1000) revert FeeTooHigh(_feeBps);
        uint16 oldFeeBps = feeBps;
        address oldTreasury = treasury;
        feeBps = _feeBps;
        treasury = _treasury;
        emit FeeUpdated(oldFeeBps, _feeBps, oldTreasury, _treasury);
    }

    /// @notice Creates an escrow for a match. Only callable by the Settlement contract.
    function createEscrow(bytes32 matchId, bytes32 gameId, address[] calldata players, uint256 stakePerPlayer)
        external
        onlySettlement
    {
        if (_escrows[matchId].createdAt != 0) revert EscrowAlreadyExists(matchId);
        if (players.length < 2) revert NeedAtLeastTwoPlayers();
        if (stakePerPlayer == 0) revert ZeroStake();
        if (minimumStake > 0 && stakePerPlayer < minimumStake) {
            revert BelowMinimumStake(minimumStake, stakePerPlayer);
        }

        // H-4: Validate player count against game definition
        IGameRegistry.GameDefinition memory game = gameRegistry.getGame(gameId);
        if (!game.active) revert GameNotActive(gameId);
        if (players.length > game.maxPlayers) revert TooManyPlayers(players.length, game.maxPlayers);

        // M-5: Validate no duplicate or zero-address players
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == address(0)) revert ZeroAddress();
            for (uint256 j = i + 1; j < players.length; j++) {
                if (players[i] == players[j]) revert DuplicatePlayer(players[i]);
            }
        }

        _escrows[matchId] = MatchEscrow({
            matchId: matchId,
            gameId: gameId,
            players: players,
            stakePerPlayer: stakePerPlayer,
            totalStake: 0,
            status: MatchEscrowStatus.None,
            createdAt: block.timestamp,
            fundingDeadline: block.timestamp + ESCROW_TIMEOUT
        });

        emit EscrowCreated(matchId, gameId, stakePerPlayer, players.length);
    }

    function depositStake(bytes32 matchId) external payable {
        MatchEscrow storage esc = _escrows[matchId];
        if (esc.createdAt == 0) revert EscrowNotFound(matchId);
        if (esc.status != MatchEscrowStatus.None && esc.status != MatchEscrowStatus.Funded) {
            revert InvalidEscrowStatus(esc.status);
        }
        if (msg.value != esc.stakePerPlayer) revert WrongStakeAmount(esc.stakePerPlayer, msg.value);
        if (_hasDeposited[matchId][msg.sender]) revert AlreadyDeposited(msg.sender);
        if (!_isPlayer(esc, msg.sender)) revert NotAPlayer(msg.sender);

        _hasDeposited[matchId][msg.sender] = true;
        esc.totalStake += msg.value;

        emit StakeDeposited(matchId, msg.sender, msg.value);

        if (esc.totalStake == esc.stakePerPlayer * esc.players.length) {
            esc.status = MatchEscrowStatus.Funded;
            emit EscrowFullyFunded(matchId);
        }
    }

    function settleToWinner(bytes32 matchId, address winner) external onlySettlement {
        MatchEscrow storage esc = _escrows[matchId];
        if (esc.status != MatchEscrowStatus.Funded && esc.status != MatchEscrowStatus.Disputed) {
            revert NotFunded(matchId);
        }

        // H-2: Verify winner is valid
        if (winner == address(0)) revert ZeroWinnerAddress();
        if (!_isPlayer(esc, winner)) revert WinnerNotInEscrow(winner);

        esc.status = MatchEscrowStatus.Settled;

        uint256 totalPot = esc.totalStake;
        uint256 fee = (feeBps > 0 && treasury != address(0)) ? (totalPot * feeBps / 10000) : 0;
        uint256 payout = totalPot - fee;

        // M-7: Zero totalStake before crediting
        esc.totalStake = 0;

        // C-2: Credit to pull-payment ledger
        _pendingWithdrawals[winner] += payout;
        emit PayoutCredited(matchId, winner, payout);

        // H-3: Accumulate fees instead of pushing to treasury
        if (fee > 0) {
            accumulatedFees += fee;
            emit TreasuryFeeAccumulated(matchId, fee);
        }

        emit EscrowSettled(matchId, winner, payout);
    }

    function settleDraw(bytes32 matchId) external onlySettlement {
        MatchEscrow storage esc = _escrows[matchId];
        if (esc.status != MatchEscrowStatus.Funded && esc.status != MatchEscrowStatus.Disputed) {
            revert NotFunded(matchId);
        }

        esc.status = MatchEscrowStatus.Settled;

        // M-7: Zero totalStake before crediting
        esc.totalStake = 0;

        // C-2: Credit each depositor to pull-payment ledger
        for (uint256 i = 0; i < esc.players.length; i++) {
            if (_hasDeposited[matchId][esc.players[i]]) {
                _pendingWithdrawals[esc.players[i]] += esc.stakePerPlayer;
                emit PayoutCredited(matchId, esc.players[i], esc.stakePerPlayer);
            }
        }

        emit EscrowSettled(matchId, address(0), 0);
    }

    function refund(bytes32 matchId) external onlySettlement {
        MatchEscrow storage esc = _escrows[matchId];
        if (
            esc.status != MatchEscrowStatus.None && esc.status != MatchEscrowStatus.Funded
                && esc.status != MatchEscrowStatus.Disputed
        ) {
            revert CannotRefund(matchId);
        }

        esc.status = MatchEscrowStatus.Refunded;

        // M-7: Zero totalStake before crediting
        esc.totalStake = 0;

        // C-2: Credit each depositor to pull-payment ledger
        for (uint256 i = 0; i < esc.players.length; i++) {
            if (_hasDeposited[matchId][esc.players[i]]) {
                _pendingWithdrawals[esc.players[i]] += esc.stakePerPlayer;
                emit PayoutCredited(matchId, esc.players[i], esc.stakePerPlayer);
            }
        }

        emit EscrowRefunded(matchId);
    }

    /// @notice Allows any address with pending withdrawals to claim their funds.
    function claimPayout() external nonReentrant {
        uint256 amount = _pendingWithdrawals[msg.sender];
        if (amount == 0) revert NoPendingWithdrawal();

        _pendingWithdrawals[msg.sender] = 0;

        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert PayoutFailed(msg.sender);

        emit PayoutClaimed(msg.sender, amount);
    }

    /// @notice Allows treasury to claim accumulated protocol fees.
    function claimTreasuryFees() external nonReentrant {
        if (treasury == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFeesToClaim();

        accumulatedFees = 0;

        (bool sent,) = treasury.call{value: amount}("");
        if (!sent) revert PayoutFailed(treasury);

        emit FeeCollected(bytes32(0), treasury, amount);
    }

    /// @notice Allows a depositor to reclaim their deposit after escrow timeout.
    function emergencyWithdraw(bytes32 matchId) external nonReentrant {
        MatchEscrow storage esc = _escrows[matchId];
        if (esc.createdAt == 0) revert EscrowNotFound(matchId);

        // Allow emergency withdraw if:
        // 1. Funding deadline passed and escrow is not fully funded (status == None), OR
        // 2. ESCROW_TIMEOUT passed since creation and escrow is not yet settled/refunded
        bool fundingTimedOut = (esc.status == MatchEscrowStatus.None && block.timestamp > esc.fundingDeadline);
        bool escrowTimedOut =
            (block.timestamp > esc.createdAt + ESCROW_TIMEOUT && esc.status != MatchEscrowStatus.Settled
                && esc.status != MatchEscrowStatus.Refunded);

        if (!fundingTimedOut && !escrowTimedOut) revert EscrowNotTimedOut(matchId);
        if (!_hasDeposited[matchId][msg.sender]) revert NotDepositor(msg.sender);

        _hasDeposited[matchId][msg.sender] = false;
        esc.totalStake -= esc.stakePerPlayer;

        // Credit to pull-payment ledger
        _pendingWithdrawals[msg.sender] += esc.stakePerPlayer;

        emit EmergencyWithdrawal(matchId, msg.sender, esc.stakePerPlayer);
    }

    function markDisputed(bytes32 matchId) external onlySettlement {
        MatchEscrow storage esc = _escrows[matchId];
        if (esc.status != MatchEscrowStatus.Funded) revert NotFunded(matchId);
        esc.status = MatchEscrowStatus.Disputed;
        emit EscrowDisputed(matchId);
    }

    function getEscrow(bytes32 matchId) external view returns (MatchEscrow memory) {
        if (_escrows[matchId].createdAt == 0) revert EscrowNotFound(matchId);
        return _escrows[matchId];
    }

    function isFullyFunded(bytes32 matchId) external view returns (bool) {
        return _escrows[matchId].status == MatchEscrowStatus.Funded;
    }

    function hasPlayerDeposited(bytes32 matchId, address player) external view returns (bool) {
        return _hasDeposited[matchId][player];
    }

    function pendingWithdrawal(address account) external view returns (uint256) {
        return _pendingWithdrawals[account];
    }

    function _isPlayer(MatchEscrow storage esc, address addr) internal view returns (bool) {
        for (uint256 i = 0; i < esc.players.length; i++) {
            if (esc.players[i] == addr) return true;
        }
        return false;
    }
}
