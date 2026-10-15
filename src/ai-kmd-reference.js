"use strict";
const {createHash}=require("node:crypto");
/* Engineer-defined KMD reference positions, not an AI-generated completeness claim.
 * Every reference belongs to a sheet of an explicitly activated KMD drawing set.
 * Historical records remain immutable through an append-only change log.
 */
const TYPES=new Set(["mark","part","joint","component"]);
const STATUSES=new Set(["requires_review","confirmed","rejected"]);
const SCOPES=new Set(["fabrication","erection"]);
const CATEGORIES=new Set(["fastener","weld"]);
const normalize=v=>String(v??"").trim().replace(/\s+/g," ").toLocaleUpperCase("ru-RU");
function createKmdReference({database,revisions,quantities,materials,connections,
 clock=()=>new Date().toISOString()}={}){
 if(!database||!revisions||!quantities||!materials||!connections)
  throw Error("Эталон КМД требует SQLite, действующие ревизии и инженерные ведомости");
 const RECORDS="ai-kmd-reference-rows",CHECKS="ai-kmd-reference-checks",
  HISTORY="ai-kmd-reference-history";
 const obj=value=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))
   throw Error("Объект не найден");
  return n
 };
 const number=(value,name,{zero=false,max=1e9}={})=>{
  const n=Number(value);
  if(value==null||value===""||typeof value==="boolean"||
   !Number.isSafeInteger(n)||n<(zero?0:1)||n>max)
   throw Error("Неверное значение: "+name);
  return n
 };
 const str=(value,name,max=100,required=true)=>{
  if(typeof value!=="string")throw Error(name+": требуется текст");
  const t=value.trim().replace(/\s+/g," ");
  if(t.length>max||required&&!t)throw Error("Заполните поле «"+name+"»");
  return t
 };
 const role=ctx=>{if(!["admin","engineer"].includes(ctx?.role))
  throw Error("Эталонные позиции КМД может подтверждать только инженер или администратор")};
 const tx=fn=>{if(typeof database.transaction!=="function")
  throw Error("Необходима атомарная транзакция SQLite");return database.transaction(fn)};
 const stored=(o,section,type)=>database.listEntity(o,section).filter(x=>x.record_type===type);
 const refRow=(o,id)=>{
  const row=database.getEntity(o,RECORDS,number(id,"ID эталонной позиции"));
  if(!row||row.record_type!=="kmd_reference")throw Error("Эталонная позиция не найдена");
  return row
 };
 const checkRow=(o,sheetId,setId)=>{
  const matches=stored(o,CHECKS,"kmd_sheet_check")
   .filter(x=>Number(x.data?.sheetId)===sheetId&&Number(x.data?.setId)===setId);
  if(matches.length>1)
   throw Error("Обнаружены несколько актов проверки одного листа КМД. Необходимо устранить конфликт сохранённых записей");
  return matches[0]||null
 };
 // Signed sheet review is tied to an exact snapshot of *every* reference
 // record on that sheet, including rejected rows. A direct SQLite edit or
 // extra insert cannot leave a previous sign-off looking current.
 const sheetFingerprint=(o,setId,sheetId,cachedRows=null)=>{
  const rows=(cachedRows||stored(o,RECORDS,"kmd_reference"))
   .filter(x=>Number(x.data?.setId)===Number(setId)&&
    Number(x.data?.sheetId)===Number(sheetId))
   .map(x=>({id:x.id,data:x.data}))
   .sort((a,b)=>a.id-b.id);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex")
 };
 const activeSet=o=>{
  const set=revisions.active(o,"КМД");
  if(!set)return null;
  return{set,sheets:revisions.getSheets(o,set.id)}
 };
 const sheet=(o,id)=>{
  const active=activeSet(o);
  if(!active)throw Error("Сначала утвердите действующий комплект КМД");
  const sheetId=number(id,"ID листа КМД");
  const page=active.sheets.find(s=>s.id===sheetId);
  if(!page)throw Error("Лист не входит в действующий комплект КМД");
  if(!page.valid||!revisions.sourceState(o,{
   documentId:page.documentId,page:page.page,sha256:page.sha256,kind:"КМД"
  }).current)throw Error("Оригинальный лист КМД недоступен или его SHA-256 изменился");
  return{setId:active.set.id,setIssue:String(active.set.data?.issue||""),
   sheetId:page.id,sheetCode:page.sheetCode,documentId:page.documentId,
   page:page.page,sha256:page.sha256,kind:"КМД"}
 };
 const eligible=(o,d,active=activeSet(o),lookup=null,memo=null)=>{
  if(!active||Number(d.setId)!==active.set.id)return false;
  const page=lookup?lookup.get(Number(d.sheetId)):
   active.sheets.find(s=>s.id===Number(d.sheetId));
  if(!page||!page.valid||page.kind!=="КМД"||d.source?.kind!=="КМД"||
   page.documentId!==d.source?.documentId||
   page.page!==d.source?.page||page.sha256!==d.source?.sha256)return false;
  const sourceKey=page.documentId+":"+page.page+":"+page.sha256;
  if(memo?.has(sourceKey))return memo.get(sourceKey);
  const current=Boolean(revisions.sourceState(o,d.source).current);
  memo?.set(sourceKey,current);
  return current
 };
 const key=d=>[d.type,d.mark,d.cipher,d.secondaryCipher,
  d.type==="part"?d.position:"",
  d.type==="joint"||d.type==="component"?d.scope:"",
  d.type==="joint"||d.type==="component"?d.jointCode:"",
  d.type==="component"?d.category:"",
  d.type==="component"?d.kind:"",
  d.type==="component"?d.position:""].map(normalize).join("\u0001");
 const full=d=>({
  type:d.type,mark:d.mark,cipher:d.cipher,secondaryCipher:d.secondaryCipher,
  position:d.position||"",jointCode:d.jointCode||"",scope:d.scope||"",
  category:d.category||"",kind:d.kind||""
 });
 // Stored rows can predate this schema or be damaged. Never infer approval
 // from status alone when the physical KMD identity is incomplete/invalid.
 const identityValid=d=>{
  if(!TYPES.has(d.type)||typeof d.mark!=="string"||!d.mark.trim()||
   typeof d.cipher!=="string"||typeof d.secondaryCipher!=="string")return false;
  if(d.type==="part")
   return typeof d.position==="string"&&Boolean(d.position.trim());
  if(d.type==="joint"||d.type==="component"){
   if(!SCOPES.has(d.scope)||typeof d.jointCode!=="string"||
    !d.jointCode.trim())return false;
   if(d.type==="component")
    return CATEGORIES.has(d.category)&&typeof d.kind==="string"&&Boolean(d.kind.trim())&&
     typeof d.position==="string"&&Boolean(d.position.trim());
  }
  return true
 };
 const audit=(o,action,referenceId,previous,current,by)=>{
  const entry=database.createEntity(o,HISTORY,{
   record_type:"reference_change",parent_id:referenceId||null,
   title:action+" · эталон КМД",data:{action,referenceId:referenceId||null,
    previous:previous||null,current:current||null,reviewedBy:by,at:clock()}
  });
  if(!entry)throw Error("Не удалось записать историю эталона")
 };
 function list(id){
  const o=obj(id),active=activeSet(o),
   bySheet=new Map((active?.sheets||[]).map(x=>[x.id,x])),fresh=new Map();
  return stored(o,RECORDS,"kmd_reference").map(x=>{
   const d=x.data||{},sourceCurrent=eligible(o,d,active,bySheet,fresh);
   // Legacy/corrupted rows cannot become verified solely by having a
   // "confirmed" status flag. Keep them visible for engineering repair.
   const verificationValid=identityValid(d)&&
    Number.isSafeInteger(d.quantity)&&d.quantity>0&&
    Number.isSafeInteger(d.revision)&&d.revision>0&&
    ["admin","engineer"].includes(d.reviewedBy)&&
    typeof d.sourcePosition==="string"&&Boolean(d.sourcePosition.trim())&&
    typeof d.reviewedAt==="string"&&Boolean(d.reviewedAt.trim());
   return{id:x.id,...full(d),quantity:d.quantity??null,verificationValid,
    setId:d.setId??null,sheetId:d.sheetId??null,sheetCode:String(d.sheetCode||""),
    source:{...d.source},sourcePosition:String(d.sourcePosition||""),
    status:STATUSES.has(d.status)?d.status:"requires_review",
    current:sourceCurrent,approved:sourceCurrent&&d.status==="confirmed"&&verificationValid,
    revision:Number(d.revision)||0,comment:String(d.comment||""),
    reviewedBy:d.reviewedBy||null,reviewedAt:d.reviewedAt||null}
  })
 }
 function checks(id,loadedEntries=null){
  const o=obj(id),active=activeSet(o);
  if(!active)return{setId:null,setIssue:null,sheets:[],total:0,reviewed:0,allSheetsReviewed:false};
  const entries=loadedEntries||list(o),bySheet=new Map(),duplicatesBySheet=new Map(),
   seenKeys=new Map(),seenSiteJoints=new Map();
  for(const entry of entries){
   if(Number(entry.setId)!==active.set.id||entry.status==="rejected")continue;
   if(!bySheet.has(entry.sheetId))bySheet.set(entry.sheetId,[]);
   bySheet.get(entry.sheetId).push(entry);
   const identity=key(entry),previous=seenKeys.get(identity);
   if(previous){
    duplicatesBySheet.set(entry.sheetId,(duplicatesBySheet.get(entry.sheetId)||0)+1);
    duplicatesBySheet.set(previous.sheetId,(duplicatesBySheet.get(previous.sheetId)||0)+1)
   }else seenKeys.set(identity,entry);
   // Erection joints are physical object-wide connections, not per-mark
   // instances. The same code on two marks is not two different joints.
   if(entry.type==="joint"&&entry.scope==="erection"){
    const k=normalize(entry.jointCode),first=seenSiteJoints.get(k);
    if(first){
     duplicatesBySheet.set(entry.sheetId,(duplicatesBySheet.get(entry.sheetId)||0)+1);
     duplicatesBySheet.set(first.sheetId,(duplicatesBySheet.get(first.sheetId)||0)+1)
    }else seenSiteJoints.set(k,entry)
   }
  }
  const referenceRowsBySheet=new Map();
  for(const row of stored(o,RECORDS,"kmd_reference")){
   if(Number(row.data?.setId)!==active.set.id)continue;
   const sid=Number(row.data?.sheetId);
   if(!referenceRowsBySheet.has(sid))referenceRowsBySheet.set(sid,[]);
   referenceRowsBySheet.get(sid).push(row)
  }
  const checksBySheet=new Map();
  for(const check of stored(o,CHECKS,"kmd_sheet_check")){
   if(Number(check.data?.setId)!==active.set.id)continue;
   const sid=Number(check.data?.sheetId);
   if(checksBySheet.has(sid))
    throw Error("Обнаружены несколько актов проверки одного листа КМД. Требуется разбор конфликта");
   checksBySheet.set(sid,check)
  }
  const sheets=active.sheets.map(p=>{
   const check=checksBySheet.get(p.id),d=check?.data||{};
   const positions=bySheet.get(p.id)||[];
   const duplicatePositions=duplicatesBySheet.get(p.id)||0;
   const unresolved=positions.filter(e=>!e.approved).length;
   const current=Boolean(duplicatePositions===0&&p.valid&&d.status==="sealed"&&d.reviewedEntireSheet===true&&
    ["admin","engineer"].includes(d.reviewedBy)&&unresolved===0&&
    typeof d.fingerprint==="string"&&d.fingerprint.length===64&&
    d.fingerprint===sheetFingerprint(o,active.set.id,p.id,referenceRowsBySheet.get(p.id)||[])&&
    d.documentId===p.documentId&&d.sha256===p.sha256&&d.page===p.page);
   const reason=current?"":!p.valid?
    "Оригинальный PDF КМД изменён либо недоступен":
    duplicatePositions?"В эталоне повторяются физические позиции":
    unresolved?"Есть позиции без действующего подтверждения инженера":
    d.status==="sealed"?"Прежний акт не совпадает с текущим содержанием листа":
    "Не выполнена ручная проверка всего листа";
   return{...p,checked:current,
    status:current?"sealed":d.status==="sealed"?"needs_review":d.status||"not_started",
    storedStatus:d.status||"not_started",reason,
    revision:Number(d.revision)||0,checkedAt:d.reviewedAt||null,
    checkedBy:d.reviewedBy||null,comment:String(d.comment||""),
    totalPositions:positions.length,
    confirmedPositions:positions.filter(e=>e.approved).length,
    unresolved,duplicatePositions}
  });
  const reviewed=sheets.filter(x=>x.checked).length;
  return{setId:active.set.id,setIssue:String(active.set.data?.issue||""),
   sheets,total:sheets.length,reviewed,
   allSheetsReviewed:sheets.length>0&&reviewed===sheets.length}
 }
 function save(id,recordId,input,ctx={}){
  const o=obj(id);role(ctx);
  if(!input||!TYPES.has(input.type)||!STATUSES.has(input.status))
   throw Error("Выберите тип и статус эталонной позиции");
  const old=recordId==null?null:refRow(o,recordId),oldRevision=Number(old?.data?.revision)||0;
  if(input.expectedRevision!==oldRevision)throw Error("Позиция изменена в другом окне");
  const src=sheet(o,input.sheetId);
  if(old&&Number(old.data.setId)!==src.setId)
   throw Error("Эталон предыдущего комплекта архивный — создайте запись для действующего листа");
  const mark=str(input.mark,"Марка",80),cipher=str(input.cipher??"","Шифр",80,false),
   secondaryCipher=str(input.secondaryCipher??"","Второй шифр",80,false);
  const type=input.type;
  const position=type==="part"||type==="component"?
   str(input.position,"Позиция детали / метиза",100):"";
  const jointCode=type==="joint"||type==="component"?
   str(input.jointCode,"Обозначение узла",100):"";
  const scope=type==="joint"||type==="component"?
   str(input.scope,"Тип узла",20):"";
  const category=type==="component"?str(input.category,"Категория",20):"";
  const kind=type==="component"?str(input.kind,"Тип изделия / шва",50):"";
  if(scope&&!SCOPES.has(scope))throw Error("Выберите заводской либо монтажный узел");
  if(category&&!CATEGORIES.has(category))throw Error("Выберите метиз или сварной шов");
  const quantity=input.quantity==null||input.quantity===""?null:
   number(input.quantity,"Количество", {max:1000000});
  if(input.status==="confirmed"&&quantity===null)
   throw Error("Для подтверждения эталона необходимо точное количество с листа КМД");
  const data={type,mark,cipher,secondaryCipher,position,jointCode,scope,category,kind,
   quantity,sourcePosition:str(input.sourcePosition,"Позиция на листе",120),
   source:{documentId:src.documentId,sha256:src.sha256,kind:"КМД",page:src.page},
   setId:src.setId,sheetId:src.sheetId,sheetCode:src.sheetCode,
   status:input.status,revision:oldRevision+1,comment:str(input.comment??"","Примечание",1200,false),
   reviewedBy:ctx.role,reviewedAt:clock(),origin:"engineer_checked_kmd_sheet_specification"};
  const matches=list(o).filter(x=>x.id!==old?.id&&x.setId===src.setId&&
   x.status!=="rejected"&&key(x)===key(data));
  if(matches.length)throw Error("Эталонная позиция уже существует: № "+matches[0].id);
  return tx(()=>{
   if(old&&Number(refRow(o,old.id).data.revision)!==oldRevision)
    throw Error("Позиция изменена в другом окне");
   const currentSource=sheet(o,src.sheetId);
   if(currentSource.setId!==src.setId||currentSource.documentId!==src.documentId||
    currentSource.page!==src.page||currentSource.sha256!==src.sha256)
    throw Error("Комплект или оригинал КМД изменился во время сохранения");
   const conflicts=list(o).filter(x=>x.id!==old?.id&&x.setId===src.setId&&
    x.status!=="rejected"&&key(x)===key(data));
   if(conflicts.length)
    throw Error("Эталонная позиция уже существует: № "+conflicts[0].id);
   const payload={record_type:"kmd_reference",
    title:type+" / "+mark+" / "+(position||jointCode),data};
   const row=old?database.updateEntity(o,RECORDS,old.id,payload):
    database.createEntity(o,RECORDS,payload);
   if(!row)throw Error("Не удалось сохранить эталон");
   audit(o,"position_saved",row.id,old?.data,data,ctx.role);
   // Any change to a signed-off sheet revokes the check: never keep an old
   // "all positions reviewed" claim after an engineer edits the register.
   for(const sheetId of new Set([src.sheetId,old?.data?.sheetId].filter(Boolean))){
    const check=checkRow(o,sheetId,src.setId);
    if(check?.data?.status!=="sealed")continue;
    const invalid={...check.data,status:"needs_review",revision:(check.data.revision||0)+1,
     invalidatedAt:clock(),invalidatedBy:ctx.role};
    if(!database.updateEntity(o,CHECKS,check.id,{
     record_type:"kmd_sheet_check",title:check.title,data:invalid}))
     throw Error("Не удалось снять утверждение листа");
    audit(o,"sheet_check_invalidated",check.id,check.data,invalid,ctx.role)
   }
   return{...list(o).find(x=>x.id===row.id),historySaved:true}
  })
 }
 function seal(id,sheetId,expectedRevision,confirmation,ctx={}){
  const o=obj(id);role(ctx);
  if(confirmation?.reviewedEntireSheet!==true)
   throw Error("Нужно подтвердить ручную проверку полного состава выбранного листа");
  const comment=str(confirmation.comment,"Сведения о сверке с исходным листом",1200);
  if(comment.length<10)throw Error("Укажите способ проверки листа (минимум 10 символов)");
  const src=sheet(o,sheetId),old=checkRow(o,src.sheetId,src.setId),rev=Number(old?.data?.revision)||0;
  if(expectedRevision!==rev)throw Error("Акт проверки листа изменился. Обновите данные");
  const pending=list(o).filter(x=>x.setId===src.setId&&x.sheetId===src.sheetId&&
   x.status!=="rejected"&&!x.approved);
  if(pending.length)throw Error("Сначала проверьте все позиции листа: "+pending.length+" ожидают решения");
  const seen=new Map(),duplicates=new Set();
  for(const entry of list(o).filter(x=>x.setId===src.setId&&x.status!=="rejected")){
   const k=key(entry),previous=seen.get(k);
   if(previous){
    duplicates.add(entry.sheetId);
    duplicates.add(previous.sheetId)
   }else seen.set(k,entry)
  }
  if(duplicates.has(src.sheetId))
   throw Error("Нельзя утвердить лист: повторяются физические позиции эталона КМД");
  const data={setId:src.setId,sheetId:src.sheetId,sheetCode:src.sheetCode,
   documentId:src.documentId,page:src.page,sha256:src.sha256,
   status:"sealed",revision:rev+1,reviewedBy:ctx.role,reviewedAt:clock(),
   reviewedEntireSheet:true,comment,
   fingerprint:sheetFingerprint(o,src.setId,src.sheetId)};
  return tx(()=>{
   // Re-evaluate the source, optimistic revision and full sheet contents under
   // the same SQLite transaction that persists the engineer's signoff.
   const latest=sheet(o,src.sheetId);
   if(latest.setId!==src.setId||latest.documentId!==src.documentId||
    latest.page!==src.page||latest.sha256!==src.sha256)
    throw Error("Комплект или оригинал КМД изменился во время утверждения");
   const latestCheck=checkRow(o,src.sheetId,src.setId);
   if((Number(latestCheck?.data?.revision)||0)!==rev)
    throw Error("Акт проверки листа изменился. Обновите данные");
   const sheetStatus=checks(o).sheets.find(x=>x.id===src.sheetId);
   if(!sheetStatus||sheetStatus.unresolved>0||sheetStatus.duplicatePositions>0)
    throw Error("Нельзя утвердить лист: состав эталона изменился или требует проверки");
   const confirmedData={...data,fingerprint:sheetFingerprint(o,src.setId,src.sheetId)};
   const check=latestCheck?database.updateEntity(o,CHECKS,latestCheck.id,{
    record_type:"kmd_sheet_check",title:src.sheetCode,data:confirmedData}):
    database.createEntity(o,CHECKS,{record_type:"kmd_sheet_check",
     title:src.sheetCode,data:confirmedData});
   if(!check)throw Error("Не удалось сохранить акт сверки листа");
   audit(o,"sheet_sealed",check.id,latestCheck?.data,confirmedData,ctx.role);
   return{sheetId:src.sheetId,checked:true,revision:confirmedData.revision}
  })
 }
 function history(id,recordId){
  const o=obj(id),ref=refRow(o,recordId);
  return stored(o,HISTORY,"reference_change").filter(x=>x.data?.referenceId===ref.id)
   .map(x=>({id:x.id,...x.data}))
 }
 function compare(id,loaded=null){
  const o=obj(id),ledger=loaded?.entries||list(o),review=loaded?.checks||checks(o,ledger);
  const entries=ledger.filter(x=>x.approved),marks=quantities.list(o),
   details=materials.list(o),nodes=connections.listNodes(o),components=connections.listComponents(o);
  const issues=[],affected=[];
  const register=(code,label,entry,actual,expected,actualRecord=null,reason="")=>{
   const message={code,label,referenceId:entry.id,type:entry.type,
    mark:entry.mark,cipher:entry.cipher,secondaryCipher:entry.secondaryCipher,
    position:entry.position||entry.jointCode,
    sheetCode:entry.sheetCode,expected,actual,
    sourceDocumentId:entry.source?.documentId??null,sourcePage:entry.source?.page??null,
    reason:String(reason||""),actualId:actualRecord?.id??null,assemblyId:actualRecord?.assemblyId??null,
    jointId:actualRecord?.jointId??null};
   issues.push(message);affected.push(entry.id)
  };
  // Index verified engineering rows once. KMD packages may contain thousands
  // of repeated references to the same mark, part and fastening position.
  const indexed=(rows,toKey)=>{
   const map=new Map();
   for(const row of rows){
    const k=toKey(row);
    if(!map.has(k))map.set(k,[]);
    map.get(k).push(row)
   }
   return map
  };
  const markIdentity=row=>[row.mark,row.cipher,row.secondaryCipher].map(normalize).join("\u0001");
  const partIdentity=row=>row.assemblyId+"\u0001"+normalize(row.position);
  const jointIdentity=row=>row.assemblyId+"\u0001"+row.scope+"\u0001"+normalize(row.jointCode);
  const componentIdentity=row=>row.jointId+"\u0001"+row.category+"\u0001"+
   normalize(row.kind)+"\u0001"+normalize(row.position);
  const confirmedMarks=marks.filter(x=>x.status==="confirmed"&&x.sourceValid&&
   Number.isSafeInteger(x.quantity)&&x.quantity>0);
  // Existing unapproved ledger rows are not missing positions. Link the
  // engineer to the exact draft or stale row instead of suggesting a duplicate.
  const activeRows=rows=>rows.filter(x=>x.status!=="rejected");
  const marksByName=indexed(confirmedMarks,markIdentity),
   allMarksByName=indexed(activeRows(marks),markIdentity),
   detailsByMark=indexed(details.filter(x=>x.counted),partIdentity),
   allDetailsByMark=indexed(activeRows(details),partIdentity),
   jointsByMark=indexed(nodes.filter(x=>x.counted),jointIdentity),
   allJointsByMark=indexed(activeRows(nodes),jointIdentity),
   itemsByJoint=indexed(components.filter(x=>x.counted),componentIdentity),
   allItemsByJoint=indexed(activeRows(components),componentIdentity);
  for(const entry of entries){
   const markMatches=marksByName.get(markIdentity(entry))||[];
   const markCandidates=allMarksByName.get(markIdentity(entry))||[];
   // A confirmed row cannot silently mask a second pending/stale row with
   // the same physical identity. Resolve all active duplicates first.
   if(markMatches.length!==1||markCandidates.length!==1){
    const candidates=markCandidates;
    if(markMatches.length===0&&candidates.length===1)
     register("unverified_mark","Отправочная марка внесена, но не подтверждена",
      entry,"Не подтверждено",entry.quantity,candidates[0],
      candidates[0].reason||"Количество марки или исходный лист требуют проверки");
    else register(markMatches.length||candidates.length>1?"ambiguous_mark":"missing_mark",
     markMatches.length||candidates.length>1?"Повторные отправочные марки":"Нет отправочной марки в ведомости",
     entry,markMatches.length||candidates.length||null,entry.quantity);
    continue
   }
   const mark=markMatches[0];
   let found=[],candidates=[],parentAmbiguous=false;
   if(entry.type==="mark"){found=[mark];candidates=markCandidates}
   else if(entry.type==="part"){
    const k=mark.id+"\u0001"+normalize(entry.position);
    found=detailsByMark.get(k)||[];
    candidates=allDetailsByMark.get(k)||[]
   }else if(entry.type==="joint"){
    const k=mark.id+"\u0001"+entry.scope+"\u0001"+normalize(entry.jointCode);
    found=jointsByMark.get(k)||[];
    candidates=allJointsByMark.get(k)||[]
   }else{
    const k=mark.id+"\u0001"+entry.scope+"\u0001"+normalize(entry.jointCode);
    const parents=allJointsByMark.get(k)||[];
    parentAmbiguous=parents.length>1;
    const keyForItem=parent=>parent.id+"\u0001"+entry.category+
     "\u0001"+normalize(entry.kind)+"\u0001"+normalize(entry.position);
    found=parents.filter(x=>x.counted).flatMap(parent=>itemsByJoint.get(keyForItem(parent))||[]);
    candidates=parents.flatMap(parent=>allItemsByJoint.get(keyForItem(parent))||[])
   }
   if(found.length!==1||candidates.length!==1||parentAmbiguous){
    if(found.length===0&&candidates.length===1&&!parentAmbiguous)
     register("unverified_position","Позиция внесена, но не подтверждена",
      entry,"Не подтверждено",entry.quantity,candidates[0],
      candidates[0].reason||"Позиция или её родительский узел требуют проверки");
    else register(found.length>1||candidates.length>1||parentAmbiguous?
     "ambiguous_position":"missing_position",
     found.length>1||candidates.length>1||parentAmbiguous?
      "Повторные позиции в ведомости":"Позиция отсутствует в инженерной ведомости",
     entry,found.length||candidates.length||null,entry.quantity);
    continue
   }
   const value=found[0],actual=entry.type==="mark"?value.quantity:
    entry.type==="part"?value.partCount:
    entry.type==="joint"?(entry.scope==="erection"?value.siteOccurrences:value.occurrencesPerAssembly):
    value.perJoint;
   if(actual!==entry.quantity)register("quantity_mismatch","Количество отличается от эталона",
    entry,actual,entry.quantity,value)
  }
  // Object-wide site joints must not be counted again under another mark.
  // A per-mark comparison alone can miss this physical duplicate because
  // both local entries appear unique and correctly entered.
  const markById=new Map(marks.map(x=>[x.id,x])),seenErectionJoints=new Map();
  for(const joint of nodes.filter(x=>x.status!=="rejected"&&x.scope==="erection")){
   const k=normalize(joint.jointCode),first=seenErectionJoints.get(k);
   if(!first){seenErectionJoints.set(k,joint);continue}
   const mark=markById.get(joint.assemblyId);
   register("duplicate_erection_joint","Повторный монтажный стык объекта",{
    id:null,type:"joint",mark:mark?.mark||joint.assemblyMark||"",
    cipher:mark?.cipher||"",secondaryCipher:mark?.secondaryCipher||"",
    jointCode:joint.jointCode,sheetCode:"—",source:joint.source||{}
   },joint.instances,null,joint,
   "Стык с таким обозначением уже зарегистрирован в узле № "+first.id+
   ". Проверьте область соединения и исключите двойной физический учёт.")
  }
  // Only flag unlisted *actual* positions after every active KMD sheet has
  // been explicitly reviewed. Before that point the reference is preliminary.
  const extras=[];
  if(review.allSheetsReviewed){
   const referenceKeys=new Set(entries.map(key));
   const keyForActual=(type,mark,values={})=>key({
    type,mark:mark.mark,cipher:mark.cipher,secondaryCipher:mark.secondaryCipher,
    ...values
   });
   const actualMark=new Map(confirmedMarks.map(x=>[x.id,x]));
   const actualJoint=new Map(nodes.filter(x=>x.counted).map(x=>[x.id,x]));
   const pushExtra=(type,mark,values,name,actualRecord=null)=>{
    const k=keyForActual(type,mark,values);
    if(!referenceKeys.has(k)){
     const msg={code:"unlisted_position",label:"Позиция есть в ведомости, но отсутствует в эталоне",
      referenceId:null,type,mark:mark.mark,cipher:mark.cipher,
      secondaryCipher:mark.secondaryCipher,position:name,sheetCode:"—",expected:null,
      actual:"присутствует",actualId:actualRecord?.id??null,
      sourceDocumentId:actualRecord?.source?.documentId??null,
      sourcePage:actualRecord?.source?.page??null,
      assemblyId:actualRecord?.assemblyId??mark.id,
      jointId:actualRecord?.jointId??null};
     extras.push(msg)
    }
   };
   for(const mark of actualMark.values())
    pushExtra("mark",mark,{},mark.mark,mark);
   for(const part of details.filter(x=>x.counted)){
    const mark=actualMark.get(part.assemblyId);
    if(mark)pushExtra("part",mark,{position:part.position},part.position,part)
   }
   for(const joint of actualJoint.values()){
    const mark=actualMark.get(joint.assemblyId);
    if(mark)pushExtra("joint",mark,{
     scope:joint.scope,jointCode:joint.jointCode
    },joint.jointCode,joint)
   }
   for(const item of components.filter(x=>x.counted)){
    const joint=actualJoint.get(item.jointId),mark=actualMark.get(item.assemblyId);
    if(joint&&mark)pushExtra("component",mark,{
     scope:joint.scope,jointCode:joint.jointCode,
     category:item.category,kind:item.kind,position:item.position
    },item.position,item)
   }
   issues.push(...extras)
  }
  const approvedKeys=new Set(),duplicateReference=[];
  for(const entry of entries){
   const k=key(entry);
   if(approvedKeys.has(k))duplicateReference.push(entry);
   approvedKeys.add(k)
  }
  for(const item of duplicateReference)
   register("duplicate_reference","В эталоне повторно утверждена одна физическая позиция",
    item,null,item.quantity);
  return{objectId:o,setId:review.setId,sheets:review.sheets,
   sheetCount:review.total,reviewedSheets:review.reviewed,allSheetsReviewed:review.allSheetsReviewed,
   activeReferencePositions:entries.length,archivedPositions:ledger.filter(x=>!x.current).length,
   pendingPositions:ledger.filter(x=>x.current&&x.status!=="rejected"&&!x.approved).length,
   unlistedPositions:extras.length,duplicateReferencePositions:duplicateReference.length,
   mismatches:issues,discrepancyCount:issues.length,
   referenceReady:review.allSheetsReviewed&&entries.length>0&&issues.length===0,
   fullSpecificationVerified:false,releaseCertified:false,
   explanation:"Данный статус означает только полноту занесённых инженером эталонных листов и сверку с ведомостями; не является заключением о правильности КМД."}
 }
 function snapshot(id){
  const o=obj(id),entries=list(o),sheetChecks=checks(o,entries);
  return{entries,checks:sheetChecks,comparison:compare(o,{entries,checks:sheetChecks})}
 }
 return{list,checks,save,seal,history,compare,snapshot}
}
module.exports={createKmdReference};
