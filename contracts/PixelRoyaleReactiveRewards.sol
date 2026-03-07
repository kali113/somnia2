// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SomniaEventHandler } from "./somnia-reactivity/SomniaEventHandler.sol";

interface IPixelRoyaleRewards {
    function claimRewardsFor(address player) external returns (uint256 amount);
}

/// @title PixelRoyaleReactiveRewards
/// @notice Pushes pending rewards immediately after a game ends by reacting to
///         the GameEnded event and calling claimRewardsFor on the main contract.
contract PixelRoyaleReactiveRewards is SomniaEventHandler {
    bytes32 public constant GAME_ENDED_TOPIC = keccak256("GameEnded(uint256,address,address[],uint256)");

    address public owner;
    address public pixelRoyaleContract;

    uint256 public totalAutoClaimAttempts;
    uint256 public totalAutoClaimSuccesses;

    event ReactiveRewardClaim(
        uint256 indexed gameId,
        address indexed player,
        uint256 placement,
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

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal override {
        if (emitter != pixelRoyaleContract) {
            return;
        }

        if (eventTopics.length == 0 || eventTopics[0] != GAME_ENDED_TOPIC) {
            return;
        }

        uint256 gameId = uint256(eventTopics[1]);
        (address[] memory placements, ) = abi.decode(data, (address[], uint256));

        uint256 rewardSlots = placements.length < 5 ? placements.length : 5;
        for (uint256 i = 0; i < rewardSlots; i++) {
            totalAutoClaimAttempts += 1;

            (bool success, bytes memory returnData) = pixelRoyaleContract.call(
                abi.encodeCall(IPixelRoyaleRewards.claimRewardsFor, (placements[i]))
            );

            if (success) {
                totalAutoClaimSuccesses += 1;
            }

            emit ReactiveRewardClaim(gameId, placements[i], i + 1, success, returnData);
        }
    }
}
