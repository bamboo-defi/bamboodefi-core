const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const BambooToken = artifacts.require('token/BambooToken.sol');
const BBYP = artifacts.require('BBYP.sol');

contract('BBYP', ([alice, bob, carol, dev]) => {
    beforeEach(async () => {
        this.bamboo = await BambooToken.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.biglottery = await BBYP.new(this.bamboo.address, { from: dev });
        const bamboo = await this.biglottery.bamboo();
        const owner = await this.biglottery.owner();
        assert.equal(bamboo.toString(), this.bamboo.address);
        assert.equal(owner.toString(), dev);
    });

    it('should allow owner to change variables and start the contract', async () => {
        this.biglottery = await BBYP.new(this.bamboo.address, { from: alice });
        let seed = web3.utils.sha3(""+Math.random());
        // Should not be able to start the contract until ticket price is set
        await expectRevert(this.biglottery.beginLottery(seed,{ from: alice }), 'beginLottery: please set ticket price first');
        await this.biglottery.setTicketPrice('500');
        const price = await this.biglottery.price();
        // Only owner should be able to start the contract
        await expectRevert(this.biglottery.beginLottery(seed,{ from: bob }), 'Ownable: caller is not the owner.');
        // Start the contract
        await this.biglottery.beginLottery(seed,{ from: alice });
        const started = await this.biglottery.isActive();
        assert.equal(price.toString(), '500');
        assert.equal(started.toString(), 'true');
    });

    context('With the lottery being used', () => {
        beforeEach(async () => {
            this.biglottery = await BBYP.new(this.bamboo.address, { from: dev });
            await this.biglottery.setTicketPrice('500', { from: dev });
            await this.bamboo.mint(bob, '10000');
            await this.bamboo.mint(alice, '20000');
            await this.bamboo.mint(carol, '10000');
            await this.bamboo.approve(this.biglottery.address, '200000', { from: alice });
            await this.bamboo.approve(this.biglottery.address, '10000', { from: bob });
            await this.bamboo.approve(this.biglottery.address, '10000', { from: carol });
        });

        it('should allow to buy tickets by burning bamboo', async () => {
            let seed = web3.utils.sha3(""+Math.random());
            await this.biglottery.beginLottery(seed,{ from: dev });
            // Anyone should be able to buy tickets if they can afford it
            await this.biglottery.buyTickets(1,true, { from: alice });
            await expectRevert(this.biglottery.buyTickets(21,true,  { from: bob }), 'buyTickets: not enough bamboo!');
            await this.biglottery.buyTickets(20,true, { from: bob });
            await this.biglottery.buyTickets(5,true, { from: carol });
            assert.equal((await this.biglottery.getTickets(alice)).toString(), '1');
            assert.equal((await this.biglottery.getTickets(bob)).toString(), '20');
            assert.equal((await this.biglottery.getTickets(carol)).toString(), '5');
            // Bamboo used for tickets should be burned
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '19500');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '7500');
            assert.equal((await this.bamboo.balanceOf(this.biglottery.address)).toString(), '0');
        });

        it('should choose a winner after owner reveals the seed', async () => {

            // Correct way of obtaining a verifiable seed.
            // 32 characters of seed + 32 bits of right padding
            let seed = web3.utils.padRight(web3.utils.randomHex(16), 64);
            // Padding of address
            let addr = web3.utils.padLeft(dev, 64);
            let hseed = web3.utils.soliditySha3(addr,seed);

            await this.biglottery.beginLottery(hseed,{ from: dev });

            await this.biglottery.buyTickets(20,false, { from: carol });
            await this.biglottery.buyTickets(20,true, { from: bob });
            await this.biglottery.buyTickets(20,false, { from: alice });

            // Anyone deposit to the prize pool
            await this.biglottery.addToPool('10000', {from: alice});
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '0');
            // The only bamboo kept by the contract should be the prizePool
            assert.equal((await this.bamboo.balanceOf(this.biglottery.address)).toString(), (await this.biglottery.prizePool()).toString());
            let purchaseLimit1 = await this.biglottery.purchaseLimit();
            // Commit on block 100
            await time.increase(31536000);
            await time.advanceBlockTo('99');
            await this.biglottery.commit({ from: bob });

            assert.equal((await this.biglottery.commited()).toString(), 'true');
            // Some blocks need to pass after commit
            await expectRevert(this.biglottery.revealWinner(seed, {from:dev}), 'revealWinner: wait for a block to pass');

            // Owner needs to reveal the seed.
            await expectRevert(this.biglottery.revealWinner(seed, { from: alice }), 'Ownable: caller is not the owner.');

            await time.advanceBlockTo('102');
            let receipt = await this.biglottery.revealWinner(seed, {from:dev});
            expectEvent(receipt, 'Winner');
            assert.equal((await this.bamboo.balanceOf(this.biglottery.address)).toString(), '0');

            // Lottery will not start until owner declares another seed
            await expectRevert(this.biglottery.addToPool('200',), 'addToPool: lottery has not started yet');
            await expectRevert(this.biglottery.buyTickets(3, 'false'), 'buyTickets: lottery has not started yet');

            // Cannot use the same seed
            await expectRevert(this.biglottery.beginLottery(hseed,{ from: dev }), 'beginLottery: already used seed');
            seed = web3.utils.padRight(web3.utils.randomHex(16), 64);
            addr = web3.utils.padLeft(alice, 64);
            hseed = web3.utils.soliditySha3(addr,seed);
            await this.biglottery.beginLottery(hseed,{ from: dev });

            // The new year has started!!
            let purchaseLimit2 = await this.biglottery.purchaseLimit();
            assert.notEqual((-purchaseLimit1 + purchaseLimit2 >= 31536000), true);
        });
    });
});
