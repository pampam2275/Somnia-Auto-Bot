const Web3 = require('web3'); // Use direct require for compatibility
const fs = require('fs');
const path = require('path');

// Config
const SOMNIA_TESTNET_RPC_URL = 'https://dream-rpc.somnia.network';
const SOMNIA_TESTNET_EXPLORER_URL = 'https://shannon-explorer.somnia.network';
const SHUFFLE_WALLETS = true;
const SWAP_PONGPING_SLEEP_RANGE = [100, 300]; // seconds

const TOKEN_ABI = [
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function'
  }
];

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

function isValidPrivateKey(key) {
  if (!key || typeof key !== 'string') return false;
  key = key.trim();
  if (!key) return false;
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
  const isValid = /^[a-fA-F0-9]{64}$/.test(cleanKey);
  return isValid ? (key.startsWith('0x') ? key : '0x' + cleanKey) : false;
}

function loadPrivateKeys(addLog) {
  const filePath = path.join(__dirname, 'pvkey.txt');
  addLog(`{cyan-fg}ℹ Checking pvkey.txt at: ${filePath}{/cyan-fg}`);
  
  if (!fs.existsSync(filePath)) {
    addLog('{red-fg}✖ Error: pvkey.txt file not found{/red-fg}');
    fs.writeFileSync(filePath, '# Add private keys here, one per line\n# Example: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\n');
    throw new Error('pvkey.txt file not found');
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    addLog(`{cyan-fg}ℹ pvkey.txt content:\n${content.split('\n').map(line => line.substring(0, 10) + (line.length > 10 ? '...' : '')).join('\n')}{/cyan-fg}`);
  } catch (e) {
    addLog(`{red-fg}✖ Error: Failed to read pvkey.txt: ${e.message}{/red-fg}`);
    throw new Error('Failed to read pvkey.txt');
  }

  const lines = content.split('\n');
  const validKeys = [];
  
  lines.forEach((line, idx) => {
    const key = line.trim();
    if (!key || key.startsWith('#')) {
      if (key) addLog(`{cyan-fg}ℹ Skipping comment/empty line ${idx + 1}: ${key.substring(0, 10)}...{/cyan-fg}`);
      return;
    }
    
    const validatedKey = isValidPrivateKey(key);
    if (validatedKey) {
      validKeys.push(validatedKey);
      addLog(`{green-fg}✔ Valid key found at line ${idx + 1}: ${validatedKey.substring(0, 6)}...{/green-fg}`);
    } else {
      addLog(`{yellow-fg}⚠ Invalid key at line ${idx + 1}: length=${key.length}, content=${key.substring(0, 10)}...{/yellow-fg}`);
    }
  });

  if (validKeys.length === 0) {
    addLog('{red-fg}✖ Error: No valid private keys found in pvkey.txt{/red-fg}');
    throw new Error('No valid private keys found');
  }
  
  addLog(`{cyan-fg}ℹ Loaded ${validKeys.length} valid private keys{/cyan-fg}`);
  return validKeys;
}

function shuffleWallets(keys) {
  return keys
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function connectWeb3(addLog, updatePanel) {
  try {
    addLog('{cyan-fg}ℹ Initializing Web3 connection...{/cyan-fg}');
    const web3 = new Web3(SOMNIA_TESTNET_RPC_URL);
    addLog('{cyan-fg}ℹ Checking network connection...{/cyan-fg}');
    const isConnected = await web3.eth.net.isListening();
    if (!isConnected) {
      addLog('{red-fg}✖ Error: Failed to connect to RPC{/red-fg}');
      updatePanel('{red-fg}✖ Error: Failed to connect to RPC{/red-fg}');
      throw new Error('Failed to connect to RPC');
    }
    const chainId = (await web3.eth.getChainId()).toString();
    addLog(`{green-fg}✔ Success: Connected to Somnia Testnet │ Chain ID: ${chainId}{/green-fg}`);
    updatePanel(`{green-fg}✔ Connected to Somnia Testnet │ Chain ID: ${chainId}{/green-fg}`);
    return web3;
  } catch (e) {
    addLog(`{red-fg}✖ Error: Web3 connection failed: ${e.message}{/red-fg}`);
    updatePanel(`{red-fg}✖ Error: Web3 connection failed: ${e.message}{/red-fg}`);
    throw e;
  }
}

async function approveToken(web3, privateKey, tokenAddress, spenderAddress, amount, walletIndex, addLog, updatePanel, txStats) {
  try {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const tokenContract = new web3.eth.Contract(TOKEN_ABI, tokenAddress);
    const decimals = await tokenContract.methods.decimals().call();
    const amountWei = BigInt(Math.floor(amount * 10 ** decimals));

    const tx = {
      from: account.address,
      to: tokenAddress,
      gas: 200000,
      gasPrice: await web3.eth.getGasPrice(),
      data: tokenContract.methods.approve(spenderAddress, amountWei.toString()).encodeABI(),
      nonce: await web3.eth.getTransactionCount(account.address)
    };

    txStats.pending++;
    const startTime = Date.now();
    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    const txTime = Date.now() - startTime;

    if (receipt.status) {
      txStats.pending--;
      txStats.success++;
      txStats.times.push(txTime);
      addLog(`{green-fg}✔ Success: Wallet ${walletIndex} │ Approved ${amount} $PONG │ ${SOMNIA_TESTNET_EXPLORER_URL}/tx/${receipt.transactionHash}{/green-fg}`);
      updatePanel(`{green-fg}✔ Wallet ${walletIndex}: Approved ${amount} $PONG{/green-fg}`);
      return receipt.transactionHash;
    } else {
      txStats.pending--;
      txStats.failed++;
      addLog(`{red-fg}✖ Error: Wallet ${walletIndex} │ Approve failed{/red-fg}`);
      updatePanel(`{red-fg}✖ Wallet ${walletIndex}: Approve failed{/red-fg}`);
      return null;
    }
  } catch (e) {
    txStats.pending--;
    txStats.failed++;
    addLog(`{red-fg}✖ Error: Wallet ${walletIndex} │ Approve failed: ${e.message}{/red-fg}`);
    updatePanel(`{red-fg}✖ Wallet ${walletIndex}: Approve failed: ${e.message}{/red-fg}`);
    return null;
  }
}

async function swapToken(web3, privateKey, tokenIn, tokenOut, amountIn, recipient, walletIndex, addLog, updatePanel, txStats) {
  try {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    const swapRouterAddress = '0x6aac14f090a35eea150705f72d90e4cdc4a49b2c';
    const fee = 500;
    const amountOutMinimum = BigInt(Math.floor(amountIn * 0.97 * 10 ** 18));
    const amountInWei = BigInt(Math.floor(amountIn * 10 ** 18));

    const swapRouter = new web3.eth.Contract(SWAP_ROUTER_ABI, swapRouterAddress);

    const tx = {
      from: account.address,
      to: swapRouterAddress,
      gas: 300000,
      gasPrice: await web3.eth.getGasPrice(),
      data: swapRouter.methods
        .exactInputSingle([
          tokenIn,
          tokenOut,
          fee,
          recipient,
          amountInWei.toString(),
          amountOutMinimum.toString(),
          0
        ])
        .encodeABI(),
      nonce: await web3.eth.getTransactionCount(account.address),
      chainId: await web3.eth.getChainId()
    };

    txStats.pending++;
    const startTime = Date.now();
    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    const txTime = Date.now() - startTime;

    if (receipt.status) {
      txStats.pending--;
      txStats.success++;
      txStats.times.push(txTime);
      addLog(`{green-fg}✔ Success: Wallet ${walletIndex} │ Swapped ${amountIn} $PONG -> $PING │ ${SOMNIA_TESTNET_EXPLORER_URL}/tx/${receipt.transactionHash}{/green-fg}`);
      updatePanel(`{green-fg}✔ Wallet ${walletIndex}: Swapped ${amountIn} $PONG -> $PING{/green-fg}`);
      return receipt.transactionHash;
    } else {
      txStats.pending--;
      txStats.failed++;
      addLog(`{red-fg}✖ Error: Wallet ${walletIndex} │ Swap failed{/red-fg}`);
      updatePanel(`{red-fg}✖ Wallet ${walletIndex}: Swap failed{/red-fg}`);
      return null;
    }
  } catch (e) {
    txStats.pending--;
    txStats.failed++;
    addLog(`{red-fg}✖ Error: Wallet ${walletIndex} │ Swap failed: ${e.message}{/red-fg}`);
    updatePanel(`{red-fg}✖ Wallet ${walletIndex}: Swap failed: ${e.message}{/red-fg}`);
    return null;
  }
}

module.exports = async function runSwapping(addLog, updatePanel, closeUI, requestInput) {
  try {
    updatePanel('{cyan-fg}\n START SWAPPING $PONG -> $PING \n{/cyan-fg}');
    addLog('{cyan-fg}--- Start Swapping $PONG -> $PING ---{/cyan-fg}');

    let privateKeys = loadPrivateKeys(addLog);
    if (SHUFFLE_WALLETS) privateKeys = shuffleWallets(privateKeys);

    addLog(`{cyan-fg}ℹ Info: Found ${privateKeys.length} wallets{/cyan-fg}`);
    updatePanel(`{cyan-fg}\n Found ${privateKeys.length} wallets \n{/cyan-fg}`);

    if (privateKeys.length === 0) {
      addLog('{red-fg}✖ Error: No wallets to swap{/red-fg}');
      updatePanel('{red-fg}\n ✖ Error: No wallets to swap \n{/red-fg}');
      return;
    }

    const amount = await requestInput('Amount of $PONG to swap (e.g., 100)', 'number', 100);
    updatePanel(`{cyan-fg}\n Amount to swap: ${amount} $PONG \n{/cyan-fg}`);
    addLog(`{cyan-fg}Amount to swap: ${amount} $PONG{/cyan-fg}`);

    const swapTimes = await requestInput('Number of swaps per wallet (default 1)', 'number', 1);
    updatePanel(`{cyan-fg}\n Swaps per wallet: ${swapTimes} \n{/cyan-fg}`);
    addLog(`{cyan-fg}Swaps per wallet: ${swapTimes}{/cyan-fg}`);

    const web3 = await connectWeb3(addLog, updatePanel);

    const txStats = {
      success: 0,
      failed: 0,
      pending: 0,
      times: []
    };

    let successfulSwaps = 0;
    for (let i = 0; i < privateKeys.length; i++) {
      updatePanel(`{cyan-fg}\n PROCESSING WALLET ${i + 1}/${privateKeys.length} \n{/cyan-fg}`);
      addLog(`{cyan-fg}--- Processing Wallet ${i + 1}/${privateKeys.length} ---{/cyan-fg}`);

      const privateKey = privateKeys[i];
      const tokenIn = '0x7968ac15a72629e05f41b8271e4e7292e0cc9f90'; // $PONG
      const tokenOut = '0xbecd9b5f373877881d91cbdbaf013d97eb532154'; // $PING
      const spenderAddress = '0x6aac14f090a35eea150705f72d90e4cdc4a49b2c';
      const recipient = web3.eth.accounts.privateKeyToAccount(privateKey).address;

      const approveTx = await approveToken(web3, privateKey, tokenIn, spenderAddress, amount * swapTimes, i + 1, addLog, updatePanel, txStats);
      if (!approveTx) {
        addLog(`{yellow-fg}Skipping wallet ${i + 1} due to approval failure{/yellow-fg}`);
        updatePanel(`{yellow-fg}\n Skipping wallet ${i + 1} due to approval failure \n{/yellow-fg}`);
        continue;
      }

      for (let swapIter = 0; swapIter < swapTimes; swapIter++) {
        updatePanel(`{cyan-fg}\n Wallet ${i + 1}: Performing swap ${swapIter + 1}/${swapTimes} \n{/cyan-fg}`);
        addLog(`{cyan-fg}Wallet ${i + 1}: Performing swap ${swapIter + 1}/${swapTimes}{/cyan-fg}`);

        const swapTx = await swapToken(web3, privateKey, tokenIn, tokenOut, amount, recipient, i + 1, addLog, updatePanel, txStats);
        if (swapTx) successfulSwaps++;

        if (swapIter < swapTimes - 1) {
          const delay = getRandomInt(1, 5);
          addLog(`{cyan-fg}ℹ Pausing ${delay} seconds before next swap{/cyan-fg}`);
          updatePanel(`{cyan-fg}\n ℹ Pausing ${delay} seconds before next swap... \n{/cyan-fg}`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }

      if (i < privateKeys.length - 1) {
        const delay = getRandomInt(SWAP_PONGPING_SLEEP_RANGE[0], SWAP_PONGPING_SLEEP_RANGE[1]);
        addLog(`{cyan-fg}ℹ Waiting ${delay} seconds before processing next wallet{/cyan-fg}`);
        updatePanel(`{cyan-fg}\n ℹ Waiting ${delay} seconds before processing next wallet... \n{/cyan-fg}`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }

    updatePanel(`{green-fg}\n COMPLETED: ${successfulSwaps}/${privateKeys.length * swapTimes} SWAPS SUCCESSFUL \n{/green-fg}`);
    addLog(`{green-fg}--- COMPLETED: ${successfulSwaps}/${privateKeys.length * swapTimes} SWAPS SUCCESSFUL ---{/green-fg}`);
  } catch (err) {
    addLog(`{red-fg}✖ Error: ${err.message}{/red-fg}`);
    updatePanel(`{red-fg}\n ✖ Error: ${err.message} \n{/red-fg}`);
  }
};
