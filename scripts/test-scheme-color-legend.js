"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const css=fs.readFileSync("src/scheme-building-view.css","utf8");
const js=fs.readFileSync("src/scheme-building-view.js","utf8");
assert(css.includes(".irb-immersive .irb-layers > #irbColorLegend:not([hidden])"));
assert(css.includes("flex-shrink:0!important"),"legend must not collapse in a flex sidebar");
assert(css.includes("min-height:58px!important"),"legend must have readable minimum height");
assert(css.includes("#irbColorLegend[hidden]{display:none!important"),"status mode should hide legend");
assert(css.includes("overscroll-behavior:contain"));
const from=js.indexOf("  const showColorMode=()=>{"),to=js.indexOf("\n  const setColorMode=",from);
assert(from>=0&&to>from);
const values={irbColorStatus:{},irbColorTypes:{},irbColorMarks:{},irbColorToggle:{},irbColorCaption:{},
 irbColorLegend:{scrollTop:-1},irbLegend:{}};
for(const x of Object.values(values)){x.classList={toggle(){}};x.setAttribute=()=>{}}
const state={colorMode:"type"};
const env={state,el:id=>values[id],typeSummary:()=>[{label:"Колонны",count:45,rgb:"#336699"},{label:"Балки",count:12,rgb:"#aabbcc"}],
 colorSummary:()=>[],html:x=>String(x)};
const show=vm.runInNewContext(js.slice(from,to)+"\nshowColorMode",env);
show();
assert.match(values.irbColorLegend.innerHTML,/Колонны/);
assert.match(values.irbColorLegend.innerHTML,/Балки/);
assert.equal(values.irbColorLegend.scrollTop,0);
state.colorMode="mark";
show();
assert.match(values.irbColorLegend.innerHTML,/нет видимых конструкций/i);
state.colorMode="status";
show();
assert.equal(values.irbColorLegend.hidden,true);
console.log("Colour legend is readable, preserves category counts, and handles empty/status modes.");
