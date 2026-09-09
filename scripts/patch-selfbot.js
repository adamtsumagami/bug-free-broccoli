"use strict";

const fs = require("fs");
const path = require("path");

const applicationPath = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "discord.js-selfbot-v13",
  "src",
  "structures",
  "interfaces",
  "Application.js",
);

if (!fs.existsSync(applicationPath)) {
  throw new Error(`discord.js-selfbot-v13 tidak ditemukan di ${applicationPath}`);
}

const source = fs.readFileSync(applicationPath, "utf8");
const brokenImport = "const { ApplicationFlags } = require('../../util/ApplicationFlags');";
const fixedImport = "const ApplicationFlags = require('../../util/ApplicationFlags');";

if (source.includes(brokenImport)) {
  fs.writeFileSync(applicationPath, source.replace(brokenImport, fixedImport));
  console.log("Patched discord.js-selfbot-v13 ApplicationFlags import.");
} else if (!source.includes(fixedImport)) {
  throw new Error("Format ApplicationFlags import tidak dikenal; patch dibatalkan.");
}
