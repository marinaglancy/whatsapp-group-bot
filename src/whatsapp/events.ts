import type { WASocket } from 'baileys'
import { handleConnectionUpdate, updateBotUser } from './handlers/connection.js'
import { handleGroupParticipantsUpdate } from './handlers/group-participants.js'
import { handleGroupsUpsert } from './handlers/group-join.js'
import { handleGroupJoinRequest } from './handlers/group-join-request.js'
import { handleContactsUpsert, handleContactsUpdate } from './handlers/contacts.js'
import { syncGroups } from './handlers/group-sync.js'
import { updateDisplayName } from '../db/queries/users.js'
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
          // Extract display name from pushName
          if (msg.pushName && msg.key.participant) {
            updateDisplayName(msg.key.participant, msg.pushName)
          }
        }
      }
    }

    if (events['groups.upsert']) {
      await handleGroupsUpsert(events['groups.upsert'], sock)
    }

    if (events['group-participants.update']) {
      await handleGroupParticipantsUpdate(events['group-participants.update'], sock)
    }

    if (events['group.join-request']) {
      await handleGroupJoinRequest(events['group.join-request'], sock)
    }

    if (events['contacts.upsert']) {
      handleContactsUpsert(events['contacts.upsert'])
    }

    if (events['contacts.update']) {
      handleContactsUpdate(events['contacts.update'])
    }
  })
}
