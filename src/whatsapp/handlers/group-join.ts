import type { WASocket, GroupMetadata } from 'baileys'
import { logger } from '../../utils/logger.js'
import { phoneFromJid } from '../../utils/jid.js'
import { upsertGroupFromMetadata } from '../../db/queries/groups.js'
import { syncGroupParticipants } from '../../db/queries/members.js'

/** Extended GroupMetadata with author fields added by Baileys on groups.upsert */
type GroupUpsert = GroupMetadata & { author?: string; authorPn?: string }

/**
 * Handle groups.upsert — fired when the bot is added to a new group.
 * If added by admin, stay and save to DB. Otherwise, leave.
 */
export async function handleGroupsUpsert(groups: GroupUpsert[], sock: WASocket) {
  const botJid = sock.user?.id
  if (!botJid) return

  for (const group of groups) {
    const authorPn = group.authorPn
    const authorLid = group.author
    const authorPhone = authorPn ? phoneFromJid(authorPn) : null
    logger.info({ groupJid: group.id, name: group.subject, authorPn, authorLid, authorPhone }, 'Bot added to group')
    await fetchAndSyncGroup(group.id, sock)
  }
}

/**
 * Check if a LID belongs to the admin by looking up their phone number
 * in the group's participant list.
 */
async function fetchAndSyncGroup(groupJid: string, sock: WASocket) {
  try {
    const meta = await sock.groupMetadata(groupJid)
    upsertGroupFromMetadata(meta, sock.user!.id, sock.user?.lid)
    syncGroupParticipants(meta.id, meta.participants)
    logger.info({ groupJid, name: meta.subject, participants: meta.participants.length }, 'Group and participants synced')
  } catch (err) {
    logger.error({ groupJid, err }, 'Failed to fetch and sync group metadata')
  }
}

