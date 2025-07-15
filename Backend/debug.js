
const ethers = require('ethers');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/debug.log' }),
        new winston.transports.Console()
    ]
});

// Load environment variables
require('dotenv').config();

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const wallet = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);

// Contract setup
const contractAddress = process.env.AMOY_CONTRACT_ADDRESS;
const userAddress = '0xe8239aFA5Cc7Ec80d27713A60D2E50facbeA3BC0';
const recipientAddress = '0x59D1660C1F9C88aFCebBdbCb28Acd8110fB4ad25';
const amount = ethers.parseUnits('10', 18); // 10 GLT
const functionSignature = '0xa9059cbb00000000000000000000000059d1660c1f9c88afcebbdbcb28acd8110fb4ad250000000000000000000000000000000000000000000000008ac7230489e80000';

const contractABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "userAddress", "type": "address" },
            { "internalType": "bytes", "name": "functionSignature", "type": "bytes" },
            { "internalType": "bytes32", "name": "sigR", "type": "bytes32" },
            { "internalType": "bytes32", "name": "sigS", "type": "bytes32" },
            { "internalType": "uint8", "name": "sigV", "type": "uint8" }
        ],
        "name": "executeMetaTransaction",
        "outputs": [{ "internalType": "bytes", "name": "result", "type": "bytes" }],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "to", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "transfer",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "name": "authorizedRelayers",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }],
        "name": "nonces",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
];

const contract = new ethers.Contract(contractAddress, contractABI, wallet);

async function debugGaslessTransaction() {
    try {
        // Check Contract Balance
        const contractBalance = await contract.balanceOf(contractAddress);
        logger.info('Contract balance check:', { address: contractAddress, balance: ethers.formatUnits(contractBalance, 18) + ' GLT' });
        if (contractBalance < amount) {
            logger.warn('Insufficient contract balance for transfer');
        }

        // Validate Function Signature
        const transferSig = '0xa9059cbb'; // transfer(address,uint256) signature
        const expectedFunctionData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256'],
            [recipientAddress, amount]
        );
        const expectedSignature = ethers.keccak256(expectedFunctionData).slice(0, 10);
        logger.info('Function signature validation:', {
            provided: functionSignature.slice(0, 10),
            expected: expectedSignature,
            match: functionSignature.slice(0, 10) === expectedSignature
        });
        if (functionSignature.slice(0, 10) !== expectedSignature) {
            logger.warn('Function signature mismatch');
        }

        // Check User Permissions
        const isRelayerAuthorized = await contract.authorizedRelayers(wallet.address);
        logger.info('Relayer authorization check:', { relayer: wallet.address, isAuthorized: isRelayerAuthorized });
        if (!isRelayerAuthorized) {
            logger.warn('Relayer not authorized');
        }

        const userNonce = await contract.nonces(userAddress);
        logger.info('User nonce check:', { userAddress, nonce: userNonce.toString(), expected: '0' });
        if (userNonce.toString() !== '0') {
            logger.warn('Nonce mismatch');
        }

        // Validate Parameters
        const isValidRecipient = ethers.isAddress(recipientAddress);
        logger.info('Recipient address validation:', { recipient: recipientAddress, isValid: isValidRecipient });
        if (!isValidRecipient) {
            logger.warn('Invalid recipient address');
        }
        logger.info('Amount validation:', { amount: ethers.formatUnits(amount, 18) + ' GLT', isValid: amount > 0 });
        if (amount <= 0) {
            logger.warn('Invalid amount');
        }

        // Review Contract Code (Simulate Execution)
        const gasEstimate = await contract.estimateGas.executeMetaTransaction(
            userAddress,
            functionSignature,
            '0x03bab606596c1203100bec6f8002caef5f4ef3b711abf2df68c7cc448614f6ff', // r
            '0x3056ddf1f4f9586adc14838de65d2ea08ceca2720267cfac8a9278f45af2731d', // s
            27, // v
            { from: wallet.address }
        ).catch(error => {
            logger.error('Gas estimation failed:', error);
            return null;
        });
        if (gasEstimate) {
            logger.info('Gas estimation successful:', { gasEstimate: gasEstimate.toString() });
        } else {
            logger.warn('Gas estimation failed, check contract logic or ABI');
        }

        // Additional Contract Validation
        const contractCode = await provider.getCode(contractAddress);
        logger.info('Contract code exists:', { hasCode: contractCode !== '0x' });
        if (contractCode === '0x') {
            logger.error('No code at contract address');
        }

    } catch (error) {
        logger.error('Debugging error:', { message: error.message, stack: error.stack });
    }
}

debugGaslessTransaction();
