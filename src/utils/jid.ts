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
