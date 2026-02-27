// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {Escrow} from "../src/Escrow.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MaliciousReceiver {
    receive() external payable {
        revert("no ETH accepted");
    }

    function deposit(Escrow escrow, bytes32 matchId) external payable {
        escrow.depositStake{value: msg.value}(matchId);
    }
}

contract EscrowTest is Test {
    GameRegistry public registry;
    Escrow public escrow;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public settlement = makeAddr("settlement");

    bytes32 public gameId;
    bytes32 public matchId = keccak256("match-1");

    function setUp() public {
        registry = new GameRegistry();
        escrow = new Escrow(address(registry), settlement, 0, address(0), 0);

        // Register a game
        gameId = registry.registerGame("Tic-Tac-Toe", keccak256("ttt-v1"), 2, 2);

        // Fund players
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _createAndFundEscrow() internal {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        vm.prank(bob);
        escrow.depositStake{value: 1 ether}(matchId);
    }

    // --- createEscrow tests ---

    function test_createEscrow() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.matchId, matchId);
        assertEq(e.gameId, gameId);
        assertEq(e.stakePerPlayer, 1 ether);
        assertEq(e.totalStake, 0);
        assertEq(e.players.length, 2);
        assertGt(e.fundingDeadline, block.timestamp);
    }

    function test_createEscrow_revert_notSettlement() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.expectRevert(Escrow.NotSettlement.selector);
        escrow.createEscrow(matchId, gameId, players, 1 ether);
    }

    function test_createEscrow_revert_inactiveGame() public {
        registry.deactivateGame(gameId);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.GameNotActive.selector, gameId));
        escrow.createEscrow(matchId, gameId, players, 1 ether);
    }

    function test_createEscrow_revert_duplicatePlayer() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = alice;

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.DuplicatePlayer.selector, alice));
        escrow.createEscrow(matchId, gameId, players, 1 ether);
    }

    function test_createEscrow_revert_zeroAddressPlayer() public {
        address[] memory players = new address[](2);
        players[0] = address(0);
        players[1] = bob;

        vm.prank(settlement);
        vm.expectRevert(Escrow.ZeroAddress.selector);
        escrow.createEscrow(matchId, gameId, players, 1 ether);
    }

    function test_createEscrow_revert_tooManyPlayers() public {
        // Game maxPlayers is 2
        address charlie = makeAddr("charlie");
        address[] memory players = new address[](3);
        players[0] = alice;
        players[1] = bob;
        players[2] = charlie;

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.TooManyPlayers.selector, uint256(3), uint8(2)));
        escrow.createEscrow(matchId, gameId, players, 1 ether);
    }

    // --- depositStake tests ---

    function test_depositStake() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        assertTrue(escrow.hasPlayerDeposited(matchId, alice));
        assertFalse(escrow.hasPlayerDeposited(matchId, bob));
        assertFalse(escrow.isFullyFunded(matchId));
    }

    function test_depositStake_fullyFunded() public {
        _createAndFundEscrow();

        assertTrue(escrow.isFullyFunded(matchId));

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.totalStake, 2 ether);
    }

    function test_depositStake_revert_wrongAmount() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.WrongStakeAmount.selector, 1 ether, 0.5 ether));
        escrow.depositStake{value: 0.5 ether}(matchId);
    }

    function test_depositStake_revert_notPlayer() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        address charlie = makeAddr("charlie");
        vm.deal(charlie, 10 ether);
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Escrow.NotAPlayer.selector, charlie));
        escrow.depositStake{value: 1 ether}(matchId);
    }

    function test_depositStake_revert_alreadyDeposited() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.AlreadyDeposited.selector, alice));
        escrow.depositStake{value: 1 ether}(matchId);
    }

    function test_depositStake_revert_afterFundingDeadline() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        // Advance past funding deadline
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.FundingDeadlinePassed.selector, matchId));
        escrow.depositStake{value: 1 ether}(matchId);
    }

    // --- settleToWinner + pull payment tests ---

    function test_settleToWinner() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // Funds credited but not yet withdrawn
        assertEq(escrow.pendingWithdrawal(alice), 2 ether);

        // Claim
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();

        assertEq(alice.balance, aliceBalBefore + 2 ether);
        assertEq(escrow.pendingWithdrawal(alice), 0);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(uint8(e.status), uint8(IEscrow.MatchEscrowStatus.Settled));
        assertEq(e.totalStake, 0);
    }

    function test_settleToWinner_revert_notSettlement() public {
        _createAndFundEscrow();

        vm.prank(bob);
        vm.expectRevert(Escrow.NotSettlement.selector);
        escrow.settleToWinner(matchId, alice);
    }

    function test_settleToWinner_revert_zeroAddress() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        vm.expectRevert(Escrow.ZeroWinnerAddress.selector);
        escrow.settleToWinner(matchId, address(0));
    }

    function test_settleToWinner_revert_winnerNotPlayer() public {
        _createAndFundEscrow();

        address charlie = makeAddr("charlie");
        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.WinnerNotInEscrow.selector, charlie));
        escrow.settleToWinner(matchId, charlie);
    }

    // --- settleDraw + pull payment tests ---

    function test_settleDraw() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleDraw(matchId);

        // Funds credited
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);

        // Claim individually
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout();
        assertEq(bob.balance, bobBalBefore + 1 ether);
    }

    // --- refund + pull payment tests ---

    function test_refund() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.refund(matchId);

        // Funds credited
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);

        // Claim
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout();
        assertEq(bob.balance, bobBalBefore + 1 ether);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(uint8(e.status), uint8(IEscrow.MatchEscrowStatus.Refunded));
    }

    // --- claimPayout tests ---

    function test_claimPayout_revert_noPending() public {
        vm.prank(alice);
        vm.expectRevert(Escrow.NoPendingWithdrawal.selector);
        escrow.claimPayout();
    }

    // --- markDisputed tests ---

    function test_markDisputed() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.markDisputed(matchId);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(uint8(e.status), uint8(IEscrow.MatchEscrowStatus.Disputed));
    }

    // --- Fee tests ---

    function test_settleToWinner_withFee() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr); // 2.5%

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // 2 ether total, 2.5% fee = 0.05 ether fee, 1.95 ether payout
        assertEq(escrow.pendingWithdrawal(alice), 1.95 ether);
        assertEq(escrow.accumulatedFees(), 0.05 ether);

        // Winner claims
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1.95 ether);

        // Treasury claims fees
        uint256 treasuryBalBefore = treasuryAddr.balance;
        escrow.claimTreasuryFees();
        assertEq(treasuryAddr.balance, treasuryBalBefore + 0.05 ether);
        assertEq(escrow.accumulatedFees(), 0);
    }

    function test_settleToWinner_noFee() public {
        // feeBps defaults to 0
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        assertEq(escrow.pendingWithdrawal(alice), 2 ether);
        assertEq(escrow.accumulatedFees(), 0);
    }

    function test_settleDraw_noFeeRegardlessOfConfig() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr); // 2.5%

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleDraw(matchId);

        // Each player gets their full stake back, no fee
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);
        assertEq(escrow.accumulatedFees(), 0);
    }

    function test_setFee_revert_tooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(Escrow.FeeTooHigh.selector, uint16(1001)));
        escrow.setFee(1001, makeAddr("treasury"));
    }

    function test_setFee_revert_feeWithoutTreasury() public {
        vm.expectRevert(Escrow.FeeRequiresTreasury.selector);
        escrow.setFee(250, address(0));
    }

    function test_claimTreasuryFees_revert_noFees() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        vm.expectRevert(Escrow.NoFeesToClaim.selector);
        escrow.claimTreasuryFees();
    }

    // --- Minimum stake tests ---

    function test_setMinimumStake() public {
        escrow.setMinimumStake(0.5 ether);
        assertEq(escrow.minimumStake(), 0.5 ether);
    }

    function test_setMinimumStake_revert_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setMinimumStake(0.5 ether);
    }

    function test_createEscrow_revert_belowMinimumStake() public {
        escrow.setMinimumStake(1 ether);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.BelowMinimumStake.selector, 1 ether, 0.5 ether));
        escrow.createEscrow(matchId, gameId, players, 0.5 ether);
    }

    function test_createEscrow_atMinimumStake() public {
        escrow.setMinimumStake(1 ether);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.stakePerPlayer, 1 ether);
    }

    function test_createEscrow_noMinimumStake() public {
        // minimumStake defaults to 0 -- any positive stake should work
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 0.001 ether);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.stakePerPlayer, 0.001 ether);
    }

    function test_setFee_revert_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setFee(250, makeAddr("treasury"));
    }

    // --- totalStake zeroed after settlement (M-7) ---

    function test_totalStakeZeroedAfterSettle() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.totalStake, 0);
    }

    // --- Emergency withdraw tests (C-3 / M-4) ---

    function test_emergencyWithdraw_fundingTimeout() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        // Only alice deposits
        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        // Advance past funding deadline
        vm.warp(block.timestamp + 7 days + 1);

        // Alice can emergency withdraw
        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        assertEq(escrow.pendingWithdrawal(alice), 1 ether);

        // Claim the withdrawal
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);
    }

    function test_emergencyWithdraw_escrowTimeout() public {
        _createAndFundEscrow();

        // Advance past escrow timeout (funded but never settled)
        vm.warp(block.timestamp + 7 days + 1);

        // Alice can emergency withdraw
        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);

        // Bob too
        vm.prank(bob);
        escrow.emergencyWithdraw(matchId);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);
    }

    function test_emergencyWithdraw_revert_tooEarly() public {
        _createAndFundEscrow();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotTimedOut.selector, matchId));
        escrow.emergencyWithdraw(matchId);
    }

    function test_emergencyWithdraw_revert_notDepositor() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        vm.warp(block.timestamp + 7 days + 1);

        // Bob didn't deposit, can't emergency withdraw
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Escrow.NotDepositor.selector, bob));
        escrow.emergencyWithdraw(matchId);
    }

    function test_emergencyWithdraw_revert_alreadySettled() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        vm.warp(block.timestamp + 7 days + 1);

        // Can't emergency withdraw after settlement
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotTimedOut.selector, matchId));
        escrow.emergencyWithdraw(matchId);
    }

    // --- Emergency withdraw blocks settlement (C-1) ---

    function test_emergencyWithdraw_blocksSettlement() public {
        _createAndFundEscrow();

        // Advance past escrow timeout
        vm.warp(block.timestamp + 7 days + 1);

        // Alice emergency withdraws
        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        // Status should be EmergencyWithdrawn
        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(uint8(e.status), uint8(IEscrow.MatchEscrowStatus.EmergencyWithdrawn));

        // Settlement should be blocked
        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.NotFunded.selector, matchId));
        escrow.settleToWinner(matchId, alice);
    }

    function test_emergencyWithdraw_blocksSettleDraw() public {
        _createAndFundEscrow();

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.NotFunded.selector, matchId));
        escrow.settleDraw(matchId);
    }

    function test_emergencyWithdraw_blocksRefund() public {
        _createAndFundEscrow();

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.CannotRefund.selector, matchId));
        escrow.refund(matchId);
    }

    // --- Emergency withdraw blocks re-deposit (C-2) ---

    function test_emergencyWithdraw_blocksReDeposit() public {
        _createAndFundEscrow();

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        // Alice tries to re-deposit -- should fail because status is EmergencyWithdrawn
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(Escrow.InvalidEscrowStatus.selector, IEscrow.MatchEscrowStatus.EmergencyWithdrawn)
        );
        escrow.depositStake{value: 1 ether}(matchId);
    }

    // --- Second player can still emergency withdraw (C-1) ---

    function test_emergencyWithdraw_secondPlayerCanWithdraw() public {
        _createAndFundEscrow();

        vm.warp(block.timestamp + 7 days + 1);

        // Alice emergency withdraws first
        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);

        // Bob can also emergency withdraw (status is EmergencyWithdrawn, uses emergencyDeadline)
        vm.prank(bob);
        escrow.emergencyWithdraw(matchId);

        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);
    }

    // --- minPlayers validation (H-1) ---

    function test_createEscrow_revert_tooFewPlayers() public {
        // Register a game requiring 3 minimum players
        bytes32 threePlayerGameId = registry.registerGame("ThreePlayerGame", keccak256("3p-v1"), 3, 4);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.TooFewPlayers.selector, uint256(2), uint8(3)));
        escrow.createEscrow(matchId, threePlayerGameId, players, 1 ether);
    }

    // --- Treasury ACL tests (H-4) ---

    function test_claimTreasuryFees_revert_notTreasury() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr); // 2.5%

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // Random user tries to claim treasury fees
        address charlie = makeAddr("charlie");
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Escrow.NotTreasury.selector, charlie));
        escrow.claimTreasuryFees();
    }

    function test_claimTreasuryFees_byTreasury() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // Treasury can claim
        uint256 treasuryBalBefore = treasuryAddr.balance;
        vm.prank(treasuryAddr);
        escrow.claimTreasuryFees();
        assertEq(treasuryAddr.balance, treasuryBalBefore + 0.05 ether);
    }

    function test_claimTreasuryFees_byOwner() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // Owner (this test contract) can claim
        uint256 treasuryBalBefore = treasuryAddr.balance;
        escrow.claimTreasuryFees(); // msg.sender == owner()
        assertEq(treasuryAddr.balance, treasuryBalBefore + 0.05 ether);
    }

    // --- DoS prevention test (C-2) ---

    function test_dosPrevented_maliciousReceiver() public {
        MaliciousReceiver evil = new MaliciousReceiver();
        address evilAddr = address(evil);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = evilAddr;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        vm.deal(evilAddr, 10 ether);
        evil.deposit{value: 1 ether}(escrow, matchId);

        // Settle as draw -- this should NOT revert with pull payments
        vm.prank(settlement);
        escrow.settleDraw(matchId);

        // Both have pending withdrawals
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(evilAddr), 1 ether);

        // Alice can claim even though evil can't
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);

        // Evil's claim will fail but doesn't affect Alice
        vm.prank(evilAddr);
        vm.expectRevert(abi.encodeWithSelector(Escrow.PayoutFailed.selector, evilAddr));
        escrow.claimPayout();
    }

    // --- Emergency withdraw blocked during dispute (C-1 fix) ---

    function test_emergencyWithdraw_revert_duringDispute() public {
        _createAndFundEscrow();

        // Mark escrow as disputed
        vm.prank(settlement);
        escrow.markDisputed(matchId);

        // Advance past emergency deadline
        vm.warp(block.timestamp + 31 days);

        // Should revert even past deadline — can't withdraw during active dispute
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.CannotWithdrawDuringDispute.selector, matchId));
        escrow.emergencyWithdraw(matchId);
    }

    // --- Constructor fee/treasury validation (H-1 fix) ---

    function test_constructor_revert_feeWithoutTreasury() public {
        vm.expectRevert(Escrow.FeeRequiresTreasury.selector);
        new Escrow(address(registry), settlement, 250, address(0), 0);
    }

    function test_constructor_feeWithTreasury() public {
        address treasuryAddr = makeAddr("treasury");
        Escrow e = new Escrow(address(registry), settlement, 250, treasuryAddr, 0);
        assertEq(e.feeBps(), 250);
        assertEq(e.treasury(), treasuryAddr);
    }

    // --- Fee snapshot tests ---

    function test_feeSnapshot_lockedAtCreation() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr); // 2.5%

        _createAndFundEscrow();

        // Change fee after escrow is created and funded
        escrow.setFee(500, treasuryAddr); // 5%

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        // Should use the snapshotted 2.5%, not the current 5%
        // 2 ether * 2.5% = 0.05 ether fee, 1.95 ether payout
        assertEq(escrow.pendingWithdrawal(alice), 1.95 ether);
        assertEq(escrow.accumulatedFees(), 0.05 ether);
    }

    // --- Bug 7: setGameRegistry tests ---

    function test_setGameRegistry() public {
        GameRegistry newRegistry = new GameRegistry();
        escrow.setGameRegistry(address(newRegistry));
        assertEq(address(escrow.gameRegistry()), address(newRegistry));
    }

    function test_setGameRegistry_revert_zeroAddress() public {
        vm.expectRevert(Escrow.ZeroAddress.selector);
        escrow.setGameRegistry(address(0));
    }

    function test_setGameRegistry_revert_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        escrow.setGameRegistry(makeAddr("newRegistry"));
    }

    function test_setGameRegistry_emitsEvent() public {
        address newRegistry = makeAddr("newRegistry");
        vm.expectEmit(true, true, true, true);
        emit IEscrow.GameRegistryUpdated(address(registry), newRegistry);
        escrow.setGameRegistry(newRegistry);
    }

    // --- Bug 2: setFee treasury lock tests ---

    function test_setFee_revert_clearTreasuryWithAccumulatedFees() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);
        assertGt(escrow.accumulatedFees(), 0);

        vm.expectRevert(Escrow.CannotClearTreasuryWithAccumulatedFees.selector);
        escrow.setFee(0, address(0));
    }

    function test_setFee_clearTreasuryWhenNoFees() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        escrow.setFee(0, address(0));
        assertEq(escrow.feeBps(), 0);
        assertEq(escrow.treasury(), address(0));
    }

    function test_setFee_clearTreasuryAfterFeesCollected() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.settleToWinner(matchId, alice);

        escrow.claimTreasuryFees();
        assertEq(escrow.accumulatedFees(), 0);

        escrow.setFee(0, address(0));
        assertEq(escrow.treasury(), address(0));
    }

    // --- Bug 4: Emergency deadline resets on funding ---

    function test_emergencyDeadline_resetsOnFunding() public {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        uint256 createTime = block.timestamp;

        // Alice deposits immediately
        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);

        // Warp 3 days
        vm.warp(createTime + 3 days);

        // Bob deposits at day 3 — triggers full funding
        vm.prank(bob);
        escrow.depositStake{value: 1 ether}(matchId);

        uint256 fundingTime = block.timestamp;

        // Emergency deadline should be fundingTime + 7 days, not createTime + 7 days
        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.emergencyDeadline, fundingTime + 7 days);

        // At createTime + 7 days (day 7), emergency withdraw should FAIL
        vm.warp(createTime + 7 days + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.EscrowNotTimedOut.selector, matchId));
        escrow.emergencyWithdraw(matchId);

        // At fundingTime + 7 days (day 10), emergency withdraw should succeed
        vm.warp(fundingTime + 7 days + 1);
        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
    }

    // --- Bug 1: unmarkDisputed tests ---

    function test_unmarkDisputed() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.markDisputed(matchId);

        IEscrow.MatchEscrow memory e1 = escrow.getEscrow(matchId);
        assertEq(uint8(e1.status), uint8(IEscrow.MatchEscrowStatus.Disputed));

        vm.prank(settlement);
        escrow.unmarkDisputed(matchId);

        IEscrow.MatchEscrow memory e2 = escrow.getEscrow(matchId);
        assertEq(uint8(e2.status), uint8(IEscrow.MatchEscrowStatus.Funded));
    }

    function test_unmarkDisputed_revert_notDisputed() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        vm.expectRevert(abi.encodeWithSelector(Escrow.InvalidEscrowStatus.selector, IEscrow.MatchEscrowStatus.Funded));
        escrow.unmarkDisputed(matchId);
    }

    function test_unmarkDisputed_revert_notSettlement() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.markDisputed(matchId);

        vm.prank(alice);
        vm.expectRevert(Escrow.NotSettlement.selector);
        escrow.unmarkDisputed(matchId);
    }

    function test_unmarkDisputed_emitsEvent() public {
        _createAndFundEscrow();

        vm.prank(settlement);
        escrow.markDisputed(matchId);

        vm.prank(settlement);
        vm.expectEmit(true, true, true, true);
        emit IEscrow.EscrowDisputeCleared(matchId);
        escrow.unmarkDisputed(matchId);
    }

    function test_feeSnapshot_storedInEscrow() public {
        address treasuryAddr = makeAddr("treasury");
        escrow.setFee(250, treasuryAddr);

        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(settlement);
        escrow.createEscrow(matchId, gameId, players, 1 ether);

        IEscrow.MatchEscrow memory e = escrow.getEscrow(matchId);
        assertEq(e.feeBpsSnapshot, 250);
        assertEq(e.treasurySnapshot, treasuryAddr);
    }
}
