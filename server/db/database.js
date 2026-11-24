// database.js : every function that reads or writes the SQLite database (owner: member 4)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// Paths are relative to THIS file, so it works no matter where you run node from
const DB_FILE = new URL("./chat.db", import.meta.url);
const SCHEMA_FILE = new URL("./schema.sql", import.meta.url);

// Open (or create) the database file and make sure all tables exist
const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA foreign_keys = ON;");           // SQLite ignores REFERENCES unless this is on
db.exec("PRAGMA journal_mode = WAL;");          // faster writes: many messages per second without blocking
db.exec("PRAGMA synchronous = NORMAL;");
db.exec(readFileSync(SCHEMA_FILE, "utf8"));

// Prepared once at startup and reused for every message (much faster than preparing each time)
const insertMessage = db.prepare(
  `INSERT OR IGNORE INTO messages (id, sender, receiver, group_name, body, sent_at, protocol)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertDelivery = db.prepare("INSERT OR IGNORE INTO deliveries (message_id, username) VALUES (?, ?)");

// Turn a password + salt into a hash. Same inputs always give the same hash.
function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

// Turn a database row into the same message shape the protocols use (from, to, group, ts)
function toMessage(row) {
  return { type: "chat", id: row.id, from: row.sender, to: row.receiver || "",
           group: row.group_name || "", ts: row.sent_at, body: row.body };
}

// Register a new user. Returns true if created, false if the name is taken or empty.
export function registerUser(username, password) {
  if (!username || !password) return false;
  const salt = randomBytes(16).toString("hex");
  try {
    db.prepare("INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)")
      .run(username, hashPassword(password, salt), salt, Date.now());
    return true;
  } catch {
    return false;                               // PRIMARY KEY blocked a duplicate name
  }
}

// Check a login. Returns true only if the user exists and the password matches.
export function checkLogin(username, password) {
  const user = db.prepare("SELECT password_hash, salt FROM users WHERE username = ?").get(username);
  if (!user) return false;
  const attempt = Buffer.from(hashPassword(password, user.salt), "hex");
  return timingSafeEqual(attempt, Buffer.from(user.password_hash, "hex"));
}

// Save a message once, plus one delivery row per receiver.
// receivers = who should get it; for a private message it defaults to the one person in msg.to.
// Returns true if saved, false if this id was already saved (a duplicate resend).
export function saveMessage(msg, receivers = msg.to ? [msg.to] : []) {
  db.exec("BEGIN");                             // message + its delivery rows are saved together, or not at all
  try {
    const result = insertMessage.run(msg.id, msg.from, msg.to || null, msg.group || null,
                                     msg.body, msg.ts, msg.protocol || null);
    if (result.changes === 0) {                 // id existed already -> duplicate, ignore it
      db.exec("ROLLBACK");
      return false;
    }
    for (const user of receivers) insertDelivery.run(msg.id, user);
    db.exec("COMMIT");
    return true;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Mark that one user has received one message (called when their ack arrives)
export function markDelivered(messageId, username) {
  db.prepare("UPDATE deliveries SET delivered = 1 WHERE message_id = ? AND username = ?")
    .run(messageId, username);
}

// Messages this user has NOT received yet (sent while they were offline), oldest first
export function getUndelivered(username) {
  return db.prepare(
    `SELECT m.* FROM messages m
     JOIN deliveries d ON d.message_id = m.id
     WHERE d.username = ? AND d.delivered = 0
     ORDER BY m.sent_at`
  ).all(username).map(toMessage);
}

// Full chat history for a user: everything they sent or were meant to receive, oldest first
export function getHistory(username) {
  return db.prepare(
    `SELECT DISTINCT m.* FROM messages m
     LEFT JOIN deliveries d ON d.message_id = m.id
     WHERE m.sender = ? OR d.username = ?
     ORDER BY m.sent_at`
  ).all(username, username).map(toMessage);
}

// Let other files (groups.js) run their own queries on the same connection
export { db };
