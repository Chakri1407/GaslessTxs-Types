const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const Redis = require('redis');
const { body, validationResult } = require('express-validator');
const winston = require('winston');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Redis client setup
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL
});
redisClient.connect().catch(err => logger.error('Redis connection error:', err));

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS.split(',')
}));
app.use(express.json());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// Contract setup
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);
const contractABI = [
    "function executeMetaTransaction(address userAddress, bytes functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) payable returns (bytes)",
    "function nonces(address owner) view returns (uint256)"
];
const contract = new ethers.Contract(
    process.env.AMOY_CONTRACT_ADDRESS,
    contractABI,
    wallet
);

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Estimate fee
app.post('/estimate-fee', [
    body('contractAddress').isEthereumAddress(),
    body('userAddress').isEthereumAddress(),
    body('functionSignature').isString(),
    body('nonce').isInt(),
    body('network').equals('amoy')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
    }

    try {
        const { contractAddress, userAddress, functionSignature } = req.body;
        const gasEstimate = await contract.estimateGas.executeMetaTransaction(
            userAddress,
            functionSignature,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            27
        );
        const gasPrice = await provider.getFeeData();
        const fee = gasEstimate * gasPrice.maxFeePerGas;

        res.json({
            gasLimit: gasEstimate.toString(),
            gasPrice: ethers.formatUnits(gasPrice.maxFeePerGas, 'gwei'),
            estimatedFee: ethers.formatEther(fee)
        });
    } catch (error) {
        logger.error('Fee estimation error:', error);
        res.status(500).json({ error: 'Failed to estimate fee' });
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
    body('nonce').isInt(),
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

        const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await redisClient.set(`tx:${txId}`, JSON.stringify({ status: 'pending', timestamp: new Date().toISOString() }));

        const tx = await contract.executeMetaTransaction(
            userAddress,
            functionSignature,
            r,
            s,
            v,
            { gasLimit: 300000, maxFeePerGas: (await provider.getFeeData()).maxFeePerGas }
        );

        await redisClient.set(`tx:${txId}`, JSON.stringify({
            status: 'submitted',
            txHash: tx.hash,
            timestamp: new Date().toISOString()
        }));

        const receipt = await tx.wait();
        const status = receipt.status === 1 ? 'success' : 'failed';

        await redisClient.set(`tx:${txId}`, JSON.stringify({
            status,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            timestamp: new Date().toISOString()
        }));

        res.json({ txId, txHash: tx.hash, status });
    } catch (error) {
        logger.error('Transaction submission error:', error);
        res.status(500).json({ error: 'Failed to submit transaction' });
    }
});

// Get transaction status
app.get('/transaction/:txId', async (req, res) => {
    try {
        const txData = await redisClient.get(`tx:${req.params.txId}`);
        if (!txData) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        res.json(JSON.parse(txData));
    } catch (error) {
        logger.error('Transaction status error:', error);
        res.status(500).json({ error: 'Failed to get transaction status' });
    }
});

// Start server
app.listen(port, () => {
    logger.info(`Relayer server running on port ${port}`);
});