# dollar-pegged-coin-wrapper-for-RAI

## Concept
RAI is a stable asset that is minted against ETH. Anyone can deposit ETH into a Safe and create RAI until they hit the minimum 145% collateralization ratio. As opposed to dollar pegged stablecoins, RAI is not pegged to any particular value. Rather, it has a moving peg.

An ERC20 wrapper for RAI that rebases balance so that it becomes a dollar pegged stablecoin. The way to do this is to allow anyone to deposit RAI in the wrapper and issue an amount of wrapped tokens according to the latest RAI moving peg (otherwise called the redemption price).

## How it works
If the RAI redemption price is currently $3, one RAI deposited in the wrapper would give back three wrapped tokens. After the initial deposit, if the redemption price changes to $6, the wrapped token holder will have six wrapped tokens which can be used to redeem the one RAI they deposited.

 - WrappedRAI inherits Openzeppelin ERC20. WrappedRAI balance is internally represented with RAI denomination. But `_allowances` is denominated in WrappedRAI because the wrappedRAI-RAI conversion might change before it's fully paid.

```
    mapping(address => uint256) private _balances // denominated in RAI balance
    mapping (address => mapping (address => uint256)) private _allowances; // denominated in WrappedRAI
```

 - Redemption price represents the conversion rate, which means the amount of WrappedRAI per RAI

 - WrappedRAI recalulates rebases by updating RAI redemption price when its mint or burn function is called.

## Information
### Rounding error
The function `transfer()` and `transferFrom()` can't presisely transfer external balance on display.

#### Example

If a sender initial internal RAI balance is 100 `amountToTransfer = 100` `redemptionPrice = 3.0`, then `underlyingToTransfer = 33` (= 100/3 = 33.3.. )

|            | sender | recipient |
|:----------:|:----------:|:-----------:|
| Before transfer | 300 (100)  | 0 (0)    |
| After transfer  | 201 (67)   | 99  (33)  |
| Difference in balance  | -99 (-33)   | +99  (+33)  |

The number in parentheses ( ) indicates the internal balance.

If a sender initial internal RAI balance is 100 `amountToTransfer = 100` `redemptionPrice = 3.04`, then `underlyingToTransfer = 32` (= 100/3.04 = 32.8..)

|            | sender | recipient |
|:----------:|:----------:|:-----------:|
| Before transfer | 304 (100)  |  0  (0)   |
| After transfer  | 206 (68)   | 97  (32)   |
| Difference in balance  | -98 (-32)   | +97 (+32)  |

There will be rounding errors in the calculation to convert between external and internal balances, but they should be negligible unless you send a much smaller amount than, say, 0.01$.

### Internal balance might become untransferable
The function `transfer()` and  `transferFrom()` takes values to transfer and compute the corresponding internal values. If amounts to transfer are too small, or redemption price becomes larger enough, small amounts can become untransferable. Realistically, we could ignore the possibility of internal balance becoming untransferable. And WrappedRAI implements some function `**All()` such as `burnAll()`.

### Oracle/Front-Running
The rebase mechanism depends on `OracleRelayer`'s redemption price.
Miners/Attackers might arbitrage by repeatedly　`mint()`, `burn()` or updating redemption price. But, arbitrage helps the market converge on the true price. 

#### Idea
 - Making sure that the redemption price is updated only once per block.

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
### RAI
[GR10 Reflexer Labs](https://gitcoin.co/issue/reflexer-labs/geb/103/100026033)

[GEB Doc](https://docs.reflexer.finance/)

### Rebase
[Ampleforth](https://github.com/ampleforth/uFragments)

[Ampleforth Audits](https://github.com/ampleforth/ampleforth-audits)

[Medium BadgerDAO Badger101 A deep dive on elastic supply tokens and Digg](https://badgerdao.medium.com/badger-101-a-deep-dive-on-elastic-supply-tokens-and-digg-f1b310f229ad)

