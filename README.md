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
ACTIVITY_NAME=Grand Theft Auto VI
ACTIVITY_TYPE=PLAYING

# Rich Presence dengan icon (opsional, buat app di discord.com/developers)
RPC_APP_ID=123456789012345678
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

## Top.gg Auto Voter (TempVoice)

Bot dilengkapi fitur otomatis voting untuk bot **TempVoice** di top.gg setiap 12 jam:

- **Target Bot**: TempVoice (`762217899355013120`)
- **Interval**: Setiap 12 jam (sesuai batas cooldown top.gg)
- **Cara Kerja**: Menggunakan Puppeteer headless browser untuk mengautentikasi sesi Discord ke top.gg OAuth dan mengeklik vote secara otomatis.

Untuk mengaktifkannya, set di `.env`:
```env
TOPGG_VOTER_ENABLED=true
```

## Logging

Log ditulis ke console dan file di `logs/bot-YYYY-MM-DD.log`.

**Log levels** (set via `LOG_LEVEL` di `.env`):
- `DEBUG` — semua detail (termasuk auth checks)
- `INFO` — operasi normal (join, reconnect, voter)
- `WARN` — hal yang perlu perhatian (disconnect, failed auth)
- `ERROR` — error yang perlu ditangani

Contoh output:
```
2026-06-18 01:30:00 INFO  [BOOT]  AFK Selfbot starting...
2026-06-18 01:30:01 INFO  [READY] Login sebagai: User#1234 (123456789)
2026-06-18 01:30:01 INFO  [VOICE] Joined #general di server "My Server" (987654321)
```

## Struktur Proyek

```
├── index.js          # Entry point
├── assets/           # Art assets (logo GTA VI berukuran proporsional)
│   ├── gta6_logo.png     # Logo standar (proporsional dengan padding)
│   └── gta6_compact.png  # Logo compact (ukuran lebih kecil/minimalis)
├── src/
│   ├── config.js     # Konfigurasi & validasi
│   ├── logger.js     # Logging system
│   ├── voice.js      # Voice channel management
│   └── voter.js      # Top.gg auto voter (TempVoice)
├── logs/             # Log files (auto-generated)
├── .env              # Konfigurasi (jangan commit!)
├── .env.example      # Template konfigurasi
└── package.json
```
