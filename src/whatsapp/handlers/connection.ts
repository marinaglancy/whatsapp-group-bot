import type { ConnectionState, Contact } from 'baileys'
import { logger } from '../../utils/logger.js'
import { phoneFromJid } from '../../utils/jid.js'

let currentQr: string | null = null
let connectionState: ConnectionState['connection'] | undefined = undefined
let botUser: { name: string; phone: string } | null = null

export function getCurrentQr(): string | null {
  return currentQr
}

export function getConnectionState(): ConnectionState['connection'] | undefined {
  return connectionState
}

export function getBotUser() {
  return botUser
}

export function updateBotUser(user: Contact | undefined) {
  if (!user) return
  botUser = {
    name: user.name || user.notify || botUser?.name || '',
    phone: user.id ? phoneFromJid(user.id) : botUser?.phone || '',
  }
}

export function handleConnectionUpdate(update: Partial<ConnectionState>, user?: Contact | undefined) {
  const { connection, qr } = update

  if (qr) {
    currentQr = qr
    logger.info('New QR code generated. Scan it at /qr or in the terminal.')
  }

  if (connection) {
    connectionState = connection
    if (connection === 'open') {
      currentQr = null
      updateBotUser(user)
      logger.info({ name: botUser?.name, phone: botUser?.phone }, 'WhatsApp connection established')
    } else if (connection === 'close') {
      botUser = null
      logger.warn('WhatsApp connection closed')
    }
  }
}
