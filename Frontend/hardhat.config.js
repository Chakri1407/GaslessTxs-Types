require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ignition");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    amoy: {
      url: process.env.RPC_URL || "https://polygon-amoy.g.alchemy.com/v2/fgPCE8UqEyFS3PnmIvAz6", 
      accounts: [process.env.PRIVATE_KEY],
      chainId: 80002
    }
  }
}; 