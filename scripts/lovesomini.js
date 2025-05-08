const Web3 = require('web3');
const fs = require('fs');

const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network/tx/0x";
const CONTRACT_ADDRESS = "0xf1D8eF3094034FBd27497a6aFE809b601F1d6ba9";

const ABI = [
    {"inputs":[{"internalType":"uint256","name":"_fee","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
    {"inputs":[],"name":"EnforcedPause","type":"error"},
    {"inputs":[],"name":"ExpectedPause","type":"error"},
    {"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},
    {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"FeeUpdated","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"}],"name":"LoveEvent","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"account","type":"address"}],"name":"Paused","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"account","type":"address"}],"name":"Unpaused","type":"event"},
    {"inputs":[],"name":"fee","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"loveSomini","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"pause","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"paused","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"unpause","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"newFee","type":"uint256"}],"name":"updateFee","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}
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

class LoveSominiModule {
    constructor(privateKey, web3, addLog) {
        this.privateKey = privateKey;
        this.web3 = web3;
        this.account = web3.eth.accounts.privateKeyToAccount(privateKey);
        this.walletAddress = this.account.address;
        this.addLog = addLog;
        this.contract = new web3.eth.Contract(ABI, CONTRACT_ADDRESS);
    }

    async getBalance() {
        const balanceWei = await this.web3.eth.getBalance(this.walletAddress);
        return this.web3.utils.fromWei(balanceWei, 'ether');
    }

    async loveSomini(attemptNum, totalAttempts) {
        this.addLog(`Sending Love Somini... (Attempt ${attemptNum}/${totalAttempts})`);
        try {
            const fee = await this.contract.methods.fee().call();
            const value = fee > 0 ? fee : '0';

            const balance = await this.getBalance();
            this.addLog(`STT Balance     : ${parseFloat(balance).toFixed(6)} STT`);
            if (parseFloat(balance) < parseFloat(this.web3.utils.fromWei(value, 'ether'))) {
                this.addLog(`Insufficient balance to send Love Somini`);
                return false;
            }

            const latestBlock = await this.web3.eth.getBlock('latest');
            const baseFee = latestBlock.baseFeePerGas || 0;
            const gasPrice = Math.max(
                parseInt(baseFee) + parseInt(this.web3.utils.toWei('1', 'gwei')),
                parseInt(this.web3.utils.toWei('5', 'gwei'))
            );

            const nonce = await this.web3.eth.getTransactionCount(this.walletAddress);
            const tx = {
                from: this.walletAddress,
                to: CONTRACT_ADDRESS,
                value: value,
                gas: 200000,
                gasPrice: gasPrice.toString(),
                nonce: nonce,
                chainId: CHAIN_ID,
                data: this.contract.methods.loveSomini().encodeABI()
            };

            const signedTx = await this.web3.eth.accounts.signTransaction(tx, this.privateKey);
            const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            const txHashHex = receipt.transactionHash;

            if (receipt.status) {
                this.addLog(`✔ Successfully sent Love Somini!`);
                this.addLog(`  Tx Hash        : ${EXPLORER_URL}${txHashHex}`);
                this.addLog(`  Address        : ${this.walletAddress}`);
                this.addLog(`  Block          : ${receipt.blockNumber}`);
                this.addLog(`  Gas            : ${receipt.gasUsed}`);
                return true;
            } else {
                this.addLog(`✖ Failed: Transaction failed`);
                return false;
            }
        } catch (e) {
            this.addLog(`✖ Failed: ${e.message}`);
            return false;
        }
    }

    async run(loveCount) {
        let successfulLoves = 0;
        for (let attempt = 1; attempt <= loveCount; attempt++) {
            if (await this.loveSomini(attempt, loveCount)) {
                successfulLoves++;
            }
            if (attempt < loveCount) {
                this.addLog(`Waiting 5 seconds between attempts...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        return successfulLoves;
    }
}

module.exports = async function runLoveSomini(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel('\n LOVE SOMINI - SOMNIA TESTNET \n');
        addLog('--- Start Love Somini ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        let loveCount;
        while (true) {
            loveCount = parseInt(await requestInput('Enter number of Love Somini sends (default: 1):', 'number', 1));
            if (loveCount >= 1) break;
            addLog(`✖ Error: Please enter a number greater than 0!`);
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        let successfulTasks = 0;
        const totalTasks = privateKeys.length * loveCount;

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${privateKeys.length}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${privateKeys.length}) ---`);

            const module = new LoveSominiModule(privateKey, web3, addLog);
            const successfulLoves = await module.run(loveCount);
            successfulTasks += successfulLoves;

            if (i < privateKeys.length - 1) {
                const delay = 10;
                addLog(`Info: Pausing ${delay} seconds between wallets`);
                updatePanel(`Pausing ${delay} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulTasks}/${totalTasks} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulTasks}/${totalTasks} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
