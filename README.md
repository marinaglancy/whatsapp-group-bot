# WhatsApp Group Bot

Self-hosted WhatsApp group management bot. Monitors group activity, tracks members, and provides reports via a web dashboard.

## WhatsApp Account

This bot uses [Baileys](https://github.com/WhiskeySockets/Baileys), an open-source library that connects to WhatsApp as a linked device. No WhatsApp Business account or API subscription is needed — a regular WhatsApp account works.

Get a separate phone number for the bot. WhatsApp supports two accounts on one phone — you can switch between your personal and bot accounts without needing a second device.

## Requirements

- Node.js 22+
- npm

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: set ADMIN_PHONE, ADMIN_PASSWORD
npm run dev
```

1. Open `http://localhost:3000/admin/` and log in
2. Scan the QR code with WhatsApp (Linked Devices > Link a Device)
3. Add the bot to groups from the admin phone (`ADMIN_PHONE`) — if anyone else adds it, the bot will leave immediately
4. DM **web** to the bot to get a dashboard login link

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PHONE` | *(required)* | Admin phone with country code (e.g. `+1 234 567-8900`) |
| `ADMIN_PASSWORD` | *(required)* | Password for admin panel at `/admin/` |
| `ADMIN_USERNAME` | `admin` | Username for admin panel |
| `PORT` | `3000` | Web server port |
| `DATA_DIR` | `./data` | Directory for auth state and database |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `SESSION_SECRET` | *(auto-generated)* | Cookie signing secret |

Additional settings (project name, page size, base URL) are stored in the database and auto-configured. The base URL is detected automatically when you first visit the admin panel.

## Tech Stack

Baileys (WhatsApp Web) + Fastify + SQLite (better-sqlite3) + Drizzle ORM + TypeScript
