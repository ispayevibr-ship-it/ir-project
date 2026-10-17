'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dimensionChains}=require('./ai-pdf-dimension-chains');
test('groups aligned dimension labels without inventing mounting coordinates',()=>{
 const result=dimensionChains({page:2,fragments:[
  {text:'6000',x:10,y:30},{text:'4500',x:80,y:31},
  {text:'К62',x:45,y:20},{text:'1',x:0,y:30}
 ]},{axes_x:['1','2']});
 assert.equal(result.length,2);
 assert.equal(result[0].status,'unverified_dimension_chain');
 assert.equal(result[0].valueMm,6000);
});
test('ignores isolated numbers and axis labels',()=>{
 assert.deepEqual(dimensionChains({page:1,fragments:[
  {text:'1',x:0,y:0},{text:'6000',x:40,y:40}
 ]},{axes_x:['1']}),[]);
});
