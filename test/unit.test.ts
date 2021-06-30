import hre, { ethers } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CoinMock, WrappedCoin, OracleRelayerMock } from "../typechain";

const toWei = ethers.utils.parseEther;
use(require("chai-bignumber")());

// get contract ABI via Etherscan API
const getVerifiedContractAt = async (address: string): Promise<Contract> => {
    // @ts-ignore
    return hre.ethers.getVerifiedContractAt(address);
};

describe("WrappedCoin", async function () {
    const name = "Wrapped Rai Reflexer Index";
    const symbol = "WrappedRAI";
    const decimals = 18;
    const RAY = BigNumber.from(10).pow(27);

    const INITIAL_REDEMPTION_PRICE = BigNumber.from(3).mul(RAY);

    const amount = BigNumber.from(10).mul(decimals);

    let wallet: SignerWithAddress;

    let CoinMockFactory;
    let WrappedCoinFactory;
    let OracleRelayerMockFactory;
    let coin: CoinMock;
    let wrappedCoin: WrappedCoin;
    let oracleRelayerMock: OracleRelayerMock;
    before(async () => {
        [wallet] = await ethers.getSigners();
        CoinMockFactory = await ethers.getContractFactory("CoinMock");
        WrappedCoinFactory = await ethers.getContractFactory("WrappedCoin");
        OracleRelayerMockFactory = await ethers.getContractFactory("OracleRelayerMock");
    });
    beforeEach(async function () {
        coin = (await CoinMockFactory.deploy()) as CoinMock;
        oracleRelayerMock = (await OracleRelayerMockFactory.deploy()) as OracleRelayerMock;

        await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE);

        wrappedCoin = (await WrappedCoinFactory.deploy(
            coin.address,
            oracleRelayerMock.address,
            name,
            symbol,
            decimals,
        )) as WrappedCoin;

        coin.mint(wallet.address, amount);
        expect(await coin.balanceOf(wallet.address)).to.eq(amount);
    });

    it("get correct name,symbol,address", async () => {
        expect(await wrappedCoin.name()).to.eq(name);
        expect(await wrappedCoin.symbol()).to.eq(symbol);
        expect(await wrappedCoin.RAI()).to.eq(coin.address);
        expect(await wrappedCoin.oracleRelayer()).to.eq(oracleRelayerMock.address);
    });

    it("mint: update internal redemptionPrice", async () => {
        expect(await oracleRelayerMock.redemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE);
        await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));

        await coin.connect(wallet).approve(wrappedCoin.address, 1000);
        await wrappedCoin.mint(wallet.address, 1000);
        expect(await coin.redemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE);
    });

    it("mint", async () => {
        await coin.connect(wallet).approve(wrappedCoin.address, amount);
        await wrappedCoin.mint(wallet.address, amount);

        expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);
        expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(amount);

        expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount);
    });
});

// it("invest: forge can invest assets to idleWBTC", async () => {
//     await coin.connect(wallet).approve(wrappedCoin.address, amount);
//     await wrappedCoin.mint(wallet.address, amount);

//     expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);
//     expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount);
// });

// it("redeemUnderlying: redeem deposited asset", async () => {
//     expect(await idleModel.underlyingBalanceWithInvestment()).to.eq(0);
//     const signer = ethers.provider.getSigner(signerAddr);
//     await invest(signer, amount);
//     await idleModel.redeemUnderlying(amount, idleModel.address);
//     const fee = amount.div(100); // idle fi withdraw fee 10% ??
//     expect(await wBTC.balanceOf(idleModel.address)).to.be.gt(amount.sub(fee));
// });

// it("withdrawTo:only forge can withdraw", async () => {
//     await expect(idleModel.withdrawTo(amount, forge.address)).to.be.revertedWith("MODEL : Only Forge");
// });

// it("withdrawTo:when enough amount in model", async () => {
//     const amountToWithdraw = amount.div(10);
//     const signer = ethers.provider.getSigner(signerAddr);
//     await wBTC.connect(signer).transfer(idleModel.address, amount);
//     const forgeSigner = ethers.provider.getSigner(forge.address);
//     await idleModel.connect(forgeSigner).withdrawTo(amountToWithdraw, wallet.address);
//     expect(await wBTC.balanceOf(wallet.address)).to.be.eq(amountToWithdraw);
//     expect(await wBTC.balanceOf(idleModel.address)).to.be.eq(amount.sub(amountToWithdraw));
// });

// it("withdrawTo: when not enough amount in model", async () => {
//     const amountToInvest = amount.div(10);
//     const balanceInModel = amount.sub(amountToInvest);
//     const signer = ethers.provider.getSigner(signerAddr);
//     await invest(signer, amountToInvest);
//     await wBTC.connect(signer).transfer(idleModel.address, balanceInModel);

//     const forgeSigner = ethers.provider.getSigner(forge.address);
//     await idleModel.connect(forgeSigner).withdrawTo(amount, wallet.address);
//     // should be one of them because of rounding of solidity calculations
//     expect(await wBTC.balanceOf(wallet.address)).to.satisfy((balance: BigNumber) => {
//         return balance.eq(amount) || balance.eq(amount.sub(1));
//     });
// });

// it("claimGovToken: can claim IDLE", async () => {
//     const signer = ethers.provider.getSigner(signerAddr);
//     await invest(signer, amount);
//     await idleModel.claimGovToken();
//     expect(await idle.balanceOf(idleModel.address)).not.to.eq(0);
// });

// it("swapGovTokenToUnderlying:swap IDLE to WBTC via UniswapV2", async () => {
//     const idleAmount = toWei("10");
//     await ethers.provider.send("hardhat_impersonateAccount", [idleHolderAddr]);
//     const holder = ethers.provider.getSigner(idleHolderAddr);

//     // see https://uniswap.org/docs/v2/smart-contracts/library#getamountsout
//     const path = [idle.address, WETH9_ADDRESS, WBTC_ADDRESS];
//     const expectedAmountsOut = await uniswapV2Router.getAmountsOut(idleAmount, path);
//     expect(expectedAmountsOut[2]).to.be.gt(0);

//     await idle.connect(holder).transfer(idleModel.address, idleAmount);
//     await idleModel.swapGovTokenToUnderlying();

//     expect(await idle.balanceOf(idleModel.address)).to.eq(0);
//     expect(await wBTC.balanceOf(idleModel.address)).to.eq(expectedAmountsOut[2]);
// });
