import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { config } from '../../config.js'
import { sendPage } from '../server.js'
import { getCurrentQr, getConnectionState, getBotUser } from '../../whatsapp/handlers/connection.js'
import { getSock } from '../../whatsapp/client.js'
import { requireAuth, requireAuthApi } from '../middleware/auth.js'
import { setSetting, getSettingOrDefault } from '../../db/queries/settings.js'

export function registerAdminRoutes(app: FastifyInstance) {
  // --- Public: login page ---
  app.get('/admin/login', async (req, reply) => {
    if (req.session.authenticated) {
      return reply.redirect('/admin/')
    }
    return sendPage(reply, 'login.html')
  })

  app.post('/admin/login', async (req, reply) => {
    const { username, password } = req.body as { username?: string; password?: string }

    if (!config.adminPassword) {
      return reply.status(503).send('ADMIN_PASSWORD not configured in .env')
    }

    if (username === config.adminUsername && password === config.adminPassword) {
      req.session.authenticated = true
      return reply.redirect('/admin/')
    }

    return reply.redirect('/admin/login?error=1')
  })

  // --- Protected: admin pages ---
  app.get('/admin', { preHandler: requireAuth }, async (_req, reply) => {
    return reply.redirect('/admin/')
  })

  app.get('/admin/', { preHandler: requireAuth }, async (req, reply) => {
    // Auto-detect base URL from every admin request (self-corrects if domain changes)
    const proto = req.headers['x-forwarded-proto'] || req.protocol
    const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname
    setSetting('base_url', `${proto}://${host}`)
    return sendPage(reply, 'qr.html')
  })

  app.get('/admin/settings', { preHandler: requireAuth }, async (_req, reply) => {
    return sendPage(reply, 'settings.html')
  })

  app.post('/admin/logout', { preHandler: requireAuth }, async (req, reply) => {
    await req.session.destroy()
    return reply.redirect('/admin/login')
  })

  // --- Protected: admin API ---
  app.get('/admin/api/qr', { preHandler: requireAuthApi }, async (_req, reply) => {
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

  app.get('/admin/api/settings', { preHandler: requireAuthApi }, async (_req, reply) => {
    const defaults: Record<string, string> = {
      project_name: 'WhatsApp Group Bot',
      page_size: '50',
    }
    const result: Record<string, string> = {}
    for (const [key, def] of Object.entries(defaults)) {
      result[key] = getSettingOrDefault(key, def)
    }
    return reply.send(result)
  })

  app.post('/admin/api/settings', { preHandler: requireAuthApi }, async (req, reply) => {
    const body = req.body as Record<string, string>
    const allowed = ['project_name', 'page_size']
    for (const key of allowed) {
      if (key in body && typeof body[key] === 'string') {
        setSetting(key, body[key])
      }
    }
    return reply.send({ ok: true })
  })

  app.post('/admin/api/disconnect', { preHandler: requireAuthApi }, async (_req, reply) => {
    try {
      const sock = getSock()
      await sock.logout('Admin requested disconnect from dashboard')
      return reply.send({ ok: true })
    } catch {
      return reply.status(500).send({ ok: false, error: 'Not connected' })
    }
  })
}
