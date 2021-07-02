import hre, { ethers } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { CoinMock, WrappedCoinTest, OracleRelayerMock } from "../typechain";

const toWei = ethers.utils.parseEther;
use(require("chai-bignumber")());

describe("WrappedCoin", async function () {
    const name = "Wrapped Rai Reflexer Index";
    const symbol = "WrappedRAI";
    const decimals = 18;
    const RAY = BigNumber.from(10).pow(27);
    const INITIAL_REDEMPTION_PRICE = BigNumber.from(3).mul(RAY); // 3$ * 10**27
    const amount = BigNumber.from(100).pow(10).mul(decimals);

    let wallet: SignerWithAddress;
    let other: SignerWithAddress;

    let CoinMockFactory;
    let WrappedCoinFactory;
    let OracleRelayerMockFactory;
    let coin: CoinMock;
    let wrappedCoin: WrappedCoinTest;
    let oracleRelayerMock: OracleRelayerMock;
    before(async () => {
        [wallet, other] = await ethers.getSigners();
        CoinMockFactory = await ethers.getContractFactory("CoinMock");
        WrappedCoinFactory = await ethers.getContractFactory("WrappedCoinTest");
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
        )) as WrappedCoinTest;
    });

    it("get correct name,symbol,address and initial redemption price", async () => {
        expect(await wrappedCoin.name()).to.eq(name);
        expect(await wrappedCoin.symbol()).to.eq(symbol);
        expect(await wrappedCoin.RAI()).to.eq(coin.address);
        expect(await wrappedCoin.oracleRelayer()).to.eq(oracleRelayerMock.address);
        expect(await oracleRelayerMock.getCurrentRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE);
    });

    const mint = async (account, amount) => {
        await coin.mint(account.address, amount);
        await coin.connect(account).approve(wrappedCoin.address, amount);
        await wrappedCoin.mint(account.address, amount);
    };

    it("mint: update internal redemptionPrice", async () => {
        await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));
        // mint and update internal P_redemption
        await mint(wallet, 1000);
        expect(await wrappedCoin.getRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE.div(2));
    });

    const mintTest = async exp => {
        it(`mint: increase minter and protocol balances amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const redemptionPrice = await oracleRelayerMock.getCurrentRedemptionPrice();

            expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);
            expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(amount);
            // wrapped coin balance = deposited balance * redemptionPrice
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await wrappedCoin.totalSupply()).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await coin.balanceOf(wallet.address)).to.eq(0);
        });
    };

    const exponents = [2, 5, 27, 33];
    exponents.forEach(mintTest);

    it("burn: update internal redemptionPrice", async () => {
        await mint(wallet, 1000);
        await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));
        // burn and update internal P_redemption
        await wrappedCoin.burn(wallet.address, 1000);
        expect(await wrappedCoin.getRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE.div(2));
    });

    const burnTest = async exp => {
        it(`burn: increase minter and protocol balances amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const redemptionPrice = await oracleRelayerMock.getCurrentRedemptionPrice();
            const burnAmount = amount.mul(redemptionPrice).div(RAY);
            await wrappedCoin.burn(wallet.address, burnAmount);

            expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(0);
            expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(0);
            // wrapped coin balance = deposited balance * redemptionPrice
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
            expect(await wrappedCoin.totalSupply()).to.eq(0);
            expect(await coin.balanceOf(wallet.address)).to.eq(amount);
        });
    };
    exponents.forEach(burnTest);

    const balanceTest = async denominator => {
        it(`balanceOf: balance depends on redemptionPrice - ${(10 / denominator).toFixed(2)}$ `, async () => {
            await coin.mint(wallet.address, amount);
            await coin.approve(wrappedCoin.address, amount);

            // P_redemption = 10**18 / denominator * 10**27 / 10**18
            const redemptionPrice = toWei("1").div(BigNumber.from(denominator)).mul(RAY).div(toWei("1"));
            await oracleRelayerMock.setRedemptionPrice(redemptionPrice);

            await coin.connect(wallet).approve(wrappedCoin.address, amount);
            await wrappedCoin.mint(wallet.address, amount);
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount.mul(redemptionPrice).div(RAY));
        });
    };

    const denominators = [2, 3, 6, 9, 12];
    denominators.forEach(balanceTest);

    const transferTest = async exp => {
        it(`transfer: transfer from wallet to other - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);

            const withdrawAmount = amount.mul(await oracleRelayerMock.getCurrentRedemptionPrice()).div(RAY);
            // transfer external balances `amount` to other address
            await wrappedCoin.connect(wallet).transfer(other.address, withdrawAmount);

            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(other.address)).to.eq(withdrawAmount);
        });
    };

    exponents.forEach(transferTest);

    const approveTest = async exp => {
        it(`approve: increase allowance and decrease allowance - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const approveAmount = amount.mul(await oracleRelayerMock.getCurrentRedemptionPrice()).div(RAY);

            await wrappedCoin.connect(wallet).approve(other.address, approveAmount);
            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(approveAmount);

            await wrappedCoin.connect(wallet).approve(other.address, 0);
            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
        });
    };
    exponents.forEach(approveTest);

    const transferFromTest = async exp => {
        it(`transferFrom: transfer from wallet to other - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const approveAmount = amount.mul(await oracleRelayerMock.getCurrentRedemptionPrice()).div(RAY);

            await wrappedCoin.connect(wallet).approve(other.address, approveAmount);
            await wrappedCoin.connect(other).transferFrom(wallet.address, other.address, approveAmount);

            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(other.address)).to.eq(approveAmount);
        });
    };
    exponents.forEach(transferFromTest);
});
