import type { WASocket } from 'baileys'
import { handleConnectionUpdate, updateBotUser } from './handlers/connection.js'
import { handleGroupParticipantsUpdate } from './handlers/group-participants.js'
import { handleGroupsUpsert } from './handlers/group-join.js'
import { syncGroups } from './handlers/group-sync.js'
import { logger } from '../utils/logger.js'

export function setupEventHandlers(sock: WASocket, saveCreds: () => Promise<void>) {
  sock.ev.process(async (events) => {
    if (events['connection.update']) {
      handleConnectionUpdate(events['connection.update'], sock.user)

      if (events['connection.update'].connection === 'open') {
        syncGroups(sock)
      }
    }

    if (events['creds.update']) {
      await saveCreds()
      updateBotUser(events['creds.update'].me)
      logger.debug('Credentials saved')
    }

    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert']
      if (type === 'notify') {
        for (const msg of messages) {
          logger.debug({ from: msg.key.remoteJid }, 'New message')
        }
      }
    }

    if (events['groups.upsert']) {
      await handleGroupsUpsert(events['groups.upsert'], sock)
    }

    if (events['group-participants.update']) {
      await handleGroupParticipantsUpdate(events['group-participants.update'], sock)
    }
  })
}
