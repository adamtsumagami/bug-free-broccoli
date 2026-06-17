# AFK Selfbot v2.0

Discord AFK selfbot — tetap di voice channel dengan auto-reconnect dan logging lengkap.

> ⚠️ Self-bot melanggar ToS Discord. Gunakan dengan risiko sendiri.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Konfigurasi

Copy `.env.example` dan isi dengan data kamu:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DISCORD_TOKEN=your_user_token_here
OWNER_ID=your_discord_user_id

# Opsional
VOICE_CHANNEL_ID=123456789012345678
RECONNECT_DELAY_MS=5000
LOG_LEVEL=INFO
ACTIVITY_NAME=Minecraft
ACTIVITY_TYPE=PLAYING
```

### 3. Jalankan

```bash
npm start
```

Atau dengan PM2:

```bash
pm2 start index.js --name afkbot
pm2 save && pm2 startup
```

## Command (via DM)

| Command            | Fungsi                    | Akses       |
|--------------------|---------------------------|-------------|
| `!join <id>`       | Join voice channel        | Whitelist   |
| `!status`          | Cek status lengkap bot    | Whitelist   |
| `!help`            | Daftar semua command      | Whitelist   |
| `!add <user_id>`   | Tambah user ke whitelist  | Owner only  |
| `!remove <user_id>`| Hapus user dari whitelist | Owner only  |

## Logging

Log ditulis ke console dan file di `logs/bot-YYYY-MM-DD.log`.

**Log levels** (set via `LOG_LEVEL` di `.env`):
- `DEBUG` — semua detail (termasuk auth checks)
- `INFO` — operasi normal (join, command, reconnect)
- `WARN` — hal yang perlu perhatian (disconnect, failed auth)
- `ERROR` — error yang perlu ditangani

Contoh output:
```
2026-06-18 01:30:00 INFO  [BOOT]  AFK Selfbot starting...
2026-06-18 01:30:01 INFO  [READY] Login sebagai: User#1234 (123456789)
2026-06-18 01:30:01 INFO  [VOICE] Joined #general di server "My Server" (987654321)
2026-06-18 01:35:00 WARN  [VOICE] Disconnected dari channel 987654321
2026-06-18 01:35:05 INFO  [VOICE] Reconnect attempt #1 ke channel 987654321...
```

## Struktur Proyek

```
├── index.js          # Entry point
├── src/
│   ├── config.js     # Konfigurasi & validasi
│   ├── logger.js     # Logging system
│   ├── voice.js      # Voice channel management
│   └── commands.js   # DM command handler
├── logs/             # Log files (auto-generated)
├── .env              # Konfigurasi (jangan commit!)
├── .env.example      # Template konfigurasi
└── package.json
```
