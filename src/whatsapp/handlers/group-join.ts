import type { WASocket, GroupMetadata } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { jidMatchesPhone, phoneFromJid } from '../../utils/jid.js'
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

    // Check if the author matches the admin phone
    const addedByAdmin = config.adminPhone && (
      (authorPn && jidMatchesPhone(authorPn, config.adminPhone)) ||
      (authorLid && await isAdminLid(authorLid, group, config.adminPhone))
    )

    const addedByItself = !authorLid && !authorPn

    if (addedByAdmin) {
      logger.info({ groupJid: group.id, name: group.subject, author: authorPn || authorLid }, 'Bot added to group by admin — staying')
      await fetchAndSyncGroup(group.id, sock)
    } else if (addedByItself) {
      logger.info({ groupJid: group.id, name: group.subject }, 'Bot added to group by itself — staying')
      await fetchAndSyncGroup(group.id, sock)
    } else {
      logger.warn({ groupJid: group.id, name: group.subject, author: authorPn || authorLid }, 'Bot added to group by non-admin — leaving')
      try {
        await sock.groupLeave(group.id)
      } catch (err) {
        logger.error({ groupJid: group.id, err }, 'Failed to leave group')
      }
    }
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

async function isAdminLid(lid: string, group: GroupUpsert, adminPhone: string): Promise<boolean> {
  const lidBare = lid.split(':')[0].split('@')[0]
  const participant = group.participants?.find(
    p => p.id.split(':')[0].split('@')[0] === lidBare
  )
  if (participant?.phoneNumber) {
    return jidMatchesPhone(participant.phoneNumber, adminPhone)
  }
  return false
}
