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
 assert.match(m.version,/^1\.7\.217\.[1-9]\d*$/);
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
  responseFiles={"src/ai-local-engine.js":a,"src/ai-analysis.js":b};
  remoteManifest={version:"1.7.217.10",channel:"beta",baseVersion,
   files:[makeFile("src/ai-local-engine.js",a),makeFile("src/ai-analysis.js",b)]};
  assert.equal(updater.installedVersion(),baseVersion);
  assert.equal((await updater.check()).updateInfo.version,"1.7.217.10");
  await updater.download();
  assert.equal(updater.installedVersion(),"1.7.217.10");
  assert.equal(require(updater.resolveFile("src/ai-local-engine.js")).mode,"hot10");
  assert(updater.resolveFile("src/ai-local-engine.js").includes("app-updates"));
  downloaded.length=0;
  responseFiles["src/ai-analysis.js"]=c;
  remoteManifest={...remoteManifest,version:"1.7.217.11",
   files:[makeFile("src/ai-local-engine.js",a),makeFile("src/ai-analysis.js",c)]};
  await updater.check();await updater.download();
  assert.equal(updater.installedVersion(),"1.7.217.11");
  assert(!downloaded.some(url=>url.includes("/src/ai-local-engine.js?")),
   "Unchanged verified files should be reused, not downloaded again");
  assert(downloaded.some(url=>url.includes("/src/ai-analysis.js?")));
  assert.equal(updater.verifyRuntime().files.length,2);
  // Hash rejection must preserve the previous installed runtime.
  remoteManifest={...remoteManifest,version:"1.7.217.12",
   files:[makeFile("src/ai-local-engine.js",a),{
    ...makeFile("src/ai-analysis.js",c),sha256:"a".repeat(64)
   }]};
  await updater.check();
  await assert.rejects(updater.download(),/Контрольная сумма/);
  assert.equal(updater.installedVersion(),"1.7.217.11");
  // A forged source path outside src/ai-* is never accepted.
  remoteManifest={version:"1.7.217.13",channel:"beta",baseVersion,
   files:[makeFile("main.js",a)]};
  await assert.rejects(updater.check(),/несовместим/);
  // Old-base patches are rejected (native bridge changes require a new EXE).
  remoteManifest={version:"1.7.218.2",channel:"beta",baseVersion:"1.7.218",
   files:[makeFile("src/ai-local-engine.js",a)]};
  await assert.rejects(updater.check(),/несовместим/);
  const hotFile=updater.resolveFile("src/ai-local-engine.js");
  fs.writeFileSync(hotFile,"tampered");
  assert.equal(updater.resolveFile("src/ai-local-engine.js"),
   path.join(appDir,"src","ai-local-engine.js"),
   "Tampered hot runtime must fall back to bundled originals");
  console.log("AI Beta hot: channel isolation, versioning, SHA-256, cached download, rollback PASS");
 }finally{
  https.get=originalGet;Module._load=originalLoad;
  fs.rmSync(tmp,{recursive:true,force:true})
 }
})().catch(e=>{console.error(e);process.exitCode=1});
