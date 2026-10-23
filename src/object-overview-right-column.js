"use strict";
/* Object overview right column, version 1.7.73.
 * Move existing module WRAPPERS, not their interactive children:
 * report toggles, photos, delivery filters and graph links keep their handlers.
 * Source sections and database records are never changed.
 */
(()=>{
 const app=document.getElementById("app");if(!app)return;
 const routeId=()=>String((location.hash||"").match(/^#?\/objects\/object\/(\d+)\/?$/)?.[1]||"");
 const blocks=[
  ["reports",".object-overview-reports"],
  ["deliveries",".object-overview-deliveries-wrap"],
  ["schedule",".object-overview-dashboard"],
  ["marks",".object-overview-marks-wrap"],
  ["analysis",".object-overview-admin-analysis"]
 ];
 const cards=[
  ["reports","Последние отчёты","Последние ежедневные отчёты"],
  ["photos","Фото","Последние фотографии из отчётов"],
  ["deliveries","Накладные","Последние поставки по объекту"],
  ["schedule","График работ","План и выполнение по видам работ"],
  ["supply","График поставок","Поставлено и смонтировано"],
  ["marks","Ведомость марок","Монтаж, остатки и готовность"],
  ["acted","Актированные дни","Причины остановки работ"],
  ["penalties","Штрафы","Суммы и причины штрафов"]
 ];
 let pending=false,lastId="";
 function queue(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(()=>{pending=false;apply()});
 }
 function childrenFor(right){
  const report=right.querySelector(".object-overview-reports"),
   delivery=right.querySelector(".object-overview-deliveries-wrap"),
   schedule=right.querySelector(".object-overview-dashboard"),
   marks=right.querySelector(".object-overview-marks-wrap"),
   analysis=right.querySelector(".object-overview-admin-analysis");
  const overviewMarks=report?.querySelector(".oor-marks-card");
  const detailedMarks=marks?.querySelector(".object-overview-marks-card");
  return {
   reports:!!report?.querySelector(".oor2-card:not(.oor2-photo-card):not(.oor-marks-card)"),
   photos:!!report?.querySelector(".oor2-photo-card"),
   deliveries:!!delivery?.querySelector(".ood-deliveries"),
   schedule:!!schedule?.querySelector(".object-overview-schedule"),
   supply:!!delivery?.querySelector(".ood-comparison"),
   marks:!!(detailedMarks||overviewMarks),
   acted:!!analysis?.querySelector(".ooa-acted"),
   penalties:!!analysis?.querySelector(".ooa-penalties"),
   detailedMarks:!!detailedMarks
  };
 }
 function makeLayout(id,anchor){
  const shell=document.createElement("section");
  shell.className="ir-object-overview-layout";shell.dataset.objectId=id;
  const left=document.createElement("aside");
  left.className="ir-object-overview-left";
  left.setAttribute("aria-label","Сводка объекта");
  const heading=document.createElement("div");heading.className="ir-object-overview-sidehead";
  heading.innerHTML="<h2>Сводка объекта</h2><p>Готовность, ресурсы и погода</p>";
  left.appendChild(heading);
  const right=document.createElement("div");
  right.className="ir-object-overview-right";
  right.setAttribute("aria-label","Разделы объекта");
  for(const [key,title,subtitle] of cards){
   const fallback=document.createElement("section");
   fallback.className="ir-object-overview-placeholder";fallback.dataset.panel=key;
   fallback.innerHTML="<div><h2>"+title+"</h2><p>"+subtitle+"</p></div><span>Раздел пока не отображается</span>";
   right.appendChild(fallback);
  }
  shell.append(left,right);
  app.insertBefore(shell,anchor);
  return shell;
 }
 function apply(){
  const id=routeId();if(!id){lastId="";return}
  const dashboard=app.querySelector(".object-overview-dashboard");
  if(!dashboard)return;
  const existing=app.querySelector(":scope > .ir-object-overview-layout");
  let layout=existing;
  if(layout&&layout.dataset.objectId!==id){layout.remove();layout=null}
  if(!layout){
   const anchor=app.contains(dashboard)?dashboard:null;
   layout=makeLayout(id,anchor);
  }
  lastId=id;
  const left=layout.querySelector(".ir-object-overview-left"),right=layout.querySelector(".ir-object-overview-right");
  const stats=app.querySelector(".object-overview-top-stats");
  if(stats&&stats.parentElement!==left)left.append(stats);
  for(const [,selector] of blocks){
   const wrapper=app.querySelector(selector);
   if(wrapper&&wrapper.parentElement!==right)right.append(wrapper);
  }
  const present=childrenFor(right);
  layout.classList.toggle("ir-object-overview-has-marks",present.detailedMarks);
  for(const card of right.querySelectorAll(":scope > .ir-object-overview-placeholder")){
   card.hidden=Boolean(present[card.dataset.panel]);
  }
 }
 const observer=new MutationObserver(queue);
 observer.observe(app,{subtree:true,childList:true});
 window.addEventListener("hashchange",queue);
 window.addEventListener("ir-project-object-updated",queue);
 queue();
})();
