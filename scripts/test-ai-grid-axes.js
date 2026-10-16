"use strict";
const assert=require("node:assert/strict");
const {detectPlanGridAxes,axisGeometry,locateMarkLabelZones,detectPlanRegisterLabels,findAxisNodeCandidates,findPlanMemberStrokes,selectPlanRegion}=require("../src/ai-scheme-lite-page");
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


// Nearest intersections are not member anchors without explicit graphical
// association between the PDF mark label and the crossing.
const near={...foundMarks.labels[0],pageX:104,pageY:257,
 labelXmm:6400,labelYmm:5300};
const proximity=findAxisNodeCandidates({
 labels:[near],analysis:onlyLeft,grid,
 vector:{widthPt,heightPt,rotation:0,segments}});
assert.equal(proximity.suggested.length,0);
assert.equal(proximity.nearby.length,1);
assert.equal(proximity.review[0].reasonCode,"no_leader");
assert.equal(proximity.nearby[0].nodeXmm,6000);
assert.equal(proximity.nearby[0].nodeYmm,6000);
assert.equal(proximity.nearby[0].exactPlacement,false);
assert(!("z0Mm" in proximity.nearby[0]));
assert.equal(findAxisNodeCandidates({labels:[foundMarks.labels[0]],
 analysis:onlyLeft,grid,vector:{widthPt,heightPt,segments}}).review[0].reasonCode,
 "ambiguous_neighbor");
const linked={...near,pageX:113,pageY:263,labelXmm:7300,labelYmm:4700,
 rectPt:{x:109,y:heightPt-267,width:8,height:8}};
const leader={x1:112,y1:264,x2:100,y2:250,direction:"diagonal",lengthPt:18.44};
const verified=findAxisNodeCandidates({labels:[linked],analysis:onlyLeft,
 grid,vector:{widthPt,heightPt,segments:[...segments,leader]}});
assert.equal(verified.suggested.length,1,JSON.stringify(verified));
assert.equal(verified.suggested[0].axisX,"2");
assert.equal(verified.suggested[0].axisY,"Б");
assert.equal(verified.suggested[0].nodeXmm,6000);
assert.equal(verified.suggested[0].nodeYmm,6000);
assert.equal(verified.suggested[0].status,"leader_linked_unverified");
assert.equal(verified.suggested[0].exactPlacement,false);
assert.equal(verified.suggested[0].evidence.type,"line_from_label_to_axis_crossing");
assert(!("memberXmm" in verified.suggested[0]));
const untrustedAxisLeader={x1:100,y1:260,x2:100,y2:250,
 direction:"vertical",lengthPt:10};
const axesOnly=findAxisNodeCandidates({labels:[linked],analysis:onlyLeft,
 grid,vector:{widthPt,heightPt,segments:[...segments,untrustedAxisLeader]}});
assert.equal(axesOnly.suggested.length,0,"axis stroke cannot prove a leader");
const noCross=segments.filter(s=>s.direction==="vertical");
const rejected=findAxisNodeCandidates({labels:[near],analysis:onlyLeft,
 grid,vector:{widthPt,heightPt,segments:noCross}});
assert.equal(rejected.suggested.length,0);
assert.equal(rejected.review[0].reasonCode,"no_vector_crossing");
assert.equal(findAxisNodeCandidates({labels:[near],analysis:{calibrated:false},
 grid,vector:{widthPt,heightPt,segments}}).suggested.length,0);
const outside={...near,pageX:500,pageY:50};
assert.equal(findAxisNodeCandidates({labels:[outside],analysis:onlyLeft,
 grid,vector:{widthPt,heightPt,segments}}).review[0].reasonCode,"outside_region");
assert.equal(findAxisNodeCandidates({labels:[near],analysis:onlyLeft,grid,
 vector:{widthPt,heightPt,segments,stats:{truncated:true,axisEvidenceComplete:false}}})
 .suggested.length,0);
const other={...linked,mark:"В74",markId:102,
 pageX:116,pageY:256,rectPt:{x:112,y:heightPt-260,width:8,height:8}};
const anotherLeader={x1:115,y1:256,x2:100,y2:250,
 direction:"diagonal",lengthPt:16.16};
const collisions=findAxisNodeCandidates({labels:[linked,other],analysis:onlyLeft,grid,
 vector:{widthPt,heightPt,segments:[...segments,leader,anotherLeader]}});
assert.equal(collisions.suggested.length,0);
assert.equal(collisions.review.filter(x=>x.reasonCode==="node_collision").length,2);
assert.equal(collisions.nearby.length,2);
console.log("Leader/axis intersections: missing evidence, unverified leaders and collisions PASS");


// Real PDF plan geometry can use paired outline strokes, WITHOUT a leader.
// This never authorises actual member installation, Z, or member type.
const planPair=[
 {x1:111,y1:100,x2:169,y2:100,direction:"horizontal",lengthPt:58},
 {x1:111,y1:105,x2:169,y2:105,direction:"horizontal",lengthPt:58}
];
const geometryLabel={mark:"Б22",markId:201,pageX:140,pageY:91,
 labelXmm:10000,labelYmm:22000,
 rectPt:{x:136,y:heightPt-95,width:8,height:8}};
const planVectors={widthPt,heightPt,rotation:0,segments:[...segments,...planPair]};
const members=findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:planVectors});
assert.equal(members.candidates.length,1,JSON.stringify(members));
assert.equal(members.candidates[0].mark,"Б22");
assert.deepEqual(members.candidates[0].strokesPt,planPair.map(
 p=>({x1:p.x1,y1:p.y1,x2:p.x2,y2:p.y2})),
 "each possible contour keeps both actual viewport-PDF line segments");
// The local detail array is authoritative for outline hypotheses even if
// the 2400-line preview contains no suitable short strokes.
const localOnly=findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,segments,
 detailSegments:planPair,
 stats:{truncated:true,axisEvidenceComplete:true,detailSampleIncomplete:false}}});
assert.equal(localOnly.candidates.length,1,JSON.stringify(localOnly));
assert.equal(localOnly.availableStrokes,2);
assert.equal(localOnly.sampling,"local_tiles_short_medium_long");
assert.equal(localOnly.limited,false);
const emptyLocal=findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,detailSegments:[]}});
assert.equal(emptyLocal.candidates.length,0,
 "an empty new evidence set must not fall back to the old biased preview");

assert.equal(members.candidates[0].evidenceType,"parallel_strokes");
assert.equal(members.candidates[0].status,"geometry_only_requires_review");
assert.equal(members.candidates[0].exactPlacement,false);
assert.equal(members.candidates[0].geometryType,"unknown");
assert.equal(members.candidates[0].lengthMm,5800);
assert.deepEqual(members.candidates[0].lineMm,
 {x1:7100,y1:20750,x2:12900,y2:20750});
assert(!("z0Mm" in members.candidates[0]));
assert.equal(members.candidates[0].partOfActualMember,false);
assert.equal(findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,segments:[...segments,planPair[0]]}}).candidates.length,0,
 "single line is not the paired outline");
const single=findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,segments:[...segments,planPair[0]]}});
assert.equal(single.singleStrokes.length,1);
assert.equal(single.review[0].reasonCode,"single_stroke");
assert.equal(findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,segments}}).candidates.length,0,
 "grid axes must never be mistaken for structural outlines");
assert.equal(findPlanMemberStrokes({labels:[geometryLabel],analysis:{calibrated:false},
 grid,vector:planVectors}).candidates.length,0);
assert.equal(findPlanMemberStrokes({labels:[geometryLabel],analysis:onlyLeft,
 grid,vector:{...planVectors,stats:{truncated:true,axisEvidenceComplete:false}}})
 .candidates.length,0,"incomplete evidence must never create matched outlines");
const anotherLabel={...geometryLabel,mark:"Б23",markId:202,pageX:143,pageY:92};
const outlineCollisions=findPlanMemberStrokes({labels:[geometryLabel,anotherLabel],
 analysis:onlyLeft,grid,vector:planVectors});
assert.equal(outlineCollisions.candidates.length,0);
assert.equal(outlineCollisions.review.filter(x=>x.reasonCode==="shared_strokes").length,2);

// Multiple genuine neighbouring outlines remain review-only, with their
// distinct candidate coordinates visible for comparison rather than a
// generic error or an arbitrary automatic choice.
const crowdedSegments=[
 {x1:111,y1:100,x2:169,y2:100,direction:"horizontal"},
 {x1:111,y1:103,x2:169,y2:103,direction:"horizontal"},
 {x1:111,y1:106,x2:169,y2:106,direction:"horizontal"}
];
const crowded=findPlanMemberStrokes({
 labels:[geometryLabel],analysis:onlyLeft,grid,
 vector:{widthPt,heightPt,rotation:0,segments:[...segments,...crowdedSegments]}
});
assert.equal(crowded.candidates.length,0,"ambiguous outlines never auto-select");
assert.equal(crowded.review[0].reasonCode,"multiple_outlines");
assert.equal(crowded.alternatives.length,1);
assert.equal(crowded.alternatives[0].mark,"Б22");
assert(crowded.alternatives[0].options.length>=2);
assert(crowded.alternatives[0].options.length<=3);
assert(crowded.alternatives[0].options.every(x=>x.exactPlacement===false&&
 x.evidenceType==="parallel_strokes"&&Number.isFinite(x.lengthMm) &&
 Number.isFinite(x.distancePt)&&x.lineMm&&Array.isArray(x.strokesPt)&&
 x.strokesPt.length===2&&x.strokesPt.every(l=>["x1","y1","x2","y2"]
 .every(k=>Number.isFinite(l[k])))),
 "all ambiguous candidates retain original PDF lines for viewer overlay");
assert(crowded.alternatives[0].totalOptions>=2);
assert(!("z0Mm" in crowded.alternatives[0].options[0]));
// Duplicated near-identical PDF draw calls may represent one geometric
// contour. They must not produce false ambiguous alternatives.
const duplicatedNear=[
 ...planPair,
 {x1:111.15,y1:100.1,x2:169.15,y2:100.1,direction:"horizontal"},
 {x1:111.15,y1:105.1,x2:169.15,y2:105.1,direction:"horizontal"}
];
const deduplicated=findPlanMemberStrokes({
 labels:[geometryLabel],analysis:onlyLeft,grid,
 vector:{widthPt,heightPt,rotation:0,segments:[...segments,...duplicatedNear]}
});
assert.equal(deduplicated.candidates.length,1,JSON.stringify(deduplicated));
assert.equal(deduplicated.alternatives.length,0);
assert.equal(deduplicated.candidates[0].exactPlacement,false);
console.log("Multiple PDF outlines: alternative choices shown, geometric duplicates merged, no automatic placement PASS");

console.log("KMD member outline hypotheses: double strokes, single line, grid axes, ambiguity and provenance PASS");


// Multi-scheme sheets must not silently accept full-page calibration.
// Deliberately provide two independently valid sub-plan regions even if the
// whole sheet looks geometrically plausible.
const regionFake={
 full:{calibrated:true,region:{left:0,right:1,top:0,bottom:1},
  xMatches:[{name:"1"},{name:"2"},{name:"3"},{name:"4"},{name:"5"},{name:"6"}]},
 left:{calibrated:true,region:{left:0,right:.5,top:0,bottom:1},
  xMatches:[{name:"1"},{name:"2"},{name:"3"}]},
 right:{calibrated:true,region:{left:.5,right:1,top:0,bottom:1},
  xMatches:[{name:"1"},{name:"2"},{name:"3"}]}
};
const choose=k=>regionFake[k];
const multiAuto=selectPlanRegion({selected:"auto",calibrate:choose});
assert.equal(multiAuto.analysis.calibrated,false);
assert.equal(multiAuto.multiplePlans,true);
assert.equal(multiAuto.regionName,"multiple");
assert.equal(multiAuto.available.left,true);
assert.equal(multiAuto.available.right,true);
assert.equal(selectPlanRegion({selected:"full",calibrate:choose}).analysis.calibrated,false,
 "full-page must be refused when two valid independent plan regions exist");
const splitSingle=selectPlanRegion({selected:"auto",calibrate:k=>
 k==="right"?{...regionFake.right,xMatches:[{name:"4"},{name:"5"},{name:"6"}]}:choose(k)});
assert.equal(splitSingle.multiplePlans,false,
 "a single grid split between halves must not be misclassified as two plans");
assert.equal(splitSingle.regionName,"full");
const chosenLeft=selectPlanRegion({selected:"left",calibrate:choose});
assert.equal(chosenLeft.analysis.calibrated,true);
assert.equal(chosenLeft.regionName,"left");
const oneRegion=selectPlanRegion({selected:"auto",calibrate:k=>
 k==="right"?{calibrated:false,reason:"none"}:choose(k)});
assert.equal(oneRegion.regionName,"left");
assert.equal(oneRegion.analysis.calibrated,true);
const noHalf=selectPlanRegion({selected:"auto",calibrate:k=>
 k==="full"?choose("full"):{calibrated:false,reason:"no half"}});
assert.equal(noHalf.regionName,"full");
const noGrid=selectPlanRegion({selected:"auto",calibrate:k=>({
 calibrated:false,reason:k==="left"?"no axis on left":"axes missing",
 xMatches:k==="left"?[1]:[],yMatches:[]})});
assert.equal(noGrid.analysis.calibrated,false);
assert.equal(noGrid.regionName,"left");
console.log("Multi-scheme region: auto/full refuse mixed plans; explicit isolated region PASS");
