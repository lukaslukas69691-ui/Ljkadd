// panel.js
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

// ------------ USERS (admin panel accounts) -------------
let users = [
  { username: "admin", password: "admin123", role: "admin" }
];

// ------------ SERVERS CONFIG ---------------------------
let servers = [
  { id: 1, name: "Default", host: "play.mcbegedis.lt", port: 25565, version: "1.21.1" }
];
let nextServerId = 2;

// ------------ BOTS ---------------------------
let bots = new Map();
let nextBotId = 1;

// ------------ EXPRESS SETUP ---------------------------
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: "CHANGE_THIS_SECRET",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "html");
app.engine("html", require("ejs").renderFile);

// ------------ AUTH MIDDLEWARE ---------------------------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// ------------ ROUTES ---------------------------
app.get("/login", (req, res) => {
  res.render("login.html", { error: false });
});

app.post("/login", (req, res) => {
  let { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user || user.password !== password)
    return res.render("login.html", { error: true });

  req.session.user = { username: user.username, role: user.role };
  res.redirect("/");
});

app.get("/", requireLogin, (req, res) => {
  res.render("panel.html", {
    user: req.session.user
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ------------ BOT CREATION ---------------------------
function createBot(username, serverId) {
  const serverCfg = servers.find(s => s.id === serverId);
  if (!serverCfg) return;

  const id = nextBotId++;
  const wrapper = {
    id,
    username,
    serverId,
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
  bot.on("kicked", () => update("Kicked"));
  bot.on("error", () => update("Error"));

  bot.on("message", (json) => {
    io.emit("chat", {
      botId: id,
      username,
      message: json.toString(),
    });
  });

  io.emit("botsUpdate", snapshotBots());
}

function snapshotBots() {
  return [...bots.values()].map(b => ({
    id: b.id,
    username: b.username,
    serverId: b.serverId,
    status: b.status,
    server: servers.find(s => s.id === b.serverId)
  }));
}

// ------------ SOCKET.IO EVENTS ---------------------------
io.on("connection", socket => {
  socket.emit("serversUpdate", servers);
  socket.emit("botsUpdate", snapshotBots());
  socket.emit("usersUpdate", users.map(u => ({ username: u.username, role: u.role })));

  socket.on("createBot", data => {
    createBot(data.username, data.serverId);
  });

  socket.on("sendChat", data => {
    let w = bots.get(data.botId);
    if (w && w.bot) w.bot.chat(data.message);
  });

  socket.on("destroyBot", botId => {
    let w = bots.get(botId);
    if (w) {
      w.bot.end();
      bots.delete(botId);
      io.emit("botsUpdate", snapshotBots());
    }
  });

  // --- Admin functions ---
  socket.on("addServer", s => {
    s.id = nextServerId++;
    servers.push(s);
    io.emit("serversUpdate", servers);
  });

  socket.on("addUser", u => {
    users.push(u);
    io.emit("usersUpdate", users);
  });
});

// ------------ START ---------------------------
server.listen(PORT, () => {
  console.log("Panel running → http://localhost:" + PORT);
});
