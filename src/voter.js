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
 * Pasang cookie sesi top.gg manual (TOPGG_COOKIE)
 * Menerima format:
 * - Token saja: "eyJhbGciOi..."
 * - Key-value: "__Secure-authjs.session-token=eyJhbGciOi..."
 * - Multi-cookie (ekspor dari browser): "cookie1=val1; cookie2=val2"
 */
async function applyTopGgCookies(page, cookieInput) {
  if (!cookieInput) return false;
  try {
    const cookiesToSet = [];
    const parts = cookieInput.split(";").map((p) => p.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.includes("=")) {
        const eqIdx = part.indexOf("=");
        const name = part.substring(0, eqIdx).trim();
        const value = part.substring(eqIdx + 1).trim();
        if (name && value) {
          cookiesToSet.push({ name, value });
        }
      } else {
        // Asumsikan token tunggal adalah __Secure-authjs.session-token
        cookiesToSet.push({
          name: "__Secure-authjs.session-token",
          value: part.trim(),
        });
      }
    }

    for (const c of cookiesToSet) {
      await page.setCookie({
        name: c.name,
        value: c.value,
        domain: ".top.gg",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
      await page.setCookie({
        name: c.name,
        value: c.value,
        domain: "top.gg",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
    }

    log.info("VOTER", `✅ Menginjeksi ${cookiesToSet.length} cookie sesi manual ke top.gg.`);
    return true;
  } catch (err) {
    log.warn("VOTER", `Gagal memasang cookie manual: ${err.message}`);
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
    ignoreDefaultArgs: ["--enable-automation"],
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
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60_000);

  // Stealth: Hapus penanda automation (navigator.webdriver) agar Cloudflare Turnstile lolos
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Blokir resource berat & semua pelacak/iklan/CMP banner (Google Funding Choices)
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url().toLowerCase();
    const type = req.resourceType();

    // JANGAN blokir resource dari Cloudflare / Turnstile
    if (url.includes("cloudflare") || url.includes("turnstile")) {
      return req.continue();
    }

    // Blokir resource gambar, font, media berat (kecuali captcha/turnstile di atas)
    if (["image", "font", "media"].includes(type)) {
      return req.abort();
    }

    // Blokir Google Funding Choices, Google Ads, dan CMP banner yang menghalangi tombol vote
    if (
      url.includes("fundingchoices") ||
      url.includes("googlesyndication") ||
      url.includes("doubleclick") ||
      url.includes("google-analytics") ||
      url.includes("googletagservices") ||
      url.includes("googletagmanager") ||
      url.includes("adnxs") ||
      url.includes("criteo") ||
      url.includes("amazon-adsystem") ||
      url.includes("quantcast") ||
      url.includes("pubmatic") ||
      url.includes("rubiconproject") ||
      url.includes("taboola") ||
      url.includes("outbrain") ||
      url.includes("smartadserver")
    ) {
      return req.abort();
    }

    req.continue();
  });

  try {
    let sessionReady = false;

    // ── Jalur 1: Manual Cookie (TOPGG_COOKIE) ─────────────────────────────
    if (config.voter.cookie) {
      log.info("VOTER", "Metode login: Manual Cookie (TOPGG_COOKIE terpasang).");
      await applyTopGgCookies(page, config.voter.cookie);
      sessionReady = true;
    }

    // ── Jalur 2: Direct OAuth API Discord (Otomatis & Cepat) ──────────────
    if (!sessionReady) {
      log.info("VOTER", "Metode login: Otomatis via Discord OAuth direct API...");
      const directCallbackUrl = await requestDiscordOAuthDirect(config.token);

      if (directCallbackUrl) {
        log.info("VOTER", "Membuka callback URL top.gg untuk sinkronisasi sesi login...");
        try {
          await page.goto(directCallbackUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        } catch {}

        // Tunggu top.gg selesai memproses sesi login dan redirect
        const startCbWait = Date.now();
        while (Date.now() - startCbWait < 20_000) {
          const currentUrl = page.url();
          if (!currentUrl.includes("/login/callback")) {
            log.info("VOTER", `Callback berhasil memproses sesi! URL: ${currentUrl}`);
            sessionReady = true;
            break;
          }
          await sleep(1500);
        }

        if (!sessionReady) {
          log.info("VOTER", `Melanjutkan ke halaman vote (URL callback: ${page.url()}).`);
          sessionReady = true;
        }
      }
    }

    // ── Jalur 3: Fallback via Browser Injection jika Jalur 1 & 2 gagal ────
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
    await sleep(3500);

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

    // ── Step 6: Cari dan klik tombol Vote (Menunggu countdown iklan jika ada) ─
    log.info("VOTER", "Mencari tombol Vote (menunggu countdown iklan selesai jika ada)...");

    let voted = false;
    const maxVoteWaitMs = 45_000;
    const voteWaitStart = Date.now();
    let lastLoggedCountdown = null;

    while (Date.now() - voteWaitStart < maxVoteWaitMs) {
      await dismissPopups(page);

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

      // Deteksi status countdown iklan (misal: "You will be able to vote after this ad. 7")
      const countdownInfo = await page.evaluate(() => {
        const text = document.body.innerText || "";
        const m = text.match(/vote after this ad[^\d]*(\d+)/i);
        return m ? m[1] : null;
      });

      if (countdownInfo && countdownInfo !== lastLoggedCountdown) {
        lastLoggedCountdown = countdownInfo;
        log.info("VOTER", `Menunggu iklan top.gg selesai: ${countdownInfo} detik tersisa...`);
      }

      // Scroll sedikit agar elemen tetap aktif dan terlihat di viewport
      try {
        await page.evaluate(() => window.scrollBy(0, 150));
      } catch {}

      // Evaluasi dan klik tombol vote
      const voteResult = await page.evaluate(() => {
        const isEligibleVoteBtn = (el) => {
          if (!el) return false;
          if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;

          const rawText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          const aria = (el.getAttribute("aria-label") || "").toLowerCase();
          const testId = (el.getAttribute("data-testid") || "").toLowerCase();
          const id = (el.id || "").toLowerCase();

          // Hindari tombol iklan / Top.gg Plus / auto vote
          if (
            rawText.includes("plus") ||
            rawText.includes("again") ||
            rawText.includes("automatic") ||
            rawText.includes("rewards") ||
            rawText.includes("buy auto") ||
            rawText.includes("remove ads")
          ) {
            return false;
          }

          // Tombol Vote standar
          if (rawText === "vote" || rawText === "vote for tempvoice" || rawText === "vote now") return true;
          if (rawText.startsWith("vote") && rawText.length < 35) return true;
          if (rawText.endsWith("vote") && rawText.length < 35) return true;

          // Cocokkan atribut pengenal tombol
          if (testId === "vote-button" || id === "vote-button") return true;
          if (aria.includes("vote") && !aria.includes("again") && !aria.includes("auto")) return true;

          return false;
        };

        // 1. Cek selector CSS utama
        const selectors = [
          "#vote-button-container button",
          "button[data-testid='vote-button']",
          "button[type='submit']",
          "button.button-primary",
          "button.css-q8rnfy",
          "#__next main button",
          "main button",
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && isEligibleVoteBtn(el)) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.click();
            const text = (el.innerText || el.textContent || "").trim();
            return { clicked: true, text, method: sel };
          }
        }

        // 2. Scan semua tombol & elemen berkategori clickable di halaman
        const elements = Array.from(document.querySelectorAll("button, a[role='button'], div[role='button']"));
        for (const el of elements) {
          if (isEligibleVoteBtn(el)) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.click();
            const text = (el.innerText || el.textContent || "").trim();
            return { clicked: true, text, method: "element-scan" };
          }
        }

        return { clicked: false };
      });

      if (voteResult && voteResult.clicked) {
        log.info("VOTER", `✅ Tombol vote (${voteResult.method} - "${voteResult.text}") berhasil diklik!`);
        voted = true;
        break;
      }

      await sleep(2000);
    }

    // ── Step 7: Evaluasi jika tombol vote tidak ditemukan ──────────────────
    if (!voted) {
      try {
        const fs = require("fs");
        const path = require("path");
        const debugDir = path.resolve(__dirname, "..", "logs");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ path: path.join(debugDir, "voter-failed.png"), fullPage: true });
        log.info("VOTER", "Screenshot disimpan ke logs/voter-failed.png");
      } catch {}

      const snapshot = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a[role='button']"))
          .map((b) => (b.innerText || b.textContent || "").replace(/\s+/g, " ").trim())
          .filter((t) => t.length > 0 && t.length < 50);

        return {
          title: document.title,
          url: window.location.href,
          availableButtons: buttons.slice(0, 15),
          textSnippet: (document.body.innerText || "")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 300),
        };
      });
      log.warn("VOTER", `Tombol vote tidak ditemukan. Detail: ${JSON.stringify(snapshot)}`);
      return;
    }

    // ── Step 8: Tunggu konfirmasi vote & selesaikan Cloudflare Turnstile ───
    log.info("VOTER", "Menunggu konfirmasi vote & verifikasi Cloudflare Turnstile...");

    let confirmed = false;
    const postClickStart = Date.now();
    const maxPostClickWait = 35_000; // tunggu hingga 35 detik

    while (Date.now() - postClickStart < maxPostClickWait) {
      // 1. Cek apakah ada Cloudflare Turnstile widget
      const turnstileFrame = page.frames().find(
        (f) => f.url().includes("challenges.cloudflare.com") || f.url().includes("turnstile")
      );
      const turnstileEl = await page.$(
        "iframe[src*='challenges.cloudflare.com'], iframe[src*='turnstile'], div[id*='turnstile'], div[id*='cf-turnstile']"
      );

      if (turnstileFrame || turnstileEl) {
        log.info("VOTER", "Mendeteksi widget Cloudflare Turnstile — mencoba verifikasi...");

        // Coba klik checkbox di dalam iframe jika frame dapat diakses
        if (turnstileFrame) {
          try {
            await turnstileFrame.evaluate(() => {
              const target = document.querySelector(
                "input[type='checkbox'], #challenge-stage, .ctp-checkbox-label, #cf-stage, body"
              );
              if (target) target.click();
            });
          } catch {}
        }

        // Coba klik koordinat checkbox iframe dari halaman utama
        if (turnstileEl) {
          try {
            const box = await turnstileEl.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
              await page.mouse.click(box.x + Math.min(35, box.width / 4), box.y + box.height / 2);
              log.info("VOTER", "Mouse click dikirim ke area checkbox Cloudflare Turnstile.");
            }
          } catch {}
        }
      }

      // 2. Cek apakah halaman mengonfirmasi vote berhasil
      const currentText = await page.evaluate(() => document.body.innerText || "");
      const isConfirmed =
        currentText.includes("already voted") ||
        currentText.includes("come back in") ||
        currentText.includes("Thanks for voting") ||
        currentText.includes("thank you for voting") ||
        currentText.includes("Voted successfully") ||
        currentText.includes("Vote again in") ||
        currentText.includes("You have voted") ||
        currentText.includes("Success");

      if (isConfirmed) {
        log.info("VOTER", "🎉 VOTE BERHASIL DIKONFIRMASI OLEH TOP.GG!");
        confirmed = true;
        break;
      }

      // 3. Jika Turnstile sudah selesai tapi tombol vote butuh klik konfirmasi akhir
      const canClickAgain = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button, a[role='button']")).find((b) => {
          const txt = (b.innerText || b.textContent || "").toLowerCase().trim();
          const dis = b.disabled || b.getAttribute("aria-disabled") === "true";
          return (txt === "vote" || txt === "vote now") && !dis;
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (canClickAgain) {
        log.info("VOTER", "Tombol Vote diklik ulang (post-verification)...");
      }

      await sleep(2500);
    }

    // Ambil screenshot pasca-vote untuk verifikasi visual
    try {
      const fs = require("fs");
      const path = require("path");
      const debugDir = path.resolve(__dirname, "..", "logs");
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      await page.screenshot({ path: path.join(debugDir, "voter-after-vote.png"), fullPage: true });
      log.info("VOTER", "Screenshot disimpan ke logs/voter-after-vote.png");
    } catch {}

    if (confirmed) {
      log.info("VOTER", "✅ Vote TempVoice sukses selesai dan tercatat di Top.gg.");
    } else {
      const finalSnippet = await page.evaluate(() =>
        (document.body.innerText || "").replace(/\s+/g, " ").trim().substring(0, 250)
      );
      log.info("VOTER", `Selesai memproses klik vote. Cuplikan teks: "${finalSnippet}"`);
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
