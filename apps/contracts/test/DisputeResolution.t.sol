// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {Escrow} from "../src/Escrow.sol";
import {Settlement} from "../src/Settlement.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";
import {IDisputeResolution} from "../src/interfaces/IDisputeResolution.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DisputeResolutionTest is Test {
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

    receive() external payable {}

    function setUp() public {
        registry = new GameRegistry();
        escrow = new Escrow(address(registry), address(0), 0, address(0), 0);
        settlement = new Settlement(address(escrow), DISPUTE_WINDOW, serverAddr);
        disputeResolution = new DisputeResolution(address(settlement), resolverAddr);

        escrow.setSettlementContract(address(settlement));
        settlement.setDisputeResolution(address(disputeResolution));

        gameId = registry.registerGame("Tic-Tac-Toe", keccak256("ttt-v1"), 2, 2);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _createFundedMatchAndDispute() internal {
        address[] memory players = new address[](2);
        players[0] = alice;
        players[1] = bob;

        vm.prank(serverAddr);
        settlement.createMatch(matchId, gameId, players, 1 ether);

        vm.prank(alice);
        escrow.depositStake{value: 1 ether}(matchId);
        vm.prank(bob);
        escrow.depositStake{value: 1 ether}(matchId);

        vm.prank(serverAddr);
        settlement.proposeSettlement(matchId, alice, transcriptHash);

        vm.prank(bob);
        settlement.disputeSettlement(matchId, keccak256("bob-transcript"));
    }

    // --- setMaxResolutionPeriod tests ---

    function test_setMaxResolutionPeriod_revert_belowMinimum() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                DisputeResolution.ResolutionPeriodTooShort.selector, uint256(30 minutes), uint256(1 hours)
            )
        );
        disputeResolution.setMaxResolutionPeriod(30 minutes);
    }

    function test_setMaxResolutionPeriod_atMinimum() public {
        disputeResolution.setMaxResolutionPeriod(1 hours);
        assertEq(disputeResolution.maxResolutionPeriod(), 1 hours);
    }

    function test_setMaxResolutionPeriod_valid() public {
        disputeResolution.setMaxResolutionPeriod(7 days);
        assertEq(disputeResolution.maxResolutionPeriod(), 7 days);
    }

    function test_setMaxResolutionPeriod_revert_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        disputeResolution.setMaxResolutionPeriod(7 days);
    }

    // --- setResolver tests ---

    function test_setResolver() public {
        address newResolver = makeAddr("newResolver");
        disputeResolution.setResolver(newResolver);
        assertEq(disputeResolution.resolver(), newResolver);
    }

    function test_setResolver_revert_zeroAddress() public {
        vm.expectRevert(DisputeResolution.ZeroAddress.selector);
        disputeResolution.setResolver(address(0));
    }

    // --- openDispute tests ---

    function test_openDispute_revert_notSettlement() public {
        vm.prank(alice);
        vm.expectRevert(DisputeResolution.NotSettlement.selector);
        disputeResolution.openDispute(matchId, alice, keccak256("a"), keccak256("b"));
    }

    function test_openDispute_revert_duplicateDispute() public {
        _createFundedMatchAndDispute();

        vm.prank(address(settlement));
        vm.expectRevert(abi.encodeWithSelector(DisputeResolution.DisputeAlreadyExists.selector, matchId));
        disputeResolution.openDispute(matchId, alice, keccak256("a"), keccak256("b"));
    }

    // --- resolveDispute tests ---

    function test_resolveDispute_revert_doubleResolve() public {
        _createFundedMatchAndDispute();

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, true);

        vm.prank(resolverAddr);
        vm.expectRevert(abi.encodeWithSelector(DisputeResolution.DisputeNotOpen.selector, matchId));
        disputeResolution.resolveDispute(matchId, true);
    }

    // --- expireDispute boundary tests ---

    function test_expireDispute_revert_atExactDeadline() public {
        _createFundedMatchAndDispute();

        IDisputeResolution.Dispute memory d = disputeResolution.getDispute(matchId);

        vm.warp(d.deadline);

        vm.expectRevert(abi.encodeWithSelector(DisputeResolution.DisputeNotExpired.selector, matchId));
        disputeResolution.expireDispute(matchId);
    }

    function test_expireDispute_succeedsAfterDeadline() public {
        _createFundedMatchAndDispute();

        IDisputeResolution.Dispute memory d = disputeResolution.getDispute(matchId);

        vm.warp(d.deadline + 1);

        disputeResolution.expireDispute(matchId);

        IDisputeResolution.Dispute memory resolved = disputeResolution.getDispute(matchId);
        assertEq(uint8(resolved.status), uint8(IDisputeResolution.DisputeStatus.ResolvedInvalid));
    }

    function test_expireDispute_revert_alreadyResolved() public {
        _createFundedMatchAndDispute();

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(resolverAddr);
        disputeResolution.resolveDispute(matchId, true);

        IDisputeResolution.Dispute memory d = disputeResolution.getDispute(matchId);
        vm.warp(d.deadline + 1);

        vm.expectRevert(abi.encodeWithSelector(DisputeResolution.DisputeNotOpen.selector, matchId));
        disputeResolution.expireDispute(matchId);
    }

    // --- resolver change during active dispute ---

    function test_resolverChange_duringActiveDispute() public {
        _createFundedMatchAndDispute();

        address newResolver = makeAddr("newResolver");
        disputeResolution.setResolver(newResolver);

        vm.warp(block.timestamp + 1 hours + 1);

        // Old resolver can no longer resolve
        vm.prank(resolverAddr);
        vm.expectRevert(DisputeResolution.NotResolver.selector);
        disputeResolution.resolveDispute(matchId, true);

        // New resolver can resolve
        vm.prank(newResolver);
        disputeResolution.resolveDispute(matchId, true);
    }
}
