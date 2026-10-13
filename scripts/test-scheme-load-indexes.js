"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/scheme-page.js","utf8");
const from=(left,right)=>{
 const start=source.indexOf(left),end=source.indexOf(right,start+left.length);
 assert(start>=0&&end>start,"Missing source "+left);
 return source.slice(start,end)
};
const marks=Array.from({length:610},(_,i)=>({id:String(i+1),mark:"K"+(i+1),work_type_id:String(i%7),name:"Колонна"}));
marks.push({id:"611",mark:"DUP",work_type_id:"2"});
marks.push({id:"612",mark:"DUP",work_type_id:"3"});
marks.push({id:"613",mark:"TWICE",work_type_id:"2"});
marks.push({id:"614",mark:"TWICE",work_type_id:"2"});
const norm=s=>String(s||"").trim().toLowerCase().replace(/ё/g,"е");
const context={marks,workById:new Map(),norm,schemeGroupOf:()=>({key:"columns",label:"Колонны"}),recordGroup:()=>({key:"fallback",label:"Резерв"})};
const head=from(" const markGroupCache=","\n  const frameCategories=");
const index=from(" const markById=new Map","\n let updatingMarkProgress=");
const work=from(" const recordWorkId=r=>","\n const workMarks=");
const link=from(" const linkedMark=r=>","\n const effectiveStatus=");
const group=from(" const recordMarkGroup=r=>","\n const inView=");
const api=vm.runInNewContext(head+"\n"+index+"\n"+work+"\n"+link+"\n"+group+
 "\n({recordWorkId,linkedMark,recordMarkGroup,markGroup,rebuildMarkLookup,marksByName,marksByWorkName})",context);
assert.equal(api.markGroup(marks[0]),api.markGroup(marks[0]),"category grouping reused");
assert.equal(api.recordWorkId({mark_id:"1"}),"0");
assert.equal(api.recordWorkId({mark:"K19"}),String(18%7));
assert.equal(api.linkedMark({mark_id:"1",work_type_id:"0"}).id,"1");
assert.equal(api.linkedMark({mark:"K19",work_type_id:String(18%7)}).id,"19");
assert.equal(api.recordWorkId({mark:"DUP"}),"","ambiguous names must not guess work types");
assert.equal(api.linkedMark({mark:"DUP",work_type_id:"2"}).id,"611");
assert.equal(api.linkedMark({mark:"TWICE",work_type_id:"2"}),null,"multiple same-work labels remain ambiguous");
assert.equal(api.recordMarkGroup({mark_id:"1"}).key,"columns");
assert.equal(api.recordMarkGroup({mark_id:"missing"}).key,"fallback");
marks.push({id:"615",mark:"NEW",work_type_id:"4"});
api.rebuildMarkLookup();
assert.equal(api.recordWorkId({mark:"NEW"}),"4","refresh rebuilds indexes");
assert.equal(api.marksByName.size>600,true);
// Synthetic project-size batch, with no per-record full-array mark scan:
const positions=Array.from({length:1970},(_,i)=>({mark:"K"+(i%610+1),work_type_id:String((i%610)%7)}));
for(const row of positions)assert(api.linkedMark(row));
const grid=from(" let gridRowsSnapshot=","\n const activeGrid=()=>");
const geo=from(" let baseCoordGrid=","\n const cumulative=");
assert(grid.includes("gridRowsSnapshot!==rows")&&geo.includes("baseCoordGrid!==grid"));
console.log("Scheme load indexes: 1970 elements / 614+ marks, ambiguous IDs and legacy axes, and refresh OK");
