"use strict";
/* Drawing revisions: explicit whole-discipline current page set.
   Never silently chooses last uploaded file as valid revision. */
window.irAiRevisionPage={
 render(host,{objectId,sets=[],impact=null,documents=[],indexes=[],api=null,
  reviewer=null,askPassword=null,canEdit=false,onRefresh=null,
  openPdf=null,notice=null,onNavigate=null}={}){
  if(!host)return;
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const permitted=canEdit&&api&&reviewer&&askPassword;
  const choices=(xs,v)=>xs.map(([key,t])=>'<option value="'+esc(key)+'" '+(String(v)===String(key)?"selected":"")+'>'+esc(t)+'</option>').join("");
  const byKind=k=>sets.filter(x=>x.kind===k);
  const active=k=>byKind(k).find(x=>x.status==="active");
  const stat=(k)=>{
   const s=active(k);
   return'<div class="ir-ai-revision-summary"><small>Действующий комплект '+k+'</small>'+
    (s?'<strong>'+esc(s.label)+' · '+esc(s.issue)+'</strong>'+
      '<span>'+s.sheets.length+' листов · подтверждён '+esc(s.approvedBy||"—")+'</span>':
      '<strong>Не назначен</strong><span>Старые PDF пока не контролируются на актуальность комплекта</span>')+'</div>'
  };
  const documentsByKind=kind=>documents.filter(d=>d.kind===kind&&d.ext===".pdf"&&d.exists&&
   indexes.some(x=>x.documentId===d.id&&x.sourceSha256===d.sha256));
  const indexOf=doc=>indexes.find(x=>x.documentId===doc.id&&x.sourceSha256===doc.sha256);
  const impactRows=(impact?.records||[]).filter(x=>x.outdated);
  host.innerHTML='<section class="ir-ai-revisions"><header class="ir-ai-review-heading">'+
   '<div><h2>Ревизии чертежей КМ и КМД</h2><p>Действующие листы назначает инженер. Новый файл сам по себе не заменяет утверждённый комплект.</p></div>'+
   '<b>Журнал редакций</b></header>'+
   '<div class="ir-ai-revision-stats">'+stat("КМ")+stat("КМД")+'</div>'+
   '<div class="ir-ai-quantity-warning">Действующий комплект содержит ПОЛНЫЙ перечень действующих листов соответствующего вида КМ или КМД. При смене комплекта листы, отсутствующие в новом перечне, становятся устаревшими. Если новой редакцией заменена только часть листов, оставшиеся действующие листы обязательно добавьте в новый комплект без изменений.</div>'+
   '<div class="ir-ai-revision-heading"><div><h3>Комплекты и редакции</h3>'+
    '<small>Загрузите и проиндексируйте PDF перед внесением листов.</small></div>'+
    (permitted?'<button data-set-new>＋ Новый комплект</button>':'')+'</div>'+
   (!sets.length?'<div class="ir-ai-doc-empty"><b>Ревизии ещё не зарегистрированы</b>'+
    '<p>Начните с создания комплекта КМ или КМД, добавьте все действующие листы и подтвердите активацию.</p></div>':
    '<div class="ir-ai-revision-sets">'+sets.map(s=>
     '<article class="ir-ai-revision-set" data-set="'+s.id+'">'+
      '<div class="ir-ai-revision-set-title"><div><b>'+esc(s.kind)+' · '+esc(s.label)+'</b>'+
       '<small>Редакция '+esc(s.issue)+' · версия записи '+s.revision+
        ' · '+s.sheets.length+' листов</small></div>'+
       '<span class="ir-ai-revision-state '+s.status+'">'+
        ({active:"Действующий",draft:"Черновик",superseded:"Архив"}[s.status]||s.status)+'</span></div>'+
      '<div class="ir-ai-revision-buttons">'+
       (permitted&&s.status==="draft"?'<button data-add-sheet="'+s.id+'">＋ Добавить листы</button>'+
        '<button class="ir-ai-revision-activate" data-activate="'+s.id+'">Утвердить действующим</button>':"")+
       '<button data-set-history="'+s.id+'">История</button>'+
       '<button data-toggle-pages="'+s.id+'">Листы ('+s.sheets.length+')</button>'+
      '</div>'+
      '<div data-sheet-list="'+s.id+'" hidden class="ir-ai-revision-sheet-list">'+
       (s.sheets.length?s.sheets.map(p=>'<div class="ir-ai-revision-sheet">'+
        '<div><b>'+esc(p.sheetCode)+'</b><small>'+esc(p.sourceName)+' · страница '+p.page+
         ' · '+(p.valid?"Исходник доступен":"Оригинал отсутствует/изменён")+'</small></div>'+
        '<div><button data-open-revision-pdf="'+p.documentId+':'+p.page+'">Открыть</button>'+
        (permitted&&s.status==="draft"?'<button data-remove-sheet="'+s.id+':'+p.id+'">Удалить</button>':"")+
        '</div></div>').join(""):'<p>Листы пока не добавлены</p>')+'</div>'+
      '<div class="ir-ai-connection-log" data-set-log="'+s.id+'" hidden></div></article>'
    ).join("")+'</div>')+
   '<div class="ir-ai-revision-heading"><h3>Влияние действующих редакций</h3>'+
    '<button data-impact-refresh>Обновить</button></div>'+
   '<div class="ir-ai-revision-impact">'+
    '<div class="ir-ai-revision-impact-metrics"><span>Записей с исходными листами: '+(impact?.total||0)+'</span>'+
    '<span>Требуют пересмотра: '+(impact?.outdated||0)+'</span>'+
    '<span>Без контроля утверждённой редакции: '+(impact?.uncontrolled||0)+'</span></div>'+
    (impactRows.length?'<div class="ir-ai-revision-affected">'+
     impactRows.slice(0,100).map(x=>'<div><b>'+esc(x.title)+'</b> · № '+x.id+
      ' · '+esc(x.recordTitle)+' <small>'+esc(x.reasons.join("; "))+'</small></div>').join("")+
     (impactRows.length>100?'<small>Отображены первые 100 позиций из '+impactRows.length+'</small>':"")+'</div>':
     '<p>В сохранённых записях пока нет источников, исключённых действующими комплектами.</p>')+'</div>'+
   '<p class="ir-ai-storage-note">Активация не изменяет PDF, не удаляет историю и не перезаписывает производственную базу IR Project. Устаревшие подтверждения остаются в архиве, но исключаются из подсчёта подтверждённых объёмов и 3D. Если комплект ещё не утверждён, прежние записи сохраняют прежний режим без контроля актуальности.</p>'+
   '</section>';
  const root=host.querySelector(".ir-ai-revisions");
  let busy=false;
  async function authorized(fn){
   if(!permitted||busy)return;
   busy=true;
   try{
    const role=window.irAccess?.role?.();
    if(!["admin","engineer"].includes(role))throw Error("Для управления комплектами нужны права инженера");
    const pass=await askPassword(role);
    if(pass===null)return;
    if(!await reviewer.authorize(role,pass))throw Error("Пароль инженера/администратора не подтверждён");
    const value=await fn();
    notice?.(value?.message||"Действие с комплектом сохранено");
    await onRefresh?.()
   }catch(e){notice?.("Ревизии КМ/КМД: "+String(e.message||e),"error")}
   finally{busy=false}
  }
  function dialogWindow(title,body,submit,action){
   const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-revision-dialog";
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+esc(title)+'</h3>'+body+
    '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
    '<button type="submit">'+esc(submit)+'</button></div><p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
   document.body.appendChild(dlg);
   dlg.querySelector("[data-cancel]").onclick=()=>dlg.close();
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   let saving=false;
   const form=dlg.querySelector("form");
   form.onsubmit=async e=>{
    e.preventDefault();if(saving)return;
    saving=true;
    const err=dlg.querySelector("[data-error]");err.hidden=true;
    try{
     const values=Object.fromEntries(new FormData(form).entries());
     await action(values,dlg);
     dlg.close()
    }catch(e){err.textContent="Ошибка: "+String(e.message||e);err.hidden=false}
    finally{saving=false}
   };
   dlg.showModal();return dlg
  }
  if(permitted)root.querySelector("[data-set-new]").onclick=()=>{
   dialogWindow("Новый комплект чертежей",'<p>Комплект должен включать все действующие листы выбранного вида, включая не изменённые в данной ревизии.</p>'+
    '<div class="ir-ai-quantity-form-grid"><label>Тип<select name="kind">'+
    choices([["КМ","КМ"],["КМД","КМД"]],"КМД")+'</select></label>'+
    '<label>Обозначение ревизии<input name="issue" maxlength="50" required placeholder="Изм. 2 / Выпуск 2026-10"></label>'+
    '<label class="wide">Название комплекта<input name="label" maxlength="130" required placeholder="041-2025 КМД · колонны и балки"></label></div>',
    "Создать черновик",v=>authorized(()=>api.create(objectId,v)))
  };
  root.querySelectorAll("[data-toggle-pages]").forEach(button=>button.onclick=()=>{
   const el=root.querySelector('[data-sheet-list="'+button.dataset.togglePages+'"]');
   if(el)el.hidden=!el.hidden
  });
  root.querySelectorAll("[data-open-revision-pdf]").forEach(button=>button.onclick=()=>{
   const [doc,page]=button.dataset.openRevisionPdf.split(":");void openPdf?.(doc,page)
  });
  root.querySelectorAll("[data-set-history]").forEach(button=>button.onclick=async()=>{
   const id=Number(button.dataset.setHistory),el=root.querySelector('[data-set-log="'+id+'"]');
   if(!el)return;
   if(!el.hidden){el.hidden=true;return}
   el.hidden=false;el.textContent="Загрузка истории...";
   try{
    const log=await api.history(objectId,id);
    el.innerHTML=log.length?log.map(x=>'<div class="ir-ai-revision-log-item">'+
     esc(x.at)+' · '+esc(x.event)+' · '+esc(x.reviewedBy||"")+'</div>').join(""):"История пуста."
   }catch(e){el.textContent="Не удалось получить историю: "+String(e.message||e)}
  });
  const currentDocs=kind=>documentsByKind(kind);
  root.querySelectorAll("[data-add-sheet]").forEach(button=>button.onclick=()=>{
   const set=sets.find(x=>String(x.id)===button.dataset.addSheet);if(!set)return;
   const docs=currentDocs(set.kind);
   if(!docs.length){
    notice?.("Сначала загрузите и проиндексируйте PDF "+set.kind,"error");
    onNavigate?.("documents");return
   }
   const dlg=dialogWindow("Добавить листы в комплект "+set.issue,
    '<p>Каждый лист получает устойчивое обозначение. Для неизменённых листов в новом комплекте используйте тот же код, что и в предыдущем.</p>'+
    '<label>Загруженный PDF '+esc(set.kind)+'<select name="documentId">'+
     choices(docs.map(d=>[d.id,d.name]),docs[0].id)+'</select></label>'+
    '<div class="ir-ai-revision-pick" data-pick-sheets></div>',
    "Добавить выбранные",async(v,win)=>{
     const chosen=[...win.querySelectorAll("[data-pick-sheets] input[type=checkbox]:checked")];
     if(!chosen.length)throw Error("Выберите хотя бы один лист");
     const entries=chosen.map(c=>{
      const code=win.querySelector('[data-sheet-code="'+c.value+'"]').value.trim();
      if(!code)throw Error("Укажите код каждого листа");
      return{documentId:Number(v.documentId),page:Number(c.value),sheetCode:code}
     });
     await authorized(()=>api.addSheets(objectId,set.id,entries))
    });
   const docChoice=dlg.querySelector('[name="documentId"]'),listing=dlg.querySelector("[data-pick-sheets]");
   const populate=()=>{
    const d=docs.find(x=>String(x.id)===docChoice.value),index=indexOf(d);
    listing.innerHTML=(index?.pages||[]).map(p=>
     '<div class="ir-ai-revision-pick-row"><label><input type="checkbox" value="'+p.page+'">'+
      'Лист '+p.page+'</label><input data-sheet-code="'+p.page+'" maxlength="80" value="Лист '+p.page+
      '" placeholder="КМД-1.5 / лист 12"></div>').join("");
   };
   docChoice.onchange=populate;populate()
  });
  root.querySelectorAll("[data-remove-sheet]").forEach(button=>button.onclick=()=>{
   const [setId,sheetId]=button.dataset.removeSheet.split(":");
   void authorized(()=>api.removeSheet(objectId,Number(setId),Number(sheetId)))
  });
  root.querySelectorAll("[data-activate]").forEach(button=>button.onclick=async()=>{
   const set=sets.find(x=>String(x.id)===button.dataset.activate);if(!set)return;
   try{
    const preview=await api.preview(objectId,set.id);
    const message='<p>Вы собираетесь назначить комплект <b>'+esc(set.kind)+' · '+esc(set.issue)+
     '</b> действующим и отправить прежний комплект в архив.</p>'+
     '<div class="ir-ai-revision-activate-impact"><b>Листов: '+preview.pages+
      '</b><b>Недоступные источники: '+preview.invalidPages+
      '</b><b>Записи для пересмотра: '+preview.affectedCount+'</b></div>'+
     '<p><strong>Важно:</strong> если нужный лист отсутствует в новом перечне, прежние проверки этого листа перестанут участвовать в итогах. Эту операцию нельзя отменить простым редактированием комплекта.</p>'+
     '<label class="ir-ai-revision-confirm"><input type="checkbox" name="understood" value="yes" required> Я проверил полный состав действующих листов КМ/КМД и последствия смены редакции</label>';
    dialogWindow("Утвердить действующий комплект",message,"Подтвердить активацию",
     async v=>{if(v.understood!=="yes")throw Error("Необходимо подтвердить полноту нового комплекта");
      await authorized(()=>api.activate(objectId,set.id,set.revision))})
   }catch(e){notice?.("Проверка активации: "+String(e.message||e),"error")}
  });
  root.querySelector("[data-impact-refresh]").onclick=()=>void onRefresh?.()
 }
};
