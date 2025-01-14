# Verus Web Wallet Extension

### 🚀 Support Development
This project is under active development. Help us reach our goal of 3k to 4K VRSC!

**VRSC:** `RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5`

![Donation QR Code](https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5)

---

I would also love contributions from developers so that we can really make this extension a truly game changer for Layer 1 chains we will have open bounties and hopefully will have multiple minds contributing to it

The goal is to make a full fledge browser extension wallet for Verus cryptocurrency that enables secure transactions and wallet management directly from your browser.

## 🎯 Development Goals

### Current Achievements

- ✅ Connection with dApps and getting wallet address and balance
- ✅ Basic wallet creation and management
- ✅ Receive Testnet Currencies and VRSCTEST transactions
- ✅ Send VRSCTEST
- ✅ Secure key storage
- ✅ Transaction History
- ✅ Clean and Intuitive UI

### Next Milestone
- 🔄 MetaMask-style transaction signing UI.
- 🔄 Added NFT Suppport.
- 🔄 Any to Any Swap on Verus Blockchain.
- 🔄 Support for main net with enhanced testing.
- 🔄 Multi wallet feature.
- 📍 VerusID support
- 📍 Integrate Defi LLAMA

Your suport can help accelerate development and bring these features to life! 🚀


## Installation

1. Clone the repository:
```bash
git clone https://github.com/iamahmedshahh/veruswebwallet.git
cd veruswebwallet
```

2. Install dependencies:
```bash
yarn install
```

3. Build the extension:
```bash
yarn build or npm run build
```

4. Load the extension in your browser:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

## Integrating with Your Web Application

To integrate the Verus Web Wallet with your web application, you can use the following code snippet:


## SEE the HOOKS Folder for a sample JS file 

```javascript
// Check if Verus Wallet extension is installed
const checkVerusWallet = () => {
  if (typeof window.verusWallet !== 'undefined') {
    return true;
  }
  return false;
};

// Connect to the wallet
async function connectWallet() {
  if (!checkVerusWallet()) {
    throw new Error('Verus Wallet extension is not installed');
  }
  
  try {
    // Request wallet connection
    const response = await window.verusWallet.connect();
    
    // Get the connected address
    const address = await window.verusWallet.getAddress();
    return address;
  } catch (error) {
    console.error('Failed to connect to Verus Wallet:', error);
    throw error;
  }
}

```

## Development

- `yarn build` - Build extension
- `yarn test` - Run tests this folder contains the test wallet creation that creates a wallet address returning the memonic phrase Raddress and private key

## Security

- Never share your private keys
- Always verify transaction details before signing
- The extension never stores private keys in plain text

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
