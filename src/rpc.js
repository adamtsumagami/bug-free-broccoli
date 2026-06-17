"use strict";

const { RichPresence }  = require("discord.js-selfbot-v13");
const { getLogger }     = require("./logger");
const { config }        = require("./config");

const log = getLogger();

// ─── VCT Masters London 2026 Data ────────────────────────────────────────────

const TOURNAMENT = {
  name: "VALORANT Masters London 2026",
  shortName: "Masters London",
  venue: "Copper Box Arena",
  city: "London",
  dates: "June 6 – 21, 2026",
  prizePool: "$1,000,000",
  patch: "12.10",
  url: "https://valorantesports.com",
  liquipedia: "https://liquipedia.net/valorant/VCT/2026/Stage_2/Masters",
};

// Image URLs — VCT & team logos from Liquipedia
const IMAGES = {
  vctLogo:  "https://liquipedia.net/commons/images/d/d5/Valorant_Champions_Tour_Masters_London_2026_lightmode.png",
  valorant: "https://liquipedia.net/commons/images/thumb/f/fc/Valorant_darkmode_icon.png/600px-Valorant_darkmode_icon.png",
};

// 12 teams at Masters London 2026
const TEAMS = [
  // Playoffs Teams (League Winners)
  { name: "G2 Esports",    short: "G2",  region: "Americas",  seed: "#1", logo: "https://liquipedia.net/commons/images/thumb/6/60/G2_Esports_2024_full_lightmode.png/600px-G2_Esports_2024_full_lightmode.png" },
  { name: "EDward Gaming",  short: "EDG", region: "China",     seed: "#1", logo: "https://liquipedia.net/commons/images/thumb/5/5e/EDward_Gaming_2025_lightmode.png/600px-EDward_Gaming_2025_lightmode.png" },
  { name: "Team Heretics",  short: "TH",  region: "EMEA",      seed: "#1", logo: "https://liquipedia.net/commons/images/thumb/e/ea/Team_Heretics_2024_lightmode.png/600px-Team_Heretics_2024_lightmode.png" },
  { name: "Paper Rex",      short: "PRX", region: "Pacific",   seed: "#1", logo: "https://liquipedia.net/commons/images/thumb/e/e0/Paper_Rex_2024_lightmode.png/600px-Paper_Rex_2024_lightmode.png" },

  // Swiss Stage Teams
  { name: "Leviatán",       short: "LEV", region: "Americas",  seed: "#2", logo: "https://liquipedia.net/commons/images/thumb/d/da/Leviat%C3%A1n_2024_lightmode.png/600px-Leviat%C3%A1n_2024_lightmode.png" },
  { name: "NRG",             short: "NRG", region: "Americas",  seed: "#3", logo: "https://liquipedia.net/commons/images/thumb/d/d9/NRG_2024_lightmode.png/600px-NRG_2024_lightmode.png" },
  { name: "XLG Esports",    short: "XLG", region: "China",     seed: "#2", logo: "https://liquipedia.net/commons/images/thumb/7/78/XLG_Esports_allmode.png/600px-XLG_Esports_allmode.png" },
  { name: "Dragon Ranger Gaming", short: "DRG", region: "China", seed: "#3", logo: "https://liquipedia.net/commons/images/thumb/e/e1/Dragon_Ranger_Gaming_2024_lightmode.png/600px-Dragon_Ranger_Gaming_2024_lightmode.png" },
  { name: "Team Vitality",  short: "VIT", region: "EMEA",      seed: "#2", logo: "https://liquipedia.net/commons/images/thumb/4/42/Team_Vitality_2023_full_lightmode.png/600px-Team_Vitality_2023_full_lightmode.png" },
  { name: "FUT Esports",    short: "FUT", region: "EMEA",      seed: "#3", logo: "https://liquipedia.net/commons/images/thumb/3/3c/FUT_Esports_2024_allmode.png/600px-FUT_Esports_2024_allmode.png" },
  { name: "FULL SENSE",     short: "FS",  region: "Pacific",   seed: "#2", logo: "https://liquipedia.net/commons/images/thumb/6/6a/FULL_SENSE_allmode.png/600px-FULL_SENSE_allmode.png" },
  { name: "Global Esports", short: "GE",  region: "Pacific",   seed: "#3", logo: "https://liquipedia.net/commons/images/thumb/6/6e/Global_Esports_2024_allmode.png/600px-Global_Esports_2024_allmode.png" },
];

// Match schedule — real data from Liquipedia, semua waktu WIB (UTC+7)
// Format waktu: "YYYY-MM-DDTHH:MM" dalam WIB
// Score: null = belum main, [a, b] = sudah selesai
const SCHEDULE = [
  // ─── Swiss Stage — Round 1 ───────────────────────────────────────────
  { team1: "XLG", team2: "NRG", round: "Swiss Round 1", time: "2026-06-06T21:00", bestOf: 3, score: [0, 2] },
  { team1: "VIT", team2: "DRG", round: "Swiss Round 1", time: "2026-06-06T23:30", bestOf: 3, score: [2, 0] },
  { team1: "FS",  team2: "FUT", round: "Swiss Round 1", time: "2026-06-07T21:00", bestOf: 3, score: [0, 2] },
  { team1: "LEV", team2: "GE",  round: "Swiss Round 1", time: "2026-06-07T23:00", bestOf: 3, score: [2, 1] },

  // ─── Swiss Stage — Round 2 High (1-0) ────────────────────────────────
  { team1: "VIT", team2: "FUT", round: "Swiss Round 2 (1-0)", time: "2026-06-08T21:00", bestOf: 3, score: [2, 1] },
  { team1: "NRG", team2: "LEV", round: "Swiss Round 2 (1-0)", time: "2026-06-09T00:10", bestOf: 3, score: [1, 2] },

  // ─── Swiss Stage — Round 2 Low (0-1) ─────────────────────────────────
  { team1: "DRG", team2: "XLG", round: "Swiss Round 2 (0-1)", time: "2026-06-09T21:00", bestOf: 3, score: [1, 2] },
  { team1: "GE",  team2: "FS",  round: "Swiss Round 2 (0-1)", time: "2026-06-10T00:20", bestOf: 3, score: [2, 1] },

  // ─── Swiss Stage — Round 3 Mid (1-1) ─────────────────────────────────
  { team1: "FUT", team2: "NRG", round: "Swiss Round 3 (1-1)", time: "2026-06-10T21:00", bestOf: 3, score: [2, 1] },
  { team1: "XLG", team2: "GE",  round: "Swiss Round 3 (1-1)", time: "2026-06-11T00:10", bestOf: 3, score: [2, 1] },

  // ─── Playoffs — Upper Bracket Quarterfinals ──────────────────────────
  { team1: "PRX", team2: "LEV", round: "Upper Quarterfinal", time: "2026-06-12T21:00", bestOf: 3, score: [2, 0] },
  { team1: "TH",  team2: "VIT", round: "Upper Quarterfinal", time: "2026-06-12T23:30", bestOf: 3, score: [0, 2] },
  { team1: "G2",  team2: "XLG", round: "Upper Quarterfinal", time: "2026-06-13T21:00", bestOf: 3, score: [1, 2] },
  { team1: "EDG", team2: "FUT", round: "Upper Quarterfinal", time: "2026-06-13T23:30", bestOf: 3, score: [2, 1] },

  // ─── Playoffs — Lower Bracket Round 1 ────────────────────────────────
  { team1: "G2",  team2: "FUT", round: "Lower Round 1",      time: "2026-06-14T21:00", bestOf: 3, score: [0, 2] },
  { team1: "LEV", team2: "TH",  round: "Lower Round 1",      time: "2026-06-14T23:30", bestOf: 3, score: [2, 1] },

  // ─── Playoffs — Upper Bracket Semifinals ─────────────────────────────
  { team1: "PRX", team2: "VIT", round: "Upper Semifinal",    time: "2026-06-15T21:00", bestOf: 3, score: [2, 1] },
  { team1: "XLG", team2: "EDG", round: "Upper Semifinal",    time: "2026-06-15T23:30", bestOf: 3, score: [1, 2] },

  // ─── Playoffs — Lower Bracket Quarterfinals ──────────────────────────
  { team1: "FUT", team2: "VIT", round: "Lower Quarterfinal", time: "2026-06-16T21:00", bestOf: 3, score: [0, 2] },
  { team1: "XLG", team2: "LEV", round: "Lower Quarterfinal", time: "2026-06-16T23:30", bestOf: 3, score: [0, 2] },

  // ─── Playoffs — Upper Bracket Final ──────────────────────────────────
  { team1: "EDG", team2: "PRX", round: "Upper Final",        time: "2026-06-19T21:00", bestOf: 3, score: null },

  // ─── Playoffs — Lower Bracket Semifinal ──────────────────────────────
  { team1: "VIT", team2: "LEV", round: "Lower Semifinal",    time: "2026-06-19T23:30", bestOf: 3, score: null },

  // ─── Playoffs — Lower Bracket Final ──────────────────────────────────
  { team1: "TBD", team2: "TBD", round: "Lower Final",        time: "2026-06-20T21:00", bestOf: 5, score: null },

  // ─── Playoffs — Grand Final ──────────────────────────────────────────
  { team1: "TBD", team2: "TBD", round: "Grand Final",        time: "2026-06-21T21:00", bestOf: 5, score: null },
];

// Maps in the pool
const MAPS = ["Ascent", "Breeze", "Split", "Fracture", "Pearl", "Haven", "Lotus"];

// ─── Helper Functions ────────────────────────────────────────────────────────

const TBD_TEAM = {
  name: "To Be Determined",
  short: "TBD",
  region: "N/A",
  seed: "N/A",
  logo: "https://liquipedia.net/commons/images/thumb/f/fc/Valorant_darkmode_icon.png/600px-Valorant_darkmode_icon.png"
};

function getTeamByShort(short) {
  if (short === "TBD") return TBD_TEAM;
  return TEAMS.find((t) => t.short === short);
}

function getRandomMap() {
  return MAPS[Math.floor(Math.random() * MAPS.length)];
}

/**
 * Konversi waktu WIB (UTC+7) string ke Date object
 * Format input: "YYYY-MM-DDTHH:MM"
 */
function wibToDate(wibTimeStr) {
  return new Date(wibTimeStr + ":00+07:00");
}

/**
 * Format Date ke string WIB "DD/MM HH:MM WIB"
 */
function formatWIB(date) {
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }) + " WIB";
}

/**
 * Tentukan match mana yang ditampilkan berdasarkan waktu saat ini (WIB).
 * - Jika ada match yang sedang live (±3 jam dari jadwal), tampilkan itu
 * - Jika ada match upcoming, tampilkan match berikutnya
 * - Jika sudah selesai semua, rotasi showcase
 */
function getCurrentMatch() {
  const now = Date.now();
  const MATCH_DURATION = 3 * 60 * 60 * 1000; // 3 jam estimasi durasi match

  // Cari match yang sedang live (dalam rentang jadwal - sekarang < 3 jam)
  for (const match of SCHEDULE) {
    if (match.team1 === "TBD") continue;
    const matchTime = wibToDate(match.time).getTime();
    if (now >= matchTime && now < matchTime + MATCH_DURATION) {
      return { match, status: "live" };
    }
  }

  // Cari match upcoming berikutnya
  for (const match of SCHEDULE) {
    const matchTime = wibToDate(match.time).getTime();
    if (now < matchTime) {
      // Jika TBD, masih tampilkan sebagai upcoming
      return { match, status: "upcoming" };
    }
  }

  // Semua match sudah lewat — rotasi showcase (hanya match dengan tim yang diketahui)
  const knownMatches = SCHEDULE.filter((m) => m.team1 !== "TBD");
  const totalMinutes = Math.floor(now / (1000 * 60));
  const idx = Math.floor(totalMinutes / config.rpc.rotateMinutes) % knownMatches.length;
  return { match: knownMatches[idx], status: "showcase" };
}

// ─── Cached External Assets ──────────────────────────────────────────────────

let cachedAssets = {};

async function getExternalAsset(client, url) {
  if (cachedAssets[url]) return cachedAssets[url];

  try {
    const assets = await RichPresence.getExternal(client, config.rpc.appId, url);
    if (assets && assets[0]?.external_asset_path) {
      const path = `mp:${assets[0].external_asset_path}`;
      cachedAssets[url] = path;
      return path;
    }
  } catch (e) {
    log.debug("RPC", `Failed to get external asset for ${url}: ${e.message}`);
  }
  return null;
}

// ─── RPC Update ──────────────────────────────────────────────────────────────

let rpcInterval = null;

async function updateRPC(client) {
  if (!config.rpc.appId) {
    log.debug("RPC", "No RPC_APP_ID set, skipping RPC update.");
    return;
  }

  try {
    const { match, status } = getCurrentMatch();
    const team1 = getTeamByShort(match.team1);
    const team2 = getTeamByShort(match.team2);

    if (!team1 || !team2) {
      log.warn("RPC", `Team not found: ${match.team1} or ${match.team2}`);
      return;
    }

    // Build presence details
    let details, state, name;
    const map = getRandomMap();

    switch (status) {
      case "live":
        name    = `🔴 LIVE: ${team1.short} vs ${team2.short}`;
        details = `🔴 ${team1.name} vs ${team2.name}`;
        state   = `${match.round} • BO${match.bestOf} • ${map}`;
        break;
      case "upcoming":
        name    = `📅 Next: ${team1.short} vs ${team2.short}`;
        details = `📅 ${team1.name} vs ${team2.name}`;
        state   = `${match.round} • ${formatWIB(wibToDate(match.time))} • BO${match.bestOf}`;
        break;
      default: // showcase
        name    = `⚔️ ${team1.short} vs ${team2.short}`;
        details = `⚔️ ${team1.name} vs ${team2.name}`;
        const scoreStr = match.score ? `[${match.score[0]}-${match.score[1]}]` : "TBD";
        state   = `${match.round} • BO${match.bestOf} • ${scoreStr}`;
    }

    // Get external image assets
    const largeImg = await getExternalAsset(client, IMAGES.vctLogo);
    const smallImg = await getExternalAsset(client, IMAGES.valorant);

    const rpc = new RichPresence()
      .setApplicationId(config.rpc.appId)
      .setType("WATCHING")
      .setName(name)
      .setDetails(details)
      .setState(state);

    if (status === "live" || status === "upcoming") {
      rpc.setStartTimestamp(wibToDate(match.time).getTime());
    }

    // Set images if available
    if (largeImg) {
      rpc.setAssetsLargeImage(largeImg);
      rpc.setAssetsLargeText(`${TOURNAMENT.shortName} • ${TOURNAMENT.venue}, ${TOURNAMENT.city}`);
    }
    if (smallImg) {
      rpc.setAssetsSmallImage(smallImg);
      rpc.setAssetsSmallText(`VALORANT • Patch ${TOURNAMENT.patch}`);
    }

    // Add buttons
    rpc.addButton("🎮 Watch Live", TOURNAMENT.url);
    rpc.addButton("📊 Liquipedia", TOURNAMENT.liquipedia);

    client.user.setActivity(rpc);
    log.info("RPC", `Presence updated: ${team1.short} vs ${team2.short} (${status}) — ${match.round}`);

  } catch (e) {
    log.error("RPC", `Failed to update RPC: ${e.message}`, e.stack);
  }
}

// ─── Start/Stop ──────────────────────────────────────────────────────────────

function startRPC(client) {
  if (!config.rpc.appId) {
    log.info("RPC", "RPC disabled (RPC_APP_ID not set). Using basic activity.");
    // Fallback: set basic activity
    client.user.setActivity(config.activity.name, { type: config.activity.type });
    return;
  }

  log.info("RPC", `Starting VCT RPC with App ID: ${config.rpc.appId}`);
  log.info("RPC", `Rotation interval: ${config.rpc.rotateMinutes} minutes`);

  // Initial update
  updateRPC(client);

  // Rotate presence on interval
  const intervalMs = config.rpc.rotateMinutes * 60 * 1000;
  rpcInterval = setInterval(() => updateRPC(client), intervalMs);
}

function stopRPC() {
  if (rpcInterval) {
    clearInterval(rpcInterval);
    rpcInterval = null;
    log.debug("RPC", "RPC interval stopped.");
  }
}

module.exports = {
  startRPC,
  stopRPC,
  updateRPC,
  TOURNAMENT,
  TEAMS,
  SCHEDULE,
};
