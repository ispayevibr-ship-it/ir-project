/* #31: src/additional-works-page.js */
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
 let [object,reportRows]=sections;
 if(!object){location.hash="/objects";return}
 // Assign each old additional-work line its own permanent ID, retaining its report and data.
 if(canEdit()){
  const normalized=[];
  for(const report of arr(reportRows)){
   const previous=arr(report.data?.additional_works);
   if(!previous.some(w=>!w?.id&&!w?.work_id)){normalized.push(report);continue}
   const additional_works=previous.map((w,i)=>({...w,id:String(w?.id||w?.work_id||legacyId(report.id,i))}));
   try{
    await reportsApi.update(report.id,{record_type:report.record_type||"item",title:report.title||"",data:{...(report.data||{}),additional_works}});
    normalized.push({...report,data:{...(report.data||{}),additional_works}})
   }catch(error){normalized.push(report);console.warn("Не удалось закрепить ID доп. работ в отчёте "+report.id,error)}
  }
  reportRows=normalized
 }
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
  document.getElementById("awRemoveAct")?.addEventListener("click",()=>{if(!confirm("Убрать подписанный акт из карточки этой работы?"))return;return run(()=>saveAct(null))});
 }
 if(!workId){listView();return}
 const entry=byId.get(workId);
 if(!entry){app.innerHTML='<div class="additional-works-page aw-not-found">'+head("Дополнительная работа не найдена")+'<p>Запись удалена из ежедневного отчёта или её ID изменён.</p></div>';document.getElementById("additionalWorksBack").onclick=()=>location.hash=listRoute;return}
 detailView(entry)
};
;

/* #32: src/app.js */
"use strict";
const app=document.getElementById("app");
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
let displayedVersion="...";const el=id=>document.getElementById(id);const data=()=>irProject.data||irProject;const objectSection=(id,key)=>data().forObject(id).section(key);
async function refreshVersion(){try{displayedVersion=await irProject.updater.version()}catch{}const v=document.querySelector(".app-version");if(v)v.textContent=`IR Project v${displayedVersion}`;const homeVersion=el("homeInstalledVersion");if(homeVersion)homeVersion.textContent=`IR Project · версия ${displayedVersion}`}
function go(path){location.hash=path}function mb(v){return(Number(v||0)/1048576).toFixed(1).replace(".",",")}function versionHtml(){return `<div class="app-version">IR Project v${esc(displayedVersion)}</div>`}
function updateDialogHtml(){return `<dialog id="updateDialog" class="update-dialog"><h2 id="updateTitle">Проверка обновления</h2><p id="updateText">Проверяем наличие новой версии...</p><div id="updateProgress" class="update-progress" hidden><div id="updateBar"></div></div><div id="updateActions" class="actions"></div></dialog>`}
function updateRefs(){return{d:el("updateDialog"),title:el("updateTitle"),text:el("updateText"),progress:el("updateProgress"),bar:el("updateBar"),actions:el("updateActions")}}
function showUpdate(){if(window!==window.top){try{if(window.parent?.irTabUpdates?.open)return window.parent.irTabUpdates.open()}catch(e){}}const u=updateRefs();if(!u.d)return;u.d.showModal();u.title.textContent="Проверка обновления";u.text.textContent="Проверяем наличие новой версии...";u.progress.hidden=true;u.actions.innerHTML="";irProject.updater.check().catch(e=>showUpdateError(e.message))}
function showUpdateError(message){const u=updateRefs();if(!u.d)return;if(!u.d.open)u.d.showModal();u.title.textContent="Ошибка обновления";u.text.textContent=message||"Не удалось проверить обновление.";u.progress.hidden=true;u.actions.innerHTML='<button id="updateClose">Закрыть</button>';el("updateClose").onclick=()=>u.d.close()}
if(window===window.top)irProject.updater.onStatus(status=>{const u=updateRefs();if(!u.d)return;if(!u.d.open)u.d.showModal();if(status.type==="available"){u.title.textContent="Доступно обновление";u.text.textContent=`Доступна версия ${status.version}. Обновить IR Project?`;u.progress.hidden=true;u.actions.innerHTML='<button id="updateNo">Нет</button><button id="updateYes" class="primary">Да, обновить</button>';el("updateNo").onclick=()=>u.d.close();el("updateYes").onclick=()=>{u.title.textContent="Скачивание обновления";u.text.textContent="Подготовка к загрузке...";u.progress.hidden=false;u.bar.style.width="0%";u.actions.innerHTML="";irProject.updater.download().catch(e=>showUpdateError(e.message))}}else if(status.type==="current"){displayedVersion=status.version||displayedVersion;refreshVersion();u.title.textContent="Обновление не требуется";u.text.textContent=`У вас установлена последняя версия IR Project ${displayedVersion}.`;u.progress.hidden=true;u.actions.innerHTML='<button id="updateClose">Закрыть</button>';el("updateClose").onclick=()=>u.d.close()}else if(status.type==="progress"){u.title.textContent="Скачивание обновления";u.text.textContent=`Загружено ${status.total?`${mb(status.transferred)} МБ из ${mb(status.total)} МБ`:mb(status.transferred)+" МБ"} — ${status.percent}%`;u.progress.hidden=false;u.bar.style.width=`${status.percent}%`}else if(status.type==="downloaded"){u.title.textContent="Обновление готово";u.text.textContent=`Версия ${status.version} скачана.`;u.progress.hidden=true;u.actions.innerHTML='<button id="installUpdate" class="primary">Установить и перезапустить</button>';el("installUpdate").onclick=()=>irProject.updater.install()}else if(status.type==="error")showUpdateError(status.message)});
function objectCard(o){const active=o.status!=="Завершен";return `<article class="object-card" data-object="${o.id}"><div class="object-cover"><div class="object-cover-top"><span class="status ${active?"active":"done"}"><i></i>${esc(o.status||"В работе")}</span><span class="open-arrow">↗</span></div><div class="object-cover-title"><h2>${esc(o.name)}</h2><p>${esc(o.address||"Адрес не указан")}</p></div></div><div class="object-info"><div><span>Заказчик</span><strong>${esc(o.customer||"—")}</strong></div><div><span>Генподрядчик</span><strong>${esc(o.general_contractor||"—")}</strong></div></div></article>`}
function sectionChecks(values={}){return Object.entries(sectionNames).map(([key,name])=>`<label class="section-check"><input type="checkbox" data-form-section="${key}" ${values[key]!==false?"checked":""}><span><strong>${esc(name)}</strong><small>${values[key]!==false?"Раздел включён":"Раздел отключён"}</small></span></label>`).join("")}
function formHtml(){return `<dialog id="formDialog" class="object-dialog"><form id="objectForm"><input type="hidden" name="id"><div class="form-heading"><div><h2 id="formTitle">Новый объект</h2><p class="form-subtitle">Основная информация и доступные разделы объекта</p></div><button type="button" class="dialog-x" id="dialogX">×</button></div><div class="form-grid"><label>Название<input name="name" required></label><label>Статус<select name="status"><option>В работе</option><option>Завершен</option></select></label><label>Заказчик<input name="customer" required></label><label>Генподрядчик<input name="general_contractor" placeholder="Наименование генподрядчика"></label><label class="wide">Адрес<input name="address" required></label></div><div class="file-row object-media-fields"><label>Фото объекта<small class="file-hint">Размер в программе: 900×155 px. Сохраняется только подготовленная версия.</small><div class="asset-preview asset-preview-cover" id="photoPreview"><span>Предпросмотр фото</span></div><div><button type="button" id="photoButton">Выбрать фото</button><span id="photoName">Не выбрано</span></div></label><label>Баннер объекта<small class="file-hint">Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.</small><div class="asset-preview asset-preview-banner" id="bannerPreview"><span>Предпросмотр баннера</span></div><div><button type="button" id="bannerButton">Выбрать баннер</button><span id="bannerName">Не выбрано</span></div></label></div><div class="form-section-title"><div><strong>Разделы объекта</strong><span>Выберите, какие разделы будут доступны в этом объекте</span></div><button type="button" id="toggleAllSections">Включить все</button></div><div class="form-sections" id="formSections">${sectionChecks()}</div><div class="actions split"><button type="button" id="deleteObject" class="danger" hidden>Удалить объект</button><div><button type="button" id="cancel">Отмена</button><button type="submit" class="primary" id="saveObject">Создать объект</button></div></div></form></dialog>`}
function readSectionChecks(){const out={};document.querySelectorAll("[data-form-section]").forEach(x=>out[x.dataset.formSection]=x.checked);return out}function syncSectionLabels(){document.querySelectorAll("[data-form-section]").forEach(x=>{const small=x.closest(".section-check")?.querySelector("small");if(small)small.textContent=x.checked?"Раздел включён":"Раздел отключён"})}
async function objectPhotoMap(objectId){const rows=await objectSection(objectId,"photos").list();return Object.fromEntries(rows.filter(x=>["cover","banner"].includes(x.record_type)||["cover","banner"].includes(x.data?.photo_type)).map(x=>[x.record_type!=="item"?x.record_type:x.data.photo_type,x]))}
async function saveObjectPhoto(objectId,type,file,current){const old=current?.data?.file_path||current?.data?.file||"",payload={record_type:type,title:type,data:{photo_type:type,file_path:file}},saved=current?await objectSection(objectId,"photos").update(current.id,payload):await objectSection(objectId,"photos").create(payload);if(old&&old!==file)try{await irProject.images.remove(old)}catch{}return saved}
async function objectActivity(id){let lastId=0,lastTime=0;await Promise.all(Object.keys(sectionNames).map(async key=>{try{const rows=await objectSection(id,key).list();for(const r of rows){const rid=Number(r.id)||0,t=Date.parse(String(r.updated_at||r.created_at||"").replace(" ","T")+"Z")||0;if(rid>lastId)lastId=rid;if(t>lastTime)lastTime=t}}catch{}}));return{lastId,lastTime}}
async function sortedObjects(){const objects=await data().objects.list(),enriched=await Promise.all(objects.map(async o=>({...o,_activity:await objectActivity(o.id)})));return enriched.sort((a,b)=>{const aDone=a.status==="Завершен",bDone=b.status==="Завершен";if(aDone!==bDone)return aDone?1:-1;if(b._activity.lastId!==a._activity.lastId)return b._activity.lastId-a._activity.lastId;if(b._activity.lastTime!==a._activity.lastTime)return b._activity.lastTime-a._activity.lastTime;return Number(b.id)-Number(a.id)})}
async function objectsPage(){try{const objects=await sortedObjects();const active=objects.filter(o=>o.status!=="Завершен").length,done=objects.length-active;app.innerHTML=`<div class="home-shell"><header class="home-header"><div class="brand"><div class="brand-mark">IR</div><div><strong>IR Project</strong><span>Управление строительными объектами</span></div></div></header><section class="home-hero"><div><h1>Объекты</h1><p>Контроль текущих строительных проектов, отчётности и выполнения работ.</p></div><div class="summary"><div><span>Всего объектов</span><strong>${objects.length}</strong></div><div><span>В работе</span><strong>${active}</strong></div><div><span>Завершено</span><strong>${done}</strong></div></div></section><section class="objects-section"><div class="section-head"><div><h3>Все объекты</h3><p>Показано объектов: ${objects.length}</p></div><button id="add" class="primary">＋ Добавить объект</button></div><div class="objects">${objects.map(objectCard).join("")}</div></section><footer class="home-update-footer"><button id="homeCheckUpdate" type="button" class="home-update-button"><span aria-hidden="true">↻</span> Проверить обновления</button><span id="homeInstalledVersion" class="home-update-version"></span></footer></div>${formHtml()}${updateDialogHtml()}${versionHtml()}`;refreshVersion();document.querySelectorAll("[data-object]").forEach(x=>x.onclick=()=>go(`/objects/object/${x.dataset.object}`));setupObjectForm();el("add").onclick=()=>openObjectForm();const homeCheckUpdate=el("homeCheckUpdate");if(homeCheckUpdate)homeCheckUpdate.onclick=()=>{try{if(window!==window.top&&window.parent?.irTabUpdates?.open)return window.parent.irTabUpdates.open()}catch(e){}return showUpdate()}}catch(e){console.error(e);app.innerHTML=`<div class="empty-state" style="margin:50px"><h2>Не удалось открыть список объектов</h2><p>${esc(e.message||e)}</p></div>`}}
function setupObjectForm(){const d=el("formDialog"),form=el("objectForm");let photo="",banner="",savedPhotos={};const showPreview=async(id,file,text)=>{const box=el(id);if(!box)return;if(!file){box.innerHTML=`<span>${esc(text)}</span>`;return}try{const url=await irProject.images.read(file);box.innerHTML=url?`<img src="${url}" alt="${esc(text)}">`:`<span>${esc(text)}</span>`}catch{box.innerHTML=`<span>${esc(text)}</span>`}};const resetFiles=()=>{photo="";banner="";savedPhotos={};el("photoName").textContent="Не выбрано";el("bannerName").textContent="Не выбрано";showPreview("photoPreview","","Предпросмотр фото");showPreview("bannerPreview","","Предпросмотр баннера")};const discardPending=async()=>{for(const file of [photo,banner])if(file)try{await irProject.images.remove(file)}catch{}photo="";banner=""};window.openObjectForm=async id=>{form.reset();resetFiles();el("formSections").innerHTML=sectionChecks();el("deleteObject").hidden=!id;el("formTitle").textContent=id?"Редактирование объекта":"Новый объект";el("saveObject").textContent=id?"Сохранить изменения":"Создать объект";if(id){const o=await data().objects.get(id),sections=await data().sections.get(id);if(!o)return;form.elements.id.value=o.id;form.elements.name.value=o.name;form.elements.customer.value=o.customer;form.elements.general_contractor.value=o.general_contractor||"";form.elements.address.value=o.address;form.elements.status.value=o.status;savedPhotos=await objectPhotoMap(id);const coverFile=savedPhotos.cover?.data?.file_path||"",bannerFile=savedPhotos.banner?.data?.file_path||"";el("photoName").textContent=coverFile.split(/[\\/]/).pop()||"Не выбрано";el("bannerName").textContent=bannerFile.split(/[\\/]/).pop()||"Не выбрано";await Promise.all([showPreview("photoPreview",coverFile,"Предпросмотр фото"),showPreview("bannerPreview",bannerFile,"Предпросмотр баннера")]);const vals={};sections.forEach(s=>vals[s.section_key]=s.enabled);el("formSections").innerHTML=sectionChecks(vals)}syncSectionLabels();d.showModal()};const closeWithoutSave=async()=>{await discardPending();d.close()};el("cancel").onclick=closeWithoutSave;el("dialogX").onclick=closeWithoutSave;el("photoButton").onclick=async()=>{const x=await irProject.objects.selectImage("cover");if(x){if(photo)try{await irProject.images.remove(photo)}catch{}photo=x;el("photoName").textContent=x.split(/[\\/]/).pop();await showPreview("photoPreview",x,"Предпросмотр фото")}};el("bannerButton").onclick=async()=>{const x=await irProject.objects.selectImage("banner");if(x){if(banner)try{await irProject.images.remove(banner)}catch{}banner=x;el("bannerName").textContent=x.split(/[\\/]/).pop();await showPreview("bannerPreview",x,"Предпросмотр баннера")}};el("formSections").addEventListener("change",syncSectionLabels);el("toggleAllSections").onclick=()=>{document.querySelectorAll("[data-form-section]").forEach(x=>x.checked=true);syncSectionLabels()};form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),id=f.get("id"),payload={name:f.get("name"),customer:f.get("customer"),general_contractor:f.get("general_contractor"),address:f.get("address"),status:f.get("status"),sections:readSectionChecks()};let objectId=id;if(id)await data().objects.update(id,payload);else objectId=(await data().objects.create(payload)).id;if(photo){savedPhotos.cover=await saveObjectPhoto(objectId,"cover",photo,savedPhotos.cover);photo=""}if(banner){savedPhotos.banner=await saveObjectPhoto(objectId,"banner",banner,savedPhotos.banner);banner=""}d.close();if(id)go(`/objects/object/${id}`);else objectsPage()};el("deleteObject").onclick=async()=>{const id=form.elements.id.value,name=form.elements.name.value;if(!id)return;if(!confirm(`Удалить объект «${name}»?\n\nВсе данные этого объекта будут удалены.`))return;await discardPending();await data().objects.remove(id);d.close();go("/objects");objectsPage()}}
async function objectPage(id){const o=await data().objects.get(id);if(!o)return go("/objects");const [sections,photos]=await Promise.all([data().sections.get(id),objectPhotoMap(id)]);let bannerUrl="";const bannerFile=photos.banner?.data?.file_path||"";if(bannerFile)try{bannerUrl=await irProject.images.read(bannerFile)}catch{}app.innerHTML=`${bannerUrl?'<div class="object-page-banner" id="objectPageBanner"></div>':""}<div class="object-page-head"><button class="back" id="back">← Объекты</button><div><h1>${esc(o.name)}</h1><p>Заказчик: ${esc(o.customer||"—")} · Генподрядчик: ${esc(o.general_contractor||"—")} · ${esc(o.address)}</p></div><button class="ghost-btn" id="editObject">✎ Редактировать объект</button></div><div class="sections">${sections.map(s=>`<div class="section-row"><button class="section-link" data-section="${esc(s.section_key)}" ${s.enabled?"":"disabled"}>${esc(s.title||sectionNames[s.section_key]||s.section_key)}</button><span class="section-state ${s.enabled?"on":"off"}">${s.enabled?"Включён":"Отключён"}</span></div>`).join("")}</div>${formHtml()}${versionHtml()}`;if(bannerUrl){const b=el("objectPageBanner");b.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.03),rgba(10,17,27,.20)),url("${bannerUrl}")`}refreshVersion();el("back").onclick=()=>go("/objects");document.querySelectorAll("[data-section]").forEach(x=>x.onclick=()=>go(`/objects/object/${id}/${x.dataset.section}`));setupObjectForm();el("editObject").onclick=()=>openObjectForm(id)}
async function sectionPage(id,key){const o=await data().objects.get(id);if(!o)return go("/objects");const sections=await data().sections.get(id),section=sections.find(x=>x.section_key===key);if(!section?.enabled)return go(`/objects/object/${id}`);app.innerHTML=`<button class="back" id="back">← ${esc(o.name)}</button><h1>${esc(section.title||sectionNames[key]||key)}</h1>${versionHtml()}`;refreshVersion();el("back").onclick=()=>go(`/objects/object/${id}`)}
async function render(){const route=location.hash.slice(1)||"/objects";if(route==="/objects")return objectsPage();let m=route.match(/^\/objects\/object\/(\d+)$/);if(m)return objectPage(m[1]);m=route.match(/^\/objects\/object\/(\d+)\/reports(?:\/(new|\d+)(?:\/(edit))?)?$/);if(m&&window.irReportsPage){const oid=m[1],part=m[2]||"",edit=m[3]==="edit";if(part==="new")return window.irReportsPage(oid,{mode:"new"});if(/^\d+$/.test(part))return window.irReportsPage(oid,{mode:edit?"edit":"view",reportId:part});return window.irReportsPage(oid)}m=route.match(/^\/objects\/object\/(\d+)\/extra-works(?:\/([A-Za-z0-9_-]+))?$/);if(m&&window.irAdditionalWorksPage)return window.irAdditionalWorksPage(m[1],{workId:m[2]||""});m=route.match(/^\/objects\/object\/(\d+)\/([^/]+)$/);if(m){const key=decodeURIComponent(m[2]);if(key==="reports"&&window.irReportsPage)return window.irReportsPage(m[1]);if(key==="marks"&&window.irMarksPage)return window.irMarksPage(m[1]);if(key==="work-types"&&window.irWorkTypesPage)return window.irWorkTypesPage(m[1]);if(key==="acted-days"&&window.irActedDaysPageV3)return window.irActedDaysPageV3(m[1]);if(key==="acted-days"&&window.irActedDaysPageV2)return window.irActedDaysPageV2(m[1]);if(key==="acted-days"&&window.irActedDaysPage)return window.irActedDaysPage(m[1]);if(key==="penalties"&&window.irPenaltiesPageV2)return window.irPenaltiesPageV2(m[1]);if(key==="penalties"&&window.irPenaltiesPage)return window.irPenaltiesPage(m[1]);if(key==="finance"&&window.irFinancePage)return window.irFinancePage(m[1]);if(key==="scheme"&&window.irSchemePage)return window.irSchemePage(m[1]);return sectionPage(m[1],key)}go("/objects")}
try{if("scrollRestoration"in history)history.scrollRestoration="manual"}catch{}
function scrollPageTop(){window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0}
async function routeChanged(){scrollPageTop();await render();requestAnimationFrame(()=>scrollPageTop())}
window.addEventListener("hashchange",routeChanged);routeChanged();
;

/* #33: src/object-sort-latest-report.js */
"use strict";
(()=>{
 const originalActivity=typeof objectActivity==="function"?objectActivity:null;
 const dateStamp=v=>{
  const s=String(v||"").trim();if(!s)return 0;
  const iso=s.slice(0,10),t=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso)?`${iso}T00:00:00Z`:s);
  return Number.isFinite(t)?t:0;
 };
 const updatedStamp=r=>{const s=String(r?.updated_at||r?.created_at||"").trim();if(!s)return 0;const t=Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");return Number.isFinite(t)?t:0};
 async function reportFreshness(id){
  try{
   const rows=await irProject.data.forObject(id).section("reports").list();
   let best={has:false,date:0,id:0,updated:0};
   for(const r of Array.isArray(rows)?rows:[]){
    const d=r?.data||r||{},date=dateStamp(d.date||d.report_date),rid=Number(r?.id)||0,updated=updatedStamp(r);
    if(!best.has||date>best.date||(date===best.date&&rid>best.id)||(date===best.date&&rid===best.id&&updated>best.updated))best={has:true,date,id:rid,updated};
   }
   return best;
  }catch(e){console.error("object latest report sort",id,e);return{has:false,date:0,id:0,updated:0}}
 }
 async function sortObjectsByLatestReport(){
  const objects=await irProject.data.objects.list();
  const enriched=await Promise.all((Array.isArray(objects)?objects:[]).map(async o=>({
   ...o,
   _latestReport:await reportFreshness(o.id),
   _activity:originalActivity?await originalActivity(o.id):{lastId:0,lastTime:0}
  })));
  return enriched.sort((a,b)=>{
   const aActive=a.status!=="Завершен",bActive=b.status!=="Завершен";
   if(aActive!==bActive)return aActive?-1:1;
   if(a._latestReport.has!==b._latestReport.has)return a._latestReport.has?-1:1;
   if(b._latestReport.date!==a._latestReport.date)return b._latestReport.date-a._latestReport.date;
   if(b._latestReport.id!==a._latestReport.id)return b._latestReport.id-a._latestReport.id;
   if(b._latestReport.updated!==a._latestReport.updated)return b._latestReport.updated-a._latestReport.updated;
   if((b._activity?.lastId||0)!==(a._activity?.lastId||0))return(b._activity?.lastId||0)-(a._activity?.lastId||0);
   if((b._activity?.lastTime||0)!==(a._activity?.lastTime||0))return(b._activity?.lastTime||0)-(a._activity?.lastTime||0);
   return Number(b.id)-Number(a.id);
  });
 }
 try{sortedObjects=sortObjectsByLatestReport}catch{}
 try{window.sortedObjects=sortObjectsByLatestReport}catch{}
 if((location.hash.slice(1)||"/objects")==="/objects")setTimeout(()=>{try{if(typeof objectsPage==="function")objectsPage()}catch(e){console.error(e)}},0);
})();

;

/* #34: src/schedule-page-v2.js */
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
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 window.irSchedulePage=async oid=>{
  document.body.classList.remove("ir-object-overview");
  const app=document.getElementById("app"),o=await irProject.data.objects.get(oid);if(!app||!o)return;
  const root=irProject.data.forObject(oid),scheduleApi=root.section("schedule"),workApi=root.section("work-types"),marksApi=root.section("marks"),reportsApi=root.section("reports");
  let [rows,workTypes,marks,reports]=await Promise.all([scheduleApi.list().catch(()=>[]),workApi.list().catch(()=>[]),marksApi.list().catch(()=>[]),reportsApi.list().catch(()=>[])]);
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("schedule"):false;
  const sortRows=()=>rows.sort((a,b)=>String(a.data?.start_date||"").localeCompare(String(b.data?.start_date||""))||Number(a.id)-Number(b.id));
  const optionText=w=>{const d=w.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга";return `${d.work_type||w.title||"Без названия"}${service?" · Услуга":d.project_code?` · ${d.project_code}`:""}`};
  const catalog=()=>arr(workTypes).map(w=>{const d=w.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),has_marks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||w.title).includes("монтаж")||norm(d.work_type||w.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===String(w.id)))));return{id:String(w.id),name:d.work_type||w.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:service?"service":"volume",has_marks,planned_volume:num(d.planned_volume??d.plan_volume)}});
  const resolveWork=(rawId,name,code)=>{const list=catalog(),id=String(rawId||""),byId=list.find(x=>x.id===id);if(byId){const nameOk=!name||norm(byId.name)===norm(name),codeOk=!code||!byId.code||norm(byId.code)===norm(code);if(nameOk&&codeOk)return byId}let hit=list.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));if(!hit&&code){const a=list.filter(x=>norm(x.code)===norm(code));if(a.length===1)hit=a[0]}if(!hit&&name){const a=list.filter(x=>norm(x.name)===norm(name));if(a.length===1)hit=a[0]}return hit||{id,name:name||"Без названия",code:code||"",unit:""}};
  function analysisMaps(){
   const plans=new Map(),facts=new Map(),days=new Map(),first=new Map();
   for(const w of catalog())if(w.accounting_type!=="service"&&!w.has_marks&&w.planned_volume>0)plans.set(w.id,w.planned_volume);
   for(const r of arr(marks)){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type,d.project_code);if(!m?.id||m.accounting_type==="service")continue;plans.set(m.id,(plans.get(m.id)||0)+markTotal(r))}
   for(const r of arr(reports)){const d=r.data||r,day=iso(d.date||d.report_date);for(const w of arr(d.items||d.works)){const m=resolveWork(w.work_type_id,w.work_type||w.type,w.project_code||w.code);if(!m?.id||m.accounting_type==="service"||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const v=reportVolume(w);if(v<=0)continue;facts.set(m.id,(facts.get(m.id)||0)+v);if(day){if(!days.has(m.id))days.set(m.id,new Set());days.get(m.id).add(day);const t=dateMs(day);if(t!==null&&(first.get(m.id)==null||t<first.get(m.id)))first.set(m.id,t)}}}
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
   if(plan<=0){status="Нет плана";note=m.has_marks?"В ведомости марок нет планового объёма для этого вида работ.":"Не указан объём выполняемой работы."}
   else if(factPct>=99.999){tone="good";status="Выполнено";note="Плановый объём выполнен."}
   else if(end!==null&&today>end&&remain>0){tone="bad";status="Срок истёк";note=`До выполнения плана осталось ${nfmt(remain)} ${unit}; плановый срок уже завершён.`}
   else if(start!==null&&today<start){status="Ещё не начато";note=`Работы по графику начинаются ${fmt(d.start_date)}.`}
   else if(deviation>=-3){tone="good";status="По графику";note=avg>0?`Текущий средний темп — ${nfmt(avg)} ${unit}/день.`:"Работы идут в пределах планового графика."}
   else if(deviation>=-10){tone="warn";status="Есть риск";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; требуется темп ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"срок истёк"}.`}
   else{tone="bad";status="Отставание";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; для выхода в срок требуется ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"пересмотр срока"}.`}
   return{unit,plan,fact,remain,workedDays,avg,need,daysLeft,planPct,factPct,deviation,forecast,forecastMs,end,tone,status,note}
  }
  const metric=(label,value,sub="")=>`<div class="schedule-analysis-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>`;
  function analysisHtml(r){const a=analysisFor(r);if(a.service)return `<div class="schedule-analysis schedule-analysis-service tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ услуги</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics service">${metric("Ед. изм.","услуга")}${metric("Начало",a.start!==null?fmt(new Date(a.start).toISOString().slice(0,10)):"—")}${metric("Срок",a.end!==null?fmt(new Date(a.end).toISOString().slice(0,10)):"—")}${metric("Выполнено",a.completed?(a.doneDate?fmt(a.doneDate):"Да"):"Нет")}</div></div>`;const u=a.unit,needText=Number.isFinite(a.need)?`${nfmt(a.need)} ${u}/день`:a.remain>0?"Срок истёк":"0",dev=`${a.deviation>=0?"+":""}${String(Number(a.deviation.toFixed(1))).replace(".",",")}%`,progress=a.plan>0?`<div class="schedule-analysis-progress"><div class="schedule-analysis-progress-labels"><span>Факт <b>${nfmt(a.factPct)}%</b></span><span>План на сегодня <b>${nfmt(a.planPct)}%</b></span></div><div class="schedule-analysis-track"><i class="schedule-analysis-fact" style="width:${a.factPct.toFixed(2)}%"></i><i class="schedule-analysis-plan" style="left:${a.planPct.toFixed(2)}%"></i></div></div>`:"";return `<div class="schedule-analysis tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics">${metric("План",a.plan>0?`${nfmt(a.plan)} ${u}`:"—")}${metric("Выполнено",`${nfmt(a.fact)} ${u}`,a.plan>0?`${nfmt(a.factPct)}%`:"")}${metric("Осталось",a.plan>0?`${nfmt(a.remain)} ${u}`:"—")}${metric("Среднее / день",a.avg?`${nfmt(a.avg)} ${u}`:"—",a.workedDays?`${a.workedDays} дн. с работами`:"Нет факта")}${metric("Нужно / день",a.plan>0?needText:"—")}${metric("Дней осталось",a.daysLeft?String(a.daysLeft):a.remain>0?"0":"—")}${metric("Отклонение",a.plan>0?dev:"—")}${metric("Прогноз",a.forecast,a.forecastMs&&a.end&&a.forecastMs>a.end?"Позже плана":a.forecastMs&&a.end&&a.forecastMs<=a.end?"В пределах срока":"")}</div>${progress}</div>`}
  function rowHtml(r,i){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type||r.title,d.project_code),service=m.accounting_type==="service";return `<div class="schedule-row ${service?"schedule-service-row":""}" data-id="${r.id}"><div class="schedule-num">${i+1}</div><div><span>Вид работы</span><b>${esc(d.work_type||r.title||"—")}</b></div><div><span>Шифр</span><b>${service?"—":esc(d.project_code||"—")}</b></div><div><span>Дата начала</span><b>${fmt(d.start_date)}</b></div><div><span>Дата окончания</span><b>${fmt(d.end_date)}</b></div>${canEdit()?`<div class="schedule-actions"><button type="button" data-schedule-edit="${r.id}">Редактировать</button><button type="button" class="danger" data-schedule-delete="${r.id}">Удалить</button></div>`:"<div></div>"}</div>${analysisHtml(r)}`}
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
   form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=fd.get("id"),wid=String(fd.get("work_type_id")||""),start=String(fd.get("start_date")||""),end=String(fd.get("end_date")||"");if(end<start){error.textContent="Дата окончания не может быть раньше даты начала.";error.hidden=false;return}const wt=workTypes.find(w=>String(w.id)===wid);if(!wt){error.textContent="Выберите вид работы.";error.hidden=false;return}const duplicate=rows.find(r=>String(r.data?.work_type_id||"")===wid&&String(r.id)!==String(id||""));if(duplicate){error.textContent="Для этого вида работ график уже задан. Откройте существующую строку и отредактируйте её.";error.hidden=false;return}const d=wt.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",payload={record_type:"schedule_item",title:d.work_type||wt.title||"",data:{work_type_id:Number(wt.id),work_type:d.work_type||wt.title||"",accounting_type:service?"service":"volume",project_code:service?"":d.project_code||"",unit:service?"услуга":d.unit||"",start_date:start,end_date:end}};if(id)await scheduleApi.update(id,payload);else await scheduleApi.create(payload);rows=await scheduleApi.list().catch(()=>[]);dialog.close();draw()};
  }
  draw();
 };
 const baseSectionPage=typeof sectionPage==="function"?sectionPage:null;
 if(baseSectionPage){sectionPage=async(id,key)=>key==="schedule"?window.irSchedulePage(id):baseSectionPage(id,key)}
 const initial=route();if(initial)setTimeout(()=>window.irSchedulePage(initial),0);
})();
;

/* #35: src/object-overview-direct-v3.js */
"use strict";
(()=>{
const icon=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons={check:icon('<path d="m5 12 4 4L19 6"/>'),calendar:icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),pin:icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),plus:icon('<path d="M12 5v14M5 12h14"/>'),edit:icon('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),dots:icon('<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>')};
const DAY=86400000;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
const isoDate=v=>String(v||"").slice(0,10);
const dateMs=v=>{const s=isoDate(v),t=s?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)?t:null};
const formatDate=v=>{if(!v)return"";const p=isoDate(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
const formatMs=t=>formatDate(new Date(t).toISOString().slice(0,10));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const todayMs=()=>{const n=new Date();return Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())};
function scheduleDates(rows){const starts=[],ends=[];for(const row of arr(rows)){const d=row?.data||row||{};if(d.start_date)starts.push(isoDate(d.start_date));if(d.end_date)ends.push(isoDate(d.end_date))}starts.sort();ends.sort();return{start:starts[0]?formatDate(starts[0]):"",end:ends.length?formatDate(ends[ends.length-1]):""}}
function markTotal(x){const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)}
function reportVolume(w){const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)}
function workTypeMeta(rows,marks){return new Map(arr(rows).map(r=>{const d=r.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),has_marks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===String(r.id)))));return[String(r.id),{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:service?"service":"volume",has_marks,planned_volume:num(d.planned_volume??d.plan_volume)}]}))}
function planByWork(marks,wt){const map=new Map();for(const [id,w] of wt)if(w.accounting_type!=="service"&&!w.has_marks&&w.planned_volume>0)map.set(id,w.planned_volume);for(const r of arr(marks)){const d=r.data||{},id=String(d.work_type_id||"");if(!id||wt.get(id)?.accounting_type==="service")continue;map.set(id,(map.get(id)||0)+markTotal(r))}return map}
function factByWork(reports,wt){const map=new Map(),days=new Map(),first=new Map();for(const r of arr(reports)){const d=r.data||r||{},day=isoDate(d.date||d.report_date);for(const w of arr(d.items||d.works)){const id=String(w.work_type_id||"");if(!id||wt.get(id)?.accounting_type==="service"||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const v=reportVolume(w);if(v<=0)continue;map.set(id,(map.get(id)||0)+v);if(day){if(!days.has(id))days.set(id,new Set());days.get(id).add(day);const t=dateMs(day);if(t!==null&&(first.get(id)==null||t<first.get(id)))first.set(id,t)}}}return{map,days,first}}
function controlRows(schedule,workTypes,marks,reports){
 const wt=workTypeMeta(workTypes,marks),plans=planByWork(marks,wt),facts=factByWork(reports,wt),today=todayMs();
 return arr(schedule).map(row=>{const d=row.data||{},id=String(d.work_type_id||""),meta=wt.get(id)||{id,name:d.work_type||row.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:d.accounting_type||"volume"},start=dateMs(d.start_date),end=dateMs(d.end_date);if(start===null||end===null||end<start)return null;
  if(meta.accounting_type==="service"){let completed=false,doneDate="";for(const rec of arr(reports)){const rd=rec.data||rec,day=isoDate(rd.date||rd.report_date);for(const w of arr(rd.items||rd.works)){const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===norm(meta.name));if(!same)continue;const done=w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));if(done){completed=true;if(!doneDate||day>doneDate)doneDate=day}}}let tone="neutral",statusText="Не выполнено";if(completed){tone="good";statusText="Выполнено"}else if(today>end){tone="bad";statusText="Просрочено"}else if(today<start){statusText="Ещё не начато"}return{id,meta,start,end,service:true,completed,doneDate,tone,statusText}}
  const plan=plans.get(id)||0,fact=facts.map.get(id)||0,remain=Math.max(0,plan-fact),factPct=plan>0?clamp(fact/plan*100,0,100):0,totalDays=Math.max(1,Math.floor((end-start)/DAY)+1),elapsed=today<start?0:today>end?totalDays:Math.floor((today-start)/DAY)+1,planPct=clamp(elapsed/totalDays*100,0,100),deviation=factPct-planPct,daysLeft=today>end?0:Math.max(0,Math.ceil((end-today)/DAY)),workedDays=facts.days.get(id)?.size||0,avg=workedDays?fact/workedDays:0,need=daysLeft>0?remain/daysLeft:remain>0?Infinity:0,first=facts.first.get(id),elapsedCalendar=first!=null?Math.max(1,Math.floor((Math.max(first,today)-first)/DAY)+1):0,calendarRate=elapsedCalendar?fact/elapsedCalendar:0;
  let forecast="Нет темпа",forecastMs=null;if(remain<=1e-9){forecast="Завершено";forecastMs=today}else if(calendarRate>0){forecastMs=today+Math.ceil(remain/calendarRate)*DAY;forecast=formatMs(forecastMs)}
  let tone="neutral",statusText="Не начато";if(factPct>=99.999){tone="good";statusText="Выполнено"}else if(today>end&&remain>0){tone="bad";statusText="Срок истёк"}else if(today<start){tone="neutral";statusText="Ещё не начато"}else if(deviation>=-3){tone="good";statusText="По графику"}else if(deviation>=-10){tone="warn";statusText="Есть риск"}else{tone="bad";statusText="Отставание"}
  return{id,meta,start,end,plan,fact,remain,factPct,planPct,deviation,daysLeft,workedDays,avg,need,forecast,forecastMs,tone,statusText};
 }).filter(Boolean).sort((a,b)=>a.start-b.start||a.end-b.end||a.meta.name.localeCompare(b.meta.name,"ru"));
}
function metric(label,value,sub=""){return `<div class="schedule-control-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>`}
function scheduleControl(schedule,workTypes,marks,reports){
 const rows=controlRows(schedule,workTypes,marks,reports),today=todayMs();
 const head=`<div class="object-overview-block-head"><div><h2>График работ</h2><p>План, факт, темп выполнения и прогноз по срокам</p></div><button type="button" data-overview-schedule>Открыть график</button></div>`;
 if(!rows.length)return `<div class="object-overview-dashboard"><section class="object-overview-schedule">${head}<div class="object-overview-empty">Раздел График работ пуст</div></section></div>`;
 const good=rows.filter(x=>x.tone==="good").length,warn=rows.filter(x=>x.tone==="warn").length,bad=rows.filter(x=>x.tone==="bad").length,overallEnd=Math.max(...rows.map(x=>x.end)),overallLeft=Math.max(0,Math.ceil((overallEnd-today)/DAY));
 const summary=`<div class="schedule-control-summary">${metric("Видов работ",String(rows.length))}${metric("По графику",String(good))}${metric("Риск / отставание",String(warn+bad),bad?`${bad} с отставанием`:warn?`${warn} в зоне риска`:"Отклонений нет")}${metric("До общего срока",overallLeft?`${overallLeft} дн.`:"Срок наступил",formatMs(overallEnd))}</div>`;
 const html=rows.map(x=>{const period=`${formatMs(x.start)} — ${formatMs(x.end)}`;if(x.service)return `<article class="schedule-control-row tone-${x.tone} schedule-control-service"><div class="schedule-control-row-head"><div class="schedule-control-title"><div><b>${esc(x.meta.name)}</b><span>Услуга · выполнено / не выполнено</span></div><em>${esc(period)}</em></div><span class="schedule-control-status">${esc(x.statusText)}</span></div><div class="schedule-control-metrics service">${metric("Ед. изм.","услуга")}${metric("Срок",formatMs(x.end))}${metric("Выполнено",x.completed?(x.doneDate?formatDate(x.doneDate):"Да"):"Нет")}</div></article>`;const unit=x.meta.unit||"ед.",needText=Number.isFinite(x.need)?`${fmt(x.need)} ${unit}/день`:x.remain>0?"Срок истёк":"0",devText=`${x.deviation>=0?"+":""}${String(Number(x.deviation.toFixed(1))).replace(".",",")}%`;return `<article class="schedule-control-row tone-${x.tone}"><div class="schedule-control-row-head"><div class="schedule-control-title"><div><b>${esc(x.meta.name)}</b><span>${esc(x.meta.code||"Шифр не указан")} · ${esc(unit)}</span></div><em>${esc(period)}</em></div><span class="schedule-control-status">${esc(x.statusText)}</span></div><div class="schedule-control-metrics">${metric("План",`${fmt(x.plan)} ${unit}`)}${metric("Выполнено",`${fmt(x.fact)} ${unit}`,`${String(Number(x.factPct.toFixed(1))).replace(".",",")}%`)}${metric("Осталось",`${fmt(x.remain)} ${unit}`)}${metric("Среднее / день",x.avg?`${fmt(x.avg)} ${unit}`:"—",x.workedDays?`${x.workedDays} дн. с работами`:"Нет факта")}${metric("Нужно / день",needText)}${metric("Дней осталось",x.daysLeft?String(x.daysLeft):x.remain>0?"0":"—")}${metric("План на сегодня",`${String(Number(x.planPct.toFixed(1))).replace(".",",")}%`)}${metric("Отклонение",devText)}${metric("Прогноз",x.forecast,x.forecastMs&&x.forecastMs>x.end?"Позже плана":x.forecastMs&&x.forecastMs<=x.end?"В пределах срока":"")}</div><div class="schedule-control-progress"><div class="schedule-control-progress-labels"><span>Факт <b>${String(Number(x.factPct.toFixed(1))).replace(".",",")}%</b></span><span>План <b>${String(Number(x.planPct.toFixed(1))).replace(".",",")}%</b></span></div><div class="schedule-control-track"><i class="schedule-control-fact" style="width:${x.factPct.toFixed(2)}%"></i><i class="schedule-control-plan" style="left:${x.planPct.toFixed(2)}%"></i></div></div></article>`}).join("");
 return `<div class="object-overview-dashboard"><section class="object-overview-schedule">${head}${summary}<div class="schedule-control-list">${html}</div></section></div>`;
}
async function directObjectPageV3(id){
 const o=await data().objects.get(id);if(!o)return go("/objects");
 document.body.classList.add("ir-object-overview");
 const root=data().forObject(id),[photos,schedule,workTypes,marks,reports]=await Promise.all([objectPhotoMap(id),root.section("schedule").list().catch(()=>[]),root.section("work-types").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("reports").list().catch(()=>[])]);
 let bannerUrl="";const bannerFile=photos.banner?.data?.file_path||"";if(bannerFile)try{bannerUrl=await irProject.images.read(bannerFile)}catch{}
 const dates=scheduleDates(schedule),period=dates.start&&dates.end?`${dates.start} — ${dates.end}`:dates.start?`с ${dates.start}`:dates.end?`до ${dates.end}`:"Срок не задан";
 const status=o.status||"В работе",active=status!=="Завершен";
 app.innerHTML=`<section class="object-overview-hero" data-object-id="${id}">${bannerUrl?`<div class="object-overview-hero-bg" style="background-image:linear-gradient(180deg,rgba(10,17,27,.03),rgba(10,17,27,.20)),url(&quot;${bannerUrl}&quot;)"></div>`:""}<div class="object-hero-shade"></div><div class="object-hero-content"><div class="object-hero-top"><div class="object-hero-copy"><div class="object-hero-breadcrumbs"><button type="button" data-hero-objects>Объекты</button><span>›</span><span>${esc(o.name)}</span></div><h1>${esc(o.name)}</h1><div class="object-hero-contract"><span><b>Заказчик:</b> ${esc(o.customer||"—")}</span><span><b>Генподрядчик:</b> ${esc(o.general_contractor||"—")}</span></div></div><div class="object-hero-actions"><button type="button" class="object-hero-action primary" data-hero-report>${icons.plus}<span>Добавить отчёт</span></button><button type="button" class="object-hero-action" data-hero-edit>${icons.edit}<span>Редактировать</span></button><button type="button" class="object-hero-action icon-only" data-hero-more aria-label="Дополнительные действия">${icons.dots}</button><div class="object-hero-menu" data-hero-menu hidden><button type="button" data-hero-menu-edit>Редактировать объект</button><button type="button" data-hero-menu-objects>Все объекты</button></div></div></div><div class="object-hero-info"><div class="object-hero-status ${active?"active":"done"}">${icons.check}<span>${esc(status)}</span></div><div class="object-hero-info-item">${icons.calendar}<div><b>${esc(period)}</b><span>Срок строительства</span></div></div><div class="object-hero-info-item location">${icons.pin}<div><b>${esc(o.address||"Адрес не указан")}</b><span>Расположение объекта</span></div></div></div></div></section>${scheduleControl(schedule,workTypes,marks,reports)}${formHtml()}${versionHtml()}`;
 refreshVersion();setupObjectForm();
 const hero=app.querySelector(".object-overview-hero"),goObjects=()=>go("/objects"),edit=()=>openObjectForm(id);
 hero.querySelector("[data-hero-objects]").onclick=goObjects;hero.querySelector("[data-hero-report]").onclick=()=>go(`/objects/object/${id}/reports/new`);hero.querySelector("[data-hero-edit]").onclick=edit;hero.querySelector("[data-hero-menu-edit]").onclick=edit;hero.querySelector("[data-hero-menu-objects]").onclick=goObjects;
 app.querySelector("[data-overview-schedule]")?.addEventListener("click",()=>go(`/objects/object/${id}/schedule`));
 const more=hero.querySelector("[data-hero-more]"),menu=hero.querySelector("[data-hero-menu]");more.onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden};setTimeout(()=>document.addEventListener("click",e=>{if(!hero.contains(e.target))menu.hidden=true},{once:true}),0);
}
try{objectPage=directObjectPageV3}catch{}window.objectPage=directObjectPageV3;
const m=location.hash.match(/^#\/objects\/object\/(\d+)\/?$/);if(m)setTimeout(()=>directObjectPageV3(m[1]),0);
})();

;

/* #36: src/object-overview-trend-v3.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 const selected=new Map();
 function objectId(){return location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||""}
 async function buildData(oid){
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const serviceIds=new Set(arr(workTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id))),catalog=arr(workTypes).filter(r=>(r.data?.accounting_type||"")!=="service"&&norm(r.data?.unit)!=="услуга").map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||""}}),byId=new Map(catalog.map(x=>[x.id,x]));
  const exact=(name,code)=>catalog.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));
  const resolve=w=>{
   const rawId=String(w.work_type_id||""),name=w.work_type||w.type||"",code=w.project_code||w.code||"",unit=w.unit||"";
   const byRaw=rawId?byId.get(rawId):null;
   if(byRaw){const nameOk=!name||norm(byRaw.name)===norm(name),codeOk=!code||!byRaw.code||norm(byRaw.code)===norm(code);if(nameOk&&codeOk)return byRaw}
   let hit=exact(name,code);
   if(!hit&&code){const matches=catalog.filter(x=>norm(x.code)===norm(code));if(matches.length===1)hit=matches[0]}
   if(!hit&&name){const matches=catalog.filter(x=>norm(x.name)===norm(name));if(matches.length===1)hit=matches[0]}
   if(hit)return hit;
   const id=`legacy:${norm(name)}|${norm(code)}|${norm(unit)}`;return{id,name:name||"Без названия",code,unit};
  };
  const volumes=new Map(),used=new Map();
  for(const r of arr(reports)){
   const d=r.data||r,date=iso(d.date||d.report_date);if(!date)continue;
   for(const w of arr(d.items||d.works)){
    if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга"||serviceIds.has(String(w.work_type_id||"")))continue;const type=resolve(w),id=type.id;used.set(id,type);
    if(!volumes.has(id))volumes.set(id,new Map());
    const byDate=volumes.get(id);byDate.set(date,(byDate.get(date)||0)+reportVolume(w));
   }
  }
  const types=[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru"));
  return{volumes,types};
 }
 function chartHtml(oid,data){
  if(!data.types.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>Нет выполненных объёмов в ежедневных отчётах</span></div></div>`;
  let active=selected.get(String(oid));if(!data.types.some(x=>x.id===active))active=data.types[0].id;selected.set(String(oid),active);
  const m=data.types.find(x=>x.id===active),byDate=data.volumes.get(active)||new Map(),dates=[...byDate.keys()].sort(),points=dates.map(date=>({date,value:byDate.get(date)||0}));
  if(!points.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>По выбранному виду работ нет объёмов</span></div></div>`;
  const nonZero=points.filter(x=>x.value>0),last=points.at(-1),prev=points.length>1?points.at(-2):null,total=points.reduce((s,x)=>s+x.value,0),avg=nonZero.length?total/nonZero.length:0,max=Math.max(0,...points.map(x=>x.value)),diff=prev?last.value-prev.value:0,trend=prev?(diff>0?`▲ +${fmt(diff)}`:diff<0?`▼ ${fmt(diff)}`:`● 0`):"—",trendClass=diff>0?"up":diff<0?"down":"flat",unit=m.unit||"ед.";
  const W=Math.max(900,points.length*48),H=210,L=48,R=20,T=20,B=34,innerH=H-T-B,innerW=W-L-R,maxY=Math.max(1,max,avg),step=innerW/Math.max(1,points.length),barW=Math.max(18,Math.min(72,step*.64)),avgY=T+innerH-(avg/maxY)*innerH;
  const bars=points.map((p,i)=>{const h=(p.value/maxY)*innerH,x=L+i*step+(step-barW)/2,yy=H-B-h;return `<g class="daily-bar"><rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="4"></rect><text x="${(x+barW/2).toFixed(1)}" y="${Math.max(12,yy-5).toFixed(1)}" text-anchor="middle">${p.value>0?esc(fmt(p.value)):""}</text><text class="daily-date" x="${(x+barW/2).toFixed(1)}" y="${H-11}" text-anchor="middle">${esc(fmtDate(p.date))}</text></g>`}).join("");
  const options=data.types.map(x=>`<option value="${esc(x.id)}" ${x.id===active?"selected":""}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:""}</option>`).join("");
  const avgLabel=`Среднее ${fmt(avg)} ${unit}`,avgBoxW=Math.max(112,72+String(avgLabel).length*4.6),avgBoxX=Math.max(L+4,W-R-avgBoxW-6),avgBoxY=Math.max(T+3,Math.min(H-B-22,avgY-12));
  const averageOverlay=avg>0?`<g class="daily-average-overlay"><line class="daily-average" x1="${L}" y1="${avgY.toFixed(1)}" x2="${W-R}" y2="${avgY.toFixed(1)}"></line><rect class="daily-average-bg" x="${avgBoxX.toFixed(1)}" y="${avgBoxY.toFixed(1)}" width="${avgBoxW.toFixed(1)}" height="19" rx="5"></rect><text class="daily-average-label" x="${(avgBoxX+avgBoxW-7).toFixed(1)}" y="${(avgBoxY+13).toFixed(1)}" text-anchor="end">${esc(avgLabel)}</text></g>`:"";
  return `<div class="schedule-trend"><div class="schedule-trend-head"><div><b>Динамика по ежедневным отчётам</b><span>Фактический объём выбранного вида работ по дням</span></div><select class="schedule-trend-select" data-trend-work>${options}</select></div><div class="schedule-trend-stats"><div><span>Последний день</span><b>${esc(fmt(last.value))} ${esc(unit)}</b><small>${esc(fmtDate(last.date))}</small></div><div><span>Выполнено за период</span><b>${esc(fmt(total))} ${esc(unit)}</b><small>${nonZero.length} дн. с объёмом</small></div><div><span>Максимум за день</span><b>${esc(fmt(max))} ${esc(unit)}</b></div><div class="trend-delta ${trendClass}"><span>К предыдущему отчёту</span><b>${esc(trend)} ${esc(unit)}</b></div></div><div class="schedule-trend-chart daily-volume-chart"><div class="daily-volume-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Фактические объёмы выбранного вида работ"><line class="daily-grid" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"></line><line class="daily-grid" x1="${L}" y1="${T+innerH/2}" x2="${W-R}" y2="${T+innerH/2}"></line><line class="daily-grid" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"></line><text class="daily-axis" x="4" y="${T+4}">${esc(fmt(maxY))}</text><text class="daily-axis" x="4" y="${H-B+4}">0</text>${bars}${averageOverlay}</svg></div></div></div>`;
 }
 async function renderInto(oid,host){
  const data=await buildData(oid);if(objectId()!==String(oid))return;
  const current=host.querySelector(".schedule-trend"),summary=host.querySelector(".schedule-control-summary"),wrap=document.createElement("div");wrap.innerHTML=chartHtml(oid,data);const node=wrap.firstElementChild;
  if(current)current.replaceWith(node);else if(summary)summary.replaceWith(node);else host.querySelector(".schedule-control-list")?.before(node);
  node.querySelector("[data-trend-work]")?.addEventListener("change",e=>{selected.set(String(oid),e.target.value);renderInto(oid,host)});
 }
 async function apply(){const oid=objectId();if(!oid)return;const host=document.querySelector(".object-overview-schedule");if(!host)return;await renderInto(oid,host)}
 window.addEventListener("hashchange",()=>setTimeout(apply,80));
 setTimeout(apply,120);
})();

;

/* #37: src/object-overview-reports-v4.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const reportData=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const workersOf=r=>arr(r.workers).length?arr(r.workers):arr(r.people);
 const responsibleOf=r=>arr(r.responsible).length?arr(r.responsible):arr(r.responsibles);
 const peopleTotal=r=>workersOf(r).reduce((s,x)=>s+num(x.count??x.qty),0)+responsibleOf(r).reduce((s,x)=>{const n=num(x.count??x.qty);return s+(n>0?n:(String(x.name||x.role||"").trim()?1:0))},0);
 const equipmentTotal=r=>arr(r.equipment).reduce((s,x)=>s+num(x.count??x.qty),0);
 const weatherText=r=>typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather?.condition||r.weather_text||"Не указана");
 const temperatureText=r=>{const raw=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp;if(raw===""||raw==null)return"";const n=num(raw);return`${n>0?"+":""}${fmt(n)}°C`};
 const windText=r=>{const raw=r.wind??r.wind_speed??r.windSpeed??r.weather?.wind??r.weather?.wind_speed??r.weather?.windSpeed??r.wind_text??"";const s=String(raw??"").trim();if(!s)return"Не указан";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 const hasMark=w=>Boolean(String(w?.mark_id||w?.mark||"").trim());
 const workQty=w=>num(w?.qty??w?.count??w?.quantity);
 const workValue=w=>{const direct=num(w?.volume??w?.total_volume);if(direct)return direct;const uv=num(w?.unit_volume??w?.volume1);if(uv)return workQty(w)*uv;return hasMark(w)?0:workQty(w)};
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const weatherKind=w=>({"Ясно":"sun","Облачно":"cloud","Дождь":"rain","Снег":"snow","Гроза":"storm","Туман":"fog"})[w]||"cloud";
 const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
 const icons={calendar:svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14l2 2 5-5"/>'),user:svg('<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>'),crane:svg('<circle cx="5" cy="19" r="2"/><circle cx="14" cy="19" r="2"/><path d="M2 16h17v3H2zM11 16V9l7-6 2 2-7 7v4M18 5h3v9M21 14v2"/>'),box:svg('<path d="M4 7l8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>'),sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),cloud:svg('<path d="M6 18h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>'),rain:svg('<path d="M6 15h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 6 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>'),snow:svg('<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>'),storm:svg('<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>'),fog:svg('<path d="M4 8h16M2 12h20M5 16h14"/>'),chevron:svg('<path d="m7 9 5 5 5-5"/>')};
 function totals(r){const map=new Map();for(const w of arr(r.items||r.works)){if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const unit=String(w.unit||"ед.");map.set(unit,(map.get(unit)||0)+workValue(w))}return [...map.entries()].map(([unit,value])=>({unit,value}))}
 function workGroups(r){const map=new Map();for(const w of arr(r.items||r.works)){const service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",plain=!service&&!hasMark(w),name=w.work_type||w.type||"Работа",code=service?"Услуга":plain?"":w.project_code||w.code||"Без шифра",unit=service?"":w.unit||"ед.",key=[name,code,service?"service":unit].join("|");if(!map.has(key))map.set(key,{name,code,unit,value:0,service,plain,completed:false});const g=map.get(key);if(service)g.completed=g.completed||serviceDone(w);else g.value+=workValue(w)}return [...map.values()]}
 function volumeHtml(r){const groups=workGroups(r);if(!groups.length)return'<span class="oor2-volume-empty">Нет работ</span>';return `<div class="oor2-volume-groups">${groups.slice(0,3).map(x=>`<div class="oor2-volume-line"><span><b>${esc(x.name)}</b>${x.code?`<em>${esc(x.code)}</em>`:""}</span><strong>${x.service?(x.completed?"✓ Выполнено":"Не выполнено"):`${fmt(x.value)} ${esc(x.unit)}`}</strong></div>`).join("")}${groups.length>3?`<small>+ ещё ${groups.length-3}</small>`:""}</div>`}
 function toggleHtml(){return `<span class="oor2-chevron">${icons.chevron}</span>`}
 function brief(r,no,open){const weather=weatherText(r),temp=temperatureText(r),wind=windText(r),kind=weatherKind(weather),label=open?"Свернуть":"Развернуть";return `<div class="oor2-brief ${open?"is-open":""}" data-toggle-report="${esc(r.id)}"><div class="oor2-cell oor2-date"><span class="oor2-icon">${icons.calendar}</span><div><small>Дата</small><b>${dmy(r.date||r.report_date)}</b><em>Отчёт №${no}</em></div></div><div class="oor2-cell oor2-weather weather-${kind}"><span class="oor2-icon">${icons[kind]}</span><div><small>Погода</small><b>${esc(weather)}${temp?` · ${esc(temp)}`:""}</b><em>Ветер: ${esc(wind)}</em></div></div><div class="oor2-cell"><span class="oor2-icon people">${icons.user}</span><div><small>Люди</small><b>${fmt(peopleTotal(r))} чел.</b></div></div><div class="oor2-cell"><span class="oor2-icon equipment">${icons.crane}</span><div><small>Техника</small><b>${fmt(equipmentTotal(r))} ед.</b></div></div><div class="oor2-cell oor2-volume"><span class="oor2-icon volume">${icons.box}</span><div><small>Объём</small>${volumeHtml(r)}</div></div><button class="oor2-toggle" type="button" data-toggle-button="${esc(r.id)}" aria-expanded="${open?"true":"false"}" aria-label="${label}" title="${label}">${toggleHtml()}</button></div>`}
 function works(r){const rows=arr(r.items||r.works),isService=w=>w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",marked=rows.filter(w=>!isService(w)&&hasMark(w)),plain=rows.filter(w=>!isService(w)&&!hasMark(w)),services=rows.filter(isService),t=totals(r),hasServices=services.length>0,totalsHtml=t.length?t.map(x=>`<div class="oor2-total"><small>Выполнено</small><b>${fmt(x.value)} ${esc(x.unit)}</b></div>`).join(""):(hasServices?'<div class="oor2-total"><small>Услуги</small><b>Без объёма</b></div>':'<div class="oor2-total"><small>Выполненные работы</small><b>Нет объёмов</b></div>'),markedBody=marked.map(w=>`<tr><td><b>${esc(w.work_type||w.type||"Работа")}</b></td><td>${esc(w.project_code||w.code||"—")}</td><td>${esc(w.mark||"—")}${w.name?`<small>${esc(w.name)}</small>`:""}</td><td>${fmt(workQty(w))}</td><td><span>Объём</span><b>${fmt(workValue(w))} ${esc(w.unit||"")}</b></td></tr>`).join(""),plainBody=plain.map(w=>`<tr><td><b>${esc(w.work_type||w.type||"Работа")}</b></td><td></td><td>${esc(w.unit||"—")}</td><td><b>${fmt(workQty(w))}</b></td></tr>`).join(""),serviceBody=services.map(w=>`<tr><td><b>${esc(w.work_type||w.type||"Услуга")}</b></td><td><b class="${serviceDone(w)?"oor2-service-done":"oor2-service-pending"}">${serviceDone(w)?"✓ Выполнено":"Не выполнено"}</b></td></tr>`).join(""),markedBlock=marked.length?`<div class="oor2-work-block"><div class="oor2-work-block-title">Работы по маркам</div><div class="oor2-table-wrap"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка</th><th>Кол-во</th><th>Итог</th></tr></thead><tbody>${markedBody}</tbody></table></div></div>`:"",plainBlock=plain.length?`<div class="oor2-work-block oor2-plain-work-block"><div class="oor2-work-block-title">Работы</div><div class="oor2-table-wrap"><table class="oor2-plain-table"><thead><tr><th>Вид работы</th><th></th><th>Ед. измерения</th><th>Кол-во Итого</th></tr></thead><tbody>${plainBody}</tbody></table></div></div>`:"",serviceBlock=services.length?`<div class="oor2-work-block oor2-service-block"><div class="oor2-work-block-title">Услуги</div><div class="oor2-table-wrap"><table class="oor2-service-table"><thead><tr><th>Вид работы</th><th>Статус</th></tr></thead><tbody>${serviceBody}</tbody></table></div></div>`:"",body=markedBlock+plainBlock+serviceBlock||'<div class="oor2-empty-cell">Работы не указаны</div>';return `<div class="oor2-details" data-details-report="${esc(r.id)}"><section class="oor2-works"><div class="oor2-works-title"><div><h3>Выполненные работы</h3><p>Детализация отчёта за ${dmy(r.date||r.report_date)}</p></div><button type="button" data-open-report="${esc(r.id)}">Открыть отчёт</button></div><div class="oor2-totals">${totalsHtml}</div>${body}</section></div>`}
 const photoPath=p=>typeof p==="string"?p:String(p?.file_path||p?.file||p?.path||"").trim();
 async function latestPhotos(reports,noMap){const candidates=[];for(const r of reports){const list=arr(r.photos).length?arr(r.photos):arr(r.reportPhotos);for(const p of list){const path=photoPath(p);if(path)candidates.push({path,reportId:String(r.id),date:r.date||r.report_date||"",no:noMap.get(String(r.id))||1})}}const out=[];for(let i=0;i<candidates.length&&out.length<12;i+=12){const batch=candidates.slice(i,i+12),urls=await Promise.all(batch.map(x=>irProject.images.read(x.path).catch(()=>"")));for(let j=0;j<batch.length&&out.length<12;j++)if(urls[j])out.push({...batch[j],src:urls[j]})}return out}
 function overviewMarksBlock(markRows,workRows,reports){
  const workMap=new Map(arr(workRows).map(r=>{const d=r.data||{};return[String(r.id),{name:d.work_type||r.title||"Без вида работ",code:d.project_code||"",unit:d.unit||""}]}));
  const mounted=new Map();for(const r of arr(reports).map(reportData))for(const w of arr(r.items||r.works)){const id=String(w.mark_id||"");if(id)mounted.set(id,(mounted.get(id)||0)+workQty(w))}
  const markTotal=x=>{const raw=x.total_value??x.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x.qty??x.count)*num(x.unit_volume??x.volume_one)};
  const rows=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})})).filter(x=>x.accounting_type!=="service"&&norm(x.unit)!=="услуга").map(x=>{const total=num(x.qty??x.count),done=Math.min(total,mounted.has(x.id)?num(mounted.get(x.id)):num(x.mounted??x.done)),status=total>0&&done>=total-1e-9?"done":done>0?"partial":"left",work=workMap.get(String(x.work_type_id||""))||{name:x.work_type||"Без вида работ",code:x.project_code||"",unit:x.unit||""},pct=total?Math.min(100,done/total*100):0;return{...x,total,done,status,work,pct,totalVolume:markTotal(x)}}).filter(x=>x.total>0);
  const order={partial:0,left:1,done:2},shown=[...rows].sort((a,b)=>order[a.status]-order[b.status]||String(a.work.name).localeCompare(String(b.work.name),"ru")||String(a.mark||a.title).localeCompare(String(b.mark||b.title),"ru",{numeric:true})).slice(0,6);
  const totalQty=rows.reduce((s,x)=>s+x.total,0),doneQty=rows.reduce((s,x)=>s+x.done,0),ready=totalQty?Math.min(100,doneQty/totalQty*100):0,doneCount=rows.filter(x=>x.status==="done").length,partialCount=rows.filter(x=>x.status==="partial").length,leftCount=rows.length-doneCount;
  const body=shown.length?shown.map(x=>`<div class="oor-marks-row"><div><b>${esc(x.mark||x.title||"—")}</b><span>${esc(x.name||"")}</span></div><div><b>${esc(x.work.name)}</b><span>${esc(x.work.code||"Без шифра")}</span></div><div><b>${fmt(x.done)} / ${fmt(x.total)}</b><span>${esc(x.unit||x.work.unit||"шт")}</span></div><div class="oor-marks-progress"><i><em style="width:${x.pct.toFixed(2)}%"></em></i><b>${Math.round(x.pct)}%</b></div><span class="oor-marks-status ${x.status}">${x.status==="done"?"Смонтировано":x.status==="partial"?"Частично":"Не начато"}</span></div>`).join(""):'<div class="oor2-empty">Ведомость марок пока пустая</div>';
  return`<section class="oor2-card oor-marks-card"><div class="oor2-head"><div><h2>Ведомость / марки</h2><p>Краткий контроль монтажа по маркам</p></div><button type="button" data-all-marks>Открыть ведомость</button></div><div class="oor-marks-stats"><div><span>Позиций</span><b>${rows.length}</b></div><div><span>Смонтировано</span><b>${doneCount}</b></div><div><span>В работе</span><b>${partialCount}</b></div><div><span>Осталось</span><b>${leftCount}</b></div><div class="oor-marks-ready"><span>Готовность</span><b>${Math.round(ready)}%</b><i><em style="width:${ready.toFixed(2)}%"></em></i></div></div><div class="oor-marks-head"><span>Марка</span><span>Вид работы</span><span>Монтаж</span><span>Прогресс</span><span>Статус</span></div><div class="oor-marks-list">${body}</div>${rows.length>shown.length?`<div class="oor-marks-footer"><span>Показано ${shown.length} из ${rows.length}</span><button type="button" data-all-marks>Показать все</button></div>`:""}</section>`;
 }
 function photosBlock(items){const head=`<div class="oor2-head"><div><h2>Последние фото</h2><p>Последние 12 фото из ежедневных отчётов</p></div><button type="button" data-photo-reports>Все отчёты</button></div>`;if(!items.length)return `<section class="oor2-card oor2-photo-card">${head}<div class="oor2-empty">В ежедневных отчётах пока нет фотографий</div></section>`;return `<section class="oor2-card oor2-photo-card">${head}<div class="oor2-photo-grid">${items.map((x,i)=>`<button type="button" class="oor2-photo-item" data-photo-report="${esc(x.reportId)}" title="Открыть отчёт №${esc(x.no)} за ${esc(dmy(x.date))}"><img src="${esc(x.src)}" alt="Фото из отчёта №${esc(x.no)}"><span><b>${esc(dmy(x.date))}</b><em>Отчёт №${esc(x.no)}</em></span></button>`).join("")}</div></section>`}
 function findReport(wrap,id){return [...wrap.querySelectorAll("[data-report]")].find(x=>String(x.dataset.report)===String(id))||null}
 async function renderOnce(){const oid=objectId();if(!oid)return true;const app=document.getElementById("app"),schedule=app?.querySelector(".object-overview-dashboard");if(!app||!schedule)return false;app.querySelector(".object-overview-reports")?.remove();const root=irProject.data.forObject(oid),[raw,rawMarks,rawWorkTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);if(objectId()!==String(oid))return true;const orderedAll=raw.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id)),noMap=new Map([...raw].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1])),reports=orderedAll.slice(0,5),photos=await latestPhotos(orderedAll,noMap);if(objectId()!==String(oid))return true;const wrap=document.createElement("div");wrap.className="object-overview-reports";const head=`<div class="oor2-head"><div><h2>Последние ежедневные отчёты</h2><p>Последние 5 отчётов по объекту</p></div><button type="button" data-all-reports>Все отчёты</button></div>`,reportsHtml=reports.length?`<section class="oor2-card">${head}<div class="oor2-list">${reports.map((r,i)=>{const open=i===0,detail=works(r);return `<article class="oor2-report" data-report="${esc(r.id)}">${brief(r,noMap.get(String(r.id))||1,open)}${open?detail:detail.replace('<div class="oor2-details"','<div class="oor2-details" hidden')}</article>`}).join("")}</div></section>`:`<section class="oor2-card">${head}<div class="oor2-empty">Раздел Ежедневные отчёты пуст</div></section>`;wrap.innerHTML=`${overviewMarksBlock(rawMarks,rawWorkTypes,raw)}${reportsHtml}${photosBlock(photos)}`;schedule.insertAdjacentElement("afterend",wrap);wrap.querySelectorAll("[data-all-marks]").forEach(b=>b.addEventListener("click",()=>location.hash=`/objects/object/${oid}/marks`));wrap.querySelector("[data-all-reports]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports`);wrap.querySelector("[data-photo-reports]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports`);wrap.querySelectorAll("[data-photo-report]").forEach(b=>b.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports/${b.dataset.photoReport}`));const toggle=id=>{const report=findReport(wrap,id);if(!report)return;const details=report.querySelector(".oor2-details"),briefRow=report.querySelector(".oor2-brief"),button=report.querySelector(".oor2-toggle");if(!details||!briefRow||!button)return;const opening=details.hasAttribute("hidden");if(opening)details.removeAttribute("hidden");else details.setAttribute("hidden","");briefRow.classList.toggle("is-open",opening);button.setAttribute("aria-expanded",opening?"true":"false");const label=opening?"Свернуть":"Развернуть";button.setAttribute("aria-label",label);button.setAttribute("title",label);button.innerHTML=toggleHtml()};wrap.querySelectorAll("[data-toggle-report]").forEach(row=>row.addEventListener("click",e=>{if(e.target.closest("button"))return;toggle(row.dataset.toggleReport)}));wrap.querySelectorAll("[data-toggle-button]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggle(b.dataset.toggleButton)});wrap.querySelectorAll("[data-open-report]").forEach(b=>b.onclick=e=>{e.stopPropagation();location.hash=`/objects/object/${oid}/reports/${b.dataset.openReport}`});return true}
 let runToken=0;function scheduleApply(){const token=++runToken;let attempt=0;const run=async()=>{if(token!==runToken)return;try{const done=await renderOnce();if(done||token!==runToken)return}catch(e){console.error("object overview reports",e)}if(++attempt<30)setTimeout(run,150)};setTimeout(run,0)}window.addEventListener("hashchange",scheduleApply);scheduleApply();
})();

;

/* #38: src/object-overview-deliveries.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v||"—")};
 const fmtShort=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const normUnit=u=>{const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s/g,"");if(["т","тн","tn","ton","tons"].includes(s))return"тн";if(["м2","m2"].includes(s))return"м2";if(["м3","m3"].includes(s))return"м3";return s||"ед."};
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const record=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const selected=new Map();
 function valueOf(x){const raw=x?.volume??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x?.qty??x?.count??x?.quantity)*num(x?.unit_volume??x?.volume_one)}
 function isServiceItem(x,serviceIds){return x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||serviceIds?.has(String(x?.work_type_id||""))}
 function workGroups(r,serviceIds){const map=new Map();for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const key=[x.work_type_id||x.work_type||"",x.project_code||""].join("|");if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}return[...map.values()]}
 function totalsByUnit(r,serviceIds){const out={};for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const u=normUnit(x.unit),v=valueOf(x);out[u]=(out[u]||0)+v}if(!Object.keys(out).length&&!itemsOf(r).length&&r?.totals_by_unit&&typeof r.totals_by_unit==="object")for(const [u,v] of Object.entries(r.totals_by_unit))out[normUnit(u)]=(out[normUnit(u)]||0)+num(v);return out}
 function totalsText(r,serviceIds){const p=Object.entries(totalsByUnit(r,serviceIds)).filter(([,v])=>Math.abs(v)>1e-9).map(([u,v])=>`${fmt(v)} ${u}`);return p.length?p.join(" · "):"0"}
 function buildCatalog(rows){return arr(rows).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:normUnit(d.unit||"")}})}
 function resolver(catalog){const byId=new Map(catalog.map(x=>[x.id,x]));return x=>{const rawId=String(x?.work_type_id||""),name=x?.work_type||x?.type||"",code=x?.project_code||x?.code||"",unit=normUnit(x?.unit||"");const direct=rawId?byId.get(rawId):null;if(direct){const nameOk=!name||norm(direct.name)===norm(name),codeOk=!code||!direct.code||norm(direct.code)===norm(code);if(nameOk&&codeOk)return direct}let hit=catalog.find(w=>norm(w.name)===norm(name)&&norm(w.code)===norm(code));if(!hit&&code){const m=catalog.filter(w=>norm(w.code)===norm(code));if(m.length===1)hit=m[0]}if(!hit&&name){const m=catalog.filter(w=>norm(w.name)===norm(name));if(m.length===1)hit=m[0]}return hit||{id:`legacy:${norm(name)}|${norm(code)}|${unit}`,name:name||"Без названия",code,unit}}}
 function summarizeTypes(deliveries,reports,catalog,serviceIds){const resolve=resolver(catalog),used=new Map(),del=new Map(),mnt=new Map();
  const add=(map,type,date,value)=>{if(!date||value<=0)return;used.set(type.id,type);if(!map.has(type.id))map.set(type.id,new Map());const d=map.get(type.id);d.set(date,(d.get(date)||0)+value)};
  for(const r of deliveries){const date=iso(r.date||r.delivery_date);for(const x of itemsOf(r)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(del,t,date,valueOf(x))}}
  for(const r of reports){const date=iso(r.date||r.report_date);for(const x of arr(r.items||r.works)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(mnt,t,date,valueOf(x))}}
  return{types:[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru")),del,mnt};
 }
 function chartSvg(type,delMap,mntMap){const dates=[...new Set([...(delMap?.keys?.()||[]),...(mntMap?.keys?.()||[])])].sort();if(!dates.length)return'<div class="ood-empty-chart">Нет данных по поставкам и монтажу для выбранного вида работ</div>';
  let cd=0,cm=0;const pts=dates.map(date=>{cd+=delMap?.get(date)||0;cm+=mntMap?.get(date)||0;return{date,delivered:cd,mounted:cm}}),max=Math.max(1,...pts.flatMap(p=>[p.delivered,p.mounted]));
  const W=Math.max(940,pts.length*62),H=230,L=54,R=24,T=24,B=38,iw=W-L-R,ih=H-T-B,step=pts.length>1?iw/(pts.length-1):0,x=i=>pts.length===1?L+iw/2:L+i*step,y=v=>T+ih-(v/max)*ih;
  const pathFor=key=>pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const points=(key,cls)=>pts.map((p,i)=>`<circle class="${cls}" cx="${x(i).toFixed(1)}" cy="${y(p[key]).toFixed(1)}" r="3.5"><title>${fmtDate(p.date)}: ${fmt(p[key])} ${esc(type.unit||"ед.")}</title></circle>`).join("");
  const labels=pts.map((p,i)=>`<text class="ood-date" x="${x(i).toFixed(1)}" y="${H-12}" text-anchor="middle">${esc(fmtShort(p.date))}</text>`).join("");
  return `<div class="ood-chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Поставки и монтаж"><line class="ood-grid" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"></line><line class="ood-grid" x1="${L}" y1="${T+ih/2}" x2="${W-R}" y2="${T+ih/2}"></line><line class="ood-grid" x1="${L}" y1="${T+ih}" x2="${W-R}" y2="${T+ih}"></line><text class="ood-axis" x="4" y="${T+4}">${esc(fmt(max))}</text><text class="ood-axis" x="4" y="${T+ih+4}">0</text><path class="ood-line delivered" d="${pathFor("delivered")}"></path><path class="ood-line mounted" d="${pathFor("mounted")}"></path>${points("delivered","ood-point delivered")}${points("mounted","ood-point mounted")}${labels}</svg></div>`;
 }
 function comparisonHtml(oid,summary){if(!summary.types.length)return `<section class="ood-card ood-comparison"><div class="ood-head"><div><h2>Поставки / монтаж</h2><p>Сравнение завезённого и смонтированного объёма</p></div></div><div class="ood-empty">Нет данных для сравнения</div></section>`;
  let active=selected.get(String(oid));if(!summary.types.some(x=>x.id===active))active=summary.types[0].id;selected.set(String(oid),active);const type=summary.types.find(x=>x.id===active),del=summary.del.get(active)||new Map(),mnt=summary.mnt.get(active)||new Map(),delivered=[...del.values()].reduce((s,v)=>s+v,0),mounted=[...mnt.values()].reduce((s,v)=>s+v,0),stock=delivered-mounted,unit=type.unit||"ед.";
  const options=summary.types.map(x=>`<option value="${esc(x.id)}" ${x.id===active?"selected":""}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:""}</option>`).join("");
  return `<section class="ood-card ood-comparison"><div class="ood-head"><div><h2>Поставки / монтаж</h2><p>Накопительная динамика по выбранному виду работ</p></div><select data-ood-work>${options}</select></div><div class="ood-stats"><div><span>Завезено</span><b>${fmt(delivered)} ${esc(unit)}</b></div><div><span>Смонтировано</span><b>${fmt(mounted)} ${esc(unit)}</b></div><div class="${stock<0?"negative":""}"><span>Остаток на площадке</span><b>${fmt(stock)} ${esc(unit)}</b></div></div><div class="ood-legend"><span><i class="delivered"></i>Завезено</span><span><i class="mounted"></i>Смонтировано</span></div><div class="ood-chart">${chartSvg(type,del,mnt)}</div></section>`;
 }
 function deliveriesHtml(oid,deliveries,serviceIds){const ordered=[...deliveries].sort((a,b)=>String(b.date||b.delivery_date||"").localeCompare(String(a.date||a.delivery_date||""))||Number(b.id)-Number(a.id)).slice(0,5);const head=`<div class="ood-head"><div><h2>Последние накладные</h2><p>Последние 5 поставок по объекту</p></div><button type="button" data-ood-all>Все накладные</button></div>`;if(!ordered.length)return `<section class="ood-card ood-deliveries">${head}<div class="ood-empty">Раздел Поставки пуст</div></section>`;
  const rows=ordered.map(r=>{const groups=workGroups(r,serviceIds);return `<article class="ood-delivery-row" data-ood-delivery="${esc(r.id)}"><div><small>Накладная</small><b>№${esc(r.number||r.delivery_number||r.id)}</b><span>${fmtDate(r.date||r.delivery_date)}</span></div><div><small>Транспорт</small><b>${esc(r.vehicle_number||"—")}</b><span>${esc(r.driver_name||"Водитель не указан")}</span></div><div class="ood-delivery-works"><small>Работы</small>${groups.length?groups.slice(0,3).map(g=>`<span><b>${esc(g.name)}</b> · ${esc(g.code||"Без шифра")} · ${g.count} поз.</span>`).join(""):'<span>Позиции не указаны</span>'}${groups.length>3?`<em>+ ещё ${groups.length-3}</em>`:""}</div><div class="ood-delivery-total"><small>Общий объём</small><b>${esc(totalsText(r,serviceIds))}</b></div><span class="ood-open">›</span></article>`}).join("");return `<section class="ood-card ood-deliveries">${head}<div class="ood-delivery-list">${rows}</div></section>`;
 }
 async function renderOnce(){const oid=objectId();if(!oid)return true;const app=document.getElementById("app"),anchor=app?.querySelector(".object-overview-reports")||app?.querySelector(".object-overview-dashboard");if(!app||!anchor)return false;app.querySelector(".object-overview-deliveries-wrap")?.remove();const root=irProject.data.forObject(oid),[rawDeliveries,rawReports,rawTypes]=await Promise.all([root.section("deliveries").list().catch(()=>[]),root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);if(objectId()!==String(oid))return true;const deliveries=rawDeliveries.map(record),reports=rawReports.map(record),serviceIds=new Set(arr(rawTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга"||r.data?.has_marks===false||r.data?.work_category==="other").map(r=>String(r.id))),catalog=buildCatalog(rawTypes).filter(x=>!serviceIds.has(x.id)),summary=summarizeTypes(deliveries,reports,catalog,serviceIds),wrap=document.createElement("div");wrap.className="object-overview-deliveries-wrap";wrap.innerHTML=`${comparisonHtml(oid,summary)}${deliveriesHtml(oid,deliveries,serviceIds)}`;anchor.insertAdjacentElement("afterend",wrap);wrap.querySelector("[data-ood-work]")?.addEventListener("change",e=>{selected.set(String(oid),e.target.value);renderOnce()});wrap.querySelector("[data-ood-all]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries`);wrap.querySelectorAll("[data-ood-delivery]").forEach(row=>row.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries?id=${encodeURIComponent(row.dataset.oodDelivery)}`));return true}
 let token=0;function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview deliveries",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,60)}window.addEventListener("hashchange",schedule);schedule();
})();

;

/* #39: src/object-overview-deliveries-donut.js */
"use strict";
(()=>{
 const num=v=>{const m=String(v??"").replace(/\s/g,"").replace(",",".").match(/-?\d+(?:\.\d+)?/);const n=m?Number(m[0]):0;return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{const n=Number(v)||0;return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 function unitOf(text){return String(text||"").replace(/[-+]?\d[\d\s]*(?:[,.]\d+)?/g,"").trim()||"ед."}
 function patchLabels(card){
  const head=card.querySelector(".ood-head h2");if(head)head.textContent="Поставки и монтаж";
  const sub=card.querySelector(".ood-head p");if(sub)sub.textContent="Поставлено по накладным и смонтировано по ежедневным отчётам";
  const legend=card.querySelectorAll(".ood-legend span");
  if(legend[0])legend[0].innerHTML='<i class="delivered"></i>Поставлено по накладным';
  if(legend[1])legend[1].innerHTML='<i class="mounted"></i>Смонтировано по отчётам';
 }
 function apply(){
  const card=document.querySelector(".ood-comparison");if(!card)return;
  patchLabels(card);
  const stats=card.querySelector(".ood-stats");if(!stats||card.querySelector(".ood-donut-summary"))return;
  const values=[...stats.querySelectorAll(":scope > div b")].map(x=>x.textContent.trim());if(values.length<3)return;
  const delivered=num(values[0]),mounted=num(values[1]),unit=unitOf(values[0]),remaining=Math.max(0,delivered-mounted),over=Math.max(0,mounted-delivered);
  const ratio=delivered>0?Math.max(0,Math.min(1,mounted/delivered)):0,C=2*Math.PI*42,green=C*ratio;
  const wrap=document.createElement("div");wrap.className="ood-donut-summary";
  wrap.innerHTML=`<div class="ood-donut-visual"><svg viewBox="0 0 160 160" role="img" aria-label="Поставлено ${esc(fmt(delivered))} ${esc(unit)}, смонтировано ${esc(fmt(mounted))} ${esc(unit)}, остаток ${esc(fmt(remaining))} ${esc(unit)}"><circle class="ood-donut-outer" cx="80" cy="80" r="58"></circle><circle class="ood-donut-rest" cx="80" cy="80" r="42"></circle><circle class="ood-donut-mounted" cx="80" cy="80" r="42" stroke-dasharray="${green.toFixed(2)} ${(C-green).toFixed(2)}"></circle></svg><div class="ood-donut-center"><span>Поставлено</span><b>${esc(fmt(delivered))}</b><small>${esc(unit)}</small></div></div><div class="ood-donut-info"><div class="ood-donut-row delivered"><i></i><span>Поставлено по накладным</span><b>${esc(fmt(delivered))} ${esc(unit)}</b></div><div class="ood-donut-row mounted"><i></i><span>Смонтировано по отчётам</span><b>${esc(fmt(mounted))} ${esc(unit)}</b></div><div class="ood-donut-row remaining"><i></i><span>Остаток на площадке</span><b>${esc(fmt(remaining))} ${esc(unit)}</b></div>${over>0?`<div class="ood-donut-warning">Смонтировано больше, чем поставлено по накладным, на <b>${esc(fmt(over))} ${esc(unit)}</b>. Проверь данные поставок.</div>`:""}</div>`;
  stats.replaceWith(wrap);
 }
 let lastHash="";setInterval(()=>{const h=location.hash;if(h!==lastHash)lastHash=h;apply()},180);window.addEventListener("hashchange",()=>setTimeout(apply,80));setTimeout(apply,120);
})();

;

/* #40: src/object-overview-admin-analysis.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const hours=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=v=>String(Math.round(num(v)*100)/100).replace(".",",")+" ч";
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:r.id,...(r.data||r)});
 const actedLabels={
  wind:"Ветер",
  power:"Отключение электроэнергии",
  readiness:"Отсутствие стройготовности",
  low_temp:"Низкая температура",
  high_temp:"Повышенная температура",
  precipitation:"Сильные осадки",
  other:"Другая причина"
 };
 const palette=["#2f91cc","#d76969","#d8a13b","#6f72c9","#43a67a","#8e6db0","#7f929f","#c57b3f"];
 const donutStyle=items=>{
  const total=items.reduce((s,x)=>s+x.value,0);
  if(total<=0)return"background:conic-gradient(#e8edf1 0 100%)";
  let at=0;const parts=items.map((x,i)=>{const start=at,end=at+(x.value/total*100);at=end;return`${palette[i%palette.length]} ${start.toFixed(3)}% ${end.toFixed(3)}%`});
  return`background:conic-gradient(${parts.join(",")})`;
 };
 const actedCard=rows=>{
  const all=rows.map(record),days=new Set(all.map(x=>String(x.date||"").slice(0,10)).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+hours(x.time_from,x.time_to),0),map=new Map();
  for(const r of all){const key=String(r.reason||"other"),label=key==="other"?(String(r.reason_other||"").trim()||actedLabels.other):(actedLabels[key]||key||"Другая причина");if(!map.has(label))map.set(label,{label,count:0,hours:0});const x=map.get(label);x.count++;x.hours+=hours(r.time_from,r.time_to)}
  const items=[...map.values()].sort((a,b)=>b.count-a.count).map(x=>({...x,value:x.count}));
  const total=all.length||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"случай":"случ."} · ${fmtHours(x.hours)}</span></div><strong>${Math.round(x.count/total*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Актированных дней пока нет</div>';
  return`<section class="ooa-card ooa-acted"><div class="ooa-head"><div><h2>Актированные дни</h2><p>Анализ причин остановки работ</p></div><button type="button" data-ooa-open="acted-days">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${days}</b><span>дней</span></div></div><div class="ooa-mini-stats"><span>Записей <b>${all.length}</b></span><span>Время <b>${fmtHours(totalHours)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 const penaltyCard=rows=>{
  const all=rows.map(record),totalAmount=all.reduce((s,x)=>s+num(x.amount),0),map=new Map();
  for(const r of all){const label=String(r.reason||"Без причины").trim()||"Без причины",key=label.toLowerCase().replace(/\s+/g," ");if(!map.has(key))map.set(key,{label,count:0,amount:0});const x=map.get(key);x.count++;x.amount+=num(r.amount)}
  const items=[...map.values()].sort((a,b)=>b.amount-a.amount||b.count-a.count).map(x=>({...x,value:x.amount>0?x.amount:x.count}));
  const divisor=totalAmount||items.reduce((s,x)=>s+x.count,0)||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"штраф":"штрафа/ов"} · ${money(x.amount)}</span></div><strong>${Math.round((totalAmount>0?x.amount:x.count)/divisor*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Штрафов пока нет</div>';
  return`<section class="ooa-card ooa-penalties"><div class="ooa-head"><div><h2>Штрафы</h2><p>Анализ причин по сумме штрафов</p></div><button type="button" data-ooa-open="penalties">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${all.length}</b><span>штрафов</span></div></div><div class="ooa-mini-stats penalty"><span>Общая сумма <b>${money(totalAmount)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),dashboard=app?.querySelector(".object-overview-dashboard");if(!app||!dashboard)return false;
  app.querySelector(".object-overview-admin-analysis")?.remove();
  const root=irProject.data.forObject(oid),[acted,penalties]=await Promise.all([root.section("acted-days").list().catch(()=>[]),root.section("penalties").list().catch(()=>[])]);
  if(objectId()!==String(oid))return true;
  const wrap=document.createElement("div");wrap.className="object-overview-admin-analysis";wrap.innerHTML=actedCard(acted)+penaltyCard(penalties);
  const anchor=app.querySelector(".object-overview-deliveries-wrap")||app.querySelector(".object-overview-reports")||dashboard;
  anchor.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("[data-ooa-open]").forEach(b=>b.onclick=()=>location.hash=`/objects/object/${oid}/${b.dataset.ooaOpen}`);
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview acted/penalties",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,120)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();
;
