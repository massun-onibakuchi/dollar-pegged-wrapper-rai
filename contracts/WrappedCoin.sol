// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IOracleRelayer.sol";

import "hardhat/console.sol";

contract WrappedCoin is ERC20 {
    using SafeMath for uint256;

    string public constant EIP712_REVISION = "1";
    bytes32 public constant EIP712_DOMAIN =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    mapping(address => uint256) public nonces;

    uint256 public constant RAY = 1e27;

    /// @dev Rai redemption price (not the most updated value),which means amount of wrapped coin per RAI.
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
    ) ERC20(_name, _symbol) {
        RAI = _RAI;
        oracleRelayer = _oracleRelayer;

        require(_oracleRelayer.contractEnabled() == 1, "wrapped-coin/oracle-relayer-disabled");
        _redemptionPrice = _oracleRelayer.redemptionPrice();
        require(_redemptionPrice > 0, "wrapped-coin/initial-redemption-price-zero");

        _setupDecimals(_decimals);
    }

    /**
     * @return The computed DOMAIN_SEPARATOR to be used off-chain services
     *         which implement EIP-712.
     *         https://eips.ethereum.org/EIPS/eip-2612
     */
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return
            keccak256(
                abi.encode(EIP712_DOMAIN, keccak256(bytes(name())), keccak256(bytes("1")), chainId, address(this))
            );
    }

    /**
     * @dev mint tokens to a specified address.
     * @param account the address to transfer to
     * @param underlyingAmount the amount of underlying token (RAI)
     * @return amount the amount of wrapped token to be minted
     */
    function mint(address account, uint256 underlyingAmount) public returns (uint256 amount) {
        _updateRedemptionPrice();
        RAI.transferFrom(msg.sender, address(this), underlyingAmount);
        _mint(account, underlyingAmount);
        amount = underlyingAmount.mul(_redemptionPrice).div(RAY);
        emit Mint(account, amount, underlyingAmount);
    }

    /**
     * @dev burn tokens and transfer underlying to a specified address
     * @param account the address to transfer to
     * @param amount the amount of wrapped token to be burned
     * @return underlyingAmount the amount of underlying token to be transferred
     */
    function burn(address account, uint256 amount) public returns (uint256 underlyingAmount) {
        underlyingAmount = amount.mul(RAY).div(_redemptionPrice);
        _updateRedemptionPrice();
        _burn(account, underlyingAmount);
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

    /**
     * @param account The address to query.
     * @return The balance of the specified address.
     */
    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account).mul(_redemptionPrice).div(RAY);
    }

    /**
     * @return total amounts of tokens.
     */
    function totalSupply() public view override returns (uint256) {
        return super.totalSupply().mul(_redemptionPrice).div(RAY);
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
     * @dev Allows for approvals to be made via secp256k1 signatures.
     * @param owner The owner of the funds
     * @param spender The spender
     * @param value The amount
     * @param deadline The deadline timestamp, type(uint256).max for max deadline
     * @param v Signature param
     * @param s Signature param
     * @param r Signature param
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(deadline >= block.timestamp, "wrapped-coin/expired-transaction");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "wrapped-coin/invalid-signature");
        _approve(owner, spender, value);
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
        uint256 underlyingAmount = amount.mul(RAY).div(_redemptionPrice);
        // console.log("# amount :>>", amount);
        // console.log("# underlyingAMount :>>", underlyingAmount);
        // console.log("# balanceOfUnderlying(spender) :>>", balanceOfUnderlying(spender));
        super._transfer(spender, recipient, underlyingAmount);
    }

    /**
     * @dev Update redemption price.
     */
    function _updateRedemptionPrice() internal {
        _redemptionPrice = oracleRelayer.redemptionPrice();
    }

    /**
     * @dev Update redemption price.
     * @return updated redemption price
     */
    function redemptionPrice() external returns (uint256) {
        _updateRedemptionPrice();
        return _redemptionPrice;
    }
}
