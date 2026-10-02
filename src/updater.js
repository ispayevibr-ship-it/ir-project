"use strict";
const { autoUpdater } = require("electron-updater");
autoUpdater.autoDownload = false;
module.exports = {
  check: () => autoUpdater.checkForUpdates(),
  download: () => autoUpdater.downloadUpdate(),
  install: () => autoUpdater.quitAndInstall(),
  updater: autoUpdater
};
