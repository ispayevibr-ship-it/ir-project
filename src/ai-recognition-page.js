"use strict";
/* IR Project AI / stage 1. Real local documents, honest unimplemented sections. */
window.irAiRecognitionPage=async function(objectId){
 const app=document.getElementById("app"),id=String(objectId||"");
 if(!app||!/^[0-9]+$/.test(id))return;
 const route=location.hash,esc=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const size=n=>Number(n)>=1048576?(Number(n)/1048576).toFixed(1).replace(".",",")+" МБ":Math.ceil(Number(n)/1024)+" КБ";
 const tabs=[
  ["workflow","Конвейер ИИ"],["model","Общая 3D-модель"],["assembly","3D-модели марок"],
  ["marks","Ведомость марок"],["metal","Спецификация металла"],
  ["fasteners","Метизы"],["documents","Чертежи КМ/КМД"],["revisions","Ревизии КМ/КМД"],["reference","Эталон КМД"],
  ["compare","Сравнение КМ / КМД"],["proposals","Предложения ИИ"],["integrity","Контроль данных"],["checks","Проверка и ошибки"]
 ];
 const descriptions={
  workflow:["Очередь распознавания КМ / КМД","Обработка отдельных листов локальной моделью и отправка результатов на инженерную проверку."],
  model:["Общая 3D-модель","Модель здания появится после распознавания схем расположения и инженерной проверки координат. Без исходных осей и привязок элементы не размещаются."],
  assembly:["Подробные модели отправочных марок","Сборки будут состоять из подтверждённых деталей КМД: профилей, пластин, рёбер и узлов. Условная геометрия не выдаётся за рабочую деталировку."],
  marks:["Ведомость отправочных марок","Результаты распознавания с различением уникальных марок и количества экземпляров появятся после подключения локального ИИ."],
  metal:["Спецификация металлопроката","Профиль, сталь, размеры, количество и масса будут связываться с листом-источником. Данные не будут предполагаться по внешнему виду."],
  fasteners:["Ведомость метизов","Болты, гайки, шайбы и места установки будут учитываться по уникальным соединениям после распознавания узлов."],
  compare:["Сравнение КМ и КМД","Сопоставление геометрии, металлопроката, соединений, количества и ревизий будет доступно после подготовки проверяемых данных."],
  integrity:["Контроль данных IR Project AI","Сквозной просмотр связей между документами, распознаванием, ревизиями, ведомостями и 3D."],
  revisions:["Ревизии КМ и КМД","Утверждение действующих листов и контроль устаревших инженерных проверок."],
  reference:["Эталон КМД","Подтверждённые инженером позиции по действующим листам и сверка с ведомостями."],
  proposals:["Структурированные предложения ИИ","Отдельные поля марок, металлопроката, размеров и соединений с проверкой инженером."],
  checks:["Проверка и замечания","После запуска локального анализа здесь появятся ошибки и неопределённые значения со ссылками на исходные листы и подтверждения инженера."]
 };
 let object,documents=[],analyses=[],verifiedMarks=[],quantityEntries=[],quantitySummary=null,materialEntries=[],materialSummary=null,connectionNodes=[],connectionItems=[],connectionSummary=null,comparisonEntries=[],comparisonSummary=null,comparisonFields={},pdfIndexes=[],workflowTasks=[],workflowSummary=null,proposalEntries=[],proposalSummary=null,revisionSets=[],revisionImpact=null,referenceRows=null,referenceChecks=null,referenceCompare=null,integrityReport=null,engine=null,active="documents",term="",message="",severity="info",busy=false,pdfProgress="";
 let selectedKind="Не определён";
 const stepNumber=(n,done=false)=>'<span class="ir-ai-step-number'+(done?' done':'')+
  '" aria-label="Шаг '+n+(done?' выполнен':'')+'">'+(done?'✓':n)+'</span>';
 try{object=await irProject.data.objects.get(id)}catch(error){app.textContent="Не удалось прочитать объект: "+String(error.message||error);return}
 if(!object){location.hash="/objects";return}
 const bridge=irProject.aiDocuments,ready=!!(bridge&&typeof bridge.list==="function"&&typeof bridge.select==="function");
 const referenceApi=irProject.aiKmdReference||null;
 const runtime=irProject.aiEngine||null,pdf=irProject.aiPdf||null,reviewer=irProject.aiReview||null,workflow=irProject.aiWorkflow||null,integrityApi=irProject.aiIntegrity||null,revisionsApi=irProject.aiRevisions||null,proposalsApi=irProject.aiProposals||null,quantities=irProject.aiMarkQuantities||null,materials=irProject.aiKmdMaterials||null,connections=irProject.aiKmdConnections||null,comparisons=irProject.aiKmKmdCompare||null;
 const canEdit=!!window.irAccess?.canEdit?.("ai-recognition");
 let aiWriteAuthUntil=0,referenceReadSequence=0,reloadSequence=0;
 async function authorizeAiMutation(){
  if(!canEdit||!reviewer){notice("Для изменения AI-данных нужна сессия инженера","error");return false}
  const role=window.irAccess?.role?.();
  if(!["admin","engineer"].includes(role)){notice("Гостю доступен только просмотр","error");return false}
  if(Date.now()<aiWriteAuthUntil)return true;
  const password=await requestReviewPassword(role);
  if(password===null)return false;
  try{
   if(!await reviewer.authorize(role,password))throw Error("Неверный пароль инженера/администратора");
   aiWriteAuthUntil=Date.now()+8*60*1000;
   return true
  }catch(error){notice("Авторизация ИИ: "+String(error.message||error),"error");return false}
 }
 async function reload(){
  const requestId=++reloadSequence,jobs=[];
  if(ready)jobs.push(bridge.list(id).then(v=>{documents=v}).catch(error=>{documents=[];notice("Ошибка загрузки документов: "+String(error.message||error),"error")}));
  if(runtime)jobs.push(runtime.status().then(v=>{engine=v}).catch(error=>{engine=null;notice("Ошибка проверки локальной модели: "+String(error.message||error),"error")}));
  if(reviewer){
   jobs.push(reviewer.list(id).then(v=>{analyses=v}).catch(error=>{analyses=[];notice("Ошибка истории анализа: "+String(error.message||error),"error")}));
   jobs.push(reviewer.register(id).then(v=>{verifiedMarks=v}).catch(error=>{verifiedMarks=[];notice("Ошибка подтверждённых марок: "+String(error.message||error),"error")}))
  }else if(runtime)jobs.push(runtime.results(id).then(v=>{analyses=v}).catch(error=>{analyses=[];notice("Ошибка истории анализа: "+String(error.message||error),"error")}));
  if(quantities){
   jobs.push(quantities.list(id).then(v=>{quantityEntries=v}).catch(error=>{quantityEntries=[];notice("Ошибка загрузки количеств: "+String(error.message||error),"error")}));
   jobs.push(quantities.summary(id).then(v=>{quantitySummary=v}).catch(error=>{quantitySummary=null;notice("Ошибка сводки отправочных марок: "+String(error.message||error),"error")}));
  }
  if(materials){
   jobs.push(materials.list(id).then(v=>{materialEntries=v}).catch(error=>{materialEntries=[];notice("Ошибка спецификации металла: "+String(error.message||error),"error")}));
   jobs.push(materials.summary(id).then(v=>{materialSummary=v}).catch(error=>{materialSummary=null;notice("Ошибка сводки массы деталей: "+String(error.message||error),"error")}))
  }
  if(connections){
   jobs.push(connections.nodes(id).then(v=>{connectionNodes=v}).catch(error=>{connectionNodes=[];notice("Ошибка узлов КМД: "+String(error.message||error),"error")}));
   jobs.push(connections.items(id).then(v=>{connectionItems=v}).catch(error=>{connectionItems=[];notice("Ошибка метизов КМД: "+String(error.message||error),"error")}));
   jobs.push(connections.summary(id).then(v=>{connectionSummary=v}).catch(error=>{connectionSummary=null;notice("Ошибка сводки крепежа: "+String(error.message||error),"error")}))
  }
  if(comparisons){
   jobs.push(comparisons.list(id).then(v=>{comparisonEntries=v}).catch(error=>{comparisonEntries=[];notice("Ошибка записей КМ/КМД: "+String(error.message||error),"error")}));
   jobs.push(comparisons.summary(id).then(v=>{comparisonSummary=v}).catch(error=>{comparisonSummary=null;notice("Ошибка сводки сравнения: "+String(error.message||error),"error")}));
   jobs.push(comparisons.fields().then(v=>{comparisonFields=v}).catch(error=>{comparisonFields={};notice("Ошибка перечня параметров КМ/КМД: "+String(error.message||error),"error")}))
  }
  if(workflow){
   jobs.push(workflow.list(id).then(v=>{workflowTasks=v}).catch(error=>{workflowTasks=[];notice("Ошибка загрузки очереди: "+String(error.message||error),"error")}));
   jobs.push(workflow.summary(id).then(v=>{workflowSummary=v}).catch(error=>{workflowSummary=null;notice("Ошибка статуса очереди: "+String(error.message||error),"error")}))
  }
  if(active==="integrity"&&integrityApi)
   jobs.push(integrityApi.report(id).then(v=>{integrityReport=v})
    .catch(error=>{integrityReport=null;notice("Контроль данных: "+String(error.message||error),"error")}));
  if(referenceApi&&active==="reference"){
   const sequence=++referenceReadSequence;
   referenceRows=null;referenceChecks=null;referenceCompare=null;
   if(typeof referenceApi.snapshot==="function")
    jobs.push(referenceApi.snapshot(id).then(data=>{
     if(!data||!Array.isArray(data.entries)||!data.checks||!data.comparison)
      throw Error("Получен неполный снимок эталона КМД");
     if(sequence===referenceReadSequence){
      referenceRows=data.entries;referenceChecks=data.checks;referenceCompare=data.comparison
     }
    }).catch(e=>{
     if(sequence!==referenceReadSequence)return;
     referenceRows=null;referenceChecks=null;referenceCompare=null;
     notice("Не удалось получить согласованную сверку эталона КМД: "+String(e.message||e),"error")
    }));
   else jobs.push(Promise.all([
    referenceApi.list(id),referenceApi.checks(id),referenceApi.compare(id)
   ]).then(([entries,sheets,comparison])=>{
    if(sequence===referenceReadSequence){
     referenceRows=entries;referenceChecks=sheets;referenceCompare=comparison
    }
   }).catch(e=>{
    if(sequence!==referenceReadSequence)return;
    referenceRows=null;referenceChecks=null;referenceCompare=null;
    notice("Не удалось прочитать эталон КМД: "+String(e.message||e),"error")
   }))
  }
  if(revisionsApi){
   jobs.push(revisionsApi.list(id).then(v=>{revisionSets=v}).catch(error=>{revisionSets=[];notice("Ошибка списка комплектов КМ/КМД: "+String(error.message||error),"error")}));
   jobs.push(revisionsApi.impact(id).then(v=>{revisionImpact=v}).catch(error=>{revisionImpact=null;notice("Ошибка контроля действующих листов: "+String(error.message||error),"error")}))
  }
  if(proposalsApi){
   jobs.push(proposalsApi.list(id).then(v=>{proposalEntries=v}).catch(error=>{proposalEntries=[];notice("Ошибка предложений ИИ: "+String(error.message||error),"error")}));
   jobs.push(proposalsApi.summary(id).then(v=>{proposalSummary=v}).catch(error=>{proposalSummary=null;notice("Ошибка сводки предложений: "+String(error.message||error),"error")}))
  }
  if(pdf)jobs.push(pdf.list(id).then(v=>{pdfIndexes=v}).catch(error=>{pdfIndexes=[];notice("Ошибка PDF-индекса: "+String(error.message||error),"error")}));
  await Promise.all(jobs);
  if(requestId===reloadSequence&&location.hash===route)paint()
 }
 function notice(text,type="info"){message=String(text||"");severity=type}
 function openTab(tab){
  if(!tabs.some(x=>x[0]===tab))return;
  active=tab;
  if(tab==="reference"||tab==="integrity")void reload();
  else paint()
 }
 function paint(){
  if(location.hash!==route)return;
  const state=engine?.state||"missing",stateNames={
   missing:"Пакет модели не установлен",invalid:"Пакет повреждён",
   stopped:"Модель остановлена",starting:"Модель загружается",
   ready:"Модель готова",failed:"Ошибка локальной модели"};
  const modelReady=state==="ready";
  const indexedPages=pdfIndexes.reduce((sum,x)=>sum+(x.totalPages||0),0);
  const availableDocs=documents.filter(x=>x.exists);
  const knownKinds=[...new Set(availableDocs.map(x=>x.kind).filter(x=>["КМ","КМД"].includes(x)))];
  if(selectedKind==="Не определён"&&knownKinds.length===1)selectedKind=knownKinds[0];
  const hasCorrectKind=availableDocs.some(x=>["КМ","КМД"].includes(x.kind));
  const indexedIds=new Set(pdfIndexes.filter(x=>availableDocs.some(d=>
   String(d.id)===String(x.documentId)&&d.sha256===x.sourceSha256&&d.ext===".pdf"&&
   Array.isArray(x.pages)&&x.pages.length>0)).map(x=>String(x.documentId)));
  const hasIndex=indexedIds.size>0;
  const recognized=analyses.some(x=>availableDocs.some(d=>
   String(d.id)===String(x.documentId)&&d.sha256===x.sha256)&&
   (x.originalMarks?.length||x.notes?.marks?.length||x.notes?.text?.trim()||
    x.notes?.structured?.records?.length));
  const reviewed=analyses.some(x=>availableDocs.some(d=>
   String(d.id)===String(x.documentId)&&d.sha256===x.sha256)&&
   ["confirmed","rejected"].includes(x.status));
  const stepDone=[hasCorrectKind,availableDocs.length>0,hasIndex,modelReady,!!recognized,reviewed];
  const stepLabels=["Выбрать КМ/КМД","Добавить PDF","Индексировать PDF",
   "Запустить Qwen","Распознать лист","Проверить результат"];
  const missingStep=stepDone.findIndex(done=>!done);
  const activeStep=missingStep<0?6:missingStep+1;
  const stepsHtml='<div class="ir-ai-step-guide" role="status" aria-label="Порядок распознавания чертежей">'+
   '<b>Порядок действий:</b>'+stepLabels.map((label,i)=>
    '<span class="ir-ai-step-guide-item'+(stepDone[i]?' complete':i+1===activeStep?' current':'')+'">'+
    stepNumber(i+1,stepDone[i])+esc(label)+'</span>').join('')+
   '<small>Следующий шаг: '+activeStep+'. '+esc(stepLabels[activeStep-1])+'</small></div>';
  window.irAiAssemblyPage?.dispose?.();
  app.innerHTML='<div class="ir-ai-page">'+
   '<header class="ir-ai-hero"><div class="ir-ai-heading"><div class="ir-ai-kicker">IR PROJECT · ЛОКАЛЬНЫЙ ИНЖЕНЕРНЫЙ МОДУЛЬ</div>'+
   '<h1>IR Project AI <span>Инженерный анализ КМ/КМД</span></h1>'+
   '<p>'+esc(object.name)+' · Все данные отдельно для этого объекта</p></div>'+
   '<div class="ir-ai-state"><span class="ir-ai-state-dot"></span><div><strong>'+esc(stateNames[state]||"Не определено")+'</strong><small>'+esc(engine?.reason||((engine?.model||"Qwen3-VL")+(engine?.modelVersion?" · v"+engine.modelVersion:"")+" · автономный режим"))+'</small></div></div></header>'+
   '<div class="ir-ai-stats"><div><small>Загружено файлов</small><b>'+documents.length+'</b><span>Локальное хранение</span></div>'+
   '<div><small>Проиндексировано листов PDF</small><b>'+indexedPages+'</b><span>Текстовые слои, без ИИ</span></div>'+
   '<div><small>3D-конструкций</small><b>—</b><span>Нет подтверждённой геометрии</span></div>'+
   '<div><small>Требует проверки</small><b>'+analyses.filter(x=>!x.status||x.status==="requires_review").length+'</b><span>Результаты пока не подтверждены</span></div></div>'+
   '<div class="ir-ai-actions"><label>'+stepNumber(1,hasCorrectKind)+' Тип загружаемого комплекта <select id="irAiKind"><option value="Не определён">Не определён</option>'+
   '<option value="КМ">КМ</option><option value="КМД">КМД</option></select></label>'+
   '<button class="ir-ai-primary" id="irAiUpload" '+(!ready||!canEdit||busy?'disabled':'')+'>'+stepNumber(2,availableDocs.length>0)+' Добавить чертежи</button>'+
   '<button id="irAiRecognize" '+(!runtime||!engine?.installed||modelReady||busy||!canEdit?'disabled':'')+'>'+stepNumber(4,modelReady)+' Запустить локальный ИИ</button>'+
   '<button id="irAiStop" '+(!runtime||!canEdit||!(state==="ready"||state==="starting")?'disabled':'')+'>Остановить ИИ</button>'+
   '<button id="irAiRefresh" '+(!runtime||busy?'disabled':'')+'>Проверить ИИ</button>'+
   '<button id="irAiExport" disabled>Экспортировать</button>'+
   '<span class="ir-ai-action-note">Листы PDF: предпросмотр и визуальный анализ при наличии локальной модели</span></div>'+
   stepsHtml+
   (!ready||!runtime?'<div class="ir-ai-warning" role="status"><b>Требуется новая установка Electron.</b> Действующий установщик не содержит мост локального ИИ; обновления интерфейса недостаточно.</div>':'')+
   (!engine?.installed?'<div class="ir-ai-warning" role="status"><b>Требуется отдельный офлайн-пакет модели.</b> Пока он не поставляется с установщиком. Без него запуск и распознавание недоступны.</div>':'')+
   (message?'<div class="ir-ai-message '+(severity==="error"?"error":"")+'" role="status">'+esc(message)+'</div>':'')+
   '<div class="ir-ai-layout"><div class="ir-ai-main"><nav class="ir-ai-tabs" aria-label="Вкладки инженерного анализа">'+tabs.map(t=>
    '<button type="button" data-ai-tab="'+t[0]+'" class="'+(active===t[0]?'active':'')+'">'+esc(t[1])+'</button>').join("")+'</nav>'+
   '<section id="irAiContent" class="ir-ai-content"></section></div>'+
   '<aside class="ir-ai-assistant"><div class="ir-ai-assistant-head"><b>ИИ-помощник</b><span>Офлайн</span></div>'+
   '<p>'+esc(modelReady?"Qwen запущена. Для анализа чертежей откройте «Конвейер ИИ». Чат с ответами по листам пока не подключён.":engine?.installed?"Qwen подключена, но остановлена. Для анализа PDF запустите локальный ИИ.":"Модель не подключена. Зарегистрируйте Qwen в настройках локальных ИИ-моделей.")+'</p>'+
   '<div class="ir-ai-chat-empty">'+esc(modelReady?"Qwen работает. Чат-помощник ещё не реализован; ответы не имитируются.":"История запросов пока отсутствует. Ответы не имитируются.")+'</div>'+
   '<textarea disabled placeholder="'+esc(modelReady?"Чат пока недоступен — используйте конвейер PDF":"Чат пока недоступен")+'"></textarea><button disabled>Отправить</button></aside></div>'+
   '<footer class="ir-ai-footer">Этап 2 · Локальное распознавание изображений при наличии установленной модели; результаты не подтверждены. Монтажная схема не изменяется.</footer></div>';
  app.querySelectorAll("[data-ai-tab]").forEach(button=>{
   if(button.dataset.aiTab==="checks")button.innerHTML=stepNumber(6,reviewed)+" Проверка и ошибки";
   button.onclick=()=>openTab(button.dataset.aiTab)
  });
  const kindSelect=app.querySelector("#irAiKind");
  if(kindSelect){kindSelect.value=selectedKind;kindSelect.onchange=()=>{selectedKind=kindSelect.value}}
  const upload=app.querySelector("#irAiUpload");
  upload.onclick=async()=>{
   if(!ready||!canEdit||busy||!await authorizeAiMutation())return;busy=true;
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
   if(!runtime||busy||!canEdit||!await authorizeAiMutation())return;
   busy=true;notice("Запускаем локальную модель, ожидаем реальной готовности…");paint();
   try{const response=await runtime.start();engine=response;if(response.state==="ready")notice("Локальная модель запущена.");else notice(response.reason||"Модель не запущена","error")}
   catch(error){notice("Ошибка запуска: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  };
  app.querySelector("#irAiStop").onclick=async()=>{
   if(!runtime||!canEdit||!await authorizeAiMutation())return;
   try{engine=await runtime.stop();notice("Локальный ИИ остановлен.")}
   catch(error){notice("Ошибка остановки: "+String(error.message||error),"error")}
   await reload()
  };
  app.querySelector("#irAiRefresh").onclick=()=>reload();
  showContent()
 }
 function showContent(){
  const modelReady=engine?.state==="ready";
  const box=app.querySelector("#irAiContent");if(!box)return;
  if(active==="integrity"){
   if(window.irAiIntegrityPage)window.irAiIntegrityPage.render(box,{
    report:integrityReport,onRefresh:reload,
    onNavigate:tab=>openTab(tab)
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Модуль контроля данных не загружен.</div>';
   return
  }
  if(active==="reference"){
   if(window.irAiKmdReferencePage&&referenceApi)window.irAiKmdReferencePage.render(box,{
    objectId:id,entries:referenceRows,checks:referenceChecks,comparison:referenceCompare,
    api:referenceApi,reviewer,askPassword:requestReviewPassword,canEdit,
    onRefresh:reload,openPdf:openPdfPreview,notice,
    onNavigate:target=>{
     if(!target||!["marks","metal","fasteners"].includes(target.tab))return;
     active=target.tab;paint();
     if(target.actualId==null)return;
     const key=target.type==="mark"?"quantity-edit":
      target.type==="part"?"metal-edit":
      target.type==="joint"?"joint-edit":"item-edit";
     const idValue=Number(target.actualId);
     if(!Number.isSafeInteger(idValue)||idValue<=0)return;
     const button=app.querySelector('#irAiContent [data-'+key+'="'+idValue+'"]');
     if(button){
      const disclosure=button.closest("details");
      if(disclosure)disclosure.open=true;
      button.scrollIntoView({block:"center",behavior:"auto"});
      button.focus({preventScroll:true})
     }
    }
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Эталон КМД недоступен в этой версии.</div>';
   return
  }
  if(active==="revisions"){
   if(window.irAiRevisionPage)window.irAiRevisionPage.render(box,{
    objectId:id,sets:revisionSets,impact:revisionImpact,documents,indexes:pdfIndexes,
    api:revisionsApi,reviewer,askPassword:requestReviewPassword,canEdit,
    openPdf:openPdfPreview,onRefresh:reload,notice,
    onNavigate:tab=>openTab(tab)
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Модуль контроля ревизий не загружен.</div>';
   return
  }
  if(active==="proposals"){
   if(window.irAiProposalsPage)window.irAiProposalsPage.render(box,{
    objectId:id,proposals:proposalEntries,summary:proposalSummary,
    api:proposalsApi,reviewer,askPassword:requestReviewPassword,canEdit,
    openPdf:openPdfPreview,onRefresh:reload,notice,
    onPrepareQuantity:p=>{
     if(!p?.approved||!p.sourceValid||p.source.kind!=="КМД"||p.type!=="mark_quantity")return;
     active="marks";paint();void openQuantityEditor(null,p)
    }
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Проверка структурированных предложений пока недоступна.</div>';
   return
  }
  if(active==="workflow"){
   if(window.irAiWorkflowPage)window.irAiWorkflowPage.render(box,{
    objectId:id,documents,indexes:pdfIndexes,tasks:workflowTasks,summary:workflowSummary,
    quantities:quantitySummary,materials:materialSummary,connections:connectionSummary,
    comparisons:comparisonSummary,canEdit,queue:workflow,reviewer,
    askPassword:requestReviewPassword,notice,
    onNavigate:tab=>openTab(tab),onRefresh:reload
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Модуль очереди листов не загружен.</div>';
   return
  }
  if(active==="marks"||active==="metal"){
   box.innerHTML='<div class="ir-ai-review-heading"><div><h2>Реестр подтверждённых марок</h2>'+
    '<p>Только марки, проверенные инженером по исходным чертежам. Число упоминаний не равно количеству отправочных элементов.</p></div>'+
    '<b>'+verifiedMarks.length+' уникальных обозначений</b></div>'+
    (!verifiedMarks.length?'<div class="ir-ai-doc-empty"><b>Нет подтверждённых марок</b>'+
     '<p>Загрузите чертежи, выполните анализ, затем проверьте марки во вкладке «Проверка и ошибки». Записи из ИИ нельзя автоматически принимать как ведомость.</p></div>':
     '<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table ir-ai-verified-table"><thead>'+
      '<tr><th>Марка</th><th>Источники подтверждения</th><th>Количество конструкций</th><th>Чертежи</th></tr></thead><tbody>'+
      verifiedMarks.map(row=>'<tr><td><strong>'+esc(row.mark)+'</strong></td><td>'+row.analysisCount+
       ' проверенных упоминаний</td><td>Не установлено</td><td>'+
       row.sources.map(src=>'<div class="ir-ai-mark-source">'+esc(src.sourceName)+
        (src.page?' · лист '+src.page:"")+(src.region?" · фрагмент":"")+
        ' <button type="button" data-ai-source="'+src.documentId+':'+(src.page||1)+'" '+
         (src.page?'':'disabled')+'>Открыть лист</button></div>').join("")+
       '</td></tr>').join("")+'</tbody></table></div>')+
    '<div class="ir-ai-storage-note">Единицы марок, профили, масса и количество экземпляров требуют отдельной проверки спецификаций КМД. Подтверждение обозначения не переносит его в основные ведомости IR Project.</div>';
   box.querySelectorAll("[data-ai-source]").forEach(button=>button.onclick=()=>{
    const [did,page]=button.dataset.aiSource.split(":");void openPdfPreview(did,page)
   });
   const total=quantitySummary||{rows:[],confirmedPositionCount:"—",confirmedPieces:"—",pendingCount:"—",rejectedCount:"—"};
   const summaryRows=total.rows||[];
   const labels={requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"};
   box.insertAdjacentHTML("beforeend",'<section class="ir-ai-quantity-section">'+
    (!quantitySummary?'<div class="ir-ai-quantity-warning">Сводка количества не рассчитана. Прочерки не означают нулевой объём: проверьте сообщения об ошибке и повторите загрузку.</div>':"")+
    '<div class="ir-ai-review-heading"><div><h2>Ведомость отправочных элементов по КМД</h2>'+
     '<p>Количество в штуках только по конкретной позиции спецификации и после подтверждения инженером. Упоминания марки не суммируются.</p></div>'+
     '<div class="ir-ai-quantity-totals"><b>'+total.confirmedPositionCount+' позиций</b><b>'+total.confirmedPieces+' шт. подтверждено</b></div></div>'+
    '<div class="ir-ai-quantity-warning">Это сумма проверенных позиций, а не окончательное количество конструкций всего объекта. До проверки полного комплекта КМД общая ведомость считается неполной.</div>'+
    '<div class="ir-ai-quantity-toolbar"><span>На проверке: '+total.pendingCount+' · отклонено: '+total.rejectedCount+'</span>'+
     (canEdit&&quantities?'<button type="button" data-quantity-new>＋ Добавить позицию из КМД</button>':"")+'</div>'+
    (summaryRows.length?'<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table"><thead><tr>'+
     '<th>Марка / шифры</th><th>Подтверждённое количество</th><th>Основание КМД</th><th></th></tr></thead><tbody>'+
     summaryRows.map(row=>'<tr><td><strong>'+esc(row.mark)+'</strong>'+
      '<small>'+esc([row.cipher,row.secondaryCipher].filter(Boolean).join(" / ")||"Без шифра")+'</small></td>'+
      '<td><strong>'+row.quantity+' шт.</strong></td>'+
      '<td>'+esc(row.source.name)+' · лист '+row.source.page+' · позиция '+esc(row.source.specPosition)+
       (row.source.drawingRevision?' · изм. '+esc(row.source.drawingRevision):"")+'</td>'+
      '<td><button type="button" data-quantity-edit="'+row.id+'" '+(!canEdit?'disabled':'')+'>Открыть</button></td></tr>').join("")+
     '</tbody></table></div>':
     '<div class="ir-ai-doc-empty"><b>Количество отправочных марок не подтверждено</b>'+
      '<p>'+(quantitySummary?
      'Добавьте позицию по спецификации загруженного PDF КМД и подтвердите её количество. Пока числовой итог не определён.':
      'Не удалось проверить итоговое количество. Данные в таблице остаются доступными для исправления.')+
     '</p></div>')+
    (quantityEntries.length?'<details class="ir-ai-quantity-drafts"><summary>Все записи ведомости · '+quantityEntries.length+
     ' (включая неподтверждённые)</summary>'+
     quantityEntries.map(row=>'<div><b>'+esc(row.mark)+' · '+esc(row.cipher||"без шифра")+'</b>'+
      ' · '+(row.quantity===null?"количество не установлено":row.quantity+" шт.")+
      ' · '+esc(labels[row.status]||"Требует проверки")+
      (!row.sourceValid?' · ИСТОЧНИК ИЗМЕНЁН/ОТСУТСТВУЕТ':"")+
      '<button type="button" data-quantity-edit="'+row.id+'" '+(!canEdit?'disabled':'')+'>Редактировать</button>'+
      '<button type="button" data-quantity-history="'+row.id+'">История</button>'+
      '<div data-quantity-log="'+row.id+'" hidden></div></div>').join("")+'</details>':"")+
    '<p class="ir-ai-storage-note">Проверенные количества пока учитываются только внутри IR Project AI и не переносятся в рабочие марки, объёмы, отчёты или монтажную схему.</p>'+
    '</section>');
   const openEntry=button=>{
    if(!canEdit||!quantities)return;
    const row=button.dataset.quantityEdit?
     quantityEntries.find(item=>String(item.id)===button.dataset.quantityEdit):null;
    void openQuantityEditor(row||null)
   };
   box.querySelectorAll("[data-quantity-new],[data-quantity-edit]").forEach(button=>button.onclick=()=>openEntry(button));
   box.querySelectorAll("[data-quantity-history]").forEach(button=>button.onclick=async()=>{
    if(!quantities)return;
    const slot=box.querySelector('[data-quantity-log="'+button.dataset.quantityHistory+'"]');
    if(!slot)return;
    if(!slot.hidden){slot.hidden=true;return}
    slot.hidden=false;slot.textContent="Загружаем историю количества...";
    try{
     const entries=await quantities.history(id,button.dataset.quantityHistory);
     slot.innerHTML=entries.length?entries.map(change=>'<div class="ir-ai-quantity-log-entry">'+
      '<b>Редакция '+change.revision+'</b> · '+esc(change.reviewedAt)+
      ' · '+esc(change.reviewedBy)+' · '+esc(change.current?.quantity??"не указано")+' шт.'+
      ' · '+esc(labels[change.current?.status]||"Требует проверки")+'</div>').join(""):
      'Изменений пока нет'
    }catch(error){slot.textContent="Ошибка журнала: "+String(error.message||error)}
   });
   const m=materialSummary||{confirmedDetailPositions:"—",confirmedAssemblies:"—",
    confirmedMassKg:null,confirmedMassTonnes:null,pendingCount:"—",rejectedCount:"—",byAssembly:[]};
   const formatKg=value=>value==null?"—":Number(value).toLocaleString("ru-RU",{maximumFractionDigits:5});
   const kindLabels={plate:"Листовая деталь",rib:"Ребро жёсткости",gusset:"Косынка",profile:"Прокатный профиль",pipe:"Труба",rod:"Пруток",other:"Другая деталь"};
   const massLabels={drawing:"Масса по КМД",rectangular:"Расчёт прямоугольника",linear:"Масса погонного метра"};
   const counted=materialEntries.filter(part=>part.counted);
   box.insertAdjacentHTML("beforeend",'<section class="ir-ai-metal-section">'+
    (!materialSummary?'<div class="ir-ai-quantity-warning">Сводка массы не рассчитана. Прочерки не означают отсутствие деталей или нулевой тоннаж. Проверьте сообщения об ошибке.</div>':"")+
    '<div class="ir-ai-review-heading"><div><h2>Спецификация металла и деталей КМД</h2>'+
     '<p>Состав каждой отправочной марки: пластины, рёбра, косынки, балки, профили, трубы. Все детали привязаны к листу и позиции КМД.</p></div>'+
     '<div class="ir-ai-quantity-totals"><b>'+m.confirmedDetailPositions+' проверенных деталей</b>'+
      '<b>'+formatKg(m.confirmedMassKg)+' кг · '+formatKg(m.confirmedMassTonnes)+' тн</b></div></div>'+
    '<div class="ir-ai-quantity-warning">Указана только частичная масса по подтверждённым позициям. Это не проектный тоннаж объекта и не готовность монтажной схемы. Масса метизов будет учитываться в отдельном разделе.</div>'+
    '<div class="ir-ai-quantity-toolbar"><span>Отправочных марок с проверенными деталями: '+m.confirmedAssemblies+
     ' · требуют проверки: '+m.pendingCount+' · отклонены: '+m.rejectedCount+'</span>'+
     (canEdit&&materials?'<button type="button" data-metal-new>＋ Добавить деталь КМД</button>':"")+'</div>'+
    (counted.length?'<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table"><thead>'+
     '<tr><th>Марка / позиция</th><th>Материал и профиль</th><th>Количество</th>'+
     '<th>Масса на марку</th><th>Масса всего</th><th>Основание</th><th></th></tr></thead><tbody>'+
     counted.map(part=>'<tr><td><strong>'+esc(part.assemblyMark)+' / '+esc(part.position)+'</strong>'+
      '<small>'+esc(kindLabels[part.type]||part.type)+'</small></td>'+
      '<td>'+esc(part.steelGrade)+' · '+esc(part.profile||part.name||"—")+
       '<small>'+esc(massLabels[part.massMethod]||part.massMethod)+'</small></td>'+
      '<td>'+part.partCount+' шт. на марку × '+part.assemblyQuantity+' марок</td>'+
      '<td>'+formatKg(part.massPerAssemblyKg)+' кг</td>'+
      '<td><b>'+formatKg(part.totalMassKg)+' кг</b></td>'+
      '<td>'+esc(part.source.name)+' · лист '+part.source.page+
       ' · '+esc(part.source.specPosition)+'</td>'+
      '<td><button type="button" data-metal-edit="'+part.id+'" '+(!canEdit?'disabled':'')+'>Открыть</button></td></tr>').join("")+
     '</tbody></table></div>':
     '<div class="ir-ai-doc-empty"><b>Подтверждённой спецификации металла пока нет</b>'+
      '<p>'+(materialSummary?
       'Добавьте детали из КМД и укажите исходную массу либо проверенные параметры для расчёта. Итоги появятся только после подтверждения инженером.':
       'Не удалось рассчитать итоговую массу. Проверьте состояние записей, источников и повторите загрузку.')+
      '</p></div>')+
    (materialEntries.length?'<details class="ir-ai-quantity-drafts"><summary>Все детали · '+materialEntries.length+
     ' (в том числе неподтверждённые)</summary>'+
     materialEntries.map(part=>'<div><b>'+esc(part.assemblyMark)+' / '+esc(part.position)+'</b> · '+
      esc(kindLabels[part.type]||"")+' · '+esc(part.steelGrade||"сталь не указана")+
      ' · '+(part.calculatedUnitMassKg==null?"масса неизвестна":formatKg(part.calculatedUnitMassKg)+" кг/деталь")+
      ' · '+esc(labels[part.status]||"")+
      (!part.counted?' · не включено в итог'+(part.reason?': '+esc(part.reason):""):"")+
      (canEdit?'<button type="button" data-metal-edit="'+part.id+'">Редактировать</button>':"")+
      '<button type="button" data-metal-history="'+part.id+'">История</button>'+
      '<div data-metal-log="'+part.id+'" hidden></div></div>').join("")+'</details>':"")+
    '<p class="ir-ai-storage-note">Теоретическая масса прямоугольной детали рассчитывается по габаритам и указанной плотности и не учитывает вырезы, отверстия, разделку кромок и сварные швы. Для деталей сложной формы используйте массу по спецификации/КМД. В основные ведомости данные автоматически не передаются.</p>'+
    '</section>');
   box.querySelectorAll("[data-metal-new],[data-metal-edit]").forEach(button=>button.onclick=()=>{
    const row=button.dataset.metalEdit?materialEntries.find(v=>String(v.id)===button.dataset.metalEdit):null;
    void openMaterialEditor(row||null)
   });
   box.querySelectorAll("[data-metal-history]").forEach(button=>button.onclick=async()=>{
    if(!materials)return;
    const slot=box.querySelector('[data-metal-log="'+button.dataset.metalHistory+'"]');
    if(!slot)return;
    if(!slot.hidden){slot.hidden=true;return}
    slot.hidden=false;slot.textContent="Загружаем историю металла...";
    try{
     const entries=await materials.history(id,button.dataset.metalHistory);
     slot.innerHTML=entries.length?entries.map(change=>
      '<div class="ir-ai-quantity-log-entry">Редакция '+change.revision+
       ' · '+esc(change.reviewedAt)+' · '+esc(change.reviewedBy)+
       ' · '+esc(change.current?.steelGrade||"")+' · '+
       esc(change.current?.partCount??"")+' дет./марка · '+
       esc(change.current?.status||"")+'</div>').join(""):'Изменений пока нет'
    }catch(error){slot.textContent="Ошибка журнала металла: "+String(error.message||error)}
   });
   if(active==="metal"){
    for(const child of box.children)
     if(!child.classList.contains("ir-ai-metal-section"))child.hidden=true;
   }
   return
  }
  if(active==="checks"){
   const labels={requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"};
   box.innerHTML='<div class="ir-ai-review-heading"><div><h2>Проверка результатов ИИ</h2>'+
    '<p>Исправьте обозначения по исходному чертежу. Исходный ответ модели и история решений сохраняются.</p></div>'+
    '<b>'+analyses.length+' анализов · '+analyses.filter(x=>x.status==="confirmed").length+' подтверждено</b></div>'+
    (!analyses.length?'<div class="ir-ai-doc-empty"><b>Анализов пока нет</b>'+
     '<p>После реального локального распознавания загруженных PDF или изображений результаты появятся здесь для проверки.</p></div>':
    '<div class="ir-ai-review-list">'+analyses.map(x=>
     '<article class="ir-ai-result ir-ai-review-card" data-review-id="'+x.id+'">'+
      '<div class="ir-ai-result-header"><b>'+esc(x.sourceName)+'</b>'+
       '<span class="ir-ai-review-status '+esc(x.status||"requires_review")+'">'+esc(labels[x.status]||labels.requires_review)+'</span></div>'+
      '<div class="ir-ai-result-source">Документ № '+esc(x.documentId)+
       (x.page?' · лист '+x.page:"")+
       (x.region?' · выделенная область':'')+
       ' · SHA-256 '+esc(x.sha256)+' · '+esc(x.sourceRegion||x.region||"Весь документ")+'</div>'+
      (x.page?'<button type="button" class="ir-ai-review-open" data-ai-review-source="'+x.documentId+':'+x.page+'">Просмотр исходного листа</button>':"")+
      '<div class="ir-ai-result-text">'+esc(x.notes?
       (x.notes.text||((x.notes.marks||[]).length||(x.notes.structured?.records||[]).length?
        "Qwen вернула структурированные поля без текстового описания. Проверьте марки и записи ниже.":
        "Qwen вернула корректный, но пустой JSON: ни марки, ни деталей. Для мелкого текста выберите фрагмент листа и распознайте его в увеличенном виде.")) :
       "Ответ модели не удалось разобрать как JSON. Раскройте «Ответ модели без изменений» ниже и попробуйте анализ увеличенного фрагмента листа.")+'</div>'+
      (x.raster?.width&&x.raster?.height?'<div class="ir-ai-result-source">Изображение, переданное Qwen: '+esc(x.raster.width)+' × '+esc(x.raster.height)+' пикселей'+
       (x.pdfTextLayer?' · использован текстовый слой PDF, индекс № '+esc(x.pdfTextLayer.indexId):' · текстовый слой PDF не использован')+'</div>':"")+
      (x.finishReason&&x.finishReason!=="stop"?'<div class="ir-ai-quantity-warning">Генерация Qwen завершилась со статусом '+esc(x.finishReason)+
       '. Ответ может быть обрезан или неполон, инженерное подтверждение пока не требуется.</div>':"")+
      '<div class="ir-ai-result-row"><b>Первоначально распознанные марки:</b> '+esc((x.originalMarks||x.notes?.marks||[]).join(", ")||"Не найдены")+'</div>'+
      '<div class="ir-ai-result-row"><b>Замечания модели:</b> '+esc((x.notes?.unknowns||[]).join("; ")||"Не указаны")+'</div>'+
      '<div class="ir-ai-review-fields"><label>Проверенные обозначения (по одной марке в строке)'+
       '<textarea data-review-marks rows="3" '+(!canEdit||!reviewer?'disabled':'')+'>'+esc((x.marks||x.notes?.marks||[]).join("\n"))+'</textarea></label>'+
       '<label>Решение инженера<select data-review-status '+(!canEdit||!reviewer?'disabled':'')+'>'+
        ['requires_review','confirmed','rejected'].map(v=>'<option value="'+v+'" '+
         ((x.status||"requires_review")===v?'selected':'')+'>'+labels[v]+'</option>').join("")+'</select></label>'+
       '<label>Комментарий инженера<textarea data-review-comment rows="2" '+
        (!canEdit||!reviewer?'disabled':'')+'>'+esc(x.comment||"")+'</textarea></label></div>'+
      '<div class="ir-ai-review-actions">'+
       '<small>Редакция '+(Number(x.revision)||0)+
        (x.reviewedAt?' · последнее решение '+esc(x.reviewedAt):" · решение ещё не принято")+
        '</small><div>'+
        '<button type="button" data-review-history="'+x.id+'" '+(!reviewer?'disabled':'')+'>История</button>'+
        (canEdit?'<button type="button" class="ir-ai-review-save" data-review-save="'+x.id+'" '+(!reviewer||busy?'disabled':'')+'>'+stepNumber(6,x.status==="confirmed"||x.status==="rejected")+' Сохранить проверку</button>':"")+
       '</div></div>'+
      '<div class="ir-ai-review-history" data-history-for="'+x.id+'" hidden></div>'+
      (x.ocr?'<details><summary>Результат PaddleOCR-VL 1.6 · требует проверки</summary>'+
       '<p>Локальная модель '+esc(x.ocr.modelId)+' · версия '+esc(x.ocr.modelVersion)+
       ' · SHA-256 изображения '+esc(x.ocr.sourceImageSha256)+
       ' · блоков '+esc(x.ocr.blocks?.length||0)+'</p>'+
       '<pre>'+esc(x.ocr.text||"Текст не распознан")+'</pre>'+
       '<div>'+((x.ocr.blocks||[]).slice(0,100).map(b=>
        '<div>'+esc(b.type||"text")+' · координаты '+esc(JSON.stringify(b.bbox??null))+
        ': '+esc(b.text||"")+'</div>').join(""))+'</div></details>':"")+
      '<details><summary>Ответ модели без изменений</summary><pre>'+esc(x.raw||"")+'</pre></details>'+
     '</article>').join("")+'</div>')+
    '<p class="ir-ai-storage-note">Подтверждение изменяет только реестр IR Project AI. Ни одна марка не записывается автоматически в производственную ведомость; количество и тоннаж не рассчитываются из повторяющихся упоминаний.</p>';
   box.querySelectorAll("[data-ai-review-source]").forEach(button=>button.onclick=()=>{
    const [did,page]=button.dataset.aiReviewSource.split(":");void openPdfPreview(did,page)
   });
   box.querySelectorAll("[data-review-save]").forEach(button=>button.onclick=async()=>{
    if(busy||!canEdit||!reviewer)return;
    const item=analyses.find(x=>String(x.id)===button.dataset.reviewSave);
    if(!item)return;
    const card=button.closest("[data-review-id]"),marks=card.querySelector("[data-review-marks]").value.
     split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    const status=card.querySelector("[data-review-status]").value;
    const comment=card.querySelector("[data-review-comment]").value;
    if(status==="confirmed"&&!marks.length){notice("Для подтверждения нужна хотя бы одна проверенная марка","error");paint();return}
    const role=window.irAccess?.role?.();
    if(!["admin","engineer"].includes(role)){notice("Проверка доступна только инженеру и администратору","error");paint();return}
    const password=await requestReviewPassword(role);
    if(password===null)return;
    busy=true;
    try{
     const allowed=await reviewer.authorize(role,password);
     if(!allowed)throw Error("Неверный пароль инженера/администратора");
     await reviewer.save(id,item.id,{expectedRevision:Number(item.revision)||0,marks,status,comment});
     notice("Решение сохранено. Оригинальный ответ ИИ оставлен без изменений.");
     await reload()
    }catch(error){notice("Не удалось сохранить проверку: "+String(error.message||error),"error");paint()}
    finally{busy=false}
   });
   box.querySelectorAll("[data-review-history]").forEach(button=>button.onclick=async()=>{
    if(!reviewer)return;
    const target=box.querySelector('[data-history-for="'+button.dataset.reviewHistory+'"]');
    if(!target)return;
    if(!target.hidden){target.hidden=true;return}
    target.hidden=false;target.textContent="Загружаем историю...";
    try{
     const logs=await reviewer.history(id,button.dataset.reviewHistory);
     target.innerHTML=logs.length?'<h4>История проверки</h4>'+logs.map(entry=>
      '<div><b>'+esc(labels[entry.status]||entry.status)+'</b> · '+esc(entry.reviewedAt)+
      ' · '+esc(entry.reviewedBy)+' · '+esc((entry.marks||[]).join(", ")||"Без марок")+
      (entry.comment?'<p>'+esc(entry.comment)+'</p>':"")+'</div>').join(""):
      '<p>Изменений пока не было.</p>'
    }catch(error){target.textContent="Не удалось загрузить историю: "+String(error.message||error)}
   });
   return
  }
  if(active==="fasteners"){
   if(window.irAiConnectionsPage){
    window.irAiConnectionsPage.render(box,{id,nodes:connectionNodes,items:connectionItems,
     summary:connectionSummary,assemblies:quantityEntries,documents,canEdit,api:connections,
     reviewer,askPassword:requestReviewPassword,reload,notice,openPdf:openPdfPreview})
   }else box.innerHTML='<div class="ir-ai-doc-empty">Модуль соединений не загружен.</div>';
   return
  }
  if(active==="assembly"){
   if(window.irAiAssemblyPage)window.irAiAssemblyPage.render(box,{
    id,assemblies:quantityEntries,materials:materialEntries,documents,canEdit,
    api:irProject.aiAssembly3d||null,attachmentApi:irProject.aiAssemblyAttachments||null,
    connectionApi:irProject.aiKmdConnections||null,reviewer,askPassword:requestReviewPassword,
    reload,notice,openPdf:openPdfPreview
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Модуль 3D-сборки не загружен.</div>';
   return
  }
  if(active==="compare"){
   if(window.irAiKmKmdComparePage)window.irAiKmKmdComparePage.render(box,{
    id,entries:comparisonEntries,summary:comparisonSummary,fields:comparisonFields,
    documents,canEdit,api:comparisons,reviewer,askPassword:requestReviewPassword,
    reload,notice,openPdf:openPdfPreview
   });
   else box.innerHTML='<div class="ir-ai-doc-empty">Модуль сравнения КМ/КМД не загружен.</div>';
   return
  }
  if(active!=="documents"){
   const info=descriptions[active]||descriptions.checks;
   box.innerHTML='<div class="ir-ai-placeholder"><div class="ir-ai-placeholder-icon">◎</div><h2>'+esc(info[0])+'</h2>'+
    '<p>'+esc(info[1])+'</p><span>Функция запланирована, не имитируется</span></div>';return
  }
  const matches=documents.filter(x=>[x?.name,x?.kind,x?.ext].map(v=>String(v??"")).join(" ").toLowerCase().includes(term.toLowerCase()));
  box.innerHTML='<div class="ir-ai-doc-head"><div><h2>Чертежи КМ/КМД</h2><p>Исходные документы сохраняются локально, а их метаданные — в SQLite. Внешние сервисы не используются.</p></div>'+
   '<input id="irAiSearch" type="search" placeholder="Поиск по файлам" value="'+esc(term)+'" aria-label="Поиск документов"></div>'+
   (!matches.length&&documents.length?'<div class="ir-ai-doc-empty"><b>По запросу ничего не найдено</b><p>Очистите поиск, чтобы увидеть все '+documents.length+' загруженных файлов.</p></div>':
   !documents.length?'<div class="ir-ai-doc-empty"><b>Чертежей пока нет</b><p>Выберите тип комплекта и нажмите «Добавить чертежи». Поддерживаются PDF, DXF, DWG, PNG, JPG и TIFF. DWG пока только сохраняется, без анализа.</p></div>':
   '<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table"><thead><tr><th>Документ</th><th>Комплект</th><th>Размер</th><th>Статус</th><th>Действия</th></tr></thead><tbody>'+
   matches.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><small>'+esc(String(x.ext||"").toUpperCase())+' · '+esc(x.addedAt||"")+'</small></td>'+
    '<td>'+esc(x.kind||"Не определён")+'</td><td>'+size(x.size||0)+'</td><td><span class="ir-ai-doc-status '+(!x.exists?"missing":"")+'">'+(x.exists?"Не распознано":"Файл отсутствует")+'</span></td>'+
    '<td><div class="ir-ai-doc-actions">'+
    (canEdit&&[".png",".jpg",".jpeg"].includes(x.ext)?'<button data-ai-analyze="'+x.id+'" '+(!modelReady||busy||!x.exists?'disabled':'')+'>Распознать</button>':"")+
    (x.ext===".pdf"?'<button data-ai-pdf-preview="'+x.id+':1" '+(!pdf||busy||!x.exists?'disabled':'')+'>Лист 1</button>':"")+
    (canEdit&&x.ext===".pdf"&&pdfIndexes.some(p=>String(p.documentId)===String(x.id)&&Array.isArray(p.pages)&&p.pages.some(page=>Number(page.page)===1))?'<button data-ai-pdf-vision="'+x.id+':1" '+(!modelReady||busy||!x.exists?'disabled':'')+'>'+stepNumber(5,!!recognized)+' Распознать лист 1</button>':"")+
    (canEdit&&x.ext===".pdf"?'<button data-ai-pdf-index="'+x.id+'" '+(!pdf||busy||!x.exists?'disabled':'')+'>'+stepNumber(3,indexedIds.has(String(x.id)))+' Индексировать PDF</button>':"")+
    '<button data-ai-open="'+x.id+'" '+(!ready||!x.exists?'disabled':'')+'>Открыть</button>'+
    (canEdit?'<button class="delete" data-ai-remove="'+x.id+'" '+(!ready?'disabled':'')+'>Удалить</button>':"")+'</div></td></tr>').join("")+
   '</tbody></table></div>')+
   '<div class="ir-ai-storage-note">SHA-256 рассчитывается при импорте. Текстовый индекс PDF не является результатом нейросети: повреждённый текст и изображения требуют проверки. Оригинальные файлы сохраняются. Экспорт резервной копии *.db не включает вложения ИИ.</div>'+
   (pdfIndexes.length?'<section class="ir-ai-pdf-results"><h3>Текстовые индексы PDF · '+pdfIndexes.length+'</h3>'+
    pdfIndexes.filter(x=>documents.some(d=>String(d.id)===String(x.documentId))).map(x=>'<article class="ir-ai-pdf-card"><header><strong>'+esc(x.sourceName)+'</strong><span>'+x.totalPages+' лист(ов) · из текстового слоя PDF</span></header>'+
    '<div class="ir-ai-pdf-sheets">'+(Array.isArray(x.pages)?x.pages:[]).map(p=>'<details><summary>Лист '+p.page+
     ' · '+(p.hasTextLayer?(p.uncertainEncoding?'Возможна повреждённая кодировка':'Есть текст'):'Текстовый слой отсутствует — нужен OCR')+
     (p.truncated?' · Текст сокращён':'')+'</summary>'+
     '<div class="ir-ai-pdf-size">Размер: '+p.widthPt+' × '+p.heightPt+' pt · Фрагментов: '+p.fragmentCount+'</div>'+
     '<pre>'+esc(p.excerpt||"Текст не найден.")+'</pre>'+
     '<div class="ir-ai-pdf-sheet-actions"><button type="button" data-ai-pdf-preview="'+x.documentId+':'+p.page+'">Просмотр листа</button>'+
     (canEdit?'<button type="button" data-ai-pdf-vision="'+x.documentId+':'+p.page+'" '+(!modelReady||busy?'disabled title="Сначала установите и запустите локальную модель"':'')+'>'+stepNumber(5,!!recognized)+' Распознать лист ИИ</button>':'')+
     (p.hasTextLayer?'<button type="button" data-ai-pdf-page="'+x.id+':'+p.page+'">Полный текст и координаты</button>':'')+'</div>'+
     '</details>').join("")+'</div></article>').join("")+'</section>':'');
  const search=box.querySelector("#irAiSearch");
  if(search)search.oninput=e=>{const pos=e.target.selectionStart;term=e.target.value;showContent();const next=box.querySelector("#irAiSearch");next?.focus();try{next?.setSelectionRange(pos,pos)}catch{}};
  box.querySelectorAll("[data-ai-pdf-preview]").forEach(button=>button.onclick=()=>{
   const [did,page]=button.dataset.aiPdfPreview.split(":");
   openPdfPreview(did,page)
  });
  box.querySelectorAll("[data-ai-pdf-vision]").forEach(button=>button.onclick=async()=>{
   if(!pdf||!canEdit||busy||!modelReady||!await authorizeAiMutation())return;
   const [did,page]=button.dataset.aiPdfVision.split(":");
   busy=true;notice("Реальный локальный ИИ анализирует лист "+page+". Результат сохранится только как непроверенное предположение.");paint();
   try{
    const result=await pdf.analyze(id,did,page);
    notice((result.marks||[]).length?
     "Анализ PDF завершён: "+result.source+" · лист "+result.page+". Проверьте результат перед использованием.":
     "Qwen обработала лист "+result.page+", но не нашла марок. Не подтверждайте пустой результат: откройте лист, выделите область штампа и распознайте фрагмент.");
    active="checks"
   }catch(error){notice("Распознавание листа не выполнено: "+String(error.message||error),"error")}
   finally{busy=false;await reload()}
  });
  box.querySelectorAll("[data-ai-pdf-index]").forEach(button=>button.onclick=async()=>{
   if(!pdf||busy||!canEdit||!await authorizeAiMutation())return;
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
   if(!runtime||!canEdit||busy||!modelReady||!await authorizeAiMutation())return;
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
   if(!confirm('Удалить документ «'+row.name+'» из IR Project AI? Его технический PDF-индекс тоже будет удалён. Если есть результаты анализа, ревизии или инженерная история — удаление будет запрещено.'))return;
   if(!await authorizeAiMutation())return;
   try{await bridge.remove(id,row.id);notice("Документ удалён: "+row.name);await reload()}
   catch(error){
    const reason=String(error.message||error).replace(/^Error invoking remote method ['"]ai-documents:remove['"]: (?:Error: )?/,"");
    notice("Не удалось удалить файл: "+reason,"error");paint()
   }
  })
 }
 async function requestReviewPassword(role){
  return new Promise(resolve=>{
   const dlg=document.createElement("dialog");dlg.className="ir-ai-review-password";
   dlg.innerHTML='<form method="dialog"><h3>Подтверждение проверки</h3>'+
    '<p>Введите пароль '+(role==="admin"?"администратора":"инженера")+
    '. Решение будет сохранено в журнале проверки объекта.</p>'+
    '<input type="password" required autocomplete="off" aria-label="Пароль">'+
    '<div><button type="button" data-cancel>Отмена</button>'+
    '<button type="submit">Подтвердить</button></div></form>';
   let settled=false;
   const finish=v=>{if(settled)return;settled=true;dlg.close();dlg.remove();resolve(v)};
   dlg.querySelector("form").onsubmit=event=>{event.preventDefault();finish(dlg.querySelector("input").value)};
   dlg.querySelector("[data-cancel]").onclick=()=>finish(null);
   dlg.oncancel=event=>{event.preventDefault();finish(null)};
   document.body.appendChild(dlg);dlg.showModal();dlg.querySelector("input").focus()
  })
 }
 async function openMaterialEditor(original=null){
  if(!canEdit||!materials||!reviewer)return;
  const role=window.irAccess?.role?.();
  if(!["admin","engineer"].includes(role))return;
  const assemblies=quantityEntries.filter(row=>row.status!=="rejected");
  const sources=documents.filter(doc=>doc.kind==="КМД"&&doc.ext===".pdf"&&doc.exists);
  if(!assemblies.length||!sources.length){
   notice("Сначала добавьте отправочную марку и исходный PDF КМД. Для каждой детали нужна подтверждаемая связь с документом.","error");
   paint();return
  }
  const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-metal-dialog";
  const formValues=(field,fallback="")=>esc(original?.[field]??fallback);
  const srcValues=(field,fallback="")=>esc(original?.source?.[field]??fallback);
  const typeLabels={plate:"Пластина (лист)",rib:"Ребро жёсткости",gusset:"Косынка",
   profile:"Прокатный профиль",pipe:"Труба",rod:"Пруток",other:"Другая стальная деталь"};
  const methods={drawing:"Масса 1 детали по спецификации КМД",
   rectangular:"Расчёт прямоугольной детали (без отверстий)",
   linear:"Масса профиля по кг/м и длине"};
  const select=(options,val)=>Object.entries(options).map(([v,label])=>
   '<option value="'+v+'" '+(String(val)===v?"selected":"")+'>'+esc(label)+'</option>').join("");
  dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+
   (original?"Редактировать деталь КМД":"Добавить деталь в отправочную марку")+'</h3>'+
   '<p>Все размеры в миллиметрах, масса в килограммах. Укажите точные данные по исходному КМД. Для металлопроката не подставляется масса из приблизительных таблиц.</p>'+
   '<div class="ir-ai-quantity-form-grid">'+
   '<label class="wide">Отправочная марка *<select name="assemblyId" required>'+
    assemblies.map(a=>'<option value="'+a.id+'" '+
     (Number(original?.assemblyId)===a.id?"selected":"")+'>'+esc(a.mark)+' · '+
     esc([a.cipher,a.secondaryCipher].filter(Boolean).join(" / "))+ " · "+
     (a.status==="confirmed"?a.quantity+" шт. подтверждено":"количество не подтверждено")+
     '</option>').join("")+'</select></label>'+
   '<label>Позиция детали КМД *<input name="position" required maxlength="100" value="'+formValues("position")+'" placeholder="Д1 / Пл2"></label>'+
   '<label>Тип детали<select name="type">'+select(typeLabels,original?.type||"plate")+'</select></label>'+
   '<label>Наименование детали<input name="name" maxlength="150" value="'+formValues("name")+'"></label>'+
   '<label>Профиль / сечение<input name="profile" maxlength="100" value="'+formValues("profile")+'" placeholder="Лист 10 / двутавр 30Б1"></label>'+
   '<label>Марка стали *<input name="steelGrade" maxlength="80" value="'+formValues("steelGrade")+'" placeholder="С245 / С345"></label>'+
   '<label>ГОСТ / стандарт<input name="standard" maxlength="100" value="'+formValues("standard")+'"></label>'+
   '<label>Деталей на 1 марку, шт. *<input name="partCount" required type="number" min="1" max="100000" step="1" value="'+formValues("partCount",1)+'"></label>'+
   '<label class="wide">Источник массы<select name="massMethod">'+select(methods,original?.massMethod||"drawing")+'</select></label>'+
   '<label>Длина, мм<input name="lengthMm" type="number" min="0.01" max="1000000" step="any" value="'+formValues("lengthMm")+'"></label>'+
   '<label>Ширина, мм<input name="widthMm" type="number" min="0.01" max="1000000" step="any" value="'+formValues("widthMm")+'"></label>'+
   '<label>Толщина, мм<input name="thicknessMm" type="number" min="0.01" max="10000" step="any" value="'+formValues("thicknessMm")+'"></label>'+
   '<label>Плотность, кг/м³<input name="densityKgM3" type="number" min="5000" max="10000" step="any" value="'+formValues("densityKgM3")+'" placeholder="Указать по материалу"></label>'+
   '<label>Масса 1 пог. м, кг/м<input name="linearKgM" type="number" min="0.00001" max="100000" step="any" value="'+formValues("linearKgM")+'"></label>'+
   '<label>Масса 1 детали по КМД, кг<input name="drawingMassKg" type="number" min="0.00001" max="1000000" step="any" value="'+formValues("drawingMassKg")+'"></label>'+
   '<label class="wide ir-ai-metal-checkbox"><input type="checkbox" name="isSolidRectangle" '+
    (original?.isSolidRectangle?"checked":"")+'><span>Подтверждаю: деталь — сплошной прямоугольник без отверстий, вырезов и скосов</span></label>'+
   '<label class="wide">Чертёж PDF КМД *<select name="documentId" required>'+
    sources.map(doc=>'<option value="'+doc.id+'" '+
     (Number(initial?.source?.documentId)===Number(doc.id)?"selected":"")+'>'+esc(doc.name)+'</option>').join("")+'</select></label>'+
   '<label>Лист КМД *<input name="page" required type="number" min="1" max="2000" step="1" value="'+srcValues("page",1)+'"></label>'+
   '<label>Позиция спецификации *<input name="specPosition" required maxlength="100" value="'+srcValues("specPosition")+'"></label>'+
   '<label>Изменение / ревизия<input name="drawingRevision" maxlength="40" value="'+srcValues("drawingRevision")+'"></label>'+
   '<label>Статус<select name="status">'+
    select({requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"},
     original?.status||"requires_review")+'</select></label>'+
   '<label class="wide">Комментарий инженера<textarea name="comment" maxlength="1500" rows="2">'+formValues("comment")+'</textarea></label>'+
   '</div>'+
   '<p class="ir-ai-quantity-dialog-hint" data-metal-calculation></p>'+
   '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
   '<button type="submit">Сохранить деталь</button></div>'+
   '<p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
  document.body.appendChild(dlg);
  dlg.querySelector("[data-cancel]").onclick=()=>dlg.close();
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  const form=dlg.querySelector("form"),calc=dlg.querySelector("[data-metal-calculation]");
  function preview(){
   const f=Object.fromEntries(new FormData(form).entries());
   const isPositive=x=>x!==""&&Number.isFinite(Number(x))&&Number(x)>0;
   let kg=null;
   if(f.massMethod==="drawing"&&isPositive(f.drawingMassKg))kg=Number(f.drawingMassKg);
   if(f.massMethod==="linear"&&isPositive(f.lengthMm)&&isPositive(f.linearKgM))
    kg=Number(f.lengthMm)/1000*Number(f.linearKgM);
   if(f.massMethod==="rectangular"&&f.isSolidRectangle&&
    [f.lengthMm,f.widthMm,f.thicknessMm,f.densityKgM3].every(isPositive))
    kg=Number(f.lengthMm)*Number(f.widthMm)*Number(f.thicknessMm)*Number(f.densityKgM3)/1e9;
   const count=Number(f.partCount);
   calc.textContent=kg===null?"Для расчёта укажите параметры выбранного метода. Сервер проверит их перед сохранением.":
    "Предварительная масса 1 детали: "+kg.toLocaleString("ru-RU",{maximumFractionDigits:5})+
    " кг; деталей на марку: "+(Number.isSafeInteger(count)&&count>0?count:"не указано")+
    ". Итог по объекту считается только после подтверждения детали и количества марки.";
  }
  form.addEventListener("input",preview);form.addEventListener("change",preview);preview();
  let saving=false;
  form.onsubmit=async event=>{
   event.preventDefault();if(saving)return;
   const f=Object.fromEntries(new FormData(form).entries());
   const password=await requestReviewPassword(role);
   if(password===null)return;
   saving=true;
   const error=dlg.querySelector("[data-error]");error.hidden=true;
   try{
    if(!await reviewer.authorize(role,password))throw Error("Неверный пароль инженера/администратора");
    await materials.save(id,original?.id||null,{
     expectedRevision:Number(original?.revision)||0,
     assemblyId:Number(f.assemblyId),position:f.position,type:f.type,name:f.name,
     profile:f.profile,steelGrade:f.steelGrade,standard:f.standard,partCount:Number(f.partCount),
     massMethod:f.massMethod,lengthMm:f.lengthMm,widthMm:f.widthMm,thicknessMm:f.thicknessMm,
     densityKgM3:f.densityKgM3,linearKgM:f.linearKgM,drawingMassKg:f.drawingMassKg,
     isSolidRectangle:Boolean(f.isSolidRectangle),documentId:Number(f.documentId),
     page:Number(f.page),specPosition:f.specPosition,drawingRevision:f.drawingRevision,
     status:f.status,comment:f.comment
    });
    dlg.close();notice("Деталь КМД сохранена. Тоннаж пересчитан только по проверенным данным.");
    await reload()
   }catch(error){const target=dlg.querySelector("[data-error]");target.hidden=false;
    target.textContent="Не удалось сохранить деталь: "+String(error.message||error)}
   finally{saving=false}
  };
  dlg.showModal()
 }
 async function openQuantityEditor(original=null,suggestion=null){
  if(!canEdit||!quantities||!reviewer)return;
  const sources=documents.filter(doc=>doc.kind==="КМД"&&doc.ext===".pdf"&&doc.exists);
  if(!sources.length){
   notice("Для учёта количества сначала загрузите PDF со спецификацией КМД в этот объект.","error");
   paint();return
  }
  const role=window.irAccess?.role?.();
  if(!["admin","engineer"].includes(role))return;
  const prefill=suggestion?{
   mark:suggestion.values?.mark||"",cipher:suggestion.values?.cipher||"",
   secondaryCipher:suggestion.values?.secondaryCipher||"",
   quantity:suggestion.values?.quantity||"",status:"requires_review",
   source:{documentId:suggestion.source?.documentId,page:suggestion.source?.page,
    specPosition:suggestion.values?.specPosition||"",
    drawingRevision:suggestion.values?.drawingRevision||""},
   comment:"Предложение ИИ: анализ № "+suggestion.analysisId+" · позиция "+
    (suggestion.index+1)+". Цитата модели: "+(suggestion.evidence?.quote||"")
  }:null;
  const initial=original||prefill;
  const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password";
  const options=sources.map(doc=>'<option value="'+doc.id+'" '+
   (Number(original?.source?.documentId)===Number(doc.id)?"selected":"")+'>'+esc(doc.name)+'</option>').join("");
  const val=(name,def="")=>esc(initial?.[name]??def);
  const sourceVal=(name,def="")=>esc(initial?.source?.[name]??def);
  dlg.innerHTML='<form class="ir-ai-quantity-form">'+
   '<h3>'+(original?'Редактировать позицию отправочной марки':'Добавить позицию по спецификации КМД')+'</h3>'+
   '<p>Указывайте количество только по загруженному чертежу КМД. Каждая запись имеет отдельный источник и историю.</p>'+
   '<div class="ir-ai-quantity-form-grid">'+
   '<label>Марка *<input name="mark" maxlength="64" required value="'+val("mark")+'" placeholder="К41"></label>'+
   '<label>Шифр<input name="cipher" maxlength="60" value="'+val("cipher")+'"></label>'+
   '<label>Второй шифр<input name="secondaryCipher" maxlength="60" value="'+val("secondaryCipher")+'"></label>'+
   '<label>Количество, шт. * для подтверждения<input name="quantity" type="number" min="1" max="1000000" step="1" value="'+val("quantity")+'"></label>'+
   '<label class="wide">Документ КМД *<select name="documentId" required>'+options+'</select></label>'+
   '<label>Номер листа PDF *<input name="page" type="number" min="1" max="2000" step="1" required value="'+sourceVal("page",1)+'"></label>'+
   '<label>Позиция спецификации *<input name="specPosition" maxlength="90" required value="'+sourceVal("specPosition")+'" placeholder="Поз. 12 / лист 45"></label>'+
   '<label>Ревизия/изменение КМД<input name="drawingRevision" maxlength="40" value="'+sourceVal("drawingRevision")+'"></label>'+
   '<label>Статус<select name="status">'+
    ['requires_review','confirmed','rejected'].map(st=>'<option value="'+st+'" '+
     ((initial?.status||"requires_review")===st?"selected":"")+'>'+
     ({requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"}[st])+'</option>').join("")+
   '</select></label>'+
   '<label class="wide">Примечание инженера<textarea name="comment" maxlength="1500" rows="3">'+val("comment")+'</textarea></label></div>'+
   '<p class="ir-ai-quantity-dialog-hint">При подтверждении потребуется пароль. Повторение обозначения на других листах не добавит экземпляров автоматически.</p>'+
   '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
    '<button type="submit">Сохранить запись</button></div>'+
   '<p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
  document.body.appendChild(dlg);
  dlg.querySelector("[data-cancel]").onclick=()=>dlg.close();
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  const form=dlg.querySelector("form");let saving=false;
  form.onsubmit=async event=>{
   event.preventDefault();if(saving)return;
   const fields=Object.fromEntries([...new FormData(form).entries()]);
   if(fields.status==="confirmed"&&!fields.quantity){
    const error=dlg.querySelector("[data-error]");error.hidden=false;error.textContent="Для подтверждения укажите количество из спецификации";return
   }
   const password=await requestReviewPassword(role);
   if(password===null)return;
   saving=true;
   const error=dlg.querySelector("[data-error]");error.hidden=true;
   try{
    const authorized=await reviewer.authorize(role,password);
    if(!authorized)throw Error("Неверный пароль "+(role==="admin"?"администратора":"инженера"));
    await quantities.save(id,original?.id||null,{
     expectedRevision:Number(original?.revision)||0,
     mark:fields.mark,cipher:fields.cipher,secondaryCipher:fields.secondaryCipher,
     quantity:fields.quantity,documentId:Number(fields.documentId),
     page:Number(fields.page),specPosition:fields.specPosition,
     drawingRevision:fields.drawingRevision,status:fields.status,comment:fields.comment
    });
    dlg.close();
    notice("Позиция отправочной марки сохранена с привязкой к КМД. Итоги учитывают только подтверждённые записи.");
    await reload()
   }catch(e){error.hidden=false;error.textContent="Не удалось сохранить: "+String(e.message||e)}
   finally{saving=false}
  };
  dlg.showModal()
 }
 async function openPdfPreview(documentId,page){
  if(!pdf||busy)return;
  busy=true;notice("Подготавливаем реальное изображение PDF, лист "+page+"…");paint();
  try{
   const result=await pdf.preview(id,documentId,page);
   if(location.hash!==route)return;
   const original=result;
   const validImage=value=>/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(value||""));
   if(!validImage(original.dataUrl))throw Error("Неверный формат PDF-изображения");
   const dlg=document.createElement("dialog");dlg.className="ir-ai-pdf-preview-dialog";
   dlg.innerHTML='<div class="ir-ai-pdf-preview-header"><div><b data-region-title></b>'+
    '<small data-region-meta></small><small data-region-ai-status role="status"></small></div><div class="ir-ai-pdf-preview-actions">'+
    '<button type="button" data-region-extract disabled>Увеличить фрагмент</button>'+
    (canEdit?'<button type="button" data-region-analyze disabled>Распознать фрагмент ИИ</button>':'')+
    '<button type="button" data-region-back hidden>Вернуться к листу</button>'+
    '<button type="button" data-pdf-fit>100%</button>'+
    '<button type="button" data-pdf-close>Закрыть ✕</button></div></div>'+
    '<div class="ir-ai-pdf-preview-stage"><div class="ir-ai-pdf-image-wrap">'+
    '<img alt="Фактический лист PDF"><div class="ir-ai-pdf-region-layer" title="Выделите нужную область мышью или касанием">'+
    '<div class="ir-ai-pdf-region-selection"></div></div></div></div>';
   const img=dlg.querySelector("img"),wrap=dlg.querySelector(".ir-ai-pdf-image-wrap"),
    layer=dlg.querySelector(".ir-ai-pdf-region-layer"),rectangle=dlg.querySelector(".ir-ai-pdf-region-selection"),
    extract=dlg.querySelector("[data-region-extract]"),
    recognize=dlg.querySelector("[data-region-analyze]"),back=dlg.querySelector("[data-region-back]"),
    fit=dlg.querySelector("[data-pdf-fit]"),meta=dlg.querySelector("[data-region-meta]"),
    aiState=dlg.querySelector("[data-region-ai-status]"),title=dlg.querySelector("[data-region-title]");
   let crop=null,selected=null,drag=null,loading=false,fitted=true,modelReady=false,aiStatusJob=null;
   aiState.textContent="Проверяем готовность локальной Qwen…";
   async function refreshAiStatus(){
    if(!runtime?.status||!dlg.isConnected)return;
    if(aiStatusJob)return aiStatusJob;
    aiStatusJob=(async()=>{
     try{
      const current=await runtime.status();
      if(!dlg.isConnected)return;
      engine=current;
      modelReady=current?.state==="ready";
      aiState.textContent=modelReady?
       "Qwen готова. Выделите область листа для распознавания.":
       "Qwen не готова ("+String(current?.state||"неизвестно")+
       "). Закройте просмотр, запустите локальный ИИ и откройте лист снова.";
     }catch(error){
      if(!dlg.isConnected)return;
      modelReady=false;
      aiState.textContent="Не удалось проверить Qwen: "+String(error.message||error).slice(0,180)
     }finally{if(dlg.isConnected)updateSelection()}
    })();
    try{return await aiStatusJob}finally{aiStatusJob=null}
   }
   function showImage(view){
    if(!validImage(view.dataUrl))throw Error("Неверный формат увеличенного фрагмента PDF");
    img.src=view.dataUrl;
    wrap.style.width=fitted?"min(100%, "+view.width+"px)":view.width+"px";
    title.textContent=String(original.sourceName||"PDF")+" · лист "+original.page+"/"+original.total+
     (crop?" · увеличенный фрагмент":"");
    meta.textContent=(crop?"Выделенный фрагмент: ":"Источник: ")+view.width+" × "+view.height+
     " px · SHA-256 "+original.sha256+
     (crop&&view.sourceRectPt?" · прямоугольник PDF, pt: "+JSON.stringify(view.sourceRectPt):"");
    back.hidden=!crop;layer.style.display=crop?"none":"";
    updateSelection()
   }
   function updateSelection(){
    rectangle.style.display=!selected||crop?"none":"block";
    if(selected&&!crop){
     rectangle.style.left=(selected.x*100)+"%";rectangle.style.top=(selected.y*100)+"%";
     rectangle.style.width=(selected.width*100)+"%";rectangle.style.height=(selected.height*100)+"%"
    }
    extract.disabled=loading||!selected||!!crop;
    if(recognize){
     recognize.disabled=loading||!selected||!modelReady||!canEdit;
     recognize.title=!canEdit?"Только инженер или администратор может распознавать лист":
      !modelReady?"Qwen не готова — проверьте статус модели над изображением":
      !selected?"Выделите область чертежа мышью или касанием":
      crop?"Распознать увеличенный участок по исходным координатам PDF":
      "Запустить Qwen для выбранного участка PDF";
    }
   }
   function point(event){
    const bounds=layer.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    return{
     x:Math.min(1,Math.max(0,(event.clientX-bounds.left)/bounds.width)),
     y:Math.min(1,Math.max(0,(event.clientY-bounds.top)/bounds.height))
    }
   }
   function rectangleFrom(a,b){
    const r={x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),
     width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};
    return Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v*1e6)/1e6]))
   }
   layer.onpointerdown=event=>{
    if(event.button!==0&&event.pointerType==="mouse"||loading||crop)return;
    const start=point(event);if(!start)return;
    drag={start,id:event.pointerId};
    try{layer.setPointerCapture(event.pointerId)}catch{}
    selected=null;updateSelection();event.preventDefault()
   };
   layer.onpointermove=event=>{
    if(!drag||drag.id!==event.pointerId||loading)return;
    const end=point(event);if(!end)return;
    selected=rectangleFrom(drag.start,end);
    updateSelection()
   };
   const finish=event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const end=point(event),rect=end?rectangleFrom(drag.start,end):null;
    drag=null;
    selected=rect&&rect.width>=0.01&&rect.height>=0.01&&
     rect.x+rect.width<=1.000001&&rect.y+rect.height<=1.000001?rect:null;
    updateSelection()
   };
   layer.onpointerup=event=>{finish(event);void refreshAiStatus()};
   layer.onpointercancel=()=>{drag=null;selected=null;updateSelection()};
   fit.onclick=()=>{
    fitted=!fitted;fit.textContent=fitted?"100%":"По ширине";
    wrap.style.width=fitted?"min(100%, "+(crop?.width||original.width)+"px)":
     (crop?.width||original.width)+"px"
   };
   extract.onclick=async()=>{
    if(!selected||crop||loading)return;
    const rect={...selected};loading=true;updateSelection();
    try{
     const view=await pdf.regionPreview(id,documentId,page,rect);
     crop=view;showImage(view)
    }catch(error){meta.textContent="Не удалось увеличить фрагмент: "+String(error.message||error)}
    finally{loading=false;updateSelection()}
   };
   if(recognize)recognize.onclick=async()=>{
    if(!selected||loading||!canEdit)return;
    await refreshAiStatus();
    if(!modelReady){
     aiState.textContent="Qwen остановлена. Закройте просмотр и нажмите «Запустить локальный ИИ».";
     updateSelection();return
    }
    if(!await authorizeAiMutation())return;
    loading=true;updateSelection();
    try{
     const answer=await pdf.regionAnalyze(id,documentId,page,{...selected});
     notice("Фрагмент PDF · лист "+page+" обработан локальным ИИ. Результат требует проверки инженера.");
     active="checks";dlg.close();await reload()
    }catch(error){meta.textContent="ИИ-анализ фрагмента не завершён: "+String(error.message||error)}
    finally{loading=false;updateSelection()}
   };
   back.onclick=()=>{crop=null;showImage(original)};
   dlg.querySelector("[data-pdf-close]").onclick=()=>{if(!loading)dlg.close()};
   dlg.addEventListener("cancel",event=>{if(loading)event.preventDefault()});
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   document.body.appendChild(dlg);showImage(original);dlg.showModal();
   void refreshAiStatus()
  }catch(error){notice("Не удалось показать лист PDF: "+String(error.message||error),"error")}
  finally{busy=false;await reload()}
 }
 if(workflow?.onProgress){
  let pending=false;
  const stop=workflow.onProgress(data=>{
   if(String(data?.objectId)!==id||location.hash!==route||active!=="workflow"||pending)return;
   pending=true;
   Promise.all([workflow.list(id),workflow.summary(id)]).then(([rows,state])=>{
    workflowTasks=rows;workflowSummary=state;
    if(location.hash===route&&active==="workflow")showContent()
   }).catch(error=>notice("Очередь: "+String(error.message||error),"error"))
    .finally(()=>{pending=false})
  });
  window.addEventListener("hashchange",()=>{if(location.hash!==route)stop()},{once:true})
 }
 await reload()
};
