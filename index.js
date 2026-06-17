"use strict";

// ─── Load Config (harus pertama, sebelum modul lain) ─────────────────────────
const { config, validate } = require("./src/config");
validate();

// ─── Dependencies ────────────────────────────────────────────────────────────
const { Client }                = require("discord.js-selfbot-v13");
const { createLogger }          = require("./src/logger");
const { joinVC, handleVoiceStateUpdate, cleanup } = require("./src/voice");
const { handleMessage }         = require("./src/commands");
const { startRPC, stopRPC }     = require("./src/rpc");

// ─── Init Logger ─────────────────────────────────────────────────────────────
const log = createLogger(config.logLevel);

log.separator("STARTUP");
log.info("BOOT", "AFK Selfbot starting...");
log.info("BOOT", `Log level: ${config.logLevel}`);
log.info("BOOT", `Owner ID: ${config.ownerId}`);
log.info("BOOT", `Reconnect delay: ${config.reconnectDelay}ms`);
log.info("BOOT", `Activity: ${config.activity.type} ${config.activity.name}`);
if (config.rpc.appId) {
  log.info("BOOT", `RPC App ID: ${config.rpc.appId}`);
  log.info("BOOT", `RPC Rotation: every ${config.rpc.rotateMinutes} minutes`);
}
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
    "DIRECT_MESSAGES",
  ],
  partials: ["CHANNEL"],
});

// ─── Events ──────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  log.separator("READY");
  log.info("READY", `Login sebagai: ${client.user.tag} (${client.user.id})`);
  log.info("READY", `Servers: ${client.guilds.cache.size}`);

  // Start VCT Rich Presence (or fallback to basic activity)
  startRPC(client);

  // Auto-join VC jika di-set
  if (config.voiceChannelId) {
    log.info("VOICE", `Auto-joining channel ${config.voiceChannelId}...`);
    const result = await joinVC(client, config.voiceChannelId);
    log.info("VOICE", result);
  } else {
    log.info("READY", "Tidak ada VOICE_CHANNEL_ID. Kirim DM '!join <channel_id>' untuk mulai.");
  }

  log.separator("RUNNING");
  log.info("READY", "Bot siap menerima perintah via DM.");
});

// ── DM Commands ──────────────────────────────────────────────────────────────
client.on("messageCreate", (msg) => handleMessage(client, msg));

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
  stopRPC();
  log.info("SHUTDOWN", "Voice & RPC cleanup selesai.");

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
