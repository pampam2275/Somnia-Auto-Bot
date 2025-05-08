const Web3 = require('web3');
const fs = require('fs');
const solc = require('solc');

const NETWORK_URL = "https://dream-rpc.somnia.network";
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network";
const SOLC_VERSION = "0.8.22";

const CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract CustomToken {
    string private _name;
    string private _symbol;
    uint8 private _decimals;
    uint256 private _totalSupply;
    address public owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_
    ) {
        owner = msg.sender;
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _totalSupply = totalSupply_;
        _balances[address(this)] = totalSupply_;
        emit Transfer(address(0), address(this), totalSupply_);
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address tokenOwner, address spender) public view returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _transfer(from, to, amount);
        _approve(from, msg.sender, currentAllowance - amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(_balances[from] >= amount, "ERC20: transfer amount exceeds balance");
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _approve(address tokenOwner, address spender, uint256 amount) internal {
        require(tokenOwner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");
        _allowances[tokenOwner][spender] = amount;
        emit Approval(tokenOwner, spender, amount);
    }

    function sendToken(address recipient, uint256 amount) external onlyOwner {
        _transfer(address(this), recipient, amount);
    }
}
`;

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

// Compile contract using solc-js
function compileContract(addLog) {
    addLog(`Info: Compiling contract with solc version ${SOLC_VERSION}...`);
    const input = {
        language: "Solidity",
        sources: {
            "CustomToken.sol": { content: CONTRACT_SOURCE }
        },
        settings: {
            outputSelection: {
                "*": { "*": ["abi", "evm.bytecode"] }
            }
        }
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    if (!output.contracts || !output.contracts["CustomToken.sol"] || !output.contracts["CustomToken.sol"].CustomToken) {
        throw new Error("Solidity compilation failed. Check your Solidity version and contract code.");
    }
    const contract = output.contracts["CustomToken.sol"].CustomToken;
    return [contract.abi, contract.evm.bytecode.object];
}

async function deployContract(web3, privateKey, walletIndex, name, symbol, decimals, totalSupply, addLog, updatePanel) {
    try {
        const [abi, bytecode] = compileContract(addLog);
        const contract = new web3.eth.Contract(abi);
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const sender = account.address;
        const nonce = await web3.eth.getTransactionCount(sender);
        const gasPrice = await web3.eth.getGasPrice();
        const totalSupplyWei = web3.utils.toWei(totalSupply.toString(), 'ether');

        addLog('Preparing transaction...');
        updatePanel(`Preparing transaction for wallet ${walletIndex}...`);

        const tx = contract.deploy({
            data: '0x' + bytecode,
            arguments: [name, symbol, decimals, totalSupplyWei]
        });

        const gas = await tx.estimateGas({ from: sender });
        const txData = {
            from: sender,
            data: tx.encodeABI(),
            gas,
            gasPrice,
            nonce,
            chainId: CHAIN_ID
        };

        addLog('Sending transaction...');
        updatePanel(`Sending transaction for wallet ${walletIndex}...`);

        const signed = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
        const txLink = `${EXPLORER_URL}/tx/0x${receipt.transactionHash}`;

        if (receipt.status) {
            const contractAddress = receipt.contractAddress;
            addLog(`✔ Deployment successful! │ Tx: ${txLink}`);
            addLog(`  Contract address: ${contractAddress}`);
            addLog(`  Gas: ${receipt.gasUsed}`);
            addLog(`  Block: ${receipt.blockNumber}`);
            updatePanel(`✔ Wallet ${walletIndex}: Contract deployed!`);
            return contractAddress;
        } else {
            addLog(`✖ Error: Deployment failed │ Tx: ${txLink}`);
            updatePanel(`✖ Wallet ${walletIndex}: Deployment failed`);
            return null;
        }
    } catch (e) {
        addLog(`✖ Error: Failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: Failed: ${e.message}`);
        return null;
    }
}

module.exports = async function runDeployToken(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel('\n DEPLOY ERC20 TOKEN - SOMNIA TESTNET \n');
        addLog('--- Start Deploying ERC20 Token ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No valid private keys found`);
            updatePanel(`✖ Error: No valid private keys found`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        // Get token info
        const name = await requestInput('Enter token name (e.g., KAZUHA Token):', 'text', 'KAZUHA Token');
        const symbol = await requestInput('Enter token symbol (e.g., KAZ):', 'text', 'KAZUHA');
        const decimals = parseInt(await requestInput('Enter decimals (default 18):', 'number', 18));
        const totalSupply = parseInt(await requestInput('Enter total supply (e.g., 1000000):', 'number', 1000000));
        if (!decimals || decimals <= 0 || !totalSupply || totalSupply <= 0) {
            addLog('✖ Error: Please enter a valid number for decimals and total supply');
            updatePanel('✖ Error: Please enter a valid number for decimals and total supply');
            return;
        }

        let successfulDeploys = 0;
        const totalWallets = privateKeys.length;

        for (let i = 0; i < privateKeys.length; i++) {
            const [profileNum, privateKey] = privateKeys[i];
            updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalWallets}) \n`);
            addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalWallets}) ---`);

            const contractAddress = await deployContract(web3, privateKey, profileNum, name, symbol, decimals, totalSupply, addLog, updatePanel);
            if (contractAddress) {
                successfulDeploys++;
                fs.appendFileSync('contractERC20.txt', `${contractAddress}\n`);
            }

            if (i < privateKeys.length - 1) {
                const delay = 10 + Math.random() * 20;
                addLog(`Info: Pausing ${delay.toFixed(2)} seconds`);
                updatePanel(`Pausing ${delay.toFixed(2)} seconds...`);
                await new Promise(res => setTimeout(res, delay * 1000));
            }
        }

        updatePanel(`\n COMPLETED: ${successfulDeploys}/${totalWallets} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulDeploys}/${totalWallets} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
