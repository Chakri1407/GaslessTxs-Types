
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ignition");
require("dotenv").config();

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
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/fgPCE8UqEyFS3PnmIvAz6",
      accounts: [process.env.AMOY_RELAYER_PRIVATE_KEY],
      chainId: 80002,
      gasPrice: "auto",
      gas: 5000000
    }
  },
  etherscan: {
    apiKey: {
      amoy: process.env.POLYGONSCAN_API_KEY
    },
    customChains: [
      {
        network: "amoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
