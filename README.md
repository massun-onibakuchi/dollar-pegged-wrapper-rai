# Punk.Protocol x Idle Finance

## Concept
This repository integrates Idle fi as a yield source for punk.protocol.

Idle is a decentralized protocol dedicated to bringing automatic asset allocation and aggregation to the interest-bearing tokens economy. This protocol bundles crypto-assets (ETH, WBTC, and stablecoins) into tokenized baskets that are programmed to automatically rebalance funds according to different management strategies. I think Idle is a relatively secure aggregator that deposits assets in battle-tested DeFi such as Compound, AAVE and so on.

`IdleModel` is a wrapper contract implementing `ModelStorage` and `ModelInterface`. `IdleModel` contract supports the best yield strategies of Idle fi, because IdleTokens for Risk Adjusted strategy do not have a `tokenPriceWithFee` method. This Idle finance integration focuses on IdleWBTC V4 best-yield strategy.

[Idle Finance Developer Doc](https://developers.idle.finance/)

## About Punk.Protocol

Punk Protocol is a combined batch of Decentralized Finance(DeFi) products, starting from providing the world's first decentralized annuity using high yield strategies on the Ethereum network.

Website: [https://punk.finance/](https://punk.finance/)

Twitter: [https://twitter.com/PunkProtocol](https://twitter.com/PunkProtocol)

Medium: [https://medium.com/punkprotocol](https://medium.com/punkprotocol)

## Contracts

Kovan Testnet

 - [Idle fi contracts](https://developers.idle.finance/contracts-and-codebase#kovan)
 - IDLE `0xab6bdb5ccf38ecda7a92d04e86f7c53eb72833df`
 - IdleUSDC `0x0de23D3bc385a74E2196cfE827C8a640B8774B9f`
 - WBTC `0x577d296678535e4903d59a4c929b718e1d575e0a`
 - IdleModel `0xB8554aB4c6400d83e8751cf17c682E3FcE8E53D7`

## Usage

### Setup
To install dependencies, run

`yarn`

You will needs to enviroment variables to run the tests. Create a `.env` file in the root directory of your project.

```
# To deploy smart contracts on testnet.
MNEMONIC=

# To fetch external contracts ABI via Etherscan API
ETHERSCAN_API_KEY=

# To deploy smart contracts on testnet. To fork mainnet states.
ALCHEMY_API_KEY=
KOVAN_ALCHEMY_API_KEY=
```

You will get the first one from [Etherscan](https://etherscan.io/). You will get the second one from [Alchemy](https://dashboard.alchemyapi.io/).

### Complipe

`yarn compile`

### Test

`yarn test`

### Local Deployment
`npx hardhat run --network hardhat scripts/deploy.ts`
