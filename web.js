// web.js - main server file for Render

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mineflayer = require("mineflayer");
const session = require("express-session");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// ---- PANEL USERS ----
let users = [
  { username: "admin", password: "admin123", role: "admin" }
];

// ---- SERVER CONFIGS ----
let servers = [
  { id: 1, name: "Default", host: "play.mcbegedis.lt", port: 25565, version: "1.21.1" }
];
let nextServerId = 2;

// ---- BOTS ----
const bots = new Map();
let nextBotId = 1;

// ---- EXPRESS SETUP ----
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "super-secret-change-me",
    resave: false,
    saveUninitialized: false
  })
);

// views/ + ejs for .html
app.set("views", path.join(__dirname, "views"));
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");

// ---- AUTH MIDDLEWARE ----
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ---- ROUTES ----
app.get("/login", (req, res) => {
  res.render("login.html", { error: false });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(u => u.username === String(username || "").trim());

  if (!user || user.password !== String(password || "")) {
    return res.render("login.html", { error: true });
  }

  req.session.user = { username: user.username, role: user.role };
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

app.get("/", requireLogin, (req, res) => {
  res.render("panel.html", { user: req.session.user });
});

// ---- BOT HELPERS ----
function snapshotBots() {
  return Array.from(bots.values()).map(b => ({
    id: b.id,
    username: b.username,
    serverId: b.serverId,
    status: b.status,
    server: servers.find(s => s.id === b.serverId) || null
  }));
}

function createBot(username, serverId) {
  const serverCfg = servers.find(s => s.id === serverId) || servers[0];
  if (!serverCfg) return;

  const id = nextBotId++;
  const wrapper = {
    id,
    username,
    serverId: serverCfg.id,
    status: "Connecting...",
    bot: null
  };
  bots.set(id, wrapper);

  const bot = mineflayer.createBot({
    host: serverCfg.host,
    port: serverCfg.port,
    username,
    version: serverCfg.version
  });
  wrapper.bot = bot;

  function update(status) {
    wrapper.status = status;
    io.emit("botsUpdate", snapshotBots());
  }

  bot.on("login", () => update("Online"));
  bot.on("end", () => update("Disconnected"));
  bot.on("kicked", (reason) => update("Kicked"));
  bot.on("error", (err) => update("Error"));

  // Chat / messages
  bot.on("message", (jsonMsg) => {
    const text = jsonMsg.toString();
    io.emit("chat", {
      botId: id,
      username,
      message: text
    });
  });

  io.emit("botsUpdate", snapshotBots());
}

// ---- SOCKET.IO ----
io.on("connection", (socket) => {
  // send current state
  socket.emit("serversUpdate", servers);
  socket.emit("botsUpdate", snapshotBots());
  socket.emit(
    "usersUpdate",
    users.map(u => ({ username: u.username, role: u.role }))
  );

  // create bot
  socket.on("createBot", (data) => {
    if (!data) return;
    const username = String(data.username || "").trim();
    const serverId = Number(data.serverId) || servers[0].id;
    if (!username) return;
    createBot(username, serverId);
  });

  // send chat from bot
  socket.on("sendChat", (data) => {
    if (!data) return;
    const msg = String(data.message || "").trim();
    const wrapper = bots.get(data.botId);
    if (!wrapper || !wrapper.bot || !msg) return;
    try {
      wrapper.bot.chat(msg);
    } catch (e) {
      console.error("Error sending chat:", e);
    }
  });

  // remove bot
  socket.on("destroyBot", (botId) => {
    const wrapper = bots.get(botId);
    if (!wrapper) return;
    try { wrapper.bot.end(); } catch {}
    bots.delete(botId);
    io.emit("botsUpdate", snapshotBots());
  });

  // admin: add server
  socket.on("addServer", (s) => {
    if (!s) return;
    const name = String(s.name || "").trim();
    const host = String(s.host || "").trim();
    const port = Number(s.port) || 25565;
    const version = String(s.version || "1.21.1").trim();
    if (!name || !host) return;

    servers.push({ id: nextServerId++, name, host, port, version });
    io.emit("serversUpdate", servers);
  });

  // admin: add user
  socket.on("addUser", (u) => {
    if (!u) return;
    const username = String(u.username || "").trim();
    const password = String(u.password || "");
    const role = u.role === "admin" ? "admin" : "user";
    if (!username || !password) return;
    if (users.find(x => x.username === username)) return;

    users.push({ username, password, role });
    io.emit(
      "usersUpdate",
      users.map(x => ({ username: x.username, role: x.role }))
    );
  });
});

// ---- START SERVER ----
server.listen(PORT, () => {
  console.log("Panel running on port " + PORT);
});
