"use strict";
/* IR Project AI / stage 1. Real local documents, honest unimplemented sections. */
window.irAiRecognitionPage=async function(objectId){
 const app=document.getElementById("app"),id=String(objectId||"");
 if(!app||!/^[0-9]+$/.test(id))return;
 const route=location.hash,esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const size=n=>Number(n)>=1048576?(Number(n)/1048576).toFixed(1).replace(".",",")+" МБ":Math.ceil(Number(n)/1024)+" КБ";
 const tabs=[
  ["model","Общая 3D-модель"],["assembly","3D-модели марок"],
  ["marks","Ведомость марок"],["metal","Спецификация металла"],
  ["fasteners","Метизы"],["documents","Чертежи КМ/КМД"],
  ["compare","Сравнение КМ / КМД"],["checks","Проверка и ошибки"]
 ];
 const descriptions={
  model:["Общая 3D-модель","Модель здания появится после распознавания схем расположения и инженерной проверки координат. Без исходных осей и привязок элементы не размещаются."],
  assembly:["Подробные модели отправочных марок","Сборки будут состоять из подтверждённых деталей КМД: профилей, пластин, рёбер и узлов. Условная геометрия не выдаётся за рабочую деталировку."],
  marks:["Ведомость отправочных марок","Результаты распознавания с различением уникальных марок и количества экземпляров появятся после подключения локального ИИ."],
  metal:["Спецификация металлопроката","Профиль, сталь, размеры, количество и масса будут связываться с листом-источником. Данные не будут предполагаться по внешнему виду."],
  fasteners:["Ведомость метизов","Болты, гайки, шайбы и места установки будут учитываться по уникальным соединениям после распознавания узлов."],
  compare:["Сравнение КМ и КМД","Сопоставление геометрии, металлопроката, соединений, количества и ревизий будет доступно после подготовки проверяемых данных."],
  checks:["Проверка и замечания","После запуска локального анализа здесь появятся ошибки и неопределённые значения со ссылками на исходные листы и подтверждения инженера."]
 };
 let object,documents=[],analyses=[],pdfIndexes=[],engine=null,active="documents",term="",message="",severity="info",busy=false,pdfProgress="";
 try{object=await irProject.data.objects.get(id)}catch(error){app.textContent="Не удалось прочитать объект: "+String(error.message||error);return}
 if(!object){location.hash="/objects";return}
 const bridge=irProject.aiDocuments,ready=!!(bridge&&typeof bridge.list==="function"&&typeof bridge.select==="function");
 const runtime=irProject.aiEngine||null,pdf=irProject.aiPdf||null;
 const canEdit=!!window.irAccess?.canEdit?.("ai-recognition");
 async function reload(){
  const jobs=[];
  if(ready)jobs.push(bridge.list(id).then(v=>{documents=v}).catch(error=>{documents=[];notice("Ошибка загрузки документов: "+String(error.message||error),"error")}));
  if(runtime)jobs.push(runtime.status().then(v=>{engine=v}).catch(error=>{engine=null;notice("Ошибка проверки локальной модели: "+String(error.message||error),"error")}));
  if(runtime)jobs.push(runtime.results(id).then(v=>{analyses=v}).catch(error=>{analyses=[];notice("Ошибка истории анализа: "+String(error.message||error),"error")}));
  if(pdf)jobs.push(pdf.list(id).then(v=>{pdfIndexes=v}).catch(error=>{pdfIndexes=[];notice("Ошибка PDF-индекса: "+String(error.message||error),"error")}));
  await Promise.all(jobs);
  if(location.hash===route)paint()
 }
 function notice(text,type="info"){message=String(text||"");severity=type}
 function paint(){
  if(location.hash!==route)return;
  const state=engine?.state||"missing",stateNames={
   missing:"Пакет модели не установлен",invalid:"Пакет повреждён",
   stopped:"Модель остановлена",starting:"Модель загружается",
   ready:"Модель готова",failed:"Ошибка локальной модели"};
  const modelReady=state==="ready";
  const indexedPages=pdfIndexes.reduce((sum,x)=>sum+(x.totalPages||0),0);
  app.innerHTML='<div class="ir-ai-page">'+
   '<header class="ir-ai-hero"><div class="ir-ai-heading"><div class="ir-ai-kicker">IR PROJECT · ЛОКАЛЬНЫЙ ИНЖЕНЕРНЫЙ МОДУЛЬ</div>'+
   '<h1>IR Project AI <span>Инженерный анализ КМ/КМД</span></h1>'+
   '<p>'+esc(object.name)+' · Все данные отдельно для этого объекта</p></div>'+
   '<div class="ir-ai-state"><span class="ir-ai-state-dot"></span><div><strong>'+esc(stateNames[state]||"Не определено")+'</strong><small>'+esc(engine?.reason||"Qwen3-VL · автономный режим")+'</small></div></div></header>'+
   '<div class="ir-ai-stats"><div><small>Загружено файлов</small><b>'+documents.length+'</b><span>Локальное хранение</span></div>'+
   '<div><small>Проиндексировано листов PDF</small><b>'+indexedPages+'</b><span>Текстовые слои, без ИИ</span></div>'+
   '<div><small>3D-конструкций</small><b>—</b><span>Нет подтверждённой геометрии</span></div>'+
   '<div><small>Непроверенных анализов</small><b>'+analyses.length+'</b><span>Не подтверждены инженером</span></div></div>'+
   '<div class="ir-ai-actions"><label>Тип загружаемого комплекта <select id="irAiKind"><option value="Не определён">Не определён</option>'+
   '<option value="КМ">КМ</option><option value="КМД">КМД</option></select></label>'+
   '<button class="ir-ai-primary" id="irAiUpload" '+(!ready||!canEdit||busy?'disabled':'')+'>＋ Добавить чертежи</button>'+
   '<button id="irAiRecognize" '+(!runtime||!engine?.installed||modelReady||busy||!canEdit?'disabled':'')+'>Запустить локальный ИИ</button>'+
   '<button id="irAiStop" '+(!runtime||!canEdit||!(state==="ready"||state==="starting")?'disabled':'')+'>Остановить ИИ</button>'+
   '<button id="irAiRefresh" '+(!runtime||busy?'disabled':'')+'>Проверить ИИ</button>'+
   '<button id="irAiExport" disabled>Экспортировать</button>'+
   '<span class="ir-ai-action-note">Распознавание PNG/JPG · без облака · PDF позже</span></div>'+
   (!ready||!runtime?'<div class="ir-ai-warning" role="status"><b>Требуется новая установка Electron.</b> Действующий установщик не содержит мост локального ИИ; обновления интерфейса недостаточно.</div>':'')+
   (!engine?.installed?'<div class="ir-ai-warning" role="status"><b>Требуется отдельный офлайн-пакет модели.</b> Пока он не поставляется с установщиком. Без него запуск и распознавание недоступны.</div>':'')+
   (message?'<div class="ir-ai-message '+(severity==="error"?"error":"")+'" role="status">'+esc(message)+'</div>':'')+
   '<div class="ir-ai-layout"><div class="ir-ai-main"><nav class="ir-ai-tabs" aria-label="Вкладки инженерного анализа">'+tabs.map(t=>
    '<button type="button" data-ai-tab="'+t[0]+'" class="'+(active===t[0]?'active':'')+'">'+esc(t[1])+'</button>').join("")+'</nav>'+
   '<section id="irAiContent" class="ir-ai-content"></section></div>'+
   '<aside class="ir-ai-assistant"><div class="ir-ai-assistant-head"><b>ИИ-помощник</b><span>Офлайн</span></div>'+
   '<p>После установки локальной модели помощник будет отвечать по чертежам и ссылаться на конкретные листы, марки и узлы.</p>'+
   '<div class="ir-ai-chat-empty">История запросов пока отсутствует. Ответы не имитируются.</div>'+
   '<textarea disabled placeholder="Модель не установлена"></textarea><button disabled>Отправить</button></aside></div>'+
   '<footer class="ir-ai-footer">Этап 2 · Локальное распознавание изображений при наличии установленной модели; результаты не подтверждены. Монтажная схема не изменяется.</footer></div>';
  app.querySelectorAll("[data-ai-tab]").forEach(button=>button.onclick=()=>{active=button.dataset.aiTab;paint()});
  const upload=app.querySelector("#irAiUpload");
  upload.onclick=async()=>{
   if(!ready||!canEdit||busy)return;busy=true;
   upload.disabled=true;upload.textContent="Импортируем файлы…";
   try{
    const kind=app.querySelector("#irAiKind").value,answer=await bridge.select(id,kind);
    if(answer.canceled)return;
    const count=answer.imported?.length||0,skipped=answer.skipped?.length||0,errors=answer.errors||[];
    notice("Загружено: "+count+". Дубликатов: "+skipped+". Ошибок: "+errors.length+
      (errors.length?" · "+errors.slice(0,2).map(x=>x.name+": "+x.error).join("; "):""),errors.length?"error":"info");
    active="documents";
   }catch(error){notice("Не удалось импортировать файлы: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  };
  app.querySelector("#irAiRecognize").onclick=async()=>{
   if(!runtime||busy||!canEdit)return;
   busy=true;notice("Запускаем локальную модель, ожидаем реальной готовности…");paint();
   try{const response=await runtime.start();engine=response;if(response.state==="ready")notice("Локальная модель запущена.");else notice(response.reason||"Модель не запущена","error")}
   catch(error){notice("Ошибка запуска: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  };
  app.querySelector("#irAiStop").onclick=async()=>{
   if(!runtime||!canEdit)return;
   try{engine=await runtime.stop();notice("Локальный ИИ остановлен.")}
   catch(error){notice("Ошибка остановки: "+String(error.message||error),"error")}
   await reload()
  };
  app.querySelector("#irAiRefresh").onclick=()=>reload();
  showContent()
 }
 function showContent(){
  const box=app.querySelector("#irAiContent");if(!box)return;
  if(active==="checks"&&analyses.length){
   box.innerHTML='<h2 class="ir-ai-results-title">Реальные результаты локального анализа · '+analyses.length+'</h2>'+
    analyses.map(x=>'<article class="ir-ai-result"><div class="ir-ai-result-header"><b>'+esc(x.sourceName)+'</b>'+
     '<span>Требует проверки инженера</span></div><div class="ir-ai-result-source">Документ № '+esc(x.documentId)+' · SHA-256 '+esc(x.sha256)+
     ' · '+esc(x.region||"Не задан")+'</div>'+
     (x.notes?'<div class="ir-ai-result-text">'+esc(x.notes.text||"")+'</div>'+
      '<div class="ir-ai-result-row"><b>Найденные обозначения (не проверены):</b> '+esc((x.notes.marks||[]).join(", ")||"Не определены")+'</div>'+
      '<div class="ir-ai-result-row"><b>Сомнения:</b> '+esc((x.notes.unknowns||[]).join("; ")||"Не указаны")+'</div>':
      '<div class="ir-ai-result-text">Нейросеть не вернула корректный JSON. Исходный текст сохранён для проверки.</div>')+
     '<details><summary>Ответ модели без изменений</summary><pre>'+esc(x.raw)+'</pre></details></article>').join("");
   return
  }
  if(active!=="documents"){
   const info=descriptions[active]||descriptions.checks;
   box.innerHTML='<div class="ir-ai-placeholder"><div class="ir-ai-placeholder-icon">◎</div><h2>'+esc(info[0])+'</h2>'+
    '<p>'+esc(info[1])+'</p><span>Функция запланирована, не имитируется</span></div>';return
  }
  const matches=documents.filter(x=>(x.name+" "+x.kind+" "+x.ext).toLowerCase().includes(term.toLowerCase()));
  box.innerHTML='<div class="ir-ai-doc-head"><div><h2>Чертежи КМ/КМД</h2><p>Исходные документы сохраняются локально, а их метаданные — в SQLite. Внешние сервисы не используются.</p></div>'+
   '<input id="irAiSearch" type="search" placeholder="Поиск по файлам" value="'+esc(term)+'" aria-label="Поиск документов"></div>'+
   (!documents.length?'<div class="ir-ai-doc-empty"><b>Чертежей пока нет</b><p>Выберите тип комплекта и нажмите «Добавить чертежи». Поддерживаются PDF, DXF, DWG, PNG, JPG и TIFF. DWG пока только сохраняется, без анализа.</p></div>':
   '<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table"><thead><tr><th>Документ</th><th>Комплект</th><th>Размер</th><th>Статус</th><th>Действия</th></tr></thead><tbody>'+
   matches.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><small>'+esc(x.ext.toUpperCase())+' · '+esc(x.addedAt||"")+'</small></td>'+
    '<td>'+esc(x.kind)+'</td><td>'+size(x.size)+'</td><td><span class="ir-ai-doc-status '+(!x.exists?"missing":"")+'">'+(x.exists?"Не распознано":"Файл отсутствует")+'</span></td>'+
    '<td><div class="ir-ai-doc-actions">'+
    (canEdit&&[".png",".jpg",".jpeg"].includes(x.ext)?'<button data-ai-analyze="'+x.id+'" '+(!modelReady||busy||!x.exists?'disabled':'')+'>Распознать</button>':"")+
    (canEdit&&x.ext===".pdf"?'<button data-ai-pdf-index="'+x.id+'" '+(!pdf||busy||!x.exists?'disabled':'')+'>Индексировать PDF</button>':"")+
    '<button data-ai-open="'+x.id+'" '+(!ready||!x.exists?'disabled':'')+'>Открыть</button>'+
    (canEdit?'<button class="delete" data-ai-remove="'+x.id+'" '+(!ready?'disabled':'')+'>Удалить</button>':"")+'</div></td></tr>').join("")+
   '</tbody></table></div>')+
   '<div class="ir-ai-storage-note">SHA-256 рассчитывается при импорте. Текстовый индекс PDF не является результатом нейросети: повреждённый текст и изображения требуют проверки. Оригинальные файлы сохраняются. Экспорт резервной копии *.db не включает вложения ИИ.</div>'+
   (pdfIndexes.length?'<section class="ir-ai-pdf-results"><h3>Текстовые индексы PDF · '+pdfIndexes.length+'</h3>'+
    pdfIndexes.filter(x=>documents.some(d=>String(d.id)===String(x.documentId))).map(x=>'<article class="ir-ai-pdf-card"><header><strong>'+esc(x.sourceName)+'</strong><span>'+x.totalPages+' лист(ов) · из текстового слоя PDF</span></header>'+
    '<div class="ir-ai-pdf-sheets">'+x.pages.map(p=>'<details><summary>Лист '+p.page+
     ' · '+(p.hasTextLayer?(p.uncertainEncoding?'Возможна повреждённая кодировка':'Есть текст'):'Текстовый слой отсутствует — нужен OCR')+
     (p.truncated?' · Текст сокращён':'')+'</summary>'+
     '<div class="ir-ai-pdf-size">Размер: '+p.widthPt+' × '+p.heightPt+' pt · Фрагментов: '+p.fragmentCount+'</div>'+
     '<pre>'+esc(p.excerpt||"Текст не найден.")+'</pre>'+
     (p.hasTextLayer?'<button type="button" data-ai-pdf-page="'+x.id+':'+p.page+'">Полный текст и координаты</button>':'')+
     '</details>').join("")+'</div></article>').join("")+'</section>':'');
  const search=box.querySelector("#irAiSearch");
  if(search)search.oninput=e=>{const pos=e.target.selectionStart;term=e.target.value;showContent();const next=box.querySelector("#irAiSearch");next?.focus();try{next?.setSelectionRange(pos,pos)}catch{}};
  box.querySelectorAll("[data-ai-pdf-index]").forEach(button=>button.onclick=async()=>{
   if(!pdf||busy||!canEdit)return;
   const documentId=button.dataset.aiPdfIndex;
   busy=true;notice("Читаем реальный текстовый слой PDF по страницам, без нейросети…");paint();
   try{
    const result=await pdf.index(id,documentId);
    notice(result.cached?"Индекс PDF уже сохранён.":"PDF проиндексирован: "+result.totalPages+" лист(ов). Страницы без текста требуют OCR.")
   }catch(error){notice("Не удалось индексировать PDF: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  });
  box.querySelectorAll("[data-ai-pdf-page]").forEach(button=>button.onclick=async()=>{
   if(!pdf)return;
   const [indexId,pageNumber]=button.dataset.aiPdfPage.split(":");
   try{
    const record=await pdf.page(id,indexId,pageNumber);
    const parent=button.closest("details"),pre=parent?.querySelector("pre");
    if(pre)pre.textContent=record.page.text||"Текстовый слой не найден";
    button.disabled=true;button.textContent="Полный текст загружен. Координаты сохранены в индексе."
   }catch(error){notice("Ошибка чтения листа: "+String(error.message||error),"error");paint()}
  });
  box.querySelectorAll("[data-ai-analyze]").forEach(button=>button.onclick=async()=>{
   if(!runtime||!canEdit||busy||!modelReady)return;
   busy=true;notice("Реальный локальный анализ изображения запущен. Результат сохранится для проверки.");paint();
   try{
    const result=await runtime.analyze(id,button.dataset.aiAnalyze);
    notice("Анализ завершён: "+result.source+". Статус: требует проверки инженера.");
    active="checks"
   }catch(error){notice("Анализ не завершён: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  });
  box.querySelectorAll("[data-ai-open]").forEach(button=>button.onclick=async()=>{
   try{await bridge.open(id,button.dataset.aiOpen)}catch(error){notice("Не удалось открыть: "+String(error.message||error),"error");paint()}
  });
  box.querySelectorAll("[data-ai-remove]").forEach(button=>button.onclick=async()=>{
   if(!canEdit||!ready)return;
   const row=documents.find(x=>String(x.id)===button.dataset.aiRemove);if(!row)return;
   if(!confirm('Удалить загруженный документ «'+row.name+'»? Файл будет удалён из хранилища IR Project AI.'))return;
   try{await bridge.remove(id,row.id);notice("Документ удалён: "+row.name);await reload()}
   catch(error){notice("Не удалось удалить файл: "+String(error.message||error),"error");paint()}
  })
 }
 await reload()
};
