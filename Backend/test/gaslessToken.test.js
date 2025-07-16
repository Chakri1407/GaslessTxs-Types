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

      // Try to execute again with same nonce
      await expect(gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      )).to.be.revertedWithCustomError(gaslessToken, "InvalidSignature");
    });
  });

  describe("Batch Transfer", function () {
    beforeEach(async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should batch transfer tokens", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];

      await gaslessToken.connect(user1).batchTransfer(recipients, amounts);

      expect(await gaslessToken.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user3.address)).to.equal(ethers.parseEther("200"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should revert on array length mismatch", async function () {
      const recipients = [user2.address, user3.address];
      const amounts = [ethers.parseEther("100")]; // Different length

      await expect(gaslessToken.connect(user1).batchTransfer(recipients, amounts))
        .to.be.revertedWith("Arrays length mismatch");
    });
  });

  describe("Permit Functionality", function () {
    let domain, types;

    beforeEach(async function () {
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

    it("Should permit approval via signature", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: ethers.parseEther("100"),
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(user2).permit(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        deadline,
        v,
        r,
        s
      );

      expect(await gaslessToken.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should reject expired permit", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: ethers.parseEther("100"),
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(user2).permit(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        deadline,
        v,
        r,
        s
      )).to.be.revertedWith("Permit expired");
    });

    it("Should reject permit with invalid signature", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: ethers.parseEther("100"),
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user2.signTypedData(domain, types, message); // Wrong signer
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(gaslessToken.connect(user2).permit(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        deadline,
        v,
        r,
        s
      )).to.be.revertedWith("Invalid signature");
    });

    it("Should increment nonce after permit", async function () {
      const nonce = await gaslessToken.nonces(user1.address);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const message = {
        owner: user1.address,
        spender: user2.address,
        value: ethers.parseEther("100"),
        nonce: nonce,
        deadline: deadline
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await gaslessToken.connect(user2).permit(
        user1.address,
        user2.address,
        ethers.parseEther("100"),
        deadline,
        v,
        r,
        s
      );

      expect(await gaslessToken.nonces(user1.address)).to.equal(nonce + 1n);
    });
  });

  describe("Owner Functions", function () {
    it("Should mint tokens", async function () {
      const initialBalance = await gaslessToken.balanceOf(user1.address);
      await gaslessToken.connect(owner).mint(user1.address, ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(initialBalance + ethers.parseEther("100"));
    });

    it("Should only allow owner to mint", async function () {
      await expect(gaslessToken.connect(user1).mint(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(gaslessToken, "OwnableUnauthorizedAccount");
    });

    it("Should emit emergency pause event", async function () {
      await expect(gaslessToken.connect(owner).emergencyPause())
        .to.emit(gaslessToken, "RelayerRevoked")
        .withArgs(ethers.ZeroAddress);
    });
  });

  describe("Burn Functionality", function () {
    beforeEach(async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
    });

    it("Should burn tokens", async function () {
      const initialBalance = await gaslessToken.balanceOf(user1.address);
      await gaslessToken.connect(user1).burn(ethers.parseEther("100"));
      expect(await gaslessToken.balanceOf(user1.address)).to.equal(initialBalance - ethers.parseEther("100"));
    });

    it("Should burn tokens via meta-transaction", async function () {
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

      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("burn", [ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user1.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      const initialBalance = await gaslessToken.balanceOf(user1.address);
      
      await gaslessToken.connect(relayer).executeMetaTransaction(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(await gaslessToken.balanceOf(user1.address)).to.equal(initialBalance - ethers.parseEther("100"));
    });
  });

  describe("Nonce Management", function () {
    it("Should return correct nonce", async function () {
      expect(await gaslessToken.nonces(user1.address)).to.equal(0);
    });

    it("Should increment nonce after meta-transaction", async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));

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

      expect(await gaslessToken.nonces(user1.address)).to.equal(nonce + 1n);
    });

    it("Should have different nonces for different users", async function () {
      expect(await gaslessToken.nonces(user1.address)).to.equal(0);
      expect(await gaslessToken.nonces(user2.address)).to.equal(0);
      expect(await gaslessToken.nonces(user3.address)).to.equal(0);
    });
  });

  describe("Chain ID", function () {
    it("Should return correct chain ID", async function () {
      const contractChainId = await gaslessToken.getChainId();
      const networkChainId = (await ethers.provider.getNetwork()).chainId;
      expect(contractChainId).to.equal(networkChainId);
    });
  });

  describe("Helper Functions", function () {
    it("Should return correct meta-transaction hash", async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
      
      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const hash = await gaslessToken.getMetaTransactionHash(
        user1.address,
        functionSignature,
        nonce
      );

      expect(hash).to.not.equal(ethers.ZeroHash);
    });

    it("Should verify meta-transaction signature", async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
      
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

    it("Should reject invalid meta-transaction signature", async function () {
      await gaslessToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
      
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

      const nonce = await gaslessToken.nonces(user1.address);
      const functionSignature = gaslessToken.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("100")]);

      const message = {
        nonce: nonce,
        from: user1.address,
        functionSignature: functionSignature
      };

      const signature = await user2.signTypedData(domain, types, message); // Wrong signer
      const { v, r, s } = ethers.Signature.from(signature);

      const isValid = await gaslessToken.verifyMetaTransactionSignature(
        user1.address,
        functionSignature,
        r,
        s,
        v
      );

      expect(isValid).to.be.false;
    });

    it("Should return correct permitNonces", async function () {
      expect(await gaslessToken.permitNonces(user1.address)).to.equal(0);
      expect(await gaslessToken.nonces(user1.address)).to.equal(0);
    });
  });
}); 