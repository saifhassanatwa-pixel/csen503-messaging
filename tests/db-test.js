// db-test.js : quick check that database.js works, run with:  node tests/db-test.js
import { registerUser, checkLogin, saveMessage, markDelivered, getUndelivered, getHistory }
  from "../server/db/database.js";

console.log("register ali:", registerUser("ali", "1234"));
console.log("register sara:", registerUser("sara", "abcd"));
console.log("register ali again (should fail):", registerUser("ali", "xxxx"));

console.log("login ali right password (true):", checkLogin("ali", "1234"));
console.log("login ali wrong password (false):", checkLogin("ali", "nope"));

const msg = { id: "test-" + Date.now(), from: "ali", to: "sara", body: "hello sara", ts: Date.now(), protocol: "json" };
console.log("save message (true):", saveMessage(msg, ["sara"]));
console.log("save same message again (false = duplicate blocked):", saveMessage(msg, ["sara"]));

console.log("sara undelivered (1 or more):", getUndelivered("sara").length);
markDelivered(msg.id, "sara");
console.log("sara history:", getHistory("sara").map(m => `${m.sender} -> ${m.receiver}: ${m.body}`));
