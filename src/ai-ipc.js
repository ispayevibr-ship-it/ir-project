"use strict";
/*
 * IR Project AI: main-process services and their IPC channels in one place, so that they can
 * arrive with a hot update together with the renderer. main.js keeps the admin password check.
 * API: the contract with main.js; a hot update with another number is not loaded.
 */
const API=1;
// A failure to start (a module of the update that does not load here) is written to userData/ai-hot-error.txt before
// main.js falls back to the installed modules — otherwise it is seen nowhere.
function register(deps){
 try{return registerAll(deps)}
 catch(error){
  try{const fs=require("node:fs"),path=require("node:path");
   fs.writeFileSync(path.join(deps.getUserDataPath(),"ai-hot-error.txt"),new Date().toISOString()+"\n"+__filename+"\nnode "+process.versions.node+", electron "+(process.versions.electron||"?")+"\n"+String(error?.stack||error),"utf8")}catch(_e){}
  throw error
 }
}
function registerAll({ipcMain,getUserDataPath,safeStorage,netFetch,dialog,shell,database,getWindow,checkAdmin}){
 const {createStore}=require("./ai-document-store");
 const {createEngine}=require("./ai-claude-engine");
 const {createPdfRenderer}=require("./ai-pdf-renderer");
 const {createSchemeDrafts}=require("./ai-scheme-draft");
 const {createMontage}=require("./ai-montage");
 const {createKnowledge}=require("./ai-knowledge");
 const {createKnowledgeBase}=require("./ai-knowledge-base");
 const {createGithubSync}=require("./ai-github-sync");
 const {createTraining}=require("./ai-training");
 try{require("node:fs").rmSync(require("node:path").join(getUserDataPath(),"ai-hot-error.txt"),{force:true})}catch(_e){}
 const documents=createStore({getUserDataPath,dialog,shell,database,getWindow});
 const engine=createEngine({getUserDataPath,safeStorage,fetch:netFetch});
 const raster=createPdfRenderer({database,documents});
 const knowledge=createKnowledge({getUserDataPath});
 // The abbreviations learned from Claude's processing are written out on every sheet before it is read.
 const drafts=createSchemeDrafts({database,documents,aliases:()=>knowledge.aliases()});
 const base=createKnowledgeBase({getUserDataPath});
 // The engineer's own structure types join the catalog before anything is read or sent to Claude.
 try{knowledge.list()}catch(error){console.warn("IR Project: engineer's types not loaded",error)}
 // What this computer learned goes to the repository (knowledge/inbox/) when the administrator gave a token.
 const github=createGithubSync({getUserDataPath,safeStorage,fetch:netFetch});
 github.startHourly();
 // The data of the drawings come from the closed repository (knowledge/data.json) into userData/knowledge-data: at the
 // start and every hour; the knowledge base reads them before the open knowledge of the update.
 const dataDir=require("node:path").join(getUserDataPath(),"knowledge-data");
 require("./ai-knowledge-dirs").setDataDir(dataDir);
 const pullData=()=>github.pullData({dir:dataDir}).catch(error=>console.warn("IR Project: data of the drawings not pulled",error.message));
 setTimeout(pullData,15e3).unref?.();setInterval(pullData,3600e3).unref?.();
 // What runs in the main process: the version of the update these modules came from and when they started.
 const startedAt=new Date().toISOString();
 const hotVersion=()=>{try{return JSON.parse(require("node:fs").readFileSync(require("node:path").join(__dirname,"..","hot-manifest.json"),"utf8")).version||""}catch{return"установленная"}};
 // What the engineer changed after a placement and the schemes confirmed as right: examples for the next analysis.
 const training=createTraining({database,getUserDataPath,base});
 // A placement writes thousands of rows: in one transaction, not one disk wait per row.
 const writes=require("./ai-db-batch").createBatch({getUserDataPath,database});
 const montage=createMontage({database,documents,drafts,renderer:raster,engine,knowledge,base,training,writes,
  onProgress:payload=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send("ai-montage:progress",payload)}});
 // The installed preload passes only ai-documents/engine/settings/montage channels: knowledge, GitHub and diagnostics
 // are also served as ai-settings:<group>-<name> (see aiChannel in the windows), so a hot update reaches them.
 const handle=(channel,fn)=>{ipcMain.handle(channel,fn);const m=/^ai-(knowledge|github|diag):([a-z-]+)$/.exec(channel);if(m)ipcMain.handle("ai-settings:"+m[1]+"-"+m[2],fn)};
 handle("ai-documents:list",(_e,id)=>documents.list(id));
 handle("ai-documents:select",(_e,{objectId,kind})=>documents.select(objectId,kind));
 handle("ai-documents:open",(_e,{objectId,id})=>documents.open(objectId,id));
 handle("ai-documents:remove",(_e,{objectId,id})=>documents.remove(objectId,id));
 handle("ai-documents:set-kinds",(_e,{objectId,items})=>documents.setKinds(objectId,items));
 handle("ai-documents:set-excluded",(_e,{objectId,id,pages})=>documents.setExcluded(objectId,id,pages));
 handle("ai-documents:sheets",(_e,{objectId,id})=>montage.documentSheets(objectId,id));
 handle("ai-documents:preview",(_e,{objectId,id,page})=>raster.preview(objectId,id,page));
 handle("ai-engine:status",()=>engine.status());
 handle("ai-engine:start",()=>engine.start());
 handle("ai-settings:info",()=>engine.settings());
 // Changing the key or the model needs a confirmed admin session (checked in main.js).
 handle("ai-settings:set-key",(e,{key,model}={})=>{checkAdmin(e);return engine.setKey(key,model)});
 handle("ai-settings:set-model",(e,model)=>{checkAdmin(e);return engine.setModel(model)});
 handle("ai-settings:clear-key",e=>{checkAdmin(e);return engine.clearKey()});
 handle("ai-settings:set-provider",(e,provider)=>{checkAdmin(e);return engine.setProvider(provider)});
 handle("ai-settings:test",()=>engine.start());
 // The montage scheme for the iPhone (src/scheme-export-usdz.js): a binary file, which report:export-html cannot write;
 // an ai-settings channel, so the installed preload passes it.
 handle("ai-settings:export-usdz",async(_e,{bytes,defaultName}={})=>{
  if(!(bytes instanceof Uint8Array)||!bytes.length)throw new Error("Нет данных модели");
  const win=getWindow(),r=await dialog.showSaveDialog(win&&!win.isDestroyed()?win:undefined,{defaultPath:String(defaultName||"Монтажная схема.usdz"),filters:[{name:"3D для iPhone (USDZ)",extensions:["usdz"]}]});
  if(r.canceled||!r.filePath)return false;
  require("node:fs").writeFileSync(r.filePath,Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));return r.filePath
 });
 handle("ai-montage:latest",(_e,objectId)=>montage.latest(objectId));
 handle("ai-montage:analyze",(_e,{objectId,documentIds})=>montage.analyze(objectId,documentIds));
 handle("ai-montage:process",async(_e,{objectId,draftId,restart,comment})=>{const r=await montage.process(objectId,draftId,{restart:restart===true,comment:typeof comment==="string"?comment:undefined});github.schedule("ответ Claude");return r});
 handle("ai-montage:skip-ai",(_e,{objectId,draftId})=>montage.skipAI(objectId,draftId));
 handle("ai-montage:preview",(_e,{objectId,draftId,heights})=>montage.preview(objectId,draftId,heights));
 handle("ai-montage:place",(_e,{objectId,draftId,heights})=>montage.place(objectId,draftId,heights));
 handle("ai-montage:undo",(_e,{objectId,draftId})=>montage.undo(objectId,draftId));
 handle("ai-montage:clear-scheme",(_e,{objectId,grid}={})=>montage.clearScheme(objectId,{grid:grid===true}));
 handle("ai-montage:restore-scheme",(_e,{objectId}={})=>montage.restoreScheme(objectId));
 handle("ai-montage:journal-add",(_e,{objectId,elementId,comment,objectName}={})=>training.journalAdd(objectId,{elementId,comment,objectName}));
 handle("ai-montage:journal-list",(_e,{objectId,limit}={})=>({...training.journalList({objectId,limit}),github:github.info()}));
 handle("ai-montage:journal-send",()=>github.push({reason:"журнал, вручную"}));
 handle("ai-montage:training",(_e,{objectId}={})=>{const r=training.status(objectId);return{...r,base:base.stats?base.stats():null}});
 handle("ai-montage:confirm-scheme",(_e,{objectId,note}={})=>{const r=training.confirmScheme(objectId,{note});github.schedule("схема проверена инженером");return r});
 handle("ai-montage:scheme-snapshot",(_e,{objectId}={})=>montage.schemeSnapshot(objectId));
 handle("ai-montage:element-card",(_e,{objectId,key,mark,volume}={})=>montage.elementCard(objectId,{key,mark,volume}));
 // What the program learned from the engineer: structure types of marks, notes (src/ai-knowledge.js).
 handle("ai-knowledge:list",()=>knowledge.list());
 handle("ai-knowledge:types",()=>{knowledge.list();const ST=require("./ai-structure-types");return ST.TYPES.map(t=>({key:t.key,name:t.name,group:t.group,groupName:ST.group(t.group).label,user:Boolean(t.user)}))});
 handle("ai-knowledge:groups",()=>require("./ai-structure-types").GROUPS.map(g=>({key:g.key,label:g.label})));
 handle("ai-knowledge:set-type",(_e,rule={})=>{const r=knowledge.setType(rule);github.schedule("обучение инженера");return r});
 handle("ai-knowledge:add-note",(_e,{text}={})=>{const r=knowledge.addNote(text);github.schedule("заметка инженера");return r});
 handle("ai-knowledge:remove",(_e,{id}={})=>{const r=knowledge.remove(id);github.schedule("обучение инженера");return r});
 handle("ai-knowledge:add-type",(_e,type={})=>{const r=knowledge.addType(type);github.schedule("новый вид конструкции");return r});
 handle("ai-diag:info",()=>({version:hotVersion(),startedAt,file:__filename}));
 handle("ai-github:info",()=>github.info());
 handle("ai-github:set",(e,v={})=>{if(v.token!==undefined||v.repo!==undefined||v.branch!==undefined||v.auto!==undefined)checkAdmin(e);return github.set(v)});
 handle("ai-github:clear-token",e=>{checkAdmin(e);return github.clearToken()});
 handle("ai-github:test",()=>github.test());
 handle("ai-github:push",()=>github.push({reason:"вручную"}));
 // The engineer's chat with Claude: a screenshot of the window first (the panel hidden), then the message with it.
 const chat=require("./ai-chat").createChat({getUserDataPath,safeStorage,fetch:netFetch,version:hotVersion,github});
 handle("ai-montage:chat-list",()=>chat.list());
 handle("ai-montage:chat-shot-take",async e=>{
  const img=await e.sender.capturePage(),size=img.getSize(),k=Math.min(1,1600/Math.max(1,size.width));
  return{shotId:chat.keepShot((k<1?img.resize({width:Math.round(size.width*k),quality:"good"}):img).toJPEG(72))}
 });
 handle("ai-montage:chat-shot",(_e,{id}={})=>chat.shot(String(id||"")));
 handle("ai-montage:chat-send",(_e,v={})=>chat.send(v));
 handle("ai-montage:chat-retry",(_e,v={})=>chat.retry(v));
 handle("ai-montage:chat-sync",()=>chat.sync());
 handle("ai-montage:chat-seen",()=>chat.markSeen());
 handle("ai-montage:chat-link",(_e,v={})=>chat.setLink(v));
 handle("ai-montage:chat-unlink",()=>chat.clearLink());
 handle("ai-montage:chat-journal",()=>chat.journal());
 // The page of the task on claude.ai, where its key is made: only that site opens from the chat.
 handle("ai-montage:chat-open",(_e,{url}={})=>{const u=String(url||chat.link().page);if(!/^https:\/\/claude\.ai\//.test(u))throw Error("Открывается только claude.ai");return shell.openExternal(u)});
 handle("ai-knowledge:base",()=>base.all().map(e=>({id:e.id,title:e.title,project:e.project,files:e.files.length,origin:e.origin,source:e.source,created:e.created})));
 return{documents,engine}
}
module.exports={API,register};
