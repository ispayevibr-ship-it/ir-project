"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),
 crypto=require("node:crypto"),{pipeline}=require("node:stream/promises"),yazl=require("yazl");
const {createModelManager,CATALOG,TRUSTED_MODEL_KEYS}=require("../src/ai-model-manager");
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-models-"));
 const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
 const trustedKeys={"ir-test-publisher":publicKey.export({type:"spki",format:"pem"})};
 const sha=buffer=>crypto.createHash("sha256").update(buffer).digest("hex");
 async function createArchive(ver,{badHash=false,badSignature=false,extra=false}={}){
  const fileBytes=Buffer.from("GGUF fixture "+ver+" model-contents 0000000000000000");
  const manifest={schema:1,modelId:"qwen3-vl-4b",version:ver,engine:"llama.cpp",
   keyId:"ir-test-publisher",minAppVersion:"1.7.211",
   files:[{path:"model.gguf",bytes:fileBytes.length,sha256:badHash?"a".repeat(64):sha(fileBytes)}]};
  const raw=Buffer.from(JSON.stringify(manifest)),signature=crypto.sign(null,raw,privateKey);
  if(badSignature)signature[3]^=0xff;
  const zip=new yazl.ZipFile(),out=path.join(tmp,"pack-"+ver+"-"+[badHash,badSignature,extra].join("")+".ir-ai-pack");
  zip.addBuffer(raw,"manifest.json");
  zip.addBuffer(Buffer.from(signature.toString("base64")),"manifest.sig");
  zip.addBuffer(fileBytes,"files/model.gguf");
  if(extra)zip.addBuffer(Buffer.from("untrusted"),"files/extra.js");
  zip.end();await pipeline(zip.outputStream,fs.createWriteStream(out));
  return out
 }
 let selected="";
 const manager=createModelManager({getUserDataPath:()=>tmp, trustedKeys,
  appVersion:()=>"1.7.211",dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[selected]})},
  engineActive:()=>false
 });
 try{
  assert.equal(CATALOG.length,2);
  assert.equal(Object.keys(TRUSTED_MODEL_KEYS).length,0,"production must have NO unapproved signer keys");
  assert(manager.info().models.every(m=>m.active===null));
  assert.equal(manager.checkUpdates().configured,false);
  selected=await createArchive("1.0.0");
  const first=await manager.select();
  assert(first.signed&&first.installedBytes>10&&first.token.length>=32);
  const installed=await manager.install(first.token);
  assert.equal(installed.version,"1.0.0");
  assert.equal(manager.info().models.find(m=>m.id==="qwen3-vl-4b").active,"1.0.0");
  assert.rejects(manager.install(first.token),/Сначала выберите/,"opaque token cannot be reused");
  selected=await createArchive("1.1.0");
  const second=await manager.select();await manager.install(second.token);
  const model=manager.list().find(m=>m.id==="qwen3-vl-4b");
  assert.equal(model.active,"1.1.0");assert.equal(model.previous,"1.0.0");
  assert.equal(model.canRollback,true);
  let result=await manager.rollback("qwen3-vl-4b");
  assert.equal(result.active,"1.0.0");
  const activeBefore=manager.list().find(m=>m.id==="qwen3-vl-4b").active;
  selected=await createArchive("1.2.0",{badSignature:true});
  await assert.rejects(manager.select(),/Цифровая подпись/);
  selected=await createArchive("1.2.1",{extra:true});
  await assert.rejects(manager.select(),/Состав архива/);
  selected=await createArchive("1.2.2",{badHash:true});
  const corrupt=await manager.select();
  await assert.rejects(manager.install(corrupt.token),/SHA-256/);
  assert.equal(manager.list().find(m=>m.id==="qwen3-vl-4b").active,activeBefore,
   "bad package must not switch active model");
  assert(!fs.existsSync(path.join(tmp,"ir-project-ai","model-manager","models","qwen3-vl-4b","1.2.2")));
  const untrusted=createModelManager({getUserDataPath:()=>path.join(tmp,"untrusted"),trustedKeys:{},appVersion:()=>"1.7.211"});
  await assert.rejects(untrusted.preview(await createArchive("1.3.0")) ,/официальный ключ/);
  const old=path.join(tmp,"ir-project-ai","model-manager","models","qwen3-vl-4b","1.1.0","files","model.gguf");
  fs.appendFileSync(old,"TAMPER");
  await assert.rejects(manager.rollback("qwen3-vl-4b"),/Неверный файл|Повреждён файл/);
  assert.equal(manager.list().find(m=>m.id==="qwen3-vl-4b").active,activeBefore);
  assert.equal(manager.list().find(m=>m.id==="paddleocr-vl-1.6").active,null);
  console.log("Signed AI packs: Ed25519 trust, ZIP bytes, SHA-256, isolated versions, rollback and corruption safety PASS");
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
