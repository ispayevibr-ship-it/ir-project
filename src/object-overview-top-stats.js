"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:r.id,...(r.data||r)});
 function markTotal(x){const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)}
 function reportVolume(w){const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)}
 function meta(workTypes,marks){return new Map(arr(workTypes).map(r=>{const d=r.data||{},id=String(r.id),service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),hasMarks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===id))));return[id,{id,service,hasMarks,planned:num(d.planned_volume??d.plan_volume)}]}))}
 function completion(workTypes,marks,reports){
  const wt=meta(workTypes,marks),plans=new Map(),facts=new Map(),serviceDone=new Set();
  for(const [id,w] of wt)if(!w.service&&!w.hasMarks&&w.planned>0)plans.set(id,w.planned);
  for(const r of arr(marks)){const d=r.data||{},id=String(d.work_type_id||"");if(id&&!wt.get(id)?.service)plans.set(id,(plans.get(id)||0)+markTotal(r))}
  for(const raw of arr(reports)){const d=record(raw);for(const w of arr(d.items||d.works)){const id=String(w.work_type_id||"");if(!id)continue;const m=wt.get(id),service=m?.service||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга";if(service){const done=w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));if(done)serviceDone.add(id);continue}const v=reportVolume(w);if(v>0)facts.set(id,(facts.get(id)||0)+v)}}
  const percentages=[];
  for(const [id,w] of wt){if(w.service){percentages.push(serviceDone.has(id)?100:0);continue}const plan=plans.get(id)||0;if(plan>0)percentages.push(clamp((facts.get(id)||0)/plan*100,0,100))}
  return percentages.length?Math.round(percentages.reduce((s,x)=>s+x,0)/percentages.length):0;
 }
 function averages(reports){
  const all=arr(reports).map(record),n=all.length;
  if(!n)return{people:0,workers:0,responsible:0,equipment:0,days:0};
  let workers=0,responsible=0,equipment=0;
  for(const d of all){
   workers+=arr(d.workers||d.people).reduce((s,x)=>s+num(x.count),0);
   responsible+=arr(d.responsible).filter(x=>String(x?.name||x?.role||"").trim()).length;
   equipment+=arr(d.equipment).reduce((s,x)=>s+num(x.count),0);
  }
  const avg=v=>Math.ceil(v/n);
  return{people:avg(workers+responsible),workers:avg(workers),responsible:avg(responsible),equipment:avg(equipment),days:n};
 }
 const ring=pct=>`<div class="oos-ring" style="--p:${clamp(pct,0,100)}"><div><b>${pct}%</b><span>выполнено</span></div></div>`;
 const peopleIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2.2A4.8 4.8 0 0 1 7.8 13h.4a4.8 4.8 0 0 1 4.8 4.8V20M14 14.5c.7-.7 1.7-1.1 2.8-1.1h.3A3.9 3.9 0 0 1 21 17.3V20"/></svg>';
 const equipmentIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h15M5 18v-5h6v5M11 13V8l7-5 1.5 2-6.5 5v3M18 5h2v9M20 14v2"/><circle cx="6" cy="20" r="1.5"/><circle cx="14" cy="20" r="1.5"/><circle cx="20" cy="18" r="1.5"/></svg>';
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),dashboard=app?.querySelector(".object-overview-dashboard");if(!app||!dashboard)return false;
  app.querySelector(".object-overview-top-stats")?.remove();
  const root=irProject.data.forObject(oid),[workTypes,marks,reports]=await Promise.all([root.section("work-types").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("reports").list().catch(()=>[])]);
  if(objectId()!==String(oid))return true;
  const pct=completion(workTypes,marks,reports),avg=averages(reports),wrap=document.createElement("div");wrap.className="object-overview-top-stats";
  wrap.innerHTML=`<section class="oos-card oos-progress"><div class="oos-copy"><span>Общий показатель</span><b>Выполнение по всем работам</b><small>Средняя готовность по видам работ</small></div>${ring(pct)}</section><section class="oos-card"><div class="oos-icon people">${peopleIcon}</div><div class="oos-copy"><span>Среднее количество людей</span><b class="oos-value">${avg.people} чел.</b><small>Работники: ${avg.workers} · Ответственные: ${avg.responsible}</small></div></section><section class="oos-card"><div class="oos-icon equipment">${equipmentIcon}</div><div class="oos-copy"><span>Среднее количество техники</span><b class="oos-value">${avg.equipment} ед.</b><small>Среднее по ${avg.days} ${avg.days===1?"отчёту":"отчётам"}</small></div></section>`;
  dashboard.insertAdjacentElement("beforebegin",wrap);
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview top stats",e)}if(++tries<30)setTimeout(run,120)};setTimeout(run,20)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();