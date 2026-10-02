"use strict";
const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
let database;
const sectionKeys=["reports","work-types","marks","schedule","photos","scheme","acted-days","penalties","finance"];
function openDatabase(){database=new DatabaseSync(path.join(app.getPath("userData"),"ir-project.db"));database.exec(`PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS objects (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,customer TEXT NOT NULL,address TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('В работе','Завершен')),photo TEXT NOT NULL,banner TEXT NOT NULL); CREATE TABLE IF NOT EXISTS object_sections (object_id INTEGER NOT NULL,section_key TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),PRIMARY KEY(object_id,section_key),FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE);`);return database;}
function closeDatabase(){if(database)database.close();database=undefined;}
function listObjects(){return database.prepare("SELECT id,name,customer,address,status,photo,banner FROM objects ORDER BY id DESC").all();}
function getObject(id){return database.prepare("SELECT id,name,customer,address,status,photo,banner FROM objects WHERE id=?").get(id)||null;}
function applySections(id,sections){if(!sections||typeof sections!=="object")return;const set=database.prepare("INSERT INTO object_sections(object_id,section_key,enabled) VALUES(?,?,?) ON CONFLICT(object_id,section_key) DO UPDATE SET enabled=excluded.enabled");for(const key of sectionKeys)if(Object.prototype.hasOwnProperty.call(sections,key))set.run(id,key,sections[key]?1:0);}
function createObject(data){const result=database.prepare("INSERT INTO objects(name,customer,address,status,photo,banner) VALUES(?,?,?,?,?,?)").run(data.name,data.customer,data.address,data.status,data.photo||"",data.banner||"");const id=Number(result.lastInsertRowid);const insert=database.prepare("INSERT INTO object_sections(object_id,section_key,enabled) VALUES(?,?,?)");for(const key of sectionKeys)insert.run(id,key,data.sections&&Object.prototype.hasOwnProperty.call(data.sections,key)?(data.sections[key]?1:0):1);return getObject(id);}
function updateObject(id,data){if(!getObject(id))return null;database.prepare("UPDATE objects SET name=?,customer=?,address=?,status=?,photo=?,banner=? WHERE id=?").run(data.name,data.customer,data.address,data.status,data.photo||"",data.banner||"",id);applySections(id,data.sections);return getObject(id);}
function deleteObject(id){const r=database.prepare("DELETE FROM objects WHERE id=?").run(id);return Number(r.changes)>0;}
function getSections(objectId){const saved=new Map(database.prepare("SELECT section_key,enabled FROM object_sections WHERE object_id=?").all(objectId).map(x=>[x.section_key,Boolean(x.enabled)]));return sectionKeys.map(key=>({key,enabled:saved.has(key)?saved.get(key):true}));}
function setSection(objectId,key,enabled){if(!sectionKeys.includes(key))throw Error("Unknown section");database.prepare("INSERT INTO object_sections(object_id,section_key,enabled) VALUES(?,?,?) ON CONFLICT(object_id,section_key) DO UPDATE SET enabled=excluded.enabled").run(objectId,key,enabled?1:0);return getSections(objectId);}
module.exports={openDatabase,closeDatabase,listObjects,getObject,createObject,updateObject,deleteObject,getSections,setSection};
