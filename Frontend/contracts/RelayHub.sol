// SPDX-License-Identifier: MIT 
pragma solidity ^0.8.0;

contract RelayHub {
    address public owner;
    mapping(address => uint256) public stakes;
    mapping(address => bool) public registeredRelays;

    event Staked(address indexed relayer, uint256 amount);
    event RelayRegistered(address indexed relayer);
    event RelayUnregistered(address indexed relayer);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function stake(uint256 amount) external payable {
        require(msg.value == amount, "Incorrect stake amount");
        stakes[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }

    function registerRelay() external {
        require(stakes[msg.sender] > 0, "No stake");
        registeredRelays[msg.sender] = true;
        emit RelayRegistered(msg.sender);
    }

    function unregisterRelay() external {
        require(registeredRelays[msg.sender], "Not registered");
        registeredRelays[msg.sender] = false;
        emit RelayUnregistered(msg.sender);
    }

    receive() external payable {}
} 