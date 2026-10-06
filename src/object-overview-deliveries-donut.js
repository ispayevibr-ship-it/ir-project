"use strict";
(()=>{
 const num=v=>{const m=String(v??"").replace(/\s/g,"").replace(",",".").match(/-?\d+(?:\.\d+)?/);const n=m?Number(m[0]):0;return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{const n=Number(v)||0;return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 function unitOf(text){return String(text||"").replace(/[-+]?\d[\d\s]*(?:[,.]\d+)?/g,"").trim()||"ед."}
 function apply(){
  const card=document.querySelector(".ood-comparison");if(!card)return;
  const stats=card.querySelector(".ood-stats");if(!stats||card.querySelector(".ood-donut-summary"))return;
  const values=[...stats.querySelectorAll(":scope > div b")].map(x=>x.textContent.trim());if(values.length<3)return;
  const delivered=num(values[0]),mounted=num(values[1]),unit=unitOf(values[0]),remaining=Math.max(0,delivered-mounted),over=Math.max(0,mounted-delivered);
  const ratio=delivered>0?Math.max(0,Math.min(1,mounted/delivered)):0,C=2*Math.PI*42,green=C*ratio;
  const wrap=document.createElement("div");wrap.className="ood-donut-summary";
  wrap.innerHTML=`<div class="ood-donut-visual"><svg viewBox="0 0 160 160" role="img" aria-label="Завезено ${esc(fmt(delivered))} ${esc(unit)}, смонтировано ${esc(fmt(mounted))} ${esc(unit)}, осталось ${esc(fmt(remaining))} ${esc(unit)}"><circle class="ood-donut-outer" cx="80" cy="80" r="58"></circle><circle class="ood-donut-rest" cx="80" cy="80" r="42"></circle><circle class="ood-donut-mounted" cx="80" cy="80" r="42" stroke-dasharray="${green.toFixed(2)} ${(C-green).toFixed(2)}"></circle></svg><div class="ood-donut-center"><span>Завезено</span><b>${esc(fmt(delivered))}</b><small>${esc(unit)}</small></div></div><div class="ood-donut-info"><div class="ood-donut-row delivered"><i></i><span>Завезено</span><b>${esc(fmt(delivered))} ${esc(unit)}</b></div><div class="ood-donut-row mounted"><i></i><span>Смонтировано</span><b>${esc(fmt(mounted))} ${esc(unit)}</b></div><div class="ood-donut-row remaining"><i></i><span>Осталось на площадке</span><b>${esc(fmt(remaining))} ${esc(unit)}</b></div>${over>0?`<div class="ood-donut-warning">Смонтировано больше, чем заведено по накладным, на <b>${esc(fmt(over))} ${esc(unit)}</b>. Проверь данные поставок.</div>`:""}</div>`;
  stats.replaceWith(wrap);
 }
 let lastHash="";setInterval(()=>{const h=location.hash;if(h!==lastHash)lastHash=h;apply()},180);window.addEventListener("hashchange",()=>setTimeout(apply,80));setTimeout(apply,120);
})();
