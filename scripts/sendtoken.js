const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";

// ERC20 ABI (must match your contract)
const CONTRACT_ABI = [
    // ... (same as your Python ABI above, paste here as JS array)
    // For brevity, only the main functions are included
    {
        "inputs": [
            { "internalType": "string", "name": "name_", "type": "string" },
            { "internalType": "string", "name": "symbol_", "type": "string" },
            { "internalType": "uint8", "name": "decimals_", "type": "uint8" },
            { "internalType": "uint256", "name": "totalSupply_", "type": "uint256" }
        ],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "recipient", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "sendToken",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    }
    // ... add other functions as needed
];

function isValidPrivateKey(key) {
    key = key.trim();
    if (!key.startsWith('0x')) key = '0x' + key;
    return /^0x[a-fA-F0-9]{64}$/.test(key);
}

function loadPrivateKeys(filePath = 'pvkey.txt', addLog) {
    if (!fs.existsSync(filePath)) {
        addLog(`✖ Error: pvkey.txt file not found`);
        fs.writeFileSync(filePath, '# Add private keys here, one per line\n# Example: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n');
        throw new Error('pvkey.txt file not found');
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const validKeys = [];
    lines.forEach((line, idx) => {
        let key = line.trim();
        if (key && !key.startsWith('#')) {
            if (isValidPrivateKey(key)) {
                if (!key.startsWith('0x')) key = '0x' + key;
                validKeys.push([idx + 1, key]);
            }
        }
    });
    if (validKeys.length === 0) {
        addLog(`✖ Error: No valid private keys found`);
        throw new Error('No valid private keys found');
    }
    return validKeys;
}

function loadAddresses(filePath = "addressERC20.txt", addLog) {
    if (!fs.existsSync(filePath)) {
        addLog(`⚠ Warning: No addresses found in addressERC20.txt. Creating new file.`);
        fs.writeFileSync(filePath, '# Add recipient addresses here, one per line\n# Example: 0x1234567890abcdef1234567890abcdef1234567890\n');
        return [];
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const addresses = [];
    lines.forEach((line) => {
        const addr = line.trim();
        if (addr && !addr.startsWith('#') && Web3.utils.isAddress(addr)) {
            addresses.push(Web3.utils.toChecksumAddress(addr));
        }
    });
    if (addresses.length === 0) {
        addLog(`⚠ Warning: No addresses found in addressERC20.txt`);
    }
    return addresses;
}

async function connectWeb3(addLog, updatePanel) {
    try {
        const web3 = new Web3(NETWORK_URL);
        const isConnected = await web3.eth.net.isListening();
        if (!isConnected) {
            addLog(`✖ Error: Failed to connect to RPC`);
            updatePanel(`✖ Error: Failed to connect to RPC`);
            throw new Error('Failed to connect to RPC');
        }
        const chainId = await web3.eth.getChainId();
        addLog(`✔ Success: Connected to Somnia Testnet │ Chain ID: ${chainId}`);
        updatePanel(`✔ Connected to Somnia Testnet │ Chain ID: ${chainId}`);
        return web3;
    } catch (e) {
        addLog(`✖ Error: Web3 connection failed: ${e.message}`);
        updatePanel(`✖ Error: Web3 connection failed: ${e.message}`);
        throw e;
    }
}

async function sendToken(web3, privateKey, walletIndex, contractAddress, destination, amount, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;
        const contract = new web3.eth.Contract(CONTRACT_ABI, contractAddress);
        const decimals = await contract.methods.decimals().call();
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));
        const nonce = await web3.eth.getTransactionCount(senderAddress);
        const gasPrice = await web3.eth.getGasPrice();

        addLog('Preparing transaction...');
        updatePanel(`Preparing transaction for wallet ${walletIndex}...`);

        const tx = contract.methods.sendToken(destination, amountWei.toString());
        const gas = await tx.estimateGas({ from: senderAddress });
        const txData = {
            from: senderAddress,
            to: contractAddress,
            data: tx.encodeABI(),
            gas,
            gasPrice,
            nonce,
            chainId: CHAIN_ID
        };

        addLog('Sending transaction...');
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);

        const signed = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
        const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;

        if (receipt.status) {
            addLog(`✔ Token sent successfully! │ Tx: ${txLink}`);
            addLog(`  Wallet address: ${senderAddress}`);
            addLog(`  Destination: ${destination}`);
            addLog(`  Amount: ${amount.toFixed(4)} Token`);
            addLog(`  Gas: ${receipt.gasUsed}`);
            addLog(`  Block: ${receipt.blockNumber}`);
            updatePanel(`✔ Wallet ${walletIndex}: Token sent successfully!`);
            return true;
        } else {
            addLog(`✖ Error: Token sending failed │ Tx: ${txLink}`);
            updatePanel(`✖ Wallet ${walletIndex}: Token sending failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: Failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Failed: ${e.message}`);
        return false;
    }
}

module.exports = async function runSendToken(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n SEND ERC20 TOKEN - SOMNIA TESTNET \n');
        addLog('--- Start Sending ERC20 Token ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        // Get contract address and amount
        const contractAddress = await requestInput('Enter ERC20 contract address (contractERC20.txt):', 'text', '');
        const amount = parseFloat(await requestInput('Enter token amount to send:', 'number', 1));
        if (!amount || amount <= 0) {
            addLog('✖ Error: Please enter a valid number for amount');
            updatePanel('✖ Error: Please enter a valid number for amount');
            return;
        }

        // Choose destination method
        const method = await requestInput(
            'Choose token sending method:\n 1. Send randomly\n 2. Send from addressERC20.txt\nEnter your choice (1 or 2):',
            'text',
            '1'
        );

        let destinations = [];
        if (method === '1') {
            // Randomly generate addresses
            for (let i = 0; i < privateKeys.length; i++) {
                destinations.push(web3.eth.accounts.create().address);
            }
        } else if (method === '2') {
            destinations = loadAddresses('addressERC20.txt', addLog);
            if (!destinations.length) {
                addLog('✖ Error: No addresses found in addressERC20.txt');
                updatePanel('✖ Error: No addresses found in addressERC20.txt');
                return;
            }
        } else {
            addLog('✖ Error: Invalid choice');
            updatePanel('✖ Error: Invalid choice');
            return;
        }

        let successfulSends = 0;
        const totalWallets = privateKeys.length;

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalWallets}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalWallets}) ---`);

            // Pick destination (cycle if not enough)
            const destination = destinations[i] || destinations[destinations.length - 1];

            if (await sendToken(web3, privateKey, profileNum, contractAddress, destination, amount, addLog, updatePanel)) {
                successfulSends++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulSends}/${totalWallets} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulSends}/${totalWallets} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
