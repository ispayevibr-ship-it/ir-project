"use strict";
/* FINAL ACCEPTANCE ONLY — contract cases for structured IR Project AI; do not run yet. */
const assert=require("node:assert/strict");
const {extract}=require("../src/ai-structured-extraction");
const {createStructuredReviews}=require("../src/ai-structured-review");
function fixture(){
 let id=10;const rows=new Map(),copy=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(o,s,i)=>o+"|"+s+"|"+i;
 const create=(o,s,value)=>{
  const row={id:++id,object_id:o,section_key:s,record_type:value.record_type,title:value.title||"",
   parent_id:value.parent_id||null,data:copy(value.data||{}),created_at:"2026-10-15"};
  rows.set(key(o,s,row.id),row);return copy(row)
 };
 const db={
  getObject:o=>[1,2].includes(Number(o))?{id:Number(o)}:null,
  getEntity:(o,s,i)=>copy(rows.get(key(Number(o),s,Number(i)))),
  listEntity:(o,s)=>[...rows.values()].filter(x=>x.object_id===Number(o)&&x.section_key===s).map(copy),
  createEntity:(o,s,v)=>create(Number(o),s,v),
  updateEntity:(o,s,i,v)=>{
   const k=key(Number(o),s,Number(i)),old=rows.get(k);if(!old)return null;
   const next={...old,record_type:v.record_type,title:v.title,
    parent_id:v.parent_id||null,data:copy(v.data)};
   rows.set(k,next);return copy(next)
  },
  transaction:fn=>{
   const backup=new Map([...rows].map(([k,v])=>[k,copy(v)])),prev=id;
   try{return fn()}catch(e){rows.clear();for(const [k,v] of backup)rows.set(k,v);id=prev;throw e}
  }
 };
 return{db,create}
}
(()=>{
 const raw=JSON.stringify({schema:"ir-kmd-v1",marks:["К41"],
  unknowns:["Некоторые размеры не видны"],
  records:[
   {type:"mark_quantity",mark:"К41",cipher:"041",specPosition:"17",
    values:{quantity:6},evidence:{quote:"К41 6 шт.",location:"Ведомость"},uncertain:false,unit:"шт"},
   {type:"steel_part",mark:"К41",position:"Д1",
    values:{partType:"plate",steelGrade:"С245",profile:"Лист 10",partCount:2,
     lengthMm:500,thicknessMm:10},evidence:{quote:"Д1 Лист 10",location:"Ведомость деталей"},uncertain:true},
   {type:"dimension",mark:"K41",position:"Вид А",values:{lengthMm:null},
    evidence:{quote:"?",location:"размерная цепь"}}
  ]});
 const parsed=extract(raw);
 assert.equal(parsed.records.length,3);
 assert.equal(parsed.records[0].data.quantity,6);
 assert.equal(parsed.records[1].data.partCount,2);
 assert.equal(parsed.records[2].errors.length>0,true);
 assert.equal(extract('not JSON').records.length,0);
 assert.equal(extract(JSON.stringify({schema:"ir-kmd-v1",records:[{
  type:"mark_quantity",mark:"К41",values:{quantity:"6.5"},
  evidence:{quote:"К41 6.5"},specPosition:"17"}]})).records[0].data.quantity,null);
 const {db,create}=fixture(),sha="a".repeat(64);
 const doc=create(1,"ai-documents",{record_type:"document",title:"КМД",
  data:{kind:"КМД",extension:".pdf",original_name:"КМД.pdf",sha256:sha}});
 const a=create(1,"ai-analysis",{record_type:"image_analysis",title:"Лист 45",
  data:{source:{documentId:doc.id,name:"КМД.pdf",sha256:sha,kind:"КМД",page:45},
   raw,model:"local",verification:"requires_review"}});
 let exists=true;
 const docs={list:o=>o===1?[{id:doc.id,kind:"КМД",ext:".pdf",exists,sha256:sha}]:[]};
 const reviewer=createStructuredReviews({database:db,documents:docs,
  clock:()=>"2026-10-16T12:00:00Z"});
 assert.equal(reviewer.list(1).length,3);
 assert.equal(reviewer.summary(1).confirmed,0);
 assert.throws(()=>reviewer.save(1,a.id,0,{expectedRevision:0,status:"confirmed",values:{}},{role:"guest"}),/инженер/);
 let accepted=reviewer.save(1,a.id,0,{expectedRevision:0,status:"confirmed",
  values:{mark:"К41",quantity:6,specPosition:"17"},comment:"Сверено по листу"},{role:"engineer"});
 assert.equal(accepted.approved,true);
 assert.equal(reviewer.summary(1).confirmed,1);
 assert.equal(reviewer.history(1,a.id,0).length,1);
 assert.throws(()=>reviewer.save(1,a.id,0,{expectedRevision:0,status:"rejected",
  values:{},comment:""},{role:"admin"}),/устарела/);
 assert.throws(()=>reviewer.save(1,a.id,1,{expectedRevision:0,status:"confirmed",
  values:{},comment:""},{role:"engineer"}),/комментарий/);
 accepted=reviewer.save(1,a.id,1,{expectedRevision:0,status:"confirmed",
  values:{partCount:2},comment:"Проверена неоднозначная позиция по чертежу"},{role:"engineer"});
 assert.equal(accepted.approved,true);
 assert.equal(reviewer.list(2).length,0);
 assert.equal(db.listEntity(1,"ai-mark-quantities").length,0,"no auto-insertion into mark quantity ledger");
 const prior=db.listEntity(1,"ai-structured-reviews").find(x=>x.data.analysisId===a.id&&x.data.index===0);
 const conflict=create(1,"ai-structured-reviews",{record_type:"structured_review",
  title:"Conflicting verification",parent_id:a.id,data:{...prior.data}});
 assert.equal(reviewer.list(1).find(x=>x.index===0).approved,false,
  "ambiguous persisted approvals must be untrusted");
 assert.equal(reviewer.list(1).find(x=>x.index===0).conflictingReviews,true);
 assert.equal(reviewer.summary(1).conflictingReviews,1);
 assert.throws(()=>reviewer.save(1,a.id,0,{expectedRevision:1,status:"confirmed",
  values:{mark:"К41",quantity:6,specPosition:"17"}},{role:"engineer"}),/несколько инженерных решений/);
 assert.throws(()=>reviewer.history(1,a.id,0),/несколько инженерных решений/);
 exists=false;
 assert.equal(reviewer.summary(1).confirmed,0,"missing PDF invalidates source-linked acceptance");
 assert.equal(reviewer.summary(1).invalidSources,3);
 console.log("Deferred: structured extraction, independent engineer approval, SHA checks and no automatic ledger writes");
})();
