const Factory = artifacts.require('uniswapv2/uniswap-factory/UniswapV2Factory.sol');
const WETH = artifacts.require('token/WrappedVelas.sol');
const Router = artifacts.require('uniswapv2/uniswap-router/UniswapV2Router02.sol')


module.exports = async function (deployer, _network, addresses) {
    let weth;
    if(_network === 'kovan') {
        weth = await WETH.at('0xd0A1E359811322d97991E03f863a0C30C2cF029C');
    }
    else if (_network === 'live') {
        weth = await WETH.at('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    }
    else if (_network === 'bsctest') {
        weth = await WETH.at('0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd');
    }
    else if (_network === 'velas_testnet') {
        weth = await WETH.at('0x5033E50496Baa7F564bc41EC641B47975F5A5004');
    }
    else{
        // Deploy WETH contract
        await deployer.deploy(WETH);
        weth = await WETH.deployed();
    }

    // Deploy factory. Don't forget to change the initCodeHash before deploy!!!
    console.log("Deploying factory...")
    await deployer.deploy(Factory, addresses[0]);
    const factory = await Factory.deployed();
    console.log("Factory addr: " + factory.address)

    // Deploy Router
    console.log("Deploying router...")
    await deployer.deploy(Router, factory.address, weth.address)
    const router = await Router.deployed();
    console.log("Router addr: " + router.address)


};
