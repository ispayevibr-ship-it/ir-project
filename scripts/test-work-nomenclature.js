"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const scope={window:{}};vm.runInNewContext(fs.readFileSync("src/measurement-utils.js","utf8"),scope);
const names=scope.window.irWorkNames;assert(names);
// The base name: as the engineer wrote it (30.10.2026); a report and a delivery name the work by what was done.
for(const [raw,base,mount,supply] of [
 ["Монтаж металлоконструкций","Монтаж металлоконструкций","Монтаж металлоконструкций","Поставка металлоконструкций"],
 ["Металлоконструкция","Металлоконструкция","Монтаж металлоконструкций","Поставка металлоконструкций"],
 ["Монтаж сэндвич-панелей","Монтаж сэндвич-панелей","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
 ["Сэндвич-панели","Сэндвич-панели","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
 ["Монтаж профнастила","Монтаж профнастила","Монтаж профнастила","Поставка профнастила"],
 ["Профнастила","Профнастила","Монтаж профнастила","Поставка профнастила"]
]){
 assert.equal(names.base(raw),base);assert.equal(names.mount(raw),mount);assert.equal(names.delivery(raw),supply);
 assert.equal(names.delivery(names.mount(raw)),supply)
}
for(const [raw,base,mount,supply] of [
 ["Монтаж профнастила боксов","Монтаж профнастила боксов","Монтаж профнастила боксов","Поставка профнастила боксов"],
 ["Монтаж профнастила кровли","Монтаж профнастила кровли","Монтаж профнастила кровли","Поставка профнастила кровли"],
 ["Монтаж профнастила веншахт","Монтаж профнастила веншахт","Монтаж профнастила веншахт","Поставка профнастила веншахт"],
 ["Монтаж сэндвич-панелей веншахт","Монтаж сэндвич-панелей веншахт","Монтаж сэндвич-панелей веншахт","Поставка сэндвич-панелей веншахт"],
 ["Монтаж металлоконструкций боксов","Монтаж металлоконструкций боксов","Монтаж металлоконструкций боксов","Поставка металлоконструкций боксов"]
]){assert.equal(names.base(raw),base);assert.equal(names.mount(raw),mount);assert.equal(names.delivery(raw),supply);assert.equal(names.mount(names.delivery(raw)),mount)}
for(const n of ["Монтаж балок","Изготовление металлоконструкций","Бетонные работы","Монтаж металлоконструкций КМ-01"]){assert.equal(names.base(n),n);assert.equal(names.delivery(n),n)}
assert(fs.readFileSync("src/ir-runtime.js","utf8").includes("window.irWorkNames={category:workKind"),"bundled format helper");
for(const [p,fragment] of [
 ["src/reports-page.js",'workLabel(g.work_type,"mount")'],
 ["src/marks-page.js","workLabel(w.name)"],
 ["src/deliveries-page.js",'workLabel(w.name,"delivery")'],
 ["src/object-overview-deliveries.js",'workLabel(g.name,"delivery")'],
 ["src/object-export-html.js",'workLabel(w.work_type||w.type||"Работа","mount")'],
 ["src/object-export-extras.js",'workLabel(p.work_type,"delivery")']
])assert(fs.readFileSync(p,"utf8").includes(fragment),p);
console.log("Contextual Russian names validated");
