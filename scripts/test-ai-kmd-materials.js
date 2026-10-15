"use strict";
/* Prepared for final acceptance. Deliberately not executed at this stage. */
const assert=require("node:assert/strict");
const {createKmdMaterials,massOf}=require("../src/ai-kmd-materials");
function fakeDb(){
 let seq=10;const cache=new Map();const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(oid,section,id)=>[oid,section,id].join(":");
 const add=(oid,section,p)=>{
  const row={id:++seq,object_id:oid,section_key:section,record_type:p.record_type,
   title:p.title||"",parent_id:p.parent_id||null,data:clone(p.data||{}),created_at:"2026-10-15"};
  cache.set(key(oid,section,row.id),row);return clone(row)
 };
 const db={
  getObject:id=>[1,2].includes(Number(id))?{id:Number(id)}:null,
  listEntity:(oid,section)=>[...cache.values()].filter(x=>x.object_id===oid&&x.section_key===section).map(clone),
  getEntity:(oid,section,id)=>clone(cache.get(key(oid,section,id))||null),
  createEntity:(oid,section,p)=>add(oid,section,p),
  updateEntity:(oid,section,id,p)=>{
   const k=key(oid,section,id),v=cache.get(k);
   if(!v)return null;
   const next={...v,record_type:p.record_type,title:p.title||"",parent_id:p.parent_id||null,data:clone(p.data)};
   cache.set(k,next);return clone(next)
  },
  transaction:fn=>{const backup=new Map([...cache].map(([k,v])=>[k,clone(v)])),prev=seq;
   try{return fn()}catch(e){cache.clear();for(const [k,v] of backup)cache.set(k,v);seq=prev;throw e}}
 };
 return{db,add}
}
(()=>{
 const {db,add}=fakeDb();
 const pdf=add(1,"ai-documents",{record_type:"document",title:"041 КМД",
  data:{kind:"КМД",extension:".pdf",sha256:"a".repeat(64),original_name:"041-КМД.pdf"}});
 const assembly=add(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К41",
  data:{mark:"К41",cipher:"041",secondaryCipher:"",quantity:6,status:"confirmed",
   source:{documentId:pdf.id,sha256:"a".repeat(64),kind:"КМД",page:45,specPosition:"1"}}});
 const other=add(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К42",
  data:{mark:"К42",cipher:"041",secondaryCipher:"",quantity:2,status:"requires_review",
   source:{documentId:pdf.id,sha256:"a".repeat(64),kind:"КМД",page:45,specPosition:"2"}}});
 const api=createKmdMaterials({database:db,clock:()=>"2026-10-15T14:00:00Z"});
 const form={expectedRevision:0,assemblyId:assembly.id,position:"Д1",type:"plate",name:"Пластина",
  steelGrade:"С245",profile:"Лист 10",standard:"ГОСТ 27772",partCount:2,
  massMethod:"rectangular",lengthMm:1000,widthMm:200,thicknessMm:10,densityKgM3:7850,
  isSolidRectangle:true,linearKgM:"",drawingMassKg:"",
  documentId:pdf.id,page:45,specPosition:"Поз. Д1",drawingRevision:"Изм. 1",
  status:"confirmed",comment:"Без отверстий"};
 assert.equal(massOf(form),15.7);
 assert.equal(massOf({...form,massMethod:"drawing",drawingMassKg:18.5}),18.5);
 assert.equal(massOf({...form,massMethod:"linear",lengthMm:2000,linearKgM:15}),30);
 assert.throws(()=>massOf({...form,isSolidRectangle:false}),/прямоугольник/);
 assert.throws(()=>api.save(1,null,form,{role:"guest"}),/инженер/);
 assert.throws(()=>api.save(1,null,{...form,assemblyId:other.id},{role:"engineer"}),/Сначала подтвердите/);
 const created=api.save(1,null,form,{role:"engineer"});
 assert.equal(created.calculatedUnitMassKg,15.7);
 assert.equal(created.massPerAssemblyKg,31.4);
 assert.equal(created.totalMassKg,188.4);
 assert.equal(api.summary(1).confirmedMassKg,188.4);
 assert.equal(api.summary(1).complete,false);
 assert.throws(()=>api.save(1,null,form,{role:"engineer"}),/уже есть/);
 assert.throws(()=>api.save(1,created.id,{...form,expectedRevision:0},{role:"engineer"}),/другом окне/);
 const revised=api.save(1,created.id,{...form,expectedRevision:1,massMethod:"drawing",drawingMassKg:16},{role:"admin"});
 assert.equal(revised.totalMassKg,192);
 assert.equal(api.history(1,created.id).length,2);
 db.updateEntity(1,"ai-mark-quantities",assembly.id,{record_type:"quantity_statement",title:"К41",
  data:{...db.getEntity(1,"ai-mark-quantities",assembly.id).data,quantity:8}});
 assert.equal(api.summary(1).confirmedMassKg,256);
 db.updateEntity(1,"ai-mark-quantities",assembly.id,{record_type:"quantity_statement",title:"К41",
  data:{...db.getEntity(1,"ai-mark-quantities",assembly.id).data,status:"rejected"}});
 assert.equal(api.summary(1).confirmedMassKg,0);
 db.updateEntity(1,"ai-mark-quantities",assembly.id,{record_type:"quantity_statement",title:"К41",
  data:{...db.getEntity(1,"ai-mark-quantities",assembly.id).data,status:"confirmed"}});
 db.updateEntity(1,"ai-documents",pdf.id,{record_type:"document",title:"Changed",
  data:{kind:"КМД",extension:".pdf",sha256:"b".repeat(64),original_name:"Changed.pdf"}});
 assert.equal(api.summary(1).confirmedMassKg,0);
 assert.equal(api.list(2).length,0);
 console.log("KMD materials acceptance contract PASS");
})();
