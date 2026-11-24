// metrics-test.js : check the counters without the real server, run with:  node tests/metrics-test.js
import { onConnect, onDisconnect, onMessage, getStats } from "../server/metrics/metrics.js";

onConnect("json");
onConnect("text");
onConnect("json");
onDisconnect("json");                                   // one json client leaves

onMessage("json", 120, 2);                              // a 120-byte json message the server handled in 2 ms
onMessage("json", 110, 4);
onMessage("text", 60, 3);

const s = getStats();
console.log(s);
console.log("active should be 2:", s.activeConnections);
console.log("peak should be 3:", s.peakConnections);
console.log("total should be 3:", s.totalMessages);
console.log("avg json size should be 115:", s.avgMessageBytes.json);
console.log("server time should be 3 ms:", s.avgProcessingMs);