import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm'
import { getDb } from '../index.js'
import { activityLog, type ActivityEventType } from '../schema.js'

interface LogActivityEntry {
  groupJid?: string | null
  userJid: string
  toUserJid?: string | null
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
    groupJid: entry.groupJid ?? null,
    toUserJid: entry.toUserJid ?? null,
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

/** Count activity events per group since a given timestamp */
export function getGroupActivityCounts(groupJids: string[], sinceTimestamp: number): Map<string, number> {
  const result = new Map<string, number>()
  if (groupJids.length === 0) return result

  const db = getDb()
  const rows = db.select({
    groupJid: activityLog.groupJid,
    cnt: sql<number>`count(*)`.as('cnt'),
  })
    .from(activityLog)
    .where(and(
      inArray(activityLog.groupJid, groupJids),
      gte(activityLog.timestamp, sinceTimestamp),
    ))
    .groupBy(activityLog.groupJid)
    .all()

  for (const row of rows) {
    if (row.groupJid) result.set(row.groupJid, row.cnt)
  }
  return result
}

/** Get most recent activity timestamp per group */
export function getGroupLastActivity(groupJids: string[]): Map<string, number> {
  const result = new Map<string, number>()
  if (groupJids.length === 0) return result

  const db = getDb()
  const rows = db.select({
    groupJid: activityLog.groupJid,
    lastTs: sql<number>`max(timestamp)`.as('last_ts'),
  })
    .from(activityLog)
    .where(inArray(activityLog.groupJid, groupJids))
    .groupBy(activityLog.groupJid)
    .all()

  for (const row of rows) {
    if (row.groupJid && row.lastTs) result.set(row.groupJid, row.lastTs)
  }
  return result
}

/** Per-user activity breakdown for a group in the last N days */
export function getGroupUserActivity(groupJid: string, sinceDays: number) {
  const db = getDb()
  const sinceTs = Math.floor(Date.now() / 1000) - (sinceDays * 86400)

  const rows = db.select({
    userJid: activityLog.userJid,
    total: sql<number>`count(*)`.as('total'),
    posts: sql<number>`sum(case when event_type in ('message', 'poll_create', 'event_create') then 1 else 0 end)`.as('posts'),
    reactions: sql<number>`sum(case when event_type in ('reaction', 'poll_vote', 'event_response') then 1 else 0 end)`.as('reactions'),
    lastActivity: sql<number>`max(timestamp)`.as('last_activity'),
  })
    .from(activityLog)
    .where(and(
      eq(activityLog.groupJid, groupJid),
      gte(activityLog.timestamp, sinceTs),
    ))
    .groupBy(activityLog.userJid)
    .orderBy(desc(sql`total`))
    .all()

  return rows
}
