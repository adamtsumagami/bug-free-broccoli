"use strict";

const path = require("path");

// Load .env dari root project
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

// ─── Validasi & Export Config ────────────────────────────────────────────────

const config = {
  token:          process.env.DISCORD_TOKEN       || null,
  ownerId:        process.env.OWNER_ID            || null,
  voiceChannelId: process.env.VOICE_CHANNEL_ID    || null,
  voiceSelfMute:  process.env.VOICE_SELF_MUTE !== "false",
  voiceSelfDeaf:  process.env.VOICE_SELF_DEAF !== "false",
  reconnectDelay: parseInt(process.env.RECONNECT_DELAY_MS, 10) || 5000,
  logLevel:       (process.env.LOG_LEVEL || "INFO").toUpperCase(),
  activity: {
    name: process.env.ACTIVITY_NAME || "Grand Theft Auto VI",
    type: process.env.ACTIVITY_TYPE || "PLAYING",
    appId: process.env.RPC_APP_ID || null,
    largeImage: process.env.ACTIVITY_LARGE_IMAGE || "gta6",
    largeText: process.env.ACTIVITY_LARGE_TEXT || "Grand Theft Auto VI",
  },
  voter: {
    enabled: process.env.TOPGG_VOTER_ENABLED === "true",
    cookie: process.env.TOPGG_COOKIE || null,
  },
};

// ─── Validasi wajib ──────────────────────────────────────────────────────────

function validate() {
  const errors = [];

  if (!config.token || config.token === "your_user_token_here") {
    errors.push("DISCORD_TOKEN belum di-set. Isi di file .env atau environment variable.");
  }
  if (!config.ownerId || config.ownerId === "your_discord_user_id") {
    errors.push("OWNER_ID belum di-set. Isi di file .env atau environment variable.");
  }

  const validLevels = ["DEBUG", "INFO", "WARN", "ERROR"];
  if (!validLevels.includes(config.logLevel)) {
    errors.push(`LOG_LEVEL "${config.logLevel}" tidak valid. Pilih: ${validLevels.join(", ")}`);
  }

  if (errors.length > 0) {
    console.error("\n╔══════════════════════════════════════════════════╗");
    console.error("║          ❌  KONFIGURASI TIDAK VALID             ║");
    console.error("╚══════════════════════════════════════════════════╝\n");
    errors.forEach((e) => console.error(`  → ${e}`));
    console.error("\n  Lihat .env.example untuk contoh konfigurasi.\n");
    process.exit(1);
  }
}

module.exports = { config, validate };
