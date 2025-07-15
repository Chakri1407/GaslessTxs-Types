const express = require('express');
const { body, validationResult } = require('express-validator');
const ethers = require('ethers');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console()
    ]
});

// Load environment variables
require('dotenv').config();

// Contract setup
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);

// Load full ABI (same as before)
const contractABI = [
    {
        "inputs": [
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "string", "name": "symbol", "type": "string" },
            { "internalType": "uint256", "name": "initialSupply", "type": "uint256" },
            { "internalType": "address", "name": "owner", "type": "address" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    { "inputs": [], "name": "ECDSAInvalidSignature", "type": "error" },
    { "inputs": [{ "internalType": "uint256", "name": "length", "type": "uint256" }], "name": "ECDSAInvalidSignatureLength", "type": "error" },
    { "inputs": [{ "internalType": "bytes32", "name": "s", "type": "bytes32" }], "name": "ECDSAInvalidSignatureS", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "allowance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "ERC20InsufficientAllowance", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }, { "internalType": "uint256", "name": "balance", "type": "uint256" }, { "internalType": "uint256", "name": "needed", "type": "uint256" }], "name": "ERC20InsufficientBalance", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "approver", "type": "address" }], "name": "ERC20InvalidApprover", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "receiver", "type": "address" }], "name": "ERC20InvalidReceiver", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "sender", "type": "address" }], "name": "ERC20InvalidSender", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }], "name": "ERC20InvalidSpender", "type": "error" },
    { "inputs": [], "name": "ExecutionFailed", "type": "error" },
    { "inputs": [], "name": "InvalidNonce", "type": "error" },
    { "inputs": [], "name": "InvalidShortString", "type": "error" },
    { "inputs": [], "name": "InvalidSignature", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "OwnableInvalidOwner", "type": "error" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "OwnableUnauthorizedAccount", "type": "error" },
    { "inputs": [], "name": "ReentrancyGuardReentrantCall", "type": "error" },
    { "inputs": [{ "internalType": "string", "name": "str", "type": "string" }], "name": "StringTooLong", "type": "error" },
    { "inputs": [], "name": "UnauthorizedRelayer", "type": "error" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "owner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "spender", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }], "name": "Approval", "type": "event" },
    { "anonymous": false, "inputs": [], "name": "EIP712DomainChanged", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "userAddress", "type": "address" }, { "indexed": true, "internalType": "address", "name": "relayerAddress", "type": "address" }, { "indexed": false, "internalType": "bytes", "name": "functionSignature", "type": "bytes" }, { "indexed": false, "internalType": "uint256", "name": "nonce", "type": "uint256" }], "name": "MetaTransactionExecuted", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "relayer", "type": "address" }], "name": "RelayerAuthorized", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "relayer", "type": "address" }], "name": "RelayerRevoked", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "from", "type": "address" }, { "indexed": true, "internalType": "address", "name": "to", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" },
    { "inputs": [], "name": "DOMAIN_SEPARATOR", "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "relayer", "type": "address" }], "name": "authorizeRelayer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "authorizedRelayers", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address[]", "name": "recipients", "type": "address[]" }, { "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }], "name": "batchTransfer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "burn", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "eip712Domain", "outputs": [{ "internalType": "bytes1", "name": "fields", "type": "bytes1" }, { "internalType": "string", "name": "name", "type": "string" }, { "internalType": "string", "name": "version", "type": "string" }, { "internalType": "uint256", "name": "chainId", "type": "uint256" }, { "internalType": "address", "name": "verifyingContract", "type": "address" }, { "internalType": "bytes32", "name": "salt", "type": "bytes32" }, { "internalType": "uint256[]", "name": "extensions", "type": "uint256[]" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "emergencyPause", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "userAddress", "type": "address" }, { "internalType": "bytes", "name": "functionSignature", "type": "bytes" }, { "internalType": "bytes32", "name": "sigR", "type": "bytes32" }, { "internalType": "bytes32", "name": "sigS", "type": "bytes32" }, { "internalType": "uint8", "name": "sigV", "type": "uint8" }], "name": "executeMetaTransaction", "outputs": [{ "internalType": "bytes", "name": "result", "type": "bytes" }], "stateMutability": "payable", "type": "function" },
    { "inputs": [], "name": "getChainId", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [], "name": "name", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }], "name": "nonces", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, { "internalType": "address", "name": "spender", "type": "address" }, { "internalType": "uint256", "name": "value", "type": "uint256" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }, { "internalType": "uint8", "name": "v", "type": "uint8" }, { "internalType": "bytes32", "name": "r", "type": "bytes32" }, { "internalType": "bytes32", "name": "s", "type": "bytes32" }], "name": "permit", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [], "name": "renounceOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "relayer", "type": "address" }], "name": "revokeRelayer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [], "name": "symbol", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "totalSupply", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "transfer", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "from", "type": "address" }, { "internalType": "address", "name": "to", "type": "address" }, { "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
    { "inputs": [{ "internalType": "address", "name": "newOwner", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

// Initialize contract
const contract = new ethers.Contract(process.env.AMOY_CONTRACT_ADDRESS, contractABI, wallet);

// Transaction storage
const transactions = {};

const storeTransaction = async (txId, data) => {
    transactions[txId] = { ...transactions[txId], ...data };
    try {
        await fs.writeFile(path.join(__dirname, 'transactions.json'), JSON.stringify(transactions, null, 2));
    } catch (error) {
        logger.error('Failed to store transaction:', error);
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Check relayer authorization
app.get('/check-relayer', async (req, res) => {
    try {
        const isAuthorized = await contract.authorizedRelayers(wallet.address);
        res.json({ relayerAddress: wallet.address, isAuthorized, timestamp: new Date().toISOString() });
    } catch (error) {
        logger.error('Error checking relayer:', error);
        res.status(500).json({ error: error.message });
    }
});

// Estimate gas and fee
app.post('/estimate-fee', [
    body('contractAddress').isEthereumAddress(),
    body('userAddress').isEthereumAddress(),
    body('functionSignature').isString(),
    body('r').isString(),
    body('s').isString(),
    body('v').isInt(),
    body('nonce').isString(),
    body('network').equals('amoy')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
    }

    try {
        const { contractAddress, userAddress, functionSignature, r, s, v, nonce } = req.body;
        if (contractAddress.toLowerCase() !== process.env.AMOY_CONTRACT_ADDRESS.toLowerCase()) {
            return res.status(400).json({ error: 'Invalid contract address' });
        }

        const gasEstimate = await contract.estimateGas.executeMetaTransaction(
            userAddress,
            functionSignature,
            r,
            s,
            v,
            { from: wallet.address }
        );
        const feeData = await provider.getFeeData();
        const maxFee = gasEstimate * feeData.maxFeePerGas;

        res.json({ 
            gasEstimate: gasEstimate.toString(), 
            maxFee: maxFee.toString(), 
            timestamp: new Date().toISOString() 
        });
    } catch (error) {
        logger.error('Gas estimation failed:', error);
        res.status(500).json({ error: 'Gas estimation failed', details: error.message });
    }
});

// Submit meta-transaction
app.post('/submit', [
    body('contractAddress').isEthereumAddress(),
    body('userAddress').isEthereumAddress(),
    body('functionSignature').isString(),
    body('r').isString(),
    body('s').isString(),
    body('v').isInt(),
    body('nonce').isString(),
    body('network').equals('amoy')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.error('Validation errors:', errors.array());
        return res.status(400).json({ error: errors.array() });
    }

    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
        const { contractAddress, userAddress, functionSignature, r, s, v, nonce } = req.body;

        logger.info('Received transaction request:', {
            txId,
            contractAddress,
            userAddress,
            functionSignature,
            r,
            s,
            v,
            nonce
        });

        if (contractAddress.toLowerCase() !== process.env.AMOY_CONTRACT_ADDRESS.toLowerCase()) {
            logger.error('Invalid contract address:', contractAddress);
            return res.status(400).json({ error: 'Invalid contract address' });
        }

        const isAuthorized = await contract.authorizedRelayers(wallet.address);
        if (!isAuthorized) {
            logger.error('Relayer not authorized:', wallet.address);
            return res.status(403).json({ error: 'Relayer not authorized' });
        }

        const currentNonce = await contract.nonces(userAddress);
        if (currentNonce.toString() !== nonce) {
            logger.error('Invalid nonce:', { expected: currentNonce.toString(), received: nonce });
            return res.status(400).json({ 
                error: 'Invalid nonce', 
                expected: currentNonce.toString(), 
                received: nonce 
            });
        }

        await storeTransaction(txId, { 
            status: 'pending', 
            timestamp: new Date().toISOString(),
            userAddress,
            functionSignature,
            nonce
        });

        const feeData = await provider.getFeeData();
        let gasEstimate;
        try {
            gasEstimate = await contract.estimateGas.executeMetaTransaction(
                userAddress,
                functionSignature,
                r,
                s,
                v,
                { from: wallet.address }
            );
        } catch (gasError) {
            logger.error('Gas estimation failed:', gasError);
            gasEstimate = 500000n; // Fallback gas limit with buffer
        }

        const gasLimit = gasEstimate * 120n / 100n; // Add 20% buffer
        
        const tx = await contract.executeMetaTransaction(
            userAddress,
            functionSignature,
            r,
            s,
            v,
            {
                gasLimit: gasLimit,
                maxFeePerGas: feeData.maxFeePerGas
            }
        );

        logger.info('Transaction submitted:', { txId, txHash: tx.hash });

        await storeTransaction(txId, {
            status: 'submitted',
            txHash: tx.hash,
            timestamp: new Date().toISOString(),
            userAddress,
            functionSignature,
            nonce
        });

        const receipt = await tx.wait();
        const status = receipt.status === 1 ? 'success' : 'failed';

        logger.info('Transaction receipt:', {
            txId,
            txHash: tx.hash,
            status,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
        });

        // Better error handling for failed transactions
        if (status === 'failed') {
            logger.error('Transaction failed:', {
                txId,
                txHash: tx.hash,
                logs: receipt.logs,
                reason: 'Transaction reverted'
            });
        }

        await storeTransaction(txId, {
            status,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber.toString(),
            gasUsed: receipt.gasUsed.toString(),
            timestamp: new Date().toISOString(),
            userAddress,
            functionSignature,
            nonce
        });

        res.json({ 
            txId, 
            txHash: tx.hash, 
            status,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
        });

    } catch (error) {
        logger.error('Transaction submission error:', {
            txId,
            error: error.message,
            stack: error.stack
        });
        
        await storeTransaction(txId, {
            status: 'failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        res.status(500).json({ 
            error: 'Failed to submit transaction',
            details: error.message,
            txId 
        });
    }
});

// Get transaction status
app.get('/transaction/:txId', async (req, res) => {
    const { txId } = req.params;
    
    if (transactions[txId]) {
        res.json(transactions[txId]);
    } else {
        res.status(404).json({ error: 'Transaction not found' });
    }
});

// Get user nonce
app.get('/nonce/:userAddress', async (req, res) => {
    try {
        const { userAddress } = req.params;
        const nonce = await contract.nonces(userAddress);
        res.json({ nonce: nonce.toString() });
    } catch (error) {
        logger.error('Error getting nonce:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Relayer server running on port ${PORT}`, { timestamp: new Date().toISOString() });
    logger.info(`Contract address: ${process.env.AMOY_CONTRACT_ADDRESS}`, { timestamp: new Date().toISOString() });
    logger.info(`Relayer address: ${wallet.address}`, { timestamp: new Date().toISOString() });
}); 