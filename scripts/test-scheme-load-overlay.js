"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-three-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const start=page.indexOf("const irSchemeLoading=(()=>{"),stop=page.indexOf("\nwindow.irSchemePage=",start);
assert(start>=0&&stop>start);
const frames=[],handlers=new Map(),children=[];
const makeElement=()=>{
 const card={classList:{add(){}},innerHTML:"",querySelector(){return {onclick:null}}};
 return{
  id:"",className:"",innerHTML:"",attributes:{},removed:false,
  setAttribute(k,v){this.attributes[k]=v},
  remove(){this.removed=true;const at=children.indexOf(this);if(at>=0)children.splice(at,1)},
  querySelector(){return card}
 }
};
const scope={
 document:{createElement:makeElement,body:{appendChild(element){children.push(element)}}},
 window:{addEventListener(k,fn){handlers.set(k,fn)}},
 location:{hash:"#/objects/object/1/scheme"},
 requestAnimationFrame:fn=>frames.push(fn),
 console
};
const loading=vm.runInNewContext(page.slice(start,stop)+"\nirSchemeLoading",scope);
const first=loading.begin();
assert.equal(children.length,1);
assert.match(children[0].innerHTML,/Загрузка монтажной схемы/);
assert.equal(children[0].attributes.role,"status");
first.done();assert.equal(children.length,1,"loader stays until requested frame");
frames.shift()();assert.equal(children.length,0,"first frame removes loader");
const second=loading.begin(),old=children[0];
const newer=loading.begin();assert.equal(old.removed,true,"superseded loaders are removed");
second.done();assert.equal(children.length,1,"old callback cannot remove new loader");
newer.done();frames.shift()();assert.equal(children.length,0);
loading.begin();scope.location.hash="#/objects/object/1";handlers.get("hashchange")();
assert.equal(children.length,0,"navigation away cancels loading");
const failed=loading.begin();failed.fail(new Error("test"));
assert.equal(children.length,1,"failed loading shows error rather than endless spinner");
assert.match(children[0].querySelector(".ir-scheme-loading-card").innerHTML,/Не удалось загрузить/);
failed.cancel();assert.equal(children.length,0);
assert(view.includes("if(!firstPaint){firstPaint=true;P.onFirstPaint&&P.onFirstPaint()}"),"3D canvas reports its first rendered frame");
assert(view.includes("props.onFirstPaint&&props.onFirstPaint()"),"a failed 3D load still releases the loader");
assert(page.includes("onFirstPaint:()=>loading.done()"));
assert(page.includes("if(location.hash!==requestedRoute){loading.cancel();return}"));
assert(css.includes(".ir-scheme-loading-wheel"));
console.log("Scheme loader: first frame, navigation, race-safe callbacks and errors OK");
// The page opened again over the built model (same grid, a new box): the update path also reports its first picture.
{const u=view.indexOf("function update(next){"),body=view.slice(u,view.indexOf("\n  }",u));
 assert(/firstPaint=false;/.test(body)&&body.indexOf("firstPaint=false;")<body.indexOf("invalidate()"),"an update waits for its own first paint");
 assert(/if\(!firstPaint\)\{firstPaint=true;P\.onFirstPaint&&P\.onFirstPaint\(\)\}/.test(view),"the next drawn frame tells the page");
 console.log("Scheme loader: reopening over the built model ends its loading screen OK")}
