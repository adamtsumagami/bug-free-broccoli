"use strict";

const fs   = require("fs");
const path = require("path");

// ─── Log Levels ──────────────────────────────────────────────────────────────

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

const LEVEL_STYLE = {
  DEBUG: { emoji: "🔍", color: "\x1b[90m" },   // gray
  INFO:  { emoji: "ℹ️ ", color: "\x1b[36m" },   // cyan
  WARN:  { emoji: "⚠️ ", color: "\x1b[33m" },   // yellow
  ERROR: { emoji: "❌", color: "\x1b[31m" },    // red
};

const RESET = "\x1b[0m";
const DIM   = "\x1b[2m";

// ─── Log Directory ───────────────────────────────────────────────────────────

const LOG_DIR = path.resolve(__dirname, "..", "logs");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function timestamp() {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const h   = String(now.getHours()).padStart(2, "0");
  const mi  = String(now.getMinutes()).padStart(2, "0");
  const s   = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function dateStamp() {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

// ─── Logger Class ────────────────────────────────────────────────────────────

class Logger {
  constructor(minLevel = "INFO") {
    this.minLevel = LEVELS[minLevel] ?? LEVELS.INFO;
    this._currentDate = null;
    this._stream = null;
    ensureLogDir();
  }

  /** Update minimum log level at runtime */
  setLevel(level) {
    const upper = level.toUpperCase();
    if (LEVELS[upper] !== undefined) {
      this.minLevel = LEVELS[upper];
    }
  }

  /** Get or rotate the write stream for today's log file */
  _getStream() {
    const today = dateStamp();
    if (this._currentDate !== today) {
      if (this._stream) {
        this._stream.end();
      }
      this._currentDate = today;
      const filePath = path.join(LOG_DIR, `bot-${today}.log`);
      this._stream = fs.createWriteStream(filePath, { flags: "a" });
    }
    return this._stream;
  }

  /** Core log method */
  _log(level, context, message, extra) {
    if (LEVELS[level] < this.minLevel) return;

    const ts    = timestamp();
    const style = LEVEL_STYLE[level];
    const ctx   = context ? `[${context}]` : "";

    // Console output (colored)
    const consoleLine = [
      `${DIM}${ts}${RESET}`,
      `${style.color}${style.emoji} ${level.padEnd(5)}${RESET}`,
      ctx ? `${style.color}${ctx}${RESET}` : "",
      message,
    ].filter(Boolean).join(" ");

    if (level === "ERROR") {
      console.error(consoleLine);
    } else if (level === "WARN") {
      console.warn(consoleLine);
    } else {
      console.log(consoleLine);
    }

    // File output (plain text)
    const fileLine = [ts, level.padEnd(5), ctx, message]
      .filter(Boolean).join(" ");

    try {
      const stream = this._getStream();
      stream.write(fileLine + "\n");

      if (extra) {
        const extraStr = typeof extra === "string"
          ? extra
          : JSON.stringify(extra, null, 2);
        stream.write(`  └─ ${extraStr}\n`);
      }
    } catch {
      // Jangan crash kalau write gagal
    }
  }

  // ── Convenience methods ──────────────────────────────────────────────────

  debug(context, message, extra) { this._log("DEBUG", context, message, extra); }
  info(context, message, extra)  { this._log("INFO",  context, message, extra); }
  warn(context, message, extra)  { this._log("WARN",  context, message, extra); }
  error(context, message, extra) { this._log("ERROR", context, message, extra); }

  /** Log a separator line for readability */
  separator(label) {
    const line = `${"─".repeat(20)} ${label} ${"─".repeat(20)}`;
    this._log("INFO", null, line);
  }

  /** Close the file stream gracefully */
  close() {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

let instance = null;

function createLogger(level) {
  instance = new Logger(level);
  return instance;
}

function getLogger() {
  if (!instance) {
    instance = new Logger("INFO");
  }
  return instance;
}

module.exports = { createLogger, getLogger };
