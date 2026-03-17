import type { Contact } from 'baileys'
import { upsertUser, updateDisplayName } from '../../db/queries/users.js'
import { logger } from '../../utils/logger.js'

export function handleContactsUpsert(contacts: Contact[]) {
  for (const contact of contacts) {
    const name = contact.notify || contact.name || contact.verifiedName
    upsertUser(contact.id, {
      phoneNumber: contact.phoneNumber || undefined,
      displayName: name || undefined,
    })
  }
  logger.debug({ count: contacts.length }, 'Contacts upserted')
}

export function handleContactsUpdate(contacts: Partial<Contact>[]) {
  for (const contact of contacts) {
    if (!contact.id) continue
    const name = contact.notify || contact.name || contact.verifiedName
    if (name) {
      updateDisplayName(contact.id, name)
    }
  }
  logger.debug({ count: contacts.length }, 'Contacts updated')
}
