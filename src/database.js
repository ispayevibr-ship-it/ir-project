"use strict";
const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
let database;
function openDatabase() {
  database = new DatabaseSync(path.join(app.getPath("userData"), "ir-project.db"));
  database.exec(`CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    customer TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('В работе','Завершен')),
    photo TEXT NOT NULL,
    banner TEXT NOT NULL
  )`);
  return database;
}
function closeDatabase() { if (database) database.close(); database = undefined; }
function listObjects() { return database.prepare("SELECT id,name,customer,address,status,photo,banner FROM objects ORDER BY id DESC").all(); }
function createObject(data) {
  const result = database.prepare("INSERT INTO objects(name,customer,address,status,photo,banner) VALUES(?,?,?,?,?,?)").run(data.name,data.customer,data.address,data.status,data.photo,data.banner);
  return database.prepare("SELECT id,name,customer,address,status,photo,banner FROM objects WHERE id=?").get(result.lastInsertRowid);
}
module.exports = { openDatabase, closeDatabase, listObjects, createObject };
