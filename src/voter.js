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

/**
 * Menutup popup GDPR / Cookie Consent dan popup iklan secara menyeluruh
 */
async function dismissPopups(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // 1. Coba klik tombol Consent di semua frame (main frame + iframes)
    for (const frame of page.frames()) {
      try {
        await frame.evaluate(() => {
          // Selector tombol Google Funding Choices / OneTrust / Didomi
          const cmpSelectors = [
            "button.fc-cta-consent",
            "button.fc-primary-button",
            "button[aria-label='Consent']",
            "button#onetrust-accept-btn-handler",
            ".fc-dialog button",
          ];
          for (const sel of cmpSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              el.click();
              return;
            }
          }

          // Cari elemen yang bertuliskan consent/accept/agree
          const allButtons = Array.from(document.querySelectorAll("button, [role='button'], a"));
          for (const btn of allButtons) {
            const txt = (btn.innerText || btn.textContent || "").trim().toLowerCase();
            if (
              txt === "consent" ||
              txt === "accept all" ||
              txt === "accept" ||
              txt === "agree" ||
              txt === "i agree" ||
              txt === "setuju"
            ) {
              btn.click();
              return;
            }
          }
        });
      } catch {}
    }

    // 2. Hapus elemen backdrop/overlay Google Funding Choices dari DOM secara paksa
    try {
      await page.evaluate(() => {
        const overlaySelectors = [
          ".fc-consent-root",
          ".fc-dialog-overlay",
          ".fc-dialog-container",
          "div[class*='fc-dialog']",
          "iframe[src*='fundingchoices']",
          "iframe[id*='sp_message']",
          "div[id*='sp_message']",
        ];
        for (const sel of overlaySelectors) {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        }
        document.body.style.overflow = "auto";
      });
    } catch {}

    // 3. Ad modal top.gg ("modal-root")
    try {
      await page.evaluate(() => {
        const adBtn =
          document.querySelector("#modal-root a:nth-child(2)") ||
          document.querySelector("#modal-root button") ||
          document.querySelector(".css-122cpje");
        if (adBtn) adBtn.click();
      });
    } catch {}

    await sleep(1000);
  }
}

/**
 * Mencari dan mengklik tombol berdasarkan teks di dalamnya
 */
async function clickButtonWithText(page, targetTexts) {
  return await page.evaluate((targets) => {
    const elements = Array.from(document.querySelectorAll("button, a[role='button'], div[role='button']"));
    for (const el of elements) {
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (targets.some((t) => text === t.toLowerCase() || text.includes(t.toLowerCase()))) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        return { clicked: true, text };
      }
    }
    return { clicked: false };
  }, targetTexts);
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
    log.info("VOTER", "Membuka halaman Discord OAuth...");
    await page.goto(DISCORD_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(2000);

    // ── Step 2: Inject token Discord ke localStorage secara agresif ─────────
    log.info("VOTER", "Menginjeksi token Discord...");
    await page.setBypassCSP(true);

    await page.evaluate((token) => {
      const interval = setInterval(() => {
        try {
          const iframe = document.createElement("iframe");
          document.body.appendChild(iframe);
          iframe.contentWindow.localStorage.token = `"${token}"`;
        } catch {}
        try {
          localStorage.setItem("token", `"${token}"`);
        } catch {}
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        location.reload();
      }, 2500);
    }, config.token);

    // Tunggu proses reload Discord selesai
    log.info("VOTER", "Menunggu proses reload Discord...");
    await sleep(4000);

    // ── Step 3: Tunggu dan klik tombol Authorize Discord ───────────────────
    log.info("VOTER", "Menunggu halaman authorize Discord OAuth memuat...");
    const startAuthWait = Date.now();
    let authDone = false;

    while (Date.now() - startAuthWait < 30_000) {
      if (page.url().includes("top.gg")) {
        log.info("VOTER", `Sesi Discord sudah terhubung ke top.gg: ${page.url()}`);
        authDone = true;
        break;
      }

      // Coba klik tombol Authorize
      try {
        const authClicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          for (const b of buttons) {
            const t = (b.innerText || b.textContent || "").trim().toLowerCase();
            if (t === "authorize" || t === "otorisasikan") {
              b.click();
              return true;
            }
          }
          const submitBtn = document.querySelector("button[type='submit'], .button-f2h6uQ, button.lookFilled-yCfaCM");
          if (submitBtn) {
            const txt = (submitBtn.innerText || "").toLowerCase();
            if (!txt.includes("log in") && !txt.includes("masuk")) {
              submitBtn.click();
              return true;
            }
          }
          return false;
        });

        if (authClicked) {
          log.info("VOTER", "Tombol Authorize Discord diklik!");
          authDone = true;
          await sleep(5000);
          break;
        }
      } catch {}

      await sleep(2000);
    }

    // Tunggu redirect selesai sampai ke domain top.gg
    const startRedirectWait = Date.now();
    while (Date.now() - startRedirectWait < 15_000) {
      if (page.url().includes("top.gg")) {
        log.info("VOTER", `Berhasil sampai di domain top.gg: ${page.url()}`);
        break;
      }
      await sleep(1000);
    }

    // ── Step 4: Menuju halaman vote TempVoice ──────────────────────────────
    log.info("VOTER", `Menuju halaman vote: ${BOT_VOTE_URL}`);
    await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(4000);

    // ── Step 5: Tutup banner Cookie Consent / GDPR dan Iklan ───────────────
    await dismissPopups(page);

    // ── Step 6: Cek apakah masih diminta login di top.gg ───────────────────
    let pageText = await page.evaluate(() => document.body.innerText || "");
    if (pageText.includes("You must be logged in") || pageText.includes("Login to vote")) {
      log.info("VOTER", "Mendeteksi tombol Login di top.gg — mencoba klik Login...");
      const loginClick = await clickButtonWithText(page, ["login", "log in"]);
      if (loginClick.clicked) {
        log.info("VOTER", "Tombol Login diklik, menunggu redirect Discord OAuth...");
        await sleep(5000);

        // Authorize lagi jika diminta
        await clickButtonWithText(page, ["authorize", "otorisasikan"]);
        await sleep(5000);

        // Kembali ke halaman vote jika belum otomatis
        if (!page.url().includes("/vote")) {
          await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await sleep(4000);
        }
        await dismissPopups(page);
      }
    }

    // ── Step 7: Cari dan klik tombol Vote ──────────────────────────────────
    log.info("VOTER", "Mencari tombol Vote...");
    await dismissPopups(page);

    // Scroll sedikit ke bawah agar tombol vote terlihat jelas di viewport
    try {
      await page.evaluate(() => window.scrollBy(0, 300));
      await sleep(1000);
    } catch {}

    // Cek apakah sudah pernah vote sebelum mencoba klik
    pageText = await page.evaluate(() => document.body.innerText || "");
    if (
      pageText.includes("already voted") ||
      pageText.includes("come back in") ||
      pageText.includes("Come back later") ||
      pageText.includes("You have already voted")
    ) {
      log.info("VOTER", "ℹ️ Sudah vote dalam 12 jam terakhir — skip.");
      return;
    }

    let voted = false;

    // Cara 1: Klik tombol berdasarkan teks "Vote"
    const clickVoteText = await clickButtonWithText(page, [
      "Vote for TempVoice",
      "Vote",
      "Voting",
    ]);
    if (clickVoteText.clicked) {
      log.info("VOTER", `Tombol "${clickVoteText.text}" diklik!`);
      await sleep(3000);
      voted = true;
    }

    // Cara 2: Selector CSS populer di top.gg
    if (!voted) {
      const voteSelectors = [
        "#vote-button-container button",
        "button[data-testid='vote-button']",
        "button.css-q8rnfy",
        "#__next main button",
        "main button",
      ];
      for (const sel of voteSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn) {
            await btn.click();
            log.info("VOTER", `Tombol vote (${sel}) diklik!`);
            await sleep(3000);
            voted = true;
            break;
          }
        } catch {}
      }
    }

    // ── Step 8: Evaluasi hasil vote ───────────────────────────────────────
    if (!voted) {
      // Ambil screenshot debug jika gagal
      try {
        const fs = require("fs");
        const path = require("path");
        const debugDir = path.resolve(__dirname, "..", "logs");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ path: path.join(debugDir, "voter-failed.png"), fullPage: true });
        log.info("VOTER", "Screenshot disimpan ke logs/voter-failed.png");
      } catch {}

      const snapshot = await page.evaluate(() => ({
        title: document.title,
        url: window.location.href,
        textSnippet: (document.body.innerText || "").replace(/\s+/g, " ").trim().substring(0, 300),
      }));
      log.warn("VOTER", `Tombol vote tidak ditemukan. Detail: ${JSON.stringify(snapshot)}`);
      return;
    }

    // Konfirmasi sukses
    await sleep(2000);
    const postVoteText = await page.evaluate(() => document.body.innerText || "");
    if (
      postVoteText.includes("already voted") ||
      postVoteText.includes("come back in") ||
      postVoteText.includes("Thanks for voting") ||
      postVoteText.includes("Voted successfully") ||
      postVoteText.includes("Success")
    ) {
      log.info("VOTER", "✅ Vote TempVoice berhasil dikonfirmasi!");
    } else {
      log.info("VOTER", "✅ Tombol vote berhasil diklik!");
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
