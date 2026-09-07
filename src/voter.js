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

  // Set realistic User-Agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Blokir resource berat yang tidak dibutuhkan untuk voting
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "font", "media"].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  try {
    // ── Step 1: Buka Discord login dengan redirect ke top.gg OAuth ─────────
    log.info("VOTER", "Membuka halaman Discord login...");
    await page.goto(DISCORD_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(2000);

    // ── Step 2: Inject token Discord ke localStorage ───────────────────────
    log.info("VOTER", "Menginjeksi token Discord...");
    await page.setBypassCSP(true);

    await page.evaluate((token) => {
      try {
        localStorage.setItem("token", `"${token}"`);
      } catch {}
      try {
        const iframe = document.createElement("iframe");
        document.body.appendChild(iframe);
        iframe.contentWindow.localStorage.setItem("token", `"${token}"`);
      } catch {}
    }, config.token);

    await sleep(1000);
    log.info("VOTER", "Reload halaman login dengan token terpasang...");
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await sleep(4000);

    // ── Step 3: Authorize jika diminta ────────────────────────────────────
    try {
      const authBtn = await page.waitForSelector(
        "button[type='submit'], .button-f2h6uQ, button.lookFilled-yCfaCM",
        { timeout: 8_000 }
      );
      if (authBtn) {
        await authBtn.click();
        log.info("VOTER", "Tombol Authorize diklik.");
        await sleep(4000);
      }
    } catch {
      log.debug("VOTER", "Tidak ada tombol Authorize atau sudah otomatis authorize.");
    }

    // ── Step 4: Menuju halaman vote TempVoice ──────────────────────────────
    log.info("VOTER", `Menuju halaman vote: ${BOT_VOTE_URL}`);
    await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(5000);

    // ── Step 5: Dismiss ad popup jika ada ────────────────────────────────
    try {
      const adClose = await page.$("[id='modal-root'] a:nth-child(2)");
      if (adClose) {
        await adClose.click();
        log.debug("VOTER", "Ad popup ditutup.");
        await sleep(2000);
      }
    } catch {
      // tidak ada popup
    }

    // ── Step 6: Cek apakah sudah login di top.gg ─────────────────────────
    const currentUrl = page.url();
    log.info("VOTER", `Halaman saat ini: ${currentUrl}`);

    const bodyText = await page.evaluate(() => document.body.innerText);
    log.info("VOTER", `Teks halaman (snippet): ${bodyText.replace(/\s+/g, " ").trim().substring(0, 200)}`);

    // Cek apakah halaman meminta login
    if (currentUrl.includes("login") || bodyText.includes("Log in")) {
      // Simpan screenshot debug
      try {
        const fs = require("fs");
        const path = require("path");
        const debugDir = path.resolve(__dirname, "..", "logs");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ path: path.join(debugDir, "voter-not-logged-in.png"), fullPage: true });
        log.info("VOTER", `Screenshot disimpan ke logs/voter-not-logged-in.png`);
      } catch {}
      log.warn("VOTER", "Belum login ke top.gg — token inject mungkin gagal. Skip vote.");
      return;
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
      // Ambil screenshot debug dan simpan ke file agar bisa diinspeksi
      try {
        const fs = require("fs");
        const path = require("path");
        const debugDir = path.resolve(__dirname, "..", "logs");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ path: path.join(debugDir, "voter-failed.png"), fullPage: true });
        log.info("VOTER", `Screenshot halaman saat ini disimpan ke logs/voter-failed.png`);
      } catch {}

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
        // Log snapshot dari halaman agar ketahuan masalah aslinya
        const snapshot = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            textSnippet: document.body.innerText.replace(/\s+/g, " ").trim().substring(0, 300),
          };
        });
        log.warn("VOTER", `Tombol vote tidak ditemukan. Detail halaman: ${JSON.stringify(snapshot)}`);
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
