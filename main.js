"use strict";
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const database = require("./src/database");
const backup = require("./src/backup");
const updates = require("./src/updater");
let win;
const dbPath=()=>path.join(app.getPath("userData"),"ir-project.db");
const roleHashes={admin:crypto.createHash("sha256").update("333111").digest("hex"),engineer:crypto.createHash("sha256").update("000000").digest("hex")};
function appFile(rel){const hot=path.join(updates.currentDir(),rel);return fs.existsSync(hot)?hot:path.join(__dirname,rel)}
function createWindow(){win=new BrowserWindow({width:1280,height:800,icon:path.join(__dirname,"assets","icon.ico"),webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});win.loadFile(appFile(path.join("src","index.html")));}
async function selectImage(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});return r.canceled||!r.filePaths[0]?"":r.filePaths[0];}
function registerObjects(){ipcMain.handle("objects:list",()=>database.listObjects());ipcMain.handle("objects:get",(_e,id)=>database.getObject(id));ipcMain.handle("objects:create",(_e,data)=>database.createObject(data));ipcMain.handle("objects:select-image",()=>selectImage());ipcMain.handle("sections:get",(_e,id)=>database.getSections(id));ipcMain.handle("sections:set",(_e,x)=>database.setSection(x.objectId,x.key,x.enabled));}
function registerAccess(){ipcMain.handle("access:login",(_e,{role,password})=>{if(role==="guest")return true;if(!roleHashes[role])return false;const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");return crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes[role]));});}
function registerBackup(){ipcMain.handle("backup:create",async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:"ir-project-backup.db",filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePath)return false;backup.createBackup(dbPath(),r.filePath);return true;});ipcMain.handle("backup:restore",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePaths[0])return false;database.closeDatabase();backup.restoreBackup(r.filePaths[0],dbPath());database.openDatabase();return true;});}
function registerUpdates(){ipcMain.handle("update:check",()=>updates.check());ipcMain.handle("update:download",()=>updates.download());ipcMain.handle("update:install",()=>updates.install());updates.updater.on("update-available",info=>win?.webContents.send("update:status",{type:"available",version:info.version,size:info.size||0}));updates.updater.on("update-not-available",info=>win?.webContents.send("update:status",{type:"current",version:info.version}));updates.updater.on("download-progress",p=>win?.webContents.send("update:status",{type:"progress",percent:Math.round(p.percent),transferred:p.transferred,total:p.total,bytesPerSecond:p.bytesPerSecond}));updates.updater.on("update-downloaded",info=>win?.webContents.send("update:status",{type:"downloaded",version:info.version}));updates.updater.on("error",error=>win?.webContents.send("update:status",{type:"error",message:error.message}));}
app.whenReady().then(()=>{database.openDatabase();registerObjects();registerAccess();registerBackup();registerUpdates();createWindow();});app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
