"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),crypto=require("node:crypto"),https=require("node:https");
const {Readable}=require("node:stream"),{EventEmitter}=require("node:events");
const folder=fs.mkdtempSync(path.join(os.tmpdir(),"ir-updater-safe-"));
const userData=path.join(folder,"user-data"),appPath=path.join(folder,"app");
fs.mkdirSync(userData,{recursive:true});fs.mkdirSync(appPath,{recursive:true});
const originalLoad=Module._load,originalGet=https.get;
Module._load=function(name,...args){if(name==="electron")return{app:{getPath:()=>userData,getAppPath:()=>appPath,getVersion:()=>"1.6.6",relaunch(){},exit(){}}};return originalLoad.call(this,name,...args)};
const updates=require("../src/updater");
Module._load=originalLoad;
const root=path.join(userData,"app-updates"),current=path.join(root,"current"),previous=path.join(root,"previous");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function makeRuntime(dir,version,data){fs.mkdirSync(path.join(dir,"src"),{recursive:true});fs.writeFileSync(path.join(dir,"src","sample.js"),data);fs.writeFileSync(path.join(dir,"hot-manifest.json"),JSON.stringify({version,files:[{target:"src/sample.js",source:"src/sample.js",size:data.length,sha256:sha(data)}]}))}
const old=Buffer.from("old working runtime"),fresh=Buffer.from("new working runtime"),changed=Buffer.from("another working runtime");
const remote={version:"1.7.149",files:[{source:"src/sample.js",target:"src/sample.js",size:fresh.length}]};
let payload=fresh;
https.get=(url,options,callback)=>{const req=new EventEmitter();process.nextTick(()=>{const res=Readable.from([String(url).includes("/contents/hot/latest.json")?Buffer.from(JSON.stringify({content:Buffer.from(JSON.stringify(remote)).toString("base64")})):payload]);res.statusCode=200;res.headers={};callback(res)});return req};
(async()=>{
 makeRuntime(current,"1.7.148",old);
 assert.equal(updates.installedVersion(),"1.7.148");
 await updates.check();await updates.download();
 assert.equal(updates.installedVersion(),"1.7.149");
 assert.equal(fs.readFileSync(path.join(previous,"src/sample.js"),"utf8"),old.toString());
 assert.equal(fs.readFileSync(path.join(current,"src/sample.js"),"utf8"),fresh.toString());
 remote.version="1.7.150";remote.files[0].size=changed.length;payload=Buffer.from("wrong size");
 await updates.check();
 await assert.rejects(updates.download(),/Размер файла обновления не совпадает/);
 assert.equal(updates.installedVersion(),"1.7.149","rejected transfer must not replace active runtime");
 remote.version="1.7.151";payload=changed;
 await updates.check();
 const originalRename=fs.renameSync;
 fs.renameSync=(from,to)=>{if(from===path.join(root,"staging")&&to===current)throw Error("simulated rename failure");return originalRename(from,to)};
 try{await assert.rejects(updates.download(),/simulated rename failure/)}finally{fs.renameSync=originalRename}
 assert.equal(updates.installedVersion(),"1.7.149","rename failure must restore last good runtime");
 assert.equal(fs.readFileSync(path.join(current,"src/sample.js"),"utf8"),fresh.toString());
 fs.renameSync(current,previous); // simulate process death after current was moved aside
 updates.cleanupStaleRuntime();
 assert.equal(updates.installedVersion(),"1.7.149","interrupted switch must recover from previous folder");
 assert.equal(fs.readFileSync(path.join(current,"src/sample.js"),"utf8"),fresh.toString());
 console.log("Updater safety: size validation, previous runtime, rollback and restart recovery OK");
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{https.get=originalGet;fs.rmSync(folder,{recursive:true,force:true})});
