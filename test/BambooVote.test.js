const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const BambooToken = artifacts.require('token/BambooToken.sol');
const ZooKeeper = artifacts.require('ZooKeeper.sol');
const BVote = artifacts.require('token/BambooVote.sol')


contract('BambooToken', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.bamboo = await BambooToken.new({ from: alice });
    });
    context('With ZooKeeper active', () => {
        beforeEach(async () => {
            await this.bamboo.mint(bob, '1000');
            await this.bamboo.mint(carol, '1000');
        });

        it('should mint one vote per staking wallet', async () => {
            this.panda = await ZooKeeper.new(this.bamboo.address, '100', '0',{ from: alice });
            await this.bamboo.proposeOwner(this.panda.address);
            await this.panda.claimToken();
            this.bv = await BVote.new('BambooVote', 'BVOTE', this.panda.address);

            // Bob deposits bamboo for staking, carol doesn't
            await this.panda.addStakeMultiplier('500', [10100, 10000, 10000, 10000, 10000, 10000, 10000,
                10000, 10000, 10000, 10000, 10000]);
            await this.bamboo.approve(this.panda.address, '1000', { from: bob });
            await this.panda.depositBamboo('500', 86400, { from: bob });

            // Bob cannot claim because not enough time staking
            await expectRevert(this.bv.claimVote({from: bob}), 'claimVote: needs at least 1 day since last staking deposit');
            // Carol cannot claim because no staking
            await expectRevert(this.bv.claimVote({from: carol}), 'claimVote: needs active Bamboo stake to claim');
            await time.increase(86401);
            await time.advanceBlock();
            // Bob claims his vote
            await this.bv.claimVote({from: bob});
            // Bob cannot claim the vote again (one per wallet)
            await expectRevert(this.bv.claimVote({from: bob}), 'claimVote: vote already claimed');
            // Carol claims the vote after a deposit and a day
            await this.bamboo.approve(this.panda.address, '1000', { from: carol });
            await this.panda.depositBamboo('500', 86400, { from: carol });
            await time.increase(86400);
            await time.advanceBlock();
            await this.bv.claimVote({from: carol});
            assert.equal((await this.bv.balanceOf(bob)).toString(), '1000000000000000000');
            assert.equal((await this.bv.balanceOf(carol)).toString(), '1000000000000000000');

        });
    });
});
