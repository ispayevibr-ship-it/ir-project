"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const reportData=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const weatherText=r=>typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather?.condition||r.weather_text||"Не указана");
 const weatherIcon=w=>({"Ясно":"☀","Облачно":"☁","Дождь":"🌧","Снег":"🌨","Гроза":"⛈","Туман":"🌫"})[w]||"☁";
 const workersOf=r=>arr(r.workers).length?arr(r.workers):arr(r.people);
 const responsibleOf=r=>arr(r.responsible).length?arr(r.responsible):arr(r.responsibles);
 const peopleCount=r=>workersOf(r).reduce((s,x)=>s+num(x.count??x.qty),0);
 const equipmentCount=r=>arr(r.equipment).reduce((s,x)=>s+num(x.count??x.qty),0);
 const workValue=w=>num(w.volume??w.total_volume)||(num(w.qty??w.count??w.quantity)*num(w.unit_volume??w.volume1));
 const temperatureText=r=>{const raw=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp;if(raw===""||raw==null)return"";const n=num(raw);return`${n>0?"+":""}${fmt(n)}°C`};
 function groupedWorks(r){
  const map=new Map();
  for(const w of arr(r.items||r.works)){
   const key=[w.work_type_id||w.work_type||"",w.project_code||"",w.unit||""].join("|");
   if(!map.has(key))map.set(key,{name:w.work_type||w.type||"Работа",code:w.project_code||w.code||"",unit:w.unit||"",value:0,count:0});
   const x=map.get(key);x.value+=workValue(w);x.count++;
  }
  return [...map.values()];
 }
 async function readPhotos(r){
  const files=arr(r.photos).slice(0,12);
  const urls=await Promise.all(files.map(p=>irProject.images.read(p).catch(()=>"")));
  return urls.filter(Boolean);
 }
 function chip(title,value){return `<div class="oor-chip"><span>${esc(title)}</span><b>${esc(value)}</b></div>`}
 function fullReport(r,photos){
  const weather=weatherText(r),temp=temperatureText(r),workers=workersOf(r),responsible=responsibleOf(r),equipment=arr(r.equipment),works=arr(r.items||r.works),note=r.note||r.extra||"";
  const workRows=works.length?works.map(w=>`<tr><td><b>${esc(w.work_type||w.type||"Работа")}</b></td><td>${esc(w.project_code||w.code||"—")}</td><td>${esc(w.mark||"—")}${w.name?`<small>${esc(w.name)}</small>`:""}</td><td>${fmt(w.qty??w.count??w.quantity)}</td><td><b>${fmt(workValue(w))} ${esc(w.unit||"")}</b></td></tr>`).join(""):'<tr><td colspan="5" class="oor-empty-cell">Работы не указаны</td></tr>';
  const workersHtml=workers.length?workers.map(x=>chip(x.role||x.name||"Работник",`${fmt(x.count??x.qty)} чел.`)).join(""):'<span class="oor-muted">Не указаны</span>';
  const responsibleHtml=responsible.length?responsible.map(x=>chip(x.role||"Ответственный",x.name||"—")).join(""):'<span class="oor-muted">Не указаны</span>';
  const equipmentHtml=equipment.length?equipment.map(x=>chip(x.name||x.type||"Техника",`${fmt(x.count??x.qty)} ед.`)).join(""):'<span class="oor-muted">Не указана</span>';
  const photoHtml=photos.length?photos.map((src,i)=>`<div class="oor-photo"><img src="${src}" alt="Фото ${i+1}"><span>${i+1}</span></div>`).join(""):'<div class="oor-photo-empty">Фотографии не добавлены</div>';
  return `<article class="oor-latest" data-open-report="${esc(r.id)}"><div class="oor-latest-head"><div><span class="oor-kicker">ПОСЛЕДНИЙ ЕЖЕДНЕВНЫЙ ОТЧЁТ</span><h3>Отчёт за ${dmy(r.date||r.report_date)}</h3><p>Отчёт #${esc(r.id)}</p></div><button type="button" data-open-report-button="${esc(r.id)}">Открыть отчёт</button></div><div class="oor-summary"><div><span>Погода</span><b>${weatherIcon(weather)} ${esc(weather)}${temp?` · ${esc(temp)}`:""}</b><small>${r.wind?`Ветер: ${esc(r.wind)}`:"Ветер не указан"}</small></div><div><span>Работники</span><b>${fmt(peopleCount(r))} чел.</b></div><div><span>Техника</span><b>${fmt(equipmentCount(r))} ед.</b></div><div><span>Фотографии</span><b>${photos.length}</b></div></div><section class="oor-section"><div class="oor-section-title"><h4>Выполненные работы</h4><span>${works.length} работ</span></div><div class="oor-table-wrap"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка</th><th>Кол-во</th><th>Объём</th></tr></thead><tbody>${workRows}</tbody></table></div></section><div class="oor-three"><section class="oor-section"><h4>Работники</h4><div class="oor-chip-list">${workersHtml}</div></section><section class="oor-section"><h4>Ответственные лица</h4><div class="oor-chip-list">${responsibleHtml}</div></section><section class="oor-section"><h4>Техника</h4><div class="oor-chip-list">${equipmentHtml}</div></section></div>${note?`<section class="oor-section"><h4>Дополнительная информация</h4><div class="oor-note">${esc(note)}</div></section>`:""}<section class="oor-section"><div class="oor-section-title"><h4>Фотографии</h4><span>${photos.length} из 12</span></div><div class="oor-photo-grid">${photoHtml}</div></section></article>`;
 }
 function compactReport(r){
  const weather=weatherText(r),temp=temperatureText(r),groups=groupedWorks(r),shown=groups.slice(0,3),more=Math.max(0,groups.length-shown.length);
  const workHtml=shown.length?shown.map(g=>`<div class="oor-compact-work"><b>${esc(g.name)}</b><span>${g.code?`${esc(g.code)} · `:""}${fmt(g.value)} ${esc(g.unit)}</span></div>`).join(""):'<div class="oor-compact-work"><b>Работы не указаны</b></div>';
  return `<article class="oor-compact" data-open-report="${esc(r.id)}"><div class="oor-compact-date"><b>${dmy(r.date||r.report_date)}</b><span>Отчёт #${esc(r.id)}</span></div><div class="oor-compact-main">${workHtml}${more?`<small>+ ещё ${more}</small>`:""}</div><div class="oor-compact-meta"><span>${weatherIcon(weather)} ${esc(weather)}${temp?` · ${esc(temp)}`:""}</span><span>♟ ${fmt(peopleCount(r))} чел.</span><span>🏗 ${fmt(equipmentCount(r))} ед.</span></div><span class="oor-arrow">›</span></article>`;
 }
 async function apply(){
  const oid=objectId();if(!oid)return;
  const app=document.getElementById("app"),schedule=app.querySelector(".object-overview-dashboard");if(!schedule)return;
  app.querySelector(".object-overview-reports")?.remove();
  const root=irProject.data.forObject(oid),raw=await root.section("reports").list().catch(()=>[]);if(objectId()!==String(oid))return;
  const reports=raw.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id)).slice(0,5);
  const wrap=document.createElement("div");wrap.className="object-overview-reports";
  if(!reports.length){wrap.innerHTML=`<section class="oor-card"><div class="oor-head"><div><h2>Последние ежедневные отчёты</h2><p>Последние 5 отчётов по объекту</p></div><button type="button" data-all-reports>Все отчёты</button></div><div class="oor-empty">Раздел Ежедневные отчёты пуст</div></section>`;schedule.insertAdjacentElement("afterend",wrap);wrap.querySelector("[data-all-reports]").onclick=()=>location.hash=`/objects/object/${oid}/reports`;return}
  const photos=await readPhotos(reports[0]);if(objectId()!==String(oid))return;
  wrap.innerHTML=`<section class="oor-card"><div class="oor-head"><div><h2>Последние ежедневные отчёты</h2><p>Самый свежий отчёт раскрыт полностью · ещё ${Math.max(0,reports.length-1)} кратко</p></div><button type="button" data-all-reports>Все отчёты</button></div>${fullReport(reports[0],photos)}${reports.length>1?`<div class="oor-compact-list">${reports.slice(1).map(compactReport).join("")}</div>`:""}</section>`;
  schedule.insertAdjacentElement("afterend",wrap);
  wrap.querySelector("[data-all-reports]").onclick=()=>location.hash=`/objects/object/${oid}/reports`;
  wrap.querySelectorAll("[data-open-report]").forEach(el=>el.addEventListener("click",e=>{if(e.target.closest("button"))return;location.hash=`/objects/object/${oid}/reports/${el.dataset.openReport}`}));
  wrap.querySelectorAll("[data-open-report-button]").forEach(b=>b.onclick=e=>{e.stopPropagation();location.hash=`/objects/object/${oid}/reports/${b.dataset.openReportButton}`});
 }
 window.addEventListener("hashchange",()=>setTimeout(apply,120));
 setTimeout(apply,180);
})();
