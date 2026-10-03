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
    for(const work of works){
     const mid=String(work.mark_id||"");
     if(!mid)continue;
     mountedByMark[mid]=(mountedByMark[mid]||0)+num(work.qty??work.count??work.quantity);
    }
   }
   for(const mark of marks){
    const d=mark.data||{},id=String(mark.id),total=num(d.qty??d.count),next=Math.max(0,Math.min(total,mountedByMark[id]||0)),current=num(d.mounted??d.done);
    if(Math.abs(next-current)<1e-9)continue;
    await marksApi.update(mark.id,{record_type:mark.record_type||"item",title:mark.title||d.mark||"",data:{...d,mounted:next}});
   }
  })().finally(()=>running.delete(oid));
  running.set(oid,task);return task;
 }
 window.irSyncMountedFromReports=syncMounted;
 const originalMarks=window.irMarksPage;
 if(typeof originalMarks==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return originalMarks(oid)};
 const oidFromHash=()=>location.hash.match(/\/objects\/object\/(\d+)/)?.[1]||"";
 document.addEventListener("click",e=>{
  if(!e.target.closest(".report-delete"))return;
  const oid=oidFromHash();
  setTimeout(()=>syncMounted(oid).catch(console.error),150);
 },true);
 window.addEventListener("hashchange",()=>{
  const oid=oidFromHash();
  if(!oid)return;
  if(/\/reports(?:\/|$)/.test(location.hash)||/\/marks$/.test(location.hash))setTimeout(()=>syncMounted(oid).catch(console.error),50);
 });
})();