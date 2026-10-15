"use strict";
/* Real signed-catalog and streamed-download tests, network replaced by local bytes. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),{Readable}=require("node:stream"),yazl=require("yazl");
const {createModelCatalog}=require("../src/ai-model-catalog");
const {downloadVerifiedPack}=require("../src/ai-model-download");
const {createModelManager}=require("../src/ai-model-manager");
async function toBuffer(readable){const parts=[];for await(const chunk of readable)parts.push(Buffer.from(chunk));return Buffer.concat(parts)}
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-catalog-"));
 const {publicKey,privateKey}=crypto.generateKeyPairSync("ed25519");
 const trustedKeys={"test-ed25519":publicKey.export({type:"spki",format:"pem"})};
 const keys=Object.keys(trustedKeys);
 const binary=Buffer.from("GGUF local vision test content padded for correct model-pack integrity");
 const rawManifest=Buffer.from(JSON.stringify({schema:1,modelId:"qwen3-vl-4b",engine:"llama.cpp",
   version:"1.0.0",keyId:keys[0],minAppVersion:"1.7.212",
   files:[{path:"model.gguf",bytes:binary.length,sha256:sha(binary)}]}));
 const zip=new yazl.ZipFile();
 zip.addBuffer(rawManifest,"manifest.json");
 zip.addBuffer(Buffer.from(crypto.sign(null,rawManifest,privateKey).toString("base64")),"manifest.sig");
 zip.addBuffer(binary,"files/model.gguf");zip.end();
 const pack=await toBuffer(zip.outputStream);
 const url="https://models.irproject.invalid/catalog.json",packUrl="https://models.irproject.invalid/qwen3-vl-4b-1.0.0.ir-ai-pack";
 const now=Date.now();
 const payload={schema:1,generatedAt:new Date(now-2000).toISOString(),
  expiresAt:new Date(now+86400000).toISOString(),
  releases:[{modelId:"qwen3-vl-4b",version:"1.0.0",engine:"llama.cpp",minAppVersion:"1.7.212",
   url:packUrl,size:pack.length,sha256:sha(pack),notes:"Тестовый локальный пакет"}]};
 const sign=o=>{
  const raw=Buffer.from(JSON.stringify(o));
  return Buffer.from(JSON.stringify({keyId:keys[0],payload:raw.toString("base64"),
   signature:crypto.sign(null,raw,privateKey).toString("base64")}))
 };
 let catalogBytes=sign(payload),catalogCalls=0,downloadCalls=0;
 const response=bytes=>({ok:true,status:200,body:Readable.from([bytes]),headers:{get:k=>k==="content-length"?String(bytes.length):null}});
 const catalogRequest=async(target,options)=>{
  assert.equal(target,url);assert.equal(options.redirect,"error");assert.equal(options.credentials,"omit");
  catalogCalls++;return response(catalogBytes)
 };
 const downloadRequest=async(target,options)=>{
  assert.equal(target,packUrl);assert.equal(options.redirect,"error");downloadCalls++;
  return response(pack)
 };
 try{
  const catalog=createModelCatalog({catalogUrl:url,trustedKeys,request:catalogRequest,
   now:()=>now,appVersion:()=>"1.7.212"});
  assert.equal((await catalog.check()).available[0].bytes,pack.length);
  assert.equal(catalogCalls,1);
  const unrelated=createModelCatalog({catalogUrl:url,trustedKeys,request:catalogRequest,now:()=>now});
  let altered={...payload,releases:payload.releases.map(x=>({...x,url:"https://evil.invalid/pack.ir-ai-pack"}))};
  catalogBytes=sign(altered);
  await assert.rejects(catalog.check(),/вне доверенного источника/);
  catalogBytes=sign({...payload,expiresAt:new Date(now-2000).toISOString()});
  await assert.rejects(catalog.check(),/устарел/);
  catalogBytes=sign(payload);
  const corrupt=JSON.parse(catalogBytes.toString("utf8"));
  corrupt.payload=Buffer.from('{"schema":1,"releases":[]}').toString("base64");
  catalogBytes=Buffer.from(JSON.stringify(corrupt));
  await assert.rejects(catalog.check(),/подпись/);
  catalogBytes=sign(payload);
  const unknown=createModelCatalog({catalogUrl:url,request:catalogRequest,trustedKeys:{other:trustedKeys[keys[0]]},now:()=>now});
  await assert.rejects(unknown.check(),/неизвестным издателем/);
  await assert.rejects(downloadVerifiedPack({release:{url:packUrl,bytes:pack.length,
   sha256:"a".repeat(64)},destination:path.join(tmp,"bad.ir-ai-pack"),request:downloadRequest}),/SHA-256/);
  assert(!fs.existsSync(path.join(tmp,"bad.ir-ai-pack")));
  let progress=0;
  const manager=createModelManager({getUserDataPath:()=>tmp,trustedKeys,appVersion:()=>"1.7.212",
   catalogUrl:url,catalogRequest,downloadRequest,
   onDownloadProgress:p=>{progress=p.percent}});
  assert.equal(downloadCalls,1,"no network download on constructor");
  assert.equal(manager.info().update.available.length,0,"no automatic check");
  let releases=await manager.checkUpdates();
  assert.equal(releases.available.length,1);
  assert.equal(manager.info().update.available[0].version,"1.0.0");
  const fetched=await manager.download("qwen3-vl-4b","1.0.0");
  assert.equal(progress,100);assert(fetched.token.length>20);
  assert.equal(fetched.installedBytes,binary.length);
  assert.equal(manager.info().models.find(x=>x.id==="qwen3-vl-4b").active,null,
   "downloading must NOT install");
  const installed=await manager.install(fetched.token);assert.equal(installed.installed,true);
  assert.equal(manager.info().models.find(x=>x.id==="qwen3-vl-4b").active,"1.0.0");
  releases=await manager.checkUpdates();
  assert.equal(releases.available.length,0,"installed release isn't an update");
  await assert.rejects(manager.download("qwen3-vl-4b","1.0.0"),/не подтверждена/);
  assert.equal((await createModelCatalog({}).check()).configured,false);
  console.log("AI signed catalog: detached Ed25519, HTTPS origin, expiry, tampering, streamed SHA-256, confirmation separation PASS");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
