"use strict";
/* PDF → Claude → montage scheme: real PDF geometry and rendering, scripted Claude answer, real record format. */
const assert=require("node:assert/strict");
const {schemeFixture}=require("./test-ai-scheme-extract");
const {createSchemeDrafts}=require("../src/ai-scheme-draft");
const {createPdfRenderer}=require("../src/ai-pdf-renderer");
const {createMontage}=require("../src/ai-montage");
function fakeDatabase(){
 let next=1;
 return{rows:[],getObject:id=>Number(id)===7?{id:7}:null,
  listEntity(id,key){return this.rows.filter(x=>x.object_id===Number(id)&&x.section_key===key).map(r=>JSON.parse(JSON.stringify(r)))},
  createEntity(id,key,item){const row={id:next++,object_id:Number(id),section_key:key,title:item.title||"",record_type:item.record_type,data:JSON.parse(JSON.stringify(item.data)),created_at:"2026-10-21"};this.rows.push(row);return JSON.parse(JSON.stringify(row))},
  updateEntity(id,key,rowId,item){const row=this.rows.find(r=>r.object_id===Number(id)&&r.section_key===key&&r.id===Number(rowId));if(!row)return null;row.title=item.title;row.record_type=item.record_type;row.data=JSON.parse(JSON.stringify(item.data));return row},
  deleteEntity(id,key,rowId){const i=this.rows.findIndex(r=>r.object_id===Number(id)&&r.section_key===key&&r.id===Number(rowId));if(i<0)return false;this.rows.splice(i,1);return true}}
}
(async()=>{
 const pdf=schemeFixture();
 const database=fakeDatabase();
 // All PDFs of the object at once: the same plan twice, a broken PDF, and a picture that is not analysed.
 // The kind of each drawing is set by the engineer; "Не анализировать" files are left out.
 const files=[{id:31,name:"plan-K.pdf",ext:".pdf",exists:true,kind:"КМД монтажные"},{id:32,name:"plan-K copy.pdf",ext:".pdf",exists:true,kind:"Не определён"},
  {id:34,name:"broken.pdf",ext:".pdf",exists:true,kind:"КМД монтажные"},{id:35,name:"notes.pdf",ext:".pdf",exists:true,kind:"Не анализировать"},
  {id:33,name:"photo.png",ext:".png",exists:true,kind:"Не определён"}];
 const documents={list:()=>files,readForPdfIndex:async(oid,did)=>{assert([31,32,34].includes(Number(did)));
  return{buffer:Number(did)===34?Buffer.from("not a pdf"):pdf,source:{documentId:Number(did),name:files.find(f=>f.id===Number(did)).name,sha256:"x".repeat(64),kind:"КМД",format:"PDF"}}}};
 // A shipping mark written in Cyrillic must match "K1" written with Latin letters on the sheet.
 database.createEntity(7,"marks",{record_type:"mark",title:"К1",data:{mark:"К1",name:"Колонна",work_type_id:"5"}});
 let answer=null,request=null,failure=null;
 let script=null;const calls=[];
 const engine={requestJSON:async req=>{request=req;calls.push(req.images.map(i=>i.label));if(script)return script(req);if(failure)throw failure;return{data:answer,model:"claude-opus-5-5",usage:{}}}};
 const drafts=createSchemeDrafts({database,documents});
 const events=[];
 // The engineer's changes after a placement (src/ai-training.js), as the test sets them.
 let edits=[],recorded=null;
 const training={corrections:()=>edits,recordPlacement:(oid,o)=>{recorded=o}};
 const montage=createMontage({database,documents,drafts,renderer:createPdfRenderer({database,documents}),engine,training,onProgress:e=>events.push(e)});
 assert.equal(montage.latest(7),null);
 // Step 1: local geometry.
 await assert.rejects(montage.analyze(7),/Укажите тип чертежа для: plan-K copy\.pdf/);
 files[1].kind="КМД монтажные";
 let view=await montage.analyze(7);
 assert.deepEqual([view.files,view.sheets,view.schemesFound,view.elementsFound],[2,2,2,8]);
 assert.deepEqual(view.failed.map(f=>f.name),["broken.pdf"],"a broken file does not stop the others");
 // The project knowledge base of the object: a log entry per file, the broken one with its error.
 const kbLog=database.rows.filter(r=>r.object_id===7&&r.section_key==="ai-project-log"&&r.record_type==="processing_log").map(r=>r.data);
 assert.deepEqual(kbLog.map(e=>e.file+":"+e.status).sort(),["broken.pdf:error","plan-K copy.pdf:ok","plan-K.pdf:ok"]);
 assert(view.journal.log.some(l=>/Проектная база: карточек марок/.test(l.text)));
 assert.equal(view.journal.projectLog.length,3,"the journal shows the object's processing log");assert(Array.isArray(view.journal.projectCards));
 assert(events.some(e=>e.step==="analyze"&&e.file===2&&e.files===3),"progress is reported per file");
 assert.match(database.rows.find(r=>r.section_key==="ai-scheme-draft").data.log[0].text,/не анализировались 1/);
 assert.equal(view.ai,null);
 // Everything read is placed, without AI or typed heights too: conventional levels, marked «проверьте».
 assert.equal(view.plan.ready,true,"without AI or typed heights everything is still placed");
 assert.match(view.plan.problems[0],/без своих отметок/);
 const placements=database.rows.find(r=>r.section_key==="ai-scheme-draft").data.pages[0].schemes[0].placements;
 const index=mark=>placements.findIndex(p=>p.mark===mark);
 // Step 2: Claude receives the sheet image and the local result, answers with decisions only.
 const decision=page=>({page,index:0,place:true,reason:"Схема колонн",geometry_type:"as_found",z0_mm:0,z1_mm:8400,
  changes:[{i:index("K2"),keep:false,geometry_type:"column",z0_mm:0,z1_mm:8400,note:"Ссылка на узел, не элемент"},
   {i:index("P1"),keep:true,geometry_type:"beam",z0_mm:7800,z1_mm:7800,note:"Балка по разрезу 1-1"}]});
 answer={summary:"Каркас на отметке 0,000, верх колонн +8,400",schemes:[decision(1),decision(2)]};
 view=await montage.process(7,view.draftId);
 assert.equal(request.images.length,2);assert.equal(request.images[1].label,"Лист 2 («plan-K copy.pdf», стр. 1, КМД монтажные)");
 assert.equal(request.images[0].mime,"image/png");assert(request.images[0].buffer.length>2000,"a real rendered sheet is sent");
 assert(request.text.includes("СХЕМА page=1 index=0")&&request.text.includes("СХЕМА page=2 index=0"));assert(request.text.includes("|K1|column|0|0|"));
 assert(request.system.includes("не дублируй")&&request.system.includes("elements"),"Claude adds what the geometry missed, without repeating it");
 assert(request.shared.includes("МАРКИ, НАЙДЕННЫЕ ПРОГРАММОЙ")&&!request.shared.includes("СХЕМА page="),"the cached part holds the set, the batch text holds its schemes");
 assert.equal(request.schema.properties.schemes.items.required.includes("changes"),true);
 assert.equal(view.ai.status,"done");assert.match(view.ai.summary,/8,400/);
 // The engineer's comment on the page «Обработка Claude» goes to every request of the run and stays with the analysis.
 assert(!request.shared.includes("УКАЗАНИЯ ИНЖЕНЕРА"),"no comment — no section");
 view=await montage.process(7,view.draftId,{restart:true,comment:"  Колонны К1 на отметке +0.150  "});
 assert(request.shared.includes("УКАЗАНИЯ ИНЖЕНЕРА К ЭТОЙ ОБРАБОТКЕ")&&request.shared.includes("Колонны К1 на отметке +0.150"),"engineer's comment goes to Claude");
 assert.equal(view.comment,"Колонны К1 на отметке +0.150");
 view=await montage.process(7,view.draftId,{restart:true});
 assert(request.shared.includes("Колонны К1 на отметке +0.150"),"the comment is kept for the next run");
 view=await montage.process(7,view.draftId,{restart:true,comment:""});
 assert(!request.shared.includes("УКАЗАНИЯ ИНЖЕНЕРА")&&view.comment==="","an emptied comment is removed");
 assert.equal(view.plan.ready,true);assert.equal(view.plan.elements,3);
 assert.deepEqual(view.plan.skipped.map(s=>s.mark+":"+s.reason).sort(),["K1:Повтор на другом листе","K2:Ссылка на узел, не элемент","K2:Ссылка на узел, не элемент","K7:Повтор на другом листе","P1:Повтор на другом листе"],"the same plan in two files is placed once");
 // Step 3: grid and members land in the montage scheme in its own record format.
 view=montage.place(7,view.draftId);
 const scheme=database.rows.filter(r=>r.section_key==="scheme");
 const grid=scheme.find(r=>r.record_type==="scheme_grid");
 assert.deepEqual([grid.data.axes_x,grid.data.x_spans_mm,grid.data.span_x_mm],[["1","2","3"],[6000,6000],12000]);
 assert.deepEqual([grid.data.axes_y,grid.data.y_spans_mm,grid.data.span_y_mm],[["A","B","C"],[6000,4500],10500]);
 const members=scheme.filter(r=>r.record_type==="scheme_column").map(r=>r.data);
 assert.equal(members.length,3);
 const k1=members.find(m=>m.mark==="К1"),k7=members.find(m=>m.mark==="K7"),p1=members.find(m=>m.mark==="P1");
 assert.deepEqual([k1.mark_id,k1.work_type_id,k1.absolute_x_mm,k1.absolute_y_mm,k1.z0_mm,k1.z1_mm,k1.axis_x,k1.axis_y,k1.scheme_group],["1","5",0,0,0,8400,"1","A","columns"]);
 assert.deepEqual([k7.absolute_x_mm,k7.absolute_y_mm],[12000,6000]);
 // Marks the register does not have are added to it under a work type of their own; К1 stays linked to the engineer's mark.
 const autoWork=database.rows.find(r=>r.section_key==="work-types"&&r.data.ai_created);
 assert.deepEqual([autoWork.title,autoWork.data.unit,autoWork.data.scheme_enabled,autoWork.data.has_marks],["Монтаж металлоконструкций (из PDF)","тн",true,true]);
 const autoMarks=database.rows.filter(r=>r.section_key==="marks"&&r.data.ai_created);
 assert.deepEqual(autoMarks.map(r=>r.data.mark).sort(),["K7","P1"]);
 assert(autoMarks.every(r=>r.data.work_type_id===String(autoWork.id)&&r.data.qty>=1&&r.data.unit==="тн"));
 assert(autoMarks.every(r=>r.data.name),"an added mark always has a name (the scheme page groups by it)");
 assert.equal(k7.mark_id,String(autoMarks.find(r=>r.data.mark==="K7").id));assert.equal(k7.work_type_id,String(autoWork.id));
 assert.deepEqual([p1.geometry_type,p1.absolute_x_mm,p1.absolute_x2_mm,p1.absolute_y_mm,p1.z0_mm,p1.z1_mm,p1.end_z_mm,p1.scheme_group],["beam",6000,12000,6000,7800,7800,7800,"girders"]);
 assert(members.every(m=>m.status==="planned"&&m.import_requires_verification===false&&m.import_batch===view.placed.batch));
 assert.deepEqual([view.placed.created,view.placed.linked,view.placed.marksCreated,view.placed.workCreated,view.placed.gridMode],[3,1,2,true,"created"]);
 assert.equal(view.placed.undo,undefined,"undo data stays in the main process");
 const undone=montage.undo(7,view.draftId);
 assert.equal(undone.removed,3);assert.equal(undone.view.placed,null);
 assert.equal(database.rows.filter(r=>r.section_key==="scheme").length,0,"the grid created by the placement is removed too");
 assert(!database.rows.some(r=>r.data?.ai_created),"undo removes the marks and the work type it added to the register");
 assert.equal(database.rows.filter(r=>r.section_key==="marks").length,1,"the engineer's own mark stays");
 view=montage.place(7,view.draftId);assert.equal(view.placed.created,3);
 // A new placement overwrites the previous one: same records, new coordinates and heights, status kept.
 const cols=()=>database.rows.filter(r=>r.section_key==="scheme"&&r.record_type==="scheme_column");
 const k1row=cols().find(r=>r.data.mark==="К1"),k7row=cols().find(r=>r.data.mark==="K7");
 database.updateEntity(7,"scheme",k1row.id,{record_type:"scheme_column",title:k1row.title,data:{...k1row.data,absolute_x_mm:3000,z1_mm:5000,status:"mounted"}});
 database.updateEntity(7,"scheme",k7row.id,{record_type:"scheme_column",title:k7row.title,data:{...k7row.data,mark:"K99"}});
 view=montage.place(7,view.draftId);
 assert.deepEqual([view.placed.created,view.placed.updated,view.placed.removed,view.placed.missing,view.placed.gridMode],[1,2,0,1,"replaced"]);
 assert.deepEqual([view.placed.marksCreated,database.rows.filter(r=>r.section_key==="marks"&&r.data.ai_created).length],[0,2],"a repeated placement links to the marks it added before, no duplicates");
 const k1again=cols().find(r=>r.id===k1row.id);
 assert.deepEqual([k1again.data.absolute_x_mm,k1again.data.z1_mm,k1again.data.status,k1again.title],[0,8400,"mounted",k1row.title],"coordinates and heights renewed, status kept");
 // A mark no longer in the drawings is not deleted: kept, marked «нет в новом анализе», removed by hand if really gone.
 const k99=cols().find(r=>r.data.mark==="K99");
 assert.equal(cols().length,4);
 assert.deepEqual([k99.data.instance_status,k99.data.preliminary,Boolean(k99.data.missing_in_analysis)],["not_found",true,true]);
 assert(cols().filter(r=>r.data.mark!=="K99").every(r=>r.data.instance_status&&r.data.source_section==="КМД"),"each element has its status and section");
 // Undo brings the previous state back.
 montage.undo(7,view.draftId);
 assert.deepEqual([cols().find(r=>r.id===k1row.id).data.absolute_x_mm,cols().length,cols().some(r=>r.data.mark==="K99")],[3000,3,true]);
 // Clearing the scheme keeps a copy that can be restored.
 const cleared=montage.clearScheme(7);
 assert.deepEqual([cleared.removed,cols().length,cleared.snapshot.count],[3,0,3]);
 assert(database.rows.some(r=>r.section_key==="scheme"&&r.record_type==="scheme_grid"),"the grid stays unless asked");
 assert.throws(()=>montage.clearScheme(7),/уже пуста/);
 assert.equal(montage.restoreScheme(7).restored,3);assert.equal(cols().length,3);
 montage.clearScheme(7);
 view=montage.place(7,view.draftId);assert.equal(view.placed.created,3);
 // An element changed by the engineer after the placement keeps his values; the new reading of the drawings goes beside
 // it, and the placement records what was placed before, so that the change stays a correction.
 const k1now=cols().find(r=>r.data.mark==="К1");
 database.updateEntity(7,"scheme",k1now.id,{record_type:"scheme_column",title:k1now.title,data:{...k1now.data,absolute_x_mm:500,mark:"К1а"}});
 edits=[{id:String(k1now.id),kind:["position","mark"],before:{mark:"К1",x:0,y:0,z0:0,z1:8400},after:{mark:"К1а",x:500,y:0}}];
 view=montage.place(7,view.draftId);
 const k1kept=cols().find(r=>r.id===k1now.id);
 assert.deepEqual([k1kept.data.absolute_x_mm,k1kept.data.mark,k1kept.data.pdf_new.x,k1kept.data.instance_status,k1kept.data.engineer_edited],[500,"К1а",0,"confirmed",true]);
 assert.deepEqual([view.placed.keptEdited,view.placed.created,view.placed.missing,cols().length],[1,0,0,3],"found by the mark it was placed with: no second К1");
 assert.deepEqual(recorded.carried,[{id:String(k1now.id),origin:edits[0].before}]);
 edits=[];
 for(const r of database.rows.filter(r=>r.section_key==="scheme"&&r.record_type==="scheme_column"))database.deleteEntity(7,"scheme",r.id);
 // The engineer's own grid (saved in the grid editor, without import_batch) is the main one: it is not replaced, the
 // elements land on its axes by name, the differences with the PDF are listed.
 const g0=database.rows.find(r=>r.record_type==="scheme_grid");
 database.updateEntity(7,"scheme",g0.id,{record_type:"scheme_grid",title:"Сетка",data:{entity_type:"grid",axes_x:["1","2","3"],axes_y:["A","B","C"],x_spans_mm:[6000,6300],y_spans_mm:[6000,4500],span_x_mm:12300,span_y_mm:10500}});
 view=montage.place(7,view.draftId);
 assert.equal(view.placed.gridMode,"kept");
 assert.deepEqual(database.rows.find(r=>r.record_type==="scheme_grid").data.x_spans_mm,[6000,6300],"the engineer's grid stays");
 assert.deepEqual([cols().find(r=>r.data.mark==="K7").data.absolute_x_mm,cols().find(r=>r.data.mark==="K7").data.axis_x],[12300,"3"],"K7 at axis 3 of the engineer's grid");
 assert(view.placed.gridDiffs.includes("2–3: по PDF 6000 мм, в схеме 6300 мм"),view.placed.gridDiffs.join("; "));
 for(const r of database.rows.filter(r=>r.section_key==="scheme"&&r.record_type==="scheme_column"))database.deleteEntity(7,"scheme",r.id);
 // A scheme that already has members on a different grid is not touched.
 const other=database.rows.find(r=>r.record_type==="scheme_grid");
 database.updateEntity(7,"scheme",other.id,{record_type:"scheme_grid",title:"Сетка",data:{entity_type:"grid",axes_x:["10","11"],axes_y:["X","Y"],x_spans_mm:[6000],y_spans_mm:[6000],span_x_mm:6000,span_y_mm:6000}});
 database.createEntity(7,"scheme",{record_type:"scheme_column",title:"COL-1",data:{entity_type:"column",mark:"Z1",absolute_x_mm:0,absolute_y_mm:0,z0_mm:0,z1_mm:3000}});
 assert.throws(()=>montage.place(7,view.draftId),/своя сетка осей/);
 // Claude unavailable: the failure is stored and the engineer can continue with typed heights.
 failure=new Error("Нет связи с api.anthropic.com");
 await assert.rejects(montage.process(7,view.draftId),/Нет связи/);
 view=montage.latest(7);assert.equal(view.ai.status,"failed");assert.equal(view.plan.ready,true,"placed anyway, with conventional levels");
 view=montage.skipAI(7,view.draftId);assert.equal(view.ai.status,"skipped");
 view=montage.preview(7,view.draftId,{"1:0":{place:true,z0_mm:"0",z1_mm:"6000"},"2:0":{place:false}});
 assert.equal(view.plan.ready,true);assert.equal(view.plan.elements,4,"without AI every found element is kept");
 assert.equal(view.plan.schemes[0].z1_mm,6000);
 // A scheme the AI calls "beams": points found on one axis become beams between neighbouring axes.
 const {buildPlan}=require("../src/ai-montage-plan");
 const draftData=database.rows.find(r=>r.section_key==="ai-scheme-draft").data;
 const beams=buildPlan(draftData,{schemes:[{page:1,index:0,place:true,reason:"",geometry_type:"beam",z0_mm:4500,z1_mm:4500,changes:[]}]},{});
 const k2=beams.elements.find(e=>e.mark==="K2");
 assert.deepEqual([k2.geometry_type,k2.x_mm,k2.x2_mm,k2.y_mm,k2.z0_mm,k2.z1_mm],["beam",0,6000,0,4500,4500]);
 const k1b=beams.elements.find(e=>e.mark==="K1");
 assert(k1b&&/Концы не найдены/.test(k1b.note),"a point at an axis crossing has no beam ends: placed conventionally, to be checked");
 // A too long answer splits the batch; finished parts survive an error and the next run continues.
 const overflow=Object.assign(Error("Ответ Claude не поместился в лимит ответа"),{code:"max_tokens"});
 let attempt=0;calls.length=0;
 script=req=>{attempt++;if(req.images.length>1)throw overflow;if(attempt===3)throw Error("Нет связи с api.anthropic.com");return{data:answer,model:"claude-opus-5-5",usage:{input_tokens:10}}};
 await assert.rejects(montage.process(7,view.draftId,{restart:true}),/Нет связи/);
 assert.deepEqual(calls.map(c=>c.length),[2,1,1],"the overflowing batch of two sheets was split");
 view=montage.latest(7);assert.deepEqual([view.ai.status,view.ai.partial],["failed",1]);
 calls.length=0;
 view=await montage.process(7,view.draftId);
 assert.deepEqual(calls.map(c=>c[0]),["Лист 2 («plan-K copy.pdf», стр. 1, КМД монтажные)"],"only the unfinished sheet is sent again");
 assert.deepEqual([view.ai.status,view.ai.batches],["done",2]);
 assert.match(view.journal.log[0].text,/продолжено, ранее готово 1/);
 script=null;
 // Two batches at once (the engineer, 27.10.2026: «обработка очень долгая»): 20 sheets — three batches, never more
 // than two asked together; an error of one lets the other finish and keeps its answer.
 {
  const row=database.rows.find(r=>r.section_key==="ai-scheme-draft"&&String(r.id)===String(view.draftId));
  const saved=row.data.pages;
  row.data.pages=Array.from({length:20},(_,i)=>{const p=saved[i%saved.length];return{...JSON.parse(JSON.stringify(p)),page:i+1,pdfPage:p.pdfPage||p.page,documentId:p.documentId}});
  let now=0,most=0;const asked=[];
  // The first answer waits for the second request (the pictures of a batch take longer than this fake Claude).
  let second=null;const met=new Promise(r=>{second=r});
  script=async req=>{now++;most=Math.max(most,now);asked.push(req.images.length);if(now===2)second();if(asked.length===1)await Promise.race([met,new Promise(r=>setTimeout(r,20000))]);await new Promise(r=>setTimeout(r,5));now--;return{data:{summary:"",schemes:[]},model:"claude-opus-5-5",usage:{}}};
  view=await montage.process(7,view.draftId,{restart:true});
  assert.deepEqual([view.ai.status,view.ai.batches,most],["done",3,2],"three batches, two at a time");
  assert.deepEqual(asked.sort((a,b)=>b-a),[8,8,4]);
  let n=0;now=0;
  script=async req=>{const k=++n;await new Promise(r=>setTimeout(r,k===1?10:40));if(k===1)throw Error("Нет связи с api.anthropic.com");return{data:{summary:"",schemes:[]},model:"claude-opus-5-5",usage:{}}};
  await assert.rejects(montage.process(7,view.draftId,{restart:true}),/Нет связи/);
  const after=database.rows.find(r=>r.section_key==="ai-scheme-draft"&&String(r.id)===String(view.draftId)).data.ai;
  assert.equal(after.status,"failed","the failure is what stays, not the other batch's «running»");
  assert.equal(Object.keys(after.partial).length,1,"the other batch's answer is kept");assert.equal(n,2,"no new batch after the failure");
  row.data.pages=saved;script=null
 }
 // Sheets unticked on the drawings page are not analysed; a file with no sheets left is reported.
 files[1].excluded=[1];
 view=await montage.analyze(7);
 assert.deepEqual([view.files,view.sheets],[1,1]);
 assert(view.failed.some(f=>f.name==="plan-K copy.pdf"&&/сняты с анализа/.test(f.error)));
 delete files[1].excluded;
 console.log("Montage: PDF geometry → Claude decisions → montage scheme records, dedupe, undo and fallbacks PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
