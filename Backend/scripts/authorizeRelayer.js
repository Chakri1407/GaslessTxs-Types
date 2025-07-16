require('dotenv').config();
const hre = require("hardhat");

async function main() {
  // Load configuration from environment variables
  const config = {
    rpcUrl: process.env.AMOY_RPC_URL,
    ownerPrivateKey: process.env.AMOY_RELAYER_PRIVATE_KEY,
    contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
    relayerAddress: process.env.RELAYER_ADDRESS
  };

  // Validate configuration
  if (!config.rpcUrl) {
    throw new Error("AMOY_RPC_URL not found in environment variables");
  }

  // Check for valid Alchemy URL or allow other RPC providers
  if (config.rpcUrl.includes('alchemy.com')) {
    if (!config.rpcUrl.match(/^https:\/\/polygon-amoy\.g\.alchemy\.com\/v2\/[a-zA-Z0-9]+$/)) {
      throw new Error("Invalid AMOY_RPC_URL: Alchemy URLs must include a valid API key");
    }
  } else if (!config.rpcUrl.startsWith('https://') && !config.rpcUrl.startsWith('http://')) {
    throw new Error("Invalid AMOY_RPC_URL: Must be a valid HTTP/HTTPS URL");
  }

  if (!config.ownerPrivateKey) {
    throw new Error("AMOY_RELAYER_PRIVATE_KEY not found in environment variables");
  }

  // Add 0x prefix if missing
  if (!config.ownerPrivateKey.startsWith('0x')) {
    config.ownerPrivateKey = '0x' + config.ownerPrivateKey;
  }

  if (!config.ownerPrivateKey.match(/^0x[a-fA-F0-9]{64}$/)) {
    throw new Error("Invalid ownerPrivateKey: Must be 64 hex characters with 0x prefix");
  }

  if (!config.contractAddress) {
    throw new Error("AMOY_CONTRACT_ADDRESS not found in environment variables");
  }

  if (!hre.ethers.isAddress(config.contractAddress)) {
    throw new Error("Invalid contractAddress: Must be a valid Ethereum address");
  }

  if (!config.relayerAddress) {
    throw new Error("RELAYER_ADDRESS not found in environment variables");
  }

  if (!hre.ethers.isAddress(config.relayerAddress)) {
    throw new Error("Invalid relayerAddress: Must be a valid Ethereum address");
  }

  // Initialize provider and wallet
  const provider = new hre.ethers.JsonRpcProvider(config.rpcUrl);
  const ownerWallet = new hre.ethers.Wallet(config.ownerPrivateKey, provider);

  // Load contract
  const contract = await hre.ethers.getContractAt(
    [
      "function authorizeRelayer(address relayer)",
      "function authorizedRelayers(address) view returns (bool)",
      "function owner() view returns (address)"
    ],
    config.contractAddress,
    ownerWallet
  );

  // Verify owner
  const contractOwner = await contract.owner();
  if (contractOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
    throw new Error(`Provided private key does not match contract owner: ${contractOwner}`);
  }

  // Check if relayer is already authorized
  const isAuthorized = await contract.authorizedRelayers(config.relayerAddress);
  if (isAuthorized) {
    console.log(`Relayer ${config.relayerAddress} is already authorized`);
    return;
  }

  // Check owner balance
  const ownerBalance = await provider.getBalance(ownerWallet.address);
  if (ownerBalance === 0n) {
    throw new Error(`Owner account ${ownerWallet.address} has no MATIC. Fund it via https://faucet.polygon.technology/`);
  }

  // Authorize relayer
  console.log(`Authorizing relayer ${config.relayerAddress}...`);
  const tx = await contract.authorizeRelayer(config.relayerAddress, { gasLimit: 100000 });
  console.log(`Transaction Hash: ${tx.hash}`);

  // Wait for confirmation
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

  // Verify authorization
  const isNowAuthorized = await contract.authorizedRelayers(config.relayerAddress);
  console.log(`Relayer ${config.relayerAddress} authorized: ${isNowAuthorized}`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
}); 