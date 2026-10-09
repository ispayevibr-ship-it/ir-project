"use strict";
window.irAdditionalWorksPage=async function(objectId,route={}){
 const oid=String(objectId||""),app=document.getElementById("app"),root=irProject.data.forObject(oid),reportsApi=root.section("reports");
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const unit=v=>String(v??"").trim()||"—";
 const number=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const value=v=>{const n=number(v);return n==null?"—":n.toLocaleString("ru-RU",{maximumFractionDigits:4})};
 const date=v=>{const t=String(v||"");if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(8,10)+"."+t.slice(5,7)+"."+t.slice(0,4);return t||"—"};
 const legacyId=(rid,index)=>"EW-"+String(rid)+"-"+String(index+1);
 const listRoute="/objects/object/"+encodeURIComponent(oid)+"/extra-works";
 const itemRoute=id=>listRoute+"/"+encodeURIComponent(id);
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
 const safeAct=act=>act&&typeof act==="object"&&typeof act.path==="string"&&act.path?{path:act.path,name:String(act.name||"Подписанный акт")}:null;
 const sections=await Promise.all([irProject.data.objects.get(oid),reportsApi.list()]);
 const [object,reportRows]=sections;
 if(!object){location.hash="/objects";return}
 const all=arr(reportRows).flatMap(report=>{
  const d=report.data||{},items=arr(d.additional_works);
  return items.map((w,index)=>({
   id:String(w?.id||w?.work_id||legacyId(report.id,index)),
   reportId:String(report.id),
   reportTitle:String(report.title||""),
   report,
   index,
   name:String(w?.name||"").trim(),
   qty:w?.qty??w?.count??"",
   volume:w?.volume??"",
   unit:unit(w?.unit),
   date:String(d.date||d.report_date||""),
   signedAct:safeAct(w?.signed_act),
   reportAct:safeAct(d.signed_act)
  })).filter(w=>w.name||String(w.qty).trim()||String(w.volume).trim());
 }).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.reportId)-Number(a.reportId)||a.index-b.index);
 // IDs must remain unique, including after legacy report copies.
 const byId=new Map();for(const entry of all){if(!byId.has(entry.id))byId.set(entry.id,entry)}
 const workId=String(route.workId||"");
 let search="";
 const head=caption=>'<div class="additional-works-top"><button type="button" id="additionalWorksBack" class="additional-works-back">← '+(workId?"К списку дополнительных работ":"К объекту")+'</button><div><h1>'+esc(caption)+'</h1><p>'+esc(object.name||"Объект")+'</p></div></div>';
 function openAct(path){
  return irProject.reportDocuments?.open?.(path).then(ok=>{if(ok===false)alert("Не удалось открыть акт: файл не найден.")}).catch(e=>alert("Не удалось открыть акт: "+String(e.message||e)))
 }
 function listView(){
  const matched=all.filter(w=>!search||[w.name,w.id,w.reportId,w.date,w.unit].join(" ").toLowerCase().includes(search.toLowerCase())),withActs=all.filter(w=>w.signedAct).length;
  app.innerHTML='<div class="additional-works-page">'+head("Доп. работы")+
   '<div class="aw-stats"><div><span>Всего дополнительных работ</span><b>'+all.length+'</b></div><div><span>Подписанные акты загружены</span><b>'+withActs+'</b></div><div><span>Без индивидуального акта</span><b>'+Math.max(0,all.length-withActs)+'</b></div></div>'+
   '<div class="aw-list-toolbar"><div><h2>Дополнительные работы из ежедневных отчётов</h2><p>Каждая запись имеет собственный ID. Нажмите на строку, чтобы открыть её карточку и акт.</p></div><input type="search" id="awSearch" placeholder="Поиск по названию, ID, отчёту…" value="'+esc(search)+'" aria-label="Поиск дополнительных работ"></div>'+
   '<div class="aw-list-wrap"><table class="aw-table"><thead><tr><th>ID</th><th>Дата отчёта</th><th>Дополнительная работа</th><th>Количество</th><th>Объём</th><th>Подписанный акт</th></tr></thead><tbody>'+
   (matched.length?matched.map(w=>'<tr data-aw-id="'+esc(w.id)+'" tabindex="0" role="link"><td><span class="aw-id">'+esc(w.id)+'</span></td><td>'+esc(date(w.date))+'</td><td><b>'+esc(w.name||"Без наименования")+'</b><small>Ежедневный отчёт · ID '+esc(w.reportId)+'</small></td><td>'+esc(value(w.qty))+' '+esc(w.unit)+'</td><td>'+esc(value(w.volume))+' '+esc(w.unit)+'</td><td><span class="aw-status '+(w.signedAct?"ok":"pending")+'">'+(w.signedAct?"✓ Загружен":"Не загружен")+'</span></td></tr>').join(""):'<tr><td colspan="6" class="aw-empty">Дополнительных работ'+(search?" по запросу не найдено":" в ежедневных отчётах пока нет")+'.</td></tr>')+
   '</tbody></table></div><p class="aw-help">Список формируется из сохранённых ежедневных отчётов объекта. Для добавления работы откройте нужный отчёт.</p></div>';
  document.getElementById("additionalWorksBack").onclick=()=>location.hash="/objects/object/"+oid;
  document.getElementById("awSearch").oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;listView();const i=document.getElementById("awSearch");i.focus();i.setSelectionRange(pos,pos)};
  document.querySelectorAll("[data-aw-id]").forEach(row=>{const go=()=>location.hash=itemRoute(row.dataset.awId);row.onclick=go;row.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}})
 }
 function detailView(entry){
  const act=entry.signedAct,reportAct=entry.reportAct;
  app.innerHTML='<div class="additional-works-page aw-detail">'+head("Дополнительная работа")+
   '<div class="aw-detail-head"><div><span>ID дополнительной работы</span><strong>'+esc(entry.id)+'</strong><h2>'+esc(entry.name||"Без наименования")+'</h2></div><span class="aw-status '+(act?"ok":"pending")+'">'+(act?"✓ Файл акта загружен":"Акт не загружен")+'</span></div>'+
   '<div class="aw-detail-metrics"><div><span>Дата ежедневного отчёта</span><b>'+esc(date(entry.date))+'</b></div><div><span>Количество</span><b>'+esc(value(entry.qty))+' '+esc(entry.unit)+'</b></div><div><span>Объём</span><b>'+esc(value(entry.volume))+' '+esc(entry.unit)+'</b></div><div><span>Отчёт</span><button id="awSourceReport">Открыть ежедневный отчёт #'+esc(entry.reportId)+' →</button></div></div>'+
   '<section class="aw-document"><div class="aw-document-heading"><div><h2>Подписанный акт</h2><p>Отдельный документ, закреплённый за этой дополнительной работой. PDF, JPG или PNG.</p></div></div>'+
   '<div class="aw-document-body"><div class="aw-file-icon">PDF</div><div class="aw-document-info"><b>'+esc(act?.name||"Подписанный акт не прикреплён")+'</b><small>'+(act?"Файл хранится в документах IR Project":"Выберите подписанный акт для этой работы")+'</small></div></div>'+
   '<div class="aw-document-actions">'+(act?'<button id="awOpenAct" class="aw-primary">Открыть акт</button>':'')+(canEdit()?'<button id="awUploadAct" class="'+(act?"":"aw-primary")+'">'+(act?"Заменить акт":"＋ Загрузить подписанный акт")+'</button>':'')+(act&&canEdit()?'<button id="awRemoveAct" class="aw-danger">Удалить акт</button>':'')+'</div><p id="awActionNote" class="aw-action-note" role="status" aria-live="polite"></p></section>'+
   (reportAct?'<section class="aw-legacy-document"><div><b>Общий акт ежедневного отчёта</b><p>Этот документ прикреплён к отчёту целиком и не считается индивидуальным актом дополнительной работы.</p></div><button id="awOpenReportAct">Открыть общий акт</button></section>':'')+
   '</div>';
  document.getElementById("additionalWorksBack").onclick=()=>location.hash=listRoute;
  document.getElementById("awSourceReport").onclick=()=>location.hash="/objects/object/"+oid+"/reports/"+entry.reportId;
  document.getElementById("awOpenAct")?.addEventListener("click",()=>openAct(act.path));
  document.getElementById("awOpenReportAct")?.addEventListener("click",()=>openAct(reportAct.path));
  const note=document.getElementById("awActionNote"),busy=new Set();
  async function saveAct(next){
   const previous=entry.signedAct,report=entry.report,current=arr(report.data?.additional_works);
   const latest=await reportsApi.get(entry.reportId);
   if(!latest)throw Error("Исходный отчёт не найден.");
   const works=arr(latest.data?.additional_works);
   const found=works.findIndex((w,i)=>String(w.id||w.work_id||legacyId(entry.reportId,i))===entry.id);
   if(found<0)throw Error("Работа больше не найдена в ежедневном отчёте.");
   const normalized=works.map((w,i)=>({...w,id:String(w.id||w.work_id||legacyId(entry.reportId,i))}));
   const latestAct=safeAct(normalized[found].signed_act);
   normalized[found]={...normalized[found],signed_act:next};
   await reportsApi.update(entry.reportId,{record_type:latest.record_type||"item",title:latest.title||"",data:{...(latest.data||{}),additional_works:normalized}});
   // Do not delete any shared or legacy report act automatically.
   if(latestAct?.path&&latestAct.path!==next?.path){
    const stillUsed=normalized.some(w=>w.signed_act?.path===latestAct.path)||latest.data?.signed_act?.path===latestAct.path;
    if(!stillUsed)await irProject.reportDocuments?.remove?.(latestAct.path).catch(()=>{});
   }
   entry.signedAct=next;
   detailView(entry);
   const success=document.getElementById("awActionNote");if(success)success.textContent=next?"Акт сохранён для этой дополнительной работы.":"Индивидуальный акт удалён из карточки."
  }
  const run=async(callback)=>{
   if(busy.size)return;busy.add("saving");
   document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=true);note.textContent="Сохраняем изменения…";
   try{await callback()}catch(error){note.textContent="Ошибка: "+String(error?.message||error);document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=false)}finally{busy.clear()}
  };
  document.getElementById("awUploadAct")?.addEventListener("click",()=>run(async()=>{
   const file=await irProject.reportDocuments?.selectAct?.();
   if(!file?.path){note.textContent="Загрузка отменена.";document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=false);return}
   try{await saveAct({path:file.path,name:file.name||"Подписанный акт"})}catch(e){await irProject.reportDocuments?.remove?.(file.path).catch(()=>{});throw e}
  }));
  document.getElementById("awRemoveAct")?.addEventListener("click",()=>{if(!confirm("Убрать подписанный акт из карточки этой работы?"))return;run(()=>saveAct(null))});
 }
 if(!workId){listView();return}
 const entry=byId.get(workId);
 if(!entry){app.innerHTML='<div class="additional-works-page aw-not-found">'+head("Дополнительная работа не найдена")+'<p>Запись удалена из ежедневного отчёта или её ID изменён.</p></div>';document.getElementById("additionalWorksBack").onclick=()=>location.hash=listRoute;return}
 detailView(entry)
};