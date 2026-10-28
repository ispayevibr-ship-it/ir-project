"use strict";
// The card of the selected element as the report of 21.10.2026 has it (the engineer, 27.10.2026: «вывод информации об
// элементе сделай такой»): the mark — its name, its state with the day of mounting by the daily reports, a line of the
// sheet, section, masses of the КМД and of the model and the bolts, the nodes of the member, «Приблизить» / «Снять
// подсветку», the parts of the specification with their colours; on the 3D the parts of the member in those colours with
// their numbers in circles, a position chosen lit. The same in the program and in the exported HTML.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const C=require("../src/scheme-element-card.js");
const src=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
// The top: the mark, its name, the state with its day; for a mark mounted in part how many and the last day.
const head=C.head({mark:"Л29",name:"Связь вертикальная",status:"mounted",status_label:"Смонтирована",status_date:"24.09.2026"});
assert.match(head,/ec-mark">Л29</);assert.match(head,/ec-ok">Смонтирована 24\.09\.2026</);
assert.match(C.head({mark:"К1",status:"partial",status_label:"Частично",status_more:"2 из 4 шт., последний монтаж 20.09.2026"}),/<small>2 из 4 шт\., последний монтаж 20\.09\.2026<\/small>/);
// The line of the sheet: «…pdf, лист 11» → «…, л. 11»; the section; the masses; the bolts.
const m={mass_kg:73.6,bolts:4,nodes:[{id:"У-0847",name:"Стык колонн",axes:"А/6"},{id:"У-0853",name:"Стык колонн",axes:"А/7"}],colors:{1:"#4a95c4",2:"#c2507a",3:"#4cbfae"},lit:"2"};
const e={mark:"Л29",profile:"Тр.□100х4",sheet:"КМД 043-2026.pdf, лист 11",mass_kmd:74,model:m,
 spec:{sheet:"КМД 043-2026.pdf, лист 11",rows:[{pos:1,section:"Тр.□100х4",length_mm:5650,count:1,note:"прорези под фасонки"},{pos:2,section:"−140×10",length_mm:210,count:2,mass_kg:2.3,note:"фасонки, 2 отв. Ø23"},{pos:3,section:"−65×6",length_mm:140,count:4}]},
 kgm:s=>({"Тр.□100х4":11.73,"−65×6":3.06})[s]||null};
assert.equal(C.facts(e),'<div class="ec-facts">КМД 043-2026, л. 11 · Тр.□100х4 · масса 74 кг (КМД), по модели 73,6 кг · болтов 4</div>');
assert.match(C.facts({model:{mass_kg:12.5}}),/масса по модели 12,5 кг/);
// The nodes of the member, each opens its node.
const n=C.nodes(e);assert.match(n,/Узлы марки \(2\):/);assert.match(n,/data-ec-node="У-0847">У-0847 Стык колонн А\/6</);
assert.equal(C.nodes({model:{nodes:[]}}),"");assert.match(C.tools(),/data-ec-zoom>Приблизить<.*data-ec-unlight>Снять подсветку</);
// The parts: the colour of each position as the model has it, the note under the section, kilograms of the specification
// (2,3 × 2) or by the sortament (11,73 kg/m × 5,65 m; 3,06 × 0,14 × 4 — pale, with the kg/m in the hint), the lit row.
const t=C.parts(e);
assert.match(t,/<th>Поз<\/th><th>Сечение<\/th><th class="ec-n">L<\/th><th class="ec-n">Шт<\/th><th class="ec-n">кг<\/th>/);
assert.match(t,/<tr data-ec-pos="1"><td><span class="ec-sw" style="background:#4a95c4"><\/span>1<\/td><td>Тр\.□100х4<div class="ec-note">прорези под фасонки<\/div><\/td><td class="ec-n">5.650<\/td><td class="ec-n">1<\/td><td class="ec-n ec-calc" title="По сортаменту: 11,7 кг\/м">66,3<\/td><\/tr>/);
assert.match(t,/<tr data-ec-pos="2" class="on">.*<td class="ec-n">4,6<\/td><\/tr>/);
assert.match(t,/<td class="ec-n ec-calc" title="По сортаменту: 3,1 кг\/м">1,7<\/td>/);
assert.match(t,/Спецификация: КМД 043-2026, л\. 11/);assert.equal(C.parts({spec:{rows:[]}}),"");
// Wired in the program (and its bundle) and in the exported page: the order of the top, the buttons on the 3D.
for(const f of ["src/scheme-page.js","src/ir-runtime.js"]){const s=src(f);
 assert(s.includes("${EC.head(e)}${EC.facts(e)}${EC.nodes(e)}${EC.tools(e)}${EC.parts(e)}${EC.what(e)}${EC.where(e,grid)}${EC.drawings(e)}<div class=\"ec-mark-host\">"),f+": the order of the card");
 assert(s.includes("EC.bind(panel,String(c.id));")&&s.includes("model:V?.card?.(c.id)||null"),f+": the 3D of the card");
 assert(s.includes('root.section("reports").list()')&&s.includes("progress.state===\"mounted\"?{date:ruDay(done),more:\"\"}"),f+": the day of mounting by the daily reports");
 assert(s.includes("status_date:day.date||undefined,status_more:day.more||undefined,sheet:sheetOfRecord(c)||undefined,mass_kmd:markMass(c,lm)||undefined"),f+": the export gets them")}
const exp=src("src/scheme-export-html.js");
assert(exp.includes("EC.head(e)+EC.facts(e)+EC.nodes(e)+EC.tools(e)+EC.parts(e)+EC.what(e)")&&exp.includes("if(EC.bind)EC.bind(box,c.id);"),"the exported page");
assert(exp.includes(".ec-parts{width:100%")&&src("src/scheme-page.css").includes(".ec-parts{width:100%")&&src("src/ir-styles.css").includes(".ir-three-callout{"),"the styles");
// The 3D: the body and the plates, ribs and gussets by their positions; the colours, the numbers, a position lit; the card.
const view=src("src/scheme-three-view.js");
assert(view.includes("mesh.userData.memberId=id;mesh.userData.body=true;")&&view.includes("m.userData.plate=true;m.userData.pos=e.pos;")&&view.includes("m.userData.plate=true;m.userData.pos=r.pos;")&&view.includes("m.userData.gusset=true;m.userData.pos=g.pos;"),"the pieces know their position");
assert(view.includes("holes:holes,pos:r.pos})"),"an end plate of a cut carries its position");
assert(view.includes('if(!i&&parts)mat=litPart!==null&&p!==litPart?partMat("#d3dae0"):p!==null&&parts.color[p]?partMat(parts.color[p]):s[1];'),"the parts in their colours, the others pale when one is lit");
assert(view.includes('el.className="ir-three-callout";el.textContent=p;')&&view.includes("paintCallouts(w,h);"),"the numbers in circles");
assert(view.includes("card:card,lightPart:lightPart,")&&view.includes('card:function(id){return call("card",id)||null}'),"the API of the card");
assert(view.includes('"rows","mass_kg_m"]'),"the exported page has the masses of the sortament");
// The body is the position of its own section (else the longest rolled one at least half its length).
assert(view.includes("k=same(sc)?2:sc&&sc.shape!==\"plate\"&&len>=L*.5?1:0"));
// Kilograms in a metre: of the sortament row, else by the sizes.
const mm=new Function("sectionOf","number",view.match(/ function massPerMetre\(text,standard\)\{[\s\S]*?\n \}\n/)[0]+";return massPerMetre");
const fake={"I30Ш1":{shape:"ibeam",h:291,b:200,s:8,t:11,kgm:53.6},"−140×10":{shape:"plate",h:140,b:10},"Ø20":{shape:"round",h:20,solid:true},"Тр.□100х4":{shape:"box",h:100,b:100,t:4},"Ø159х6":{shape:"round",h:159,t:6}};
const kgm=mm(x=>fake[x]||null,v=>Number(v)||0);
assert.equal(kgm("I30Ш1"),53.6);assert.equal(kgm("−140×10"),10.99);assert.equal(kgm("Ø20"),2.466);assert.equal(kgm("Тр.□100х4"),12.058);assert.equal(kgm("Ø159х6"),22.639);assert.equal(kgm("?"),null);
// The mass of the model: the closed pieces by their volume, not the holes, the anchors, the footing.
assert(view.includes("if(m.userData.hole||m.userData.anchor||m.userData.footing||m.material===concreteMat)return;v+=volumeOf(m)"));
// Without a КМД (the КМ only, 28.10.2026: «вот смотри как четко показан узел, также сделай»): the positions the model
// gives of the pieces of the member (model.spec) — the profile, the members of a truss, the plates by thickness — in the
// same table, with the note that they are conventional; a specification of the КМД goes first.
const km={model:{colors:{1:"#4a95c4",2:"#c2507a"},spec:{note:"КМД нет: позиции условные",rows:[{pos:"1",section:"∟140×10",count:8,length_mm:null,mass_kg:130.1,note:"верхний пояс"},{pos:"2",section:"−220×25",count:1,length_mm:700,mass_kg:30.2,note:"опорное ребро фермы"}]}}};
const kt=C.parts(km);
assert.match(kt,/<tr data-ec-pos="1"><td><span class="ec-sw" style="background:#4a95c4"><\/span>1<\/td><td>∟140×10<div class="ec-note">верхний пояс<\/div><\/td><td class="ec-n"><\/td><td class="ec-n">8<\/td><td class="ec-n">1.041<\/td><\/tr>/);
assert.match(kt,/−220×25<div class="ec-note">опорное ребро фермы/);assert.match(kt,/<p class="ec-parts-src">КМД нет: позиции условные<\/p>/);
assert.match(C.parts(Object.assign({},e,{model:Object.assign({},m,{spec:km.model.spec})})),/Спецификация: КМД 043-2026/,"the КМД first");
assert(view.includes("function deriveParts(){")&&view.includes("buildNodes();deriveParts();lowerGround();")&&view.includes("spec:derivedParts.get(id)||null,"),"positions of the model, in the card");
assert(view.includes("var c=dataById.get(id);if(!c||c.ft||partRows(c).length)return;")&&view.includes("if(order.length<2)return;"),"only without a КМД, of two pieces and more");
assert(view.includes('partTag(new T.Mesh(geo,mat),memberRoles[m[4]]||"элемент решётки",/^\\d/.test(pr)?"∟"+pr:pr)')&&view.includes('"опорное ребро фермы"),id)')&&view.includes('"опорный столик фермы"),cid)')&&view.includes('"опорная плита")'),"the pieces named where they are drawn");
assert(view.includes("order.sort(function(a,b){return a.o-b.o||b.t-a.t||a.i-b.i});"),"the profile, the truss members, the plates by thickness");
assert(view.includes("if(len<Math.min(w,h)){var t=mm(len);return{n:name(\"фасонка\"),s:\"−\"+t"),"a gusset cut to its shape by its thickness");
assert(view.includes("closestPointToPointParameter(t,true)")&&view.includes("Math.min(.5,.35/L)"),"the number at the node looked at, 0.35 m in along a member");
console.log("Element card as the report of 21.10: state with its day, sheet · section · masses · bolts, nodes, parts in their colours with numbers on the 3D — program and export PASS");
