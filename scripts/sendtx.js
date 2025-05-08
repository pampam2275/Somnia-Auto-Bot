const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";

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
                validKeys.push(key);
            }
        }
    });
    if (validKeys.length === 0) {
        addLog(`✖ Error: No valid private keys found`);
        throw new Error('No valid private keys found');
    }
    return validKeys;
}

function loadAddresses(filePath = "address.txt", addLog) {
    if (!fs.existsSync(filePath)) {
        addLog(`✖ Error: address.txt file not found`);
        return null;
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const addresses = [];
    lines.forEach((line, idx) => {
        const addr = line.trim();
        if (addr) {
            try {
                addresses.push(Web3.utils.toChecksumAddress(addr));
            } catch {
                addLog(`⚠ Warning: Line ${idx + 1} is not a valid address, skipped: ${addr}`);
            }
        }
    });
    if (addresses.length === 0) {
        addLog(`✖ Error: No valid addresses found in address.txt`);
        return null;
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

function getRandomAddress(web3) {
    const randomAddress = '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    return web3.utils.toChecksumAddress(randomAddress);
}

async function sendTransaction(web3, privateKey, toAddress, amount, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;
        const nonce = await web3.eth.getTransactionCount(senderAddress);
        const latestBlock = await web3.eth.getBlock('latest');
        const baseFeePerGas = latestBlock.baseFeePerGas;
        const maxPriorityFeePerGas = web3.utils.toWei('2', 'gwei');
        const maxFeePerGas = BigInt(baseFeePerGas) + BigInt(maxPriorityFeePerGas);

        const tx = {
            nonce: nonce,
            to: toAddress,
            value: web3.utils.toWei(amount.toString(), 'ether'),
            gas: 21000,
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas,
            chainId: CHAIN_ID
        };

        addLog('Sending transaction...');
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;

        if (receipt.status) {
            addLog(`✔ Transaction successful! │ Tx: ${txLink}`);
            addLog(`  Sender: ${senderAddress}`);
            addLog(`  Receiver: ${toAddress}`);
            addLog(`  Amount: ${amount} STT`);
            addLog(`  Gas: ${receipt.gasUsed}`);
            addLog(`  Block: ${receipt.blockNumber}`);
            const balance = web3.utils.fromWei(await web3.eth.getBalance(senderAddress), 'ether');
            addLog(`  Balance: ${balance} STT`);
            updatePanel(`✔ Wallet ${walletIndex}: Transaction successful!`);
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

async function getTxCount(requestInput, addLog, updatePanel) {
    while (true) {
        const txCountInput = await requestInput('Number of transactions (default 1):', 'number', 1);
        const txCount = parseInt(txCountInput);
        if (txCount > 0) return txCount;
        addLog('✖ Error: Number of transactions must be greater than 0');
        updatePanel('✖ Error: Number of transactions must be greater than 0');
    }
}

async function getAmount(requestInput, addLog, updatePanel) {
    while (true) {
        const amountInput = await requestInput('Amount of STT (default 0.000001, max 999):', 'number', 0.000001);
        const amount = parseFloat(amountInput);
        if (amount > 0 && amount <= 999) return amount;
        addLog('✖ Error: Amount must be greater than 0 and not exceed 999');
        updatePanel('✖ Error: Amount must be greater than 0 and not exceed 999');
    }
}

async function sendToRandomAddresses(web3, amount, txCount, privateKeys, addLog, updatePanel) {
    let successfulTxs = 0;
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        updatePanel(`\n PROCESSING WALLET ${i + 1}/${privateKeys.length} \n`);
        addLog(`--- Processing wallet ${i + 1}/${privateKeys.length} ---`);
        for (let txIter = 0; txIter < txCount; txIter++) {
            addLog(`Transaction ${txIter + 1}/${txCount}`);
            const toAddress = getRandomAddress(web3);
            if (await sendTransaction(web3, privateKey, toAddress, amount, i + 1, addLog, updatePanel)) {
                successfulTxs++;
            }
            if (txIter < txCount - 1 || i < privateKeys.length) {
                const delay = 1 + Math.random() * 2;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }
    }
    return successfulTxs;
}

async function sendToFileAddresses(web3, amount, addresses, privateKeys, addLog, updatePanel) {
    let successfulTxs = 0;
    for (let i = 0; i < privateKeys.length; i++) {
        const privateKey = privateKeys[i];
        updatePanel(`\n PROCESSING WALLET ${i + 1}/${privateKeys.length} \n`);
        addLog(`--- Processing wallet ${i + 1}/${privateKeys.length} ---`);
        for (let addrIter = 0; addrIter < addresses.length; addrIter++) {
            const toAddress = addresses[addrIter];
            addLog(`Transaction to address ${addrIter + 1}/${addresses.length}`);
            if (await sendTransaction(web3, privateKey, toAddress, amount, i + 1, addLog, updatePanel)) {
                successfulTxs++;
            }
            if (addrIter < addresses.length - 1 || i < privateKeys.length) {
                const delay = 1 + Math.random() * 2;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }
    }
    return successfulTxs;
}

module.exports = async function runSendTx(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n SEND TX - SOMNIA TESTNET \n');
        addLog('--- Start Sending Transactions ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const txCount = await getTxCount(requestInput, addLog, updatePanel);
        const amount = await getAmount(requestInput, addLog, updatePanel);

        const web3 = await connectWeb3(addLog, updatePanel);

        // Choose transaction type
        const txType = await requestInput(
            'Select transaction type:\n 1. Send to random address\n 2. Send to addresses from file (address.txt)\nEnter choice (1/2):',
            'text',
            '1'
        );

        let successfulTxs = 0;
        let totalTxs = 0;

        if (txType === '1') {
            successfulTxs = await sendToRandomAddresses(web3, amount, txCount, privateKeys, addLog, updatePanel);
            totalTxs = txCount * privateKeys.length;
        } else if (txType === '2') {
            const addresses = loadAddresses('address.txt', addLog);
            if (!addresses) {
                addLog('✖ Error: No valid addresses found in address.txt');
                updatePanel('✖ Error: No valid addresses found in address.txt');
                return;
            }
            successfulTxs = await sendToFileAddresses(web3, amount, addresses, privateKeys, addLog, updatePanel);
            totalTxs = addresses.length * privateKeys.length;
        } else {
            addLog('✖ Error: Invalid choice');
            updatePanel('✖ Error: Invalid choice');
            return;
        }

        updatePanel(`\n COMPLETED: ${successfulTxs}/${totalTxs} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulTxs}/${totalTxs} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
