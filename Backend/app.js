const express = require('express');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.static('public')); // Serve static files (e.g., index.html)

// Contract ABI (minimal for now, expand as needed)
const FULL_ABI = [
    "function executeMetaTransaction(address userAddress, bytes calldata functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) payable returns (bytes memory)"
];

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
const relayerWallet = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);
const contractAddress = process.env.AMOY_CONTRACT_ADDRESS;
const contract = new ethers.Contract(contractAddress, FULL_ABI, relayerWallet);

// Helper function to validate Ethereum address
function isValidAddress(address) {
    return ethers.isAddress(address);
}

// Endpoint to execute meta-transaction
app.post('/executeMetaTx', async (req, res) => {
    try {
        const { userAddress, functionData, sigR, sigS, sigV } = req.body;

        if (!userAddress || !functionData || !sigR || !sigS || sigV === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!isValidAddress(userAddress)) {
            return res.status(400).json({ error: 'Invalid userAddress' });
        }

        const tx = await contract.executeMetaTransaction(userAddress, functionData, sigR, sigS, sigV, {
            gasLimit: 1000000
        });
        const receipt = await tx.wait();

        res.json({
            success: true,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
        });
    } catch (error) {
        console.error('Error executing meta-transaction:', error);
        res.status(500).json({ error: error.message || 'Failed to execute meta-transaction' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    // console.log(`Relayer Address: ${relayerWallet.address}`);
    // console.log(`Contract Address: ${contractAddress}`);
});