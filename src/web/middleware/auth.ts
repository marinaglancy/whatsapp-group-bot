import type { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface Session {
    authenticated?: boolean
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authenticated) {
    return reply.redirect('/admin/login')
  }
}

export async function requireAuthApi(req: FastifyRequest, reply: FastifyReply) {
  if (!req.session.authenticated) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}
