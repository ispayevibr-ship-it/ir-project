'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifySegments,rankSegmentsNearMarks}=require('./ai-pdf-stroke-classifier');
test('retains ambiguity between structural, axis and dimension strokes',()=>{
 const r=classifySegments([{x1:0,y1:0,x2:100,y2:0}]);
 assert.equal(r[0].couldBeStructure,true);
 assert.equal(r[0].couldBeDimension,true);
 assert.equal(r[0].verified,false);
});
test('ranks nearby vector strokes without automatic approval',()=>{
 const segments=[{x1:0,y1:10,x2:100,y2:10},{x1:0,y1:100,x2:100,y2:100}];
 const r=rankSegmentsNearMarks({segments,marks:[{mark:'К62',pdfPoint:{x:50,y:11}}]});
 assert.equal(r[0].candidates.length,1);
 assert.equal(r[0].safeForAutoPlacement,false);
});
