// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SomniaEventHandler
/// @notice Abstract contract to inherit when building on-chain reactive handlers.
/// The Somnia Reactivity Precompile (0x0100) calls `onEvent()` on matching subscriptions;
/// implementers override `_onEvent()` with their business logic.
abstract contract SomniaEventHandler {
    address internal constant REACTIVITY_PRECOMPILE = 0x0000000000000000000000000000000000000100;

    /// @notice Called by the precompile when a matching event fires.
    /// msg.sender will be 0x0100 (the precompile).
    function onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) external {
        require(msg.sender == REACTIVITY_PRECOMPILE, "ONLY_PRECOMPILE");
        _onEvent(emitter, eventTopics, data);
    }

    /// @notice Override this with your business logic.
    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    ) internal virtual;
}
