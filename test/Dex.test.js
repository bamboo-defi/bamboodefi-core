const BambooToken = artifacts.require('token/BambooToken.sol');
const WETH = artifacts.require('token/WETH.sol');
const MockERC20 = artifacts.require('token/MockToken.sol');
const UniswapV2Pair = artifacts.require('uniswapv2/UniswapV2Pair.sol');
const UniswapV2Factory = artifacts.require('uniswapv2/UniswapV2Factory.sol');
const Router = artifacts.require('uniswapv2/UniswapV2Router02.sol')
const { expectRevert, time } = require('@openzeppelin/test-helpers');

contract('DEX', ([alice, feer, minter, owner]) => {
    beforeEach(async () => {
        this.factory = await UniswapV2Factory.new(owner, { from: owner });
        this.bamboo = await BambooToken.new({ from: minter });
        this.token1 = await MockERC20.new('TOKEN1', 'TOKEN', '200000000', { from: alice });
        await this.token1.transfer(owner, '100000000', {from: alice});
        this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: alice });
        this.weth = await WETH.new( { from: alice });
        await this.weth.deposit({ from: alice , value: '1000000000000'});
        await this.bamboo.mint(alice, '100000000', { from: minter });
    });

    it('anyone should be able to create pairs', async () => {
        // From factory (owner is setter)
        await this.factory.createPair(this.weth.address, this.bamboo.address, { from: alice });
        await this.factory.createPair(this.weth.address, this.token2.address, { from: owner });

        // Creating Pair from AddLiquidity is possible
        this.router = await Router.new(this.factory.address, this.weth.address, { from: owner } );
        await this.token1.approve(this.router.address, '1000000000', { from: alice });
        await time.advanceBlock();
        let timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidityETH(this.token1.address, '10000', '9000',
            '1000', owner, timestamp, {from: alice, value: '1000'});
    });

    it('feeToSetter should be able to change the fee', async () => {
        this.bambooWETH = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.bamboo.address, { from: owner })).logs[0].args.pair);
        assert.equal((await this.bambooWETH.fee()).toString(), '3');
        await expectRevert(this.factory.setFee(this.weth.address, this.bamboo.address, 2, { from: alice }), "UniswapV2: NOT_SETTER");
        await this.factory.setFee(this.weth.address, this.bamboo.address, 2,  { from: owner });
        assert.equal((await this.bambooWETH.fee()).toString(), '2');

        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address, { from: owner })).logs[0].args.pair);
        assert.equal((await this.wethToken1.fee()).toString(), '3');
        await this.factory.setFee(this.weth.address, this.token1.address, 1, { from: owner });
        assert.equal((await this.wethToken1.fee()).toString(), '1');

        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address, { from: alice })).logs[0].args.pair);
        await this.factory.setFee(this.token1.address, this.token2.address, 0, { from: owner });
        assert.equal((await this.token1Token2.fee()).toString(), '0');
    });


    it('different fees should be calculated correctly', async () => {
        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address, {from: alice})).logs[0].args.pair);
        this.router = await Router.new(this.factory.address, this.weth.address, { from: owner } );
        await this.token1.approve(this.router.address, '100000000000', { from: alice });
        await this.weth.approve(this.router.address, '1000000000000', { from: alice });
        // INIT CODE HASH TEST
        // Addresses should match. If not, fix init code hash
        assert.equal((await this.wethToken1.address).toString(), (await this.router.pairFor(this.token1.address, this.weth.address)).toString());
        await time.advanceBlock();
        let timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token1.address, this.weth.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        let amount2 = await this.router.getAmountsOut('1000', [this.token1.address, this.weth.address]);
        // Following the mountsOut formula for the 3 fee
        assert.equal(amount2[1].toString(), '906');

        // 0 fee
        this.wethToken2 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token2.address, {from: alice})).logs[0].args.pair);
        await this.factory.setFee(this.weth.address, this.token2.address, 0, {from: owner});
        await this.token2.approve(this.router.address, '100000000000', { from: alice });
        assert.equal((await this.wethToken2.address).toString(), (await this.router.pairFor(this.token2.address, this.weth.address)).toString());
        await time.advanceBlock();
        timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token2.address, this.weth.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        amount2 = await this.router.getAmountsOut('1000', [this.token2.address, this.weth.address]);
        // Following the amountsOut formula for the 0 fee
        assert.equal(amount2[1].toString(), '909');

        // 1 fee
        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address, {from: feer})).logs[0].args.pair);
        assert.equal((await this.token1Token2.address).toString(), (await this.router.pairFor(this.token2.address, this.token1.address)).toString());
        await this.factory.setFee(this.token1.address, this.token2.address, 1, {from: owner});
        await time.advanceBlock();
        timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token2.address, this.token1.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        amount2 = await this.router.getAmountsOut('1000', [this.token2.address, this.token1.address]);
        // Following the mountsOut formula for the 10 fee
        assert.equal(amount2[1].toString(), '908');

    });

});