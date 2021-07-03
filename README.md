# dollar-pegged-coin-wrapper-for-RAI

## Concept
RAI is a stable asset that is minted against ETH. Anyone can deposit ETH into a Safe and create RAI until they hit the minimum 145% collateralization ratio. As opposed to dollar pegged stablecoins, RAI is not pegged to any particular value. Rather, it has a moving peg.

An ERC20 wrapper for RAI that rebases balances so that it becomes a dollar pegged stablecoin. The way to do this is to allow anyone to deposit RAI in the wrapper and issue an amount of wrapped tokens according to the latest RAI moving peg (otherwise called the redemption price).

## How it works
If the RAI redemption price is currently $3, one RAI deposited in the wrapper would give back three wrapped tokens. After the initial deposit, if the redemption price changes to $6, the wrapped token holder will have six wrapped tokens which can be used to redeem the one RAI they deposited.

[GEB Doc](https://docs.reflexer.finance/)

 - WrappedRAI inherits Openzeppelin ERC20. WrappedRAI balances are internally represented with RAI denomination. but `_allowances` is denominated in WrappedRAI because the wrappedRAI-RAI conversion might change before it's fully paid.

```
    mapping(address => uint256) private _balances // denominated in RAI balances
    mapping (address => mapping (address => uint256)) private _allowances; // denominated in WrappedRAI
```

 - Redemption price represents the conversion rate, which means the amount of WrappedRAI per RAI

 - WrappedRAI recalulates rebases by updating RAI redemption price when its mint or burn function is called.

## Information
### Rounding error
The function `transfer()` and `transferFrom()` can't presisely transfer external balances on display.

### Internal balances might become untransferable
The function `transfer()` and  `transferFrom()` takes values to transfer and compute the corresponding internal values. If amounts to transfer are too small, or redemption price becomes larger enough, small amounts can become untransferable. but WrappedRAI implements some function `**All()` such as `burnAll()`.

### Oracle
The rebase mechanism depends on `OracleRelayer`'s redemption price.
Attackers could arbitrage by repeatedly　`mint()`, `burn()` or updateing redemption price.

## Usage

### Setup
To install dependencies, run

`yarn`

You will needs to enviroment variables to run the tests. Create a `.env` file in the root directory of your project.

```
# To fetch external contracts ABI via Etherscan API
ETHERSCAN_API_KEY=

# To fork mainnet states.
ALCHEMY_API_KEY=
BLOCK_NUMBER=12746591
```

You will get the first one from [Etherscan](https://etherscan.io/). You will get the second one from [Alchemy](https://dashboard.alchemyapi.io/).

### Complipe

`yarn compile`

### Test

`yarn test`

## Resources
[GR10 Reflexer Labs](https://gitcoin.co/issue/reflexer-labs/geb/103/100026033)

[Ampleforth](https://github.com/ampleforth/uFragments)

[Medium BadgerDAO Badger101 A deep dive on elastic supply tokens and Digg](https://badgerdao.medium.com/badger-101-a-deep-dive-on-elastic-supply-tokens-and-digg-f1b310f229ad)


[GEB Doc](https://docs.reflexer.finance/)
