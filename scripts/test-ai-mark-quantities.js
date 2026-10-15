"use strict";
/* Final-phase tests, NOT executed during feature development.
   To run later after dependencies are available: node scripts/test-ai-mark-quantities.js */
const assert=require("node:assert/strict");
const {createMarkQuantities}=require("../src/ai-mark-quantities");
function databaseFixture(){
 let counter=10;const objects=new Set([1,2]),entries=new Map();
 const key=(oid,section,id)=>[oid,section,id].join(":");
 const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
 function insert(oid,section,data){
  const row={id:++counter,object_id:oid,section_key:section,
   record_type:data.record_type,title:data.title||"",parent_id:data.parent_id||null,
   data:clone(data.data||{}),created_at:"2026-10-15",updated_at:"2026-10-15"};
  entries.set(key(oid,section,row.id),row);return clone(row)
 }
 const db={
  getObject:id=>objects.has(Number(id))?{id:Number(id)}:null,
  getEntity:(oid,section,id)=>clone(entries.get(key(oid,section,id))||null),
  listEntity:(oid,section)=>[...entries.values()].filter(x=>x.object_id===oid&&x.section_key===section).map(clone),
  createEntity:(oid,section,data)=>insert(oid,section,data),
  updateEntity:(oid,section,id,data)=>{
   const old=entries.get(key(oid,section,id));if(!old)return null;
   const updated={...old,record_type:data.record_type,title:data.title,
    parent_id:data.parent_id||null,data:clone(data.data)};
   entries.set(key(oid,section,id),updated);return clone(updated)
  },
  transaction:fn=>{
   const backup=new Map([...entries].map(([k,v])=>[k,clone(v)])),before=counter;
   try{return fn()}catch(error){entries.clear();for(const [k,v] of backup)entries.set(k,v);counter=before;throw error}
  }
 };
 return{db,insert,entries}
}
(()=>{
 const {db,insert}=databaseFixture();
 const pdf=insert(1,"ai-documents",{record_type:"document",title:"КМД 041-2025",
  data:{kind:"КМД",extension:".pdf",sha256:"a".repeat(64),original_name:"041-2025-КМД.pdf"}});
 const pdf2=insert(2,"ai-documents",{record_type:"document",title:"Другой объект",
  data:{kind:"КМД",extension:".pdf",sha256:"b".repeat(64),original_name:"не наш.pdf"}});
 const service=createMarkQuantities({database:db,clock:()=>"2026-10-16T12:00:00Z"});
 const sample={expectedRevision:0,mark:"К41",cipher:"041-2025",secondaryCipher:"А",
  documentId:pdf.id,page:45,specPosition:"Позиция 11",drawingRevision:"Изм. 1",
  quantity:6,status:"confirmed",comment:"Сверено по КМД"};
 assert.deepEqual(service.list(1),[]);
 assert.throws(()=>service.save(1,null,sample,{role:"guest"}),/инженер/);
 assert.throws(()=>service.save(1,null,{...sample,documentId:pdf2.id},{role:"engineer"}),/КМД/);
 assert.throws(()=>service.save(1,null,{...sample,quantity:6.5},{role:"engineer"}),/целым/);
 assert.throws(()=>service.save(1,null,{...sample,quantity:""},{role:"engineer"}),/обязательно количество/);
 const first=service.save(1,null,sample,{role:"engineer"});
 assert.equal(first.quantity,6);assert.equal(first.source.page,45);
 assert.equal(first.status,"confirmed");assert.equal(first.sourceValid,true);
 assert.equal(service.summary(1).confirmedPieces,6);
 assert.equal(service.summary(1).complete,false);
 assert.equal(service.summary(1).confirmedPositionCount,1);
 assert.throws(()=>service.save(1,null,{...sample,expectedRevision:0},{role:"admin"}),/уже есть/);
 assert.throws(()=>service.save(1,first.id,{...sample,expectedRevision:0,quantity:7},{role:"admin"}),/Редакция/);
 const corrected=service.save(1,first.id,{...sample,expectedRevision:1,quantity:7,comment:"Исправлено"},{role:"admin"});
 assert.equal(corrected.revision,2);assert.equal(service.summary(1).confirmedPieces,7);
 assert.equal(service.history(1,first.id).length,2);
 const second=service.save(1,null,{...sample,mark:"К42",expectedRevision:0,quantity:"",
  status:"requires_review",page:46,specPosition:"Позиция 12"},{role:"engineer"});
 assert.equal(service.summary(1).confirmedPieces,7);
 assert.equal(service.summary(1).pendingCount,1);
 service.save(1,second.id,{...sample,mark:"К42",page:46,specPosition:"Позиция 12",
  quantity:3,expectedRevision:1},{role:"engineer"});
 assert.equal(service.summary(1).confirmedPieces,10);
 assert.equal(service.summary(1).confirmedPositionCount,2);
 db.updateEntity(1,"ai-documents",pdf.id,{record_type:"document",title:"Подмена документа",
  data:{kind:"КМД",extension:".pdf",sha256:"e".repeat(64),original_name:"заменен.pdf"}});
 assert.equal(service.summary(1).confirmedPieces,0,"changed SHA must invalidate source");
 assert.equal(service.summary(1).pendingCount,2);
 assert.throws(()=>service.history(2,first.id),/не найдена/);
 assert.equal(service.list(2).length,0);
 console.log("KMD quantity ledger: isolated records, integer quantities, approved sources, revision/audit/duplicate guards PASS");
})();
