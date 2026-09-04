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
