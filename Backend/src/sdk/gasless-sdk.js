import { ethers } from 'ethers';

export class GaslessSDK {
    constructor(config) {
        this.config = {
            relayerUrl: config.relayerUrl || 'http://localhost:3000',
            network: config.network || 'amoy',
            contractAddress: config.contractAddress,
            provider: config.provider,
            signer: config.signer,
            ...config
        };
        
        this.contractABI = [
            "function executeMetaTransaction(address userAddress, bytes functionSignature, bytes32 sigR, bytes32 sigS, uint8 sigV) payable returns (bytes)",
            "function nonces(address owner) view returns (uint256)",
            "function DOMAIN_SEPARATOR() view returns (bytes32)",
            "function name() view returns (string)",
            "function symbol() view returns (string)",
            "function balanceOf(address) view returns (uint256)",
            "function transfer(address to, uint256 amount) returns (bool)",
            "function approve(address spender, uint256 amount) returns (bool)",
            "function transferFrom(address from, address to, uint256 amount) returns (bool)",
            "function batchTransfer(address[] recipients, uint256[] amounts)",
            "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
            "function getChainId() view returns (uint256)"
        ];
        
        this.contract = new ethers.Contract(
            this.config.contractAddress,
            this.contractABI,
            this.config.provider
        );
    }
    
    async initialize() {
        try {
            this.tokenName = await this.contract.name();
            this.tokenSymbol = await this.contract.symbol();
            this.chainId = await this.contract.getChainId();
            this.domainSeparator = await this.contract.DOMAIN_SEPARATOR();
            
            this.domain = {
                name: this.tokenName,
                version: '1',
                chainId: this.chainId,
                verifyingContract: this.config.contractAddress
            };
            
            this.types = {
                MetaTransaction: [
                    { name: 'nonce', type: 'uint256' },
                    { name: 'from', type: 'address' },
                    { name: 'functionSignature', type: 'bytes' }
                ]
            };
            
            console.log(`GaslessSDK initialized for ${this.tokenName} (${this.tokenSymbol}) on Amoy`);
            return true;
        } catch (error) {
            console.error('Failed to initialize GaslessSDK:', error);
            throw error;
        }
    }
    
    async getNonce(userAddress) {
        if (!userAddress) {
            userAddress = await this.config.signer.getAddress();
        }
        
        try {
            const nonce = await this.contract.nonces(userAddress);
            return parseInt(nonce);
        } catch (error) {
            console.error('Failed to get nonce:', error);
            throw error;
        }
    }
    
    async createMetaTransaction(functionName, params, userAddress) {
        if (!userAddress) {
            userAddress = await this.config.signer.getAddress();
        }
        
        try {
            const nonce = await this.getNonce(userAddress);
            
            const functionSignature = this.contract.interface.encodeFunctionData(
                functionName,
                params
            );
            
            const metaTxData = {
                nonce,
                from: userAddress,
                functionSignature
            };
            
            const signature = await this.config.signer.signTypedData(
                this.domain,
                this.types,
                metaTxData
            );
            
            const sig = ethers.Signature.from(signature);
            
            return {
                contractAddress: this.config.contractAddress,
                userAddress,
                functionSignature,
                r: sig.r,
                s: sig.s,
                v: sig.v,
                signature,
                nonce,
                network: this.config.network
            };
        } catch (error) {
            console.error('Failed to create meta transaction:', error);
            throw error;
        }
    }
    
    async estimateFee(metaTx) {
        try {
            const response = await fetch(`${this.config.relayerUrl}/estimate-fee`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metaTx)
            });
            
            if (!response.ok) {
                throw new Error('Failed to estimate fee');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to estimate fee:', error);
            throw error;
        }
    }
    
    async submitMetaTransaction(metaTx) {
        try {
            const response = await fetch(`${this.config.relayerUrl}/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metaTx)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to submit transaction');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to submit meta transaction:', error);
            throw error;
        }
    }
    
    async getTransactionStatus(txId) {
        try {
            const response = await fetch(`${this.config.relayerUrl}/transaction/${txId}`);
            
            if (!response.ok) {
                throw new Error('Failed to get transaction status');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to get transaction status:', error);
            throw error;
        }
    }
    
    async waitForTransaction(txId, timeout = 300000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const checkStatus = async () => {
                try {
                    const status = await this.getTransactionStatus(txId);
                    
                    if (status.status === 'success' || status.status === 'failed') {
                        resolve(status);
                        return;
                    }
                    
                    if (Date.now() - startTime > timeout) {
                        reject(new Error('Transaction timeout'));
                        return;
                    }
                    
                    setTimeout(checkStatus, 2000);
                } catch (error) {
                    reject(error);
                }
            };
            
            checkStatus();
        });
    }
    
    async transfer(to, amount, userAddress) {
        try {
            console.log(`Initiating gasless transfer: ${amount} to ${to}`);
            
            const metaTx = await this.createMetaTransaction(
                'transfer',
                [to, ethers.parseUnits(amount.toString(), 18)],
                userAddress
            );
            
            const fee = await this.estimateFee(metaTx);
            console.log('Estimated fee:', fee);
            
            const result = await this.submitMetaTransaction(metaTx);
            console.log('Transaction submitted:', result);
            
            return result;
        } catch (error) {
            console.error('Gasless transfer failed:', error);
            throw error;
        }
    }
    
    async approve(spender, amount, userAddress) {
        try {
            console.log(`Initiating gasless approval: ${amount} for ${spender}`);
            
            const metaTx = await this.createMetaTransaction(
                'approve',
                [spender, ethers.parseUnits(amount.toString(), 18)],
                userAddress
            );
            
            const result = await this.submitMetaTransaction(metaTx);
            console.log('Approval submitted:', result);
            
            return result;
        } catch (error) {
            console.error('Gasless approval failed:', error);
            throw error;
        }
    }
    
    async batchTransfer(recipients, amounts, userAddress) {
        try {
            console.log(`Initiating gasless batch transfer to ${recipients.length} recipients`);
            
            const metaTx = await this.createMetaTransaction(
                'batchTransfer',
                [recipients, amounts.map(amount => ethers.parseUnits(amount.toString(), 18))],
                userAddress
            );
            
            const result = await this.submitMetaTransaction(metaTx);
            console.log('Batch transfer submitted:', result);
            
            return result;
        } catch (error) {
            console.error('Gasless batch transfer failed:', error);
            throw error;
        }
    }
    
    async getBalance(userAddress) {
        if (!userAddress) {
            userAddress = await this.config.signer.getAddress();
        }
        
        try {
            const balance = await this.contract.balanceOf(userAddress);
            return this.formatAmount(balance);
        } catch (error) {
            console.error('Failed to get balance:', error);
            throw error;
        }
    }
    
    async getNetworkStatus() {
        try {
            const response = await fetch(`${this.config.relayerUrl}/status/${this.config.network}`);
            
            if (!response.ok) {
                throw new Error('Failed to get network status');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Failed to get network status:', error);
            throw error;
        }
    }
    
    formatAmount(amount, decimals = 18) {
        return ethers.formatUnits(amount, decimals);
    }
    
    parseAmount(amount, decimals = 18) {
        return ethers.parseUnits(amount.toString(), decimals);
    }
}

export async function createGaslessSDK(config) {
    const sdk = new GaslessSDK(config);
    await sdk.initialize();
    return sdk;
}

export function useGaslessSDK(config) {
    const [sdk, setSdk] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    useEffect(() => {
        const initSDK = async () => {
            try {
                setLoading(true);
                const gaslessSDK = await createGaslessSDK(config);
                setSdk(gaslessSDK);
                setError(null);
            } catch (err) {
                setError(err);
                console.error('Failed to initialize gasless SDK:', err);
            } finally {
                setLoading(false);
            }
        };
        
        if (config.contractAddress && config.provider && config.signer) {
            initSDK();
        }
    }, [config.contractAddress, config.provider, config.signer]);
    
    return { sdk, loading, error };
}

export const example = {
    async basicUsage() {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        const sdk = await createGaslessSDK({
            relayerUrl: 'http://localhost:3000',
            network: 'amoy',
            contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
            provider,
            signer
        });
        
        const balance = await sdk.getBalance();
        console.log('Balance:', balance);
        
        const result = await sdk.transfer(
            '0x1234567890123456789012345678901234567890',
            '10'
        );
        
        const finalStatus = await sdk.waitForTransaction(result.txId);
        console.log('Transfer completed:', finalStatus);
    },
    
    async reactUsage() {
        const { sdk, loading, error } = useGaslessSDK({
            relayerUrl: 'http://localhost:3000',
            network: 'amoy',
            contractAddress: process.env.AMOY_CONTRACT_ADDRESS,
            provider: provider,
            signer: signer
        });
        
        if (loading) return <div>Loading...</div>;
        if (error) return <div>Error: {error.message}</div>;
        
        const handleTransfer = async () => {
            try {
                const result = await sdk.transfer(recipientAddress, amount);
                console.log('Transfer initiated:', result);
            } catch (error) {
                console.error('Transfer failed:', error);
            }
        };
    }
};
