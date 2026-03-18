import type { FastifyInstance } from 'fastify'
import { sendPage } from '../server.js'
import { requireDashboardAuthApi, hasDashboardSession } from '../middleware/auth.js'
import { activateToken } from '../../db/queries/sessions.js'
import { getAllGroups } from '../../db/queries/groups.js'

export function registerDashboardRoutes(app: FastifyInstance) {
  // Home page: show dashboard if authenticated, landing page otherwise
  app.get('/', async (req, reply) => {
    if (hasDashboardSession(req)) {
      return sendPage(reply, 'dashboard.html')
    }
    return sendPage(reply, 'index.html')
  })

  // Token activation
  app.get('/auth', async (req, reply) => {
    const { token } = req.query as { token?: string }
    if (!token) {
      return sendPage(reply, 'auth-error.html')
    }

    const session = activateToken(token)
    if (!session) {
      return sendPage(reply, 'auth-error.html')
    }

    req.session.dashboardToken = token
    req.session.dashboardUserJid = session.userJid
    return reply.redirect('/')
  })

  // Dashboard logout
  app.post('/dashboard/logout', async (req, reply) => {
    req.session.dashboardToken = undefined
    req.session.dashboardUserJid = undefined
    return reply.redirect('/')
  })

  // Dashboard API: groups list
  app.get('/api/groups', { preHandler: requireDashboardAuthApi }, async (_req, reply) => {
    const groups = getAllGroups()
    return reply.send({ groups })
  })
}
