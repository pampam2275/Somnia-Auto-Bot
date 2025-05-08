const fs = require('fs');
const Web3 = require('web3');
const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');

const FAUCET_API_URL = "https://testnet.somnia.network/api/faucet";
const IP_CHECK_URL = "https://api.ipify.org?format=json";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "accept": "*/*",
    "content-type": "application/json",
    "origin": "https://testnet.somnia.network",
    "referer": "https://testnet.somnia.network/",
};

function printBorder(text, color = '', width = 80) {
    text = text.trim();
    if (text.length > width - 4) text = text.slice(0, width - 7) + "...";
    const padded = ` ${text} `.padStart((width - 2 + text.length) / 2, '─').padEnd(width - 2, '─');
    return `${color}┌${'─'.repeat(width - 2)}┐\n${color}│${padded}│\n${color}└${'─'.repeat(width - 2)}┘`;
}

function loadAddresses(filePath = "addressFaucet.txt", addLog) {
    if (!fs.existsSync(filePath)) {
        addLog(`✖ Error: No addresses found in addressFaucet.txt`);
        fs.writeFileSync(filePath, '# Add addresses here, one per line\n# Example: 0x1234567890abcdef1234567890abcdef1234567890\n');
        return [];
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const addresses = [];
    lines.forEach(line => {
        const addr = line.trim();
        if (addr && !addr.startsWith('#') && Web3.utils.isAddress(addr)) {
            addresses.push(Web3.utils.toChecksumAddress(addr));
        }
    });
    if (addresses.length === 0) {
        addLog(`✖ Error: No addresses found in addressFaucet.txt`);
    } else {
        addLog(`Info: Found ${addresses.length} addresses in addressFaucet.txt`);
    }
    return addresses;
}

function loadProxies(filePath = "proxies.txt", addLog) {
    if (!fs.existsSync(filePath)) {
        addLog(`⚠ Warning: No proxies found in proxies.txt. Using no proxy.`);
        fs.writeFileSync(filePath, '# Add proxies here, one per line\n# Example: http://host:port or socks5://user:pass@host:port\n');
        return [];
    }
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const proxies = [];
    lines.forEach(line => {
        const proxy = line.trim();
        if (proxy && !proxy.startsWith('#')) proxies.push(proxy);
    });
    if (proxies.length === 0) {
        addLog(`⚠ Warning: No proxies found in proxies.txt. Using no proxy.`);
    } else {
        addLog(`Info: Found ${proxies.length} proxies in proxies.txt`);
    }
    return proxies;
}

async function getProxyIp(proxy, addLog) {
    try {
        let agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
        const res = await axios.get(IP_CHECK_URL, { headers: HEADERS, httpsAgent: agent, timeout: 10000 });
        return res.data.ip || 'Unknown';
    } catch (e) {
        addLog(`⚠ Warning: Failed to get proxy IP: ${e.message}`);
        return 'Unknown';
    }
}

async function claimFaucet(address, proxy, addLog, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            let agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
            const res = await axios.post(FAUCET_API_URL, { address }, {
                headers: HEADERS,
                httpsAgent: agent,
                timeout: 20000
            });
            if (res.status === 200) return res.data;
            if (res.status === 403) throw [403, "First register an account with Somnia"];
            if (res.data && res.data.error) {
                if (res.data.error.includes("24 hours")) throw [res.status, "Please wait 24 hours between requests"];
                if (res.data.error.includes("Rate limit exceeded")) throw [res.status, "Rate limit exceeded"];
                throw [res.status, res.data.details || JSON.stringify(res.data)];
            }
            throw [res.status, JSON.stringify(res.data)];
        } catch (e) {
            let code = e[0] || e.code || "Unknown";
            let response = e[1] || e.message || e.toString();
            if ((response + '').toLowerCase().includes("try again") && attempt < maxRetries - 1) {
                const delay = 5 + Math.random() * 10;
                addLog(`Retrying after ${delay.toFixed(2)} seconds...`);
                await new Promise(r => setTimeout(r, delay * 1000));
                continue;
            }
            throw [code, response];
        }
    }
}

async function processAddress(address, proxy, addLog, updatePanel) {
    addLog(`🚀 Initializing Faucet for address - [${address}]`);
    const publicIp = await getProxyIp(proxy, addLog);
    addLog(`🔄 Using Proxy - [${proxy || 'None'}] with Public IP - [${publicIp}]`);
    try {
        const apiResponse = await claimFaucet(address, proxy, addLog);
        addLog(`✅ Faucet successfully claimed for address - [${address}]`);
        addLog(`🔗 API Response: ${JSON.stringify(apiResponse)}`);
    } catch (e) {
        let code = e[0], response = e[1];
        if (code === 403) addLog(`⚠️ Register an account with Somnia first, then request tokens`);
        else if ((response + '').includes("24 hours")) addLog(`⚠️ Please wait 24 hours between requests`);
        else if ((response + '').includes("Rate limit")) addLog(`⚠️ Rate limit exceeded, try again later`);
        else addLog(`⚠️ Faucet request failed with code - [${code}] API Response: ${response}`);
    }
}

async function processAddresses(addresses, proxies, addLog, updatePanel) {
    for (let i = 0; i < addresses.length; i++) {
        updatePanel(printBorder(`PROCESSING ADDRESS ${i + 1}/${addresses.length} - ${addresses[i]}`, '', 80));
        const proxy = proxies[i] || null;
        await processAddress(addresses[i], proxy, addLog, updatePanel);
        if (i < addresses.length - 1) {
            const delay = 5 + Math.random() * 10;
            addLog(`Pausing ${delay.toFixed(2)} seconds...`);
            await new Promise(r => setTimeout(r, delay * 1000));
        }
    }
}

module.exports = async function runFaucetStt(addLog, updatePanel, closeUI, requestInput) {
    try {
        updatePanel(printBorder('SOMNIA TESTNET FAUCET', '', 80));
        addLog('--- Start Faucet Claim ---');
        const addresses = loadAddresses('addressFaucet.txt', addLog);
        if (!addresses.length) return;
        const proxies = loadProxies('proxies.txt', addLog);
        await processAddresses(addresses, proxies, addLog, updatePanel);
        updatePanel(printBorder('✅ Faucet claim completed!', '', 80));
        addLog('--- Faucet claim completed! ---');
    } catch (err) {
        addLog(`✖ Error: ${err.message}`);
        updatePanel(`✖ Error: ${err.message}`);
    }
};
