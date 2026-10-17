"use strict";
const assert=require("node:assert/strict");
const {test}=require("node:test");
const {completePages}=require("./ai-pdf-index");
test("PDF index requires every page once",()=>{
 assert.equal(completePages([{page:1},{page:2}],2),true);
 for(const [pages,total] of [
  [[{page:1},{page:1}],2],
  [[{page:1},{page:3}],2],
  [[{page:1}],2],
  [[{page:0},{page:2}],2],
  [[{page:1},{page:2}],81],
  [[],0],
  [[{page:"1"}],1]
 ])assert.equal(completePages(pages,total),false);
});
