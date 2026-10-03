"use strict";
(()=>{
 let busy=false;
 const getOid=()=>{const m=location.hash.match(/objects\/object\/([^/]+)/);return m?m[1]:null};
 const getApi=key=>{const id=getOid();return id?irProject.data.forObject(id).section(key):null};
 const records=async()=>{const api=getApi("reports");if(!api)return[];const rows=await api.list().catch(()=>[]);return rows.map((r,i)=>({raw:r,id:r.id,title:r.title||"",...(r.data||{}),_sort:i})).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||b._sort-a._sort)};
 async function refresh(){const id=getOid();if(id&&window.irReportsPage)await window.irReportsPage(id)}
 const val=(root,name,value)=>{const e=root.querySelector(`[name="${name}"]`);if(e)e.value=value??""};
 const num=v=>Number(String(v??0).replace(",","."))||0;
 async function openEditor(rec){
  const api=getApi("reports"),current=await api.get(rec.id).catch(()=>rec.raw),d=current?.data||rec;
  document.getElementById("reportNew")?.click();
  await new Promise(r=>setTimeout(r,0));
  const form=document.getElementById("dailyReportForm");if(!form)return alert("Не удалось открыть форму редактирования.");
  const title=document.querySelector(".report-form-head h1");if(title)title.textContent="Редактирование ежедневного отчёта";
  val(form,"date",d.date||d.report_date);val(form,"weather",typeof d.weather==="string"?d.weather:d.weather?.text);val(form,"wind",d.wind);val(form,"note",d.note);
  const fillRows=(selector,items,addKey,fill)=>{const list=[...form.querySelectorAll(selector)];for(let i=1;i<items.length;i++)document.querySelector(`[data-add="${addKey}"]`)?.click();[...form.querySelectorAll(selector)].forEach((row,i)=>{const x=items[i];if(x)fill(row,x);else if(i>0)row.remove()})};
  fillRows(".worker-row",d.workers||d.people||[],"workers",(r,x)=>{val(r,"worker_role",x.role||x.name);val(r,"worker_count",x.count||1)});
  fillRows(".responsible-row",d.responsible||[],"responsible",(r,x)=>{val(r,"responsible_role",x.role);val(r,"responsible_name",x.name)});
  fillRows(".equipment-row",d.equipment||[],"equipment",(r,x)=>{val(r,"equipment_name",x.name);val(r,"equipment_count",x.count||1)});
  const works=d.items||d.works||[];fillRows(".work-row",works,"works",(r,x)=>{val(r,"work_type_id",x.work_type_id);r.querySelector('[name="work_type_id"]')?.dispatchEvent(new Event("change"));val(r,"project_code",x.project_code);val(r,"unit",x.unit);val(r,"mark_id",x.mark_id);val(r,"mark_search",`${x.mark||""}${x.name?" — "+x.name:""}`);val(r,"qty",x.qty);val(r,"volume",x.volume)});
  const oldSubmit=form.onsubmit;form.onsubmit=null;
  form.addEventListener("submit",async e=>{e.preventDefault();e.stopImmediatePropagation();const fd=new FormData(form);
   const workers=[...form.querySelectorAll(".worker-row")].map(r=>({role:r.querySelector('[name="worker_role"]').value,count:num(r.querySelector('[name="worker_count"]').value)})).filter(x=>x.role&&x.count);
   const responsible=[...form.querySelectorAll(".responsible-row")].map(r=>({role:r.querySelector('[name="responsible_role"]').value,name:r.querySelector('[name="responsible_name"]').value})).filter(x=>x.role||x.name);
   const equipment=[...form.querySelectorAll(".equipment-row")].map(r=>({name:r.querySelector('[name="equipment_name"]').value,count:num(r.querySelector('[name="equipment_count"]').value)})).filter(x=>x.name&&x.count);
   const workTypes=await getApi("work-types").list().catch(()=>[]),marks=await getApi("marks").list().catch(()=>[]);
   const worksNow=[...form.querySelectorAll(".work-row")].map(r=>{const wid=r.querySelector('[name="work_type_id"]').value,w=workTypes.find(z=>String(z.id)===String(wid)),mid=r.querySelector('[name="mark_id"]').value,m=marks.find(z=>String(z.id)===String(mid));return{work_type_id:wid,work_type:w?.data?.work_type||w?.title||"",project_code:w?.data?.project_code||r.querySelector('[name="project_code"]').value,unit:w?.data?.unit||r.querySelector('[name="unit"]').value,mark_id:mid,mark:m?.data?.mark||m?.title||r.querySelector('[name="mark_search"]').value.split(" — ")[0],name:m?.data?.name||"",qty:r.querySelector('[name="qty"]').value,unit_volume:m?.data?.unit_volume??m?.data?.volume_one??0,volume:r.querySelector('[name="volume"]').value}}).filter(x=>x.work_type_id&&(x.mark_id||x.qty));
   await api.update(rec.id,{record_type:current?.record_type||"item",title:`Отчёт ${fd.get("date")||""}`,data:{...d,date:fd.get("date"),weather:fd.get("weather"),wind:fd.get("wind"),workers,responsible,equipment,items:worksNow,note:fd.get("note"),photos:d.photos||[]}});
   await refresh();
  },true);
 }
 async function enhance(){if(busy||!document.querySelector(".reports-page")||!document.querySelector("#reportNew"))return;const els=[...document.querySelectorAll(".report-row")];if(!els.length||els.every(x=>x.dataset.actionsReady))return;busy=true;try{const data=await records();els.forEach((row,i)=>{if(row.dataset.actionsReady)return;const rec=data[i];if(!rec)return;row.dataset.actionsReady="1";const side=row.querySelector(".report-side");if(!side)return;const actions=document.createElement("div");actions.className="report-actions";actions.innerHTML='<button type="button" class="report-action report-edit" title="Редактировать">✎</button><button type="button" class="report-action report-copy" title="Копировать">⧉</button><button type="button" class="report-action report-delete" title="Удалить">⌫</button>';side.appendChild(actions);
   actions.querySelector(".report-edit").onclick=e=>{e.stopPropagation();openEditor(rec).catch(err=>{console.error(err);alert("Ошибка открытия отчёта: "+err.message)})};
   actions.querySelector(".report-copy").onclick=async e=>{e.stopPropagation();const api=getApi("reports"),current=await api.get(rec.id).catch(()=>rec.raw),d=current?.data||rec;await api.create({record_type:current?.record_type||"item",title:(current?.title||rec.title||"Отчёт")+" — копия",data:{...d}});await refresh()};
   actions.querySelector(".report-delete").onclick=async e=>{e.stopPropagation();if(!confirm("Удалить этот ежедневный отчёт?"))return;await getApi("reports").remove(rec.id);await refresh()};
  })}catch(e){console.error("report actions",e)}finally{busy=false}}
 const observer=new MutationObserver(()=>enhance());observer.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener("hashchange",()=>setTimeout(enhance,50));setTimeout(enhance,50);
})();