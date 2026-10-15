"use strict";
/* DEFERRED FINAL-ACCEPTANCE CONTRACT. Fake bytes only, no neural models. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto");
const {createPaddlePack}=require("./ai-paddleocr-pack-publisher");
const {verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
const {signCatalog}=require("./sign-ai-catalog");
const {createModelManager}=require("../src/ai-model-manager");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
(async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-paddle-pub-"));
 const keys=crypto.generateKeyPairSync("ed25519"),keyFile=path.join(home,"private.pem");
 fs.writeFileSync(keyFile,keys.privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
 const worker=path.join(home,"paddleocr-worker.exe"),layout=path.join(home,"layout"),
  vision=path.join(home,"vision");
 fs.mkdirSync(layout);fs.mkdirSync(vision);
 const exe=Buffer.concat([Buffer.from("MZ","ascii"),Buffer.alloc(160,2)]),
  layoutWeights=Buffer.from("artificial layout model bytes"),
  vlWeights=Buffer.from("artificial vision model bytes");
 fs.writeFileSync(worker,exe);
 fs.writeFileSync(path.join(layout,"inference.pdparams"),layoutWeights);
 fs.writeFileSync(path.join(vision,"model.safetensors"),vlWeights);
 const layoutPins=path.join(home,"layout-hashes.json"),visionPins=path.join(home,"vision-hashes.json");
 fs.writeFileSync(layoutPins,JSON.stringify({"inference.pdparams":hash(layoutWeights)}));
 fs.writeFileSync(visionPins,JSON.stringify({"model.safetensors":hash(vlWeights)}));
 const output=path.join(home,"paddleocr-vl-1.6.ir-ai-pack"),options={
  workerFile:worker,workerSha256:hash(exe),layoutDir:layout,layoutPinsFile:layoutPins,
  visionDir:vision,visionPinsFile:visionPins,output,keyFile,keyId:"temporary-publisher",
  version:"1.0.0",minAppVersion:"1.7.214",strictSizes:false
 };
 try{
  const built=await createPaddlePack(options);
  assert.equal(built.manifest.runtime.protocol,"ir-paddleocr-vl-json-1");
  assert.equal(built.manifest.engine,"paddleocr");
  assert.equal(built.manifest.modelId,"paddleocr-vl-1.6");
  assert.equal(built.manifest.files.length,3);
  assert.equal(built.sha256,await checksum(output));
  assert((await verifyBuiltArchive(output,keys.publicKey)).verified);
  await assert.rejects(verifyBuiltArchive(output,crypto.generateKeyPairSync("ed25519").publicKey),/Подпись/);
  await assert.rejects(createPaddlePack(options),/перезапись запрещена/);
  await assert.rejects(createPaddlePack({...options,output:path.join(home,"bad-sha.ir-ai-pack"),
   workerSha256:"0".repeat(64)}),/SHA-256/);
  fs.writeFileSync(layoutPins,JSON.stringify({"inference.pdparams":"0".repeat(64)}));
  await assert.rejects(createPaddlePack({...options,output:path.join(home,"bad-model.ir-ai-pack")}),/SHA-256/);
  fs.writeFileSync(layoutPins,JSON.stringify({"inference.pdparams":hash(layoutWeights)}));
  fs.writeFileSync(path.join(vision,"unlisted.json"),"unexpected");
  await assert.rejects(createPaddlePack({...options,output:path.join(home,"extra.ir-ai-pack")}),/закреплённые хэши/);
  fs.unlinkSync(path.join(vision,"unlisted.json"));
  const catalog=path.join(home,"catalog.json");
  const signature=await signCatalog({pack:output,url:"https://models.example.invalid/paddleocr.ir-ai-pack",
   keyFile,keyId:"temporary-publisher",output:catalog,
   now:()=>Date.parse("2026-10-15T10:00:00Z")});
  assert.equal(signature.modelId,"paddleocr-vl-1.6");
  const manager=createModelManager({
   getUserDataPath:()=>home,appVersion:()=>"1.7.214",
   trustedKeys:{"temporary-publisher":keys.publicKey.export({format:"pem",type:"spki"})},
   dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[output]})}
  });
  const selected=await manager.select();
  assert.equal(selected.modelId,"paddleocr-vl-1.6");
  const installed=await manager.install(selected.token);
  assert.equal(installed.installed,true);
  const profile=await manager.resolveRuntime("paddleocr-vl-1.6");
  if(process.platform==="win32"){
   assert.equal(profile.installed,true);
   assert.equal(profile.protocol,"ir-paddleocr-vl-json-1");
   assert(profile.files.binary.path.endsWith("paddleocr-worker.exe"))
  }else{
   assert.equal(profile.installed,false,"Windows OCR package may only be used on Windows");
   assert.match(profile.reason,/интерфейс|готов к запуску/)
  }
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
