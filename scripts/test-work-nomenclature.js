"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const scope={window:{}};vm.runInNewContext(fs.readFileSync("src/measurement-utils.js","utf8"),scope);
const names=scope.window.irWorkNames;assert(names);
for(const [raw,base,mount,supply] of [
 ["Монтаж металлоконструкций","Металлоконструкция","Монтаж металлоконструкций","Поставка металлоконструкций"],
 ["Металлоконструкция","Металлоконструкция","Монтаж металлоконструкций","Поставка металлоконструкций"],
 ["Монтаж сэндвич-панелей","Сэндвич-панели","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
 ["Сэндвич-панели","Сэндвич-панели","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
 ["Монтаж профнастила","Профнастил","Монтаж профнастила","Поставка профнастила"],
 ["Профнастила","Профнастил","Монтаж профнастила","Поставка профнастила"]
]){
 assert.equal(names.base(raw),base);assert.equal(names.mount(raw),mount);assert.equal(names.delivery(raw),supply);
 assert.equal(names.delivery(names.mount(raw)),supply)
}
for(const [raw,base,mount,supply] of [
 ["Монтаж профнастила боксов","Профнастил боксов","Монтаж профнастила боксов","Поставка профнастила боксов"],
 ["Монтаж профнастила кровли","Профнастил кровли","Монтаж профнастила кровли","Поставка профнастила кровли"],
 ["Монтаж профнастила веншахт","Профнастил веншахт","Монтаж профнастила веншахт","Поставка профнастила веншахт"],
 ["Монтаж сэндвич-панелей веншахт","Сэндвич-панели веншахт","Монтаж сэндвич-панелей веншахт","Поставка сэндвич-панелей веншахт"],
 ["Монтаж металлоконструкций боксов","Металлоконструкции боксов","Монтаж металлоконструкций боксов","Поставка металлоконструкций боксов"]
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
