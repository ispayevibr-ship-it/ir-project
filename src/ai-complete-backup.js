"use strict";
/* Complete IR Project backup: SQLite + exact AI originals, images and acts.
 * Restore validates the archive and SQLite references before touching live data.
 * No AI weights, download cache or secret keys are included.
 */
const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),
 crypto=require("node:crypto"),{pipeline}=require("node:stream/promises"),
 yauzl=require("yauzl"),yazl=require("yazl"),{DatabaseSync}=require("node:sqlite");
const ROOTS=["ir-project-ai/objects","images","report-documents"];
const DB="ir-project.db",MAX_FILES=30000,MAX_BYTES=50*1024**3;
const regex=/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
function allowed(name){return typeof name==="string"&&name.length<=320&&
 regex.test(name)&&!name.split("/").some(x=>x==="."||x==="..")&&
 (name===DB||ROOTS.some(root=>name.startsWith(root+"/")))}
async function digest(file){
 const h=crypto.createHash("sha256");
 for await(const chunk of fs.createReadStream(file))h.update(chunk);
 return h.digest("hex")
}
function collectFiles(userData,staged){
 const output=[];let size=0;
 function add(relative,original){
  if(!allowed(relative)||output.length>=MAX_FILES)throw Error("Недопустимый файл резервной копии");
  const stat=fs.lstatSync(original);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error("Вложения содержат символическую ссылку или не файл: "+relative);
  size+=stat.size;if(size>MAX_BYTES)throw Error("Слишком большой объём резервной копии");
  const dest=path.join(staged,...relative.split("/"));
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(original,dest,fs.constants.COPYFILE_EXCL);
  output.push({path:relative,bytes:stat.size,file:dest})
 }
 add(DB,path.join(userData,DB));
 const scan=(relative,depth=0)=>{
  if(depth>12)throw Error("Слишком глубокий каталог вложений");
  const folder=path.join(userData,...relative.split("/"));
  if(!fs.existsSync(folder))return;
  const stat=fs.lstatSync(folder);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error("Небезопасный каталог: "+relative);
  for(const ent of fs.readdirSync(folder,{withFileTypes:true})){
   const next=relative+"/"+ent.name;
   if(!allowed(next)||ent.isSymbolicLink())throw Error("Запрещённое имя или ссылка: "+next);
   if(ent.isDirectory())scan(next,depth+1);
   else if(ent.isFile())add(next,path.join(folder,ent.name));
   else throw Error("Необычный файл: "+next)
  }
 };
 for(const root of ROOTS)scan(root);
 return output
}
function validateDatabase(folder){
 const file=path.join(folder,DB);
 if(!fs.existsSync(file))throw Error("В архиве отсутствует SQLite");
 let db;
 try{
  db=new DatabaseSync(file,{readOnly:true});
  const result=db.prepare("PRAGMA integrity_check").get();
  if(Object.values(result||{})[0]!=="ok")throw Error("SQLite повреждена");
  const schema=db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get();
  if(schema?.value!=="4")throw Error("Несовместимая версия базы в резервной копии");
  const rows=db.prepare("SELECT object_id,data_json FROM object_records WHERE section_key='ai-documents' AND record_type='document'").all();
  for(const row of rows){
   let data;try{data=JSON.parse(row.data_json)}catch{throw Error("Повреждена запись исходного чертежа")}
   const name=data?.stored_name,oid=Number(row.object_id);
   if(!Number.isSafeInteger(oid)||oid<1||
    !/^[a-f0-9]{32}\.(pdf|dxf|dwg|png|jpg|jpeg|tif|tiff)$/i.test(String(name||"")))
    throw Error("В базе найден недопустимый путь исходного чертежа");
   const rel="ir-project-ai/objects/"+oid+"/"+name;
   const file=path.join(folder,...rel.split("/"));
   if(!fs.existsSync(file)||fs.statSync(file).size!==data.size)
    throw Error("Отсутствует оригинал КМ/КМД: "+rel);
   const hash=crypto.createHash("sha256");
   const fd=fs.openSync(file,"r"),buf=Buffer.allocUnsafe(1024*1024);
   try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null))>0)hash.update(buf.subarray(0,n))}
   finally{fs.closeSync(fd)}
   if(hash.digest("hex")!==String(data.sha256||"").toLowerCase())
    throw Error("SHA-256 оригинального чертежа не совпадает: "+rel)
  }
  return{sourceDocuments:rows.length}
 }finally{db?.close()}
}
async function pack({userData,destination,closeDatabase,openDatabase}){
 if(!userData||!destination||typeof closeDatabase!=="function"||typeof openDatabase!=="function")
  throw Error("Не задана согласованная резервная копия IR Project");
 const full=path.resolve(destination),home=path.resolve(userData);
 if(full.startsWith(home+path.sep))throw Error("Архив нужно сохранять вне каталога данных IR Project");
 if(fs.existsSync(full))throw Error("Архив уже существует. Выберите другое имя");
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-complete-backup-"));
 const snapshot=path.join(temp,"data");fs.mkdirSync(snapshot);
 const output=full+".incomplete-"+crypto.randomUUID();
 try{
  let files;
  // Blocking copy while the DB is closed yields one stable local snapshot;
  // every other Electron IPC is paused until the DB is reopened.
  closeDatabase();
  try{files=collectFiles(home,snapshot)}
  finally{openDatabase()}
  validateDatabase(snapshot);
  const entries=[];
  for(const row of files)entries.push({path:row.path,bytes:row.bytes,sha256:await digest(row.file)});
  const manifest={format:"ir-project-complete-v1",createdAt:new Date().toISOString(),
   includes:ROOTS,files:entries};
  const encoded=Buffer.from(JSON.stringify(manifest));
  if(encoded.length>2*1024*1024)throw Error("Манифест резервной копии слишком большой");
  const zip=new yazl.ZipFile();
  zip.addBuffer(encoded,"manifest.json",{compress:false});
  for(const row of files)zip.addFile(row.file,row.path,{compress:false});
  zip.end();
  await pipeline(zip.outputStream,fs.createWriteStream(output,{flags:"wx",mode:0o600}));
  await inspect({archive:output});
  fs.renameSync(output,full);
  return{created:true,files:files.length,sourceDocuments:validateDatabase(snapshot).sourceDocuments}
 }finally{
  try{fs.rmSync(output,{force:true})}catch{}
  fs.rmSync(temp,{force:true,recursive:true})
 }
}
async function unpackArchive(archive,folder){
 const input=path.resolve(archive),stat=fs.lstatSync(input);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)
  throw Error("Недопустимый файл резервной копии");
 const zip=await new Promise((ok,no)=>yauzl.open(input,{lazyEntries:true,autoClose:true,validateEntrySizes:true},
  (e,v)=>e?no(e):ok(v)));
 const seen=new Set(),actual=new Map();let total=0,count=0,encoded=null;
 await new Promise((ok,no)=>{
  let done=false;
  const fail=e=>{if(done)return;done=true;try{zip.close()}catch{}no(e)};
  zip.on("error",fail);
  zip.on("end",()=>{if(!done){done=true;ok()}});
  zip.on("entry",async entry=>{
   try{
    const name=entry.fileName,key=name.toLowerCase();
    if(++count>MAX_FILES+1||seen.has(key)||
      name!=="manifest.json"&&!allowed(name)||name.endsWith("/")||
      ((entry.externalFileAttributes>>>16)&0o170000)===0o120000)
     throw Error("Недопустимый или повторный путь внутри архива");
    seen.add(key);
    if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize>MAX_BYTES||
     (total+=entry.uncompressedSize)>MAX_BYTES)
     throw Error("Архив превышает ограничения");
    const stream=await new Promise((ok,no)=>zip.openReadStream(entry,(e,v)=>e?no(e):ok(v)));
    let bytes=0;const h=crypto.createHash("sha256");
    if(name==="manifest.json"){
     if(entry.uncompressedSize>2*1024*1024)throw Error("Недопустимый манифест");
     const chunks=[];
     for await(const data of stream){bytes+=data.length;h.update(data);chunks.push(data)}
     encoded=Buffer.concat(chunks)
    }else{
     const target=path.join(folder,...name.split("/"));
     fs.mkdirSync(path.dirname(target),{recursive:true});
     stream.on("data",data=>{bytes+=data.length;h.update(data)});
     await pipeline(stream,fs.createWriteStream(target,{flags:"wx",mode:0o600}))
    }
    if(bytes!==entry.uncompressedSize)throw Error("Недостаточно байтов ZIP: "+name);
    actual.set(name,{bytes,sha256:h.digest("hex")});
    zip.readEntry()
   }catch(e){fail(e)}
  });
  zip.readEntry()
 });
 let manifest;try{manifest=JSON.parse(String(encoded||""))}catch{throw Error("Повреждён манифест резервной копии")}
 if(manifest?.format!=="ir-project-complete-v1"||
  !Array.isArray(manifest.files)||manifest.files.length!==actual.size-1)
  throw Error("Неверная версия или неполный состав архива");
 const paths=new Set();
 for(const row of manifest.files){
  if(!row||!allowed(row.path)||paths.has(row.path.toLowerCase())||
   !Number.isSafeInteger(row.bytes)||row.bytes<0||
   !/^[a-f0-9]{64}$/.test(String(row.sha256||"")))
   throw Error("Недостоверные сведения о файлах архива");
  const match=actual.get(row.path);
  if(!match||match.bytes!==row.bytes||match.sha256!==row.sha256)
   throw Error("SHA-256/размер вложения не совпадает: "+row.path);
  paths.add(row.path.toLowerCase())
 }
 if(!paths.has(DB))throw Error("В архиве отсутствует база данных");
 return{manifest,...validateDatabase(folder)}
}
async function inspect({archive}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ir-verify-backup-"));
 try{return await unpackArchive(archive,temp)}
 finally{fs.rmSync(temp,{recursive:true,force:true})}
}
async function restore({archive,userData,closeDatabase,openDatabase}){
 const home=path.resolve(userData);
 const staging=fs.mkdtempSync(path.join(home,".ir-restore-"));
 const rollback=fs.mkdtempSync(path.join(home,".ir-rollback-"));
 const names=[DB,...ROOTS],moved=[],installed=[];
 try{
  const reviewed=await unpackArchive(archive,staging);
  closeDatabase();
  try{
   for(const name of names){
    const live=path.join(home,...name.split("/"));
    if(fs.existsSync(live)){
     const old=path.join(rollback,...name.split("/"));
     fs.mkdirSync(path.dirname(old),{recursive:true});
     fs.renameSync(live,old);moved.push(name)
    }
   }
   for(const name of names){
    const src=path.join(staging,...name.split("/"));
    if(!fs.existsSync(src))continue;
    const dest=path.join(home,...name.split("/"));
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.renameSync(src,dest);installed.push(name)
   }
   openDatabase();
  }catch(error){
   try{closeDatabase()}catch{}
   for(const name of installed.reverse())
    try{fs.rmSync(path.join(home,...name.split("/")),{recursive:true,force:true})}catch{}
   for(const name of moved.reverse()){
    const old=path.join(rollback,...name.split("/"));
    const dest=path.join(home,...name.split("/"));
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.renameSync(old,dest)
   }
   openDatabase();
   throw error
  }
  return{restored:true,sourceDocuments:reviewed.sourceDocuments,files:reviewed.manifest.files.length}
 }finally{
  fs.rmSync(staging,{recursive:true,force:true});
  fs.rmSync(rollback,{recursive:true,force:true})
 }
}
module.exports={pack,restore,inspect,validateDatabase,allowed};
