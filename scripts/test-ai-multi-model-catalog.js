"use strict";
/* DEFERRED FINAL-ACCEPTANCE CONTRACT. Fake archives only; never downloads AI models. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),yazl=require("yazl"),
 {pipeline}=require("node:stream/promises");
const {signCatalog,parse,releaseFile}=require("./sign-ai-catalog");
const {verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
const sha=data=>crypto.createHash("sha256").update(data).digest("hex");
async function archive(home,keyPair,keyId,modelId,version){
 const paddle=modelId==="paddleocr-vl-1.6";
 const files=paddle?{
  "bin/paddleocr-worker.exe":Buffer.from("MZ" + "paddle-worker-test"),
  "models/layout/layout.pdparams":Buffer.from("dummy layout"),
  "models/vl/model.safetensors":Buffer.from("dummy vision")
 }:{
  "bin/llama-server.exe":Buffer.from("MZ" + "llama-runtime-test"),
  "model/model.gguf":Buffer.from("GGUF" + "model-test"),
  "model/mmproj.gguf":Buffer.from("GGUF" + "vision-test")
 };
 const manifest={schema:1,modelId,version,
  engine:paddle?"paddleocr":"llama.cpp",keyId,minAppVersion:"1.7.217",
  runtime:paddle?{protocol:"ir-paddleocr-vl-json-1",
   binary:"bin/paddleocr-worker.exe",layout:"models/layout",vision:"models/vl"}:{
   binary:"bin/llama-server.exe",model:"model/model.gguf",vision:"model/mmproj.gguf"},
  files:Object.entries(files).map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:sha(bytes)}))
 };
 const signed=Buffer.from(JSON.stringify(manifest));
 const output=path.join(home,modelId+"-"+version+".ir-ai-pack");
 const z=new yazl.ZipFile();
 z.addBuffer(signed,"manifest.json",{compress:false});
 z.addBuffer(Buffer.from(crypto.sign(null,signed,keyPair.privateKey).toString("base64")),
  "manifest.sig",{compress:false});
 for(const [name,bytes] of Object.entries(files))
  z.addBuffer(bytes,"files/"+name,{compress:false});
 z.end();
 await pipeline(z.outputStream,fs.createWriteStream(output,{flags:"wx"}));
 assert((await verifyBuiltArchive(output,keyPair.publicKey)).verified);
 return output
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-dual-catalog-"));
 const keyPair=crypto.generateKeyPairSync("ed25519"),id="test-publisher";
 const keyFile=path.join(dir,"private.pem");
 fs.writeFileSync(keyFile,keyPair.privateKey.export({format:"pem",type:"pkcs8"}));
 try{
  const qwen=await archive(dir,keyPair,id,"qwen3-vl-4b","1.0.0");
  const paddle=await archive(dir,keyPair,id,"paddleocr-vl-1.6","1.2.0");
  const releases=[
   {pack:qwen,url:"https://models.example.invalid/qwen-1.0.0.ir-ai-pack"},
   {pack:paddle,url:"https://models.example.invalid/paddle-1.2.0.ir-ai-pack"}
  ];
  const output=path.join(dir,"both.json"),catalog=await signCatalog({
   releases,keyFile,keyId:id,output,now:()=>Date.parse("2026-10-15T11:30:00Z")
  });
  assert.equal(catalog.releases.length,2);
  assert.deepEqual(catalog.releases.map(x=>x.modelId),
   ["qwen3-vl-4b","paddleocr-vl-1.6"]);
  assert.equal(catalog.packSha256,null);
  const envelope=JSON.parse(fs.readFileSync(output,"utf8"));
  const raw=Buffer.from(envelope.payload,"base64");
  assert(crypto.verify(null,raw,keyPair.publicKey,Buffer.from(envelope.signature,"base64")));
  const signed=JSON.parse(raw.toString());
  assert.equal(signed.releases[0].sha256,await checksum(qwen));
  assert.equal(signed.releases[1].sha256,await checksum(paddle));
  assert.equal(new Set(signed.releases.map(x=>x.modelId)).size,2);
  const listPath=path.join(dir,"releases.json");
  fs.writeFileSync(listPath,JSON.stringify(releases));
  assert.equal(releaseFile(listPath).length,2);
  assert.equal(parse(["--releases-file",listPath,"--key-file",keyFile,
   "--key-id",id,"--out",output])["--releases-file"],listPath);
  assert.throws(()=>parse(["--pack",qwen,"--releases-file",listPath,
   "--key-file",keyFile,"--key-id",id,"--out",output]),/пару/);
  await assert.rejects(signCatalog({
   releases:[...releases,releases[0]],keyFile,keyId:id,
   output:path.join(dir,"duplicates.json")
  }),/Повторная версия/);
  await assert.rejects(signCatalog({
   releases:[releases[0],{...releases[1],url:"https://another.invalid/paddle.ir-ai-pack"}],
   keyFile,keyId:id,output:path.join(dir,"origin.json")
  }),/один доверенный HTTPS-источник/);
  await assert.rejects(signCatalog({
   releases:[releases[0],{...releases[1],url:"http://models.example.invalid/paddle.ir-ai-pack"}],
   keyFile,keyId:id,output:path.join(dir,"http.json")
  }),/только по HTTPS/);
  const other=crypto.generateKeyPairSync("ed25519");
  const foreign=await archive(dir,other,id,"paddleocr-vl-1.6","1.3.0");
  await assert.rejects(signCatalog({
   releases:[releases[0],{pack:foreign,url:releases[1].url}],
   keyFile,keyId:id,output:path.join(dir,"foreign.json")
  }),/Подпись/);
  const previous=await signCatalog({
   pack:qwen,url:releases[0].url,keyFile,keyId:id,
   output:path.join(dir,"single.json")
  });
  assert.equal(previous.releases.length,1);
  assert.equal(previous.modelId,"qwen3-vl-4b");
  assert.equal(previous.packSha256,await checksum(qwen));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(err=>{console.error(err);process.exitCode=1});
