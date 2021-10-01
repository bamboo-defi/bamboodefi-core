const Bamboo = artifacts.require('token/BambooToken.sol');
const Raindrop = artifacts.require('Raindrop.sol');
const BBYP = artifacts.require('BBYP.sol');



module.exports = async function (deployer, _network, addresses) {
    let bamboo = await Bamboo.deployed();

    // Deploy Raindrop
    console.log("Deploying Raindrop...")
    await deployer.deploy(
        Raindrop,
        bamboo.address,
    );
    const raindrop = await Raindrop.deployed();
    console.log(raindrop.address);
    console.log("Raindrop deployed!")

    // Deploy BBYP
    console.log("Deploying BBYP...")
    await deployer.deploy(
        BBYP,
        bamboo.address
    );
    const bbyp = await BBYP.deployed();
    console.log(bbyp.address);
    console.log("Bamboo Burn Yearly Party deployed!")


};