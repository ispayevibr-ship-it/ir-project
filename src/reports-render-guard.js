"use strict";
(()=>{
 const original=window.irReportsPage;
 if(typeof original!=="function")return;
 const isListRoute=()=>/^#?\/objects\/object\/\d+\/reports\/?$/.test(location.hash);
 const showOverlay=()=>{
  let box=document.getElementById("reportsRouteLoading");
  if(box)return box;
  box=document.createElement("div");
  box.id="reportsRouteLoading";
  box.innerHTML='<div class="reports-route-loading-card"><span class="reports-route-spinner"></span><strong>Загрузка отчётов…</strong></div>';
  Object.assign(box.style,{position:"fixed",left:"0",right:"0",top:"38px",bottom:"0",zIndex:"2147483000",display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f7fa"});
  const style=document.createElement("style");
  style.id="reportsRouteLoadingStyle";
  style.textContent='.reports-route-loading-card{display:flex;align-items:center;gap:12px;padding:16px 20px;border:1px solid #dfe7ed;border-radius:10px;background:#fff;color:#294356;font:600 12px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(23,54,77,.08)}.reports-route-spinner{width:18px;height:18px;border:2px solid #d6e4ed;border-top-color:#2598c7;border-radius:50%;animation:reportsRouteSpin .7s linear infinite}@keyframes reportsRouteSpin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);
  document.body.appendChild(box);
  return box;
 };
 const hideOverlay=()=>document.getElementById("reportsRouteLoading")?.remove();
 const waitFinalList=()=>new Promise(resolve=>{
  const root=document.getElementById("app"),list=root?.querySelector(".reports-page .reports-list");
  if(!list)return resolve();
  const ready=()=>{const rows=[...list.querySelectorAll(":scope > .report-row")];return !rows.length||rows.every(r=>r.classList.contains("ir-reference-row")||r.dataset.referenceLayout==="1")};
  if(ready())return resolve();
  let done=false,timer;
  const finish=()=>{if(done)return;done=true;observer.disconnect();clearTimeout(timer);resolve()};
  const observer=new MutationObserver(()=>{if(ready())finish()});
  observer.observe(list,{subtree:true,childList:true,attributes:true,attributeFilter:["class","data-reference-layout"]});
  timer=setTimeout(finish,2200);
 });
 window.irReportsPage=async(...args)=>{
  const guard=isListRoute();
  if(guard)showOverlay();
  try{
   const result=await original(...args);
   if(guard)await waitFinalList();
   return result;
  }finally{
   if(guard)hideOverlay();
  }
 };
})();
