"use strict";
(()=>{
 const apply=()=>{
  const card=document.querySelector(".ood-comparison");
  if(!card)return;
  const head=card.querySelector(".ood-head h2");
  if(head&&head.textContent!=="Поставки и монтаж")head.textContent="Поставки и монтаж";
  const sub=card.querySelector(".ood-head p");
  if(sub&&sub.textContent!=="Поставлено по накладным и смонтировано по ежедневным отчётам")sub.textContent="Поставлено по накладным и смонтировано по ежедневным отчётам";
  const center=card.querySelector(".ood-donut-center span");
  if(center&&center.textContent!=="Поставлено")center.textContent="Поставлено";
  const delivered=card.querySelector(".ood-donut-row.delivered span");
  if(delivered&&delivered.textContent!=="Поставлено по накладным")delivered.textContent="Поставлено по накладным";
  const mounted=card.querySelector(".ood-donut-row.mounted span");
  if(mounted&&mounted.textContent!=="Смонтировано по отчётам")mounted.textContent="Смонтировано по отчётам";
  const remaining=card.querySelector(".ood-donut-row.remaining span");
  if(remaining&&remaining.textContent!=="Остаток на площадке")remaining.textContent="Остаток на площадке";
  const legend=card.querySelector(".ood-legend");
  if(legend){
   const items=legend.querySelectorAll("span");
   if(items[0])items[0].innerHTML='<i class="delivered"></i>Поставлено по накладным';
   if(items[1])items[1].innerHTML='<i class="mounted"></i>Смонтировано по отчётам';
  }
  const warning=card.querySelector(".ood-donut-warning");
  if(warning){
   const value=warning.querySelector("b")?.textContent||"";
   warning.innerHTML=`Смонтировано больше, чем поставлено по накладным, на <b>${value}</b>. Проверь данные поставок.`;
  }
  const stats=card.querySelectorAll(".ood-stats > div span");
  if(stats[0])stats[0].textContent="Поставлено по накладным";
  if(stats[1])stats[1].textContent="Смонтировано по отчётам";
  if(stats[2])stats[2].textContent="Остаток на площадке";
 };
 let tries=0;
 const run=()=>{apply();if(++tries<40)setTimeout(run,150)};
 window.addEventListener("hashchange",()=>{tries=0;setTimeout(run,80)});
 setTimeout(run,80);
})();
