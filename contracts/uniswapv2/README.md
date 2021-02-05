# Uniswap V2 Area

Code from [Uniswap V2](https://github.com/Uniswap/uniswap-v2-core/tree/27f6354bae6685612c182c3bc7577e61bc8717e3/contracts) with the following modifications.

1. Change contract version to 0.7.6 and do the necessary patching.
2. Add `migrator` member in `UniswapV2Factory` which can be set by `feeToSetter`.
3. Require `feeToSetter` to create the pairs on the DEX.
4. Allow `feeToSetter` to modify the fee amount on existing pairs.
5. Allow `migrator` to specify the amount of `liquidity` during the first mint. Disallow first mint if migrator is set.

