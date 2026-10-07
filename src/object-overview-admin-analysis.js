"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const hours=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=v=>String(Math.round(num(v)*100)/100).replace(".",",")+" ч";
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:r.id,...(r.data||r)});
 const actedLabels={
  wind:"Ветер",
  power:"Отключение электроэнергии",
  readiness:"Отсутствие стройготовности",
  low_temp:"Низкая температура",
  high_temp:"Повышенная температура",
  precipitation:"Сильные осадки",
  other:"Другая причина"
 };
 const palette=["#2f91cc","#d76969","#d8a13b","#6f72c9","#43a67a","#8e6db0","#7f929f","#c57b3f"];
 const donutStyle=items=>{
  const total=items.reduce((s,x)=>s+x.value,0);
  if(total<=0)return"background:conic-gradient(#e8edf1 0 100%)";
  let at=0;const parts=items.map((x,i)=>{const start=at,end=at+(x.value/total*100);at=end;return`${palette[i%palette.length]} ${start.toFixed(3)}% ${end.toFixed(3)}%`});
  return`background:conic-gradient(${parts.join(",")})`;
 };
 const actedCard=rows=>{
  const all=rows.map(record),days=new Set(all.map(x=>String(x.date||"").slice(0,10)).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+hours(x.time_from,x.time_to),0),map=new Map();
  for(const r of all){const key=String(r.reason||"other"),label=key==="other"?(String(r.reason_other||"").trim()||actedLabels.other):(actedLabels[key]||key||"Другая причина");if(!map.has(label))map.set(label,{label,count:0,hours:0});const x=map.get(label);x.count++;x.hours+=hours(r.time_from,r.time_to)}
  const items=[...map.values()].sort((a,b)=>b.count-a.count).map(x=>({...x,value:x.count}));
  const total=all.length||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"случай":"случ."} · ${fmtHours(x.hours)}</span></div><strong>${Math.round(x.count/total*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Актированных дней пока нет</div>';
  return`<section class="ooa-card ooa-acted"><div class="ooa-head"><div><h2>Актированные дни</h2><p>Анализ причин остановки работ</p></div><button type="button" data-ooa-open="acted-days">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${days}</b><span>дней</span></div></div><div class="ooa-mini-stats"><span>Записей <b>${all.length}</b></span><span>Время <b>${fmtHours(totalHours)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 const penaltyCard=rows=>{
  const all=rows.map(record),totalAmount=all.reduce((s,x)=>s+num(x.amount),0),map=new Map();
  for(const r of all){const label=String(r.reason||"Без причины").trim()||"Без причины",key=label.toLowerCase().replace(/\s+/g," ");if(!map.has(key))map.set(key,{label,count:0,amount:0});const x=map.get(key);x.count++;x.amount+=num(r.amount)}
  const items=[...map.values()].sort((a,b)=>b.amount-a.amount||b.count-a.count).map(x=>({...x,value:x.amount>0?x.amount:x.count}));
  const divisor=totalAmount||items.reduce((s,x)=>s+x.count,0)||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"штраф":"штрафа/ов"} · ${money(x.amount)}</span></div><strong>${Math.round((totalAmount>0?x.amount:x.count)/divisor*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Штрафов пока нет</div>';
  return`<section class="ooa-card ooa-penalties"><div class="ooa-head"><div><h2>Штрафы</h2><p>Анализ причин по сумме штрафов</p></div><button type="button" data-ooa-open="penalties">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${all.length}</b><span>штрафов</span></div></div><div class="ooa-mini-stats penalty"><span>Общая сумма <b>${money(totalAmount)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),dashboard=app?.querySelector(".object-overview-dashboard");if(!app||!dashboard)return false;
  app.querySelector(".object-overview-admin-analysis")?.remove();
  const root=irProject.data.forObject(oid),[acted,penalties]=await Promise.all([root.section("acted-days").list().catch(()=>[]),root.section("penalties").list().catch(()=>[])]);
  if(objectId()!==String(oid))return true;
  const wrap=document.createElement("div");wrap.className="object-overview-admin-analysis";wrap.innerHTML=actedCard(acted)+penaltyCard(penalties);
  const anchor=app.querySelector(".object-overview-deliveries-wrap")||app.querySelector(".object-overview-reports")||dashboard;
  anchor.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("[data-ooa-open]").forEach(b=>b.onclick=()=>location.hash=`/objects/object/${oid}/${b.dataset.ooaOpen}`);
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview acted/penalties",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,120)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();