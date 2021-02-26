const { expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const BambooToken = artifacts.require('token/BambooToken.sol');
const Raindrop = artifacts.require('Raindrop.sol');

contract('Raindrop', ([alice, bob, carol, dev, minter]) => {
    beforeEach(async () => {
        this.bamboo = await BambooToken.new({ from: alice });
    });

    it('should set correct state variables', async () => {
        this.lottery = await Raindrop.new(this.bamboo.address,{ from: alice });
        const bamboo = await this.lottery.bamboo();
        const owner = await this.lottery.owner();
        assert.equal(bamboo.toString(), this.bamboo.address);
        assert.equal(owner.toString(), alice);
    });

    it('should allow owner to set variables and start the contract', async () => {
        this.lottery = await Raindrop.new(this.bamboo.address, { from: alice });
        await this.lottery.setFeeTo(alice);
        // Should not be able to start the contract until ticket price is set
        await expectRevert(this.lottery.startRain({ from: alice }), 'startRain: please set ticket price first');
        await this.lottery.setTicketPrice('500');
        const feeto = await this.lottery.feeTo();
        const price = await this.lottery.price();
        // Start the contract
        await this.lottery.startRain();
        const started = await this.lottery.isCloudy();
        assert.equal(feeto.toString(), alice);
        assert.equal(price.toString(), '500');
        assert.equal(started.toString(), 'true');
    });

    context('With the lottery being used', () => {
        beforeEach(async () => {
            this.lottery = await Raindrop.new(this.bamboo.address,  { from: dev });
            await this.lottery.setFeeTo(alice, {from: dev});
            await this.lottery.setTicketPrice('500', {from: dev});
            await this.lottery.startRain({from: dev});
            await this.bamboo.mint(bob, '10000');
            await this.bamboo.mint(alice, '10000');
            await this.bamboo.mint(carol, '10000');
            await this.bamboo.approve(this.lottery.address, '10000', { from: alice });
            await this.bamboo.approve(this.lottery.address, '10000', { from: bob });
            await this.bamboo.approve(this.lottery.address, '10000', { from: carol });
        });
        it('should allow to buy tickets', async () => {
            // Anyone should be able to buy tickets if they can afford it
            await this.lottery.buyTickets(1, { from: alice });
            await expectRevert(this.lottery.buyTickets(21, { from: bob }), 'buyTickets: not enough bamboo!');
            await this.lottery.buyTickets(20, { from: bob });
            await this.lottery.buyTickets(5, { from: carol });
            assert.equal((await this.lottery.getTickets(alice)).toString(), '1');
            assert.equal((await this.lottery.getTickets(bob)).toString(), '20');
            assert.equal((await this.lottery.getTickets(carol)).toString(), '5');
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '9500');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '0');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '7500');
            assert.equal((await this.bamboo.balanceOf(this.lottery.address)).toString(), '13000');

        });
        it('should choose 9 unique winner tickets', async () => {
            await this.lottery.buyTickets(3, { from: alice });
            await this.lottery.buyTickets(3, { from: bob });
            await this.lottery.buyTickets(3, { from: carol });
            // Commit on block 100
            await time.increase(864000);
            await time.advanceBlockTo('99');
            await this.lottery.commit();
            assert.equal((await this.lottery.commited()).toString(), 'true');
            // 10 blocks need to pass until the winners can be called
            await time.advanceBlockTo('107');
            await expectRevert(this.lottery.drawWinners(), 'drawWinners: please wait for some more blocks to pass');
            await time.advanceBlockTo('110');
            await this.lottery.drawWinners();

            // alice gets 3 ticket wins and an extra 10% as she is the feeTo
            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '10300');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '9850');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '9850');
            let winners = await this.lottery.getLastWinners();
            assert.equal(winners.length, 9);
        });
        it('should restart the raindrop automatically', async () => {
            // First lottery
            await this.lottery.buyTickets(9, { from: bob });
            await time.advanceBlockTo('149');
            await time.increase(864000);
            // Commit on block 160
            await time.advanceBlockTo('159');
            await this.lottery.commit();
            assert.equal((await this.lottery.getTickets(alice)).toString(), '0');
            assert.equal((await this.lottery.getTickets(bob)).toString(), '9');
            assert.equal((await this.lottery.getTickets(carol)).toString(), '0');
            // Wait 10 blocks
            await time.advanceBlockTo('170');
            await this.lottery.drawWinners();
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '9550');

            // Second lottery
            await this.lottery.buyTickets(9, { from: carol });
            await time.advanceBlockTo('174');
            await time.increase(864000);
            // Commit on block 180
            await time.advanceBlockTo('179');
            await this.lottery.commit();
            assert.equal((await this.lottery.getTickets(alice)).toString(), '0');
            assert.equal((await this.lottery.getTickets(bob)).toString(), '0');
            assert.equal((await this.lottery.getTickets(carol)).toString(), '9');
            // Wait some more blocks
            await time.advanceBlockTo('449');
            await this.lottery.drawWinners();
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '9550');

            // Third lottery
            let thirdTime = await this.lottery.nextRain();
            await time.advanceBlockTo('474');
            await time.increase(864000);
            // Commit on block 476. Since there are no tickets, the lottery will reset.
            let commReceipt = await this.lottery.commit();
            expectEvent(commReceipt, 'NewRain');
            assert.equal((await this.lottery.commited()).toString(), 'false');
            let fourthTime = await this.lottery.nextRain();
            assert.notEqual(thirdTime, fourthTime);

            // Fourth lottery
            await this.lottery.buyTickets(10, { from: alice });
            await this.lottery.buyTickets(10, { from: bob });
            await this.lottery.buyTickets(10, { from: carol });
            // Commit on block 490
            await time.increase(864000);
            assert.equal((await this.lottery.getTickets(alice)).toString(), '10');
            assert.equal((await this.lottery.getTickets(bob)).toString(), '10');
            assert.equal((await this.lottery.getTickets(carol)).toString(), '10');
            await time.advanceBlockTo('489');
            await this.lottery.commit();
            await time.advanceBlockTo('500');
            await this.lottery.drawWinners();

        });
        it('should refund bamboo in case of emergency stop', async () => {
            await this.lottery.buyTickets(19, { from: alice });
            await this.lottery.buyTickets(2, { from: bob });
            await this.lottery.buyTickets(13, { from: carol });

            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '500');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '9000');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '3500');

            await this.lottery.emergencyStop({ from: dev });
            await this.lottery.refund({ from: alice });
            await this.lottery.refund({ from: bob });
            await this.lottery.refund({ from: carol });

            assert.equal((await this.bamboo.balanceOf(alice)).toString(), '10000');
            assert.equal((await this.bamboo.balanceOf(bob)).toString(), '10000');
            assert.equal((await this.bamboo.balanceOf(carol)).toString(), '10000');
            assert.equal((await this.bamboo.balanceOf(this.lottery.address)).toString(), '0');
            assert.equal((await this.lottery.isCloudy()).toString(), 'false');

        });
    });
});
