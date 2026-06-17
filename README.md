# AFK Selfbot v2.0

Discord AFK selfbot — tetap di voice channel dengan auto-reconnect, logging lengkap, dan **VCT Esports Rich Presence**.

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

# VCT Rich Presence (opsional)
RPC_APP_ID=123456789012345678
RPC_ROTATE_MINUTES=3
```

### 3. Setup RPC (Opsional)

Untuk mengaktifkan Rich Presence VCT Masters London:

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Klik **"New Application"** → beri nama (misal "VALORANT Esports")
3. Copy **Application ID** → paste ke `RPC_APP_ID` di `.env`
4. Selesai! Bot akan menampilkan matchup VCT secara otomatis

### 4. Jalankan

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

## VCT Rich Presence

Saat `RPC_APP_ID` di-set, bot akan menampilkan Rich Presence bertema **VCT Masters London 2026**:

- 🔴 **Live match** — saat tanggal sesuai jadwal pertandingan
- 📅 **Upcoming** — menampilkan pertandingan berikutnya
- ⚔️ **Showcase** — rotasi matchup dari seluruh jadwal

**Info yang ditampilkan:**
- Nama tim vs tim (contoh: `Paper Rex vs Leviatán`)
- Round (Swiss Stage, Upper Bracket, Grand Final, dll)
- Best of (BO3/BO5)
- Map pool
- Icon VCT Masters London & VALORANT logo
- Button link ke VALORANT Esports & Liquipedia

**12 Tim yang berpartisipasi:**

| Tim | Region | Seed |
|-----|--------|------|
| G2 Esports | Americas | #1 |
| EDward Gaming | China | #1 |
| Team Heretics | EMEA | #1 |
| Paper Rex | Pacific | #1 |
| Leviatán | Americas | #2 |
| NRG | Americas | #3 |
| XLG Esports | China | #2 |
| Dragon Ranger Gaming | China | #3 |
| Team Vitality | EMEA | #2 |
| FUT Esports | EMEA | #3 |
| FULL SENSE | Pacific | #2 |
| Global Esports | Pacific | #3 |

## Logging

Log ditulis ke console dan file di `logs/bot-YYYY-MM-DD.log`.

**Log levels** (set via `LOG_LEVEL` di `.env`):
- `DEBUG` — semua detail (termasuk auth checks, RPC updates)
- `INFO` — operasi normal (join, command, reconnect, RPC rotation)
- `WARN` — hal yang perlu perhatian (disconnect, failed auth)
- `ERROR` — error yang perlu ditangani

Contoh output:
```
2026-06-18 01:30:00 INFO  [BOOT]  AFK Selfbot starting...
2026-06-18 01:30:01 INFO  [READY] Login sebagai: User#1234 (123456789)
2026-06-18 01:30:01 INFO  [RPC]   Presence updated: PRX vs LEV (live) — Upper Quarterfinal
2026-06-18 01:30:01 INFO  [VOICE] Joined #general di server "My Server" (987654321)
```

## Struktur Proyek

```
├── index.js          # Entry point
├── src/
│   ├── config.js     # Konfigurasi & validasi
│   ├── logger.js     # Logging system
│   ├── voice.js      # Voice channel management
│   ├── commands.js   # DM command handler
│   └── rpc.js        # VCT Rich Presence
├── logs/             # Log files (auto-generated)
├── .env              # Konfigurasi (jangan commit!)
├── .env.example      # Template konfigurasi
└── package.json
```
