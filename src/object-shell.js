"use strict";
(()=>{
const root=document.getElementById("app");if(!root)return;
const names={reports:"Ежедневные отчёты","extra-works":"Доп. работы","work-types":"Виды работ",marks:"Ведомость марок",fasteners:"Ведомость метизов","executive-docs":"Испол-я докум-я",letters:"Исходящие письма",trash:"Корзина",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","ai-recognition":"ИИ-распознавание","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
const iconPaths={
overview:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
reports:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6M9 19h4"/>',
"extra-works":'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h4m-4 4h8m-5-4 1.5 1.5L17 9"/>',
"work-types":'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
marks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
fasteners:'<path d="M9 3h6v4H9z"/><path d="M12 7v14"/><path d="M9 10h6M9 13h6M9 16h6"/>',
"executive-docs":'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3M9 11l2 2 4-4M9 17h6"/>',
letters:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
deliveries:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3"/>',
photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
scheme:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/>',
"ai-recognition":'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 9h6v6H9zM12 1v2m0 18v2M1 12h2m18 0h2M6 6l2 2m8 8 2 2"/>',
"acted-days":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2.5 2.5L16 12"/>',
penalties:'<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
finance:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M16 14h2"/>'};
const svg=(key,cls="")=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]||'<circle cx="12" cy="12" r="7"/>'}</svg>`;
const simpleSvg=(kind,cls="")=>kind==="back"?`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`:`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;
let sidebar=null,currentObjectId="",navSerial=0;
const routeInfo=()=>{const r=(location.hash.slice(1)||"/objects").split(/[?#]/)[0];const m=r.match(/^\/objects\/object\/(\d+)(?:\/([^/]+))?/);return m?{id:m[1],key:m[2]||"overview"}:null};
function cleanupLegacyShell(){const shell=root.querySelector(":scope > .ir-object-shell");if(!shell)return;const main=shell.querySelector(":scope > .ir-object-main");const nodes=main?[...main.childNodes]:[];root.replaceChildren(...nodes)}
const fullNames={"executive-docs":"Исполнительная документация"};
function makeButton(label,key,disabled,onClick){const b=document.createElement("button");b.type="button";b.dataset.key=key;if(fullNames[key])b.title=fullNames[key];b.disabled=!!disabled;const i=document.createElement("span");i.className="nav-icon";i.innerHTML=svg(key);const t=document.createElement("span");t.className="nav-label";t.textContent=label;b.append(i,t);if(!disabled)b.onclick=onClick;return b}
function ensureSidebar(){if(sidebar&&document.body.contains(sidebar))return sidebar;sidebar=document.createElement("aside");sidebar.className="ir-object-sidebar-fixed";sidebar.innerHTML=`<button class="ir-object-brand" type="button" title="На главную страницу" aria-label="На главную страницу"><span>IR Project</span></button><button class="ir-object-all" type="button"><span class="menu-icon">${simpleSvg("back")}</span><b>Все объекты</b></button><nav class="ir-object-nav"></nav><button class="ir-object-top" type="button"><span class="menu-icon round">${simpleSvg("up")}</span><b>Наверх</b></button>`;sidebar.querySelector(".ir-object-brand").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-all").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-top").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});if(window.ResizeObserver)new ResizeObserver(()=>fitTopnav()).observe(sidebar);document.body.appendChild(sidebar);paintBrand();return sidebar}
async function paintBrand(){const aside=sidebar;if(!aside)return;const host=aside.querySelector(".ir-object-brand");if(!host)return;try{const p=await irProject.company.get()||{};if(aside!==sidebar)return;if(p.logo){const u=await irProject.images.read(p.logo);if(u){const im=document.createElement("img");im.src=u;im.alt=p.name||"Логотип компании";host.replaceChildren(im);return}}const s=document.createElement("span");s.textContent=p.name||"IR Project";host.replaceChildren(s)}catch{if(aside!==sidebar)return;const s=document.createElement("span");s.textContent="IR Project";host.replaceChildren(s)}}
function setActive(key){if(!sidebar)return;const nav=sidebar.querySelector(".ir-object-nav");if(key==="ai-recognition"&&nav&&!nav.querySelector('button[data-key="ai-recognition"]'))key="scheme";sidebar.querySelectorAll(".ir-object-nav button").forEach(b=>b.classList.toggle("active",b.dataset.key===key));
fitTopnav()}
// The menu a strip on top (the scheme): the sections that do not fit go into the list «Ещё ▾» at its end, the chosen one
// always in the strip (the engineer, 06.11.2026: «сделай выпадющее меню если не вмещается»).
let moreMenu=null;
function closeMore(){if(moreMenu){moreMenu.remove();moreMenu=null}const b=sidebar&&sidebar.querySelector(".ir-object-more");if(b)b.setAttribute("aria-expanded","false")}
function fitTopnav(){
 if(!sidebar)return;const nav=sidebar.querySelector(".ir-object-nav");if(!nav)return;
 const items=[...nav.querySelectorAll(":scope>button[data-key]")];items.forEach(b=>b.hidden=false);
 let more=nav.querySelector(":scope>.ir-object-more");
 if(!document.body.classList.contains("ir-object-topnav")){if(more)more.remove();closeMore();return}
 if(!more){more=document.createElement("button");more.type="button";more.className="ir-object-more";more.setAttribute("aria-haspopup","menu");more.setAttribute("aria-expanded","false");more.innerHTML='<span class="nav-label">Ещё</span><b aria-hidden="true">▾</b>';more.onclick=e=>{e.stopPropagation();if(moreMenu){closeMore();return}openMore(more)}}
 nav.append(more);more.hidden=true;
 if(nav.scrollWidth<=nav.clientWidth+1){closeMore();return}
 more.hidden=false;
 for(let i=items.length-1;i>=0&&nav.scrollWidth>nav.clientWidth+1;i--)if(!items[i].classList.contains("active"))items[i].hidden=true;
 if(moreMenu)openMore(more)
}
function openMore(more){
 closeMore();const hidden=[...sidebar.querySelectorAll(".ir-object-nav>button[data-key][hidden]")];if(!hidden.length)return;
 moreMenu=document.createElement("div");moreMenu.className="ir-object-more-menu";moreMenu.setAttribute("role","menu");
 hidden.forEach(b=>{const c=b.cloneNode(true);c.hidden=false;c.setAttribute("role","menuitem");c.onclick=()=>{closeMore();b.click()};moreMenu.append(c)});
 const r=more.getBoundingClientRect();moreMenu.style.top=Math.round(r.bottom+4)+"px";moreMenu.style.right=Math.max(6,Math.round(innerWidth-r.right))+"px";
 document.body.append(moreMenu);more.setAttribute("aria-expanded","true")
}
document.addEventListener("pointerdown",e=>{if(moreMenu&&!moreMenu.contains(e.target)&&!(e.target.closest&&e.target.closest(".ir-object-more")))closeMore()},true);
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&moreMenu)closeMore()});
async function buildNav(info){const aside=ensureSidebar(),nav=aside.querySelector(".ir-object-nav"),token=++navSerial;nav.replaceChildren();nav.append(makeButton("Обзор объекта","overview",false,()=>location.hash=`/objects/object/${info.id}`));let sections=[],schemeVisible=false;try{sections=await irProject.data.sections.get(info.id)||[]}catch{}try{const wt=await irProject.data.forObject(info.id).section("work-types").list();schemeVisible=Array.isArray(wt)&&wt.some(r=>r?.data?.scheme_enabled===true)}catch{}let archived=false;try{archived=!!(await window.irArchive?.isArchive(info.id))}catch{}if(token!==navSerial||aside!==sidebar||currentObjectId!==info.id)return;if(archived){nav.querySelector('button[data-key="overview"] .nav-label').textContent="Карточка объекта";setActive(info.key);return}// «ИИ-распознавание» opens from the montage scheme it fills (the engineer, 27.10.2026); in the menu only while the scheme is not.
const schemeShown=schemeVisible&&sections.some(s=>s.section_key==="scheme");for(const s of sections){const key=s.section_key;if(key==="scheme"&&!schemeVisible||key==="ai-recognition")continue;const label=names[key]||s.title||key;nav.append(makeButton(label,key,!s.enabled,()=>location.hash=`/objects/object/${info.id}/${encodeURIComponent(key)}`));if(key==="reports")nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`));if(key==="marks")nav.append(makeButton("Ведомость метизов","fasteners",!s.enabled,()=>location.hash=`/objects/object/${info.id}/fasteners`));if(key==="marks"){nav.append(makeButton(names["executive-docs"],"executive-docs",false,()=>location.hash=`/objects/object/${info.id}/executive-docs`));nav.append(makeButton(names.letters,"letters",false,()=>location.hash=`/objects/object/${info.id}/letters`));}if(key==="marks"&&!schemeShown)nav.append(makeButton("ИИ-распознавание","ai-recognition",false,()=>location.hash=`/objects/object/${info.id}/ai-recognition`))}if(!schemeShown&&!sections.some(s=>s.section_key==="marks"))nav.append(makeButton("ИИ-распознавание","ai-recognition",false,()=>location.hash=`/objects/object/${info.id}/ai-recognition`));if(!sections.some(s=>s.section_key==="marks")){nav.append(makeButton(names["executive-docs"],"executive-docs",false,()=>location.hash=`/objects/object/${info.id}/executive-docs`));nav.append(makeButton(names.letters,"letters",false,()=>location.hash=`/objects/object/${info.id}/letters`));}if(!sections.some(s=>s.section_key==="reports"))nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`));// Корзина объекта: удалённое за 7 дней (src/trash-page.js).
nav.append(makeButton(names.trash,"trash",false,()=>location.hash=`/objects/object/${info.id}/trash`));setActive(info.key)}
// (the montage scheme and its «ИИ-распознавание»: the menu a strip on top, the scheme over the whole width — the engineer,
// 06.11.2026 «левое меню сделаем сверху, чтобы была сама схема на всю страницу»; object-shell.css; ранее завершённый объект — тоже полосой сверху, 12.11.2026: «убери левое меню и баннер, сделай вверху меню как в монтажной схеме»)
function routeClasses(info){document.body.classList.toggle("ir-object-route",!!info);document.body.classList.toggle("ir-object-overview",!!info&&info.key==="overview");document.body.classList.toggle("ir-object-topnav",!!info&&(info.key==="scheme"||info.key==="ai-recognition"||info.key==="overview"&&window.irArchive?.known?.get(String(info.id))===true))}
function leaveObject(){closeMore();routeClasses(null);currentObjectId="";navSerial++;if(sidebar){sidebar.remove();sidebar=null}}
// Leaving the object: the menu stays until the next page has put its content in (it was taken away at once, and the
// object page stood there without it while the list of objects loaded — the engineer 02.11.2026).
let leaving=null;
function stopLeaving(){if(leaving){leaving.observer.disconnect();clearTimeout(leaving.timer);leaving=null}}
function leaveWhenReady(){if(!sidebar){leaveObject();return}if(leaving)return;const done=()=>{stopLeaving();if(!routeInfo())leaveObject()};const observer=new MutationObserver(()=>{if(root.querySelector(".home-shell"))done()});observer.observe(root,{childList:true,subtree:true});leaving={observer,timer:setTimeout(done,4000)}}
function apply(){cleanupLegacyShell();const info=routeInfo();if(!info){leaveWhenReady();return}stopLeaving();routeClasses(info);ensureSidebar();if(currentObjectId!==info.id){currentObjectId=info.id;buildNav(info)}else setActive(info.key)}
window.addEventListener("ir-company-profile-updated",()=>{if(sidebar)paintBrand()});window.addEventListener("hashchange",apply);window.addEventListener("ir-work-types-changed",e=>{const id=String(e?.detail?.objectId||"");if(id&&id===currentObjectId){const info=routeInfo();if(info)buildNav(info)}});apply();
})();
