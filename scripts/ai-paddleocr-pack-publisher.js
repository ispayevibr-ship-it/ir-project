"use strict";
/* Offline PaddleOCR-VL 1.6 publisher. Requires operator-supplied, locally
 * assembled Windows worker and official model trees; never downloads files. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const yazl=require("yazl"),{pipeline}=require("node:stream/promises");
const {verifyBuiltArchive,checksum}=require("./ai-pack-publisher");
const LIMIT=16*1024**3,MAX_FILES=300;
const validPath=p=>typeof p==="string"&&p.length<=180&&!p.includes("\\")&&
 !p.startsWith("/")&&p.split("/").every(v=>v&&v!=="."&&v!==".."&&
 /^[A-Za-z0-9_.-]+$/.test(v));
const hex=v=>typeof v==="string"&&/^[0-9a-f]{64}$/i.test(v);
function isFile(p){
 const s=fs.lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size<1)throw Error("Файл OCR отсутствует или является ссылкой: "+p);
 return s
}
function readPins(filename,label){
 const parsed=JSON.parse(fs.readFileSync(filename,"utf8"));
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("Неверный список SHA-256 "+label);
 const pins=new Map(),keys=Object.keys(parsed);
 if(!keys.length||keys.length>MAX_FILES)throw Error("Пустой или слишком большой список SHA-256 "+label);
 for(const [relative,sha] of Object.entries(parsed)){
  if(!validPath(relative)||!hex(sha))throw Error("Недопустимый SHA-256 "+label+": "+relative);
  const key=relative.toLowerCase();
  if(pins.has(key))throw Error("Повтор имени файла в перечне "+label);
  pins.set(key,sha.toLowerCase())
 }
 return pins
}
function collectTree(directory,prefix,pins){
 const root=fs.lstatSync(directory);
 if(!root.isDirectory()||root.isSymbolicLink())throw Error("Недопустимый каталог модели: "+prefix);
 const base=fs.realpathSync(directory),files=[];
 function walk(rel,depth){
  if(depth>6)throw Error("Слишком глубокая структура OCR-модели");
  for(const ent of fs.readdirSync(path.join(base,rel),{withFileTypes:true})){
   const sub=rel?rel+"/"+ent.name:ent.name;
   if(!validPath(sub)||ent.isSymbolicLink())throw Error("Опасный путь модели: "+sub);
   const file=path.join(base,...sub.split("/"));
   if(ent.isDirectory()){walk(sub,depth+1);continue}
   if(!ent.isFile())throw Error("Недопустимая запись модели: "+sub);
   isFile(file);
   const key=sub.toLowerCase();
   if(!pins.has(key))throw Error("Файл не включён в закреплённые хэши: "+prefix+"/"+sub);
   files.push({file,relative:prefix+"/"+sub,expected:pins.get(key)})
   if(files.length>MAX_FILES)throw Error("Превышено число файлов в OCR-модели")
  }
 }
 walk("",0);
 if(files.length!==pins.size||!files.length)
  throw Error("Отсутствуют файлы из закреплённого списка "+prefix);
 return files
}
async function createPaddlePack(options={}){
 const {workerFile,workerSha256,layoutDir,layoutPinsFile,visionDir,visionPinsFile,
  output,keyFile,keyId,version,minAppVersion="1.7.214",strictSizes=true,upstream={}}=options;
 if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(String(version||""))||
  !/^\d+\.\d+\.\d+$/.test(String(minAppVersion||"")))
  throw Error("Неверная версия OCR или минимальная версия приложения");
 if(!/^[A-Za-z0-9_.-]{1,70}$/.test(String(keyId||"")))
  throw Error("Не задан корректный идентификатор издателя");
 if(!output||path.extname(output)!==".ir-ai-pack"||fs.existsSync(output))
  throw Error("Укажите новый файл .ir-ai-pack: перезапись запрещена");
 if(!keyFile||!hex(workerSha256))throw Error("Требуются закрытый ключ вне репозитория и SHA-256 worker exe");
 if(!workerFile||!layoutDir||!layoutPinsFile||!visionDir||!visionPinsFile)
  throw Error("Нужны локальный worker и оба полных комплекта весов с закреплёнными SHA-256");
 const privateKey=crypto.createPrivateKey(fs.readFileSync(keyFile));
 if(privateKey.asymmetricKeyType!=="ed25519")throw Error("Для подписи требуется Ed25519");
 const publicKey=crypto.createPublicKey(privateKey);
 const workerStat=isFile(workerFile),head=Buffer.alloc(2),fd=fs.openSync(workerFile,"r");
 try{fs.readSync(fd,head,0,2,0)}finally{fs.closeSync(fd)}
 if(head.toString("ascii")!=="MZ"||(strictSizes&&workerStat.size<10_000_000))
  throw Error("paddleocr-worker.exe не является проверенной полноценной Windows-сборкой");
 const source=[
  {file:workerFile,relative:"bin/paddleocr-worker.exe",expected:workerSha256.toLowerCase()},
  ...collectTree(layoutDir,"models/layout",readPins(layoutPinsFile,"layout")),
  ...collectTree(visionDir,"models/vl",readPins(visionPinsFile,"vision"))
 ];
 if(source.length>MAX_FILES)throw Error("Слишком много файлов в PaddleOCR-пакете");
 let total=0;const files=[],sizeByModel={layout:0,vision:0};
 for(const entry of source){
  const stat=isFile(entry.file);total+=stat.size;
  if(total>LIMIT)throw Error("PaddleOCR-пакет больше 16 ГиБ");
  const digest=await checksum(entry.file);
  if(digest!==entry.expected)throw Error("SHA-256 локального файла не совпадает: "+entry.relative);
  files.push({path:entry.relative,bytes:stat.size,sha256:digest});
  if(entry.relative.startsWith("models/layout/"))sizeByModel.layout+=stat.size;
  if(entry.relative.startsWith("models/vl/"))sizeByModel.vision+=stat.size
 }
 if(strictSizes&&(sizeByModel.layout<1_000_000||sizeByModel.vision<30_000_000))
  throw Error("Весовые файлы OCR неправдоподобно малы: не публикуйте пустой пакет");
 const manifest={
  schema:1,modelId:"paddleocr-vl-1.6",version,engine:"paddleocr",keyId,minAppVersion,
  runtime:{protocol:"ir-paddleocr-vl-json-1",binary:"bin/paddleocr-worker.exe",
   layout:"models/layout",vision:"models/vl"},
  upstream:{paddleocrVersion:String(upstream.paddleocrVersion||"").slice(0,70),
   paddlepaddleVersion:String(upstream.paddlepaddleVersion||"").slice(0,70),
   modelRevision:String(upstream.modelRevision||"").slice(0,120)},
  files
 };
 const raw=Buffer.from(JSON.stringify(manifest));
 if(raw.length>65536)throw Error("Манифест PaddleOCR превышает лимит менеджера моделей");
 const signature=Buffer.from(crypto.sign(null,raw,privateKey).toString("base64"));
 const part=output+".incomplete-"+crypto.randomUUID();
 try{
  const zip=new yazl.ZipFile();
  zip.addBuffer(raw,"manifest.json",{compress:false});
  zip.addBuffer(signature,"manifest.sig",{compress:false});
  for(const entry of source)zip.addFile(entry.file,"files/"+entry.relative,{compress:false});
  zip.end();
  await pipeline(zip.outputStream,fs.createWriteStream(part,{flags:"wx",mode:0o600}));
  const verified=await verifyBuiltArchive(part,publicKey);
  if(!verified.verified||verified.manifest.modelId!=="paddleocr-vl-1.6")
   throw Error("Собранный OCR-пакет не прошёл проверку");
  fs.renameSync(part,output);
  const der=publicKey.export({format:"der",type:"spki"});
  return{path:output,bytes:fs.statSync(output).size,sha256:await checksum(output),
   keyId,version,modelId:"paddleocr-vl-1.6",manifest,
   publicKeyPem:publicKey.export({format:"pem",type:"spki"}),
   publicKeyFingerprint:crypto.createHash("sha256").update(der).digest("hex")}
 }finally{try{fs.rmSync(part,{force:true})}catch{}}
}
module.exports={createPaddlePack,readPins,collectTree};
