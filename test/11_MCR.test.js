const MCR = artifacts.require('MCR');
const Pool1 = artifacts.require('Pool1Mock');
const PoolData = artifacts.require('PoolData');
const DAI = artifacts.require('MockDAI');
const NXMToken = artifacts.require('NXMToken');

const { assertRevert } = require('./utils/assertRevert');
const { advanceBlock } = require('./utils/advanceToBlock');
const { ether } = require('./utils/ether');

const CA_ETH = '0x45544800';
const CA_DAI = '0x44414900';

let mcr;
let pd;
let tk;
let p1;
let balance_DAI;
let balance_ETH;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('MCR', function([owner, notOwner]) {
  before(async function() {
    await advanceBlock();
    mcr = await MCR.deployed();
    tk = await NXMToken.deployed();
    p1 = await Pool1.deployed();
    pd = await PoolData.deployed();
    cad = await DAI.deployed();
  });

  describe('Calculation of V(tp) and MCR(tp)', function() {
    let cal_vtp;
    let cal_mcrtp;

    before(async function() {
      await cad.transfer(p1.address, ether(600));
      balance_DAI = await cad.balanceOf(p1.address);
      balance_ETH = await web3.eth.getBalance(p1.address);
    });

    it('should return correct V(tp) price', async function() {
      const price_dai = await pd.getCurr3DaysAvg(CA_DAI);
      cal_vtp = balance_DAI.mul(100).div(price_dai);
      cal_vtp = cal_vtp.plus(balance_ETH);
      cal_vtp
        .toFixed(0)
        .should.be.bignumber.equal((await mcr.calVtpAndMCRtp(balance_ETH))[0]);
    });

    it('should return correct MCR(tp) price', async function() {
      const lastMCR = await pd.getLastMCR();
      cal_mcrtp = cal_vtp.mul(lastMCR[0]).div(lastMCR[2]);
      cal_mcrtp
        .toFixed(0)
        .should.be.bignumber.equal(
          (await mcr.calVtpAndMCRtp(await web3.eth.getBalance(p1.address)))[1]
        );
    });
  });

  describe('Token Price Calculation', function() {
    let tp_eth;
    let tp_dai;

    before(async function() {
      const tpd = await pd.getTokenPriceDetails(CA_ETH);
      const tc = (await tk.totalSupply()).div(1e18);
      const sf = tpd[0].div(1e5);
      const growthStep = tpd[1];
      const Curr3DaysAvg = tpd[2];
      const mcrtp = (await mcr.calVtpAndMCRtp(
        await web3.eth.getBalance(p1.address)
      ))[1];
      const mcrtpSquare = mcrtp.times(mcrtp).div(1e8);
      let Max = 1;
      if (mcrtpSquare >= 1) {
        Max = mcrtpSquare;
      }
      const tp = tc
        .div(growthStep)
        .plus(1)
        .times(Max)
        .times(sf);
      tp_eth = tp.times(Curr3DaysAvg.div(100));
      tp_dai = tp.times((await pd.getCurr3DaysAvg(CA_DAI)).div(100));
    });
    it('should return correct Token price in ETH', async function() {
      tp_eth.should.be.bignumber.equal(
        (await mcr.calculateTokenPrice(CA_ETH)).div(1e18)
      );
    });
    it('should return correct Token price in DAI', async function() {
      tp_dai.should.be.bignumber.equal(
        (await mcr.calculateTokenPrice(CA_DAI)).div(1e18)
      );
    });
  });
  describe('if owner/internal contract address', function() {
    describe('Change MCRTime', function() {
      it('should be able to change MCRTime', async function() {
        await mcr.changeMCRTime(1, { from: owner });
        (await pd.mcrTime()).should.be.bignumber.equal(1);
      });
    });
    describe('Change MinReqMCR', function() {
      it('should be able to change MinReqMCR', async function() {
        await mcr.changeMinReqMCR(1, { from: owner });
        (await pd.minCap()).should.be.bignumber.equal(ether(1));
      });
    });
    describe('Change Scaling Factor', function() {
      it('should be able to change Scaling Factor', async function() {
        await mcr.changeSF(1, { from: owner });
      });
    });
    describe('Add new MCR Data', function() {
      it('should be able to add MCR data', async function() {
        await mcr.addMCRData(
          18000,
          10000,
          2,
          ['0x455448', '0x444149'],
          [100, 65407],
          20181011,
          { from: owner }
        );
      });
    });

    describe('Adds MCR Data for last failed attempt', function() {
      it('should be able to add MCR data', async function() {
        await mcr.addLastMCRData(20181009, { from: owner });
        await mcr.addLastMCRData(20181011, { from: owner });
        await mcr.addLastMCRData(20181012, { from: owner });
      });
    });
  });

  describe('Misc', function() {
    it('should be able to change MinReqMCR', async function() {
      await assertRevert(mcr.changeMinReqMCR(1, { from: notOwner }));
    });
    it('should be able to change MCRTime', async function() {
      await assertRevert(mcr.changeMCRTime(1, { from: notOwner }));
    });
    it('should be able to get all Sum Assurance', async function() {
      await mcr.getAllSumAssurance();
      await pd.updateCurr3DaysAvg('0x44414900', 0, { from: owner });
      await mcr.getAllSumAssurance();
    });
    it('should not be able to change master address', async function() {
      await assertRevert(
        mcr.changeMasterAddress(mcr.address, { from: notOwner })
      );
    });
    it('should not be able to add currency', async function() {
      await assertRevert(mcr.addCurrency('0x4c4f4c', { from: notOwner }));
    });
    it('should return 1 if required MCR is more than last MCR percentage', async function() {
      await pd.changeMinReqMCR(19000, { from: owner });
      (await mcr.checkForMinMCR()).should.be.bignumber.equal(1);
    });
  });
});
