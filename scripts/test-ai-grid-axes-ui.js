"use strict";
const assert=require("node:assert/strict");
const {createPage}=require("../src/ai-scheme-lite-page");
const SHA="b".repeat(64);
const doc={id:14,name:"План расположения колонн.pdf",sha256:SHA,exists:true,kind:"КМ"};
const index={id:7,documentId:14,sourceSha256:SHA,
 pages:[{page:1,hasTextLayer:true,uncertainEncoding:false}]};
const grid={record_type:"scheme_grid",id:13,data:{entity_type:"grid",
 axes_x:["1","2","3","4"],x_spans_mm:[6000,6000,6000],
 axes_y:["А","Б","В","Г"],y_spans_mm:[6000,6000,6000]}};
const labels=[],width=520,height=420;
const make=(text,x,y)=>({text,x:x-4,y:height-y-5,width:8,height:10});
for(let i=0;i<4;i++)labels.push(make(String(i+1),40+i*60,340));
for(let i=0;i<4;i++)labels.push(make(["А","Б","В","Г"][i],20,310-i*60));
labels.push({text:"Колонна К62",x:105,y:215,width:10,height:10});
labels.push(make("К62",140,205));
labels.push(make("В74",140,150));
labels.push(make("4500",139,258));
const segments=[
 ...Array.from({length:4},(_,i)=>({
  x1:40+i*60,x2:40+i*60,y1:45,y2:330,direction:"vertical"})),
 ...Array.from({length:4},(_,i)=>({
  x1:32,x2:270,y1:310-i*60,y2:310-i*60,direction:"horizontal"})),
 ...[{x1:112,y1:214,x2:168,y2:214,direction:"horizontal",lengthPt:56},
     {x1:112,y1:219,x2:168,y2:219,direction:"horizontal",lengthPt:56},
     ...[163,166,169].map(y=>({x1:112,y1:y,x2:168,y2:y,
       direction:"horizontal",lengthPt:56})),
     {x1:120,y1:270,x2:165,y2:270,direction:"horizontal",lengthPt:45},
     {x1:120,y1:265,x2:120,y2:275,direction:"vertical",lengthPt:10},
     {x1:165,y1:265,x2:165,y2:275,direction:"vertical",lengthPt:10}]
];
const wait=async f=>{
 for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setImmediate(r))}
 throw Error("axis preview not available")
};
(async()=>{
 let geometryCalls=0,schemeWrites=0,sourceViews=[];
 const lineButton={dataset:{liteOutlineSource:"0"},onclick:null},
  altButton={dataset:{liteAltSource:"0:0"},onclick:null},
  axis={innerHTML:"",textContent:"",dataset:{},scrollIntoView(){},
   querySelectorAll:q=>{
    if(q==="[data-lite-outline-source]"&&
       axis.innerHTML.includes('data-lite-outline-source="0"'))return[lineButton];
    if(q==="[data-lite-alt-source]"&&
       axis.innerHTML.includes('data-lite-alt-source="0:0"'))return[altButton];
    return[]
   }},
  vector={innerHTML:"",textContent:"",dataset:{}},
  button={dataset:{liteAxisPage:"0"},onclick:null},
  instanceButton={dataset:{liteInstancesPage:"0"},onclick:null},
  instanceOutline={dataset:{liteInstanceOutline:"0"},onclick:null},
  sourceInstances={dataset:{liteInstanceSource:"0"},onclick:null},
  dimensionButton={dataset:{liteDimensionSource:"0"},onclick:null},
  regionSelect={value:"left"},
  scan={disabled:false,onclick:null},
  slot={innerHTML:"",
   querySelectorAll:q=>{
    if(q==="[data-lite-axis-page]"&&
     slot.innerHTML.includes('data-lite-axis-page="0"'))return[button];
    if(q==="[data-lite-instances-page]"&&
     slot.innerHTML.includes('data-lite-instances-page="0"'))return[instanceButton];
    if(q==="[data-lite-instance-source]"&&
     slot.innerHTML.includes('data-lite-instance-source="0"'))return[sourceInstances];
    if(q==="[data-lite-dimension-source]"&&
     slot.innerHTML.includes('data-lite-dimension-source="0"'))return[dimensionButton];
    if(q==="[data-lite-instance-outline]"&&
     slot.innerHTML.includes('data-lite-instance-outline="0"'))return[instanceOutline];
    return[]
   },
   querySelector:q=>({
    "[data-lite-axis-result]":axis,"[data-lite-vector-result]":vector,
    '[data-lite-axis-region="0"]':regionSelect
   })[q]||null
  },status={textContent:""},
  host={innerHTML:"",querySelector:q=>({
   "[data-lite-results]":slot,"[data-lite-status]":status,
   "[data-lite-scan]":scan,"[data-lite-scheme]":{}
  })[q]||null};
 const pdf={page:async()=>({source:{documentId:14,sha256:SHA},
  page:{text:"План расположения колонн Колонна К62",fragments:labels}})};
 const geom={page:async()=>{
  geometryCalls++;
  return{documentId:14,page:1,sourceSha256:SHA,widthPt:width,
   heightPt:height,rotation:0,segments}
 }};
 const sections={section:name=>({
  marks:{list:async()=>[{id:55,title:"К62",data:{mark:"К62"}},
    {id:56,title:"В74",data:{mark:"В74"}}]},
  scheme:{list:async()=>[grid],create:async()=>{schemeWrites++;}},
  "work-types":{list:async()=>[]}
 })[name]};
 const ui=createPage();
 await ui.render(host,{objectId:3,documents:[doc],indexes:[index],
  canEdit:false,pdf,geometry:geom,root:sections,
  onOpenPdf:(documentId,page,evidence)=>sourceViews.push({documentId,page,evidence})});
 scan.onclick();
 await wait(()=>slot.innerHTML.includes("data-lite-axis-page"));
 assert.equal(typeof button.onclick,"function");
 button.onclick();
 await wait(()=>axis.innerHTML.includes("Калибровка осей"));
 assert(axis.innerHTML.includes("Предварительно согласовано"),axis.innerHTML);
 assert(axis.innerHTML.includes("Совпадений X: 4/4"),axis.innerHTML);
 assert(axis.innerHTML.includes("Y: 4/4"),axis.innerHTML);
 assert(axis.innerHTML.includes("Надписи марок в ячейках сетки"),axis.innerHTML);
 assert(axis.innerHTML.includes("Зона надписи; положение конструкции не определено"),axis.innerHTML);
 assert(axis.innerHTML.includes("Векторные контуры возле марок"),axis.innerHTML);
 assert(axis.innerHTML.includes("Сводка распознавания геометрии"),
  "the user sees a consolidated geometry summary, not only 89 independent leader failures");
 assert(axis.innerHTML.includes("Готовых к автоматической расстановке: 0"),
  "unverified paired PDF strokes do not become confirmed construction placements");
 assert(axis.innerHTML.includes("Диагностика выносок"),
  "the old 89-review algorithm is clearly labeled a separate optional diagnostic");
 assert(axis.innerHTML.includes("Требуют проверки геометрии"),
  "the count is explicitly scoped to geometric evidence");
 assert(axis.innerHTML.includes("Возможный парный контур"),axis.innerHTML);
 assert(axis.innerHTML.includes("К62"),axis.innerHTML);
 assert(axis.innerHTML.includes("Несколько похожих контуров возле марки"),axis.innerHTML);
 assert(axis.innerHTML.includes("1 из"),axis.innerHTML);
 assert(axis.innerHTML.includes("В74"),axis.innerHTML);
 assert.equal(typeof lineButton.onclick,"function","candidate opens source lines");
 lineButton.onclick();
 assert.equal(sourceViews.length,1);
 assert.equal(sourceViews[0].documentId,14);
 assert.equal(sourceViews[0].page,1);
 assert.equal(sourceViews[0].evidence.length,1);
 assert.equal(sourceViews[0].evidence[0].strokeLinesPt.length,2);
 assert.deepEqual(sourceViews[0].evidence[0].strokeLinesPt.map(s=>s.x1),[112,112]);
 assert.equal(typeof altButton.onclick,"function","alternative opens exact option lines");
 altButton.onclick();
 assert.equal(sourceViews.length,2);
 assert.equal(sourceViews[1].evidence[0].strokeLinesPt.length,2);
 assert.equal(schemeWrites,0,"source PDF viewer stays read-only");
 assert.equal(schemeWrites,0,"grid calibration is read-only");
 assert.equal(geometryCalls,1);
 assert.equal(typeof instanceButton.onclick,"function");
 instanceButton.onclick();
 await wait(()=>slot.innerHTML.includes("Гипотез парного контура:"));
 assert(slot.innerHTML.includes("Реестр отдельных надписей марок"));
 assert(slot.innerHTML.includes("Координаты конструкции")||
  slot.innerHTML.includes("X/Y/Z не подтверждены"));
 assert(slot.innerHTML.includes("В этом реестре подтверждено положений: 0"));
 assert.equal(typeof sourceInstances.onclick,"function");
 sourceInstances.onclick();
 assert.equal(sourceViews.at(-1).documentId,14);
 assert.equal(sourceViews.at(-1).page,1);
 assert.equal(sourceViews.at(-1).evidence[0].quote,"В74",
  "PDF source follows the first alphabetically sorted registered instance");
 if(slot.innerHTML.includes('data-lite-instance-outline="0"')){
  assert.equal(typeof instanceOutline.onclick,"function");
  instanceOutline.onclick();
  assert.equal(sourceViews.at(-1).evidence[0].strokeLinesPt.length,2);
 }
 assert(slot.innerHTML.includes("Размерных линий с совпадающей длиной"));
 assert(slot.innerHTML.includes("Размерные цепочки PDF · 1"),
  "real calibrated strokes with both end ticks become one graphic dimension; "+
  "status="+status.textContent+"; html="+slot.innerHTML.slice(0,4200));
 assert.equal(typeof dimensionButton.onclick,"function");
 dimensionButton.onclick();
 assert.equal(sourceViews.at(-1).evidence[0].quote,"4500");
 assert.equal(sourceViews.at(-1).evidence[0].rectPt.width,8);
 assert(slot.innerHTML.includes("рядом размеры: 4500 (X)"),
  "dimension is only a nearby drawing clue, never an actual member offset");
 assert.equal(schemeWrites,0,"linking register instances cannot mutate the scheme");
 ui.dispose();
 console.log("Axis grid UI: full label-to-line preview, readonly, no scheme placements PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
