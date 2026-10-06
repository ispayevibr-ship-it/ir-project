"use strict";
(()=>{
 const base=window.irReportsPage;
 if(typeof base!=="function")return;
 const arr=v=>Array.isArray(v)?v:[];
 const pendingKey=oid=>`ir-report-photos-sync-${oid}`;
 const api=oid=>irProject.data.forObject(oid).section("reports");
 const uniq=a=>[...new Set(arr(a).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,12);
 const collect=()=>uniq([...document.querySelectorAll("#dailyReportForm .report-photo-slot")].map(x=>x.dataset.photoPath||""));
 async function paintSeed(slot,path,index){
  slot.dataset.photoPath=path||"";
  if(!path)return;
  const src=await irProject.images.read(path).catch(()=>"");
  if(!src)return;
  slot.classList.add("has-photo");
  slot.innerHTML=`<img src="${src}" alt="Фото ${index+1}"><span>Фото ${index+1}</span>`;
 }
 async function seedForm(photos){
  const form=document.getElementById("dailyReportForm");
  if(!form||form.dataset.photoSyncSeeded==="1")return;
  form.dataset.photoSyncSeeded="1";
  const slots=[...form.querySelectorAll(".report-photo-slot")],list=uniq(photos);
  for(let i=0;i<slots.length;i++)if(list[i])await paintSeed(slots[i],list[i],i);
 }
 function wireSubmit(oid,route){
  const form=document.getElementById("dailyReportForm");
  if(!form||form.dataset.photoSyncSubmit==="1")return;
  form.dataset.photoSyncSubmit="1";
  form.addEventListener("submit",()=>{
   const date=form.querySelector('[name="date"]')?.value||"";
   sessionStorage.setItem(pendingKey(oid),JSON.stringify({targetId:route?.mode==="edit"?String(route.reportId||""):"",date,photos:collect()}));
  },true);
  const clear=()=>sessionStorage.removeItem(pendingKey(oid));
  document.getElementById("reportCancel")?.addEventListener("click",clear,{once:true});
  document.getElementById("reportFormBack")?.addEventListener("click",clear,{once:true});
 }
 async function applyPending(oid,rid){
  const raw=sessionStorage.getItem(pendingKey(oid));
  if(!raw)return;
  let p;try{p=JSON.parse(raw)||{}}catch{return sessionStorage.removeItem(pendingKey(oid))}
  const rec=await api(oid).get(rid).catch(()=>null);
  if(!rec)return;
  const d=rec.data||{};
  if(p.targetId&&String(p.targetId)!==String(rid))return;
  if(!p.targetId&&p.date&&String(d.date||d.report_date||"").slice(0,10)!==String(p.date).slice(0,10))return;
  const next=uniq(p.photos),prev=uniq(d.photos);
  if(JSON.stringify(next)!==JSON.stringify(prev))await api(oid).update(rid,{record_type:rec.record_type||"item",title:rec.title||"",data:{...d,photos:next}});
  sessionStorage.removeItem(pendingKey(oid));
 }
 window.irReportsPage=async(oid,route={})=>{
  let initialPhotos=[];
  if(route?.mode==="view"&&route.reportId)await applyPending(oid,String(route.reportId));
  if(route?.mode==="edit"&&route.reportId){const rec=await api(oid).get(String(route.reportId)).catch(()=>null);initialPhotos=arr(rec?.data?.photos)}
  if(route?.mode==="new"){
   try{const copy=JSON.parse(sessionStorage.getItem(`ir-report-copy-${oid}`)||"null")||{};initialPhotos=arr(copy?.data?.photos||copy?.photos)}catch{}
  }
  const result=await base(oid,route);
  if(route?.mode==="new"||route?.mode==="edit"){
   await seedForm(initialPhotos);
   wireSubmit(oid,route);
  }
  return result;
 };
})();
