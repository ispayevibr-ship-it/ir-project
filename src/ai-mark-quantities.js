"use strict";
/* IR Project AI — human-verified KMD quantity statements.
 * A verified mention is never an inferred quantity. Only a human-entered,
 * source-linked quantity statement may affect this isolated AI ledger.
 * Does not write to the production "marks" or scheme sections.
 */
const STATES=new Set(["requires_review","confirmed","rejected"]);
const MARK=/^[\p{L}\p{N}][\p{L}\p{N} ._+\-/()№]*$/u;
function createMarkQuantities({database,revisions=null,clock=()=>new Date().toISOString()}={}){
 if(!database)throw Error("Необходимо подключение базы IR Project");
 function object(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<1||!database.getObject(n))throw Error("Объект не найден");
  return n
 }
 function plain(value,label,max=64,{mandatory=false}={}){
  if(typeof value!=="string")throw Error("Поле «"+label+"» должно содержать текст");
  const s=value.trim().replace(/\s+/g," ");
  if(s.length>max||(mandatory&&!s))throw Error("Неверное значение поля «"+label+"»");
  return s
 }
 function mark(value){
  const v=plain(value,"Марка",64,{mandatory:true});
  if(!MARK.test(v))throw Error("Некорректная марка отправочного элемента");
  return v
 }
 function safeRecord(oid,recordId){
  const n=Number(recordId);
  if(!Number.isSafeInteger(n)||n<1)throw Error("Неверный ID позиции");
  const row=database.getEntity(oid,"ai-mark-quantities",n);
  if(!row||row.record_type!=="quantity_statement")throw Error("Позиция не найдена в этом объекте");
  return row
 }
 function getDocument(oid,documentId){
  const n=Number(documentId);
  if(!Number.isSafeInteger(n)||n<1)throw Error("Выберите исходный чертёж КМД");
  const row=database.getEntity(oid,"ai-documents",n);
  if(!row||row.record_type!=="document"||
    row.data?.kind!=="КМД"||row.data?.extension!==".pdf"||
    !/^[a-f0-9]{64}$/i.test(String(row.data?.sha256||"")))
   throw Error("Для количества нужен загруженный PDF КМД из этого объекта");
  return row
 }
 function key(item){
  return[item.mark,item.cipher,item.secondaryCipher].map(x=>String(x||"").trim().toLocaleUpperCase("ru-RU")).join("\u0001")
 }
 function parse(oid,row){
  const d=row.data||{},src=d.source||{};
  const currentDoc=database.getEntity(oid,"ai-documents",Number(src.documentId));
  const sourceValid=Boolean(currentDoc&&currentDoc.record_type==="document"&&
   currentDoc.data?.sha256===src.sha256&&currentDoc.data?.kind==="КМД"&&
   (!revisions||revisions.isCurrent(oid,src)));
  return{id:row.id,mark:String(d.mark||""),cipher:String(d.cipher||""),
   secondaryCipher:String(d.secondaryCipher||""),quantity:Number.isSafeInteger(d.quantity)?d.quantity:null,
   status:STATES.has(d.status)?d.status:"requires_review",
   source:{documentId:src.documentId??null,name:String(src.name||""),
    sha256:String(src.sha256||""),page:src.page??null,
    specPosition:String(src.specPosition||""),drawingRevision:String(src.drawingRevision||""),
    kind:String(src.kind||"")},sourceValid,revision:Number(d.revision)||0,
   comment:String(d.comment||""),reviewedAt:d.reviewedAt||null,
   reviewedBy:d.reviewedBy||null,createdAt:row.created_at,updatedAt:row.updated_at}
 }
 function list(id){
  const oid=object(id);
  return database.listEntity(oid,"ai-mark-quantities")
   .filter(x=>x.record_type==="quantity_statement").map(x=>parse(oid,x))
 }
 function summary(id){
  const entries=list(id),confirmed=entries.filter(x=>x.status==="confirmed"&&
   x.sourceValid&&Number.isSafeInteger(x.quantity)&&x.quantity>0);
  const byKey=new Map();
  for(const e of confirmed){
   const k=key(e);
   if(byKey.has(k))throw Error("Обнаружены дубли утверждённых количеств; исправьте ведомость");
   byKey.set(k,e)
  }
  const rows=[...byKey.values()].sort((a,b)=>
   new Intl.Collator("ru",{numeric:true,sensitivity:"base"}).compare(a.mark,b.mark)||
   a.cipher.localeCompare(b.cipher,"ru",{numeric:true})||
   a.secondaryCipher.localeCompare(b.secondaryCipher,"ru",{numeric:true}));
  const total=rows.reduce((acc,item)=>acc+item.quantity,0);
  if(!Number.isSafeInteger(total))throw Error("Общее количество превышает допустимое значение");
  return{rows,confirmedPositionCount:rows.length,confirmedPieces:total,
   pendingCount:entries.filter(x=>x.status==="requires_review"||
    x.status==="confirmed"&&(!x.sourceValid||!Number.isSafeInteger(x.quantity)||x.quantity<=0)).length,
   rejectedCount:entries.filter(x=>x.status==="rejected").length,
   complete:false,quantityMeaning:"Сумма проверенных позиций КМД, а не полный объём объекта"}
 }
 function save(id,recordId,command,{role}={}){
  const oid=object(id);
  if(!["admin","engineer"].includes(role))throw Error("Изменять количества может только инженер или администратор");
  if(!command||typeof command!=="object"||!STATES.has(command.status))
   throw Error("Укажите статус проверки количества");
  if(!Number.isSafeInteger(command.expectedRevision)||command.expectedRevision<0)
   throw Error("Укажите актуальную редакцию записи");
  const old=recordId==null?null:safeRecord(oid,recordId);
  const current=Number(old?.data?.revision)||0;
  if(current!==command.expectedRevision||!old&&command.expectedRevision!==0)
   throw Error("Редакция позиции изменилась. Обновите ведомость");
  const name=mark(command.mark);
  const cipher=plain(command.cipher??"","Шифр",60);
  const secondaryCipher=plain(command.secondaryCipher??"","Второй шифр",60);
  const specPosition=plain(command.specPosition??"","Позиция спецификации",90,{mandatory:true});
  const drawingRevision=plain(command.drawingRevision??"","Изменение/ревизия",40);
  const comment=plain(command.comment??"","Примечание инженера",1500);
  const page=Number(command.page);
  if(!Number.isSafeInteger(page)||page<1||page>2000)
   throw Error("Укажите номер листа КМД от 1 до 2000");
  const q=command.quantity==null||command.quantity===""?null:Number(command.quantity);
  if(q!==null&&(!Number.isSafeInteger(q)||q<1||q>1000000))
   throw Error("Количество экземпляров должно быть целым числом от 1 до 1 000 000");
  if(command.status==="confirmed"&&q===null)
   throw Error("Для подтверждения обязательно количество экземпляров из спецификации");
  const document=getDocument(oid,command.documentId);
  const source={documentId:document.id,name:String(document.data.original_name||document.title||""),
   sha256:String(document.data.sha256),kind:"КМД",page,specPosition,drawingRevision};
  if(command.status==="confirmed"&&revisions&&!revisions.isCurrent(oid,source))
   throw Error("Подтверждение запрещено: лист КМД отсутствует в действующей редакции или оригинал PDF недоступен");
  const next={mark:name,cipher,secondaryCipher,quantity:q,status:command.status,
   source,comment,revision:current+1,reviewedBy:role,reviewedAt:clock(),
   origin:"engineer_entered_quantity_from_kmd_specification"};
  const conflict=list(oid).find(row=>row.id!==old?.id&&key(row)===key(next)&&
   row.status!=="rejected");
  if(conflict)throw Error("Марка и шифры уже есть в ведомости (запись № "+conflict.id+"). Отредактируйте существующую позицию");
  if(typeof database.transaction!=="function")
   throw Error("Необходима поддержка атомарных транзакций SQLite");
  return database.transaction(()=>{
   const saved=old?
    database.updateEntity(oid,"ai-mark-quantities",old.id,{
     record_type:"quantity_statement",title:name,data:next,parent_id:null
    }):database.createEntity(oid,"ai-mark-quantities",{
     record_type:"quantity_statement",title:name,data:next
    });
   if(!saved)throw Error("Ошибка сохранения количества");
   const history=database.createEntity(oid,"ai-mark-quantity-history",{
    record_type:"quantity_change",parent_id:saved.id,
    title:"Проверка количества "+name+" · редакция "+next.revision,
    data:{quantityId:saved.id,revision:next.revision,previous:old?.data||null,
     current:next,reviewedBy:role,reviewedAt:next.reviewedAt}
   });
   if(!history)throw Error("Не удалось зафиксировать изменение количества");
   return{...parse(oid,saved),historyId:history.id}
  })
 }
 function history(id,recordId){
  const oid=object(id),row=safeRecord(oid,recordId);
  return database.listEntity(oid,"ai-mark-quantity-history")
   .filter(x=>x.record_type==="quantity_change"&&Number(x.parent_id)===row.id)
   .map(x=>({id:x.id,...x.data}))
 }
 return{list,summary,save,history}
}
module.exports={createMarkQuantities};
