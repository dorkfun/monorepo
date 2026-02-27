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

        // 2. Deploy Escrow (needs GameRegistry address)
        Escrow escrow = new Escrow(address(gameRegistry));
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

        // 6. Configure protocol fee (optional)
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(0)));
        address treasuryAddress = vm.envOr("TREASURY_ADDRESS", address(0));
        if (feeBps > 0 && treasuryAddress != address(0)) {
            escrow.setFee(feeBps, treasuryAddress);
            console.log("Protocol fee set:", feeBps, "bps, treasury:", treasuryAddress);
        }

        // 6b. Configure minimum stake (optional)
        uint256 minimumStake = vm.envOr("MINIMUM_STAKE", uint256(0));
        if (minimumStake > 0) {
            escrow.setMinimumStake(minimumStake);
            console.log("Minimum stake set:", minimumStake);
        }

        console.log("All contracts wired up successfully");

        // 7. Register Tic-Tac-Toe game
        bytes32 tttCodeHash = keccak256("tictactoe-v1");
        bytes32 tttGameId = gameRegistry.registerGame("Tic-Tac-Toe", tttCodeHash, 2, 2);
        console.log("Tic-Tac-Toe registered with gameId:");
        console.logBytes32(tttGameId);

        vm.stopBroadcast();
    }
}
