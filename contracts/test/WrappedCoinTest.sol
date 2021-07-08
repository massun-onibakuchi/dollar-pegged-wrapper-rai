// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../WrappedCoin.sol";

import "hardhat/console.sol";

contract WrappedCoinTest is WrappedCoin {
    using SafeMath for uint256;

    //solhint-disable var-name-mixedcase
    constructor(
        IERC20 _RAI,
        IOracleRelayer _oracleRelayer,
        string memory _name,
        string memory _symbol
    ) WrappedCoin(_RAI, _oracleRelayer, _name, _symbol) {}

    function getRedemptionPrice() external view returns (uint256) {
        return _redemptionPrice;
    }
}
