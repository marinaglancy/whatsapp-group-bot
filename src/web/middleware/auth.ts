import type { FastifyRequest, FastifyReply } from 'fastify'
import { getSession } from '../../db/queries/sessions.js'

declare module 'fastify' {
  interface Session {
    authenticated?: boolean
    dashboardToken?: string
    dashboardUserJid?: string
  }
}

/** Guard for admin panel routes (username/password session) */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authenticated) {
    return reply.redirect('/admin/login')
  }
}

/** Guard for admin panel API routes (username/password session) */
export async function requireAuthApi(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}

/** Guard for dashboard routes (token-based session via WhatsApp) */
export async function requireDashboardAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.session.dashboardToken
  if (!token || !getSession(token)) {
    return reply.redirect('/')
  }
}

/** Guard for dashboard API routes (token-based session via WhatsApp) */
export async function requireDashboardAuthApi(req: FastifyRequest, reply: FastifyReply) {
  const token = req.session.dashboardToken
  if (!token || !getSession(token)) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}

/** Check if request has a valid dashboard session (for conditional rendering) */
export function hasDashboardSession(req: FastifyRequest): boolean {
  const token = req.session.dashboardToken
  if (!token) return false
  return !!getSession(token)
}
