"use strict";

// ─── Load Config (harus pertama, sebelum modul lain) ─────────────────────────
const { config, validate } = require("./src/config");
validate();

// ─── Dependencies ────────────────────────────────────────────────────────────
const { Client, RichPresence }  = require("discord.js-selfbot-v13");
const { createLogger }          = require("./src/logger");
const { joinVC, handleVoiceStateUpdate, cleanup } = require("./src/voice");
const { startVoter, stopVoter } = require("./src/voter");

// ─── Init Logger ─────────────────────────────────────────────────────────────
const log = createLogger(config.logLevel);

log.separator("STARTUP");
log.info("BOOT", "AFK Selfbot starting...");
log.info("BOOT", `Log level: ${config.logLevel}`);
if (config.ownerId) {
  log.info("BOOT", `Owner ID: ${config.ownerId}`);
}
log.info("BOOT", `Reconnect delay: ${config.reconnectDelay}ms`);
log.info("BOOT", `Activity: ${config.activity.type} ${config.activity.name}`);
log.info("BOOT", `Top.gg Voter: ${config.voter.enabled ? "Enabled (TempVoice)" : "Disabled"}`);
if (config.voiceChannelId) {
  log.info("BOOT", `Auto-join VC: ${config.voiceChannelId}`);
}

// ─── Discord Client ──────────────────────────────────────────────────────────

const client = new Client({
  checkUpdate: false,
  readyStatus: false,
  intents: [
    "GUILDS",
    "GUILD_VOICE_STATES",
  ],
});

// ─── Helper: Resolve Rich Presence Asset ID ─────────────────────────────────

async function resolveAsset(client, appId, asset) {
  if (!asset || asset === "none" || asset === "false") return null;
  // External URL via proxy
  if (asset.startsWith("http://") || asset.startsWith("https://")) {
    try {
      const assets = await RichPresence.getExternal(client, appId, asset);
      if (assets && assets[0]?.external_asset_path) {
        return `mp:${assets[0].external_asset_path}`;
      }
    } catch {}
    return asset;
  }
  // Snowflake ID (17-20 digit angka)
  if (/^[0-9]{17,20}$/.test(asset)) {
    return asset;
  }
  // Nama asset di Discord Developer Portal Art Assets (misal: "gta6")
  try {
    const res = await fetch(`https://discord.com/api/v9/oauth2/applications/${appId}/assets`);
    if (res.ok) {
      const assets = await res.json();
      const match = assets.find((a) => a.name.toLowerCase() === asset.toLowerCase());
      if (match) return match.id;
    }
  } catch {}
  // Fallback khusus jika gta6
  if (asset.toLowerCase() === "gta6" && appId === "1546574770047291453") {
    return "1546576904646303845";
  }
  return asset;
}

// ─── Events ──────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  log.separator("READY");
  log.info("READY", `Login sebagai: ${client.user.tag} (${client.user.id})`);
  log.info("READY", `Servers: ${client.guilds.cache.size}`);

  // Set activity (Rich Presence jika RPC_APP_ID di-set, basic jika tidak)
  if (config.activity.appId) {
    try {
      const rpc = new RichPresence(client)
        .setApplicationId(config.activity.appId)
        .setType("PLAYING")
        .setName(config.activity.name)
        .setStartTimestamp(Date.now());

      // Jangan set details kecuali didefinisikan secara eksplisit (agar tidak ada teks kecil di bawah nama game)
      if (config.activity.details) {
        rpc.setDetails(config.activity.details);
      }

      const imageVal = config.activity.largeImage;
      if (imageVal) {
        const resolvedImage = await resolveAsset(client, config.activity.appId, imageVal);
        if (resolvedImage) {
          rpc.setAssetsLargeImage(resolvedImage);
        }
        if (config.activity.largeText) {
          rpc.setAssetsLargeText(config.activity.largeText);
        }
      }

      client.user.setActivity(rpc);
      log.info("READY", `Rich Presence set: ${config.activity.name} (appId: ${config.activity.appId}, icon: ${config.activity.largeImage})`);
    } catch (e) {
      log.warn("READY", `Rich Presence gagal: ${e.message}`, e.stack);
      client.user.setActivity(config.activity.name, { type: config.activity.type });
    }
  } else {
    client.user.setActivity(config.activity.name, { type: config.activity.type });
    log.info("READY", `Basic activity set: ${config.activity.type} ${config.activity.name}`);
  }

  // Auto-join VC jika di-set
  if (config.voiceChannelId) {
    log.info("VOICE", `Auto-joining channel ${config.voiceChannelId}...`);
    const result = await joinVC(client, config.voiceChannelId);
    log.info("VOICE", result);
  } else {
    log.info("READY", "Tidak ada VOICE_CHANNEL_ID di .env.");
  }

  log.separator("RUNNING");

  // Mulai auto-voter top.gg
  startVoter();
});

// ── Voice State Tracking ─────────────────────────────────────────────────────
client.on("voiceStateUpdate", (o, n) => handleVoiceStateUpdate(client, o, n));

// ── Error Handling ───────────────────────────────────────────────────────────
client.on("error", (e) => {
  log.error("CLIENT", `Discord client error: ${e.message}`, e.stack);
});

client.on("warn", (warning) => {
  log.warn("CLIENT", `Discord warning: ${warning}`);
});

client.on("disconnect", () => {
  log.warn("CLIENT", "Client disconnected dari Discord.");
});

client.on("reconnecting", () => {
  log.info("CLIENT", "Client mencoba reconnect ke Discord...");
});

process.on("unhandledRejection", (e) => {
  log.error("PROCESS", `Unhandled rejection: ${e?.message ?? e}`, e?.stack);
});

process.on("uncaughtException", (e) => {
  log.error("PROCESS", `Uncaught exception: ${e.message}`, e.stack);
  gracefulShutdown("uncaughtException");
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  log.separator("SHUTDOWN");
  log.info("SHUTDOWN", `Menerima signal: ${signal}`);

  cleanup();
  stopVoter();
  log.info("SHUTDOWN", "Voice & voter cleanup selesai.");

  client.destroy();
  log.info("SHUTDOWN", "Client destroyed.");
  log.info("SHUTDOWN", "Bot berhenti. Bye! 👋");
  log.close();

  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ─── Login ───────────────────────────────────────────────────────────────────

log.info("BOOT", "Mencoba login ke Discord...");

client.login(config.token).catch((e) => {
  log.error("BOOT", `Login gagal: ${e.message}`, e.stack);
  log.close();
  process.exit(1);
});
