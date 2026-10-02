"use strict";
const { autoUpdater } = require("electron-updater");
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const logPath = path.join(app.getPath("userData"), "updater.log");
function write(level, args) {
  const text = args.map(v => typeof v === "string" ? v : JSON.stringify(v)).join(" ");
  const line = `[${new Date().toISOString()}] [${level}] ${text}\n`;
  try { fs.appendFileSync(logPath, line, "utf8"); } catch (_) {}
  console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](text);
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
    return autoUpdater.downloadUpdate();
  },
  install: () => {
    write("info", ["Installing downloaded update silently"]);
    return autoUpdater.quitAndInstall(true, true);
  },
  updater: autoUpdater,
  logPath
};
