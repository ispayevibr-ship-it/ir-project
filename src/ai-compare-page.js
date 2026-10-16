"use strict";
/* IR Project AI: evidence-to-evidence KM/KMD review, no inferred design approval. */
window.irAiKmKmdComparePage={
 render(box,{id,entries=[],summary=null,fields={},documents=[],
  canEdit=false,api=null,reviewer=null,askPassword=null,reload=null,
  notice=null,openPdf=null}={}){
  if(!box)return;
  const esc=x=>String(x??"").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const statuses={requires_review:"Требует проверки",confirmed:"Проверено инженером",rejected:"Отклонено"},
   results={match:"Соответствует",difference:"Расхождение",invalid_source:"Источник изменён/удалён",incomplete:"Не хватает данных"},
   decisions={open:"Без решения",agreed:"Соответствует",correction_required:"Необходимо исправление",accepted_deviation:"Принятое отклонение"};
  const isEditor=canEdit&&!!api&&!!reviewer&&!!askPassword;
  const stats=summary||{total:0,confirmed:0,matches:0,correctionRequired:0,acceptedDeviations:0,
   pending:0,invalidSources:0,rejected:0};
  const kmDocs=documents.filter(d=>d.kind==="КМ"&&d.ext===".pdf"&&d.exists);
  const kmdDocs=documents.filter(d=>d.kind==="КМД"&&d.ext===".pdf"&&d.exists);
  const ready=kmDocs.length&&kmdDocs.length;
  const filterOptions=[["all","Все проверки"],["difference","Расхождения"],
   ["match","Соответствия"],["invalid_source","Изменён источник"],
   ["pending","Ожидают решения"]];
  const options=(items,chosen)=>items.map(([key,label])=>
   '<option value="'+esc(key)+'" '+(String(chosen)===String(key)?"selected":"")+'>'+esc(label)+'</option>').join("");
  const statBox=(label,num)=>'<div><small>'+esc(label)+'</small><strong>'+Number(num||0).toLocaleString("ru-RU")+'</strong></div>';
  const cellSource=(side,src,rec)=>{
   const val=rec?.value;
   return'<div class="ir-ai-compare-evidence"><b>'+side+'</b>'+
    '<span>'+esc(src?.name||"Исходный лист не указан")+' · лист '+esc(src?.page??"—")+
     ' · '+esc(src?.position||"")+' · изм. '+esc(src?.revision||"—")+'</span>'+
    '<strong>'+esc(val??"—")+' '+esc(FIELDS[rec?.field]?.unit||"")+'</strong></div>'
  };
  const FIELDS=fields||{};
  box.innerHTML='<div class="ir-ai-compare">'+
   '<div class="ir-ai-review-heading"><div><h2>Сопоставление КМ и КМД</h2>'+
    '<p>Каждая запись сравнивает один параметр по двум конкретным листам с разными источниками. Без подтверждения инженера совпадение не считается согласованным.</p></div>'+
    '<b>Реестр расхождений</b></div>'+
   '<div class="ir-ai-compare-stats">'+
    statBox("Проверяемые параметры",stats.total)+statBox("Соответствуют",stats.matches)+
    statBox("Нужно исправить",stats.correctionRequired)+
    statBox("Принятые отклонения",stats.acceptedDeviations)+
    statBox("Источники изменены",stats.invalidSources)+
    '</div>'+
   '<div class="ir-ai-quantity-warning">Сверка частичная. Отсутствие замечаний не доказывает, что весь комплект КМ/КМД соответствует проекту. Принятое отклонение остаётся расхождением, а не исправленной геометрией или новой ревизией.</div>'+
   '<div class="ir-ai-compare-toolbar"><select data-compare-filter aria-label="Фильтр расхождений">'+
    options(filterOptions,"all")+'</select><span>На рассмотрении: '+stats.pending+
    ' · отклонено: '+stats.rejected+'</span>'+
    (isEditor?'<button data-compare-new '+(!ready?'disabled':'')+'>＋ Добавить сравнение</button>':"")+'</div>'+
   (!ready?'<p class="ir-ai-compare-tip">Для начала добавьте в этот объект как минимум один PDF с типом «КМ» и один PDF с типом «КМД». Выбор файлов другого объекта запрещён.</p>':"")+
   (!entries.length?'<div class="ir-ai-doc-empty"><b>Сравнения ещё не внесены</b>'+
    '<p>Начните с количества марок, профиля и размеров, затем проверьте узлы и метизы. Нейросеть позже сможет предлагать значения, но утверждать их должен инженер.</p></div>':
    '<div class="ir-ai-compare-list">'+entries.map(row=>{
     const field=FIELDS[row.field]||{},status=row.status||"requires_review";
     return'<article class="ir-ai-compare-card" data-result="'+esc(row.result)+'" data-status="'+esc(status)+'">'+
      '<div class="ir-ai-compare-card-head"><div><b>'+esc(row.mark)+' · '+esc(row.position)+'</b>'+
       '<small>'+esc(row.cipher||"Без шифра")+' · '+esc(field.label||row.field)+
        ' · редакция проверки '+row.revision+'</small></div>'+
       '<span class="ir-ai-compare-state '+(row.result==="difference"?'difference':row.result==="match"?'match':'incomplete')+'">'+
        esc(results[row.result]||"Не установлено")+'</span></div>'+
      '<div class="ir-ai-compare-columns">'+
       '<div class="ir-ai-compare-evidence"><b>КМ</b><span>'+esc(row.km.source.name)+
        ' · лист '+esc(row.km.source.page)+' · '+esc(row.km.source.position)+
        ' · изм. '+esc(row.km.source.revision)+'</span>'+
        '<strong>'+esc(row.km.value)+' '+esc(field.unit||"")+'</strong>'+
        '<button data-compare-source="'+row.km.source.documentId+':'+row.km.source.page+'">Открыть лист КМ</button></div>'+
       '<div class="ir-ai-compare-evidence"><b>КМД</b><span>'+esc(row.kmd.source.name)+
        ' · лист '+esc(row.kmd.source.page)+' · '+esc(row.kmd.source.position)+
        ' · изм. '+esc(row.kmd.source.revision)+'</span>'+
        '<strong>'+esc(row.kmd.value)+' '+esc(field.unit||"")+'</strong>'+
        '<button data-compare-source="'+row.kmd.source.documentId+':'+row.kmd.source.page+'">Открыть лист КМД</button></div>'+
      '</div><div class="ir-ai-compare-decision">'+
       '<span class="ir-ai-review-status '+esc(status)+'">'+esc(statuses[status])+'</span>'+
       '<b>'+esc(decisions[row.disposition]||"Без решения")+'</b>'+
       (row.delta!==null&&row.delta!==undefined?'<span>Δ КМД − КМ: '+esc(row.delta)+' '+esc(field.unit||"")+'</span>':"")+
       (row.tolerance>0?'<span>Допуск ±'+esc(row.tolerance)+' '+esc(field.unit||"")+'</span>':"")+
       (row.comment?'<p>'+esc(row.comment)+'</p>':"")+
       '</div>'+
      '<div class="ir-ai-connection-actions">'+
       '<button data-compare-history="'+row.id+'">История</button>'+
       (isEditor?'<button data-compare-edit="'+row.id+'">Редактировать / решение инженера</button>':"")+
      '</div><div class="ir-ai-connection-log" data-compare-log="'+row.id+'" hidden></div>'+
      '</article>'
    }).join("")+'</div>')+
   '<p class="ir-ai-storage-note">Данные сравнения сохраняются отдельно в IR Project AI. Решение «Необходимо исправление» не изменяет ни исходные PDF, ни производственные ведомости, ни монтажную 3D-схему. Проверенные допуски требуют инженерного основания.</p>'+
   '</div>';
  const root=box.querySelector(".ir-ai-compare");
  const selector=root.querySelector("[data-compare-filter]");
  selector.onchange=()=>{
   for(const item of root.querySelectorAll("[data-result]")){
    const f=selector.value;
    item.hidden=!(f==="all"||f===item.dataset.result||f==="pending"&&item.dataset.status==="requires_review")
   }
  };
  for(const b of root.querySelectorAll("[data-compare-source]")){
   b.onclick=()=>{
    const [doc,page]=b.dataset.compareSource.split(":");
    if(typeof openPdf==="function")void openPdf(doc,page)
   }
  }
  for(const b of root.querySelectorAll("[data-compare-history]")){
   b.onclick=async()=>{
    const slot=root.querySelector('[data-compare-log="'+b.dataset.compareHistory+'"]');
    if(!slot)return;
    if(!slot.hidden){slot.hidden=true;return}
    slot.hidden=false;slot.textContent="Загружаем историю...";
    try{
     const logs=await api.history(id,Number(b.dataset.compareHistory));
     slot.innerHTML=logs.length?'<h4>История сравнения</h4>'+
      logs.map(x=>'<div class="ir-ai-connection-logrow"><b>Редакция '+esc(x.revision)+'</b>'+
       ' · '+esc(x.reviewedAt)+' · '+esc(x.reviewedBy)+
       ' · '+esc(x.current?.disposition||"")+
       (x.current?.comment?'<p>'+esc(x.current.comment)+'</p>':"")+'</div>').join(""):
      'История отсутствует.'
    }catch(e){slot.textContent="Ошибка получения истории: "+String(e.message||e)}
   }
  }
  const fieldPairs=Object.entries(FIELDS).map(([key,obj])=>[key,obj.label]);
  function edit(row=null){
   if(!isEditor||!ready)return;
   const v=row||{},dlg=document.createElement("dialog");
   dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-compare-dialog";
   const input=(name,value="",max=100)=>'<input name="'+name+'" maxlength="'+max+
    '" value="'+esc(value??"")+'" required>';
   const srcEditor=(side,list,known)=>{
    const src=known?.source||{};
    return'<fieldset><legend>Источник '+side+'</legend>'+
     '<label>PDF '+side+' *<select name="'+side+'Document" required>'+
       options(list.map(d=>[d.id,d.name]),src.documentId||list[0]?.id)+'</select></label>'+
     '<label>Лист PDF *<input type="number" step="1" min="1" max="2000" name="'+side+
      'Page" value="'+esc(src.page??1)+'" required></label>'+
     '<label>Позиция/место на листе *'+input(side+'Position',src.position,120)+'</label>'+
     '<label>Изменение / ревизия *'+input(side+'Revision',src.revision,50)+'</label>'+
     '<label>Фактическое значение *'+input(side+'Value',known?.value,240)+'</label>'+
     '</fieldset>'
   };
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+
    (row?"Исправить сравнение":"Добавить сравнение КМ / КМД")+'</h3>'+
    '<p>Указывайте значение только по исходному PDF. Латинская K и кириллическая К считаются разными обозначениями. Без ссылки на оба чертежа подтверждение запрещено.</p>'+
    '<div class="ir-ai-quantity-form-grid">'+
     '<label>Марка/участок *'+input("mark",v.mark,80)+'</label>'+
     '<label>Шифр проекта<input name="cipher" maxlength="80" value="'+esc(v.cipher||"")+'"></label>'+
     '<label>Позиция/узел *'+input("position",v.position,100)+'</label>'+
     '<label>Параметр *<select name="field">'+options(fieldPairs,v.field||"mark_quantity")+'</select></label>'+
     '<label class="wide">Допуск при числовой сверке<input type="number" min="0" max="100000" step="any" name="tolerance" value="'+esc(v.tolerance??0)+'"></label>'+
     '</div><div class="ir-ai-compare-source-editors">'+
     srcEditor("km",kmDocs,v.km)+srcEditor("kmd",kmdDocs,v.kmd)+'</div>'+
     '<div class="ir-ai-quantity-form-grid">'+
      '<label>Статус<select name="status">'+options(Object.entries(statuses),
       v.status||"requires_review")+'</select></label>'+
      '<label>Решение<select name="disposition">'+options(Object.entries(decisions),
       v.disposition||"open")+'</select></label>'+
      '<label class="wide">Комментарий и основание допуска/отклонения<textarea name="comment" maxlength="2000" rows="3">'+
       esc(v.comment||"")+'</textarea></label></div>'+
     '<p class="ir-ai-compare-preview" data-preview></p>'+
     '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
      '<button type="submit">Сохранить решение</button></div>'+
     '<p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
   const form=dlg.querySelector("form"),warning=dlg.querySelector("[data-preview]");
   const updatePreview=()=>{
    const f=Object.fromEntries(new FormData(form).entries()),info=FIELDS[f.field]||{};
    let verdictText="Числа и значения должны быть подтверждены по обоим чертежам";
    const km=f.kmValue?.trim()||"",kmd=f.kmdValue?.trim()||"";
    if(km&&kmd){
     if(info.type==="text")verdictText=km.replace(/\s+/g," ").toLocaleUpperCase("ru-RU")===
      kmd.replace(/\s+/g," ").toLocaleUpperCase("ru-RU")?"Предварительно: соответствует":"Предварительно: расхождение";
     else{
      const x=Number(km.replace(",",".")),y=Number(kmd.replace(",",".")),tol=Number(f.tolerance||0);
      if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(tol)&&tol>=0)
       verdictText=Math.abs(y-x)<=tol+1e-8?"Предварительно: соответствует":
        "Предварительно: расхождение (КМД − КМ = "+(y-x).toLocaleString("ru-RU")+")";
     }
    }
    warning.textContent=verdictText+". Итог фиксирует только инженер, и только после проверки листов."
   };
   form.addEventListener("input",updatePreview);
   form.addEventListener("change",updatePreview);
   document.body.appendChild(dlg);updatePreview();
   let saving=false;
   dlg.querySelector("[data-cancel]").onclick=()=>{if(!saving)dlg.close()};
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   dlg.addEventListener("cancel",e=>{if(saving)e.preventDefault()});
   form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    saving=true;
    const error=dlg.querySelector("[data-error]");
    error.hidden=true;
    try{
     const role="engineer"; // Legacy data validation; no login or password required.
     if(!["admin","engineer"].includes(role))throw Error("Нет прав для инженерной проверки");
     const pass=await askPassword(role);
     if(pass===null){saving=false;return}
     if(!await reviewer.authorize(role,pass))throw Error("Неверный пароль");
     const f=Object.fromEntries(new FormData(form).entries());
     const entry={expectedRevision:Number(v.revision)||0,mark:f.mark,cipher:f.cipher,
      position:f.position,field:f.field,tolerance:f.tolerance,
      status:f.status,disposition:f.disposition,comment:f.comment,
      km:{value:f.kmValue,source:{documentId:Number(f.kmDocument),page:Number(f.kmPage),
       position:f.kmPosition,revision:f.kmRevision}},
      kmd:{value:f.kmdValue,source:{documentId:Number(f.kmdDocument),page:Number(f.kmdPage),
       position:f.kmdPosition,revision:f.kmdRevision}}
     };
     await api.save(id,v.id||null,entry);
     dlg.close();notice?.("Сравнение КМ/КМД сохранено со ссылками на обе ревизии. Итоговая экспертиза комплекта ещё не завершена.");
     await reload?.()
    }catch(e){error.textContent="Не удалось сохранить: "+String(e.message||e);error.hidden=false}
    finally{saving=false}
   };
   dlg.showModal()
  }
  const create=root.querySelector("[data-compare-new]");
  if(create)create.onclick=()=>edit();
  for(const b of root.querySelectorAll("[data-compare-edit]")){
   b.onclick=()=>{const record=entries.find(x=>String(x.id)===b.dataset.compareEdit);if(record)edit(record)}
  }
 }
};
