"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("src/ir-dialog-guard.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
const tabs=fs.readFileSync("src/tabs-shell.html","utf8");
assert(html.includes("ir-dialog-guard.js?v=19710"));
assert(tabs.includes("ir-dialog-guard.js?v=19710"));
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
console.log("Green compact success, red errors and dismiss OK");
