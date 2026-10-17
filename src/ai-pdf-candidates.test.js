'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractPageCandidates}=require('./ai-pdf-candidates');
test('finds only registered marks and axis/elevation/dimension evidence',()=>{
 const page={page:1,fragments:[
  {text:'К62',x:10,y:20},{text:'К99',x:15,y:20},
  {text:'1',x:10,y:30},{text:'А',x:20,y:30},
  {text:'+12.000',x:30,y:30},{text:'L=4500',x:40,y:30}
 ]};
 const out=extractPageCandidates(page,['К62'],{axes_x:['1','2'],axes_y:['А','Б']});
 assert.deepEqual(out.marks.map(x=>x.mark),['К62']);
 assert.equal(out.observations.filter(x=>x.kind==='axis').length,2);
 assert.equal(out.observations.find(x=>x.kind==='elevation').valueMm,12000);
 assert.equal(out.observations.find(x=>x.kind==='dimension').valueMm,4500);
 assert.equal(out.safeForAutoPlacement,false);
});
test('does not infer coordinates from absent labels',()=>{
 const out=extractPageCandidates({page:2,fragments:[{text:'К62',x:1,y:2}]},['К62']);
 assert.equal(out.observations.length,0);
 assert.equal(out.marks[0].verified,false);
});
