const { ethers } = require('ethers');
const { Contract } = require('ethers');

async function createGaslessSDK({ relayerUrl, network, contractAddress, provider, signer }) {
    const abi = [
        'constructor(string name, string symbol, uint256 initialSupply, address owner)',
        'function balanceOf(address account) public view returns (uint256)',
        'function transfer(address to, uint256 amount) public returns (bool)',
        'function authorizeRelayer(address relayer) public',
        'function authorizedRelayers(address) public view returns (bool)',
        'function executeMetaTransaction(address userAddress, bytes calldata functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) external payable returns (bytes memory)',
        'function nonces(address owner) view returns (uint256)',
        'function DOMAIN_SEPARATOR() external view returns (bytes32)'
    ];

    const contract = new Contract(contractAddress, abi, provider);

    return {
        getBalance: async () => {
            try {
                const balance = await contract.balanceOf(signer.address);
                return balance;
            } catch (error) {
                console.error('GetBalance error:', error);
                throw error;
            }
        },
        getNonce: async () => {
            try {
                const nonce = await contract.nonces(signer.address);
                return nonce;
            } catch (error) {
                console.error('GetNonce error:', error);
                throw error;
            }
        },
        transfer: async (to, amount) => {
            try {
                // Convert amount to BigInt with proper decimals
                const amountInWei = ethers.parseEther(amount.toString());
                
                // Prepare function signature for transfer
                const functionSignature = contract.interface.encodeFunctionData('transfer', [to, amountInWei]);
                const nonce = await contract.nonces(signer.address);

                console.log('Transfer details:', {
                    to,
                    amount: amountInWei.toString(),
                    nonce: nonce.toString(),
                    functionSignature
                });

                // Create the message hash that matches the contract's expectation
                const META_TRANSACTION_TYPEHASH = ethers.keccak256(
                    ethers.toUtf8Bytes('MetaTransaction(uint256 nonce,address from,bytes functionSignature)')
                );

                const structHash = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ['bytes32', 'uint256', 'address', 'bytes32'],
                        [
                            META_TRANSACTION_TYPEHASH,
                            nonce,
                            signer.address,
                            ethers.keccak256(functionSignature)
                        ]
                    )
                );

                // Get domain separator from contract
                const domainSeparator = await contract.DOMAIN_SEPARATOR();
                
                // Create the digest that matches EIP-712
                const digest = ethers.keccak256(
                    ethers.concat([
                        ethers.toUtf8Bytes('\x19\x01'),
                        domainSeparator,
                        structHash
                    ])
                );

                console.log('Digest:', digest);

                // Create signature using the signing key directly
                const signature = signer.signingKey.sign(digest);
                
                // Extract r, s, v from signature
                const r = signature.r;
                const s = signature.s;
                const v = signature.v;

                console.log('Signature components:', { r, s, v });

                // Verify signature locally before sending
                const recoveredSigner = ethers.recoverAddress(digest, { r, s, v });
                if (recoveredSigner.toLowerCase() !== signer.address.toLowerCase()) {
                    throw new Error(`Signature verification failed. Expected: ${signer.address}, Got: ${recoveredSigner}`);
                }

                console.log('Signature verified successfully');

                // Send to relayer
                const payload = {
                    contractAddress,
                    userAddress: signer.address,
                    functionSignature,
                    r,
                    s,
                    v,
                    nonce: nonce.toString(),
                    network
                };

                console.log('Sending payload to relayer:', payload);

                const response = await fetch(`${relayerUrl}/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();
                console.log('Relayer response:', result);

                if (!response.ok) {
                    throw new Error(`Relayer error: ${JSON.stringify(result)}`);
                }

                return result;
            } catch (error) {
                console.error('Transfer error:', error);
                throw error;
            }
        },
        waitForTransaction: async (txId) => {
            try {
                const response = await fetch(`${relayerUrl}/transaction/${txId}`);
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(`Transaction status error: ${JSON.stringify(result)}`);
                }
                
                return result;
            } catch (error) {
                console.error('waitForTransaction error:', error);
                throw error;
            }
        },
        checkRelayerStatus: async () => {
            try {
                const response = await fetch(`${relayerUrl}/check-relayer`);
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(`Relayer check error: ${JSON.stringify(result)}`);
                }
                
                return result;
            } catch (error) {
                console.error('checkRelayerStatus error:', error);
                throw error;
            }
        }
    };
}

module.exports = { createGaslessSDK }; 