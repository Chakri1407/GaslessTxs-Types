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
    
    // EIP-2612 Permit typehash
    bytes32 private constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    
    // NEW: Gasless POL transfer typehash
    bytes32 private constant GASLESS_POL_TRANSFER_TYPEHASH = keccak256(
        "GaslessPOLTransfer(address from,address to,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    
    mapping(address => uint256) private _nonces;
    mapping(address => bool) public authorizedRelayers;
    
    // NEW: Track POL balances for gasless transfers
    mapping(address => uint256) public polBalances;
    
    // Add context storage for meta-transactions
    address private _msgSenderOverride;
    
    event MetaTransactionExecuted(
        address indexed userAddress,
        address indexed relayerAddress,
        bytes functionSignature,
        uint256 nonce
    );
    
    event RelayerAuthorized(address indexed relayer);
    event RelayerRevoked(address indexed relayer);
    
    // NEW: Event for gasless POL transfer
    event GaslessPOLTransferExecuted(
        address indexed from,
        address indexed to,
        address indexed relayer,
        uint256 amount,
        uint256 nonce
    );
    
    error InvalidSignature();
    error InvalidNonce();
    error UnauthorizedRelayer();
    error ExecutionFailed();
    error ExpiredDeadline();
    error InsufficientBalance();
    error TransferFailed();
    
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
        
        // Set the message sender override for this meta-transaction
        _msgSenderOverride = userAddress;
        
        // Execute the function call directly with the original signature
        (bool success, bytes memory returnData) = address(this).call(functionSignature);
        
        // Clear the override after execution
        _msgSenderOverride = address(0);
        
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
    
    // NEW: Gasless POL Transfer Function
    function executeGaslessPOLTransfer(
        address from,
        address to,
        uint256 amount,
        uint256 deadline,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) external nonReentrant {
        if (!authorizedRelayers[msg.sender]) {
            revert UnauthorizedRelayer();
        }
        
        if (block.timestamp > deadline) {
            revert ExpiredDeadline();
        }
        
        if (polBalances[from] < amount) {
            revert InsufficientBalance();
        }
        
        uint256 nonce = _nonces[from];
        
        bytes32 structHash = keccak256(
            abi.encode(
                GASLESS_POL_TRANSFER_TYPEHASH,
                from,
                to,
                amount,
                nonce,
                deadline
            )
        );
        
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(abi.encodePacked(sigR, sigS, sigV));
        
        if (signer != from) {
            revert InvalidSignature();
        }
        
        _nonces[from] = nonce + 1;
        
        // Execute the POL transfer
        polBalances[from] -= amount;
        polBalances[to] += amount;
        
        // Send POL to the recipient
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }
        
        emit GaslessPOLTransferExecuted(from, to, msg.sender, amount, nonce);
    }
    
    // NEW: Deposit POL function
    function depositPOL() external payable {
        polBalances[msg.sender] += msg.value;
    }
    
    // NEW: Withdraw POL function
    function withdrawPOL(uint256 amount) external {
        require(polBalances[msg.sender] >= amount, "Insufficient balance");
        
        polBalances[msg.sender] -= amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    // NEW: Get POL balance
    function getPOLBalance(address user) external view returns (uint256) {
        return polBalances[user];
    }
    
    // NEW: Helper function to get gasless POL transfer hash
    function getGaslessPOLTransferHash(
        address from,
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                GASLESS_POL_TRANSFER_TYPEHASH,
                from,
                to,
                amount,
                nonce,
                deadline
            )
        );
        
        return _hashTypedDataV4(structHash);
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
        if (_msgSenderOverride != address(0)) {
            return _msgSenderOverride;
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
                PERMIT_TYPEHASH,
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
    
    // Helper function to get the current nonce for permit
    function permitNonces(address owner) external view returns (uint256) {
        return _nonces[owner];
    }
    
    // Additional utility functions for meta-transactions
    function getMetaTransactionHash(
        address userAddress,
        bytes calldata functionSignature,
        uint256 nonce
    ) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                META_TRANSACTION_TYPEHASH,
                nonce,
                userAddress,
                keccak256(functionSignature)
            )
        );
        
        return _hashTypedDataV4(structHash);
    }
    
    // Function to verify if a signature is valid for a meta-transaction
    function verifyMetaTransactionSignature(
        address userAddress,
        bytes calldata functionSignature,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) external view returns (bool) {
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
        
        return signer == userAddress;
    }
    
    // NEW: Receive function to accept POL deposits
    receive() external payable {
        polBalances[msg.sender] += msg.value;
    }
    
} 