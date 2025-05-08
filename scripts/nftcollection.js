const Web3 = require('web3');
const fs = require('fs');

// Config
const NETWORK_URL = 'https://dream-rpc.somnia.network';
const CHAIN_ID = 50312;
const EXPLORER_URL = "https://shannon-explorer.somnia.network";
const NFT_CONTRACT_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract NFTCollection {
    address public owner;
    string public name;
    string public symbol;
    uint256 public maxSupply;
    uint256 public totalSupply;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string) private _tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Mint(address indexed to, uint256 indexed tokenId, string tokenURI);
    event Burn(address indexed from, uint256 indexed tokenId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the contract owner");
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_owners[tokenId] != address(0), "Token doesn't exist");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint256 _maxSupply) {
        owner = msg.sender;
        name = _name;
        symbol = _symbol;
        maxSupply = _maxSupply;
        totalSupply = 0;
    }

    function mint(address to, uint256 tokenId, string memory tokenURI) public onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(_owners[tokenId] == address(0), "Token already exists");
        require(totalSupply < maxSupply, "Maximum supply reached");

        _owners[tokenId] = to;
        _balances[to]++;
        _tokenURIs[tokenId] = tokenURI;
        totalSupply++;

        emit Transfer(address(0), to, tokenId);
        emit Mint(to, tokenId, tokenURI);
    }

    function burn(uint256 tokenId) public tokenExists(tokenId) {
        address tokenOwner = _owners[tokenId];
        require(msg.sender == tokenOwner || msg.sender == owner, "Not authorized to burn");

        delete _tokenURIs[tokenId];
        delete _owners[tokenId];
        _balances[tokenOwner]--;
        totalSupply--;

        emit Transfer(tokenOwner, address(0), tokenId);
        emit Burn(tokenOwner, tokenId);
    }

    function tokenURI(uint256 tokenId) public view tokenExists(tokenId) returns (string memory) {
        return _tokenURIs[tokenId];
    }

    function ownerOf(uint256 tokenId) public view tokenExists(tokenId) returns (address) {
        return _owners[tokenId];
    }

    function balanceOf(address _owner) public view returns (uint256) {
        require(_owner != address(0), "Zero address has no balance");
        return _balances[_owner];
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

// NOTE: For actual Solidity compilation in JS, use solc-js or run a subprocess.
// Here, we assume you have the ABI and bytecode ready for deployment, or you can use a precompiled contract.
// For demo, we'll use a placeholder ABI and bytecode.
const NFT_ABI = []; // <-- Replace with actual ABI if needed
const NFT_BYTECODE = '0x...'; // <-- Replace with actual bytecode if needed

// Deploy NFT contract
async function deployNFT(web3, privateKey, walletIndex, name, symbol, maxSupply, addLog, updatePanel) {
    try {
        // You must fill NFT_ABI and NFT_BYTECODE with your actual compiled contract
        if (!NFT_ABI.length || NFT_BYTECODE === '0x...') {
            addLog('✖ Error: NFT ABI/Bytecode not set. Please compile your contract and set ABI/Bytecode.');
            updatePanel('✖ Error: NFT ABI/Bytecode not set.');
            return null;
        }
        const contract = new web3.eth.Contract(NFT_ABI);
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const sender = account.address;

        addLog('Preparing transaction...');
        updatePanel(`Preparing deployment for wallet ${walletIndex}...`);
        const nonce = await web3.eth.getTransactionCount(sender);
        const gasPrice = await web3.eth.getGasPrice();

        const tx = contract.deploy({
            data: NFT_BYTECODE,
            arguments: [name, symbol, maxSupply]
        });

        const gas = await tx.estimateGas({ from: sender });
        const txData = {
            from: sender,
            data: tx.encodeABI(),
            gas: gas + 10000,
            gasPrice,
            nonce,
            chainId: CHAIN_ID
        };

        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (receipt.status) {
            addLog(`✔ Success: NFT collection created! Contract: ${receipt.contractAddress}`);
            updatePanel(`✔ Wallet ${walletIndex}: NFT collection created!`);
            return { address: receipt.contractAddress, abi: NFT_ABI };
        } else {
            addLog(`✖ Error: NFT deployment failed`);
            updatePanel(`✖ Wallet ${walletIndex}: NFT deployment failed`);
            return null;
        }
    } catch (e) {
        addLog(`✖ Error: NFT deployment failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: NFT deployment failed: ${e.message}`);
        return null;
    }
}

// Mint NFT
async function mintNFT(web3, privateKey, walletIndex, contractAddress, tokenId, tokenUri, addLog, updatePanel) {
    try {
        if (!NFT_ABI.length) {
            addLog('✖ Error: NFT ABI not set. Please compile your contract and set ABI.');
            updatePanel('✖ Error: NFT ABI not set.');
            return false;
        }
        const contract = new web3.eth.Contract(NFT_ABI, contractAddress);
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const sender = account.address;

        addLog('Preparing mint transaction...');
        updatePanel(`Preparing mint for wallet ${walletIndex}...`);
        const nonce = await web3.eth.getTransactionCount(sender);
        const gasPrice = await web3.eth.getGasPrice();

        const tx = contract.methods.mint(sender, tokenId, tokenUri);
        const gas = await tx.estimateGas({ from: sender });
        const txData = {
            from: sender,
            to: contractAddress,
            data: tx.encodeABI(),
            gas: gas + 10000,
            gasPrice,
            nonce,
            chainId: CHAIN_ID
        };

        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (receipt.status) {
            addLog(`✔ Success: NFT minted! Token ID: ${tokenId}`);
            updatePanel(`✔ Wallet ${walletIndex}: NFT minted!`);
            return true;
        } else {
            addLog(`✖ Error: NFT mint failed`);
            updatePanel(`✖ Wallet ${walletIndex}: NFT mint failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: NFT mint failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: NFT mint failed: ${e.message}`);
        return false;
    }
}

// Burn NFT
async function burnNFT(web3, privateKey, walletIndex, contractAddress, tokenId, addLog, updatePanel) {
    try {
        if (!NFT_ABI.length) {
            addLog('✖ Error: NFT ABI not set. Please compile your contract and set ABI.');
            updatePanel('✖ Error: NFT ABI not set.');
            return false;
        }
        const contract = new web3.eth.Contract(NFT_ABI, contractAddress);
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        const sender = account.address;

        addLog('Preparing burn transaction...');
        updatePanel(`Preparing burn for wallet ${walletIndex}...`);
        const nonce = await web3.eth.getTransactionCount(sender);
        const gasPrice = await web3.eth.getGasPrice();

        const tx = contract.methods.burn(tokenId);
        const gas = await tx.estimateGas({ from: sender });
        const txData = {
            from: sender,
            to: contractAddress,
            data: tx.encodeABI(),
            gas: gas + 10000,
            gasPrice,
            nonce,
            chainId: CHAIN_ID
        };

        const signedTx = await web3.eth.accounts.signTransaction(txData, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

        if (receipt.status) {
            addLog(`✔ Success: NFT burned! Token ID: ${tokenId}`);
            updatePanel(`✔ Wallet ${walletIndex}: NFT burned!`);
            return true;
        } else {
            addLog(`✖ Error: NFT burn failed`);
            updatePanel(`✖ Wallet ${walletIndex}: NFT burn failed`);
            return false;
        }
    } catch (e) {
        addLog(`✖ Error: NFT burn failed: ${e.message}`);
        updatePanel(`✖ Wallet ${walletIndex}: NFT burn failed: ${e.message}`);
        return false;
    }
}

module.exports = async function runNFTCollection(updatePanel, addLog, closeUI, requestInput) {
    try {
        updatePanel('\n NFT MANAGEMENT - SOMNIA TESTNET \n');
        addLog('--- Start NFT Management ---');

        let privateKeys = loadPrivateKeys('pvkey.txt', addLog);
        addLog(`Info: Found ${privateKeys.length} wallets`);
        updatePanel(`\n Found ${privateKeys.length} wallets \n`);

        if (privateKeys.length === 0) {
            addLog(`✖ Error: No wallets found`);
            updatePanel(`\n ✖ Error: No wallets found \n`);
            return;
        }

        const web3 = await connectWeb3(addLog, updatePanel);

        // Choose action
        const action = await requestInput(
            'Select action:\n 1. Create NFT Collection (Deploy)\n 2. Mint NFT\n 3. Burn NFT\nEnter choice (1, 2, or 3): ',
            'text',
            '1'
        );

        let successfulOps = 0;
        const totalOps = privateKeys.length;

        if (action === '1') {
            const name = await requestInput('Enter NFT collection name (e.g., Kazuha NFT):', 'text', 'Kazuha NFT');
            const symbol = await requestInput('Enter collection symbol (e.g., KAZUHA):', 'text', 'KAZUHA');
            const maxSupply = parseInt(await requestInput('Enter maximum supply (e.g., 999):', 'number', 999));
            if (!maxSupply || maxSupply <= 0) {
                addLog('✖ Error: Please enter a valid number for max supply');
                updatePanel('✖ Error: Please enter a valid number for max supply');
                return;
            }
            for (let i = 0; i < privateKeys.length; i++) {
                const [profileNum, privateKey] = privateKeys[i];
                updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalOps}) \n`);
                addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalOps}) ---`);
                const result = await deployNFT(web3, privateKey, profileNum, name, symbol, maxSupply, addLog, updatePanel);
                if (result) {
                    successfulOps++;
                    fs.appendFileSync('contractNFT.txt', `${result.address}\n`);
                }
                if (i < totalOps - 1) await new Promise(res => setTimeout(res, 10000));
            }
        } else if (action === '2') {
            const contractAddress = await requestInput('Enter NFT contract address:', 'text', '');
            const tokenId = parseInt(await requestInput('Enter Token ID:', 'number', 1));
            const tokenUri = await requestInput('Enter Token URI (e.g., ipfs://...):', 'text', '');
            if (!tokenId || tokenId < 0) {
                addLog('✖ Error: Please enter a valid number for Token ID');
                updatePanel('✖ Error: Please enter a valid number for Token ID');
                return;
            }
            for (let i = 0; i < privateKeys.length; i++) {
                const [profileNum, privateKey] = privateKeys[i];
                updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalOps}) \n`);
                addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalOps}) ---`);
                const minted = await mintNFT(web3, privateKey, profileNum, contractAddress, tokenId, tokenUri, addLog, updatePanel);
                if (minted) successfulOps++;
                if (i < totalOps - 1) await new Promise(res => setTimeout(res, 10000));
            }
        } else if (action === '3') {
            const contractAddress = await requestInput('Enter NFT contract address:', 'text', '');
            const tokenId = parseInt(await requestInput('Enter Token ID:', 'number', 1));
            if (!tokenId || tokenId < 0) {
                addLog('✖ Error: Please enter a valid number for Token ID');
                updatePanel('✖ Error: Please enter a valid number for Token ID');
                return;
            }
            for (let i = 0; i < privateKeys.length; i++) {
                const [profileNum, privateKey] = privateKeys[i];
                updatePanel(`\n PROCESSING WALLET ${profileNum} (${i + 1}/${totalOps}) \n`);
                addLog(`--- Processing wallet ${profileNum} (${i + 1}/${totalOps}) ---`);
                const burned = await burnNFT(web3, privateKey, profileNum, contractAddress, tokenId, addLog, updatePanel);
                if (burned) successfulOps++;
                if (i < totalOps - 1) await new Promise(res => setTimeout(res, 10000));
            }
        } else {
            addLog('✖ Error: Invalid choice');
            updatePanel('✖ Error: Invalid choice');
            return;
        }

        updatePanel(`\n COMPLETED: ${successfulOps}/${totalOps} TRANSACTIONS SUCCESSFUL \n`);
        addLog(`--- COMPLETED: ${successfulOps}/${totalOps} TRANSACTIONS SUCCESSFUL ---`);
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`\n ✖ Error: ${err.message} \n`);
    }
};
