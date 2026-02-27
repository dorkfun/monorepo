// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {Escrow} from "../src/Escrow.sol";
import {Settlement} from "../src/Settlement.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
import {IEscrow} from "../src/interfaces/IEscrow.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";
import {IDisputeResolution} from "../src/interfaces/IDisputeResolution.sol";

contract SettlementTest is Test {
    GameRegistry public registry;
    Escrow public escrow;
    Settlement public settlement;
    DisputeResolution public disputeResolution;

    address public serverAddr = makeAddr("server");
    address public resolverAddr = makeAddr("resolver");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    bytes32 public gameId;
    bytes32 public matchId = keccak256("match-1");
    bytes32 public transcriptHash = keccak256("transcript-hash-1");

    uint256 public constant DISPUTE_WINDOW = 1 hours;

    // Accept ETH for forfeited bond claims (owner is this contract)
    receive() external payable {}

    function setUp() public {
        // Deploy all contracts
        registry = new GameRegistry();
        escrow = new Escrow(address(registry), address(0), 0, address(0), 0);
        settlement = new Settlement(address(escrow), DISPUTE_WINDOW, serverAddr);
        disputeResolution = new DisputeResolution(address(settlement), resolverAddr);

        // Wire up contracts (settlement wasn't deployed when escrow was created)
        escrow.setSettlementContract(address(settlement));
        settlement.setDisputeResolution(address(disputeResolution));

        // Register game
        gameId = registry.registerGame("Tic-Tac-Toe", keccak256("ttt-v1"), 2, 2);

        // Fund players
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);

        // Create match atomically via Settlement (H-1/M-1)
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;
        vm.prank(serverAddr);
        settlement.createMatch(matchId, gameId, players, 1 ether);

        // Fund escrow
        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);
        vm.prank(bob);
        escrow.depositStake{value: 1 ether}(matchId);
    }

    // --- createMatch tests ---

    function test_createMatch() public {
        bytes32 matchId2 = keccak256("match-2");
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        settlement.createMatch(matchId2, gameId, players, 1 ether);

        // Verify players registered in Settlement
        address[] memory matchPlayers = settlement.getMatchPlayers(matchId2);
        assertEq(matchPlayers.length, 2);
        assertEq(matchPlayers[0], alice);
        assertEq(matchPlayers[1], bob);

        // Verify escrow created
        escrow.getEscrow(matchId2); // should not revert
    }

    function test_createMatch_revert_notServer() public {
        bytes32 matchId2 = keccak256("match-2");
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(alice);
        vm.expectRevert(Settlement.NotServer.selector);
        settlement.createMatch(matchId2, gameId, players, 1 ether);
    }

    function test_createMatch_revert_alreadyRegistered() public {
        // matchId was already registered in setUp
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.PlayersAlreadyRegistered.selector, matchId));
        settlement.createMatch(matchId, gameId, players, 1 ether);
    }

    // --- proposeSettlement tests ---

    function test_proposeSettlement() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(p.proposedWinner, alice);
        assertEq(p.transcriptHash, transcriptHash);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Proposed));
        assertEq(p.disputeDeadline, block.timestamp + DISPUTE_WINDOW);
    }

    function test_proposeSettlement_draw() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, address(0), transcriptHash);

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(p.proposedWinner, address(0));
    }

    function test_proposeSettlement_revert_notServer() public {
        vm.prank(alice);
        vm.expectRevert(Settlement.NotServer.selector);
        settlement.proposeSettlement(matchId, alice, transcriptHash);
    }

    function test_proposeSettlement_revert_winnerNotPlayer() public {
        address charlie = makeAddr("charlie");
        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.WinnerNotAPlayer.selector, charlie));
        settlement.proposeSettlement(matchId, charlie, transcriptHash);
    }

    // --- finalizeSettlement tests ---

    function test_finalizeSettlement_winner() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Advance past dispute window
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        settlement.finalizeSettlement(matchId);

        // Pull payment: check pending, then claim
        assertEq(escrow.pendingWithdrawal(alice), 2 ether);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 2 ether);

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Finalized));
    }

    function test_finalizeSettlement_draw() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, address(0), transcriptHash);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        settlement.finalizeSettlement(matchId);

        // Pull payment
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout();
        assertEq(bob.balance, bobBalBefore + 1 ether);
    }

    function test_finalizeSettlement_revert_windowOpen() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.expectRevert(
            abi.encodeWithSelector(Settlement.DisputeWindowOpen.selector, matchId, block.timestamp + DISPUTE_WINDOW)
        );
        settlement.finalizeSettlement(matchId);
    }

    // --- disputeSettlement tests ---

    function test_disputeSettlement() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        bytes32 bobTranscript = keccak256("bob-transcript");

        vm.prank(bob);
        settlement.disputeSettlement(matchId, bobTranscript);

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Disputed));

        IDisputeResolution.Dispute memory d = disputeResolution.getDispute(matchId);
        assertEq(d.challengerTranscriptHash, bobTranscript);
        assertEq(uint8(d.status), uint8(IDisputeResolution.DisputeStatus.Open));
    }

    function test_disputeSettlement_revert_notPlayer() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        address charlie = makeAddr("charlie");
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSelector(Settlement.NotAPlayer.selector, charlie));
        settlement.disputeSettlement(matchId, keccak256("fake"));
    }

    function test_disputeSettlement_revert_windowClosed() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Settlement.DisputeWindowClosed.selector, matchId));
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));
    }

    // --- Dispute resolution tests (C-1 + H-5) ---

    function test_dispute_resolve_proposalValid() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes
        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        // Advance past review period
        vm.warp(block.timestamp + 1 hours + 1);

        // Resolver decides proposal was valid
        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, true);

        // Alice gets paid via pull payment
        assertEq(escrow.pendingWithdrawal(alice), 2 ether);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 2 ether);

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Finalized));
    }

    function test_dispute_resolve_proposalInvalid() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes with a different hash
        bytes32 differentHash = keccak256("different-transcript");
        vm.prank(bob);
        settlement.disputeSettlement(matchId, differentHash);

        // Advance past review period
        vm.warp(block.timestamp + 1 hours + 1);

        // Resolver decides proposal was invalid -- refund
        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, false);

        // Both players get refunded via pull payment
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        escrow.claimPayout();
        assertEq(alice.balance, aliceBalBefore + 1 ether);

        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        escrow.claimPayout();
        assertEq(bob.balance, bobBalBefore + 1 ether);
    }

    function test_resolveDispute_revert_notResolver() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        vm.warp(block.timestamp + 1 hours + 1);

        // Non-resolver tries to resolve
        vm.prank(alice);
        vm.expectRevert(DisputeResolution.NotResolver.selector);
        disputeResolution.resolveDispute(matchId, true);
    }

    function test_resolveDispute_revert_reviewPeriod() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        // Try to resolve immediately (before review period)
        vm.prank(resolverAddr);
        vm.expectRevert(); // ReviewPeriodNotMet
        disputeResolution.resolveDispute(matchId, true);
    }

    // --- Dispute window minimum (M-3) ---

    function test_setDisputeWindow_revert_tooShort() public {
        vm.expectRevert(
            abi.encodeWithSelector(Settlement.DisputeWindowTooShort.selector, uint256(1 minutes), uint256(5 minutes))
        );
        settlement.setDisputeWindow(1 minutes);
    }

    function test_setDisputeWindow_valid() public {
        settlement.setDisputeWindow(10 minutes);
        assertEq(settlement.disputeWindow(), 10 minutes);
    }

    // --- Admin event tests (M-6) ---

    function test_setServer_emitsEvent() public {
        address newServer = makeAddr("newServer");
        vm.expectEmit(false, false, false, true);
        emit ISettlement.ServerUpdated(serverAddr, newServer);
        settlement.setServer(newServer);
    }

    function test_setDisputeWindow_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit ISettlement.DisputeWindowUpdated(DISPUTE_WINDOW, 2 hours);
        settlement.setDisputeWindow(2 hours);
    }

    // --- Dispute bond tests (H-2) ---

    function test_disputeSettlement_requiresBond() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob tries to dispute without sending bond
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Settlement.IncorrectDisputeBond.selector, 0.1 ether, 0));
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));
    }

    function test_disputeSettlement_withBond() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes with bond
        vm.prank(bob);
        settlement.disputeSettlement{value: 0.1 ether}(matchId, keccak256("bob-transcript"));

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Disputed));
    }

    function test_disputeResolved_valid_forfeitsBond() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes (wrong -- will forfeit bond)
        vm.prank(bob);
        settlement.disputeSettlement{value: 0.1 ether}(matchId, keccak256("bob-transcript"));

        vm.warp(block.timestamp + 1 hours + 1);

        // Resolver validates original proposal
        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, true);

        // Bond forfeited to owner
        address contractOwner = settlement.owner();
        assertEq(settlement.pendingBondRefund(contractOwner), 0.1 ether);
        assertEq(settlement.pendingBondRefund(bob), 0);

        // Owner claims forfeited bond
        uint256 ownerBalBefore = contractOwner.balance;
        vm.prank(contractOwner);
        settlement.claimBondRefund();
        assertEq(contractOwner.balance, ownerBalBefore + 0.1 ether);
    }

    function test_disputeResolved_invalid_returnsBond() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes (correct -- will get bond back)
        vm.prank(bob);
        settlement.disputeSettlement{value: 0.1 ether}(matchId, keccak256("bob-transcript"));

        vm.warp(block.timestamp + 1 hours + 1);

        // Resolver invalidates original proposal
        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, false);

        // Bond returned to challenger
        assertEq(settlement.pendingBondRefund(bob), 0.1 ether);

        // Bob claims bond refund
        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        settlement.claimBondRefund();
        assertEq(bob.balance, bobBalBefore + 0.1 ether);
    }

    function test_claimBondRefund_revert_noPending() public {
        vm.prank(alice);
        vm.expectRevert(Settlement.NoPendingBondRefund.selector);
        settlement.claimBondRefund();
    }

    // --- Emergency withdrawal blocked during dispute (C-3) ---

    function test_emergencyWithdraw_blocked_during_dispute() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Bob disputes
        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        // Advance past the original 7-day escrow timeout but within extended deadline
        vm.warp(block.timestamp + 7 days + 1);

        // Alice tries to emergency withdraw -- should fail because escrow is disputed
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Escrow.CannotWithdrawDuringDispute.selector, matchId));
        escrow.emergencyWithdraw(matchId);
    }

    // --- Dispute resolution expiry (M-1) ---

    function test_disputeResolution_expiry() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        // Advance past max resolution period (14 days default)
        vm.warp(block.timestamp + 14 days + 1);

        // Anyone can expire the dispute
        disputeResolution.expireDispute(matchId);

        // Dispute resolved as invalid -- both players refunded
        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
        assertEq(escrow.pendingWithdrawal(bob), 1 ether);
    }

    function test_expireDispute_revert_notExpired() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        // Try to expire immediately
        vm.expectRevert(abi.encodeWithSelector(DisputeResolution.DisputeNotExpired.selector, matchId));
        disputeResolution.expireDispute(matchId);
    }

    // --- proposeSettlement extends emergency deadline (C-3) ---

    function test_proposeSettlement_extendsEmergencyDeadline() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        IEscrow.MatchEscrow memory esc = escrow.getEscrow(matchId);
        uint256 disputeDeadline = block.timestamp + DISPUTE_WINDOW;
        assertGe(esc.emergencyDeadline, disputeDeadline + 1 days);
    }

    // --- cancelMatch tests ---

    function test_cancelMatch() public {
        bytes32 matchId2 = keccak256("match-2");
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        settlement.createMatch(matchId2, gameId, players, 1 ether);

        vm.prank(serverAddr);
        settlement.cancelMatch(matchId2);

        IEscrow.MatchEscrow memory esc = escrow.getEscrow(matchId2);
        assertEq(uint8(esc.status), uint8(IEscrow.MatchEscrowStatus.Refunded));
    }

    function test_cancelMatch_revert_notServer() public {
        vm.prank(alice);
        vm.expectRevert(Settlement.NotServer.selector);
        settlement.cancelMatch(matchId);
    }

    function test_cancelMatch_revert_alreadyProposed() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.SettlementAlreadyProposed.selector, matchId));
        settlement.cancelMatch(matchId);
    }

    function test_cancelMatch_revert_matchNotFound() public {
        bytes32 badId = keccak256("nonexistent");

        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.MatchNotFound.selector, badId));
        settlement.cancelMatch(badId);
    }

    function test_cancelMatch_refundsDepositors() public {
        bytes32 matchId2 = keccak256("match-2");
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        settlement.createMatch(matchId2, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId2);

        vm.prank(serverAddr);
        settlement.cancelMatch(matchId2);

        assertEq(escrow.pendingWithdrawal(alice), 1 ether);
    }

    // --- proposeSettlement on unfunded escrow ---

    function test_proposeSettlement_revert_notFunded() public {
        bytes32 matchId2 = keccak256("match-2");
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        settlement.createMatch(matchId2, gameId, players, 1 ether);

        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.EscrowNotFunded.selector, matchId2));
        settlement.proposeSettlement(matchId2, alice, transcriptHash);
    }

    // --- Exact bond amount ---

    function test_disputeSettlement_revert_excessBond() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Settlement.IncorrectDisputeBond.selector, 0.1 ether, 0.2 ether));
        settlement.disputeSettlement{value: 0.2 ether}(matchId, keccak256("bob-transcript"));
    }

    // --- Bond snapshot at proposal time ---

    function test_disputeBond_snapshotAtProposalTime() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        // Owner changes bond after proposal — should not affect this match
        settlement.setDisputeBond(1 ether);

        // Bob can still dispute with the original 0.1 ETH bond
        vm.prank(bob);
        settlement.disputeSettlement{value: 0.1 ether}(matchId, keccak256("bob-transcript"));

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Disputed));
    }

    // --- BondRefundClaimed event ---

    function test_claimBondRefund_emitsEvent() public {
        settlement.setDisputeBond(0.1 ether);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement{value: 0.1 ether}(matchId, keccak256("bob-transcript"));

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, false);

        vm.expectEmit(true, false, false, true);
        emit ISettlement.BondRefundClaimed(bob, 0.1 ether);
        vm.prank(bob);
        settlement.claimBondRefund();
    }

    // --- Bug 8: proposeSettlement reverts when disputeResolution not set ---

    function test_proposeSettlement_revert_disputeResolutionNotSet() public {
        Settlement noDisputeSettlement = new Settlement(address(escrow), DISPUTE_WINDOW, serverAddr);

        vm.prank(serverAddr);
        vm.expectRevert(Settlement.DisputeResolutionNotSet.selector);
        noDisputeSettlement.proposeSettlement(matchId, alice, transcriptHash);
    }

    // --- Bug 3: proposed winner cannot dispute own win ---

    function test_disputeSettlement_revert_cannotDisputeOwnWin() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(alice);
        vm.expectRevert(Settlement.CannotDisputeOwnWin.selector);
        settlement.disputeSettlement(matchId, keccak256("alice-transcript"));
    }

    function test_disputeSettlement_drawCanBeDisputedByAnyPlayer() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, address(0), transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Disputed));
    }

    // --- Bug 6: challenger recorded even with zero bond ---

    function test_disputeSettlement_recordsChallengerWithZeroBond() public {
        assertEq(settlement.disputeBond(), 0);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));

        assertEq(settlement.getDisputeChallenger(matchId), bob);
    }

    // --- Bug 5: finalizeSettlement after emergency withdrawal ---

    function test_finalizeSettlement_afterEmergencyWithdrawal() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);
        vm.prank(bob);
        escrow.emergencyWithdraw(matchId);

        vm.expectEmit(true, false, false, false);
        emit ISettlement.SettlementCallbackFailed(matchId);
        settlement.finalizeSettlement(matchId);

        // Proposal is Finalized (not stuck in Proposed)
        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Finalized));
    }

    function test_finalizeSettlement_draw_afterEmergencyWithdrawal() public {
        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, address(0), transcriptHash);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(alice);
        escrow.emergencyWithdraw(matchId);
        vm.prank(bob);
        escrow.emergencyWithdraw(matchId);

        vm.expectEmit(true, false, false, false);
        emit ISettlement.SettlementCallbackFailed(matchId);
        settlement.finalizeSettlement(matchId);

        // Proposal is Finalized (not stuck in Proposed)
        ISettlement.SettlementProposal memory p = settlement.getProposal(matchId);
        assertEq(uint8(p.status), uint8(ISettlement.SettlementStatus.Finalized));
    }
}

