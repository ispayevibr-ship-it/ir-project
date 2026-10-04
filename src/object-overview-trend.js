"use strict";
(()=>{
 const DAY=86400000;
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const iso=v=>String(v||"").slice(0,10);
 const ms=v=>{const s=iso(v),t=s?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)?t:null};
 const fmtDate=t=>{const d=new Date(t),dd=String(d.getUTCDate()).padStart(2,"0"),mm=String(d.getUTCMonth()+1).padStart(2,"0");return `${dd}.${mm}`};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const today=()=>{const d=new Date();return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(w?.qty??w?.count??w?.quantity)*num(w?.unit_volume??w?.volume_one)};
 const markTotal=r=>{const d=r?.data||r||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)};
 function objectId(){return location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||""}
 async function buildPoints(oid){
  const root=irProject.data.forObject(oid),[schedule,marks,reports]=await Promise.all([root.section("schedule").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("reports").list().catch(()=>[])]);
  const plans=new Map();for(const r of arr(marks)){const d=r.data||{},id=String(d.work_type_id||"");if(id)plans.set(id,(plans.get(id)||0)+markTotal(r))}
  const scheduled=arr(schedule).map(r=>{const d=r.data||{},id=String(d.work_type_id||""),start=ms(d.start_date),end=ms(d.end_date),plan=plans.get(id)||0;return{id,start,end,plan}}).filter(x=>x.id&&x.start!==null&&x.end!==null&&x.end>=x.start&&x.plan>0);
  if(!scheduled.length)return[];
  const reportRows=arr(reports).map(r=>({d:r.data||r,date:ms((r.data||r).date||(r.data||r).report_date)})).filter(x=>x.date!==null).sort((a,b)=>a.date-b.date);
  const dateSet=new Set(reportRows.map(x=>x.date));const now=today();dateSet.add(now);
  const dates=[...dateSet].filter(t=>t<=now).sort((a,b)=>a-b);
  if(!dates.length)return[];
  return dates.map(t=>{
   const deltas=[];
   for(const s of scheduled){
    if(t<s.start)continue;
    const totalDays=Math.max(1,Math.floor((s.end-s.start)/DAY)+1),elapsed=t>s.end?totalDays:Math.max(0,Math.floor((t-s.start)/DAY)+1),planPct=clamp(elapsed/totalDays*100,0,100);
    let fact=0;for(const rr of reportRows){if(rr.date>t)break;for(const w of arr(rr.d.items||rr.d.works)){if(String(w.work_type_id||"")===s.id)fact+=reportVolume(w)}}
    const factPct=clamp(fact/s.plan*100,0,100);deltas.push(factPct-planPct);
   }
   const value=deltas.length?deltas.reduce((a,b)=>a+b,0)/deltas.length:0;
   return{t,value};
  });
 }
 function chartHtml(points){
  if(!points.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика выполнения</b><span>Недостаточно данных для построения диаграммы</span></div></div>`;
  const W=1000,H=190,PX=44,PY=24,vals=points.map(p=>p.value),abs=Math.max(5,...vals.map(v=>Math.abs(v))),limit=Math.ceil(abs/5)*5,min=-limit,max=limit,x=i=>points.length===1?W/2:PX+(i/(points.length-1))*(W-PX*2),y=v=>PY+((max-v)/(max-min))*(H-PY*2),poly=points.map((p,i)=>`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" "),zero=y(0),last=points.at(-1),prev=points.length>1?points.at(-2):null,change=prev?last.value-prev.value:0,tone=last.value>=-3?"good":last.value>=-10?"warn":"bad",sign=v=>`${v>0?"+":""}${String(Number(v.toFixed(1))).replace(".",",")}%`,trend=prev?(change>0.25?`▲ ${sign(change)}`:change<-.25?`▼ ${sign(change)}`:`● ${sign(change)}`):"Первая точка",firstLabel=fmtDate(points[0].t),midLabel=fmtDate(points[Math.floor((points.length-1)/2)].t),lastLabel=fmtDate(last.t);
  const dots=points.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.2"></circle>`).join("");
  return `<div class="schedule-trend tone-${tone}"><div class="schedule-trend-head"><div><b>Динамика выполнения</b><span>Отклонение фактической готовности от плановой, %</span></div><div class="schedule-trend-current"><strong>${sign(last.value)}</strong><span>${trend}</span></div></div><div class="schedule-trend-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Динамика отклонения от графика"><line class="trend-grid" x1="${PX}" y1="${PY}" x2="${W-PX}" y2="${PY}"></line><line class="trend-zero" x1="${PX}" y1="${zero.toFixed(1)}" x2="${W-PX}" y2="${zero.toFixed(1)}"></line><line class="trend-grid" x1="${PX}" y1="${H-PY}" x2="${W-PX}" y2="${H-PY}"></line><text x="6" y="${PY+4}">+${limit}%</text><text x="15" y="${zero+4}">0%</text><text x="6" y="${H-PY+4}">-${limit}%</text><polyline class="trend-line" points="${poly}"></polyline><g class="trend-dots">${dots}</g></svg><div class="schedule-trend-dates"><span>${firstLabel}</span><span>${midLabel}</span><span>${lastLabel}</span></div></div><div class="schedule-trend-legend"><span><i></i> 0% — по графику</span><span>Выше — опережение</span><span>Ниже — отставание</span></div></div>`;
 }
 async function apply(){
  const oid=objectId();if(!oid)return;
  const host=document.querySelector(".object-overview-schedule");if(!host)return;
  const summary=host.querySelector(".schedule-control-summary");if(!summary)return;
  const points=await buildPoints(oid);if(objectId()!==String(oid))return;
  const wrap=document.createElement("div");wrap.innerHTML=chartHtml(points);summary.replaceWith(wrap.firstElementChild);
 }
 window.addEventListener("hashchange",()=>setTimeout(apply,80));
 setTimeout(apply,120);
})();
