const Token = artifacts.require('token/Token.sol');

module.exports = async function (deployer, _network, addresses) {
    let token;

    await deployer.deploy(Token);
    token = await Token.deployed();
    console.log("Token addr: " + token.address);
    await token.mint(addresses[0], web3.utils.toWei('1000000'));
}
