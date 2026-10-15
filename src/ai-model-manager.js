"use strict";
/* IR Project AI signed offline model-pack manager.
   No trusted publisher keys have been provisioned for production. Fail closed. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const yauzl=require("yauzl"),{pipeline}=require("node:stream/promises");
const CATALOG=Object.freeze([
 {id:"paddleocr-vl-1.6",title:"PaddleOCR-VL 1.6",role:"OCR и таблицы",engine:"paddleocr"},
 {id:"qwen3-vl-4b",title:"Qwen3-VL 4B",role:"Анализ чертежей",engine:"llama.cpp"}
]);
const TRUSTED_MODEL_KEYS=Object.freeze({}); // Official Ed25519 public keys are not published yet.
const ARCHIVE_LIMIT=16*1024**3,TOTAL_LIMIT=22*1024**3,ENTRY_LIMIT=300;
function createModelManager({getUserDataPath,dialog,getWindow=()=>undefined,
 trustedKeys=TRUSTED_MODEL_KEYS,appVersion=()=>"1.7.211",engineActive=()=>false}={}){
 if(typeof getUserDataPath!=="function")throw Error("Model manager requires userData path");
 const root=()=>path.join(getUserDataPath(),"ir-project-ai","model-manager");
 const manifestPath=()=>path.join(root(),"state.json");
 const selections=new Map();let mutation=false;
 const ensure=()=>fs.mkdirSync(root(),{recursive:true});
 const known=id=>CATALOG.find(m=>m.id===id);
 function version(v){return typeof v==="string"&&/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(v)&&v.length<60}
 function compare(a,b){const parts=v=>v.split("-",1)[0].split(".").map(Number);const x=parts(a),y=parts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0}
 function fileName(v){return typeof v==="string"&&v.length<=180&&!v.includes("\\")&&!/[:\x00-\x1f]/.test(v)&&
  !v.startsWith("/")&&v.split("/").every(s=>s&&s!=="."&&s!==".."&&/^[A-Za-z0-9_.-]+$/.test(s))}
 function slot(id,v){if(!known(id)||!version(v))throw Error("Недопустимая модель или версия");return path.join(root(),"models",id,v)}
 function readState(){ensure();try{const s=JSON.parse(fs.readFileSync(manifestPath(),"utf8"));return s?.format===1&&s.models&&typeof s.models==="object"?s:{format:1,models:{}}}catch(error){if(error.code==="ENOENT")return{format:1,models:{}};throw Error("Повреждён реестр моделей; установка заблокирована: "+error.message)}}
 function writeState(value){ensure();const temp=path.join(root(),".state-"+crypto.randomUUID()+".tmp");try{fs.writeFileSync(temp,JSON.stringify(value),{flag:"wx",mode:0o600});fs.renameSync(temp,manifestPath())}finally{try{fs.rmSync(temp,{force:true})}catch{}}}
 function validateManifest(m){
  if(!m||m.schema!==1||!known(m.modelId)||!version(m.version)||
   m.engine!==known(m.modelId).engine||!Array.isArray(m.files)||!m.files.length||m.files.length>ENTRY_LIMIT)
   throw Error("Неподдерживаемый манифест модели");
  if(!/^[A-Za-z0-9_.-]{1,70}$/.test(String(m.keyId||"")))throw Error("Нет идентификатора подписи");
  if(m.minAppVersion&&(!version(m.minAppVersion)||compare(appVersion(),m.minAppVersion)<0))
   throw Error("Пакету требуется более новая версия IR Project");
  const seen=new Set();let size=0;
  for(const f of m.files){
   if(!fileName(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>TOTAL_LIMIT||
    !/^[0-9a-f]{64}$/i.test(String(f.sha256||"")))throw Error("Неправильный файл в манифесте");
   const key=f.path.toLowerCase();if(seen.has(key))throw Error("Повторяющиеся файлы пакета");
   seen.add(key);size+=f.bytes;if(size>TOTAL_LIMIT)throw Error("Размер пакета превышает ограничения");
  }
  return size
 }
 function validateEntry(entry,seen){
  const name=entry.fileName;
  if(!fileName(name))throw Error("Опасное имя файла внутри архива: "+name);
  const mode=(entry.externalFileAttributes>>>16)&0o170000;
  if(mode===0o120000)throw Error("Символические ссылки запрещены");
  const key=name.toLowerCase();if(seen.has(key))throw Error("Повторяющаяся запись ZIP");
  seen.add(key);
  if(entry.uncompressedSize>TOTAL_LIMIT||!Number.isSafeInteger(entry.uncompressedSize))throw Error("Слишком большой ZIP-файл");
  if(name!=="manifest.json"&&name!=="manifest.sig"&&!name.startsWith("files/"))
   throw Error("Лишний файл в пакете");
 }
 function zipOpen(filename){
  return new Promise((resolve,reject)=>yauzl.open(filename,{lazyEntries:true,decodeStrings:true,
   validateEntrySizes:true,autoClose:true},(err,z)=>err?reject(err):resolve(z)))
 }
 function stream(z,entry){return new Promise((resolve,reject)=>z.openReadStream(entry,(e,s)=>e?reject(e):resolve(s)))}
 async function toBuffer(stream,max){
  const chunks=[];let length=0;
  for await(const c of stream){length+=c.length;if(length>max){stream.destroy();throw Error("Превышен допустимый размер служебного файла")}chunks.push(c)}
  return Buffer.concat(chunks)
 }
 async function scanZip(filename,{extractTo=null}={}){
  if(fs.statSync(filename).size>ARCHIVE_LIMIT)throw Error("Архив превышает лимит 16 ГиБ");
  const z=await zipOpen(filename),seen=new Set();let count=0,total=0,raw,signature;
  const extracted=new Map();
  return new Promise((resolve,reject)=>{
   let finished=false;
   function fail(e){if(finished)return;finished=true;try{z.close()}catch{}reject(e)}
   z.on("error",fail);
   z.on("end",()=>{if(!finished){finished=true;resolve({raw,signature,seen,total,extracted})}});
   z.on("entry",async entry=>{
    try{
     if(++count>ENTRY_LIMIT+2)throw Error("Слишком много файлов в архиве");
     validateEntry(entry,seen);total+=entry.uncompressedSize;
     if(total>TOTAL_LIMIT)throw Error("Архив слишком большой в распакованном виде");
     const name=entry.fileName;
     if(name==="manifest.json"||name==="manifest.sig"){
      const data=await toBuffer(await stream(z,entry),name==="manifest.json"?65536:1024);
      if(name==="manifest.json")raw=data;else signature=data;
     }else if(extractTo){
      const relative=name.slice(6);
      if(!relative||!fileName(relative))throw Error("Неверный путь модели");
      const target=path.join(extractTo,"files",...relative.split("/"));
      fs.mkdirSync(path.dirname(target),{recursive:true});
      await pipeline(await stream(z,entry),fs.createWriteStream(target,{flags:"wx",mode:0o600}));
      extracted.set(relative,{size:fs.statSync(target).size,path:target})
     }
     z.readEntry()
    }catch(error){fail(error)}
   });
   z.readEntry()
  })
 }
 function authenticate(raw,signature){
  if(!raw||!signature)throw Error("В пакете отсутствует манифест или подпись");
  if(raw.length>65536||signature.length>1024)throw Error("Слишком большой файл подписи");
  const m=JSON.parse(raw.toString("utf8"));const bytes=validateManifest(m);
  const publicKey=trustedKeys[m.keyId];
  if(!publicKey)throw Error("Неизвестная цифровая подпись: официальный ключ издателя не настроен");
  const encoded=signature.toString("utf8").trim();
  if(!/^[A-Za-z0-9+/]{86}==?$/.test(encoded))throw Error("Некорректная подпись Ed25519");
  const key=crypto.createPublicKey(publicKey);
  if(key.asymmetricKeyType!=="ed25519"||!crypto.verify(null,raw,key,Buffer.from(encoded,"base64")))
   throw Error("Цифровая подпись пакета не подтверждена");
  return{manifest:m,bytes}
 }
 async function preview(filename){
  const scanned=await scanZip(filename),verified=authenticate(scanned.raw,scanned.signature);
  const m=verified.manifest;
  const expected=new Set(["manifest.json","manifest.sig",...m.files.map(f=>("files/"+f.path).toLowerCase())]);
  if(scanned.seen.size!==expected.size||[...scanned.seen].some(p=>!expected.has(p)))
   throw Error("Состав архива отличается от подписанного манифеста");
  if(m.files.reduce((n,f)=>n+f.bytes,0)+scanned.raw.length+scanned.signature.length!==scanned.total)
   throw Error("Размеры файлов не совпадают с манифестом");
  if(fs.existsSync(slot(m.modelId,m.version)))throw Error("Версия уже установлена");
  return{modelId:m.modelId,title:known(m.modelId).title,version:m.version,
   engine:m.engine,downloadBytes:fs.statSync(filename).size,installedBytes:verified.bytes,
   keyId:m.keyId,signed:true}
 }
 async function select(){
  if(!dialog)throw Error("Системный диалог недоступен");
  const result=await dialog.showOpenDialog(getWindow(),{properties:["openFile"],
   title:"Выбрать подписанный пакет локальной ИИ-модели",
   filters:[{name:"IR Project AI package",extensions:["ir-ai-pack"]}]});
  if(result.canceled||!result.filePaths?.length)return null;
  const selected=await preview(result.filePaths[0]);
  const token=crypto.randomBytes(24).toString("hex");
  selections.clear();selections.set(token,{file:result.filePaths[0],...selected});
  return{token,...selected}
 }
 async function install(token){
  if(mutation)throw Error("Другая операция с моделями ещё выполняется");
  const selected=selections.get(String(token||""));if(!selected)throw Error("Сначала выберите пакет в системном окне");
  selections.delete(token);mutation=true;
  let staging="";
  try{
   if(engineActive())throw Error("Остановите работающий локальный ИИ перед установкой модели");
   const reviewed=await preview(selected.file);
   if(reviewed.modelId!==selected.modelId||reviewed.version!==selected.version||
    reviewed.downloadBytes!==selected.downloadBytes)throw Error("Пакет изменился после выбора");
   ensure();
   const statfs=typeof fs.statfsSync==="function"?fs.statfsSync(root()):null;
   if(statfs&&Number(statfs.bavail)*Number(statfs.bsize)<reviewed.installedBytes*1.15+100*1024*1024)
    throw Error("Недостаточно свободного места для безопасной установки");
   staging=path.join(root(),".staging-"+crypto.randomUUID());
   fs.mkdirSync(staging,{recursive:false});
   const extracted=await scanZip(selected.file,{extractTo:staging});
   const verified=authenticate(extracted.raw,extracted.signature);
   const m=verified.manifest;
   if(m.modelId!==selected.modelId||m.version!==selected.version)throw Error("Непредвиденная смена пакета");
   if(extracted.extracted.size!==m.files.length)throw Error("Неполный комплект модели");
   for(const item of m.files){
    const f=extracted.extracted.get(item.path);
    if(!f||f.size!==item.bytes)throw Error("Повреждён файл модели: "+item.path);
    const sha=crypto.createHash("sha256");
    for await(const chunk of fs.createReadStream(f.path))sha.update(chunk);
    if(sha.digest("hex")!==item.sha256.toLowerCase())throw Error("SHA-256 не совпадает: "+item.path)
   }
   // Save verified manifest + detached signature in installed slot for rollback validation.
   fs.writeFileSync(path.join(staging,"manifest.json"),extracted.raw,{flag:"wx"});
   fs.writeFileSync(path.join(staging,"manifest.sig"),extracted.signature,{flag:"wx"});
   const destination=slot(m.modelId,m.version);
   fs.mkdirSync(path.dirname(destination),{recursive:true});
   fs.renameSync(staging,destination);staging="";
   const state=readState(),old=state.models[m.modelId]||{};
   state.models[m.modelId]={active:m.version,previous:old.active&&old.active!==m.version?old.active:old.previous||null};
   writeState(state);
   return{installed:true,...reviewed,previous:state.models[m.modelId].previous};
  }finally{
   if(staging)try{fs.rmSync(staging,{recursive:true,force:true})}catch{}
   mutation=false
  }
 }
 async function verifySlot(modelId,v){
  const folder=slot(modelId,v),raw=fs.readFileSync(path.join(folder,"manifest.json")),
   sig=fs.readFileSync(path.join(folder,"manifest.sig")),record=authenticate(raw,sig);
  if(record.manifest.modelId!==modelId||record.manifest.version!==v)throw Error("Подмена установленной модели");
  for(const item of record.manifest.files){
   const f=path.join(folder,"files",...item.path.split("/"));
   const stat=fs.lstatSync(f),real=fs.realpathSync(f),base=fs.realpathSync(path.join(folder,"files"));
   if(stat.isSymbolicLink()||!stat.isFile()||!real.startsWith(base+path.sep)||
     stat.size!==item.bytes)throw Error("Неверный файл модели: "+item.path);
   const sha=crypto.createHash("sha256");
   for await(const chunk of fs.createReadStream(f))sha.update(chunk);
   if(sha.digest("hex")!==item.sha256.toLowerCase())throw Error("Повреждён файл модели: "+item.path)
  }
  return record.bytes
 }
 async function rollback(id){
  if(mutation)throw Error("Менеджер моделей занят");
  if(engineActive())throw Error("Остановите локальный ИИ перед откатом");
  if(!known(id))throw Error("Неизвестная модель");
  mutation=true;
  try{
   const state=readState(),item=state.models[id],previous=item?.previous;
   if(!previous)throw Error("Нет предыдущей версии для отката");
   await verifySlot(id,previous);
   const now=item.active;item.active=previous;item.previous=now;
   writeState(state);
   return{modelId:id,active:previous,previous:now};
  }finally{mutation=false}
 }
 function list(){
  const state=readState();return CATALOG.map(model=>{
   const row=state.models[model.id]||{};
   const versions=fs.existsSync(path.join(root(),"models",model.id))?
    fs.readdirSync(path.join(root(),"models",model.id),{withFileTypes:true}).filter(x=>x.isDirectory()&&version(x.name)).map(x=>x.name).sort().reverse():[];
   let installedBytes=0;
   if(row.active&&versions.includes(row.active)){
    try{
     const file=path.join(slot(model.id,row.active),"manifest.json");
     if(fs.statSync(file).size<=65536){
      const m=JSON.parse(fs.readFileSync(file,"utf8"));
      if(m.modelId===model.id&&m.version===row.active)installedBytes=validateManifest(m)
     }
    }catch{}
   }
   return{...model,active:row.active||null,previous:row.previous||null,versions,installedBytes,
    state:row.active?"Установлена (адаптер в разработке)":"Не установлена",
    canRollback:Boolean(row.previous&&versions.includes(row.previous))}
  })
 }
 function checkUpdates(){return{configured:false,available:[],reason:"Официальный подписанный каталог моделей пока не опубликован. Автозагрузка отключена.",checkedAt:new Date().toISOString()}}
 function info(){return{models:list(),update:checkUpdates(),signedImportAvailable:Object.keys(trustedKeys).length>0,
  packExtension:".ir-ai-pack",busy:mutation}}
 return{list,info,select,install,rollback,checkUpdates,preview,verifySlot};
}
module.exports={createModelManager,CATALOG,TRUSTED_MODEL_KEYS};
