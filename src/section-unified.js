"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const names={deliveries:"Поставки",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 const previous=typeof sectionPage==="function"?sectionPage:null;
 sectionPage=async(id,key)=>{
  if(key==="schedule"&&previous)return previous(id,key);
  if(key==="photos"&&typeof window.irPhotosPage==="function")return window.irPhotosPage(id);
  if(key==="acted-days"&&typeof window.irActedDaysPageV2==="function")return window.irActedDaysPageV2(id);
  if(key==="acted-days"&&typeof window.irActedDaysPage==="function")return window.irActedDaysPage(id);
  if(key==="penalties"&&typeof window.irPenaltiesPage==="function")return window.irPenaltiesPage(id);
  const deliveryMatch=String(key||"").match(/^deliveries(?:\?(.*))?$/);
  if(deliveryMatch&&typeof window.irDeliveriesPage==="function"){
   const params=new URLSearchParams(deliveryMatch[1]||"");
   return window.irDeliveriesPage(id,{deliveryId:params.get("id")||"",page:Number(params.get("page")||1),mode:params.get("mode")||""});
  }
  const o=await irProject.data.objects.get(id);if(!o){location.hash="/objects";return}
  const sections=await irProject.data.sections.get(id).catch(()=>[]),section=sections.find(x=>x.section_key===key);if(section&&!section.enabled){location.hash=`/objects/object/${id}`;return}
  document.body.classList.remove("ir-object-overview");
  const title=section?.title||names[key]||key,api=irProject.data.forObject(id).section(key),rows=await api.list().catch(()=>[]),app=document.getElementById("app");
  const rowHtml=rows.map((r,i)=>{const d=r.data||{},main=r.title||d.title||d.name||d.number||`${title} #${i+1}`,sub=d.date||d.report_date||d.delivery_date||d.invoice_date||r.created_at||"";return `<div class="section-unified-row"><b>${esc(main)}</b><span>${esc(sub)}</span></div>`}).join("");
  app.innerHTML=`<div class="section-unified-page"><div class="section-unified-head"><button class="back" id="unifiedBack">← Назад</button><div><h1>${esc(title)}</h1><p>${esc(o.name||"")}</p></div></div><div class="section-unified-card">${rows.length?`<div class="section-unified-list">${rowHtml}</div>`:`<div class="section-unified-empty" data-empty="Раздел ${esc(title)} пуст"></div>`}</div></div>`;
  document.getElementById("unifiedBack").onclick=()=>location.hash=`/objects/object/${id}`;
 };
 const enhanceWorkTypes=()=>{const page=document.querySelector(".wt-page"),list=page?.querySelector(".wt-list");if(!page||!list)return;let tabs=page.querySelector(".wt-switch");if(tabs){tabs.style.display="inline-flex";return}const rows=[...list.querySelectorAll(".wt-row[data-id]")],other=rows.filter(r=>r.classList.contains("wt-other-row")||r.classList.contains("wt-service-row")),main=rows.filter(r=>!other.includes(r)),active=page.dataset.wtGroup==="other"?"other":"main";tabs=document.createElement("div");tabs.className="wt-switch wt-switch-fallback";tabs.setAttribute("role","tablist");tabs.innerHTML=`<button type="button" data-wt-fallback="main" class="${active==="main"?"on":""}">Монтаж / изготовление <span>${main.length}</span></button><button type="button" data-wt-fallback="other" class="${active==="other"?"on":""}">Другие виды работ <span>${other.length}</span></button>`;list.insertAdjacentElement("beforebegin",tabs);const apply=group=>{page.dataset.wtGroup=group;tabs.querySelectorAll("[data-wt-fallback]").forEach(b=>b.classList.toggle("on",b.dataset.wtFallback===group));for(const r of main)r.hidden=group!=="main";for(const r of other)r.hidden=group!=="other"};tabs.querySelectorAll("[data-wt-fallback]").forEach(b=>b.onclick=()=>apply(b.dataset.wtFallback));apply(active)};
 const observer=new MutationObserver(()=>queueMicrotask(enhanceWorkTypes));observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(enhanceWorkTypes,0));setTimeout(enhanceWorkTypes,0);
})();
