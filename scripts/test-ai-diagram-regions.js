'use strict';
const assert=require('node:assert/strict');
const {axisGeometry,detectFramedPlanRegions,reviewIndexedPlanPage,extractPlanInstances}=require('../src/ai-scheme-lite-page');
const W=1100,H=1100;
const grid=axisGeometry([{record_type:'scheme_grid',data:{entity_type:'grid',
 axes_x:['1','2','3','4'],x_spans_mm:[6000,6000,6000],
 axes_y:['А','Б','В','Г'],y_spans_mm:[6000,6000,6000]}}]);
const fragments=[],segments=[],contours=[];
const frame=(x,y,w,h)=>({stroke:true,clipUnresolved:false,operatorIndex:contours.length,
 commands:[{kind:'M',points:[[x,y]]},{kind:'L',points:[[x+w,y]]},
 {kind:'L',points:[[x+w,y+h]]},{kind:'L',points:[[x,y+h]]},{kind:'Z',points:[]}]});
function plan(dx,dy){
 const label=(text,x,y)=>fragments.push({text,x:dx+x-4,y:H-(dy+y)-5,width:8,height:10});
 [40,100,160,220].forEach((x,i)=>{label(String(i+1),x,340);
 segments.push({x1:dx+x,x2:dx+x,y1:dy+45,y2:dy+330,direction:'vertical'})});
 [310,250,190,130].forEach((y,i)=>{label(['А','Б','В','Г'][i],20,y);
 segments.push({x1:dx+32,x2:dx+270,y1:dy+y,y2:dy+y,direction:'horizontal'})});
 label('К62',140,220);contours.push(frame(dx,dy,300,380));
}
plan(50,50);plan(650,600);
const vector={widthPt:W,heightPt:H,rotation:0,segments,contours};
const raw={fragments};
let result=detectFramedPlanRegions({raw,vector,grid});
assert.equal(result.length,2,'off-centre framed plans independently calibrated');
assert(result.every(r=>r.analysis.calibrated&&r.source==='painted_frame_and_registered_axes'));
const marks=[{id:7,title:'К62'}];
const review=reviewIndexedPlanPage({raw,vector,grid,marks,documentId:4,sha256:'a'.repeat(64),page:1});
assert.equal(review.regions.length,2);assert.equal(review.foundLabels,2);
assert(review.regions.every(r=>r.registry.total===1));
assert.notEqual(review.regions[0].registry.labels[0].instanceId,review.regions[1].registry.labels[0].instanceId);
assert(review.regions.every(r=>r.registry.labels[0].xMm===null),'label centre never becomes mounting coordinate');
assert.equal(review.readyForPlacement,0);
assert.equal(detectFramedPlanRegions({raw,vector:{...vector,rotation:90},grid}).length,0);
assert.equal(detectFramedPlanRegions({raw,vector:{...vector,contours:contours.map(c=>({...c,clipUnresolved:true}))},grid}).length,0);
assert.equal(detectFramedPlanRegions({raw:{fragments:[]},vector,grid}).length,0,'frame alone proves nothing');
assert.equal(detectFramedPlanRegions({raw,vector:{...vector,contours:[...contours,frame(40,40,330,410)]},grid}).length,1,'nested frames rejected');
assert.throws(()=>extractPlanInstances({raw,marks,region:'custom',regionBounds:{left:0,top:0,right:2,bottom:1}}),/область/);
console.log('Independent PDF diagrams: arbitrary frames, own calibration, no cross-label mixing, overlap and clip rejection PASS');
