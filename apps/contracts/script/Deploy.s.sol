// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

import {Script, console} from "forge-std/Script.sol";
import {GameRegistry} from "../src/GameRegistry.sol";
import {Escrow} from "../src/Escrow.sol";
import {Settlement} from "../src/Settlement.sol";
import {DisputeResolution} from "../src/DisputeResolution.sol";

contract Deploy is Script {
    uint256 public constant DISPUTE_WINDOW = 1 hours;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address serverAddress = vm.envAddress("SERVER_ADDRESS");
        address resolverAddress = vm.envOr("RESOLVER_ADDRESS", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy GameRegistry
        GameRegistry gameRegistry = new GameRegistry();
        console.log("GameRegistry deployed at:", address(gameRegistry));

        // 2. Deploy Escrow (settlement address(0) — wired up after Settlement deploy)
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(0)));
        address treasuryAddress = vm.envOr("TREASURY_ADDRESS", address(0));
        uint256 minimumStake = vm.envOr("MINIMUM_STAKE", uint256(0));
        Escrow escrow = new Escrow(
            address(gameRegistry),
            address(0), // settlement not yet deployed
            feeBps,
            treasuryAddress,
            minimumStake
        );
        console.log("Escrow deployed at:", address(escrow));

        // 3. Deploy Settlement (needs Escrow address + dispute window + server)
        Settlement settlement = new Settlement(address(escrow), DISPUTE_WINDOW, serverAddress);
        console.log("Settlement deployed at:", address(settlement));

        // 4. Deploy DisputeResolution (needs Settlement address + resolver)
        DisputeResolution disputeResolution = new DisputeResolution(address(settlement), resolverAddress);
        console.log("DisputeResolution deployed at:", address(disputeResolution));
        console.log("Resolver set to:", resolverAddress);

        // 5. Wire up contracts
        escrow.setSettlementContract(address(settlement));
        settlement.setDisputeResolution(address(disputeResolution));

        // 6c. Configure dispute bond (optional)
        uint256 disputeBondAmount = vm.envOr("DISPUTE_BOND", uint256(0));
        if (disputeBondAmount > 0) {
            settlement.setDisputeBond(disputeBondAmount);
            console.log("Dispute bond set:", disputeBondAmount);
        }

        console.log("All contracts wired up successfully");

        // 7. Register all games
        // Server-side slugs map to on-chain display names:
        //   tictactoe → "Tic-Tac-Toe", chess → "Chess", connectfour → "Connect Four",
        //   checkers → "Checkers", othello → "Othello", hex → "Hex"
        bytes32 tictactoeId = gameRegistry.registerGame("Tic-Tac-Toe", keccak256("tictactoe-v1"), 2, 2);
        console.log("Tic-Tac-Toe registered:");
        console.logBytes32(tictactoeId);

        bytes32 chessId = gameRegistry.registerGame("Chess", keccak256("chess-v1"), 2, 2);
        console.log("Chess registered:");
        console.logBytes32(chessId);

        bytes32 connectfourId = gameRegistry.registerGame("Connect Four", keccak256("connectfour-v1"), 2, 2);
        console.log("Connect Four registered:");
        console.logBytes32(connectfourId);

        bytes32 checkersId = gameRegistry.registerGame("Checkers", keccak256("checkers-v1"), 2, 2);
        console.log("Checkers registered:");
        console.logBytes32(checkersId);

        bytes32 othelloId = gameRegistry.registerGame("Othello", keccak256("othello-v1"), 2, 2);
        console.log("Othello registered:");
        console.logBytes32(othelloId);

        bytes32 hexId = gameRegistry.registerGame("Hex", keccak256("hex-v1"), 2, 2);
        console.log("Hex registered:");
        console.logBytes32(hexId);

        // NOTE: Sudoku (1 player) is not registered on-chain because
        // GameRegistry requires minPlayers >= 2. Single-player games
        // don't use the escrow/settlement system.

        // Log GAME_ONCHAIN_IDS for server config (copy this JSON into the env var)
        console.log("---");
        console.log("GAME_ONCHAIN_IDS for server config:");
        console.log("  tictactoe:");
        console.logBytes32(tictactoeId);
        console.log("  chess:");
        console.logBytes32(chessId);
        console.log("  connectfour:");
        console.logBytes32(connectfourId);
        console.log("  checkers:");
        console.logBytes32(checkersId);
        console.log("  othello:");
        console.logBytes32(othelloId);
        console.log("  hex:");
        console.logBytes32(hexId);
        console.log("---");

        vm.stopBroadcast();
    }
}
