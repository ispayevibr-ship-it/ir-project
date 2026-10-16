"use strict";
const assert=require("node:assert/strict");
const {extractSegments,multiply}=require("../src/ai-pdf-vector-paths");
const OPS={
 save:1,restore:2,transform:12,moveTo:13,lineTo:14,curveTo:15,
 curveTo2:16,curveTo3:17,closePath:18,rectangle:19,
 stroke:20,closeStroke:21,fill:22,eoFill:23,fillStroke:24,eoFillStroke:25,
 endPath:26,constructPath:91
};
const page={width:300,height:200,transform:[1,0,0,-1,0,200]};
const op=(...tuples)=>({
 fnArray:tuples.map(x=>x[0]),argsArray:tuples.map(x=>x[1])
});
const base=extractSegments(op(
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[10,20,110,20]]],
 [OPS.stroke,[]],
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[10,60,110,60]]],
 [OPS.fill,[]],
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[80,5,80,155]]],
 [OPS.closeStroke,[]]
),OPS,page);
assert.equal(base.segments.length,2,"stroked paths only; fill-only is not a line");
assert.equal(base.stats.horizontal,1);
assert.equal(base.stats.vertical,1);
assert(base.segments.some(x=>x.x1===10&&x.y1===180&&x.x2===110&&x.y2===180));
const nested=extractSegments(op(
 [OPS.save,[]],
 [OPS.transform,[1,0,0,1,20,30]],
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[0,0,100,0]]],
 [OPS.stroke,[]],
 [OPS.restore,[]],
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[0,0,100,0]]],
 [OPS.stroke,[]]
),OPS,page);
assert.equal(nested.segments.length,2);
assert(nested.segments.some(x=>x.x1===20&&x.y1===170));
assert(nested.segments.some(x=>x.x1===0&&x.y1===200));
const rectangles=extractSegments(op(
 [OPS.constructPath,[[OPS.rectangle],[50,50,70,40]]],
 [OPS.stroke,[]],
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[50,50,120,50]]],
 [OPS.stroke,[]]
),OPS,page);
assert.equal(rectangles.segments.length,4,"rectangle strokes and identical line are deduplicated");
const curves=extractSegments(op(
 [OPS.constructPath,[[OPS.moveTo,OPS.curveTo,OPS.lineTo],[0,0,10,100,50,100,60,70,120,70]]],
 [OPS.stroke,[]]
),OPS,page);
assert.equal(curves.stats.skippedCurves,1);
assert.equal(curves.segments.length,1,"Bezier curve is NEVER treated as a straight segment");
// PDF.js 6.4.299 constructPath bundles paint and packed DrawOPS
// [paint, [Float32Array of (opcode, coords...)], bbox].
const packed=extractSegments(op(
 [OPS.constructPath,[OPS.stroke,[new Float32Array([0,20,20,1,150,20,0,45,20,1,45,120])],
  new Float32Array([20,20,150,120])]],
 [OPS.constructPath,[OPS.fill,[new Float32Array([0,30,30,1,150,30])],
  new Float32Array([30,30,150,30])]]
),OPS,page);
assert.equal(packed.segments.length,2,"PDF.js v6 packed stroke must decode; fill excluded");
assert.equal(packed.stats.horizontal,1);
assert.equal(packed.stats.vertical,1);
assert(packed.segments.some(v=>v.x1===20&&v.y1===180&&v.x2===150&&v.y2===180));
const packedRect=extractSegments(op(
 [OPS.constructPath,[OPS.closeStroke,[new Float32Array([
  0,50,50,1,120,50,1,120,100,1,50,100,4
 ])],new Float32Array([50,50,120,100])]]
),OPS,page);
assert.equal(packedRect.segments.length,4,"PDF.js v6 packed closed path");
assert.deepEqual(multiply([1,0,0,1,10,20],[2,0,0,2,0,0]),[2,0,0,2,10,20]);
const invalid=extractSegments(op(
 [OPS.constructPath,[[OPS.moveTo,OPS.lineTo],[1,2,NaN,5]]],[OPS.stroke,[]]
),OPS,page);
assert.equal(invalid.segments.length,0,"nonfinite PDF geometry is discarded");
const malicious={fnArray:Array(180002).fill(0),argsArray:Array(180002).fill(null)};
const bounded=extractSegments(malicious,OPS,page);
assert.equal(bounded.stats.truncated,true);
assert.equal(bounded.stats.operatorCount,180002);
const dense=[];
for(let i=0;i<2700;i++){
 dense.push([OPS.constructPath,[OPS.stroke,[
  new Float32Array([0,1,i/10,1,35,i/10])],new Float32Array([1,i/10,35,i/10])]])
}
dense.push([OPS.constructPath,[OPS.stroke,[
 new Float32Array([0,10,280,1,280,280])],new Float32Array([10,280,280,280])]]);
const selected=extractSegments(op(...dense),OPS,{width:300,height:300,
 transform:[1,0,0,-1,0,300]});
assert.equal(selected.segments.length,2400);
assert.equal(selected.stats.truncated,true);
assert(selected.segments.some(x=>x.lengthPt===270),
 "very long line appearing LAST in PDF must not disappear behind 2400 early short strokes");
assert(selected.segments[0].lengthPt>=selected.segments.at(-1).lengthPt);

// A saturated global longest-stroke preview must no longer hide a short
// parallel pair elsewhere on the drawing. New local-detail evidence is
// bounded, stratified by page tile and segment length, never auto-placement.
const shortA=[OPS.constructPath,[OPS.stroke,[
 new Float32Array([0,212,180,1,220,180])],
 new Float32Array([212,180,220,180])]];
const shortB=[OPS.constructPath,[OPS.stroke,[
 new Float32Array([0,212,184,1,220,184])],
 new Float32Array([212,184,220,184])]];
const spatial=extractSegments(op(...dense,shortA,shortB),OPS,{
 width:300,height:300,transform:[1,0,0,-1,0,300]});
assert.equal(spatial.segments.some(x=>x.lengthPt===8),false,
 "legacy 12pt minimum excludes small member strokes");
assert(spatial.detailSegments.some(s=>s.x1===212&&s.y1===120&&s.x2===220&&s.y2===120),
 "short stroke A survives spatial evidence sampling");
assert(spatial.detailSegments.some(s=>s.x1===212&&s.y1===116&&s.x2===220&&s.y2===116),
 "paired short stroke B also survives");
assert(spatial.detailSegments.length<=14400,"worker local-stroke response stays bounded");
assert.equal(spatial.stats.detailTiles,10);
assert.equal(spatial.stats.detailMax,14400);
assert.equal(spatial.stats.detailSampleIncomplete,true,
 "dense tiles are explicitly marked sampled, never silently 'complete'");
console.log("Spatial KMD strokes: short outlines survive saturated longest-line preview PASS");


const shortDashOps=[];
for(const x of [40,100,160,220]){
 for(const y of [45,95,145,195,245,295]){
  shortDashOps.push([OPS.constructPath,[OPS.stroke,[new Float32Array([
   0,x,y,1,x,y+24])],new Float32Array([x,y,x,y+24])]])
 }
}
for(const y of [40,90,140,190]){
 for(const x of [32,72,112,152,192,232]){
  shortDashOps.push([OPS.constructPath,[OPS.stroke,[new Float32Array([
   0,x,y,1,x+26,y])],new Float32Array([x,y,x+26,y])]])
 }
}
const dashes=extractSegments(op(...shortDashOps),OPS,{width:520,height:420,
 transform:[1,0,0,-1,0,420]});
assert.equal(dashes.stats.axisEvidenceComplete,true);
assert.equal(dashes.axisBands.vertical.length>=4,true,
 "many short dashed strokes have to become one vertical axis candidate");
assert.equal(dashes.axisBands.horizontal.length>=4,true,
 "many short strokes have to become one horizontal axis candidate");
console.log("PDF geometry: viewport, transform stack, painted paths, curves, dedupe, limits PASS");

// Two drawings sharing a page ordinate must remain separate evidence islands.
// Reversed duplicate strokes must not inflate coverage or sample count.
const islands=[];
for(const base of [20,350])for(let i=0;i<6;i++){
 const x=base+i*20;
 islands.push([OPS.constructPath,[OPS.stroke,[new Float32Array([
  0,x,80,1,x+12,80,1,x,80])],new Float32Array([x,80,x+12,80])]]);
}
const separated=extractSegments(op(...islands),OPS,{width:600,height:300,
 transform:[1,0,0,-1,0,300]});
assert.equal(separated.axisBands.horizontal.length,2);
assert(separated.axisBands.horizontal.every(b=>b.sampleCount===6&&b.supportLengthPt===72));
assert(separated.axisBands.horizontal.every(b=>b.x2-b.x1===112));
const disconnected=extractSegments(op(...Array.from({length:12},(_,i)=>[
 OPS.constructPath,[OPS.stroke,[new Float32Array([0,i*45,80,1,i*45+3,80])],
 new Float32Array([i*45,80,i*45+3,80])]])),OPS,{width:600,height:300,
 transform:[1,0,0,-1,0,300]});
assert.equal(disconnected.axisBands.horizontal.length,0,
 'widely spaced text strokes must not fabricate a long axis');
console.log('Axis evidence: disconnected plans and duplicate coverage PASS');
