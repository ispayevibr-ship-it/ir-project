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
 let object,documents=[],active="documents",term="",message="",severity="info",busy=false;
 try{object=await irProject.data.objects.get(id)}catch(error){app.textContent="Не удалось прочитать объект: "+String(error.message||error);return}
 if(!object){location.hash="/objects";return}
 const bridge=irProject.aiDocuments,ready=!!(bridge&&typeof bridge.list==="function"&&typeof bridge.select==="function");
 const canEdit=!!window.irAccess?.canEdit?.("ai-recognition");
 async function reload(){
  if(ready){try{documents=await bridge.list(id)}catch(error){documents=[];notice("Ошибка загрузки документов: "+String(error.message||error),"error")}}
  if(location.hash===route)paint()
 }
 function notice(text,type="info"){message=String(text||"");severity=type}
 function paint(){
  if(location.hash!==route)return;
  app.innerHTML='<div class="ir-ai-page">'+
   '<header class="ir-ai-hero"><div class="ir-ai-heading"><div class="ir-ai-kicker">IR PROJECT · ЛОКАЛЬНЫЙ ИНЖЕНЕРНЫЙ МОДУЛЬ</div>'+
   '<h1>IR Project AI <span>Инженерный анализ КМ/КМД</span></h1>'+
   '<p>'+esc(object.name)+' · Все данные отдельно для этого объекта</p></div>'+
   '<div class="ir-ai-state"><span class="ir-ai-state-dot"></span><div><strong>Нейросеть не установлена</strong><small>Распознавание ещё не подключено</small></div></div></header>'+
   '<div class="ir-ai-stats"><div><small>Загружено файлов</small><b>'+documents.length+'</b><span>Локальное хранение</span></div>'+
   '<div><small>Распознано марок</small><b>—</b><span>Анализ не запускался</span></div>'+
   '<div><small>3D-конструкций</small><b>—</b><span>Нет подтверждённой геометрии</span></div>'+
   '<div><small>Замечаний</small><b>—</b><span>Проверка не выполнена</span></div></div>'+
   '<div class="ir-ai-actions"><label>Тип загружаемого комплекта <select id="irAiKind"><option value="Не определён">Не определён</option>'+
   '<option value="КМ">КМ</option><option value="КМД">КМД</option></select></label>'+
   '<button class="ir-ai-primary" id="irAiUpload" '+(!ready||!canEdit||busy?'disabled':'')+'>＋ Добавить чертежи</button>'+
   '<button id="irAiRecognize" disabled title="Появится после установки автономного ИИ-движка">Начать распознавание</button>'+
   '<button id="irAiExport" disabled>Экспортировать</button>'+
   '<span class="ir-ai-action-note">Автономный ИИ-движок: следующий этап</span></div>'+
   (!ready?'<div class="ir-ai-warning" role="status"><b>Требуется новый установщик Electron.</b> Горячее обновление интерфейса не добавляет локальный файловый мост. Для импорта чертежей необходима сборка приложения с поддержкой IR Project AI.</div>':'')+
   (message?'<div class="ir-ai-message '+(severity==="error"?"error":"")+'" role="status">'+esc(message)+'</div>':'')+
   '<div class="ir-ai-layout"><div class="ir-ai-main"><nav class="ir-ai-tabs" aria-label="Вкладки инженерного анализа">'+tabs.map(t=>
    '<button type="button" data-ai-tab="'+t[0]+'" class="'+(active===t[0]?'active':'')+'">'+esc(t[1])+'</button>').join("")+'</nav>'+
   '<section id="irAiContent" class="ir-ai-content"></section></div>'+
   '<aside class="ir-ai-assistant"><div class="ir-ai-assistant-head"><b>ИИ-помощник</b><span>Офлайн</span></div>'+
   '<p>После установки локальной модели помощник будет отвечать по чертежам и ссылаться на конкретные листы, марки и узлы.</p>'+
   '<div class="ir-ai-chat-empty">История запросов пока отсутствует. Ответы не имитируются.</div>'+
   '<textarea disabled placeholder="Модель не установлена"></textarea><button disabled>Отправить</button></aside></div>'+
   '<footer class="ir-ai-footer">Этап 1 · Документы и локальное хранилище. Без облачного распознавания и без изменений существующей монтажной схемы.</footer></div>';
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
  showContent()
 }
 function showContent(){
  const box=app.querySelector("#irAiContent");if(!box)return;
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
    '<td><div class="ir-ai-doc-actions"><button data-ai-open="'+x.id+'" '+(!ready||!x.exists?'disabled':'')+'>Открыть</button>'+
    (canEdit?'<button class="delete" data-ai-remove="'+x.id+'" '+(!ready?'disabled':'')+'>Удалить</button>':"")+'</div></td></tr>').join("")+
   '</tbody></table></div>')+
   '<div class="ir-ai-storage-note">SHA-256 рассчитывается при импорте. Оригинальные файлы не изменяются. Важно: действующий экспорт резервной копии *.db пока не включает вложения ИИ — сохраняйте исходные чертежи отдельно.</div>';
  const search=box.querySelector("#irAiSearch");
  if(search)search.oninput=e=>{const pos=e.target.selectionStart;term=e.target.value;showContent();const next=box.querySelector("#irAiSearch");next?.focus();try{next?.setSelectionRange(pos,pos)}catch{}};
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
