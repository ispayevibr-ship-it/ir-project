"use strict";
/* Deferred final-acceptance contract. Intentionally NOT run during WIP phase. */
const assert=require("node:assert/strict");
const {createAssemblyAttachments}=require("../src/ai-assembly-attachments");
function fixture(){
 let seq=20;const dbs=new Map(),clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
 const key=(o,s,i)=>[o,s,i].join("|");
 const add=(o,s,v)=>{
  const record={id:++seq,object_id:o,section_key:s,title:v.title||"",
   record_type:v.record_type,parent_id:v.parent_id||null,data:clone(v.data||{}),created_at:"2026-10-15"};
  dbs.set(key(o,s,record.id),record);return clone(record)
 };
 const database={
  getObject:id=>[1,2].includes(Number(id))?{id:Number(id)}:null,
  getEntity:(o,s,i)=>clone(dbs.get(key(Number(o),s,Number(i)))),
  listEntity:(o,s)=>[...dbs.values()].filter(x=>x.object_id===Number(o)&&x.section_key===s).map(clone),
  createEntity:(o,s,d)=>add(Number(o),s,d),
  updateEntity:(o,s,i,d)=>{
   const k=key(Number(o),s,Number(i)),old=dbs.get(k);if(!old)return null;
   const row={...old,title:d.title||old.title,record_type:d.record_type,
    parent_id:d.parent_id||null,data:clone(d.data)};
   dbs.set(k,row);return clone(row)
  },
  transaction:fn=>{const copy=new Map([...dbs].map(([k,v])=>[k,clone(v)])),s=seq;
   try{return fn()}catch(e){dbs.clear();for(const [k,v] of copy)dbs.set(k,v);seq=s;throw e}}
 };
 return{database,add}
}
(()=>{
 const {database,add}=fixture(),sha="d".repeat(64);
 const pdf=add(1,"ai-documents",{record_type:"document",title:"KMD",
  data:{kind:"КМД",extension:".pdf",sha256:sha,original_name:"041.pdf"}});
 const assembly=add(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К41",
  data:{mark:"К41",cipher:"041",secondaryCipher:"",quantity:2,status:"confirmed",revision:1,
   source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,specPosition:"1"}}});
 const material=add(1,"ai-kmd-materials",{record_type:"kmd_part",title:"К41 / Д1",
  data:{assemblyId:assembly.id,assemblyMark:"К41",assemblyCipher:"041",
   assemblySecondaryCipher:"",assemblyRevision:1,revision:1,position:"Д1",type:"plate",partCount:1,
   massMethod:"drawing",drawingMassKg:3,steelGrade:"С245",
   lengthMm:500,widthMm:200,thicknessMm:10,isSolidRectangle:true,
   status:"confirmed",source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,specPosition:"Д1"}}});
 const placement=add(1,"ai-assembly-placement",{record_type:"part_placement",title:"Д1",
  data:{assemblyId:assembly.id,assemblyMark:"К41",cipher:"041",secondaryCipher:"",
   assemblyRevision:1,partId:material.id,partRevision:1,partPosition:"Д1",instanceIndex:1,
   shape:{type:"plate",lengthMm:500,widthMm:200,heightMm:10},
   position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},status:"confirmed",revision:1,
   source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,location:"D1"}}});
 const joint=add(1,"ai-kmd-joints",{record_type:"connection",title:"У1",data:{
  assemblyId:assembly.id,assemblyMark:"К41",assemblyCipher:"041",assemblySecondaryCipher:"",
  assemblyRevision:1,revision:1,jointCode:"У1",scope:"fabrication",occurrencesPerAssembly:1,status:"confirmed",
  source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,position:"У1"}}});
 const bolt=add(1,"ai-kmd-connection-items",{record_type:"connection_item",title:"Б1",
  data:{jointId:joint.id,jointCode:"У1",jointRevision:1,assemblyId:assembly.id,category:"fastener",
   kind:"bolt",position:"Б1",perJoint:2,diameterMm:20,lengthMm:70,
   standard:"ГОСТ 7798",strength:"8.8",status:"confirmed",revision:1,
   source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,position:"Б1"}}});
 const api=createAssemblyAttachments({database,clock:()=>"2026-10-15T10:00:00Z"});
 const hole={expectedRevision:0,assemblyId:assembly.id,placementId:placement.id,
  type:"hole",code:"О1",start:{x:0,y:0,z:250},diameterMm:22,axis:"y",
  documentId:pdf.id,page:45,sourcePosition:"Отверстие О1",drawingRevision:"Изм.1",
  status:"confirmed",comment:"Разметка без вырезания"};
 assert.throws(()=>api.save(1,null,hole,{role:"guest"}),/инженер/);
 assert.throws(()=>api.save(1,null,{...hole,start:{x:150,y:0,z:250}},{role:"engineer"}),/за габаритами/);
 assert.throws(()=>api.save(1,null,{...hole,axis:"w"},{role:"engineer"}),/X, Y или Z/);
 const h=api.save(1,null,hole,{role:"engineer"});
 assert.equal(h.visible,true);
 assert.equal(api.summary(1,assembly.id).holes,1);
 assert.throws(()=>api.save(1,null,hole,{role:"engineer"}),/уже есть/);
 const fast=api.save(1,null,{...hole,type:"fastener",code:"Б1-центр",
  itemId:bolt.id,diameterMm:null,axis:null},{role:"admin"});
 assert.equal(fast.visible,true);
 assert.equal(api.summary(1,assembly.id).fasteners,1);
 assert.equal(api.summary(1,assembly.id).complete,false);
 assert.equal(api.history(1,h.id).length,1);
 assert.throws(()=>api.save(1,h.id,{...hole,expectedRevision:0},{role:"engineer"}),/устарела/);
 database.updateEntity(1,"ai-assembly-placement",placement.id,{record_type:"part_placement",
  title:"Changed",data:{...database.getEntity(1,"ai-assembly-placement",placement.id).data,revision:2}});
 assert.equal(api.summary(1,assembly.id).visible,0,"outdated placement invalidates anchors");
 assert.equal(api.list(2,assembly.id).length,0);
 console.log("3D attachment provenance and invalidation contract (deferred)");
})();
