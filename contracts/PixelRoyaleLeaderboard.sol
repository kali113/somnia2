// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SomniaEventHandler } from "./somnia-reactivity/SomniaEventHandler.sol";

/// @title PixelRoyaleLeaderboard
/// @notice Cross-contract reactive leaderboard that updates itself whenever a
///         PixelRoyale game ends.
contract PixelRoyaleLeaderboard is SomniaEventHandler {
    bytes32 public constant GAME_ENDED_TOPIC = keccak256("GameEnded(uint256,address,address[],uint256)");

    uint16[5] internal REWARD_BPS = [400, 250, 175, 100, 75];
    uint256 internal constant MAX_TOP_PLAYERS = 10;

    struct PlayerStanding {
        uint256 gamesPlayed;
        uint256 wins;
        uint256 totalEarned;
        uint256 lastGameId;
    }

    address public owner;
    address public pixelRoyaleContract;
    uint256 public totalGamesProcessed;

    mapping(uint256 => bool) public processedGames;
    mapping(address => PlayerStanding) public standings;

    address[] private topByWins;
    address[] private topByEarnings;

    event LeaderboardUpdated(
        uint256 indexed gameId,
        address indexed winner,
        uint256 playerCount,
        uint256 prizePool
    );

    constructor(address _pixelRoyaleContract) {
        owner = msg.sender;
        pixelRoyaleContract = _pixelRoyaleContract;
    }

    function setPixelRoyaleContract(address _pixelRoyaleContract) external {
        require(msg.sender == owner, "NOT_OWNER");
        pixelRoyaleContract = _pixelRoyaleContract;
    }

    function getStanding(address player) external view returns (PlayerStanding memory) {
        return standings[player];
    }

    function getTopByWins() external view returns (address[] memory) {
        return topByWins;
    }

    function getTopByEarnings() external view returns (address[] memory) {
        return topByEarnings;
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
        if (processedGames[gameId]) {
            return;
        }

        address winner = address(uint160(uint256(eventTopics[2])));
        (address[] memory placements, uint256 prizePool) = abi.decode(data, (address[], uint256));

        processedGames[gameId] = true;
        totalGamesProcessed += 1;

        uint256 distributable = (prizePool * 900) / 1000;
        uint256 rewardSlots = placements.length < 5 ? placements.length : 5;

        for (uint256 i = 0; i < placements.length; i++) {
            PlayerStanding storage standing = standings[placements[i]];
            standing.gamesPlayed += 1;
            standing.lastGameId = gameId;

            if (i == 0) {
                standing.wins += 1;
            }

            if (i < rewardSlots) {
                standing.totalEarned += (distributable * REWARD_BPS[i]) / 1000;
            }

            _updateTopByWins(placements[i]);
            _updateTopByEarnings(placements[i]);
        }

        emit LeaderboardUpdated(gameId, winner, placements.length, prizePool);
    }

    function _updateTopByWins(address player) internal {
        _ensurePresent(topByWins, player);
        _sortByWins(topByWins);
        _trim(topByWins);
    }

    function _updateTopByEarnings(address player) internal {
        _ensurePresent(topByEarnings, player);
        _sortByEarnings(topByEarnings);
        _trim(topByEarnings);
    }

    function _ensurePresent(address[] storage list, address player) internal {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == player) {
                return;
            }
        }

        list.push(player);
    }

    function _sortByWins(address[] storage list) internal {
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            for (uint256 j = i + 1; j < len; j++) {
                if (_compareWins(list[j], list[i])) {
                    (list[i], list[j]) = (list[j], list[i]);
                }
            }
        }
    }

    function _sortByEarnings(address[] storage list) internal {
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            for (uint256 j = i + 1; j < len; j++) {
                if (_compareEarnings(list[j], list[i])) {
                    (list[i], list[j]) = (list[j], list[i]);
                }
            }
        }
    }

    function _trim(address[] storage list) internal {
        while (list.length > MAX_TOP_PLAYERS) {
            list.pop();
        }
    }

    function _compareWins(address left, address right) internal view returns (bool) {
        PlayerStanding storage a = standings[left];
        PlayerStanding storage b = standings[right];

        if (a.wins != b.wins) {
            return a.wins > b.wins;
        }

        if (a.totalEarned != b.totalEarned) {
            return a.totalEarned > b.totalEarned;
        }

        return left < right;
    }

    function _compareEarnings(address left, address right) internal view returns (bool) {
        PlayerStanding storage a = standings[left];
        PlayerStanding storage b = standings[right];

        if (a.totalEarned != b.totalEarned) {
            return a.totalEarned > b.totalEarned;
        }

        if (a.wins != b.wins) {
            return a.wins > b.wins;
        }

        return left < right;
    }
}
