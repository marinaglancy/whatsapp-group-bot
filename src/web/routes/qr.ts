import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { getCurrentQr, getConnectionState, getBotUser } from '../../whatsapp/handlers/connection.js'

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

  app.get('/qr', async (_req, reply) => {
    return reply.sendFile('qr.html')
  })
}
