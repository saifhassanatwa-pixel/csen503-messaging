// groups.js : group chat — create groups, list them, send one message to every member (owner: member 4)
import { db, saveMessage } from "./db/database.js";

// Create a group. members = list of usernames; the owner is always added too.
// Returns { ok: true } or { ok: false, error: "..." }
export function createGroup(name, owner, members) {
  if (!name) return { ok: false, error: "Group name required" };
  const everyone = [...new Set([owner, ...members])];          // Set removes repeated names
  // A transaction: either the group AND all members are saved, or nothing is
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO groups (name, owner, created_at) VALUES (?, ?, ?)").run(name, owner, Date.now());
    const addMember = db.prepare("INSERT OR IGNORE INTO group_members (group_name, username) VALUES (?, ?)");
    for (const user of everyone) addMember.run(name, user);
    db.exec("COMMIT");
    return { ok: true };
  } catch (err) {
    db.exec("ROLLBACK");                                         // undo the half-made group
    // PRIMARY KEY on name -> group exists; FOREIGN KEY -> a member is not a registered user
    return { ok: false, error: err.message.includes("FOREIGN") ? "Unknown user in member list" : "Group name already taken" };
  }
}

// Names of all groups this user belongs to
export function getGroups(username) {
  return db.prepare("SELECT group_name FROM group_members WHERE username = ? ORDER BY group_name")
    .all(username).map(row => row.group_name);
}

// Usernames of everyone in a group
export function getGroupMembers(groupName) {
  return db.prepare("SELECT username FROM group_members WHERE group_name = ?")
    .all(groupName).map(row => row.username);
}

// Send a group message: save it ONCE, then forward it to every online member except the sender.
// sendTo(username, msg) comes from member 1's connections.js and returns false if that user is offline.
// Offline members still get a delivery row, so they receive it on their next login.
// Returns { ok, duplicate, error? }
export function sendToGroup(msg, sendTo) {
  const members = getGroupMembers(msg.group);
  if (!members.includes(msg.from)) return { ok: false, error: "You are not in this group" };

  const receivers = members.filter(user => user !== msg.from);
  const saved = saveMessage(msg, receivers);
  if (!saved) return { ok: true, duplicate: true };              // a resend: already saved and forwarded

  for (const user of receivers) sendTo(user, msg);
  return { ok: true, duplicate: false };
}
