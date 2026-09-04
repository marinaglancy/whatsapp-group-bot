import { logger } from './logger.js'

/**
 * Normalize a human-entered phone number to digits only.
 * Strips +, spaces, dashes, parentheses.
 * e.g. "+1 (234) 567-890" -> "1234567890"
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)\+]/g, '')
}

/**
 * Extract the phone number part from a JID.
 * e.g. "1234567890@s.whatsapp.net" -> "1234567890"
 */
export function phoneFromJid(jid: string): string {
  return jid.split('@')[0].split(':')[0]
}

/**
 * Check if a JID matches a phone number (in any human-readable format).
 */
export function jidMatchesPhone(jid: string, phone: string): boolean {
  return phoneFromJid(jid) === normalizePhone(phone)
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}

/** Strip device suffix and domain from a JID/LID for comparison.
 * e.g. "209375931187402:14@lid" -> "209375931187402"
 * e.g. "351920823473@s.whatsapp.net" -> "351920823473"
 */
export function bareJid(jid: string): string {
  return jid.split(':')[0].split('@')[0]
}

/** True if the JID uses LID addressing (e.g. "80428010631223@lid"). */
export function isLidJid(jid: string): boolean {
  return jid.endsWith('@lid')
}

/**
 * Resolve a phone-addressed JID from a possibly LID-addressed one.
 *
 * WhatsApp addresses users by LID and carries the phone JID in a companion field:
 * remoteJidAlt on message keys, authorPn / participantPn on group events. When that
 * companion field is absent, fall back to the Signal LID mapping store.
 *
 * `lookupPn` is injected so callers can be exercised without a live socket.
 * Returns null if the phone-addressed JID cannot be determined.
 */
export async function resolvePhoneJid(
  jid: string | null | undefined,
  altJid: string | null | undefined,
  lookupPn: (lid: string) => Promise<string | null>,
): Promise<string | null> {
  if (!jid) return null
  if (altJid) return altJid
  if (!isLidJid(jid)) return jid

  try {
    return await lookupPn(jid)
  } catch (err) {
    logger.warn({ err, jid }, 'Failed to resolve phone number for LID')
    return null
  }
}
