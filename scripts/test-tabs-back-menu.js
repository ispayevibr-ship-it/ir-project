"use strict";
/* The engineer, 27.10.2026: «Назад» returns to the page he came from, not to the object's overview; a right click on a
   menu item opens it in a new tab or window, duplicates; the route label at the bottom («objects/id…») is gone. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const shell=read("src/tabs-shell.js"),html=read("src/tabs-shell.html"),css=read("src/tabs-shell.css");
new vm.Script(shell,{filename:"src/tabs-shell.js"});
// The pages of a tab in the order they were opened; back goes along them.
assert(shell.includes("route:path,trail:[path],"),"a tab starts its trail");
assert(shell.includes("if(tab.goingBack)tab.goingBack=false;else{tab.trail.push(next);"),"a new page joins the trail, a return does not");
assert(shell.includes("trail.pop();tab.goingBack=true;child.location.hash=trail[trail.length-1]"),"back returns to the page before");
const home=shell.match(/const HOME_BACK=new Set\((\[[^\]]+\])\)/);assert(home,"the section back buttons");
const ids=JSON.parse(home[1]);
for(const id of ["back","marksBack","schemeBack","reportsBack","scheduleBack","deliveriesBack","wtBack"])assert(ids.includes(id),id);
for(const id of ["deliveryFormBack","reportFormBack","deliveryDetailBack","deliveryFocusBack"])assert(!ids.includes(id),id+" keeps its own logic (drafts)");
// Every listed button is a back of a section page that went to the overview or the list of objects.
const pages=fs.readdirSync(path.join(__dirname,"../src")).filter(f=>f.endsWith(".js")&&f!=="ir-runtime.js").map(f=>read("src/"+f)).join("\n");
for(const id of ids)assert(new RegExp('id="'+id+'"').test(pages),"the page has "+id);
assert(shell.includes('if(b&&HOME_BACK.has(b.id)&&goBack(tab)){e.preventDefault();e.stopPropagation()}'),"the button goes back before its own handler");
assert(shell.includes('event.altKey&&!ctrl&&!event.shiftKey&&event.key==="ArrowLeft"'),"Alt+← goes back");
// The right-click menus.
assert(shell.includes('child.addEventListener("contextmenu",e=>pageMenu(tab,e))')&&shell.includes("button.oncontextmenu=e=>{e.preventDefault();tabMenu(id,e.clientX,e.clientY)}"),"menus of pages and tabs");
for(const label of ["Открыть в новой вкладке","Открыть в фоновой вкладке","Открыть в новом окне","Дублировать вкладку","Эту страницу в новом окне","Обновить страницу","Закрыть другие вкладки","Закрыть вкладки справа"])assert(shell.includes('"'+label+'"'),label);
assert(shell.includes('node.closest("input,textarea,select,[contenteditable=\'true\'],[contenteditable=\'\'],canvas,dialog[open] *")'),"fields, the 3D view and dialogs keep their right click");
assert(shell.includes(".ir-object-nav button[data-key]:not(:disabled)")&&shell.includes(".object-card[data-object]")&&shell.includes("button.section-link[data-section]:not(:disabled)"),"menu items, object cards and sections lead to their pages");
assert(shell.includes("if(openWindow(selected.route))"),"the detach button shares the window opening");
assert(css.includes(".tabs-ctx{")&&html.includes("tabs-shell.js?v=1106900")&&html.includes("tabs-shell.css?v=1106900"),"styles and fresh copies");
// The route label is gone, in the sources and in the bundles.
const ri=read("src/route-indicator.js");
assert(!ri.includes("createElement")&&ri.includes('getElementById("routeIndicator")?.remove()'),"no route label");
assert(read("src/route-indicator.css").includes(".route-indicator{display:none!important}"));
assert(read("src/ir-runtime.js").includes(ri.trim())&&read("src/ir-styles.css").includes(".route-indicator{display:none!important}"),"bundles rebuilt");
console.log("Tabs: back along the pages, right-click menus, no route label PASS")
