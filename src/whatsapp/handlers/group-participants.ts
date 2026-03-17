import type { WASocket, BaileysEventMap } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { jidMatchesPhone, bareJid } from '../../utils/jid.js'
import { upsertGroupFromMetadata, updateBotMembership } from '../../db/queries/groups.js'
import { upsertUser } from '../../db/queries/users.js'
import { upsertMembership, membershipFromAdmin } from '../../db/queries/members.js'

type ParticipantsUpdate = BaileysEventMap['group-participants.update']

export async function handleGroupParticipantsUpdate(event: ParticipantsUpdate, sock: WASocket) {
  const { id: groupJid, participants, action, author } = event
  const botJid = sock.user?.id
  if (!botJid) return

  const botPhone = bareJid(botJid)
  const botLidBare = sock.user?.lid ? bareJid(sock.user.lid) : null

  for (const p of participants) {
    const pid = bareJid(p.id)
    const isBotAffected = pid === botPhone || (botLidBare && pid === botLidBare)

    // Track all participant changes in DB
    upsertUser(p.id, {
      phoneNumber: p.phoneNumber || undefined,
      displayName: p.notify || undefined,
    })

    if (action === 'add') {
      if (isBotAffected) {
        await handleBotAdded(groupJid, author, sock)
      } else {
        upsertMembership(groupJid, p.id, membershipFromAdmin(p.admin))
        logger.debug({ groupJid, participant: p.id }, 'Participant added to group')
      }
    } else if (action === 'remove') {
      if (isBotAffected) {
        logger.info({ groupJid }, 'Bot removed from group')
        updateBotMembership(groupJid, 'none')
      } else {
        upsertMembership(groupJid, p.id, 'none')
        logger.debug({ groupJid, participant: p.id }, 'Participant removed from group')
      }
    } else if (action === 'promote') {
      if (isBotAffected) {
        logger.info({ groupJid }, 'Bot promoted in group')
        updateBotMembership(groupJid, 'admin')
      } else {
        upsertMembership(groupJid, p.id, 'admin')
        logger.debug({ groupJid, participant: p.id }, 'Participant promoted')
      }
    } else if (action === 'demote') {
      if (isBotAffected) {
        logger.info({ groupJid }, 'Bot demoted in group')
        updateBotMembership(groupJid, 'participant')
      } else {
        upsertMembership(groupJid, p.id, 'participant')
        logger.debug({ groupJid, participant: p.id }, 'Participant demoted')
      }
    }
  }
}

async function handleBotAdded(groupJid: string, author: string, sock: WASocket) {
  const botJid = sock.user?.id
  if (!botJid) return

  const addedByAdmin = author && config.adminPhone && jidMatchesPhone(author, config.adminPhone)

  if (addedByAdmin) {
    logger.info({ groupJid, author }, 'Bot added to group by admin — staying')
    try {
      const meta = await sock.groupMetadata(groupJid)
      upsertGroupFromMetadata(meta, botJid, sock.user?.lid)
      logger.info({ groupJid, name: meta.subject }, 'Group saved to database')
    } catch (err) {
      logger.error({ groupJid, err }, 'Failed to fetch group metadata')
    }
  } else {
    logger.warn({ groupJid, author }, 'Bot added to group by non-admin — leaving')
    try {
      await sock.groupLeave(groupJid)
    } catch (err) {
      logger.error({ groupJid, err }, 'Failed to leave group')
    }
  }
}
