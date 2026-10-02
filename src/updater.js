"use strict";
const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const logPath = path.join(app.getPath("userData"), "updater.log");
const updaterCacheDir = path.join(app.getPath("localAppData"), "ir-project-updater");
const pendingDir = path.join(updaterCacheDir, "pending");

function write(level, args) {
  const text = args.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
  const line = `[${new Date().toISOString()}] [${level}] ${text}\n`;
  try { fs.appendFileSync(logPath, line, "utf8"); } catch (_) {}
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](text);
}

function cleanStalePendingCache() {
  try {
    if (!fs.existsSync(pendingDir)) return;
    const entries = fs.readdirSync(pendingDir);
    if (entries.length === 0) return;
    write("info", ["Cleaning stale updater pending cache", pendingDir]);
    fs.rmSync(pendingDir, { recursive: true, force: true });
    fs.mkdirSync(pendingDir, { recursive: true });
  } catch (error) {
    write("warn", ["Could not clean updater pending cache", error && error.message ? error.message : String(error)]);
  }
}

autoUpdater.logger = {
  info: (...args) => write("info", args),
  warn: (...args) => write("warn", args),
  error: (...args) => write("error", args),
  debug: (...args) => write("debug", args)
};
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.disableDifferentialDownload = false;

write("info", ["IR Project updater started", `version=${app.getVersion()}`, `log=${logPath}`]);

module.exports = {
  check: () => {
    write("info", ["Manual update check"]);
    return autoUpdater.checkForUpdates();
  },
  download: () => {
    write("info", ["Manual update download", "differential=true"]);
    cleanStalePendingCache();
    return autoUpdater.downloadUpdate();
  },
  install: () => {
    write("info", ["Installing downloaded update silently"]);
    return autoUpdater.quitAndInstall(true, true);
  },
  updater: autoUpdater,
  logPath
};
