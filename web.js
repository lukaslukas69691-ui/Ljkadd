// panel.js
// Multi-account Minecraft bot panel with login + admin + server configs (cracked)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const path = require('path');
const session = require('express-session');

// ---------- BASIC CONFIG ----------
const WEB_PORT = process.env.PORT || 3000;
const SESSION_SECRET = 'change-this-secret';

// initial users (admin can add more from panel)
let users = [
  { username: 'admin', password: 'admin123', role: 'admin' }
];

// initial minecraft servers (admin can add/remove from panel)
let servers = [
  { id: 1, name: 'Default', host: 'play.mcbegedis.lt', port: 25565, version: '1.21.1' }
];

let nextServerId = 2;

// bots map: id -> { id, username, bot, status, serverId }
const bots = new Map();
let nextBotId = 1;

// ---------- EXPRESS + SOCKET.IO SETUP ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// static for /public (logo, music, etc if you want)
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  })
);

// ---------- HELPERS ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function getBotsSnapshot() {
  const list = [];
  for (const b of bots.values()) {
    const srv = servers.find((s) => s.id === b.serverId);
    list.push({
      id: b.id,
      username: b.username,
      status: b.status || 'Connecting...',
      serverId: b.serverId,
      serverName: srv ? srv.name : 'Unknown'
    });
  }
  return list;
}

function publicServers() {
  return servers.map((s) => ({
    id: s.id,
    name: s.name,
    host: s.host,
    port: s.port,
    version: s.version
  }));
}

function publicUsers() {
  return users.map((u) => ({
    username: u.username,
    role: u.role
  }));
}

function createBot(username, serverId) {
  const serverCfg =
    servers.find((s) => s.id === serverId) || servers[0];

  if (!serverCfg) {
    throw new Error('No server configured');
  }

  const id = nextBotId++;
  const botWrapper = {
    id,
    username,
    serverId: serverCfg.id,
    bot: null,
    status: 'Connecting...'
  };
  bots.set(id, botWrapper);

  const bot = mineflayer.createBot({
    host: serverCfg.host,
    port: serverCfg.port,
    username: username,
    version: serverCfg.version
  });
  botWrapper.bot = bot;

  function setStatus(text) {
    botWrapper.status = text;
    io.emit('botsUpdate', getBotsSnapshot());
  }

  bot.on('login', () => {
    console.log('[' + username + '] Logged in on ' + serverCfg.name);
    setStatus('Online');
    io.emit('log', {
      botId: id,
      text:
        '[' +
        username +
        '] Logged in on ' +
        serverCfg.name +
        ' (' +
        serverCfg.host +
        ':' +
        serverCfg.port +
        ')',
      type: 'system'
    });
  });

  bot.on('spawn', () => {
    console.log('[' + username + '] Spawned');
    io.emit('log', {
      botId: id,
      text: '[' + username + '] Spawned in world',
      type: 'system'
    });
  });

  // 1.20+ chat: use "message"
  bot.on('message', (jsonMsg, position, sender) => {
    const text = jsonMsg.toString();
    const senderName =
      sender && sender.username ? sender.username : 'Server';
    console.log(
      '[' + username + ' chat]',
      '<' + senderName + '> ' + text
    );
    io.emit('chat', {
      botId: id,
      botUsername: username,
      from: senderName,
      message: text
    });
  });

  bot.on('kicked', (reason) => {
    console.log('[' + username + '] Kicked:', reason);
    setStatus('Kicked');
    io.emit('log', {
      botId: id,
      text: '[' + username + '] Kicked: ' + reason,
      type: 'error'
    });
  });

  bot.on('end', () => {
    console.log('[' + username + '] Disconnected');
    setStatus('Disconnected');
    io.emit('log', {
      botId: id,
      text: '[' + username + '] Disconnected',
      type: 'system'
    });
  });

  bot.on('error', (err) => {
    console.log(
      '[' + username + '] Error:',
      err && err.message ? err.message : err
    );
    setStatus('Error');
    io.emit('log', {
      botId: id,
      text:
        '[' +
        username +
        '] Error: ' +
        (err && err.message ? err.message : err),
      type: 'error'
    });
  });

  io.emit('botsUpdate', getBotsSnapshot());
  return id;
}

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
    type: 'system'
  });
}

// ---------- ROUTES ----------

// login page
app.get('/login', (req, res) => {
  const error = req.query.error === '1';
  res.send(
    '<!DOCTYPE html>' +
      '<html lang="en"><head><meta charset="UTF-8" />' +
      '<title>Login - Bot Panel</title>' +
      '<style>' +
      'body{margin:0;padding:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#050509;color:#f5f5ff;display:flex;align-items:center;justify-content:center;height:100vh;background:radial-gradient(circle at top,rgba(0,229,255,0.16),transparent 55%),radial-gradient(circle at bottom,rgba(255,64,129,0.2),transparent 60%),#000;}' +
      '.card{background:rgba(10,10,24,0.96);border-radius:20px;padding:24px 26px;width:320px;border:1px solid rgba(255,255,255,0.16);box-shadow:0 0 40px rgba(0,0,0,0.9),0 0 60px rgba(124,77,255,0.4);}' +
      'h1{font-size:18px;margin-bottom:6px;letter-spacing:0.08em;text-transform:uppercase;}' +
      'p.sub{font-size:12px;color:#a0a0c0;margin-bottom:18px;}' +
      'label{display:block;font-size:12px;margin-bottom:4px;}' +
      'input[type=text],input[type=password]{width:100%;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:rgba(5,5,14,0.96);color:#f5f5ff;outline:none;font-size:13px;margin-bottom:10px;}' +
      '.btn{width:100%;padding:9px 12px;border-radius:999px;border:none;background:linear-gradient(120deg,#00e5ff,#7c4dff,#ff4081);color:#05050a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;cursor:pointer;box-shadow:0 0 20px rgba(0,229,255,0.6),0 0 32px rgba(255,64,129,0.7);}' +
      '.btn:hover{transform:translateY(-1px);}' +
      '.err{font-size:12px;color:#ff8a80;margin-bottom:10px;}' +
      '.hint{font-size:11px;color:#a0a0c0;margin-top:10px;}' +
      '</style></head><body>' +
      '<div class="card">' +
      '<h1>Bot Panel</h1>' +
      '<p class="sub">Sign in to manage bots and servers.</p>' +
      (error
        ? '<div class="err">Invalid username or password.</div>'
        : '') +
      '<form method="POST" action="/login">' +
      '<label>Username</label>' +
      '<input type="text" name="username" autocomplete="username" />' +
      '<label>Password</label>' +
      '<input type="password" name="password" autocomplete="current-password" />' +
      '<button class="btn" type="submit">Login</button>' +
      '</form>' +
      '<div class="hint">Default admin: <strong>admin</strong> / <strong>admin123</strong></div>' +
      '</div></body></html>'
  );
});

// login POST
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(
    (u) => u.username === String(username || '').trim()
  );
  if (!user || user.password !== String(password || '')) {
    return res.redirect('/login?error=1');
  }
  req.session.user = {
    username: user.username,
    role: user.role
  };
  res.redirect('/');
});

// logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// main app
app.get('/', requireLogin, (req, res) => {
  const user = req.session.user;
  const isAdmin = user.role === 'admin';

  res.send(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />' +
      '<title>Minecraft Multi-Bot Panel</title>' +
      '<style>' +
      'body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at top,rgba(0,229,255,0.15),transparent 55%),radial-gradient(circle at bottom,rgba(255,64,129,0.2),transparent 60%),#000;color:#f5f5ff;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}' +
      '.app{width:100%;max-width:1200px;height:86vh;border-radius:24px;background:radial-gradient(circle at top left,rgba(124,77,255,0.18),transparent 55%),radial-gradient(circle at bottom right,rgba(0,229,255,0.12),transparent 55%),rgba(5,5,12,0.97);border:1px solid rgba(255,255,255,0.08);box-shadow:0 0 40px rgba(0,0,0,0.9),0 0 80px rgba(124,77,255,0.35);display:grid;grid-template-rows:auto 1fr;overflow:hidden;}' +
      'header{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(14px);background:linear-gradient(to right,rgba(0,0,0,0.78),rgba(8,8,22,0.92));gap:14px;}' +
      '.brand{display:flex;align-items:center;gap:12px;}' +
      '.logo{width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 30% 0%,#00e5ff,transparent 55%),radial-gradient(circle at 70% 100%,#ff4081,transparent 60%),#050508;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.16);box-shadow:0 0 18px rgba(0,229,255,0.32),0 0 30px rgba(255,64,129,0.36);overflow:hidden;}' +
      '.logo img{width:80%;height:80%;object-fit:contain;}' +
      '.brand-text{display:flex;flex-direction:column;}' +
      '.brand-title{font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:13px;}' +
      '.brand-sub{font-size:11px;color:#a0a0c0;}' +
      '.user-info{display:flex;align-items:center;gap:10px;font-size:11px;color:#a0a0c0;}' +
      '.badge{border-radius:999px;padding:3px 9px;border:1px solid rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.14em;font-size:10px;}' +
      '.link{color:#00e5ff;text-decoration:none;font-size:11px;}' +
      'main{display:grid;grid-template-columns:290px 1fr;height:100%;}' +
      '.sidebar{border-right:1px solid rgba(255,255,255,0.08);padding:12px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(to bottom,rgba(0,0,0,0.78),rgba(7,7,18,0.98));}' +
      '.card{background:rgba(8,8,18,0.97);border-radius:18px;border:1px solid rgba(255,255,255,0.08);padding:10px 10px 12px 10px;font-size:12px;}' +
      '.section-title{text-transform:uppercase;letter-spacing:0.16em;font-size:10px;color:#a0a0c0;margin-bottom:4px;}' +
      '.input-row{display:flex;gap:6px;margin-top:6px;}' +
      'input[type=text],input[type=password],select{flex:1;padding:7px 9px;border-radius:999px;border:1px solid rgba(255,255,255,0.16);background:rgba(3,3,10,0.96);color:#f5f5ff;outline:none;font-size:12px;}' +
      'input::placeholder{color:rgba(160,160,192,0.7);}' +
      'select{cursor:pointer;}' +
      '.btn-primary{border:none;border-radius:999px;padding:7px 13px;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;cursor:pointer;background:linear-gradient(120deg,#00e5ff,#7c4dff,#ff4081);background-size:200% 200%;color:#05050a;box-shadow:0 0 18px rgba(0,229,255,0.55),0 0 32px rgba(255,64,129,0.55);white-space:nowrap;}' +
      '.btn-primary:hover{transform:translateY(-1px);background-position:100% 0;}' +
      '.btn-secondary{border-radius:999px;padding:5px 9px;border:1px solid rgba(255,255,255,0.18);background:transparent;color:#a0a0c0;font-size:10px;text-transform:uppercase;letter-spacing:0.12em;cursor:pointer;white-space:nowrap;}' +
      '.btn-secondary:hover{background:radial-gradient(circle at top,rgba(0,229,255,0.22),rgba(124,77,255,0.18));color:#f5f5ff;border-color:rgba(255,255,255,0.32);}' +
      '.bots-list{max-height:220px;overflow-y:auto;margin-top:6px;}' +
      '.bot-item{display:flex;align-items:center;justify-content:space-between;padding:6px 7px;margin-bottom:4px;border-radius:11px;background:rgba(12,12,24,0.97);border:1px solid rgba(255,255,255,0.06);font-size:12px;}' +
      '.bot-main{display:flex;flex-direction:column;}' +
      '.bot-name{font-weight:500;}' +
      '.bot-status{font-size:11px;color:#a0a0c0;}' +
      '.status-dot{width:8px;height:8px;border-radius:999px;margin-right:6px;background:#ff5252;box-shadow:0 0 10px rgba(255,82,82,0.75);}' +
      '.status-dot.online{background:#00e676;box-shadow:0 0 10px rgba(0,230,118,0.9);}' +
      '.bot-actions{display:flex;flex-direction:column;gap:4px;align-items:flex-end;}' +
      '.bot-active-label{font-size:9px;color:#00e5ff;text-transform:uppercase;letter-spacing:0.14em;}' +
      '.content{padding:10px 13px 13px 13px;display:flex;flex-direction:column;height:100%;gap:8px;}' +
      '#log{flex:1;border-radius:16px;background:rgba(6,6,16,0.97);border:1px solid rgba(255,255,255,0.08);padding:9px 11px;font-family:"JetBrains Mono","Fira Code",monospace;font-size:12px;overflow-y:auto;}' +
      '.log-line{margin-bottom:3px;}' +
      '.log-line.system{color:#a0a0c0;}' +
      '.log-line.error{color:#ff8a80;}' +
      '.log-line.chat span.from{color:#ff4081;}' +
      '.log-line.chat span.botTag{color:#00e5ff;font-size:11px;margin-right:4px;}' +
      '#inputArea{display:flex;gap:8px;margin-top:4px;}' +
      '#messageInput{flex:1;padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.16);background:rgba(5,5,14,0.97);color:#f5f5ff;outline:none;font-size:12px;}' +
      '#messageInput::placeholder{color:rgba(160,160,192,0.7);}' +
      '#activeBotDisplay{font-size:11px;color:#a0a0c0;}' +
      '@media(max-width:900px){main{grid-template-columns:1fr;}.sidebar{order:2;}}' +
      '</style></head><body>' +
      '<div class="app">' +
      '<header>' +
      '<div class="brand">' +
      '<div class="logo"><img src="/logo.png" alt="logo" onerror="this.style.display=\'none\'"></div>' +
      '<div class="brand-text">' +
      '<div class="brand-title">Skull Multi-Bot Panel</div>' +
      '<div class="brand-sub">Logged in as ' +
      user.username +
      ' · Role: ' +
      user.role +
      '</div>' +
      '</div></div>' +
      '<div class="user-info">' +
      '<a class="link" href="/logout">Logout</a>' +
      '<div class="badge">Control Panel</div>' +
      '</div></header>' +
      '<main>' +
      '<aside class="sidebar">' +
      '<div class="card">' +
      '<div class="section-title">Add bot</div>' +
      '<div>Choose a server and cracked username.</div>' +
      '<div class="input-row">' +
      '<input type="text" id="newUsername" placeholder="Username" />' +
      '</div>' +
      '<div class="input-row">' +
      '<select id="serverSelect"></select>' +
      '<button class="btn-primary" id="addBotBtn">Start</button>' +
      '</div>' +
      '</div>' +
      '<div class="card" style="flex:1;display:flex;flex-direction:column;">' +
      '<div class="section-title">Bots</div>' +
      '<div class="bots-list" id="botsList"></div>' +
      '</div>' +
      (isAdmin
        ? '<div class="card" id="adminPanel">' +
          '<div class="section-title">Admin · Servers</div>' +
          '<div>Add new Minecraft servers and manage existing ones.</div>' +
          '<div class="input-row"><input type="text" id="newServerName" placeholder="Name (e.g. Lobby)" /></div>' +
          '<div class="input-row"><input type="text" id="newServerHost" placeholder="Host (e.g. play.example.net)" /></div>' +
          '<div class="input-row"><input type="text" id="newServerPort" placeholder="Port (e.g. 25565)" /><input type="text" id="newServerVersion" placeholder="Version (e.g. 1.21.1)" /></div>' +
          '<div class="input-row"><button class="btn-primary" id="addServerBtn">Add Server</button></div>' +
          '<div class="section-title" style="margin-top:8px;">Servers list</div>' +
          '<div class="bots-list" id="serversList"></div>' +
          '<hr style="margin:10px 0;border-color:rgba(255,255,255,0.06);">' +
          '<div class="section-title">Admin · Users</div>' +
          '<div>Create panel accounts (admin or user).</div>' +
          '<div class="input-row"><input type="text" id="newUserName" placeholder="Username" /></div>' +
          '<div class="input-row"><input type="password" id="newUserPass" placeholder="Password" /></div>' +
          '<div class="input-row"><select id="newUserRole"><option value="user">User</option><option value="admin">Admin</option></select><button class="btn-primary" id="addUserBtn">Add User</button></div>' +
          '<div class="section-title" style="margin-top:8px;">Users</div>' +
          '<div class="bots-list" id="usersList"></div>' +
          '</div>'
        : '') +
      '</aside>' +
      '<section class="content">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<div class="section-title">Console</div>' +
      '<div id="activeBotDisplay">Active bot: <span id="activeBotName">none</span></div>' +
      '</div>' +
      '<div id="log"></div>' +
      '<div id="inputArea">' +
      '<input id="messageInput" type="text" placeholder="Type chat or /command for active bot and press Enter..." autocomplete="off" />' +
      '<button class="btn-primary" id="sendBtn">Send</button>' +
      '<button class="btn-secondary" id="clearBtn">Clear</button>' +
      '</div>' +
      '</section>' +
      '</main></div>' +
      '<script src="/socket.io/socket.io.js"></script>' +
      '<script>' +
      'var CURRENT_USER = { username: "' +
      user.username +
      '", role: "' +
      user.role +
      '" };' +
      'var socket = io();' +
      'var bots = [];var servers = [];var usersList = [];var activeBotId = null;' +
      'var botsListEl = document.getElementById("botsList");' +
      'var newUsernameEl = document.getElementById("newUsername");' +
      'var addBotBtn = document.getElementById("addBotBtn");' +
      'var serverSelectEl = document.getElementById("serverSelect");' +
      'var logEl = document.getElementById("log");' +
      'var messageInput = document.getElementById("messageInput");' +
      'var sendBtn = document.getElementById("sendBtn");' +
      'var clearBtn = document.getElementById("clearBtn");' +
      'var activeBotNameEl = document.getElementById("activeBotName");' +
      'var adminPanel = document.getElementById("adminPanel");' +
      'var newServerNameEl = document.getElementById("newServerName");' +
      'var newServerHostEl = document.getElementById("newServerHost");' +
      'var newServerPortEl = document.getElementById("newServerPort");' +
      'var newServerVersionEl = document.getElementById("newServerVersion");' +
      'var addServerBtn = document.getElementById("addServerBtn");' +
      'var serversListEl = document.getElementById("serversList");' +
      'var newUserNameEl = document.getElementById("newUserName");' +
      'var newUserPassEl = document.getElementById("newUserPass");' +
      'var newUserRoleEl = document.getElementById("newUserRole");' +
      'var addUserBtn = document.getElementById("addUserBtn");' +
      'var usersListEl = document.getElementById("usersList");' +
      'if (!adminPanel && CURRENT_USER.role === "admin") { console.warn("Admin panel element missing"); }' +
      'function setActiveBot(id){activeBotId=id;var bot=bots.find(function(b){return b.id===id;});activeBotNameEl.textContent=bot?bot.username:"none";renderBots();}' +
      'function addLogLine(text,type,from,botTag){var div=document.createElement("div");div.classList.add("log-line");if(type)div.classList.add(type);if(type==="chat"){var bt=document.createElement("span");bt.classList.add("botTag");bt.textContent="["+botTag+"] ";var f=document.createElement("span");f.classList.add("from");f.textContent="<"+from+"> ";var m=document.createElement("span");m.textContent=text;div.appendChild(bt);div.appendChild(f);div.appendChild(m);}else{div.textContent=text;}logEl.appendChild(div);logEl.scrollTop=logEl.scrollHeight;}' +
      'function renderBots(){botsListEl.innerHTML="";if(!bots.length){var s=document.createElement("div");s.style.fontSize="12px";s.style.color="#a0a0c0";s.textContent="No bots yet. Add one above.";botsListEl.appendChild(s);return;}bots.forEach(function(bot){var item=document.createElement("div");item.classList.add("bot-item");var main=document.createElement("div");main.classList.add("bot-main");var nameRow=document.createElement("div");nameRow.style.display="flex";nameRow.style.alignItems="center";var dot=document.createElement("div");dot.classList.add("status-dot");if(bot.status && bot.status.toLowerCase().indexOf("online")!==-1){dot.classList.add("online");}var nameSpan=document.createElement("span");nameSpan.classList.add("bot-name");nameSpan.textContent=bot.username+" @ "+(bot.serverName||\"?\");nameRow.appendChild(dot);nameRow.appendChild(nameSpan);var statusSpan=document.createElement("span");statusSpan.classList.add("bot-status");statusSpan.textContent=bot.status||"...";main.appendChild(nameRow);main.appendChild(statusSpan);var actions=document.createElement("div");actions.classList.add("bot-actions");if(activeBotId===bot.id){var lab=document.createElement("div");lab.classList.add("bot-active-label");lab.textContent="ACTIVE";actions.appendChild(lab);}var activateBtn=document.createElement("button");activateBtn.classList.add("btn-secondary");activateBtn.textContent=activeBotId===bot.id?"Active":"Set Active";activateBtn.disabled=activeBotId===bot.id;activateBtn.onclick=function(){setActiveBot(bot.id);};var removeBtn=document.createElement("button");removeBtn.classList.add("btn-secondary");removeBtn.textContent="Remove";removeBtn.onclick=function(){socket.emit("destroyBot",bot.id);};actions.appendChild(activateBtn);actions.appendChild(removeBtn);item.appendChild(main);item.appendChild(actions);botsListEl.appendChild(item);});}' +
      'function renderServersSelect(){if(!serverSelectEl)return;serverSelectEl.innerHTML="";servers.forEach(function(s){var opt=document.createElement("option");opt.value=String(s.id);opt.textContent=s.name+" ("+s.host+":"+s.port+")";serverSelectEl.appendChild(opt);});}' +
      'function renderServersList(){if(!serversListEl)return;serversListEl.innerHTML="";if(!servers.length){var s=document.createElement("div");s.style.fontSize="12px";s.style.color="#a0a0c0";s.textContent="No servers configured.";serversListEl.appendChild(s);return;}servers.forEach(function(srv){var row=document.createElement("div");row.classList.add("bot-item");var main=document.createElement("div");main.classList.add("bot-main");var n=document.createElement("span");n.classList.add("bot-name");n.textContent=srv.name;var st=document.createElement("span");st.classList.add("bot-status");st.textContent=srv.host+":"+srv.port+" · "+srv.version;main.appendChild(n);main.appendChild(st);var actions=document.createElement("div");actions.classList.add("bot-actions");var del=document.createElement
