"use strict";
/* Regression for real-world Qwen3-VL responses which include fences or thinking tags.
 * These tests use mock texts and never certify recognition on a real drawing.
 */
const assert=require("node:assert/strict");
const {PROMPT,readJson,extract}=require("../src/ai-structured-extraction");
const {createAnalysis}=require("../src/ai-analysis");
const k60=JSON.stringify({schema:"ir-kmd-v1",text:"На чертеже видна колонна К60",
 marks:["К60"],notes:[],unknowns:["Масса не видна"],records:[
 {type:"dimension",mark:"К60",position:"Вид сбоку",
 values:{lengthMm:10105},evidence:{quote:"10105",location:"размерная цепь"}}
]});
assert(PROMPT.length<3000,"PDF prompt must not be cut by the engine request limit");
assert(!PROMPT.includes("К41"),"prompt must not prime incorrect marks");
for(const response of [
 k60,
 "   ```json\n"+k60+"\n```",
 "<think>Проверяю формат JSON и названия.</think>\n```json\n"+k60+"\n```",
 "Ответ:\n"+k60+"\nКонец"
]){
 assert.equal(readJson(response).marks[0],"К60");
 assert.equal(extract(response).records[0].data.lengthMm,10105);
 const parsed=createAnalysis({database:{getObject:()=>({id:1})},documents:{},engine:{}})
  .parseClaims(response);
 assert.deepEqual(parsed.marks,["К60"]);
 assert.equal(parsed.structured.records.length,1);
}
assert.equal(readJson("Модель не вернула JSON"),null);
assert.equal(readJson('{"schema":"ir-kmd-v1","marks":["К60"'),null);
assert.equal(createAnalysis({database:{getObject:()=>({id:1})},documents:{},engine:{}})
 .parseClaims("Qwen did not return JSON"),null);
console.log("Qwen response parsing: JSON, fenced, thinking wrapper, prose wrapper, invalid PASS");
