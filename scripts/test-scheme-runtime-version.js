"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const shell=fs.readFileSync("src/tabs-shell.js","utf8");
const viewer=fs.readFileSync("src/scheme-three-view.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
const shellHTML=fs.readFileSync("src/tabs-shell.html","utf8");
const a=shell.indexOf(" const runtimeTokenFromHtml="),b=shell.indexOf("\n function updateCurrent(",a);
assert(a>=0&&b>a,"runtime detection must be present before updateCurrent");
const evalScript=shell.slice(a,b)+"\n({runtimeTokenFromHtml,runtimeTokenInDoc,staleSchemeButton,detectOldTabCode})";
const makeDoc=(token,label,revision)=>({
 querySelector:()=>({getAttribute:()=> "./ir-runtime.js?v="+token}),
 getElementById:()=>label?{textContent:label,dataset:{irLabel:revision}}:null
});
const mk=(doc,latest)=>{
 const tab={started:true,ready:true,frame:{contentDocument:doc}};
 return vm.runInNewContext(evalScript,{frames:new Map([["t",tab]]),activeId:"t",
  fetch:async()=>({ok:true,text:async()=>'<script src="./ir-runtime.js?v='+latest+'"></script>'}),
  Date});
};
(async()=>{
 const current=mk(makeDoc("17144","＋ Добавить элемент","add-element"),"17144");
 assert.equal(await current.detectOldTabCode(),"");
 const old=mk(makeDoc("17142","＋ Разместить марку",undefined),"17144");
 assert.match(await old.detectOldTabCode(),/старую версию/);
 const wrongToken=mk(makeDoc("17143",null,null),"17144");
 assert.match(await wrongToken.detectOldTabCode(),/устаревший JavaScript/);
 assert.match(current.runtimeTokenFromHtml(html),/^\d+$/);
 assert(shellHTML.includes("tabs-shell.js?v=1104700"));
 assert(viewer.includes('id="irThreeAdd"'),"the 3D view has its single Add control");
 assert(!viewer.includes('id="irbStart"'),"obsolete sidebar Add control is absent");
 assert(shell.includes('getElementById?.("irbStart")'),"obsolete cached tabs can still be recognized");
 assert(shell.includes('["Перезагрузить вкладку",true,()=>{if(reloadCurrent())closeUpdate()}]'));
 console.log("Installed version versus active iframe: stale UI and script revisions detected.");
})().catch(e=>{console.error(e);process.exitCode=1});
