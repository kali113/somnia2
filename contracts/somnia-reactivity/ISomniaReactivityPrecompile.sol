// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISomniaReactivityPrecompile {
    struct SubscriptionData {
        bytes32[4] eventTopics;
        address origin;
        address caller;
        address emitter;
        address handlerContractAddress;
        bytes4 handlerFunctionSelector;
        uint64 priorityFeePerGas;
        uint64 maxFeePerGas;
        uint64 gasLimit;
        bool isGuaranteed;
        bool isCoalesced;
    }

    event SubscriptionCreated(uint64 indexed subscriptionId, address indexed owner, SubscriptionData subscriptionData);
    event SubscriptionRemoved(uint64 indexed subscriptionId, address indexed owner);

    function subscribe(SubscriptionData calldata subscriptionData) external returns (uint256 subscriptionId);
    function unsubscribe(uint256 subscriptionId) external;
    function getSubscriptionInfo(uint256 subscriptionId) external view returns (SubscriptionData memory subscriptionData, address owner);
}
