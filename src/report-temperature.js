"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const pendingKey=oid=>`ir-report-temperature-pending-${oid}`;
 const numText=v=>String(v??"").replace(",",".");
 const clearPending=oid=>sessionStorage.removeItem(pendingKey(oid));
 async function applyPending(oid,route){
  if(route?.mode!=="view"||!route.reportId)return;
  const raw=sessionStorage.getItem(pendingKey(oid));if(!raw)return;
  let p;try{p=JSON.parse(raw)}catch{clearPending(oid);return}
  const age=Date.now()-Number(p.at||0),validAge=age>=0&&age<60000,validTarget=p.mode==="new"||String(p.reportId||"")===String(route.reportId);
  if(!validAge||!validTarget){clearPending(oid);return}
  clearPending(oid);
  const api=irProject.data.forObject(oid).section("reports"),rec=await api.get(route.reportId).catch(()=>null);if(!rec)return;
  const data={...(rec.data||{}),temperature:p.value===""?"":Number(numText(p.value))};
  await api.update(route.reportId,{record_type:rec.record_type||"item",title:rec.title||"",data}).catch(()=>{});
 }
 async function enhanceForm(oid,route){
  if(!["new","edit"].includes(route?.mode))return;
  const form=document.getElementById("dailyReportForm"),grid=form?.querySelector(".report-grid-3");if(!form||!grid||form.querySelector('[name="temperature"]'))return;
  let initial="";if(route.mode==="edit"&&route.reportId){const rec=await irProject.data.forObject(oid).section("reports").get(route.reportId).catch(()=>null),d=rec?.data||{};initial=d.temperature??d.temp??""}
  const label=document.createElement("label");label.className="report-temperature-field";label.innerHTML=`Температура, °C<input type="number" step="0.1" name="temperature" value="${String(initial).replace(/"/g,"&quot;")}" placeholder="Например: 12">`;
  const wind=grid.querySelector('[name="wind"]')?.closest('label');grid.insertBefore(label,wind||null);grid.classList.add("report-grid-weather");
  const old=form.onsubmit;form.onsubmit=async e=>{sessionStorage.setItem(pendingKey(oid),JSON.stringify({value:String(form.querySelector('[name="temperature"]')?.value||""),mode:route.mode,reportId:route.reportId||"",at:Date.now()}));return old?.call(form,e)};
  document.getElementById("reportCancel")?.addEventListener("click",()=>clearPending(oid),{once:true});
 }
 window.irReportsPage=async(oid,route={})=>{
  if(!["new","edit","view"].includes(route?.mode))clearPending(oid);
  await applyPending(oid,route);
  const out=await base(oid,route);
  await enhanceForm(oid,route);
  return out;
 };
})();