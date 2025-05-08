const Web3 = require('web3');
const fs = require('fs');

// Config
const SOMNIA_TESTNET_RPC_URL = 'https://dream-rpc.somnia.network';
const SOMNIA_TESTNET_EXPLORER_URL = 'https://shannon-explorer.somnia.network';
const SHUFFLE_WALLETS = true;
const MINT_PONGPING_SLEEP_RANGE = [100, 300]; // seconds

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
                validKeys.push(key);
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

function shuffleWallets(keys) {
    return keys.map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function connectWeb3(addLog, updatePanel) {
    try {
        const web3 = new Web3(SOMNIA_TESTNET_RPC_URL);
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

// Bytecode for minting
function bytecodeMintPongPing(address) {
    const addressClean = address.replace("0x", "").toLowerCase();
    return `0x40c10f19000000000000000000000000${addressClean}00000000000000000000000000000000000000000000003635c9adc5dea00000`;
}

async function mintPongPing(web3, privateKey, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const address = account.address;
        const CONTRACT_ADDRESS = "0xbecd9b5f373877881d91cbdbaf013d97eb532154"; // $PING contract

        // Check STT balance
        const balance = await web3.eth.getBalance(address);
        addLog(`Info: Wallet ${walletIndex} │ STT balance: ${web3.utils.fromWei(balance, 'ether')} STT`);
        if (Number(balance) < Number(web3.utils.toWei('0.001', 'ether'))) {
            addLog(`⚠ Warning: Wallet ${walletIndex} │ Insufficient STT: ${address}`);
            updatePanel(`⚠ Wallet ${walletIndex}: Insufficient STT`);
            return false;
        }

        // Build transaction
        const nonce = await web3.eth.getTransactionCount(address);
        const gasPrice = await web3.eth.getGasPrice();
        let tx = {
            to: CONTRACT_ADDRESS,
            value: '0x0',
            data: bytecodeMintPongPing(address),
            nonce: nonce,
            gas: 200000,
            gasPrice: gasPrice,
            chainId: await web3.eth.getChainId()
        };

        // Estimate gas
        try {
            const gasEstimate = await web3.eth.estimateGas(tx);
            addLog(`Info: Wallet ${walletIndex} │ Estimated gas: ${gasEstimate}`);
            tx.gas = gasEstimate + 10000;
        } catch (e) {
            addLog(`✖ Error: Wallet ${walletIndex} │ Gas estimation failed: ${e.message}`);
        }

        // Sign and send
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        addLog(`✔ Success: Wallet ${walletIndex} │ Tx sent: ${SOMNIA_TESTNET_EXPLORER_URL}/tx/${sentTx.transactionHash}`);
        updatePanel(`✔ Wallet ${walletIndex}: Tx sent`);

        // Wait for confirmation
        if (sentTx.status) {
            addLog(`✔ Success: Wallet ${walletIndex} │ Minted 1000 $PING successfully`);
            updatePanel(`✔ Wallet ${walletIndex}: Minted 1000 $PING successfully`);
            return true;
        } else {
            addLog(`✖ Error: Wallet ${walletIndex} │ Mint failed`);
            updatePanel(`✖ Wallet ${walletIndex}: Mint failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: Wallet ${walletIndex} │ Processing failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Processing failed: ${e.message}`);
        return false;
    }
}

module.exports = async function runMintPing(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n START MINTING $PING \n');
        addLog('--- Start Minting $PING ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        if (SHUFFLE_WALLETS) privateKeys = shuffleWallets(privateKeys);

        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No wallets to mint`);
            updatePanel(`✖ Error: No wallets to mint`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulMints = 0;
        for (let i = 0; i < privateKeys.length; i++) {
            updatePanel(`\n --- Processing wallet: ${i + 1}/${privateKeys.length} --- \n`);
            addLog(`--- Processing wallet: ${i + 1}/${privateKeys.length} ---`);

            const privateKey = privateKeys[i];
            const minted = await mintPongPing(web3, privateKey, i + 1, addLog, updatePanel);
            if (minted) successfulMints++;

            if (i < privateKeys.length - 1) {
                const delay = getRandomInt(MINT_PONGPING_SLEEP_RANGE[0], MINT_PONGPING_SLEEP_RANGE[1]);
                addLog(`Info: Sleeping for ${delay} seconds`);
                updatePanel(`Sleeping for ${delay} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulMints}/${privateKeys.length} wallets successful \n`);
        addLog(`--- COMPLETED: ${successfulMints}/${privateKeys.length} wallets successful ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`✖ Error: ${err.message}`);
    }
};
