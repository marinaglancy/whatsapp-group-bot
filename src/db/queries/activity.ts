import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { getDb } from '../index.js'
import { activityLog, type ActivityEventType } from '../schema.js'

interface LogActivityEntry {
  groupJid: string
  userJid: string
  messageId: string
  parentId?: string | null
  eventType: ActivityEventType
  metadata?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
  timestamp: number
}

export function logActivity(entry: LogActivityEntry) {
  const db = getDb()
  return db.insert(activityLog).values({
    groupJid: entry.groupJid,
    userJid: entry.userJid,
    messageId: entry.messageId,
    parentId: entry.parentId ?? null,
    eventType: entry.eventType,
    metadata: entry.metadata ?? null,
    raw: entry.raw ?? null,
    timestamp: entry.timestamp,
    createdAt: new Date(),
  }).run()
}

interface GetActivityOpts {
  since?: number
  until?: number
  userJid?: string
  eventType?: ActivityEventType
  limit?: number
}

export function getGroupActivity(groupJid: string, opts?: GetActivityOpts) {
  const db = getDb()
  const conditions = [eq(activityLog.groupJid, groupJid)]

  if (opts?.since) conditions.push(gte(activityLog.timestamp, opts.since))
  if (opts?.until) conditions.push(lte(activityLog.timestamp, opts.until))
  if (opts?.userJid) conditions.push(eq(activityLog.userJid, opts.userJid))
  if (opts?.eventType) conditions.push(eq(activityLog.eventType, opts.eventType))

  return db.select()
    .from(activityLog)
    .where(and(...conditions))
    .orderBy(desc(activityLog.timestamp))
    .limit(opts?.limit ?? 1000)
    .all()
}

export function getActivityByMessageId(messageId: string) {
  const db = getDb()
  return db.select()
    .from(activityLog)
    .where(eq(activityLog.messageId, messageId))
    .all()
}
