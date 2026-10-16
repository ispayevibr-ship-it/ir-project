"use strict";
/* One local offline workflow from indexed PDF sheets to engineer-reviewed output.
   It does not promote OCR/VLM proposals into production records automatically. */
window.irAiWorkflowPage={
 render(host,{objectId,documents=[],indexes=[],tasks=[],summary=null,
  quantities=null,materials=null,connections=null,comparisons=null,
  canEdit=false,queue=null,reviewer=null,askPassword=null,
  onNavigate=null,onRefresh=null,notice=null}={}){
  if(!host)return;
  const esc=x=>String(x??"").replace(/[&<>"]/g,k=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[k]));
  const statusNames={queued:"В очереди",running:"Распознаётся",interrupted:"Прервано",
   needs_model:"Нужна модель",awaiting_review:"Ожидает инженера",confirmed:"Подтверждено",
   rejected:"Отклонено",failed:"Ошибка",outdated:"Источник изменён",
   canceled:"Отменено"};
  const statusColors={confirmed:"done",awaiting_review:"review",failed:"error",
   needs_model:"warning",outdated:"error",rejected:"warning"};
  const q=summary||{total:null,byStatus:{},indexedPages:null,reviewRequired:null,
   confirmedAnalyses:null,isRunning:false,modelState:"не определено"};
  const counts=q.byStatus||{},value=n=>n==null?"—":n;
  // Never permit queue mutations when status cannot be determined.
  const hasRights=!!(summary&&canEdit&&queue&&reviewer&&askPassword);
  const available=documents.filter(x=>x.exists&&x.ext===".pdf"&&
   ["КМ","КМД"].includes(x.kind)&&indexes.some(i=>
    i.documentId===x.id&&i.sourceSha256===x.sha256&&i.pages?.length));
  const docIndex=doc=>indexes.find(i=>i.documentId===doc.id&&i.sourceSha256===doc.sha256);
  const stage=(title,text,tab,value)=>'<article class="ir-ai-flow-stage">'+
   '<div><b>'+title+'</b><p>'+text+'</p><small>'+value+'</small></div>'+
   '<button type="button" data-flow-nav="'+tab+'">Открыть</button></article>';
  host.innerHTML='<section class="ir-ai-workflow">'+
   (!summary?'<div class="ir-ai-quantity-warning">Состояние конвейера не удалось проверить. Прочерки не означают пустую очередь; создание и запуск заданий заблокированы до обновления данных.</div>':"")+
   '<header class="ir-ai-review-heading"><div><h2>Конвейер распознавания КМ / КМД</h2>'+
    '<p>Выберите листы проиндексированных PDF. Локальная модель обработает их по одному; каждый результат требует проверки инженером.</p></div>'+
    '<b>Только локальная обработка</b></header>'+
   '<div class="ir-ai-flow-stages">'+
    stage("1. Исходные чертежи","Загрузка и текстовый индекс PDF","documents",documents.length+
     ' файлов · '+value(q.indexedPages)+' индексированных листов')+
    stage("2. Очередь ИИ","Локальное распознавание только выбранных листов","workflow",value(q.total)+' заданий')+
    stage("3. Проверка позиций","ИИ-предложения проверяет инженер","proposals",
     value(q.reviewRequired)+' ожидают · '+value(q.confirmedAnalyses)+' проверено')+
    stage("4. Ведомости","Количество экземпляров, металл и метизы","marks",
     value(quantities?.confirmedPositionCount)+' позиций КМД · '+value(materials?.confirmedDetailPositions)+' деталей металла')+
    stage("5. Сравнение и 3D","Расхождения КМ/КМД и сборки марок","compare",
     value(comparisons?.total)+' сравнений · 3D только по проверенной геометрии')+
   '</div>'+
   '<div class="ir-ai-quantity-warning">Очередь создаёт только предложения распознавания. Число найденных упоминаний марки не является количеством отправочных элементов. Переход к ведомостям и 3D выполняется после отдельного подтверждения точных данных инженером.</div>'+
   '<section class="ir-ai-flow-create"><h3>Добавить листы в очередь</h3>'+
    (!available.length?'<p>Нет проиндексированных доступных PDF КМ/КМД. Откройте «Чертежи КМ/КМД», загрузите PDF и нажмите «Индексировать PDF».</p>'+
     '<button type="button" data-flow-nav="documents">Перейти к чертежам</button>':
     '<div class="ir-ai-flow-doc"><label>Чертёж<select data-flow-file>'+
      available.map(d=>'<option value="'+d.id+'">'+esc(d.kind)+' · '+esc(d.name)+
       ' ('+(docIndex(d)?.pages?.length||0)+' листов)</option>').join("")+
      '</select></label><span data-flow-index-info></span></div>'+
      '<div class="ir-ai-flow-sheets" data-flow-sheets></div>'+
      '<div class="ir-ai-flow-buttons"><button type="button" data-flow-all>Выбрать все листы</button>'+
       '<button type="button" data-flow-none>Снять выбор</button>'+
       '<button type="button" data-flow-add '+(!hasRights?'disabled':'')+'>＋ Добавить выбранные</button></div>')+
   '</section>'+
   '<section class="ir-ai-flow-queue"><div class="ir-ai-flow-toolbar"><div><h3>Очередь обработки</h3>'+
    '<p>Qwen: '+esc(q.modelState||"не определено")+
     ' · PaddleOCR: '+esc(q.ocrState?
      (q.ocrState.installed?"Подписанный пакет установлен":"Не установлена — работает Qwen без OCR"):"не проверено")+
     ' · заданий '+value(q.total)+
     ' · ожидают проверки '+value(summary?counts.awaiting_review||0:null)+
     ' · выполнено и подтверждено '+value(summary?counts.confirmed||0:null)+'</p></div>'+
    '<div class="ir-ai-flow-buttons">'+
     '<button type="button" data-flow-run '+(!hasRights||q.isRunning?'disabled':'')+'>▶ Запустить очередь</button>'+
     '<button type="button" data-flow-stop '+(!hasRights||!q.isRunning?'disabled':'')+'>■ После текущего листа</button>'+
     '<button type="button" data-flow-refresh>Обновить</button></div></div>'+
    (!tasks.length?'<div class="ir-ai-doc-empty"><b>В очереди пока нет листов</b>'+
     '<p>'+(summary?
      'Выберите PDF и листы выше. Без установленной модели список сохранится, но распознавание не начнётся.':
      'Очередь не подтверждена: проверьте сообщение об ошибке и повторите загрузку.')+'</p></div>':
     '<div class="ir-ai-flow-task-list">'+tasks.map(item=>'<article class="ir-ai-flow-task">'+
      '<div><b>'+esc(item.kind)+' · '+esc(item.sourceName)+' · лист '+item.page+'</b>'+
       '<small>Попыток: '+item.attempts+(item.analysisId?' · анализ № '+item.analysisId:"")+
        (item.lastError?' · '+esc(item.lastError):"")+'</small></div>'+
      '<div class="ir-ai-flow-task-controls"><span class="ir-ai-flow-status '+(statusColors[item.status]||"")+
       '">'+esc(statusNames[item.status]||item.status)+'</span>'+
      (item.analysisId?'<button type="button" data-flow-review>Проверка</button>':"")+
      (["failed","needs_model","interrupted"].includes(item.status)&&hasRights?
       '<button type="button" data-flow-retry="'+item.id+'">Повторить</button>':"")+
      (["queued","needs_model","failed","interrupted"].includes(item.status)&&hasRights?
       '<button type="button" data-flow-cancel="'+item.id+'">Отменить</button>':"")+
      '<button type="button" data-flow-history="'+item.id+'">История</button></div>'+
      '<div class="ir-ai-flow-history" data-flow-log="'+item.id+'" hidden></div>'+
      '</article>').join("")+'</div>')+
    '<p class="ir-ai-storage-note">Если приложение закроется во время обработки, незавершённый лист будет помечен как прерванный. Очередь сама не перезапускается. При повторной попытке уже сохранённый результат анализа повторно не генерируется.</p>'+
   '</section></section>';
  const root=host.querySelector(".ir-ai-workflow");
  root.querySelectorAll("[data-flow-nav]").forEach(b=>b.onclick=()=>onNavigate?.(b.dataset.flowNav));
  root.querySelectorAll("[data-flow-review]").forEach(b=>b.onclick=()=>onNavigate?.("checks"));
  const file=root.querySelector("[data-flow-file]"),sheetHost=root.querySelector("[data-flow-sheets]");
  function fillSheets(){
   if(!file||!sheetHost)return;
   const doc=available.find(x=>String(x.id)===file.value);
   const pages=docIndex(doc)?.pages||[];
   sheetHost.innerHTML=pages.map(p=>'<label class="ir-ai-flow-sheet">'+
    '<input type="checkbox" value="'+p.page+'"><strong>Лист '+p.page+'</strong>'+
    '<small>'+(p.hasTextLayer?"Текстовый слой":"Без текстового слоя")+
     (p.uncertainEncoding?" · кодировка требует проверки":"")+'</small></label>').join("");
   const info=root.querySelector("[data-flow-index-info]");
   if(info)info.textContent=pages.length+' листов индексировано. Отметьте нужные для распознавания.'
  }
  if(file){
   file.onchange=fillSheets;fillSheets();
   root.querySelector("[data-flow-all]").onclick=()=>sheetHost.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true);
   root.querySelector("[data-flow-none]").onclick=()=>sheetHost.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false)
  }
  async function approvedAction(fn){
   if(!hasRights)return;
   const role=window.irAccess?.role?.();
   if(!["admin","engineer"].includes(role)){notice?.("Нужны права инженера либо администратора","error");return}
   try{
    const password=await askPassword(role);
    if(password===null)return;
    if(!await reviewer.authorize(role,password))throw Error("Неверный пароль инженера/администратора");
    const response=await fn();
    notice?.(response?.message||"Операция очереди выполнена");
    await onRefresh?.()
   }catch(e){notice?.("Очередь: "+String(e.message||e),"error");await onRefresh?.()}
  }
  const add=root.querySelector("[data-flow-add]");
  if(add)add.onclick=()=>approvedAction(async()=>{
   const pages=[...sheetHost.querySelectorAll('input:checked')].map(x=>Number(x.value));
   if(!pages.length)throw Error("Выберите хотя бы один лист");
   const result=await queue.enqueue(objectId,Number(file.value),pages);
   return{message:"В очередь добавлено "+result.added+" листов. Уже были: "+result.skipped}
  });
  const run=root.querySelector("[data-flow-run]");
  if(run)run.onclick=()=>approvedAction(()=>queue.start(objectId));
  const pause=root.querySelector("[data-flow-stop]");
  if(pause)pause.onclick=()=>approvedAction(()=>queue.pause(objectId));
  root.querySelector("[data-flow-refresh]").onclick=()=>void onRefresh?.();
  root.querySelectorAll("[data-flow-retry]").forEach(b=>b.onclick=()=>approvedAction(()=>
   queue.retry(objectId,Number(b.dataset.flowRetry))));
  root.querySelectorAll("[data-flow-cancel]").forEach(b=>b.onclick=()=>approvedAction(()=>
   queue.cancel(objectId,Number(b.dataset.flowCancel))));
  root.querySelectorAll("[data-flow-history]").forEach(b=>b.onclick=async()=>{
   const box=root.querySelector('[data-flow-log="'+b.dataset.flowHistory+'"]');
   if(!box)return;
   if(!box.hidden){box.hidden=true;return}
   box.hidden=false;box.textContent="Загрузка истории...";
   try{
    const history=await queue.history(objectId,Number(b.dataset.flowHistory));
    box.innerHTML=history.length?history.map(h=>'<div>'+esc(h.at)+' · '+esc(h.event)+
     ' · '+esc(statusNames[h.status]||h.status)+
     (h.error?' · '+esc(h.error):"")+'</div>').join(""):"Нет записей"
   }catch(error){box.textContent="История недоступна: "+String(error.message||error)}
  })
 }
};
