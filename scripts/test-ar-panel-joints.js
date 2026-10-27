"use strict";
// Sandwich panels of a layout stand edge to edge: a gap of up to 100 mm between a panel and the next one along the
// wall or over it is a misreading and is closed; a wider one (an opening) stays (the engineer, 27.10.2026: «изучи шов
// между сэндвичами, там не должно быть просветов»). In the 3D the panels touch, the joint is a dark line, and steel
// crossing a wall goes through a hole in the panel.
const assert=require("node:assert/strict"),fs=require("node:fs");
const {buildPlan}=require("../src/ai-montage-plan");
const spec=[{pos:"ПН-1",name:"ПС 3000.1190.150",length_mm:3000,width_mm:1190,thickness_mm:150},{pos:"ПН-2",name:"ПС 2000.1190.150",length_mm:2000,width_mm:1190,thickness_mm:150}];
const facade=(numbered,panels)=>({numbered,reversed:false,axes:numbered?[{name:"1",mm:0},{name:"2",mm:6000}]:[{name:"А",mm:0},{name:"Б",mm:6000}],panels});
const p=(mark,u0,u1,z0,z1)=>({mark,u0,u1,z0,z1,pt:[0,0]});
// The wall on А (axes rising to the right): ПН-1 0–1190 and 1240–2430 (a gap of 50), ПН-2 over the first from 3060
// (a gap of 60), a third ПН-1 3630–4820 (a gap of 1200 — an opening).
const wall=facade(true,[p("ПН-1",0,1190,0,3000),p("ПН-1",1240,2430,0,3000),p("ПН-2",0,1190,3060,5060),p("ПН-1",3630,4820,0,3000)]);
const across=facade(false,[p("ПН-1",-150,1040,0,3000),p("ПН-1",1040,2230,0,3000)]);
const plan=buildPlan({pages:[{page:1,pdfPage:1,docType:"АР",ar:{panels:spec,views:[wall,across]}}]},null,{},{});
const onA=plan.elements.filter(e=>e.fitting_type==="panel"&&e.y_mm===e.y2_mm).sort((a,b)=>a.x_mm-b.x_mm||a.z0_mm-b.z0_mm);
assert.equal(onA.length,4);
const [first,over,second,far]=onA;
assert.equal(first.x2_mm,1240,"drawn up to the next panel along");assert.equal(first.layout.width_mm,1240);assert.match(first.note,/Край продлён на 50 мм/);
assert.equal(first.z0_mm+first.diameter_mm,3060,"drawn up to the panel over it");assert.match(first.note,/Верх поднят на 60 мм/);
assert.equal(second.x2_mm,2430,"a gap of 1200 is an opening: left");assert.equal(over.z0_mm,3060);assert.equal(far.x_mm,3630);
// The 3D: no gap of 12 mm between the panels of a layout; the joints (wallSeams) in the joint colour; holes for steel.
const view=fs.readFileSync(__dirname+"/../src/scheme-three-view.js","utf8");
assert.ok(!/len-\.012/.test(view),"no gap between panels");assert.match(view,/var gl=len,cut=/);
assert.match(view,/function wallSeams\(len,h,feet,holes\)/);assert.match(view,/new T\.Mesh\(shared\("plate:box",function\(\)\{return new T\.BoxGeometry\(1,1,1\)\}\),jointMat\);sm\.quaternion\.copy\(q\);sm\.scale\.set\(pt\+\.006/);
assert.match(view,/function wallCuts\(list\)/);assert.match(view,/seatOnTops\(elems\);hangTies\(elems\);wallCuts\(elems\);/);
assert.match(view,/\.concat\(wallHoles\.get\(id\)\|\|\[\]\)/);
// wallSeams: both edges, from the foot (the slope of a lower roof) to the top, less the holes that reach the edge.
const ws=new Function(view.match(/function wallSeams\(len,h,feet,holes\)\{[\s\S]*?\n  \}\n/)[0]+";return wallSeams")();
assert.deepEqual(ws(1.19,3,[0,0],[]).map(r=>r.map(v=>+v.toFixed(4))),[[.0025,0,3],[1.1875,0,3]]);
assert.deepEqual(ws(1.19,3,[.5,.2],[[.9,1.19,1,2]]).map(r=>r.map(v=>+v.toFixed(4))),[[.0025,.5,3],[1.1875,.2,1],[1.1875,2,3]]);
// A tube «Тр.3120х5» is the square tube 120×120×5 read with its box sign as «3».
const {normProfile}=require("../src/ai-sheet-extract");
assert.equal(normProfile("Тр.3120х5"),"Тр.□120х5");assert.equal(normProfile("Тр.325х8"),"Тр.325х8");
assert.match(view,/\(\?:\[rгзо0\]\(\?=\\d\{2,3\}x\)\|3\(\?=\\d\{3\}x\)\)/);
console.log("ar panel joints: ok");
