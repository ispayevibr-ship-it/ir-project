
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const js=fs.readFileSync("src/profile-ui.js","utf8");
const standaloneCSS=fs.readFileSync("src/object-shell.css","utf8");
const tabCSS=fs.readFileSync("src/tabs-shell.css","utf8");
const html=fs.readFileSync("src/tabs-shell.html","utf8");
assert.match(js,/© 2026 IR Project\. Все права защищены\./);
assert(!js.includes('© 2026 ТОО «А-Темир Строй»'));
for(const id of ["companyProfileSettings","programAboutButton","programCheckUpdates"]){
 assert(js.includes('id="'+id+'"'),"must preserve handler and ID: "+id);
}
assert(js.includes('const refreshIcon=menuIcon('));
assert(!js.includes("↻ Проверить обновления"));
assert(js.includes("positionSettings()"));
assert(js.includes('settingsMenu.ownerDocument.defaultView?.addEventListener("resize"'));
assert(tabCSS.includes("position:fixed!important"),"tab-host menu must escape clipped tab bar");
assert(standaloneCSS.includes(".profile-panel .program-settings-menu .program-settings-item"));
assert(tabCSS.includes(".profile-panel .program-settings-menu .program-settings-item"));
assert.match(html,/tabs-shell\.css\?v=\d+/);
// Position the menu against a gear near the right edge of the host viewport.
const start=js.indexOf("  const closeSettings=()=>"),end=js.indexOf("\n  select.value=irAccess.role();",start);
assert(start>=0&&end>start);
const menu={hidden:true,style:{},ownerDocument:{defaultView:{innerWidth:1100,addEventListener(){}}}};
const button={
 classList:{remove(){},toggle(){}},
 setAttribute(){},
 closest(selector){return selector===".tabs-profile-slot"?{}:null},
 getBoundingClientRect(){return{right:1040,bottom:43}}
};
const fn=vm.runInNewContext("(function(settingsMenu,settingsButton){"+js.slice(start,end)+
 ";return positionSettings})",{});
assert.equal(typeof fn,"function");
assert.equal(fn(menu,button)(),undefined);
assert.equal(menu.style.left,"754px");
assert.equal(menu.style.top,"51px");

// Event handling must work in both the iframe's document and the tab host
// after the existing profile panel has been moved into .tabs-profile-slot.
const listeners=()=>{
 const map=new Map();
 return {
  innerWidth:1100,
  addEventListener(type,fn){if(!map.has(type))map.set(type,new Set());map.get(type).add(fn)},
  removeEventListener(type,fn){map.get(type)?.delete(fn)},
  dispatch(type,target,key){for(const fn of [...(map.get(type)||[])])fn({target,key})},
  count(type){return map.get(type)?.size||0}
 }
};
const childDoc=listeners(),hostDoc=listeners();
const menuNode={hidden:true,style:{},ownerDocument:hostDoc,contains:target=>target==="menu"};
const gearNode={
 classList:{add(){this.active=true},remove(){this.active=false},toggle(){}},
 setAttribute(name,value){this[name]=value},
 closest:()=>({}),getBoundingClientRect:()=>({right:1040,bottom:43}),
 contains:target=>target==="gear"
};
const profileMenu={hidden:true},badgeButton={},roleSelect={value:"guest"};
const handlerEnd=js.indexOf('  settingsMenu.ownerDocument.defaultView?.addEventListener("resize"',start);
assert(handlerEnd>end,"test must include click handlers");
const init=vm.runInNewContext("(function(settingsMenu,settingsButton,menu,badge,select,document){"+
 js.slice(start,handlerEnd)+";return {closeSettings}})",{});
const state=init(menuNode,gearNode,profileMenu,badgeButton,roleSelect,childDoc);
gearNode.onclick();
assert.equal(menuNode.hidden,false);
assert.equal(gearNode["aria-expanded"],"true");
assert.equal(hostDoc.count("pointerdown"),1,"parent host click watcher");
assert.equal(childDoc.count("pointerdown"),1,"iframe click watcher");
hostDoc.dispatch("pointerdown","menu");
assert.equal(menuNode.hidden,false,"click inside menu must not close it");
hostDoc.dispatch("pointerdown","gear");
assert.equal(menuNode.hidden,false,"gear click is handled by its own toggle");
childDoc.dispatch("pointerdown","content");
assert.equal(menuNode.hidden,true,"click inside iframe closes menu");
assert.equal(gearNode["aria-expanded"],"false");
assert.equal(childDoc.count("pointerdown"),0,"listener must be cleaned up");
assert.equal(hostDoc.count("pointerdown"),0,"host listener must be cleaned up");
gearNode.onclick();
hostDoc.dispatch("pointerdown","toolbar");
assert.equal(menuNode.hidden,true,"click in host toolbar closes menu");
gearNode.onclick();
gearNode.onclick();
assert.equal(menuNode.hidden,true,"clicking gear again closes menu");
assert.equal(hostDoc.count("pointerdown"),0);
gearNode.onclick();
childDoc.dispatch("keydown",null,"Escape");
assert.equal(menuNode.hidden,true,"Escape in iframe closes menu");
gearNode.onclick();
hostDoc.dispatch("keydown",null,"Escape");
assert.equal(menuNode.hidden,true,"Escape in host closes menu");

console.log("Settings menu positioning, outside click (iframe + host), toggle and Escape OK");
