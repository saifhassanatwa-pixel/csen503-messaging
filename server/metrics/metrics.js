// metrics.js : live server statistics for monitoring and for the report (owner: member 4)
// Member 1's server calls onConnect / onDisconnect / onMessage; the dashboard reads getStats().
import { fileURLToPath } from "node:url";

const DASHBOARD_FILE = fileURLToPath(new URL("./dashboard.html", import.meta.url));

const startedAt = Date.now();
const WINDOW_MS = 5000;                 // rates are averaged over the last 5 seconds

let activeConnections = 0;
let peakConnections = 0;
let totalMessages = 0;
let totalBytes = 0;
const connectionsByProtocol = { json: 0, text: 0 };
const messagesByProtocol = { json: 0, text: 0 };
const bytesByProtocol = { json: 0, text: 0 };
const recent = [];                      // { time, bytes } of messages in the last WINDOW_MS
let latencySum = 0;
let latencyCount = 0;

// Drop entries older than the window, so rates only count recent traffic
function trimWindow(now) {
  while (recent.length && now - recent[0].time > WINDOW_MS) recent.shift();
}

// A client connected using protocol "json" or "text"
export function onConnect(protocol) {
  activeConnections++;
  peakConnections = Math.max(peakConnections, activeConnections);
  if (protocol in connectionsByProtocol) connectionsByProtocol[protocol]++;
}

// A client's socket closed
export function onDisconnect(protocol) {
  activeConnections = Math.max(0, activeConnections - 1);
  if (protocol in connectionsByProtocol) connectionsByProtocol[protocol] = Math.max(0, connectionsByProtocol[protocol] - 1);
}

// The server received one message. bytes = length of the raw text on the wire.
// sentAt = the message's ts field (sender clock), used to estimate latency; leave out if unknown.
export function onMessage(protocol, bytes, sentAt) {
  const now = Date.now();
  totalMessages++;
  totalBytes += bytes;
  if (protocol in messagesByProtocol) {
    messagesByProtocol[protocol]++;
    bytesByProtocol[protocol] += bytes;
  }
  recent.push({ time: now, bytes });
  trimWindow(now);
  // Phone clocks can differ from the laptop's, so ignore impossible values
  if (sentAt && now - sentAt >= 0 && now - sentAt < 60000) {
    latencySum += now - sentAt;
    latencyCount++;
  }
}

// Everything the dashboard shows, as one object
export function getStats() {
  const now = Date.now();
  trimWindow(now);
  const windowBytes = recent.reduce((sum, m) => sum + m.bytes, 0);
  const avgSize = p => (messagesByProtocol[p] ? +(bytesByProtocol[p] / messagesByProtocol[p]).toFixed(1) : 0);
  return {
    uptimeSeconds: Math.round((now - startedAt) / 1000),
    activeConnections,
    peakConnections,
    connectionsByProtocol: { ...connectionsByProtocol },
    totalMessages,
    totalBytes,
    messagesPerSecond: +(recent.length / (WINDOW_MS / 1000)).toFixed(2),
    bytesPerSecond: Math.round(windowBytes / (WINDOW_MS / 1000)),
    messagesByProtocol: { ...messagesByProtocol },
    avgMessageBytes: { json: avgSize("json"), text: avgSize("text") },
    avgLatencyMs: latencyCount ? +(latencySum / latencyCount).toFixed(1) : null,
  };
}

// Add the two metrics routes to member 1's Express app:  addMetricsRoutes(app)
//   /metrics       -> the live dashboard page
//   /metrics.json  -> the raw numbers (the page fetches this every second)
export function addMetricsRoutes(app) {
  app.get("/metrics", (req, res) => res.sendFile(DASHBOARD_FILE));
  app.get("/metrics.json", (req, res) => res.json(getStats()));
}
