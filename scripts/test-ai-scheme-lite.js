"use strict";
/* Fast erection-scheme regressions: deterministic extraction and safe proposed
 * placement in the already saved scheme, never unverified auto-geometry. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {readElevation,extractPage,classSheet,axisGeometry,payloadFor,axisPair,axisSpan}=require("../src/ai-scheme-lite-page");
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
assert.equal(axisPair("по осям Г–3")?.x,"3","reversed named intersection is supported");
assert.equal(axisPair("по осям 3–Г; по осям 4–Д"),null,
 "multiple incompatible locations must not be selected arbitrarily");
assert.equal(axisPair("Балка Б22, ось 3"),null,
 "a single axis is not a two-dimensional mounting position");
assert.deepEqual(
 (({x,y,endX,endY})=>({x,y,endX,endY}))(axisSpan("Балка Б22 между осями 5–6 по оси Г")),
 {x:"5",y:"Г",endX:"6",endY:"Г"});
assert.deepEqual(
 (({x,y,endX,endY})=>({x,y,endX,endY}))(axisSpan("связь С1 по оси 3 между осями Г–Д")),
 {x:"3",y:"Г",endX:"3",endY:"Д"});
assert.equal(axisSpan("между осями 5–6"),null,"span without transverse axis is incomplete");
assert.equal(axisSpan("между осями 5–6 по оси Г; между осями 4–5 по оси Д"),null,
 "conflicting spans must not be guessed");
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
const beam=extractPage({...sheet,name:"КМД Б22.pdf",
 raw:{text:"Балка Б22\nмежду осями 5–6 по оси Г\nотм. низа +3,000\nотм. верха +3,500"}});
assert.equal(beam.marks[0].axisX,"5");
assert.equal(beam.marks[0].axisY,"Г");
assert.equal(beam.marks[0].endAxisX,"6");
assert.equal(beam.marks[0].endAxisY,"Г");
assert.equal(beam.marks[0].locationConfirmed,false,"the engineer must approve even explicit axes");
const ambiguousBeam=extractPage({...sheet,raw:{text:
 "Балка Б22\nмежду осями 5–6 по оси Г\nпо осям 4–Д"}});
assert.equal(ambiguousBeam.marks[0].axisX,"","conflicting span and point remains unplaced");
assert.equal(ambiguousBeam.marks[0].endAxisX,"");
assert.deepEqual(proposal.source,{documentId:2,sha256:sha,name:sheet.name,kind:"КМД",page:1});
const repeated=extractPage({...sheet,name:"Схема расположения колонн.pdf",
 raw:{text:text+"\nКолонна К60 на другом участке плана"}});
assert.equal(repeated.marks.length,1,"one register designation may appear more than once");
assert.equal(repeated.markMentions,2,"each printed label occurrence must be accounted for");
assert.equal(repeated.marks[0].axisX,"","repeated label on one sheet is not one confirmed instance");
assert.equal(repeated.marks[0].z0Mm,null,"global elevation cannot attach to arbitrary repeated label");
assert.match(repeated.marks[0].warning,/несколько упоминаний/);
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
assert.throws(()=>payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:9705,z1Mm:-400,schemeRows:grid}),/проверенные отметки начала и конца/);
assert.throws(()=>payloadFor(proposal,{mark:{...mark,mark:"К61"},axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:grid}),/точную марку/);
assert.throws(()=>payloadFor(proposal,{mark,axisX:"3",axisY:"Г",z0Mm:-400,z1Mm:9705,schemeRows:[...grid,{...placement,id:9}]}),/уже существует/);
assert.throws(()=>payloadFor(proposal,{mark:{...mark,qty:1},axisX:"3",axisY:"Д",z0Mm:-400,z1Mm:9705,schemeRows:[...grid,{...placement,id:9}]}),/Все экземпляры/);
// Plan-only bare labels are matched against the real register before
// becoming manual-review candidates (never inferred member placements).
const rawLabel=(name,x)=>({text:name,x,y:90,width:12,height:8});
const loosePlan=extractPage({documentId:4,name:"План расположения конструкций",
 kind:"КМД",sha256:sha,page:2,raw:{
 text:"План расположения конструкций",
 fragments:[rawLabel("К62",10),rawLabel("К62",10.5),
  rawLabel("В74",44),rawLabel("К999",100)]},
 registeredMarks:[{id:11,title:"К62",data:{mark:"К62"}},
  {id:12,title:"В74",data:{mark:"В74"}}]});
assert.deepEqual(loosePlan.marks.map(x=>x.mark),["К62","В74"]);
assert(loosePlan.marks.every(x=>x.type==="unknown"&&
 x.origin==="plan_label_only"&&x.z0Mm===null&&x.z1Mm===null));
assert.equal(loosePlan.marks[0].labelMentions,1,"same PDF glyph must not double-count");
assert.equal(loosePlan.marks[0].evidenceLocations.length,1);
assert.equal(extractPage({documentId:4,name:"Сечения деталей",kind:"КМД",
 sha256:sha,page:2,raw:{text:"Сечение",fragments:[rawLabel("К62",10)]},
 registeredMarks:[{id:11,title:"К62",data:{mark:"К62"}}]}).marks.length,0,
 "fabrication details do not become plan placements");
assert.equal(extractPage({documentId:4,name:"План расположения конструкций",
 kind:"КМД",sha256:sha,page:2,raw:{text:"План",fragments:[rawLabel("К62",10)]},
 registeredMarks:[]}).marks.length,0,"never accept marks outside the register");

const {extractPlanInstances}=require("../src/ai-scheme-lite-page");
const duplicateRegister=extractPlanInstances({
 documentId:4,sha256:sha,page:1,widthPt:500,heightPt:500,
 raw:{fragments:[rawLabel("К62",10)]},
 marks:[{id:11,title:"К62",data:{mark:"К62"}},
  {id:12,title:"К62",data:{mark:"К62"}}]
});
assert.equal(duplicateRegister.labels.length,0,
 "ambiguous register IDs cannot be linked to physical instances");
assert(duplicateRegister.ambiguousRegisterMarks.includes("К62"));
assert(!duplicateRegister.skippedUnknownMarks.includes("К62"),
 "ambiguous registered marks are not unknown labels");

// Confirm routing and lazy hot loading without repacking Electron/index.html.
const renderer=fs.readFileSync("src/ai-recognition-page.js","utf8");
new vm.Script(renderer);
assert(renderer.includes('data-kmd-tab="scheme-lite"'));
assert(renderer.includes('el.src="irapp://app/src/ai-scheme-lite-page.js"'));
assert(renderer.includes('objectId:id,documents:docs,indexes'));
assert(renderer.includes('"/objects/object/"+id+"/scheme"'));
const lite=fs.readFileSync("src/ai-scheme-lite-page.js","utf8");
new vm.Script(lite);
assert(lite.includes('hostWindow.confirm('));
assert(lite.includes("await ensureCurrent(c)"));
assert(lite.includes("await schemeApi.create(finalPayload)"));
assert(lite.includes('MAX_')===false,"no invented automatic geometry limits");
console.log("KMD quick montage: К60 -0.400/+9.705, axes, provenance, no guessed placement, manual confirmation, hot loader PASS");
