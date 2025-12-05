// multiBotServer.js
// Multi-account mineflayer bot manager with web UI (for cracked servers)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const path = require('path');

// ---- CONFIGURE YOUR MINECRAFT SERVER HERE ----
const MC_HOST = 'play.mcbegedis.lt';
const MC_PORT = 25565;
const MC_VERSION = '1.21.1';
// ----------------------------------------------

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const WEB_PORT = process.env.PORT || 3000;

// static folder for logo/music if you want (public/logo.png, public/music.mp3)
app.use(express.static(path.join(__dirname, 'public')));

// store bots: id -> { id, username, bot, status }
const bots = new Map();
let nextBotId = 1;

// Helper: current bots snapshot for UI
function getBotsSnapshot() {
  const list = [];
  for (const b of bots.values()) {
    list.push({
      id: b.id,
      username: b.username,
      status: b.status || 'Connecting...',
    });
  }
  return list;
}

// Create a new bot
function createBot(username) {
  const id = nextBotId++;
  const botWrapper = {
    id,
    username,
    bot: null,
    status: 'Connecting...',
  };
  bots.set(id, botWrapper);

  const bot = mineflayer.createBot({
    host: MC_HOST,
    port: MC_PORT,
    username: username,
    version: MC_VERSION,
  });
  botWrapper.bot = bot;

  function setStatus(text) {
    botWrapper.status = text;
    io.emit('botsUpdate', getBotsSnapshot());
  }

  bot.on('login', () => {
    console.log('[' + username + '] Logged in');
    setStatus('Online');
    io.emit('log', { botId: id, text: '[' + username + '] Logged in', type: 'system' });
  });

  bot.on('spawn', () => {
    console.log('[' + username + '] Spawned');
    io.emit('log', { botId: id, text: '[' + username + '] Spawned in world', type: 'system' });
  });

  // Newer versions: use 'message' to see chat
  bot.on('message', (jsonMsg, position, sender) => {
    const text = jsonMsg.toString();
    const senderName = sender && sender.username ? sender.username : 'Server';
    console.log('[' + username + ' chat]', '<' + senderName + '> ' + text);
    io.emit('chat', {
      botId: id,
      botUsername: username,
      from: senderName,
      message: text,
    });
  });

  bot.on('kicked', (reason) => {
    console.log('[' + username + '] Kicked:', reason);
    setStatus('Kicked');
    io.emit('log', { botId: id, text: '[' + username + '] Kicked: ' + reason, type: 'error' });
  });

  bot.on('end', () => {
    console.log('[' + username + '] Disconnected');
    setStatus('Disconnected');
    io.emit('log', { botId: id, text: '[' + username + '] Disconnected', type: 'system' });
  });

  bot.on('error', (err) => {
    console.log('[' + username + '] Error:', err.message || err);
    setStatus('Error');
    io.emit('log', {
      botId: id,
      text: '[' + username + '] Error: ' + (err.message || err),
      type: 'error',
    });
  });

  io.emit('botsUpdate', getBotsSnapshot());
  return id;
}

// Disconnect & remove a bot
function destroyBot(id) {
  const entry = bots.get(id);
  if (!entry) return;
  try {
    if (entry.bot) entry.bot.end();
  } catch (e) {
    console.log('Error ending bot', id, e);
  }
  bots.delete(id);
  io.emit('botsUpdate', getBotsSnapshot());
  io.emit('log', {
    botId: id,
    text: '[' + entry.username + '] Bot removed',
    type: 'system',
  });
}

// ---- WEB UI ----
app.get('/', (req, res) => {
  res.send(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Minecraft Multi-Bot Control</title>
  <style>
    :root {
      --bg: #050509;
      --card: #101018;
      --accent1: #00e5ff;
      --accent2: #7c4dff;
      --accent3: #ff4081;
      --text: #f5f5ff;
      --muted: #a0a0c0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top, rgba(0,229,255,0.15), transparent 55%),
        radial-gradient(circle at bottom, rgba(255,64,129,0.18), transparent 60%),
        #000;
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .app {
      width: 100%;
      max-width: 1100px;
      height: 85vh;
      border-radius: 24px;
      background:
        radial-gradient(circle at top left, rgba(124,77,255,0.18), transparent 55%),
        radial-gradient(circle at bottom right, rgba(0,229,255,0.12), transparent 55%),
        rgba(5,5,12,0.96);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow:
        0 0 40px rgba(0,0,0,0.9),
        0 0 80px rgba(124,77,255,0.35);
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(14px);
      background: linear-gradient(to right, rgba(0,0,0,0.78), rgba(8,8,22,0.9));
      gap: 14px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background:
        radial-gradient(circle at 30% 0%, var(--accent1), transparent 55%),
        radial-gradient(circle at 70% 100%, var(--accent3), transparent 60%),
        #050508;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.16);
      box-shadow:
        0 0 20px rgba(0,229,255,0.32),
        0 0 35px rgba(255,64,129,0.36);
      overflow: hidden;
    }
    .logo img { width: 80%; height: 80%; object-fit: contain; }
    .brand-text { display: flex; flex-direction: column; }
    .brand-title {
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 13px;
    }
    .brand-sub { font-size: 11px; color: var(--muted); }

    .pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      border: 1px solid rgba(255,255,255,0.18);
      color: var(--muted);
    }

    main {
      display: grid;
      grid-template-columns: 280px 1fr;
      height: 100%;
    }

    .sidebar {
      border-right: 1px solid rgba(255,255,255,0.08);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(7,7,18,0.96));
    }

    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .card {
      background: rgba(8,8,18,0.95);
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 10px 10px 12px 10px;
    }

    .input-row {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }
    input[type="text"] {
      flex: 1;
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(3,3,10,0.96);
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    input[type="text"]::placeholder {
      color: rgba(160,160,192,0.7);
    }

    .btn-primary {
      border: none;
      border-radius: 999px;
      padding: 7px 14px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      cursor: pointer;
      background: linear-gradient(120deg, var(--accent1), var(--accent2), var(--accent3));
      background-size: 200% 200%;
      color: #05050a;
      box-shadow:
        0 0 18px rgba(0,229,255,0.55),
        0 0 32px rgba(255,64,129,0.55);
      transition: transform 0.14s ease-out, box-shadow 0.14s ease-out, background-position 0.4s ease-out;
      white-space: nowrap;
    }
    .btn-primary:hover {
      transform: translateY(-1px);
      box-shadow:
        0 0 22px rgba(0,229,255,0.9),
        0 0 38px rgba(255,64,129,0.95);
      background-position: 100% 0;
    }
    .btn-primary:active {
      transform: translateY(1px) scale(0.98);
    }

    .btn-secondary {
      border-radius: 999px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,0.16);
      background: transparent;
      color: var(--muted);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-secondary:hover {
      background: radial-gradient(circle at top, rgba(0,229,255,0.22), rgba(124,77,255,0.18));
      color: var(--text);
      border-color: rgba(255,255,255,0.32);
    }

    .bots-list {
      max-height: 260px;
      overflow-y: auto;
      margin-top: 6px;
    }
    .bot-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 10px;
      margin-bottom: 4px;
      background: rgba(12,12,24,0.9);
      border: 1px solid rgba(255,255,255,0.06);
      font-size: 12px;
    }
    .bot-main {
      display: flex;
      flex-direction: column;
    }
    .bot-name { font-weight: 500; }
    .bot-status { font-size: 11px; color: var(--muted); }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      margin-right: 6px;
      background: #ff5252;
      box-shadow: 0 0 10px rgba(255,82,82,0.75);
    }
    .status-dot.online {
      background: #00e676;
      box-shadow: 0 0 10px rgba(0,230,118,0.9);
    }
    .bot-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-end;
    }
    .bot-active-label {
      font-size: 10px;
      color: var(--accent1);
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }

    .content {
      padding: 12px 14px 14px 14px;
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 10px;
    }

    #activeBotDisplay {
      font-size: 12px;
      color: var(--muted);
    }

    #log {
      flex: 1;
      border-radius: 16px;
      background: rgba(6,6,16,0.96);
      border: 1px solid rgba(255,255,255,0.08);
      padding: 10px 12px;
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 13px;
      overflow-y: auto;
    }
    .log-line { margin-bottom: 3px; }
    .log-line.system { color: var(--muted); }
    .log-line.error { color: #ff8a80; }
    .log-line.chat span.from { color: var(--accent3); }
    .log-line.chat span.botTag {
      color: var(--accent1);
      font-size: 11px;
      margin-right: 4px;
    }

    #inputArea {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }
    #messageInput {
      flex: 1;
      padding: 8px 11px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(5,5,14,0.96);
      color: var(--text);
      outline: none;
      font-size: 13px;
    }
    #messageInput::placeholder {
      color: rgba(160,160,192,0.7);
    }

    @media (max-width: 900px) {
      main {
        grid-template-columns: 1fr;
      }
      .sidebar {
        order: 2;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="brand">
        <div class="logo">
          <img src="/logo.png" alt="logo" onerror="this.style.display='none'">
        </div>
        <div class="brand-text">
          <div class="brand-title">Skull Multi-Bot Console</div>
          <div class="brand-sub">Server: ` +
      MC_HOST +
      ':' +
      MC_PORT +
      ` · Version: ` +
      MC_VERSION +
      `</div>
        </div>
      </div>
      <div class="pill">Web Control Panel</div>
    </header>

    <main>
      <aside class="sidebar">
        <div class="card">
          <div class="section-title">Add account</div>
          <div>Enter a cracked username to start a new bot.</div>
          <div class="input-row">
            <input type="text" id="newUsername" placeholder="Username" />
            <button class="btn-primary" id="addBotBtn">Start</button>
          </div>
        </div>

        <div class="card" style="flex:1;display:flex;flex-direction:column;">
          <div class="section-title">Bots</div>
          <div class="bots-list" id="botsList"></div>
        </div>
      </aside>

      <section class="content">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div class="section-title">Console</div>
          <div id="activeBotDisplay">Active bot: <span id="activeBotName">none</span></div>
        </div>
        <div id="log"></div>
        <div id="inputArea">
          <input id="messageInput" type="text" placeholder="Type chat or /command for active bot and press Enter..." autocomplete="off" />
          <button class="btn-primary" id="sendBtn">Send</button>
          <button class="btn-secondary" id="clearBtn">Clear</button>
        </div>
      </section>
    </main>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();

    const botsListEl = document.getElementById('botsList');
    const newUsernameEl = document.getElementById('newUsername');
    const addBotBtn = document.getElementById('addBotBtn');
    const logEl = document.getElementById('log');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const activeBotNameEl = document.getElementById('activeBotName');

    let bots = [];
    let activeBotId = null;

    function setActiveBot(id) {
      activeBotId = id;
      const bot = bots.find(b => b.id === id);
      activeBotNameEl.textContent = bot ? bot.username : 'none';
      renderBots();
    }

    function addLogLine(text, type, from, botTag) {
      const div = document.createElement('div');
      div.classList.add('log-line');
      if (type) div.classList.add(type);

      if (type === 'chat') {
        const spanBot = document.createElement('span');
        spanBot.classList.add('botTag');
        spanBot.textContent = '[' + botTag + '] ';
        const spanFrom = document.createElement('span');
        spanFrom.classList.add('from');
        spanFrom.textContent = '<' + from + '> ';
        const spanMsg = document.createElement('span');
        spanMsg.textContent = text;
        div.appendChild(spanBot);
        div.appendChild(spanFrom);
        div.appendChild(spanMsg);
      } else {
        div.textContent = text;
      }

      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }

    function renderBots() {
      botsListEl.innerHTML = '';
      if (!bots.length) {
        const span = document.createElement('div');
        span.style.fontSize = '12px';
        span.style.color = '#a0a0c0';
        span.textContent = 'No bots yet. Add a username above.';
        botsListEl.appendChild(span);
        return;
      }

      bots.forEach(bot => {
        const item = document.createElement('div');
        item.classList.add('bot-item');

        const main = document.createElement('div');
        main.classList.add('bot-main');

        const nameRow = document.createElement('div');
        nameRow.style.display = 'flex';
        nameRow.style.alignItems = 'center';

        const dot = document.createElement('div');
        dot.classList.add('status-dot');
        if (bot.status && bot.status.toLowerCase().indexOf('online') !== -1) {
          dot.classList.add('online');
        }

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('bot-name');
        nameSpan.textContent = bot.username;

        nameRow.appendChild(dot);
        nameRow.appendChild(nameSpan);

        const statusSpan = document.createElement('span');
        statusSpan.classList.add('bot-status');
        statusSpan.textContent = bot.status || '...';

        main.appendChild(nameRow);
        main.appendChild(statusSpan);

        const actions = document.createElement('div');
        actions.classList.add('bot-actions');

        if (activeBotId === bot.id) {
          const activeLabel = document.createElement('div');
          activeLabel.classList.add('bot-active-label');
          activeLabel.textContent = 'ACTIVE';
          actions.appendChild(activeLabel);
        }

        const activateBtn = document.createElement('button');
        activateBtn.classList.add('btn-secondary');
        activateBtn.textContent = activeBotId === bot.id ? 'Active' : 'Set Active';
        activateBtn.disabled = activeBotId === bot.id;
        activateBtn.onclick = () => setActiveBot(bot.id);

        const disconnectBtn = document.createElement('button');
        disconnectBtn.classList.add('btn-secondary');
        disconnectBtn.textContent = 'Remove';
        disconnectBtn.onclick = () => {
          socket.emit('destroyBot', bot.id);
        };

        actions.appendChild(activateBtn);
        actions.appendChild(disconnectBtn);

        item.appendChild(main);
        item.appendChild(actions);

        botsListEl.appendChild(item);
      });
    }

    // socket events
    socket.on('connect', () => {
      addLogLine('[Web] Connected to control panel.', 'system');
    });

    socket.on('botsUpdate', list => {
      bots = list || [];
      if (activeBotId === null && bots.length) {
        activeBotId = bots[0].id;
        activeBotNameEl.textContent = bots[0].username;
      }
      if (!bots.find(b => b.id === activeBotId)) {
        activeBotId = bots.length ? bots[0].id : null;
        activeBotNameEl.textContent = activeBotId ? bots[0].username : 'none';
      }
      renderBots();
    });

    socket.on('log', payload => {
      if (!payload) return;
      addLogLine(payload.text, payload.type || 'system');
    });

    socket.on('chat', payload => {
      if (!payload) return;
      addLogLine(payload.message, 'chat', payload.from, payload.botUsername);
    });

    // UI events
    addBotBtn.addEventListener('click', () => {
      const username = newUsernameEl.value.trim();
      if (!username) return;
      socket.emit('createBot', username);
      newUsernameEl.value = '';
    });

    newUsernameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        addBotBtn.click();
      }
    });

    function sendMessage() {
      const msg = messageInput.value.trim();
      if (!msg || activeBotId === null) return;
      socket.emit('sendChat', { botId: activeBotId, message: msg });
      addLogLine('[You -> bot ' + activeBotId + '] ' + msg, 'system');
      messageInput.value = '';
      messageInput.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendMessage();
    });

    clearBtn.addEventListener('click', () => {
      logEl.innerHTML = '';
    });
  </script>
</body>
</html>`
  );
});

// socket.io handlers
io.on('connection', (socket) => {
  console.log('[Web] Browser connected');
  socket.emit('botsUpdate', getBotsSnapshot());
  socket.emit('log', {
    text: '[Web] Connected to Minecraft multi-bot control.',
    type: 'system',
  });

  socket.on('createBot', (username) => {
    username = String(username || '').trim();
    if (!username) return;
    console.log('Creating bot for username', username);
    const id = createBot(username);
    socket.emit('log', {
      text: '[Web] Starting bot #' + id + ' with username ' + username,
      type: 'system',
    });
  });

  socket.on('sendChat', (payload) => {
    if (!payload) return;
    const botId = payload.botId;
    const message = String(payload.message || '').trim();
    if (!message) return;
    const entry = bots.get(botId);
    if (!entry || !entry.bot) return;
    try {
      entry.bot.chat(message);
    } catch (e) {
      console.log('Error sending chat from bot', botId, e);
      socket.emit('log', {
        text: '[Web] Failed to send chat from bot #' + botId,
        type: 'error',
      });
    }
  });

  socket.on('destroyBot', (botId) => {
    destroyBot(botId);
  });

  socket.on('disconnect', () => {
    console.log('[Web] Browser disconnected');
  });
});

// start server
server.listen(WEB_PORT, () => {
  console.log('Web control panel running at http://localhost:' + WEB_PORT);
});
