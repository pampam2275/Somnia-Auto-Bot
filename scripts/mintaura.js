const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";
const SOMNI_CONTRACT = "0xfA139F427a667b56d93946c2FD2c03601BaD033A";
const TIMEOUT = 300; // 5 minutes

const NFT_ABI = [
    {
        "constant": true,
        "inputs": [{ "name": "owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "", "type": "uint256" }],
        "type": "function"
    }
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

async function mintSomniNFT(web3, privateKey, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;

        addLog('Checking NFT balance...');
        const nftContract = new web3.eth.Contract(NFT_ABI, SOMNI_CONTRACT);
        try {
            const nftBalance = await nftContract.methods.balanceOf(senderAddress).call();
            if (Number(nftBalance) >= 1) {
                addLog('✔ This wallet has already minted! Skipping this request');
                return true;
            }
        } catch (e) {
            addLog(`✖ Error checking NFT balance: ${e.message}`);
            return false;
        }

        const balance = parseFloat(web3.utils.fromWei(await web3.eth.getBalance(senderAddress), 'ether'));
        addLog(`STT Balance     : ${balance.toFixed(6)} STT`);

        addLog('Preparing transaction...');
        const mintPrice = '0';

        // Prepare data as per the original script
        const data =
            "0x84bb1e42" +
            senderAddress.slice(2).toLowerCase().padStart(64, '0') +
            "0000000000000000000000000000000000000000000000000000000000000001" +
            "000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" +
            "0000000000000000000000000000000000000000000000000000000000000000" +
            "00000000000000000000000000000000000000000000000000000000000000c0" +
            "0000000000000000000000000000000000000000000000000000000000000160" +
            "0000000000000000000000000000000000000000000000000000000000000080" +
            "0000000000000000000000000000000000000000000000000000000000000000" +
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" +
            "0000000000000000000000000000000000000000000000000000000000000000" +
            "0000000000000000000000000000000000000000000000000000000000000000" +
            "0000000000000000000000000000000000000000000000000000000000000000" +
            "0000000000000000000000000000000000000000000000000000000000000000";

        const latestBlock = await web3.eth.getBlock('latest');
        const baseFee = latestBlock.baseFeePerGas || 0;
        const gasPrice = Math.max(
            parseInt(baseFee) + parseInt(web3.utils.toWei('1', 'gwei')),
            parseInt(web3.utils.toWei('5', 'gwei'))
        );

        const tx = {
            from: senderAddress,
            to: SOMNI_CONTRACT,
            value: mintPrice,
            data: data,
            nonce: await web3.eth.getTransactionCount(senderAddress),
            chainId: CHAIN_ID,
        };

        // Estimate gas
        try {
            const estimatedGas = await web3.eth.estimateGas(tx);
            tx.gas = Math.floor(estimatedGas * 1.2);
        } catch (e) {
            addLog(`Could not estimate gas: ${e.message}. Using default gas: 500000`);
            tx.gas = 500000;
        }

        tx.gasPrice = gasPrice.toString();
        const requiredBalance = parseFloat(web3.utils.fromWei((BigInt(tx.gas) * BigInt(gasPrice)).toString(), 'ether'));
        if (balance < requiredBalance) {
            addLog(`✖ Insufficient wallet balance (< ${requiredBalance.toFixed(6)} STT), cannot mint`);
            return false;
        }

        addLog('Sending transaction...');
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receiptPromise = web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        let receipt;
        try {
            receipt = await Promise.race([
                receiptPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Transaction not confirmed after ${TIMEOUT} seconds, check later...`)), TIMEOUT * 1000)
                )
            ]);
        } catch (e) {
            addLog(`⚠ Transaction not confirmed after ${TIMEOUT} seconds, check later...`);
            addLog(`  Tx Hash        : ${EXPLORER_URL}${signedTx.transactionHash}`);
            return true; // Assume success if timeout
        }

        const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;
        if (receipt.status) {
            addLog(`✔ Successfully minted Somni ✨!`);
            addLog(`  Tx Hash        : ${txLink}`);
            addLog(`  Wallet address : ${senderAddress}`);
            addLog(`  Block          : ${receipt.blockNumber}`);
            addLog(`  Gas            : ${receipt.gasUsed}`);
            return true;
        } else {
            addLog(`✖ Failed to mint Somni ✨ | Tx: ${txLink}`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: ${e.message}`);
        return false;
    }
}

module.exports = async function runMintAura(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel('\n MINT SOMNI ✨ - SOMNIA TESTNET \n');
        addLog('--- Start Mint Somni ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulMints = 0;
        const totalWallets = privateKeys.length;

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalWallets}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalWallets}) ---`);

            if (await mintSomniNFT(web3, privateKey, profileNum, addLog, updatePanel)) {
                successfulMints++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Pausing ${delay.toFixed(2)} seconds...`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulMints}/${totalWallets} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulMints}/${totalWallets} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
