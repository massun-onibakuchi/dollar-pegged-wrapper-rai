// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IOracleRelayer {
    // Whether this contract is enabled
    function contractEnabled() external view returns (uint256);

    // Last time when the redemption price was changed
    function redemptionPriceUpdateTime() external view returns (uint256);

    /**
     * @notice Fetch the latest redemption price by first updating it
     */
    function redemptionPrice() external returns (uint256);
}
