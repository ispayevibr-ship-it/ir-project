"use strict";
(()=>{
 const num=v=>Number(String(v??0).replace(",","."))||0;
 let running=new Map();
 async function syncMounted(oid){
  oid=String(oid||"");
  if(!oid)return;
  if(running.has(oid))return running.get(oid);
  const task=(async()=>{
   const root=irProject.data.forObject(oid),reportsApi=root.section("reports"),marksApi=root.section("marks");
   const [reports,marks]=await Promise.all([reportsApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]);
   const mountedByMark={};
   for(const report of reports){
    const d=report.data||{},works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
    for(const work of works){const mid=String(work.mark_id||"");if(mid)mountedByMark[mid]=(mountedByMark[mid]||0)+num(work.qty??work.count??work.quantity)}
   }
   const updates=[];
   for(const mark of marks){
    const d=mark.data||{},id=String(mark.id),total=num(d.qty??d.count),next=Math.max(0,Math.min(total,mountedByMark[id]||0)),current=num(d.mounted??d.done);
    if(Math.abs(next-current)<1e-9)continue;
    updates.push(marksApi.update(mark.id,{record_type:mark.record_type||"item",title:mark.title||d.mark||"",data:{...d,mounted:next}}));
   }
   await Promise.all(updates);
  })().finally(()=>running.delete(oid));
  running.set(oid,task);return task;
 }
 window.irSyncMountedFromReports=syncMounted;
 const originalMarks=window.irMarksPage;
 if(typeof originalMarks==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return originalMarks(oid)};
 const style=document.createElement("style");
 style.textContent=`.mark-results .mark-result-done{background:#ffe8e8!important;color:#9d2222!important;border-left:3px solid #d64545!important;cursor:not-allowed!important;opacity:.78}.mark-results .mark-result-done:hover{background:#ffe8e8!important}.mark-results .mark-result-done b,.mark-results .mark-result-done span,.mark-results .mark-result-done i{color:#9d2222!important}`;
 document.head.appendChild(style);
})();