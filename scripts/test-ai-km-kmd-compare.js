"use strict";
/* Deferred final-acceptance test. Do not run during feature drafting. */
const assert=require("node:assert/strict");
const {createKmKmdCompare,verdict}=require("../src/ai-km-kmd-compare");
function fixture(){
 let seq=12;const records=new Map(),clone=x=>x==null?null:JSON.parse(JSON.stringify(x));
 const key=(oid,section,id)=>[oid,section,id].join("|");
 const add=(oid,section,p)=>{
  const row={id:++seq,object_id:oid,section_key:section,record_type:p.record_type,
   title:p.title||"",parent_id:p.parent_id||null,data:clone(p.data||{}),
   created_at:"2026-10-15",updated_at:"2026-10-15"};
  records.set(key(oid,section,row.id),row);return clone(row)
 };
 const db={
  getObject:id=>[1,2].includes(Number(id))?{id:Number(id)}:null,
  getEntity:(oid,sec,id)=>clone(records.get(key(Number(oid),sec,Number(id)))),
  listEntity:(oid,sec)=>[...records.values()].filter(x=>x.object_id===Number(oid)&&x.section_key===sec).map(clone),
  createEntity:(oid,sec,p)=>add(oid,sec,p),
  updateEntity:(oid,sec,id,p)=>{
   const k=key(Number(oid),sec,Number(id)),row=records.get(k);if(!row)return null;
   const next={...row,record_type:p.record_type,title:p.title||"",data:clone(p.data)};
   records.set(k,next);return clone(next)
  },
  transaction:fn=>{
   const was=new Map([...records].map(([k,v])=>[k,clone(v)])),i=seq;
   try{return fn()}catch(e){records.clear();for(const [k,v] of was)records.set(k,v);seq=i;throw e}
  }
 };
 return{db,add}
}
(()=>{
 const {db,add}=fixture();
 const km=add(1,"ai-documents",{record_type:"document",title:"КМ",
  data:{kind:"КМ",extension:".pdf",original_name:"Главный КМ.pdf",sha256:"a".repeat(64)}});
 const kmd=add(1,"ai-documents",{record_type:"document",title:"КМД",
  data:{kind:"КМД",extension:".pdf",original_name:"Колонны КМД.pdf",sha256:"b".repeat(64)}});
 const foreign=add(2,"ai-documents",{record_type:"document",title:"КМ",
  data:{kind:"КМ",extension:".pdf",original_name:"Чужой КМ.pdf",sha256:"f".repeat(64)}});
 const api=createKmKmdCompare({database:db,clock:()=>"2026-10-16T10:00:00Z"});
 const evidence=(documentId,value,position="К41")=>({
  value,source:{documentId,page:45,position,revision:"Изм.1"}
 });
 const first={expectedRevision:0,mark:"К41",cipher:"041-2025",position:"К41",
  field:"length_mm",tolerance:0,status:"requires_review",disposition:"open",comment:"",
  km:evidence(km.id,"10000"),kmd:evidence(kmd.id,"10020")};
 assert.equal(api.summary(1).total,0);
 assert.throws(()=>api.save(1,null,first,{role:"guest"}),/инженер/);
 assert.throws(()=>api.save(1,null,{...first,km:evidence(foreign.id,"10000")},{role:"engineer"}),/исходный PDF КМ/);
 assert.throws(()=>api.save(1,null,{...first,status:"confirmed",disposition:"agreed"},{role:"engineer"}),/расхождению/);
 assert.throws(()=>api.save(1,null,{...first,status:"confirmed",disposition:"accepted_deviation"},{role:"engineer"}),/обоснования/);
 assert.equal(verdict("length_mm",10000,10020,0).result,"difference");
 assert.equal(verdict("length_mm",10000,10020,25).result,"match");
 assert.equal(verdict("profile","Двутавр 30Б1","Двутавр 30б1").result,"match");
 assert.equal(verdict("profile","К41","K41").result,"difference","Latin K and Cyrillic K kept apart");
 let draft=api.save(1,null,first,{role:"engineer"});
 assert.equal(draft.rawResult,"difference");
 assert.equal(draft.status,"requires_review");
 assert.equal(api.summary(1).confirmed,0);
 assert.throws(()=>api.save(1,null,first,{role:"admin"}),/уже сравнивается/);
 const confirmed=api.save(1,draft.id,{...first,expectedRevision:1,
  status:"confirmed",disposition:"correction_required",comment:"Проверить КМД"},{role:"engineer"});
 assert.equal(confirmed.approved,true);
 assert.equal(confirmed.result,"difference");
 assert.equal(api.summary(1).correctionRequired,1);
 assert.equal(api.summary(1).matches,0);
 assert.equal(api.history(1,draft.id).length,2);
 assert.throws(()=>api.save(1,draft.id,{...first,expectedRevision:1,
  status:"confirmed",disposition:"correction_required"},{role:"engineer"}),/другом окне/);
 const accepted=api.save(1,draft.id,{...first,expectedRevision:2,
  status:"confirmed",disposition:"accepted_deviation",comment:"Отступление согласовано №34"},{role:"admin"});
 assert.equal(accepted.result,"difference");
 assert.equal(api.summary(1).acceptedDeviations,1);
 db.updateEntity(1,"ai-documents",kmd.id,{record_type:"document",title:"Revised",
  data:{kind:"КМД",extension:".pdf",sha256:"c".repeat(64),original_name:"Новое КМД.pdf"}});
 assert.equal(api.summary(1).invalidSources,1);
 assert.equal(api.summary(1).confirmed,0);
 assert.equal(api.list(1)[0].approved,false);
 assert.equal(api.list(2).length,0);
 assert.throws(()=>api.history(2,draft.id),/не найдена/);
 console.log("Deferred KM-KMD: source proof, numeric differences, engineering disposition, revision conflict and invalidation PASS");
})();
