const Web3 = require('web3');
const fs = require('fs');

const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";
const ROUTER_ADDRESS = "0x6aac14f090a35eea150705f72d90e4cdc4a49b2c";
const SPENDER_ADDRESS = ROUTER_ADDRESS;
const SUSDT_ADDRESS = "0x65296738D4E5edB1515e40287B6FDf8320E6eE04";
const TOKENS = {
    "SOMI": { address: "0x7a7045415f3682C3349E4b68d2940204b81fFF33", price: 0.99960 },
    "SMSM": { address: "0x6756B4542d545270CacF1F15C3b7DefE589Ba1aa", price: 0.99959 },
    "SMI": { address: "0xC9005DD5C562bDdEF1Cf3C90Ad5B1Bf54fB8aa9d", price: 0.99959 },
    "sUSDT": { address: "0x65296738D4E5edB1515e40287B6FDf8320E6eE04", price: 1.0 }
};

const TOKEN_ABI = [
    { "constant": false, "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "type": "function" },
    { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "type": "function" },
    { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "type": "function" },
    { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "type": "function" }
];

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

async function getTokenInfo(web3, tokenSymbol, walletAddress, addLog) {
    const contract = new web3.eth.Contract(TOKEN_ABI, TOKENS[tokenSymbol].address);
    try {
        const decimals = await contract.methods.decimals().call();
        const balance = await contract.methods.balanceOf(walletAddress).call() / 10 ** decimals;
        const totalSupply = await contract.methods.totalSupply().call() / 10 ** decimals;
        const price = TOKENS[tokenSymbol].price;
        const marketCap = price * totalSupply;
        addLog(`Balance     : ${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${tokenSymbol}`);
        addLog(`Price       : ${price.toFixed(5)} sUSDT/${tokenSymbol}`);
        if (tokenSymbol !== "sUSDT") {
            addLog(`Market Cap  : ${marketCap.toLocaleString(undefined, { minimumFractionDigits: 2 })} sUSDT`);
        }
        return balance;
    } catch (e) {
        addLog(`✖ Error: ${e.message}`);
        return 0;
    }
}

async function selectToken(requestInput) {
    const prompt = 'Select token to buy (1: SOMI │ 2: SMSM │ 3: SMI):';
    while (true) {
        const choice = await requestInput(prompt, 'text', '1');
        if (choice === "1") return "SOMI";
        if (choice === "2") return "SMSM";
        if (choice === "3") return "SMI";
    }
}

async function getAmount(requestInput) {
    while (true) {
        const value = await requestInput('Enter sUSDT amount to buy token:', 'number', 1);
        if (typeof value === 'number' && value > 0) return value;
    }
}

async function approveToken(web3, privateKey, tokenAddress, spenderAddress, amount, walletIndex, addLog, updatePanel) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const tokenContract = new web3.eth.Contract(TOKEN_ABI, tokenAddress);
    const decimals = await tokenContract.methods.decimals().call();
    const amountWei = BigInt(Math.floor(amount * (10 ** decimals)));

    const tx = tokenContract.methods.approve(spenderAddress, amountWei.toString());
    const gas = await tx.estimateGas({ from: account.address });
    const gasPrice = await web3.eth.getGasPrice();

    const txData = {
        from: account.address,
        to: tokenAddress,
        data: tx.encodeABI(),
        gas,
        gasPrice,
        nonce: await web3.eth.getTransactionCount(account.address)
    };

    const signed = await web3.eth.accounts.signTransaction(txData, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

    if (receipt.status) {
        addLog(`✔ Successfully approved ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} sUSDT!`);
        updatePanel(`✔ Wallet ${walletIndex}: Approved ${amount} sUSDT`);
        return receipt.transactionHash;
    } else {
        addLog(`✖ Error: Approve failed`);
        updatePanel(`✖ Wallet ${walletIndex}: Approve failed`);
        return null;
    }
}

async function buyToken(web3, privateKey, tokenSymbol, amount, walletIndex, addLog, updatePanel) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const tokenIn = SUSDT_ADDRESS;
    const tokenOut = TOKENS[tokenSymbol].address;
    const swapRouter = new web3.eth.Contract(SWAP_ROUTER_ABI, ROUTER_ADDRESS);

    const susdtContract = new web3.eth.Contract(TOKEN_ABI, tokenIn);
    const decimals = await susdtContract.methods.decimals().call();
    const amountInWei = BigInt(Math.floor(amount * (10 ** decimals)));
    const amountOutMinimum = BigInt(Math.floor(amount * 0.95 * (10 ** decimals))); // 5% slippage

    const tx = swapRouter.methods.exactInputSingle([
        tokenIn,
        tokenOut,
        500,
        account.address,
        amountInWei.toString(),
        amountOutMinimum.toString(),
        0
    ]);
    const gas = await tx.estimateGas({ from: account.address });
    const gasPrice = await web3.eth.getGasPrice();

    const txData = {
        from: account.address,
        to: ROUTER_ADDRESS,
        data: tx.encodeABI(),
        gas,
        gasPrice,
        nonce: await web3.eth.getTransactionCount(account.address),
        chainId: CHAIN_ID
    };

    const signed = await web3.eth.accounts.signTransaction(txData, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);

    const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;
    if (receipt.status) {
        addLog(`✔ Successfully bought ${tokenSymbol} with ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} sUSDT! │ Tx: ${txLink}`);
        updatePanel(`✔ Wallet ${walletIndex}: Bought ${tokenSymbol} with ${amount} sUSDT`);
        return true;
    } else {
        addLog(`✖ Error: Buy failed │ Tx: ${txLink}`);
        updatePanel(`✖ Wallet ${walletIndex}: Buy failed`);
        return false;
    }
}

module.exports = async function runBuyMeme(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n BUY MEME TOKEN - SOMNIA TESTNET \n');
        addLog('--- Start Buying Meme Token ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);
        const tokenSymbol = await selectToken(requestInput);
        const amount = await getAmount(requestInput);

        let successfulBuys = 0;
        const totalWallets = privateKeys.length;

        privateKeys.sort(() => Math.random() - 0.5);

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalWallets}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalWallets}) ---`);

            const account = web3.eth.accounts.privateKeyToAccount(privateKey);
            const susdtBalance = await getTokenInfo(web3, "sUSDT", account.address, addLog);
            if (susdtBalance < amount) {
                addLog(`✖ Error: Insufficient sUSDT balance: ${susdtBalance} < ${amount}`);
                updatePanel(`✖ Wallet ${profileNum}: Insufficient sUSDT balance`);
                continue;
            }

            await getTokenInfo(web3, tokenSymbol, account.address, addLog);
            const approveTx = await approveToken(web3, privateKey, SUSDT_ADDRESS, SPENDER_ADDRESS, amount, profileNum, addLog, updatePanel);
            if (!approveTx) continue;

            if (await buyToken(web3, privateKey, tokenSymbol, amount, profileNum, addLog, updatePanel)) {
                successfulBuys++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulBuys}/${totalWallets} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulBuys}/${totalWallets} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
