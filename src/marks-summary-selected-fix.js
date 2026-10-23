"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const parseNum=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:NaN};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const oidFromHash=()=>{const m=String(location.hash||"").match(/\/objects\/object\/([^/]+)\/marks/);return m?decodeURIComponent(m[1]):""};
 const markTotal=x=>{const raw=x?.total_value??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const n=parseNum(raw);if(Number.isFinite(n))return n}return num(x?.qty??x?.count)*num(x?.unit_volume??x?.volume_one)};
 const style=document.createElement("style");style.textContent=`.marks-stats>.marks-selected-count-metrics{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.marks-stats>.marks-selected-count-metrics .marks-stat{margin:0}@media(max-width:1200px){.marks-stats>.marks-selected-count-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:900px){.marks-stats>.marks-selected-count-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}`;document.head.appendChild(style);
 let timer=0,requestId=0;
 async function enhance(){
  const page=document.querySelector(".marks-page"),summary=document.querySelector(".marks-stats"),activeCard=document.querySelector('.marks-work-card.on[data-work]:not([data-work="all"])'),oid=oidFromHash();
  if(!page||!summary||!activeCard||!oid||!window.irProject?.data?.forObject)return;
  const id=++requestId;let markRows=[],workRows=[];try{[markRows,workRows]=await Promise.all([irProject.data.forObject(oid).section("marks").list(),irProject.data.forObject(oid).section("work-types").list()])}catch{return}
  if(id!==requestId||!document.querySelector(".marks-page"))return;
  const wid=String(activeCard.dataset.work||""),items=(Array.isArray(markRows)?markRows:[]).map(r=>({id:r.id,...(r.data||{})})).filter(x=>String(x.work_type_id||"")===wid),work=(Array.isArray(workRows)?workRows:[]).map(r=>({id:String(r.id),...(r.data||{})})).find(x=>x.id===wid);
  const unit=String(work?.unit||items.find(x=>x.unit)?.unit||"").trim(),meta=window.irMeasure?.meta?.(unit)||{totalLabel:"Общий объём"},positions=items.length,totalMarks=items.reduce((s,x)=>s+num(x.qty??x.count),0),totalValue=items.reduce((s,x)=>s+markTotal(x),0),mountedPositions=items.filter(x=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return q>0&&d>=q}).length,mountedMarks=items.reduce((s,x)=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return s+Math.min(q,Math.max(0,d))},0);
  summary.querySelectorAll(":scope > .marks-stat").forEach(el=>el.hidden=true);
  let box=summary.querySelector(":scope > .marks-selected-count-metrics");if(!box){box=document.createElement("div");box.className="marks-selected-count-metrics";summary.insertBefore(box,summary.firstChild)}
  const sig=[wid,positions,totalMarks,totalValue,unit,mountedPositions,mountedMarks].join("|");if(box.dataset.signature===sig)return;box.dataset.signature=sig;box.innerHTML=`<div class="marks-stat"><span>Всего позиций</span><b>${fmt(positions)}</b></div><div class="marks-stat"><span>Всего марок</span><b>${fmt(totalMarks)}</b></div><div class="marks-stat"><span>${meta.totalLabel||"Общий объём"}</span><b>${fmt(totalValue)}${unit?` ${unit}`:""}</b></div><div class="marks-stat"><span>Всего позиций смонтировано</span><b>${fmt(mountedPositions)}</b></div><div class="marks-stat good"><span>Всего марок смонтировано</span><b>${fmt(mountedMarks)}</b></div>`;
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(enhance,20)};
 new MutationObserver(schedule).observe(document.getElementById("app")||document.documentElement,{childList:true,subtree:true});addEventListener("hashchange",schedule);schedule();
})();
