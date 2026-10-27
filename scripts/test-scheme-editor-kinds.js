"use strict";
/* The element editor offers the geometries and sections of the element's kind: a sandwich panel — a panel or a profiled
   sheet, not «Балка / Двутавр» (the engineer, 27.10.2026, ПН-14 «Сэндвич-панель стеновая»); a tank sheet keeps its shell
   or plate and is saved without an end point (it was saved as a column when the list had no such geometry). */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"../src/scheme-page.js"),"utf8"),lines=src.split("\n");
const pick=prefix=>{const i=lines.findIndex(l=>l.startsWith(prefix));assert(i>=0,prefix);return lines[i]};
const from=lines.findIndex(l=>l.startsWith(" const SECTION_LABEL=")),to=lines.findIndex(l=>l.startsWith(" const pointGeometry="));
assert(from>0&&to>from,"the kind helpers");
const code=[pick(" const FITTING_LABEL="),...lines.slice(from,to+1),pick(" const sectionType="),pick(" const sectionTypeLabel="),pick(" const sectionOptions="),pick(" const geometryLabel="),pick(" const geometryOptions=")].join("\n")+
 "\n;({elementKind,sectionFor,sectionOptions,geometryOptions,geometryChoices,pointGeometry,sectionTypeLabel})";
const k=vm.runInNewContext(code,{window:{irStructureTypes:require("../src/ai-structure-types.js")}});
const shown=html=>[...html.matchAll(/<option value="([^"]*)" (selected)?>([^<]*)</g)].map(m=>(m[2]?"*":"")+m[3]);
// A sandwich panel of the АР: its fitting type or its name.
const panel={fitting_type:"panel",section_type:"ibeam",geometry_type:"beam",mark:"ПН-14",mark_name:"Сэндвич-панель стеновая ПС 5490.1190.150"};
assert.equal(k.elementKind(panel),"panel");
assert.equal(k.elementKind({mark_name:panel.mark_name}),"panel","by the name in the catalog");
assert.equal(k.elementKind({},{name:"Профлист Н57-750-0,7"}),"profsheet","a new element by the name of its mark");
assert.equal(k.elementKind({mark:"ПН-14"}),"","the letters ПН alone are not a profiled sheet");
assert.equal(k.sectionFor(panel,"panel"),"panel","a saved «ibeam» of a panel is the old default");
assert.deepEqual(shown(k.sectionOptions(k.sectionFor(panel,"panel"),"panel")),["*Сэндвич-панель","Профлист (профнастил)"]);
assert.equal(k.sectionFor({fitting_type:"panel",mark_name:"Профлист Н57"},"panel"),"profsheet");
const g=shown(k.geometryOptions("beam","panel"));
assert(g[0]==="*Сэндвич-панели — по линии от точки до точки"&&g.length===2&&!g.some(x=>/Балка|Ферма|Связь/.test(x)),g.join(" / "));
assert.equal(shown(k.geometryOptions("truss","panel")).at(-1),"*Ферма","a geometry the list has not is kept, not lost");
// Windows, doors, gates — a block; nozzles — a pipe; a railing — angles.
assert.deepEqual(shown(k.sectionOptions(k.sectionFor({fitting_type:"window"},"window"),"window")),["*Блок (окно, дверь, ворота)"]);
assert(/^\*Окно — /.test(shown(k.geometryOptions("beam","window"))[0]));
assert.equal(k.sectionFor({fitting_type:"nozzle"},"nozzle"),"round");assert.equal(k.sectionFor({fitting_type:"railing"},"railing"),"angle");
// A tank sheet: shell or plate, a point with a radius.
assert.equal(k.elementKind({geometry_type:"shell"}),"sheet");
assert.deepEqual(shown(k.geometryOptions("shell","sheet")),["*Обечайка резервуара (по радиусу)","Лист днища, крыши (по радиусу)"]);
assert(k.pointGeometry("shell")&&k.pointGeometry("plate")&&k.pointGeometry("column")&&!k.pointGeometry("beam"));
// A frame member keeps the frame lists.
assert.equal(k.elementKind({mark:"К4",mark_name:"Колонна"}),"");
assert.deepEqual(shown(k.sectionOptions("ibeam","")),["*Двутавр","Квадратная труба","Круглая труба","Короб / сплошное"]);
assert.equal(shown(k.geometryOptions("beam","")).length,5);
// The editor rebuilds both lists by the kind when it opens, when a mark is chosen and when a mark is placed; a point
// geometry is saved without an end.
assert(src.includes("const fitShape=(src,m,geo)=>")&&(src.match(/fitShape\(/g)||[]).length===3,"fitShape: used on open, mark change, placement");
assert(src.includes("member=!pointGeometry(kind)")&&src.includes("absolute_x2_mm:point?undefined:x2")&&src.includes("end_z_mm:point?undefined:z1"),"point geometries have no end");
assert(!src.includes("f.elements.geometry_type.value=placement.geometry")&&!src.includes("f.elements.section_type.value=sectionType("),"no list left with the frame options only");
const runtime=fs.readFileSync(path.join(__dirname,"../src/ir-runtime.js"),"utf8");
assert(runtime.includes("const fitShape=(src,m,geo)=>")&&runtime.includes(" const pointGeometry=kind=>"),"the runtime bundle carries it");
console.log("Element editor: geometries and sections of the element's kind PASS")
