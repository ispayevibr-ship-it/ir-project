"use strict";
/* Members drawn as lines: beams along their label on a plan, elevations "по оси", split labels, section names. */
const assert=require("node:assert/strict");
const {memberLine,buildLineIndex,textFrame,columnSymbol}=require("../src/ai-scheme-extract");
const {extractElevations,extractSections}=require("../src/ai-section-extract");
const {joinSplitTexts}=require("../src/ai-scheme-geometry");
const L=(x1,y1,x2,y2)=>({a:{x:x1,y:y1},b:{x:x2,y:y2}});
const T=(str,x,y,angle=0,size=10)=>({str,x,y,width:str.length*6,size,angle});
// A circle of short chords around an axis label, as CAD exports a bubble.
const ring=(cx,cy,r=9)=>Array.from({length:16},(_,i)=>{const a=i/16*2*Math.PI,b=(i+1)/16*2*Math.PI;return L(cx+r*Math.cos(a),cy+r*Math.sin(a),cx+r*Math.cos(b),cy+r*Math.sin(b))});
// Plan: a beam label above a double line, a diagonal brace with its label along it, a short tick next to a label.
{
 const segs=[L(100,200,400,200),L(100,203,400,203),L(250,190,253,190),L(500,500,700,380)];
 const lines=buildLineIndex(segs);
 const beam=memberLine(T("К103",230,195),{leader:false},segs,lines,new Set());
 assert.deepEqual([beam.a.x,beam.b.x].sort((a,b)=>a-b),[100,400],"the beam runs to the ends of its line");
 const ang=Math.atan2(120,200)*180/Math.PI,brace=memberLine({...T("К116",590,435),angle:ang},{leader:false},segs,lines,new Set());
 assert(brace&&Math.abs(brace.a.x-500)+Math.abs(brace.b.x-700)<1e-6||Math.abs(brace.b.x-500)+Math.abs(brace.a.x-700)<1e-6,"a diagonal label finds its brace");
 assert.equal(memberLine(T("К1",600,100),{leader:false},segs,lines,new Set()),null,"no line, no member");
 const f=textFrame({...T("К1",0,0),angle:90});assert(Math.abs(f.dir.y+1)<1e-9,"upward text reads along -Y");
}
// A column on a plan: a small "I" section symbol at the leader end, drawn on a beam line; a junction of slanted strokes is not one.
{
 const all=segs=>({near:()=>segs.map((_,i)=>i)});
 const I=[L(10,10,15,10),L(15,10,15,11),L(15,11,13,11),L(13,11,13,16),L(13,16,15,16),L(15,16,15,17),L(15,17,10,17),L(10,17,10,16),L(10,16,12,16),L(12,16,12,11),L(12,11,10,11),L(10,11,10,10),L(16,15,60,15)];
 assert.deepEqual(columnSymbol({x:12.5,y:10},I,all(I)),{x:12.5,y:13.5},"the symbol centre is the column");
 const arrow=[L(10,10,13,16),L(13,16,16,10),L(16,10,10,10),L(13,0,13,30)];
 assert.equal(columnSymbol({x:13,y:12},arrow,all(arrow)),null,"arrow heads are not a column");
}
// Split labels and section names with a sheet reference.
{
 const joined=joinSplitTexts([T("К",100,50),{...T("36",107,50),width:12},T("10-10 (",300,50),{...T("М1.2)",344,50)}]).map(t=>t.str);
 assert.deepEqual(joined,["К36","10-10 ( М1.2)"]);
 // (a list of marks, the title of a group drawing: ГПЭС л. 111 «К» + «114, К115, К116, К117, К118»; words are not joined)
 const list=joinSplitTexts([T("К",100,50),{...T("114, К115, К116",107,50),width:90},T("Лист",300,50),{...T("7 из 9",326,50)}]).map(t=>t.str);
 assert.deepEqual(list,["К114, К115, К116","Лист","7 из 9"]);
}
// Elevation along axis "1": bubbles А…В under the view, levels on the left, a post and a rail.
{
 const scale=20;// mm per point: 0,000 on y=500, +6,000 on y=200
 const texts=[T("Схема расположения элементов фахверка по оси",100,40),{...T("\"1\"",370,40),width:12},
  T("А",97,563),T("Б",472,563),T("В",772,563),T("7500",270,540),T("6000",610,540),
  T("0,000",30,490),T("+6,000",30,190),T("+3,000",30,340),
  {...T("К170",467,430,90),width:24},T("К151",600,346)];
 const segs=[...ring(100,560),...ring(475,560),...ring(775,560),
  L(20,500,90,500),L(20,200,90,200),L(20,350,90,350),
  L(470,500,470,200),L(475,350,775,350),L(475,353,775,353)];
 const [el]=extractElevations({segments:segs,texts},3);
 assert(el,"elevation found");
 assert.deepEqual([el.kind,el.axesX,el.axesY,el.spansY],["elevation",["1"],["А","Б","В"],[7500,6000]]);
 const post=el.placements.find(p=>p.mark==="К170"),rail=el.placements.find(p=>p.mark==="К151");
 assert.deepEqual([post.geometry_type,post.y_mm,post.z0_mm,post.z1_mm],["column",7500,0,6000],"post on axis Б from 0 to +6,000");
 assert.deepEqual([rail.geometry_type,Math.min(rail.y_mm,rail.y2_mm),Math.max(rail.y_mm,rail.y2_mm),rail.z0_mm],["beam",7500,13500,3000],"rail between Б and В at +3,000");
 assert(Math.abs(scale-el.scaleMmPerPt)<.5);
 // The same row without an elevation title still gives section levels, with level notes like "ось".
 const sec=extractSections({segments:segs,texts:texts.map(t=>t.str==="+3,000"?{...t,str:"+3,000 ось"}:t)});
 assert(sec.some(r=>r.mark==="К151"&&r.beam_mm===3000),"section row read without a title");
}
// Plan: bracing without levels of its own takes the levels of the beams it joins; sheeting is off by default.
{
 const {buildPlan}=require("../src/ai-montage-plan");
 const scheme={title:"Схема покрытия",axesX:["1","2"],axesY:["А","Б"],spansX:[6000],spansY:[6000],placements:[
  {mark:"Б1",geometry_type:"beam",x_mm:0,y_mm:0,x2_mm:6000,y2_mm:0},{mark:"Б1",geometry_type:"beam",x_mm:0,y_mm:6000,x2_mm:6000,y2_mm:6000},
  {mark:"СВ1",geometry_type:"brace",x_mm:0,y_mm:0,x2_mm:6000,y2_mm:6000}]};
 const sheeting={...scheme,title:"Схема расположения листа покрытия",placements:[{mark:"Л1",geometry_type:"beam",x_mm:0,y_mm:0,x2_mm:6000,y2_mm:0}]};
 const plan=buildPlan({pages:[{page:1,docType:"КМД монтажные",schemes:[scheme,sheeting],sections:[{mark:"Б1",section:"1-1",beam_mm:4500}]}]});
 const brace=plan.elements.find(e=>e.mark==="СВ1");
 assert.deepEqual([brace.z0_mm,brace.z1_mm,brace.levels],[4500,4500,"по соседним балкам"]);
 assert.equal(plan.schemes[1].place,false,"roof sheeting is not placed unless ticked");
}
console.log("Drawn members: plan beams and braces, elevations by axis, split labels, section names PASS");
