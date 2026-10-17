'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {associateLabels}=require('./ai-pdf-spatial-associations');
test('associates nearby labels but does not approve mounting placement',()=>{
 const result=associateLabels({marks:[{mark:'К62',page:1,fragmentIndex:0,x:20,y:20}],
  observations:[{kind:'axis',value:'1',point:{x:22,y:20}},{kind:'elevation',valueMm:12000,point:{x:25,y:20}},
  {kind:'axis',value:'9',point:{x:900,y:900}}]},{radiusPt:50});
 assert.equal(result[0].axisCandidates.length,1);
 assert.equal(result[0].elevationCandidates[0].valueMm,12000);
 assert.equal(result[0].safeForAutoPlacement,false);
});
test('missing mark coordinates do not generate associations',()=>{
 const result=associateLabels({marks:[{mark:'К1',x:null,y:null}],observations:[{kind:'axis',point:{x:0,y:0}}]});
 assert.equal(result[0].pdfPoint,null);
 assert.deepEqual(result[0].axisCandidates,[]);
});
