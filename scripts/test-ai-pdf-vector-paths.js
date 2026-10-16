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
console.log("PDF geometry: viewport, transform stack, painted paths, curves, dedupe, limits PASS");
