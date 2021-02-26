const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const BambooToken = artifacts.require('token/BambooToken.sol');
const ZooKeeper = artifacts.require('ZooKeeper.sol');
const MockERC20 = artifacts.require('token/MockToken.sol');

contract('ZooKeeper', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.bamboo = await BambooToken.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.panda = await ZooKeeper.new(this.bamboo.address, '1000', '0', { from: alice });
        await this.bamboo.proposeOwner(this.panda.address);
        await this.panda.claimToken();
        const bamboo = await this.panda.bamboo();
        const owner = await this.bamboo.owner();
        assert.equal(bamboo.toString(), this.bamboo.address);
        assert.equal(owner.toString(), this.panda.address);
    });

    context('With ERC/LP token added to the field', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            await this.lp.transfer(alice, '1000', { from: minter });
            await this.lp.transfer(bob, '1000', { from: minter });
            await this.lp.transfer(carol, '1000', { from: minter });
            this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', { from: minter });
            await this.lp2.transfer(alice, '1000', { from: minter });
            await this.lp2.transfer(bob, '1000', { from: minter });
            await this.lp2.transfer(carol, '1000', { from: minter });
        });

        it('should allow emergency withdraw', async () => {
            // 100 per block farming rate starting at block 100
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '100',{ from: alice });
            await this.panda.add('100', this.lp.address);
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await this.panda.deposit(0, '100', { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).toString(), '900');
            await this.panda.emergencyWithdraw(0, { from: bob });
            assert.equal((await this.lp.balanceOf(bob)).toString(), '1000');
        });

        it('should give out BAMBOOs only after farming time', async () => {
            // 100 per block farming rate starting at block 100
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '100', { from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.panda.add('100', this.lp.address);
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await this.panda.deposit(0, '100', { from: bob });
            await time.advanceBlockTo('89');
            await this.panda.deposit(0, '0', { from: bob }); // block 90
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            await time.advanceBlockTo('94');
            await this.panda.deposit(0, '0', { from: bob }); // block 95
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            await time.advanceBlockTo('99');
            await this.panda.deposit(0, '0', { from: bob }); // block 100
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            await time.advanceBlockTo('100');
            await this.panda.deposit(0, '0', { from: bob }); // block 101
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '100');
            await time.advanceBlockTo('104');
            await this.panda.deposit(0, '0', { from: bob }); // block 105
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '500');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            assert.equal((await this.bamboo.totalSupply()).toString(), '500');
        });

        it('should not distribute BAMBOOs if no one deposit', async () => {
            // 100 per block farming rate starting at block 200
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '200',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.panda.add('100', this.lp.address);
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await time.advanceBlockTo('199');
            assert.equal((await this.bamboo.totalSupply()).toString(), '0');
            await time.advanceBlockTo('204');
            assert.equal((await this.bamboo.totalSupply()).toString(), '0');
            await time.advanceBlockTo('209');
            await this.panda.deposit(0, '10', { from: bob }); // block 210
            assert.equal((await this.bamboo.totalSupply()).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            assert.equal((await this.lp.balanceOf(bob)).toString(), '990');
            await time.advanceBlockTo('219');
            await this.panda.withdraw(0, '10', { from: bob }); // block 220
            assert.equal((await this.bamboo.totalSupply()).toString(), '1000');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1000');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            assert.equal((await this.lp.balanceOf(bob)).toString(), '1000');
        });

        it('should distribute BAMBOOs properly for each staker', async () => {
            // 100 per block farming rate starting at block 300
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '300', { from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.panda.add('100', this.lp.address);
            await this.lp.approve(this.panda.address, '1000', { from: alice });
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await this.lp.approve(this.panda.address, '1000', { from: carol });
            // Alice deposits 10 LPs at block 310
            await time.advanceBlockTo('309');
            await this.panda.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 314
            await time.advanceBlockTo('313');
            await this.panda.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 318
            await time.advanceBlockTo('317');
            await this.panda.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 320. At this point:
            //   Alice should have: 4*100 + 4*1/3*100 + 2*1/6*100 = 566.6
            //   ZooKeeper should have the remaining: 1000 - 566 = 434
            await time.advanceBlockTo('319')
            await this.panda.deposit(0, '10', { from: alice });
            assert.equal((await this.bamboo.totalSupply()).toString(), '1000');
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '566');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '434');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            // Bob withdraws 5 LPs at block 330. At this point:
            //   Bob should have: 4*2/3*100 + 2*2/6*100 + 10*2/7*100 = 619
            await time.advanceBlockTo('329')
            await this.panda.withdraw(0, '5', { from: bob });
            assert.equal((await this.bamboo.totalSupply()).toString(), '2000');
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '566');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '619');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '815');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            // Alice withdraws 20 LPs at block 340.
            // Bob withdraws 15 LPs at block 350.
            // Carol withdraws 30 LPs at block 360.
            await time.advanceBlockTo('339')
            await this.panda.withdraw(0, '20', { from: alice });
            await time.advanceBlockTo('349')
            await this.panda.withdraw(0, '15', { from: bob });
            await time.advanceBlockTo('359')
            await this.panda.withdraw(0, '30', { from: carol });
            assert.equal((await this.bamboo.totalSupply()).toString(), '5000');
            assert.equal((await this.bamboo.balanceOf(dev)).toString(), '0');
            // Alice should have: 566 + 10*2/7*100 + 10*2/6.5*100 = 1159
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '1159');
            // Bob should have: 619 + 10*1.5/6.5 * 100 + 10*1.5/4.5*100 = 1183
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1183');
            // Carol should have: 2*3/6*100 + 10*3/7*100 + 10*3/6.5*100 + 10*3/4.5*100 + 10*100 = 26568
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '2657');
            // All of them should have 1000 LPs back.
            assert.equal((await this.lp.balanceOf(alice)).toString(), '1000');
            assert.equal((await this.lp.balanceOf(bob)).toString(), '1000');
            assert.equal((await this.lp.balanceOf(carol)).toString(), '1000');
        });

        it('should give proper BAMBOOs allocation to each pool', async () => {
            // 100 per block farming rate starting at block 400
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '400', { from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.lp.approve(this.panda.address, '1000', { from: alice });
            await this.lp2.approve(this.panda.address, '1000', { from: bob });
            // Add first LP to the pool with allocation 1
            await this.panda.add('10', this.lp.address);
            // Alice deposits 10 LPs at block 410
            await time.advanceBlockTo('409');
            await this.panda.deposit(0, '10', { from: alice });
            // Add LP2 to the pool with allocation 2 at block 420
            await time.advanceBlockTo('419');
            await this.panda.add('20', this.lp2.address);
            // Alice should have 10*100 pending reward
            assert.equal((await this.panda.pendingBamboo(0, alice)).toString(), '1000');
            // Bob deposits 5 LP2s at block 425
            await time.advanceBlockTo('424');
            await this.panda.deposit(1, '5', { from: bob });
            // Alice should have 1000 + 5*1/3*100 = 1166 pending reward
            assert.equal((await this.panda.pendingBamboo(0, alice)).toString(), '1166');
            await time.advanceBlockTo('430');
            // At block 430. Bob should get 5*2/3*100 = 333. Alice should get ~166 more.
            assert.equal((await this.panda.pendingBamboo(0, alice)).toString(), '1333');
            assert.equal((await this.panda.pendingBamboo(1, bob)).toString(), '333');
        });

    });

    context('With BAMBOO tokens added for staking', () => {
        beforeEach(async () => {
            await this.bamboo.mint(bob, '1000');
        });

        it('should mint additional bamboos when locked for staking', async () => {
            // 100 per block farming rate starting at block 500
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '500',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            // Add a staking reward
            await this.panda.addStakeMultiplier('500', [10100, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1000');
            // Deposit 500 Bamboo and lock it for a day
            await this.bamboo.approve(this.panda.address, '1000', { from: bob });
            let receipt = await this.panda.depositBamboo('500', 86400, { from: bob });
            expectEvent(receipt, 'BAMBOODeposit', { user: bob, amount: '500', lockTime: '86400' });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '500');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '500');
            // Get the id from the event
            let id = receipt.logs[0].args.id.toString();
            // Advance a day and withdraw
            await time.increase(86400);
            await this.panda.withdrawBamboo(id, { from: bob });
            // 500*10100/10000 = 505
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1005');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '0');
            assert.equal((await this.bamboo.totalSupply()).toString(), '1005');

        });
        it('should allow to claim the staking bonuses daily', async () => {

            // 100 per block farming rate starting at block 550
            await time.advanceBlockTo('548');
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '550',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            // Add a staking reward of x2 at 1000 when staking for 30 days
            await this.panda.addStakeMultiplier('1000', [10000, 10000, 10000, 20000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            // Deposit 1000 Bamboo and lock it for 30 days
            await this.bamboo.approve(this.panda.address, '1000', { from: bob });
            let receipt = await this.panda.depositBamboo('1000', 2592000, { from: bob });
            expectEvent(receipt, 'BAMBOODeposit', { user: bob, amount: '1000', lockTime: '2592000' });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '1000');
            // Get the id from the deposit
            let id = receipt.logs[0].args.id.toString();
            // 86400, 604800, 1296000, 2592000
            // Advance a day and withdraw the available bonus.
            // Reward for a day should be 1000/30 = 33
            await time.increase(86401);
            await this.panda.withdrawDailyBamboo(id, { from: bob });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '33');
            // Deposit should be still locked
            await expectRevert(this.panda.withdrawBamboo(id, { from: bob }), 'withdrawBamboo: cannot withdraw yet!');
            // Should not be able to withdraw until another day has passed
            await time.increase(43200);
            let receiptA = await this.panda.withdrawDailyBamboo(id, { from: bob });
            assert.equal(receiptA.logs[0].args.amount.toString(), '0');
            assert.equal(receiptA.logs[0].args.ndays.toString(), '0');
            // Advance 15 days and claim rewards 1252800
            // Reward for a day should be [1000/30] * 15 = 495
            await time.increase(1296000);
            await this.panda.withdrawDailyBamboo(id, { from: bob });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '528');
            // Check what we have remaining to claim in the future
            // 1000 - 528 = 472
            let receiptB = await this.panda.pendingStakeBamboo(id, bob);
            assert.equal(receiptB[0].toString(), '472');
            // Claimable at the moment should be 0
            assert.equal(receiptB[1].toString(), '0');

            // Advance the remaining 14 days.
            await time.increase(1296000);
           // The 472 should be claimable at the moment
            let receiptC = await this.panda.pendingStakeBamboo(id, bob);
            assert.equal(receiptC[0].toString(), '472');
            assert.equal(receiptC[1].toString(), '472');
            // Withdraw the deposit and the remaining bonuses
            await this.panda.withdrawBamboo(id, { from: bob });
            // 1000*20000/10000 = 2000
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '2000');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '0');
            assert.equal((await this.bamboo.totalSupply()).toString(), '2000');

        });
        it('should handle multiple deposits independently', async () => {
            // 100 per block farming rate starting at block 650
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '650',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            // Add a staking reward
            await this.panda.addStakeMultiplier('500', [10100, 20000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            // Deposit 500 Bamboo and lock it for a day
            await this.bamboo.approve(this.panda.address, '10000', { from: bob });
            let receipt = await this.panda.depositBamboo('500', 86400, { from: bob });
            let id1 = receipt.logs[0].args.id.toString();
            await time.advanceBlock();
            await time.increase(600);
            // Deposit 500 Bamboo and lock it for a week
            let receipt2 = await this.panda.depositBamboo('500', 604800, { from: bob });
            let id2 = receipt2.logs[0].args.id.toString();
            // Advance a week
            await time.increase(604800);
            // Withdraw deposit 2
            // 500*20000/10000 = 1000
            // pending = 1000 - deposit = 500
            assert.equal((await this.panda.pendingStakeBamboo(id2, bob))[0].toString(), '500');
            await this.panda.withdrawBamboo(id2, { from: bob });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1000');
            assert.equal((await this.bamboo.totalSupply()).toString(), '1500');
            //
            // Withdraw deposit 1
            // 500*10100/10000 = 505
            // pending = 505 - deposit = 5
            assert.equal((await this.panda.pendingStakeBamboo(id1, bob))[0].toString(), '5');
            await this.panda.withdrawBamboo(id1, { from: bob });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1505');
            assert.equal((await this.bamboo.totalSupply()).toString(), '1505');
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '0');
        });
    });
    context('With BAMBOO tokens to increase yield farming rewards', () => {
        beforeEach(async () => {
            this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: minter });
            await this.lp.transfer(alice, '1000', { from: minter });
            await this.lp.transfer(bob, '1000', { from: minter });
            await this.lp.transfer(carol, '1000', { from: minter });
            await this.bamboo.mint(bob, '1000');
            await this.bamboo.mint(alice, '1000');
            await this.bamboo.mint(carol, '1000');
        });

        it('yield farming should have a multiplier if some bamboo is locked', async () => {
            // 100 per block farming rate starting at block 700
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '700',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.panda.add('100', this.lp.address);
            // Add a staking reward to enable BAMBOO deposits
            await this.panda.addStakeMultiplier('1000', [10000, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            // Add a yield farming + staking reward (a x1.001 yield multiplier of 1000 locked bamboo)
            await this.panda.addYieldMultiplier('1000', 10010);
            // Deposit 1000 Bamboo
            await this.bamboo.approve(this.panda.address, '1000', { from: bob });
            await this.panda.depositBamboo('1000', 31536000, { from: bob });
            // Deposit LP tokens
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await this.panda.deposit(0, '100', { from: bob });
            await time.advanceBlockTo('709');
            await this.panda.deposit(0, '0', { from: bob }); // block 710
            // Should not get yield because of minYield of 7 days
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '1000');
            await time.increase(86400*8);
            await time.advanceBlock();
            await time.advanceBlockTo('719');
            await this.panda.deposit(0, '0', { from: bob }); // block 720
            //  10*100(normal bamboo farming of 10 blocks)  *  1.001(yield multiplier for 1000 bamboo) + 1000 previous = 2001
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '2001');
            // ZooKeeper only holds the deposits
            assert.equal((await this.bamboo.balanceOf(this.panda.address)).toString(), '1000');

        });
        it('should add multiple deposits and determine the closest reward available', async () => {
            // 100 per block farming rate starting at block 800
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '800',{ from: alice });
            await this.panda.minYield(0, 0, { from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            await this.panda.add('100', this.lp.address);
            await this.lp.approve(this.panda.address, '1000', { from: alice });
            await this.lp.approve(this.panda.address, '1000', { from: bob });
            await this.lp.approve(this.panda.address, '1000', { from: carol });
            // Enable deposits for 200, 300, 500
            await this.panda.addStakeMultiplier('200', [10000, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            await this.panda.addStakeMultiplier('300', [10000, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            await this.panda.addStakeMultiplier('500', [10000, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            // Add a yield farming + staking reward for 300, 600, 900 BAMBOO locked in deposits
            await this.panda.addYieldMultiplier('300', 11000);
            await this.panda.addYieldMultiplier('600', 12000);
            await this.panda.addYieldMultiplier('900', 13000);
            // Alice deposits 300 and 200. We save the id for withdrawing 300 later.
            await this.bamboo.approve(this.panda.address, '10000', { from: alice });
            let receipta = await this.panda.depositBamboo('300', 86400, { from: alice })
            let idalice = receipta.logs[0].args.id.toString();
            await time.advanceBlock();
            await time.increase(600);
            await this.panda.depositBamboo('200', 86400, { from: alice });
            await time.advanceBlock();
            await time.increase(600);
            // Bob deposits 500 and 500. We save the id for withdrawing 500 later.
            await this.bamboo.approve(this.panda.address, '10000', { from: bob });
            let receiptb = await this.panda.depositBamboo('500', 86400, { from: bob });
            let idbob = receiptb.logs[0].args.id.toString();
            await time.advanceBlock();
            await time.increase(600);
            await this.panda.depositBamboo('500', 86400, { from: bob });
            await time.advanceBlock();
            await time.increase(600);
            // Carol deposits 200, 300 and 500. We save the id for withdrawing 200 later.
            await this.bamboo.approve(this.panda.address, '10000', { from: carol });
            let receiptc = await this.panda.depositBamboo('200', 86400, { from: carol });
            let idcarol = receiptc.logs[0].args.id.toString();
            await time.advanceBlock();
            await time.increase(600);
            await this.panda.depositBamboo('300', 86400, { from: carol });
            await time.advanceBlock();
            await time.increase(600);
            await this.panda.depositBamboo('500', 86400, { from: carol });
            // Alice deposits 10 LPs at block 810
            await time.advanceBlockTo('809');
            await this.panda.deposit(0, '10', { from: alice });
            // Bob deposits 20 LPs at block 815
            await time.advanceBlockTo('814');
            await this.panda.deposit(0, '20', { from: bob });
            // Carol deposits 30 LPs at block 819
            await time.advanceBlockTo('818');
            await this.panda.deposit(0, '30', { from: carol });
            // Alice deposits 10 more LPs at block 825. At this point:
            // Alice should have: [5*100 + 4*1/3*100 + 6*1/6*100]*1.1 = 806.6
            await time.increase(86400);
            await time.advanceBlockTo('824')
            await this.panda.deposit(0, '10', { from: alice });
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '1306');
            // Alice withdraws 300 BAMBOO
            await this.panda.withdrawBamboo(idalice, { from: alice });
            // Bob claims his BAMBOO rewards at block 830. At this point:
            // Bob should have: [4*2/3*100 + 6*2/6*100 + 5*2/7*100]*1.3 = 791
            await time.advanceBlockTo('829');
            await this.panda.deposit(0, '0', { from: bob });
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '791');
            // Bob withdraws 500 BAMBOO. Carol withdraws 200 BAMBOO.
            await this.panda.withdrawBamboo(idbob, { from: bob });
            await this.panda.withdrawBamboo(idcarol, { from: carol });
            // Going forward 10 blocks...
            await time.advanceBlockTo('840');
            // Alice has 200 BAMBOO in deposits, can't access to any multiplier.
            // Alice should have pending: 15*2/7*100*1.0 = 429
            // Bob has 500 BAMBOO in deposits, so he can only get the 300-one.
            // Bob should have pending: 10*2/7*100*1.1 = 314
            // Carol had the 900-multiplier when she had 1000 in deposits, but she withdrew BAMBOO without claiming any rewards from the pool.
            // Therefore now she can only have the 600-multiplier
            // Carol should have pending:  [6*3/6*100 + 5*3/7*100 + 10*3/7*100]*1.2 = 1131
            assert.equal((await this.panda.pendingBamboo(0, alice)).toString(), '429');
            assert.equal((await this.panda.pendingBamboo(0, bob)).toString(), '314');
            assert.equal((await this.panda.pendingBamboo(0, carol)).toString(), '1131');
        });
    });
});
