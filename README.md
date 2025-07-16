# Gasless Transaction POC – Backend

This backend powers a **gasless transaction system** for Ethereum-compatible blockchains. It supports meta-transactions, relayer authorization, and advanced ERC-20 features, and is designed for seamless integration with a modern frontend.

---

## 📸 Screenshots

### 1. Gasless Transaction POC UI
![Gasless Transaction POC UI](https://github.com/Chakri1407/GaslessTxs-Types/blob/master/Backend/ss/Screenshot%202025-07-16%20101624.png)
*The frontend interface for configuring, testing, and diagnosing gasless transactions. The backend provides the API and smart contract logic for these operations.*

### 2. Test Suite Results
![Test Suite Results](https://github.com/Chakri1407/GaslessTxs-Types/blob/master/Backend/ss/Screenshot%202025-07-16%20054719.png)
*Comprehensive test coverage for meta-transactions, relayer management, ERC-20 operations, and more. All tests passing.*

---

## 🗂️ Folder Structure

```
Backend/
│
├── contracts/                # Solidity smart contracts (GaslessToken.sol)
├── deployments/              # Deployment artifacts (e.g., amoy.json)
├── ignition/
│   └── modules/              # Hardhat Ignition deployment scripts
├── node_modules/             # Dependencies
├── src/
│   └── server/               # Express.js backend server (server.js)
├── test/                     # Mocha/Chai test suite (gaslessToken.test.js)
├── gaslessTxsDiagnosis.html  # Standalone HTML tool for contract diagnostics
├── index.html                # Standalone HTML for POC UI
├── hardhat.config.js         # Hardhat configuration
├── package.json              # Project metadata, scripts, dependencies
└── README.md                 # (This file)
```

---

## 🚀 Features

### Smart Contract: `GaslessToken.sol`
- **ERC-20**: Standard token functionality.
- **Meta-Transactions**: Users can sign transactions off-chain; relayers execute them on-chain.
- **Relayer Authorization**: Only whitelisted relayers can execute meta-transactions.
- **Permit (EIP-2612)**: Gasless approvals via signatures.
- **Batch Transfers**: Send tokens to multiple recipients in one transaction.
- **Mint/Burn**: Owner can mint; any user can burn their tokens.
- **Nonce Management**: Prevents replay attacks for meta-transactions and permits.
- **Events**: Emits events for all critical actions (meta-tx executed, relayer changes, etc).

### Backend Server (`src/server/server.js`)
- **Express.js API**: Handles requests for relaying transactions, diagnostics, and contract interactions.
- **Security**: Uses Helmet, rate limiting, and input validation.
- **Environment Config**: Uses dotenv for environment variables.

### Diagnostics & UI
- **`gaslessTxsDiagnosis.html`**: Visual tool for contract and relayer diagnostics.
- **`index.html`**: Demo UI for configuring and testing gasless transactions.

---

## 🧪 Testing

- **Comprehensive Test Suite**: Located in `test/gaslessToken.test.js`.
- **Coverage**: Meta-transactions, relayer management, ERC-20, batch transfer, permit, mint/burn, nonce, and helper functions.
- **How to Run**:
  ```bash
  npx hardhat test
  ```

*See the screenshot above for a sample of the passing test suite.*

---

## ⚙️ Usage

### Prerequisites
- Node.js v16+
- Yarn or npm
- Hardhat

### Install Dependencies
```bash
cd Backend
npm install
```

### Environment Setup
- Copy `.env.example` to `.env` and fill in your secrets (if required).

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Start Backend Server
```bash
npm run dev
# or
npm start
# or
python -m http.server 8000

```

### Deploy Contracts
```bash
npx hardhat ignition deploy ./ignition/modules/deploy.js --network <network>
```

---

## 📄 Notable Files

- **`contracts/GaslessToken.sol`**: Main smart contract.
- **`src/server/server.js`**: Express backend logic.
- **`test/gaslessToken.test.js`**: Test suite.
- **`gaslessTxsDiagnosis.html`**: Diagnostic tool (open in browser).
- **`index.html`**: Demo UI (open in browser).

---

## 📦 Scripts (from `package.json`)

- `start` – Start the backend server.
- `dev` – Start with nodemon for development.
- `test` – Run the test suite.
- `deploy` – Deploy contracts using Hardhat Ignition.
- `verify` – Verify contracts on Etherscan.

---

## 🛡️ Security

- Only authorized relayers can execute meta-transactions.
- All critical actions are protected by owner checks or signature validation.
- Rate limiting and input validation on backend endpoints.

---

## 📚 References

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat](https://hardhat.org/)
- [EIP-2612: Permit](https://eips.ethereum.org/EIPS/eip-2612)
- [Meta-Transactions](https://docs.openzeppelin.com/contracts/4.x/erc2771)

---

## 📝 License

MIT

---

*For more details, see the code and comments in each file. For frontend integration, see the `Frontend/` folder.*
