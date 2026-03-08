// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SomniaEventHandler } from "./somnia-reactivity/SomniaEventHandler.sol";

/// @title PixelRoyaleReactivityHandler
/// @notice On-chain reactive handler for critical PixelRoyale events.
///         Subscribed via Somnia Reactivity Precompile (0x0100) to GameStarted
///         and GameEnded events. Validators invoke _onEvent() automatically.
contract PixelRoyaleReactivityHandler is SomniaEventHandler {

    // ── Event topic signatures (keccak256 of event signature) ───────────
    // GameStarted(uint256 indexed gameId, address[] players, uint256 prizePool)
    bytes32 public constant GAME_STARTED_TOPIC = keccak256("GameStarted(uint256,address[],uint256)");
    // GameEnded(uint256 indexed gameId, address indexed winner, address[] placements, uint256 prizePool)
    bytes32 public constant GAME_ENDED_TOPIC = keccak256("GameEnded(uint256,address,address[],uint256)");
    // PlayerEliminated(uint256 indexed gameId, address indexed player, address indexed killer, uint256 placement, uint256 timestamp)
    bytes32 public constant PLAYER_ELIMINATED_TOPIC = keccak256("PlayerEliminated(uint256,address,address,uint256,uint256)");

    // ── State ───────────────────────────────────────────────────────────
    address public owner;
    address public pixelRoyaleContract;

    uint256 public lastGameStartedId;
    uint256 public lastGameEndedId;
    address public lastWinner;
    uint256 public totalGamesHandled;

    uint256 public lastEliminationGameId;
    address public lastEliminatedPlayer;
    address public lastKiller;

    // ── Events emitted by the handler itself ────────────────────────────
    event GameStartHandled(uint256 indexed gameId, uint256 playerCount, uint256 prizePool);
    event GameEndHandled(uint256 indexed gameId, address indexed winner, uint256 prizePool);
    event PlayerEliminationHandled(uint256 indexed gameId, address indexed player, address indexed killer, uint256 placement);

    // ── Constructor ─────────────────────────────────────────────────────
    constructor(address _pixelRoyaleContract) {
        owner = msg.sender;
        pixelRoyaleContract = _pixelRoyaleContract;
    }

    // ── Reactive handler ────────────────────────────────────────────────
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        // Only process events from our PixelRoyale contract
        if (emitter != pixelRoyaleContract) return;
        if (eventTopics.length == 0) return;

        bytes32 topic0 = eventTopics[0];

        if (topic0 == GAME_STARTED_TOPIC) {
            _handleGameStarted(eventTopics, data);
        } else if (topic0 == GAME_ENDED_TOPIC) {
            _handleGameEnded(eventTopics, data);
        } else if (topic0 == PLAYER_ELIMINATED_TOPIC) {
            _handlePlayerEliminated(eventTopics, data);
        }
    }

    function _handleGameStarted(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal {
        // eventTopics[1] = indexed gameId (as bytes32)
        uint256 gameId = uint256(eventTopics[1]);

        // data = abi.encode(address[] players, uint256 prizePool)
        (address[] memory players, uint256 prizePool) = abi.decode(data, (address[], uint256));

        lastGameStartedId = gameId;
        totalGamesHandled++;

        emit GameStartHandled(gameId, players.length, prizePool);
    }

    function _handleGameEnded(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal {
        // eventTopics[1] = indexed gameId, eventTopics[2] = indexed winner
        uint256 gameId = uint256(eventTopics[1]);
        address winner = address(uint160(uint256(eventTopics[2])));

        // data = abi.encode(address[] placements, uint256 prizePool)
        (, uint256 prizePool) = abi.decode(data, (address[], uint256));

        lastGameEndedId = gameId;
        lastWinner = winner;

        emit GameEndHandled(gameId, winner, prizePool);
    }

    function _handlePlayerEliminated(
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal {
        // eventTopics[1] = indexed gameId, eventTopics[2] = indexed player, eventTopics[3] = indexed killer
        uint256 gameId = uint256(eventTopics[1]);
        address player = address(uint160(uint256(eventTopics[2])));
        address killer = address(uint160(uint256(eventTopics[3])));

        // data = abi.encode(uint256 placement, uint256 timestamp)
        (uint256 placement,) = abi.decode(data, (uint256, uint256));

        lastEliminationGameId = gameId;
        lastEliminatedPlayer = player;
        lastKiller = killer;

        emit PlayerEliminationHandled(gameId, player, killer, placement);
    }

    // ── Admin ───────────────────────────────────────────────────────────
    function setPixelRoyaleContract(address _contract) external {
        require(msg.sender == owner, "NOT_OWNER");
        pixelRoyaleContract = _contract;
    }
}
