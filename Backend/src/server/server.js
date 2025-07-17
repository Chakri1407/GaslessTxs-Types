const express = require('express');
const { ethers } = require('ethers');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();
const port = 3001;

// Middleware
app.use(cors()); // Enable CORS for frontend communication
app.use(express.json()); // Parse JSON request bodies
app.use(express.static('public')); // Serve static files from the 'public' folder

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
    "function owner() view returns (address)",
    "function getAddress() view returns (address)"
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

// Helper function to decode custom errors
function decodeCustomError(errorData) {
    const errorCodes = {
        '0x8baa579f': 'InvalidSignature()',
        '0x756688fe': 'InvalidNonce()',
        '0x82b42900': 'UnauthorizedRelayer()',
        '0x8d21e65e': 'ExecutionFailed()'
    };
    
    return errorCodes[errorData] || 'Unknown error';
}
// OPTIMAL GAS PRICE CALCULATION FUNCTION for server.js
async function calculateOptimalGasPrice(provider) {
    try {
        const feeData = await provider.getFeeData();
        console.log('📊 Network fee data:', {
            gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') + ' gwei' : 'N/A',
            maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') + ' gwei' : 'N/A',
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'N/A'
        });

        // For Polygon networks, prioritize maxFeePerGas if available (EIP-1559)
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            console.log('Using EIP-1559 pricing');
            
            // Use the higher of network gasPrice or maxFeePerGas as base
            const baseGasPrice = feeData.gasPrice || ethers.parseUnits('50', 'gwei');
            const networkMaxFee = feeData.maxFeePerGas;
            
            // Take the higher value as our base and multiply by our factor
            const higherBase = baseGasPrice > networkMaxFee ? baseGasPrice : networkMaxFee;
            const multipliedMaxFee = higherBase * 5n; // Increased to 5x multiplier for reliability
            
            // Set higher minimums for Polygon Amoy (testnet can be congested)
            const minMaxFee = ethers.parseUnits('500', 'gwei'); // Increased minimum
            const minPriorityFee = ethers.parseUnits('100', 'gwei'); // Increased minimum
            
            const finalMaxFee = multipliedMaxFee > minMaxFee ? multipliedMaxFee : minMaxFee;
            const finalPriorityFee = (feeData.maxPriorityFeePerGas * 5n) > minPriorityFee ? 
                (feeData.maxPriorityFeePerGas * 5n) : minPriorityFee;
            
            console.log('⛽ EIP-1559 gas calculation:', {
                baseGasPrice: ethers.formatUnits(baseGasPrice, 'gwei') + ' gwei',
                networkMaxFee: ethers.formatUnits(networkMaxFee, 'gwei') + ' gwei',
                finalMaxFee: ethers.formatUnits(finalMaxFee, 'gwei') + ' gwei',
                finalPriorityFee: ethers.formatUnits(finalPriorityFee, 'gwei') + ' gwei'
            });
            
            return {
                maxFeePerGas: finalMaxFee,
                maxPriorityFeePerGas: finalPriorityFee,
                gasPrice: undefined
            };
        }

        // Fallback to legacy gas pricing with higher multiplier
        const networkGasPrice = feeData.gasPrice || ethers.parseUnits('50', 'gwei');
        const gasPrice = networkGasPrice * 5n; // Increased to 5x multiplier
        const minGasPrice = ethers.parseUnits('500', 'gwei'); // Higher minimum for Polygon Amoy
        const finalGasPrice = gasPrice > minGasPrice ? gasPrice : minGasPrice;

        console.log('⛽ Using legacy gas pricing:', {
            networkGasPrice: ethers.formatUnits(networkGasPrice, 'gwei') + ' gwei',
            calculatedGasPrice: ethers.formatUnits(gasPrice, 'gwei') + ' gwei',
            finalGasPrice: ethers.formatUnits(finalGasPrice, 'gwei') + ' gwei'
        });

        return {
            gasPrice: finalGasPrice,
            maxFeePerGas: undefined,
            maxPriorityFeePerGas: undefined
        };
    } catch (error) {
        console.error('Error calculating gas price:', error);
        // Ultra-safe fallback for Polygon Amoy
        return {
            gasPrice: ethers.parseUnits('600', 'gwei'),
            maxFeePerGas: undefined,
            maxPriorityFeePerGas: undefined
        };
    }
} 

// MAIN EXECUTE META-TRANSACTION ENDPOINT
app.post('/executeMetaTx', async (req, res) => {
    try {
        const { userAddress, functionData, sigR, sigS, sigV } = req.body;

        // Input validation
        if (!userAddress || !functionData || !sigR || !sigS || sigV === undefined) {
            return res.status(400).json({ error: 'Missing required fields: userAddress, functionData, sigR, sigS, sigV' });
        }

        console.log('🔍 Received meta-transaction request:');
        console.log('- User Address:', userAddress);
        console.log('- Function Data:', functionData);
        console.log('- Signature R:', sigR);
        console.log('- Signature S:', sigS);
        console.log('- Signature V:', sigV);

        if (!isValidAddress(userAddress)) {
            return res.status(400).json({ error: 'Invalid userAddress' });
        }

        if (!functionData.match(/^0x[a-fA-F0-9]+$/)) {
            return res.status(400).json({ error: 'Invalid functionData: must be a hex string starting with 0x' });
        }

        if (!isValidSignatureComponents(sigR, sigS, sigV)) {
            return res.status(400).json({ error: 'Invalid signature components' });
        }

        // Check relayer authorization
        console.log('📋 Checking relayer authorization...');
        const isAuthorized = await contract.authorizedRelayers(relayerWallet.address);
        console.log('Relayer authorized:', isAuthorized);
        
        if (!isAuthorized) {
            return res.status(403).json({ error: `Relayer ${relayerWallet.address} is not authorized` });
        }

        // Check relayer balance
        const relayerBalance = await provider.getBalance(relayerWallet.address);
        console.log('💰 Relayer balance:', ethers.formatEther(relayerBalance), 'MATIC');
        
        if (relayerBalance < ethers.parseEther('0.01')) {
            return res.status(400).json({ error: 'Relayer has insufficient MATIC for gas fees' });
        }

        // Verify signature
        console.log('✍️ Verifying signature...');
        const isValidSignature = await contract.verifyMetaTransactionSignature(userAddress, functionData, sigR, sigS, sigV);
        console.log('Signature valid:', isValidSignature);
        
        if (!isValidSignature) {
            return res.status(400).json({ error: 'Invalid meta-transaction signature' });
        }

        // Execute transaction with retry logic
        const maxRetries = 2;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Transaction attempt ${attempt}/${maxRetries}`);
                
                // Get optimal gas settings
                const gasSettings = await calculateOptimalGasPrice(provider);
                
                // Increase gas price with each retry
                if (attempt > 1) {
                    if (gasSettings.gasPrice) {
                        gasSettings.gasPrice = gasSettings.gasPrice * BigInt(attempt);
                    }
                    if (gasSettings.maxFeePerGas) {
                        gasSettings.maxFeePerGas = gasSettings.maxFeePerGas * BigInt(attempt);
                        gasSettings.maxPriorityFeePerGas = gasSettings.maxPriorityFeePerGas * BigInt(attempt);
                    }
                }

                // Estimate gas
                console.log('📏 Estimating gas...');
                let gasEstimate;
                try {
                    gasEstimate = await contract.executeMetaTransaction.estimateGas(userAddress, functionData, sigR, sigS, sigV);
                    console.log('Gas estimate:', gasEstimate.toString());
                } catch (estimateError) {
                    console.error(`Gas estimation failed on attempt ${attempt}:`, estimateError);
                    if (attempt === maxRetries) throw estimateError;
                    continue;
                }

                // Use higher gas limit for retries
                const gasMultiplier = attempt === 1 ? 2n : 3n;
                const gasLimit = gasEstimate * gasMultiplier > 500000n ? gasEstimate * gasMultiplier : 500000n;

                if (gasLimit > 2000000n) {
                    throw new Error(`Gas limit too high: ${gasLimit.toString()}`);
                }

                console.log(`🔧 Gas settings for attempt ${attempt}:`, {
                    gasLimit: gasLimit.toString(),
                    gasPrice: gasSettings.gasPrice ? ethers.formatUnits(gasSettings.gasPrice, 'gwei') + ' gwei' : 'N/A',
                    maxFeePerGas: gasSettings.maxFeePerGas ? ethers.formatUnits(gasSettings.maxFeePerGas, 'gwei') + ' gwei' : 'N/A',
                    maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas ? ethers.formatUnits(gasSettings.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'N/A'
                });

                // Prepare transaction options
                const txParams = { gasLimit };
                if (gasSettings.gasPrice) {
                    txParams.gasPrice = gasSettings.gasPrice;
                } else {
                    txParams.maxFeePerGas = gasSettings.maxFeePerGas;
                    txParams.maxPriorityFeePerGas = gasSettings.maxPriorityFeePerGas;
                }

                // Execute meta-transaction
                console.log('🚀 Executing meta-transaction...');
                
                const executionPromise = contract.executeMetaTransaction(
                    userAddress, 
                    functionData, 
                    sigR, 
                    sigS, 
                    sigV, 
                    txParams
                );

                // Add timeout (90 seconds)
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Transaction submission timeout')), 90000);
                });

                const tx = await Promise.race([executionPromise, timeoutPromise]);
                console.log(`✅ Transaction submitted on attempt ${attempt}:`, tx.hash);

                // Wait for confirmation with extended timeout
                const confirmationTimeout = attempt === 1 ? 120000 : 180000; // 2 min first, then 3 min
                const confirmationPromise = tx.wait();
                const confirmationTimeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Confirmation timeout after ${confirmationTimeout/1000} seconds`)), confirmationTimeout);
                });

                const receipt = await Promise.race([confirmationPromise, confirmationTimeoutPromise]);
                console.log(`✅ Transaction confirmed on attempt ${attempt} in block:`, receipt.blockNumber);

                // Calculate actual gas cost
                const actualGasCost = receipt.gasUsed * (receipt.effectiveGasPrice || gasSettings.gasPrice || gasSettings.maxFeePerGas);
                console.log('💰 Gas cost:', ethers.formatEther(actualGasCost), 'MATIC');

                // Send success response
                return res.json({
                    success: true,
                    txHash: tx.hash,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
                    gasPrice: gasSettings.gasPrice ? ethers.formatUnits(gasSettings.gasPrice, 'gwei') : 'N/A',
                    maxFeePerGas: gasSettings.maxFeePerGas ? ethers.formatUnits(gasSettings.maxFeePerGas, 'gwei') : 'N/A',
                    maxPriorityFeePerGas: gasSettings.maxPriorityFeePerGas ? ethers.formatUnits(gasSettings.maxPriorityFeePerGas, 'gwei') : 'N/A',
                    effectiveGasPrice: receipt.effectiveGasPrice ? ethers.formatUnits(receipt.effectiveGasPrice, 'gwei') : 'N/A',
                    gasCost: ethers.formatEther(actualGasCost),
                    userAddress,
                    functionData,
                    relayerAddress: relayerWallet.address,
                    attempt: attempt
                });

            } catch (attemptError) {
                console.error(`❌ Attempt ${attempt} failed:`, attemptError);
                lastError = attemptError;
                
                // If this is the last attempt, break out of the loop
                if (attempt === maxRetries) {
                    break;
                }
                
                // Wait before retry (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
                console.log(`⏱️ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // If we get here, all attempts failed
        throw lastError;

    } catch (error) {
        console.error('❌ Error executing meta-transaction:', error);
        
        let errorMessage = error.reason || error.message || 'Failed to execute meta-transaction';
        let statusCode = 500;
        
        // Handle specific error types
        if (error.message.includes('timeout')) {
            errorMessage = 'Transaction timed out. Network may be congested. Try again later.';
            statusCode = 408;
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage = 'Relayer has insufficient funds for gas fees';
            statusCode = 400;
        } else if (error.code === 'CALL_EXCEPTION') {
            // Decode custom errors
            if (error.data) {
                const errorCodes = {
                    '0x8baa579f': 'InvalidSignature()',
                    '0x756688fe': 'InvalidNonce()',
                    '0x82b42900': 'UnauthorizedRelayer()',
                    '0x8d21e65e': 'ExecutionFailed()'
                };
                
                const decodedError = errorCodes[error.data];
                if (decodedError) {
                    errorMessage = `Contract error: ${decodedError}`;
                }
            }
            statusCode = 400;
        } else if (error.code === 'NETWORK_ERROR') {
            errorMessage = 'Network error. Please check connection and try again.';
            statusCode = 503;
        } else if (error.code === 'NONCE_EXPIRED') {
            errorMessage = 'Transaction nonce expired. Please try again.';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            error: errorMessage,
            errorCode: error.data || null,
            errorType: error.code || 'UNKNOWN',
            details: error.message
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