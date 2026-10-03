"use strict";
(()=>{
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const oid=()=>location.hash.match(/\/objects\/object\/(\d+)/)?.[1]||"";
 const api=key=>{const id=oid();return id?irProject.data.forObject(id).section(key):null};
 const set=(root,name,value)=>{const e=root.querySelector(`[name="${name}"]`);if(e)e.value=value??""};
 async function reports(){const a=api("reports");return a?await a.list().catch(()=>[]):[]}
 async function recordById(id){const rows=await reports();return rows.find(r=>String(r.id)===String(id))||null}
 function addRows(key,count){for(let i=1;i<count;i++)document.querySelector(`[data-add="${key}"]`)?.click()}
 async function openEditor(id){
  const objectId=oid(),rec=await recordById(id);if(!objectId||!rec)return alert("Отчёт не найден.");
  history.pushState(null,"",`#/objects/object/${objectId}/reports/${id}/edit`);
  await window.irReportsPage(objectId,{mode:"new"});
  const form=document.getElementById("dailyReportForm");if(!form)return alert("Не удалось открыть форму редактирования.");
  const d=rec.data||{};form.dataset.reportId=String(id);
  const h=document.querySelector(".report-form-head h1");if(h)h.textContent=`Редактирование ежедневного отчёта #${id}`;
  document.querySelectorAll(".report-save").forEach(b=>b.textContent="Сохранить изменения");
  const back=()=>location.hash=`/objects/object/${objectId}/reports`;
  document.getElementById("reportFormBack").onclick=back;document.getElementById("reportCancel").onclick=back;
  set(form,"date",d.date||d.report_date);set(form,"weather",typeof d.weather==="string"?d.weather:d.weather?.text);set(form,"wind",d.wind);set(form,"note",d.note);
  const workers=Array.isArray(d.workers)?d.workers:Array.isArray(d.people)?d.people:[];addRows("workers",workers.length);[...form.querySelectorAll(".worker-row")].forEach((r,i)=>{const x=workers[i];if(!x){if(i>0)r.remove();return}set(r,"worker_role",x.role||x.name);set(r,"worker_count",x.count||1)});
  const resp=Array.isArray(d.responsible)?d.responsible:[];addRows("responsible",resp.length);[...form.querySelectorAll(".responsible-row")].forEach((r,i)=>{const x=resp[i];if(!x){if(i>0)r.remove();return}set(r,"responsible_role",x.role);set(r,"responsible_name",x.name)});
  const equip=Array.isArray(d.equipment)?d.equipment:[];addRows("equipment",equip.length);[...form.querySelectorAll(".equipment-row")].forEach((r,i)=>{const x=equip[i];if(!x){if(i>0)r.remove();return}set(r,"equipment_name",x.name);set(r,"equipment_count",x.count||1)});
  const works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];addRows("works",works.length);[...form.querySelectorAll(".work-row")].forEach((r,i)=>{const x=works[i];if(!x){if(i>0)r.remove();return}set(r,"work_type_id",x.work_type_id);r.querySelector('[name="work_type_id"]')?.dispatchEvent(new Event("change"));set(r,"project_code",x.project_code);set(r,"unit",x.unit);set(r,"mark_id",x.mark_id);set(r,"mark_search",`${x.mark||""}${x.name?" — "+x.name:""}`);set(r,"qty",x.qty);set(r,"volume",x.volume)});
  form.onsubmit=async e=>{
   e.preventDefault();const fd=new FormData(form),wtApi=api("work-types"),marksApi=api("marks"),reportApi=api("reports"),[wtRows,markRows]=await Promise.all([wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]);
   const workersNow=[...form.querySelectorAll(".worker-row")].map(r=>({role:r.querySelector('[name="worker_role"]').value,count:num(r.querySelector('[name="worker_count"]').value)})).filter(x=>x.role&&x.count);
   const responsibleNow=[...form.querySelectorAll(".responsible-row")].map(r=>({role:r.querySelector('[name="responsible_role"]').value,name:r.querySelector('[name="responsible_name"]').value})).filter(x=>x.role||x.name);
   const equipmentNow=[...form.querySelectorAll(".equipment-row")].map(r=>({name:r.querySelector('[name="equipment_name"]').value,count:num(r.querySelector('[name="equipment_count"]').value)})).filter(x=>x.name&&x.count);
   const worksNow=[...form.querySelectorAll(".work-row")].map(r=>{const wid=r.querySelector('[name="work_type_id"]').value,mid=r.querySelector('[name="mark_id"]').value,w=wtRows.find(z=>String(z.id)===String(wid)),m=markRows.find(z=>String(z.id)===String(mid)),md=m?.data||{},unitVolume=num(md.unit_volume??md.volume_one),qty=num(r.querySelector('[name="qty"]').value);return{work_type_id:wid,work_type:w?.data?.work_type||w?.title||"",project_code:w?.data?.project_code||r.querySelector('[name="project_code"]').value,unit:w?.data?.unit||r.querySelector('[name="unit"]').value,mark_id:mid,mark:md.mark||m?.title||r.querySelector('[name="mark_search"]').value.split(" — ")[0],name:md.name||"",qty,unit_volume:unitVolume,volume:qty*unitVolume}}).filter(x=>x.work_type_id&&(x.mark_id||x.qty));
   const oldBy={},newBy={};for(const w of works)if(w.mark_id)oldBy[w.mark_id]=(oldBy[w.mark_id]||0)+num(w.qty);for(const w of worksNow)if(w.mark_id)newBy[w.mark_id]=(newBy[w.mark_id]||0)+num(w.qty);
   for(const [mid,q] of Object.entries(newBy)){const m=markRows.find(x=>String(x.id)===String(mid)),md=m?.data||{},total=num(md.qty??md.count),mounted=num(md.mounted??md.done),available=Math.max(0,total-mounted+(oldBy[mid]||0));if(q>available)return alert(`По марке ${md.mark||m?.title||""} доступно ${available}, а указано ${q}.`)}
   await reportApi.update(id,{record_type:rec.record_type||"item",title:`Отчёт ${fd.get("date")||""}`,data:{...d,date:fd.get("date"),weather:fd.get("weather"),wind:fd.get("wind"),workers:workersNow,responsible:responsibleNow,equipment:equipmentNow,items:worksNow,note:fd.get("note"),photos:d.photos||[]}});
   if(window.irSyncMountedFromReports)await window.irSyncMountedFromReports(objectId);
   location.hash=`/objects/object/${objectId}/reports`;
  };
 }
 document.addEventListener("click",e=>{const b=e.target.closest(".report-edit");if(!b)return;const row=b.closest(".report-row"),id=row?.dataset.reportId;if(!id)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openEditor(id).catch(err=>{console.error(err);alert("Не удалось открыть форму редактирования: "+(err?.message||err))})},true);
})();