# AFK Selfbot v2.0

Discord AFK selfbot — tetap di voice channel dengan auto-reconnect, custom Rich Presence (GTA VI), dan logging lengkap.

> ⚠️ Self-bot melanggar ToS Discord. Gunakan dengan risiko sendiri.

## Fitur

- **Auto-join Voice Channel** — otomatis masuk VC saat startup dengan auto-reconnect jika disconnect.
- **Custom Rich Presence** — menampilkan "Playing Grand Theft Auto VI" dengan logo di profil Discord (mendukung asset Developer Portal, Discord CDN URL, atau Snowflake ID).
- **Logging** — logging terstruktur ke console dan file harian.
- **Graceful Shutdown** — cleanup saat SIGINT/SIGTERM.

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

# Opsional
VOICE_CHANNEL_ID=123456789012345678
LOG_LEVEL=INFO
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

## Rich Presence (GTA VI)

Bot menampilkan Rich Presence "Playing Grand Theft Auto VI" menggunakan aplikasi Discord `gtavi` (App ID: `1546574770047291453`) dengan logo yang bisa dikonfigurasi via `.env`.

**Cara pasang logo:**

1. Download salah satu logo dari folder [`assets/`](./assets):
   - [`gta6_compact.png`](./assets/gta6_compact.png) — ukuran lebih kecil (recommended)
   - [`gta6_logo.png`](./assets/gta6_logo.png) — ukuran standar
2. Upload ke [Discord Developer Portal → gtavi → Art Assets](https://discord.com/developers/applications/1546574770047291453/rich-presence/assets), beri nama `gta6`.
3. Atau upload ke channel Discord mana saja lalu copy-paste URL `cdn.discordapp.com/...`-nya ke `.env`:
   ```env
   ACTIVITY_LARGE_IMAGE=https://cdn.discordapp.com/attachments/...
   ```

## Logging

Log ditulis ke console dan file di `logs/bot-YYYY-MM-DD.log`.

**Log levels** (set via `LOG_LEVEL` di `.env`):
- `DEBUG` — semua detail
- `INFO` — operasi normal (join, reconnect, RPC)
- `WARN` — hal yang perlu perhatian (disconnect)
- `ERROR` — error yang perlu ditangani

Contoh output:
```
2026-06-18 01:30:00 INFO  [BOOT]  AFK Selfbot starting...
2026-06-18 01:30:01 INFO  [READY] Login sebagai: User#1234 (123456789)
2026-06-18 01:30:01 INFO  [RPC]   Large image: "gta6" → "1546576904646303845"
2026-06-18 01:30:01 INFO  [VOICE] Joined #general di server "My Server" (987654321)
```

## Struktur Proyek

```
├── index.js          # Entry point
├── assets/           # Logo GTA VI (SVG master + PNG terrender)
│   ├── gta6_gradient.svg  # SVG asli dari Wikimedia Commons
│   ├── gta6_compact.png   # Logo compact 1024×1024 (recommended untuk Discord)
│   └── gta6_logo.png      # Logo standar 1024×1024
├── src/
│   ├── config.js     # Konfigurasi & validasi
│   ├── logger.js     # Logging system
│   └── voice.js      # Voice channel management
├── logs/             # Log files (auto-generated)
├── .env              # Konfigurasi (jangan commit!)
├── .env.example      # Template konfigurasi
└── package.json
```
