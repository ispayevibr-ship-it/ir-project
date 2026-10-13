"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const source=fs.readFileSync("src/scheme-building-view.js","utf8");
const sectionStart=source.indexOf("  const sections=[");
const sectionEnd=source.indexOf("\n  if(state.sectionKey!==sectionKey)",sectionStart);
const markupStart=source.indexOf("  const cutWidthText=");
const markupEnd=source.indexOf("\n  const header=",markupStart);
assert(sectionStart>=0&&sectionEnd>sectionStart&&markupStart>=0&&markupEnd>markupStart);
const run=(x,y)=>{
 const env={axesX:["1","2","3"],axesY:["А","Б","В"],gridX:x,gridY:y,
  state:{sectionsOpen:true,hiddenSections:[]},num:v=>Number(v)||0,html:s=>String(s)};
 return vm.runInNewContext(source.slice(sectionStart,sectionEnd)+"\n"+
   source.slice(markupStart,markupEnd)+"\n({sections,html:sectionsMarkup()})",env);
};
const first=run({"1":0,"2":9000,"3":22500},{"А":0,"Б":6500,"В":17000});
assert.deepEqual(Array.from(first.sections,s=>s.widthMm),[9000,13500,6500,10500]);
assert.match(first.html,/Оси 1–2/);
assert.match(first.html,/9\s*000 мм/);
assert.match(first.html,/13\s*500 мм/);
assert.match(first.html,/6\s*500 мм/);
const changed=run({"1":0,"2":7200,"3":22500},{"А":0,"Б":8000,"В":17000});
assert.deepEqual(Array.from(changed.sections,s=>s.widthMm),[7200,15300,8000,9000]);
assert.match(changed.html,/7\s*200 мм/);
const fractional=run({"1":0,"2":7320.25,"3":22500},{"А":0,"Б":8000,"В":17000});
assert.match(fractional.html,/7\s*320,25 мм/);
assert(!fractional.html.includes('NaN'));
console.log("Cut widths reflect actual X/Y grid spans, custom spans and millimetre fractions.");
