"use strict";
const {app,BrowserWindow,ipcMain,dialog,Menu,protocol,shell,safeStorage,net}=require("electron");
const path=require("path"),crypto=require("crypto"),fs=require("fs");
const database=require("./src/database"),backup=require("./src/backup"),updates=require("./src/updater"),runtimeLoader=require("./src/runtime-loader"),imageStore=require("./src/image-store"),companyStore=require("./src/company-store"),reportDocumentStore=require("./src/report-document-store"),marksExcel=require("./src/marks-excel"),registerSectionIpc=require("./src/register-section-ipc");
let win;
const aiAdminSessions=new Map();
function checkAiAdmin(event){
 const expires=aiAdminSessions.get(event.sender.id)||0;
 if(Date.now()>expires){aiAdminSessions.delete(event.sender.id);throw Error("Для изменения API-ключа требуется подтверждённая сессия администратора")}
}
// AI services can arrive with a hot update (userData/app-updates/current/src); the installed ones are the fallback.
function loadAi(){
 const Module=require("module"),modules=path.join(app.getAppPath(),"node_modules");
 // Modules loaded from the update folder find the installed packages (pdfjs, SDK) through NODE_PATH; workers inherit it.
 if(!String(process.env.NODE_PATH||"").split(path.delimiter).includes(modules)){
  process.env.NODE_PATH=[modules,process.env.NODE_PATH].filter(Boolean).join(path.delimiter);Module._initPaths()}
 const deps={getUserDataPath:()=>app.getPath("userData"),safeStorage,netFetch:(url,init)=>net.fetch(url,init),
  dialog,shell,database,getWindow:()=>win,checkAdmin:checkAiAdmin};
 const hot=updates.resolveFile("src/ai-ipc.js");
 if(path.resolve(hot)!==path.resolve(__dirname,"src","ai-ipc.js")){
  const channels=[];
  try{
   const m=require(hot);if(m.API!==1)throw Error("API "+m.API);
   return m.register({...deps,ipcMain:{handle:(channel,fn)=>{channels.push(channel);ipcMain.handle(channel,fn)}}})
  }catch(error){
   // A broken hot update must not take the AI section down: back to the installed modules.
   console.error("IR Project: hot AI modules failed, using installed",error);
   for(const channel of channels)ipcMain.removeHandler(channel)
  }
 }
 return require("./src/ai-ipc").register({...deps,ipcMain})
}
let ai={documents:null,engine:null};
const dbPath=()=>path.join(app.getPath("userData"),"ir-project.db");
const roleHashes={admin:crypto.createHash("sha256").update("333111").digest("hex"),engineer:crypto.createHash("sha256").update("000000").digest("hex")};
protocol.registerSchemesAsPrivileged([{scheme:"irapp",privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
function createWindow(){Menu.setApplicationMenu(null);win=new BrowserWindow({width:1280,height:800,icon:path.join(__dirname,"assets","icon.ico"),autoHideMenuBar:true,titleBarStyle:"hidden",titleBarOverlay:{color:"#f7f7f7",symbolColor:"#1f2937",height:38},webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});win.setMenuBarVisibility(false);win.loadURL("irapp://app/src/index.html")}
async function chooseImage(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});return r.canceled||!r.filePaths[0]?"":r.filePaths[0]}
async function selectObjectImage(type){const file=await chooseImage();return file?imageStore.saveObject(file,type==="banner"?"banner":"cover"):""}
async function selectCompanyLogo(){const file=await chooseImage();return file?imageStore.saveLogo(file):""}
async function selectReportPhoto(){const file=await chooseImage();return file?imageStore.saveReport(file):""}
async function selectReportAct(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Подписанный акт",extensions:["pdf","png","jpg","jpeg"]}]});if(r.canceled||!r.filePaths[0])return null;return reportDocumentStore.save(r.filePaths[0])}
function registerData(){
 ipcMain.handle("objects:list",()=>database.listObjects());ipcMain.handle("objects:get",(_e,id)=>database.getObject(id));ipcMain.handle("objects:create",(_e,d)=>database.createObject(d));ipcMain.handle("objects:update",(_e,x)=>database.updateObject(x.id,x.data));ipcMain.handle("objects:delete",(_e,id)=>{const ok=database.deleteObject(id);if(ok)ai.documents?.deleteObjectFiles(id);return ok});ipcMain.handle("objects:select-image",(_e,type)=>selectObjectImage(type));ipcMain.handle("images:read",(_e,file)=>imageStore.read(file));ipcMain.handle("images:remove",(_e,file)=>imageStore.remove(file));ipcMain.handle("images:optimize",(_e,{file,type})=>imageStore.optimize(file,type));
 ipcMain.handle("report:select-photo",()=>selectReportPhoto());ipcMain.handle("report:remove-photo",(_e,file)=>imageStore.remove(file));ipcMain.handle("report:select-act",()=>selectReportAct());ipcMain.handle("report:open-document",(_e,file)=>reportDocumentStore.open(file));ipcMain.handle("report:remove-document",(_e,file)=>reportDocumentStore.remove(file));
 ipcMain.handle("marks:select-excel",()=>marksExcel.select(win));ipcMain.handle("marks:save-example",()=>marksExcel.saveExample(win));
 ipcMain.handle("company:get",()=>companyStore.get());ipcMain.handle("company:save",(_e,d)=>companyStore.save(d));ipcMain.handle("company:select-logo",()=>selectCompanyLogo());ipcMain.handle("sections:get",(_e,id)=>database.getSections(id));ipcMain.handle("sections:set",(_e,x)=>database.setSection(x.objectId,x.key,x.enabled));registerSectionIpc(ipcMain,database);ipcMain.handle("entity:list",(_e,x)=>database.listEntity(x.objectId,x.entity));ipcMain.handle("entity:get",(_e,x)=>database.getEntity(x.objectId,x.entity,x.id));ipcMain.handle("entity:create",(_e,x)=>database.createEntity(x.objectId,x.entity,x.data));ipcMain.handle("entity:update",(_e,x)=>database.updateEntity(x.objectId,x.entity,x.id,x.data));ipcMain.handle("entity:delete",(_e,x)=>database.deleteEntity(x.objectId,x.entity,x.id));
}
function registerAi(){
 ai=loadAi();
 ipcMain.handle("ai-settings:authorize",(e,password)=>{
  const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");
  const authorized=crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes.admin));
  if(authorized){aiAdminSessions.set(e.sender.id,Date.now()+10*60*1000);
   e.sender.once("destroyed",()=>aiAdminSessions.delete(e.sender.id))}
  return authorized
 })
}
function registerReportExport(){ipcMain.handle("report:export-html",async(_e,{html,defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.html",filters:[{name:"HTML",extensions:["html"]}]});if(r.canceled||!r.filePath)return false;fs.writeFileSync(r.filePath,String(html||""),"utf8");return r.filePath});ipcMain.handle("report:export-pdf",async(e,{defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.pdf",filters:[{name:"PDF",extensions:["pdf"]}]});if(r.canceled||!r.filePath)return false;const pdf=await e.sender.printToPDF({printBackground:true,pageSize:"A4",margins:{top:0.32,bottom:0.32,left:0,right:0}});fs.writeFileSync(r.filePath,pdf);return r.filePath});ipcMain.handle("report:print",e=>new Promise((resolve,reject)=>{e.sender.print({printBackground:true},(ok,error)=>ok?resolve(true):reject(new Error(error||"Печать не выполнена")))}))}
function registerAccess(){ipcMain.handle("access:login",(_e,{role,password})=>{if(role==="guest")return true;if(!roleHashes[role])return false;const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");return crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes[role]))})}
function registerBackup(){ipcMain.handle("backup:create",async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:"ir-project-backup.db",filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePath)return false;backup.createBackup(dbPath(),r.filePath);return true});ipcMain.handle("backup:restore",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePaths[0])return false;database.closeDatabase();backup.restoreBackup(r.filePaths[0],dbPath());database.openDatabase();return true})}
function registerUpdates(){ipcMain.handle("update:check",()=>updates.check());ipcMain.handle("update:download",()=>updates.download());ipcMain.handle("update:install",()=>updates.install());ipcMain.handle("update:version",()=>updates.installedVersion());updates.updater.on("update-available",i=>win?.webContents.send("update:status",{type:"available",...i}));updates.updater.on("update-not-available",i=>win?.webContents.send("update:status",{type:"current",...i}));updates.updater.on("download-progress",p=>win?.webContents.send("update:status",{type:"progress",percent:Math.round(p.percent),transferred:p.transferred,total:p.total}));updates.updater.on("update-downloaded",i=>win?.webContents.send("update:status",{type:"downloaded",version:i.version}));updates.updater.on("error",e=>win?.webContents.send("update:status",{type:"error",message:e.message}))}
app.whenReady().then(()=>{runtimeLoader.register(updates);database.openDatabase();registerData();registerAi();registerReportExport();registerAccess();registerBackup();registerUpdates();createWindow()}).catch(error=>{console.error("IR Project startup:",error);dialog.showErrorBox("Не удалось запустить IR Project","Проверьте файл ir-project.db и обратитесь к администратору.\n\n"+String(error?.message||error));app.quit()});
app.on("before-quit",()=>{ai.engine?.cancel()});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});