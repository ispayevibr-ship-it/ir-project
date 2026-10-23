"use strict";
(()=>{
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const icon=(body)=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons={
 check:icon('<path d="m5 12 4 4L19 6"/>'),
 calendar:icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),
 pin:icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),
 plus:icon('<path d="M12 5v14M5 12h14"/>'),
 edit:icon('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
 dots:icon('<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>')
};
const route=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
const formatDate=v=>{if(!v)return"";const s=String(v).slice(0,10),p=s.split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:s};
function scheduleDates(rows){
 const starts=["start_date","date_start","planned_start","startDate","begin_date","start"],ends=["end_date","date_end","planned_end","endDate","finish_date","end"];
 let start="",end="";
 for(const row of Array.isArray(rows)?rows:[]){const d=row?.data||row||{};for(const k of starts)if(!start&&d[k])start=d[k];for(const k of ends)if(!end&&d[k])end=d[k];if(start&&end)break}
 return{start:formatDate(start),end:formatDate(end)};
}
async function build(id){
 if(route()!==String(id))return false;
 const app=document.getElementById("app"),head=app?.querySelector(":scope > .object-page-head");
 if(!app||!head)return false;
 if(app.querySelector(":scope > .object-overview-hero[data-object-id='"+id+"']"))return true;
 let object;try{object=await irProject.data.objects.get(id)}catch{return false}if(!object||route()!==String(id))return false;
 let dates={start:"",end:""};try{dates=scheduleDates(await irProject.data.forObject(id).section("schedule").list())}catch{}
 const banner=app.querySelector(":scope > .object-page-banner");
 const hero=document.createElement("section");hero.className="object-overview-hero";hero.dataset.objectId=id;
 if(banner){banner.classList.add("object-overview-hero-bg");hero.appendChild(banner)}
 const status=object.status||"В работе",active=status!=="Завершен";
 const period=dates.start&&dates.end?`${dates.start} — ${dates.end}`:dates.start?`с ${dates.start}`:dates.end?`до ${dates.end}`:"Срок не задан";
 hero.insertAdjacentHTML("beforeend",`<div class="object-hero-shade"></div><div class="object-hero-content"><div class="object-hero-top"><div class="object-hero-copy"><div class="object-hero-breadcrumbs"><button type="button" data-hero-objects>Объекты</button><span>›</span><span>${esc(object.name)}</span></div><h1>${esc(object.name)}</h1><div class="object-hero-contract"><span><b>Заказчик:</b> ${esc(object.customer||"—")}</span><span><b>Генподрядчик:</b> ${esc(object.general_contractor||"—")}</span></div></div><div class="object-hero-actions"><button type="button" class="object-hero-action primary" data-hero-report>${icons.plus}<span>Добавить отчёт</span></button><button type="button" class="object-hero-action" data-hero-edit>${icons.edit}<span>Редактировать</span></button><button type="button" class="object-hero-action icon-only" data-hero-more aria-label="Дополнительные действия">${icons.dots}</button><div class="object-hero-menu" data-hero-menu hidden><button type="button" data-hero-menu-edit>Редактировать объект</button><button type="button" data-hero-menu-objects>Все объекты</button></div></div></div><div class="object-hero-info"><div class="object-hero-status ${active?"active":"done"}">${icons.check}<span>${esc(status)}</span></div><div class="object-hero-info-item">${icons.calendar}<div><b>${esc(period)}</b><span>Срок строительства</span></div></div><div class="object-hero-info-item location">${icons.pin}<div><b>${esc(object.address||"Адрес не указан")}</b><span>Расположение объекта</span></div></div></div></div>`);
 head.remove();app.insertBefore(hero,app.firstChild);
 const goObjects=()=>location.hash="/objects";
 hero.querySelector("[data-hero-objects]").onclick=goObjects;
 hero.querySelector("[data-hero-report]").onclick=()=>location.hash=`/objects/object/${id}/reports/new`;
 const edit=()=>{if(typeof window.openObjectForm==="function")window.openObjectForm(id)};
 hero.querySelector("[data-hero-edit]").onclick=edit;
 hero.querySelector("[data-hero-menu-edit]").onclick=edit;
 hero.querySelector("[data-hero-menu-objects]").onclick=goObjects;
 const more=hero.querySelector("[data-hero-more]"),menu=hero.querySelector("[data-hero-menu]");more.onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden};
 document.addEventListener("click",e=>{if(!hero.contains(e.target))menu.hidden=true},{once:true});
 return true;
}
function schedule(){const id=route();if(!id)return;let tries=0;const tick=async()=>{if(route()!==id)return;if(await build(id))return;if(++tries<20)setTimeout(tick,75)};setTimeout(tick,0)}
window.addEventListener("hashchange",schedule);schedule();
})();