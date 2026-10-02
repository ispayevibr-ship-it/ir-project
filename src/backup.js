"use strict";
const fs = require("fs");
function createBackup(source, destination) {
  fs.copyFileSync(source, destination);
}
function restoreBackup(source, destination) {
  fs.copyFileSync(source, destination);
}
module.exports = { createBackup, restoreBackup };
