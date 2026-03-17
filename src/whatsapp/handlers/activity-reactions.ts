import type { BaileysEventMap } from 'baileys'
import { logger } from '../../utils/logger.js'
import { isGroupJid } from '../../utils/jid.js'
import { logActivity } from '../../db/queries/activity.js'

export function handleMessagesReaction(reactions: BaileysEventMap['messages.reaction']) {
  for (const { key, reaction } of reactions) {
    const groupJid = key.remoteJid
    if (!groupJid || !isGroupJid(groupJid)) continue

    const userJid = reaction.key?.participant
    if (!userJid) continue

    const messageId = reaction.key?.id
    if (!messageId) continue

    const targetMsgId = key.id
    if (!targetMsgId) continue

    const timestamp = typeof reaction.senderTimestampMs === 'number'
      ? Math.floor(reaction.senderTimestampMs / 1000)
      : Math.floor(Date.now() / 1000)

    logActivity({
      groupJid,
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
