// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PixelRoyale
 * @notice On-chain queue, session key management, and reward distribution
 *         for the Pixel Royale battle-royale game on Somnia Testnet.
 *
 *  Flow
 *  ─────
 *  1. Player connects wallet on the dashboard.
 *  2. Player calls `joinQueue{value: entryFee}()`.
 *  3. Player calls `approveSessionKey(sessionAddr, expiry)` so the
 *     temporary in-browser wallet can act on their behalf during the game.
 *  4. When the lobby is full (MAX_PLAYERS) **or** the orchestrator triggers
 *     it after a timeout with enough players, `_startGame()` fires.
 *  5. The authorised orchestrator backend calls `submitGameResult(...)` when
 *     the match ends; rewards are distributed from the prize pool.
 *  6. Players can `claimRewards()` at any time to withdraw earned STT.
 */
contract PixelRoyale {
    // ──────────────────────────── Constants ────────────────────────────
    uint256 public constant MAX_PLAYERS       = 20;
    uint256 public constant MIN_PLAYERS       = 2;
    uint256 public constant ENTRY_FEE         = 0.001 ether; // 0.001 STT
    uint256 public constant QUEUE_TIMEOUT     = 120;          // seconds

    // Reward split (out of 1000 basis points of the pool)
    uint16[5] public REWARD_BPS = [400, 250, 175, 100, 75]; // 1st–5th

    // ──────────────────────────── State ────────────────────────────────
    address public owner;
    address public orchestrator;
    uint256 public nextGameId;

    // Queue
    address[] public queue;
    mapping(address => bool) public inQueue;
    uint256 public queueOpenedAt;

    // Session keys: player => sessionKey => expiry timestamp
    mapping(address => mapping(address => uint256)) public sessionKeys;

    // Rewards ledger
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public totalEarned;

    // Per-game results (for history queries)
    struct GameResult {
        uint256  gameId;
        uint256  timestamp;
        address  winner;
        address[] placements;   // ordered 1st → last
        uint256  prizePool;
        uint8    playerCount;
    }
    GameResult[] public gameHistory;
    mapping(address => uint256[]) public playerGames; // player => gameId[]

    // Verified container open history
    mapping(address => mapping(bytes32 => bool)) public playerContainerOpened;

    struct ContainerReward {
        uint8 weaponCode;
        uint8 weaponRarity;
        uint16 ammoAmount;
        uint8 ammoWeaponCode;
        uint8 consumableCode;
        uint8 consumableAmount;
        uint16 woodAmount;
        uint16 stoneAmount;
        uint16 metalAmount;
    }

    // Per-player aggregate stats
    struct PlayerStats {
        uint256 gamesPlayed;
        uint256 wins;
        uint256 kills;
        uint256 totalEarned;
    }
    mapping(address => PlayerStats) public stats;

    // ──────────────────────────── Events ───────────────────────────────
    event PlayerJoinedQueue(address indexed player, uint256 queueSize);
    event PlayerLeftQueue(address indexed player, uint256 queueSize);
    event GameStarted(uint256 indexed gameId, address[] players, uint256 prizePool);
    event GameEnded(uint256 indexed gameId, address indexed winner, address[] placements, uint256 prizePool);
    event RewardClaimed(address indexed player, uint256 amount);
    event SessionKeyApproved(address indexed player, address indexed sessionKey, uint256 expiry);
    event SessionKeyRevoked(address indexed player, address indexed sessionKey);
    event OrchestratorUpdated(address indexed oldOrch, address indexed newOrch);
    event ContainerOpened(
        uint256 indexed gameId,
        uint256 containerId,
        address indexed player,
        bytes32 indexed containerKey,
        uint8 containerType,
        uint16 roll,
        uint8 weaponCode,
        uint8 weaponRarity,
        uint16 ammoAmount,
        uint8 ammoWeaponCode,
        uint8 consumableCode,
        uint8 consumableAmount,
        uint16 woodAmount,
        uint16 stoneAmount,
        uint16 metalAmount,
        uint256 timestamp
    );

    // ──────────────────────────── Modifiers ────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }
    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "NOT_ORCHESTRATOR");
        _;
    }

    // ──────────────────────────── Constructor ──────────────────────────
    constructor(address _orchestrator) {
        owner = msg.sender;
        orchestrator = _orchestrator;
    }

    // ──────────────────────────── Queue ────────────────────────────────

    /// @notice Join the game queue. Requires exactly ENTRY_FEE STT.
    function joinQueue() external payable {
        require(msg.value == ENTRY_FEE, "WRONG_FEE");
        require(!inQueue[msg.sender], "ALREADY_IN_QUEUE");
        require(queue.length < MAX_PLAYERS, "QUEUE_FULL");

        if (queue.length == 0) {
            queueOpenedAt = block.timestamp;
        }

        queue.push(msg.sender);
        inQueue[msg.sender] = true;

        emit PlayerJoinedQueue(msg.sender, queue.length);

        if (queue.length == MAX_PLAYERS) {
            _startGame();
        }
    }

    /// @notice Leave the queue before the game starts. Entry fee is refunded.
    function leaveQueue() external {
        require(inQueue[msg.sender], "NOT_IN_QUEUE");
        _removeFromQueue(msg.sender);
        emit PlayerLeftQueue(msg.sender, queue.length);
        // Refund
        (bool ok, ) = msg.sender.call{value: ENTRY_FEE}("");
        require(ok, "REFUND_FAILED");
    }

    /// @notice Orchestrator can force-start a game after timeout if MIN_PLAYERS met.
    function forceStartGame() external onlyOrchestrator {
        require(queue.length >= MIN_PLAYERS, "NOT_ENOUGH_PLAYERS");
        require(block.timestamp >= queueOpenedAt + QUEUE_TIMEOUT, "TOO_EARLY");
        _startGame();
    }

    function getQueuePlayers() external view returns (address[] memory) {
        return queue;
    }

    function getQueueSize() external view returns (uint256) {
        return queue.length;
    }

    // ──────────────────────────── Session Keys ─────────────────────────

    /// @notice Approve a session key to act on your behalf during a game.
    /// @param _sessionKey The address of the ephemeral wallet.
    /// @param _expiry     Unix timestamp when the session expires.
    function approveSessionKey(address _sessionKey, uint256 _expiry) external {
        require(_sessionKey != address(0), "ZERO_ADDRESS");
        require(_expiry > block.timestamp, "EXPIRY_PAST");
        sessionKeys[msg.sender][_sessionKey] = _expiry;
        emit SessionKeyApproved(msg.sender, _sessionKey, _expiry);
    }

    /// @notice Revoke a session key.
    function revokeSessionKey(address _sessionKey) external {
        sessionKeys[msg.sender][_sessionKey] = 0;
        emit SessionKeyRevoked(msg.sender, _sessionKey);
    }

    /// @notice Check whether a session key is currently valid for a player.
    function isValidSession(address _player, address _sessionKey) external view returns (bool) {
        return sessionKeys[_player][_sessionKey] > block.timestamp;
    }

    // ──────────────────────────── Game Results ─────────────────────────

    /// @notice Submit the final result of a game. Only callable by orchestrator.
    /// @param _gameId      Must match `nextGameId - 1` of the most recent game.
    /// @param _placements  Ordered array of player addresses (index 0 = winner).
    /// @param _kills       Parallel array of kill counts per player.
    function submitGameResult(
        uint256 _gameId,
        address[] calldata _placements,
        uint256[] calldata _kills
    ) external onlyOrchestrator {
        require(_placements.length > 0, "EMPTY_PLACEMENTS");
        require(_placements.length == _kills.length, "LENGTH_MISMATCH");

        uint256 pool = ENTRY_FEE * _placements.length;
        // 10% of pool kept as protocol fee
        uint256 distributable = (pool * 900) / 1000;

        // Distribute rewards to top 5 (or fewer if less than 5 players)
        uint256 rewardSlots = _placements.length < 5 ? _placements.length : 5;
        uint256 totalDistributed = 0;

        for (uint256 i = 0; i < rewardSlots; i++) {
            uint256 reward = (distributable * REWARD_BPS[i]) / 1000;
            pendingRewards[_placements[i]] += reward;
            totalEarned[_placements[i]] += reward;
            stats[_placements[i]].totalEarned += reward;
            totalDistributed += reward;
        }

        // Remainder stays in contract as protocol revenue
        // Update stats
        for (uint256 i = 0; i < _placements.length; i++) {
            stats[_placements[i]].gamesPlayed += 1;
            stats[_placements[i]].kills += _kills[i];
            playerGames[_placements[i]].push(_gameId);
        }
        stats[_placements[0]].wins += 1;

        // Store result
        GameResult memory result = GameResult({
            gameId: _gameId,
            timestamp: block.timestamp,
            winner: _placements[0],
            placements: _placements,
            prizePool: pool,
            playerCount: uint8(_placements.length)
        });
        gameHistory.push(result);

        emit GameEnded(_gameId, _placements[0], _placements, pool);
    }

    // ──────────────────────────── Verified Containers ───────────────────

    /// @notice Open a loot container with deterministic on-chain reward derivation.
    function openContainerVerified(
        uint256 _gameId,
        uint256 _containerId,
        bytes32 _containerKey,
        uint8 _containerType,
        uint32 _seed,
        uint32 _playerNonce
    ) external {
        require(_containerKey != bytes32(0), "INVALID_CONTAINER_KEY");
        require(_containerType <= 2, "INVALID_CONTAINER_TYPE");
        require(!playerContainerOpened[msg.sender][_containerKey], "CONTAINER_ALREADY_OPENED");

        uint16 roll = _deriveRoll(_gameId, _containerId, _containerKey, _containerType, _seed, _playerNonce);
        ContainerReward memory reward = _deriveContainerReward(_containerType, roll, _playerNonce);

        playerContainerOpened[msg.sender][_containerKey] = true;

        emit ContainerOpened(
            _gameId,
            _containerId,
            msg.sender,
            _containerKey,
            _containerType,
            roll,
            reward.weaponCode,
            reward.weaponRarity,
            reward.ammoAmount,
            reward.ammoWeaponCode,
            reward.consumableCode,
            reward.consumableAmount,
            reward.woodAmount,
            reward.stoneAmount,
            reward.metalAmount,
            block.timestamp
        );
    }

    function _deriveRoll(
        uint256 _gameId,
        uint256 _containerId,
        bytes32 _containerKey,
        uint8 _containerType,
        uint32 _seed,
        uint32 _playerNonce
    ) internal view returns (uint16) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(
            _gameId,
            _containerId,
            msg.sender,
            _containerKey,
            _containerType,
            _seed,
            _playerNonce,
            block.prevrandao,
            blockhash(block.number - 1),
            address(this)
        )));
        return uint16(entropy % 10000);
    }

    function _deriveContainerReward(
        uint8 _containerType,
        uint16 _roll,
        uint32 _playerNonce
    ) internal pure returns (ContainerReward memory reward) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(_containerType, _roll, _playerNonce)));

        if (_containerType == 2) {
            reward.weaponCode = 0;
            reward.weaponRarity = 0;
            reward.ammoWeaponCode = _pickAmmoWeaponCode(_slice(entropy, 11, 10000));
            reward.ammoAmount = uint16(48 + _slice(entropy, 12, 68));

            uint256 utilityRoll = _slice(entropy, 13, 10000);
            if (utilityRoll < 4200) {
                reward.consumableCode = _pickAmmoBoxConsumable(_slice(entropy, 14, 10000));
                if (reward.consumableCode == 1) {
                    reward.consumableAmount = uint8(2 + _slice(entropy, 15, 2));
                } else if (reward.consumableCode == 2) {
                    reward.consumableAmount = uint8(1 + _slice(entropy, 16, 2));
                } else {
                    reward.consumableAmount = 1;
                }
            }

            reward.woodAmount = uint16(6 + _slice(entropy, 17, 8));
            reward.stoneAmount = 0;
            reward.metalAmount = 0;
            return reward;
        }

        reward.weaponCode = _pickWeaponCode(_slice(entropy, 21, 10000));
        reward.weaponRarity = _pickWeaponRarity(_containerType, _slice(entropy, 22, 10000));
        reward.ammoWeaponCode = reward.weaponCode;
        reward.ammoAmount = _containerType == 1
            ? uint16(64 + _slice(entropy, 23, 56))
            : uint16(34 + _slice(entropy, 23, 42));

        reward.consumableCode = _pickChestConsumable(_containerType, _slice(entropy, 24, 10000));
        if (reward.consumableCode == 1) {
            reward.consumableAmount = uint8(2 + _slice(entropy, 25, 2));
        } else if (reward.consumableCode == 2) {
            reward.consumableAmount = uint8(1 + _slice(entropy, 26, 2));
        } else {
            reward.consumableAmount = 1;
        }

        if (_containerType == 1) {
            reward.woodAmount = 40;
            reward.stoneAmount = 24;
            reward.metalAmount = 8;
        } else {
            reward.woodAmount = 22;
            reward.stoneAmount = 14;
            reward.metalAmount = 0;
        }
    }

    function _slice(uint256 entropy, uint256 salt, uint256 modValue) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(entropy, salt))) % modValue;
    }

    function _pickWeaponCode(uint256 roll) internal pure returns (uint8) {
        if (roll < 3100) return 1; // ar
        if (roll < 5600) return 3; // smg
        if (roll < 8100) return 2; // shotgun
        return 4;                  // sniper
    }

    function _pickAmmoWeaponCode(uint256 roll) internal pure returns (uint8) {
        if (roll < 3400) return 1; // ar
        if (roll < 6800) return 3; // smg
        if (roll < 8800) return 2; // shotgun
        return 4;                  // sniper
    }

    function _pickWeaponRarity(uint8 containerType, uint256 roll) internal pure returns (uint8) {
        if (containerType == 1) {
            if (roll < 2000) return 2; // uncommon
            if (roll < 6000) return 3; // rare
            if (roll < 8800) return 4; // epic
            return 5;                  // legendary
        }

        if (roll < 3200) return 1; // common
        if (roll < 7000) return 2; // uncommon
        if (roll < 9000) return 3; // rare
        if (roll < 9800) return 4; // epic
        return 5;                  // legendary
    }

    function _pickChestConsumable(uint8 containerType, uint256 roll) internal pure returns (uint8) {
        if (containerType == 1) {
            if (roll < 1800) return 1; // bandage
            if (roll < 5200) return 2; // mini
            if (roll < 8300) return 3; // shield potion
            return 4;                  // medkit
        }

        if (roll < 3400) return 1; // bandage
        if (roll < 7000) return 2; // mini
        if (roll < 9200) return 3; // shield potion
        return 4;                  // medkit
    }

    function _pickAmmoBoxConsumable(uint256 roll) internal pure returns (uint8) {
        if (roll < 5400) return 1; // bandage
        if (roll < 9000) return 2; // mini
        return 3;                  // shield potion
    }

    // ──────────────────────────── Rewards ──────────────────────────────

    /// @notice Claim all pending STT rewards.
    function claimRewards() external {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "NO_REWARDS");
        pendingRewards[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "CLAIM_FAILED");
        emit RewardClaimed(msg.sender, amount);
    }

    // ──────────────────────────── Views ────────────────────────────────

    function getPlayerStats(address _player) external view returns (PlayerStats memory) {
        return stats[_player];
    }

    function getPlayerGameIds(address _player) external view returns (uint256[] memory) {
        return playerGames[_player];
    }

    function getGameResult(uint256 _index) external view returns (GameResult memory) {
        return gameHistory[_index];
    }

    function getGameHistoryLength() external view returns (uint256) {
        return gameHistory.length;
    }

    function getRecentGames(uint256 _count) external view returns (GameResult[] memory) {
        uint256 len = gameHistory.length;
        uint256 count = _count > len ? len : _count;
        GameResult[] memory results = new GameResult[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = gameHistory[len - count + i];
        }
        return results;
    }

    // ──────────────────────────── Admin ────────────────────────────────

    function setOrchestrator(address _orch) external onlyOwner {
        emit OrchestratorUpdated(orchestrator, _orch);
        orchestrator = _orch;
    }

    /// @notice Withdraw protocol fees.
    function withdrawFees(uint256 _amount) external onlyOwner {
        (bool ok, ) = owner.call{value: _amount}("");
        require(ok, "WITHDRAW_FAILED");
    }

    // ──────────────────────────── Internal ─────────────────────────────

    function _startGame() internal {
        uint256 gameId = nextGameId++;
        address[] memory players = queue;
        uint256 pool = ENTRY_FEE * players.length;

        // Clear queue
        for (uint256 i = 0; i < players.length; i++) {
            inQueue[players[i]] = false;
        }
        delete queue;
        queueOpenedAt = 0;

        emit GameStarted(gameId, players, pool);
    }

    function _removeFromQueue(address _player) internal {
        uint256 len = queue.length;
        for (uint256 i = 0; i < len; i++) {
            if (queue[i] == _player) {
                queue[i] = queue[len - 1];
                queue.pop();
                inQueue[_player] = false;
                return;
            }
        }
    }

    receive() external payable {}
}
