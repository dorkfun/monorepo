// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {IGameRegistry} from "../src/interfaces/IGameRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract GameRegistryTest is Test {
    GameRegistry public registry;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        registry = new GameRegistry();
    }

    function test_registerGame() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);
        bytes32 gameId = registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);

        assertTrue(registry.isActiveGame(gameId));

        IGameRegistry.GameDefinition memory game = registry.getGame(gameId);
        assertEq(game.name, "Tic-Tac-Toe");
        assertEq(game.codeHash, codeHash);
        assertEq(game.minPlayers, 2);
        assertEq(game.maxPlayers, 2);
        assertEq(game.registeredBy, alice);
        assertTrue(game.active);
    }

    function test_registerGame_emitsEvent() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);

        vm.expectEmit(false, true, false, true);
        emit IGameRegistry.GameRegistered(bytes32(0), "Tic-Tac-Toe", codeHash, alice);

        registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);
    }

    function test_registerGame_revert_emptyName() public {
        vm.expectRevert(GameRegistry.EmptyName.selector);
        registry.registerGame("", keccak256("hash"), 2, 2);
    }

    function test_registerGame_revert_minPlayers() public {
        vm.expectRevert(GameRegistry.MinPlayersTooLow.selector);
        registry.registerGame("Test", keccak256("hash"), 1, 2);
    }

    function test_registerGame_revert_maxLessThanMin() public {
        vm.expectRevert(GameRegistry.MaxPlayersLessThanMin.selector);
        registry.registerGame("Test", keccak256("hash"), 3, 2);
    }

    function test_registerGame_revert_zeroCodeHash() public {
        vm.expectRevert(GameRegistry.ZeroCodeHash.selector);
        registry.registerGame("Test", bytes32(0), 2, 2);
    }

    function test_deactivateGame() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);
        bytes32 gameId = registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);

        vm.prank(alice);
        registry.deactivateGame(gameId);

        assertFalse(registry.isActiveGame(gameId));
    }

    function test_deactivateGame_byOwner() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);
        bytes32 gameId = registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);

        // Contract deployer (this test contract) is the owner
        registry.deactivateGame(gameId);

        assertFalse(registry.isActiveGame(gameId));
    }

    function test_deactivateGame_revert_unauthorized() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);
        bytes32 gameId = registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);

        vm.prank(bob);
        vm.expectRevert(GameRegistry.NotAuthorized.selector);
        registry.deactivateGame(gameId);
    }

    function test_activateGame() public {
        bytes32 codeHash = keccak256("tictactoe-v1");
        vm.prank(alice);
        bytes32 gameId = registry.registerGame("Tic-Tac-Toe", codeHash, 2, 2);

        vm.prank(alice);
        registry.deactivateGame(gameId);
        assertFalse(registry.isActiveGame(gameId));

        vm.prank(alice);
        registry.activateGame(gameId);
        assertTrue(registry.isActiveGame(gameId));
    }

    function test_getGame_revert_notFound() public {
        bytes32 badId = bytes32(uint256(999));
        vm.expectRevert(abi.encodeWithSelector(GameRegistry.GameNotFound.selector, badId));
        registry.getGame(badId);
    }

    function test_transferOwnership() public {
        registry.transferOwnership(alice);
        // Ownership not yet transferred — pending
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), alice);

        // New owner accepts
        vm.prank(alice);
        registry.acceptOwnership();
        assertEq(registry.owner(), alice);
    }

    function test_transferOwnership_revert_notOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        registry.transferOwnership(bob);
    }
}
