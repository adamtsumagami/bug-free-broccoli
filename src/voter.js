"use strict";

const puppeteer  = require("puppeteer");
const { getLogger } = require("./logger");
const { config }    = require("./config");

const log = getLogger();

const VOTE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 jam
const BOT_VOTE_URL     = "https://top.gg/bot/762217899355013120/vote";
const DISCORD_LOGIN_URL =
  "https://discord.com/login?redirect_to=" +
  encodeURIComponent(
    "/oauth2/authorize?scope=identify%20guilds%20email" +
    "&redirect_uri=https%3A%2F%2Ftop.gg%2Flogin%2Fcallback" +
    "&response_type=code&client_id=264434993625956352"
  );

let voteTimer = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Vote Logic ───────────────────────────────────────────────────────────────

async function vote() {
  if (!config.voter.enabled) return;

  log.info("VOTER", "Memulai sesi vote top.gg TempVoice...");

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--disable-translate",
      "--no-first-run",
      "--single-process",
      "--no-zygote",
      "--js-flags=--max-old-space-size=256",
    ],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60_000);

  // Blokir resource berat yang tidak dibutuhkan untuk voting
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "stylesheet", "font", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // ── Step 1: Buka Discord login dengan redirect ke top.gg OAuth ─────────
    log.info("VOTER", "Membuka halaman Discord login...");
    await page.goto(DISCORD_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await sleep(2000);

    // ── Step 2: Inject token Discord ke localStorage ───────────────────────
    log.info("VOTER", "Menginjeksi token Discord...");
    await page.setBypassCSP(true);

    await page.evaluate((token) => {
      function loginWithToken(t) {
        // Inject via iframe agar bisa menulis ke localStorage Discord
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        iframe.contentWindow.localStorage.token = `"${t}"`;
      }
      loginWithToken(token);
      setTimeout(() => location.reload(), 2000);
    }, config.token);

    // ── Step 3: Tunggu halaman reload & authorize top.gg ──────────────────
    log.info("VOTER", "Menunggu halaman authorize Discord OAuth...");
    await sleep(5000);

    // Klik tombol Authorize jika muncul
    try {
      await page.waitForSelector(
        "button[type='submit']",
        { timeout: 15_000 }
      );
      await page.click("button[type='submit']");
      log.info("VOTER", "Tombol Authorize diklik.");
    } catch {
      log.debug("VOTER", "Tidak ada tombol Authorize — mungkin sudah authorized.");
    }

    // ── Step 4: Tunggu redirect ke top.gg ────────────────────────────────
    log.info("VOTER", "Menunggu redirect ke top.gg...");
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 });

    // ── Step 5: Navigate ke halaman vote TempVoice ────────────────────────
    log.info("VOTER", `Menuju halaman vote: ${BOT_VOTE_URL}`);
    await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded" });
    await sleep(3000);

    // ── Step 6: Dismiss ad popup jika ada ────────────────────────────────
    try {
      const adClose = await page.$("[id='modal-root'] a:nth-child(2)");
      if (adClose) {
        await adClose.click();
        log.debug("VOTER", "Ad popup ditutup.");
        await sleep(1000);
      }
    } catch {
      // tidak ada popup
    }

    // ── Step 7: Tunggu & klik tombol Vote ────────────────────────────────
    log.info("VOTER", "Mencari tombol Vote...");

    // top.gg punya dua varian tombol vote (bergantung pada render)
    const voteButtonSelectors = [
      "#vote-button-container button",
      "button[data-testid='vote-button']",
      "button.css-q8rnfy",
    ];

    let voted = false;
    for (const sel of voteButtonSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 8_000 });
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await sleep(3000);
          voted = true;
          break;
        }
      } catch {
        // coba selector berikutnya
      }
    }

    if (!voted) {
      // Cek apakah halaman menampilkan pesan "sudah vote"
      const alreadyVoted = await page.evaluate(() => {
        const text = document.body.innerText;
        return (
          text.includes("already voted") ||
          text.includes("come back in") ||
          text.includes("You have already voted")
        );
      });

      if (alreadyVoted) {
        log.info("VOTER", "Sudah vote dalam 12 jam terakhir — skip.");
      } else {
        log.warn("VOTER", "Tombol vote tidak ditemukan. Halaman mungkin berubah atau perlu captcha.");
      }
      return;
    }

    // ── Step 8: Konfirmasi hasil ──────────────────────────────────────────
    await sleep(2000);
    const pageText = await page.evaluate(() => document.body.innerText);

    if (
      pageText.includes("already voted") ||
      pageText.includes("come back in") ||
      pageText.includes("You have already voted")
    ) {
      log.info("VOTER", "Sudah vote dalam 12 jam terakhir — skip.");
    } else {
      log.info("VOTER", "✅ Vote TempVoice berhasil!");
    }

  } catch (err) {
    log.error("VOTER", `Vote gagal: ${err.message}`, err.stack);
  } finally {
    await browser.close();
    log.debug("VOTER", "Browser ditutup.");
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

function startVoter() {
  if (!config.voter.enabled) {
    log.info("VOTER", "Auto-voter dinonaktifkan (TOPGG_VOTER_ENABLED=false).");
    return;
  }

  log.info("VOTER", `Auto-voter TempVoice aktif — vote setiap 12 jam.`);

  // Vote langsung saat startup
  vote();

  // Jadwalkan ulang setiap 12 jam
  voteTimer = setInterval(vote, VOTE_INTERVAL_MS);
}

function stopVoter() {
  if (voteTimer) {
    clearInterval(voteTimer);
    voteTimer = null;
    log.debug("VOTER", "Vote timer dihentikan.");
  }
}

module.exports = { startVoter, stopVoter, vote };
