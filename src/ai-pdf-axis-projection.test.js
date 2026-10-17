'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {projectAxisCandidates}=require('./ai-pdf-axis-projection');
test('projects both dimensions from unambiguous axes without auto approval',()=>{
 const observations=[
  {kind:'axis',dimension:'x',value:'1',point:{x:10,y:0}},
  {kind:'axis',dimension:'x',value:'2',point:{x:110,y:0}},
  {kind:'axis',dimension:'y',value:'А',point:{x:0,y:20}},
  {kind:'axis',dimension:'y',value:'Б',point:{x:0,y:120}}
 ];
 const r=projectAxisCandidates({observations,spatialAssociations:[{mark:'К62',page:1,pdfPoint:{x:60,y:70}}]},
 {axes_x:['1','2'],x_spans_mm:[45000],axes_y:['А','Б'],y_spans_mm:[6000]});
 assert.equal(r.placements[0].xMm,22500);
 assert.equal(r.placements[0].yMm,3000);
 assert.equal(r.placements[0].verified,false);
});
test('rejects duplicate axis labels as calibration anchors',()=>{
 const r=projectAxisCandidates({observations:[
  {kind:'axis',dimension:'x',value:'1',point:{x:10,y:0}},
  {kind:'axis',dimension:'x',value:'1',point:{x:40,y:0}},
  {kind:'axis',dimension:'x',value:'2',point:{x:110,y:0}}
 ]},{axes_x:['1','2'],x_spans_mm:[45000]});
 assert.equal(r.x.calibrated,false);
});

test('does not fabricate axis spacing when grid steps are missing',()=>{
 const r=projectAxisCandidates({observations:[
  {kind:'axis',dimension:'x',value:'1',point:{x:10,y:0}},
  {kind:'axis',dimension:'x',value:'2',point:{x:110,y:0}}
 ]},{axes_x:['1','2']});
 assert.equal(r.x.calibrated,false);
 assert.equal(r.safeForAutoPlacement,false);
});
