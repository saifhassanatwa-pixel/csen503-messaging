
CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  name       TEXT PRIMARY KEY,
  owner      TEXT NOT NULL REFERENCES users(username),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_name TEXT NOT NULL REFERENCES groups(name),
  username   TEXT NOT NULL REFERENCES users(username),
  PRIMARY KEY (group_name, username)
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  sender     TEXT NOT NULL REFERENCES users(username),
  receiver   TEXT REFERENCES users(username),
  group_name TEXT REFERENCES groups(name),
  body       TEXT NOT NULL,
  sent_at    INTEGER NOT NULL,
  protocol   TEXT,
  -- a message goes to exactly one person OR one group, never both
  CHECK ((receiver IS NULL) <> (group_name IS NULL))
);

CREATE TABLE IF NOT EXISTS deliveries (
  message_id TEXT NOT NULL REFERENCES messages(id),
  username   TEXT NOT NULL REFERENCES users(username),
  delivered  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, username)
);