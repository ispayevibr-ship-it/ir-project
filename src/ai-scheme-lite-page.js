"use strict";
/* Fast mounting-layout assistant for IR Project AI.
 * No neural model, native dependencies, or detailed fabrication 3D required.
 * Results are untrusted candidates from source-linked PDF text layers.
 * Existing confirmed scheme grid + project mark register remain authoritative.
 */
(function(root){
 const MARK=/[КKБBРPСCФFМM][\- ]?\d{1,4}[А-ЯA-Z]?/iu;
 const TYPES=[
  ["column",/колонн[аы]|стойк[аи]|фахверк/iu],
  ["beam",/балк[аи]|ригел[ья]|прогон[аы]|распорк[аи]/iu],
  ["brace",/связ[ьи]|раскос[аы]/iu]
 ];
 const TYPE_NAMES={column:"Колонна / стойка",beam:"Балка / ригель / прогон",brace:"Связь / раскос"};
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=x=>String(x||"").trim().toLocaleUpperCase("ru-RU").replace(/K/g,"К").replace(/B/g,"В").replace(/P/g,"Р").replace(/C/g,"С").replace(/\s+/g,"");
 function classSheet(name,text){
  const s=(String(name||"")+" "+String(text||"").slice(0,2400)).toLocaleLowerCase("ru");
  if(/план\s+(?:расположения|монтажа|колонн|балок|связей)|схема\s+(?:расположения|монтажа)|монтажн.{0,12}схем/iu.test(s))return"plan";
  if(/разрез|фасад|сечение\s+по\s+оси/iu.test(s))return"section";
  if(/(?:колонна|балка|ригель|связь|прогон|стойка|фахверк)\s*[КKБBРPСCФFМM]\s*\d/iu.test(s))return"detail";
  return"other"
 }
 // Only specifically labelled elevations are allowed. Every other number
 // (part length, plate offset, section label) must remain unclassified.
 function readElevation(text,kind){
  const label=kind==="bottom"?
   /(?:отм(?:етка|\.)?\s*(?:низа|нижн)|низ\s+(?:колонны|конструкции|элемента)|н(?:из)\.?\s*отм)/giu:
   /(?:отм(?:етка|\.)?\s*(?:верха|верхн)|верх\s+(?:колонны|конструкции|элемента)|в(?:ерх)\.?\s*отм)/giu;
  const hay=String(text||"");let found;
  while((found=label.exec(hay))){
   const suffix=hay.slice(found.index+found[0].length,found.index+found[0].length+30);
   const match=suffix.match(/^[\s:=№]{0,9}([+\-−]?\s*\d{1,3}[.,]\d{3})(?!\d)/u);
   if(!match)continue;
   const value=Number(match[1].replace(/\s/g,"").replace("−","-").replace(",","."));
   if(!Number.isFinite(value)||Math.abs(value)>300)continue;
   return{mm:Math.round(value*1000),quote:(found[0]+" "+match[1]).trim().slice(0,90)}
  }
  return null
 }
 function lengthHint(text){
  const found=String(text||"").match(/(?:общая\s+длина|длина\s+(?:колонны|элемента|конструкции)|L\s*=)\s*[:=]?\s*(\d{3,6})\s*(?:мм)?\b/iu);
  return found&&Number(found[1])<=120000?{mm:Number(found[1]),quote:found[0].slice(0,90)}:null
 }
 function axisPair(text){
  // A literal pair in a named axis-reference phrase is evidence, but standalone
  // 1–6 or Cyrillic letters in part tables are NOT evidence of a placement.
  const found=String(text||"").match(/(?:пересечении\s+осей|по\s+осям|ось|оси)\s*[:№ ]*\s*([1-9]\d?)\s*[/–—-]\s*([АБВГДЕЖЗИЙКЛМНОП])/iu);
  return found?{x:found[1],y:found[2].toLocaleUpperCase("ru-RU"),quote:found[0].slice(0,90)}:null
 }
 function markMatches(text){
  const result=[],source=String(text||"");
  // A mark needs a nearby explicit structural noun; a bare part label is not a
  // basis to place the structural element.
  const regex=/(колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|распорк[аи]|стойк[аи]|фахверк|связ[ьи]|раскос[аы])\s*(?:марка|марки|№|поз\.?)?\s*[:\-]?\s*([КKБBРPСCФFМM]\s*[-]?\s*\d{1,4}[А-ЯA-Z]?)/giu;
  let m;
  while((m=regex.exec(source))&&result.length<30){
   const mark=norm(m[2]),type=TYPES.find(([,rx])=>rx.test(m[1]))?.[0]||"unknown";
   if(!MARK.test(mark))continue;
   if(!result.some(x=>x.mark===mark&&x.type===type))
    result.push({mark,type,quote:m[0].slice(0,130),basis:"text_layer"})
  }
  return result
 }
 function extractPage({documentId,name,kind,sha256,page,raw,uncertainEncoding=false}={}){
  const text=String(raw?.text||"").slice(0,24000);
  const sheetType=classSheet(name,text),matches=uncertainEncoding?[]:markMatches(text);
  const fromName=(String(name||"").match(/(?:колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|связ[ьи]|КМД)[^\d]{0,14}([КKБBРPСCФFМM]\d{1,4})/iu)||[])[1];
  if(!matches.length&&fromName&&MARK.test(fromName))matches.push({
   mark:norm(fromName),type:"unknown",quote:"Имя файла: "+String(name||"").slice(0,130),basis:"filename_only"
  });
  const bottom=uncertainEncoding?null:readElevation(text,"bottom"),
   top=uncertainEncoding?null:readElevation(text,"top"),
   len=uncertainEncoding?null:lengthHint(text),
   axes=uncertainEncoding?null:axisPair(text);
  const candidates=matches.slice(0,12).map(match=>{
   // Even a labelled level can refer to a DIFFERENT mark on multi-mark sheets;
   // only auto-associate levels if the sheet has exactly one clear mark.
   const single=matches.length===1&&!uncertainEncoding;
   const z0Mm=single?bottom?.mm??null:null,z1Mm=single?top?.mm??null:null;
   const lengthMm=single?len?.mm??null:null;
   const source={documentId:Number(documentId),sha256:String(sha256||""),name:String(name||""),
    kind:String(kind||""),page:Number(page)};
   return{mark:match.mark,type:match.type,source,sheetType,axisX:single?axes?.x||"": "",
    axisY:single?axes?.y||"":"",
    z0Mm,z1Mm,lengthMm,origin:match.basis,locationConfirmed:false,
    evidence:[match.quote,single&&bottom?.quote,single&&top?.quote,
     single&&len?.quote,single&&axes?.quote].filter(Boolean),
    warning:match.basis==="filename_only"?
     "Марка найдена только по имени файла; сверить со штампом PDF.":
     matches.length>1?"На листе несколько марок. Высоты и оси нельзя привязать автоматически.":
     "Координаты по монтажному плану требуют проверки инженера."}
  });
  return{documentId:Number(documentId),page:Number(page),kind:String(kind||""),
   name:String(name||""),sha256:String(sha256||""),sheetType,
   textAvailable:!!text.trim(),uncertainEncoding:Boolean(uncertainEncoding),
   marks:candidates,hasHeights:!!bottom||!!top,hasAxes:!!axes,scannedChars:text.length}
 }
 function axisGeometry(rows){
  const grid=rows.find(x=>x.record_type==="scheme_grid"||x.data?.entity_type==="grid")?.data;
  if(!grid)return null; // defaults displayed by the scheme UI are NOT engineering evidence.
  const ax=grid.axes_x,ay=grid.axes_y,sx=grid.x_spans_mm,sy=grid.y_spans_mm;
  if(!Array.isArray(ax)||ax.length<2||!Array.isArray(ay)||ay.length<2||
     !Array.isArray(sx)||sx.length!==ax.length-1||
     !Array.isArray(sy)||sy.length!==ay.length-1||
     [...sx,...sy].some(v=>!Number.isFinite(Number(v))||Number(v)<=0))
   return null;
  const cumulative=(names,steps)=>{
   let pos=0;return new Map(names.map((axis,i)=>{const here=pos;if(i<steps.length)pos+=Number(steps[i]);return[String(axis),here]}))
  };
  return{x:cumulative(ax,sx),y:cumulative(ay,sy),axesX:ax.map(String),axesY:ay.map(String),
   width:sx.reduce((s,v)=>s+Number(v),0),height:sy.reduce((s,v)=>s+Number(v),0)}
 }
 function payloadFor(c,{mark,axisX,axisY,endX,endY,z0Mm,z1Mm,schemeRows=[]}={}){
  const grid=axisGeometry(schemeRows);
  if(!grid)throw Error("В монтажной схеме не сохранена проверенная сетка осей. Сначала настройте и сохраните её.");
  const startX=grid.x.get(String(axisX)),startY=grid.y.get(String(axisY));
  if(startX===undefined||startY===undefined)throw Error("Выберите существующие оси X и Y.");
  if(!mark?.id||norm(mark.mark||mark.title)!==norm(c.mark))
   throw Error("Выберите точную марку из ведомости объекта. ИИ не создаёт её автоматически.");
  const kind=c.type;
  if(!["column","beam","brace"].includes(kind))throw Error("Уточните тип конструкции.");
  if(!Number.isFinite(z0Mm)||!Number.isFinite(z1Mm)||z1Mm<=z0Mm&&kind==="column")
   throw Error("Введите проверенные отметки начала и конца в мм.");
  const endPosX=kind==="column"?startX:grid.x.get(String(endX)),
   endPosY=kind==="column"?startY:grid.y.get(String(endY));
  if(endPosX===undefined||endPosY===undefined)throw Error("Для балки или связи нужны конечные оси.");
  if(kind!=="column"&&Math.hypot(endPosX-startX,endPosY-startY,z1Mm-z0Mm)<1)
   throw Error("Начало и конец элемента совпадают.");
  const markRows=schemeRows.filter(x=>x.record_type==="scheme_column"||
   x.data?.entity_type==="column");
  const total=Number(mark.qty??mark.count);
  if(!Number.isInteger(total)||total<1)throw Error("Для марки не задано подтверждённое количество в ведомости.");
  if(markRows.filter(x=>String(x.data?.mark_id)===String(mark.id)).length>=total)
   throw Error("Все экземпляры выбранной марки уже размещены в монтажной схеме.");
  if(markRows.some(x=>String(x.data?.mark_id)===String(mark.id)&&
   Number(x.data?.absolute_x_mm)===startX&&Number(x.data?.absolute_y_mm)===startY&&
   Number(x.data?.z0_mm)===z0Mm&&Number(x.data?.z1_mm)===z1Mm))
   throw Error("Такое размещение марки уже существует на этой оси и высоте.");
  const numbered=new Set(markRows.map(x=>x.title||x.data?.position));
  let i=1,position;do{position="COL-"+String(i++).padStart(4,"0")}while(numbered.has(position));
  return{record_type:"scheme_column",title:position,data:{
   entity_type:"column",position,mark_id:String(mark.id),
   mark:String(mark.mark||mark.title),mark_name:String(mark.name||""),
   work_type_id:String(mark.work_type_id||""),
   axis_x:String(axisX),axis_y:String(axisY),offset_x_mm:0,offset_y_mm:0,
   absolute_x_mm:startX,absolute_y_mm:startY,
   geometry_type:kind,
   absolute_x2_mm:kind==="column"?undefined:endPosX,
   absolute_y2_mm:kind==="column"?undefined:endPosY,
   end_axis_x:kind==="column"?undefined:String(endX),
   end_axis_y:kind==="column"?undefined:String(endY),
   end_offset_x_mm:kind==="column"?undefined:0,
   end_offset_y_mm:kind==="column"?undefined:0,
   z0_mm:z0Mm,z1_mm:z1Mm,end_z_mm:kind==="column"?undefined:z1Mm,
   rotation_deg:0,status:"planned",
   scheme_group:kind==="column"?"columns":kind==="brace"?"ties":"beams",
   scheme_group_label:kind==="column"?"Колонны":kind==="brace"?"Связи":"Балки",
   scheme_view_id:"all",
   ai_source:{documentId:c.source.documentId,sha256:c.source.sha256,
    page:c.source.page,evidence:c.evidence.slice(0,5),verifiedManually:true},
   ai_placement_method:"engineer_approved_text_candidate"
  }}
 }
 function createPage(){
  let latest=[],candidates=[],busy=false,log="",saved=0,disposeLast=null;
  const page={
   dispose(){if(disposeLast)disposeLast();disposeLast=null},
   async render(host,opts={}){
    if(!host)return;
    const {objectId,documents=[],indexes=[],canEdit=false,askPassword,
     reviewer,onOpenPdf,onNavigate}=opts;
    page.dispose();
    latest=[];candidates=[];busy=false;saved=0;log="";
    const escDoc=esc;let live=true;
    const hostWindow=opts.window||root;
    const dataRoot=opts.root||hostWindow?.irProject?.data?.forObject(objectId);
    const marksApi=dataRoot?.section?.("marks"),schemeApi=dataRoot?.section?.("scheme"),
     workApi=dataRoot?.section?.("work-types");
    const pdf=opts.pdf||hostWindow?.irProject?.aiPdf;
    disposeLast=()=>{live=false};
    const status=x=>{log=x;const el=host.querySelector("[data-lite-status]");if(el)el.textContent=x};
    const markup=()=>'<section class="ir-ai-lite">'+
     '<header class="ir-ai-review-heading"><div><h2>ИИ → Монтажная схема · быстрый режим</h2>'+
     '<p>Шаг 1: найти марки, привязки к осям и отметки из текстовых слоёв PDF. Qwen и подробные 3D-модели не запускаются.</p></div>'+
     '<b>Локально · без ИИ</b></header>'+
     '<div class="ir-ai-quantity-warning">Найденная марка не означает известное положение в здании. Высоты привязываются лишь к листам с одной явно обозначенной маркой. Импорт требует инженерной проверки, официальной ведомости и сохранённой сетки осей.</div>'+
     '<div class="ir-ai-lite-toolbar"><button type="button" data-lite-scan '+(busy?'disabled':'')+'>1. Быстро найти марки и высоты</button>'+
     '<button type="button" data-lite-scheme>Открыть монтажную схему</button></div>'+
     '<div data-lite-status role="status">'+escDoc(log||"Доступные проиндексированные PDF можно проверить без запуска Qwen.")+'</div>'+
     '<div data-lite-results></div></section>';
    const ensureCurrent=async c=>{
     const fresh=await hostWindow.irProject.aiDocuments.list(objectId);
     if(!fresh.some(d=>Number(d.id)===Number(c.source.documentId)&&d.sha256===c.source.sha256&&d.exists))
      throw Error("Исходный PDF изменён или удалён; пересканируйте документы.");
     const idx=(await pdf.list(objectId)).find(i=>Number(i.documentId)===Number(c.source.documentId)&&
      i.sourceSha256===c.source.sha256&&i.pages.some(p=>p.page===c.source.page));
     if(!idx)throw Error("Текстовый индекс изменён. Сначала переиндексируйте PDF.")
    };
    function draw(){
     const slot=host.querySelector("[data-lite-results]");if(!slot)return;
     const indexesLoaded=latest.length,candidateCount=candidates.length;
     slot.innerHTML='<div class="ir-ai-lite-counts">'+
      '<span>Проверено листов: <b>'+indexesLoaded+'</b></span>'+
      '<span>Найдено кандидатов: <b>'+candidateCount+'</b></span>'+
      '<span>Добавлено на схему: <b>'+saved+'</b></span></div>'+
      (latest.length?'<div class="ir-ai-lite-docs">'+latest.map(x=>
       '<div><b>'+escDoc(x.name)+' · лист '+x.page+'</b> · '+escDoc(
        {plan:"План расположения",section:"Разрез / фасад",detail:"Чертёж марки",other:"Тип не определён"}[x.sheetType])+
       (x.uncertainEncoding?' · Неоднозначная кодировка: потребуется визуальная проверка':"")+
       (x.marks.length?' · '+x.marks.length+' марок':' · Марки не найдены в читаемом тексте')+'</div>'
      ).join("")+'</div>':"")+
      (candidateCount?'<div class="ir-ai-lite-candidates">'+candidates.map((c,i)=>
       '<article class="ir-ai-lite-candidate" data-lite-row="'+i+'">'+
       '<div class="ir-ai-lite-candidate-head"><b>'+escDoc(c.mark)+' · '+escDoc(TYPE_NAMES[c.type]||"Тип требует проверки")+'</b>'+
       '<button type="button" data-lite-source="'+i+'">Открыть PDF · лист '+c.source.page+'</button></div>'+
       '<small>'+escDoc(c.source.name)+' · '+escDoc(c.warning)+'</small>'+
       '<div class="ir-ai-lite-evidence">'+c.evidence.map(e=>'<span>'+escDoc(e)+'</span>').join("")+'</div>'+
       '<div class="ir-ai-lite-edit">'+
       '<label>Тип<select name="type"><option value="">Выберите</option>'+
        Object.entries(TYPE_NAMES).map(([key,n])=>'<option value="'+key+'"'+
         (c.type===key?' selected':'')+'>'+escDoc(n)+'</option>').join("")+'</select></label>'+
       '<label>Ось X<input name="axisX" maxlength="3" placeholder="3" value="'+escDoc(c.axisX)+'"></label>'+
       '<label>Ось Y<input name="axisY" maxlength="3" placeholder="Г" value="'+escDoc(c.axisY)+'"></label>'+
       '<label>Конечная ось X<input name="endX" maxlength="3" placeholder="для балки"></label>'+
       '<label>Конечная ось Y<input name="endY" maxlength="3" placeholder="для балки"></label>'+
       '<label>Низ / начало, мм<input type="number" name="z0" step="1" placeholder="-400" value="'+escDoc(c.z0Mm??"")+'"></label>'+
       '<label>Верх / конец, мм<input type="number" name="z1" step="1" placeholder="9705" value="'+escDoc(c.z1Mm??"")+'"></label></div>'+
       '<div class="ir-ai-lite-actions"><button type="button" data-lite-approve="'+i+'" '+(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")?'disabled':'')+
       '>2. Проверить и добавить на монтажную схему</button>'+
       '<small>Координаты берутся только из сохранённой сетки IR Project.</small></div></article>').join("")+
       '</div>':
       '<div class="ir-ai-doc-empty">Пока нет предложений по маркам. Для сканирования нужны читаемые текстовые слои PDF. Листы без текста требуют отдельного визуального распознавания.</div>');
     slot.querySelectorAll("[data-lite-source]").forEach(b=>b.onclick=()=>{
      const c=candidates[Number(b.dataset.liteSource)];if(c)onOpenPdf?.(c.source.documentId,c.source.page)
     });
     slot.querySelectorAll("[data-lite-approve]").forEach(b=>b.onclick=()=>{void approve(Number(b.dataset.liteApprove))});
    }
    async function scan(){
     if(busy)return;busy=true;status("Быстро читаем текстовые слои PDF…");
     latest=[];candidates=[];host.querySelector("[data-lite-scan]").disabled=true;
     try{
      const pool=indexes.filter(idx=>documents.some(d=>Number(d.id)===Number(idx.documentId)&&
       d.sha256===idx.sourceSha256&&d.exists&&["КМ","КМД"].includes(d.kind)));
      const allEntries=pool.flatMap(idx=>idx.pages.slice(0,80).map(p=>({idx,p})));
      // Prefer placement plans and elevations over fabrication details.
      const priority={plan:0,section:1,detail:2,other:3};
      const fileName=idx=>documents.find(d=>Number(d.id)===Number(idx.documentId))?.name||idx.sourceName||"";
      allEntries.sort((a,b)=>priority[classSheet(fileName(a.idx),a.p.excerpt||"")]-
       priority[classSheet(fileName(b.idx),b.p.excerpt||"")]);
      const entries=allEntries.slice(0,250);
      for(const {idx,p} of entries){
       if(!live)break;
       const doc=documents.find(d=>Number(d.id)===Number(idx.documentId));
       if(!doc)continue;
       try{
        const detail=await pdf.page(objectId,idx.id,p.page);
        if(!live)break;
        if(detail.source?.sha256!==doc.sha256||Number(detail.source?.documentId)!==Number(doc.id))
         continue;
        const row=extractPage({documentId:doc.id,name:doc.name,kind:doc.kind,
         sha256:doc.sha256,page:p.page,raw:detail.page,
         uncertainEncoding:p.uncertainEncoding===true});
        latest.push(row);candidates.push(...row.marks)
       }catch(error){status("Ошибка чтения листа "+p.page+": "+String(error.message||error).slice(0,180))}
      }
      status("Быстрое извлечение завершено: "+latest.length+" из "+allEntries.length+
       " листов, "+candidates.length+" возможных марок. "+
       (allEntries.length>250?"За один запуск проверяются первые 250 листов; оставшиеся пока не обработаны. ":"")+
       "Неразборчивые PDF не интерпретировались.");
      draw()
     }catch(error){status("Не удалось проверить PDF: "+String(error.message||error))}
     finally{busy=false;const scanBtn=host.querySelector("[data-lite-scan]");if(scanBtn)scanBtn.disabled=false}
    }
    async function approve(index){
     const c=candidates[index],card=host.querySelector('[data-lite-row="'+index+'"]');
     if(!c||!card||!canEdit||busy)return;
     const fields=new Map([...card.querySelectorAll("[name]")].map(x=>[x.name,x.value.trim()]));
     const value=n=>fields.get(n)||"",requiredNum=n=>{
      const v=value(n);if(!v||!Number.isFinite(Number(v)))throw Error("Укажите числовую отметку «"+n+"» в миллиметрах");
      return Number(v)
     };
     busy=true;
     try{
      if(!hostWindow.irAccess?.canEdit?.("scheme"))
       throw Error("У текущей роли нет разрешения на изменение монтажной схемы.");
      const newKind=value("type");
      const [markRows,schemeRows,workRows]=await Promise.all([
       marksApi.list(),schemeApi.list(),workApi.list()
      ]);
      const names=markRows.map(r=>({id:r.id,...r.data,title:r.title})),
       matching=names.filter(m=>norm(m.mark||m.title)===norm(c.mark));
      if(matching.length!==1)throw Error("В ведомости объекта должно быть ровно одно точное соответствие марке "+c.mark+".");
      const relevantWork=workRows.find(w=>String(w.id)===String(matching[0].work_type_id));
      if(!relevantWork||relevantWork.data?.scheme_enabled!==true)
       throw Error("Для этой марки в разделе «Виды работ» должна быть включена монтажная схема.");
      const fresh={...c,type:newKind};
      const entry=payloadFor(fresh,{mark:matching[0],schemeRows,
       axisX:value("axisX"),axisY:value("axisY"),
       endX:value("endX"),endY:value("endY"),
       z0Mm:requiredNum("z0"),z1Mm:requiredNum("z1")});
      if(!reviewer||!askPassword)throw Error("Инженерное подтверждение недоступно");
      const role=hostWindow.irAccess?.role?.();
      if(!["admin","engineer"].includes(role))throw Error("Гость не может размещать элементы");
      const password=await askPassword(role);
      if(password===null)return;
      if(!await reviewer.authorize(role,password))throw Error("Неверный пароль инженера");
      await ensureCurrent(c);
      // Re-read authoritative grid and the scheme immediately before mutation.
      const currentRows=await schemeApi.list();
      const finalPayload=payloadFor(fresh,{mark:matching[0],schemeRows:currentRows,
       axisX:value("axisX"),axisY:value("axisY"),
       endX:value("endX"),endY:value("endY"),
       z0Mm:requiredNum("z0"),z1Mm:requiredNum("z1")});
      if(!hostWindow.confirm("Добавить проверенный элемент "+c.mark+
       " на монтажную схему? Оси и высоты будут сохранены как запланированная конструкция."))return;
      await schemeApi.create(finalPayload);
      saved++;status("Марка "+c.mark+" размещена на монтажной схеме после проверки инженером.");
      draw()
     }catch(error){status("Размещение не выполнено: "+String(error.message||error))}
     finally{busy=false}
    }
    host.innerHTML=markup();
    host.querySelector("[data-lite-scan]").onclick=()=>void scan();
    host.querySelector("[data-lite-scheme]").onclick=()=>onNavigate?.("scheme");
    draw();
    
   }
  };
  return page
 }
 const exported={createPage,extractPage,classSheet,readElevation,lengthHint,axisPair,axisGeometry,payloadFor};
 if(typeof module!=="undefined"&&module.exports)module.exports=exported;
 if(root&&typeof root==="object")root.irAiSchemeLitePage=createPage()
})(typeof window!=="undefined"?window:null);
