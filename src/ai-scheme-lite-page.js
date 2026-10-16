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
  // Only explicitly labelled intersections qualify. More than one different
  // intersection on the sheet is ambiguous, so never choose the first at random.
  const pattern=/(?:пересечении\s+осей|по\s+осям|ось|оси)\s*[:№ ]*\s*(?:([1-9]\d?)\s*[/–—-]\s*([АБВГДЕЖЗИЙКЛМНОП])|([АБВГДЕЖЗИЙКЛМНОП])\s*[/–—-]\s*([1-9]\d?))/giu;
  const found=new Map();let match;
  while((match=pattern.exec(String(text||"")))){
   const x=match[1]||match[4],y=(match[2]||match[3]).toLocaleUpperCase("ru-RU");
   found.set(x+":"+y,{x,y,quote:match[0].slice(0,90)})
   if(found.size>1)return null
  }
  return found.size===1?[...found.values()][0]:null
 }
 function axisSpan(text){
  // Full start/end hints require two parallel axes AND a perpendicular axis.
  // A bare "between 5 and 6" cannot determine a 3D mounting position.
  const letters="[АБВГДЕЖЗИЙКЛМНОП]",number="[1-9]\\d?",between="\\s*(?:[-–—]|и)\\s*";
  const patterns=[
   {type:"x",order:"range-first",rx:new RegExp("между\\s+осями\\s+("+number+")"+between+"("+number+")\\s+(?:по|на)\\s+оси\\s+("+letters+")","giu")},
   {type:"x",order:"axis-first",rx:new RegExp("(?:по|на)\\s+оси\\s+("+letters+")\\s+между\\s+осями\\s+("+number+")"+between+"("+number+")","giu")},
   {type:"y",order:"range-first",rx:new RegExp("между\\s+осями\\s+("+letters+")"+between+"("+letters+")\\s+(?:по|на)\\s+оси\\s+("+number+")","giu")},
   {type:"y",order:"axis-first",rx:new RegExp("(?:по|на)\\s+оси\\s+("+number+")\\s+между\\s+осями\\s+("+letters+")"+between+"("+letters+")","giu")}
  ];
  const found=new Map();
  for(const entry of patterns){
   let m;
   while((m=entry.rx.exec(String(text||"")))){
    const [start,end,station]=entry.order==="range-first"?[m[1],m[2],m[3]]:[m[2],m[3],m[1]];
    const result=entry.type==="x"?
     {x:start,y:station.toLocaleUpperCase("ru-RU"),endX:end,endY:station.toLocaleUpperCase("ru-RU")}:
     {x:station,y:start.toLocaleUpperCase("ru-RU"),endX:station,endY:end.toLocaleUpperCase("ru-RU")};
    if(result.x===result.endX&&result.y===result.endY)continue;
    const key=[result.x,result.y,result.endX,result.endY].join(":");
    found.set(key,{...result,quote:m[0].slice(0,120)});
    if(found.size>1)return null;
   }
  }
  return found.size===1?[...found.values()][0]:null
 }
 function markMatches(text,{includeRepeated=false}={}){
  const result=[],source=String(text||"");
  // A mark needs a nearby explicit structural noun; a bare part label is not a
  // basis to place the structural element.
  const regex=/(колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|распорк[аи]|стойк[аи]|фахверк|связ[ьи]|раскос[аы])\s*(?:марка|марки|№|поз\.?)?\s*[:\-]?\s*([КKБBРPСCФFМM]\s*[-]?\s*\d{1,4}[А-ЯA-Z]?)/giu;
  let m;
  while((m=regex.exec(source))&&result.length<30){
   const mark=norm(m[2]),type=TYPES.find(([,rx])=>rx.test(m[1]))?.[0]||"unknown";
   if(!MARK.test(mark))continue;
   if(includeRepeated||!result.some(x=>x.mark===mark&&x.type===type))
    result.push({mark,type,quote:m[0].slice(0,130),basis:"text_layer"})
  }
  return result
 }
 /* Extract location markers for *text evidence*, not coordinate inference.
  * Rectangles use original PDF points (origin at lower left) and only direct
  * pdf.js text fragments. No invented boxes for unmatched quotes. */
 function fragmentEvidence(raw,quotes=[]){
  const rawFragments=Array.isArray(raw?.fragments)?raw.fragments:[];
  if(!rawFragments.length||!Array.isArray(quotes))return[];
  const normText=x=>String(x??"").toLocaleUpperCase("ru-RU")
   .replace(/\s+/g,"").replace(/[−–—]/g,"-");
  const good=(f)=>f&&typeof f.text==="string"&&
   ["x","y","width","height"].every(k=>Number.isFinite(Number(f[k])))&&
   Number(f.width)>=0&&Number(f.height)>=0;
  const result=[];
  for(const evidence of quotes.slice(0,12)){
   const q=normText(evidence);
   if(q.length<4)continue;
   let found=null;
   for(let i=0;i<rawFragments.length&&!found;i++){
    const first=rawFragments[i];if(!good(first))continue;
    let joined="",xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity,ids=[];
    for(let j=i;j<Math.min(rawFragments.length,i+6);j++){
     const f=rawFragments[j];if(!good(f))break;
     if(Math.abs(Number(f.y)-Number(first.y))>Math.max(12,Number(first.height)*1.8))
      break;
     joined+=normText(f.text);ids.push(j);
     xmin=Math.min(xmin,Number(f.x));xmax=Math.max(xmax,Number(f.x)+Number(f.width));
     ymin=Math.min(ymin,Number(f.y));ymax=Math.max(ymax,Number(f.y)+Number(f.height));
     if(joined.includes(q)){
      found={quote:String(evidence).slice(0,130),fragmentIds:ids.slice(),
       rectPt:{x:Math.round(xmin*100)/100,y:Math.round(ymin*100)/100,
        width:Math.round((xmax-xmin)*100)/100,height:Math.round((ymax-ymin)*100)/100}};
      break
     }
     // Adjacent quote fragments only; never span arbitrary sections.
     if(joined.length>q.length+65)break
    }
   }
   if(found)result.push(found)
  }
  return result
 }
 function extractPage({documentId,name,kind,sha256,page,raw,uncertainEncoding=false}={}){
  const text=String(raw?.text||"").slice(0,24000);
  const sheetType=classSheet(name,text),
   occurrences=uncertainEncoding?[]:markMatches(text,{includeRepeated:true}),
   matches=uncertainEncoding?[]:markMatches(text);
  const fromName=(String(name||"").match(/(?:колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|связ[ьи]|КМД)[^\d]{0,14}([КKБBРPСCФFМM]\d{1,4})/iu)||[])[1];
  if(!matches.length&&fromName&&MARK.test(fromName))matches.push({
   mark:norm(fromName),type:"unknown",quote:"Имя файла: "+String(name||"").slice(0,130),basis:"filename_only"
  });
  const bottom=uncertainEncoding?null:readElevation(text,"bottom"),
   top=uncertainEncoding?null:readElevation(text,"top"),
   len=uncertainEncoding?null:lengthHint(text),
   axes=uncertainEncoding?null:axisPair(text),
   span=uncertainEncoding?null:axisSpan(text);
  const candidates=matches.slice(0,12).map(match=>{
   // Even a labelled level can refer to a DIFFERENT mark on multi-mark sheets;
   // only auto-associate levels if the sheet has exactly one clear mark.
   // Repeated mentions of the SAME designation are not proof of only one
   // physical instance. Never attribute sheet-wide axes/heights to the first.
   const single=occurrences.length===1&&matches.length===1&&!uncertainEncoding;
   const z0Mm=single?bottom?.mm??null:null,z1Mm=single?top?.mm??null:null;
   const lengthMm=single?len?.mm??null:null;
   const line=single&&match.type!=="column"?span:null;
   const point=single?axes:null;
   const conflicting=!!(line&&point&&(line.x!==point.x||line.y!==point.y));
   const location=conflicting?null:line||point;
   const source={documentId:Number(documentId),sha256:String(sha256||""),name:String(name||""),
    kind:String(kind||""),page:Number(page)};
   return{mark:match.mark,type:match.type,source,sheetType,
    axisX:location?.x||"",axisY:location?.y||"",
    endAxisX:!conflicting?line?.endX||"":"",endAxisY:!conflicting?line?.endY||"":"",
    z0Mm,z1Mm,lengthMm,origin:match.basis,locationConfirmed:false,
    evidence:[match.quote,single&&bottom?.quote,single&&top?.quote,
     single&&len?.quote,single&&axes?.quote,single&&line?.quote].filter(Boolean),
    evidenceLocations:fragmentEvidence(raw,[match.quote,
     single&&bottom?.quote,single&&top?.quote,
     single&&axes?.quote,single&&line?.quote].filter(Boolean)),
    warning:conflicting?"Несовместимые привязки в тексте листа — оси оставлены пустыми до инженерной проверки.":
     match.basis==="filename_only"?
     "Марка найдена только по имени файла; сверить со штампом PDF.":
     occurrences.length>1?"На листе несколько упоминаний марок (включая повторения одинаковых обозначений). "+
      "Высоты и оси нельзя автоматически приписывать одному физическому экземпляру.":
     "Координаты по монтажному плану требуют проверки инженера."}
  });
  return{documentId:Number(documentId),page:Number(page),kind:String(kind||""),
   name:String(name||""),sha256:String(sha256||""),sheetType,
   textAvailable:!!text.trim(),uncertainEncoding:Boolean(uncertainEncoding),
   marks:candidates,markMentions:occurrences.length,
   hasHeights:!!bottom||!!top,hasAxes:!!axes,scannedChars:text.length}
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
 // Cross-check all candidate locations against the live mark register. These
 // are proposals, NEVER authenticated CAD coordinates or automatic placements.
 function buildBatchPlan({candidates=[],pages=[],marks=[],schemeRows=[],workRows=[]}={}){
  const checked=[],review=[],ready=[],seen=new Set(),byMark=new Map();
  const grid=axisGeometry(schemeRows);
  const placed=schemeRows.filter(x=>x.record_type==="scheme_column"||x.data?.entity_type==="column");
  const workIds=new Set(workRows.filter(x=>x.data?.scheme_enabled===true).map(x=>String(x.id)));
  const register=new Map();
  for(const item of marks){
   const m={id:item.id,...item.data,title:item.title},key=norm(m.mark||m.title);
   if(!register.has(key))register.set(key,[]);
   register.get(key).push(m)
  }
  for(const c of candidates){
   const key=[c.source?.documentId,c.source?.page,c.mark,c.type,c.axisX,c.axisY,
    c.endAxisX,c.endAxisY,c.z0Mm,c.z1Mm].join("|");
   if(seen.has(key))continue;
   seen.add(key);
   const mark=(register.get(norm(c.mark))||[]);
   let reason="",entry=null;
   if(!grid)reason="Не сохранена проверенная сетка осей";
   else if(c.origin!=="text_layer")reason="Марка найдена только по имени файла";
   else if(!["plan","section"].includes(c.sheetType))reason="Нужен монтажный план или разрез";
   else if(mark.length!==1)reason=mark.length?"Неоднозначная марка в ведомости":"Марка отсутствует в ведомости";
   else if(!workIds.has(String(mark[0].work_type_id)))reason="Для вида работ не включена монтажная схема";
   else if(!c.axisX||!c.axisY||!Number.isFinite(c.z0Mm)||!Number.isFinite(c.z1Mm))
    reason="Нет проверяемых осей или отметок Z";
   else if(c.type!=="column"&&(!c.endAxisX||!c.endAxisY))
    reason="Для балки или связи нет конечных осей";
   else try{
    entry=payloadFor(c,{mark:mark[0],axisX:c.axisX,axisY:c.axisY,
     endX:c.endAxisX,endY:c.endAxisY,z0Mm:c.z0Mm,z1Mm:c.z1Mm,schemeRows});
   }catch(error){reason=String(error.message||error)}
   if(reason){review.push({candidate:c,reason});continue}
   const location=[c.mark,entry.data.absolute_x_mm,entry.data.absolute_y_mm,
    entry.data.absolute_x2_mm||"",entry.data.absolute_y2_mm||"",
    entry.data.z0_mm,entry.data.z1_mm].join(":");
   if(checked.some(x=>x.location===location)){
    review.push({candidate:c,reason:"Одинаковое размещение встречается на нескольких листах; объединено в одно предложение"});
    continue
   }
   const item={candidate:c,mark:mark[0],entry,location};
   checked.push(item);
   const k=norm(c.mark);if(!byMark.has(k))byMark.set(k,[]);
   byMark.get(k).push(item)
  }
  // If proposals exceed confirmed quantity, none of that mark is selected:
  // do not silently truncate to an arbitrary number of instances.
  for(const [key,list] of byMark){
   const total=Number(list[0].mark.qty??list[0].mark.count);
   const existing=placed.filter(x=>String(x.data?.mark_id)===String(list[0].mark.id)).length;
   if(!Number.isInteger(total)||total<1||existing+list.length>total){
    for(const item of list)review.push({candidate:item.candidate,
     reason:"Несоответствие количества экземпляров ведомости. Требуется проверка"});
   }else ready.push(...list)
  }
  const difficult=pages.filter(p=>p.uncertainEncoding||!p.textAvailable||
   (["plan","section"].includes(p.sheetType)&&p.marks.length===0));
  return{ready,review,difficult,
   total:candidates.length,hasGrid:!!grid,markCount:marks.length}
 }
 function matchesDraft(c,d){
  return !!c&&!!d&&!d.stale&&
   String(c.source?.documentId)===String(d.source?.documentId)&&
   String(c.source?.sha256)===String(d.source?.sha256)&&
   Number(c.source?.page)===Number(d.source?.page)&&
   norm(c.mark)===norm(d.mark)&&String(c.type)===String(d.extractedType)
 }
 function createPage(){
  let latest=[],candidates=[],batch=null,verifiedPreview=null,
   lastOperation=null,inventory=null,draftRows=[],
   busy=false,log="",saved=0,disposeLast=null;
  const feedbackByCandidate=new Map();
  const page={
   dispose(){if(disposeLast)disposeLast();disposeLast=null},
   async render(host,opts={}){
    if(!host)return;
    const {objectId,documents=[],indexes=[],canEdit=false,askPassword,
     reviewer,onOpenPdf,onNavigate}=opts;
    page.dispose();
    latest=[];candidates=[];batch=null;verifiedPreview=null;lastOperation=null;inventory=null;draftRows=[];
    busy=false;saved=0;log="";feedbackByCandidate.clear();
    const escDoc=esc;let live=true;
    const hostWindow=opts.window||root;
    const dataRoot=opts.root||hostWindow?.irProject?.data?.forObject(objectId);
    const marksApi=dataRoot?.section?.("marks"),schemeApi=dataRoot?.section?.("scheme"),
     workApi=dataRoot?.section?.("work-types");
    const pdf=opts.pdf||hostWindow?.irProject?.aiPdf,
     mounting=opts.mounting||hostWindow?.irProject?.aiMounting;
    disposeLast=()=>{live=false};
    const status=x=>{log=x;const el=host.querySelector("[data-lite-status]");if(el)el.textContent=x};
    // Errors were previously written ONLY above a long list of drawing cards.
    // On a six-page import the click appeared to do nothing. Show feedback on
    // the exact card being edited, including the missing field if applicable.
    function candidateFeedback(index,message,state="error"){
     const item={message:String(message||""),state};feedbackByCandidate.set(index,item);
     const slot=host.querySelector('[data-lite-row="'+index+'"]');
     const node=slot?.querySelector?.("[data-lite-feedback]");
     if(node){node.textContent=item.message;node.dataset.state=item.state}
     if(state==="error")node?.scrollIntoView?.({block:"nearest",behavior:"smooth"});
    }
    const markup=()=>'<section class="ir-ai-lite">'+
     '<header class="ir-ai-review-heading"><div><h2>ИИ → Монтажная схема · быстрый режим</h2>'+
     '<p>Ведомость марок + индексированные КМ/КМД → предварительные координаты и высоты. Обычные листы без Qwen; сложные — отдельно.</p></div>'+
     '<b>Локально · без ИИ</b></header>'+
     '<div class="ir-ai-quantity-warning">Найденная марка не означает известное положение в здании. Высоты привязываются лишь к листам с одной явно обозначенной маркой. Импорт требует инженерной проверки, официальной ведомости и сохранённой сетки осей.</div>'+
     '<div class="ir-ai-lite-toolbar"><button type="button" data-lite-scan '+(busy?'disabled':'')+'>1. Построить черновик по чертежам</button>'+
     '<button type="button" data-lite-scheme>Открыть монтажную схему</button>'+ 
     (canEdit&&hostWindow.irAccess?.canEdit?.("scheme")&&hostWindow.irProject?.schemeReset?.clear?
      '<button type="button" data-lite-clear class="ir-ai-lite-clear">Очистить схему</button>':"")+
     '</div>'+
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
    const draftFor=c=>draftRows.find(d=>matchesDraft(c,d))||null;
    const draftValue=(c,name,fallback)=>{
     const saved=draftFor(c);
     return saved?.values&&Object.prototype.hasOwnProperty.call(saved.values,name)?
      saved.values[name]:fallback
    };
    function draw(){
     const slot=host.querySelector("[data-lite-results]");if(!slot)return;
     const indexesLoaded=latest.length,candidateCount=candidates.length;
     slot.innerHTML=(inventory?'<div class="ir-ai-lite-counts">'+
      '<span>Позиций ведомости: <b>'+inventory.positions+'</b></span>'+
      '<span>Экземпляров всего: <b>'+inventory.totalInstances+'</b></span>'+
      '<span>На схеме: <b>'+inventory.placed+'</b></span>'+
      '<span>Осталось: <b>'+inventory.unplaced+'</b></span></div>':"")+
      (inventory?.instances?.length?'<details class="ir-ai-lite-instances"><summary>'+
       'Экземпляры ведомости: '+inventory.instances.length+
       (inventory.instancesTruncated?' (список ограничен)':'')+'</summary>'+
       '<div class="ir-ai-lite-preview-scroll"><table><thead><tr><th>Экземпляр</th>'+
       '<th>Марка</th><th>Шифр</th><th>Статус</th></tr></thead><tbody>'+
       inventory.instances.slice(0,250).map(x=>'<tr><td>'+escDoc(x.instanceId)+'</td>'+
        '<td>'+escDoc(x.mark)+'</td><td>'+escDoc(x.projectCode)+'</td>'+
        '<td>'+escDoc(x.placementStatus==="placed"?"Размещён":"Не размещён")+
        '</td></tr>').join("")+'</tbody></table></div>'+
       '<p>Показаны первые '+Math.min(250,inventory.instances.length)+
       ' экземпляров. Необработанные позиции не считаются ошибками.</p></details>':"")+
      '<div class="ir-ai-lite-counts">'+
      '<span>Проверено листов: <b>'+indexesLoaded+'</b></span>'+
      '<span>Найдено кандидатов: <b>'+candidateCount+'</b></span>'+
      '<span>Добавлено на схему: <b>'+saved+'</b></span></div>'+
      (batch?'<section class="ir-ai-lite-batch"><h3>Черновик расстановки</h3>'+
       '<p>Ведомость: '+batch.markCount+' позиций. Можно предложить: <b>'+
       batch.ready.length+'</b>. На проверку: <b>'+batch.review.length+
       '</b>. Сложных листов: <b>'+batch.difficult.length+
       '</b>. '+(batch.hasGrid?'Сетка осей проверена.':'Сначала сохраните сетку осей в монтажной схеме.')+'</p>'+
       '<div class="ir-ai-lite-toolbar">'+
       (batch.ready.length?'<button type="button" data-lite-batch '+(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")?'disabled':'')+
        '>2. Расставить готовые марки · '+batch.ready.length+' экз.</button>':"")+
       (batch.difficult.length?'<button type="button" data-lite-qwen>Сложные листы → очередь Qwen ('+
        Math.min(batch.difficult.length,12)+')</button>':"")+'</div>'+
       '<p>Подтверждение выполняется для всего списка. Непонятные координаты не придумываются.</p>'+
       (batch.review.length?'<details><summary>Причины ручной проверки · '+
        batch.review.length+'</summary>'+
        batch.review.slice(0,60).map(x=>'<div>'+escDoc(x.candidate.mark)+
         ' · '+escDoc(x.reason)+'</div>').join("")+'</details>':"")+
       '</section>':"")+
      (verifiedPreview?'<section class="ir-ai-lite-batch ir-ai-lite-server-preview">'+
       '<h3>Предпросмотр перед расстановкой</h3>'+
       '<p>Проверено на стороне SQLite. Готово: <b>'+verifiedPreview.preview.ready.length+
       '</b>; пропущено: <b>'+verifiedPreview.preview.skipped.length+'</b>; '+
       'уже размещено: <b>'+verifiedPreview.preview.existing+'</b>.</p>'+
       '<div class="ir-ai-lite-preview-scroll"><table><thead><tr><th>Марка</th>'+
       '<th>Экземпляр</th><th>Оси</th><th>X/Y, мм</th><th>Низ Z</th><th>Верх Z</th>'+
       '<th>Источник</th></tr></thead><tbody>'+
       verifiedPreview.preview.ready.map((v,i)=>'<tr><td>'+escDoc(v.mark)+'</td>'+
        '<td>'+escDoc(v.instanceId)+'</td><td>'+escDoc(v.axes)+'</td>'+
        '<td>'+escDoc(v.xMm)+' / '+escDoc(v.yMm)+'</td>'+
        '<td>'+escDoc(v.z0Mm)+' мм</td><td>'+escDoc(v.z1Mm)+' мм</td>'+
        '<td><button type="button" data-lite-preview-source="'+i+'">'+
         'PDF №'+escDoc(v.source?.documentId)+', лист '+escDoc(v.source?.page)+
         '</button></td></tr>'
       ).join("")+'</tbody></table></div>'+
       (verifiedPreview.preview.skipped.length?'<details><summary>Пропущены ('+
        verifiedPreview.preview.skipped.length+')</summary>'+
        verifiedPreview.preview.skipped.slice(0,80).map(x=>'<div>№'+
         (x.index+1)+': '+escDoc(x.reason)+'</div>').join("")+'</details>':"")+
       '<div class="ir-ai-lite-toolbar"><button type="button" data-lite-apply>3. Применить '+
        verifiedPreview.preview.ready.length+' готовых экземпляров</button>'+
        '<button type="button" data-lite-cancel-preview>Отмена</button></div>'+
       '</section>':"")+
      (lastOperation?'<section class="ir-ai-lite-batch ir-ai-lite-last-operation">'+
       '<p>Последняя автоматическая расстановка: <b>'+
       lastOperation.created+'</b> элементов · '+escDoc(lastOperation.createdAt||"")+'</p>'+
       (canEdit?'<button type="button" data-lite-undo>Отменить последнюю расстановку</button>':"")+
       '</section>':"")+
      (latest.length?'<div class="ir-ai-lite-docs">'+latest.map(x=>
       '<div><b>'+escDoc(x.name)+' · лист '+x.page+'</b> · '+escDoc(
        {plan:"План расположения",section:"Разрез / фасад",detail:"Чертёж марки",other:"Тип не определён"}[x.sheetType])+
       (x.uncertainEncoding?' · Неоднозначная кодировка: потребуется визуальная проверка':"")+
       (x.marks.length?' · '+x.marks.length+' обозначений'+
        (x.markMentions>x.marks.length?' ('+x.markMentions+' упоминаний)':""):
        ' · Марки не найдены в читаемом тексте')+'</div>'
      ).join("")+'</div>':"")+
      (candidateCount?'<div class="ir-ai-lite-candidates">'+candidates.map((c,i)=>
       '<article class="ir-ai-lite-candidate" data-lite-row="'+i+'">'+
       '<div class="ir-ai-lite-candidate-head"><b>'+escDoc(c.mark)+' · '+escDoc(TYPE_NAMES[c.type]||"Тип требует проверки")+'</b>'+
       (batch?(batch.ready.some(x=>x.candidate===c)?
        '<span class="ir-ai-lite-grade ready">Готово к проверке</span>':
        batch.review.some(x=>x.candidate===c)?
        '<span class="ir-ai-lite-grade review">Нужна проверка</span>':
        '<span class="ir-ai-lite-grade unprocessed">Не обработано</span>'):"")+
       '<button type="button" data-lite-source="'+i+'">Открыть PDF · лист '+c.source.page+'</button></div>'+
       '<small>'+escDoc(c.source.name)+' · '+escDoc(c.warning)+'</small>'+
       (draftFor(c)?'<div class="ir-ai-lite-draft-info">Ручные исправления сохранены (ревизия №'+
        draftFor(c).revision+'). Черновик ещё не подтверждён и не размещён.</div>':"")+
       '<div class="ir-ai-lite-evidence">'+c.evidence.map(e=>'<span>'+escDoc(e)+'</span>').join("")+'</div>'+
       (c.evidenceLocations?.length?'<small>Найдены координаты '+
        c.evidenceLocations.length+' текстовых фрагментов PDF (не координаты монтажа).</small>':"")+
       '<div class="ir-ai-lite-missing">'+(
         [!c.axisX?"ось X":"",!c.axisY?"ось Y":"",
          c.z0Mm==null?"низ Z0":"",c.z1Mm==null?"верх Z1":"",
          c.type!=="column"&&!c.endAxisX?"конечная ось X":"",
          c.type!=="column"&&!c.endAxisY?"конечная ось Y":""].filter(Boolean).length?
          'Не определено по PDF: '+escDoc([!c.axisX?"ось X":"",!c.axisY?"ось Y":"",
           c.z0Mm==null?"низ Z0":"",c.z1Mm==null?"верх Z1":"",
           c.type!=="column"&&!c.endAxisX?"конечная ось X":"",
           c.type!=="column"&&!c.endAxisY?"конечная ось Y":""].filter(Boolean).join(", "))+
           '. Введите только после сверки с чертежом.':
          'Оси и отметки найдены в тексте, но их привязку к марке необходимо проверить.'
        )+'</div>'+
       '<div class="ir-ai-lite-edit">'+
       '<label>Тип<select name="type"><option value="">Выберите</option>'+
        Object.entries(TYPE_NAMES).map(([key,n])=>'<option value="'+key+'"'+
         (draftValue(c,"type",c.type)===key?' selected':'')+'>'+escDoc(n)+'</option>').join("")+'</select></label>'+
       '<label>Ось X<input name="axisX" maxlength="3" placeholder="не определена" value="'+escDoc(draftValue(c,"axisX",c.axisX))+'"></label>'+
       '<label>Ось Y<input name="axisY" maxlength="3" placeholder="не определена" value="'+escDoc(draftValue(c,"axisY",c.axisY))+'"></label>'+
       '<label>Конечная ось X<input name="endX" maxlength="3" placeholder="нужна для балки" value="'+escDoc(draftValue(c,"endAxisX",c.endAxisX||""))+'"></label>'+
       '<label>Конечная ось Y<input name="endY" maxlength="3" placeholder="нужна для балки" value="'+escDoc(draftValue(c,"endAxisY",c.endAxisY||""))+'"></label>'+
       '<label>Низ / начало, мм<input type="number" name="z0" step="1" placeholder="не определён" value="'+escDoc(draftValue(c,"z0Mm",c.z0Mm??"")??"")+'"></label>'+
       '<label>Верх / конец, мм<input type="number" name="z1" step="1" placeholder="не определён" value="'+escDoc(draftValue(c,"z1Mm",c.z1Mm??"")??"")+'"></label></div>'+
       '<div class="ir-ai-lite-actions"><button type="button" data-lite-save-draft="'+i+'" '+
       (!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")?'disabled':'')+
       '>Сохранить исправления</button><button type="button" data-lite-approve="'+i+'" '+(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")?'disabled':'')+
       '>2. Проверить и добавить на монтажную схему</button>'+
       '<small>Координаты берутся только из сохранённой сетки IR Project.</small></div>'+
       '<div class="ir-ai-lite-inline-feedback" data-lite-feedback role="status" aria-live="polite" data-state="'+
       escDoc(feedbackByCandidate.get(i)?.state||"info")+'">'+
       escDoc(feedbackByCandidate.get(i)?.message||"")+'</div></article>').join("")+
       '</div>':
       '<div class="ir-ai-doc-empty">Пока нет предложений по маркам. Для сканирования нужны читаемые текстовые слои PDF. Листы без текста требуют отдельного визуального распознавания.</div>');
     slot.querySelectorAll("[data-lite-source]").forEach(b=>b.onclick=()=>{
      const c=candidates[Number(b.dataset.liteSource)];if(c)onOpenPdf?.(c.source.documentId,c.source.page,c.evidenceLocations||[])
     });
     slot.querySelectorAll("[data-lite-approve]").forEach(b=>b.onclick=()=>{void approve(Number(b.dataset.liteApprove))});
     slot.querySelectorAll("[data-lite-save-draft]").forEach(b=>b.onclick=()=>{void saveCorrection(Number(b.dataset.liteSaveDraft))});
     const bulk=slot.querySelector?.("[data-lite-batch]");
     if(bulk)bulk.onclick=()=>void approveBatch();
     const uncertain=slot.querySelector?.("[data-lite-qwen]");
     if(uncertain)uncertain.onclick=()=>void queueHardSheets();
     const undoButton=slot.querySelector?.("[data-lite-undo]");
     if(undoButton)undoButton.onclick=()=>void undoLast();
     slot.querySelectorAll("[data-lite-preview-source]").forEach(button=>{
      button.onclick=()=>{
       const item=verifiedPreview?.preview.ready[Number(button.dataset.litePreviewSource)];
       if(item?.source)onOpenPdf?.(item.source.documentId,item.source.page,
        item.source.textRegions||[])
      }
     });
     const apply=slot.querySelector?.("[data-lite-apply]");
     if(apply)apply.onclick=()=>void applyPreview();
     const cancel=slot.querySelector?.("[data-lite-cancel-preview]");
     if(cancel)cancel.onclick=()=>{verifiedPreview=null;draw()};
    }
    async function scan(){
     if(busy)return;busy=true;status("Быстро читаем текстовые слои PDF…");
     latest=[];candidates=[];batch=null;verifiedPreview=null;feedbackByCandidate.clear();
     host.querySelector("[data-lite-scan]").disabled=true;
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
      if(live){
       if(mounting?.drafts){
        try{draftRows=await mounting.drafts(objectId)||[]}
        catch(error){status("Черновики пока недоступны: "+String(error.message||error))}
       }
       const [markRows,schemeRows,workRows]=await Promise.all([
        marksApi.list(),schemeApi.list(),workApi.list()
       ]);
       batch=buildBatchPlan({candidates,pages:latest,marks:markRows,
        schemeRows,workRows});
      }
      status("Быстрое извлечение завершено: "+latest.length+" из "+allEntries.length+
       " листов, "+candidates.length+" возможных марок. "+
       (allEntries.length>250?"За один запуск проверяются первые 250 листов; оставшиеся пока не обработаны. ":"")+
       "Неразборчивые PDF не интерпретировались.");
      draw()
     }catch(error){status("Не удалось проверить PDF: "+String(error.message||error))}
     finally{busy=false;const scanBtn=host.querySelector("[data-lite-scan]");if(scanBtn)scanBtn.disabled=false}
    }
    async function verifyEditor(){
     if(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme"))
      throw Error("У текущей роли нет разрешения на изменение монтажной схемы.");
     if(!reviewer||!askPassword)throw Error("Инженерное подтверждение недоступно");
     const role=hostWindow.irAccess?.role?.();
     if(!["admin","engineer"].includes(role))throw Error("Необходима роль инженера");
     const password=await askPassword(role);
     if(password===null)return false;
     if(!await reviewer.authorize(role,password))throw Error("Неверный пароль");
     return true
    }
    function toSafeEntry(item){
     const c=item.candidate,m=item.mark;
     return{
      markId:m.id,mark:c.mark,projectCode:m.project_code||"",
      type:c.type,origin:c.origin,sheetType:c.sheetType,
      axisX:c.axisX,axisY:c.axisY,endAxisX:c.endAxisX,endAxisY:c.endAxisY,
      z0Mm:c.z0Mm,z1Mm:c.z1Mm,offsetXmm:0,offsetYmm:0,
      evidence:c.evidence,source:{...c.source,regions:c.evidenceLocations||[]}
     }
    }
    async function approveBatch(){
     if(!batch?.ready.length||busy)return;
     busy=true;
     try{
      if(!mounting?.preview||!mounting?.apply)
       throw Error("Установите Windows Beta 1.7.222 для транзакционной расстановки");
      if(!await verifyEditor())return;
      const proposals=batch.ready.map(toSafeEntry);
      if(proposals.length>400)throw Error("В одной операции не более 400 экземпляров");
      status("Проверяем реальные экземпляры, шифры, PDF и оси…");
      const preview=await mounting.preview(objectId,proposals);
      if(!preview.ready.length)throw Error("Нет готовых экземпляров: "+
       preview.skipped.slice(0,5).map(x=>x.reason).join("; "));
      verifiedPreview={proposals,preview};
      status("Предпросмотр подготовлен: "+preview.ready.length+
       " готовых экземпляров, "+preview.skipped.length+" пропущено. "+
       "Просмотрите таблицу и подтвердите применение.");
      draw()
     }catch(error){status("Не удалось подготовить предпросмотр: "+String(error.message||error))}
     finally{busy=false}
    }
    async function applyPreview(){
     if(!verifiedPreview?.preview.ready.length||busy)return;
     busy=true;
     try{
      if(!await verifyEditor())return;
      const p=verifiedPreview;
      if(!hostWindow.confirm("Разместить "+p.preview.ready.length+
       " проверенных экземпляров одной транзакцией SQLite? "+
       "Будет создана контрольная точка для отката. "+
       "Неопределённые марки и вручную размещённые конструкции не затрагиваются."))return;
      const result=await mounting.apply(objectId,p.proposals,p.preview.token);
      saved+=result.created;
      inventory=await mounting.inventory?.(objectId)||inventory;
      lastOperation={operationId:result.operationId,created:result.created,
       createdAt:new Date().toISOString()};
      verifiedPreview=null;batch=null;
      status("Размещено: "+result.created+" экземпляров. Пропущено: "+
       result.skipped.length+". Откат доступен до ручного изменения.");
      draw()
     }catch(error){
      verifiedPreview=null;
      status("Расстановка не выполнена: "+String(error.message||error)+
       ". SQLite отменила частичные изменения. Подготовьте новый предпросмотр.");draw()
     }finally{busy=false}
    }
    async function undoLast(){
     if(!lastOperation||busy||!mounting?.undo)return;
     busy=true;
     try{
      if(!await verifyEditor())return;
      if(!hostWindow.confirm("Отменить последнюю автоматическую расстановку на "+
       lastOperation.created+" элементов? "+
       "Ведомость, PDF, ручные конструкции и предыдущие операции останутся."))return;
      const result=await mounting.undo(objectId,lastOperation.operationId);
      saved=Math.max(0,saved-result.undone);
      lastOperation=await mounting.latest?.(objectId)||null;
      inventory=await mounting.inventory?.(objectId)||inventory;
      batch=null;verifiedPreview=null;
      status("Автоматическая расстановка отменена: "+result.undone+
       " элементов. Инженерная история сохранена.");
      draw()
     }catch(error){status("Откат запрещён: "+String(error.message||error))}
     finally{busy=false}
    }
    async function queueHardSheets(){
     if(!batch?.difficult.length||busy)return;
     const queue=opts.queue||hostWindow.irProject?.aiWorkflow;
     if(!queue?.enqueue){status("Модуль очереди Qwen недоступен.");return}
     busy=true;
     try{
      if(!await verifyEditor())return;
      const toQueue=batch.difficult.slice(0,12),docsNow=await hostWindow.irProject.aiDocuments.list(objectId),
       idxNow=await pdf.list(objectId);
      const byDoc=new Map();
      for(const p of toQueue){
       const doc=docsNow.find(d=>Number(d.id)===Number(p.documentId)&&
        d.sha256===p.sha256&&d.exists);
       const idx=idxNow.find(x=>Number(x.documentId)===Number(p.documentId)&&
        x.sourceSha256===p.sha256&&x.pages.some(x=>Number(x.page)===Number(p.page)));
       if(!doc||!idx)continue;
       if(!byDoc.has(doc.id))byDoc.set(doc.id,[]);
       byDoc.get(doc.id).push(p.page)
      }
      let sent=0;
      for(const [doc,pages] of byDoc){
       const result=await queue.enqueue(objectId,doc,[...new Set(pages)]);
       sent+=Array.isArray(result?.created)?result.created.length:pages.length
      }
      status("В очередь Qwen добавлены сложные листы: "+sent+
       ". Откройте «Распознавание» и запустите очередь. Qwen пока не определяет точные координаты автоматически.");
      onNavigate?.("workflow")
     }catch(error){status("Не удалось добавить листы в очередь Qwen: "+String(error.message||error))}
     finally{busy=false}
    }
    function readCardValues(index){
     const card=host.querySelector('[data-lite-row="'+index+'"]');
     if(!card)throw Error("Карточка обновлена. Повторите распознавание.");
     const input=n=>card.querySelector?.('[name="'+n+'"]')||
      [...(card.querySelectorAll?.("[name]")||[])].find(x=>x.name===n);
     const value=n=>String(input(n)?.value??"").trim();
     const number=n=>{
      const v=value(n);
      if(!v)return null;
      const num=Number(v.replace(/−/g,"-").replace(",","."));
      if(!Number.isSafeInteger(num))throw Error("Отметка должна быть целым числом в мм");
      return num
     };
     return{type:value("type"),axisX:value("axisX"),axisY:value("axisY"),
      endAxisX:value("endX"),endAxisY:value("endY"),
      z0Mm:number("z0"),z1Mm:number("z1")}
    }
    async function saveCorrection(index){
     const c=candidates[index];if(!c)return;
     if(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")){
      candidateFeedback(index,"Нужны права инженера или администратора.");return
     }
     if(busy)return;
     if(!mounting?.saveDraft||!mounting?.drafts){
      candidateFeedback(index,"Нужна Windows Beta 1.7.223 для сохранения исправлений.");return
     }
     busy=true;
     try{
      const values=readCardValues(index);
      if(!await verifyEditor())return;
      await ensureCurrent(c);
      const prior=draftFor(c);
      const savedDraft=await mounting.saveDraft(objectId,c,values,prior?.revision||0);
      draftRows=draftRows.filter(d=>!matchesDraft(c,d));
      draftRows.push(savedDraft);
      draw();
      candidateFeedback(index,"Исправления сохранены, ревизия №"+savedDraft.revision+
       ". На схему ничего не добавлено.","success");
     }catch(error){
      const message="Не удалось сохранить исправления: "+String(error.message||error);
      status(message);candidateFeedback(index,message,"error")
     }finally{busy=false}
    }
    async function approve(index){
     const c=candidates[index],card=host.querySelector('[data-lite-row="'+index+'"]');
     if(!c||!card){status("Карточка больше неактуальна. Повторите поиск марок и высот.");return}
     if(!canEdit||!hostWindow.irAccess?.canEdit?.("scheme")){
      candidateFeedback(index,"Нужны права инженера или администратора.");return
     }
     if(busy){
      candidateFeedback(index,"Дождитесь завершения предыдущей операции и нажмите ещё раз.","info");return
     }
     // Read the INPUT VALUES in the clicked card, not the candidate extracted
     // from a PDF. The text next to a field can be a placeholder and must not
     // be mistaken for the field's current value.
     const field=n=>card.querySelector?.('[name="'+n+'"]')||
      [...(card.querySelectorAll?.("[name]")||[])].find(x=>x.name===n);
     const value=n=>String(field(n)?.value??"").trim();
     const requiredNum=n=>{
      const v=value(n),normalized=v.replace(/−/g,"-").replace(",",".");
      const number=Number(normalized);
      if(!v||!Number.isFinite(number)){
       const input=field(n);input?.focus?.();
       throw Error("Поле «"+(n==="z0"?"Низ / начало":n==="z1"?"Верх / конец":n)+
        "» пустое или не является числом. Введите отметку в миллиметрах, например −400 или 9705.")
      }
      return number
     };
     busy=true;candidateFeedback(index,"Проверяем марку, оси, высоты и ведомость…","info");
     try{
      const newKind=value("type");
      // Check the exact card's fields before async IPC so errors refer to the
      // values the engineer sees, not to values of some other mark.
      const axes={axisX:value("axisX"),axisY:value("axisY"),
       endX:value("endX"),endY:value("endY"),
       z0Mm:requiredNum("z0"),z1Mm:requiredNum("z1")};
      const [markRows,schemeRows,workRows]=await Promise.all([
       marksApi.list(),schemeApi.list(),workApi.list()
      ]);
      const names=markRows.map(r=>({id:r.id,...r.data,title:r.title})),
       matching=names.filter(m=>norm(m.mark||m.title)===norm(c.mark));
      if(matching.length!==1)throw Error("Марка "+c.mark+
       " должна иметь ровно одну позицию в ведомости; найдено: "+matching.length+".");
      const relevantWork=workRows.find(w=>String(w.id)===String(matching[0].work_type_id));
      if(!relevantWork||relevantWork.data?.scheme_enabled!==true)
       throw Error("Для марки "+c.mark+" включите монтажную схему в соответствующем виде работ.");
      const fresh={...c,type:newKind};
      payloadFor(fresh,{mark:matching[0],schemeRows,...axes});
      if(!reviewer||!askPassword)throw Error("Инженерное подтверждение недоступно");
      const role=hostWindow.irAccess?.role?.();
      if(!["admin","engineer"].includes(role))throw Error("Гость не может размещать элементы");
      const password=await askPassword(role);
      if(password===null){candidateFeedback(index,"Операция отменена.","info");return}
      if(!await reviewer.authorize(role,password))throw Error("Не подтверждена сессия инженера");
      await ensureCurrent(c);
      const currentRows=await schemeApi.list();
      const finalPayload=payloadFor(fresh,{mark:matching[0],schemeRows:currentRows,...axes});
      if(!hostWindow.confirm("Добавить проверенный элемент "+c.mark+
       " на монтажную схему? Проверьте привязки "+axes.axisX+" / "+axes.axisY+
       " и отметки "+axes.z0Mm+"…"+axes.z1Mm+" мм по исходному плану.")){
       candidateFeedback(index,"Добавление отменено.","info");return
      }
      const created=await schemeApi.create(finalPayload);
      if(!created?.id)throw Error("Программа не подтвердила сохранение элемента. Проверьте монтажную схему.");
      saved++;
      status("Марка "+c.mark+" добавлена на монтажную схему.");
      draw();candidateFeedback(index,"Добавлено: "+c.mark+" · оси "+axes.axisX+"/"+axes.axisY+
       " · "+axes.z0Mm+"…"+axes.z1Mm+" мм.","success");
     }catch(error){
      const message="Размещение не выполнено: "+String(error.message||error);
      status(message);candidateFeedback(index,message,"error")
     }finally{busy=false}
    }
    host.innerHTML=markup();
    host.querySelector("[data-lite-scan]").onclick=()=>void scan();
    host.querySelector("[data-lite-scheme]").onclick=()=>onNavigate?.("scheme");
    const clear=host.querySelector("[data-lite-clear]");
    if(clear)clear.onclick=async()=>{
     if(busy||!canEdit||!hostWindow.irAccess?.canEdit?.("scheme"))return;
     const api=hostWindow.irProject?.schemeReset;
     if(!api?.preview||!api?.clear){status("В этой установке недоступна безопасная очистка схемы.");return}
     busy=true;clear.disabled=true;
     try{
      const preview=await api.preview(objectId);
      if(!preview.count){status("Схема уже пустая. Ведомость и сетка осей сохранены.");return}
      const code=hostWindow.prompt("Будет очищена монтажная схема ВСЕГО объекта: "+
       preview.count+" размещённых конструкций (все виды работ). "+
       "PDF, оси, ведомость и инженерная история остаются. "+
       "Введите ОЧИСТИТЬ для подтверждения:");
      if(code!=="ОЧИСТИТЬ")return;
      const result=await api.clear(objectId,{
       expectedCount:preview.count,expectedFingerprint:preview.fingerprint,
       confirmation:code
      });
      status("Монтажная схема очищена: "+result.cleared+
       " элементов. PDF, оси, ведомость и история сохранены.");
     }catch(error){status("Очистка не выполнена: "+String(error.message||error))}
     finally{busy=false;clear.disabled=false}
    };
    if(mounting?.drafts){
     try{draftRows=await mounting.drafts(objectId)||[]}
     catch(error){status("Нельзя прочитать сохранённые исправления: "+String(error.message||error))}
    }
    if(mounting?.inventory){
     try{inventory=await mounting.inventory(objectId)}catch(error){
      status("Не удалось прочитать экземпляры марок: "+String(error.message||error))
     }
    }
    if(mounting?.latest){
     try{lastOperation=await mounting.latest(objectId)}catch(error){
      status("Не удалось прочитать журнал расстановки: "+String(error.message||error))
     }
    }
    draw();
    
   }
  };
  return page
 }
 const exported={createPage,extractPage,classSheet,readElevation,lengthHint,axisPair,axisSpan,axisGeometry,payloadFor,buildBatchPlan,fragmentEvidence,matchesDraft};
 if(typeof module!=="undefined"&&module.exports)module.exports=exported;
 if(root&&typeof root==="object")root.irAiSchemeLitePage=createPage()
})(typeof window!=="undefined"?window:null);
