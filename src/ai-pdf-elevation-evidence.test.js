'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {elevationEvidence}=require('./ai-pdf-elevation-evidence');
test('collects nearby elevations without guessing top and bottom',()=>{
 const r=elevationEvidence({spatialAssociations:[{mark:'К62',page:2,pdfPoint:{x:10,y:10}}],
 observations:[{kind:'elevation',fragmentIndex:3,valueMm:12000,text:'+12.000',point:{x:15,y:15}},
 {kind:'elevation',fragmentIndex:4,valueMm:0,text:'±0.000',point:{x:18,y:18}}]});
 assert.equal(r[0].evidence.length,2);
 assert.equal(r[0].z0Mm,null);
 assert.equal(r[0].z1Mm,null);
 assert.equal(r[0].verified,false);
});
test('does not use elevations on distant drawing details',()=>{
 const r=elevationEvidence({spatialAssociations:[{mark:'К1',pdfPoint:{x:0,y:0}}],
 observations:[{kind:'elevation',valueMm:10000,point:{x:500,y:500}}]});
 assert.equal(r[0].evidence.length,0);
});
