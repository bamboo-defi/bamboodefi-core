const { expectRevert, time } = require('@openzeppelin/test-helpers');
const BambooToken = artifacts.require('token/BambooToken');
const BambooField = artifacts.require('BambooField');
const ZooKeeper = artifacts.require('ZooKeeper.sol');
const MockERC20 = artifacts.require('token/MockToken.sol');


contract('BambooField', ([alice, bob, carol, dev]) => {
    beforeEach(async () => {
        this.bamboo = await BambooToken.new({ from: dev });
        this.keeper = await ZooKeeper.new(this.bamboo.address, '1', '0', { from: dev });
        // Create a BambooField with an entry price of 10 BAMBOO and a min stake time of 7 days
        this.field = await BambooField.new(this.bamboo.address, this.keeper.address, '10', '604800', { from: dev });
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', { from: dev });
        await this.keeper.add('100', this.lp.address, { from: dev });
        await this.lp.transfer(alice, '100', { from: dev });
        await this.lp.transfer(bob, '100', { from: dev });
        await this.lp.transfer(carol, '100', { from: dev });

        this.bamboo.mint(alice, '100', { from: dev });
        this.bamboo.mint(bob, '100', { from: dev });
        this.bamboo.mint(carol, '100', { from: dev });
    });

    it('should set correct state variables', async () => {
        assert.equal((await this.field.bamboo()).toString(), this.bamboo.address);
        assert.equal((await this.field.zooKeeper()).toString(), this.keeper.address);
        assert.equal((await this.field.owner()).toString(), dev);
        await this.field.setRegisterAmount('15', { from: dev });
        await this.field.setStakeTime('20', {from:dev});
        assert.equal((await this.field.registerAmount()).toString(), '15');
        assert.equal((await this.field.minStakeTime()).toString(), '20');

    });

    it('should not allow to buy seeds if not registered and staking', async () => {
        // Deposit some LP
        await this.lp.approve(this.keeper.address, '1000', { from: alice });
        await this.keeper.deposit(0, '100', { from: alice });

        await this.bamboo.approve(this.field.address, '1000', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: bob });

        // Cannot buy seeds without register
        await expectRevert(
             this.field.buy('100', { from: alice }),
            'buy: invalid user');

        // Cannot register with invalid poolId
        await expectRevert(
             this.field.register('1', '15', { from: alice }),
            'register: invalid pool');

        // Cannot register without active LP staking
        await expectRevert(
             this.field.register('0', '15', { from: bob }),
            'register: no LP on pool');

        await this.field.register('0', '15', { from: alice })
    });

    it('should not allow withdraw before lockTime', async () => {

        await this.lp.approve(this.keeper.address, '1000', { from: bob });
        await this.keeper.deposit(0, '100', { from: bob });
        await this.bamboo.approve(this.field.address, '1000', { from: bob });

        // cannot harvest yet
        await this.field.register('0', '15', { from: bob });
        await expectRevert(
            this.field.harvest('5', { from: bob }),
            'buy: cannot harvest seeds at this time');
        // advance 7 days
        await time.increase(604800);
        await expectRevert(
            this.field.harvest('10', { from: bob }),
            'ERC20: burn amount exceeds balance');
        await this.field.harvest('5', { from: bob });

    });

    it('should work with more than one participant', async () => {
        await this.bamboo.proposeOwner(this.keeper.address, {from: dev});
        await this.keeper.claimToken({from: dev});
        await this.lp.approve(this.keeper.address, '1000', { from: alice });
        await this.lp.approve(this.keeper.address, '1000', { from: bob });
        await this.keeper.deposit(0, '100', { from: bob });
        await this.keeper.deposit(0, '100', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: bob });

        // Alice registers and gets 20 seeds. Bob registers and gets 10 seeds.
        await this.field.register('0', '30', { from: alice });
        await this.field.register('0', '20', { from: bob });
        assert.equal((await this.field.balanceOf(alice)).toString(), '20');
        assert.equal((await this.field.balanceOf(bob)).toString(), '10');
        assert.equal((await this.bamboo.balanceOf(this.field.address)).toString(), '50');
        assert.equal((await this.field.depositPool()).toString(), '20');

        // BambooField gets 20 more BAMBOO from an external source.
        await this.bamboo.transfer(this.field.address, '20', { from: carol });
        // Alice deposits 10 more BAMBOO. She should receive 10*30/50 = 6 seeds.
        await this.field.buy('10', { from: alice });
        assert.equal((await this.field.balanceOf(alice)).toString(), '26');
        assert.equal((await this.field.balanceOf(bob)).toString(), '10');
        // Bob withdraws 5 seeds. He should receive 5*60/36 = 8 B
        await time.increase(604800);
        await this.field.harvest('5', { from: bob });
        assert.equal((await this.field.balanceOf(alice)).toString(), '26');
        assert.equal((await this.field.balanceOf(bob)).toString(), '5');
        assert.equal((await this.bamboo.balanceOf(this.field.address)).toString(), '72');
        assert.equal((await this.bamboo.balanceOf(alice)).toString(), '60');
        assert.equal((await this.bamboo.balanceOf(bob)).toString(), '88');
    });
    it('should allow withdraw of deposit', async () => {
        await this.lp.approve(this.keeper.address, '1000', { from: alice });
        await this.keeper.deposit(0, '100', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: alice });
        // Alice registers and buys seeds
        await this.field.register('0', '30', { from: alice });
        await this.field.buy('20', {from:alice});
        // Cannot withdraw before minStakeTime
        await expectRevert(
            this.field.withdraw({ from: alice }),
            'withdraw: cannot withdraw yet!');
        await time.increase(604800);
        await this.field.withdraw({ from: alice });
        // After withdraw all seeds were sold
        assert.equal((await this.field.balanceOf(alice)).toString(), '0');
        assert.equal((await this.field.totalSupply()).toString(), '0');
        // Alice can no longer buy seeds
        await expectRevert(
             this.field.buy('20', {from:alice}),
            'buy: invalid user');
    });
    it('should allow 60 days of extra buy time if conditions where met', async () => {
        await this.bamboo.proposeOwner(this.keeper.address, {from: dev});
        await this.keeper.claimToken({from: dev});
        await this.lp.approve(this.keeper.address, '1000', { from: alice });
        await this.lp.approve(this.keeper.address, '1000', { from: bob });
        await this.keeper.deposit(0, '100', { from: bob });
        await this.keeper.deposit(0, '100', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: alice });
        await this.bamboo.approve(this.field.address, '1000', { from: bob });
        // Enable LP tracking in ZooKeeper
        await this.keeper.switchBamboField(this.field.address, {from: dev});
        // Alice and Bob register in the same day
        await this.field.register('0', '30', { from: alice });
        await this.field.register('0', '30', { from: bob });
        // Advance 59 days. Alice withdraws LP
        await time.increase(5184000 - 86400);
        await this.keeper.withdraw(0, '100', { from: alice });
        // Advance a day. Alice withdraws LP
        await time.increase(86400);
        await this.keeper.withdraw(0, '100', { from: bob });
        // console.log(await this.field.)
        // Bob should enjoy 60 days of additional seeds, while Alice can no longer buy until she deposits some LP
        await expectRevert(
            this.field.buy('20', {from:alice}),
            'buy: invalid user');
        await this.field.buy('10', {from:bob});
        await time.increase(5184000 - 86400);
        await this.field.buy('10', {from:bob});
        await time.increase(86400);
        await expectRevert(
            this.field.buy('10', {from:bob}),
            'buy: invalid user');
    });
});