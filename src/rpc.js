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

// Match schedule data — realistic matchups based on tournament format
const SCHEDULE = [
  // Swiss Stage — Round 1 (June 6-7)
  { team1: "LEV", team2: "DRG", round: "Swiss Round 1", date: "2026-06-06", bestOf: 3 },
  { team1: "VIT", team2: "NRG", round: "Swiss Round 1", date: "2026-06-06", bestOf: 3 },
  { team1: "XLG", team2: "FUT", round: "Swiss Round 1", date: "2026-06-07", bestOf: 3 },
  { team1: "FS",  team2: "GE",  round: "Swiss Round 1", date: "2026-06-07", bestOf: 3 },

  // Swiss Stage — Round 2 (June 8-9)
  { team1: "LEV", team2: "VIT", round: "Swiss Round 2 (1-0)", date: "2026-06-08", bestOf: 3 },
  { team1: "XLG", team2: "FS",  round: "Swiss Round 2 (1-0)", date: "2026-06-08", bestOf: 3 },
  { team1: "DRG", team2: "NRG", round: "Swiss Round 2 (0-1)", date: "2026-06-09", bestOf: 3 },
  { team1: "FUT", team2: "GE",  round: "Swiss Round 2 (0-1)", date: "2026-06-09", bestOf: 3 },

  // Swiss Stage — Round 3 (June 10)
  { team1: "VIT", team2: "XLG", round: "Swiss Round 3 (1-1)", date: "2026-06-10", bestOf: 3 },
  { team1: "FUT", team2: "FS",  round: "Swiss Round 3 (1-1)", date: "2026-06-10", bestOf: 3 },

  // Playoffs — Upper Bracket QF (June 12-13)
  { team1: "G2",  team2: "LEV", round: "Upper Quarterfinal", date: "2026-06-12", bestOf: 3 },
  { team1: "EDG", team2: "XLG", round: "Upper Quarterfinal", date: "2026-06-12", bestOf: 3 },
  { team1: "TH",  team2: "VIT", round: "Upper Quarterfinal", date: "2026-06-13", bestOf: 3 },
  { team1: "PRX", team2: "FUT", round: "Upper Quarterfinal", date: "2026-06-13", bestOf: 3 },

  // Playoffs — Lower Bracket R1 (June 14)
  { team1: "LEV", team2: "XLG", round: "Lower Round 1",     date: "2026-06-14", bestOf: 3 },
  { team1: "VIT", team2: "FUT", round: "Lower Round 1",     date: "2026-06-14", bestOf: 3 },

  // Playoffs — Upper Bracket SF (June 15)
  { team1: "G2",  team2: "EDG", round: "Upper Semifinal",   date: "2026-06-15", bestOf: 3 },
  { team1: "TH",  team2: "PRX", round: "Upper Semifinal",   date: "2026-06-15", bestOf: 3 },

  // Playoffs — Lower Bracket QF (June 16)
  { team1: "LEV", team2: "EDG", round: "Lower Quarterfinal", date: "2026-06-16", bestOf: 3 },
  { team1: "PRX", team2: "VIT", round: "Lower Quarterfinal", date: "2026-06-16", bestOf: 3 },

  // Playoffs — Upper Bracket Final (June 17)
  { team1: "G2",  team2: "TH",  round: "Upper Final",       date: "2026-06-17", bestOf: 3 },

  // Playoffs — Lower Bracket SF (June 18)
  { team1: "LEV", team2: "PRX", round: "Lower Semifinal",   date: "2026-06-18", bestOf: 3 },

  // Playoffs — Lower Bracket Final (June 19)
  { team1: "PRX", team2: "TH",  round: "Lower Final",       date: "2026-06-19", bestOf: 5 },

  // Playoffs — Grand Final (June 21)
  { team1: "G2",  team2: "PRX", round: "Grand Final",       date: "2026-06-21", bestOf: 5 },
];

// Maps in the pool
const MAPS = ["Ascent", "Breeze", "Split", "Fracture", "Pearl", "Haven", "Lotus"];

// ─── Helper Functions ────────────────────────────────────────────────────────

function getTeamByShort(short) {
  return TEAMS.find((t) => t.short === short);
}

function getRandomMap() {
  return MAPS[Math.floor(Math.random() * MAPS.length)];
}

/**
 * Determine which match to display based on tournament dates.
 * If today is during the tournament, show today's match or next upcoming.
 * If before or after, rotate through all matches.
 */
function getCurrentMatch() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Find today's match
  const todayMatches = SCHEDULE.filter((m) => m.date === todayStr);
  if (todayMatches.length > 0) {
    // Rotate through today's matches every few minutes
    const minuteOfDay = now.getHours() * 60 + now.getMinutes();
    const idx = Math.floor(minuteOfDay / config.rpc.rotateMinutes) % todayMatches.length;
    return { match: todayMatches[idx], status: "live" };
  }

  // Find next upcoming match
  const upcoming = SCHEDULE.filter((m) => m.date > todayStr);
  if (upcoming.length > 0) {
    return { match: upcoming[0], status: "upcoming" };
  }

  // Tournament ended or before — rotate through all
  const totalMinutes = Math.floor(Date.now() / (1000 * 60));
  const idx = Math.floor(totalMinutes / config.rpc.rotateMinutes) % SCHEDULE.length;
  return { match: SCHEDULE[idx], status: "showcase" };
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
        state   = `${match.round} • ${match.date} • BO${match.bestOf}`;
        break;
      default: // showcase
        name    = `⚔️ ${team1.short} vs ${team2.short}`;
        details = `⚔️ ${team1.name} vs ${team2.name}`;
        state   = `${match.round} • BO${match.bestOf}`;
    }

    // Get external image assets
    const largeImg = await getExternalAsset(client, IMAGES.vctLogo);
    const smallImg = await getExternalAsset(client, IMAGES.valorant);

    const rpc = new RichPresence()
      .setApplicationId(config.rpc.appId)
      .setType("WATCHING")
      .setName(name)
      .setDetails(details)
      .setState(state)
      .setStartTimestamp(new Date(`${match.date}T12:00:00Z`).getTime());

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
