"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const profile=fs.readFileSync("src/profile-ui.js","utf8");
const main=fs.readFileSync("main.js","utf8");
const preload=fs.readFileSync("preload.js","utf8");
const runtime=fs.readFileSync("src/ir-runtime.js","utf8");
const tabsCSS=fs.readFileSync("src/tabs-shell.css","utf8");
const standaloneCSS=fs.readFileSync("src/object-shell.css","utf8");
assert(profile.includes('id="programExportDatabase"'));
assert(profile.includes('База, чертежи КМ/КМД, фото и акты · .ir-backup'));
assert(profile.includes('id="programRestoreBackup"'));
assert(profile.includes("const backupIcon=menuIcon("));
assert(profile.includes("backupButton.onclick=async()=>"));
assert(runtime.includes('id="programExportDatabase"'));
assert(preload.includes('backup:{create:()=>ipcRenderer.invoke("backup:create")'));
assert(main.includes('dialog.showSaveDialog(win,'));
assert(main.includes("completeBackup.pack({userData:app.getPath("),"complete export uses staged verified archive");
assert(main.includes("completeBackup.restore({archive:r.filePaths[0]"),"restore validates staged archive");
assert(main.includes("requireBackupAdmin(e)"),"native authorization is required for backup IPC");
assert(main.includes('["starting","ready"].includes(qwenState.state)'),
 "backup must be blocked while Qwen is starting or ready, not a nonexistent status.active flag");
assert(tabsCSS.includes("#programExportDatabase"));
assert(standaloneCSS.includes("#programExportDatabase"));
const start=profile.indexOf("  let exportingDatabase=false;"),end=profile.indexOf("\n  updateButton.onclick=",start);
assert(start>=0&&end>start);
const source=profile.slice(start,end);
let role="admin",result=true,callCount=0,notices=[];
const button={disabled:false},restoreButton={disabled:false};
let restoreCalls=0;
const irProject={backup:{
 async create(){callCount++;return result},
 async restore(){restoreCalls++;return true}
}};
const context={backupButton:button,restoreButton,closeSettings:()=>{},
 passwordDialog:async()=>true,irAccess:{role:()=>role},irProject,
 alert:v=>notices.push(v),irProjectNotice:(message,type)=>notices.push({message,type})};
vm.runInNewContext(source,context);
(async()=>{
 await button.onclick();
 assert.equal(callCount,1);
 assert.equal(button.disabled,false);
 const success=notices.pop();
 assert.match(success.message,/Полная резервная копия успешно выгружена/);
 assert.equal(success.type,"success");
 result=false;await button.onclick();
 assert.equal(callCount,2,"cancel opens dialog but performs no further actions");
 assert.equal(notices.length,0,"cancel must not show a success message");
 role="guest";await button.onclick();
 assert.equal(callCount,2,"guest cannot export");
 assert.match(notices.pop(),/только администратору/);
 role="admin";irProject.backup.create=async()=>{throw new Error("no space")};
 await button.onclick();
 assert.match(notices.pop(),/no space/);
 assert.equal(button.disabled,false,"export lock released on errors");
 await restoreButton.onclick();
 assert.equal(restoreCalls,1);
 assert.match(notices.pop().message,/архив восстановлен/);
 role="guest";await restoreButton.onclick();
 assert.equal(restoreCalls,1,"guest cannot restore");
 assert.match(notices.pop(),/только администратору/);
 console.log("Database export: native destination chooser, admin, cancellation, errors, UI wiring OK");
})().catch(e=>{console.error(e);process.exitCode=1});
