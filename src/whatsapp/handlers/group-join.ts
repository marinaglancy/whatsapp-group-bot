import type { WASocket, GroupMetadata } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { jidMatchesPhone, phoneFromJid } from '../../utils/jid.js'
import { upsertGroupFromMetadata } from '../../db/queries/groups.js'

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

    if (addedByAdmin) {
      logger.info({ groupJid: group.id, name: group.subject, author: authorPn || authorLid }, 'Bot added to group by admin — staying')
      upsertGroupFromMetadata(group, botJid, sock.user?.lid)
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
