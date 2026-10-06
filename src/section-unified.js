"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const names={deliveries:"Поставки",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 const previous=typeof sectionPage==="function"?sectionPage:null;
 sectionPage=async(id,key)=>{
  if(key==="schedule"&&previous)return previous(id,key);
  const deliveryMatch=String(key||"").match(/^deliveries(?:\?(.*))?$/);
  if(deliveryMatch&&typeof window.irDeliveriesPage==="function"){
   const params=new URLSearchParams(deliveryMatch[1]||"");
   return window.irDeliveriesPage(id,{deliveryId:params.get("id")||"",page:Number(params.get("page")||1)});
  }
  const o=await irProject.data.objects.get(id);if(!o){location.hash="/objects";return}
  const sections=await irProject.data.sections.get(id).catch(()=>[]),section=sections.find(x=>x.section_key===key);if(section&&!section.enabled){location.hash=`/objects/object/${id}`;return}
  document.body.classList.remove("ir-object-overview");
  const title=section?.title||names[key]||key,api=irProject.data.forObject(id).section(key),rows=await api.list().catch(()=>[]),app=document.getElementById("app");
  const rowHtml=rows.map((r,i)=>{const d=r.data||{},main=r.title||d.title||d.name||d.number||`${title} #${i+1}`,sub=d.date||d.report_date||d.delivery_date||d.invoice_date||r.created_at||"";return `<div class="section-unified-row"><b>${esc(main)}</b><span>${esc(sub)}</span></div>`}).join("");
  app.innerHTML=`<div class="section-unified-page"><div class="section-unified-head"><button class="back" id="unifiedBack">← Назад</button><div><h1>${esc(title)}</h1><p>${esc(o.name||"")}</p></div></div><div class="section-unified-card">${rows.length?`<div class="section-unified-list">${rowHtml}</div>`:`<div class="section-unified-empty" data-empty="Раздел ${esc(title)} пуст"></div>`}</div></div>`;
  document.getElementById("unifiedBack").onclick=()=>location.hash=`/objects/object/${id}`;
 };
})();
