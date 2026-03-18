import { eq, and, notInArray, inArray, sql } from 'drizzle-orm'
import type { GroupParticipant } from 'baileys'
import { getDb } from '../index.js'
import { groupMembers, users, type MembershipLevel } from '../schema.js'
import { upsertUser } from './users.js'

function membershipFromAdmin(admin: GroupParticipant['admin']): MembershipLevel {
  if (admin === 'superadmin') return 'superadmin'
  if (admin === 'admin') return 'admin'
  return 'participant'
}

export { membershipFromAdmin }

export function upsertMembership(groupJid: string, userJid: string, membership: MembershipLevel) {
  const db = getDb()
  const now = new Date()

  const isLeaving = membership === 'none'
  const isJoining = membership !== 'none' && membership !== 'pending_approval'

  return db.insert(groupMembers).values({
    groupJid,
    userJid,
    membership,
    joinedAt: isJoining ? now : null,
    leftAt: isLeaving ? now : null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [groupMembers.groupJid, groupMembers.userJid],
    set: {
      membership,
      // Set leftAt when leaving, clear it on rejoin
      ...(isLeaving ? { leftAt: now } : {}),
      ...(isJoining ? { joinedAt: now, leftAt: null } : {}),
      updatedAt: now,
    },
  }).run()
}

export function syncGroupParticipants(
  groupJid: string,
  participants: GroupParticipant[],
) {
  const db = getDb()

  const activeUserJids: string[] = []

  db.transaction(() => {
    for (const p of participants) {
      upsertUser(p.id, {
        phoneNumber: p.phoneNumber || undefined,
        displayName: p.notify || undefined,
      })

      const membership = membershipFromAdmin(p.admin)
      upsertMembership(groupJid, p.id, membership)
      activeUserJids.push(p.id)
    }

    // Mark members not in current participant list as 'none'
    if (activeUserJids.length > 0) {
      const now = new Date()
      db.update(groupMembers)
        .set({ membership: 'none', leftAt: now, updatedAt: now })
        .where(
          and(
            eq(groupMembers.groupJid, groupJid),
            notInArray(groupMembers.userJid, activeUserJids),
          )
        )
        .run()
    }
  })
}

export function getGroupMembers(groupJid: string, opts?: { includeLeft?: boolean }) {
  const db = getDb()
  const conditions = [eq(groupMembers.groupJid, groupJid)]
  if (!opts?.includeLeft) {
    // Drizzle doesn't have ne(), use notInArray with single value
    conditions.push(notInArray(groupMembers.membership, ['none']))
  }
  return db.select({
    userJid: groupMembers.userJid,
    membership: groupMembers.membership,
    joinedAt: groupMembers.joinedAt,
    leftAt: groupMembers.leftAt,
    displayName: users.displayName,
    phoneNumber: users.phoneNumber,
    isBanned: users.isBanned,
  })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userJid, users.jid))
    .where(and(...conditions))
    .all()
}

/** Count active (non-'none') members per group */
export function getGroupMemberCounts(groupJids: string[]): Map<string, number> {
  const result = new Map<string, number>()
  if (groupJids.length === 0) return result

  const db = getDb()
  const rows = db.select({
    groupJid: groupMembers.groupJid,
    cnt: sql<number>`count(*)`.as('cnt'),
  })
    .from(groupMembers)
    .where(and(
      inArray(groupMembers.groupJid, groupJids),
      notInArray(groupMembers.membership, ['none']),
    ))
    .groupBy(groupMembers.groupJid)
    .all()

  for (const row of rows) {
    result.set(row.groupJid, row.cnt)
  }
  return result
}

export function getGroupMember(groupJid: string, userJid: string) {
  const db = getDb()
  return db.select({
    userJid: groupMembers.userJid,
    membership: groupMembers.membership,
    joinedAt: groupMembers.joinedAt,
    leftAt: groupMembers.leftAt,
    displayName: users.displayName,
    phoneNumber: users.phoneNumber,
    isBanned: users.isBanned,
  })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userJid, users.jid))
    .where(and(eq(groupMembers.groupJid, groupJid), eq(groupMembers.userJid, userJid)))
    .get()
}
