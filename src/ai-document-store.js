"use strict";
/* IR Project AI, stage 1: local drawing storage only. No model inference. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const EXTENSIONS=new Set([".pdf",".dxf",".dwg",".png",".jpg",".jpeg",".tif",".tiff"]);
const MAX_FILE_BYTES=200*1024*1024,MAX_FILES=30;
function createStore({getUserDataPath,dialog,shell,database,getWindow=()=>undefined}){
 if(typeof getUserDataPath!=="function"||!database)throw Error("AI document store needs local userData and database");
 const root=()=>path.join(getUserDataPath(),"ir-project-ai","objects");
 // Cache a verified hash only while file metadata and stored digest are unchanged.
 const verifiedFiles=new Map();
 function objectId(id){const value=Number(id);if(!Number.isSafeInteger(value)||value<=0||!database.getObject(value))throw Error("Объект не найден");return value}
 function directory(id){return path.join(root(),String(objectId(id)))}
 function safeFile(id,name){
  if(!/^[a-f0-9]{32}\.(pdf|dxf|dwg|png|jpg|jpeg|tif|tiff)$/i.test(String(name||"")))throw Error("Недопустимое имя файла ИИ");
  return path.join(directory(id),name)
 }
 function record(id,documentId){
  const row=database.getEntity(objectId(id),"ai-documents",Number(documentId));
  if(!row||row.record_type!=="document")throw Error("Чертёж не найден");
  return row
 }
 function publicRow(id,row){
  const data=row.data||{};let exists=false;
  try{exists=fs.statSync(safeFile(id,data.stored_name)).isFile()}catch{}
  return{id:row.id,name:String(data.original_name||row.title||""),
   kind:["КМ","КМД"].includes(data.kind)?data.kind:"Не определён",
   ext:String(data.extension||""),size:Number(data.size)||0,
   sha256:String(data.sha256||""),addedAt:row.created_at,exists,
   status:"Не распознано"}
 }
 function list(id){
  id=objectId(id);
  return database.listEntity(id,"ai-documents").filter(x=>x.record_type==="document").map(x=>publicRow(id,x))
 }
 function fingerprint(file){return new Promise((resolve,reject)=>{
  const hash=crypto.createHash("sha256"),stream=fs.createReadStream(file);
  stream.on("data",chunk=>hash.update(chunk));stream.on("error",reject);
  stream.on("end",()=>resolve(hash.digest("hex")))
 })}
 // Read the actual bytes; a DB-stored SHA alone does not prove the PDF still matches.
 // Incremental hashing bounds memory use for large drawing packages.
 function verify(id,documentId){
  id=objectId(id);
  const row=record(id,documentId),expected=String(row.data?.sha256||"").toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(expected))return false;
  const key=id+":"+row.id;
  let file,stat;
  try{file=resolveStored(id,row);stat=fs.statSync(file)}catch{return false}
  if(!stat.isFile()||stat.size!==Number(row.data?.size))return false;
  const signature=[file,stat.dev,stat.ino,stat.size,stat.mtimeMs,stat.ctimeMs,expected].join("|");
  const cached=verifiedFiles.get(key);
  if(cached?.signature===signature)return cached.valid;
  let fd=null,valid=false;
  try{
   const digest=crypto.createHash("sha256"),chunk=Buffer.allocUnsafe(1024*1024);
   fd=fs.openSync(file,"r");
   let count;
   while((count=fs.readSync(fd,chunk,0,chunk.length,null))>0)digest.update(chunk.subarray(0,count));
   const after=fs.fstatSync(fd);
   if(after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ctimeMs===stat.ctimeMs)
    valid=digest.digest("hex")===expected;
  }catch{return false}
  finally{if(fd!==null)try{fs.closeSync(fd)}catch{}}
  verifiedFiles.set(key,{signature,valid});
  return valid
 }
 async function select(id,kind="Не определён"){
  id=objectId(id);kind=["КМ","КМД"].includes(kind)?kind:"Не определён";
  const chosen=await dialog.showOpenDialog(getWindow(),{
   title:"Добавить чертежи в IR Project AI",properties:["openFile","multiSelections"],
   filters:[{name:"Строительные чертежи",extensions:[...EXTENSIONS].map(x=>x.slice(1))}]
  });
  if(chosen.canceled)return{canceled:true,imported:[],skipped:[],errors:[]};
  const files=(chosen.filePaths||[]).slice(0,MAX_FILES),imported=[],skipped=[],errors=[];
  const existing=new Set(list(id).map(x=>x.sha256+"|"+x.size));
  for(const source of files){
   let destination="";
   try{
    const ext=path.extname(source).toLowerCase(),stat=fs.lstatSync(source);
    if(!EXTENSIONS.has(ext)||!stat.isFile()||stat.isSymbolicLink())throw Error("Неподдерживаемый формат или тип файла");
    if(!stat.size||stat.size>MAX_FILE_BYTES)throw Error("Размер должен быть от 1 байта до 200 МБ");
    const stored_name=crypto.randomBytes(16).toString("hex")+ext;
    fs.mkdirSync(directory(id),{recursive:true});
    destination=safeFile(id,stored_name);
    await fs.promises.copyFile(source,destination,fs.constants.COPYFILE_EXCL);
    const copied=fs.statSync(destination);
    if(copied.size!==stat.size)throw Error("Размер скопированного файла не совпадает");
    const sha256=await fingerprint(destination),key=sha256+"|"+stat.size;
    if(existing.has(key)){
     fs.unlinkSync(destination);destination="";
     skipped.push(path.basename(source));continue
    }
    const row=database.createEntity(id,"ai-documents",{
     record_type:"document",title:path.basename(source),
     data:{original_name:path.basename(source),stored_name,extension:ext,
      kind,size:stat.size,sha256,analysis_status:"not_started"}
    });
    if(!row)throw Error("Не удалось зарегистрировать документ в SQLite");
    existing.add(key);imported.push(publicRow(id,row));destination="";
   }catch(error){
    if(destination)try{fs.unlinkSync(destination)}catch{}
    errors.push({name:path.basename(String(source)),error:String(error.message||error)})
   }
  }
  if((chosen.filePaths||[]).length>MAX_FILES)errors.push({name:"Комплект",error:"За один раз можно загрузить не более 30 файлов"});
  return{canceled:false,imported,skipped,errors}
 }
 function resolveStored(id,row){
  const file=safeFile(id,row.data?.stored_name);
  if(!fs.existsSync(file))throw Error("Файл отсутствует в локальном хранилище");
  const base=fs.realpathSync(directory(id)),real=fs.realpathSync(file);
  if(!real.startsWith(base+path.sep)||!fs.statSync(real).isFile())throw Error("Файл за пределами хранилища");
  return real
 }
 async function open(id,documentId){
  id=objectId(id);const file=resolveStored(id,record(id,documentId));
  const error=await shell.openPath(file);if(error)throw Error(error);
  return true
 }
 // Keep source originals whenever any recognized sheet, review, quantity, joint,
 // revision, or historical engineering decision still refers to the document.
 const evidenceSections=[
  "ai-drawing-sheet-links","ai-drawing-set-history","ai-pdf-index","ai-analysis",
  "ai-review-history","ai-structured-reviews","ai-structured-review-history",
  "ai-workflow-tasks","ai-workflow-events",
  "ai-mark-quantities","ai-mark-quantity-history","ai-kmd-materials",
  "ai-kmd-material-history","ai-kmd-joints","ai-kmd-joint-history",
  "ai-kmd-connection-items","ai-kmd-connection-item-history",
  "ai-km-kmd-comparison","ai-km-kmd-comparison-history",
  "ai-assembly-placement","ai-assembly-placement-history",
  "ai-assembly-attachments","ai-assembly-attachment-history",
  "ai-kmd-reference-rows","ai-kmd-reference-checks","ai-kmd-reference-history"
 ];
 function referencesDocument(value,documentId){
  const stack=[value],seen=new Set();let visited=0;
  while(stack.length){
   if(++visited>250000)throw Error("Слишком большой журнал ИИ; проверка удаления не завершена");
   const current=stack.pop();
   if(!current||typeof current!=="object"||seen.has(current))continue;
   seen.add(current);
   if(current.documentId!=null&&Number(current.documentId)===documentId)return true;
   for(const item of Object.values(current))if(item&&typeof item==="object")stack.push(item)
  }
  return false
 }
 function remove(id,documentId){
  id=objectId(id);const row=record(id,documentId);
  for(const section of evidenceSections){
   const linked=database.listEntity(id,section).find(item=>referencesDocument(item.data,row.id));
   if(linked)throw Error("Нельзя удалить исходный файл: он используется в разделе "+
    section+" (запись № "+linked.id+"). Сохраните оригинал и историю инженерных подтверждений")
  }
  const file=safeFile(id,row.data?.stored_name);
  // Refuse to follow symlinks, including those that could be created externally.
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error("Символьная ссылка запрещена");
  if(!database.deleteEntity(id,"ai-documents",row.id))return false;
  verifiedFiles.delete(id+":"+row.id);
  if(fs.existsSync(file))fs.unlinkSync(file);
  return true
 }
 function deleteObjectFiles(id){
  const value=Number(id);
  if(!Number.isSafeInteger(value)||value<=0)throw Error("Неверный номер объекта");
  fs.rmSync(path.join(root(),String(value)),{recursive:true,force:true});
 }
 async function readForAnalysis(id,documentId){
  id=objectId(id);const row=record(id,documentId),file=resolveStored(id,row);
  const ext=String(row.data?.extension||"").toLowerCase();
  if(![".png",".jpg",".jpeg"].includes(ext))throw Error("Для первого этапа локального анализа поддерживаются только PNG и JPG. PDF и DWG пока сохраняются без распознавания.");
  const stat=fs.statSync(file);
  if(stat.size>16*1024*1024)throw Error("Изображение превышает 16 МиБ; требуется уменьшение или обработка по фрагментам.");
  const buffer=await fs.promises.readFile(file);
  const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=buffer[0]===255&&buffer[1]===216&&buffer[buffer.length-2]===255&&buffer[buffer.length-1]===217;
  if(!png&&!jpg)throw Error("Файл не соответствует сигнатуре PNG/JPEG");
  const digest=crypto.createHash("sha256").update(buffer).digest("hex");
  if(digest!==row.data.sha256)throw Error("Файл отличается от загруженного оригинала (SHA-256)");
  return{buffer,mime:png?"image/png":"image/jpeg",
   source:{documentId:row.id,name:row.data.original_name,sha256:digest,kind:row.data.kind,bytes:buffer.length}};
 }
 async function readForPdfIndex(id,documentId){
  id=objectId(id);const row=record(id,documentId),file=resolveStored(id,row);
  if(row.data?.extension!==".pdf")throw Error("Индексация текстового слоя поддерживается только для PDF");
  const stat=fs.statSync(file);
  if(stat.size<16||stat.size>48*1024*1024)throw Error("Для индексации PDF требуется размер от 16 байт до 48 МиБ");
  const buffer=await fs.promises.readFile(file);
  if(!buffer.subarray(0,1024).includes(Buffer.from("%PDF-")))
   throw Error("Файл не содержит сигнатуру PDF");
  const sha256=crypto.createHash("sha256").update(buffer).digest("hex");
  if(sha256!==row.data.sha256)throw Error("Контрольная сумма PDF изменилась (SHA-256)");
  return{buffer,source:{documentId:row.id,name:row.data.original_name,
    sha256,kind:row.data.kind,bytes:buffer.length,format:"PDF"}}
 }
 return{list,select,open,remove,deleteObjectFiles,readForAnalysis,readForPdfIndex,verify};
}
module.exports={createStore,EXTENSIONS,MAX_FILE_BYTES};
