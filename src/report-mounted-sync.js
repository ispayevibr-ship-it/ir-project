"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 async function syncMounted(oid){
  oid=String(oid||"");if(!oid)throw Error("Не указан объект для сверки ведомости.");
  const root=irProject.data.forObject(oid),reportsApi=root.section("reports"),marksApi=root.section("marks");
  // Ошибка чтения не должна превращаться в пустой список: иначе можно обнулить монтаж.
  const [reports,marks]=await Promise.all([reportsApi.list(),marksApi.list()]);
  if(!Array.isArray(reports)||!Array.isArray(marks))throw Error("Не удалось получить отчёты или ведомость марок.");
  const mounted=Object.create(null),ids=new Set(marks.map(m=>String(m.id)));
  let workLines=0,linkedLines=0,withoutMarkId=0;
  for(const report of reports){
   const d=report.data||report,works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
   for(const w of works){
    workLines++;
    if(w?.accounting_type==="service"||w?.is_service===true)continue;
    const id=String(w?.mark_id??w?.markId??"").trim();
    if(!id){if(w?.mark||w?.mark_name||w?.markName)withoutMarkId++;continue}
    const qty=Math.max(0,num(w.qty??w.count??w.quantity));
    mounted[id]=(mounted[id]||0)+qty;linkedLines++
   }
  }
  const updates=[];
  for(const m of marks){
   const d=m.data||{},total=Math.max(0,num(d.qty??d.count)),next=Math.max(0,Math.min(total,mounted[String(m.id)]||0)),current=num(d.mounted??d.done);
   if(Math.abs(next-current)<1e-9)continue;
   updates.push({m,data:d,next,before:current})
  }
  const changedMarks=[];
  for(const item of updates){
   const {m,data,next,before}=item;
   await marksApi.update(m.id,{record_type:m.record_type||"item",title:m.title||data.mark||"",data:{...data,mounted:next}});
   changedMarks.push({id:String(m.id),mark:String(data.mark||m.title||m.id),before,after:next})
  }
  const unrecognizedIds=Object.keys(mounted).filter(id=>!ids.has(id));
  return{reportsChecked:reports.length,workLines,linkedLines,withoutMarkId,unrecognizedIds,marksChecked:marks.length,updated:changedMarks.length,changedMarks}
 }
 window.irSyncMountedFromReports=syncMounted;
 const original=window.irMarksPage;
 if(typeof original==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return original(oid)};
})();
