const Web3 = require('web3');
const fs = require('fs');

// Config
const SOMNIA_TESTNET_RPC_URL = 'https://dream-rpc.somnia.network';
const SOMNIA_TESTNET_EXPLORER_URL = 'https://shannon-explorer.somnia.network';
const SHUFFLE_WALLETS = true;
const SWAP_PONGPING_SLEEP_RANGE = [100, 300]; // seconds

const TOKEN_ABI = [
    {
        "constant": false,
        "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "name": "", "type": "uint8" }],
        "type": "function"
    }
];

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

async function approveToken(web3, privateKey, tokenAddress, spenderAddress, amount, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const tokenContract = new web3.eth.Contract(TOKEN_ABI, tokenAddress);
        const decimals = await tokenContract.methods.decimals().call();
        const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));

        const tx = {
            from: account.address,
            to: tokenAddress,
            gas: 200000,
            gasPrice: await web3.eth.getGasPrice(),
            data: tokenContract.methods.approve(spenderAddress, amountWei.toString()).encodeABI(),
            nonce: await web3.eth.getTransactionCount(account.address)
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (receipt.status) {
            addLog(`✔ Success: Wallet ${walletIndex} │ Approved ${amount} $PONG │ ${SOMNIA_TESTNET_EXPLORER_URL}/tx/${receipt.transactionHash}`);
            updatePanel(`✔ Wallet ${walletIndex}: Approved ${amount} $PONG`);
            return receipt.transactionHash;
        } else {
            addLog(`✖ Error: Wallet ${walletIndex} │ Approve failed`);
            updatePanel(`✖ Wallet ${walletIndex}: Approve failed`);
            return null;
        }
    } catch (e) {
        addLog(`✖ Error: Wallet ${walletIndex} │ Approve failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Approve failed: ${e.message}`);
        return null;
    }
}

async function swapToken(web3, privateKey, tokenIn, tokenOut, amountIn, recipient, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const swapRouterAddress = '0x6aac14f090a35eea150705f72d90e4cdc4a49b2c';
        const fee = 500;
        const amountOutMinimum = BigInt(Math.floor(amountIn * 0.97 * (10 ** 18)));
        const amountInWei = BigInt(Math.floor(amountIn * (10 ** 18)));

        const SWAP_ROUTER_ABI = [
            {
                "inputs": [
                    {
                        "components": [
                            { "name": "tokenIn", "type": "address" },
                            { "name": "tokenOut", "type": "address" },
                            { "name": "fee", "type": "uint24" },
                            { "name": "recipient", "type": "address" },
                            { "name": "amountIn", "type": "uint256" },
                            { "name": "amountOutMinimum", "type": "uint256" },
                            { "name": "sqrtPriceLimitX96", "type": "uint160" }
                        ],
                        "name": "params",
                        "type": "tuple"
                    }
                ],
                "name": "exactInputSingle",
                "outputs": [{ "name": "amountOut", "type": "uint256" }],
                "stateMutability": "nonpayable",
                "type": "function"
            }
        ];

        const swapRouter = new web3.eth.Contract(SWAP_ROUTER_ABI, swapRouterAddress);

        const tx = {
            from: account.address,
            to: swapRouterAddress,
            gas: 300000,
            gasPrice: await web3.eth.getGasPrice(),
            data: swapRouter.methods.exactInputSingle([
                tokenIn,
                tokenOut,
                fee,
                recipient,
                amountInWei.toString(),
                amountOutMinimum.toString(),
                0
            ]).encodeABI(),
            nonce: await web3.eth.getTransactionCount(account.address),
            chainId: await web3.eth.getChainId()
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (receipt.status) {
            addLog(`✔ Success: Wallet ${walletIndex} │ Swapped ${amountIn} $PONG -> $PING │ ${SOMNIA_TESTNET_EXPLORER_URL}/tx/${receipt.transactionHash}`);
            updatePanel(`✔ Wallet ${walletIndex}: Swapped ${amountIn} $PONG -> $PING`);
            return receipt.transactionHash;
        } else {
            addLog(`✖ Error: Wallet ${walletIndex} │ Swap failed`);
            updatePanel(`✖ Wallet ${walletIndex}: Swap failed`);
            return null;
        }
    } catch (e) {
        addLog(`✖ Error: Wallet ${walletIndex} │ Swap failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Swap failed: ${e.message}`);
        return null;
    }
}

module.exports = async function runSwappong(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n START SWAPPING $PONG -> $PING \n');
        addLog('--- Start Swapping $PONG -> $PING ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        if (SHUFFLE_WALLETS) privateKeys = shuffleWallets(privateKeys);

        addLog(`ℹ Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No wallets to swap`);
            updatePanel(`\n ✖ Error: No wallets to swap \n`);
            return;
        }

        const amount = await requestInput('Amount of $PONG to swap (e.g., 100)', 'number', 100);
        updatePanel(`\n Amount to swap: ${amount} $PONG \n`);
        addLog(`Amount to swap: ${amount} $PONG`);

        const swapTimes = await requestInput('Number of swaps per wallet (default 1)', 'number', 1);
        updatePanel(`\n Swaps per wallet: ${swapTimes} \n`);
        addLog(`Swaps per wallet: ${swapTimes}`);

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulSwaps = 0;
        for (let i = 0; i < privateKeys.length; i++) {
            updatePanel(`\n PROCESSING WALLET ${i + 1}/${privateKeys.length} \n`);
            addLog(`--- Processing Wallet ${i + 1}/${privateKeys.length} ---`);

            const privateKey = privateKeys[i];
            const tokenIn = '0x7968ac15a72629e05f41b8271e4e7292e0cc9f90'; // $PONG
            const tokenOut = '0xbecd9b5f373877881d91cbdbaf013d97eb532154'; // $PING
            const spenderAddress = '0x6aac14f090a35eea150705f72d90e4cdc4a49b2c';
            const recipient = web3.eth.accounts.privateKeyToAccount(privateKey).address;

            const approveTx = await approveToken(web3, privateKey, tokenIn, spenderAddress, amount * swapTimes, i + 1, addLog, updatePanel);
            if (!approveTx) {
                addLog(`Skipping wallet ${i + 1} due to approval failure`);
                updatePanel(`\n Skipping wallet ${i + 1} due to approval failure \n`);
                continue;
            }

            for (let swapIter = 0; swapIter < swapTimes; swapIter++) {
                updatePanel(`\n Wallet ${i + 1}: Performing swap ${swapIter + 1}/${swapTimes} \n`);
                addLog(`Wallet ${i + 1}: Performing swap ${swapIter + 1}/${swapTimes}`);

                const swapTx = await swapToken(web3, privateKey, tokenIn, tokenOut, amount, recipient, i + 1, addLog, updatePanel);
                if (swapTx) successfulSwaps++;

                if (swapIter < swapTimes - 1) {
                    const delay = getRandomInt(1, 5);
                    addLog(`ℹ Pausing ${delay} seconds before next swap`);
                    updatePanel(`\n ℹ Pausing ${delay} seconds before next swap... \n`);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }

            if (i < privateKeys.length - 1) {
                const delay = getRandomInt(SWAP_PONGPING_SLEEP_RANGE[0], SWAP_PONGPING_SLEEP_RANGE[1]);
                addLog(`ℹ Waiting ${delay} seconds before processing next wallet`);
                updatePanel(`\n ℹ Waiting ${delay} seconds before processing next wallet... \n`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulSwaps}/${privateKeys.length * swapTimes} SWAPS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulSwaps}/${privateKeys.length * swapTimes} SWAPS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
