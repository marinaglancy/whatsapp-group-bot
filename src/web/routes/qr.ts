import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { getCurrentQr, getConnectionState, getBotUser } from '../../whatsapp/handlers/connection.js'

export function registerQrRoutes(app: FastifyInstance) {
  app.get('/api/qr', async (_req, reply) => {
    const qr = getCurrentQr()
    const connected = getConnectionState() === 'open'
    const user = connected ? getBotUser() : null

    if (connected) {
      return reply.send({ qr: null, connected: true, user })
    }

    if (!qr) {
      return reply.send({ qr: null, connected: false, user: null })
    }

    const dataUrl = await QRCode.toDataURL(qr, { width: 300 })
    return reply.send({ qr: dataUrl, connected: false, user: null })
  })

  app.get('/qr', async (_req, reply) => {
    return reply.sendFile('qr.html')
  })
}
