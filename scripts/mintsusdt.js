const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = 'https://dream-rpc.somnia.network';
const CHAIN_ID = 50312;
const EXPLORER_URL = 'https://shannon-explorer.somnia.network/tx/0x';
const CONTRACT_ADDRESS = '0x65296738D4E5edB1515e40287B6FDf8320E6eE04'; // sUSDT contract
const MINT_AMOUNT = 1000; // Mint 1000 sUSDT
const MINT_DATA = '0x1249c58b'; // Bytecode for mint function

function isValidPrivateKey(key) {
    key = key.trim();
    if (!key.startsWith('0x')) key = '0x' + key;
    try {
        return /^0x[a-fA-F0-9]{64}$/.test(key);
    } catch {
        return false;
    }
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
                validKeys.push([idx + 1, key]); // Store line number and key
            } else {
                addLog(`⚠ Warning: Line ${idx + 1} is invalid, skipped: ${key}`);
            }
        }
    });
    if (validKeys.length === 0) {
        addLog(`✖ Error: No valid private keys found`);
        throw new Error('No valid private keys found');
    }
    return validKeys;
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

// Check if wallet has already minted sUSDT
async function hasMintedSusdt(web3, address, addLog) {
    // Simple ABI to call balanceOf (ERC-20 standard)
    const susdtAbi = [
        {
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }
    ];
    
    try {
        const contract = new web3.eth.Contract(susdtAbi, CONTRACT_ADDRESS);
        const balance = await contract.methods.balanceOf(address).call();
        return BigInt(balance) > 0; // If balance > 0, wallet has already minted
    } catch (e) {
        addLog(`⚠ Warning: Failed to check sUSDT balance: ${e.message}`);
        return false; // Default to not minted if check fails
    }
}

// Function to mint sUSDT
async function mintSusdt(web3, privateKey, walletIndex, addLog, updatePanel) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const senderAddress = account.address;

    // Check if wallet has already minted
    if (await hasMintedSusdt(web3, senderAddress, addLog)) {
        addLog(`⚠ Warning: This wallet has already minted sUSDT! Skipping this request.`);
        updatePanel(`⚠ Wallet ${walletIndex}: Already minted sUSDT`);
        return false;
    }

    try {
        // Check STT balance
        addLog(`Checking balance...`);
        updatePanel(`Checking balance for wallet ${walletIndex}...`);
        
        const balance = web3.utils.fromWei(await web3.eth.getBalance(senderAddress), 'ether');
        if (parseFloat(balance) < 0.001) { // Assume at least 0.001 STT needed for gas
            addLog(`✖ Error: Insufficient balance: ${balance} STT < 0.001 STT`);
            updatePanel(`✖ Wallet ${walletIndex}: Insufficient balance: ${balance} STT`);
            return false;
        }

        // Prepare transaction
        addLog(`Preparing transaction...`);
        updatePanel(`Preparing transaction for wallet ${walletIndex}...`);
        
        const nonce = await web3.eth.getTransactionCount(senderAddress);
        const gasPrice = await web3.eth.getGasPrice();
        const adjustedGasPrice = Math.floor(parseInt(gasPrice) * (1 + Math.random() * 0.07)); // Increase gas price by 0-7%

        const txParams = {
            nonce: nonce,
            to: CONTRACT_ADDRESS,
            value: '0x0', // No STT sent, just minting
            data: MINT_DATA,
            chainId: CHAIN_ID,
            gas: 200000, // Default gas since estimateGas might not work
            gasPrice: adjustedGasPrice
        };

        // Send transaction
        addLog(`Sending transaction...`);
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);
        
        const signedTx = await web3.eth.accounts.signTransaction(txParams, privateKey);
        const txReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        const txLink = `${EXPLORER_URL}${txReceipt.transactionHash}`;

        if (txReceipt.status) {
            addLog(`✔ Success: Successfully minted 1000 sUSDT! │ Tx: ${txLink}`);
            addLog(`  Address: ${senderAddress}`);
            addLog(`  Amount: ${MINT_AMOUNT} sUSDT`);
            addLog(`  Gas: ${txReceipt.gasUsed}`);
            addLog(`  Block: ${txReceipt.blockNumber}`);
            addLog(`  Balance: ${balance} STT`);
            
            updatePanel(`✔ Wallet ${walletIndex}: Successfully minted 1000 sUSDT!`);
            return true;
        } else {
            addLog(`✖ Error: Mint failed │ Tx: ${txLink}`);
            updatePanel(`✖ Wallet ${walletIndex}: Mint failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: Failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Failed: ${e.message}`);
        return false;
    }
}

// Main function
module.exports = async function runMintSusdt(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n MINT sUSDT - SOMNIA TESTNET \n');
        addLog('--- Start Minting sUSDT ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No wallets to mint`);
            updatePanel(`\n ✖ Error: No wallets to mint \n`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        // Shuffle wallets for randomization
        privateKeys.sort(() => Math.random() - 0.5);

        let successfulMints = 0;
        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${privateKeys.length}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${privateKeys.length}) ---`);

            if (await mintSusdt(web3, privateKey, profileNum, addLog, updatePanel)) {
                successfulMints++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20; // Random 10-30 seconds
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`\n Pausing ${delay.toFixed(2)} seconds... \n`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulMints}/${privateKeys.length} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulMints}/${privateKeys.length} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
