const { ethers } = require('ethers');
require('dotenv').config();

async function checkBalance() {
    const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
    const abi = ['function getBalance() public view returns (uint256)']; // Adjust if needed
    const contract = new ethers.Contract(process.env.AMOY_CONTRACT_ADDRESS, abi, provider);
    const balance = await contract.getBalance();
    console.log('Balance:', ethers.formatEther(balance), 'GLT');
}

checkBalance().catch(console.error); 