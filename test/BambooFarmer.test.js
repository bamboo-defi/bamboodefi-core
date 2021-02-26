const BambooToken = artifacts.require('token/BambooToken.sol');
const BambooFarmer = artifacts.require('BambooFarmer.sol');
const MockERC20 = artifacts.require('token/MockToken.sol');
const UniswapV2Pair = artifacts.require('uniswapv2/UniswapV2Pair.sol');
const UniswapV2Factory = artifacts.require('uniswapv2/UniswapV2Factory.sol');

contract('BambooFarmer', ([alice, field, minter, dev, vault]) => {
    beforeEach(async () => {
        this.factory = await UniswapV2Factory.new(alice, { from: alice });
        this.bamboo = await BambooToken.new({ from: alice });
        await this.bamboo.mint(minter, '100000000', { from: alice });
        this.weth = await MockERC20.new('WETH', 'WETH', '100000000', { from: minter });
        this.token1 = await MockERC20.new('TOKEN1', 'TOKEN', '100000000', { from: minter });
        this.token2 = await MockERC20.new('TOKEN2', 'TOKEN2', '100000000', { from: minter });
        this.farmer = await BambooFarmer.new(this.factory.address, field, this.bamboo.address, this.weth.address, dev);
        this.bambooWETH = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.bamboo.address, 3)).logs[0].args.pair);
        this.wethToken1 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token1.address, 3)).logs[0].args.pair);
        this.wethToken2 = await UniswapV2Pair.at((await this.factory.createPair(this.weth.address, this.token2.address, 3)).logs[0].args.pair);
        this.token1Token2 = await UniswapV2Pair.at((await this.factory.createPair(this.token1.address, this.token2.address, 3)).logs[0].args.pair);
    });

    it('should make BAMBOOs successfully', async () => {
        await this.factory.setFeeTo(this.farmer.address, { from: alice });
        await this.weth.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bamboo.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bambooWETH.mint(minter);
        await this.weth.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.token1.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.wethToken1.mint(minter);
        await this.weth.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.token2.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.wethToken2.mint(minter);
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Fake some revenue
        await this.token1.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token1Token2.sync();
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Farmer should have the LP now
        assert.equal((await this.token1Token2.balanceOf(this.farmer.address)).toString(), '33057');
        // After calling convert, field should have BAMBOO value at ~1/6 of revenue
        await this.farmer.convert(this.token1.address, this.token2.address);
        assert.equal((await this.bamboo.balanceOf(field)).toString(), '65503');
        assert.equal((await this.token1Token2.balanceOf(this.farmer.address)).toString(), '0');
        // Should also work for BAMBOO-ETH pair
        await this.bamboo.transfer(this.bambooWETH.address, '100000', { from: minter });
        await this.weth.transfer(this.bambooWETH.address, '100000', { from: minter });
        await this.bambooWETH.sync();
        await this.bamboo.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.weth.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bambooWETH.mint(minter);
        assert.equal((await this.bambooWETH.balanceOf(this.farmer.address)).toString(), '33090');
        await this.farmer.convert(this.bamboo.address, this.weth.address);
        assert.equal((await this.bamboo.balanceOf(field)).toString(), '131966');
        assert.equal((await this.bambooWETH.balanceOf(this.farmer.address)).toString(), '0');
    });

    it('should divide the received fees between vault and field', async () => {
        await this.factory.setFeeTo(this.farmer.address, { from: alice });
        await this.farmer.setVault(vault, {from: dev});
        await this.weth.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bamboo.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bambooWETH.mint(minter);
        await this.weth.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.token1.transfer(this.wethToken1.address, '10000000', { from: minter });
        await this.wethToken1.mint(minter);
        await this.weth.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.token2.transfer(this.wethToken2.address, '10000000', { from: minter });
        await this.wethToken2.mint(minter);
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Fake some revenue
        await this.token1.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '100000', { from: minter });
        await this.token1Token2.sync();
        await this.token1.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token2.transfer(this.token1Token2.address, '10000000', { from: minter });
        await this.token1Token2.mint(minter);
        // Farmer should have the LP now
        assert.equal((await this.token1Token2.balanceOf(this.farmer.address)).toString(), '33057');
        // After calling convert, field should have BAMBOO value at ~1/6 of revenue. Vault should have
        // 60% of LP = 33057*0.6 = 19834
        await this.farmer.convert(this.token1.address, this.token2.address);
        assert.equal((await this.token1Token2.balanceOf(vault)).toString(), '19834');
        assert.equal((await this.bamboo.balanceOf(field)).toString(), '26356');
        assert.equal((await this.token1Token2.balanceOf(this.farmer.address)).toString(), '0');
        // Should also work for BAMBOO-ETH pair
        await this.bamboo.transfer(this.bambooWETH.address, '100000', { from: minter });
        await this.weth.transfer(this.bambooWETH.address, '100000', { from: minter });
        await this.bambooWETH.sync();
        await this.bamboo.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.weth.transfer(this.bambooWETH.address, '10000000', { from: minter });
        await this.bambooWETH.mint(minter);
        assert.equal((await this.bambooWETH.balanceOf(this.farmer.address)).toString(), '33070');
        // Vault should receive 33090*0.6 = 19854
        await this.farmer.convert(this.bamboo.address, this.weth.address);
        assert.equal((await this.bambooWETH.balanceOf(vault)).toString(), '19842');
        assert.equal((await this.bamboo.balanceOf(field)).toString(), '52939');
        assert.equal((await this.bambooWETH.balanceOf(this.farmer.address)).toString(), '0');
    });
});