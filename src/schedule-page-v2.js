"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
 const route=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/schedule\/?$/)?.[1]||"";
 const DAY=86400000;
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const nfmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const dateMs=v=>{const s=iso(v),t=s?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)?t:null};
 const todayMs=()=>{const d=new Date();return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const markTotal=x=>{const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(w?.qty??w?.count??w?.quantity)*num(w?.unit_volume??w?.volume_one)};
 window.irSchedulePage=async oid=>{
  document.body.classList.remove("ir-object-overview");
  const app=document.getElementById("app"),o=await irProject.data.objects.get(oid);if(!app||!o)return;
  const root=irProject.data.forObject(oid),scheduleApi=root.section("schedule"),workApi=root.section("work-types"),marksApi=root.section("marks"),reportsApi=root.section("reports");
  let [rows,workTypes,marks,reports]=await Promise.all([scheduleApi.list().catch(()=>[]),workApi.list().catch(()=>[]),marksApi.list().catch(()=>[]),reportsApi.list().catch(()=>[])]);
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("schedule"):false;
  const sortRows=()=>rows.sort((a,b)=>String(a.data?.start_date||"").localeCompare(String(b.data?.start_date||""))||Number(a.id)-Number(b.id));
  const optionText=w=>{const d=w.data||{},service=(d.accounting_type||"volume")==="service";return `${d.work_type||w.title||"Без названия"}${service?" · Услуга":d.project_code?` · ${d.project_code}`:""}`};
  const catalog=()=>arr(workTypes).map(w=>{const d=w.data||{};return{id:String(w.id),name:d.work_type||w.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:(d.accounting_type==="service"||norm(d.unit)==="услуга")?"service":"volume"}});
  const resolveWork=(rawId,name,code)=>{const list=catalog(),id=String(rawId||""),byId=list.find(x=>x.id===id);if(byId){const nameOk=!name||norm(byId.name)===norm(name),codeOk=!code||!byId.code||norm(byId.code)===norm(code);if(nameOk&&codeOk)return byId}let hit=list.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));if(!hit&&code){const a=list.filter(x=>norm(x.code)===norm(code));if(a.length===1)hit=a[0]}if(!hit&&name){const a=list.filter(x=>norm(x.name)===norm(name));if(a.length===1)hit=a[0]}return hit||{id,name:name||"Без названия",code:code||"",unit:""}};
  function analysisMaps(){
   const plans=new Map(),facts=new Map(),days=new Map(),first=new Map();
   for(const r of arr(marks)){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type,d.project_code);if(!m?.id)continue;plans.set(m.id,(plans.get(m.id)||0)+markTotal(r))}
   for(const r of arr(reports)){const d=r.data||r,day=iso(d.date||d.report_date);for(const w of arr(d.items||d.works)){const m=resolveWork(w.work_type_id,w.work_type||w.type,w.project_code||w.code),v=reportVolume(w);if(!m?.id||v<=0)continue;facts.set(m.id,(facts.get(m.id)||0)+v);if(day){if(!days.has(m.id))days.set(m.id,new Set());days.get(m.id).add(day);const t=dateMs(day);if(t!==null&&(first.get(m.id)==null||t<first.get(m.id)))first.set(m.id,t)}}}
   return{plans,facts,days,first}
  }
  function analysisFor(r){
   const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type||r.title,d.project_code),id=m.id,start=dateMs(d.start_date),end=dateMs(d.end_date),today=todayMs(),unit=m.unit||"ед.";
   if(m.accounting_type==="service"){
    let completed=false,doneDate="";
    for(const rec of arr(reports)){const rd=rec.data||rec,date=iso(rd.date||rd.report_date);for(const w of arr(rd.items||rd.works)){const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===norm(m.name));if(!same)continue;const done=w.completed===true||w.service_completed===true||String(w.status||"").toLowerCase()==="done"||String(w.status||"").toLowerCase()==="выполнено";if(done){completed=true;if(!doneDate||date>doneDate)doneDate=date}}}
    let tone="neutral",status="Не выполнено",note="Услуга ещё не отмечена выполненной в ежедневном отчёте.";
    if(completed){tone="good";status="Выполнено";note=doneDate?`Выполнение отмечено в отчёте от ${fmt(doneDate)}.`:"Услуга выполнена."}
    else if(end!==null&&today>end){tone="bad";status="Просрочено";note="Плановый срок услуги истёк, выполнение не отмечено."}
    else if(start!==null&&today<start){status="Ещё не начато";note=`По графику услуга начинается ${fmt(d.start_date)}.`}
    return{service:true,start,end,completed,doneDate,tone,status,note}
   }
   const maps=analysisMaps();
   const plan=maps.plans.get(id)||0,fact=maps.facts.get(id)||0,remain=Math.max(0,plan-fact),workedDays=maps.days.get(id)?.size||0,avg=workedDays?fact/workedDays:0;
   const totalDays=start!==null&&end!==null&&end>=start?Math.max(1,Math.floor((end-start)/DAY)+1):0,elapsed=totalDays?(today<start?0:today>end?totalDays:Math.floor((today-start)/DAY)+1):0,planPct=totalDays?clamp(elapsed/totalDays*100,0,100):0,factPct=plan>0?clamp(fact/plan*100,0,100):0,deviation=factPct-planPct,daysLeft=end===null?0:(today>end?0:Math.max(0,Math.ceil((end-today)/DAY))),need=daysLeft>0?remain/daysLeft:remain>0?Infinity:0;
   const firstMs=maps.first.get(id),calendarDays=firstMs!=null?Math.max(1,Math.floor((Math.max(firstMs,today)-firstMs)/DAY)+1):0,calendarRate=calendarDays?fact/calendarDays:0;
   let forecast="Нет темпа",forecastMs=null;if(plan<=0)forecast="Нет плана";else if(remain<=1e-9){forecast="Завершено";forecastMs=today}else if(calendarRate>0){forecastMs=today+Math.ceil(remain/calendarRate)*DAY;forecast=fmt(new Date(forecastMs).toISOString().slice(0,10))}
   let tone="neutral",status="Не начато",note="Фактические объёмы ещё не отражены в ежедневных отчётах.";
   if(plan<=0){status="Нет плана";note="В ведомости марок нет планового объёма для этого вида работ."}
   else if(factPct>=99.999){tone="good";status="Выполнено";note="Плановый объём выполнен."}
   else if(end!==null&&today>end&&remain>0){tone="bad";status="Срок истёк";note=`До выполнения плана осталось ${nfmt(remain)} ${unit}; плановый срок уже завершён.`}
   else if(start!==null&&today<start){status="Ещё не начато";note=`Работы по графику начинаются ${fmt(d.start_date)}.`}
   else if(deviation>=-3){tone="good";status="По графику";note=avg>0?`Текущий средний темп — ${nfmt(avg)} ${unit}/день.`:"Работы идут в пределах планового графика."}
   else if(deviation>=-10){tone="warn";status="Есть риск";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; требуется темп ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"срок истёк"}.`}
   else{tone="bad";status="Отставание";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; для выхода в срок требуется ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"пересмотр срока"}.`}
   return{unit,plan,fact,remain,workedDays,avg,need,daysLeft,planPct,factPct,deviation,forecast,forecastMs,end,tone,status,note}
  }
  const metric=(label,value,sub="")=>`<div class="schedule-analysis-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>`;
  function analysisHtml(r){const a=analysisFor(r);if(a.service)return `<div class="schedule-analysis schedule-analysis-service tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ услуги</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics service">${metric("Тип учёта","Услуга")}${metric("Начало",a.start!==null?fmt(new Date(a.start).toISOString().slice(0,10)):"—")}${metric("Срок",a.end!==null?fmt(new Date(a.end).toISOString().slice(0,10)):"—")}${metric("Выполнено",a.completed?(a.doneDate?fmt(a.doneDate):"Да"):"Нет")}</div></div>`;const u=a.unit,needText=Number.isFinite(a.need)?`${nfmt(a.need)} ${u}/день`:a.remain>0?"Срок истёк":"0",dev=`${a.deviation>=0?"+":""}${String(Number(a.deviation.toFixed(1))).replace(".",",")}%`,progress=a.plan>0?`<div class="schedule-analysis-progress"><div class="schedule-analysis-progress-labels"><span>Факт <b>${nfmt(a.factPct)}%</b></span><span>План на сегодня <b>${nfmt(a.planPct)}%</b></span></div><div class="schedule-analysis-track"><i class="schedule-analysis-fact" style="width:${a.factPct.toFixed(2)}%"></i><i class="schedule-analysis-plan" style="left:${a.planPct.toFixed(2)}%"></i></div></div>`:"";return `<div class="schedule-analysis tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics">${metric("План",a.plan>0?`${nfmt(a.plan)} ${u}`:"—")}${metric("Выполнено",`${nfmt(a.fact)} ${u}`,a.plan>0?`${nfmt(a.factPct)}%`:"")}${metric("Осталось",a.plan>0?`${nfmt(a.remain)} ${u}`:"—")}${metric("Среднее / день",a.avg?`${nfmt(a.avg)} ${u}`:"—",a.workedDays?`${a.workedDays} дн. с работами`:"Нет факта")}${metric("Нужно / день",a.plan>0?needText:"—")}${metric("Дней осталось",a.daysLeft?String(a.daysLeft):a.remain>0?"0":"—")}${metric("Отклонение",a.plan>0?dev:"—")}${metric("Прогноз",a.forecast,a.forecastMs&&a.end&&a.forecastMs>a.end?"Позже плана":a.forecastMs&&a.end&&a.forecastMs<=a.end?"В пределах срока":"")}</div>${progress}</div>`}
  function rowHtml(r,i){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type||r.title,d.project_code),service=m.accounting_type==="service";return `<div class="schedule-row ${service?"schedule-service-row":""}" data-id="${r.id}"><div class="schedule-num">${i+1}</div><div><span>Вид работы</span><b>${esc(d.work_type||r.title||"—")}</b></div><div><span>Шифр</span><b>${service?"Услуга":esc(d.project_code||"—")}</b></div><div><span>Дата начала</span><b>${fmt(d.start_date)}</b></div><div><span>Дата окончания</span><b>${fmt(d.end_date)}</b></div>${canEdit()?`<div class="schedule-actions"><button type="button" data-schedule-edit="${r.id}">Редактировать</button><button type="button" class="danger" data-schedule-delete="${r.id}">Удалить</button></div>`:"<div></div>"}</div>${analysisHtml(r)}`}
  function draw(){
   sortRows();
   app.innerHTML=`<div class="schedule-page"><div class="wt-head schedule-head"><button class="back" id="scheduleBack">← Назад</button><div><h1>График работ</h1><p>${esc(o.name||"")}</p></div>${canEdit()?'<button type="button" class="primary" id="scheduleAdd">＋ Добавить срок</button>':""}</div><div class="schedule-card"><div class="schedule-table-head"><span>№</span><span>Вид работы</span><span>Шифр</span><span>Дата начала</span><span>Дата окончания</span><span></span></div><div class="schedule-list">${rows.length?rows.map(rowHtml).join(""):'<div class="schedule-empty">График работ пока не заполнен</div>'}</div></div>${canEdit()?`<dialog id="scheduleDialog" class="schedule-dialog"><form id="scheduleForm"><input type="hidden" name="id"><div class="form-heading"><div><h2 id="scheduleDialogTitle">Добавить срок</h2><p class="form-subtitle">Плановые даты выполнения выбранного вида работ</p></div><button type="button" class="dialog-x" id="scheduleX">×</button></div><label>Вид работы / шифр<select name="work_type_id" required><option value="">Выберите вид работы</option>${workTypes.map(w=>`<option value="${w.id}">${esc(optionText(w))}</option>`).join("")}</select></label><div class="schedule-date-grid"><label>Дата начала<input type="date" name="start_date" required></label><label>Дата окончания<input type="date" name="end_date" required></label></div><div class="schedule-form-error" id="scheduleError" hidden></div><div class="actions"><button type="button" id="scheduleCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`:""}</div>`;
   document.getElementById("scheduleBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   if(!canEdit())return;
   const dialog=document.getElementById("scheduleDialog"),form=document.getElementById("scheduleForm"),error=document.getElementById("scheduleError");
   const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.work_type_id.value=r?.data?.work_type_id||"";form.elements.start_date.value=r?.data?.start_date||"";form.elements.end_date.value=r?.data?.end_date||"";document.getElementById("scheduleDialogTitle").textContent=r?"Редактировать срок":"Добавить срок";dialog.showModal()};
   document.getElementById("scheduleAdd").onclick=()=>{if(!workTypes.length){alert("Сначала добавьте хотя бы один вид работы в разделе «Виды работ».");return}open()};
   document.getElementById("scheduleX").onclick=()=>dialog.close();document.getElementById("scheduleCancel").onclick=()=>dialog.close();
   document.querySelectorAll("[data-schedule-edit]").forEach(b=>b.onclick=()=>open(rows.find(r=>String(r.id)===b.dataset.scheduleEdit)));
   document.querySelectorAll("[data-schedule-delete]").forEach(b=>b.onclick=async()=>{const r=rows.find(x=>String(x.id)===b.dataset.scheduleDelete);if(!r)return;if(!confirm(`Удалить срок для «${r.data?.work_type||r.title||""}»?`))return;await scheduleApi.remove(r.id);rows=await scheduleApi.list().catch(()=>[]);draw()});
   form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=fd.get("id"),wid=String(fd.get("work_type_id")||""),start=String(fd.get("start_date")||""),end=String(fd.get("end_date")||"");if(end<start){error.textContent="Дата окончания не может быть раньше даты начала.";error.hidden=false;return}const wt=workTypes.find(w=>String(w.id)===wid);if(!wt){error.textContent="Выберите вид работы.";error.hidden=false;return}const duplicate=rows.find(r=>String(r.data?.work_type_id||"")===wid&&String(r.id)!==String(id||""));if(duplicate){error.textContent="Для этого вида работ график уже задан. Откройте существующую строку и отредактируйте её.";error.hidden=false;return}const d=wt.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",payload={record_type:"schedule_item",title:d.work_type||wt.title||"",data:{work_type_id:Number(wt.id),work_type:d.work_type||wt.title||"",accounting_type:service?"service":"volume",project_code:d.project_code||"",start_date:start,end_date:end}};if(id)await scheduleApi.update(id,payload);else await scheduleApi.create(payload);rows=await scheduleApi.list().catch(()=>[]);dialog.close();draw()};
  }
  draw();
 };
 const baseSectionPage=typeof sectionPage==="function"?sectionPage:null;
 if(baseSectionPage){sectionPage=async(id,key)=>key==="schedule"?window.irSchedulePage(id):baseSectionPage(id,key)}
 const initial=route();if(initial)setTimeout(()=>window.irSchedulePage(initial),0);
})();