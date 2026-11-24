// groups-test.js : check group chat works without the real server, run with:  node tests/groups-test.js
import { registerUser, getUndelivered } from "../server/db/database.js";
import { createGroup, getGroups, getGroupMembers, sendToGroup } from "../server/groups.js";

// Make sure the test users exist (fails quietly if they already do)
for (const name of ["ali", "sara", "omar"]) registerUser(name, "1234");

const groupName = "team-" + Date.now();          // new name each run
console.log("create group (true):", createGroup(groupName, "ali", ["sara", "omar"]));
console.log("create same group again (false):", createGroup(groupName, "ali", []));
console.log("group with unknown user (false):", createGroup(groupName + "x", "ali", ["nobody"]));
console.log("members:", getGroupMembers(groupName));
console.log("ali's groups include it:", getGroups("ali").includes(groupName));

// Pretend sara is online and omar is offline
const fakeSendTo = (user, msg) => {
  if (user === "sara") { console.log(`  -> delivered live to sara: "${msg.body}"`); return true; }
  return false;
};

const msg = { id: "g-" + Date.now(), from: "ali", group: groupName, body: "hi team", ts: Date.now(), protocol: "text" };
console.log("send to group:", sendToGroup(msg, fakeSendTo));
console.log("send same again (duplicate: true, nobody gets it twice):", sendToGroup(msg, fakeSendTo));
console.log("omar was offline, waiting for him:", getUndelivered("omar").some(m => m.id === msg.id));
console.log("outsider tries to send (ok: false):",
  sendToGroup({ ...msg, id: "g2-" + Date.now(), from: "nobody" }, fakeSendTo));