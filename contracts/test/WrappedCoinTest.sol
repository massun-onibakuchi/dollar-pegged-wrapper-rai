// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../WrappedCoin.sol";

contract WrappedCoinTest is WrappedCoin {
    constructor(
        IERC20 _RAI,
        IOracleRelayer _oracleRelayer,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) WrappedCoin(_RAI, _oracleRelayer, _name, _symbol, _decimals) {}

    function getRedemptionPrice() external view returns (uint256) {
        return _redemptionPrice;
    }
}
