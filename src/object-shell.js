"use strict";
(()=>{
const root=document.getElementById("app");if(!root)return;
const names={reports:"Ежедневные отчёты","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
const iconPaths={
overview:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
reports:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6M9 19h4"/>',
"work-types":'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
marks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
deliveries:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3"/>',
photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
scheme:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/>',
"acted-days":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2.5 2.5L16 12"/>',
penalties:'<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
finance:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M16 14h2"/>'};
const svg=(key,cls="")=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]||'<circle cx="12" cy="12" r="7"/>'}</svg>`;
const simpleSvg=(kind,cls="")=>kind==="back"?`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`:`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;
let sidebar=null,currentObjectId="",navSerial=0;
const routeInfo=()=>{const r=location.hash.slice(1)||"/objects";const m=r.match(/^\/objects\/object\/(\d+)(?:\/([^/]+))?/);return m?{id:m[1],key:m[2]||"overview"}:null};
function cleanupLegacyShell(){const shell=root.querySelector(":scope > .ir-object-shell");if(!shell)return;const main=shell.querySelector(":scope > .ir-object-main");const nodes=main?[...main.childNodes]:[];root.replaceChildren(...nodes)}
function makeButton(label,key,disabled,onClick){const b=document.createElement("button");b.type="button";b.dataset.key=key;b.disabled=!!disabled;const i=document.createElement("span");i.className="nav-icon";i.innerHTML=svg(key);const t=document.createElement("span");t.className="nav-label";t.textContent=label;b.append(i,t);if(!disabled)b.onclick=onClick;return b}
function ensureSidebar(){if(sidebar&&document.body.contains(sidebar))return sidebar;sidebar=document.createElement("aside");sidebar.className="ir-object-sidebar-fixed";sidebar.innerHTML=`<div class="ir-object-brand"><span>IR Project</span></div><button class="ir-object-all" type="button"><span class="menu-icon">${simpleSvg("back")}</span><b>Все объекты</b></button><nav class="ir-object-nav"></nav><button class="ir-object-top" type="button"><span class="menu-icon round">${simpleSvg("up")}</span><b>Наверх</b></button>`;sidebar.querySelector(".ir-object-all").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-top").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});document.body.appendChild(sidebar);paintBrand();return sidebar}
async function paintBrand(){const aside=sidebar;if(!aside)return;const host=aside.querySelector(".ir-object-brand");if(!host)return;try{const p=await irProject.company.get()||{};if(aside!==sidebar)return;if(p.logo){const u=await irProject.images.read(p.logo);if(u){const im=document.createElement("img");im.src=u;im.alt=p.name||"Логотип компании";host.replaceChildren(im);return}}const s=document.createElement("span");s.textContent=p.name||"IR Project";host.replaceChildren(s)}catch{if(aside!==sidebar)return;const s=document.createElement("span");s.textContent="IR Project";host.replaceChildren(s)}}
function setActive(key){if(!sidebar)return;sidebar.querySelectorAll(".ir-object-nav button").forEach(b=>b.classList.toggle("active",b.dataset.key===key))}
async function buildNav(info){const aside=ensureSidebar(),nav=aside.querySelector(".ir-object-nav"),token=++navSerial;nav.replaceChildren();nav.append(makeButton("Обзор","overview",false,()=>location.hash=`/objects/object/${info.id}`));let sections=[];try{sections=await irProject.data.sections.get(info.id)||[]}catch{}if(token!==navSerial||aside!==sidebar||currentObjectId!==info.id)return;for(const s of sections){const key=s.section_key,label=names[key]||s.title||key;nav.append(makeButton(label,key,!s.enabled,()=>location.hash=`/objects/object/${info.id}/${encodeURIComponent(key)}`))}setActive(info.key)}
function routeClasses(info){document.body.classList.toggle("ir-object-route",!!info);document.body.classList.toggle("ir-object-overview",!!info&&info.key==="overview")}
function leaveObject(){routeClasses(null);currentObjectId="";navSerial++;if(sidebar){sidebar.remove();sidebar=null}}
function apply(){cleanupLegacyShell();const info=routeInfo();if(!info){leaveObject();return}routeClasses(info);ensureSidebar();if(currentObjectId!==info.id){currentObjectId=info.id;buildNav(info)}else setActive(info.key)}
window.addEventListener("hashchange",apply);apply();
})();
