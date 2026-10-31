"use strict";
/* IR Project AI, stage 1: local drawing storage only. No model inference. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const EXTENSIONS=new Set([".pdf",".dxf",".dwg",".png",".jpg",".jpeg",".tif",".tiff"]);
const MAX_FILE_BYTES=200*1024*1024,MAX_FILES=30;
// The engineer states the kind of each drawing; it decides what the montage steps read from it. КМД is one kind: its
// montage and assembly sheets the program tells apart itself, sheet by sheet (the engineer, 31.10.2026). A file given
// one of the two old kinds before shows as КМД; the old kind stays in it as a hint for its sheets that say nothing.
const KINDS=["КМ","КМД","АР","ТХ","Не анализировать"],LEGACY={"КМД сборочные":"КМД","КМД монтажные":"КМД"};
function createStore({getUserDataPath,dialog,shell,database,getWindow=()=>undefined}){
 if(typeof getUserDataPath!=="function"||!database)throw Error("AI document store needs local userData and database");
 const root=()=>path.join(getUserDataPath(),"ir-project-ai","objects");
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
 // The work types of a drawing: the list when it has several, else the one.
 const workIds=d=>{const l=Array.isArray(d?.work_type_ids)?d.work_type_ids.map(String).filter(Boolean):[];return l.length?[...new Set(l)]:d?.work_type_id?[String(d.work_type_id)]:[]};
 function publicRow(id,row){
  const data=row.data||{};let exists=false;
  try{exists=fs.statSync(safeFile(id,data.stored_name)).isFile()}catch{}
  return{id:row.id,name:String(data.original_name||row.title||""),
   kind:LEGACY[data.kind]||(KINDS.includes(data.kind)?data.kind:"Не определён"),...(LEGACY[data.kind]?{kindHint:data.kind}:{}),
   ext:String(data.extension||""),size:Number(data.size)||0,
   sha256:String(data.sha256||""),addedAt:row.created_at,exists,
   pages:Number(data.page_count)||null,excluded:Array.isArray(data.excluded_pages)?data.excluded_pages:[],
   workTypeId:workIds(data)[0]||"",workTypeIds:workIds(data),status:"Не распознано"}
 }
 function setKinds(id,items){
  id=objectId(id);
  if(!Array.isArray(items)||items.length>2000)throw Error("Некорректный список документов");
  let changed=0;
  for(const item of items){
   if(!KINDS.includes(item?.kind)&&!LEGACY[item?.kind])throw Error("Неизвестный тип чертежа: "+String(item?.kind||""));
   const row=record(id,item.id);
   if(row.data?.kind===item.kind||LEGACY[row.data?.kind]===item.kind)continue;
   database.updateEntity(id,"ai-documents",row.id,{record_type:row.record_type,title:row.title,data:{...row.data,kind:item.kind}});changed++
  }
  return{changed,documents:list(id)}
 }
 // The work types of the object each drawing belongs to (section «Виды работ»): its elements are placed under them, the
 // montage scheme shows each work type apart. Empty — the program's own «Монтаж металлоконструкций (из PDF)».
 // Several (the engineer, 31.10.2026: «в АР идет Монтаж окон, сэндвич-панелей, дверей и ворот»): each element goes to
 // the one that names its kind (src/ai-structure-types.js workTypeFor); work_type_id keeps the first, as before.
 function setWorkTypes(id,items){
  id=objectId(id);
  if(!Array.isArray(items)||items.length>2000)throw Error("Некорректный список документов");
  const works=new Set(database.listEntity(id,"work-types").map(w=>String(w.id)));
  let changed=0;
  for(const item of items){
   const asked=Array.isArray(item?.workTypeIds)?item.workTypeIds:[item?.workTypeId??""];
   const chosen=[...new Set(asked.map(w=>String(w??"")).filter(Boolean))].slice(0,20);
   if(chosen.some(w=>!works.has(w)))throw Error("Вид работ не найден у этого объекта");
   const row=record(id,item?.id);
   if(workIds(row.data||{}).join(",")===chosen.join(","))continue;
   const data={...row.data};delete data.work_type_ids;delete data.work_type_id;
   if(chosen.length){data.work_type_id=chosen[0];if(chosen.length>1)data.work_type_ids=chosen}
   database.updateEntity(id,"ai-documents",row.id,{record_type:row.record_type,title:row.title,data});changed++
  }
  return{changed,documents:list(id)}
 }
 // Sheets left out of the analysis, by page number.
 function setExcluded(id,documentId,pages){
  id=objectId(id);const row=record(id,documentId);
  if(!Array.isArray(pages)||pages.length>5000||pages.some(n=>!Number.isSafeInteger(n)||n<1))throw Error("Некорректный список листов");
  const excluded=[...new Set(pages)].sort((a,b)=>a-b);
  database.updateEntity(id,"ai-documents",row.id,{record_type:row.record_type,title:row.title,data:{...row.data,excluded_pages:excluded}});
  return publicRow(id,record(id,documentId))
 }
 // Sheet names read from the stamps, kept until the file changes.
 function sheets(id,documentId){
  id=objectId(id);const data=record(id,documentId).data||{};
  return data.sheets?.sha256===data.sha256?data.sheets.list:null
 }
 function saveSheets(id,documentId,list){
  id=objectId(id);const row=record(id,documentId);
  database.updateEntity(id,"ai-documents",row.id,{record_type:row.record_type,title:row.title,
   data:{...row.data,page_count:list.length,sheets:{sha256:row.data?.sha256||"",list}}});
  return list
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
 async function select(id,kind="Не определён"){
  id=objectId(id);kind=LEGACY[kind]||(KINDS.includes(kind)?kind:"Не определён");
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
 function remove(id,documentId){
  id=objectId(id);const row=record(id,documentId);
  const file=safeFile(id,row.data?.stored_name);
  // Refuse to follow symlinks, including those that could be created externally.
  if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error("Символьная ссылка запрещена");
  if(!database.deleteEntity(id,"ai-documents",row.id))return false;
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
 return{list,select,setKinds,setWorkTypes,setExcluded,sheets,saveSheets,open,remove,deleteObjectFiles,readForAnalysis,readForPdfIndex};
}
module.exports={createStore,EXTENSIONS,MAX_FILE_BYTES,KINDS};
