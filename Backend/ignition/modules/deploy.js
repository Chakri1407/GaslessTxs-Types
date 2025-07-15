const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
    // Check if we have signers available
    const signers = await ethers.getSigners();
    if (signers.length === 0) {
        throw new Error('No signers available. Please check your Hardhat configuration and ensure PRIVATE_KEY is set in your .env file');
    }
    
    const [deployer] = signers;
    
    console.log('Deploying contracts with the account:', deployer.address);
    console.log('Account balance:', ethers.formatEther(await ethers.provider.getBalance(deployer.address)), 'ETH');
    
    // Get the contract factory
    const GaslessToken = await ethers.getContractFactory('GaslessToken');
    
    // Deploy the contract
    console.log('Deploying GaslessToken...');
    const gaslessToken = await GaslessToken.deploy(
        'GaslessToken',
        'GLT',
        ethers.parseEther('1000000'), // 1 million tokens
        deployer.address
    );
    
    // Wait for deployment to complete
    await gaslessToken.waitForDeployment();
    const contractAddress = await gaslessToken.getAddress();
    
    console.log('GaslessToken deployed to:', contractAddress);
    
    // Authorize relayer if provided
    const relayerAddress = process.env.RELAYER_ADDRESS;
    if (relayerAddress && ethers.isAddress(relayerAddress)) {
        console.log('Authorizing relayer:', relayerAddress);
        const tx = await gaslessToken.authorizeRelayer(relayerAddress);
        await tx.wait();
        console.log('Relayer authorized successfully');
    } else if (relayerAddress) {
        console.warn('Invalid relayer address provided:', relayerAddress);
    } else {
        console.log('No relayer address provided, skipping authorization');
        console.log('You can derive the relayer address from the private key and set it in .env if needed');
    }
    
    // Create deployments directory if it doesn't exist
    const deploymentsDir = path.join(__dirname, '..', 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    // Get current block number
    const blockNumber = await ethers.provider.getBlockNumber();
    
    // Prepare deployment info
    const deploymentInfo = {
        network: hre.network.name,
        contractAddress: contractAddress,
        deployer: deployer.address,
        relayerAddress: relayerAddress || null,
        blockNumber: blockNumber,
        timestamp: new Date().toISOString(),
        transactionHash: gaslessToken.deploymentTransaction().hash
    };
    
    // Write deployment info to file
    const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
    fs.writeFileSync(
        deploymentFile,
        JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('Deployment info saved to:', deploymentFile);
    console.log('Deployment completed successfully!');
    
    // Display summary
    console.log('\n=== Deployment Summary ===');
    console.log('Network:', hre.network.name);
    console.log('Contract Address:', contractAddress);
    console.log('Deployer:', deployer.address);
    console.log('Initial Supply: 1,000,000 GLT');
    console.log('Block Number:', blockNumber);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    }); 