import hre, { ethers } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "@ethersproject/contracts";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ContractTransaction, Signer } from "ethers/lib/";
import { WrappedCoinTest, IERC20, IOracleRelayer } from "../typechain";

const toWei = ethers.utils.parseEther;
const overrides = { gasLimit: 9999999 };
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
const getRedemptionPriceFromEvent = async (oracleRelayer, tx: ContractTransaction): Promise<BigNumber> => {
    return await (await getEvents(oracleRelayer, tx)).find(e => e.name === "UpdateRedemptionPrice").args[0];
};

describe("WrappedCoin", async function () {
    const name = "Wrapped Rai Reflexer Index";
    const symbol = "WrappedRAI";
    const decimals = 18; // RAI decimals
    const RAY = BigNumber.from(10).pow(27);
    const RAI_ADDR = "0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919";
    const ORACLE_RELAYER_ADDR = "0x4ed9C0dCa0479bC64d8f4EB3007126D5791f7851";

    const signerAddr = "0xef6fe9c9b351824c96e5c7a478c1e52badcbaee0";
    const amount = BigNumber.from(1000).mul(BigNumber.from(10).pow(decimals));

    const signer = ethers.provider.getSigner(signerAddr);
    let wallet: SignerWithAddress;
    let other: SignerWithAddress;

    let WrappedCoinFactory;
    let coin: IERC20;
    let wrappedCoin: WrappedCoinTest;
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
            overrides,
        )) as WrappedCoinTest;

        // refresh redemptionPrice
        expect(await oracleRelayer.redemptionPrice()).to.emit(oracleRelayer, "UpdateRedemptionPrice");

        // the RAI balance of the account you are trying to impersonate should be greater than `amount`
        expect(await coin.balanceOf(signerAddr)).to.be.gt(amount);

        await wallet.sendTransaction({ to: signerAddr, value: toWei("100") }); // get some eth from a wallet
        await ethers.provider.send("hardhat_impersonateAccount", [signerAddr]);
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
    });

    const mint = async (minter: Signer, amount: BigNumberish) => {
        await coin.connect(minter).approve(wrappedCoin.address, amount);
        return await wrappedCoin.connect(minter).mint(await minter.getAddress(), amount, overrides);
    };

    it("mint: update internal redemptionPrice", async () => {
        await coin.connect(signer).approve(wrappedCoin.address, amount);
        await expect(wrappedCoin.connect(signer).mint(signerAddr, amount)).to.emit(
            oracleRelayer,
            "UpdateRedemptionPrice",
        );
    });

    const mintTest = async exp => {
        it(`mint: increase minter and protocol balances amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            const balanceBefore = await coin.balanceOf(signerAddr);
            const tx = await mint(signer, amount);
            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, tx);

            expect(await wrappedCoin.balanceOfUnderlying(signerAddr)).to.eq(amount);
            expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(amount);

            // wrapped coin balance = deposited balance * redemptionPrice
            expect(await wrappedCoin.balanceOf(signerAddr)).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await wrappedCoin.totalSupply()).to.eq(amount.mul(redemptionPrice).div(RAY));
            expect(await coin.balanceOf(signerAddr)).to.eq(balanceBefore.sub(amount));
        });
    };

    const exponents = [0, 2, 5, 18, 21];
    exponents.forEach(mintTest);

    it("burn: update internal redemptionPrice", async () => {
        await mint(signer, amount);
        await expect(wrappedCoin.burn(signerAddr, 100)).to.emit(oracleRelayer, "UpdateRedemptionPrice");
    });

    const burnTest = async exp => {
        it(`burn: increase minter and protocol balances amount 10**${exp}`, async () => {
            const depositAmount = BigNumber.from(10).pow(exp);
            const mintTx = await mint(signer, depositAmount);

            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, mintTx);
            const minterBalance = await wrappedCoin.balanceOf(signerAddr);
            await wrappedCoin.burn(signerAddr, minterBalance);

            // underlyingBalanceAfterBurn = depositAmount - underlyingAmountToBurn != 0 because of rounding error
            const underlyingAmountToBurn = minterBalance.mul(RAY).div(redemptionPrice);
            const underlyingBalanceAfterBurn = depositAmount.sub(underlyingAmountToBurn);
            expect(await wrappedCoin.balanceOfUnderlying(signerAddr)).to.eq(underlyingBalanceAfterBurn);
            expect(await wrappedCoin.totalSupplyUnderlying()).to.eq(underlyingBalanceAfterBurn);
        });
    };

    exponents.forEach(burnTest);

    const balanceTest = async denominator => {
        it(`balanceOf: The balance is proportional to the redemptionPrice - ${(10 / denominator).toFixed(
            2,
        )}$`, async () => {
            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, await mint(signer, amount));
            expect(await wrappedCoin.balanceOf(signerAddr)).to.eq(amount.mul(redemptionPrice).div(RAY));
        });
    };

    const denominators = [2, 3, 6, 9, 12];
    denominators.forEach(balanceTest);

    const transferTest = async exp => {
        it(`transfer: transfer amount 10**${exp} from signer to other`, async () => {
            const tx = await mint(signer, amount);
            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, tx);
            const amountToTransfer = BigNumber.from(10).pow(exp);
            const underlyingToTransfer = amountToTransfer.mul(RAY).div(redemptionPrice);
            expect(await wrappedCoin.balanceOfUnderlying(signerAddr)).to.eq(amount);

            await wrappedCoin.connect(signer).transfer(other.address, amountToTransfer);

            const signerBalance = await wrappedCoin.balanceOfUnderlying(signerAddr);
            const otherBalance = await wrappedCoin.balanceOfUnderlying(other.address);

            expect(signerBalance.add(otherBalance)).to.eq(amount); // The sum of the two account balances should remain the same.

            //  in same case, total supply does't remain the same.
            // expect((await wrappedCoin.balanceOf(signerAddr)).add(await wrappedCoin.balanceOf(other.address)))).to.eq(totalSupply);
            expect(amount.sub(underlyingToTransfer)).to.eq(signerBalance);
            expect(underlyingToTransfer).to.eq(otherBalance);
        });
    };
    exponents.forEach(transferTest);

    const approveTest = async exp => {
        it(`approve: increase allowance and decrease allowance - amount 10**${exp}`, async () => {
            const amount = BigNumber.from(10).pow(exp);
            const tx = await mint(signer, amount);
            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, tx);
            const amountToApprove = amount.mul(redemptionPrice).div(RAY);

            await wrappedCoin.connect(signer).approve(other.address, amountToApprove);
            expect(await wrappedCoin.allowance(signerAddr, other.address)).to.eq(amountToApprove);

            await wrappedCoin.connect(signer).approve(other.address, 0);
            expect(await wrappedCoin.allowance(signerAddr, other.address)).to.eq(0);
        });
    };
    exponents.forEach(approveTest);

    const transferFromTest = async exp => {
        it(`transferFrom: transfer from signer to other - amount 10**${exp}`, async () => {
            const tx = await mint(signer, amount);
            const redemptionPrice = await getRedemptionPriceFromEvent(oracleRelayer, tx);
            const amountToApprove = BigNumber.from(10).pow(exp);

            await wrappedCoin.connect(signer).approve(other.address, amountToApprove);
            await wrappedCoin.connect(other).transferFrom(signerAddr, other.address, amountToApprove);

            expect(await wrappedCoin.allowance(signerAddr, other.address)).to.eq(0);
            expect(await wrappedCoin.balanceOfUnderlying(signerAddr)).to.eq(
                amount.sub(amountToApprove.mul(RAY).div(redemptionPrice)),
            );
            expect(await wrappedCoin.balanceOfUnderlying(other.address)).to.eq(
                amountToApprove.mul(RAY).div(redemptionPrice),
            );
        });
    };
    exponents.forEach(transferFromTest);
});
