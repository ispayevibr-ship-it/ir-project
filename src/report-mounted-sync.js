"use strict";
(()=>{
 const num=v=>Number(String(v??0).replace(",","."))||0;
 async function syncMounted(oid){
  oid=String(oid||"");if(!oid)return;
  const root=irProject.data.forObject(oid),reportsApi=root.section("reports"),marksApi=root.section("marks");
  const [reports,marks]=await Promise.all([reportsApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]),mounted={};
  for(const r of reports){const works=Array.isArray(r.data?.items)?r.data.items:Array.isArray(r.data?.works)?r.data.works:[];for(const w of works){const id=String(w.mark_id||"");if(id)mounted[id]=(mounted[id]||0)+num(w.qty??w.count??w.quantity)}}
  for(const m of marks){const d=m.data||{},total=num(d.qty??d.count),next=Math.max(0,Math.min(total,mounted[String(m.id)]||0)),current=num(d.mounted??d.done);if(Math.abs(next-current)<1e-9)continue;await marksApi.update(m.id,{record_type:m.record_type||"item",title:m.title||d.mark||"",data:{...d,mounted:next}})}
 }
 window.irSyncMountedFromReports=syncMounted;
 const original=window.irMarksPage;
 if(typeof original==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return original(oid)};
})();