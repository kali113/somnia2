// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SomniaEventHandler } from "./somnia-reactivity/SomniaEventHandler.sol";

interface IPixelRoyaleMatchmaking {
    function forceStartGame() external;
}

/// @title PixelRoyaleReactiveOrchestrator
/// @notice Reactive orchestrator that attempts to start queued games whenever
///         new players join. Set this contract as the PixelRoyale orchestrator.
contract PixelRoyaleReactiveOrchestrator is SomniaEventHandler {
    bytes32 public constant PLAYER_JOINED_QUEUE_TOPIC = keccak256("PlayerJoinedQueue(address,uint256)");

    address public owner;
    address public pixelRoyaleContract;

    uint256 public triggerCount;
    uint256 public successfulForceStarts;
    uint256 public failedForceStarts;

    event ReactiveForceStartAttempt(
        address indexed player,
        uint256 queueSize,
        bool success,
        bytes returnData
    );

    constructor(address _pixelRoyaleContract) {
        owner = msg.sender;
        pixelRoyaleContract = _pixelRoyaleContract;
    }

    function setPixelRoyaleContract(address _pixelRoyaleContract) external {
        require(msg.sender == owner, "NOT_OWNER");
        pixelRoyaleContract = _pixelRoyaleContract;
    }

    function manualForceStart() external {
        require(msg.sender == owner, "NOT_OWNER");
        _attemptForceStart(address(0), 0);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != pixelRoyaleContract) {
            return;
        }

        if (eventTopics.length == 0 || eventTopics[0] != PLAYER_JOINED_QUEUE_TOPIC) {
            return;
        }

        address player = address(uint160(uint256(eventTopics[1])));
        uint256 queueSize = abi.decode(data, (uint256));
        _attemptForceStart(player, queueSize);
    }

    function _attemptForceStart(address player, uint256 queueSize) internal {
        triggerCount += 1;

        (bool success, bytes memory returnData) = pixelRoyaleContract.call(
            abi.encodeCall(IPixelRoyaleMatchmaking.forceStartGame, ())
        );

        if (success) {
            successfulForceStarts += 1;
        } else {
            failedForceStarts += 1;
        }

        emit ReactiveForceStartAttempt(player, queueSize, success, returnData);
    }
}
