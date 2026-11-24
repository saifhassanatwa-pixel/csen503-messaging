import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { handleConnect, handleMessage, handleClose, getStats } from "./router.js";

const PORT = 3000;
const ROOT = path.resolve(import.meta.dirname, ".."); // project root folder

// ---- Express: serves the web pages ----
const app = express();
app.use("/protocols", express.static(path.join(ROOT, "protocols"))); // shared with the browser
app.use(express.static(path.join(ROOT, "client")));                  // "/" -> client/index.html
app.get("/ping", (req, res) => res.send("Server is running"));
app.get("/metrics", (req, res) => res.sendFile(path.join(ROOT, "server", "metrics", "dashboard.html")));
app.get("/metrics.json", async (req, res) => {
  try {
    res.json(await getStats());
  } catch {
    res.status(500).json({ error: "metrics unavailable" });
  }
});

// ---- WebSocket server on the same port ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Runs for every new client: reads ?proto=, wires up message/close/error handlers.
wss.on("connection", (socket, req) => {
  const wanted = new URL(req.url, "http://localhost").searchParams.get("proto");
  const protoName = wanted === "text" ? "text" : "json"; // default json
  socket.isAlive = true;
  handleConnect(socket, protoName);

  socket.on("pong", () => { socket.isAlive = true; });
  socket.on("message", (data) => handleMessage(socket, data.toString()));
  socket.on("close", () => handleClose(socket));
  socket.on("error", (err) => console.error("[socket] error:", err.message));
});

// Every 30 s: drop sockets that did not answer the previous ping.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

// Finds this laptop's IPv4 addresses so we can print the link for the phones.
function laptopIPs() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  for (const ip of laptopIPs()) console.log(`  Phones open: http://${ip}:${PORT}`);
});