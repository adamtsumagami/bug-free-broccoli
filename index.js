"use strict";

// ─── Load Config (harus pertama, sebelum modul lain) ─────────────────────────
const { config, validate } = require("./src/config");
validate();

// ─── Dependencies ────────────────────────────────────────────────────────────
const { Client, RichPresence }  = require("discord.js-selfbot-v13");
const { createLogger }          = require("./src/logger");
const { joinVC, handleVoiceStateUpdate, cleanup } = require("./src/voice");

// ─── Init Logger ─────────────────────────────────────────────────────────────
const log = createLogger(config.logLevel);

log.separator("STARTUP");
log.info("BOOT", "AFK Selfbot starting...");
log.info("BOOT", `Log level: ${config.logLevel}`);
if (config.ownerIds.length > 0) {
  log.info("BOOT", `Owner IDs: ${config.ownerIds.join(", ")}`);
}
log.info("BOOT", `Reconnect delay: ${config.reconnectDelay}ms`);
log.info("BOOT", `Activity: ${config.activity.type} ${config.activity.name}`);
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

  // URL → konversi via getExternal API (hanya untuk URL publik non-Discord)
  if (asset.startsWith("http://") || asset.startsWith("https://")) {
    try {
      const result = await RichPresence.getExternal(client, appId, asset);
      if (result && result[0]?.external_asset_path) {
        const ext = result[0].external_asset_path;
        // Pastikan hasilnya mp:external/... (satu-satunya format URL yg didukung RPC)
        if (ext.startsWith("mp:")) return ext;
        return ext.startsWith("external/") ? `mp:${ext}` : `mp:external/${ext}`;
      }
    } catch (e) {
      log.warn("RPC", `getExternal gagal untuk "${asset}": ${e.message}`);
    }
    log.warn("RPC", `Tidak bisa resolve URL "${asset}". Gunakan nama asset dari Developer Portal (misal: "gta6").`);
    return null;
  }

  // mp:external/... path (sudah di-resolve sebelumnya)
  if (asset.startsWith("mp:")) {
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
      const list = await res.json();
      const match = list.find((a) => a.name.toLowerCase() === asset.toLowerCase());
      if (match) return match.id;
    }
  } catch {}

  return asset;
}

// ─── Events ──────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  log.separator("READY");
  log.info("READY", `Login sebagai: ${client.user.tag} (${client.user.id})`);
  log.info("READY", `Servers: ${client.guilds.cache.size}`);

  // Set Rich Presence
  if (config.activity.appId) {
    try {
      const rpc = new RichPresence(client)
        .setApplicationId(config.activity.appId)
        .setType("PLAYING")
        .setName(config.activity.name)
        .setStartTimestamp(Date.now());

      if (config.activity.details) {
        rpc.setDetails(config.activity.details);
      }

      // Resolve asset: nama asset → Snowflake ID, URL eksternal → mp:external/..., dll
      const imageVal = config.activity.largeImage;
      if (imageVal) {
        const resolvedImage = await resolveAsset(client, config.activity.appId, imageVal);
        if (resolvedImage) {
          rpc.setAssetsLargeImage(resolvedImage);
          log.info("RPC", `Large image resolved: "${resolvedImage}"`);
        } else {
          log.warn("RPC", `Gagal resolve large image "${imageVal}". Logo dilewati agar activity tetap tampil.`);
        }
        if (config.activity.largeText) {
          rpc.setAssetsLargeText(config.activity.largeText);
        }
      }

      client.user.setActivity(rpc);
      client.user.setStatus("online");
      log.info("READY", `Rich Presence: ${config.activity.name} (${config.activity.appId})`);
    } catch (e) {
      log.warn("READY", `Rich Presence gagal: ${e.message}`, e.stack);
      client.user.setActivity(config.activity.name, { type: config.activity.type });
    }
  } else {
    client.user.setActivity(config.activity.name, { type: config.activity.type });
    client.user.setStatus("online");
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
});

// ── Voice State Tracking ─────────────────────────────────────────────────────
client.on("voiceStateUpdate", (o, n) => handleVoiceStateUpdate(client, o, n));

// ── Error & Connection Handling ──────────────────────────────────────────────
client.on("error", (e) => {
  log.error("CLIENT", `Discord client error: ${e.message}`, e.stack);
});

client.on("warn", (warning) => {
  log.warn("CLIENT", `Discord warning: ${warning}`);
});

client.on("disconnect", (event) => {
  const code = event?.code ?? "unknown";
  const reason = event?.reason ?? "tidak ada alasan";
  log.warn("CLIENT", `WebSocket disconnected [code: ${code}]: ${reason}`);
});

client.on("reconnecting", () => {
  log.info("CLIENT", "Client mencoba reconnect ke Discord...");
});

client.on("invalidated", () => {
  log.error("CLIENT", "Sesi Discord sudah tidak valid (invalidated). Token mungkin expired atau di-revoke.");
});

client.on("shardDisconnect", (event, shardId) => {
  log.warn("CLIENT", `Shard ${shardId} disconnected [code: ${event.code}]: ${event.reason || "no reason"}`);
});

client.on("shardReconnecting", (shardId) => {
  log.info("CLIENT", `Shard ${shardId} mencoba reconnect...`);
});

client.on("shardResume", (shardId, replayedEvents) => {
  log.info("CLIENT", `Shard ${shardId} resumed (${replayedEvents} events replayed).`);
});

client.on("shardError", (error, shardId) => {
  log.error("CLIENT", `Shard ${shardId} error: ${error.message}`, error.stack);
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
  log.info("SHUTDOWN", "Voice cleanup selesai.");

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
