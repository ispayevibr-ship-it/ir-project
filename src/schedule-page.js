"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
 const route=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/schedule\/?$/)?.[1]||"";
 window.irSchedulePage=async oid=>{
  document.body.classList.remove("ir-object-overview");
  const app=document.getElementById("app"),o=await irProject.data.objects.get(oid);if(!app||!o)return;
  const scheduleApi=irProject.data.forObject(oid).section("schedule"),workApi=irProject.data.forObject(oid).section("work-types");
  let rows=await scheduleApi.list().catch(()=>[]),workTypes=await workApi.list().catch(()=>[]);
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("schedule"):false;
  const sortRows=()=>rows.sort((a,b)=>String(a.data?.start_date||"").localeCompare(String(b.data?.start_date||""))||Number(a.id)-Number(b.id));
  const optionText=w=>{const d=w.data||{};return `${d.work_type||w.title||"Без названия"}${d.project_code?` · ${d.project_code}`:""}`};
  function rowHtml(r,i){const d=r.data||{};return `<div class="schedule-row" data-id="${r.id}"><div class="schedule-num">${i+1}</div><div><span>Вид работы</span><b>${esc(d.work_type||r.title||"—")}</b></div><div><span>Шифр</span><b>${esc(d.project_code||"—")}</b></div><div><span>Дата начала</span><b>${fmt(d.start_date)}</b></div><div><span>Дата окончания</span><b>${fmt(d.end_date)}</b></div>${canEdit()?`<div class="schedule-actions"><button type="button" data-schedule-edit="${r.id}">Редактировать</button><button type="button" class="danger" data-schedule-delete="${r.id}">Удалить</button></div>`:"<div></div>"}</div>`}
  function draw(){
   sortRows();
   app.innerHTML=`<div class="schedule-page"><div class="schedule-head"><button class="back" id="scheduleBack">← Назад</button><div><h1>График работ</h1><p>${esc(o.name||"")}</p></div>${canEdit()?'<button type="button" class="primary" id="scheduleAdd">＋ Добавить срок</button>':""}</div><div class="schedule-card"><div class="schedule-table-head"><span>№</span><span>Вид работы</span><span>Шифр</span><span>Дата начала</span><span>Дата окончания</span><span></span></div><div class="schedule-list">${rows.length?rows.map(rowHtml).join(""):'<div class="schedule-empty">График работ пока не заполнен</div>'}</div></div>${canEdit()?`<dialog id="scheduleDialog" class="schedule-dialog"><form id="scheduleForm"><input type="hidden" name="id"><div class="form-heading"><div><h2 id="scheduleDialogTitle">Добавить срок</h2><p class="form-subtitle">Плановые даты выполнения выбранного вида работ</p></div><button type="button" class="dialog-x" id="scheduleX">×</button></div><label>Вид работы / шифр<select name="work_type_id" required><option value="">Выберите вид работы</option>${workTypes.map(w=>`<option value="${w.id}">${esc(optionText(w))}</option>`).join("")}</select></label><div class="schedule-date-grid"><label>Дата начала<input type="date" name="start_date" required></label><label>Дата окончания<input type="date" name="end_date" required></label></div><div class="schedule-form-error" id="scheduleError" hidden></div><div class="actions"><button type="button" id="scheduleCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`:""}</div>`;
   document.getElementById("scheduleBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   if(!canEdit())return;
   const dialog=document.getElementById("scheduleDialog"),form=document.getElementById("scheduleForm"),error=document.getElementById("scheduleError");
   const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.work_type_id.value=r?.data?.work_type_id||"";form.elements.start_date.value=r?.data?.start_date||"";form.elements.end_date.value=r?.data?.end_date||"";document.getElementById("scheduleDialogTitle").textContent=r?"Редактировать срок":"Добавить срок";dialog.showModal()};
   document.getElementById("scheduleAdd").onclick=()=>{if(!workTypes.length){alert("Сначала добавьте хотя бы один вид работы в разделе «Виды работ».");return}open()};
   document.getElementById("scheduleX").onclick=()=>dialog.close();document.getElementById("scheduleCancel").onclick=()=>dialog.close();
   document.querySelectorAll("[data-schedule-edit]").forEach(b=>b.onclick=()=>open(rows.find(r=>String(r.id)===b.dataset.scheduleEdit)));
   document.querySelectorAll("[data-schedule-delete]").forEach(b=>b.onclick=async()=>{const r=rows.find(x=>String(x.id)===b.dataset.scheduleDelete);if(!r)return;if(!confirm(`Удалить срок для «${r.data?.work_type||r.title||""}»?`))return;await scheduleApi.remove(r.id);rows=await scheduleApi.list().catch(()=>[]);draw()});
   form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=fd.get("id"),wid=String(fd.get("work_type_id")||""),start=String(fd.get("start_date")||""),end=String(fd.get("end_date")||"");if(end<start){error.textContent="Дата окончания не может быть раньше даты начала.";error.hidden=false;return}const wt=workTypes.find(w=>String(w.id)===wid);if(!wt){error.textContent="Выберите вид работы.";error.hidden=false;return}const duplicate=rows.find(r=>String(r.data?.work_type_id||"")===wid&&String(r.id)!==String(id||""));if(duplicate){error.textContent="Для этого вида работ график уже задан. Откройте существующую строку и отредактируйте её.";error.hidden=false;return}const d=wt.data||{},payload={record_type:"schedule_item",title:d.work_type||wt.title||"",data:{work_type_id:Number(wt.id),work_type:d.work_type||wt.title||"",project_code:d.project_code||"",start_date:start,end_date:end}};if(id)await scheduleApi.update(id,payload);else await scheduleApi.create(payload);rows=await scheduleApi.list().catch(()=>[]);dialog.close();draw()};
  }
  draw();
 };
 const baseSectionPage=typeof sectionPage==="function"?sectionPage:null;
 if(baseSectionPage){sectionPage=async(id,key)=>key==="schedule"?window.irSchedulePage(id):baseSectionPage(id,key)}
 const initial=route();if(initial)setTimeout(()=>window.irSchedulePage(initial),0);
})();