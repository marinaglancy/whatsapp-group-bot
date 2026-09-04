import type { WAMessage, WAMessageKey } from 'baileys'
import { jidNormalizedUser } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { isLidJid, jidMatchesPhone } from '../../utils/jid.js'
import { createSession } from '../../db/queries/sessions.js'
import { getSettingOrDefault } from '../../db/queries/settings.js'
import { getSock } from '../client.js'

/** Handle an incoming DM to the bot. Returns true if the message was handled as a command. */
export async function handleCommand(msg: WAMessage): Promise<boolean> {
  const text = extractPlainText(msg)?.trim().toLowerCase()
  if (!text) return false

  if (text === 'web') {
    return await handleWebCommand(msg)
  }

  return false
}

/**
 * Resolve the sender's phone-addressed JID from a DM message key.
 *
 * WhatsApp addresses DMs by LID, so key.remoteJid is usually "<lid>@lid" and the
 * phone JID is carried in key.remoteJidAlt. When a client omits remoteJidAlt, fall
 * back to the Signal LID mapping store. Returns null if the phone can't be resolved.
 *
 * `lookupPn` is injected so this can be exercised without a live socket.
 */
export async function resolveSenderPhoneJid(
  key: WAMessageKey,
  lookupPn: (lid: string) => Promise<string | null>,
): Promise<string | null> {
  const remoteJid = key.remoteJid
  if (!remoteJid) return null
  if (key.remoteJidAlt) return key.remoteJidAlt
  if (!isLidJid(remoteJid)) return remoteJid

  try {
    return await lookupPn(remoteJid)
  } catch (err) {
    logger.warn({ err, remoteJid }, 'Failed to resolve phone number for LID')
    return null
  }
}

async function handleWebCommand(msg: WAMessage): Promise<boolean> {
  const remoteJid = msg.key.remoteJid
  if (!remoteJid) return false

  // Check if sender is the admin. In DMs remoteJid is the other user, but under LID
  // addressing it is a LID — the phone number has to be resolved separately.
  const senderPhoneJid = await resolveSenderPhoneJid(
    msg.key,
    lid => getSock().signalRepository.lidMapping.getPNForLID(lid),
  )

  if (!config.adminPhone || !senderPhoneJid || !jidMatchesPhone(senderPhoneJid, config.adminPhone)) {
    logger.debug({ remoteJid, senderPhoneJid }, 'Non-admin sent "web" command, ignoring')
    return false
  }

  const senderJid = jidNormalizedUser(remoteJid)
  const token = createSession(senderJid)
  const baseUrl = getSettingOrDefault('base_url', `http://localhost:${config.port}`)
  const link = `${baseUrl}/auth?token=${token}`

  try {
    const sock = getSock()
    await sock.sendMessage(remoteJid, {
      text: `Your login link (valid for 1 hour):\n${link}`,
    })
    logger.info({ senderJid }, 'Sent dashboard login link to admin')
  } catch (err) {
    logger.error({ err }, 'Failed to send login link')
  }

  return true
}

function extractPlainText(msg: WAMessage): string | null {
  const m = msg.message
  if (!m) return null
  if (m.conversation) return m.conversation
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text
  return null
}
