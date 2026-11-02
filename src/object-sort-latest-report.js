"use strict";
(()=>{
 const dateStamp=v=>{
  const s=String(v||"").trim();if(!s)return 0;
  const iso=s.slice(0,10),t=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso)?`${iso}T00:00:00Z`:s);
  return Number.isFinite(t)?t:0;
 };
 const updatedStamp=r=>{const s=String(r?.updated_at||r?.created_at||"").trim();if(!s)return 0;const t=Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");return Number.isFinite(t)?t:0};
 async function reportFreshness(id){
  try{
   const rows=await irProject.data.forObject(id).section("reports").list();
   let best={has:false,date:0,id:0,updated:0};
   for(const r of Array.isArray(rows)?rows:[]){
    const d=r?.data||r||{},date=dateStamp(d.date||d.report_date),rid=Number(r?.id)||0,updated=updatedStamp(r);
    if(!best.has||date>best.date||(date===best.date&&rid>best.id)||(date===best.date&&rid===best.id&&updated>best.updated))best={has:true,date,id:rid,updated};
   }
   return best;
  }catch(e){console.error("object latest report sort",id,e);return{has:false,date:0,id:0,updated:0}}
 }
 async function reportActivity(id){
  let lastId=0,lastTime=0;
  try{for(const r of await irProject.data.forObject(id).section("reports").list()){const rid=Number(r?.id)||0,t=updatedStamp(r);if(rid>lastId)lastId=rid;if(t>lastTime)lastTime=t}}catch{}
  return{lastId,lastTime}
 }
 async function sortObjectsByLatestReport(){
  const objects=await irProject.data.objects.list();
  const enriched=await Promise.all((Array.isArray(objects)?objects:[]).map(async o=>({
   ...o,
   _latestReport:await reportFreshness(o.id),
   // Last change of the object from its reports only (read above anyway): the old way read every section of every
   // object — the montage scheme of thousands of elements too — at each return to the list of objects, and the
   // program stood (the engineer 02.11.2026 «при переходе в объекты со страницы объекта… подвисает»).
   _activity:await reportActivity(o.id)
  })));
  return enriched.sort((a,b)=>{
   const aActive=a.status!=="Завершен",bActive=b.status!=="Завершен";
   if(aActive!==bActive)return aActive?-1:1;
   if(a._latestReport.has!==b._latestReport.has)return a._latestReport.has?-1:1;
   if(b._latestReport.date!==a._latestReport.date)return b._latestReport.date-a._latestReport.date;
   if(b._latestReport.id!==a._latestReport.id)return b._latestReport.id-a._latestReport.id;
   if(b._latestReport.updated!==a._latestReport.updated)return b._latestReport.updated-a._latestReport.updated;
   if((b._activity?.lastId||0)!==(a._activity?.lastId||0))return(b._activity?.lastId||0)-(a._activity?.lastId||0);
   if((b._activity?.lastTime||0)!==(a._activity?.lastTime||0))return(b._activity?.lastTime||0)-(a._activity?.lastTime||0);
   return Number(b.id)-Number(a.id);
  });
 }
 try{sortedObjects=sortObjectsByLatestReport}catch{}
 try{window.sortedObjects=sortObjectsByLatestReport}catch{}
 if((location.hash.slice(1)||"/objects")==="/objects")setTimeout(()=>{try{if(typeof objectsPage==="function")objectsPage()}catch(e){console.error(e)}},0);
})();
