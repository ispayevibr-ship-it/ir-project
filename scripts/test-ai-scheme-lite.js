"use strict";
/* Fast erection-scheme regressions: extraction without Qwen and safe proposed
 * placement in the already saved scheme, never unverified auto-geometry. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {readElevation,extractPage,classSheet,axisGeometry,payloadFor,axisPair}=require("../src/ai-scheme-lite-page");
const text=[
 "Колонна К60",
 "отм. низа -0,400",
 "отм. верха +9,705",
 "Общая длина 10105 мм",
 "по осям 3–Г"
].join("\n");
assert.equal(readElevation(text,"bottom")?.mm,-400,"negative bottom mark is preserved");
assert.equal(readElevation(text,"top")?.mm,9705,"upper Z mark converted into millimetres");
assert.equal(readElevation("Длина 400,00", "bottom"),null,"unlabelled numbers cannot be guessed elevations");
assert.equal(axisPair(text)?.x,"3");
assert.equal(axisPair(text)?.y,"Г");
assert.equal(classSheet("План расположения элементов",text),"plan");
const sha="a".repeat(64);
const sheet={documentId:2,name:"041-2025 КМД К60.pdf",kind:"КМД",page:1,sha256:sha,
 raw:{text},uncertainEncoding:false};
const result=extractPage(sheet);
assert.equal(result.marks.length,1);
const proposal=result.marks[0];
assert.equal(proposal.mark,"К60");assert.equal(proposal.type,"column");
assert.equal(proposal.z0Mm,-400);assert.equal(proposal.z1Mm,9705);
assert.equal(proposal.lengthMm,10105);
assert.equal(proposal.locationConfirmed,false);
assert.deepEqual(proposal.source,{documentId:2,sha256:sha,name:sheet.name,kind:"КМД",page:1});
const multi=extractPage({...sheet,raw:{text:text+"\nБалка Б22"}});
assert(multi.marks.length>1);
assert.equal(multi.marks[0].z0Mm,null,"do not attribute sheet Z to ambiguous multi-mark pages");
assert.equal(multi.marks[0].axisX,"");
const garbled=extractPage({...sheet,uncertainEncoding:true});
assert.equal(garbled.marks[0].origin,"filename_only");
assert.equal(garbled.marks[0].z0Mm,null);
assert.equal(garbled.marks[0].z1Mm,null);
const missing=extractPage({...sheet,name:"План №1.pdf",raw:{text:"К60 К61 К62"}});
assert.equal(missing.marks.length,0,"bare references cannot become placements");
const x=["1","2","3","4","5","6"],y=["А","Б","В","Г","Д","Е","Ж","И","К","Л"];
const grid=[{record_type:"scheme_grid",data:{entity_type:"grid",
 axes_x:x,axes_y:y,x_spans_mm:[9000,9000,9000,9000,9000],
 y_spans_mm:[6000,6000,6000,6000,6000,6000,6000,6000,6000]}}];
assert.equal(axisGeometry([]),null,"do not mistake UI defaults for confirmed grid");
assert.equal(axisGeometry(grid).x.get("3"),18000);
assert.equal(axisGeometry(grid).y.get("Г"),18000);
const mark={id:7,mark:"К60",qty:2,work_type_id:4,name:"Колонна"};
const placement=payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:grid});
assert.equal(placement.record_type,"scheme_column");
assert.equal(placement.data.geometry_type,"column");
assert.equal(placement.data.mark_id,"7");
assert.equal(placement.data.absolute_x_mm,18000);
assert.equal(placement.data.absolute_y_mm,18000);
assert.equal(placement.data.z0_mm,-400);assert.equal(placement.data.z1_mm,9705);
assert.equal(placement.data.status,"planned");
assert.equal(placement.data.ai_source.sha256,sha);
assert.equal(placement.data.ai_placement_method,"engineer_approved_text_candidate");
assert.throws(()=>payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:[]}),/не сохранена/);
assert.throws(()=>payloadFor(proposal,{mark,axisX:"9",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:grid}),/существующие оси/);
assert.throws(()=>payloadFor({...proposal,type:"unknown"},{mark,axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:grid}),/Уточните тип/);
assert.throws(()=>payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:9705,z1Mm:-400,schemeRows:grid}),/Верх/);
assert.throws(()=>payloadFor(proposal,{mark:{...mark,mark:"К61"},axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:grid}),/точную марку/);
assert.throws(()=>payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:[...grid,{...placement,id:9}]}),/уже существует/);
assert.throws(()=>payloadFor(proposal,{mark:{...mark,qty:1},axisX:"3",axisY:"Д",z0Mm:-400,z1Mm:9705,schemeRows:[...grid,{...placement,id:9}]}),/Все экземпляры/);
// Confirm routing and lazy hot loading without repacking Electron/index.html.
const renderer=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(renderer);
assert(renderer.includes('["scheme-lite","Монтажная схема · быстро"]'));
assert(renderer.includes('script.src="irapp://app/src/ai-scheme-lite-page.js"'));
assert(renderer.includes('objectId:id,documents,indexes:pdfIndexes,canEdit'));
assert(renderer.includes('"/objects/object/"+id+"/scheme"'));
const lite=fs.readFileSync("src/ai-scheme-lite-page.js","utf8");
new vm.Script(lite);
assert(lite.includes('await reviewer.authorize(role,password)'));
assert(lite.includes("await ensureCurrent(c)"));
assert(lite.includes("await schemeApi.create(finalPayload)"));
assert(lite.includes('MAX_')===false,"no invented automatic geometry limits");
console.log("AI quick montage: К60 -0.400/+9.705, axes, provenance, no guessed placement, engineer confirmation, hot loader PASS");
