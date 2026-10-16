"use strict";
/* No Electron, model downloads or network required. Validate that Beta hot patches
 * load from the feature branch, verify hashes, reuse identical files and roll back.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os");
const path=require("node:path"),crypto=require("node:crypto"),https=require("node:https");
const Module=require("node:module"),{Readable}=require("node:stream");
const {EventEmitter}=require("node:events");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function checkManifest(){
 const file=path.join(__dirname,"..","hot","beta","latest.json");
 if(!fs.existsSync(file))return;
 const m=JSON.parse(fs.readFileSync(file,"utf8"));
 assert.equal(m.channel,"beta");
 assert.equal(m.baseVersion,require("../package.json").version);
 assert.match(m.version,new RegExp("^"+m.baseVersion.replace(/\\./g,"\\\\.")+"\\\\.[1-9]\\\\d*$"));
 assert(m.files.length>5&&m.files.length<120);
 for(const f of m.files){
  assert.match(f.target,/^src\/ai-[a-z0-9-]+\.(?:js|css)$/);
  assert.equal(f.target,f.source);
  const b=fs.readFileSync(path.join(__dirname,"..",f.source));
  assert.equal(f.size,b.length);
  assert.equal(f.sha256,sha(b));
 }
}
if(process.argv.includes("--manifest")){
 checkManifest();console.log("Beta hot manifest: exact files, sizes, SHA256 OK");
 process.exit(0)
}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-beta-hot-"));
 const appDir=path.join(tmp,"app"),data=path.join(tmp,"user");
 fs.mkdirSync(path.join(appDir,"src"),{recursive:true});
 fs.writeFileSync(path.join(appDir,"src","ai-beta-channel.json"),'{"channel":"beta"}');
 fs.writeFileSync(path.join(appDir,"src","ai-local-engine.js"),"module.exports={mode:'base'};");
 const baseVersion="1.7.217",originalLoad=Module._load,originalGet=https.get;
 Module._load=function(name,...args){
  if(name==="electron")return{app:{
   getPath:()=>data,getAppPath:()=>appDir,getVersion:()=>baseVersion,
   relaunch(){},exit(){}
  }};
  return originalLoad.call(this,name,...args)
 };
 let responseFiles={},remoteManifest=null,downloaded=[];
 https.get=(url,_opts,callback)=>{
  const link=String(url),req=new EventEmitter();
  downloaded.push(link);
  process.nextTick(()=>{
   const isManifest=link.includes("/contents/hot/beta/latest.json");
   assert(link.includes("feature%2Fir-project-ai-next")||
    link.includes("feature/ir-project-ai-next"),
    "Beta updater must never ask the main branch for source files");
   let data;
   if(isManifest)data=Buffer.from(JSON.stringify({
    content:Buffer.from(JSON.stringify(remoteManifest)).toString("base64")
   }));
   else{
    const name=Object.keys(responseFiles).find(f=>link.includes("/"+f+"?"));
    assert(name,"Requested an unexpected file: "+link);
    data=responseFiles[name]
   }
   const res=Readable.from([data]);res.statusCode=200;res.headers={};callback(res)
  });
  return req
 };
 let updater;
 try{
  updater=require("../src/updater");
  Module._load=originalLoad;
  const makeFile=(file,bytes)=>({source:file,target:file,size:bytes.length,sha256:sha(bytes)});
  const a=Buffer.from("module.exports={mode:'hot10'};"),
   b=Buffer.from("module.exports={mode:'analysis10'};"),
   c=Buffer.from("module.exports={mode:'analysis11'};");
  const support={
   "src/ai-structured-extraction.js":Buffer.from("module.exports={extract:()=>({})};"),
   "src/ai-review.js":Buffer.from("module.exports={createAiReview(){}};"),
   "src/ai-workflow.js":Buffer.from("module.exports={createAiWorkflow(){}};"),
   "src/ai-structured-review.js":Buffer.from("module.exports={createStructuredReviews(){}};")
  };
  const filesFor=analysisBytes=>[
   makeFile("src/ai-local-engine.js",a),
   makeFile("src/ai-analysis.js",analysisBytes),
   ...Object.entries(support).map(([name,bytes])=>makeFile(name,bytes))
  ];
  responseFiles={"src/ai-local-engine.js":a,"src/ai-analysis.js":b,...support};
  remoteManifest={version:"1.7.217.10",channel:"beta",baseVersion,files:filesFor(b)};
  assert.equal(updater.installedVersion(),baseVersion);
  assert.equal((await updater.check()).updateInfo.version,"1.7.217.10");
  await updater.download();
  assert.equal(updater.installedVersion(),"1.7.217.10");
  assert.equal(require(updater.resolveFile("src/ai-local-engine.js")).mode,"hot10");
  assert(updater.resolveFile("src/ai-local-engine.js").includes("app-updates"));
  downloaded.length=0;
  responseFiles["src/ai-analysis.js"]=c;
  remoteManifest={...remoteManifest,version:"1.7.217.11",files:filesFor(c)};
  await updater.check();await updater.download();
  assert.equal(updater.installedVersion(),"1.7.217.11");
  assert(!downloaded.some(url=>url.includes("/src/ai-local-engine.js?")),
   "Unchanged verified files should be reused, not downloaded again");
  assert(downloaded.some(url=>url.includes("/src/ai-analysis.js?")));
  assert.equal(updater.verifyRuntime().files.length,6);
  // Hash rejection must preserve the previous installed runtime.
  remoteManifest={...remoteManifest,version:"1.7.217.12",
   files:filesFor(c).map(f=>f.target==="src/ai-analysis.js"?
    {...f,sha256:"a".repeat(64)}:f)};
  await updater.check();
  await assert.rejects(updater.download(),/Контрольная сумма/);
  assert.equal(updater.installedVersion(),"1.7.217.11");
  // A forged source path outside src/ai-* is never accepted.
  remoteManifest={version:"1.7.217.13",channel:"beta",baseVersion,
   files:[...filesFor(c),makeFile("main.js",a)]};
  await assert.rejects(updater.check(),/несовместим/);
  // Old-base patches are rejected (native bridge changes require a new EXE).
  remoteManifest={version:"1.7.218.2",channel:"beta",baseVersion:"1.7.218",
   files:filesFor(c)};
  await assert.rejects(updater.check(),/несовместим/);
  const hotFile=updater.resolveFile("src/ai-local-engine.js");
  fs.writeFileSync(hotFile,"tampered");
  assert.equal(updater.resolveFile("src/ai-local-engine.js"),
   path.join(appDir,"src","ai-local-engine.js"),
   "Tampered hot runtime must fall back to bundled originals");
  // Manual rollback must remain possible even if the active hot patch is corrupt.
  const reverted=updater.rollback();
  assert.equal(reverted.version,"1.7.217.10","restores previous verified hot version");
  assert.equal(updater.installedVersion(),"1.7.217.10");
  assert.equal(require(updater.resolveFile("src/ai-local-engine.js")).mode,"hot10");
  const bundled=updater.rollback();
  assert.equal(bundled.version,baseVersion,"second rollback restores the bundled EXE");
  assert.equal(updater.installedVersion(),baseVersion);
  assert.equal(updater.resolveFile("src/ai-local-engine.js"),
   path.join(appDir,"src","ai-local-engine.js"));
  assert.throws(()=>updater.rollback(),/Hot-обновление не установлено/);
  const bridge=fs.readFileSync(path.join(__dirname,"..","preload.js"),"utf8");
  const main=fs.readFileSync(path.join(__dirname,"..","main.js"),"utf8");
  const shell=fs.readFileSync(path.join(__dirname,"..","src","tabs-shell.js"),"utf8");
  assert(bridge.includes('ipcRenderer.invoke("update:rollback")'));
  assert(main.includes('ipcMain.handle("update:rollback"'));
  assert(shell.includes("Откатить hot-обновление"));
  console.log("AI Beta hot: channel isolation, SHA-256, reuse, rollback, UI bridge PASS");
 }finally{
  https.get=originalGet;Module._load=originalLoad;
  fs.rmSync(tmp,{recursive:true,force:true})
 }
})().catch(e=>{console.error(e);process.exitCode=1});
