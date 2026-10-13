
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
console.log("Settings menu copyright, update SVG, aligned host popup and current handlers OK");
