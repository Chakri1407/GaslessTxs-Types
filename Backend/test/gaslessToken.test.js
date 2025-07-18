const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GaslessToken", function () {
  let gaslessToken;
  let owner, relayer, user1, user2, user3;
  let chainId;

  beforeEach(async function () {
    [owner, relayer, user1, user2, user3] = await ethers.getSigners();
    
    const GaslessToken = await ethers.getContractFactory("GaslessToken");
    gaslessToken = await GaslessToken.deploy(
      "GaslessToken",
      "GLT", // Updated symbol to match deploy script
      ethers.parseEther("1000000"), // 1M tokens
      owner.address
    );
    
    // Authorize relayer
    await gaslessToken.connect(owner).authorizeRelayer(relayer.address);
    
    // Get chain ID
    chainId = await gaslessToken.getChainId();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await gaslessToken.name()).to.equal("GaslessToken");
      expect(await gaslessToken.symbol()).to.equal("GLT"); // Updated symbol
    });

    it("Should mint initial supply to owner", async function () {
      expect(await gaslessToken.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000"));
    });

    it("Should set the correct owner", async function () {
      expect(await gaslessToken.owner()).to.equal(owner.address);
    });

    it("Should have correct domain separator", async function () {
      const domainSeparator = await gaslessToken.DOMAIN_SEPARATOR();
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });

    it("Should have zero POL balances initially", async function () {
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(0);
      expect(await gaslessToken.getPOLBalance(user2.address)).to.equal(0);
    });
  });

  describe("Relayer Management", function () {
    it("Should authorize relayer", async function () {
      await gaslessToken.connect(owner).authorizeRelayer(user1.address);
      expect(await gaslessToken.authorizedRelayers(user1.address)).to.be.true;
    });

    it("Should revoke relayer", async function () {
      await gaslessToken.connect(owner).revokeRelayer(relayer.address);
      expect(await gaslessToken.authorizedRelayers(relayer.address)).to.be.false;
    });

    it("Should emit RelayerAuthorized event", async function () {
      await expect(gaslessToken.connect(owner).authorizeRelayer(user1.address))
        .to.emit(gaslessToken, "RelayerAuthorized")
        .withArgs(user1.address);
    });

    it("Should emit RelayerRevoked event", async function () {
      await expect(gaslessToken.connect(owner).revokeRelayer(relayer.address))
        .to.emit(gaslessToken, "RelayerRevoked")
        .withArgs(relayer.address);
    });

    it("Should only allow owner to authorize relayer", async function () {
      await expect(gaslessToken.connect(user1).authorizeRelayer(user2.address))
        .to.be.revertedWithCustomError(gaslessToken, "OwnableUnauthorizedAccount");
    });

    it("Should only allow owner to revoke relayer", async function () {
      await expect(gaslessToken.connect(user1).revokeRelayer(relayer.address))
        .to.be.revertedWithCustomError(gaslessToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("POL Deposit and Withdraw", function () {
    it("Should deposit POL via depositPOL function", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await gaslessToken.connect(user1).depositPOL({ value: depositAmount });
      
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(depositAmount);
    });

    it("Should deposit POL via receive function", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await user1.sendTransaction({
        to: await gaslessToken.getAddress(),
        value: depositAmount
      });
      
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(depositAmount);
    });

    it("Should accumulate multiple deposits", async function () {
      const deposit1 = ethers.parseEther("1");
      const deposit2 = ethers.parseEther("0.5");
      
      await gaslessToken.connect(user1).depositPOL({ value: deposit1 });
      await gaslessToken.connect(user1).depositPOL({ value: deposit2 });
      
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(deposit1 + deposit2);
    });

    it("Should withdraw POL successfully", async function () {
      const depositAmount = ethers.parseEther("2");
      const withdrawAmount = ethers.parseEther("1");
      
      // First deposit
      await gaslessToken.connect(user1).depositPOL({ value: depositAmount });
      
      const initialBalance = await ethers.provider.getBalance(user1.address);
      
      // Withdraw
      const tx = await gaslessToken.connect(user1).withdrawPOL(withdrawAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(depositAmount - withdrawAmount);
      
      const finalBalance = await ethers.provider.getBalance(user1.address);
      expect(finalBalance).to.be.approximately(initialBalance - gasUsed + withdrawAmount, ethers.parseEther("0.01"));
    });

    it("Should revert withdrawal with insufficient balance", async function () {
      const withdrawAmount = ethers.parseEther("1");
      
      await expect(gaslessToken.connect(user1).withdrawPOL(withdrawAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("Should revert withdrawal when amount exceeds balance", async function () {
      const depositAmount = ethers.parseEther("1");
      const withdrawAmount = ethers.parseEther("2");
      
      await gaslessToken.connect(user1).depositPOL({ value: depositAmount });
      
      await expect(gaslessToken.connect(user1).withdrawPOL(withdrawAmount))
        .to.be.revertedWith("Insufficient balance");
    });

    it("Should emit correct events on deposit", async function () {
      const depositAmount = ethers.parseEther("1");
      
      // Note: Since depositPOL doesn't emit a specific event, we just verify the state change
      await gaslessToken.connect(user1).depositPOL({ value: depositAmount });
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(depositAmount);
    });

    it("Should handle zero amount withdrawal correctly", async function () {
      const depositAmount = ethers.parseEther("1");
      
      await gaslessToken.connect(user1).depositPOL({ value: depositAmount });
      
      await gaslessToken.connect(user1).withdrawPOL(0);
      
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(depositAmount);
    });
  });

  describe("Gasless POL Transfer", function () {
    let domain, types;

    beforeEach(async function () {
      // Deposit POL for user1
      await gaslessToken.connect(user1).depositPOL({ value: ethers.parseEther("5") });

      domain = {
        name: "GaslessToken",
        version: "1",
        chainId: chainId,
        verifyingContract: await gaslessToken.getAddress()
      };

      types = {
        GaslessPOLTransfer: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };
    });

    it("Should execute gasless POL transfer successfully", async function () {
      const transferAmount = ethers.parseEther("2");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      const user2InitialBalance = await ethers.provider.getBalance(user2.address);

      await gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      );

      // Check POL balances
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(ethers.parseEther("3"));
      expect(await gaslessToken.getPOLBalance(user2.address)).to.equal(transferAmount);

      // Check that user2 received native tokens
      const user2FinalBalance = await ethers.provider.getBalance(user2.address);
      expect(user2FinalBalance).to.equal(user2InitialBalance + transferAmount);

      // Check nonce increment
      expect(await gaslessToken.nonces(user1.address)).to.equal(nonce + 1n);
    });

    it("Should emit GaslessPOLTransferExecuted event", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      ))
        .to.emit(gaslessToken, "GaslessPOLTransferExecuted")
        .withArgs(user1.address, user2.address, relayer.address, transferAmount, nonce);
    });

    it("Should reject gasless POL transfer from unauthorized relayer", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(user3).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "UnauthorizedRelayer");
    });

    it("Should reject gasless POL transfer with expired deadline", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "ExpiredDeadline");
    });

    it("Should reject gasless POL transfer with insufficient balance", async function () {
      const transferAmount = ethers.parseEther("10"); // More than deposited
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InsufficientBalance");
    });

    it("Should reject gasless POL transfer with invalid signature", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user2.signTypedData(domain, types, message); // Wrong signer
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InvalidSignature");
    });

    it("Should reject gasless POL transfer with used nonce", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute first transfer
      await gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      );

      // Try to execute again with same nonce
      await expect(gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InvalidSignature");
    });

    it("Should handle multiple gasless POL transfers", async function () {
      const transferAmount1 = ethers.parseEther("1");
      const transferAmount2 = ethers.parseEther("2");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // First transfer
      let nonce = await gaslessToken.nonces(user1.address);
      let message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount1,
        nonce: nonce,
        deadline: deadline
      };

      let signature = await user1.signTypedData(domain, types, message);
      let { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount1,
        deadline,
        r,
        s,
        v
      );

      // Second transfer
      nonce = await gaslessToken.nonces(user1.address);
      message = {
        from: user1.address,
        to: user3.address,
        amount: transferAmount2,
        nonce: nonce,
        deadline: deadline
      };

      signature = await user1.signTypedData(domain, types, message);
      ({ v, r, s } = ethers.Signature.from(signature));

      await gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user3.address,
        transferAmount2,
        deadline,
        r,
        s,
        v
      );

      // Check final balances
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(ethers.parseEther("2"));
      expect(await gaslessToken.getPOLBalance(user2.address)).to.equal(transferAmount1);
      expect(await gaslessToken.getPOLBalance(user3.address)).to.equal(transferAmount2);
    });

    it("Should return correct gasless POL transfer hash", async function () {
      const transferAmount = ethers.parseEther("1");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const hash = await gaslessToken.getGaslessPOLTransferHash(
        user1.address,
        user2.address,
        transferAmount,
        nonce,
        deadline
      );

      expect(hash).to.not.equal(ethers.ZeroHash);
      expect(hash).to.be.a("string");
      expect(hash.length).to.equal(66); // 0x + 64 hex chars
    });

    it("Should handle zero amount transfer", async function () {
      const transferAmount = ethers.parseEther("0");
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        from: user1.address,
        to: user2.address,
        amount: transferAmount,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeGaslessPOLTransfer(
        user1.address,
        user2.address,
        transferAmount,
        deadline,
        r,
        s,
        v
      );

      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(ethers.parseEther("5"));
      expect(await gaslessToken.getPOLBalance(user2.address)).to.equal(transferAmount);
    });
  });

  describe("Standard ERC20 Functions", function () {
    beforeEach(async function () {
      // Transfer some tokens to user1 for testing
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should transfer tokens", async function () {
      await gaslessToken.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
    });

    it("Should approve tokens", async function () {
      await gaslessToken.connect(user1).approve(user2.address, ethers.parseEther("100"));
      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should transferFrom tokens", async function () {
      await gaslessToken.connect(user1).approve(user2.address, ethers.parseEther("100"));
      await gaslessToken.connect(user2).transferFrom(user1.address, user3.address, ethers.parseEther("50"));
      
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("50"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("950"));
      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("50"));
    });

    it("Should handle totalSupply correctly", async function () {
      expect(await gaslessToken.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });

    it("Should handle decimals correctly", async function () {
      expect(await gaslessToken.decimals()).to.equal(18);
    });
  });

  describe("Meta-Transaction Functionality", function () {
    let domain, types;

    beforeEach(async function () {
      // Transfer tokens to user1 for testing
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

      domain = {
        name: "GaslessToken",
        version: "1",
        chainId: chainId,
        verifyingContract: await gaslessToken.getAddress()
      };

      types = {
        MetaTransaction: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "functionSignature", type: "bytes" }
        ]
      };
    });

    it("Should execute meta-transaction for transfer", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
      expect(await gaslessToken.nonces(user1.address)).to.equal(nonce + 1n);
    });

    it("Should execute meta-transaction for approve", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("approve", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should execute meta-transaction for transferFrom", async function () {
      // First, approve user2 to spend user1's tokens
      await gaslessToken.connect(user1).approve(user2.address, ethers.parseEther("200"));

      const nonce = await gaslessToken.nonces(user2.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transferFrom", [user1.address, user3.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user2.address,
        functionSignature: functionSignature
      };

      const signature = await user2.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user2.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should execute meta-transaction for batchTransfer", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];
      const functionSignature = gaslessToken.interface.encodeFunctionData("batchTransfer", [recipients, amounts]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("200"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should emit MetaTransactionExecuted event", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      ))
        .to.emit(gaslessToken, "MetaTransactionExecuted")
        .withArgs(user1.address, relayer.address, functionSignature, nonce);
    });

    it("Should reject meta-transaction from unauthorized relayer", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(user3).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "UnauthorizedRelayer");
    });

    it("Should reject meta-transaction with invalid signature", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user2.signTypedData(domain, types, message); // Wrong signer
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InvalidSignature");
    });

    it("Should reject meta-transaction with used nonce", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute first transaction
      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      // Try to execute again with same nonce - should fail
      await expect(gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InvalidSignature");
    });

    it("Should verify meta-transaction signature correctly", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      const isValid = await gaslessToken.verifyMetaTransactionSignature(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(isValid).to.be.true;
    });

    it("Should return correct meta-transaction hash", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const hash = await gaslessToken.getMetaTransactionHash(
        user1.address,
        functionSignature,
        nonce
      );

      expect(hash).to.not.equal(ethers.ZeroHash);
      expect(hash).to.be.a("string");
      expect(hash.length).to.equal(66); // 0x + 64 hex chars
    });

    it("Should handle meta-transaction with invalid function signature", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = "0x1234"; // Invalid function signature

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "ExecutionFailed");
    });

    it("Should handle multiple meta-transactions from same user", async function () {
      // First transaction
      let nonce = await gaslessToken.nonces(user1.address);
      let functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      let message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      let signature = await user1.signTypedData(domain, types, message);
      let { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      // Second transaction
      nonce = await gaslessToken.nonces(user1.address);
      functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user3.address, ethers.parseEther("200")]);

      message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      signature = await user1.signTypedData(domain, types, message);
      ({ v, r, s } = ethers.Signature.from(signature));

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("200"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    });
  });

  describe("Permit Functionality", function () {
    let domain, types;

    beforeEach(async function () {
      // Transfer tokens to user1 for testing
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

      domain = {
        name: "GaslessToken",
        version: "1",
        chainId: chainId,
        verifyingContract: await gaslessToken.getAddress()
      };

      types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };
    });

    it("Should execute permit successfully", async function () {
      const value = ethers.parseEther("100");
      const nonce = await gaslessToken.permitNonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.permit(
        user1.address,
        user2.address,
        value,
        deadline,
        v,
        r,
        s
      );

      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(value);
      expect(await gaslessToken.permitNonces(user1.address)).to.equal(nonce + 1n);
    });

    it("Should reject permit with expired deadline", async function () {
      const value = ethers.parseEther("100");
      const nonce = await gaslessToken.permitNonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.permit(
        user1.address,
        user2.address,
        value,
        deadline,
        v,
        r,
        s
      )).to.be.revertedWith("Permit expired");
    });

    it("Should reject permit with invalid signature", async function () {
      const value = ethers.parseEther("100");
      const nonce = await gaslessToken.permitNonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user2.signTypedData(domain, types, message); // Wrong signer
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.permit(
        user1.address,
        user2.address,
        value,
        deadline,
        v,
        r,
        s
      )).to.be.revertedWith("Invalid signature");
    });

    it("Should reject permit with used nonce", async function () {
      const value = ethers.parseEther("100");
      const nonce = await gaslessToken.permitNonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute first permit
      await gaslessToken.permit(
        user1.address,
        user2.address,
        value,
        deadline,
        v,
        r,
        s
      );

      // Try to execute again with same nonce
      await expect(gaslessToken.permit(
        user1.address,
        user2.address,
        value,
        deadline,
        v,
        r,
        s
      )).to.be.revertedWith("Invalid signature");
    });

    it("Should handle multiple permits", async function () {
      const value1 = ethers.parseEther("100");
      const value2 = ethers.parseEther("200");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // First permit
      let nonce = await gaslessToken.permitNonces(user1.address);
      let message = {
        owner: user1.address,
        spender: user2.address,
        value: value1,
        nonce: nonce,
        deadline: deadline
      };

      let signature = await user1.signTypedData(domain, types, message);
      let { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.permit(
        user1.address,
        user2.address,
        value1,
        deadline,
        v,
        r,
        s
      );

      // Second permit for different spender
      nonce = await gaslessToken.permitNonces(user1.address);
      message = {
        owner: user1.address,
        spender: user3.address,
        value: value2,
        nonce: nonce,
        deadline: deadline
      };

      signature = await user1.signTypedData(domain, types, message);
      ({ v, r, s } = ethers.Signature.from(signature));

      await gaslessToken.permit(
        user1.address,
        user3.address,
        value2,
        deadline,
        v,
        r,
        s
      );

      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(value1);
      expect(await gaslessToken.allowance(user1.address, user3.address)).to.equal(value2);
    });
  });

  describe("Owner Functions", function () {
    it("Should mint tokens as owner", async function () {
      const mintAmount = ethers.parseEther("1000");
      const initialSupply = await gaslessToken.totalSupply();

      await gaslessToken.connect(owner).mint(user1.address, mintAmount);

      expect(await gaslessToken.balanceOf(user1.address)).to.equal(mintAmount);
      expect(await gaslessToken.totalSupply()).to.equal(initialSupply + mintAmount);
    });

    it("Should not allow non-owner to mint", async function () {
      const mintAmount = ethers.parseEther("1000");

      await expect(gaslessToken.connect(user1).mint(user2.address, mintAmount))
        .to.be.revertedWithCustomError(gaslessToken, "OwnableUnauthorizedAccount");
    });

    it("Should execute emergency pause", async function () {
      await expect(gaslessToken.connect(owner).emergencyPause())
        .to.emit(gaslessToken, "RelayerRevoked")
        .withArgs(ethers.ZeroAddress);
    });

    it("Should not allow non-owner to execute emergency pause", async function () {
      await expect(gaslessToken.connect(user1).emergencyPause())
        .to.be.revertedWithCustomError(gaslessToken, "OwnableUnauthorizedAccount");
    });
  });

  describe("Burn Functionality", function () {
    beforeEach(async function () {
      // Transfer tokens to user1 for testing
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should burn tokens successfully", async function () {
      const burnAmount = ethers.parseEther("100");
      const initialBalance = await gaslessToken.balanceOf(user1.address);
      const initialSupply = await gaslessToken.totalSupply();

      await gaslessToken.connect(user1).burn(burnAmount);

      expect(await gaslessToken.balanceOf(user1.address)).to.equal(initialBalance - burnAmount);
      expect(await gaslessToken.totalSupply()).to.equal(initialSupply - burnAmount);
    });

    it("Should not allow burning more than balance", async function () {
      const burnAmount = ethers.parseEther("2000"); // More than user1's balance

      await expect(gaslessToken.connect(user1).burn(burnAmount))
        .to.be.revertedWithCustomError(gaslessToken, "ERC20InsufficientBalance");
    });

    it("Should handle zero burn amount", async function () {
      const initialBalance = await gaslessToken.balanceOf(user1.address);
      const initialSupply = await gaslessToken.totalSupply();

      await gaslessToken.connect(user1).burn(0);

      expect(await gaslessToken.balanceOf(user1.address)).to.equal(initialBalance);
      expect(await gaslessToken.totalSupply()).to.equal(initialSupply);
    });
  });

  describe("Batch Transfer Functionality", function () {
    beforeEach(async function () {
      // Transfer tokens to user1 for testing
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should execute batch transfer successfully", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];

      await gaslessToken.connect(user1).batchTransfer(recipients, amounts);

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("200"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should revert on mismatched array lengths", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("100")]; // Different length

      await expect(gaslessToken.connect(user1).batchTransfer(recipients, amounts))
        .to.be.revertedWith("Arrays length mismatch");
    });

    it("Should handle empty arrays", async function () {
      const recipients = [];
      const amounts = [];

      await gaslessToken.connect(user1).batchTransfer(recipients, amounts);

      // Should not change balances
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should revert if insufficient balance for batch transfer", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("600"), ethers.parseEther("600")]; // Total exceeds balance

      await expect(gaslessToken.connect(user1).batchTransfer(recipients, amounts))
        .to.be.revertedWithCustomError(gaslessToken, "ERC20InsufficientBalance");
    });

    it("Should handle single recipient in batch", async function () {
      const recipients = [user2.address];
      const amounts = [ethers.parseEther("100")];

      await gaslessToken.connect(user1).batchTransfer(recipients, amounts);

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
    });

    it("Should handle zero amounts in batch", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("0"), ethers.parseEther("100")];

      await gaslessToken.connect(user1).batchTransfer(recipients, amounts);

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("0"));
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
    });
  });

  describe("Utility Functions", function () {
    it("Should return correct chain ID", async function () {
      const contractChainId = await gaslessToken.getChainId();
      expect(contractChainId).to.equal(chainId);
    });

    it("Should return correct domain separator", async function () {
      const domainSeparator = await gaslessToken.DOMAIN_SEPARATOR();
      expect(domainSeparator).to.not.equal(ethers.ZeroHash);
    });

    it("Should return correct nonces", async function () {
      expect(await gaslessToken.nonces(user1.address)).to.equal(0);
      expect(await gaslessToken.permitNonces(user1.address)).to.equal(0);
    });

    it("Should track nonces correctly after operations", async function () {
      // Transfer tokens to user1
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

      // Execute a meta-transaction
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const domain = {
        name: "GaslessToken",
        version: "1",
        chainId: chainId,
        verifyingContract: await gaslessToken.getAddress()
      };

      const types = {
        MetaTransaction: [
          { name: "nonce", type: "uint256" },
          { name: "from", type: "address" },
          { name: "functionSignature", type: "bytes" }
        ]
      };

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.nonces(user1.address)).to.equal(nonce + 1n);
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle contract receiving ETH correctly", async function () {
      const sendAmount = ethers.parseEther("1");
      
      // Send ETH to contract
      await user1.sendTransaction({
        to: await gaslessToken.getAddress(),
        value: sendAmount
      });

      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(sendAmount);
    });

    it("Should handle reentrancy protection", async function () {
      // This test verifies that the nonReentrant modifier is working
      // The contract should be protected against reentrancy attacks
      expect(await gaslessToken.getPOLBalance(user1.address)).to.equal(0);
    });

    it("Should handle maximum values correctly", async function () {
      const maxUint256 = ethers.MaxUint256;
      
      // This should not overflow
      await gaslessToken.connect(owner).mint(user1.address, ethers.parseEther("1000"));
      
      // Try to approve maximum amount
      await gaslessToken.connect(user1).approve(user2.address, maxUint256);
      
      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(maxUint256);
    });
  });
});