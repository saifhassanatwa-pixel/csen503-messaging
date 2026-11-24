import { addUser, removeUser, onlineUsers, sendTo, sendToSocket, broadcast, getProtocolFor } from "./connections.js";
import { load } from "./loader.js";
import * as fallbacks from "./fallbacks.js";

const db = await load("./db/database.js", fallbacks.db);
const groups = await load("./groups.js", fallbacks.groups);
const metrics = await load("./metrics/metrics.js", fallbacks.metrics);

// Makes a unique message id (no crypto.randomUUID: phone browsers block it on http://).
export function newId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

// Builds a message object sent by the server itself.
function makeMsg(type, to, body, id = newId()) {
  return { type, id, from: "server", to, group: "", ts: Date.now(), body };
}

// Usernames and group names: letters, digits, underscore only (a "|" would break the text protocol).
function validName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_]{1,20}$/.test(name);
}

// Sends an "error" message to one socket.
function sendError(socket, text) {
  sendToSocket(socket, makeMsg("error", socket.username || "", text));
}

// Sends the current online-users list to everybody.
function broadcastUsers() {
  broadcast(makeMsg("users", "", JSON.stringify(onlineUsers())));
}

// Called once per new socket: stores its protocol and counts the connection.
export function handleConnect(socket, protoName) {
  socket.protoName = protoName;
  socket.codec = getProtocolFor(protoName);
  socket.username = null; // set after login
  metrics.onConnect();
}

// Called when a socket closes: removes only that user and updates everyone's online list.
export function handleClose(socket) {
  metrics.onDisconnect();
  if (socket.username && removeUser(socket.username, socket)) broadcastUsers();
}

// Returns the live statistics (used by /metrics.json).
export function getStats() {
  return metrics.getStats();
}

// Entry point for every raw text message: decode, then call the right handler.
export async function handleMessage(socket, raw) {
  const started = Date.now();
  let msg;
  try {
    msg = socket.codec.decode(raw);
  } catch (err) {
    sendError(socket, "Unreadable message: " + err.message);
    return;
  }
  try {
    switch (msg.type) {
      case "register": await handleRegister(socket, msg); break;
      case "login": await handleLogin(socket, msg); break;
      case "chat": await handleChat(socket, msg); break;
      case "ack": await handleAck(socket, msg); break;
      case "create_group": await handleCreateGroup(socket, msg); break;
      default: sendError(socket, "Unknown message type: " + msg.type);
    }
  } catch (err) {
    console.error("[router] handler failed:", err);
    sendError(socket, "Server error");
  }
  if (msg.type === "chat") {
    // Server processing time (phone clocks differ from the laptop's, so we don't use msg.ts).
    metrics.onMessage(socket.protoName, Buffer.byteLength(raw), Date.now() - started);
  }
}

// register: from = username, body = password. Creates the account, then logs in.
async function handleRegister(socket, msg) {
  const name = msg.from;
  if (!validName(name) || !msg.body) {
    return sendToSocket(socket, makeMsg("auth_error", "", "Invalid username or password"));
  }
  const created = await db.registerUser(name, msg.body);
  if (!created) {
    return sendToSocket(socket, makeMsg("auth_error", "", "Username already taken"));
  }
  await finishLogin(socket, name);
}

// login: same fields as register. Checks the password.
async function handleLogin(socket, msg) {
  const name = msg.from;
  const ok = validName(name) && (await db.checkLogin(name, msg.body));
  if (!ok) {
    return sendToSocket(socket, makeMsg("auth_error", "", "Wrong username or password"));
  }
  await finishLogin(socket, name);
}

// After a successful login: register the user, send history, groups and missed messages.
async function finishLogin(socket, name) {
  socket.username = name;
  addUser(name, socket);
  sendToSocket(socket, makeMsg("auth_ok", name, "Welcome " + name));

  const history = await db.getHistory(name);
  sendToSocket(socket, makeMsg("history", name, JSON.stringify(history)));

  const myGroups = await groups.getGroups(name);
  sendToSocket(socket, makeMsg("groups", name, JSON.stringify(myGroups)));

  // Everything that arrived while the user was offline (reliability rule 4).
  const missed = await db.getUndelivered(name);
  for (const m of missed) sendToSocket(socket, { ...m, type: "chat" });

  broadcastUsers();
}

// chat: save, ack the sender, forward to the receiver (or the group).
async function handleChat(socket, msg) {
  if (!socket.username) return sendError(socket, "Please log in first");
  if (!msg.id || !msg.body || (!msg.to && !msg.group)) {
    return sendError(socket, "Chat message needs id, body and to/group");
  }
  msg.from = socket.username; // never trust the "from" field the client sent

  let isNew = true;
  if (msg.group) {
    await groups.sendToGroup(msg); // saves once and sends to each online member
  } else {
    isNew = await db.saveMessage(msg); // false = duplicate resend, ignored
  }

  // Always ack, even for duplicates, so the sender's outbox can empty.
  sendToSocket(socket, makeMsg("ack", msg.from, "", msg.id));

  // Forward only the first copy; if the receiver is offline it stays undelivered in the db.
  if (!msg.group && isNew) sendTo(msg.to, msg);
}

// ack from a client: "I received message <id>" -> mark it delivered.
async function handleAck(socket, msg) {
  if (!socket.username) return;
  await db.markDelivered(msg.id, socket.username);
}

// create_group: group = name, body = comma-separated members.
async function handleCreateGroup(socket, msg) {
  if (!socket.username) return sendError(socket, "Please log in first");
  if (!validName(msg.group)) return sendError(socket, "Invalid group name");

  const members = String(msg.body || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!members.includes(socket.username)) members.push(socket.username);

  const ok = await groups.createGroup(msg.group, socket.username, members);
  if (ok === false) return sendError(socket, "Could not create group (name taken?)");

  // Tell every member (who is online) their updated group list.
  for (const member of members) {
    const list = await groups.getGroups(member);
    sendTo(member, makeMsg("groups", member, JSON.stringify(list)));
  }
}