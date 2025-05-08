# 🌌 Somnia Auto Bot 🚀

**A powerful CLI-based automation tool for interacting with the Somnia Testnet 🌐**

Welcome to **Somnia Auto Bot**, a Node.js-based terminal UI application designed to automate interactions with the Somnia Testnet. This tool provides a sleek, interactive interface using `blessed` for performing tasks like minting tokens, sending transactions, swapping assets, and more! 🎉 Built with 💖 by [Kazuha787](https://github.com/Kazuha787).

---

## 📖 Table of Contents

- [🌟 Features](#-features)
- [🛠️ Prerequisites](#-prerequisites)
- [⚙️ Installation](#-installation)
- [📂 File Structure](#-file-structure)
- [🚀 Usage](#-usage)
- [📜 Available Scripts](#-available-scripts)
- [🤝 Contributing](#-contributing)
- [📞 Contact](#-contact)
- [📝 License](#-license)
## 📞 Contact

- **Telegram** 📱: [@Kazuha787](https://t.me/Kazuha787)  
- **Telegram Channel** 📢: [@im_Kazuha787](https://t.me/im_Kazuha787)  
- **Replit** 💻: [KAZUHA787](https://replit.com/@KAZUHA787)  
- **GitHub** 🐙: [Kazuha787](https://github.com/Kazuha787)
---

## 🌟 Features

- **Interactive Terminal UI** 🖥️: Built with `blessed` for a smooth, menu-driven experience.
- **Dynamic Banner Animation** 🎨: Eye-catching ASCII art with gradient effects using `gradient-string`.
- **Comprehensive Menu** 📋: 19+ options for interacting with the Somnia Testnet, including token minting, swapping, and NFT operations.
- **Real-time Logs** 📜: View script execution logs in a dedicated panel.
- **Input Modals** ✍️: User-friendly prompts for input using `blessed.prompt`.
- **Customizable Scripts** 🧩: Modular script architecture for easy extension.
- **Error Handling** 🛡️: Robust error reporting for script execution.
- **Status Bar** ℹ️: Quick access to contact info and exit instructions.

---

## 🛠️ Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js** (v16 or higher) 🟢  
  [Download Node.js](https://nodejs.org/)
- **npm** (comes with Node.js) 📦
- **Git** 🗃️  
  [Install Git](https://git-scm.com/downloads)
- A code editor like **VS Code** 📝  
  [Download VS Code](https://code.visualstudio.com/)

---

## ⚙️ Installation

Follow these steps to set up **Somnia Auto Bot** locally:

1. **Clone the Repository** 📥  
   ```bash
   git clone https://github.com/Kazuha787/Somnia-Auto-Bot.git
   cd Somnia-Auto-Bot
   ```
## Install Dependencies 📦
Install the required Node.js packages:
```
npm install
```
# Edit The Private Keys 
```
nano pvkey.txt
```
***Also Edit the***  `pvkey.txt` in Scripts Folder 📂 
```
nano pvkey.txt
```
## ✅ Usage
Launch the Application ▶️
Start the terminal UI by running:
```
node main.js
```
# Output
# Navigate the Menu 🧭
Use arrow keys to select a script from the menu
Press Enter to execute the selected script.
Press q, Ctrl+C, or Esc to exit.
Interact with Scripts ✍️Scripts may prompt for inputs (e.g., wallet addresses, token amounts) via a modal.View real-time logs in the Script Panel (right side).
Check script output in the Panel (bottom section).

# Somnia-Auto-Bot 🚀  
Automate all your Somnia Testnet tasks like a pro. From minting tokens to deploying contracts, this toolkit's got your back.
---
## 📁 Directory Structure

```bash
Somnia-Auto-Bot/
├── scripts/                     # 📜 Modular scripts for Somnia Testnet tasks
│   ├── faucetstt.js             # 🚰 Script for requesting $STT from faucet
│   ├── mintpong.js              # 💰 Script for minting $PONG tokens
│   ├── mintping.js              # 💸 Script for minting $PING tokens
│   ├── mintsusdt.js             # 🪙 Script for minting sUSDT stablecoins
│   ├── sendtx.js                # 📤 Script for sending transactions
│   ├── deploytoken.js           # 📝 Script for deploying token contracts
│   ├── sendtoken.js             # 📦 Script for transferring tokens
│   ├── swappong.js              # 🔄 Script for swapping PONG to PING
│   ├── swapping.js              # 🔄 Script for swapping PING to PONG
│   ├── sellmeme.js              # 🖼️ Script for selling meme assets
│   ├── nftcollection.js         # 🖌️ Script for managing NFT collections
│   ├── buymeme.js               # 🛒 Script for buying meme assets
│   ├── conftnft.js              # 🎨 Script for minting NFTs
│   ├── fun.js                   # 🎉 Script for fun-themed NFTs
│   ├── lovesomini.js            # 💖 Script for Love Somini interactions
│   ├── mintair.js               # ⏲️ Script for managing mint timers
│   ├── mintaura.js              # 🌟 Script for minting Somni tokens
│   ├── mintnerzo.js             # ✨ Script for minting Shannon tokens
├── assets/                      # 🖼️ Static assets (e.g., banner images)
│   ├── banner.png               # 📸 Banner image for README
├──  main.js                     # 🚀 Main application entry point
├── package.json                 # 📦 Project metadata and dependencies
├── README.md                    # 📖 Project documentation
└── LICENSE                      # ⚖️ MIT License file
```
---

### Enhancements in This Version

1. **Polished Aesthetics**:  
   - More consistent emoji usage (🌌, 🚀, ✨) for a vibrant look.
   - Cleaner section headers with concise descriptions.
   - Professional tone with a touch of personality (e.g., "Built with 💖").

2. **Streamlined Setup**:  
   - Removed unnecessary steps like `npm list`.
   - Simplified instructions for adding scripts with a clear example.
   - Added a note about `package.json` dependencies for transparency.

3. **Detailed Yet Concise**:  
   - Comprehensive script table with clear descriptions.
   - Added a **Configuration** section for advanced users.
   - Project structure is compact but informative, avoiding clutter.

4. **GitHub-Ready**:  
   - Placeholder banner image (replace with your own).
   - Links to GitHub, Telegram, and Replit are formatted for easy access.
   - Encourages starring the repo and contributing.

5. **Contributing Section**:  
   - Clear, step-by-step guide with a mention of a Code of Conduct (create a `CODE_OF_CONDUCT.md` if needed).
   - Encourages community involvement with a friendly tone.

---

### Additional Files to Create

1. **LICENSE File** (MIT License):  
   Create a `LICENSE` file in the root directory with the following content:
   ```plaintext
   MIT License

   Copyright (c) 2025 Kazuha787

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
