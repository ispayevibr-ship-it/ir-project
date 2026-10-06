"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 async function addSecondaryCode(oid,reportId){
  const table=document.querySelector(".rv-work-table tbody");if(!table)return;
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const record=reports.find(r=>String(r.id)===String(reportId));if(!record)return;
  const works=Array.isArray(record.data?.items)?record.data.items:Array.isArray(record.data?.works)?record.data.works:[];
  const wtMap=new Map(workTypes.map(r=>[String(r.id),r.data||{}]));
  [...table.querySelectorAll("tr")].forEach((tr,i)=>{
   const w=works[i];if(!w)return;
   const secondary=String(w.project_code_2||wtMap.get(String(w.work_type_id||""))?.project_code_2||"").trim();if(!secondary)return;
   const cell=tr.children[1];if(!cell||cell.querySelector(".rv-project-code-2"))return;
   const small=document.createElement("small");small.className="rv-project-code-2";small.textContent=`Доп. шифр: ${secondary}`;cell.appendChild(small);
  });
 }
 window.irReportsPage=async(oid,route={})=>{await base(oid,route);if(route?.mode==="view"&&route.reportId)await addSecondaryCode(oid,String(route.reportId))};
})();
