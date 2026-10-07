"use strict";
(()=>{
 const base=window.irWorkTypesPage;if(typeof base!=="function")return;
 async function enhance(oid){
  const form=document.getElementById("wtForm"),dialog=document.getElementById("wtDialog");if(!form||!dialog||form.dataset.secondaryCodeReady==="1")return;
  const api=irProject.data.forObject(oid).section("work-types"),main=form.querySelector('[name="project_code"]');if(!main)return;
  const label=document.createElement("label");label.setAttribute("data-volume-field","");label.innerHTML='Дополнительный шифр<input name="project_code_2" placeholder="Например: дополнительный шифр проекта">';main.closest("label")?.insertAdjacentElement("afterend",label);
  const input=form.querySelector('[name="project_code_2"]'),type=form.querySelector('[name="accounting_type"]');form.dataset.secondaryCodeReady="1";
  const sync=()=>{const service=type?.value==="service";label.hidden=service;if(service)input.value=""};
  const fill=async()=>{const id=String(form.elements.id?.value||"");if(!id){input.value="";sync();return}const rows=await api.list().catch(()=>[]),r=rows.find(x=>String(x.id)===id);input.value=r?.data?.project_code_2||"";sync()};
  const observer=new MutationObserver(()=>{if(dialog.open)fill()});observer.observe(dialog,{attributes:true,attributeFilter:["open"]});type?.addEventListener("change",sync);sync();
  form.addEventListener("submit",async e=>{
   e.preventDefault();e.stopImmediatePropagation();
   const fd=new FormData(form),id=String(fd.get("id")||""),workType=String(fd.get("work_type")||"").trim(),accounting=String(fd.get("accounting_type")||"volume"),service=accounting==="service",code=service?"":String(fd.get("project_code")||"").trim(),code2=service?"":String(fd.get("project_code_2")||"").trim(),unit=service?"":String(fd.get("unit")||"").trim();
   if(!workType||(!service&&(!code||!unit)))return;
   const payload={record_type:"item",title:workType,data:{work_type:workType,accounting_type:accounting,project_code:code,project_code_2:code2,unit}};
   if(id)await api.update(id,payload);else await api.create(payload);
   dialog.close();await window.irWorkTypesPage(oid);
  },true);
 }
 window.irWorkTypesPage=async oid=>{await base(oid);await enhance(oid)};
})();