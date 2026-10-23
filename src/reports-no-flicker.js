"use strict";
(()=>{
 const app=document.getElementById("app");if(!app)return;
 function sync(){
  document.querySelectorAll(".reports-page .reports-list").forEach(list=>{
   const rows=[...list.querySelectorAll(":scope > .report-row")];
   const ready=!rows.length||rows.every(r=>r.dataset.referenceLayout==="1"||r.classList.contains("ir-reference-row"));
   list.classList.toggle("reports-final-ready",ready);
  });
 }
 const mo=new MutationObserver(sync);
 mo.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:["class","data-reference-layout"]});
 window.addEventListener("hashchange",()=>requestAnimationFrame(sync));
 sync();
})();
