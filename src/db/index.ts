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
    )
  `)

  logger.info({ path: dbPath }, 'Database initialized')
  return db
}
