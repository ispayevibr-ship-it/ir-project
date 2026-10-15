"use strict";
/* Annotation editor for confirmed KMD 3D parts; holes are reference circles,
   fasteners point markers, welds geometric line segments, never machined solids. */
window.irAiAssemblyAttachmentPage={
 render(host,{id,assemblyId,placements=[],attachments=[],summary=null,documents=[],
  componentItems=[],api=null,viewer=null,canEdit=false,reviewer=null,
  askPassword=null,openPdf=null,reload=null,notice=null}={}){
  if(!host)return;
  const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const types={hole:"Центр отверстия",fastener:"Точка крепежа",weld:"Сварной шов"};
  const statuses={requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"};
  const approvedParts=placements.filter(x=>x.counted);
  const eligibleDocs=documents.filter(x=>x.kind==="КМД"&&x.ext===".pdf"&&x.exists);
  const items=componentItems.filter(x=>x.assemblyId===assemblyId&&x.status!=="rejected");
  const permitted=canEdit&&api&&reviewer&&askPassword;
  const stats=summary||{total:0,visible:0,holes:0,fasteners:0,welds:0,pending:0};
  const options=(values,pick)=>values.map(([value,label])=>'<option value="'+esc(value)+'" '+
   (String(value)===String(pick)?"selected":"")+'>'+esc(label)+'</option>').join("");
  host.innerHTML='<section class="ir-ai-attachments">'+
   '<div class="ir-ai-review-heading"><div><h2>3D-точки крепления и сварка</h2>'+
    '<p>Разметка по локальным координатам детали. Болты и сварка связаны с подтверждёнными позициями КМД.</p></div>'+
    '<b>Без вырезания металла</b></div>'+
   '<div class="ir-ai-attachment-stats"><span>Отверстия: '+stats.holes+'</span>'+
    '<span>Крепёж: '+stats.fasteners+'</span><span>Швы: '+stats.welds+'</span>'+
    '<span>На проверке: '+stats.pending+'</span></div>'+
   '<div class="ir-ai-attachment-toolbar"><label><input type="checkbox" data-show checked> Показать точки в 3D</label>'+
    (permitted?'<button type="button" data-new '+(!approvedParts.length||!eligibleDocs.length?'disabled':'')+
     '>＋ Добавить точку / шов</button>':"")+'</div>'+
   (!attachments.length?'<div class="ir-ai-doc-empty"><b>На деталях ещё нет привязок</b>'+
    '<p>Добавьте центр отверстия, крепёж или сварной шов по конкретному листу КМД. Подтвердить их можно только при проверенной геометрии детали.</p></div>':
    '<div class="ir-ai-attachment-records">'+attachments.map(x=>
     '<article class="ir-ai-attachment-record '+(x.visible?"approved":"draft")+'">'+
      '<div><b>'+esc(x.code)+'</b> · '+esc(types[x.type]||x.type)+
       ' · '+esc(x.partPosition)+' № '+esc(x.instanceIndex)+
       '<small>'+esc(statuses[x.status]||x.status)+
        (x.visible?" · показано в 3D":" · не показано: "+esc(x.reason))+
        ' · лист '+esc(x.source.page)+
        (x.type==="hole"?' · Ø'+esc(x.diameterMm)+' мм / ось '+esc(x.axis):"")+
        (x.type==="weld"&&x.end?' · от '+esc(JSON.stringify(x.start))+
         ' до '+esc(JSON.stringify(x.end)):'')+'</small></div>'+
      '<div class="ir-ai-assembly-record-actions">'+
       '<button type="button" data-focus="'+x.id+'" '+(!x.visible?'disabled':'')+'>На 3D</button>'+
       '<button type="button" data-doc="'+x.source.documentId+':'+x.source.page+'">КМД</button>'+
       '<button type="button" data-history="'+x.id+'">История</button>'+
       (permitted?'<button type="button" data-edit="'+x.id+'">Изменить</button>':"")+
      '</div><div class="ir-ai-assembly-history" data-log="'+x.id+'" hidden></div>'+
     '</article>').join("")+'</div>')+
   '<p class="ir-ai-storage-note">Центры отверстий и крепёж обозначены маркерами, сварка — отрезками. Геометрические вырезы, диаметр сверления по нормативам, точный шов в металле и пространственное сопряжение двух деталей ещё не рассчитываются. Числовая ведомость крепежа остаётся независимой — 3D-маркеры не увеличивают количество.</p>'+
   '</section>';
  const root=host.querySelector(".ir-ai-attachments");
  root.querySelector("[data-show]").onchange=e=>viewer?.setShowAttachments(e.target.checked);
  root.querySelectorAll("[data-focus]").forEach(button=>button.onclick=()=>{
   viewer?.selectAttachment(Number(button.dataset.focus))
  });
  root.querySelectorAll("[data-doc]").forEach(button=>button.onclick=()=>{
   const [doc,page]=button.dataset.doc.split(":");void openPdf?.(doc,page)
  });
  root.querySelectorAll("[data-history]").forEach(button=>button.onclick=async()=>{
   const target=root.querySelector('[data-log="'+button.dataset.history+'"]');
   if(!target)return;
   if(!target.hidden){target.hidden=true;return}
   target.hidden=false;target.textContent="Загрузка журнала...";
   try{
    const rows=await api.history(id,Number(button.dataset.history));
    target.innerHTML=rows.length?rows.map(row=>
     '<div>Редакция '+esc(row.revision)+' · '+esc(row.reviewedAt)+
      ' · '+esc(row.reviewedBy)+' · '+esc(row.current?.status||"")+'</div>').join(""):
     'Записей пока нет'
   }catch(error){target.textContent="Ошибка: "+String(error.message||error)}
  });
  const editButton=root.querySelector("[data-new]");
  if(editButton)editButton.onclick=()=>openDialog(null);
  root.querySelectorAll("[data-edit]").forEach(button=>button.onclick=()=>{
   const row=attachments.find(x=>String(x.id)===button.dataset.edit);if(row)openDialog(row)
  });
  function openDialog(current=null){
   if(!permitted||!approvedParts.length||!eligibleDocs.length)return;
   const x=current||{},start=x.start||{},end=x.end||{},source=x.source||{};
   const eligibleItems=items.filter(item=>item.category==="fastener"||item.category==="weld");
   const selectedPart=current?.placementId||approvedParts[0].id;
   const value=(key,defaultValue="")=>esc(x[key]??defaultValue);
   const number=(key,label,v="")=>'<label>'+label+
    '<input type="number" name="'+key+'" step="any" value="'+esc(v??"")+'" required></label>';
   const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-attachment-dialog";
   dlg.innerHTML='<form class="ir-ai-quantity-form">'+
    '<h3>'+(current?"Редактировать 3D-привязку":"Новая 3D-точка / шов")+'</h3>'+
    '<p>Укажите локальные координаты на конкретной детали (в миллиметрах), не координаты здания. Положение обязано соответствовать КМД.</p>'+
    '<div class="ir-ai-quantity-form-grid">'+
     '<label class="wide">Экземпляр детали *<select name="placementId" required>'+
      options(approvedParts.map(p=>[p.id,p.partPosition+" № "+p.instanceIndex]),selectedPart)+'</select></label>'+
     '<label>Вид привязки<select name="type">'+options(Object.entries(types),x.type||"hole")+'</select></label>'+
     '<label>Обозначение КМД *<input name="code" required maxlength="80" value="'+value("code")+'" placeholder="О1 / Б1 / Ш1"></label>'+
     '<label class="wide" data-component>Позиция метиза / сварки *<select name="itemId">'+
      options([["","Выберите из ведомости метизов/швов"],...eligibleItems.map(p=>
       [p.id,p.jointCode+" · "+p.position+" · "+p.kind])],x.itemId||"")+'</select></label>'+
     '<div class="wide ir-ai-assembly-coordinate-grid">'+
      number("x","X точки, мм *",start.x)+number("y","Y точки, мм *",start.y)+
      number("z","Z точки, мм *",start.z)+'</div>'+
     '<div class="wide ir-ai-assembly-coordinate-grid" data-weld>'+
      number("ex","X конца, мм *",end.x)+number("ey","Y конца, мм *",end.y)+
      number("ez","Z конца, мм *",end.z)+'</div>'+
     '<label data-hole>Диаметр отверстия, мм *<input type="number" min="0.01" max="10000" step="any" name="diameterMm" value="'+value("diameterMm")+'"></label>'+
     '<label data-hole>Ось отверстия<select name="axis">'+options([["x","X"],["y","Y"],["z","Z"]],x.axis||"z")+'</select></label>'+
     '<label class="wide">Исходный PDF КМД *<select name="documentId">'+
      options(eligibleDocs.map(p=>[p.id,p.name]),source.documentId||eligibleDocs[0].id)+'</select></label>'+
     number("page","Лист PDF КМД *",source.page??1)+
     '<label>Позиция на листе *<input name="sourcePosition" required maxlength="120" value="'+esc(source.position||"")+'"></label>'+
     '<label>Ревизия *<input name="drawingRevision" required maxlength="50" value="'+esc(source.revision||"")+'"></label>'+
     '<label>Статус<select name="status">'+options(Object.entries(statuses),x.status||"requires_review")+'</select></label>'+
     '<label class="wide">Примечание инженера<textarea name="comment" maxlength="1500" rows="2">'+esc(x.comment||"")+'</textarea></label></div>'+
    '<p class="ir-ai-quantity-dialog-hint">Подтверждённый метиз или шов обязан иметь подтверждённую позицию ведомости. Точку по неподтверждённой детали нельзя принять в 3D.</p>'+
    '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
     '<button type="submit">Сохранить привязку</button></div>'+
    '<p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
   document.body.appendChild(dlg);
   const form=dlg.querySelector("form"),error=dlg.querySelector("[data-error]");
   const sync=()=>{
    const type=form.querySelector('[name="type"]').value;
    for(const k of ["weld","hole","component"])for(const node of dlg.querySelectorAll("[data-"+k+"]")){
     const shown=k==="weld"?type==="weld":k==="hole"?type==="hole":type!=="hole";
     node.hidden=!shown;
     for(const inp of node.querySelectorAll("input,select"))inp.disabled=!shown
    }
    const comp=form.querySelector('[name="itemId"]');if(comp&&!comp.disabled){
     const selected=eligibleItems.find(v=>String(v.id)===comp.value);
     if(selected&&selected.category!==(type==="weld"?"weld":"fastener"))comp.value=""
    }
   };
   form.querySelector('[name="type"]').onchange=sync;
   form.querySelector('[name="itemId"]').onchange=sync;sync();
   let saving=false;
   dlg.querySelector("[data-cancel]").onclick=()=>{if(!saving)dlg.close()};
   dlg.addEventListener("cancel",event=>{if(saving)event.preventDefault()});
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   form.onsubmit=async event=>{
    event.preventDefault();if(saving)return;
    const f=Object.fromEntries(new FormData(form).entries());
    saving=true;error.hidden=true;
    try{
     const role=window.irAccess?.role?.();
     if(!["admin","engineer"].includes(role))throw Error("Нужны права инженера");
     const pwd=await askPassword(role);
     if(pwd===null)return;
     if(!await reviewer.authorize(role,pwd))throw Error("Неверный пароль инженера");
     await api.save(id,current?.id||null,{
      expectedRevision:Number(current?.revision)||0,assemblyId,
      placementId:Number(f.placementId),type:f.type,code:f.code,
      start:{x:f.x,y:f.y,z:f.z},
      end:f.type==="weld"?{x:f.ex,y:f.ey,z:f.ez}:null,
      diameterMm:f.type==="hole"?f.diameterMm:null,
      axis:f.type==="hole"?f.axis:null,
      itemId:f.type==="hole"?null:Number(f.itemId),
      documentId:Number(f.documentId),page:Number(f.page),
      sourcePosition:f.sourcePosition,drawingRevision:f.drawingRevision,
      status:f.status,comment:f.comment
     });
     dlg.close();notice?.("3D-точка сохранена с привязкой к исходному КМД.");
     await reload?.()
    }catch(e){error.hidden=false;error.textContent="Не удалось сохранить: "+String(e.message||e)}
    finally{saving=false}
   };
   dlg.showModal()
  }
 }
};
