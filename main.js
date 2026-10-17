"use strict";
const {app,BrowserWindow,ipcMain,dialog,Menu,protocol,shell}=require("electron");
const path=require("path"),crypto=require("crypto"),fs=require("fs");
const updates=require("./src/updater");
const schemeReset=require("./src/scheme-reset");

// The first Beta installer provides the trusted loader. Later AI JavaScript
// fixes can be applied from the verified hot package without replacing the exe.
// Keep native Electron bridges, database and updater inside the installer.
function hotAiModule(name){
 const rel="src/"+name+".js",original=path.join(__dirname,rel);
 const resolved=updates.resolveFile(rel);
 if(resolved===original)return require(original);
 try{return require(resolved)}
 catch(error){
  // Malformed or incompatible Beta JavaScript must not prevent app startup.
  console.error("IR Project AI: hot module failed, using bundled "+name+":",error);
  return require(original)
 }
}
const mountingPlacement=hotAiModule("ai-mounting-placement");
const mountingDrafts=hotAiModule("ai-mounting-drafts");
const database=require("./src/database"),aiDocumentStore=hotAiModule("ai-document-store"),aiReview=hotAiModule("ai-review"),aiMarkQuantities=require("./src/ai-mark-quantities"),aiKmdMaterials=require("./src/ai-kmd-materials"),aiKmdConnections=require("./src/ai-kmd-connections"),aiKmKmdCompare=require("./src/ai-km-kmd-compare"),aiAssemblyGeometry=require("./src/ai-assembly-geometry"),aiAssemblyAttachments=require("./src/ai-assembly-attachments"),aiDrawingRevisions=require("./src/ai-drawing-revisions"),aiIntegrityReport=require("./src/ai-integrity-report"),aiCoverageReport=require("./src/ai-kmd-coverage"),aiKmdReference=require("./src/ai-kmd-reference"),aiPdfIndex=require("./src/ai-pdf-index"),aiPdfRenderer=require("./src/ai-pdf-renderer"),completeBackup=require("./src/ai-complete-backup"),backup=require("./src/backup"),runtimeLoader=require("./src/runtime-loader"),imageStore=require("./src/image-store"),companyStore=require("./src/company-store"),reportDocumentStore=require("./src/report-document-store"),marksExcel=require("./src/marks-excel"),registerSectionIpc=require("./src/register-section-ipc");
let win;
const schemeResetService=schemeReset.createReset({database});
const aiDocuments=aiDocumentStore.createStore({getUserDataPath:()=>app.getPath("userData"),dialog,shell,database,getWindow:()=>win});
const mountingPlacementService=mountingPlacement.createService({
 database,verifyDocument:(objectId,documentId)=>aiDocuments.verify(objectId,documentId)
});
const mountingDraftService=mountingDrafts.createDraftService({
 database,verifyDocument:(objectId,documentId)=>aiDocuments.verify(objectId,documentId)
});
const aiPdfGeometry=hotAiModule("ai-pdf-geometry").createPdfGeometry({
 database,documents:aiDocuments,
 resolveWorker:()=>updates.resolveFile("src/ai-pdf-vector-worker.js"),
 pdfjsModuleUrl:require("node:url").pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href
});
// Destructive PDF operations resolve the active, checksum-verified module at call
// time rather than using a store captured before a hot update was installed.
const aiDocumentDeletion=require("./src/ai-document-hot-loader").createGuard({
 updates,appRoot:__dirname,getUserDataPath:()=>app.getPath("userData"),
 database,dialog,shell,getWindow:()=>win
});
const aiPdf=aiPdfIndex.createPdfIndex({database,documents:aiDocuments,
 onProgress:payload=>{if(win&&!win.isDestroyed())win.webContents.send("ai-pdf:progress",payload)}
});
const aiRevisions=aiDrawingRevisions.createDrawingRevisions({database,documents:aiDocuments,pdfIndex:aiPdf});
const aiRaster=aiPdfRenderer.createPdfRenderer({database,documents:aiDocuments});
const aiReviews=aiReview.createAiReview({database,revisions:aiRevisions});
// Historical neural proposals remain unmodified in SQLite and backups, but
// are not loaded, generated, edited, or exposed by the model-free application.
const archivedProposalView=Object.freeze({list:()=>[]});
const aiQuantities=aiMarkQuantities.createMarkQuantities({database,revisions:aiRevisions});
const aiMaterials=aiKmdMaterials.createKmdMaterials({database,quantities:aiQuantities,revisions:aiRevisions});
const aiConnections=aiKmdConnections.createKmdConnections({database,quantities:aiQuantities,revisions:aiRevisions});
const aiComparisons=aiKmKmdCompare.createKmKmdCompare({database,revisions:aiRevisions});
const aiAssemblies=aiAssemblyGeometry.createAssemblyGeometry({database,quantities:aiQuantities,materials:aiMaterials,revisions:aiRevisions});
const aiAttachments=aiAssemblyAttachments.createAssemblyAttachments({database,assemblies:aiAssemblies,connections:aiConnections,revisions:aiRevisions});
// Local/offline AI mode: the application owner requested NO password prompts
// or expiring engineer sessions anywhere in the AI workflow. Keep the
// role-shaped context only for legacy persistence/audit contracts; it is not
// evidence that a licensed engineer reviewed the drawing. Actual placement
// still requires explicit on-screen confirmation and source/grid validation.
// Backup/restore administrator authorization remains a separate safeguard.
const LOCAL_AI_CONTEXT=Object.freeze({role:"engineer",authMethod:"local_app_user"});
function currentAiRole(){return true}
function authorizeAiReview(){return true}
function requireAiReviewer(){return LOCAL_AI_CONTEXT}
const aiReference=aiKmdReference.createKmdReference({
 database,revisions:aiRevisions,quantities:aiQuantities,materials:aiMaterials,
 connections:aiConnections
});
const aiCoverage=aiCoverageReport.createAiCoverage({
 database,quantities:aiQuantities,materials:aiMaterials,connections:aiConnections,
 assemblies:aiAssemblies,attachments:aiAttachments,proposals:archivedProposalView
});
const aiIntegrity=aiIntegrityReport.createAiIntegrity({
 database,documents:aiDocuments,pdfIndex:aiPdf,revisions:aiRevisions,
 review:aiReviews,workflow:{list:()=>[],summary:()=>({total:0,byStatus:{},isRunning:false})},proposals:archivedProposalView,quantities:aiQuantities,
 materials:aiMaterials,connections:aiConnections,comparisons:aiComparisons,
 assemblies:aiAssemblies,attachments:aiAttachments,coverage:aiCoverage,reference:aiReference
});
const dbPath=()=>path.join(app.getPath("userData"),"ir-project.db");
const roleHashes={admin:crypto.createHash("sha256").update("333111").digest("hex"),engineer:crypto.createHash("sha256").update("000000").digest("hex")};
const accessSessions=new Map();
function requireBackupAdmin(e){
 const session=accessSessions.get(e.sender.id);
 if(!session||session.role!=="admin"||session.expiresAt<=Date.now()){
  accessSessions.delete(e.sender.id);
  throw Error("Создание и восстановление резервных копий требует повторного подтверждения администратора")
 }
}
protocol.registerSchemesAsPrivileged([{scheme:"irapp",privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
function createWindow(){Menu.setApplicationMenu(null);win=new BrowserWindow({width:1280,height:800,icon:path.join(__dirname,"assets","icon.ico"),autoHideMenuBar:true,titleBarStyle:"hidden",titleBarOverlay:{color:"#f7f7f7",symbolColor:"#1f2937",height:38},webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false}});win.setMenuBarVisibility(false);win.loadURL("irapp://app/src/index.html")}
async function chooseImage(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Images",extensions:["png","jpg","jpeg","webp"]}]});return r.canceled||!r.filePaths[0]?"":r.filePaths[0]}
async function selectObjectImage(type){const file=await chooseImage();return file?imageStore.saveObject(file,type==="banner"?"banner":"cover"):""}
async function selectCompanyLogo(){const file=await chooseImage();return file?imageStore.saveLogo(file):""}
async function selectReportPhoto(){const file=await chooseImage();return file?imageStore.saveReport(file):""}
async function selectReportAct(){const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Подписанный акт",extensions:["pdf","png","jpg","jpeg"]}]});if(r.canceled||!r.filePaths[0])return null;return reportDocumentStore.save(r.filePaths[0])}
function protectAiRecords(section){
 // Dedicated AI IPC performs role checks, source validation and transaction/audit writes.
 // Legacy generic CRUD must never bypass those invariants, even for an admin session.
 if(typeof section==="string"&&section.toLowerCase().startsWith("ai-"))
  throw Error("Записи IR Project AI изменяются только через инженерную проверку соответствующего модуля");
}
function registerData(){
 ipcMain.handle("objects:list",()=>database.listObjects());ipcMain.handle("objects:get",(_e,id)=>database.getObject(id));ipcMain.handle("objects:create",(_e,d)=>database.createObject(d));ipcMain.handle("objects:update",(_e,x)=>database.updateObject(x.id,x.data));ipcMain.handle("objects:delete",(_e,id)=>{const ok=database.deleteObject(id);if(ok)aiDocuments.deleteObjectFiles(id);return ok});ipcMain.handle("objects:select-image",(_e,type)=>selectObjectImage(type));ipcMain.handle("images:read",(_e,file)=>imageStore.read(file));ipcMain.handle("images:remove",(_e,file)=>imageStore.remove(file));ipcMain.handle("images:optimize",(_e,{file,type})=>imageStore.optimize(file,type));
 ipcMain.handle("report:select-photo",()=>selectReportPhoto());ipcMain.handle("report:remove-photo",(_e,file)=>imageStore.remove(file));ipcMain.handle("report:select-act",()=>selectReportAct());ipcMain.handle("report:open-document",(_e,file)=>reportDocumentStore.open(file));ipcMain.handle("report:remove-document",(_e,file)=>reportDocumentStore.remove(file));
 ipcMain.handle("marks:select-excel",()=>marksExcel.select(win));ipcMain.handle("marks:save-example",()=>marksExcel.saveExample(win));
 ipcMain.handle("company:get",()=>companyStore.get());ipcMain.handle("company:save",(_e,d)=>companyStore.save(d));ipcMain.handle("company:select-logo",()=>selectCompanyLogo());ipcMain.handle("sections:get",(_e,id)=>database.getSections(id));ipcMain.handle("sections:set",(_e,x)=>database.setSection(x.objectId,x.key,x.enabled));registerSectionIpc(ipcMain,database);ipcMain.handle("entity:list",(_e,x)=>database.listEntity(x.objectId,x.entity));ipcMain.handle("entity:get",(_e,x)=>database.getEntity(x.objectId,x.entity,x.id));ipcMain.handle("entity:create",(_e,x)=>{protectAiRecords(x?.entity);return database.createEntity(x.objectId,x.entity,x.data)});ipcMain.handle("entity:update",(_e,x)=>{protectAiRecords(x?.entity);return database.updateEntity(x.objectId,x.entity,x.id,x.data)});ipcMain.handle("entity:delete",(_e,x)=>{protectAiRecords(x?.entity);return database.deleteEntity(x.objectId,x.entity,x.id)});
}
function registerAiDocuments(){
 ipcMain.handle("scheme:reset-preview",(e,objectId)=>{
  requireAiReviewer(e);
  return schemeResetService.snapshot(objectId)
 });
 ipcMain.handle("scheme:reset",(e,{objectId,expectedCount,expectedFingerprint,confirmation})=>{
  requireAiReviewer(e);
  return schemeResetService.clear(objectId,{expectedCount,expectedFingerprint,confirmation})
 });
 ipcMain.handle("ai-pdf:geometry",(e,{objectId,documentId,page})=>{
  requireAiReviewer(e);
  return aiPdfGeometry.page(objectId,documentId,page)
 });
 ipcMain.handle("ai-mounting:drafts",(e,objectId)=>{
  requireAiReviewer(e);return mountingDraftService.list(objectId)
 });
 ipcMain.handle("ai-mounting:save-draft",(e,{objectId,candidate,values,expectedRevision})=>{
  requireAiReviewer(e);
  return mountingDraftService.save(objectId,{candidate,values,expectedRevision})
 });
 ipcMain.handle("ai-mounting:preview",(e,{objectId,entries})=>{
  requireAiReviewer(e);
  return mountingPlacementService.preview(objectId,entries)
 });
 ipcMain.handle("ai-mounting:apply",(e,{objectId,entries,token})=>{
  const auth=requireAiReviewer(e);
  if(!["admin","engineer"].includes(auth.role))throw Error("Недостаточно прав для расстановки");
  return mountingPlacementService.apply(objectId,entries,token)
 });
 ipcMain.handle("ai-mounting:inventory",(e,objectId)=>{
  requireAiReviewer(e);return mountingPlacementService.inventory(objectId)
 });
 ipcMain.handle("ai-mounting:last",(e,objectId)=>{
  requireAiReviewer(e);
  return mountingPlacementService.latest(objectId)
 });
 ipcMain.handle("ai-mounting:undo",(e,{objectId,operationId})=>{
  requireAiReviewer(e);
  return mountingPlacementService.undo(objectId,operationId)
 });
 ipcMain.handle("ai-documents:list",(_e,id)=>aiDocuments.list(id));
 ipcMain.handle("ai-documents:select",(e,{objectId,kind})=>{requireAiReviewer(e);return aiDocuments.select(objectId,kind)});
 ipcMain.handle("ai-documents:open",(_e,{objectId,id})=>aiDocuments.open(objectId,id));
 ipcMain.handle("ai-documents:impact",(e,{objectId,id})=>{
  requireAiReviewer(e);
  return aiDocumentDeletion.removalImpact(objectId,id)
 });
 // Archive updates only source-document visibility; all engineering evidence,
 // historic decision records and original bytes remain intact.
 ipcMain.handle("ai-documents:archive",(e,{objectId,id})=>{
  requireAiReviewer(e);
  if(aiPdf.busy()||aiRaster.busy())
   throw Error("Дождитесь завершения обработки чертежей перед архивированием PDF");
  return aiDocumentDeletion.archive(objectId,id)
 });
 ipcMain.handle("ai-documents:restore",(e,{objectId,id})=>{
  requireAiReviewer(e);
  if(aiPdf.busy()||aiRaster.busy())
   throw Error("Дождитесь завершения обработки чертежей перед восстановлением PDF");
  return aiDocumentDeletion.restore(objectId,id)
 });
 ipcMain.handle("ai-documents:remove",(e,{objectId,id,discardUnreviewed=false,expectedAnalysisIds=[]})=>{
  requireAiReviewer(e);
  // A source cannot be removed during any ongoing indexing, rendering or inference.
  if(aiPdf.busy()||aiRaster.busy())
   throw Error("Сейчас выполняется обработка чертежей. Дождитесь её окончания перед удалением PDF.");
  const linked=aiRevisions.list(objectId).find(set=>set.sheets.some(s=>Number(s.documentId)===Number(id)));
  if(linked)throw Error("Исходный PDF входит в комплект КМ/КМД «"+linked.label+
   "» (включая историю). Удаление нарушит проверяемость ревизий; сохраните оригинал.");
  return aiDocumentDeletion.remove(objectId,id,{discardUnreviewed,expectedAnalysisIds})
 });
 ipcMain.handle("ai-review:list",(_e,objectId)=>aiReviews.list(objectId));
 ipcMain.handle("ai-review:register",(_e,objectId)=>aiReviews.register(objectId));
 ipcMain.handle("ai-review:history",(_e,{objectId,id})=>aiReviews.history(objectId,id));
 ipcMain.handle("ai-review:session",(e,role)=>currentAiRole(e,role));
 ipcMain.handle("ai-review:authorize",(e,{role,password})=>authorizeAiReview(e,role,password));
 ipcMain.handle("ai-review:save",(e,{objectId,id,review})=>
  aiReviews.confirm(objectId,id,review,requireAiReviewer(e)));
 ipcMain.handle("ai-quantities:list",(_e,objectId)=>aiQuantities.list(objectId));
 ipcMain.handle("ai-quantities:summary",(_e,objectId)=>aiQuantities.summary(objectId));
 ipcMain.handle("ai-quantities:history",(_e,{objectId,id})=>aiQuantities.history(objectId,id));
 ipcMain.handle("ai-quantities:save",(e,{objectId,id,entry})=>
  aiQuantities.save(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-materials:list",(_e,objectId)=>aiMaterials.list(objectId));
 ipcMain.handle("ai-materials:summary",(_e,objectId)=>aiMaterials.summary(objectId));
 ipcMain.handle("ai-materials:history",(_e,{objectId,id})=>aiMaterials.history(objectId,id));
 ipcMain.handle("ai-materials:save",(e,{objectId,id,entry})=>
  aiMaterials.save(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-connections:nodes",(_e,objectId)=>aiConnections.listNodes(objectId));
 ipcMain.handle("ai-connections:items",(_e,objectId)=>aiConnections.listComponents(objectId));
 ipcMain.handle("ai-connections:summary",(_e,objectId)=>aiConnections.summary(objectId));
 ipcMain.handle("ai-connections:history",(_e,{objectId,type,id})=>
  aiConnections.history(objectId,type,id));
 ipcMain.handle("ai-connections:save-node",(e,{objectId,id,entry})=>
  aiConnections.saveNode(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-connections:save-item",(e,{objectId,id,entry})=>
  aiConnections.saveComponent(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-compare:list",(_e,objectId)=>aiComparisons.list(objectId));
 ipcMain.handle("ai-compare:summary",(_e,objectId)=>aiComparisons.summary(objectId));
 ipcMain.handle("ai-compare:history",(_e,{objectId,id})=>aiComparisons.history(objectId,id));
 ipcMain.handle("ai-compare:fields",()=>aiComparisons.fields);
 ipcMain.handle("ai-compare:save",(e,{objectId,id,entry})=>
  aiComparisons.save(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-assembly:list",(_e,{objectId,assemblyId})=>
  aiAssemblies.list(objectId,assemblyId));
 ipcMain.handle("ai-assembly:summary",(_e,{objectId,assemblyId})=>
  aiAssemblies.summary(objectId,assemblyId));
 ipcMain.handle("ai-assembly:history",(_e,{objectId,id})=>aiAssemblies.history(objectId,id));
 ipcMain.handle("ai-assembly:save",(e,{objectId,id,entry})=>
  aiAssemblies.save(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-integrity:report",(_e,objectId)=>aiIntegrity.report(objectId));
 ipcMain.handle("ai-kmd-reference:snapshot",(_e,objectId)=>aiReference.snapshot(objectId));
 ipcMain.handle("ai-kmd-reference:list",(_e,objectId)=>aiReference.list(objectId));
 ipcMain.handle("ai-kmd-reference:checks",(_e,objectId)=>aiReference.checks(objectId));
 ipcMain.handle("ai-kmd-reference:compare",(_e,objectId)=>aiReference.compare(objectId));
 ipcMain.handle("ai-kmd-reference:history",(_e,{objectId,id})=>aiReference.history(objectId,id));
 ipcMain.handle("ai-kmd-reference:save",(e,{objectId,id,entry})=>
  aiReference.save(objectId,id??null,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-kmd-reference:seal",(e,{objectId,sheetId,expectedRevision,confirmation})=>
  aiReference.seal(objectId,sheetId,expectedRevision,confirmation,requireAiReviewer(e)));
 ipcMain.handle("ai-revisions:list",(_e,objectId)=>aiRevisions.list(objectId));
 ipcMain.handle("ai-revisions:impact",(_e,objectId)=>aiRevisions.impact(objectId));
 ipcMain.handle("ai-revisions:preview",(_e,{objectId,setId})=>aiRevisions.previewActivation(objectId,setId));
 ipcMain.handle("ai-revisions:history",(_e,{objectId,setId})=>aiRevisions.history(objectId,setId));
 ipcMain.handle("ai-revisions:create",(e,{objectId,entry})=>
  aiRevisions.createSet(objectId,entry,requireAiReviewer(e)));
 ipcMain.handle("ai-revisions:add-sheets",(e,{objectId,setId,entries})=>
  aiRevisions.addSheets(objectId,setId,entries,requireAiReviewer(e)));
 ipcMain.handle("ai-revisions:remove-sheet",(e,{objectId,setId,sheetId})=>
  aiRevisions.removeSheet(objectId,setId,sheetId,requireAiReviewer(e)));
 ipcMain.handle("ai-revisions:activate",(e,{objectId,setId,expectedRevision})=>
  aiRevisions.activate(objectId,setId,expectedRevision,requireAiReviewer(e)));
 ipcMain.handle("ai-attachment:list",(_e,{objectId,assemblyId})=>aiAttachments.list(objectId,assemblyId));
 ipcMain.handle("ai-attachment:summary",(_e,{objectId,assemblyId})=>aiAttachments.summary(objectId,assemblyId));
 ipcMain.handle("ai-attachment:history",(_e,{objectId,id})=>aiAttachments.history(objectId,id));
 ipcMain.handle("ai-attachment:save",(e,{objectId,id,entry})=>
  aiAttachments.save(objectId,id??null,entry,requireAiReviewer(e)));

 ipcMain.handle("ai-pdf:list",(_e,objectId)=>aiPdf.list(objectId));
 ipcMain.handle("ai-pdf:index",(e,{objectId,id})=>{requireAiReviewer(e);return aiPdf.index(objectId,id)});
 ipcMain.handle("ai-pdf:page",(_e,{objectId,indexId,page,allowedMarks})=>aiPdf.page(objectId,indexId,page,allowedMarks));
 ipcMain.handle("ai-pdf:preview",(_e,{objectId,id,page})=>aiRaster.preview(objectId,id,page));
 ipcMain.handle("ai-pdf:region-preview",(_e,{objectId,id,page,region})=>aiRaster.regionPreview(objectId,id,page,region));
 
}
function registerReportExport(){ipcMain.handle("report:export-html",async(_e,{html,defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.html",filters:[{name:"HTML",extensions:["html"]}]});if(r.canceled||!r.filePath)return false;fs.writeFileSync(r.filePath,String(html||""),"utf8");return r.filePath});ipcMain.handle("report:export-pdf",async(e,{defaultName}={})=>{const r=await dialog.showSaveDialog(win,{defaultPath:defaultName||"daily-report.pdf",filters:[{name:"PDF",extensions:["pdf"]}]});if(r.canceled||!r.filePath)return false;const pdf=await e.sender.printToPDF({printBackground:true,pageSize:"A4",margins:{top:0.32,bottom:0.32,left:0,right:0}});fs.writeFileSync(r.filePath,pdf);return r.filePath});ipcMain.handle("report:print",e=>new Promise((resolve,reject)=>{e.sender.print({printBackground:true},(ok,error)=>ok?resolve(true):reject(new Error(error||"Печать не выполнена")))}))}
function registerAccess(){ipcMain.handle("access:login",(e,{role,password})=>{
 if(role==="guest"){accessSessions.delete(e.sender.id);return true}
 if(!roleHashes[role])return false;
 const hash=crypto.createHash("sha256").update(String(password||"")).digest("hex");
 const valid=crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(roleHashes[role]));
 if(valid){
  accessSessions.set(e.sender.id,{role,expiresAt:Date.now()+EDITOR_SESSION_MS});
  e.sender.once("destroyed",()=>accessSessions.delete(e.sender.id))
 }else accessSessions.delete(e.sender.id);
 return valid
 });
 ipcMain.handle("access:logout",e=>{accessSessions.delete(e.sender.id);aiReviewSessions.delete(e.sender.id);return true})
}
function registerBackup(){
 let active=false;
 const locked=async task=>{
  if(active)throw Error("Резервная копия уже обрабатывается");
  active=true;
  try{return await task()}finally{active=false}
 };
 ipcMain.handle("backup:create",e=>{requireBackupAdmin(e);return locked(async()=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:"ir-project-complete.ir-backup",
   filters:[{name:"Полный архив IR Project (база, чертежи, фотографии и акты)",extensions:["ir-backup"]}]});
  if(r.canceled||!r.filePath)return false;
  requireBackupAdmin(e);
  await completeBackup.pack({userData:app.getPath("userData"),destination:r.filePath,
   closeDatabase:database.closeDatabase,openDatabase:database.openDatabase});
  return true
 })});
 ipcMain.handle("backup:restore",e=>{requireBackupAdmin(e);return locked(async()=>{
  const r=await dialog.showOpenDialog(win,{properties:["openFile"],
   filters:[{name:"Полный архив IR Project",extensions:["ir-backup"]}]});
  if(r.canceled||!r.filePaths[0])return false;
  const answer=await dialog.showMessageBox(win,{type:"warning",buttons:["Отмена","Восстановить"],
   defaultId:0,cancelId:0,title:"Восстановление IR Project",
   message:"Будут восстановлены база данных, оригиналы КМ/КМД, фотографии и акты.",
   detail:"Сначала архив будет проверен. Рекомендуется сохранить отдельную текущую копию перед восстановлением."});
  if(answer.response!==1)return false;
  requireBackupAdmin(e);
  await completeBackup.restore({archive:r.filePaths[0],userData:app.getPath("userData"),
   closeDatabase:database.closeDatabase,openDatabase:database.openDatabase});
  return true
 })});
 // Prior .db files are preserved for manual migration and archival purposes,
 // but they are not mislabeled as complete backups that include source PDF.
 ipcMain.handle("backup:create-legacy-db",e=>{requireBackupAdmin(e);return locked(async()=>{
  const r=await dialog.showSaveDialog(win,{defaultPath:"ir-project-database-only.db",
   filters:[{name:"Только SQLite (без КМД и вложений)",extensions:["db"]}]});
  if(r.canceled||!r.filePath)return false;
  database.closeDatabase();
  try{backup.createBackup(dbPath(),r.filePath)}
  finally{database.openDatabase()}
  return true
 })})
}
function registerUpdates(){ipcMain.handle("update:check",()=>updates.check());ipcMain.handle("update:download",()=>updates.download());ipcMain.handle("update:rollback",()=>updates.rollback());ipcMain.handle("update:install",()=>updates.install());ipcMain.handle("update:version",()=>updates.installedVersion());updates.updater.on("update-available",i=>win?.webContents.send("update:status",{type:"available",...i}));updates.updater.on("update-not-available",i=>win?.webContents.send("update:status",{type:"current",...i}));updates.updater.on("download-progress",p=>win?.webContents.send("update:status",{type:"progress",percent:Math.round(p.percent),transferred:p.transferred,total:p.total}));updates.updater.on("update-downloaded",i=>win?.webContents.send("update:status",{type:"downloaded",version:i.version}));updates.updater.on("error",e=>win?.webContents.send("update:status",{type:"error",message:e.message}))}
app.whenReady().then(()=>{runtimeLoader.register(updates);database.openDatabase();registerData();registerAiDocuments();registerReportExport();registerAccess();registerBackup();registerUpdates();createWindow()}).catch(error=>{console.error("IR Project startup:",error);dialog.showErrorBox("Не удалось запустить IR Project","Проверьте файл ir-project.db и обратитесь к администратору.\n\n"+String(error?.message||error));app.quit()});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit()});