// SPDX-License-Identifier: MIT
/// @title dork.fun - GameRegistry
/// @notice On-chain registry of verified games for the dork.fun competitive gaming platform
/// @custom:website https://dork.fun
pragma solidity ^0.8.34;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IGameRegistry} from "./interfaces/IGameRegistry.sol";

contract GameRegistry is IGameRegistry, Ownable2Step {
    error GameNotFound(bytes32 gameId);
    error EmptyName();
    error MinPlayersTooLow();
    error MaxPlayersLessThanMin();
    error ZeroCodeHash();
    error GameAlreadyExists(bytes32 gameId);
    error NotAuthorized();
    error AlreadyInactive();
    error AlreadyActive();
    error RegistrationRestricted();

    mapping(bytes32 => GameDefinition) private _games;
    uint256 private _gameCount;
    bool public openRegistration;

    modifier gameExists(bytes32 gameId) {
        if (_games[gameId].registeredAt == 0) revert GameNotFound(gameId);
        _;
    }

    constructor() Ownable(msg.sender) {}

    function registerGame(string calldata name, bytes32 codeHash, uint8 minPlayers, uint8 maxPlayers)
        external
        returns (bytes32 gameId)
    {
        if (!openRegistration && msg.sender != owner()) revert RegistrationRestricted();
        if (bytes(name).length == 0) revert EmptyName();
        if (minPlayers < 2) revert MinPlayersTooLow();
        if (maxPlayers < minPlayers) revert MaxPlayersLessThanMin();
        if (codeHash == bytes32(0)) revert ZeroCodeHash();

        gameId = keccak256(abi.encodePacked(name, codeHash, msg.sender, _gameCount));
        if (_games[gameId].registeredAt != 0) revert GameAlreadyExists(gameId);

        _games[gameId] = GameDefinition({
            codeHash: codeHash,
            name: name,
            minPlayers: minPlayers,
            maxPlayers: maxPlayers,
            registeredBy: msg.sender,
            registeredAt: block.timestamp,
            active: true
        });

        _gameCount++;
        emit GameRegistered(gameId, name, codeHash, msg.sender);
    }

    function deactivateGame(bytes32 gameId) external gameExists(gameId) {
        GameDefinition storage game = _games[gameId];
        if (msg.sender != game.registeredBy && msg.sender != owner()) revert NotAuthorized();
        if (!game.active) revert AlreadyInactive();

        game.active = false;
        emit GameDeactivated(gameId);
    }

    function activateGame(bytes32 gameId) external gameExists(gameId) {
        GameDefinition storage game = _games[gameId];
        if (msg.sender != game.registeredBy && msg.sender != owner()) revert NotAuthorized();
        if (game.active) revert AlreadyActive();

        game.active = true;
        emit GameActivated(gameId);
    }

    function setOpenRegistration(bool _open) external onlyOwner {
        openRegistration = _open;
        emit OpenRegistrationUpdated(_open);
    }

    function getGame(bytes32 gameId) external view gameExists(gameId) returns (GameDefinition memory) {
        return _games[gameId];
    }

    function isActiveGame(bytes32 gameId) external view returns (bool) {
        return _games[gameId].active && _games[gameId].registeredAt != 0;
    }
}
