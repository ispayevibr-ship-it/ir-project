"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const date=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:v};
 const sumPeople=d=>arr(d.workers).reduce((s,x)=>s+(Number(x.count)||1),0)+arr(d.people).reduce((s,x)=>s+(Number(x.count)||1),0);
 const sumEquipment=d=>arr(d.equipment).reduce((s,x)=>s+(Number(x.count)||1),0);
 const weather=d=>d.weather?.text||d.weather||d.weather_text||"Погода не указана";
 window.irReportsPage=async oid=>{
  const app=document.getElementById("app"),o=await irProject.data.objects.get(oid),api=irProject.data.forObject(oid).section("reports");
  let rows=await api.list().catch(()=>[]),query="";
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
  const items=()=>rows.map((r,i)=>({id:r.id,title:r.title||"",...(r.data||{}),_sort:i})).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||b._sort-a._sort);
  function draw(){const all=items(),shown=all.filter(x=>!query||`${x.date||x.report_date||""} ${x.note||x.description||""} ${arr(x.items).map(y=>y.name||y.work_type||"").join(" ")}`.toLowerCase().includes(query));
   app.innerHTML=`<div class="reports-page"><div class="reports-titlebar"><button class="back" id="reportsBack">← Назад</button><div><h1>Ежедневные отчёты</h1><p>${esc(o?.name||"")}</p></div>${canEdit()?'<button class="reports-new" id="reportNew">＋ Новый отчёт</button>':""}</div><div class="reports-summary"><div><span>Всего отчётов</span><b>${all.length}</b></div><div><span>Последний отчёт</span><b>${all.length?date(all[0].date||all[0].report_date):"—"}</b></div><div><span>Дней с работами</span><b>${new Set(all.map(x=>x.date||x.report_date).filter(Boolean)).size}</b></div></div><div class="reports-toolbar"><input id="reportsSearch" value="${esc(query)}" placeholder="Поиск по дате или выполненным работам…"></div><div class="reports-list">${shown.length?shown.map((x,i)=>card(x,all.indexOf(x)+1)).join(""):'<div class="reports-empty">Сохранённых ежедневных отчётов пока нет</div>'}</div></div>`;
   document.getElementById("reportsBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.getElementById("reportNew")?.addEventListener("click",()=>alert("Форму нового отчёта подключим следующим шагом. Сейчас перенесён только дизайн списка."));
   const s=document.getElementById("reportsSearch");s.oninput=e=>{query=e.target.value.toLowerCase();draw();const n=document.getElementById("reportsSearch");n.focus();n.setSelectionRange(n.value.length,n.value.length)};
  }
  function card(x,no){const people=sumPeople(x),tech=sumEquipment(x),photos=arr(x.photos||x.reportPhotos).length,works=arr(x.items||x.works),summary=works.slice(0,3).map(w=>w.name||w.work_type||w.title||w.mark).filter(Boolean).join(" · ")||x.description||x.note||"Работы не указаны";return `<article class="report-row" data-report="${x.id}"><div class="report-date"><b>${date(x.date||x.report_date)}</b><span>Отчёт №${no}</span></div><div class="report-main"><strong>${esc(summary)}</strong><div class="report-meta"><span>☁ ${esc(weather(x))}</span><span>♟ ${people} чел.</span><span>▣ ${tech} ед. техники</span>${photos?`<span>▧ ${photos} фото</span>`:""}</div></div><div class="report-side"><span>${works.length} ${works.length===1?"работа":"работ"}</span>${canEdit()?'<div><button title="Редактировать">✎</button><button class="danger" title="Удалить">×</button></div>':""}</div></article>`}
  draw();
 };
})();
