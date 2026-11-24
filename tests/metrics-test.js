// metrics-test.js : check the counters without the real server, run with:  node tests/metrics-test.js
import { onConnect, onDisconnect, onMessage, getStats } from "../server/metrics/metrics.js";

onConnect("json");
onConnect("text");
onConnect("json");
onDisconnect("json");                                   // one json client leaves

onMessage("json", 120, Date.now() - 15);                // a 120-byte json message sent 15 ms ago
onMessage("json", 110, Date.now() - 25);
onMessage("text", 60, Date.now() - 10);

const s = getStats();
console.log(s);
console.log("active should be 2:", s.activeConnections);
console.log("peak should be 3:", s.peakConnections);
console.log("total should be 3:", s.totalMessages);
console.log("avg json size should be 115:", s.avgMessageBytes.json);
console.log("latency should be about 17 ms:", s.avgLatencyMs);
