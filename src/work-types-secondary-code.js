"use strict";
(()=>{
 const base=window.irWorkTypesPage;if(typeof base!=="function")return;
 async function enhance(oid){
  const form=document.getElementById("wtForm"),dialog=document.getElementById("wtDialog");if(!form||!dialog||form.dataset.secondaryCodeReady==="1")return;
  const api=irProject.data.forObject(oid).section("work-types"),main=form.querySelector('[name="project_code"]');if(!main)return;
  const label=document.createElement("label");label.innerHTML='Дополнительный шифр<input name="project_code_2" placeholder="Например: дополнительный шифр проекта">';main.closest("label")?.insertAdjacentElement("afterend",label);
  const input=form.querySelector('[name="project_code_2"]');form.dataset.secondaryCodeReady="1";
  const fill=async()=>{const id=String(form.elements.id?.value||"");if(!id){input.value="";return}const rows=await api.list().catch(()=>[]),r=rows.find(x=>String(x.id)===id);input.value=r?.data?.project_code_2||""};
  const observer=new MutationObserver(()=>{if(dialog.open)fill()});observer.observe(dialog,{attributes:true,attributeFilter:["open"]});
  form.addEventListener("submit",async e=>{
   e.preventDefault();e.stopImmediatePropagation();
   const fd=new FormData(form),id=String(fd.get("id")||""),workType=String(fd.get("work_type")||"").trim(),code=String(fd.get("project_code")||"").trim(),code2=String(fd.get("project_code_2")||"").trim(),unit=String(fd.get("unit")||"").trim();
   if(!workType||!code||!unit)return;
   const payload={record_type:"item",title:workType,data:{work_type:workType,project_code:code,project_code_2:code2,unit}};
   if(id)await api.update(id,payload);else await api.create(payload);
   dialog.close();await window.irWorkTypesPage(oid);
  },true);
 }
 window.irWorkTypesPage=async oid=>{await base(oid);await enhance(oid)};
})();
