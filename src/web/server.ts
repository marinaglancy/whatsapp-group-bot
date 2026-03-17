import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { registerQrRoutes } from './routes/qr.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function startWebServer() {
  const app = Fastify({ logger: false })

  await app.register(fastifyStatic, {
    root: resolve(__dirname, 'static'),
    prefix: '/',
  })

  registerQrRoutes(app)

  await app.listen({ port: config.port, host: config.host })
  logger.info(`Web server listening on http://${config.host}:${config.port}`)
}
