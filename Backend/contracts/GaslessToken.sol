// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol"; 
import "@openzeppelin/contracts/access/Ownable.sol"; 
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; 
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract GaslessToken is ERC20, Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    
    bytes32 private constant META_TRANSACTION_TYPEHASH = keccak256(
        "MetaTransaction(uint256 nonce,address from,bytes functionSignature)"
    );
    
    mapping(address => uint256) private _nonces;
    
    mapping(address => bool) public authorizedRelayers;
    
    event MetaTransactionExecuted(
        address indexed userAddress,
        address indexed relayerAddress,
        bytes functionSignature,
        uint256 nonce
    );
    
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    
    error InvalidSignature();
    error InvalidNonce();
    error UnauthorizedRelayer();
    error ExecutionFailed();
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address owner
    ) ERC20(name, symbol) Ownable(owner) EIP712(name, "1") {
        _mint(owner, initialSupply);
    }
    
    function authorizeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = true;
        emit RelayerAuthorized(relayer);
    }
    
    function revokeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = false;
        emit RelayerRevoked(relayer);
    }
    
    function nonces(address owner) external view returns (uint256) {
        return _nonces[owner];
    }
    
    function executeMetaTransaction(
        address userAddress,
        bytes calldata functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) external payable nonReentrant returns (bytes memory result) {
        if (!authorizedRelayers[msg.sender]) {
            revert UnauthorizedRelayer();
        }
        
        uint256 nonce = _nonces[userAddress];
        
        bytes32 structHash = keccak256(
            abi.encode(
                META_TRANSACTION_TYPEHASH,
                nonce,
                userAddress,
                keccak256(functionSignature)
            )
        );
        
        bytes32 digest = _hashTypedDataV4(structHash);
        
        address signer = digest.recover(abi.encodePacked(sigR, sigS, sigV));
        
        if (signer != userAddress) {
            revert InvalidSignature();
        }
        
        _nonces[userAddress] = nonce + 1;
        
        // FIXED: Append user address to function signature for _msgSender() to work correctly
        bytes memory callData = abi.encodePacked(functionSignature, userAddress);
        
        (bool success, bytes memory returnData) = address(this).call(callData);
        if (!success) {
            revert ExecutionFailed();
        }
        
        emit MetaTransactionExecuted(
            userAddress,
            msg.sender,
            functionSignature,
            nonce
        );
        
        return returnData;
    }
    
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }
    
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }
    
    function approve(address spender, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);
        return true;
    }
    
    function _msgSender() internal view override returns (address) {
        if (msg.data.length >= 20 && authorizedRelayers[msg.sender]) {
            return address(uint160(bytes20(msg.data[msg.data.length - 20:])));
        }
        return msg.sender;
    }
    
    function emergencyPause() external onlyOwner {
        emit RelayerRevoked(address(0));
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    function burn(uint256 amount) external {
        _burn(_msgSender(), amount);
    }
    
    function getChainId() external view returns (uint256) {
        return block.chainid;
    }
    
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        address sender = _msgSender();
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(sender, recipients[i], amounts[i]);
        }
    }
    
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "Permit expired");
        
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
                owner,
                spender,
                value,
                _nonces[owner],
                deadline
            )
        );
        
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(abi.encodePacked(r, s, v));
        
        require(signer == owner, "Invalid signature");
        
        _nonces[owner]++;
        _approve(owner, spender, value);
    }
} 