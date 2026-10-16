"use strict";
const assert=require("node:assert/strict");
const {detectPlanGridAxes,axisGeometry,locateMarkLabelZones,detectPlanRegisterLabels}=require("../src/ai-scheme-lite-page");
const grid=axisGeometry([{record_type:"scheme_grid",data:{entity_type:"grid",
 axes_x:["1","2","3","4"],x_spans_mm:[6000,6000,6000],
 axes_y:["А","Б","В","Г"],y_spans_mm:[6000,6000,6000]}}]);
const widthPt=520,heightPt=420;
const xpos=[40,100,160,220],ypos=[310,250,190,130];
const fragments=[];
function label(text,x,y){fragments.push({
 text,x:x-4,y:heightPt-y-5,width:8,height:10
})}
for(let i=0;i<4;i++)label(String(i+1),xpos[i],340);
for(let i=0;i<4;i++)label(["А","Б","В","Г"][i],20,ypos[i]);
const segments=[
 ...xpos.map(x=>({x1:x,x2:x,y1:45,y2:330,direction:"vertical"})),
 ...ypos.map(y=>({x1:32,x2:270,y1:y,y2:y,direction:"horizontal"})),
 // Short decorative and dimension lines are not grid evidence.
 ...Array.from({length:30},(_,i)=>({x1:10+i,x2:10+i,y1:190,y2:200,
  direction:"vertical"}))
];
function detect(fs=fragments,ss=segments,gg=grid,rotation=0){
 return detectPlanGridAxes({raw:{fragments:fs},vector:{
  widthPt,heightPt,rotation,segments:ss},grid:gg})
}
let r=detect();
assert.equal(r.calibrated,true,JSON.stringify(r));
assert.equal(r.xMatches.length,4);
assert.equal(r.yMatches.length,4);
assert(Math.abs(r.fitX.scale-.01)<1e-9);
assert(Math.abs(r.fitY.scale+.01)<1e-9);
assert.equal(r.fitX.offset,40);
assert.equal(r.fitY.offset,310);
assert.equal(r.reviewRequired,true);
assert(!("markLocations" in r),"grid fitting does not invent structural placements");
const candidate={mark:"К62",source:{documentId:3,page:1,sha256:"a".repeat(64)},
 evidenceLocations:[{quote:"Колонна К62",rectPt:{x:105,y:215,width:10,height:10}}]};
const zone=locateMarkLabelZones({candidates:[candidate],analysis:r,grid,heightPt});
assert.equal(zone.length,1);
assert.deepEqual(zone[0].axesX,{start:"2",end:"3"});
assert.deepEqual(zone[0].axesY,{start:"Б",end:"В"});
assert.equal(zone[0].exactPlacement,false);
assert.equal(zone[0].status,"label_zone_only");
assert.equal(locateMarkLabelZones({candidates:[{...candidate,evidenceLocations:[
 candidate.evidenceLocations[0],candidate.evidenceLocations[0]]}],
 analysis:r,grid,heightPt}).length,0,"ambiguous duplicate label locations rejected");
assert.equal(locateMarkLabelZones({candidates:[candidate],
 analysis:{calibrated:false},grid,heightPt}).length,0);
assert.equal(locateMarkLabelZones({candidates:[{...candidate,evidenceLocations:[]}],
 analysis:r,grid,heightPt}).length,0);
assert.equal(detect([],segments).calibrated,false);
assert.equal(detect(fragments,segments,null).calibrated,false);
assert.equal(detect(fragments,segments,grid,90).calibrated,false);
const ambiguous=fragments.concat(labelAndReturn("1",220,340));
function labelAndReturn(text,x,y){return{
 text,x:x-4,y:heightPt-y-5,width:8,height:10
}}
assert.equal(detect(ambiguous).calibrated,false,"same named axis at different lines must be rejected");
const wrongSpacing=[...segments];
wrongSpacing[1]={...wrongSpacing[1],x1:105,x2:105};
assert.equal(detect(fragments,wrongSpacing).calibrated,false,
 "grid spacing inconsistent with known 6000 mm intervals must be rejected");
const inner=fragments.map(x=>({...x}));
inner[0]={...inner[0],x:400,y:heightPt-180};
inner[1]={...inner[1],x:400,y:heightPt-180};
assert.equal(detect(inner).calibrated,false,
 "labels far from the grid-line endpoint must not be considered evidence");
const alone=fragments.slice(0,2).concat(fragments.slice(4,6));
assert.equal(detect(alone).calibrated,false,"2 axes per direction cannot prove grid");
const flipped=xpos.map(x=>({x1:x,x2:x,y1:45,y2:330,direction:"vertical"}));
for(const y of [120,180,240,300])flipped.push({x1:32,x2:270,y1:y,y2:y,direction:"horizontal"});
const flipLabels=[
 ...fragments.slice(0,4),
 ...["А","Б","В","Г"].map((name,i)=>labelAndReturn(name,20,120+i*60))
];
assert.equal(detect(flipLabels,flipped).calibrated,false,
 "upside-down sheet must not silently invert the project's Y orientation");

const banded=detectPlanGridAxes({raw:{fragments},vector:{
 widthPt,heightPt,rotation:0,stats:{truncated:true,axisEvidenceComplete:true},
 segments:[],axisBands:{
  vertical:xpos.map(x=>({x1:x,x2:x,y1:45,y2:330,direction:"vertical",
   sampleCount:60,supportLengthPt:400})),
  horizontal:ypos.map(y=>({x1:32,x2:270,y1:y,y2:y,
   direction:"horizontal",sampleCount:40,supportLengthPt:400}))
 }},grid});
assert.equal(banded.calibrated,true,
 "2400 preview strokes may be trimmed as long as COMPLETE dash evidence is available");
const bandsIncomplete=detectPlanGridAxes({raw:{fragments},vector:{
 widthPt,heightPt,stats:{truncated:true,axisEvidenceComplete:false},segments:[]},grid});
assert.equal(bandsIncomplete.calibrated,false,"incomplete full vector scan cannot prove axes");
const duplicateRight=fragments.concat([
 ...xpos.map((x,i)=>labelAndReturn(String(i+1),x+260,340)),
 ...ypos.map((y,i)=>labelAndReturn(["А","Б","В","Г"][i],280,y))
]);
const duplicatedSegments=[
 ...segments,
 ...xpos.map(x=>({x1:x+260,x2:x+260,y1:45,y2:330,direction:"vertical"})),
 ...ypos.map(y=>({x1:280,x2:510,y1:y,y2:y,direction:"horizontal"}))
];
const regionLeft={left:0,top:0,right:.5,bottom:1},
 regionRight={left:.5,top:0,right:1,bottom:1};
const fullMulti=detectPlanGridAxes({raw:{fragments:duplicateRight},
 vector:{widthPt,heightPt,segments:duplicatedSegments},grid});
assert.equal(fullMulti.calibrated,false,"two separate mounting plans must not be merged");
const onlyLeft=detectPlanGridAxes({raw:{fragments:duplicateRight},
 vector:{widthPt,heightPt,segments:duplicatedSegments},grid,region:regionLeft});
assert.equal(onlyLeft.calibrated,true,JSON.stringify(onlyLeft));
const onlyRight=detectPlanGridAxes({raw:{fragments:duplicateRight},
 vector:{widthPt,heightPt,segments:duplicatedSegments},grid,region:regionRight});
assert.equal(onlyRight.calibrated,true,JSON.stringify(onlyRight));
console.log("PDF plan grid axes: label endpoints, true vector strokes, uniform scale and ambiguity PASS");

// A partial row of section-callout numbers must not override the complete
// grid-label row. Same-row ambiguity and separate complete plans remain errors.
const sectionNumbers=[...fragments,...[1,2,3].map((n,i)=>
 labelAndReturn(String(n),xpos[i]+8,40))];
const sectionResult=detect(sectionNumbers);
assert.equal(sectionResult.calibrated,true,JSON.stringify(sectionResult));
assert.equal(sectionResult.xMatches.length,4);
const partialSecondPlan=[...fragments,...[1,2,3].map((n,i)=>
 labelAndReturn(String(n),300+i*60,300))];
assert.equal(detect(partialSecondPlan).calibrated,false,
 'disjoint secondary label row is not silently absorbed into the primary plan');
console.log('Axis label rows: section callouts excluded; disjoint second plans rejected PASS');


// Position-finding in a plan must use ONLY registered marks, and must
// never convert the center of a printed label into a placement payload.
const planLabels=[
 labelAndReturn("К62",112,220),
 labelAndReturn("К62",112.5,220),
 labelAndReturn("В74",175,176),
 labelAndReturn("К999",150,190),
 labelAndReturn("К",125,230),
 labelAndReturn("62",133,230),
 labelAndReturn("К62",440,220)
];
const allowedMarks=[{id:101,title:"К62",data:{mark:"К62"}},
 {id:102,title:"В74",data:{mark:"В74"}}];
const foundMarks=detectPlanRegisterLabels({raw:{fragments:planLabels},
 analysis:onlyLeft,grid,marks:allowedMarks,widthPt,heightPt});
assert.equal(foundMarks.labels.length,3,JSON.stringify(foundMarks));
assert.deepEqual(foundMarks.labels.map(x=>x.mark),["К62","В74","К62"]);
assert.equal(foundMarks.labels[0].markId,101);
assert.equal(foundMarks.labels[0].exactPlacement,false);
assert.equal(foundMarks.labels[0].status,"label_only_requires_review");
assert.deepEqual(foundMarks.labels[0].axesX,{start:"2",end:"3"});
assert.deepEqual(foundMarks.labels[0].axesY,{start:"Б",end:"В"});
assert.equal(foundMarks.labels[0].labelXmm,7200);
assert.equal(foundMarks.labels[0].labelYmm,9000);
assert(!("z0Mm" in foundMarks.labels[0]),"PDF label is not a member's 3D position");
assert.equal(detectPlanRegisterLabels({raw:{fragments:planLabels},
 analysis:{calibrated:false},grid,marks:allowedMarks,widthPt,heightPt}).labels.length,0);
assert.equal(detectPlanRegisterLabels({raw:{fragments:planLabels},
 analysis:onlyLeft,grid,marks:[],widthPt,heightPt}).labels.length,0);
const duplicatedMarkRows=[...allowedMarks,{id:103,title:"К62",data:{mark:"К62"}}];
const ambiguousMark=detectPlanRegisterLabels({raw:{fragments:planLabels},
 analysis:onlyLeft,grid,marks:duplicatedMarkRows,widthPt,heightPt});
assert.deepEqual(ambiguousMark.labels.map(x=>x.mark),["В74"]);
assert.equal(ambiguousMark.ambiguous,1);
console.log("Registered-only KMD labels: independent/split labels, no invented placements PASS");
