const express = require('express');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for frontend communication
app.use(express.json()); // Parse JSON request bodies

// Contract ABI (copied from frontend index.html)
const FULL_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function nonces(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function authorizeRelayer(address relayer)",
    "function revokeRelayer(address relayer)",
    "function authorizedRelayers(address) view returns (bool)",
    "function executeMetaTransaction(address userAddress, bytes calldata functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) payable returns (bytes memory)",
    "function getMetaTransactionHash(address userAddress, bytes calldata functionSignature, uint256 nonce) view returns (bytes32)",
    "function verifyMetaTransactionSignature(address userAddress, bytes calldata functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) view returns (bool)",
    "function DOMAIN_SEPARATOR() view returns (bytes32)",
    "function getChainId() view returns (uint256)",
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "function permitNonces(address owner) view returns (uint256)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function batchTransfer(address[] calldata recipients, uint256[] calldata amounts)",
    "function owner() view returns (address)"
];

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const relayerWallet = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.AMOY_CONTRACT_ADDRESS, FULL_ABI, relayerWallet);

// Helper function to validate Ethereum address
function isValidAddress(address) {
    return ethers.isAddress(address);
}

// Helper function to validate signature components
function isValidSignatureComponents(sigR, sigS, sigV) {
    if (!sigR || !sigS || sigV === undefined) return false;
    if (!sigR.match(/^0x[a-fA-F0-9]{64}$/)) return false;
    if (!sigS.match(/^0x[a-fA-F0-9]{64}$/)) return false;
    if (![27, 28].includes(sigV)) return false;
    return true;
}

// Endpoint to execute meta-transaction
app.post('/executeMetaTx', async (req, res) => {
    try {
        const { userAddress, functionData, sigR, sigS, sigV } = req.body;

        // Input validation
        if (!userAddress || !functionData || !sigR || !sigS || sigV === undefined) {
            return res.status(400).json({ error: 'Missing required fields: userAddress, functionData, sigR, sigS, sigV' });
        }

        if (!isValidAddress(userAddress)) {
            return res.status(400).json({ error: 'Invalid userAddress' });
        }

        if (!functionData.match(/^0x[a-fA-F0-9]+$/)) {
            return res.status(400).json({ error: 'Invalid functionData: must be a hex string starting with 0x' });
        }

        if (!isValidSignatureComponents(sigR, sigS, sigV)) {
            return res.status(400).json({ error: 'Invalid signature components' });
        }

        // Verify relayer authorization
        const isAuthorized = await contract.authorizedRelayers(relayerWallet.address);
        if (!isAuthorized) {
            return res.status(403).json({ error: `Relayer ${relayerWallet.address} is not authorized` });
        }

        // Verify signature
        const isValidSignature = await contract.verifyMetaTransactionSignature(userAddress, functionData, sigR, sigS, sigV);
        if (!isValidSignature) {
            return res.status(400).json({ error: 'Invalid meta-transaction signature' });
        }

        // Check relayer balance
        const relayerBalance = await provider.getBalance(relayerWallet.address);
        if (relayerBalance === 0n) {
            return res.status(400).json({ error: 'Relayer has insufficient MATIC for gas fees' });
        }

        // Estimate gas
        const gasEstimate = await contract.executeMetaTransaction.estimateGas(userAddress, functionData, sigR, sigS, sigV);
        if (gasEstimate > 1000000n) {
            return res.status(400).json({ error: `Gas estimate too high: ${gasEstimate.toString()}` });
        }

        // Execute meta-transaction
        const tx = await contract.executeMetaTransaction(userAddress, functionData, sigR, sigS, sigV, {
            gasLimit: 1000000
        });

        // Wait for confirmation
        const receipt = await tx.wait();

        // Send response
        res.json({
            success: true,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString(),
            userAddress,
            functionData,
            relayerAddress: relayerWallet.address
        });
    } catch (error) {
        console.error('Error executing meta-transaction:', error);
        res.status(500).json({
            error: error.reason || error.message || 'Failed to execute meta-transaction'
        });
    }
});

// Endpoint to check relayer status
app.get('/relayerStatus', async (req, res) => {
    try {
        const isAuthorized = await contract.authorizedRelayers(relayerWallet.address);
        const balance = await provider.getBalance(relayerWallet.address);

        res.json({
            relayerAddress: relayerWallet.address,
            isAuthorized,
            balance: ethers.formatEther(balance)
        });
    } catch (error) {
        console.error('Error checking relayer status:', error);
        res.status(500).json({
            error: error.message || 'Failed to check relayer status'
        });
    }
});

// Endpoint to get contract info (for debugging)
app.get('/contractInfo', async (req, res) => {
    try {
        const name = await contract.name();
        const symbol = await contract.symbol();
        const decimals = await contract.decimals();
        const totalSupply = await contract.totalSupply();
        const chainId = await contract.getChainId();
        const domainSeparator = await contract.DOMAIN_SEPARATOR();

        res.json({
            contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
            name,
            symbol,
            decimals,
            totalSupply: ethers.formatUnits(totalSupply, decimals),
            chainId: chainId.toString(),
            domainSeparator
        });
    } catch (error) {
        console.error('Error getting contract info:', error);
        res.status(500).json({
            error: error.message || 'Failed to get contract info'
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Relayer Address: ${relayerWallet.address}`);
    console.log(`Contract Address: ${process.env.AMOY_CONTRACT_ADDRESS}`);
}); 