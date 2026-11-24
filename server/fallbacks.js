// TEMPORARY stand-ins so the skeleton runs before teammates push their files.
// They are only used when the real file does not exist yet.

// ---- Protocols (Member 3 will provide protocols/index.js) ----
export const protocols = {
  // Returns a JSON encoder/decoder pair (same shape as the real getProtocol).
  getProtocol() {
    return {
      encode: (msg) => JSON.stringify(msg),
      decode: (text) => {
        const msg = JSON.parse(text);
        if (!msg || typeof msg !== "object" || !msg.type) throw new Error("not a valid message");
        return msg;
      },
    };
  },
};

// ---- Database (Member 4 will provide server/db/database.js) ----
const users = new Map();
const messages = [];
export const db = {
  // Creates a user; returns false if the name is taken.
  registerUser(name, pw) {
    if (users.has(name)) return false;
    users.set(name, pw); // plain text only because this is temporary
    return true;
  },
  // Returns true if the username/password pair is correct.
  checkLogin(name, pw) {
    return users.get(name) === pw;
  },
  // Saves a message; returns false if its id was already saved (duplicate).
  saveMessage(msg) {
    if (messages.some((m) => m.id === msg.id)) return false;
    messages.push({ ...msg, delivered: false });
    return true;
  },
  // Marks a message as delivered to the receiver.
  markDelivered(id) {
    const m = messages.find((x) => x.id === id);
    if (m) m.delivered = true;
  },
  // All messages the user sent or received.
  getHistory(user) {
    return messages.filter((m) => m.from === user || m.to === user);
  },
  // Messages sent to the user that were never delivered.
  getUndelivered(user) {
    return messages.filter((m) => m.to === user && !m.delivered);
  },
};

// ---- Groups (Member 4 will provide server/groups.js) ----
export const groups = {
  createGroup() { return true; },
  getGroups() { return []; },
  getGroupMembers() { return []; },
  sendToGroup() { return true; },
};

// ---- Metrics (Member 4 will provide server/metrics/metrics.js) ----
const stats = { activeConnections: 0, totalMessages: 0 };
export const metrics = {
  onConnect() { stats.activeConnections++; },
  onDisconnect() { stats.activeConnections--; },
  onMessage() { stats.totalMessages++; },
  getStats() { return { ...stats }; },
};