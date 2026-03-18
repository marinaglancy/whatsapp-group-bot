import crypto from 'crypto'
import { eq, lt } from 'drizzle-orm'
import { getDb } from '../index.js'
import { sessions } from '../schema.js'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export function createSession(userJid: string): string {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()

  db.insert(sessions).values({
    token,
    userJid,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  }).run()

  return token
}

export function activateToken(token: string) {
  const db = getDb()
  const session = db.select().from(sessions).where(eq(sessions.token, token)).get()

  if (!session) return null
  if (session.activatedAt) return null // already used
  if (session.expiresAt < new Date()) return null // expired

  db.update(sessions)
    .set({ activatedAt: new Date() })
    .where(eq(sessions.token, token))
    .run()

  return session
}

export function getSession(token: string) {
  const db = getDb()
  const session = db.select().from(sessions).where(eq(sessions.token, token)).get()

  if (!session) return null
  if (!session.activatedAt) return null // not activated
  // expiresAt only gates token activation, not the session itself.
  // Once activated, the session lives as long as the cookie (24h).

  return session
}

export function cleanExpiredSessions() {
  const db = getDb()
  return db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run()
}
