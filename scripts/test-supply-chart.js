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
assert.equal(model.types[0].id,"m","most active work is shown first");
assert.equal(model.types[0].activeDays,4);
assert.equal(model.events.length,6,"actual delivered and mounted positions become events");
const both=engine.calc(model,"m","", "daily");
assert.equal(both.delivered,12);assert.equal(both.mounted,8);assert.equal(both.remaining,4);
assert.equal(both.unit,"тн");assert.equal(both.points.length,2);
const first=engine.calc(model,"m","KM-1","daily");
assert.equal(first.delivered,8);assert.equal(first.mounted,3);assert.equal(first.remaining,5);
const second=engine.calc(model,"m","KM-2","daily");
assert.equal(second.delivered,4);assert.equal(second.mounted,5);assert.equal(second.remaining,-1);
assert.equal(engine.calc(model,"p","","daily").unit,"м2");
assert.equal(engine.calc(model,"p","","daily").delivered,27);
assert.equal(engine.calc(model,"b","","daily").points.length,0);
const cum=engine.calc(model,"m","","cumulative");
assert.equal(cum.points.at(-1).delivered,12);assert.equal(cum.points.at(-1).mounted,8);
const dailyHTML=engine.render(model,{typeId:"m",mode:"daily"});
assert(dailyHTML.includes('Поставки и монтаж')&&dailyHTML.includes('data-supply-work')&&dailyHTML.includes('data-supply-code'));
assert(!dailyHTML.includes('data-supply-search')&&dailyHTML.includes('data-supply-mode="daily"')&&dailyHTML.includes('data-supply-mode="cumulative"'));
assert(dailyHTML.includes('fill="#3B82F6"')&&dailyHTML.includes('fill="#16A34A"'),"weekly bars use exact colors");
const cumHTML=engine.render(model,{typeId:"m",mode:"cumulative"});
assert(cumHTML.includes('stroke="#3B82F6"')&&cumHTML.includes('stroke="#16A34A"'),"cumulative lines use exact colors");
assert(engine.render(model,{typeId:"b"}).includes("Нет данных за выбранный период"));
assert(engine.css.includes("max-width:100%")&&engine.css.includes("@media(max-width:550px)"),"desktop and mobile overflow guards");

const grouped=engine.prepare([
 {id:"a",data:{work_type:"Монтаж сэндвич-панелей",project_code:"СП-01",unit:"м2"}},
 {id:"d",data:{work_type:"Сэндвич-панели",project_code:"СП-02",unit:"м2"}},
 {id:"x",data:{work_type:"Монтаж сэндвич-панелей",project_code:"СП-03",unit:"м3"}}
],[
 {data:{date:"2026-10-06",items:[{work_type_id:"a",project_code:"СП-01",volume:12,unit:"м2"}]}},
 {data:{date:"2026-10-07",items:[{work_type_id:"d",project_code:"СП-02",volume:17,unit:"м2"}]}}
],[{data:{date:"2026-10-08",items:[{work_type_id:"d",project_code:"СП-02",volume:9,unit:"м2"}]}}]);
assert.equal(grouped.types.length,2,"same names group only within one unit");
const main=grouped.types.find(x=>x.unit==="м2");
assert.equal(main.name,"Монтаж сэндвич-панелей");
assert.equal(main.codes.join("|"),"СП-01|СП-02");
assert.equal(engine.calc(grouped,main.id,"","daily").delivered,29);
assert.equal(engine.calc(grouped,main.id,"СП-02","daily").mounted,9);
const html=engine.render(grouped,{typeId:main.id});
assert(html.includes("Монтаж сэндвич-панелей</option>"),"work title excludes code");
assert(!html.includes("Монтаж сэндвич-панелей · СП-01"),"no duplicate code");
assert(html.includes(">СП-01</option>")&&html.includes(">СП-02</option>"),"codes remain in second filter");
assert.equal(engine.calc(model,"m","","daily").points.length,4,"chart plots individual activity dates");
assert(dailyHTML.includes("01.10.2026")&&dailyHTML.includes("03.10.2026"),"daily tooltip dates");
assert(engine.render(model).includes("По дням")&&!engine.render(model).includes("По неделям"),"daily mode default");
const archive=fs.readFileSync("src/object-export-html.js","utf8");
assert(archive.includes('window.irSupplyChart.prepare(')&&archive.includes('window.irSupplyChart.render(support.supplyModel,{})'),"export builds same chart from persisted records");
assert(archive.includes('ir-supply-chart-data')&&archive.includes('window.irSupplyChartFactory.toString()')&&archive.includes('.initOffline();'),"standalone file embeds chart engine and all data");
assert(archive.includes('window.irSupplyChart.css'),"same styling embedded offline");
assert(archive.includes("script-src 'nonce-")&&archive.includes("connect-src 'none'"),"offline CSP allows embedded scripts without networking");
assert(fs.readFileSync("src/ir-runtime.js","utf8").includes("irSupplyChartFactory"),"desktop app bundle contains the engine");
console.log("Supply and installation charts, filters, colors, offline packaging: OK");
