// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {Escrow} from "../src/Escrow.sol";
import {Settlement} from "../src/Settlement.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
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

    function setUp() public {
        // Deploy all contracts
        registry = new GameRegistry();
        escrow = new Escrow(address(registry));
        settlement = new Settlement(address(escrow), DISPUTE_WINDOW, serverAddr);
        disputeResolution = new DisputeResolution(address(settlement), resolverAddr);

        // Wire up contracts
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

    // --- registerMatchPlayers guard (M-2) ---

    function test_registerMatchPlayers_revert_alreadyRegistered() public {
        // matchId was already registered via createMatch in setUp
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        vm.expectRevert(abi.encodeWithSelector(Settlement.PlayersAlreadyRegistered.selector, matchId));
        settlement.registerMatchPlayers(matchId, players);
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
}
