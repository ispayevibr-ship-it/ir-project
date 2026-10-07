"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 const selected=new Map();
 function objectId(){return location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||""}
 async function buildData(oid){
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const serviceIds=new Set(arr(workTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id))),catalog=arr(workTypes).filter(r=>(r.data?.accounting_type||"")!=="service"&&norm(r.data?.unit)!=="услуга").map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||""}}),byId=new Map(catalog.map(x=>[x.id,x]));
  const exact=(name,code)=>catalog.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));
  const resolve=w=>{
   const rawId=String(w.work_type_id||""),name=w.work_type||w.type||"",code=w.project_code||w.code||"",unit=w.unit||"";
   const byRaw=rawId?byId.get(rawId):null;
   if(byRaw){const nameOk=!name||norm(byRaw.name)===norm(name),codeOk=!code||!byRaw.code||norm(byRaw.code)===norm(code);if(nameOk&&codeOk)return byRaw}
   let hit=exact(name,code);
   if(!hit&&code){const matches=catalog.filter(x=>norm(x.code)===norm(code));if(matches.length===1)hit=matches[0]}
   if(!hit&&name){const matches=catalog.filter(x=>norm(x.name)===norm(name));if(matches.length===1)hit=matches[0]}
   if(hit)return hit;
   const id=`legacy:${norm(name)}|${norm(code)}|${norm(unit)}`;return{id,name:name||"Без названия",code,unit};
  };
  const volumes=new Map(),used=new Map();
  for(const r of arr(reports)){
   const d=r.data||r,date=iso(d.date||d.report_date);if(!date)continue;
   for(const w of arr(d.items||d.works)){
    if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга"||serviceIds.has(String(w.work_type_id||"")))continue;const type=resolve(w),id=type.id;used.set(id,type);
    if(!volumes.has(id))volumes.set(id,new Map());
    const byDate=volumes.get(id);byDate.set(date,(byDate.get(date)||0)+reportVolume(w));
   }
  }
  const types=[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru"));
  return{volumes,types};
 }
 function chartHtml(oid,data){
  if(!data.types.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>Нет выполненных объёмов в ежедневных отчётах</span></div></div>`;
  let active=selected.get(String(oid));if(!data.types.some(x=>x.id===active))active=data.types[0].id;selected.set(String(oid),active);
  const m=data.types.find(x=>x.id===active),byDate=data.volumes.get(active)||new Map(),dates=[...byDate.keys()].sort(),points=dates.map(date=>({date,value:byDate.get(date)||0}));
  if(!points.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>По выбранному виду работ нет объёмов</span></div></div>`;
  const nonZero=points.filter(x=>x.value>0),last=points.at(-1),prev=points.length>1?points.at(-2):null,total=points.reduce((s,x)=>s+x.value,0),avg=nonZero.length?total/nonZero.length:0,max=Math.max(0,...points.map(x=>x.value)),diff=prev?last.value-prev.value:0,trend=prev?(diff>0?`▲ +${fmt(diff)}`:diff<0?`▼ ${fmt(diff)}`:`● 0`):"—",trendClass=diff>0?"up":diff<0?"down":"flat",unit=m.unit||"ед.";
  const W=Math.max(900,points.length*48),H=210,L=48,R=20,T=20,B=34,innerH=H-T-B,innerW=W-L-R,maxY=Math.max(1,max,avg),step=innerW/Math.max(1,points.length),barW=Math.max(18,Math.min(72,step*.64)),avgY=T+innerH-(avg/maxY)*innerH;
  const bars=points.map((p,i)=>{const h=(p.value/maxY)*innerH,x=L+i*step+(step-barW)/2,yy=H-B-h;return `<g class="daily-bar"><rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="4"></rect><text x="${(x+barW/2).toFixed(1)}" y="${Math.max(12,yy-5).toFixed(1)}" text-anchor="middle">${p.value>0?esc(fmt(p.value)):""}</text><text class="daily-date" x="${(x+barW/2).toFixed(1)}" y="${H-11}" text-anchor="middle">${esc(fmtDate(p.date))}</text></g>`}).join("");
  const options=data.types.map(x=>`<option value="${esc(x.id)}" ${x.id===active?"selected":""}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:""}</option>`).join("");
  const avgLabel=`Среднее ${fmt(avg)} ${unit}`,avgBoxW=Math.max(112,72+String(avgLabel).length*4.6),avgBoxX=Math.max(L+4,W-R-avgBoxW-6),avgBoxY=Math.max(T+3,Math.min(H-B-22,avgY-12));
  const averageOverlay=avg>0?`<g class="daily-average-overlay"><line class="daily-average" x1="${L}" y1="${avgY.toFixed(1)}" x2="${W-R}" y2="${avgY.toFixed(1)}"></line><rect class="daily-average-bg" x="${avgBoxX.toFixed(1)}" y="${avgBoxY.toFixed(1)}" width="${avgBoxW.toFixed(1)}" height="19" rx="5"></rect><text class="daily-average-label" x="${(avgBoxX+avgBoxW-7).toFixed(1)}" y="${(avgBoxY+13).toFixed(1)}" text-anchor="end">${esc(avgLabel)}</text></g>`:"";
  return `<div class="schedule-trend"><div class="schedule-trend-head"><div><b>Динамика по ежедневным отчётам</b><span>Фактический объём выбранного вида работ по дням</span></div><select class="schedule-trend-select" data-trend-work>${options}</select></div><div class="schedule-trend-stats"><div><span>Последний день</span><b>${esc(fmt(last.value))} ${esc(unit)}</b><small>${esc(fmtDate(last.date))}</small></div><div><span>Выполнено за период</span><b>${esc(fmt(total))} ${esc(unit)}</b><small>${nonZero.length} дн. с объёмом</small></div><div><span>Максимум за день</span><b>${esc(fmt(max))} ${esc(unit)}</b></div><div class="trend-delta ${trendClass}"><span>К предыдущему отчёту</span><b>${esc(trend)} ${esc(unit)}</b></div></div><div class="schedule-trend-chart daily-volume-chart"><div class="daily-volume-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Фактические объёмы выбранного вида работ"><line class="daily-grid" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"></line><line class="daily-grid" x1="${L}" y1="${T+innerH/2}" x2="${W-R}" y2="${T+innerH/2}"></line><line class="daily-grid" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"></line><text class="daily-axis" x="4" y="${T+4}">${esc(fmt(maxY))}</text><text class="daily-axis" x="4" y="${H-B+4}">0</text>${bars}${averageOverlay}</svg></div></div></div>`;
 }
 async function renderInto(oid,host){
  const data=await buildData(oid);if(objectId()!==String(oid))return;
  const current=host.querySelector(".schedule-trend"),summary=host.querySelector(".schedule-control-summary"),wrap=document.createElement("div");wrap.innerHTML=chartHtml(oid,data);const node=wrap.firstElementChild;
  if(current)current.replaceWith(node);else if(summary)summary.replaceWith(node);else host.querySelector(".schedule-control-list")?.before(node);
  node.querySelector("[data-trend-work]")?.addEventListener("change",e=>{selected.set(String(oid),e.target.value);renderInto(oid,host)});
 }
 async function apply(){const oid=objectId();if(!oid)return;const host=document.querySelector(".object-overview-schedule");if(!host)return;await renderInto(oid,host)}
 window.addEventListener("hashchange",()=>setTimeout(apply,80));
 setTimeout(apply,120);
})();
