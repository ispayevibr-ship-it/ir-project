"use strict";
const assert=require("node:assert/strict");
const {buildBatchPlan}=require("../src/ai-scheme-lite-page");
const sha="b".repeat(64),source={documentId:2,page:5,sha256:sha,name:"План колонн.pdf",kind:"КМД"};
const grid={record_type:"scheme_grid",data:{entity_type:"grid",axes_x:["1","2","3","4"],axes_y:["А","Б","В","Г"],
 x_spans_mm:[6000,6000,6000],y_spans_mm:[6000,6000,6000]}};
const works=[{id:4,data:{scheme_enabled:true}}];
const mark={id:13,title:"К60",data:{mark:"К60",name:"Колонна",qty:2,work_type_id:4}};
const candidate={mark:"К60",type:"column",origin:"text_layer",sheetType:"plan",axisX:"3",axisY:"Г",
 endAxisX:"",endAxisY:"",z0Mm:-400,z1Mm:9705,source,evidence:["Колонна К60","оси 3/Г"]};
const ctx={marks:[mark],workRows:works,schemeRows:[grid],pages:[]};
let p=buildBatchPlan({...ctx,candidates:[candidate]});
assert.equal(p.ready.length,1);
assert.equal(p.review.length,0);
assert.equal(p.ready[0].entry.data.absolute_x_mm,12000);
assert.equal(p.ready[0].entry.data.absolute_y_mm,18000);
assert.equal(p.ready[0].entry.data.ai_source.sha256,sha);
p=buildBatchPlan({...ctx,candidates:[candidate,{...candidate,source:{...source,page:6}}]});
assert.equal(p.ready.length,1,"same location on two sheets must not create two instances");
assert.equal(p.review.length,1);
p=buildBatchPlan({...ctx,candidates:[candidate,{...candidate,axisX:"2"}]});
assert.equal(p.ready.length,2,"two distinct positions permitted when qty is 2");
p=buildBatchPlan({...ctx,candidates:[candidate,{...candidate,axisX:"2"}],
 marks:[{...mark,data:{...mark.data,qty:1}}]});
assert.equal(p.ready.length,0,"ambiguous overflow must not truncate to arbitrary first position");
assert.equal(p.review.length,2);
p=buildBatchPlan({...ctx,candidates:[candidate],marks:[]});
assert.equal(p.ready.length,0,"no placement without real mark register");
p=buildBatchPlan({...ctx,candidates:[candidate],schemeRows:[]});
assert.equal(p.ready.length,0,"no placement using synthetic axes");
p=buildBatchPlan({...ctx,candidates:[{...candidate,axisX:""}]});
assert.equal(p.ready.length,0,"missing location requires review");
p=buildBatchPlan({...ctx,candidates:[{...candidate,sheetType:"detail"}]});
assert.equal(p.ready.length,0,"fabrication details cannot substitute montage plan");
p=buildBatchPlan({...ctx,candidates:[candidate],workRows:[]});
assert.equal(p.ready.length,0,"work type must enable a scheme");
p=buildBatchPlan({...ctx,candidates:[candidate],
 schemeRows:[grid,{id:18,record_type:"scheme_column",data:{entity_type:"column",mark_id:13,
 absolute_x_mm:12000,absolute_y_mm:18000,z0_mm:-400,z1_mm:9705}}]});
assert.equal(p.ready.length,0,"duplicate placement on scheme forbidden");
p=buildBatchPlan({...ctx,candidates:[],pages:[{page:1,textAvailable:false,uncertainEncoding:false,sheetType:"plan",marks:[]}]});
assert.equal(p.difficult.length,1,"ambiguous or textless sheets remain flagged for manual verification");
const ui=require("node:fs").readFileSync("src/ai-scheme-lite-page.js","utf8");
assert(ui.includes("data-lite-batch"),"engineer approves batch explicitly");
assert(!ui.includes("data-lite-qwen"),"ambiguous plans must stay local; no Qwen queue");
assert(ui.includes("expectedCount")||ui.includes("preview.count"),"existing scheme reset protected");
console.log("Mounting batch planner: evidence, axes/Z, dedupe, quantity and local-only review PASS");
