const Web3 = require('web3');
const fs = require('fs');
const axios = require('axios');
const ethUtil = require('ethereumjs-util');
const sigUtil = require('eth-sig-util');

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

class QuillsMessageModule {
    constructor(privateKey, web3, addLog, updatePanel) {
        this.privateKey = privateKey;
        this.web3 = web3;
        this.account = web3.eth.accounts.privateKeyToAccount(privateKey);
        this.walletAddress = this.account.address;
        this.addLog = addLog;
        this.updatePanel = updatePanel;
    }

    getHeaders() {
        return {
            'authority': 'quills.fun',
            'accept': '*/*',
            'cache-control': 'no-cache',
            'content-type': 'application/json',
            'dnt': '1',
            'origin': 'https://quills.fun',
            'pragma': 'no-cache',
            'referer': 'https://quills.fun/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin'
        };
    }

    async auth() {
        this.addLog('Authenticating...');
        const message = `I accept the Quills Adventure Terms of Service at https://quills.fun/terms\n\nNonce: ${Date.now()}`;
        
        // Sign message
        const signature = this.account.sign(message).signature;
        
        const jsonData = {
            'address': this.walletAddress,
            'signature': signature,
            'message': message,
        };
        
        try {
            const response = await axios.post(
                "https://quills.fun/api/auth/wallet",
                jsonData,
                { headers: this.getHeaders() }
            );
            
            if (response.data.success) {
                this.addLog('✔ Authentication successful!');
                return true;
            } else {
                this.addLog(`✖ Failed: ${JSON.stringify(response.data)}`);
                return false;
            }
        } catch (error) {
            this.addLog(`✖ Authentication failed: ${error.message}`);
            return false;
        }
    }

    async mintMessageNft(funMessage) {
        this.addLog('Minting message NFT...');
        
        const jsonData = {
            'walletAddress': this.walletAddress,
            'message': funMessage,
        };
        
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.addLog(`Attempt ${attempt}/${maxAttempts}`);
                const response = await axios.post(
                    "https://quills.fun/api/mint-nft",
                    jsonData,
                    { headers: this.getHeaders() }
                );
                
                if (response.data.success) {
                    this.addLog('✔ Successfully minted message NFT!');
                    this.addLog(`  Address     : ${this.walletAddress}`);
                    this.addLog(`  Message     : ${funMessage}`);
                    
                    // Check transaction if API returns tx_hash
                    const txHash = response.data.tx_hash;
                    if (txHash) {
                        this.addLog('Checking transaction...');
                        const receipt = await this.web3.eth.getTransactionReceipt(txHash);
                        if (receipt && receipt.status) {
                            this.addLog(`  Tx Hash     : ${EXPLORER_URL}${txHash}`);
                            this.addLog(`  Block       : ${receipt.blockNumber}`);
                            this.addLog(`  Gas         : ${receipt.gasUsed}`);
                        } else {
                            this.addLog(`  Transaction failed on-chain`);
                        }
                    }
                    return true;
                } else {
                    this.addLog(`✖ Failed: ${JSON.stringify(response.data)}`);
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    }
                }
            } catch (error) {
                this.addLog(`✖ Failed (attempt ${attempt}): ${error.message}`);
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
            }
        }
        return false;
    }

    async run(funMessage) {
        if (!await this.auth()) {
            return false;
        }
        return await this.mintMessageNft(funMessage);
    }
}

module.exports = async function runFun(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel('\n QUILLS FUN - SOMNIA TESTNET \n');
        addLog('--- Start Quills Fun ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);
        const funMessage = await requestInput('Enter your fun message:', 'text', 'I love Somnia Testnet!');

        let successfulTasks = 0;
        const totalTasks = privateKeys.length;

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalTasks}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalTasks}) ---`);

            const quills = new QuillsMessageModule(privateKey, web3, addLog, updatePanel);
            if (await quills.run(funMessage)) {
                successfulTasks++;
            }

            if (i < privateKeys.length - 1) {
                const delay = 10;
                addLog(`Info: Pausing ${delay} seconds`);
                updatePanel(`Pausing ${delay} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulTasks}/${totalTasks} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulTasks}/${totalTasks} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
