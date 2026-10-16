"use strict";
/* Structured OCR/VLM proposals. Explicit engineer review precedes ledger entry. */
window.irAiProposalsPage={
 render(host,{objectId,proposals=[],summary=null,api=null,reviewer=null,
  askPassword=null,canEdit=false,openPdf=null,onRefresh=null,onPrepareQuantity=null,notice=null}={}){
  if(!host)return;
  const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const types={mark_quantity:"Количество отправочных марок",steel_part:"Деталь / металлопрокат",
   connection:"Метизы / соединение",dimension:"Размер по чертежу"};
  const statuses={requires_review:"Требует проверки",confirmed:"Проверено инженером",rejected:"Отклонено"};
  const fields={
   mark_quantity:["mark","cipher","secondaryCipher","quantity","specPosition","drawingRevision"],
   steel_part:["mark","position","partType","partCount","profile","steelGrade","lengthMm","widthMm","thicknessMm","unitMassKg","specPosition"],
   connection:["mark","position","jointCode","fastenerKind","perJoint","diameterMm","standard"],
   dimension:["mark","position","lengthMm","widthMm","thicknessMm","diameterMm"]
  };
  const titles={mark:"Марка",cipher:"Шифр",secondaryCipher:"Второй шифр",
   quantity:"Экземпляров, шт.",specPosition:"Позиция спецификации",drawingRevision:"Ревизия",
   position:"Деталь / позиция",partType:"Тип детали",partCount:"Деталей на марку, шт.",
   profile:"Профиль / сечение",steelGrade:"Марка стали",lengthMm:"Длина, мм",
   widthMm:"Ширина, мм",thicknessMm:"Толщина, мм",unitMassKg:"Масса одной детали, кг",
   jointCode:"Узел",fastenerKind:"Вид крепежа",perJoint:"Изделий на узел, шт.",
   diameterMm:"Диаметр, мм",standard:"Стандарт"};
  const numeric=new Set(["quantity","partCount","perJoint","lengthMm","widthMm","thicknessMm",
   "unitMassKg","diameterMm"]);
  const n=summary||{total:0,confirmed:0,requiresReview:0,rejected:0,invalidSources:0};
  const allowed=canEdit&&api&&reviewer&&askPassword;
  host.innerHTML='<section class="ir-ai-proposals">'+
   '<div class="ir-ai-review-heading"><div><h2>Структурированные предложения ИИ</h2>'+
    '<p>Марки, количество, детали, профили, размеры и соединения — каждое значение привязано к исходному листу. Результат модели не заменяет проверку инженером.</p></div>'+
    '<b>'+n.total+' предложений</b></div>'+
   '<div class="ir-ai-proposal-stats"><span>На проверке: '+n.requiresReview+'</span>'+
    '<span>Проверено: '+n.confirmed+'</span><span>Отклонено: '+n.rejected+'</span>'+
    '<span>Недействительные источники: '+n.invalidSources+'</span></div>'+
   '<div class="ir-ai-quantity-warning">Цитата ниже получена от модели и должна быть сверена с настоящим PDF. Подтверждение предложения не добавляет объёмы автоматически. Для количеств требуется отдельное сохранение в ведомости отправочных марок.</div>'+
   (!proposals.length?'<div class="ir-ai-doc-empty"><b>Структурированных предложений ещё нет</b>'+
    '<p>В «Конвейере ИИ» обработайте листы новой схемой ir-kmd-v1. Старые анализы, которые содержат только список обозначений, автоматически не превращаются в количества и размеры.</p></div>':
    '<div class="ir-ai-proposal-list">'+proposals.map(p=>{
     const k=p.analysisId+':'+p.index;
     const vals=fields[p.type]||[];
     const details=vals.filter(f=>p.values?.[f]!==null&&p.values?.[f]!==""&&p.values?.[f]!==undefined)
      .map(f=>'<span><b>'+esc(titles[f]||f)+':</b> '+esc(p.values[f])+'</span>').join("");
     const warn=[...(p.errors||[]),...(p.warnings||[])];
     return'<article class="ir-ai-proposal-card" data-proposal="'+k+'">'+
      '<div class="ir-ai-proposal-heading"><div><b>'+esc(types[p.type]||p.type)+
       '</b><small>Анализ № '+p.analysisId+' · позиция '+(p.index+1)+
       ' · '+esc(p.source.kind)+' · лист '+esc(p.source.page)+'</small></div>'+
       '<span class="ir-ai-review-status '+(p.approved?"confirmed":p.status==="rejected"?"rejected":"requires_review")+'">'+
       esc(p.conflictingReviews?"Конфликт решений":p.sourceValid?statuses[p.status]:"Исходный PDF изменён")+'</span></div>'+
      '<p class="ir-ai-proposal-source">'+esc(p.source.name)+
       ' · SHA-256 '+esc(p.source.sha256)+'</p>'+
      '<div class="ir-ai-proposal-quote"><b>Текст, на который ссылается модель:</b>'+
       '<q>'+esc(p.evidence.quote||"Цитата отсутствует")+'</q>'+
       '<small>'+esc(p.evidence.location||"Место на листе не установлено")+'</small></div>'+
      '<div class="ir-ai-proposal-values">'+details+'</div>'+
      (warn.length?'<div class="ir-ai-proposal-warnings">'+warn.map(w=>
       '<div>• '+esc(w)+'</div>').join("")+'</div>':"")+
      '<div class="ir-ai-connection-actions">'+
       (p.source.page?'<button type="button" data-proposal-pdf="'+k+'">Открыть лист КМД/КМ</button>':"")+
       '<button type="button" data-proposal-history="'+k+'">История</button>'+
       (allowed&&!p.conflictingReviews?'<button type="button" data-proposal-edit="'+k+'">Проверить / исправить</button>':"")+
       (allowed&&p.approved&&p.type==="mark_quantity"&&p.source.kind==="КМД"?
        '<button type="button" data-proposal-transfer="'+k+'">Подготовить в ведомость</button>':"")+
      '</div><div class="ir-ai-connection-log" data-proposal-log="'+k+'" hidden></div>'+
     '</article>'
    }).join("")+'</div>')+
   '<p class="ir-ai-storage-note">Структурированные данные хранятся отдельно от ведомостей IR Project. Предложение модели не подтверждает массу, количество или геометрию без проверки первоисточника. Старые результаты остаются неизменными.</p>'+
   '</section>';
  const root=host.querySelector(".ir-ai-proposals");
  const find=key=>proposals.find(p=>p.analysisId+":"+p.index===key);
  root.querySelectorAll("[data-proposal-pdf]").forEach(b=>b.onclick=()=>{
   const p=find(b.dataset.proposalPdf);
   if(p?.source.page)void openPdf?.(p.source.documentId,p.source.page)
  });
  root.querySelectorAll("[data-proposal-transfer]").forEach(b=>b.onclick=()=>{
   const p=find(b.dataset.proposalTransfer);
   if(p?.approved&&p.type==="mark_quantity"&&p.source.kind==="КМД"&&p.sourceValid)
    onPrepareQuantity?.(p)
  });
  root.querySelectorAll("[data-proposal-history]").forEach(b=>b.onclick=async()=>{
   if(!api)return;
   const key=b.dataset.proposalHistory,slot=root.querySelector('[data-proposal-log="'+key+'"]');
   if(!slot)return;
   if(!slot.hidden){slot.hidden=true;return}
   slot.hidden=false;slot.textContent="Загрузка истории...";
   try{
    const p=find(key),rows=await api.history(objectId,p.analysisId,p.index);
    slot.innerHTML=rows.length?rows.map(h=>'<div><b>Редакция '+esc(h.revision)+'</b> · '+
     esc(h.current?.reviewedBy)+' · '+esc(h.current?.reviewedAt)+
     ' · '+esc(statuses[h.current?.status]||h.current?.status)+
     (h.current?.comment?'<p>'+esc(h.current.comment)+'</p>':"")+'</div>').join(""):"Нет решений"
   }catch(e){slot.textContent="Не удалось загрузить журнал: "+String(e.message||e)}
  });
  root.querySelectorAll("[data-proposal-edit]").forEach(b=>b.onclick=()=>{
   const p=find(b.dataset.proposalEdit);if(!p||!allowed||p.conflictingReviews)return;
   const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-proposal-dialog";
   const inputs=(fields[p.type]||[]).map(f=>{
    const val=p.values?.[f]??"";
    return'<label>'+esc(titles[f]||f)+'<input name="'+f+'" '+
     (numeric.has(f)?'type="number" step="'+(["quantity","partCount","perJoint"].includes(f)?"1":"any")+'" min="0"':'type="text" maxlength="200"')+
     ' value="'+esc(val)+'"></label>'
   }).join("");
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>Проверить предложение ИИ</h3>'+
    '<p>'+esc(p.source.name)+' · лист '+p.source.page+
     '. Сначала откройте исходный PDF и проверьте каждую позицию. Ни одно из этих полей не изменяет оригинальный ответ модели.</p>'+
    '<div class="ir-ai-quantity-form-grid">'+inputs+
     '<label>Статус<select name="status">'+Object.entries(statuses).map(([key,title])=>
      '<option value="'+key+'" '+(p.status===key?"selected":"")+'>'+title+'</option>').join("")+
     '</select></label>'+
     '<label class="wide">Примечание инженера<textarea name="comment" rows="3" maxlength="2000">'+
      esc(p.comment||"")+'</textarea></label></div>'+
     '<p class="ir-ai-quantity-dialog-hint">Если нейросеть указала сомнение, подтвердить можно только с комментарием о проверке первоисточника.</p>'+
     '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
      '<button type="submit">Сохранить инженерную проверку</button></div>'+
     '<p class="ir-ai-quantity-dialog-error" data-error hidden></p></form>';
   document.body.appendChild(dlg);
   let busy=false;
   dlg.querySelector("[data-cancel]").onclick=()=>{if(!busy)dlg.close()};
   dlg.addEventListener("cancel",e=>{if(busy)e.preventDefault()});
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   dlg.querySelector("form").onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    busy=true;
    const error=dlg.querySelector("[data-error]");error.hidden=true;
    try{
     const role="engineer"; // Legacy data validation; no login or password required.
     if(!["admin","engineer"].includes(role))throw Error("Недостаточно прав");
     const password=await askPassword(role);
     if(password===null)return;
     if(!await reviewer.authorize(role,password))throw Error("Неверный пароль");
     const values={},form=new FormData(dlg.querySelector("form"));
     for(const f of fields[p.type]||[])values[f]=form.get(f)||"";
     await api.save(objectId,p.analysisId,p.index,{
      expectedRevision:p.revision,status:form.get("status"),values,comment:form.get("comment")
     });
     dlg.close();
     notice?.("Проверка предложения сохранена без изменения оригинального ответа ИИ.");
     await onRefresh?.()
    }catch(e){error.hidden=false;error.textContent="Ошибка проверки: "+String(e.message||e)}
    finally{busy=false}
   };
   dlg.showModal()
  })
 }
};
