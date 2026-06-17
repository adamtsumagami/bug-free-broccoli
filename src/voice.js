"use strict";

const { joinVoiceChannel } = require("@discordjs/voice");
const { getLogger }        = require("./logger");
const { config }           = require("./config");

const log = getLogger();

// ─── State ───────────────────────────────────────────────────────────────────

let currentVC    = config.voiceChannelId;
let reconnTimer  = null;
let reconnCount  = 0;
let lastJoinTime = null;

// ─── Getters ─────────────────────────────────────────────────────────────────

function getState() {
  return {
    currentVC,
    reconnCount,
    lastJoinTime,
    isReconnecting: reconnTimer !== null,
  };
}

// ─── Join Voice Channel ──────────────────────────────────────────────────────

async function joinVC(client, channelId) {
  try {
    const ch = await client.channels.fetch(channelId);

    if (!ch) {
      log.warn("VOICE", `Channel ${channelId} tidak ditemukan.`);
      return `❌ Channel \`${channelId}\` tidak ditemukan.`;
    }

    if (ch.type !== "GUILD_VOICE" && ch.type !== "GUILD_STAGE_VOICE") {
      log.warn("VOICE", `Channel ${ch.name} bukan voice channel (type: ${ch.type}).`);
      return `❌ \`${ch.name}\` bukan voice channel.`;
    }

    joinVoiceChannel({
      channelId: ch.id,
      guildId: ch.guild.id,
      adapterCreator: ch.guild.voiceAdapterCreator,
      selfMute: true,
      selfDeaf: true,
    });

    currentVC    = channelId;
    lastJoinTime = new Date();

    log.info("VOICE", `Joined #${ch.name} di server "${ch.guild.name}" (${ch.id})`);
    return `✅ Join: **#${ch.name}** (${ch.guild.name})`;

  } catch (e) {
    log.error("VOICE", `Gagal join channel ${channelId}: ${e.message}`, e.stack);
    return `❌ Gagal join: ${e.message}`;
  }
}

// ─── Auto-Reconnect ─────────────────────────────────────────────────────────

function scheduleReconnect(client) {
  if (!currentVC || reconnTimer) return;

  log.info("VOICE", `Auto-reconnect dijadwalkan dalam ${config.reconnectDelay}ms...`);

  reconnTimer = setTimeout(async () => {
    reconnTimer = null;
    reconnCount++;
    log.info("VOICE", `Reconnect attempt #${reconnCount} ke channel ${currentVC}...`);
    const result = await joinVC(client, currentVC);
    log.info("VOICE", `Reconnect result: ${result}`);
  }, config.reconnectDelay);
}

// ─── Voice State Update Handler ──────────────────────────────────────────────

function handleVoiceStateUpdate(client, oldState, newState) {
  // Hanya track perubahan state untuk akun kita sendiri
  if (oldState.id !== client.user?.id) return;

  const wasInVC = oldState.channelId;
  const nowInVC = newState.channelId;

  if (wasInVC && !nowInVC) {
    // Kita di-disconnect dari voice
    log.warn("VOICE", `Disconnected dari channel ${wasInVC}. Alasan: dipindah/dikick/koneksi putus.`);
    scheduleReconnect(client);

  } else if (wasInVC && nowInVC && wasInVC !== nowInVC) {
    // Kita dipindah ke channel lain
    log.info("VOICE", `Dipindah dari ${wasInVC} ke ${nowInVC}.`);
    currentVC = nowInVC;

  } else if (!wasInVC && nowInVC) {
    // Kita baru join voice
    log.debug("VOICE", `Voice state: joined ${nowInVC}.`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function cleanup() {
  if (reconnTimer) {
    clearTimeout(reconnTimer);
    reconnTimer = null;
    log.debug("VOICE", "Reconnect timer dibersihkan.");
  }
}

module.exports = {
  joinVC,
  scheduleReconnect,
  handleVoiceStateUpdate,
  getState,
  cleanup,
};
