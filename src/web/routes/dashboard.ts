import type { FastifyInstance } from 'fastify'
import { sendPage } from '../server.js'
import { requireDashboardAuth, requireDashboardAuthApi, hasDashboardSession } from '../middleware/auth.js'
import { activateToken } from '../../db/queries/sessions.js'
import { getAllGroups, getGroup } from '../../db/queries/groups.js'
import { getGroupMemberCounts, getGroupMembers } from '../../db/queries/members.js'
import { getGroupActivityCounts, getGroupLastActivity, getGroupUserActivity } from '../../db/queries/activity.js'
import { getSock } from '../../whatsapp/client.js'
import { jidNormalizedUser } from 'baileys'

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

  // Group detail page
  app.get('/group/:jid', { preHandler: requireDashboardAuth }, async (_req, reply) => {
    return sendPage(reply, 'group.html')
  })

  // Dashboard logout
  app.post('/dashboard/logout', async (req, reply) => {
    req.session.dashboardToken = undefined
    req.session.dashboardUserJid = undefined
    return reply.redirect('/')
  })

  // Dashboard API: groups list with stats
  app.get('/api/groups', { preHandler: requireDashboardAuthApi }, async (_req, reply) => {
    const groups = getAllGroups()
    const jids = groups.map(g => g.jid)

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 86400)
    const memberCounts = getGroupMemberCounts(jids)
    const activityCounts = getGroupActivityCounts(jids, thirtyDaysAgo)
    const lastActivity = getGroupLastActivity(jids)

    const enriched = groups.map(g => ({
      ...g,
      memberCount: memberCounts.get(g.jid) ?? 0,
      monthlyActivity: activityCounts.get(g.jid) ?? 0,
      lastActivity: lastActivity.get(g.jid) ?? null,
    }))

    return reply.send({ groups: enriched })
  })

  // Dashboard API: group detail with member activity
  app.get('/api/groups/:jid', { preHandler: requireDashboardAuthApi }, async (req, reply) => {
    const { jid } = req.params as { jid: string }

    const group = getGroup(jid)
    if (!group) {
      return reply.status(404).send({ error: 'Group not found' })
    }

    const members = getGroupMembers(jid, { includeLeft: true })
    const memberCounts = getGroupMemberCounts([jid])
    const lastActivity = getGroupLastActivity([jid])
    const userActivity = getGroupUserActivity(jid, 30)

    const activityMap = new Map(userActivity.map(a => [a.userJid, a]))

    // Determine bot JID for "This bot" badge
    let botUserJid: string | null = null
    try {
      const sock = getSock()
      if (sock.user?.lid) botUserJid = jidNormalizedUser(sock.user.lid)
      else if (sock.user?.id) botUserJid = jidNormalizedUser(sock.user.id)
    } catch { /* not connected */ }

    const enrichedMembers = members.map(m => {
      const activity = activityMap.get(m.userJid)
      return {
        ...m,
        isBot: botUserJid ? m.userJid === botUserJid : false,
        posts: activity?.posts ?? 0,
        reactions: activity?.reactions ?? 0,
        total: activity?.total ?? 0,
        lastActivity: activity?.lastActivity ?? null,
      }
    })

    return reply.send({
      group: {
        ...group,
        memberCount: memberCounts.get(jid) ?? 0,
        lastActivity: lastActivity.get(jid) ?? null,
      },
      members: enrichedMembers,
    })
  })
}
