"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("src/ir-dialog-guard.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
const tabs=fs.readFileSync("src/tabs-shell.html","utf8");
assert(html.includes("ir-dialog-guard.js?v=1130300"));
assert(tabs.includes("ir-dialog-guard.js?v=1130300"));
assert(js.includes(".ir-notice--success{background:#effbf3"));
assert(js.includes("width:min(360px,calc(100vw - 24px))"));
function node(){const e={children:[],className:"",textContent:"",isConnected:true,attrs:{},
 append(...xs){for(const x of xs){this.children.push(x);x.parent=this}},
 get childElementCount(){return this.children.length},get firstElementChild(){return this.children[0]},
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this)}this.isConnected=false},
 setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.handlers??={};this.handlers[k]=fn}};
 e.classList={contains:k=>e.className.split(" ").includes(k)};return e}
const head=node(),body=node(),document={head,body,activeElement:null,createElement:node,querySelectorAll:()=>[]};
const window={setTimeout(){}};
vm.runInNewContext(js,{window,document});
window.irProjectNotice("Выгрузка завершена","success");
const stack=body.children[0],success=stack.children[0];
assert(success.className.includes("ir-notice--success"));assert.equal(success.attrs.role,"status");
assert.equal(success.children[0].children[0].textContent,"✓ Успешно");
window.alert("Сбой");
assert(stack.children[1].className.includes("ir-notice--error"));
assert.equal(stack.children[1].attrs.role,"alert");
success.children[1].handlers.click();
assert.equal(stack.children.length,1);
// 1.11.72: alert() with a report of a done action is green, failures stay red.
const tone=window.irProjectAlertTone;
for(const m of["Монтажная схема сохранена:\nC:\\Users\\user\\Desktop\\схема.html","Пример сохранён: C:\\a.xlsx","Отправлено файлов: 3",
 "Новых записей нет — всё уже отправлено","У вас установлена последняя версия IR Project 1.11.72.","Удалено элементов: 4",
 "Импорт чернового размещения завершён. Добавлено: 5. Ошибок: 0. Проверьте схему.","База данных успешно выгружена в выбранную папку."])
 assert.equal(tone(m),"success",m);
for(const m of["Картинка не загружена: x","Съёмка не сохранена: x","Не удалось выгрузить схему: x","Сообщение не отправлено: x",
 "Импорт чернового размещения завершён. Добавлено: 2. Ошибок: 3.","Ошибка удаления сетки: x","Почта появится после обновления IR Project.",
 "Укажите вид работы.","Сбой","Нечего подтверждать: элементы уже подтверждены или удалены.","Фото «a.jpg» не добавлено: x",
 "Выгрузка схемы в HTML недоступна — обновите программу."])
 assert.equal(tone(m),"error",m);
window.alert("Монтажная схема сохранена:\nC:\\схема.html");
assert(stack.children.at(-1).className.includes("ir-notice--success"));
console.log("Green compact success, red errors and dismiss OK");
