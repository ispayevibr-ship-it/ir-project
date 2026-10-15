"use strict";
const {app,BrowserWindow,ipcMain,dialog,Menu,protocol,shell}=require("electron");
const path=require("path"),crypto=require("crypto"),fs=require("fs");
const database=require("./src/database"),aiDocumentStore=require("./src/ai-document-store"),aiLocalEngine=require("./src/ai-local-engine"),aiAnalysis=require("./src/ai-analysis"),aiPdfIndex=require("./src/ai-pdf-index"),aiPdfRenderer=require("./src/ai-pdf-renderer"),aiModelManager=require("./src/ai-model-manager"),aiRuntimeDiagnostics=require("./src/ai-runtime-diagnostics"),backup=require("./src/backup"),updates=require("./src/updater"),runtimeLoader=require("./src/runtime-loader"),imageStore=require("./src/image-store"),companyStore=require("./src/company-store"),reportDocumentStore=require("./src/report-document-store"),marksExcel=require("./src/marks-excel"),registerSectionIpc=require("./src/register-section-ipc");
let win;
const aiDocuments=aiDocumentStore.createStore({getUserDataPath:()=>app.getPath("userData"),dialog,shell,database,getWindow:()=>win});
let aiModels;
const aiEngine=aiLocalEngine.createEngine({
 getUserDataPath:()=>app.getPath("userData"),
 managedModel:{
  inspect:()=>aiModels?.managedRuntime("qwen3-vl-4b")||null,
  resolve:()=>aiModels.resolveRuntime("qwen3-vl-4b")
 }
});
aiModels=aiModelManager.createModelManager({
 getUserDataPath:()=>app.getPath("userData"),dialog,getWindow:()=>win,
 appVersion:()=>require("./package.json").version,
 engineActive:()=>["starting","ready"].includes(aiEngine.status().state),
 onDownloadProgress:point=>{if(win&&!win.isDestroyed())win.webContents.send("ai-models:progress",point)}
});
const aiDiagnostics=aiRuntimeDiagnostics.createDiagnostics({engine:aiEngine});
const modelAdminSessions=new Map();
function checkModelAdmin(event){
 const expires=modelAdminSessions.get(event.sender.id)||0;
 if(Date.now()>expires){modelAdminSessions.delete(event.sender.id);throw Error("Для установки моделей требуется подтверждённая сессия администратора")}
}
const aiRaster=aiPdfRenderer.createPdfRenderer({database,documents:aiDocuments});
const aiResults=aiAnalysis.createAnalysis({database,documents:aiDocuments,engine:aiEngine,pdfRenderer:aiRaster});
const aiPdf=aiPdfIndex.createPdfIndex({database,documents:aiDocuments,
 onProgress:payload=>{if(win&&!win.isDestroyed())win.webContents.send("ai-pdf:progress",payload)}
});
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
 ipcMain.handle("objects:list",()=>database.listObjects());ipcMain.handle("objects:get",(_e,id)=>database.getObject(id));ipcMain.handle("objects:create",(_e,d)=>database.createObject(d));ipcMain.handle("objects:update",(_e,x)=>database.updateObject(x.id,x.data));ipcMain.handle("objects:delete",(_e,id)=>{const ok=database.deleteObject(id);if(ok)aiDocuments.deleteObjectFiles(id);return ok});ipcMain.handle("objects:select-image",(_e,type)=>selectObjectImage(type));ipcMain.handle("images:read",(_e,file)=>imageStore.read(file));ipcMain.handle("images:remove",(_e,file)=>imageStore.remove(file));ipcMain.handle("images:optimize",(_e,{file,type})=>imageStore.optimize(file,type));
 ipcMain.handle("report:select-photo",()=>selectReportPhoto());ipcMain.handle("report:remove-photo",(_e,file)=>imageStore.remove(file));ipcMain.handle("report:select-act",()=>selectReportAct());ipcMain.handle("report:open-document",(_e,file)=>reportDocumentStore.open(file));ipcMain.handle("report:remove-document",(_e,file)=>reportDocumentStore.remove(file));
 ipcMain.handle("marks:select-excel",()=>marksExcel.select(win));ipcMain.handle("marks:save-example",()=>marksExcel.saveExample(win));
 ipcMain.handle("company:get",()=>companyStore.get());ipcMain.handle("company:save",(_e,d)=>companyStore.save(d));ipcMain.handle("company:select-logo",()=>selectCompanyLogo());ipcMain.handle("sections:get",(_e,id)=>database.getSections(id));ipcMain.handle("sections:set",(_e,x)=>database.setSection(x.objectId,x.key,x.enabled));registerSectionIpc(ipcMain,database);ipcMain.handle("entity:list",(_e,x)=>database.listEntity(x.objectId,x.entity));ipcMain.handle("entity:get",(_e,x)=>database.getEntity(x.objectId,x.entity,x.id));ipcMain.handle("entity:create",(_e,x)=>database.createEntity(x.objectId,x.entity,x.data));ipcMain.handle("entity:update",(_e,x)=>database.updateEntity(x.objectId,x.entity,x.id,x.data));ipcMain.handle("entity:delete",(_e,x)=>database.deleteEntity(x.objectId,x.entity,x.id));
}
function registerAiDocuments(){
 ipcMain.handle("ai-documents:list",(_e,id)=>aiDocuments.list(id));
 ipcMain.handle("ai-documents:select",(_e,{objectId,kind})=>aiDocuments.select(objectId,kind));
 ipcMain.handle("ai-documents:open",(_e,{objectId,id})=>aiDocuments.open(objectId,id));
 ipcMain.handle("ai-documents:remove",(_e,{objectId,id})=>aiDocuments.remove(objectId,id));
 ipcMain.handle("ai-engine:status",()=>aiEngine.status());
 ipcMain.handle("ai-engine:start",()=>aiEngine.start());
 ipcMain.handle("ai-engine:stop",()=>aiEngine.stop());
 ipcMain.handle("ai-engine:cancel",()=>aiEngine.cancel());
 ipcMain.handle("ai-analysis:list",(_e,objectId)=>aiResults.list(objectId));
 ipcMain.handle("ai-analysis:image",(_e,{objectId,id})=>aiResults.analyze(objectId,id));
 ipcMain.handle("ai-pdf:list",(_e,objectId)=>aiPdf.list(objectId));
 ipcMain.handle("ai-pdf:index",(_e,{objectId,id})=>aiPdf.index(objectId,id));
 ipcMain.handle("ai-pdf:page",(_e,{objectId,indexId,page})=>aiPdf.page(objectId,indexId,page));
 ipcMain.handle("ai-pdf:preview",(_e,{objectId,id,page})=>aiRaster.preview(objectId,id,page));
 ipcMain.handle("ai-pdf:analyze",(_e,{objectId,id,page})=>aiResults.analyzePdf(objectId,id,page));
}
function registerAiModelIpc(){
 ipcMain.handle("ai-models:info",()=>aiModels.info());
 ipcMain.handle("ai-diagnostics:hardware",()=>aiDiagnostics.hardware());
 ipcMain.handle("ai-diagnostics:status",()=>aiDiagnostics.status());
 ipcMain.handle("ai-diagnostics:smoke-test",(event)=>{
  checkModelAdmin(event);
  return aiDiagnostics.smokeTest()
 });
 ipcMain.handle("ai-diagnostics:start",(event)=>{
  checkModelAdmin(event);
  return aiEngine.start()
 });
 ipcMain.handle("ai-diagnostics:stop",(event)=>{
  checkModelAdmin(event);
  return aiEngine.stop()
 });
 ipcMain.handle("ai-models:check-updates",()=>aiModels.checkUpdates());
 ipcMain.handle("ai-models:authorize",(e,password)=>{
  const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");
  const authorized=crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes.admin));
  if(authorized){modelAdminSessions.set(e.sender.id,Date.now()+10*60*1000);
   e.sender.once("destroyed",()=>modelAdminSessions.delete(e.sender.id))}
  return authorized
 });
 ipcMain.handle("ai-models:select",e=>{checkModelAdmin(e);return aiModels.select()});
 ipcMain.handle("ai-models:install",(e,token)=>{checkModelAdmin(e);return aiModels.install(token)});
 ipcMain.handle("ai-models:rollback",(e,id)=>{checkModelAdmin(e);return aiModels.rollback(id)});
 ipcMain.handle("ai-models:download",(e,{modelId,version})=>{checkModelAdmin(e);return aiModels.download(modelId,version)});
 ipcMain.handle("ai-models:cancel",(e)=>{checkModelAdmin(e);return aiModels.cancelDownload()});
 ipcMain.handle("ai-models:verify-runtime",async(e)=>{
  checkModelAdmin(e);
  const entry=await aiModels.resolveRuntime("qwen3-vl-4b");
  if(!entry)return{installed:false,reason:"Qwen3-VL 4B ещё не установлена"};
  if(!entry.installed)return{installed:false,reason:entry.reason};
  return{installed:true,modelId:entry.modelId,version:entry.version,gpuLayers:entry.gpuLayers,
   bytes:entry.bytes,reason:"Подпись и SHA-256 проверены. Реальная загрузка нейросети — отдельная проверка."}
 });
}
function registerReportExport(){ipcMain.handle("report:export-html",async(_e,{html,defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.html",filters:[{name:"HTML",extensions:["html"]}]});if(r.canceled||!r.filePath)return false;fs.writeFileSync(r.filePath,String(html||""),"utf8");return r.filePath});ipcMain.handle("report:export-pdf",async(e,{defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.pdf",filters:[{name:"PDF",extensions:["pdf"]}]});if(r.canceled||!r.filePath)return false;const pdf=await e.sender.printToPDF({printBackground:true,pageSize:"A4",margins:{top:0.32,bottom:0.32,left:0,right:0}});fs.writeFileSync(r.filePath,pdf);return r.filePath});ipcMain.handle("report:print",e=>new Promise((resolve,reject)=>{e.sender.print({printBackground:true},(ok,error)=>ok?resolve(true):reject(new Error(error||"Печать не выполнена")))}))}
function registerAccess(){ipcMain.handle("access:login",(_e,{role,password})=>{if(role==="guest")return true;if(!roleHashes[role])return false;const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");return crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes[role]))})}
function registerBackup(){ipcMain.handle("backup:create",async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:"ir-project-backup.db",filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePath)return false;backup.createBackup(dbPath(),r.filePath);return true});ipcMain.handle("backup:restore",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"IR Project backup",extensions:["db"]}]});if(r.canceled||!r.filePaths[0])return false;database.closeDatabase();backup.restoreBackup(r.filePaths[0],dbPath());database.openDatabase();return true})}
function registerUpdates(){ipcMain.handle("update:check",()=>updates.check());ipcMain.handle("update:download",()=>updates.download());ipcMain.handle("update:install",()=>updates.install());ipcMain.handle("update:version",()=>updates.installedVersion());updates.updater.on("update-available",i=>win?.webContents.send("update:status",{type:"available",...i}));updates.updater.on("update-not-available",i=>win?.webContents.send("update:status",{type:"current",...i}));updates.updater.on("download-progress",p=>win?.webContents.send("update:status",{type:"progress",percent:Math.round(p.percent),transferred:p.transferred,total:p.total}));updates.updater.on("update-downloaded",i=>win?.webContents.send("update:status",{type:"downloaded",version:i.version}));updates.updater.on("error",e=>win?.webContents.send("update:status",{type:"error",message:e.message}))}
app.whenReady().then(()=>{runtimeLoader.register(updates);database.openDatabase();registerData();registerAiDocuments();registerAiModelIpc();registerReportExport();registerAccess();registerBackup();registerUpdates();createWindow()}).catch(error=>{console.error("IR Project startup:",error);dialog.showErrorBox("Не удалось запустить IR Project","Проверьте файл ir-project.db и обратитесь к администратору.\n\n"+String(error?.message||error));app.quit()});
app.on("before-quit",()=>{aiEngine.stop()});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});