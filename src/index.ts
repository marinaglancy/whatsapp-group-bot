import { mkdirSync } from 'fs'
import { config } from './config.js'
import { logger } from './utils/logger.js'
import { initDb } from './db/index.js'
import { startConnection } from './whatsapp/client.js'
import { startWebServer } from './web/server.js'

async function main() {
  // Ensure data directories exist
  mkdirSync(config.authDir, { recursive: true })

  logger.info('Starting WhatsApp Group Bot...')

  // Initialize database
  initDb()

  // Start web server first so QR page is available
  await startWebServer()

  // Start WhatsApp connection
  await startConnection()
}

main().catch((err) => {
  logger.fatal(err, 'Failed to start bot')
  process.exit(1)
})
