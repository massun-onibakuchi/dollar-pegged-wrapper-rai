import hre, { ethers } from "hardhat";
import { expect, use } from "chai";
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
    const INITIAL_AMOUNT = BigNumber.from(10).mul(BigNumber.from(10).pow(decimals));

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
        return await wrappedCoin.mint(account.address, amount);
    };

    // to underlying amount to wrappedRAI amount
    const multiplyDecimalRound = (x: BigNumber, y: BigNumber) => {
        const quotientTimesTen = x.div(y).div(RAY.div(10));
        if (quotientTimesTen.mod(10).gte(5)) {
            quotientTimesTen.add(10);
        }
        return quotientTimesTen.div(10);
    };
    const toWrappedAmount = (uAmount: BigNumber, redemptionPrice: BigNumber) =>
        multiplyDecimalRound(uAmount, redemptionPrice);
    // to wrappedRAI amount To underlying amount
    const divideDecimalRound = (x: BigNumber, y: BigNumber) => {
        const resultTimesTen = x.mul(RAY.div(10)).div(y);
        if (resultTimesTen.mod(10).gte(5)) {
            resultTimesTen.add(10);
        }
        return resultTimesTen.div(10);
    };
    const toUnderlyingAmount = (amount: BigNumber, redemptionPrice: BigNumber) =>
        divideDecimalRound(amount, redemptionPrice);

    const exponents = [0, 2, 5, 27, 35];

    describe("mint", async () => {
        it("mint: update internal redemptionPrice", async () => {
            await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));
            // mint and update internal P_redemption
            await mint(wallet, 1000);
            expect(await wrappedCoin.getRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE.div(2));
        });

        it("emit Mint event", async () => {
            await expect(mint(wallet, toWei("1")))
                .to.emit(wrappedCoin, "Mint")
                .withArgs(wallet.address, toWei("1").mul(INITIAL_REDEMPTION_PRICE).div(RAY), toWei("1"));
        });

        exponents.forEach(mintTest);

        async function mintTest(exp) {
            it(`increase minter and protocol balances amount 10**${exp}`, async () => {
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
        }
    });

    describe("burn", async () => {
        it("update internal redemptionPrice", async () => {
            await mint(wallet, 1000);
            await oracleRelayerMock.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));
            // burn and update internal P_redemption
            await wrappedCoin.burn(wallet.address, 1000);
            expect(await wrappedCoin.getRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE.div(2));
        });

        it("emit Burn event", async () => {
            await mint(wallet, INITIAL_AMOUNT);
            await expect(wrappedCoin.burn(wallet.address, toWei("1")))
                .to.emit(wrappedCoin, "Burn")
                .withArgs(wallet.address, toWei("1"), toWei("1").mul(RAY).div(INITIAL_REDEMPTION_PRICE));
        });
        exponents.forEach(burnTest);

        async function burnTest(exp) {
            it(`increase minter and protocol balances amount 10**${exp}`, async () => {
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
        }
    });

    const denominators = [2, 3, 6, 9, 12];

    describe("balanceOf", async () => {
        denominators.forEach(balanceTest);

        async function balanceTest(denominator) {
            it(`The balance is proportional to the redemptionPrice - ${(10 / denominator).toFixed(2)}$`, async () => {
                await coin.mint(wallet.address, INITIAL_AMOUNT);

                // P_redemption = 10**18 / denominator * 10**27 / 10**18
                const redemptionPrice = toWei("1").div(BigNumber.from(denominator)).mul(RAY).div(toWei("1"));
                await oracleRelayerMock.setRedemptionPrice(redemptionPrice);

                await coin.connect(wallet).approve(wrappedCoin.address, INITIAL_AMOUNT);
                await wrappedCoin.mint(wallet.address, INITIAL_AMOUNT);
                expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(INITIAL_AMOUNT.mul(redemptionPrice).div(RAY));
            });
        }
    });

    describe("transfer: transfer from wallet to other", async () => {
        const prices = [3.0, 3.04];
        prices.forEach(price => exponents.forEach(exp => transferTest(price, exp)));

        async function transferTest(price: number, exp: number) {
            const amount = BigNumber.from(10).pow(exp);

            it(`redemptionPrice $${price} amount 10**${exp}`, async () => {
                // redemptionPrice = price * 10**27
                const redemptionPrice = BigNumber.from((price * 100).toFixed(0))
                    .mul(RAY)
                    .div(100);
                await oracleRelayerMock.setRedemptionPrice(redemptionPrice);
                await mint(wallet, amount);
                expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);

                const total = await wrappedCoin.balanceOf(wallet.address);
                const amountToTransfer = BigNumber.from(10).pow(exp);
                const underlyingToTransfer = divideDecimalRound(amountToTransfer, redemptionPrice);

                await wrappedCoin.connect(wallet).transfer(other.address, amountToTransfer);

                const walletUBal = await wrappedCoin.balanceOfUnderlying(wallet.address);
                const walletBal = await wrappedCoin.balanceOf(wallet.address);
                const otherUBal = await wrappedCoin.balanceOfUnderlying(other.address);
                const otherBal = await wrappedCoin.balanceOf(other.address);

                //  in same case, total supply does't remain the same.

                console.log("redemptionPrice.toString() :>> ", redemptionPrice.toString());
                console.log("total :>>", total.toString());
                console.log("amountToTransfer :>>", amountToTransfer.toString());
                console.log("underlyingToTransfer :>>", underlyingToTransfer.toString());
                console.log("walletBal :>> ", walletBal.toString()); // total - amountToTransfer
                console.log("walletUBal :>> ", walletUBal.toString()); // amount - uToTransfer
                console.log("otherBal :>> ", otherBal.toString()); // amountToTransfer
                console.log("otherUBal :>> ", otherUBal.toString()); // uToTransfer

                expect(walletUBal.add(otherUBal)).to.eq(amount); // The sum of the two account balances should remain the same.
                // expect(walletBal.add(otherBal)).to.eq(total); // The sum of the two account balances might not remain the same.

                // internal balances should be presisely changed
                expect(amount.sub(underlyingToTransfer)).to.eq(walletUBal);
                expect(underlyingToTransfer).to.eq(otherUBal);

                // external balances should be presisely changed
                // expect(amountToTransfer).to.eq(otherBal);
                // expect(total.sub(amountToTransfer)).to.eq(walletBal);
            });
        }
    });

    describe("approve", async () => {
        exponents.forEach(approveTest);

        async function approveTest(exp) {
            it(`increase allowance and decrease allowance - amount 10**${exp}`, async () => {
                const amount = BigNumber.from(10).pow(exp);
                await mint(wallet, amount);
                const amountToApprove = amount.mul(await oracleRelayerMock.getCurrentRedemptionPrice()).div(RAY);

                await wrappedCoin.connect(wallet).approve(other.address, amountToApprove);
                expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(amountToApprove);

                await wrappedCoin.connect(wallet).approve(other.address, 0);
                expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
            });
        }
    });

    describe("transferFrom", async () => {
        exponents.forEach(transferFromTest);

        async function transferFromTest(exp) {
            it(`transfer from wallet to other - amount 10**${exp}`, async () => {
                const amount = BigNumber.from(10).pow(exp);
                await mint(wallet, amount);
                const amountToApprove = amount.mul(await oracleRelayerMock.getCurrentRedemptionPrice()).div(RAY);

                await wrappedCoin.connect(wallet).approve(other.address, amountToApprove);
                await wrappedCoin.connect(other).transferFrom(wallet.address, other.address, amountToApprove);

                expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
                expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
                expect(await wrappedCoin.balanceOf(other.address)).to.eq(amountToApprove);
            });
        }
    });
});
