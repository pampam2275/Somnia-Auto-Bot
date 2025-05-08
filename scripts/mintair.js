const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";

// Timer Contract Bytecode (payload)
const TIMER_PAYLOAD = "0x6080604052348015600f57600080fd5b5061018d8061001f6000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063557ed1ba1461003b578063d09de08a14610059575b600080fd5b610043610063565b60405161005091906100d9565b60405180910390f35b61006161006c565b005b60008054905090565b600160008082825461007e9190610123565b925050819055507f3912982a97a34e42bab8ea0e99df061a563ce1fe3333c5e14386fd4c940ef6bc6000546040516100b691906100d9565b60405180910390a1565b6000819050919050565b6100d3816100c0565b82525050565b60006020820190506100ee60008301846100ca565b92915050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b600061012e826100c0565b9150610139836100c0565b9250828201905080821115610151576101506100f4565b5b9291505056fea2646970667358221220801aef4e99d827a7630c9f3ce9c8c00d708b58053b756fed98cd9f2f5928d10f64736f6c634300081c0033";

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

async function deployContract(web3, privateKey, walletIndex, addLog, updatePanel) {
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const senderAddress = account.address;

        addLog('Checking balance...');
        const ethBalance = parseFloat(web3.utils.fromWei(await web3.eth.getBalance(senderAddress), 'ether'));
        if (ethBalance < 0.001) {
            addLog(`✖ Insufficient balance (need at least 0.001 STT for transaction): ${ethBalance.toFixed(4)} STT < 0.001 STT`);
            return false;
        }

        addLog('Preparing transaction...');
        updatePanel(`Preparing transaction for wallet ${walletIndex}...`);
        const nonce = await web3.eth.getTransactionCount(senderAddress);

        let txParams = {
            nonce: nonce,
            from: senderAddress,
            to: undefined,
            data: TIMER_PAYLOAD,
            value: 0,
            chainId: CHAIN_ID,
            gasPrice: Math.floor(Number(await web3.eth.getGasPrice()) * (1.03 + Math.random() * 0.07))
        };

        // Estimate gas
        try {
            const estimatedGas = await web3.eth.estimateGas(txParams);
            const gasLimit = Math.floor(estimatedGas * 1.2);
            txParams.gas = gasLimit;
            addLog(`Estimated gas: ${estimatedGas} | Using gas limit: ${gasLimit}`);
        } catch (e) {
            txParams.gas = 500000;
            addLog(`Failed to estimate gas: ${e.message}. Using default gas: 500000`);
        }

        addLog('Sending transaction...');
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);
        const signedTx = await web3.eth.accounts.signTransaction(txParams, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        const txLink = `${EXPLORER_URL}${receipt.transactionHash}`;

        if (receipt.status) {
            const contractAddress = receipt.contractAddress;
            addLog(`✔ Successfully deployed Timer Contract! │ Tx: ${txLink}`);
            addLog(`  Wallet address : ${senderAddress}`);
            addLog(`  Contract addr  : ${contractAddress}`);
            addLog(`  Block          : ${receipt.blockNumber}`);
            addLog(`  Gas            : ${receipt.gasUsed}`);
            addLog(`  ETH Balance    : ${ethBalance.toFixed(4)} STT`);
            updatePanel(`✔ Wallet ${walletIndex}: Timer contract deployed!`);
            return true;
        } else {
            addLog(`❌ Failed to deploy contract │ Tx: ${txLink}`);
            addLog(`❌ Transaction rejected by network`);
            updatePanel(`❌ Wallet ${walletIndex}: Transaction rejected`);
            return false;
        }
    } catch (e) {
        addLog(`❌ Failed to deploy contract: ${e.message}`);
        updatePanel(`❌ Wallet ${walletIndex}: Failed: ${e.message}`);
        return false;
    }
}

module.exports = async function runMintAir(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel('\n ✨ DEPLOY TIMER CONTRACT - SOMNIA TESTNET ✨ \n');
        addLog('--- Start Deploy Timer Contract ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulDeploys = 0;
        let failedAttempts = 0;
        const totalDeploys = privateKeys.length;

        // Shuffle wallets
        privateKeys.sort(() => Math.random() - 0.5);

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n ⚙ PROCESSING WALLET ${profileNum} (${i + 1}/${privateKeys.length}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${privateKeys.length}) ---`);

            if (await deployContract(web3, privateKey, profileNum, addLog, updatePanel)) {
                successfulDeploys++;
                failedAttempts = 0;
            } else {
                failedAttempts++;
                if (failedAttempts >= 3) {
                    addLog(`Stopping wallet ${profileNum}: Too many consecutive failed transactions`);
                    break;
                }
            }

            if (failedAttempts < 3 && i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Pausing ${delay.toFixed(2)} seconds...`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n 🏁 COMPLETED: ${successfulDeploys}/${totalDeploys} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulDeploys}/${totalDeploys} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`❌ Error: ${err.message}`);
        updatePanel(`\n ❌ Error: ${err.message} \n`);
    }
};
