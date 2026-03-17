import type { WASocket } from 'baileys'
import { logger } from '../../utils/logger.js'
import { upsertGroupFromMetadata } from '../../db/queries/groups.js'

export async function syncGroups(sock: WASocket) {
  const botJid = sock.user?.id
  if (!botJid) return

  const botLid = sock.user?.lid

  try {
    const groups = await sock.groupFetchAllParticipating()
    const groupList = Object.values(groups)
    logger.info({ count: groupList.length }, 'Syncing groups from WhatsApp')

    for (const meta of groupList) {
      upsertGroupFromMetadata(meta, botJid, botLid)
    }

    logger.info({ count: groupList.length }, 'Group sync complete')
  } catch (err) {
    logger.error({ err }, 'Failed to sync groups')
  }
}
