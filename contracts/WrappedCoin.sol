// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IOracleRelayer.sol";

contract WrappedCoin2 is ERC20 {
    using SafeMath for uint256;

    uint256 public constant RAY = 1e27;

    // Rai redemption price (not the most updated value)
    // CoinWrappersPerRAI  1RAIあたりのWrappedRAIの量
    uint256 internal _redemptionPrice;

    IERC20 public immutable RAI; //solhint-disable var-name-mixedcase
    IOracleRelayer public immutable oracleRelayer;

    constructor(
        IERC20 _RAI,
        IOracleRelayer _oracleRelayer,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        RAI = _RAI;
        oracleRelayer = _oracleRelayer;

        require(_oracleRelayer.contractEnabled() == 1, "oracle-relayer-disabled");
        _redemptionPrice = _oracleRelayer.redemptionPrice();

        _setupDecimals(_decimals);
    }

    function mint(address account, uint256 underlyingAmount) public updateRedemptionPrice() {
        RAI.transferFrom(msg.sender, address(this), underlyingAmount);
        _mint(account, underlyingAmount);
    }

    function burn(address account, uint256 amount) public updateRedemptionPrice() {
        uint256 underlyingAmount = amount.div(_redemptionPrice);
        _burn(account, underlyingAmount);
        RAI.transfer(account, underlyingAmount);
    }

    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account).mul(_redemptionPrice);
    }

    function totalSupply() public view override returns (uint256) {
        return super.totalSupply().mul(_redemptionPrice);
    }

    function balanceOfUnderlying(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    function totalSupplyUnderlying() public view returns (uint256) {
        return super.totalSupply();
    }

    /**
     * @dev called in `transfer` and `transferFrom` function.
     */
    function _transfer(
        address spender,
        address recipient,
        uint256 amount
    ) internal override updateRedemptionPrice() {
        uint256 underlyingAmount = amount.div(_redemptionPrice);
        super._transfer(spender, recipient, underlyingAmount);
    }

    modifier updateRedemptionPrice() {
        _updateRedemptionPrice();
        _;
    }

    function _updateRedemptionPrice() internal {
        _redemptionPrice = oracleRelayer.redemptionPrice();
    }

    function redemptionPrice() external returns (uint256) {
        _updateRedemptionPrice();
        return _redemptionPrice;
    }
}
