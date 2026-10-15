"use strict";
/* Deferred acceptance contract: DO NOT execute until final project testing.
   No model downloads needed. Tests calculations and anti-double-count logic. */
const assert=require("node:assert/strict");
const {createKmdConnections}=require("../src/ai-kmd-connections");
function fixture(){
 const rows=new Map(),objects=new Set([1,2]);let id=30;
 const copy=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(oid,sec,n)=>oid+"|"+sec+"|"+n;
 function create(oid,sec,body){
  const row={id:++id,object_id:oid,section_key:sec,record_type:body.record_type,
   title:body.title||"",parent_id:body.parent_id||null,data:copy(body.data||{}),
   created_at:"2026-10-15"};
  rows.set(key(oid,sec,row.id),row);return copy(row)
 }
 const database={
  getObject:n=>objects.has(Number(n))?{id:Number(n)}:null,
  getEntity:(oid,sec,n)=>copy(rows.get(key(Number(oid),sec,Number(n)))),
  listEntity:(oid,sec)=>[...rows.values()].filter(x=>x.object_id===Number(oid)&&x.section_key===sec).map(copy),
  createEntity:(oid,sec,body)=>create(Number(oid),sec,body),
  updateEntity:(oid,sec,n,body)=>{
   const k=key(Number(oid),sec,Number(n)),old=rows.get(k);if(!old)return null;
   const updated={...old,record_type:body.record_type,title:body.title||old.title,
    parent_id:body.parent_id||null,data:copy(body.data)};
   rows.set(k,updated);return copy(updated)
  },
  transaction:fn=>{
   const before=new Map([...rows].map(([k,v])=>[k,copy(v)])),seq=id;
   try{return fn()}catch(e){rows.clear();for(const [k,v] of before)rows.set(k,v);id=seq;throw e}
  }
 };
 return{database,create}
}
(()=>{
 const {database,create}=fixture(),sha="c".repeat(64);
 const pdf=create(1,"ai-documents",{record_type:"document",title:"041-2025 КМД",
  data:{kind:"КМД",extension:".pdf",original_name:"041-2025-KMD.pdf",sha256:sha}});
 const otherPdf=create(2,"ai-documents",{record_type:"document",title:"Other",
  data:{kind:"КМД",extension:".pdf",original_name:"Other KMD.pdf",sha256:"d".repeat(64)}});
 const a=create(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К41",
  data:{mark:"К41",cipher:"041",secondaryCipher:"",quantity:3,status:"confirmed",
   source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:45,specPosition:"1"},revision:1}});
 const b=create(1,"ai-mark-quantities",{record_type:"quantity_statement",title:"К42",
  data:{mark:"К42",cipher:"041",secondaryCipher:"",quantity:4,status:"confirmed",
   source:{documentId:pdf.id,sha256:sha,kind:"КМД",page:46,specPosition:"2"},revision:1}});
 const api=createKmdConnections({database,clock:()=>"2026-10-16T10:00:00Z"});
 const node={expectedRevision:0,assemblyId:a.id,jointCode:"У1",scope:"fabrication",
  occurrencesPerAssembly:2,siteOccurrences:"",
  documentId:pdf.id,page:45,sourcePosition:"Узел 1",drawingRevision:"Изм.1",
  status:"confirmed",comment:"Сверено по узлу"};
 const factory=api.saveNode(1,null,node,{role:"engineer"});
 assert.equal(factory.counted,true);
 assert.equal(factory.instances,6);
 assert.throws(()=>api.saveNode(1,null,node,{role:"engineer"}),/уже учтён/);
 assert.throws(()=>api.saveNode(1,null,{...node,documentId:otherPdf.id,jointCode:"У2"},{role:"engineer"}),/исходный PDF/i);
 const site=api.saveNode(1,null,{...node,jointCode:"Стык-А",scope:"erection",
  occurrencesPerAssembly:"",siteOccurrences:5},{role:"engineer"});
 assert.equal(site.instances,5,"erection joint is NOT 5 * quantity of assembly");
 assert.throws(()=>api.saveNode(1,null,{...node,assemblyId:b.id,jointCode:"Стык-А",
  scope:"erection",siteOccurrences:1,occurrencesPerAssembly:""},{role:"engineer"}),/уже учтён/);
 const bolt={expectedRevision:0,jointId:factory.id,category:"fastener",kind:"bolt",
  position:"Б1",perJoint:4,diameterMm:20,lengthMm:70,standard:"ГОСТ 7798",
  strength:"8.8",coating:"",weldSizeMm:"",
  documentId:pdf.id,page:45,sourcePosition:"Б1",drawingRevision:"Изм.1",
  status:"confirmed",comment:""};
 const bolts=api.saveComponent(1,null,bolt,{role:"admin"});
 assert.equal(bolts.totalPieces,24);
 assert.throws(()=>api.saveComponent(1,null,{...bolt,position:"Б2",strength:""},{role:"admin"}),/класс прочности/);
 assert.throws(()=>api.saveComponent(1,null,bolt,{role:"admin"}),/уже учтена/);
 const washer=api.saveComponent(1,null,{...bolt,position:"Ш1",kind:"washer",
  perJoint:8,strength:"",standard:"ГОСТ 11371",lengthMm:""},{role:"engineer"});
 assert.equal(washer.totalPieces,48);
 const weld=api.saveComponent(1,null,{...bolt,category:"weld",kind:"fillet",
  position:"Св1",perJoint:2,lengthMm:125,weldSizeMm:5,
  standard:"",strength:"",diameterMm:""},{role:"engineer"});
 assert.equal(weld.totalLengthM,1.5);
 const siteBolt=api.saveComponent(1,null,{...bolt,jointId:site.id,position:"Б-стык",
  perJoint:8},{role:"engineer"});
 assert.equal(siteBolt.totalPieces,40);
 let total=api.summary(1);
 assert.equal(total.confirmedNodes,2);
 assert.equal(total.totalFastenerPieces,112,"24 factory bolts + 48 washers + 40 erection bolts");
 assert.equal(total.totalWeldLengthM,1.5);
 assert.equal(api.history(1,"joint",factory.id).length,1);
 assert.equal(api.history(1,"item",bolts.id).length,1);
 const weldRow=database.getEntity(1,"ai-kmd-connection-items",weld.id);
 database.updateEntity(1,"ai-kmd-connection-items",weld.id,{
  record_type:"connection_item",title:weldRow.title,data:{...weldRow.data,lengthMm:"malformed"}
 });
 const unreadableWeld=api.listComponents(1).find(x=>x.id===weld.id);
 assert.equal(unreadableWeld.counted,false,"malformed weld must not be counted");
 assert.match(unreadableWeld.reason,/Длина сварного шва/);
 assert.equal(api.summary(1).totalFastenerPieces,112,
  "damaged weld does not suppress other legitimate hardware");
 database.updateEntity(1,"ai-kmd-connection-items",weld.id,{
  record_type:"connection_item",title:weldRow.title,data:weldRow.data
 });
 assert.throws(()=>api.saveComponent(1,bolts.id,{...bolt,expectedRevision:0},{role:"admin"}),/устарела/);
 const nodeEdited=api.saveNode(1,factory.id,{...node,expectedRevision:1},{role:"engineer"});
 assert.equal(nodeEdited.counted,true);
 assert.equal(api.listComponents(1).filter(x=>x.jointId===factory.id&&x.counted).length,0,
  "changed joint revision must invalidate existing approved fasteners and welds");
 const reviewedBolt=api.saveComponent(1,bolts.id,{...bolt,expectedRevision:1},{role:"engineer"});
 assert.equal(reviewedBolt.totalPieces,24);
 database.updateEntity(1,"ai-mark-quantities",a.id,{record_type:"quantity_statement",title:"К41",
  data:{...database.getEntity(1,"ai-mark-quantities",a.id).data,quantity:4,revision:2}});
 total=api.summary(1);
 assert.equal(total.totalFastenerPieces,0,"parent revision invalidates both site and fabrication takeoff");
 assert.equal(total.totalWeldLengthM,0);
 assert.equal(api.listNodes(1).find(x=>x.id===site.id).counted,false);
 const factoryRejected=api.saveNode(1,factory.id,{...node,expectedRevision:2,
  status:"rejected"},{role:"admin"});
 assert.equal(factoryRejected.counted,false);
 assert.equal(api.summary(1).totalFastenerPieces,0);
 assert.equal(api.summary(1).totalWeldLengthM,0);
 database.updateEntity(1,"ai-documents",pdf.id,{record_type:"document",title:"Changed",
  data:{kind:"КМД",extension:".pdf",original_name:"Updated.pdf",sha256:"e".repeat(64)}});
 assert.equal(api.summary(1).totalFastenerPieces,0,"altered SHA invalidates inputs");
 assert.equal(api.summary(1).totalWeldLengthM,0);
 assert.equal(api.listNodes(2).length,0);
 assert.throws(()=>api.history(2,"joint",factory.id),/не найдена/);
 console.log("Deferred contract: unique fabrication/site nodes, verified fastener pieces, weld metres, history, integrity and access PASS");
})();
