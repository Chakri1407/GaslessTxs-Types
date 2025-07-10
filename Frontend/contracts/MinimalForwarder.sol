// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

contract MinimalForwarder {
    bytes32 private constant TYPEHASH = keccak256("ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,bytes data)");
    bytes32 private immutable DOMAIN_SEPARATOR;
    mapping(address => uint256) public nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("MinimalForwarder")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    function verify(address from, address to, uint256 value, uint256 gas, uint256 nonce, bytes memory data, bytes memory signature) public view returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(TYPEHASH, from, to, value, gas, nonce, keccak256(data)))
        ));
        return true; // Placeholder; implement ecrecover logic here
    }

    function execute(address from, address to, uint256 value, uint256 gas, uint256 nonce, bytes memory data, bytes memory signature) public returns (bool, bytes memory) {
        require(verify(from, to, value, gas, nonce, data, signature), "Invalid signature");
        nonces[from]++;
        (bool success, bytes memory returndata) = to.call{value: value, gas: gas}(data);
        return (success, returndata);
    }
} 