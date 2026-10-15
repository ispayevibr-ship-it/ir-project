"use strict";
/* Engineer-owned KMD sheet reference: always a manual, auditable declaration.
   UI must never infer that a blank sheet was reviewed or that OCR is certified. */
window.irAiKmdReferencePage={
 render(host,{objectId,entries=[],checks=null,comparison=null,api=null,
  reviewer=null,askPassword=null,canEdit=false,onRefresh=null,
  openPdf=null,notice=null}={}){
  if(!host)return;
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const types={mark:"Отправочная марка",part:"Деталь КМД",joint:"Узел",component:"Метиз / шов"};
  const statusText={requires_review:"На проверке",confirmed:"Подтверждено",rejected:"Отклонено"};
  const choices=(list,value)=>list.map(([k,s])=>'<option value="'+esc(k)+'"'+
   (String(k)===String(value)?" selected":"")+'>'+esc(s)+'</option>').join("");
  const perms=!!(canEdit&&api?.save&&reviewer&&askPassword);
  const current=(entries||[]).filter(x=>x.current),archive=(entries||[]).filter(x=>!x.current);
  const sheets=checks?.sheets||[],validSheets=sheets.filter(x=>x.valid);
  const missing=comparison?.mismatches||[];
  host.innerHTML='<section class="ir-ai-reference">'+
   '<header class="ir-ai-review-heading"><div><h2>Эталонная спецификация КМД</h2>'+
   '<p>Инженер вручную сверяет позиции с исходными листами. Эталон не создаётся из количества упоминаний ИИ.</p></div>'+
   '<b>Архив с историей</b></header>'+
   '<div class="ir-ai-quantity-warning">Для заполнения нужен утверждённый комплект КМД. Каждая эталонная позиция содержит лист-источник и ожидаемое количество. '+
   'Программа сравнивает его с подтверждёнными ведомостями, но не удостоверяет правильность исходного проекта. '+
   'Проверка листа аннулируется при редактировании его эталонных позиций.</div>'+
   '<div class="ir-ai-reference-stats">'+
   '<div><small>Листы действующего КМД</small><b>'+esc(checks?.total??0)+'</b></div>'+
   '<div><small>Вручную проверено листов</small><b>'+esc(checks?.reviewed??0)+'</b></div>'+
   '<div><small>Действующих утверждённых позиций</small><b>'+esc(comparison?.activeReferencePositions??0)+'</b></div>'+
   '<div><small>Расхождений с ведомостями</small><b>'+esc(comparison?.discrepancyCount??0)+'</b></div></div>'+
   '<div class="ir-ai-reference-top"><div><h3>Эталон по действующим листам</h3>'+
    '<small>'+esc(checks?.setIssue||"Комплект КМД не утверждён")+'</small></div>'+
    (perms&&validSheets.length?'<button type="button" data-reference-add>＋ Добавить позицию</button>':"")+'</div>'+
   (!sheets.length?'<div class="ir-ai-doc-empty">Нет действующего комплекта КМД. Сначала перейдите в «Ревизии КМ/КМД», зарегистрируйте и активируйте полный состав листов.</div>':
   '<div class="ir-ai-reference-sheets">'+sheets.map(s=>
    '<article class="ir-ai-reference-sheet">'+
     '<div><b>'+esc(s.sheetCode)+'</b><small>PDF № '+esc(s.documentId)+
      ' · лист '+esc(s.page)+' · позиций '+s.totalPositions+
      ' · подтверждено '+s.confirmedPositions+'</small></div>'+
     '<span class="'+(s.checked?"verified":"pending")+'">'+
      (s.checked?"Лист проверен":!s.valid?"Источник недоступен":"Нужна сверка")+'</span>'+
     '<div class="ir-ai-reference-sheet-actions">'+
      '<button type="button" data-reference-pdf="'+s.documentId+':'+s.page+'">Открыть PDF</button>'+
      (perms&&s.valid?'<button type="button" data-reference-seal="'+s.id+'">'+
       (s.checked?"Повторно подтвердить":"Подтвердить весь лист")+'</button>':"")+
      '</div></article>').join("")+'</div>')+
   '<div class="ir-ai-reference-table-wrap"><table class="ir-ai-reference-table"><thead><tr>'+
    '<th>Тип / обозначение</th><th>Лист</th><th>Ожидается</th><th>Проверка</th><th>Действия</th>'+
    '</tr></thead><tbody>'+current.map(item=>
      '<tr><td><b>'+esc(types[item.type]||item.type)+'</b><span>'+
       esc(item.mark)+(item.cipher?' · '+esc(item.cipher):"")+
       (item.position?' / '+esc(item.position):"")+
       (item.jointCode?' · '+esc(item.jointCode):"")+'</span></td>'+
       '<td>'+esc(item.sheetCode)+'</td><td>'+esc(item.quantity??"—")+'</td>'+
       '<td>'+esc(statusText[item.status]||item.status)+'</td>'+
       '<td><button data-ref-history="'+item.id+'">История</button>'+
       (perms?'<button data-ref-edit="'+item.id+'">Изменить</button>':"")+
       '</td></tr><tr class="ir-ai-reference-history-row" data-ref-log="'+item.id+
       '" hidden><td colspan="5"></td></tr>'
    ).join("")+'</tbody></table>'+
   (!current.length?'<div class="ir-ai-doc-empty">Эталонные позиции ещё не внесены. Добавляйте только подтверждённые по первоисточнику.</div>':"")+
   '</div>'+
   (missing.length?'<div class="ir-ai-reference-discrepancies"><h3>Отличия от инженерных ведомостей</h3>'+
    missing.slice(0,100).map(m=>'<div><b>'+esc(m.label)+'</b> · '+esc(m.mark)+
     ' · '+esc(m.position)+' · '+esc(m.sheetCode)+
     '<small>Эталон: '+esc(m.expected??"—")+' · ведомость: '+esc(m.actual??"отсутствует")+'</small></div>').join("")+
    (missing.length>100?'<small>Показаны первые 100 замечаний из '+missing.length+'</small>':"")+
    '</div>':'<p class="ir-ai-storage-note">Среди действующих утверждённых эталонных позиций расхождения не обнаружены. Это не доказательство полного охвата исходных листов.</p>')+
   (archive.length?'<details class="ir-ai-reference-archive"><summary>Архивные эталонные позиции ('+
    archive.length+')</summary><div>'+archive.map(x=>'<div>'+esc(x.mark)+
     ' · '+esc(types[x.type]||x.type)+' · '+esc(x.sheetCode)+
     ' · версия '+esc(x.revision)+'</div>').join("")+'</div></details>':"")+
   '<p class="ir-ai-storage-note">Полная спецификация не удостоверена автоматически. '+
    'Для каждой редакции КМД необходима отдельная ручная сверка действующих листов инженером.</p>'+
   '</section>';
  const root=host.querySelector(".ir-ai-reference");
  root.querySelectorAll("[data-reference-pdf]").forEach(button=>button.onclick=()=>{
   const [doc,page]=button.dataset.referencePdf.split(":");void openPdf?.(doc,page)
  });
  let writing=false;
  async function authorized(fn){
   if(writing)throw Error("Предыдущее сохранение ещё выполняется");
   writing=true;
   try{
    if(!perms)throw Error("Права инженера не подтверждены");
    const role=window.irAccess?.role?.();
    if(!["admin","engineer"].includes(role))throw Error("Только инженер или администратор");
    const password=await askPassword(role);
    if(password===null)return false;
    if(!await reviewer.authorize(role,password))throw Error("Неверный пароль инженера/администратора");
    await fn();
    notice?.("Эталон КМД сохранён. История и исходный PDF не изменены.");
    await onRefresh?.();
    return true
   }finally{writing=false}
  }
  function modal(title,content,confirmLabel,submit){
   const dlg=document.createElement("dialog");
   dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-reference-dialog";
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+esc(title)+'</h3>'+content+
    '<p class="ir-ai-quantity-dialog-error" data-ref-error hidden></p>'+
    '<div class="ir-ai-quantity-form-actions"><button type="button" data-ref-cancel>Отмена</button>'+
    '<button type="submit">'+esc(confirmLabel)+'</button></div></form>';
   document.body.appendChild(dlg);let pending=false;
   dlg.querySelector("[data-ref-cancel]").onclick=()=>{if(!pending)dlg.close()};
   dlg.addEventListener("cancel",e=>{if(pending)e.preventDefault()});
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   dlg.querySelector("form").onsubmit=async e=>{
    e.preventDefault();if(pending)return;pending=true;
    const error=dlg.querySelector("[data-ref-error]");error.hidden=true;
    try{
     const v=Object.fromEntries(new FormData(dlg.querySelector("form")).entries());
     const succeeded=await submit(v);
     if(succeeded)dlg.close()
    }catch(ex){error.hidden=false;error.textContent=String(ex?.message||ex)}
    finally{pending=false}
   };
   dlg.showModal();
   return dlg
  }
  function edit(item){
   const sheetsOptions=validSheets.map(s=>[s.id,s.sheetCode+" · лист "+s.page]);
   if(!sheetsOptions.length){notice?.("Нет доступных листов действующего комплекта КМД","error");return}
   const i=item||{},sheetId=i.sheetId||sheetsOptions[0][0];
   const fields=(visible,key,title,max=100)=>'<label data-ref-field="'+key+'"'+
    (visible?'':' hidden')+'>'+title+'<input name="'+key+'" maxlength="'+max+
    '" value="'+esc(i[key]||"")+'"></label>';
   const dlg=modal(item?"Изменить эталонную позицию":"Добавить эталонную позицию",
    '<div class="ir-ai-quantity-form-grid">'+
    '<label>Действующий лист<select name="sheetId">'+choices(sheetsOptions,sheetId)+'</select></label>'+
    '<label>Тип позиции<select name="type">'+choices(Object.entries(types),i.type||"mark")+'</select></label>'+
    fields(true,"mark","Отправочная марка")+
    fields(true,"cipher","Шифр КМД")+
    fields(true,"secondaryCipher","Дополнительный шифр")+
    fields(false,"position","Позиция детали / метиза")+
    fields(false,"jointCode","Узел КМД")+
    '<label data-ref-field="scope" hidden>Соединение<select name="scope">'+
     choices([["fabrication","Заводское"],["erection","Монтажное"]],i.scope||"fabrication")+
    '</select></label>'+
    '<label data-ref-field="category" hidden>Категория<select name="category">'+
     choices([["fastener","Метиз"],["weld","Сварной шов"]],i.category||"fastener")+
    '</select></label>'+
    fields(false,"kind","Вид метиза / шва",50)+
    '<label>Количество по КМД<input name="quantity" type="number" min="1" max="1000000" step="1" value="'+
     esc(i.quantity??"")+'"></label>'+
    '<label>Статус<select name="status">'+choices(Object.entries(statusText),i.status||"requires_review")+
    '</select></label>'+
    fields(true,"sourcePosition","Позиция в спецификации / подпись на листе",120)+
    '<label class="wide">Комментарий инженера<textarea name="comment" maxlength="1200" rows="3">'+
     esc(i.comment||"")+'</textarea></label></div>'+
    '<p>Количество для детали — на одну отправочную марку; для заводского узла — на марку; '+
    'для монтажного узла — на объект; для метиза/шва — на один физический узел.</p>',
    "Сохранить эталон",v=>authorized(()=>api.save(objectId,item?.id??null,{
     ...v,sheetId:Number(v.sheetId),
     quantity:v.quantity===""?null:Number(v.quantity),
     expectedRevision:item?.revision||0
    })));
   const update=()=>{
    const t=dlg.querySelector('[name="type"]').value;
    for(const field of ["position","jointCode","scope","category","kind"]){
     const shown=field==="position"&&(t==="part"||t==="component")||
      (field==="jointCode"||field==="scope")&&(t==="joint"||t==="component")||
      (field==="category"||field==="kind")&&t==="component";
     dlg.querySelector('[data-ref-field="'+field+'"]').hidden=!shown
    }
   };
   dlg.querySelector('[name="type"]').onchange=update;update()
  }
  root.querySelector("[data-reference-add]")?.addEventListener("click",()=>edit(null));
  root.querySelectorAll("[data-ref-edit]").forEach(b=>b.onclick=()=>{
   const item=current.find(x=>String(x.id)===b.dataset.refEdit);if(item)edit(item)
  });
  root.querySelectorAll("[data-ref-history]").forEach(b=>b.onclick=async()=>{
   const item=current.find(x=>String(x.id)===b.dataset.refHistory);
   const row=root.querySelector('[data-ref-log="'+b.dataset.refHistory+'"]');
   if(!item||!row)return;
   row.hidden=!row.hidden;
   if(row.hidden)return;
   const target=row.querySelector("td");target.textContent="Читаем историю...";
   try{
    const history=await api.history(objectId,item.id);
    target.innerHTML=history.length?history.map(h=>'<div><b>'+esc(h.action)+'</b> · '+
     esc(h.at)+' · '+esc(h.reviewedBy)+'</div>').join(""):"Истории нет"
   }catch(ex){target.textContent="Ошибка чтения: "+String(ex?.message||ex)}
  });
  root.querySelectorAll("[data-reference-seal]").forEach(b=>b.onclick=()=>{
   const sh=sheets.find(x=>String(x.id)===b.dataset.referenceSeal);
   if(!sh)return;
   modal("Сверить весь лист "+sh.sheetCode,
    '<p>Проверьте оригинальный PDF. Укажите все позиции этого листа, включая детали и соединения. '+
     'Для листа без спецификации подтвердите, что это действительно проверено вручную.</p>'+
    '<label class="ir-ai-reference-confirm"><input type="checkbox" name="reviewedEntireSheet" value="yes" required>'+
     ' Я полностью сверил лист '+esc(sh.sheetCode)+' с эталонными позициями</label>'+
    '<label>Примечание о способе проверки<textarea name="comment" rows="3" minlength="10" maxlength="1200" required '+
     'placeholder="Сверено по всем таблицам и выноскам чертежа..."></textarea></label>',
    "Подтвердить сверку листа",v=>{
     if(v.reviewedEntireSheet!=="yes")throw Error("Подтвердите проверку всех позиций");
     return authorized(()=>api.seal(objectId,sh.id,sh.revision,{
      reviewedEntireSheet:true,comment:v.comment
     }))
    })
  })
 }
};
