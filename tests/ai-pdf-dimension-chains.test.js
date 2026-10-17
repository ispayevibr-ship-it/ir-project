"use strict";
const assert=require("node:assert/strict");
const {dimensionChains}=require("../src/ai-pdf-dimension-chains");
assert.deepEqual(dimensionChains({page:1,fragments:[{text:"45000"},{text:"60000",x:null,y:10}]},null),[]);
const valid=dimensionChains({page:2,fragments:[
 {text:"45000",x:10,y:20},{text:"30000",x:110,y:20},
 {text:"60000",x:220,y:20},{text:"2",x:300,y:20}
]}, {axes_x:["1","2"],axes_y:["А","Б"]});
assert.equal(valid.length,3);
assert.ok(valid.every(x=>x.status==="unverified_dimension_chain"));
assert.ok(valid.every(x=>x.neighborFragmentIds.length>=1));
assert.equal(dimensionChains({page:3,fragments:[{text:"45000",x:"",y:10},{text:"30000",x:30,y:10}]},null).length,0);
console.log("PDF dimension chain safety tests passed");
