"use strict";
/* Levels read from sections and scheme notes: synthetic sheet geometry, no PDF needed. */
const assert=require("node:assert/strict");
const {extractSections,schemeNotes}=require("../src/ai-section-extract");
const {buildPlan}=require("../src/ai-montage-plan");
const H=(y,x0,x1)=>({a:{x:x0,y},b:{x:x1,y}}),V=(x,y0,y1)=>({a:{x,y:y0},b:{x,y:y1}});
const T=(str,x,y,angle=0)=>({str,x,y,width:str.length*6,size:10,angle});
// Section 1-1 at 20 mm per point: 0,000 on y=300, +4,000 on y=100; arrow tips 10 pt under the text.
const segments=[H(300,0,400),H(100,40,400),H(140,60,300),V(150,100,320),
 // Level mark shelves and arrows (two marks vote for the same offset).
 H(310,20,60),H(110,20,60),H(150,20,60)];
const texts=[T("1-1",200,40),T("0,000",20,290),T("+4,000",20,90),
 // A note on a leader: its text is far from its height and must be ignored.
 T("+3,200",20,200),
 T("Б1",100,136),T("С1",148,250,90),T("К5",1500,250)];
const out=extractSections({segments,texts});
const beam=out.find(r=>r.mark==="Б1"),post=out.find(r=>r.mark==="С1");
assert.equal(beam.beam_mm,3200,"beam level from the line under its label, snapped to the written level");
assert.deepEqual([post.z0_mm,post.z1_mm],[-400,4000],"post spans its vertical line");
assert(!out.some(r=>r.mark==="К5"),"text outside any section is ignored");
assert.equal(beam.section,"1-1");
// Notes in a scheme: pairs of bottom and top, and levels in the title.
const notes=schemeNotes([T("низ на отм. +0,050",500,500),T("верх +4,100",500,520),T("Ф1",100,100)],{x0:0,x1:800,y0:0,y1:800},"Схема балок (верх балок на отм. +4,500)");
assert.deepEqual(notes.notes.map(n=>[n.z0_mm,n.z1_mm]),[[50,4100]]);
assert.deepEqual([notes.z0_mm,notes.z1_mm],[null,4500]);
// The plan uses them: assembly view > section > note; beams take the section level.
const scheme={title:"Схема",axesX:["1","2"],axesY:["А","Б"],spansX:[6000],spansY:[6000],levelNotes:{notes:[{x:0,y:0,z0_mm:50,z1_mm:null}],z0_mm:null,z1_mm:null},
 placements:[{mark:"С1",geometry_type:"column",x_mm:0,y_mm:0,sheet_point_pt:{x:0,y:0}},{mark:"Б1",geometry_type:"beam",x_mm:0,y_mm:0,x2_mm:6000,y2_mm:0},
  {mark:"С2",geometry_type:"column",x_mm:6000,y_mm:0,sheet_point_pt:{x:0,y:0}},{mark:"С3",geometry_type:"column",x_mm:6000,y_mm:6000,sheet_point_pt:{x:0,y:0}}]};
const draft={pages:[{page:1,docType:"КМД монтажные",schemes:[scheme],sections:out},
 {page:2,docType:"КМД сборочные",schemes:[],sheet:{views:[{marks:["С2"],title:"С2",levels:[-400,3000],z0_mm:-400,z1_mm:3000,length_mm:3400},{marks:["С3"],title:"С3",levels:[],z0_mm:null,z1_mm:null,length_mm:3000}]}}]};
const plan=buildPlan(draft);
const el=m=>plan.elements.find(e=>e.mark===m);
assert.deepEqual([el("С1").z0_mm,el("С1").z1_mm,el("С1").levels],[-400,4000,"разрез"]);
assert.deepEqual([el("Б1").z0_mm,el("Б1").levels],[3200,"разрез"]);
assert.deepEqual([el("С2").z0_mm,el("С2").z1_mm],[-400,3000],"the mark's own drawing wins");
assert.deepEqual([el("С3").z0_mm,el("С3").z1_mm,el("С3").levels],[50,3050,"надпись на схеме"],"bottom from the note plus the length of the mark");
console.log("Sections and scheme notes: levels of beams and posts, snapping, notes, plan priority PASS");
