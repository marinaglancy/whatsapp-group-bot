import type { WAMessage } from 'baileys'
import { jidNormalizedUser } from 'baileys'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { jidMatchesPhone, resolvePhoneJid } from '../../utils/jid.js'
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

async function handleWebCommand(msg: WAMessage): Promise<boolean> {
  const remoteJid = msg.key.remoteJid
  if (!remoteJid) return false

  // Check if sender is the admin. In DMs remoteJid is the other user, but under LID
  // addressing it is a LID — the phone number has to be resolved separately.
  const senderPhoneJid = await resolvePhoneJid(
    msg.key.remoteJid,
    msg.key.remoteJidAlt,
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
