"use strict";
/* Isolated IR Project AI screen: verified KMD joints, hardware and weld seams. */
window.irAiConnectionsPage={
 render(box,{id,nodes=[],items=[],summary=null,assemblies=[],documents=[],
  canEdit=false,api=null,reviewer=null,askPassword=null,reload=null,
  notice=null,openPdf=null}={}){
  if(!box)return;
  const esc=x=>String(x??"").replace(/[&<>"]/g,v=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[v]));
  const statusName={requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"};
  const scopeName={fabrication:"Заводской узел",erection:"Монтажный стык"};
  const kindName={bolt:"Болт",nut:"Гайка",washer:"Шайба",anchor:"Анкер",stud:"Шпилька",
   pin:"Штифт",other:"Другой метиз",
   fillet:"Угловой шов",butt:"Стыковой шов",plug:"Пробочный шов",slot:"Прорезной шов"};
  const count=x=>x==null?"—":Number(x).toLocaleString("ru-RU",{maximumFractionDigits:3});
  const stats=summary||{confirmedNodes:null,pendingNodes:null,pendingItems:null,confirmedFastenerPositions:null,
   confirmedWeldPositions:null,totalFastenerPieces:null,totalWeldLengthM:null,fasteners:[]};
  const canChange=canEdit&&!!api&&!!reviewer;
  const allowedDocs=documents.filter(d=>d.kind==="КМД"&&d.ext===".pdf"&&d.exists);
  const eligibleNodes=nodes.filter(n=>n.status!=="rejected");
  // A physical joint can have many components; group once per render.
  const itemsByJoint=new Map();
  for(const item of items){
   if(!itemsByJoint.has(item.jointId))itemsByJoint.set(item.jointId,[]);
   itemsByJoint.get(item.jointId).push(item)
  }
  const edition=canChange&&assemblies.length&&allowedDocs.length;
  box.innerHTML='<section class="ir-ai-connections">'+
   (!summary?'<div class="ir-ai-quantity-warning">Сводка крепежа не рассчитана. Прочерки означают ошибку проверки или недоступные данные, а не нулевое количество метизов. Проверьте сообщения программы.</div>':"")+
   '<header class="ir-ai-review-heading"><div><h2>Метизы, узлы соединений и сварные швы</h2>'+
    '<p>Подтверждённые узлы КМД без двойного учёта между листами. Источники, количества и изменения проверяются инженером.</p></div>'+
    '<b>Частичная ведомость</b></header>'+
   '<div class="ir-ai-connections-stats">'+
    '<div><small>Подтверждённые узлы</small><strong>'+count(stats.confirmedNodes)+'</strong></div>'+
    '<div><small>Крепёж, отдельных изделий</small><strong>'+count(stats.totalFastenerPieces)+' шт.</strong></div>'+
    '<div><small>Длина проверенных швов</small><strong>'+count(stats.totalWeldLengthM)+' м</strong></div>'+
    '<div><small>Ожидают проверки</small><strong>'+count(summary?stats.pendingNodes+stats.pendingItems:null)+'</strong></div>'+
   '</div>'+
   '<div class="ir-ai-quantity-warning">Заводской узел × число экземпляров марки. Монтажный стык × отдельное число физических соединений на объект. Один и тот же монтажный стык запрещено учитывать повторно под другой маркой. Изделия считаются поштучно, сварка — отдельно в метрах. Общие объёмы объекта пока не установлены.</div>'+
   '<div class="ir-ai-connections-toolbar"><b>Узлы соединений · '+nodes.length+'</b>'+
    (canChange?'<button data-joint-new '+(!edition?'disabled':'')+'>＋ Добавить узел КМД</button>':"")+'</div>'+
   (!nodes.length?'<div class="ir-ai-doc-empty"><b>Узлов пока нет</b>'+
    '<p>Добавьте отправочную марку и PDF КМД, затем укажите узел или монтажный стык. Крепёж и швы вводятся только внутри выбранного узла.</p></div>':
    '<div class="ir-ai-connection-list">'+nodes.map(j=>{
     const children=itemsByJoint.get(j.id)||[],status=j.status||"requires_review";
     return'<article class="ir-ai-connection-card"><div class="ir-ai-connection-head">'+
      '<div><b>'+esc(j.jointCode)+'</b> · '+esc(scopeName[j.scope]||j.scope)+
       '<small>Отправочная марка: '+esc(j.assemblyMark)+' · '+esc(j.assemblyCipher||"без шифра")+
       ' · '+esc(j.source.name)+' / лист '+esc(j.source.page)+' / '+esc(j.source.position)+'</small></div>'+
      '<span class="ir-ai-review-status '+esc(status)+'">'+esc(statusName[status])+'</span></div>'+
      '<div class="ir-ai-connection-detail">'+
       (j.counted?'<b>'+count(j.instances)+' физических узлов учтено</b>':
        '<b>Не участвует в итогах</b> · '+esc(j.reason))+
       '<span> · редакция '+j.revision+'</span></div>'+
      '<div class="ir-ai-connection-actions">'+
       (j.source.page?'<button data-open-doc="'+j.source.documentId+':'+j.source.page+'">Открыть PDF</button>':"")+
       '<button data-history="joint:'+j.id+'">История</button>'+
       (canChange?'<button data-joint-edit="'+j.id+'">Редактировать узел</button>'+
        '<button data-item-new="'+j.id+'" '+(j.status==="rejected"?'disabled':'')+'>＋ Метиз / сварной шов</button>':"")+
      '</div><div class="ir-ai-connection-items">'+
       (!children.length?'<small>Для этого узла состав пока не введён.</small>':
        children.map(v=>'<div class="ir-ai-connection-item"><div><strong>'+esc(v.position)+'</strong> · '+
         esc(kindName[v.kind]||v.kind)+' · '+esc(v.standard||"Стандарт не указан")+
         (v.diameterMm?' · Ø'+esc(v.diameterMm)+' мм':"")+
         (v.lengthMm?' · L '+esc(v.lengthMm)+' мм':"")+
         (v.strength?' · '+esc(v.strength):"")+
         '<small>На узел: '+(v.perJoint??"не указано")+
          (v.category==="weld"?' участков шва':' шт.')+' · '+
          (v.counted?(v.category==="weld"?
           "всего "+count(v.totalLengthM)+" м сварки":"всего "+count(v.totalPieces)+" шт."):
           'не включено: '+esc(v.reason||"требует проверки"))+
          ' · '+esc(statusName[v.status]||v.status)+'</small></div><div>'+
         '<button data-history="item:'+v.id+'">История</button>'+
         (canChange?'<button data-item-edit="'+v.id+'">Изменить</button>':"")+
         '</div></div>').join(""))+'</div>'+
      '<div class="ir-ai-connection-log" data-log-joint="'+j.id+'" hidden></div></article>'
    }).join("")+'</div>')+
   '<div class="ir-ai-connections-toolbar"><b>Сводная ведомость метизов по типоразмерам</b></div>'+
   (stats.fasteners.length?'<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table">'+
    '<thead><tr><th>Изделие</th><th>Размеры</th><th>Класс / ГОСТ</th><th>Количество, шт.</th><th>Узлы-основания</th></tr></thead><tbody>'+
    stats.fasteners.map(x=>'<tr><td><b>'+esc(kindName[x.kind]||x.kind)+'</b></td>'+
     '<td>Ø '+esc(x.diameterMm??"—")+' × '+esc(x.lengthMm??"—")+' мм</td>'+
     '<td>'+esc(x.strength||"—")+' / '+esc(x.standard||"—")+'</td>'+
     '<td><b>'+count(x.pieces)+'</b></td>'+
     '<td>'+x.sources.map(z=>esc(z.jointCode)+' · лист '+esc(z.page)).join("; ")+'</td></tr>').join("")+
     '</tbody></table></div>':
    '<div class="ir-ai-doc-empty"><p>'+(summary?
     'Подтверждённого крепежа пока нет. Позиции со статусом «Требует проверки» в итог не включаются.':
     'Не удалось прочитать итог крепежа. Повторите загрузку после проверки ошибок ведомости.')+'</p></div>')+
   '<p class="ir-ai-storage-note">Болты, гайки, шайбы, анкеры и прочие изделия учитываются как отдельные позиции. «Комплект болтов» не прибавляется к составляющим автоматически. Длина швов не преобразуется в массу наплавленного металла без дополнительных исходных данных. Рабочие ведомости и монтажная схема IR Project не изменяются.</p>'+
   '</section>';
  async function authorize(){
   const role="engineer"; // Legacy data validation; no login or password required.
   if(!["admin","engineer"].includes(role)||!reviewer||!askPassword)
    throw Error("Нужны права инженера или администратора");
   const pwd=await askPassword(role);
   if(pwd===null)return false;
   if(!await reviewer.authorize(role,pwd))throw Error("Неверный пароль инженера/администратора");
   return true
  }
  const options=(entries,chosen)=>entries.map(([k,v])=>
   '<option value="'+esc(k)+'" '+(String(k)===String(chosen)?"selected":"")+'>'+esc(v)+'</option>').join("");
  const stage=box.querySelector(".ir-ai-connections");
  function openEditor(type,record=null,parent=null){
   if(!canChange)return;
   if(!allowedDocs.length||(!assemblies.length&&type==="joint")||
    (!eligibleNodes.length&&type==="item")){
    notice?.("Нужны загруженный PDF КМД и отправочная марка/узел соединения.","error");
    return
   }
   const jointMode=type==="joint",existing=record||{},src=existing.source||{};
   const dlg=document.createElement("dialog");
   dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-connection-dialog";
   const val=(key,defaultValue="")=>esc(existing[key]??defaultValue);
   const docOpts=options(allowedDocs.map(x=>[x.id,x.name]),src.documentId||allowedDocs[0].id);
   const general='<label class="wide">Исходный PDF КМД *<select required name="documentId">'+docOpts+'</select></label>'+
    '<label>Лист КМД *<input type="number" name="page" min="1" max="2000" step="1" required value="'+esc(src.page??1)+'"></label>'+
    '<label>Узел/позиция на листе *<input name="sourcePosition" maxlength="110" required value="'+esc(src.position||"")+'"></label>'+
    '<label>Изменение КМД<input name="drawingRevision" maxlength="50" value="'+esc(src.drawingRevision||"")+'"></label>'+
    '<label>Решение<select name="status">'+options([
     ["requires_review","Требует проверки"],["confirmed","Подтверждено"],["rejected","Отклонено"]],
     existing.status||"requires_review")+'</select></label>'+
    '<label class="wide">Примечание инженера<textarea name="comment" maxlength="1500" rows="2">'+val("comment")+'</textarea></label>';
   const joints=eligibleNodes.map(n=>[n.id,n.jointCode+" · "+n.assemblyMark+" · "+(scopeName[n.scope]||n.scope)]);
   const ownJoint=parent||nodes.find(n=>n.id===existing.jointId)||eligibleNodes[0];
   let content="";
   if(jointMode){
    content='<label class="wide">Отправочная марка *<select name="assemblyId" required>'+
     options(assemblies.filter(x=>x.status!=="rejected").map(x=>
      [x.id,x.mark+" · "+(x.cipher||"без шифра")+" · "+(x.quantity??"нет количества")+" шт."]),
      existing.assemblyId||assemblies[0]?.id)+'</select></label>'+
     '<label>Обозначение узла *<input name="jointCode" maxlength="80" required value="'+val("jointCode")+'" placeholder="У1 / С1"></label>'+
     '<label>Тип узла<select name="scope">'+options([["fabrication","Заводской"],
      ["erection","Монтажный (физический стык объекта)"]],existing.scope||"fabrication")+'</select></label>'+
     '<label data-fabrication>Узлов на одну отправочную марку *<input name="occurrencesPerAssembly" min="1" max="1000000" type="number" step="1" value="'+val("occurrencesPerAssembly",1)+'"></label>'+
     '<label data-erection>Монтажных стыков на объекте *<input name="siteOccurrences" min="1" max="1000000" type="number" step="1" value="'+val("siteOccurrences",1)+'"></label>';
   }else{
    content='<label class="wide">Узел КМД *<select required name="jointId">'+options(joints,ownJoint?.id)+'</select></label>'+
     '<label>Позиция метиза / обозначение шва *<input name="position" maxlength="80" required value="'+val("position")+'" placeholder="Б1 / Ш1"></label>'+
     '<label>Категория<select name="category">'+options([
      ["fastener","Метизы, отдельные изделия"],["weld","Сварной шов"]],existing.category||"fastener")+'</select></label>'+
     '<label data-fastener>Вид метиза<select name="fastenerKind">'+options([
      ["bolt","Болт"],["nut","Гайка"],["washer","Шайба"],["anchor","Анкер"],
      ["stud","Шпилька"],["pin","Штифт"],["other","Другой метиз"]],existing.category==="fastener"?existing.kind:"bolt")+'</select></label>'+
     '<label data-weld>Вид шва<select name="weldKind">'+options([
      ["fillet","Угловой"],["butt","Стыковой"],["plug","Пробочный"],
      ["slot","Прорезной"],["other","Другой шов"]],existing.category==="weld"?existing.kind:"fillet")+'</select></label>'+
     '<label>Количество на 1 узел *<input type="number" name="perJoint" min="1" max="1000000" step="1" value="'+val("perJoint",1)+'"></label>'+
     '<label data-fastener>Диаметр, мм<input type="number" name="diameterMm" min="0.01" step="any" value="'+val("diameterMm")+'"></label>'+
     '<label>Длина, мм (метиз / участок шва)<input type="number" name="lengthMm" min="0.01" step="any" value="'+val("lengthMm")+'"></label>'+
     '<label data-weld>Катет / размер шва, мм<input type="number" name="weldSizeMm" min="0.01" step="any" value="'+val("weldSizeMm")+'"></label>'+
     '<label data-fastener>ГОСТ / стандарт<input name="standard" maxlength="110" value="'+val("standard")+'"></label>'+
     '<label data-fastener>Класс прочности / материал<input name="strength" maxlength="80" value="'+val("strength")+'"></label>'+
     '<label data-fastener>Покрытие<input name="coating" maxlength="100" value="'+val("coating")+'"></label>'
   }
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+
    (record?"Редактировать "+(jointMode?"узел соединения":"метиз или шов"):
     "Добавить "+(jointMode?"узел соединения":"метиз или шов"))+'</h3>'+
    '<p>Внесите только количество и характеристики из конкретного КМД. Все изменения записываются в журнал после подтверждения инженера.</p>'+
    '<div class="ir-ai-quantity-form-grid">'+content+general+'</div>'+
    '<p class="ir-ai-quantity-dialog-hint">До подтверждения запись не влияет на числовые итоги. Монтажный стык на объекте должен иметь уникальное обозначение, независимо от того, на скольких листах он показан.</p>'+
    '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
    '<button type="submit">Сохранить</button></div>'+
    '<p class="ir-ai-quantity-dialog-error" data-error hidden></p></form>';
   document.body.appendChild(dlg);
   const form=dlg.querySelector("form"),error=dlg.querySelector("[data-error]");
   let saving=false;
   const toggle=()=>{
    const f=new FormData(form);
    for(const section of ["fabrication","erection"]){
     dlg.querySelectorAll("[data-"+section+"]").forEach(x=>x.hidden=!jointMode||f.get("scope")!==section)
    }
    for(const section of ["fastener","weld"]){
     dlg.querySelectorAll("[data-"+section+"]").forEach(x=>x.hidden=jointMode||f.get("category")!==section)
    }
   };
   form.addEventListener("change",toggle);toggle();
   dlg.querySelector("[data-cancel]").onclick=()=>{if(!saving)dlg.close()};
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   dlg.addEventListener("cancel",e=>{if(saving)e.preventDefault()});
   form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    const f=Object.fromEntries(new FormData(form).entries());
    saving=true;error.hidden=true;
    try{
     if(!await authorize()){saving=false;return}
     const base={expectedRevision:Number(existing.revision)||0,
      documentId:Number(f.documentId),page:Number(f.page),
      sourcePosition:f.sourcePosition,drawingRevision:f.drawingRevision,
      status:f.status,comment:f.comment};
     if(jointMode){
      const entry={...base,assemblyId:Number(f.assemblyId),jointCode:f.jointCode,
       scope:f.scope,
       occurrencesPerAssembly:f.scope==="fabrication"?f.occurrencesPerAssembly:"",
       siteOccurrences:f.scope==="erection"?f.siteOccurrences:""};
      await api.saveNode(id,existing.id||null,entry)
     }else{
      const entry={...base,jointId:Number(f.jointId),category:f.category,
       kind:f.category==="weld"?f.weldKind:f.fastenerKind,
       position:f.position,perJoint:f.perJoint,
       diameterMm:f.diameterMm||"",lengthMm:f.lengthMm||"",
       weldSizeMm:f.weldSizeMm||"",standard:f.standard||"",
       strength:f.strength||"",coating:f.coating||""};
      await api.saveItem(id,existing.id||null,entry)
     }
     dlg.close();
     notice?.("Данные КМД сохранены. Подтверждённые количества пересчитаны отдельно.");
     await reload?.()
    }catch(e){error.hidden=false;error.textContent="Не удалось сохранить: "+String(e.message||e)}
    finally{saving=false}
   };
   dlg.showModal()
  }
  if(canChange){
   const create=stage.querySelector("[data-joint-new]");
   if(create)create.onclick=()=>openEditor("joint");
   stage.querySelectorAll("[data-joint-edit]").forEach(b=>b.onclick=()=>{
    const row=nodes.find(v=>String(v.id)===b.dataset.jointEdit);
    if(row)openEditor("joint",row)
   });
   stage.querySelectorAll("[data-item-new]").forEach(b=>b.onclick=()=>{
    const row=nodes.find(v=>String(v.id)===b.dataset.itemNew);
    if(row)openEditor("item",null,row)
   });
   stage.querySelectorAll("[data-item-edit]").forEach(b=>b.onclick=()=>{
    const row=items.find(v=>String(v.id)===b.dataset.itemEdit);
    if(row)openEditor("item",row)
   })
  }
  stage.querySelectorAll("[data-open-doc]").forEach(b=>b.onclick=()=>{
   const [did,page]=b.dataset.openDoc.split(":");
   if(typeof openPdf==="function")void openPdf(did,page)
  });
  stage.querySelectorAll("[data-history]").forEach(b=>b.onclick=async()=>{
   if(!api)return;
   const [type,recId]=b.dataset.history.split(":");
   const card=b.closest(".ir-ai-connection-card");
   let target=card?.querySelector("[data-log-joint]");
   if(!target)return;
   if(!target.hidden&&target.dataset.currentLog===b.dataset.history){
    target.hidden=true;return
   }
   target.hidden=false;target.dataset.currentLog=b.dataset.history;
   target.textContent="Загружаем журнал изменений...";
   try{
    const rows=await api.history(id,type,Number(recId));
    if(target.dataset.currentLog!==b.dataset.history)return;
    target.innerHTML=rows.length?'<h4>История изменения</h4>'+
     rows.map(row=>'<div class="ir-ai-connection-logrow"><b>Редакция '+esc(row.revision)+'</b>'+
      ' · '+esc(row.reviewedAt)+' · '+esc(row.reviewedBy)+
      ' · '+esc(row.current?.status||"")+
      (row.current?.comment?'<p>'+esc(row.current.comment)+'</p>':"")+
      '</div>').join(""):'Истории пока нет.'
   }catch(e){target.textContent="Ошибка журнала: "+String(e.message||e)}
  })
 }
};
