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
const segments=[
 ...Array.from({length:4},(_,i)=>({
  x1:40+i*60,x2:40+i*60,y1:45,y2:330,direction:"vertical"})),
 ...Array.from({length:4},(_,i)=>({
  x1:32,x2:270,y1:310-i*60,y2:310-i*60,direction:"horizontal"}))
];
const wait=async f=>{
 for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setImmediate(r))}
 throw Error("axis preview not available")
};
(async()=>{
 let geometryCalls=0,schemeWrites=0;
 const axis={innerHTML:"",textContent:"",dataset:{},scrollIntoView(){}},
  vector={innerHTML:"",textContent:"",dataset:{}},
  button={dataset:{liteAxisPage:"0"},onclick:null},
  scan={disabled:false,onclick:null},
  slot={innerHTML:"",
   querySelectorAll:q=>q==="[data-lite-axis-page]"&&
    slot.innerHTML.includes('data-lite-axis-page="0"')?[button]:[],
   querySelector:q=>({
    "[data-lite-axis-result]":axis,"[data-lite-vector-result]":vector
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
  marks:{list:async()=>[]},
  scheme:{list:async()=>[grid],create:async()=>{schemeWrites++;}},
  "work-types":{list:async()=>[]}
 })[name]};
 const ui=createPage();
 await ui.render(host,{objectId:3,documents:[doc],indexes:[index],
  canEdit:false,pdf,geometry:geom,root:sections});
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
 assert.equal(schemeWrites,0,"grid calibration is read-only");
 assert.equal(geometryCalls,1);
 ui.dispose();
 console.log("Axis grid UI: full label-to-line preview, readonly, no scheme placements PASS");
})().catch(e=>{console.error(e);process.exitCode=1});
