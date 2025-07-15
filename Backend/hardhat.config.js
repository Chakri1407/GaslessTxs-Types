require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ignition");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        hardhat: {
            chainId: 1337
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 1337
        },
        amoy: {
            url: process.env.AMOY_RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/fgPCE8UqEyFS3PnmIvAz6",
            accounts: process.env.AMOY_RELAYER_PRIVATE_KEY ? [process.env.AMOY_RELAYER_PRIVATE_KEY] : [],
            chainId: 80002,
            gasPrice: 20000000000, // 20 gwei
            gas: 6000000
        },
        polygon: {
            url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com/",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 137,
            gasPrice: 20000000000, // 20 gwei
            gas: 6000000
        },
        mumbai: {
            url: process.env.MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com/",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
            chainId: 80001,
            gasPrice: 20000000000, // 20 gwei
            gas: 6000000
        }
    },
    etherscan: {
        apiKey: {
            polygon: process.env.POLYGONSCAN_API_KEY,
            polygonMumbai: process.env.POLYGONSCAN_API_KEY
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        cache: "./cache",
        artifacts: "./artifacts"
    }
}; 