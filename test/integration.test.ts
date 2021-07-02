import hre, { ethers } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { WrappedCoin, IERC20, IOracleRelayer } from "../typechain";
import { ContractTransaction } from "ethers/lib/";

const toWei = ethers.utils.parseEther;
use(require("chai-bignumber")());

// get contract ABI via Etherscan API
const getVerifiedContractAt = async (address: string): Promise<Contract> => {
    // @ts-ignore
    return hre.ethers.getVerifiedContractAt(address);
};
const getEvents = async (contract: Contract, tx: ContractTransaction) => {
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    return receipt.logs.reduce((parsedEvents, log) => {
        try {
            parsedEvents.push(contract.interface.parseLog(log));
        } catch (e) {}
        return parsedEvents;
    }, []);
};

describe("WrappedCoin", async function () {
    const name = "Wrapped Rai Reflexer Index";
    const symbol = "WrappedRAI";
    const decimals = 18;
    const RAY = BigNumber.from(10).pow(27);
    const INITIAL_REDEMPTION_PRICE = BigNumber.from(3).mul(RAY); // 3$ * 10**27
    const amount = BigNumber.from(100).pow(10).mul(decimals);

    const impersonatedAddress = "";
    const RAI_ADDR = "0x03ab458634910aad20ef5f1c8ee96f1d6ac54919";
    const ORACLE_RELAYER_ADDR = "0x4ed9c0dca0479bc64d8f4eb3007126d5791f7851";
    let wallet: SignerWithAddress;
    let other: SignerWithAddress;

    let WrappedCoinFactory;
    let coin: IERC20;
    let wrappedCoin: WrappedCoin;
    let oracleRelayer: IOracleRelayer;
    before(async () => {
        [wallet, other] = await ethers.getSigners();
        WrappedCoinFactory = await ethers.getContractFactory("WrappedCoin");
    });
    beforeEach(async function () {
        coin = (await getVerifiedContractAt(RAI_ADDR)) as IERC20;
        oracleRelayer = (await getVerifiedContractAt(ORACLE_RELAYER_ADDR)) as IOracleRelayer;

        wrappedCoin = (await WrappedCoinFactory.deploy(
            coin.address,
            oracleRelayer.address,
            name,
            symbol,
            decimals,
        )) as WrappedCoin;

        // refresh redemptionPrice
        const tx = await wrappedCoin.redemptionPrice();
        expect(tx).to.emit(oracleRelayer, "UpdateRedemptionPrice");
        const initialRedemptionPrice = (await getEvents(wrappedCoin, tx))[0].args[0];

        await wallet.sendTransaction({ to: impersonatedAddress, value: toWei("10") }); // get some eth from a wallet
        await ethers.provider.send("hardhat_impersonateAccount", [impersonatedAddress]);
    });
    afterEach(async () => {
        await hre.network.provider.request({
            method: "hardhat_reset",
            params: [
                {
                    forking: {
                        jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
                        blockNumber: parseInt(process.env.BLOCK_NUMBER),
                    },
                },
            ],
        });
    });

    it("get correct name,symbol,address and initial redemption price", async () => {
        expect(await wrappedCoin.name()).to.eq(name);
        expect(await wrappedCoin.symbol()).to.eq(symbol);
        expect(await wrappedCoin.RAI()).to.eq(coin.address);
        expect(await wrappedCoin.oracleRelayer()).to.eq(oracleRelayer.address);
        // refreshed redemption price in beforeEach fook
        await expect(oracleRelayer.redemptionPrice()).not.to.emit(oracleRelayer, "UpdateRedemptionPrice");
    });

    const mint = async (account, amount) => {
        await wrappedCoin.mint(account.address, amount);
    };

    it("mint: update internal redemptionPrice", async () => {
        // mint and update internal P_redemption
        await expect(wrappedCoin.mint(impersonatedAddress, amount)).to.emit(oracleRelayer, "UpdateRedemptionPrice");
    });

    const mintTest = async exp => {
        it(`mint: increase minter and protocol balances amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const redemptionPrice = await oracleRelayer.getCurrentRedemptionPrice();

            expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);
            expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(amount);
            // wrapped coin balance = deposited balance * redemptionPrice
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await wrappedCoin.totalSupply()).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await coin.balanceOf(wallet.address)).to.eq(0);
        });
    };

    const exponents = [2, 5, 27, 33];
    // exponents.forEach(mintTest);

    it("burn: update internal redemptionPrice", async () => {
        await mint(wallet, 1000);
        await oracleRelayer.setRedemptionPrice(INITIAL_REDEMPTION_PRICE.div(2));
        // burn and update internal P_redemption
        await wrappedCoin.burn(wallet.address, 1000);
        expect(await wrappedCoin.getRedemptionPrice()).to.eq(INITIAL_REDEMPTION_PRICE.div(2));
    });

    const burnTest = async exp => {
        it(`mint: increase minter and protocol balances amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const redemptionPrice = await oracleRelayer.getCurrentRedemptionPrice();
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
    // exponents.forEach(burnTest);

    const balanceTest = async denominator => {
        it(`balanceOf: balance depends on redemptionPrice - ${(10 / denominator).toFixed(2)}$ `, async () => {
            await coin.mint(wallet.address, amount);
            await coin.approve(wrappedCoin.address, amount);

            // P_redemption = 10**18 / denominator * 10**27 / 10**18
            const redemptionPrice = toWei("1").div(BigNumber.from(denominator)).mul(RAY).div(toWei("1"));
            await oracleRelayer.setRedemptionPrice(redemptionPrice);

            await coin.connect(wallet).approve(wrappedCoin.address, amount);
            await wrappedCoin.mint(wallet.address, amount);
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(amount.mul(redemptionPrice).div(RAY));
        });
    };

    const denominators = [2, 3, 6, 9, 12];
    // denominators.forEach(balanceTest);

    const transferTest = async exp => {
        it(`transfer: transfer from wallet to other - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            expect(await wrappedCoin.balanceOfUnderlying(wallet.address)).to.eq(amount);

            const withdrawAmount = amount.mul(await oracleRelayer.getCurrentRedemptionPrice()).div(RAY);
            // transfer external balances `amount` to other address
            await wrappedCoin.connect(wallet).transfer(other.address, withdrawAmount);

            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(other.address)).to.eq(withdrawAmount);
        });
    };

    // exponents.forEach(transferTest);

    const approveTest = async exp => {
        it(`approve: increase allowance and decrease allowance - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const approveAmount = amount.mul(await oracleRelayer.getCurrentRedemptionPrice()).div(RAY);

            await wrappedCoin.connect(wallet).approve(other.address, approveAmount);
            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(approveAmount);

            await wrappedCoin.connect(wallet).approve(other.address, 0);
            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
        });
    };
    // exponents.forEach(approveTest);

    const transferFromTest = async exp => {
        it(`transferFrom: transfer from wallet to other - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            await mint(wallet, amount);
            const approveAmount = amount.mul(await oracleRelayer.getCurrentRedemptionPrice()).div(RAY);

            await wrappedCoin.connect(wallet).approve(other.address, approveAmount);
            await wrappedCoin.connect(other).transferFrom(wallet.address, other.address, approveAmount);

            expect(await wrappedCoin.allowance(wallet.address, other.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(wallet.address)).to.eq(0);
            expect(await wrappedCoin.balanceOf(other.address)).to.eq(approveAmount);
        });
    };
    // exponents.forEach(transferFromTest);
});
