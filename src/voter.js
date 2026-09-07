"use strict";

const puppeteer = require("puppeteer");
const { getLogger } = require("./logger");
const { config } = require("./config");

const log = getLogger();

const VOTE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 jam
const BOT_VOTE_URL = "https://top.gg/bot/762217899355013120/vote";
const OAUTH_CLIENT_ID = "264434993625956352";
const OAUTH_REDIRECT_URI = "https://top.gg/login/callback";
const OAUTH_SCOPE = "identify guilds email";

const DISCORD_OAUTH_URL =
  `https://discord.com/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
  `&response_type=code&scope=${encodeURIComponent(OAUTH_SCOPE)}`;

const DISCORD_LOGIN_URL =
  `https://discord.com/login?redirect_to=${encodeURIComponent(
    `/oauth2/authorize?scope=${encodeURIComponent(OAUTH_SCOPE)}` +
    `&redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}` +
    `&response_type=code&client_id=${OAUTH_CLIENT_ID}`
  )}`;

let voteTimer = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cek apakah sebuah URL benar-benar berada di domain top.gg (bukan query parameter discord)
 */
function isTopGgDomain(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname === "top.gg" || parsed.hostname.endsWith(".top.gg");
  } catch {
    return false;
  }
}

/**
 * Tutup modal GDPR / Cookie Consent dan popup iklan secara agresif & cepat
 */
async function dismissPopups(page) {
  try {
    // 1. Hapus langsung elemen backdrop/overlay Google Funding Choices dari DOM
    await page.evaluate(() => {
      const overlaySelectors = [
        ".fc-consent-root",
        ".fc-dialog-overlay",
        ".fc-dialog-container",
        "div[class*='fc-dialog']",
        "iframe[src*='fundingchoices']",
        "iframe[id*='sp_message']",
        "div[id*='sp_message']",
        "#modal-root",
      ];
      for (const sel of overlaySelectors) {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      }
      document.body.style.overflow = "auto";
    });

    // 2. Klik tombol consent jika ada di halaman atau iframe
    const frames = page.frames();
    for (const frame of frames) {
      try {
        const u = frame.url();
        if (
          u.includes("fundingchoices") ||
          u.includes("consent") ||
          u.includes("privacy") ||
          u === "" ||
          u === "about:blank"
        ) {
          await frame.evaluate(() => {
            const targets = ["consent", "agree", "accept", "accept all", "setuju", "allow all"];
            const buttons = Array.from(
              document.querySelectorAll("button, p.fc-button-label, [role='button']")
            );
            for (const b of buttons) {
              const text = (b.innerText || b.textContent || "").trim().toLowerCase();
              if (targets.some((t) => text === t || text.includes(t))) {
                b.click();
                return;
              }
            }
          });
        }
      } catch {}
    }

    // 3. Tutup tombol iklan modal jika ada
    await page.evaluate(() => {
      const closeBtn =
        document.querySelector("#modal-root a:nth-child(2)") ||
        document.querySelector("#modal-root button") ||
        document.querySelector(".css-122cpje");
      if (closeBtn) closeBtn.click();
    });
  } catch (err) {
    log.debug("VOTER", `dismissPopups error: ${err.message}`);
  }
}

/**
 * Mencari dan mengklik tombol berdasarkan teks persis
 */
async function clickButtonWithExactText(page, targetTexts) {
  return await page.evaluate((targets) => {
    const elements = Array.from(
      document.querySelectorAll("button, a[role='button'], div[role='button']")
    );
    for (const el of elements) {
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      // Jangan klik tombol ads Top.gg Plus
      if (text.includes("plus")) continue;

      if (targets.some((t) => text === t.toLowerCase())) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.click();
        return { clicked: true, text };
      }
    }
    return { clicked: false };
  }, targetTexts);
}

/**
 * Coba otorisasi Discord OAuth secara langsung melalui REST API Discord
 * Mengembalikan redirect URL top.gg (https://top.gg/login/callback?code=...) jika berhasil
 */
async function requestDiscordOAuthDirect(token) {
  try {
    log.info("VOTER", "Meminta kode otorisasi OAuth langsung via Discord API...");
    const apiUrl =
      `https://discord.com/api/v9/oauth2/authorize?client_id=${OAUTH_CLIENT_ID}` +
      `&response_type=code&scope=${encodeURIComponent(OAUTH_SCOPE)}`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://discord.com",
        Referer: DISCORD_OAUTH_URL,
      },
      body: JSON.stringify({ permissions: "0", authorize: true }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.location) {
        log.info("VOTER", "✅ Otorisasi Discord API berhasil! Mendapatkan callback code.");
        return data.location;
      }
    } else {
      log.debug("VOTER", `Discord API oauth response status: ${res.status}`);
    }
  } catch (err) {
    log.debug("VOTER", `Discord API direct oauth error: ${err.message}`);
  }
  return null;
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

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Blokir resource berat untuk menghemat RAM dan bandwidth VPS
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
    // ── Jalur 1: Direct OAuth API (Cepat & Tanpa render UI Discord) ────────
    let sessionReady = false;
    const directCallbackUrl = await requestDiscordOAuthDirect(config.token);

    if (directCallbackUrl) {
      log.info("VOTER", "Membuka callback URL top.gg untuk set sesi login...");
      await page.goto(directCallbackUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(3000);
      sessionReady = true;
      log.info("VOTER", `Sesi login top.gg aktif via direct API! URL: ${page.url()}`);
    }

    // ── Jalur 2: Fallback via Browser Injection jika Jalur 1 gagal ─────────
    if (!sessionReady) {
      log.info("VOTER", "Menggunakan alur login browser fallback...");
      await page.goto(DISCORD_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(2000);

      log.info("VOTER", "Menginjeksi token Discord ke browser...");
      await page.setBypassCSP(true);

      await page.evaluate((token) => {
        try {
          localStorage.setItem("token", `"${token}"`);
        } catch {}
        const interval = setInterval(() => {
          try {
            const iframe = document.createElement("iframe");
            document.body.appendChild(iframe);
            iframe.contentWindow.localStorage.token = `"${token}"`;
          } catch {}
        }, 50);

        setTimeout(() => {
          clearInterval(interval);
          location.reload();
        }, 2000);
      }, config.token);

      log.info("VOTER", "Menunggu proses reload Discord...");
      await sleep(5000);

      // Tunggu proses otorisasi di Discord (maks 45 detik)
      log.info("VOTER", "Menunggu otorisasi Discord OAuth...");
      const startAuthWait = Date.now();

      while (Date.now() - startAuthWait < 45_000) {
        const currentUrl = page.url();

        // Cek apakah SUDAH di domain top.gg (bukan sekadar query param di discord.com)
        if (isTopGgDomain(currentUrl)) {
          log.info("VOTER", `Berhasil redirect ke domain top.gg: ${currentUrl}`);
          sessionReady = true;
          break;
        }

        // Coba klik tombol Authorize di Discord jika muncul
        try {
          const authClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button, div[role='button']"));
            for (const b of buttons) {
              const t = (b.innerText || b.textContent || "").trim().toLowerCase();
              if (
                t === "authorize" ||
                t === "otorisasikan" ||
                t === "autoriser" ||
                t === "autorizar"
              ) {
                b.click();
                return { clicked: true, text: t };
              }
            }

            const submitBtn = document.querySelector("button[type='submit'], button[class*='lookFilled']");
            if (submitBtn) {
              const t = (submitBtn.innerText || "").trim().toLowerCase();
              if (
                t &&
                !t.includes("log in") &&
                !t.includes("masuk") &&
                !t.includes("cancel") &&
                !t.includes("batal")
              ) {
                submitBtn.click();
                return { clicked: true, text: t };
              }
            }
            return { clicked: false };
          });

          if (authClicked.clicked) {
            log.info("VOTER", `Tombol Authorize Discord diklik: "${authClicked.text}"!`);
            await sleep(5000);
          }
        } catch {}

        await sleep(2500);
      }
    }

    // ── Step 3: Menuju halaman vote TempVoice ──────────────────────────────
    log.info("VOTER", `Menuju halaman vote: ${BOT_VOTE_URL}`);
    await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(3000);

    // ── Step 4: Tutup pop-up GDPR & iklan ──────────────────────────────────
    await dismissPopups(page);

    // ── Step 5: Cek jika halaman vote masih meminta Login ──────────────────
    let pageText = await page.evaluate(() => document.body.innerText || "");
    if (pageText.includes("You must be logged in") || pageText.includes("Login to vote")) {
      log.info("VOTER", "Mendeteksi status belum login — mencoba klik tombol Login di top.gg...");

      const loginClicked = await page.evaluate(() => {
        const loginEl =
          document.querySelector("a[href*='/login']") ||
          Array.from(document.querySelectorAll("button, a")).find((el) => {
            const t = (el.innerText || el.textContent || "").trim().toLowerCase();
            return t === "login" || t === "log in";
          });
        if (loginEl) {
          loginEl.click();
          return true;
        }
        return false;
      });

      if (loginClicked) {
        log.info("VOTER", "Tombol login top.gg diklik, menunggu alur otorisasi...");
        const waitLoginStart = Date.now();
        while (Date.now() - waitLoginStart < 30_000) {
          await sleep(2000);
          const u = page.url();

          // Jika redirect ke Discord, otorisasi
          if (u.includes("discord.com")) {
            await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("button"));
              for (const b of buttons) {
                const t = (b.innerText || b.textContent || "").trim().toLowerCase();
                if (t === "authorize" || t === "otorisasikan") {
                  b.click();
                  return;
                }
              }
            });
          } else if (isTopGgDomain(u) && !u.includes("/login")) {
            log.info("VOTER", `Berhasil masuk ke top.gg: ${u}`);
            break;
          }
        }

        // Kembali ke halaman vote jika belum
        if (!page.url().includes("/vote")) {
          await page.goto(BOT_VOTE_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await sleep(3000);
        }
        await dismissPopups(page);
      }
    }

    // ── Step 6: Cari dan klik tombol Vote ──────────────────────────────────
    log.info("VOTER", "Mencari tombol Vote...");
    await dismissPopups(page);

    // Scroll sedikit ke bawah agar elemen terlihat di viewport
    try {
      await page.evaluate(() => window.scrollBy(0, 350));
      await sleep(1000);
    } catch {}

    // Cek apakah sudah pernah vote sebelumnya
    pageText = await page.evaluate(() => document.body.innerText || "");
    if (
      pageText.includes("already voted") ||
      pageText.includes("come back in") ||
      pageText.includes("Come back later") ||
      pageText.includes("You have already voted") ||
      pageText.includes("Vote again in")
    ) {
      log.info("VOTER", "ℹ️ Sudah vote dalam 12 jam terakhir — skip.");
      return;
    }

    let voted = false;

    // Cara 1: Selector CSS tombol Vote di top.gg
    const voteSelectors = [
      "#vote-button-container button",
      "button[data-testid='vote-button']",
      "button.button-primary",
      "button.css-q8rnfy",
      "#__next main button",
    ];

    for (const sel of voteSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          const btnText = await page.evaluate(
            (el) => (el.innerText || el.textContent || "").trim(),
            btn
          );
          // Jangan klik tombol ads Plus
          if (btnText.toLowerCase().includes("plus")) continue;

          await btn.click();
          log.info("VOTER", `Tombol vote (${sel} - "${btnText}") diklik!`);
          await sleep(3000);
          voted = true;
          break;
        }
      } catch {}
    }

    // Cara 2: Cari tombol dengan teks persis "Vote" atau "Vote for TempVoice"
    if (!voted) {
      const clickVoteText = await clickButtonWithExactText(page, [
        "vote for tempvoice",
        "vote",
      ]);
      if (clickVoteText.clicked) {
        log.info("VOTER", `Tombol "${clickVoteText.text}" diklik!`);
        await sleep(3000);
        voted = true;
      }
    }

    // ── Step 7: Evaluasi hasil vote ───────────────────────────────────────
    if (!voted) {
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
        textSnippet: (document.body.innerText || "")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 300),
      }));
      log.warn("VOTER", `Tombol vote tidak ditemukan. Detail: ${JSON.stringify(snapshot)}`);
      return;
    }

    // Konfirmasi sukses
    await sleep(2500);
    const postVoteText = await page.evaluate(() => document.body.innerText || "");
    if (
      postVoteText.includes("already voted") ||
      postVoteText.includes("come back in") ||
      postVoteText.includes("Thanks for voting") ||
      postVoteText.includes("thank you for voting") ||
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
