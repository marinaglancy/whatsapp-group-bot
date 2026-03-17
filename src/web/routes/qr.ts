import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { getCurrentQr, getConnectionState, getBotUser } from '../../whatsapp/handlers/connection.js'
import { getSock } from '../../whatsapp/client.js'

export function registerQrRoutes(app: FastifyInstance) {
  app.get('/api/qr', async (_req, reply) => {
    const qr = getCurrentQr()
    const state = getConnectionState()
    const user = state === 'open' ? getBotUser() : null

    let qrDataUrl: string | null = null
    if (qr) {
      qrDataUrl = await QRCode.toDataURL(qr, { width: 300 })
    }

    return reply.send({
      qr: qrDataUrl,
      state: state ?? 'connecting',
      user,
    })
  })

  app.post('/api/logout', async (_req, reply) => {
    try {
      const sock = getSock()
      await sock.logout('User requested logout from dashboard')
      return reply.send({ ok: true })
    } catch {
      return reply.status(500).send({ ok: false, error: 'Not connected' })
    }
  })

  app.get('/qr', async (_req, reply) => {
    return reply.sendFile('qr.html')
  })
}
