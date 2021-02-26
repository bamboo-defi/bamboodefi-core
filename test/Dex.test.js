const BambooToken = artifacts.require('token/BambooToken.sol');
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
        this.weth = await MockERC20.new('WETH', 'WETH', '100000000', { from: alice });
        await this.bamboo.mint(alice, '100000000', { from: minter });
    });

    it('only feeToSetter should be able to create pairs', async () => {
        // From factory (owner is setter)
        await expectRevert(this.factory.createPair(this.weth.address, this.bamboo.address, 3, { from: alice }), 'UniswapV2: NOT_SETTER');
        await this.factory.createPair(this.weth.address, this.bamboo.address, 3, { from: owner })

        // Creating Pair from AddLiquidity is no longer possible
        this.router = await Router.new(this.factory.address, this.weth.address, { from: owner } );
        await this.token1.approve(this.router.address, '100000', { from: owner });
        await time.advanceBlock();
        let timestamp = Math.floor(Date.now() / 1000) + 300;
        await expectRevert(this.router.addLiquidityETH(this.token1.address, '10000', '9000',
            '1000', owner, timestamp, {from:owner, value: '1000'}), 'UniswapV2Router: INVALID_PAIR');
    });

    it('should set the fee at creation', async () => {
        this.bambooWETH = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.bamboo.address, 3, { from: owner })).logs[0].args.pair);
        assert.equal((await this.bambooWETH.fee()).toString(), '3');
        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address, 5, { from: owner })).logs[0].args.pair);
        assert.equal((await this.wethToken1.fee()).toString(), '5');
        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address, 10, { from: owner })).logs[0].args.pair);
        assert.equal((await this.token1Token2.fee()).toString(), '10');
    });


    it('different fees should be calculated correctly', async () => {
        // Classic 3 fee
        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address, 3, {from: owner})).logs[0].args.pair);
        this.router = await Router.new(this.factory.address, this.weth.address, { from: owner } );
        await this.token1.approve(this.router.address, '100000000000', { from: alice });
        await this.weth.approve(this.router.address, '1000000000000', { from: alice });
        // Addresses should match. If not, fix init code hash
        assert.equal((await this.wethToken1.address).toString(), (await this.router.pairFor(this.token1.address, this.weth.address)).toString());
        await time.advanceBlock();
        let timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token1.address, this.weth.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        let amount2 = await this.router.getAmountsOut('1000', [this.token1.address, this.weth.address]);
        // Following the mountsOut formula for the 3 fee
        assert.equal(amount2[1].toString(), '906');

        // 0 fee
        this.wethToken2 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token2.address, 0, {from: owner})).logs[0].args.pair);
        await this.token2.approve(this.router.address, '100000000000', { from: alice });
        assert.equal((await this.wethToken2.address).toString(), (await this.router.pairFor(this.token2.address, this.weth.address)).toString());
        await time.advanceBlock();
        timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token2.address, this.weth.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        amount2 = await this.router.getAmountsOut('1000', [this.token2.address, this.weth.address]);
        // Following the mountsOut formula for the 0 fee
        assert.equal(amount2[1].toString(), '909');

        // 10 fee
        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address, 10, {from: owner})).logs[0].args.pair);
        assert.equal((await this.token1Token2.address).toString(), (await this.router.pairFor(this.token2.address, this.token1.address)).toString());
        await time.advanceBlock();
        timestamp = Math.floor(Date.now() / 1000) + 300;
        await this.router.addLiquidity(this.token2.address, this.token1.address, '10000', '10000', '9000', '9000', feer, timestamp, {from:alice});
        amount2 = await this.router.getAmountsOut('1000', [this.token2.address, this.token1.address]);
        // Following the mountsOut formula for the 10 fee
        assert.equal(amount2[1].toString(), '900');

    });

});