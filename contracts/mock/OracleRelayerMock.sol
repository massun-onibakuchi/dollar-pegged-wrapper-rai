// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interfaces/IOracleRelayer.sol";

contract OracleRelayerMock is IOracleRelayer {
    uint256 private _redemptionPrice;
    uint256 public override redemptionPriceUpdateTime;

    function contractEnabled() public pure override returns (uint256) {
        return 1;
    }

    function redemptionPrice() public override returns (uint256) {
        return _redemptionPrice;
    }

    function setRedemptionPrice(uint256 redemptionPrice_) public returns (uint256) {
        _redemptionPrice = redemptionPrice_;
        return _redemptionPrice;
    }

    function getCurrentRedemptionPrice() public view returns (uint256) {
        return _redemptionPrice;
    }
}
