"use strict";
/* DEFERRED test for final acceptance. Do not run during development. */
const assert=require("node:assert/strict");
const {createAssemblyGeometry}=require("../src/ai-assembly-geometry");
function fixture(){
 let seq=10;const cache=new Map();const clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(o,s,i)=>[o,s,i].join(":");
 const add=(o,s,p)=>{
  const r={id:++seq,object_id:o,section_key:s,title:p.title||"",
   record_type:p.record_type,parent_id:p.parent_id||null,data:clone(p.data||{}),created_at:"2026-10-15"};
  cache.set(key(o,s,r.id),r);return clone(r)
 };
 const db={
  getObject:id=>[1,2].includes(Number(id))?{id:Number(id)}:null,
  getEntity:(o,s,i)=>clone(cache.get(key(Number(o),s,Number(i)))),
  listEntity:(o,s)=>[...cache.values()].filter(x=>x.object_id===Number(o)&&x.section_key===s).map(clone),
  createEntity:(o,s,p)=>add(Number(o),s,p),
  updateEntity:(o,s,i,p)=>{
   const k=key(Number(o),s,Number(i)),old=cache.get(k);if(!old)return null;
   const row={...old,title:p.title||old.title,record_type:p.record_type,
    parent_id:p.parent_id||null,data:clone(p.data)};
   cache.set(k,row);return clone(row)
  },
  transaction:fn=>{const backup=new Map([...cache].map(([k,v])=>[k,clone(v)])),num=seq;
   try{return fn()}catch(e){cache.clear();for(const [k,v] of backup)cache.set(k,v);seq=num;throw e}}
 };
 return{db,add}
}
(()=>{
 const {db,add}=fixture(),sha="a".repeat(64);
 const doc=add(1,"ai-documents",{record_type:"document",title:"КМД",
  data:{kind:"КМД",extension:".pdf",sha256:sha,original_name:"041.pdf"}});
 const a=add(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К41",
  data:{mark:"К41",cipher:"041",secondaryCipher:"",quantity:4,status:"confirmed",
   source:{documentId:doc.id,sha256:sha,kind:"КМД",page:45,specPosition:"1"}}});
 const p=add(1,"ai-kmd-materials",{record_type:"kmd_part",title:"К41 / Д1",
  data:{assemblyId:a.id,assemblyMark:"К41",assemblyCipher:"041",assemblySecondaryCipher:"",
   position:"Д1",type:"plate",name:"Пластина",profile:"Лист 10",steelGrade:"С245",
   partCount:2,massMethod:"drawing",drawingMassKg:7.85,lengthMm:500,
   widthMm:200,thicknessMm:10,isSolidRectangle:true,status:"confirmed",
   source:{documentId:doc.id,sha256:sha,kind:"КМД",page:45,specPosition:"Д1"}}});
 const api=createAssemblyGeometry({database:db});
 const entry={expectedRevision:0,assemblyId:a.id,partId:p.id,instanceIndex:1,
  shape:{type:"plate",lengthMm:500,widthMm:200,heightMm:10},
  position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},
  documentId:doc.id,page:45,sourcePosition:"Размеры Д1",drawingRevision:"Изм.1",
  status:"confirmed",comment:""};
 assert.throws(()=>api.save(1,null,entry,{role:"guest"}),/инженер/);
 assert.throws(()=>api.save(1,null,{...entry,instanceIndex:3},{role:"engineer"}),/количество/);
 assert.throws(()=>api.save(1,null,{...entry,shape:{...entry.shape,heightMm:12}},{role:"engineer"}),/Толщина/);
 const first=api.save(1,null,entry,{role:"engineer"});
 assert.equal(first.counted,true);
 assert.equal(api.summary(1,a.id).coverage[0].remaining,1);
 assert.throws(()=>api.save(1,null,entry,{role:"engineer"}),/размещён/);
 const second=api.save(1,null,{...entry,instanceIndex:2,position:{x:0,y:240,z:0}},{role:"admin"});
 assert.equal(second.counted,true);
 assert.equal(api.summary(1,a.id).confirmedPlacements,2);
 assert.equal(api.summary(1,a.id).complete,false);
 assert.throws(()=>api.save(1,first.id,{...entry,expectedRevision:0},{role:"admin"}),/другом окне/);
 db.updateEntity(1,"ai-kmd-materials",p.id,{record_type:"kmd_part",title:"Revised",
  data:{...db.getEntity(1,"ai-kmd-materials",p.id).data,thicknessMm:12}});
 assert.equal(api.summary(1,a.id).confirmedPlacements,0);
 db.updateEntity(1,"ai-documents",doc.id,{record_type:"document",title:"New PDF",
  data:{kind:"КМД",extension:".pdf",sha256:"b".repeat(64),original_name:"New.pdf"}});
 assert.equal(api.summary(1,a.id).confirmedPlacements,0);
 assert.equal(api.history(1,first.id).length,1);
 console.log("Deferred acceptance contract: geometry/instances/source/revisions PASS");
})();
