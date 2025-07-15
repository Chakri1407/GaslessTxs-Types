const { createGaslessSDK } = require('./src/sdk/gasless-sdk');
const { ethers } = require('ethers');

async function test() {
    const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
    const signer = new ethers.Wallet(process.env.AMOY_RELAYER_PRIVATE_KEY, provider);
    
    const sdk = await createGaslessSDK({
        relayerUrl: 'http://localhost:3000',
        network: 'amoy',
        contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
        provider,
        signer
    });

    const balance = await sdk.getBalance();
    console.log('Balance:', balance);

    const result = await sdk.transfer('0xRecipientAddress', '10');
    console.log('Transfer result:', result);

    const status = await sdk.waitForTransaction(result.txId);
    console.log('Transaction status:', status);
}

test().catch(console.error); 