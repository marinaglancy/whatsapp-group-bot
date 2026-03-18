import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { resolve } from 'path'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import * as schema from './schema.js'

let db: ReturnType<typeof drizzle<typeof schema>>

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDb() {
  const dbPath = resolve(config.dataDir, 'bot.db')
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  db = drizzle(sqlite, { schema })

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_community INTEGER NOT NULL DEFAULT 0,
      parent_community_jid TEXT,
      permissions TEXT,
      bot_membership TEXT NOT NULL DEFAULT 'none',
      bot_functions INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      synced_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      jid TEXT PRIMARY KEY,
      phone_number TEXT,
      is_banned INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      display_name_updated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

    CREATE TABLE IF NOT EXISTS group_members (
      group_jid TEXT NOT NULL REFERENCES groups(jid),
      user_jid TEXT NOT NULL REFERENCES users(jid),
      membership TEXT NOT NULL DEFAULT 'participant',
      joined_at INTEGER,
      left_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (group_jid, user_jid)
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_jid);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT,
      user_jid TEXT NOT NULL,
      to_user_jid TEXT,
      message_id TEXT NOT NULL,
      parent_id TEXT,
      event_type TEXT NOT NULL,
      metadata TEXT,
      raw TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_group_ts ON activity_log(group_jid, timestamp);
    CREATE INDEX IF NOT EXISTS idx_activity_user_group ON activity_log(user_jid, group_jid);
    CREATE INDEX IF NOT EXISTS idx_activity_message ON activity_log(message_id);
    CREATE INDEX IF NOT EXISTS idx_activity_parent ON activity_log(parent_id);
    CREATE INDEX IF NOT EXISTS idx_activity_to_user ON activity_log(to_user_jid);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_jid TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      expires_at INTEGER NOT NULL,
      session_data TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_jid);
  `)

  logger.info({ path: dbPath }, 'Database initialized')
  return db
}
