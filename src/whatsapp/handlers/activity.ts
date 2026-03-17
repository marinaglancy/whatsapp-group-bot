import { type BaileysEventMap, getContentType, proto, decryptPollVote, getKeyAuthor, jidNormalizedUser } from 'baileys'
import { createHash } from 'crypto'
import { logger } from '../../utils/logger.js'
import { isGroupJid } from '../../utils/jid.js'
import { logActivity } from '../../db/queries/activity.js'
import { updateDisplayName } from '../../db/queries/users.js'
import { cacheMessage, getCachedMessage, getSock } from '../client.js'

/** Convert a message to a JSON-safe object for debug logging.
 *  Replaces Uint8Array/Buffer with "[binary]" to keep it readable. */
function safeJson(obj: unknown): unknown {
  return JSON.parse(JSON.stringify(obj, (_key, value) => {
    if (value instanceof Uint8Array || Buffer.isBuffer(value)) return '[binary]'
    if (typeof value === 'bigint') return value.toString()
    return value
  }))
}

/** Extract the quoted/replied-to message ID from contextInfo */
function extractQuotedId(message: proto.IMessage): string | null {
  // contextInfo.stanzaId is on whichever message type is present
  const content = message.extendedTextMessage
    || message.imageMessage
    || message.videoMessage
    || message.audioMessage
    || message.documentMessage
    || message.stickerMessage
    || message.contactMessage
    || message.locationMessage
  return (content as { contextInfo?: { stanzaId?: string } } | undefined)?.contextInfo?.stanzaId || null
}

/** Extract text content from a message (plain text, extended text, or media caption) */
function extractText(message: proto.IMessage): string | null {
  if (message.conversation) return message.conversation
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text
  if (message.imageMessage?.caption) return message.imageMessage.caption
  if (message.videoMessage?.caption) return message.videoMessage.caption
  if (message.documentMessage?.caption) return message.documentMessage.caption
  return null
}

export function handleMessagesUpsert(event: BaileysEventMap['messages.upsert']) {
  const { messages, type } = event
  if (type !== 'notify') return

  for (const msg of messages) {
    const groupJid = msg.key.remoteJid
    if (!groupJid || !isGroupJid(groupJid)) continue

    const userJid = msg.key.participant
    if (!userJid) continue

    const messageId = msg.key.id
    if (!messageId) continue

    const timestamp = typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp
      : Number(msg.messageTimestamp || 0)

    // Cache message for poll vote decryption
    cacheMessage(msg)

    // Update display name from pushName
    if (msg.pushName) {
      updateDisplayName(userJid, msg.pushName)
    }

    const raw = safeJson({
      key: msg.key,
      message: msg.message,
      pushName: msg.pushName,
      messageStubType: msg.messageStubType,
      pollUpdates: msg.pollUpdates,
      eventResponses: msg.eventResponses,
    }) as Record<string, unknown>

    // Protocol messages: edits and deletes
    const proto_msg = msg.message?.protocolMessage
    if (proto_msg) {
      const protoType = proto_msg.type
      if (protoType === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT && proto_msg.key?.id) {
        const editedMessage = proto_msg.editedMessage
        const editedContentType = editedMessage
          ? getContentType(editedMessage) || 'unknown'
          : 'unknown'
        const editedText = editedMessage ? extractText(editedMessage) : null
        logActivity({
          groupJid, userJid, messageId,
          parentId: proto_msg.key.id,
          eventType: 'edit',
          metadata: { contentType: editedContentType, ...(editedText ? { text: editedText } : {}) },
          raw,
          timestamp,
        })
        logger.debug({ groupJid, messageId, parentId: proto_msg.key.id }, 'Activity: edit')
      } else if (protoType === proto.Message.ProtocolMessage.Type.REVOKE && proto_msg.key?.id) {
        logActivity({
          groupJid, userJid, messageId,
          parentId: proto_msg.key.id,
          eventType: 'delete',
          raw,
          timestamp,
        })
        logger.debug({ groupJid, messageId, parentId: proto_msg.key.id }, 'Activity: delete')
      }
      continue
    }

    // Poll creation
    const pollMsg = msg.message?.pollCreationMessage
      || msg.message?.pollCreationMessageV2
      || msg.message?.pollCreationMessageV3
    if (pollMsg) {
      logActivity({
        groupJid, userJid, messageId,
        eventType: 'poll_create',
        metadata: {
          question: pollMsg.name || '',
          options: (pollMsg.options || []).map(o => o.optionName || ''),
        },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId }, 'Activity: poll_create')
      continue
    }

    // Poll vote (as message content — pollUpdateMessage)
    const pollUpdate = msg.message?.pollUpdateMessage
    if (pollUpdate) {
      const creationMsgKey = pollUpdate.pollCreationMessageKey
      const pollMsgId = creationMsgKey?.id
      if (pollMsgId) {
        let selectedOptions: string[] = []

        // Try to decrypt the vote
        const pollCreationMsg = getCachedMessage(pollMsgId)
        if (pollCreationMsg && pollUpdate.vote && creationMsgKey) {
          const pollEncKey = pollCreationMsg.message?.messageContextInfo?.messageSecret
          if (pollEncKey) {
            try {
              const meId = jidNormalizedUser(getSock().user?.id || '')
              const meLid = getSock().user?.lid ? jidNormalizedUser(getSock().user!.lid!) : meId

              // Determine poll creator and voter JIDs
              // For LID-addressed groups, use participant (LID) directly
              // For phone-addressed, use getKeyAuthor which prefers participantAlt
              const isLidAddressing = msg.key.addressingMode === 'lid'

              let pollCreatorJid: string
              let voterJid: string

              if (isLidAddressing) {
                // Use LID for both — match what WhatsApp used for encryption
                pollCreatorJid = creationMsgKey.fromMe
                  ? meLid
                  : (creationMsgKey.participant || getKeyAuthor(creationMsgKey, meId))
                voterJid = msg.key.fromMe
                  ? meLid
                  : (msg.key.participant || getKeyAuthor(msg.key, meId))
              } else {
                pollCreatorJid = getKeyAuthor(creationMsgKey, meId)
                voterJid = getKeyAuthor(msg.key, meId)
              }
              const decrypted = decryptPollVote(pollUpdate.vote, {
                pollEncKey,
                pollCreatorJid,
                pollMsgId,
                voterJid,
              })
              // Match hashes to option names from the poll creation message
              const pollMsg = pollCreationMsg.message?.pollCreationMessage
                || pollCreationMsg.message?.pollCreationMessageV2
                || pollCreationMsg.message?.pollCreationMessageV3
              const options = pollMsg?.options || []
              const optionHashes = new Map<string, string>()
              for (const opt of options) {
                if (opt.optionName) {
                  const hash = createHash('sha256').update(opt.optionName).digest('hex')
                  optionHashes.set(hash, opt.optionName)
                }
              }
              selectedOptions = (decrypted.selectedOptions || []).map(hash => {
                const hex = Buffer.from(hash).toString('hex')
                return optionHashes.get(hex) || hex
              })
            } catch (err) {
              logger.warn({ groupJid, messageId, pollMsgId, err }, 'Failed to decrypt poll vote')
            }
          }
        }

        logActivity({
          groupJid, userJid, messageId,
          parentId: pollMsgId,
          eventType: 'poll_vote',
          metadata: {
            selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
          },
          raw,
          timestamp,
        })
        logger.debug({ groupJid, messageId, pollMsgId, selectedOptions }, 'Activity: poll_vote')
      }
      continue
    }

    // Poll votes (via pollUpdates array — aggregated)
    if (msg.pollUpdates?.length) {
      for (const update of msg.pollUpdates) {
        const pollMsgId = update.pollUpdateMessageKey?.id
        if (!pollMsgId) continue
        logActivity({
          groupJid, userJid, messageId,
          parentId: pollMsgId,
          eventType: 'poll_vote',
          metadata: {
            selectedOptions: (update.vote?.selectedOptions || []).map(
              o => Buffer.from(o).toString('hex')
            ),
          },
          raw,
          timestamp,
        })
        logger.debug({ groupJid, messageId, pollMsgId }, 'Activity: poll_vote')
      }
      continue
    }

    // Event creation
    const eventMsg = msg.message?.eventMessage
    if (eventMsg) {
      logActivity({
        groupJid, userJid, messageId,
        eventType: 'event_create',
        metadata: {
          name: eventMsg.name || '',
          description: eventMsg.description || null,
          startTime: Number(eventMsg.startTime || 0) || null,
          endTime: Number(eventMsg.endTime || 0) || null,
          isCanceled: eventMsg.isCanceled || false,
        },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId }, 'Activity: event_create')
      continue
    }

    // Encrypted event edit (secretEncryptedMessage with EVENT_EDIT type)
    // Note: decryption not possible in LID-addressed groups (Baileys limitation)
    const secretMsg = msg.message?.secretEncryptedMessage
    if (secretMsg) {
      const targetMsgId = secretMsg.targetMessageKey?.id || null
      const encType = secretMsg.secretEncType
      const typeStr = typeof encType === 'string' ? encType
        : encType === 1 ? 'EVENT_EDIT'
        : String(encType ?? 'unknown')
      logActivity({
        groupJid, userJid, messageId,
        parentId: targetMsgId,
        eventType: 'edit',
        metadata: { contentType: 'event_edit', secretEncType: typeStr, encrypted: true },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId, targetMsgId, secretEncType: typeStr }, 'Activity: event edit')
      continue
    }

    // Encrypted event response (encEventResponseMessage)
    // Note: decryption not possible in LID-addressed groups (Baileys limitation)
    const encEventResp = msg.message?.encEventResponseMessage
    if (encEventResp) {
      const eventMsgId = encEventResp.eventCreationMessageKey?.id || null
      logActivity({
        groupJid, userJid, messageId,
        parentId: eventMsgId,
        eventType: 'event_response',
        metadata: { encrypted: true },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId, eventMsgId }, 'Activity: event response')
      continue
    }

    // Event responses (attendance — unencrypted via eventResponses array)
    if (msg.eventResponses?.length) {
      for (const resp of msg.eventResponses) {
        const eventMsgId = resp.eventResponseMessageKey?.id
        if (!eventMsgId) continue
        const responseType = resp.eventResponseMessage?.response
        const responseStr = responseType === 1 ? 'GOING'
          : responseType === 2 ? 'NOT_GOING'
          : responseType === 3 ? 'MAYBE'
          : 'UNKNOWN'
        logActivity({
          groupJid, userJid, messageId,
          parentId: eventMsgId,
          eventType: 'event_response',
          metadata: { response: responseStr },
          raw,
          timestamp,
        })
        logger.debug({ groupJid, messageId, eventMsgId, response: responseStr }, 'Activity: event_response')
      }
      continue
    }

    // Reaction messages are handled by messages.reaction event — skip here
    if (msg.message?.reactionMessage) continue

    // Pin/unpin message
    const pinMsg = msg.message?.pinInChatMessage
    if (pinMsg) {
      const pinnedMsgId = pinMsg.key?.id || null
      const pinType = pinMsg.type === 1 ? 'PIN_FOR_ALL'
        : pinMsg.type === 2 ? 'UNPIN_FOR_ALL'
        : String(pinMsg.type ?? 'unknown')
      logActivity({
        groupJid, userJid, messageId,
        parentId: pinnedMsgId,
        eventType: 'message',
        metadata: { contentType: 'pinInChatMessage', pinType },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId, pinnedMsgId, pinType }, 'Activity: pin')
      continue
    }

    // Regular messages
    const contentType = msg.message ? getContentType(msg.message) : null
    if (contentType) {
      const text = extractText(msg.message!)
      // Extract reply context — stanzaId is the quoted message's ID
      const quotedId = extractQuotedId(msg.message!)
      logActivity({
        groupJid, userJid, messageId,
        parentId: quotedId,
        eventType: 'message',
        metadata: { contentType, ...(text ? { text } : {}), ...(quotedId ? { isReply: true } : {}) },
        raw,
        timestamp,
      })
      logger.debug({ groupJid, messageId, contentType }, 'Activity: message')
    }
  }
}
