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
  if(!page||!page.valid||page.documentId!==d.source?.documentId||
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
   const verificationValid=Number.isSafeInteger(d.quantity)&&d.quantity>0&&
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
 function checks(id){
  const o=obj(id),active=activeSet(o);
  if(!active)return{setId:null,setIssue:null,sheets:[],total:0,reviewed:0,allSheetsReviewed:false};
  const entries=list(o),bySheet=new Map();
  for(const entry of entries){
   if(Number(entry.setId)!==active.set.id||entry.status==="rejected")continue;
   if(!bySheet.has(entry.sheetId))bySheet.set(entry.sheetId,[]);
   bySheet.get(entry.sheetId).push(entry)
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
   const unresolved=positions.filter(e=>!e.approved).length;
   const current=Boolean(p.valid&&d.status==="sealed"&&d.reviewedEntireSheet===true&&
    ["admin","engineer"].includes(d.reviewedBy)&&unresolved===0&&
    typeof d.fingerprint==="string"&&d.fingerprint.length===64&&
    d.fingerprint===sheetFingerprint(o,active.set.id,p.id,referenceRowsBySheet.get(p.id)||[])&&
    d.documentId===p.documentId&&d.sha256===p.sha256&&d.page===p.page);
   return{...p,checked:current,status:current?"sealed":d.status||"not_started",
    revision:Number(d.revision)||0,checkedAt:d.reviewedAt||null,
    checkedBy:d.reviewedBy||null,comment:String(d.comment||""),
    totalPositions:positions.length,
    confirmedPositions:positions.filter(e=>e.approved).length,
    unresolved}
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
  const data={setId:src.setId,sheetId:src.sheetId,sheetCode:src.sheetCode,
   documentId:src.documentId,page:src.page,sha256:src.sha256,
   status:"sealed",revision:rev+1,reviewedBy:ctx.role,reviewedAt:clock(),
   reviewedEntireSheet:true,comment,
   fingerprint:sheetFingerprint(o,src.setId,src.sheetId)};
  return tx(()=>{
   const check=old?database.updateEntity(o,CHECKS,old.id,{
    record_type:"kmd_sheet_check",title:src.sheetCode,data}):
    database.createEntity(o,CHECKS,{record_type:"kmd_sheet_check",
     title:src.sheetCode,data});
   if(!check)throw Error("Не удалось сохранить акт сверки листа");
   audit(o,"sheet_sealed",check.id,old?.data,data,ctx.role);
   return{sheetId:src.sheetId,checked:true,revision:data.revision}
  })
 }
 function history(id,recordId){
  const o=obj(id),ref=refRow(o,recordId);
  return stored(o,HISTORY,"reference_change").filter(x=>x.data?.referenceId===ref.id)
   .map(x=>({id:x.id,...x.data}))
 }
 function compare(id){
  const o=obj(id),ledger=list(o),review=checks(o);
  const entries=ledger.filter(x=>x.approved),marks=quantities.list(o),
   details=materials.list(o),nodes=connections.listNodes(o),components=connections.listComponents(o);
  const issues=[],affected=[];
  const register=(code,label,entry,actual,expected,actualRecord=null)=>{
   const message={code,label,referenceId:entry.id,type:entry.type,
    mark:entry.mark,cipher:entry.cipher,secondaryCipher:entry.secondaryCipher,
    position:entry.position||entry.jointCode,
    sheetCode:entry.sheetCode,expected,actual,
    actualId:actualRecord?.id??null,assemblyId:actualRecord?.assemblyId??null,
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
  const confirmedMarks=marks.filter(x=>x.status==="confirmed"&&x.sourceValid);
  const marksByName=indexed(confirmedMarks,markIdentity),
   detailsByMark=indexed(details.filter(x=>x.counted),partIdentity),
   jointsByMark=indexed(nodes.filter(x=>x.counted),jointIdentity),
   itemsByJoint=indexed(components.filter(x=>x.counted),componentIdentity);
  for(const entry of entries){
   const markMatches=marksByName.get(markIdentity(entry))||[];
   if(markMatches.length!==1){register(markMatches.length?"ambiguous_mark":"missing_mark",
    markMatches.length?"Повторные подтверждённые марки":"Нет подтверждённой отправочной марки",
    entry,markMatches.length||null,entry.quantity);continue}
   const mark=markMatches[0];
   let found=[];
   if(entry.type==="mark")found=[mark];
   else if(entry.type==="part")
    found=detailsByMark.get(mark.id+"\u0001"+normalize(entry.position))||[];
   else if(entry.type==="joint")
    found=jointsByMark.get(mark.id+"\u0001"+entry.scope+"\u0001"+
     normalize(entry.jointCode))||[];
   else{
    const parents=jointsByMark.get(mark.id+"\u0001"+entry.scope+"\u0001"+
     normalize(entry.jointCode))||[];
    found=parents.flatMap(parent=>itemsByJoint.get(parent.id+"\u0001"+entry.category+
     "\u0001"+normalize(entry.kind)+"\u0001"+normalize(entry.position))||[])
   }
   if(found.length!==1){register(found.length?"ambiguous_position":"missing_position",
    found.length?"Повторные позиции в ведомости":"Позиция отсутствует в инженерной ведомости",
    entry,found.length||null,entry.quantity);continue}
   const value=found[0],actual=entry.type==="mark"?value.quantity:
    entry.type==="part"?value.partCount:
    entry.type==="joint"?(entry.scope==="erection"?value.siteOccurrences:value.occurrencesPerAssembly):
    value.perJoint;
   if(actual!==entry.quantity)register("quantity_mismatch","Количество отличается от эталона",
    entry,actual,entry.quantity,value)
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
 return{list,checks,save,seal,history,compare}
}
module.exports={createKmdReference};
