const Web3 = require('web3');
const fs = require('fs');

const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";
const CONFT_NFT_ADDRESS = "0xFC79f0EaC5bEcf21fDcf037bAdb977b2b43DE497";
const AMOUNT = 0.1; // Fixed STT amount to buy NFT

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

async function hasMinted(web3, address, addLog) {
    const nftAbi = [
        {
            "constant": true,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function"
        }
    ];
    const contract = new web3.eth.Contract(nftAbi, CONFT_NFT_ADDRESS);
    try {
        const balance = await contract.methods.balanceOf(address).call();
        return Number(balance) > 0;
    } catch (e) {
        addLog(`⚠ Failed to check NFT balance: ${e.message}`);
        return false;
    }
}

async function buyConftNft(web3, privateKey, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;

        // Check if wallet already minted
        if (await hasMinted(web3, senderAddress, addLog)) {
            addLog(`⚠ This wallet has already minted! Skipping this request.`);
            updatePanel(`⚠ Wallet ${walletIndex}: Already minted NFT`);
            return false;
        }

        // Check balance
        addLog('Checking balance...');
        updatePanel(`Checking balance for wallet ${walletIndex}...`);
        const balance = Number(web3.utils.fromWei(await web3.eth.getBalance(senderAddress), 'ether'));
        if (balance < AMOUNT) {
            addLog(`✖ Error: Insufficient balance: ${balance.toFixed(4)} STT < ${AMOUNT.toFixed(4)} STT`);
            updatePanel(`✖ Wallet ${walletIndex}: Insufficient balance`);
            return false;
        }

        // Prepare transaction
        addLog('Preparing transaction...');
        updatePanel(`Preparing transaction for wallet ${walletIndex}...`);
        const nonce = await web3.eth.getTransactionCount(senderAddress);
        const gasPrice = await web3.eth.getGasPrice();

        const txParams = {
            nonce: nonce,
            to: CONFT_NFT_ADDRESS,
            value: web3.utils.toWei(AMOUNT.toString(), 'ether'),
            gas: 200000,
            gasPrice: gasPrice,
            chainId: CHAIN_ID,
            data: '0x1249c58b'
        };

        // Send transaction
        addLog('Sending transaction...');
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);
        const signedTx = await web3.eth.accounts.signTransaction(txParams, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;

        if (receipt.status) {
            addLog(`✔ Transaction successful! │ Tx: ${txLink}`);
            addLog(`  Address: ${senderAddress}`);
            addLog(`  Amount: ${AMOUNT.toFixed(4)} STT`);
            addLog(`  Gas: ${receipt.gasUsed}`);
            addLog(`  Block: ${receipt.blockNumber}`);
            addLog(`  Balance: ${(balance - AMOUNT).toFixed(4)} STT`);
            updatePanel(`✔ Wallet ${walletIndex}: NFT minted successfully!`);
            return true;
        } else {
            addLog(`✖ Error: Transaction failed │ Tx: ${txLink}`);
            updatePanel(`✖ Wallet ${walletIndex}: Transaction failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: Failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Failed: ${e.message}`);
        return false;
    }
}

module.exports = async function runConftNft(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n MINT NFT CONFT - SOMNIA TESTNET \n');
        addLog('--- Start Minting NFT CONFT ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulTxs = 0;
        const totalTxs = privateKeys.length;

        // Shuffle wallets for randomization
        privateKeys.sort(() => Math.random() - 0.5);

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalTxs}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalTxs}) ---`);

            if (await buyConftNft(web3, privateKey, profileNum, addLog, updatePanel)) {
                successfulTxs++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulTxs}/${totalTxs} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulTxs}/${totalTxs} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
