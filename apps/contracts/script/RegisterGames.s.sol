// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {GameRegistry} from "../src/GameRegistry.sol";

contract RegisterGames is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("GAME_REGISTRY_ADDRESS");

        GameRegistry gameRegistry = GameRegistry(registryAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Tic-Tac-Toe (2 players)
        bytes32 tttId = gameRegistry.registerGame("Tic-Tac-Toe", keccak256("tictactoe-v1"), 2, 2);
        console.log("Tic-Tac-Toe registered:");
        console.logBytes32(tttId);

        // Chess (2 players)
        bytes32 chessId = gameRegistry.registerGame("Chess", keccak256("chess-v1"), 2, 2);
        console.log("Chess registered:");
        console.logBytes32(chessId);

        // Connect Four (2 players)
        bytes32 c4Id = gameRegistry.registerGame("Connect Four", keccak256("connectfour-v1"), 2, 2);
        console.log("Connect Four registered:");
        console.logBytes32(c4Id);

        // Checkers (2 players)
        bytes32 checkersId = gameRegistry.registerGame("Checkers", keccak256("checkers-v1"), 2, 2);
        console.log("Checkers registered:");
        console.logBytes32(checkersId);

        // Othello (2 players)
        bytes32 othelloId = gameRegistry.registerGame("Othello", keccak256("othello-v1"), 2, 2);
        console.log("Othello registered:");
        console.logBytes32(othelloId);

        // Hex (2 players)
        bytes32 hexId = gameRegistry.registerGame("Hex", keccak256("hex-v1"), 2, 2);
        console.log("Hex registered:");
        console.logBytes32(hexId);

        // NOTE: Sudoku (1 player) cannot be registered on-chain because
        // GameRegistry requires minPlayers >= 2. Sudoku is a single-player
        // puzzle game that doesn't use the escrow/settlement system.

        vm.stopBroadcast();
    }
}
