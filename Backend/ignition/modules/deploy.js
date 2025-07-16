const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log('Deploying contracts with the account:', deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log('Account balance:', ethers.formatEther(balance), 'ETH');
    
    // Get network information
    const network = await ethers.provider.getNetwork();
    console.log('Network:', network.name, '(Chain ID:', network.chainId, ')');
    
    const GaslessToken = await ethers.getContractFactory('GaslessToken');
    console.log('Deploying GaslessToken...');
    
    const feeData = await ethers.provider.getFeeData();
    console.log('Current gas price:', ethers.formatUnits(feeData.gasPrice || 0, 'gwei'), 'gwei');
    
    // Deploy with constructor parameters
    const gaslessToken = await GaslessToken.deploy(
        'GaslessToken',           // name
        'GLT',                    // symbol
        ethers.parseEther('1000000'), // initial supply (1M tokens)
        deployer.address,         // owner
        {
            gasLimit: 5000000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        }
    );
    
    await gaslessToken.waitForDeployment();
    const contractAddress = await gaslessToken.getAddress();
    console.log('GaslessToken deployed to:', contractAddress);
    
    // Verify the deployment
    const deployedName = await gaslessToken.name();
    const deployedSymbol = await gaslessToken.symbol();
    const deployedSupply = await gaslessToken.totalSupply();
    const deployedOwner = await gaslessToken.owner();
    
    console.log('Contract verification:');
    console.log('- Name:', deployedName);
    console.log('- Symbol:', deployedSymbol);
    console.log('- Total Supply:', ethers.formatEther(deployedSupply));
    console.log('- Owner:', deployedOwner);
    
    // Get the domain separator for EIP-712
    const domainSeparator = await gaslessToken.DOMAIN_SEPARATOR();
    console.log('- Domain Separator:', domainSeparator);
    
    // Authorize relayer if provided
    const relayerAddress = process.env.RELAYER_ADDRESS;
    if (relayerAddress) {
        console.log('Authorizing relayer:', relayerAddress);
        const tx = await gaslessToken.authorizeRelayer(relayerAddress, {
            gasLimit: 100000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')
        });
        await tx.wait();
        console.log('Relayer authorized successfully!');
        
        // Verify relayer authorization
        const isAuthorized = await gaslessToken.authorizedRelayers(relayerAddress);
        console.log('Relayer authorization verified:', isAuthorized);
    } else {
        console.log('No relayer address provided. Set RELAYER_ADDRESS environment variable to authorize a relayer.');
    }
    
    // Get deployment transaction details
    let deploymentReceipt = null;
    let gasUsed = 'N/A';
    let effectiveGasPrice = 'N/A';
    let transactionHash = 'N/A';
    let blockNumber = await ethers.provider.getBlockNumber();
    
    try {
        const deploymentTx = gaslessToken.deploymentTransaction();
        if (deploymentTx) {
            deploymentReceipt = await deploymentTx.wait();
            gasUsed = deploymentReceipt.gasUsed ? deploymentReceipt.gasUsed.toString() : 'N/A';
            effectiveGasPrice = deploymentReceipt.effectiveGasPrice ? deploymentReceipt.effectiveGasPrice.toString() : 'N/A';
            transactionHash = deploymentReceipt.hash || deploymentTx.hash || 'N/A';
            blockNumber = deploymentReceipt.blockNumber || blockNumber;
        }
    } catch (error) {
        console.log('Warning: Could not get deployment transaction details:', error.message);
    }
    
    const deploymentInfo = {
        network: hre.network.name,
        chainId: Number(network.chainId),
        contractAddress: contractAddress,
        deployer: deployer.address,
        relayerAddress: relayerAddress || null,
        blockNumber: blockNumber,
        transactionHash: transactionHash,
        gasUsed: gasUsed,
        effectiveGasPrice: effectiveGasPrice,
        contractDetails: {
            name: deployedName,
            symbol: deployedSymbol,
            totalSupply: deployedSupply.toString(),
            owner: deployedOwner,
            domainSeparator: domainSeparator
        },
        timestamp: new Date().toISOString()
    };
    
    // Save deployment info
    const deploymentsDir = path.join(__dirname, '../../deployments');
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const deploymentFile = path.join(deploymentsDir, `${hre.network.name}.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    
    console.log('Deployment info saved to:', deploymentFile);
    
    // Also save ABI for frontend integration
    const abiFile = path.join(deploymentsDir, 'GaslessToken.json');
    const artifactPath = path.join(__dirname, '../artifacts/contracts/GaslessToken.sol/GaslessToken.json');
    
    if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        const abiData = {
            contractName: 'GaslessToken',
            abi: artifact.abi,
            bytecode: artifact.bytecode,
            deployedBytecode: artifact.deployedBytecode,
            deployment: deploymentInfo
        };
        fs.writeFileSync(abiFile, JSON.stringify(abiData, null, 2));
        console.log('ABI and contract data saved to:', abiFile);
    }
    
    console.log('\n=== Deployment Summary ===');
    console.log('Contract Address:', contractAddress);
    console.log('Network:', hre.network.name);
    console.log('Chain ID:', network.chainId);
    console.log('Owner:', deployer.address);
    console.log('Initial Supply:', ethers.formatEther(deployedSupply), 'GLT');
    console.log('Gas Used:', gasUsed);
    console.log('Block Number:', blockNumber);
    
    if (relayerAddress) {
        console.log('Authorized Relayer:', relayerAddress);
    }
    
    console.log('\nDeployment completed successfully!');
    
    // Instructions for next steps
    console.log('\n=== Next Steps ===');
    console.log('1. Verify the contract on block explorer (if needed)');
    console.log('2. Set up your relayer service with the authorized address');
    console.log('3. Test meta-transactions using the provided test suite');
    console.log('4. Update your frontend with the new contract address and ABI');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    }); 