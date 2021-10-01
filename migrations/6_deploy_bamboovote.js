const BVote = artifacts.require('token/BambooVote.sol')
const ZooKeeper = artifacts.require('ZooKeeper.sol')


module.exports = async function (deployer, _network, addresses) {
    let keeper = await ZooKeeper.deployed();

    // Deploy BambooVote
    console.log("Deploying BambooVote...")
    await deployer.deploy(
        BVote,
        'BambooVote',
        'BVOTE',
        keeper.address,
    );
    const bv = await BVote.deployed();
    console.log(bv.address);
    console.log("BambooVote deployed!")

};
