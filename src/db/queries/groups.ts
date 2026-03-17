import { eq } from 'drizzle-orm'
import type { GroupMetadata, GroupParticipant } from 'baileys'
import { getDb } from '../index.js'
import { groups, type Group } from '../schema.js'
import { phoneFromJid } from '../../utils/jid.js'

function botMembershipFromParticipant(p: GroupParticipant | undefined): Group['botMembership'] {
  if (!p) return 'none'
  if (p.admin === 'superadmin') return 'superadmin'
  if (p.admin === 'admin') return 'admin'
  return 'participant'
}

/** Strip device suffix and domain from a JID/LID for comparison */
function bareId(jid: string): string {
  return jid.split(':')[0].split('@')[0]
}

export function upsertGroupFromMetadata(meta: GroupMetadata, botJid: string, botLid?: string) {
  const db = getDb()
  const botPhone = bareId(botJid)
  const botLidBare = botLid ? bareId(botLid) : null
  const botParticipant = meta.participants.find(p => {
    const pid = bareId(p.id)
    return pid === botPhone || (botLidBare && pid === botLidBare)
  })

  const values = {
    jid: meta.id,
    name: meta.subject,
    isCommunity: meta.isCommunity ?? false,
    parentCommunityJid: meta.linkedParent ?? null,
    permissions: {
      announce: meta.announce ?? false,
      restrict: meta.restrict ?? false,
      memberAddMode: meta.memberAddMode ?? false,
      joinApprovalMode: meta.joinApprovalMode ?? false,
    },
    botMembership: botMembershipFromParticipant(botParticipant),
    syncedAt: new Date(),
  }

  return db.insert(groups).values({
    ...values,
    createdAt: new Date(),
  }).onConflictDoUpdate({
    target: groups.jid,
    set: values,
  }).run()
}

export function updateBotMembership(groupJid: string, membership: Group['botMembership']) {
  const db = getDb()
  return db.update(groups)
    .set({ botMembership: membership })
    .where(eq(groups.jid, groupJid))
    .run()
}

export function getGroup(jid: string) {
  const db = getDb()
  return db.select().from(groups).where(eq(groups.jid, jid)).get()
}

export function getAllGroups() {
  const db = getDb()
  return db.select().from(groups).all()
}
