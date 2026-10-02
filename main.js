"use strict";
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const database = require("./src/database");
const backup = require("./src/backup");
const updates = require("./src/updater");
let win;
const dbPath = () => path.join(app.getPath("userData"), "ir-project.db");
function createWindow(){win=new BrowserWindow({width:1280,height:800,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});win.loadFile(path.join(__dirname,"src","index.html"));}
async function selectImage(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});if(r.canceled||!r.filePaths[0])return "";return r.filePaths[0];}
function registerObjects(){ipcMain.handle("objects:list",()=>database.listObjects());ipcMain.handle("objects:create",(_e,data)=>database.createObject(data));ipcMain.handle("objects:select-image",()=>selectImage());}
function registerBackup(){ipcMain.handle("backup:create",async()=>{const result=await dialog.showSaveDialog(win,{defaultPath:"ir-project-backup.db",filters:[{name:"IR Project backup",extensions:["db"]}]});if(result.canceled||!result.filePath)return false;backup.createBackup(dbPath(),result.filePath);return true;});ipcMain.handle("backup:restore",async()=>{const result=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"IR Project backup",extensions:["db"]}]});if(result.canceled||!result.filePaths[0])return false;database.closeDatabase();backup.restoreBackup(result.filePaths[0],dbPath());database.openDatabase();return true;});}
function registerUpdates(){ipcMain.handle("update:check",()=>updates.check());ipcMain.handle("update:download",()=>updates.download());ipcMain.handle("update:install",()=>updates.install());updates.updater.on("update-available",info=>win?.webContents.send("update:status",{type:"available",version:info.version}));updates.updater.on("update-downloaded",info=>win?.webContents.send("update:status",{type:"downloaded",version:info.version}));}
app.whenReady().then(()=>{database.openDatabase();registerObjects();registerBackup();registerUpdates();createWindow();});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
