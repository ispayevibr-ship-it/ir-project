"use strict";
/* Offline publisher for an operator-provided Qwen3-VL 4B release.
   No network, no embedded private keys and no fake model artifacts. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {pipeline}=require("node:stream/promises");
const yauzl=require("yauzl"),yazl=require("yazl");
const MAX_BYTES=16*1024**3,MAX_ENTRIES=300;
const hashBuffer=x=>crypto.createHash("sha256").update(x).digest("hex");
function validPath(p){return typeof p==="string"&&p.length<=180&&!p.includes("\\")&&!p.startsWith("/")&&
 p.split("/").every(part=>part&&part!=="."&&part!==".."&&/^[A-Za-z0-9_.-]+$/.test(part))}
async function checksum(file){const h=crypto.createHash("sha256");
 for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest("hex")}
function plainFile(file){const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error("Символическая ссылка или каталог запрещены: "+file);
 return stat}
function checkMagic(file,type,strictSizes=true){
 const stat=plainFile(file);
 const min=type==="model"?1_000_000_000:type==="vision"?50_000_000:1024;
 if(strictSizes&&stat.size<min)throw Error("Неправдоподобно маленький "+type+"; отказ от упаковки тестового файла");
 const h=Buffer.alloc(4),fd=fs.openSync(file,"r");
 try{fs.readSync(fd,h,0,4,0)}finally{fs.closeSync(fd)}
 if(type==="model"||type==="vision"){
  if(h.toString("latin1")!=="GGUF")throw Error("Файл "+type+" не содержит заголовок GGUF");
 }else if(h[0]!==0x4d||h[1]!==0x5a)throw Error("llama-server.exe не является PE/Windows executable (нет MZ)");
 return stat
}
function collectWindowsRuntime(runtimeDir,{strictSizes=true}={}){
 const stat=fs.lstatSync(runtimeDir);
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("Папка Windows llama.cpp не найдена");
 const base=fs.realpathSync(runtimeDir),entries=[];
 function walk(rel,depth){
  if(depth>3)throw Error("Слишком глубокая структура DLL в папке llama.cpp");
  const names=fs.readdirSync(path.join(base,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name));
  for(const dirent of names){
   if(dirent.isSymbolicLink())throw Error("Запрещена ссылка в составе движка: "+dirent.name);
   const sub=rel?rel+"/"+dirent.name:dirent.name,full=path.join(base,...sub.split("/"));
   if(dirent.isDirectory()){walk(sub,depth+1);continue}
   if(!dirent.isFile())throw Error("Необычный файл в составе runtime: "+sub);
   if(!validPath(sub))throw Error("Неподдерживаемое имя файла: "+sub);
   if(sub==="llama-server.exe"||/\.dll$/i.test(sub)){
    plainFile(full);entries.push({relative:"bin/"+sub,file:full})
   }
  }
 }
 walk("",0);
 const exe=entries.find(x=>x.relative==="bin/llama-server.exe");
 if(!exe)throw Error("В папке не найден llama-server.exe");
 checkMagic(exe.file,"binary",strictSizes);
 if(strictSizes&&!entries.some(x=>/\.dll$/i.test(x.relative)))
  throw Error("Не найдены DLL из комплекта llama.cpp — исполняемая среда неполная");
 if(entries.length>MAX_ENTRIES-2)throw Error("Слишком много файлов runtime");
 return entries
}
async function verifyBuiltArchive(filename,publicKey){
 const zip=await new Promise((resolve,reject)=>yauzl.open(filename,{
  lazyEntries:true,decodeStrings:true,validateEntrySizes:true,autoClose:true},(err,v)=>err?reject(err):resolve(v)));
 const entries=new Map();let manifestBytes=null,signatureBytes=null,total=0,count=0;
 await new Promise((resolve,reject)=>{
  let done=false;
  const fail=e=>{if(done)return;done=true;try{zip.close()}catch{}reject(e)};
  zip.on("error",fail);
  zip.on("end",()=>{if(done)return;done=true;resolve()});
  zip.on("entry",async entry=>{
   try{
    if(++count>MAX_ENTRIES+2||!validPath(entry.fileName))throw Error("Неправильные записи архива");
    const mode=(entry.externalFileAttributes>>>16)&0o170000;
    if(mode===0o120000)throw Error("Архив содержит ссылку");
    const key=entry.fileName.toLowerCase();
    if(entries.has(key))throw Error("Архив содержит повторный файл");
    if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize>MAX_BYTES)
     throw Error("Недопустимый размер в архиве");
    total+=entry.uncompressedSize;
    if(total>MAX_BYTES)throw Error("Архив превышает допустимый размер");
    const stream=await new Promise((res,rej)=>zip.openReadStream(entry,(err,v)=>err?rej(err):res(v)));
    const hash=crypto.createHash("sha256"),chunks=[];
    let size=0;
    for await(const c of stream){
     size+=c.length;if(size>entry.uncompressedSize)throw Error("Размер записи неверен");
     hash.update(c);
     if(entry.fileName==="manifest.json"||entry.fileName==="manifest.sig"){
      if(size>65536)throw Error("Слишком длинный манифест/подпись");
      chunks.push(c)
     }
    }
    if(size!==entry.uncompressedSize)throw Error("Запись ZIP не полностью прочитана");
    entries.set(key,{sha256:hash.digest("hex"),bytes:size});
    if(entry.fileName==="manifest.json")manifestBytes=Buffer.concat(chunks);
    if(entry.fileName==="manifest.sig")signatureBytes=Buffer.concat(chunks);
    zip.readEntry()
   }catch(error){fail(error)}
  });
  zip.readEntry()
 });
 if(!manifestBytes||!signatureBytes)throw Error("Не хватает подписи или манифеста");
 const manifest=JSON.parse(manifestBytes.toString("utf8"));
 const key=publicKey?.type==="public"?publicKey:crypto.createPublicKey(publicKey);
 if(key.asymmetricKeyType!=="ed25519"||!crypto.verify(null,manifestBytes,key,Buffer.from(signatureBytes.toString().trim(),"base64")))
  throw Error("Подпись манифеста не подтверждена");
 // The signed publisher supports precisely these two preapproved engines.
 // A valid Ed25519 signature alone cannot authorize an arbitrary executable.
 const allowed={"qwen3-vl-4b":"llama.cpp","paddleocr-vl-1.6":"paddleocr"};
 if(manifest.schema!==1||allowed[manifest.modelId]!==manifest.engine||
  !Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>MAX_ENTRIES||
  !/^[A-Za-z0-9_.-]{1,70}$/.test(String(manifest.keyId||""))||
  !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(String(manifest.version||"")))
  throw Error("Неподдерживаемый подписанный манифест модели");
 if(manifest.modelId==="paddleocr-vl-1.6"){
  const rt=manifest.runtime||{};
  if(rt.protocol!=="ir-paddleocr-vl-json-1"||
   rt.binary!=="bin/paddleocr-worker.exe"||
   rt.layout!=="models/layout"||rt.vision!=="models/vl"||
   !manifest.files.some(f=>f.path===rt.binary)||
   !manifest.files.some(f=>f.path.startsWith(rt.layout+"/"))||
   !manifest.files.some(f=>f.path.startsWith(rt.vision+"/")))
   throw Error("OCR-манифест не содержит подписанный worker и обе модели");
 }
 if(manifest.modelId==="qwen3-vl-4b"){
  const rt=manifest.runtime||{};
  if(rt.binary!=="bin/llama-server.exe"||
   rt.model!=="model/model.gguf"||rt.vision!=="model/mmproj.gguf")
   throw Error("Qwen-манифест не содержит ожидаемую среду исполнения");
 }
 if(entries.size!==manifest.files.length+2)throw Error("Неподписанные дополнительные файлы в ZIP");
 for(const f of manifest.files){
  const item=entries.get(("files/"+f.path).toLowerCase());
  if(!item||item.bytes!==f.bytes||item.sha256!==f.sha256)throw Error("Не прошла проверка SHA-256: "+f.path)
 }
 return{verified:true,manifest,total}
}
function requireHex(value,label){
 if(typeof value!=="string"||!/^[a-f0-9]{64}$/i.test(value))throw Error("Нужен SHA-256 источника: "+label);
 return value.toLowerCase()
}
async function createQwenPack(options={}){
 const {runtimeDir,modelFile,visionFile,output,keyFile,keyId,version,
  modelSha256,visionSha256,binarySha256,gpuLayers=0,minAppVersion="1.7.214",
  strictSizes=true,upstream={}}=options;
 if(!/^1\.\d+\.\d+$/.test(version||""))throw Error("Укажите версию модели формата 1.0.0");
 if(!/^[A-Za-z0-9_.-]{1,70}$/.test(keyId||""))throw Error("Неверный идентификатор подписывающего ключа");
 if(!/^\d+\.\d+\.\d+$/.test(minAppVersion)||!Number.isSafeInteger(gpuLayers)||gpuLayers<0||gpuLayers>99)
  throw Error("Некорректные параметры совместимости или GPU");
 if(!output||path.extname(output)!==".ir-ai-pack"||fs.existsSync(output))
  throw Error("Укажите новый путь для пакета .ir-ai-pack; перезапись запрещена");
 if(!keyFile)throw Error("Нужен путь к закрытому Ed25519-ключу вне репозитория");
 const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile));
 if(privateKey.asymmetricKeyType!=="ed25519")throw Error("Поддерживаются только Ed25519-ключи");
 const publicKey=crypto.createPublicKey(privateKey).export({format:"pem",type:"spki"});
 const model=checkMagic(modelFile,"model",strictSizes),vision=checkMagic(visionFile,"vision",strictSizes);
 const runtime=collectWindowsRuntime(runtimeDir,{strictSizes});
 const source=[...runtime,{relative:"model/model.gguf",file:modelFile},{relative:"model/mmproj.gguf",file:visionFile}];
 const expected=new Map([
  ["model/model.gguf",requireHex(modelSha256,"Qwen3-VL GGUF")],
  ["model/mmproj.gguf",requireHex(visionSha256,"Qwen3-VL mmproj")],
  ["bin/llama-server.exe",requireHex(binarySha256,"llama-server.exe")]
 ]);
 let sum=0;const files=[];
 for(const f of source){
  const stat=plainFile(f.file);
  sum+=stat.size;if(sum>MAX_BYTES)throw Error("Пакет превышает 16 ГиБ");
  const actual=await checksum(f.file);
  if(expected.has(f.relative)&&actual!==expected.get(f.relative))
   throw Error("SHA-256 исходного файла не совпадает: "+f.relative);
  files.push({path:f.relative,bytes:stat.size,sha256:actual})
 }
 const backend=gpuLayers?"cuda":"cpu";
 const manifest={
  schema:1,modelId:"qwen3-vl-4b",version,engine:"llama.cpp",keyId,minAppVersion,
  runtime:{binary:"bin/llama-server.exe",model:"model/model.gguf",vision:"model/mmproj.gguf",gpuLayers,backend},
  upstream:{modelRepository:String(upstream.modelRepository||"").slice(0,200),
   modelRevision:String(upstream.modelRevision||"").slice(0,100),
   runtimeRepository:String(upstream.runtimeRepository||"").slice(0,200),
   runtimeRelease:String(upstream.runtimeRelease||"").slice(0,100)},
  files
 };
 const raw=Buffer.from(JSON.stringify(manifest));
 const signature=Buffer.from(crypto.sign(null,raw,privateKey).toString("base64"));
 const part=output+".incomplete-"+crypto.randomUUID();
 try{
  const zip=new yazl.ZipFile();
  zip.addBuffer(raw,"manifest.json",{compress:false});
  zip.addBuffer(signature,"manifest.sig",{compress:false});
  for(const f of source)zip.addFile(f.file,"files/"+f.relative,{compress:false});
  zip.end();
  await pipeline(zip.outputStream,fs.createWriteStream(part,{flags:"wx",mode:0o600}));
  const checked=await verifyBuiltArchive(part,publicKey);
  if(!checked.verified)throw Error("Проверка собранного архива не прошла");
  fs.renameSync(part,output);
  return{path:output,bytes:fs.statSync(output).size,sha256:await checksum(output),
   keyId,publicKeyPem:publicKey,publicKeyFingerprint:hashBuffer(crypto.createPublicKey(publicKey).export({format:"der",type:"spki"})),
   version,modelId:"qwen3-vl-4b",manifest}
 }finally{try{fs.rmSync(part,{force:true})}catch{}}
}
module.exports={createQwenPack,verifyBuiltArchive,collectWindowsRuntime,checksum};
