
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log('Deploying contracts with the account:', deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log('Account balance:', ethers.formatEther(balance), 'MATIC');
    
    const GaslessToken = await ethers.getContractFactory('GaslessToken');
    console.log('Deploying GaslessToken...');
    
    const feeData = await ethers.provider.getFeeData();
    const gaslessToken = await GaslessToken.deploy(
        'GaslessToken',
        'GLT',
        ethers.parseEther('1000000'),
        deployer.address,
        {
            gasLimit: 5000000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        }
    );
    
    await gaslessToken.waitForDeployment();
    const contractAddress = await gaslessToken.getAddress();
    console.log('GaslessToken deployed to:', contractAddress);
    
    const relayerAddress = process.env.RELAYER_ADDRESS;
    if (relayerAddress) {
        const tx = await gaslessToken.authorizeRelayer(relayerAddress, {
            gasLimit: 100000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
        await tx.wait();
        console.log('Relayer authorized:', relayerAddress);
    }
    
    const deploymentInfo = {
        network: hre.network.name,
        contractAddress: contractAddress,
        deployer: deployer.address,
        relayerAddress: relayerAddress,
        blockNumber: await ethers.provider.getBlockNumber(),
        timestamp: new Date().toISOString()
    };
    
    const deploymentsDir = path.join(__dirname, '../../deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    fs.writeFileSync(
        path.join(deploymentsDir, `${hre.network.name}.json`),
        JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('Deployment completed successfully!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    });