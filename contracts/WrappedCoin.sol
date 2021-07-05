// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ERC20Permit.sol";
import "./interfaces/IOracleRelayer.sol";
import "./libraries/FullMath.sol";

// import "hardhat/console.sol";

/**
 * This is a ERC20 token, whcih wrapps Rai Reflexer index (RAI).
 * WrappedRAI is a mintable and burnable ERC20 token, but its supply can be adjusted
 * according to RAI redemption price.
 * WrappedRAI balances are internally represented with RAI denomination.
 * WrappedRAI recalulates rebases by updating RAI redemption price when its mint or burn function is called.
 * Redemption price represents the conversion rate,which means the amount of WrappedRAI per RAI
 */
contract WrappedCoin is ERC20Permit {
    // - WrappedRAI inherits Openzeppelin ERC20. Mapping of address to RAI balances,
    //      but `allowances` is denominated in WrappedRAI
    //      because the wrappedRAI-RAI conversion might change before it's fully paid.
    //     `mapping(address => uint256) private _balances // denominated in RAI balances`
    //     `mapping (address => mapping (address => uint256)) private _allowances; // denominated in WrappedRAI`
    // - The sum of all balances is not guaranteed to be the same as the result of calling totalSupply().
    // - External balance might not be precisely increased by x even if x amounts are transfered by `transfer()`
    //      This is because any conversion has non-zero rounding error,
    // - Internal balance is precisely increased by y if y underlying amounts are transfered.
    //      If address 'A' transfers x amounts to address 'B'. A's resulting internal balance will
    //      be decreased by precisely y underlying amounts, and B's internal balance will be precisely
    //      increased by y underlying amounts, where x = y * redemptionPrice

    using SafeMath for uint256;

    uint256 public constant RAY = 1e27;

    /// @dev Rai redemption price (not the most updated value)
    /// The conversion rate, which means amount of wrapped coin per RAI.
    uint256 internal _redemptionPrice;

    /// @dev ref to RAI (underlying token)
    IERC20 public immutable RAI; //solhint-disable var-name-mixedcase

    /// @dev ref to RAI redemption price oracleRelayer
    IOracleRelayer public immutable oracleRelayer;

    event Mint(address indexed account, uint256 wrappedCoinAmount, uint256 underlyingAmount);

    event Burn(address indexed account, uint256 wrappedCoinAmount, uint256 underlyingAmount);

    constructor(
        IERC20 _RAI,
        IOracleRelayer _oracleRelayer,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20Permit(_name, _symbol) {
        RAI = _RAI;
        oracleRelayer = _oracleRelayer;

        require(_oracleRelayer.contractEnabled() == 1, "wrapped-coin/oracle-relayer-disabled");
        _redemptionPrice = _oracleRelayer.redemptionPrice();
        require(_redemptionPrice > 0, "wrapped-coin/initial-redemption-price-zero");

        _setupDecimals(_decimals);
    }

    /**
     * @dev update redemption price and mint tokens to a specified address.
     * @param account the address to transfer WrappedCoin to
     * @param underlyingAmount the amount of underlying token (RAI)
     * @return amount the amount of wrapped token to be minted
     */
    function mint(address account, uint256 underlyingAmount) public returns (uint256 amount) {
        _updateRedemptionPrice();
        RAI.transferFrom(msg.sender, address(this), underlyingAmount);
        _mint(account, underlyingAmount);
        amount = FullMath.mulDiv(underlyingAmount, _redemptionPrice, RAY);
        emit Mint(account, amount, underlyingAmount);
    }

    /**
     * @dev burn tokens and transfer underlying to a specified address.
     *      The amount of burn is calculated by the redemption price at the time this function is called.
     * @param account the address to transfer RAI to
     * @param amount the amount of wrapped token to be burned
     * @return underlyingAmount the amount of underlying token to be transferred
     */
    function burn(address account, uint256 amount) public returns (uint256 underlyingAmount) {
        underlyingAmount = FullMath.mulDiv(amount, RAY, _redemptionPrice);
        _updateRedemptionPrice();
        _burn(account, underlyingAmount);
        RAI.transfer(account, underlyingAmount);
        emit Burn(account, amount, underlyingAmount);
    }

    function burnAll(address account) public returns (uint256 underlyingAmount) {
        uint256 redemptionPrice_ = _redemptionPrice;
        underlyingAmount = balanceOfUnderlying(msg.sender);
        _updateRedemptionPrice();
        _burn(account, underlyingAmount);
        RAI.transfer(account, underlyingAmount);
        emit Burn(account, FullMath.mulDiv(underlyingAmount, redemptionPrice_, RAY), underlyingAmount);
    }

    /**
     * @param account The address to query.
     * @return The balance of the specified address.
     */
    function balanceOf(address account) public view override returns (uint256) {
        return FullMath.mulDiv(super.balanceOf(account), _redemptionPrice, RAY);
    }

    /**
     * @return total amounts of tokens.
     */
    function totalSupply() public view override returns (uint256) {
        return FullMath.mulDiv(super.totalSupply(), _redemptionPrice, RAY);
    }

    /**
     * @param account The address to query.
     * @return The underlying balance of the specified address.
     */
    function balanceOfUnderlying(address account) public view returns (uint256) {
        return super.balanceOf(account);
    }

    /**
     * @return total amounts of underlying tokens.
     */
    function totalSupplyUnderlying() public view returns (uint256) {
        return super.totalSupply();
    }

    function transferAll(address recipient) public virtual returns (bool) {
        uint256 underlyingAmount = balanceOfUnderlying(msg.sender);
        super._transfer(msg.sender, recipient, underlyingAmount);
        return true;
    }

    function transferAllFrom(address spender, address recipient) public virtual returns (bool) {
        uint256 underlyingAmount = balanceOfUnderlying(spender);
        super._transfer(spender, recipient, underlyingAmount);
        return true;
    }

    /**
     * @dev Update redemption price.
     * @return updated redemption price
     */
    function redemptionPrice() external returns (uint256) {
        _updateRedemptionPrice();
        return _redemptionPrice;
    }

    /**
     * @dev called in `transfer**` and `transferFrom**` function.
     * method overrides {_transfer} method
     */
    function _transfer(
        address spender,
        address recipient,
        uint256 amount
    ) internal virtual override {
        uint256 underlyingAmount = FullMath.mulDiv(amount, RAY, _redemptionPrice);
        super._transfer(spender, recipient, underlyingAmount);
    }

    /**
     * @dev Update redemption price.
     */
    function _updateRedemptionPrice() internal {
        _redemptionPrice = oracleRelayer.redemptionPrice();
    }
}
