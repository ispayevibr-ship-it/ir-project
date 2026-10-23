"use strict";
/* Letter codes of shipping marks (ГОСТ 26047) and sheet titles (ГОСТ 21.502) drive kinds, groups and names. */
const assert=require("node:assert/strict");
const {markCode,sheetTitleKind,schemeTitleKind}=require("../src/ai-kmd-rules");
const {groupFor}=require("../src/ai-montage-plan");
assert.deepEqual(["К12","СВ3","ВС1","СГ2","П5","РС4","ФС1","БК2","КФ3","ТФ1","Tp1"].map(m=>markCode(m)?.name||""),
 ["Колонна","Связь вертикальная","Связь вертикальная","Связь горизонтальная","Прогон","Распорка","Ферма стропильная","Балка подкрановая","Колонна фахверка","Стойка фахверка","Тяж"],"longest prefix, Latin lookalikes");
assert.equal(markCode("В12").kind,null,"В is decided by position");
assert.deepEqual([groupFor("П3","beam"),groupFor("РС2","beam"),groupFor("Ф30","beam"),groupFor("К1","column"),groupFor("СВ1","brace"),groupFor("К130","beam")],
 ["purlins","spacers","fahwerk","columns","ties","beams"]);
assert.deepEqual(["Общие данные","Спецификация металлопроката","Схема расположения колонн","Узлы 1-5","Колонна К76"].map(sheetTitleKind),["general","list","montage","section",null]);
assert.deepEqual(["Схема расположения колонн и связей","Схема вертикальных связей","План прогонов","Схема расположения ферм"].map(schemeTitleKind),["column","brace","beam","beam"]);
console.log("КМД rules: ГОСТ 26047 mark codes, groups, names and sheet titles PASS");
