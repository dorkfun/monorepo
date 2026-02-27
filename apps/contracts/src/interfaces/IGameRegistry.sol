// SPDX-License-Identifier: MIT
/// @title dork.fun - IGameRegistry
/// @notice Interface for the game registry of the dork.fun competitive gaming platform
/// @custom:website https://dork.fun
pragma solidity ^0.8.34;

interface IGameRegistry {
    struct GameDefinition {
        bytes32 codeHash;
        string name;
        uint8 minPlayers;
        uint8 maxPlayers;
        address registeredBy;
        uint256 registeredAt;
        bool active;
    }

    event GameRegistered(bytes32 indexed gameId, string name, bytes32 codeHash, address indexed registeredBy);
    event GameDeactivated(bytes32 indexed gameId);
    event GameActivated(bytes32 indexed gameId);
    event OpenRegistrationUpdated(bool newValue);

    function registerGame(string calldata name, bytes32 codeHash, uint8 minPlayers, uint8 maxPlayers)
        external
        returns (bytes32 gameId);

    function deactivateGame(bytes32 gameId) external;
    function activateGame(bytes32 gameId) external;
    function getGame(bytes32 gameId) external view returns (GameDefinition memory);
    function isActiveGame(bytes32 gameId) external view returns (bool);
}
