"use strict";
/* Real ZIP generation and signatures with artificial GGUF/PE headers.
   Private key generated in tmp only. No neural weights used. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),{Readable}=require("node:stream");
const {createQwenPack,verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
const {signCatalog}=require("./sign-ai-catalog");
const {createModelCatalog}=require("../src/ai-model-catalog");
const {createModelManager}=require("../src/ai-model-manager");
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
async function run(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ir-qwen-pub-"));
 const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
 const privateFile=path.join(dir,"operator-private.pem");
 fs.writeFileSync(privateFile,privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600});
 const runtime=path.join(dir,"llama"),model=path.join(dir,"Qwen3VL-4B-Instruct-Q4_K_M.gguf"),
  vision=path.join(dir,"mmproj-Qwen3VL-4B-Instruct-F16.gguf");
 fs.mkdirSync(runtime);
 const exe=Buffer.concat([Buffer.from("MZ","ascii"),Buffer.alloc(96,1)]);
 const dll=Buffer.concat([Buffer.from("MZ","ascii"),Buffer.alloc(80,2)]);
 const gguf=Buffer.concat([Buffer.from("GGUF","ascii"),Buffer.alloc(80,3)]);
 const mmproj=Buffer.concat([Buffer.from("GGUF","ascii"),Buffer.alloc(80,4)]);
 fs.writeFileSync(path.join(runtime,"llama-server.exe"),exe);
 fs.writeFileSync(path.join(runtime,"ggml.dll"),dll);
 fs.writeFileSync(model,gguf);fs.writeFileSync(vision,mmproj);
 const output=path.join(dir,"qwen4-v1.ir-ai-pack");
 const a={runtimeDir:runtime,modelFile:model,visionFile:vision,output,keyFile:privateFile,
  keyId:"test-publisher",version:"1.0.0",strictSizes:false,
  modelSha256:sha(gguf),visionSha256:sha(mmproj),binarySha256:sha(exe),
  gpuLayers:12,minAppVersion:"1.7.214",
  upstream:{modelRepository:"Qwen/Qwen3-VL-4B-Instruct-GGUF",modelRevision:"test-only",
   runtimeRepository:"ggml-org/llama.cpp",runtimeRelease:"fixture"}};
 try{
  assert.equal(fs.existsSync(output),false);
  const generated=await createQwenPack(a);
  assert.equal(generated.manifest.runtime.binary,"bin/llama-server.exe");
  assert.equal(generated.manifest.runtime.gpuLayers,12);
  assert.equal(generated.manifest.files.length,4);
  assert.equal(generated.sha256,await checksum(output));
  assert.equal((await verifyBuiltArchive(output,publicKey)).verified,true);
  assert.equal((await verifyBuiltArchive(output,publicKey.export({format:"pem",type:"spki"}))).verified,true, "publisher accepts PEM and public KeyObject");
  assert.equal(generated.publicKeyFingerprint.length,64);
  const wrongKey=crypto.generateKeyPairSync("ed25519").publicKey;
  await assert.rejects(verifyBuiltArchive(output,wrongKey),/Подпись/);
  await assert.rejects(createQwenPack({...a,output:path.join(dir,"wrong.ir-ai-pack"),
   modelSha256:"0".repeat(64)}),/SHA-256 исходного файла/);
  await assert.rejects(createQwenPack(a),/перезапись запрещена/);
  const fake=path.join(dir,"fake.gguf");fs.writeFileSync(fake,"not a GGUF file");
  await assert.rejects(createQwenPack({...a,modelFile:fake,output:path.join(dir,"badmagic.ir-ai-pack")}),/GGUF/);
  await assert.rejects(createQwenPack({...a,output:path.join(dir,"toosmall.ir-ai-pack"),
   strictSizes:true}),/маленький/);
  const unsignedKey="test-publisher",catalogFile=path.join(dir,"catalog.json");
  const url="https://models.irproject.invalid/qwen4-v1.ir-ai-pack";
  const cat=await signCatalog({pack:output,url,keyFile:privateFile,keyId:unsignedKey,
   output:catalogFile,now:()=>Date.parse("2026-10-15T10:00:00Z")});
  assert.equal(cat.packSha256,generated.sha256);
  const data=fs.readFileSync(catalogFile);
  const trustedKeys={[unsignedKey]:publicKey.export({format:"pem",type:"spki"})};
  const checked=createModelCatalog({catalogUrl:"https://models.irproject.invalid/catalog.json",
   trustedKeys,now:()=>Date.parse("2026-10-15T11:00:00Z"),appVersion:()=>"1.7.214",
   request:async()=>({ok:true,status:200,body:Readable.from([data])})});
  const release=(await checked.check()).available[0];
  assert.equal(release.sha256,generated.sha256);
  assert.equal(release.bytes,generated.bytes);
  const manager=createModelManager({getUserDataPath:()=>dir,trustedKeys,appVersion:()=>"1.7.214",
   dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[output]})}});
  const selected=await manager.select();
  const installed=await manager.install(selected.token);
  assert.equal(installed.installed,true);
  const profile=await manager.resolveRuntime();
  assert.equal(profile.installed,true);assert.equal(profile.version,"1.0.0");
  assert(profile.files.binary.path.endsWith("llama-server.exe"));
  assert(profile.files.model.path.endsWith("model.gguf"));
  assert.equal(profile.gpuLayers,12);
  console.log("Offline Qwen publisher PASS: pinned source hashes, GGUF/PE guard, ZIP bytes, signature, signed catalog, manager install & runtime");
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
run().catch(err=>{console.error(err);process.exitCode=1});
