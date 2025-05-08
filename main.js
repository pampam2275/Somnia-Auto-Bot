const blessed = require('blessed');
const chalk = require('chalk');
const gradient = require('gradient-string');
const path = require('path');
const fs = require('fs');

// ---- MENU OPTIONS ----
const menuOptions = [
  { label: 'Faucet $STT', value: 'faucetstt' },
  { label: 'Mint $PONG', value: 'mintpong' },
  { label: 'Mint $PING', value: 'mintping' },
  { label: 'Mint sUSDT', value: 'mintsusdt' },
  { label: 'Send TX', value: 'sendtx' },
  { label: 'Deploy Token', value: 'deploytoken' },
  { label: 'Send Token', value: 'sendtoken' },
  { label: 'Swap PONG→PING', value: 'swappong' },
  { label: 'Swap PING→PONG', value: 'swapping' },
  { label: 'Sell Meme', value: 'sellmeme' },
  { label: 'NFT Coll.', value: 'nftcollection' },
  { label: 'Buy Meme', value: 'buymeme' },
  { label: 'Mint NFT', value: 'conftnft' },
  { label: 'Fun NFT', value: 'fun' },
  { label: 'Love Somini', value: 'lovesomini' },
  { label: 'Mint Timer', value: 'mintair' },
  { label: 'Mint Somni', value: 'mintaura' },
  { label: 'Mint Shannon', value: 'mintnerzo' },
  { label: 'Exit', value: 'exit' }
];

// ---- BANNER ----
const asciiBannerLines = [
  '███████╗ ██████╗ ███╗   ███╗███╗   ██╗██╗ █████╗ ',
  '██╔════╝██╔═══██╗████╗ ████║████╗  ██║██║██╔══██╗',
  '███████╗██║   ██║██╔████╔██║██╔██╗ ██║██║███████║',
  '╚════██║██║   ██║██║╚██╔╝██║██║╚██╗██║██║██╔══██║',
  '███████║╚██████╔╝██║ ╚═╝ ██║██║ ╚████║██║██║  ██║',
  '╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝',
  '                                                 '
];

function animateBanner(bannerBox, screen, callback) {
  let idx = 0;
  const lines = [];
  function showNextLine() {
    if (idx < asciiBannerLines.length) {
      lines.push(asciiBannerLines[idx]);
      bannerBox.setContent(gradient.pastel.multiline(lines.join('\n')));
      screen.render();
      idx++;
      setTimeout(showNextLine, 100);
    } else if (callback) {
      setTimeout(callback, 300);
    }
  }
  showNextLine();
}

function pulseBanner(bannerBox, screen) {
  let bright = true;
  setInterval(() => {
    const content = bannerBox.getContent();
    if (bright) {
      bannerBox.setContent(gradient.cristal.multiline(asciiBannerLines.join('\n')));
    } else {
      bannerBox.setContent(gradient.pastel.multiline(asciiBannerLines.join('\n')));
    }
    screen.render();
    bright = !bright;
  }, 1500);
}

function requestInput(screen, promptText, type = 'text', defaultValue = '') {
  return new Promise((resolve) => {
    const promptBox = blessed.prompt({
      parent: screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 7,
      border: 'line',
      label: ' Input ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: '#ff8c00' },
        label: { fg: '#ff8c00' }
      }
    });

    promptBox.input(
      promptText + (defaultValue ? ` [${defaultValue}]` : ''),
      '',
      (err, value) => {
        if (type === 'number') value = Number(value);
        if (isNaN(value) || value === '' || value === undefined) value = defaultValue;
        promptBox.destroy();
        screen.render();
        resolve(value);
      }
    );
    screen.render();
  });
}

function main() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Somnia Testnet Pro UI'
  });

  const bannerBox = blessed.box({
    top: 0,
    left: 'center',
    width: '100%',
    height: asciiBannerLines.length,
    align: 'center',
    tags: true,
    content: '',
    style: { fg: 'white', bg: 'black' }
  });

  const menuBox = blessed.list({
    top: asciiBannerLines.length,
    left: 0,
    width: 22,
    height: '70%',
    label: '{bold}{cyan-fg} MENU {/}',
    tags: true,
    keys: true,
    mouse: true,
    vi: true,
    border: { type: 'line', fg: '#00eaff' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: '#00eaff' },
      selected: { bg: '#00eaff', fg: 'black' },
      item: { hover: { bg: '#00eaff', fg: 'black' } },
      label: { fg: '#00eaff' }
    },
    items: menuOptions.map(opt => opt.label),
    scrollbar: {
      ch: ' ',
      track: { bg: 'grey' },
      style: { inverse: true }
    }
  });

  const panelBox = blessed.log({
    top: asciiBannerLines.length,
    left: 23,
    width: '78%-1',
    height: '70%',
    label: '{bold}{orange-fg} SCRIPT PANEL (LOGS) {/}',
    tags: true,
    border: { type: 'line', fg: '#ff8c00' },
    style: {
      fg: 'white',
      bg: 'black',
      border: { fg: '#ff8c00' },
      label: { fg: '#ff8c00' }
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      track: { bg: 'grey' },
      style: { inverse: true }
    },
    content: chalk.cyanBright('\nSelect a script from the menu...')
  });

  const logBox = blessed.box({
    top: '70%',
    left: 0,
    width: '100%',
    height: 'shrink',
    label: '{bold}{magenta-fg} PANEL {/}',
    border: { type: 'line', fg: '#ff00cc' },
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: {
      fg: '#fafafa',
      bg: 'black',
      border: { fg: '#ff00cc' },
      label: { fg: '#ff00cc' }
    },
    content: chalk.cyanBright('\nSelect a script from the menu...')
  });

  const statusBar = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    align: 'center',
    tags: true,
    style: { fg: 'black', bg: '#00eaff' },
    content: ' Contact: https://t.me/Kazuha787   Channel: https://t.me/im_Kazuha787   Replit: KAZUHA787   |   Press q to quit'
  });

  screen.append(bannerBox);
  screen.append(menuBox);
  screen.append(panelBox);
  screen.append(logBox);
  screen.append(statusBar);

  menuBox.focus();

  animateBanner(bannerBox, screen, () => {
    pulseBanner(bannerBox, screen);
    screen.render();
  });

  function closeUI() {
    screen.destroy();
    process.exit(0);
  }

  screen.key(['q', 'C-c', 'ESC'], closeUI);

  menuBox.on('select', async (item, idx) => {
    const selected = menuOptions[idx];
    if (!selected) return;

    if (selected.value === 'exit') {
      closeUI();
      return;
    }

    const scriptPath = path.join(__dirname, 'scripts', selected.value + '.js');
    if (!fs.existsSync(scriptPath)) {
      logBox.setContent(chalk.red(`\n✖ Error: Script file not found at ${scriptPath}`));
      panelBox.log(chalk.red(`✖ Error: Script file not found at ${scriptPath}`));
      screen.render();
      menuBox.focus();
      return;
    }

    try {
      const scriptFunc = require(scriptPath);
      await scriptFunc(
        log => { panelBox.log(log); screen.render(); },
        content => { logBox.setContent(content); screen.render(); },
        closeUI,
        async (promptText, type, defaultValue) => {
          return await requestInput(screen, promptText, type, defaultValue);
        }
      );
    } catch (e) {
      logBox.setContent(chalk.red('\n✖ Error running script: ' + e.message));
      panelBox.log(chalk.red('✖ Error running script: ' + e.message));
    }

    logBox.setContent(chalk.cyanBright('\nSelect a script from the menu...'));
    screen.render();
    menuBox.focus();
  });

  menuBox.on('highlight item', (item, idx) => {
    const selected = menuOptions[idx];
    if (selected) {
      logBox.setContent(chalk.yellowBright(`\n${selected.label}\n\n`) + chalk.gray('Press Enter to run this script.'));
      screen.render();
    }
  });

  menuBox.select(0);
  menuBox.emit('highlight item', menuBox.items[0], 0);
  screen.render();
}

main();
