"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),
 path=require("node:path"),crypto=require("node:crypto");
const {createGuard,POLICY}=require("../src/ai-document-hot-loader");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-removal-loader-"));
const bundled=path.join(tmp,"installer","src","ai-document-store.js");
const hot=path.join(tmp,"updates","src","ai-document-store.js");
for(const p of [bundled,hot])fs.mkdirSync(path.dirname(p),{recursive:true});
const sha=()=>crypto.randomBytes(8).toString("hex");
const moduleCode=(marker,valid=true)=>"module.exports={POLICY_REVISION:"+JSON.stringify(valid?POLICY:"outdated")+
 ",createStore:()=>({removalImpact:()=>({policyRevision:"+JSON.stringify(POLICY)+
 ",canDelete:true,marker:"+JSON.stringify(marker)+"}),"+
 "remove:()=>({deleted:true,marker:"+JSON.stringify(marker)+"})})};\n";
let active=bundled,version="1.7.218",resolved=0,installed=0;
const updates={
 resolveFile:()=>{resolved++;return active},
 installedVersion:()=>{installed++;return version}
};
const guard=createGuard({updates,appRoot:path.join(tmp,"installer"),getUserDataPath:()=>tmp,
 database:{getObject:()=>({id:1})},dialog:{},shell:{},getWindow:()=>null});
try{
 fs.writeFileSync(bundled,moduleCode("installer"));
 assert.equal(guard.removalImpact(1,10).marker,"installer");
 assert.equal(guard.remove(1,10,{}).marker,"installer");
 assert.equal(guard.removalImpact(1,10).moduleSource,"installer");
 fs.writeFileSync(hot,moduleCode("hot-1"));
 active=hot;version="1.7.218.1";
 assert.equal(guard.removalImpact(1,10).marker,"hot-1",
  "hot module must be picked up without restarting Electron");
 assert.equal(guard.remove(1,10,{}).marker,"hot-1");
 fs.writeFileSync(hot,moduleCode("hot-2"));version="1.7.218.2";
 assert.equal(guard.removalImpact(1,10).marker,"hot-2",
  "require cache must not retain an old module at the same path");
 assert.equal(guard.removalImpact(1,10).installedVersion,"1.7.218.2");
 fs.writeFileSync(hot,moduleCode("old-guard",false));version="1.7.218.3";
 assert.throws(()=>guard.remove(1,10,{}),/не соответствует политике безопасности/,
  "no fallback to unverified code is allowed for destructive actions");
 assert(resolved>=6&&installed>=6);
 console.log("AI PDF deletion loader: bundled, live hot upgrade, cache invalidation, fail-closed PASS");
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
