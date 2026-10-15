"use strict";
/* Independent model-settings dialog. Requires an explicit native-admin session for mutations. */
(function(){
 function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
 const fmt=bytes=>{
  const n=Number(bytes)||0;
  if(n>=1073741824)return(n/1073741824).toFixed(2).replace(".",",")+" ГБ";
  if(n>=1048576)return(n/1048576).toFixed(1).replace(".",",")+" МБ";
  return Math.ceil(n/1024)+" КБ"
 };
 async function open(menu){
  const doc=menu?.ownerDocument||document,api=window.irProject?.aiModels;
  const found=doc.querySelector(".ir-ai-model-dialog");if(found){found.showModal?.();return}
  const dlg=doc.createElement("dialog");dlg.className="ir-ai-model-dialog";
  let data=null,notice="",failed=false,busy=false,downloading=false,progress="",hardware=null,engineState=null,diagHistory=null,preflight=null;
  dlg.innerHTML='<div class="ir-ai-model-dialog-inner">'+
   '<div class="ir-ai-model-titlebar"><div><span>IR PROJECT · НАСТРОЙКИ</span><h2>Локальные ИИ-модели</h2>'+
   '<p>Модели хранятся на вашем компьютере. Обработка чертежей не требует облачных сервисов.</p></div>'+
   '<button type="button" data-ai-close aria-label="Закрыть">✕</button></div>'+
   '<div data-ai-body class="ir-ai-model-body">Проверяем локальные модели…</div>'+
   '<footer><span>Установка и откат — только после подтверждения администратора</span><button type="button" data-ai-close>Закрыть</button></footer></div>';
  dlg.querySelectorAll("[data-ai-close]").forEach(b=>b.onclick=()=>{if(!busy)dlg.close()});
  const removeProgress=api?.onProgress?.(point=>{
   if(!downloading)return;
   progress="Загружено "+fmt(point.received)+" из "+fmt(point.total)+" · "+point.percent+"%";
   const target=dlg.querySelector("[data-download-progress]");if(target)target.textContent=progress
  });
  dlg.addEventListener("close",()=>{removeProgress?.();dlg.remove()},{once:true});
  dlg.addEventListener("cancel",event=>{if(busy)event.preventDefault()});
  doc.body.appendChild(dlg);dlg.showModal();
  function status(text,error=false){notice=String(text||"");failed=error}
  const isAdmin=()=>window.irAccess?.role?.()==="admin";
  async function authorize(){
   if(!isAdmin()){status("Установку моделей может выполнять только администратор.",true);render();return false}
   let pw=await new Promise(resolve=>{
    const prompt=doc.createElement("dialog");prompt.className="ir-ai-model-password";
    prompt.innerHTML='<form method="dialog"><h3>Подтверждение администратора</h3>'+
     '<p>Для установки или отката локальной модели введите пароль администратора IR Project.</p>'+
     '<input type="password" autocomplete="off" required placeholder="Пароль администратора" aria-label="Пароль администратора">'+
     '<div><button type="button" data-cancel>Отмена</button><button type="submit">Подтвердить</button></div></form>';
    const field=prompt.querySelector("input");let completed=false;
    const finish=value=>{if(completed)return;completed=true;try{prompt.close()}catch{}prompt.remove();resolve(value)};
    prompt.querySelector("form").onsubmit=e=>{e.preventDefault();finish(field.value)};
    prompt.querySelector("[data-cancel]").onclick=()=>finish("");
    prompt.oncancel=e=>{e.preventDefault();finish("")};
    doc.body.appendChild(prompt);prompt.showModal();field.focus()
   });
   if(!pw)return false;
   try{
    const ok=await api.authorize(pw);pw="";
    if(!ok){status("Неверный пароль администратора.",true);render();return false}
    return true
   }catch(error){status("Ошибка авторизации: "+String(error.message||error),true);render();return false}
  }
  function render(){
   if(!dlg.isConnected)return;
   const target=dlg.querySelector("[data-ai-body]");
   if(!data){target.textContent=notice||"Читаем состояние менеджера моделей…";return}
   const models=data.models||[],catalog=data.update||{},localAi=window.irProject?.aiDiagnostics;
   target.innerHTML='<div class="ir-ai-model-toolbar">'+
    '<button type="button" data-check '+(busy?'disabled':'')+'>↻ Проверить обновления</button>'+
    '<button type="button" data-select '+(busy||!isAdmin()?'disabled':'')+'>＋ Установить из файла</button>'+
    '<button type="button" data-refresh '+(busy?'disabled':'')+'>Обновить список</button>'+
    '<button type="button" data-preflight '+(busy?'disabled':'')+'>Проверить готовность к КМД</button>'+
    (downloading?'<button type="button" data-cancel-download>✕ Отменить загрузку</button>':'')+
    '</div><div class="ir-ai-model-progress" data-download-progress>'+esc(progress)+'</div>'+
    (preflight?'<section class="ir-ai-model-info"><b>Первое распознавание КМД · '+
     esc(preflight.readyForFirstPdf?"Модели готовы к испытанию":"Есть препятствия")+'</b>'+
     '<p>'+esc(preflight.reason||"")+'</p>'+
     (preflight.checks||[]).map(c=>'<p><strong>'+esc(c.ok?"✓":"✕")+' '+
      esc(c.title)+'</strong>: '+esc(c.description)+'</p>').join("")+
     '<p>Эта проверка не запускает нейросети и не доказывает точность распознавания.</p></section>':"")+
    '<div class="ir-ai-model-info"><b>Обновления моделей работают отдельно от обновлений IR Project.</b>'+
     '<p>'+esc(catalog.reason||"Официальный каталог пока не настроен.")+'</p>'+
     '<p>Распознавание всегда локальное. Обновления можно устанавливать из заранее полученного подписанного файла .ir-ai-pack.</p>'+
     (!data.signedImportAvailable?'<p><strong>Безопасная установка пока недоступна:</strong> официальный доверенный ключ подписи моделей ещё не опубликован. Неизвестные пакеты не запускаются.</p>':'')+

    '</div>'+
    '<section class="ir-ai-model-hardware"><div class="ir-ai-model-hardware-head"><h3>Оборудование и проверка ИИ</h3>'+
     '<button type="button" data-hardware-refresh '+(busy?'disabled':'')+'>↻ Обновить показатели</button></div>'+
     '<div class="ir-ai-model-hardware-values">'+
      '<div><small>Оперативная память</small><b>'+esc(hardware?hardware.ramTotalGiB+" ГБ · свободно "+hardware.ramFreeGiB+" ГБ":"Определяется…")+'</b></div>'+
      '<div><small>Видеокарта NVIDIA</small><b>'+esc(hardware?.gpu?.length?hardware.gpu.map(g=>g.name).join(", "):"Не определена")+'</b></div>'+
      '<div><small>Видеопамять (выделенная)</small><b>'+esc(hardware?.gpu?.length?
       hardware.gpu.map(g=>(g.vramFreeMiB/1024).toFixed(1)+" из "+(g.vramTotalMiB/1024).toFixed(1)+" ГБ свободно").join(", "):"Нет сведений")+'</b></div>'+
      '<div><small>Работающий ИИ</small><b>'+esc(engineState?.state==="ready"?
       (engineState.model||"Локальная модель")+(engineState.modelVersion?" · "+engineState.modelVersion:""):
       "Не запущен"+(engineState?.state==="invalid"?" (пакет недействителен)":""))+'</b></div>'+
     '</div><p>'+esc(hardware?.gpuReason||"Для определения GPU необходимо доступное приложение NVIDIA nvidia-smi.")+
     ' Проверка CUDA возможна только при запуске действительного совместимого движка.</p>'+
     '<div class="ir-ai-model-test-actions">'+
      '<button type="button" data-diagnostics-start '+(busy||!isAdmin()||engineState?.state==="ready"?'disabled':'')+'>▶ Запустить ИИ</button>'+
      '<button type="button" data-diagnostics-smoke '+(busy||!isAdmin()||engineState?.state!=="ready"?'disabled':'')+'>Проверить распознавание К41</button>'+
      '<button type="button" data-diagnostics-stop '+(busy||!isAdmin()||!["ready","starting"].includes(engineState?.state)?'disabled':'')+'>■ Остановить ИИ</button>'+
     '</div>'+
     (diagHistory?.last?'<p class="ir-ai-model-diagnostic '+(diagHistory.last.success?'passed':'failed')+'">'+
      esc(diagHistory.last.diagnostic)+' · '+Math.round((diagHistory.last.elapsedMs||0)/1000)+' с'+
      (diagHistory.last.modelVersion?" · "+esc(diagHistory.last.modelVersion):"")+'</p>':'')+
    '</section>'+
    (notice?'<div class="ir-ai-model-notice '+(failed?'error':'')+'" role="status">'+esc(notice)+'</div>':'')+
    '<div class="ir-ai-model-grid">'+models.map(x=>
     '<article class="ir-ai-model-card"><header><div><span class="ir-ai-model-type">'+esc(x.role)+'</span><h3>'+esc(x.title)+'</h3>'+
      '<p>Движок: '+esc(x.engine)+'</p></div><span class="ir-ai-model-state '+(x.active?'installed':'')+'">'+esc(x.active?'Установлена':'Не установлена')+'</span></header>'+
      '<div class="ir-ai-model-metadata"><div><small>Активная версия</small><b>'+esc(x.active||"—")+'</b></div>'+
       '<div><small>Предыдущая версия</small><b>'+esc(x.previous||"—")+'</b></div>'+
       '<div><small>Размер на диске</small><b>'+esc(x.installedBytes?fmt(x.installedBytes):"—")+'</b></div>'+
       '<div><small>Версий в хранилище</small><b>'+esc((x.versions||[]).length)+'</b></div>'+
       '<div><small>Доступное обновление</small><b>'+esc((catalog.available||[]).some(r=>r.modelId===x.id)?"Есть версии":"—")+'</b></div></div>'+
      '<div class="ir-ai-model-releases">'+(catalog.available||[]).filter(r=>r.modelId===x.id).map(r=>
       '<div class="ir-ai-model-release"><div><b>Версия '+esc(r.version)+'</b><small>'+fmt(r.bytes)+' · '+esc(r.notes||"Подписанный пакет")+'</small></div>'+
       '<button type="button" data-download-model="'+esc(x.id)+'" data-download-version="'+esc(r.version)+'" '+
        (busy||!isAdmin()||!data.signedImportAvailable?'disabled':'')+'>Скачать и установить</button></div>').join("")+'</div>'+
      '<div class="ir-ai-model-foot"><small>'+esc(x.state)+'</small>'+
      (x.id==="qwen3-vl-4b"&&x.active?'<button type="button" data-verify-model="'+esc(x.id)+'" '+(busy||!isAdmin()?'disabled':'')+'>Проверить файлы</button>':"")+
      '<button type="button" data-rollback="'+esc(x.id)+'" '+(!x.canRollback||busy||!isAdmin()?'disabled':'')+'>↶ Откатить</button></div></article>').join("")+
    '</div><p class="ir-ai-model-note">Размер скачивания и список доступных версий появятся после подключения официального подписанного каталога. Файлы моделей не включены в установщик IR Project.</p>';
   target.querySelector("[data-refresh]").onclick=()=>reload();
   target.querySelector("[data-preflight]").onclick=async()=>{
    if(busy)return;
    busy=true;status("Проверяем подписи и SHA-256 обоих локальных пакетов. Нейросети не запускаются.");render();
    try{
     preflight=await api.preflight();
     status(preflight.reason,!preflight.readyForFirstPdf)
    }catch(error){status("Не удалось проверить готовность: "+String(error.message||error),true)}
    finally{busy=false;render()}
   };
   target.querySelector("[data-hardware-refresh]").onclick=()=>reload();
   target.querySelector("[data-diagnostics-start]").onclick=async()=>{
    if(busy||!await authorize())return;
    busy=true;status("Запускаем настоящую локальную модель. Первая загрузка может занять до 2 минут.");render();
    try{
     const result=await localAi.start();
     status(result.state==="ready"?"Модель действительно запущена на 127.0.0.1. Можно проверить распознавание К41.":
      "Модель не запустилась: "+String(result.reason||result.state),result.state!=="ready")
    }catch(error){status("Ошибка запуска локальной модели: "+String(error.message||error),true)}
    finally{busy=false;await reload()}
   };
   target.querySelector("[data-diagnostics-smoke]").onclick=async()=>{
    if(busy||!await authorize())return;
    busy=true;status("Отправляем тестовый PNG К41 в настоящий локальный ИИ. Результат не будет записан в объект.");render();
    try{
     const result=await localAi.smokeTest();
     status(result.diagnostic,!result.success);
    }catch(error){status("Проверка распознавания не состоялась: "+String(error.message||error),true)}
    finally{busy=false;await reload()}
   };
   target.querySelector("[data-diagnostics-stop]").onclick=async()=>{
    if(busy||!await authorize())return;
    busy=true;render();
    try{await localAi.stop();status("Локальная модель остановлена.")}
    catch(error){status("Не удалось остановить ИИ: "+String(error.message||error),true)}
    finally{busy=false;await reload()}
   };
   const cancelButton=target.querySelector("[data-cancel-download]");
   if(cancelButton)cancelButton.onclick=async()=>{
    cancelButton.disabled=true;
    try{await api.cancel();status("Загрузка отменена")}catch(e){status("Ошибка отмены: "+String(e.message||e),true)}
   };
   target.querySelectorAll("[data-download-model]").forEach(button=>button.onclick=async()=>{
    if(busy||!isAdmin()||!data.signedImportAvailable)return;
    const modelId=button.dataset.downloadModel,version=button.dataset.downloadVersion;
    const release=(catalog.available||[]).find(x=>x.modelId===modelId&&x.version===version);
    if(!release||!doc.defaultView.confirm("Скачать и установить "+modelId+" версии "+version+
     "?\\nРазмер загрузки: "+fmt(release.bytes)+"\\nМодель будет установлена после проверки цифровой подписи."))return;
    if(!await authorize())return;
    busy=true;downloading=true;progress="Подключаемся к серверу…";render();
    try{
     const installed=await api.downloadAndInstall(modelId,version);
     status("Модель "+installed.title+" "+installed.version+" установлена. Проверьте готовность к КМД перед использованием.")
    }catch(e){status("Скачивание или установка не завершены: "+String(e.message||e),true)}
    finally{busy=false;downloading=false;progress="";await reload()}
   });
   target.querySelector("[data-check]").onclick=async()=>{
    busy=true;render();
    try{const update=await api.checkUpdates();data.update=update;status(update.reason||"Обновлений нет")}
    catch(e){status("Проверка обновлений: "+String(e.message||e),true)}
    finally{busy=false;render()}
   };
   target.querySelector("[data-select]").onclick=async()=>{
    if(busy||!await authorize())return;
    busy=true;render();
    try{
     const selected=await api.select();
     if(!selected){status("Выбор пакета отменён");return}
     if(!doc.defaultView.confirm("Установить подписанную модель "+selected.title+" версии "+selected.version+
      "?\nРазмер загрузки: "+fmt(selected.downloadBytes)+
      "\nРазмер на диске: "+fmt(selected.installedBytes)+
      "\nТекущая версия будет сохранена для отката.")){status("Установка отменена");return}
     const outcome=await api.install(selected.token);
     status("Модель "+outcome.title+" "+outcome.version+" успешно размещена. Перед запуском используйте «Проверить файлы».")
    }catch(e){status("Установка отменена или не удалась: "+String(e.message||e),true)}
    finally{busy=false;await reload()}
   };
   target.querySelectorAll("[data-verify-model]").forEach(button=>button.onclick=async()=>{
    if(busy||!await authorize())return;
    busy=true;status("Проверка SHA-256 установленного пакета может занять несколько минут.");render();
    try{
     const result=await api.verifyRuntime();
     status(result.installed?
      "Qwen3-VL 4B "+result.version+": файлы и подпись проверены. Для проверки GPU запустите ИИ в разделе объекта.":
      "Модель не готова: "+String(result.reason||"неизвестная причина"),!result.installed)
    }catch(e){status("Не удалось проверить модель: "+String(e.message||e),true)}
    finally{busy=false;await reload()}
   });
   target.querySelectorAll("[data-rollback]").forEach(button=>button.onclick=async()=>{
    const id=button.dataset.rollback,m=models.find(x=>x.id===id);
    if(!m||!m.canRollback||busy||!await authorize())return;
    if(!doc.defaultView.confirm("Откатить "+m.title+" с версии "+m.active+" на "+m.previous+"?"))return;
    busy=true;render();
    try{const result=await api.rollback(id);status("Восстановлена предыдущая версия "+result.active)}
    catch(e){status("Ошибка отката: "+String(e.message||e),true)}
    finally{busy=false;await reload()}
   })
  }
  async function reload(){
   if(!api||typeof api.info!=="function"){
    status("Для управления моделями необходимо установить новую версию IR Project.",true);data={models:[],update:{reason:"Файловый менеджер недоступен."}};render();return
   }
   try{data=await api.info()}catch(error){status("Не удалось прочитать модели: "+String(error.message||error),true);
    data={models:[],update:{reason:"Реестр недоступен"}}}
   const diagnostics=window.irProject?.aiDiagnostics;
   const responses=await Promise.allSettled([
    diagnostics?.hardware?.(),window.irProject?.aiEngine?.status?.(),diagnostics?.status?.()
   ]);
   if(responses[0].status==="fulfilled")hardware=responses[0].value||null;
   if(responses[1].status==="fulfilled")engineState=responses[1].value||null;
   if(responses[2].status==="fulfilled")diagHistory=responses[2].value||null;
   render()
  }
  await reload()
 }
 window.irAiModelSettings={open};
})();
