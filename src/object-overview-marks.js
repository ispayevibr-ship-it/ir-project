"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:String(r.id),title:r.title||"",...(r.data||r)});
 const markTotal=x=>{const raw=x?.total_value??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x?.qty??x?.count)*num(x?.unit_volume??x?.volume_one)};
 const state=(x,mounted)=>{const total=num(x.qty??x.count);if(total>0&&mounted>=total-1e-9)return"done";if(mounted>0)return"partial";return"left"};
 const mountedMap=reports=>{const map=new Map();for(const raw of arr(reports)){const d=raw.data||raw;for(const w of arr(d.items||d.works)){const id=String(w.mark_id||"");if(!id)continue;map.set(id,(map.get(id)||0)+num(w.qty??w.count??w.quantity))}}return map};
 function blockHtml(marks,workTypes,reports){
  const workMap=new Map(arr(workTypes).map(r=>{const d=r.data||{};return[String(r.id),{name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||""}]})),mm=mountedMap(reports);
  const rows=arr(marks).map(record).filter(x=>x.accounting_type!=="service").map(x=>{const total=num(x.qty??x.count),mounted=Math.min(total,mm.has(x.id)?num(mm.get(x.id)):num(x.mounted??x.done)),st=state(x,mounted),work=workMap.get(String(x.work_type_id||""))||{name:x.work_type||"Без вида работ",code:x.project_code||"",unit:x.unit||""},pct=total?Math.min(100,mounted/total*100):0;return{...x,total,mounted,st,work,pct,totalVolume:markTotal(x)}}).filter(x=>x.total>0);
  const totalPos=rows.length,donePos=rows.filter(x=>x.st==="done").length,partialPos=rows.filter(x=>x.st==="partial").length,leftPos=rows.filter(x=>x.st!=="done").length,totalQty=rows.reduce((s,x)=>s+x.total,0),mountedQty=rows.reduce((s,x)=>s+x.mounted,0),ready=totalQty?Math.min(100,mountedQty/totalQty*100):0;
  const priority={partial:0,left:1,done:2},shown=[...rows].sort((a,b)=>priority[a.st]-priority[b.st]||String(a.work.name).localeCompare(String(b.work.name),"ru")||String(a.mark||a.title).localeCompare(String(b.mark||b.title),"ru",{numeric:true})).slice(0,6);
  const list=shown.length?shown.map(x=>`<div class="oom-row">
   <div class="oom-mark"><b>${esc(x.mark||x.title||"—")}</b><span>${esc(x.name||"")}</span></div>
   <div class="oom-work"><b>${esc(x.work.name)}</b><span>${esc(x.work.code||"Без шифра")}</span></div>
   <div class="oom-volume"><b>${fmt(x.mounted)} / ${fmt(x.total)}</b><span>${esc(x.unit||x.work.unit||"шт")}</span></div>
   <div class="oom-progress"><div><i style="width:${x.pct.toFixed(2)}%"></i></div><b>${Math.round(x.pct)}%</b></div>
   <span class="oom-status ${x.st}">${x.st==="done"?"Смонтировано":x.st==="partial"?"Частично":"Не начато"}</span>
  </div>`).join(""):'<div class="oom-empty">Ведомость марок пока пустая</div>';
  return`<section class="object-overview-marks-card">
   <div class="oom-head"><div><h2>Ведомость / марки</h2><p>Компактный контроль монтажа по маркам</p></div><button type="button" data-oom-all>Открыть ведомость</button></div>
   <div class="oom-stats">
    <div><span>Позиций</span><b>${totalPos}</b></div>
    <div><span>Смонтировано</span><b>${donePos}</b></div>
    <div><span>В работе</span><b>${partialPos}</b></div>
    <div><span>Осталось</span><b>${leftPos}</b></div>
    <div class="oom-ready"><span>Готовность марок</span><b>${Math.round(ready)}%</b><i><em style="width:${ready.toFixed(2)}%"></em></i></div>
   </div>
   <div class="oom-list-head"><span>Марка</span><span>Вид работы</span><span>Монтаж</span><span>Прогресс</span><span>Статус</span></div>
   <div class="oom-list">${list}</div>
   ${rows.length>shown.length?`<div class="oom-footer"><span>Показано ${shown.length} из ${rows.length} позиций</span><button type="button" data-oom-all>Показать все</button></div>`:""}
  </section>`;
 }
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),reportsAnchor=app?.querySelector(".object-overview-reports"),dashboard=app?.querySelector(".object-overview-dashboard");
  if(!app||!dashboard)return false;
  app.querySelector(".object-overview-marks-wrap")?.remove();
  const root=irProject.data.forObject(oid),[sections,marks,workTypes,reports]=await Promise.all([
   irProject.data.sections.get(oid).catch(()=>[]),
   root.section("marks").list().catch(()=>[]),
   root.section("work-types").list().catch(()=>[]),
   root.section("reports").list().catch(()=>[])
  ]);
  if(objectId()!==String(oid))return true;
  const marksSection=arr(sections).find(s=>s.section_key==="marks");if(marksSection&&marksSection.enabled===false)return true;
  const wrap=document.createElement("div");wrap.className="object-overview-marks-wrap";wrap.innerHTML=blockHtml(marks,workTypes,reports);
  const anchor=reportsAnchor||app.querySelector(".object-overview-reports")||dashboard;
  if(anchor.classList.contains("object-overview-reports"))anchor.insertAdjacentElement("beforebegin",wrap);else anchor.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("[data-oom-all]").forEach(b=>b.onclick=()=>location.hash=`/objects/object/${oid}/marks`);
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done&&document.querySelector(".object-overview-reports"))return}catch(e){console.error("object overview marks",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,80)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();