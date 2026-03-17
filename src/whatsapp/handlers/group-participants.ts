import type { WASocket, BaileysEventMap } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { phoneFromJid, jidMatchesPhone } from '../../utils/jid.js'
import { upsertGroupFromMetadata, updateBotMembership } from '../../db/queries/groups.js'

type ParticipantsUpdate = BaileysEventMap['group-participants.update']

export async function handleGroupParticipantsUpdate(event: ParticipantsUpdate, sock: WASocket) {
  const { id: groupJid, participants, action, author } = event
  const botJid = sock.user?.id
  if (!botJid) return

  const botPhone = phoneFromJid(botJid)
  const isBotAffected = participants.some(p => phoneFromJid(p.id) === botPhone)

  if (!isBotAffected) {
    logger.debug({ groupJid, action, participants }, 'Group participants update (not bot)')
    return
  }

    logger.debug({ groupJid, action, participants }, 'Group participants update (bot)')


  if (action === 'add') {
    // Bot was added to a group — check who added it
    const addedByAdmin = author && config.adminPhone && jidMatchesPhone(author, config.adminPhone)

    if (addedByAdmin) {
      logger.info({ groupJid, author }, 'Bot added to group by admin - staying')
      try {
        const meta = await sock.groupMetadata(groupJid)
        upsertGroupFromMetadata(meta, botJid, sock.user?.lid)
        logger.info({ groupJid, name: meta.subject }, 'Group saved to database')
      } catch (err) {
        logger.error({ groupJid, err }, 'Failed to fetch group metadata')
      }
    } else {
      logger.warn({ groupJid, author }, 'Bot added to group by non-admin - leaving')
      try {
        await sock.groupLeave(groupJid)
      } catch (err) {
        logger.error({ groupJid, err }, 'Failed to leave group')
      }
    }
  } else if (action === 'remove') {
    logger.info({ groupJid }, 'Bot removed from group')
    updateBotMembership(groupJid, 'none')
  } else if (action === 'promote') {
    logger.info({ groupJid }, 'Bot promoted in group')
    updateBotMembership(groupJid, 'admin')
  } else if (action === 'demote') {
    logger.info({ groupJid }, 'Bot demoted in group')
    updateBotMembership(groupJid, 'participant')
  }
}
