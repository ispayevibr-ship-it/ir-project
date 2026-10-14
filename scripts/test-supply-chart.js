"use strict";
const fs=require("node:fs"),vm=require("node:vm"),assert=require("node:assert/strict");
const source=fs.readFileSync("src/object-overview-deliveries.js","utf8"),start=source.indexOf(" const irSupplyChartFactory="),end=source.indexOf(";\n window.irSupplyChartFactory=",start);
assert(start>0&&end>start,"factory is bundled inside existing deliveries module");
const engine=vm.runInNewContext('('+source.slice(start+" const irSupplyChartFactory=".length,end)+')()', {});
const types=[
 {id:"m",data:{work_type:"Металлоконструкция",project_code:"KM-1",unit:"тн"}},
 {id:"p",data:{work_type:"Монтаж профнастила",project_code:"PF",unit:"м2"}},
 {id:"b",data:{work_type:"Бетонные работы",unit:"м3"}}
];
const deliveries=[{data:{date:"2026-10-01",items:[{work_type_id:"m",project_code:"KM-1",unit:"тн",volume:8},{work_type_id:"p",project_code:"PF",unit:"м2",volume:27}]}},{data:{date:"2026-10-08",items:[{work_type_id:"m",project_code:"KM-2",unit:"тн",volume:4}]}}];
const reports=[{data:{date:"2026-10-03",items:[{work_type_id:"m",project_code:"KM-1",unit:"тн",volume:3},{work_type_id:"p",project_code:"PF",unit:"м2",volume:10}]}},{data:{date:"2026-10-09",items:[{work_type_id:"m",project_code:"KM-2",unit:"тн",volume:5}]}}];
const model=engine.prepare(types,deliveries,reports);
assert.equal(model.types.length,3,"all registered types including unreported are listed");
assert.equal(model.events.length,6,"actual delivered and mounted positions become events");
const both=engine.calc(model,"m","", "weekly");
assert.equal(both.delivered,12);assert.equal(both.mounted,8);assert.equal(both.remaining,4);
assert.equal(both.unit,"тн");assert.equal(both.points.length,2);
const first=engine.calc(model,"m","KM-1","weekly");
assert.equal(first.delivered,8);assert.equal(first.mounted,3);assert.equal(first.remaining,5);
const second=engine.calc(model,"m","KM-2","weekly");
assert.equal(second.delivered,4);assert.equal(second.mounted,5);assert.equal(second.remaining,-1);
assert.equal(engine.calc(model,"p","","weekly").unit,"м2");
assert.equal(engine.calc(model,"p","","weekly").delivered,27);
assert.equal(engine.calc(model,"b","","weekly").points.length,0);
const cum=engine.calc(model,"m","","cumulative");
assert.equal(cum.points.at(-1).delivered,12);assert.equal(cum.points.at(-1).mounted,8);
const weeklyHTML=engine.render(model,{typeId:"m",mode:"weekly"});
assert(weeklyHTML.includes('Поставки и монтаж')&&weeklyHTML.includes('data-supply-work')&&weeklyHTML.includes('data-supply-code'));
assert(weeklyHTML.includes('data-supply-search')&&weeklyHTML.includes('data-supply-mode="cumulative"'));
assert(weeklyHTML.includes('fill="#3B82F6"')&&weeklyHTML.includes('fill="#16A34A"'),"weekly bars use exact colors");
const cumHTML=engine.render(model,{typeId:"m",mode:"cumulative"});
assert(cumHTML.includes('stroke="#3B82F6"')&&cumHTML.includes('stroke="#16A34A"'),"cumulative lines use exact colors");
assert(engine.render(model,{typeId:"b"}).includes("Нет данных за выбранный период"));
assert(engine.css.includes("max-width:100%")&&engine.css.includes("@media(max-width:550px)"),"desktop and mobile overflow guards");
const archive=fs.readFileSync("src/object-export-html.js","utf8");
assert(archive.includes('window.irSupplyChart.prepare(')&&archive.includes('window.irSupplyChart.render(support.supplyModel,{})'),"export builds same chart from persisted records");
assert(archive.includes('ir-supply-chart-data')&&archive.includes('window.irSupplyChartFactory.toString()')&&archive.includes('.initOffline();'),"standalone file embeds chart engine and all data");
assert(archive.includes('window.irSupplyChart.css'),"same styling embedded offline");
assert(archive.includes("script-src 'nonce-")&&archive.includes("connect-src 'none'"),"offline CSP allows embedded scripts without networking");
assert(fs.readFileSync("src/ir-runtime.js","utf8").includes("irSupplyChartFactory"),"desktop app bundle contains the engine");
console.log("Supply and installation charts, filters, colors, offline packaging: OK");
