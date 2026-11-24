# Connecting member 4's code to the server (stage 6)

Do this together with member 1, AFTER their server skeleton is in `main`.
First, in GitHub Desktop: Branch -> Update from main.

## 1. Imports at the top of member 1's server file(s)

```js
import { registerUser, checkLogin, saveMessage, markDelivered, getUndelivered, getHistory } from "./db/database.js";
import { createGroup, getGroups, sendToGroup } from "./groups.js";
import { onConnect, onDisconnect, onMessage, addMetricsRoutes } from "./metrics/metrics.js";
```

## 2. Right after `const app = express();`

```js
addMetricsRoutes(app);   // adds /metrics (live page) and /metrics.json
```

## 3. When a socket connects (`proto` = "json" or "text" from ?proto=)

```js
onConnect(proto);
```

## 4. When a socket closes

```js
onDisconnect(proto);
```

## 5. Every time a raw message arrives, after decoding it

```js
onMessage(proto, raw.length, msg.type === "chat" ? msg.ts : undefined);
```

## 6. Inside the `switch (msg.type)`

```js
case "register": {
  const r = registerUser(msg.from, msg.body);
  send(ws, { type: r.ok ? "auth_ok" : "auth_error", body: r.error || "" });
  break;
}

case "login": {
  if (!checkLogin(msg.from, msg.body)) { send(ws, { type: "auth_error", body: "Wrong username or password" }); break; }
  ws.user = msg.from;
  addUser(msg.from, ws);                                   // member 1's connections.js
  send(ws, { type: "auth_ok" });
  send(ws, { type: "history", body: JSON.stringify(getHistory(msg.from)) });
  send(ws, { type: "groups", body: JSON.stringify(getGroups(msg.from)) });
  // messages that arrived while this user was offline
  for (const m of getUndelivered(msg.from)) {
    sendTo(msg.from, { type: "chat", id: m.id, from: m.sender, to: m.receiver || "",
                       group: m.group_name || "", ts: m.sent_at, body: m.body });
  }
  break;
}

case "create_group": {
  const members = msg.body.split(",").map(s => s.trim()).filter(Boolean);
  const r = createGroup(msg.group, ws.user, members);
  if (!r.ok) { send(ws, { type: "error", body: r.error }); break; }
  for (const user of [ws.user, ...members]) sendTo(user, { type: "groups", body: JSON.stringify(getGroups(user)) });
  break;
}

case "chat": {
  msg.from = ws.user;                 // never trust the name the client wrote
  msg.protocol = proto;
  if (msg.group) {
    const r = sendToGroup(msg, sendTo);
    if (!r.ok) { send(ws, { type: "error", body: r.error }); break; }
  } else if (saveMessage(msg, [msg.to])) {
    sendTo(msg.to, msg);              // false if offline: they get it on next login
  }
  send(ws, { type: "ack", id: msg.id });  // ack even for duplicates, so the sender stops resending
  break;
}

case "ack":
  markDelivered(msg.id, ws.user);
  break;
```

`send(ws, obj)` = encode with that socket's protocol and send it. `sendTo` / `addUser` come from member 1's `connections.js`.
