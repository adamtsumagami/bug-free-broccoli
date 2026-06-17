"use strict";

const { getLogger }  = require("./logger");
const { config }     = require("./config");
const { joinVC, getState } = require("./voice");

const log     = getLogger();
const startAt = Date.now();

// ─── Whitelist ───────────────────────────────────────────────────────────────

const allowed = new Set([config.ownerId]);

function isAllowed(userId) {
  return allowed.has(userId);
}

// ─── Uptime Formatting ──────────────────────────────────────────────────────

function formatUptime() {
  const diff = Math.floor((Date.now() - startAt) / 1000);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

// ─── Command Definitions ────────────────────────────────────────────────────

const COMMANDS = {
  "!join": {
    desc: "Join voice channel",
    usage: "!join <channel_id>",
    ownerOnly: false,
    handler: async (msg, args, client) => {
      const channelId = args[0];
      if (!channelId) {
        return msg.channel.send("❌ Usage: `!join <channel_id>`");
      }
      const result = await joinVC(client, channelId);
      msg.channel.send(result);
    },
  },

  "!add": {
    desc: "Tambah user ke whitelist",
    usage: "!add <user_id>",
    ownerOnly: true,
    handler: async (msg, args) => {
      const userId = args[0];
      if (!userId) {
        return msg.channel.send("❌ Usage: `!add <user_id>`");
      }
      if (allowed.has(userId)) {
        return msg.channel.send(`⚠️ \`${userId}\` sudah ada di whitelist.`);
      }
      allowed.add(userId);
      log.info("CMD", `User ${msg.author.tag} menambahkan ${userId} ke whitelist.`);
      msg.channel.send(`✅ \`${userId}\` ditambahkan ke whitelist.`);
    },
  },

  "!remove": {
    desc: "Hapus user dari whitelist",
    usage: "!remove <user_id>",
    ownerOnly: true,
    handler: async (msg, args) => {
      const userId = args[0];
      if (!userId) {
        return msg.channel.send("❌ Usage: `!remove <user_id>`");
      }
      if (userId === config.ownerId) {
        return msg.channel.send("❌ Tidak bisa hapus owner dari whitelist.");
      }
      if (!allowed.has(userId)) {
        return msg.channel.send(`⚠️ \`${userId}\` tidak ada di whitelist.`);
      }
      allowed.delete(userId);
      log.info("CMD", `User ${msg.author.tag} menghapus ${userId} dari whitelist.`);
      msg.channel.send(`✅ \`${userId}\` dihapus dari whitelist.`);
    },
  },

  "!status": {
    desc: "Cek status bot",
    usage: "!status",
    ownerOnly: false,
    handler: async (msg, _args, client) => {
      const voiceState = getState();
      const inVoice    = !!voiceState.currentVC;
      const lastJoin   = voiceState.lastJoinTime
        ? voiceState.lastJoinTime.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
        : "—";

      const lines = [
        `📊 **Status Bot AFK**`,
        ``,
        `🔊 Voice: ${inVoice ? `✅ Channel \`${voiceState.currentVC}\`` : "❌ Tidak aktif"}`,
        `⏱️ Uptime: \`${formatUptime()}\``,
        `🔄 Reconnects: \`${voiceState.reconnCount}\``,
        `📅 Last Join: \`${lastJoin}\``,
        `📋 Log Level: \`${config.logLevel}\``,
        `👥 Whitelist: ${[...allowed].map(i => `\`${i}\``).join(", ")}`,
        `🎮 Activity: \`${config.activity.type} ${config.activity.name}\``,
      ];

      msg.channel.send(lines.join("\n"));
    },
  },

  "!help": {
    desc: "Tampilkan daftar command",
    usage: "!help",
    ownerOnly: false,
    handler: async (msg) => {
      const lines = [
        `📖 **Daftar Command**`,
        ``,
      ];

      for (const [name, cmd] of Object.entries(COMMANDS)) {
        const lock = cmd.ownerOnly ? " 🔒" : "";
        lines.push(`\`${cmd.usage}\` — ${cmd.desc}${lock}`);
      }

      lines.push(``, `🔒 = Owner only`);
      msg.channel.send(lines.join("\n"));
    },
  },
};

// ─── Message Handler ─────────────────────────────────────────────────────────

async function handleMessage(client, msg) {
  // Abaikan pesan dari server (hanya terima DM)
  if (msg.guildId) return;

  // Cek whitelist
  if (!isAllowed(msg.author.id)) {
    log.debug("AUTH", `Pesan DM dari user tidak dikenal: ${msg.author.tag} (${msg.author.id})`);
    return;
  }

  const parts = msg.content.trim().split(/\s+/);
  const cmd   = parts[0]?.toLowerCase();
  const args  = parts.slice(1);

  const command = COMMANDS[cmd];
  if (!command) return; // Bukan command, abaikan

  // Log command masuk
  log.info("CMD", `${msg.author.tag} (${msg.author.id}): ${msg.content.trim()}`);

  // Cek owner-only
  if (command.ownerOnly && msg.author.id !== config.ownerId) {
    log.warn("AUTH", `${msg.author.tag} mencoba command owner-only: ${cmd}`);
    return msg.channel.send("❌ Command ini hanya untuk owner.");
  }

  try {
    await command.handler(msg, args, client);
  } catch (e) {
    log.error("CMD", `Error menjalankan ${cmd}: ${e.message}`, e.stack);
    msg.channel.send(`❌ Error: ${e.message}`);
  }
}

module.exports = { handleMessage };
