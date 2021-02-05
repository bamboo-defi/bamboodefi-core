// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "./uniswapv2/interfaces/IUniswapV2Pair.sol";
import "./uniswapv2/interfaces/IUniswapV2Factory.sol";


contract Migrator {
    address public keeper;
    address public oldFactory;
    IUniswapV2Factory public factory;
    uint256 public notBeforeBlock;
    uint256 public desiredLiquidity = uint256(-1);

    constructor(
        address _keeper,
        address _oldFactory,
        IUniswapV2Factory _factory,
        uint256 _notBeforeBlock
    ) {
        keeper = _keeper;
        oldFactory = _oldFactory;
        factory = _factory;
        notBeforeBlock = _notBeforeBlock;
    }

    function migrate(IUniswapV2Pair orig) public returns (IUniswapV2Pair) {
        require(msg.sender == keeper, "not from zookeeper");
        require(block.number >= notBeforeBlock, "too early to migrate");
        require(orig.factory() == oldFactory, "not from old factory");
        address token0 = orig.token0();
        address token1 = orig.token1();
        address pairA = factory.getPair(token0, token1);
        require(pairA != address(0), "create pair first");
        IUniswapV2Pair pair = IUniswapV2Pair(pairA);
        require(pair.fee() == 3, "respect fee");
        uint256 lp = orig.balanceOf(msg.sender);
        if (lp == 0) return pair;
        desiredLiquidity = lp;
        orig.transferFrom(msg.sender, address(orig), lp);
        orig.burn(address(pair));
        pair.mint(msg.sender);
        desiredLiquidity = uint256(-1);
        return pair;
    }
}