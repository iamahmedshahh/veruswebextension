# Verus Web Wallet Extension

### 🚀 Support Development
This project is under active development. Help us reach our goal of 1.5k VRSC!

**Donate VRSC:** `RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5`

![Donation QR Code](https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=RRQHGqgKivuwvWgeWAvTnGg5VJr1aWNRx5)

---

A browser extension wallet for Verus cryptocurrency that enables secure transactions and wallet management directly from your browser.

## 🎯 Development Goals

### Current Achievements

- ✅ Connection with dApps and getting wallet address
- ✅ Basic wallet creation and management
- ✅ Send/receive VRSCTEST transactions
- ✅ Secure key storage


### Next Milestones
- 🔄 MetaMask-style transaction signing UI.
- 🔄 Get balances on dApps and perform sends/converts etc.
- 🔄 Transaction history.
- 🔄 Get balances on dApps etc.
- 🔄 Support for main net with enhanced testing.
- 🔄 Hardware wallet support

### Future Roadmap
- 📍 VerusID support
- 📍 Multi chain support
- 📍 NFT support
- 📍 Create a library specifically for this Extension

Your donations help accelerate development and bring these features to life! 🚀


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
   - Open Chrome/Brave and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` folder

## Integrating with Your Web Application

To integrate the Verus Web Wallet with your web application, you can use the following code snippet:

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

// Send a transaction
async function sendTransaction(toAddress, amount, currency = 'VRSCTEST') {
  try {
    const txParams = {
      to: toAddress,
      amount: amount,
      currency: currency
    };
    
    const txHash = await window.verusWallet.sendCurrency(txParams);
    return txHash;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}
```

### Example Usage

```javascript
// Connect to wallet
document.getElementById('connectButton').addEventListener('click', async () => {
  try {
    const address = await connectWallet();
    console.log('Connected to wallet:', address);
  } catch (error) {
    console.error('Connection failed:', error);
  }
});

// Send transaction
document.getElementById('sendButton').addEventListener('click', async () => {
  try {
    const txHash = await sendTransaction(
      'RAddress...',  // recipient address
      1.0,            // amount
      'VRSCTEST'      // currency
    );
    console.log('Transaction sent:', txHash);
  } catch (error) {
    console.error('Send failed:', error);
  }
});
```

## Development

- `yarn build` - Build extension
- `yarn test` - Run tests this folder contains the test wallet creation that creates a wallet address returning the memonic phrase Raddress and private key

## Security

- Never share your private keys
- Always verify transaction details before signing
- The extension never stores private keys in plain text

## License

[Add your license information here]

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
