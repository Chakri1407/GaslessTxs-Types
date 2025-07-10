const { buildModule } = require("@nomicfoundation/ignition-core");
const { ethers } = require("hardhat");

module.exports = buildModule("GaslessTxModule", (m) => {
  const stakeToken = m.contract("StakeToken", [ethers.parseEther("1000000")]);
  const relayHub = m.contract("RelayHub", []);
  const minimalForwarder = m.contract("MinimalForwarder", []);
  const acceptEverythingPaymaster = m.contract("AcceptEverythingPaymaster", [relayHub]);
  
  const metaTransaction = m.contract("MetaTransaction", []);
  
  return {
    stakeToken,
    relayHub,
    minimalForwarder,
    acceptEverythingPaymaster,
    metaTransaction,
  };
}); 