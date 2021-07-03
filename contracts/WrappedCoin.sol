// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IOracleRelayer.sol";

import "hardhat/console.sol";

contract WrappedCoin is ERC20 {
    using SafeMath for uint256;

    uint256 public constant RAY = 1e27;

    // Rai redemption price (not the most updated value)
    // CoinWrappersPerRAI  1RAIあたりのWrappedRAIの量
    uint256 internal _redemptionPrice;

    IERC20 public immutable RAI; //solhint-disable var-name-mixedcase
    IOracleRelayer public immutable oracleRelayer;

    event Mint(address indexed account, uint256 wrappedCoinAmount, uint256 underlyingAmount);
    event Burn(address indexed account, uint256 wrappedCoinAmount, uint256 underlyingAmount);

    constructor(
        IERC20 _RAI,
        IOracleRelayer _oracleRelayer,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        RAI = _RAI;
        oracleRelayer = _oracleRelayer;

        require(_oracleRelayer.contractEnabled() == 1, "wrapped-coin/oracle-relayer-disabled");
        _redemptionPrice = _oracleRelayer.redemptionPrice();
        require(_redemptionPrice > 0, "wrapped-coin/initial-redemption-price-zero");
        _setupDecimals(_decimals);
    }

    function mint(address account, uint256 underlyingAmount) public returns (uint256 amount) {
        _updateRedemptionPrice();
        RAI.transferFrom(msg.sender, address(this), underlyingAmount);
        _mint(account, underlyingAmount);
        amount = underlyingAmount.mul(_redemptionPrice).div(RAY);
        emit Mint(account, amount, underlyingAmount);
    }

    function burn(address account, uint256 amount) public returns (uint256 underlyingAmount) {
        underlyingAmount = amount.mul(RAY).div(_redemptionPrice);
        _burn(account, underlyingAmount);
        _updateRedemptionPrice();
        RAI.transfer(account, underlyingAmount);
        emit Burn(account, amount, underlyingAmount);
    }

    function burnAll(address account) public returns (uint256 underlyingAmount) {
        uint256 redemptionPrice_ = _redemptionPrice;
        underlyingAmount = balanceOfUnderlying(msg.sender);
        _burn(account, underlyingAmount);
        _updateRedemptionPrice();
        RAI.transfer(account, underlyingAmount);
        emit Burn(account, underlyingAmount.mul(redemptionPrice_).div(RAY), underlyingAmount);
    }

    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account).mul(_redemptionPrice).div(RAY);
    }

    function totalSupply() public view override returns (uint256) {
        return super.totalSupply().mul(_redemptionPrice).div(RAY);
    }

    function balanceOfUnderlying(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    function totalSupplyUnderlying() public view returns (uint256) {
        return super.totalSupply();
    }

    function transferAll(address spender, address recipient) public virtual {
        uint256 underlyingAmount = balanceOfUnderlying(spender);
        super._transfer(spender, recipient, underlyingAmount);
    }

    /**
     * @dev called in `transfer` and `transferFrom` function.
     */
    function _transfer(
        address spender,
        address recipient,
        uint256 amount
    ) internal virtual override updateRedemptionPrice() {
        uint256 underlyingAmount = amount.mul(RAY).div(_redemptionPrice);
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
