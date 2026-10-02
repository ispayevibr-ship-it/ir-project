"use strict";
const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
let database;
function openDatabase() {
  database = new DatabaseSync(path.join(app.getPath("userData"), "ir-project.db"));
  return database;
}
function closeDatabase() {
  if (database) database.close();
  database = undefined;
}
module.exports = { openDatabase, closeDatabase };
