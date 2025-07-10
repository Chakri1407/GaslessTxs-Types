pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AcceptEverythingPaymaster is Ownable {
    address public relayHub;
    uint256 public balance;

    constructor(address _relayHub) {
        relayHub = _relayHub;
        transferOwnership(msg.sender);
    }

    function preRelayedCall(bytes calldata context) external view returns (bytes32) {
        return bytes32(0); // Accept all calls
    }

    function postRelayedCall(bytes calldata context, bool success, uint256 gasUse, bytes32) external {
        // No action needed for accept-all paymaster
    }

    receive() external payable {
        balance += msg.value; // Track incoming ETH/MATIC
    }

    function deposit() external payable onlyOwner {
        balance += msg.value; // Allow owner to deposit funds
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(balance >= amount, "Insufficient balance");
        balance -= amount;
        payable(msg.sender).transfer(amount);
    }
} 