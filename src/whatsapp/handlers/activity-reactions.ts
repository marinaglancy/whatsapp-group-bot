import { type BaileysEventMap, jidNormalizedUser } from 'baileys'
import { logger } from '../../utils/logger.js'
import { isGroupJid } from '../../utils/jid.js'
import { logActivity } from '../../db/queries/activity.js'
import { getSock } from '../client.js'

export function handleMessagesReaction(reactions: BaileysEventMap['messages.reaction']) {
  for (const { key, reaction } of reactions) {
    const remoteJid = key.remoteJid
    if (!remoteJid) continue

    const isGroup = isGroupJid(remoteJid)

    const messageId = reaction.key?.id
    if (!messageId) continue

    const targetMsgId = key.id
    if (!targetMsgId) continue

    let userJid: string
    let groupJid: string | null = null
    let toUserJid: string | null = null

    if (isGroup) {
      if (!reaction.key?.participant) continue
      userJid = jidNormalizedUser(reaction.key.participant)
      groupJid = remoteJid
    } else {
      const botJid = jidNormalizedUser(getSock().user?.lid || getSock().user?.id || '')
      if (reaction.key?.fromMe) {
        userJid = botJid
        toUserJid = jidNormalizedUser(remoteJid)
      } else {
        userJid = jidNormalizedUser(remoteJid)
        toUserJid = botJid
      }
    }

    const timestamp = typeof reaction.senderTimestampMs === 'number'
      ? Math.floor(reaction.senderTimestampMs / 1000)
      : Math.floor(Date.now() / 1000)

    logActivity({
      groupJid,
      toUserJid,
      userJid,
      messageId,
      parentId: targetMsgId,
      eventType: 'reaction',
      metadata: { emoji: reaction.text || null },
      raw: { key, reaction } as Record<string, unknown>,
      timestamp,
    })
    logger.debug({ groupJid, targetMsgId, emoji: reaction.text }, 'Activity: reaction')
  }
}
