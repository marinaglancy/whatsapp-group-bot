import { eq, sql } from 'drizzle-orm'
import { getDb } from '../index.js'
import { users } from '../schema.js'
import { bareJid } from '../../utils/jid.js'

/** Strip @s.whatsapp.net domain from a phone JID, returning digits only */
function phoneDigits(phoneJid: string): string {
  return bareJid(phoneJid)
}

export function upsertUser(jid: string, opts?: { phoneNumber?: string; displayName?: string }) {
  const db = getDb()
  const now = new Date()
  const phone = opts?.phoneNumber ? phoneDigits(opts.phoneNumber) : null

  return db.insert(users).values({
    jid,
    phoneNumber: phone,
    displayName: opts?.displayName || null,
    displayNameUpdatedAt: opts?.displayName ? now : null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: users.jid,
    set: {
      // Always overwrite phone (tracks number changes)
      ...(phone !== null ? { phoneNumber: phone } : {}),
      // Only overwrite displayName if non-null
      ...(opts?.displayName ? {
        displayName: opts.displayName,
        displayNameUpdatedAt: now,
      } : {}),
      updatedAt: now,
    },
  }).run()
}

export function updateDisplayName(jid: string, name: string) {
  const db = getDb()
  const now = new Date()
  // Use upsert in case user doesn't exist yet (e.g. pushName from a message before sync)
  return db.insert(users).values({
    jid,
    displayName: name,
    displayNameUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: users.jid,
    set: {
      displayName: name,
      displayNameUpdatedAt: now,
      updatedAt: now,
    },
  }).run()
}

export function getUser(jid: string) {
  const db = getDb()
  return db.select().from(users).where(eq(users.jid, jid)).get()
}

export function getUserByPhone(phone: string) {
  const db = getDb()
  const digits = phoneDigits(phone)
  return db.select().from(users).where(eq(users.phoneNumber, digits)).get()
}
