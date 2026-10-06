"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const fmt=v=>{const n=num(v);if(n===null)return"";return String(Number(n.toFixed(1))).replace(".",",")};
 const tempText=v=>{const n=num(v);return n===null?"":`${n>0?"+":""}${fmt(n)}°C`};
 const dataOf=r=>({id:String(r.id),...(r.data||{})});
 async function refs(oid){const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);return{reports:reports.map(dataOf),workTypes:workTypes.map(r=>({id:String(r.id),...(r.data||{}),title:r.title||""}))}}
 function findWorkType(work,types){const id=String(work?.work_type_id||"");if(id){const byId=types.find(x=>x.id===id);if(byId)return byId}const code=norm(work?.project_code||work?.code),name=norm(work?.work_type||work?.type);return types.find(x=>norm(x.project_code)===code&&(!name||norm(x.work_type||x.title)===name))||types.find(x=>name&&norm(x.work_type||x.title)===name)||types.find(x=>code&&norm(x.project_code)===code)||null}
 async function fixView(oid,reportId){const table=document.querySelector(".rv-work-table tbody");if(!table)return false;const {reports,workTypes}=await refs(oid),report=reports.find(x=>x.id===String(reportId));if(!report)return false;const works=arr(report.items||report.works),trs=[...table.querySelectorAll("tr")];trs.forEach((tr,i)=>{const w=works[i];if(!w)return;const wt=findWorkType(w,workTypes),secondary=String(w.project_code_2||w.secondary_project_code||w.code_2||wt?.project_code_2||wt?.secondary_project_code||wt?.code_2||"").trim();if(!secondary)return;const cell=tr.children[1];if(!cell)return;let small=cell.querySelector(".rv-project-code-2");if(!small){small=document.createElement("small");small.className="rv-project-code-2";cell.appendChild(small)}small.textContent=`Доп. шифр: ${secondary}`});return true}
 async function fixList(oid){const rows=[...document.querySelectorAll(".report-row[data-report-id]")];if(!rows.length)return false;const {reports}=await refs(oid),map=new Map(reports.map(r=>[r.id,r]));rows.forEach(row=>{const r=map.get(String(row.dataset.reportId));if(!r)return;const t=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp,txt=tempText(t),b=row.querySelector(".report-cell-weather b");if(!b)return;let s=b.querySelector(".report-list-temperature");if(!txt){s?.remove();return}if(!s){s=document.createElement("strong");s.className="report-list-temperature";b.appendChild(s)}s.textContent=txt});return true}
 async function apply(oid,route){if(route?.mode==="view"&&route.reportId){for(const ms of [0,30,100])setTimeout(()=>fixView(oid,String(route.reportId)),ms);return}if(!route?.mode){for(const ms of [0,40,120])setTimeout(()=>fixList(oid),ms)}}
 window.irReportsPage=async(oid,route={})=>{const out=await base(oid,route);apply(oid,route);return out};
})();
