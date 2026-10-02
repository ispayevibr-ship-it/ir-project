"use strict";
const { autoUpdater } = require("electron-updater");
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
module.exports = {
  check: () => autoUpdater.checkForUpdates(),
  download: () => autoUpdater.downloadUpdate(),
  install: () => autoUpdater.quitAndInstall(true, true),
  updater: autoUpdater
};
