import { eq } from 'drizzle-orm'
import { getDb } from '../index.js'
import { settings } from '../schema.js'

export function getSetting(key: string): string | null {
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const db = getDb()
  db.insert(settings).values({
    key,
    value,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: settings.key,
    set: { value, updatedAt: new Date() },
  }).run()
}

export function getSettingOrDefault(key: string, defaultValue: string): string {
  return getSetting(key) ?? defaultValue
}

export function getAllSettings(): Map<string, string> {
  const db = getDb()
  const rows = db.select().from(settings).all()
  return new Map(rows.map(r => [r.key, r.value]))
}
