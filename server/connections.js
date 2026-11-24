import { load } from "./loader.js";
import { protocols as fallbackProtocols } from "./fallbacks.js";

const protocols = await load("../protocols/index.js", fallbackProtocols);

// Online users: username -> WebSocket
const users = new Map();

// Registers a logged-in user; if the name is already online, the old socket is closed.
export function addUser(name, socket) {
  const old = users.get(name);
  users.set(name, socket);
  if (old && old !== socket) old.close(4000, "Logged in from another place");
}

// Removes a user, but only if this exact socket is still the registered one.
export function removeUser(name, socket) {
  if (socket && users.get(name) !== socket) return false;
  return users.delete(name);
}

// Returns the list of online usernames.
export function onlineUsers() {
  return [...users.keys()];
}

// Returns the encode/decode module for "json" or "text".
export function getProtocolFor(name) {
  return protocols.getProtocol(name);
}

// Encodes a message in this socket's own protocol and sends it; returns false on failure.
export function sendToSocket(socket, msg) {
  if (socket.readyState !== 1) return false; // 1 = OPEN
  try {
    socket.send(socket.codec.encode(msg));
    return true;
  } catch (err) {
    console.error("[send] failed:", err.message);
    return false;
  }
}

// Sends a message to one user by name; returns false if that user is offline.
export function sendTo(name, msg) {
  const socket = users.get(name);
  return socket ? sendToSocket(socket, msg) : false;
}

// Sends a message to every online user.
export function broadcast(msg) {
  for (const socket of users.values()) sendToSocket(socket, msg);
}