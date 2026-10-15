"use strict";
/* Independent offline detailed steel dispatch-mark preview.
 * Source-linked confirmed geometry only; no guessed plates, profile radii,
 * drill holes, welds or CAD fabrication claims.
 */
window.irAiAssemblyPage=(function(){
 let active=null;
 const selectedAssembly=new Map();
 const TYPE={plate:"Прямоугольная пластина без отверстий",solid_rect:"Сплошной прямоугольник",
  ibeam:"Двутавр без галтелей",rhs:"Прямоугольная полая труба",chs:"Круглая полая труба"};
 const STATUS={requires_review:"Требует проверки",confirmed:"Подтверждено",rejected:"Отклонено"};
 const esc=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const opt=(rows,value)=>rows.map(([k,label])=>'<option value="'+esc(k)+'" '+
  (String(k)===String(value)?"selected":"")+'>'+esc(label)+'</option>').join("");
 function dispose(){if(active){active.dispose();active=null}}
 function render(host,{id,assemblies=[],materials=[],documents=[],canEdit=false,
  api=null,reviewer=null,askPassword=null,notice=null,openPdf=null,reload=null}={}){
  dispose();
  if(!host)return;
  const permitted=canEdit&&!!api&&!!reviewer&&!!askPassword;
  const selected=selectedAssembly.get(String(id));
  const defaultAssembly=assemblies.find(x=>x.id===Number(selected))||assemblies[0]||null;
  const pdfs=documents.filter(d=>d.kind==="КМД"&&d.ext===".pdf"&&d.exists);
  const state={alive:true,viewer:null,mark:defaultAssembly?.id||null,rows:[],summary:null};
  const disposeState=()=>{state.alive=false;state.viewer?.dispose();state.viewer=null};
  active={dispose:disposeState};
  host.innerHTML='<section class="ir-ai-assembly">'+
   '<header class="ir-ai-review-heading"><div><h2>Детальная 3D-сборка отправочной марки КМД</h2>'+
    '<p>Геометрия вводится по исходному КМД. Каждый экземпляр детали размещается отдельно с точными X/Y/Z и поворотом.</p></div>'+
    '<b>Офлайн-предпросмотр</b></header>'+
   '<div class="ir-ai-assembly-toolbar"><label>Отправочная марка<select data-assembly-choice>'+
    (assemblies.length?opt(assemblies.map(x=>[x.id,x.mark+" · "+(x.cipher||"Без шифра")+
     " · "+(x.quantity??"не определено")+" шт."]),"")+ "" :'<option value="">Нет марок КМД</option>')+
    '</select></label>'+
    '<div class="ir-ai-assembly-view-buttons"><button data-view="iso">3D</button>'+
     '<button data-view="front">Спереди</button><button data-view="side">Сбоку</button>'+
     '<button data-view="top">Сверху</button><button data-reset>Сброс</button></div></div>'+
   '<div class="ir-ai-assembly-indicators"><span data-assembly-count>Загрузка…</span>'+
    '<span data-assembly-covered></span><span data-assembly-source></span></div>'+
   '<div class="ir-ai-quantity-warning">Показываются только подтверждённые геометрические размещения. Без размеров, без позиций деталей или при расхождении с КМД объекты не рисуются. Это не заверенный CAD-файл: вырезы, отверстия, галтели проката, сварка и точные узлы крепления пока не моделируются.</div>'+
   '<div class="ir-ai-assembly-main"><div class="ir-ai-assembly-canvas-host"></div>'+
    '<aside class="ir-ai-assembly-inspector"><h3>Выбранная деталь</h3>'+
     '<div data-assembly-inspector>Выберите деталь в 3D или перечне ниже.</div></aside></div>'+
   '<div class="ir-ai-quantity-toolbar"><b>Размещение деталей одной отправочной марки</b>'+
    (permitted?'<button data-assembly-new disabled>＋ Добавить размещение</button>':"")+'</div>'+
   '<div class="ir-ai-assembly-parts" data-assembly-parts><div class="ir-ai-doc-empty">Выберите подтверждённую отправочную марку КМД.</div></div>'+
   '<p class="ir-ai-storage-note">Координаты относятся к локальной системе отправочной марки: X/Y — поперечные направления, Z — продольная ось. При копировании в общий монтажный каркас нужна отдельная подтверждённая привязка этой локальной системы к осям здания.</p>'+
   '</section>';
  const field=host.querySelector("[data-assembly-choice]"),partsDiv=host.querySelector("[data-assembly-parts]"),
   count=host.querySelector("[data-assembly-count]"),covered=host.querySelector("[data-assembly-covered]"),
   srcText=host.querySelector("[data-assembly-source]"),inspector=host.querySelector("[data-assembly-inspector]");
  if(defaultAssembly)field.value=String(defaultAssembly.id);
  const belonging=()=>materials.filter(p=>p.assemblyId===state.mark);
  const available=()=>belonging().filter(p=>p.status!=="rejected");
  function info(row){
   if(!row){inspector.textContent="Выберите подтверждённую деталь в 3D или перечне.";return}
   const sh=row.shape||{},p=row.position||{},rot=row.rotation||{};
   inspector.innerHTML='<b>'+esc(row.partPosition)+' · экземпляр '+esc(row.instanceIndex)+'</b>'+
    '<p>'+esc(TYPE[sh.type]||sh.type||"Геометрия не указана")+'</p>'+
    '<div>Положение: X '+esc(p.x)+'; Y '+esc(p.y)+'; Z '+esc(p.z)+' мм</div>'+
    '<div>Поворот: X '+esc(rot.x)+'°; Y '+esc(rot.y)+'°; Z '+esc(rot.z)+'°</div>'+
    '<div>Длина: '+esc(sh.lengthMm)+' мм</div>'+
    '<div>КМД: '+esc(row.source?.name)+' · лист '+esc(row.source?.page)+'</div>'+
    '<div>Статус: '+esc(STATUS[row.status]||row.status)+
     (row.counted?" · участвует в 3D":" · без подтверждения")+'</div>'+
    (row.reason?'<p>'+esc(row.reason)+'</p>':"")
  }
  function choose(rowId){
   const row=state.rows.find(x=>x.id===Number(rowId))||null;
   info(row);state.viewer?.select(row?.id||null)
  }
  async function load(assemblyId){
   state.mark=Number(assemblyId)||null;selectedAssembly.set(String(id),state.mark);
   state.viewer?.dispose();state.viewer=null;
   info(null);
   if(!api||!state.mark){
    count.textContent="Нет сохранённых отправочных марок";
    partsDiv.innerHTML='<div class="ir-ai-doc-empty">Сначала подтвердите количество отправочной марки по КМД.</div>';
    return
   }
   count.textContent="Загружаем геометрию";covered.textContent="";srcText.textContent="";
   try{
    const [rows,summary]=await Promise.all([api.list(id,state.mark),api.summary(id,state.mark)]);
    if(!state.alive||state.mark!==Number(assemblyId)||!host.isConnected)return;
    state.rows=rows;state.summary=summary;
    count.textContent=summary.confirmedPlacements+" проверенных размещений";
    covered.textContent=summary.coverageReady?"Все зарегистрированные детали размещены":"Сборка не полная";
    srcText.textContent=summary.pendingPlacements+" позиций ещё не подтверждены";
    const root=host.querySelector(".ir-ai-assembly-canvas-host");
    if(window.irAiAssemblyViewer){
     state.viewer=window.irAiAssemblyViewer.create(root,rows,{onSelect:selectedId=>info(
      state.rows.find(x=>x.id===Number(selectedId))||null)});
    }else root.textContent="Не удалось загрузить офлайн-3D-просмотрщик";
    const drafts=summary.coverage||[];
    partsDiv.innerHTML=(drafts.length?
     '<div class="ir-ai-assembly-coverage"><h3>Покрытие деталями из спецификации КМД</h3>'+
     drafts.map(x=>'<div><strong>'+esc(x.position)+'</strong> · '+x.modeled+'/'+x.required+
      ' подтверждено'+(x.remaining?' · осталось '+x.remaining:"")+'</div>').join("")+'</div>':
     '<div class="ir-ai-doc-empty">В этой отправочной марке пока нет подтверждённой спецификации деталей.</div>')+
     (!rows.length?'<div class="ir-ai-doc-empty"><b>3D-размещений пока нет</b>'+
      '<p>Добавьте размещение для каждого экземпляра детали КМД с указанием координат, сечения и источника.</p></div>':
      '<div class="ir-ai-assembly-records">'+rows.map(row=>
       '<article class="ir-ai-assembly-record '+(row.counted?"approved":"draft")+'">'+
        '<div><b>'+esc(row.partPosition)+' · № '+esc(row.instanceIndex)+'</b>'+
         '<small>'+esc(TYPE[row.shape?.type]||"Без типа")+
          ' · '+esc(STATUS[row.status]||"Требует проверки")+
          (!row.counted?' · '+esc(row.reason):"")+'</small></div>'+
        '<div class="ir-ai-assembly-record-actions"><button data-select="'+row.id+'">Показать</button>'+
         (row.source?.page?'<button data-source="'+row.source.documentId+':'+row.source.page+'">Лист</button>':"")+
         (permitted?'<button data-edit="'+row.id+'">Изменить</button>':"")+
         '<button data-history="'+row.id+'">История</button></div>'+
         '<div class="ir-ai-assembly-history" data-log="'+row.id+'" hidden></div>'+
       '</article>').join("")+'</div>');
    partsDiv.querySelectorAll("[data-select]").forEach(btn=>btn.onclick=()=>choose(btn.dataset.select));
    partsDiv.querySelectorAll("[data-source]").forEach(btn=>btn.onclick=()=>{
     const [doc,page]=btn.dataset.source.split(":");void openPdf?.(doc,page)
    });
    partsDiv.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>{
     const row=state.rows.find(x=>String(x.id)===btn.dataset.edit);
     if(row)openEditor(row)
    });
    partsDiv.querySelectorAll("[data-history]").forEach(btn=>btn.onclick=async()=>{
     const holder=partsDiv.querySelector('[data-log="'+btn.dataset.history+'"]');
     if(!holder)return;
     if(!holder.hidden){holder.hidden=true;return}
     holder.hidden=false;holder.textContent="Загружаем историю…";
     try{
      const rows=await api.history(id,Number(btn.dataset.history));
      holder.innerHTML=rows.length?rows.map(r=>'<div><b>Редакция '+esc(r.revision)+'</b> · '+
       esc(r.reviewedAt)+' · '+esc(r.reviewedBy)+' · '+
       esc(r.current?.partPosition||"")+' · '+esc(r.current?.status||"")+'</div>').join(""):
       'Изменений пока нет'
     }catch(e){holder.textContent="Ошибка журнала: "+String(e.message||e)}
    });
    const add=host.querySelector("[data-assembly-new]");
    if(add)add.disabled=!permitted||!available().length||!pdfs.length
   }catch(error){
    if(!state.alive)return;
    count.textContent="Ошибка загрузки сборки";
    partsDiv.textContent="Не удалось прочитать сохранённую геометрию: "+String(error.message||error)
   }
  }
  field.onchange=()=>{void load(field.value)};
  host.querySelectorAll("[data-view]").forEach(button=>button.onclick=()=>{
   state.viewer?.setView(button.dataset.view)
  });
  host.querySelector("[data-reset]").onclick=()=>{state.viewer?.reset();info(null)};
  const add=host.querySelector("[data-assembly-new]");
  if(add)add.onclick=()=>openEditor();
  async function openEditor(original=null){
   if(!permitted||!state.mark)return;
   const partOptions=available();
   if(!partOptions.length||!pdfs.length)return;
   const dlg=document.createElement("dialog");dlg.className="ir-ai-quantity-dialog ir-ai-review-password ir-ai-assembly-dialog";
   const sh=original?.shape||{},pos=original?.position||{},rotation=original?.rotation||{},source=original?.source||{};
   const input=(field,label,value="",extra="")=>
    '<label>'+label+'<input type="number" step="any" name="'+field+'" value="'+esc(value??"")+'" '+extra+'></label>';
   const shapeType=sh.type||"plate";
   dlg.innerHTML='<form class="ir-ai-quantity-form"><h3>'+
    (original?"Изменить размещение детали":"Добавить деталь в 3D-сборку")+'</h3>'+
    '<p>Заполните подтверждённые размеры и положение каждой детали по КМД. Ось длины детали в локальной системе — Z; повороты задаются в градусах X → Y → Z.</p>'+
    '<div class="ir-ai-quantity-form-grid">'+
     '<label class="wide">Позиция детали из спецификации КМД *<select name="partId">'+
      opt(partOptions.map(p=>[p.id,p.position+" · "+p.type+" · "+
       p.partCount+" дет./марка"+(p.counted?" · подтверждено":" · требует проверки")]),
       original?.partId||partOptions[0].id)+'</select></label>'+
     input("instanceIndex","Экземпляр детали № *",original?.instanceIndex??1,'min="1" max="100000" step="1" required')+
     '<label>Геометрия сечения *<select name="type">'+opt(Object.entries(TYPE),shapeType)+'</select></label>'+
     '<div class="wide ir-ai-assembly-dimensions">'+
     input("lengthMm","Длина вдоль Z, мм *",sh.lengthMm??"",'min="0.01" required')+
     input("widthMm","Ширина, мм *",sh.widthMm??"",'min="0.01"')+
     input("heightMm","Высота / толщина, мм *",sh.heightMm??"",'min="0.01"')+
     input("webMm","Стенка двутавра, мм *",sh.webMm??"",'min="0.01"')+
     input("flangeMm","Полка двутавра, мм *",sh.flangeMm??"",'min="0.01"')+
     input("wallMm","Стенка трубы, мм *",sh.wallMm??"",'min="0.01"')+
     input("diameterMm","Наружный диаметр, мм *",sh.diameterMm??"",'min="0.01"')+
     '</div><div class="wide ir-ai-assembly-coordinate-grid">'+
     input("x","X, мм *",pos.x??"",'required')+
     input("y","Y, мм *",pos.y??"",'required')+
     input("z","Z, мм *",pos.z??"",'required')+
     input("rx","Поворот X, ° *",rotation.x??0,'min="-360" max="360" required')+
     input("ry","Поворот Y, ° *",rotation.y??0,'min="-360" max="360" required')+
     input("rz","Поворот Z, ° *",rotation.z??0,'min="-360" max="360" required')+
     '</div>'+
     '<label class="wide">Исходный PDF КМД *<select name="documentId" required>'+
      opt(pdfs.map(p=>[p.id,p.name]),source.documentId||pdfs[0].id)+'</select></label>'+
     input("page","Номер листа PDF *",source.page??"",'min="1" max="2000" step="1" required')+
     '<label>Ссылка на размер/место на листе *<input name="sourcePosition" required maxlength="120" value="'+esc(source.location||"")+'"></label>'+
     '<label>Ревизия/изменение КМД *<input name="drawingRevision" required maxlength="50" value="'+esc(source.revision||"")+'"></label>'+
     '<label>Статус<select name="status">'+opt([
      ["requires_review","Требует проверки"],["confirmed","Подтверждено инженером"],
      ["rejected","Отклонено"]],original?.status||"requires_review")+'</select></label>'+
     '<label class="wide">Примечание инженера<textarea name="comment" maxlength="1500" rows="2">'+esc(original?.comment||"")+'</textarea></label></div>'+
     '<p class="ir-ai-quantity-dialog-hint">Неизвестная геометрия и пластины с отверстиями/скосами не должны подтверждаться как прямоугольная модель. После подтверждения будет создан только офлайн-предпросмотр по введённым размерам.</p>'+
     '<div class="ir-ai-quantity-form-actions"><button type="button" data-cancel>Отмена</button>'+
      '<button type="submit">Сохранить геометрию</button></div>'+
     '<p data-error class="ir-ai-quantity-dialog-error" hidden></p></form>';
   document.body.appendChild(dlg);
   const form=dlg.querySelector("form"),err=dlg.querySelector("[data-error]");
   let saving=false;
   const sync=()=>{
    const type=form.querySelector('[name="type"]').value;
    const needed=type==="chs"?["lengthMm","diameterMm","wallMm"]:
     type==="rhs"?["lengthMm","widthMm","heightMm","wallMm"]:
     type==="ibeam"?["lengthMm","widthMm","heightMm","webMm","flangeMm"]:
     ["lengthMm","widthMm","heightMm"];
    for(const inp of dlg.querySelectorAll(".ir-ai-assembly-dimensions input")){
     const shown=needed.includes(inp.name);
     inp.closest("label").hidden=!shown;inp.required=shown
    }
   };
   form.querySelector('[name="type"]').onchange=sync;sync();
   dlg.querySelector("[data-cancel]").onclick=()=>{if(!saving)dlg.close()};
   dlg.addEventListener("cancel",e=>{if(saving)e.preventDefault()});
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   form.onsubmit=async e=>{
    e.preventDefault();if(saving)return;
    const role=window.irAccess?.role?.();
    if(!["admin","engineer"].includes(role))return;
    saving=true;err.hidden=true;
    try{
     const pwd=await askPassword(role);
     if(pwd===null)return;
     if(!await reviewer.authorize(role,pwd))throw Error("Неверный пароль");
     const f=Object.fromEntries(new FormData(form).entries());
     const type=f.type;
     const shape={type,lengthMm:f.lengthMm};
     for(const k of (type==="chs"?["diameterMm","wallMm"]:
      type==="rhs"?["widthMm","heightMm","wallMm"]:
      type==="ibeam"?["widthMm","heightMm","webMm","flangeMm"]:
      ["widthMm","heightMm"]))shape[k]=f[k];
     const request={expectedRevision:Number(original?.revision)||0,assemblyId:state.mark,
      partId:Number(f.partId),instanceIndex:Number(f.instanceIndex),shape,
      position:{x:f.x,y:f.y,z:f.z},
      rotation:{x:f.rx,y:f.ry,z:f.rz},
      documentId:Number(f.documentId),page:Number(f.page),
      sourcePosition:f.sourcePosition,drawingRevision:f.drawingRevision,
      status:f.status,comment:f.comment};
     await api.save(id,original?.id||null,request);
     dlg.close();notice?.("Размещение детали КМД сохранено. Подтверждённый 3D-предпросмотр обновлён.");
     await reload?.()
    }catch(error){err.hidden=false;err.textContent="Не удалось сохранить 3D: "+String(error.message||error)}
    finally{saving=false}
   };
   dlg.showModal()
  }
  if(state.mark)void load(state.mark);
  else{
   count.textContent="Нет отправочных марок КМД";
   partsDiv.innerHTML='<div class="ir-ai-doc-empty"><b>Нет отправочных марок</b>'+
    '<p>Сначала добавьте и подтвердите позиции ведомости КМД.</p></div>'
  }
 }
 return{render,dispose}
})();
