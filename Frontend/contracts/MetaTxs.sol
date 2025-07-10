// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MetaTransaction {
    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant META_TX_TYPEHASH = keccak256(
        "MetaTx(address from,address to,uint256 value,uint256 nonce)"
    );
    bytes32 private DOMAIN_SEPARATOR;
    mapping(address => uint256) public nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes("MetaTransaction")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    function executeMetaTransaction(
        address user,
        address to,
        uint256 value,
        bytes memory signature
    ) public returns (bytes memory) {
        require(msg.sender == user || verifySignature(user, to, value, signature), "Invalid signature");
        nonces[user]++;
        (bool success, bytes memory result) = to.call{value: value}("");
        require(success, "Call failed");
        return result;
    }

    function verifySignature(
        address user,
        address to,
        uint256 value,
        bytes memory signature
    ) internal view returns (bool) {
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(META_TX_TYPEHASH, user, to, value, nonces[user]))
        ));

        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        address recovered = ecrecover(digest, v, r, s);
        return recovered == user;
    }

    receive() external payable {}
}
