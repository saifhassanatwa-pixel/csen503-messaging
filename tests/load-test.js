// load-test.js : opens many fake clients, sends messages, and measures latency / loss / duplicates (owner: member 4)
// Start the server first (npm start), then in a second terminal:
//   node tests/load-test.js <clients> <messagesEach> <json|text> <private|group> [serverIP]
// Examples:
//   node tests/load-test.js 5 20 json private
//   node tests/load-test.js 20 20 text group
import WebSocket from "ws";
import { getProtocol } from "../protocols/index.js";

const CLIENTS = Number(process.argv[2] || 5);
const MESSAGES = Number(process.argv[3] || 20);
const PROTO = process.argv[4] === "text" ? "text" : "json";
const MODE = process.argv[5] === "group" ? "group" : "private";
const HOST = process.argv[6] || "localhost";
const RUN = "run" + Date.now();                 // tag so we only count messages from THIS run
const { encode, decode } = getProtocol(PROTO);

if (CLIENTS < 2) { console.log("Need at least 2 clients"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const latencies = [];                           // one entry per received message, in ms
const seen = new Set();                         // "receiver:id" pairs already received
let duplicates = 0;

// Open one client socket and log it in as load<i> (registers the first time)
async function startClient(i) {
  const user = "load" + i;
  const ws = new WebSocket(`ws://${HOST}:3000/?proto=${PROTO}`);
  const waiting = [];                           // promises waiting for a reply of some type

  ws.on("message", raw => {
    const msg = decode(raw.toString());
    // A chat message from this run: record latency, catch duplicates, send the ack back
    if (msg.type === "chat" && msg.id.startsWith(RUN)) {
      const key = user + ":" + msg.id;
      if (seen.has(key)) duplicates++;
      else { seen.add(key); latencies.push(Date.now() - Number(msg.ts)); }
      ws.send(encode({ type: "ack", id: msg.id, from: user, to: "", group: "", ts: Date.now(), body: "" }));
    }
    // Wake up anyone waiting for this type of reply
    const w = waiting.findIndex(x => x.types.includes(msg.type));
    if (w >= 0) waiting.splice(w, 1)[0].resolve(msg);
  });
  const waitFor = (...types) => new Promise(resolve => waiting.push({ types, resolve }));
  const send = msg => ws.send(encode({ id: "", from: user, to: "", group: "", ts: Date.now(), body: "", ...msg }));

  await new Promise((resolve, reject) => { ws.on("open", resolve); ws.on("error", reject); });
  send({ type: "register", body: "load" });
  await waitFor("auth_ok", "auth_error");       // error just means already registered
  send({ type: "login", body: "load" });
  const reply = await waitFor("auth_ok", "auth_error");
  if (reply.type !== "auth_ok") throw new Error(user + " could not log in");
  return { user, ws, send, waitFor };
}

console.log(`${CLIENTS} clients · ${MESSAGES} messages each · ${PROTO} · ${MODE}`);
const clients = [];
for (let i = 0; i < CLIENTS; i++) clients.push(await startClient(i));

// Group mode: client 0 makes one group containing everybody
const groupName = RUN + "-group";
if (MODE === "group") {
  clients[0].send({ type: "create_group", group: groupName, body: clients.map(c => c.user).join(",") });
  await clients[0].waitFor("groups", "error");
}

// Every client sends its messages: to the next client (private) or to the group
const started = Date.now();
await Promise.all(clients.map(async (c, i) => {
  for (let n = 0; n < MESSAGES; n++) {
    const target = MODE === "group" ? { group: groupName } : { to: clients[(i + 1) % CLIENTS].user };
    c.send({ type: "chat", id: `${RUN}-${i}-${n}`, body: `message ${n} from ${c.user}`, ts: Date.now(), ...target });
    await sleep(10);                            // small gap, like fast typing
  }
}));

// Wait until everything arrived, or give up after 10 s
const expected = MODE === "group" ? CLIENTS * MESSAGES * (CLIENTS - 1) : CLIENTS * MESSAGES;
const deadline = Date.now() + 10000;
while (latencies.length < expected && Date.now() < deadline) await sleep(50);
const seconds = (Date.now() - started) / 1000;

// Results
latencies.sort((a, b) => a - b);
const avg = latencies.reduce((s, x) => s + x, 0) / (latencies.length || 1);
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
console.log(`expected deliveries : ${expected}`);
console.log(`received            : ${latencies.length}`);
console.log(`lost                : ${expected - latencies.length}`);
console.log(`duplicates          : ${duplicates}`);
console.log(`latency avg / p95 / max (ms): ${avg.toFixed(1)} / ${p95} / ${latencies.at(-1) ?? 0}`);
console.log(`throughput          : ${(latencies.length / seconds).toFixed(1)} messages/s`);

for (const c of clients) c.ws.close();
process.exit(0);
