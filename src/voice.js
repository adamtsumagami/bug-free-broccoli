"use strict";

const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, VoiceConnectionDisconnectReason } = require("@discordjs/voice");
const { getLogger } = require("./logger");
const { config }    = require("./config");

const log = getLogger();

// ─── State ───────────────────────────────────────────────────────────────────

let currentVC    = config.voiceChannelId;
let reconnTimer  = null;
let reconnCount  = 0;
let lastJoinTime = null;
let selfMute     = config.voiceSelfMute;
let selfDeaf     = config.voiceSelfDeaf;

// ─── Getters ─────────────────────────────────────────────────────────────────

function getState() {
  return { currentVC, reconnCount, lastJoinTime, selfMute, selfDeaf, isReconnecting: reconnTimer !== null };
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

    const conn = joinVoiceChannel({
      channelId: ch.id,
      guildId:   ch.guild.id,
      adapterCreator: ch.guild.voiceAdapterCreator,
      selfMute,
      selfDeaf,
    });

    // Attach listeners setiap kali join (menggantikan listener lama jika ada)
    _attachConnectionListeners(client, conn, ch);

    currentVC    = channelId;
    lastJoinTime = new Date();

    log.info("VOICE", `Joined #${ch.name} di server "${ch.guild.name}" (${ch.id}) [Mute: ${selfMute}, Deaf: ${selfDeaf}]`);
    return `✅ Join: **#${ch.name}** (${ch.guild.name})`;

  } catch (e) {
    log.error("VOICE", `Gagal join channel ${channelId}: ${e.message}`, e.stack);
    return `❌ Gagal join: ${e.message}`;
  }
}

// ─── Connection Event Listeners ──────────────────────────────────────────────

const DISCONNECT_REASON_LABEL = {
  [VoiceConnectionDisconnectReason.WebSocketClose]:    "WebSocket ditutup oleh Discord",
  [VoiceConnectionDisconnectReason.AdapterUnavailable]:"Adapter tidak tersedia (server Discord error)",
  [VoiceConnectionDisconnectReason.EndpointRemoved]:   "Endpoint dihapus oleh Discord",
  [VoiceConnectionDisconnectReason.Manual]:            "Disconnect manual",
};

function _attachConnectionListeners(client, conn, ch) {
  // Hindari duplikasi listener
  conn.removeAllListeners(VoiceConnectionStatus.Disconnected);
  conn.removeAllListeners(VoiceConnectionStatus.Destroyed);
  conn.removeAllListeners(VoiceConnectionStatus.Ready);

  conn.on(VoiceConnectionStatus.Ready, () => {
    log.info("VOICE", `Koneksi WebSocket ke voice server siap (#${ch.name} — ${ch.guild.name})`);
  });

  conn.on(VoiceConnectionStatus.Disconnected, (oldState, newState) => {
    const reason      = newState.reason;
    const closeCode   = newState.closeCode;
    const reasonLabel = DISCONNECT_REASON_LABEL[reason] ?? `Unknown (${reason})`;
    const detail      = closeCode ? ` [close code: ${closeCode}]` : "";

    log.warn("VOICE", `Koneksi voice terputus: ${reasonLabel}${detail}`);
    log.warn("VOICE", `Channel: #${ch.name} | Server: ${ch.guild.name}`);

    if (reason === VoiceConnectionDisconnectReason.WebSocketClose && closeCode === 4014) {
      // Kode 4014 = dikick dari channel / bot tidak punya izin
      log.warn("VOICE", "Disconnect karena dikick dari VC atau kehilangan izin. Tidak reconnect.");
      return;
    }

    scheduleReconnect(client);
  });

  conn.on(VoiceConnectionStatus.Destroyed, () => {
    log.warn("VOICE", `VoiceConnection ke #${ch.name} (${ch.guild.name}) dihancurkan.`);
  });
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
  if (oldState.id !== client.user?.id) return;

  const wasInVC   = oldState.channelId;
  const nowInVC   = newState.channelId;
  const oldChName = oldState.channel?.name ?? wasInVC;
  const newChName = newState.channel?.name ?? nowInVC;

  if (wasInVC && !nowInVC) {
    log.warn("VOICE", `Keluar dari VC #${oldChName} (${oldState.guild?.name}). Penyebab: dipindah/dikick/koneksi putus.`);
    scheduleReconnect(client);

  } else if (wasInVC && nowInVC && wasInVC !== nowInVC) {
    log.info("VOICE", `Dipindah dari #${oldChName} → #${newChName} (${newState.guild?.name}).`);
    currentVC = nowInVC;

  } else if (!wasInVC && nowInVC) {
    log.debug("VOICE", `Voice state: joined #${newChName}.`);
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function cleanup() {
  if (reconnTimer) {
    clearTimeout(reconnTimer);
    reconnTimer = null;
    log.debug("VOICE", "Reconnect timer dibersihkan.");
  }

  if (currentVC) {
    const conn = getVoiceConnection(currentVC);
    if (conn) {
      conn.destroy();
      log.debug("VOICE", "VoiceConnection dihancurkan saat shutdown.");
    }
  }
}

module.exports = { joinVC, scheduleReconnect, handleVoiceStateUpdate, getState, cleanup };
