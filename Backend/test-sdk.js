const { createGaslessSDK } = require('./src/sdk/gasless-sdk');
const { ethers } = require('ethers');
require('dotenv').config();

async function test() {
    console.log('Loaded AMOY_CONTRACT_ADDRESS:', process.env.AMOY_CONTRACT_ADDRESS);
    const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
    const signer = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);
    
    const sdk = await createGaslessSDK({
        relayerUrl: 'http://localhost:3000',
        network: 'amoy',
        contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
        provider,
        signer
    });

    console.log('SDK initialized for contract:', process.env.AMOY_CONTRACT_ADDRESS);

    // Check balance of deployer/relayer
    const balance = await sdk.getBalance();
    console.log('Deployer balance:', ethers.formatEther(balance), 'GLT');

    // Perform a gasless transfer
    const recipientAddress = '0x59D1660C1F9C88aFCebBdbCb28Acd8110fB4ad25'; // Replace with a valid Amoy address
    console.log('Initiating transfer to:', recipientAddress);
    const result = await sdk.transfer(recipientAddress, '10');
    console.log('Transfer result:', result);

    // Wait for transaction confirmation
    const status = await sdk.waitForTransaction(result.txId);
    console.log('Transaction status:', status);
}

test().catch(console.error); 