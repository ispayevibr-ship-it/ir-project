"use strict";
/* Fast mounting-layout assistant for IR Project AI.
 * No neural model, native dependencies, or detailed fabrication 3D required.
 * Results are untrusted candidates from source-linked PDF text layers.
 * Existing confirmed scheme grid + project mark register remain authoritative.
 */
(function(root){
 const MARK=/^[КKБВBРPСCФFМM][\- ]?\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
 const TYPES=[
  ["column",/колонн[аы]|стойк[аи]|фахверк/iu],
  ["beam",/балк[аи]|ригел[ья]|прогон[аы]|распорк[аи]/iu],
  ["brace",/связ[ьи]|раскос[аы]/iu]
 ];
 const TYPE_NAMES={column:"Колонна / стойка",beam:"Балка / ригель / прогон",brace:"Связь / раскос"};
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=x=>String(x||"").trim().toLocaleUpperCase("ru-RU")
  .replace(/[−–—]/g,"-").replace(/K/g,"К").replace(/B/g,"В")
  .replace(/P/g,"Р").replace(/C/g,"С").replace(/F/g,"Ф")
  .replace(/M/g,"М").replace(/\s+/g,"");
 function classSheet(name,text){
  const s=(String(name||"")+" "+String(text||"").slice(0,2400)).toLocaleLowerCase("ru");
  if(/план\s+(?:расположения|монтажа|колонн|балок|связей)|схема\s+(?:расположения|монтажа)|монтажн.{0,12}схем/iu.test(s))return"plan";
  if(/разрез|фасад|сечение\s+по\s+оси/iu.test(s))return"section";
  if(/(?:колонна|балка|ригель|связь|прогон|стойка|фахверк)\s*[КKБВBРPСCФFМM]\s*\d/iu.test(s))return"detail";
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
  const regex=/(колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|распорк[аи]|стойк[аи]|фахверк|связ[ьи]|раскос[аы])\s*(?:марка|марки|№|поз\.?)?\s*[:\-]?\s*([КKБВBРPСCФFМM]\s*[-]?\s*\d{1,4}(?:\s*[-–—]\s*\d{1,3})?[А-ЯA-Z]?)(?![-–—\d])/giu;
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

 // One entry = one DISTINCT printed PDF symbol, not one register designation.
 // PDF coordinates are evidence of LABEL LOCATION, never erection X/Y/Z.
 // Do not deduplicate across pages, revision sets or independent drawings.
 function extractPlanInstances({raw,marks=[],documentId,sha256,page,
   region="full",widthPt,heightPt,sheetType="plan",regionBounds}={}){
  const regions={
   full:{left:0,top:0,right:1,bottom:1},
   left:{left:0,top:0,right:.5,bottom:1},
   right:{left:.5,top:0,right:1,bottom:1},
   "top-left":{left:0,top:0,right:.5,bottom:.5},
   "top-right":{left:.5,top:0,right:1,bottom:.5},
   "bottom-left":{left:0,top:.5,right:.5,bottom:1},
   "bottom-right":{left:.5,top:.5,right:1,bottom:1}
  };
  const area=regionBounds||regions[region];
  if(!area||![area.left,area.top,area.right,area.bottom].every(Number.isFinite)||
   area.left<0||area.top<0||area.right>1||area.bottom>1||
   area.left>=area.right||area.top>=area.bottom)
   throw Error("Неизвестная область чертежа");
  const pageWidth=Number(widthPt),pageHeight=Number(heightPt);
  if(region!=="full"&&(!(pageWidth>0)||!(pageHeight>0)))
   throw Error("Для выбора части листа нужен исходный размер PDF");
  const known=new Map(),ambiguities=new Set();
  for(const row of marks){
   const mark=norm(row?.data?.mark||row?.title||"");
   if(!row?.id||!MARK.test(mark))continue;
   if(known.has(mark)){known.set(mark,null);ambiguities.add(mark)}
   else known.set(mark,{mark,id:row.id,projectCode:String(row.project_code||"")})
  }
  const fragments=Array.isArray(raw?.fragments)?raw.fragments:[],
   max=Math.min(fragments.length,30000),labels=[],unregistered=new Set();
  const good=f=>f&&typeof f.text==="string"&&
   ["x","y","width","height"].every(k=>Number.isFinite(Number(f[k])))&&
   Number(f.width)>=0&&Number(f.height)>=0;
  const compact=v=>String(v||"").trim().replace(/[\s\u00a0]+/g,"")
    .replace(/[−–—]/g,"-");
  const full=/^[КKБВBРPСCФFМM]-?\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
  const prefix=/^[КKБВBРPСCФFМM]-?$/iu;
  const suffix=/^\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
  for(let i=0;i<max&&labels.length<6000;i++){
   const first=fragments[i];if(!good(first))continue;
   let word=compact(first.text),last=first,ids=[i];
   if(prefix.test(word)&&good(fragments[i+1])){
    const next=fragments[i+1],part=compact(next.text),
     gap=Number(next.x)-Number(first.x)-Number(first.width);
    if(suffix.test(part)&&gap>=-2&&gap<=10&&
     Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
     word+=part;last=next;ids.push(i+1)
    }
   }
   // A rendered Ф8 + -1 is not an occurrence of Ф8. Keep full identity.
   if(full.test(word)&&!word.includes("-")&&good(fragments[i+ids.length])){
    const next=fragments[i+ids.length],part=compact(next.text),
     gap=Number(next.x)-Number(last.x)-Number(last.width);
    if(/^-\d{1,3}$/u.test(part)&&gap>=-2&&gap<=10&&
       Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
     word+=part;last=next;ids.push(i+ids.length)
    }
   }
   if(!full.test(word))continue;
   const mark=norm(word),found=known.get(mark);
   if(!known.has(mark)){unregistered.add(mark);continue}
   // Duplicate register designations cannot be assigned to a unique mark ID.
   if(!found){ambiguities.add(mark);continue}
   const x=Math.min(Number(first.x),Number(last.x)),
    y=Math.min(Number(first.y),Number(last.y)),
    x2=Math.max(Number(first.x)+Number(first.width),
                Number(last.x)+Number(last.width)),
    y2=Math.max(Number(first.y)+Number(first.height),
                Number(last.y)+Number(last.height)),
    midX=(x+x2)/2,midY=(y+y2)/2,
    fromTop=pageHeight>0?pageHeight-midY:null;
   if(region!=="full"&&(midX<area.left*pageWidth||
      midX>area.right*pageWidth||fromTop<area.top*pageHeight||
      fromTop>area.bottom*pageHeight))continue;
   // Exact repeat glyphs in a PDF text layer do not create 2 instances.
   if(labels.some(l=>l.mark===mark&&
    Math.hypot(l.pageX-midX,l.pageYBottom-midY)<2.5))continue;
   const q=n=>Math.round(n*10)/10;
   const instanceId="pdf:"+String(documentId)+":"+String(sha256||"").slice(0,12)+
    ":p"+String(page)+":"+mark+":"+q(midX)+":"+q(midY);
   labels.push({instanceId,mark,markId:found.id,projectCode:found.projectCode,
    documentId:Number(documentId),sha256:String(sha256||""),page:Number(page),
    diagramRegion:region,sheetType,fragmentIds:ids,labelText:word,
    rectPt:{x,y,width:x2-x,height:y2-y},
    pageX:midX,pageYBottom:midY,pageYTop:fromTop,
    status:region==="full"?"needs_diagram_scope":"label_requires_geometry",
    isPhysicalInstanceConfirmed:false,exactPlacement:false,
    xMm:null,yMm:null,z0Mm:null,z1Mm:null})
  }
  const byMark=new Map();
  for(const x of labels)byMark.set(x.mark,(byMark.get(x.mark)||0)+1);
  return{labels,total:labels.length,
   byMark:[...byMark].sort((a,b)=>a[0].localeCompare(b[0],"ru")).map(
    ([mark,count])=>({mark,count})),
   ambiguousRegisterMarks:[...ambiguities],
   skippedUnknownMarks:[...unregistered].sort(),
   region,inspectedFragments:max,truncated:fragments.length>max||labels.length>=6000,
   warning:region==="full"?
    "Это надписи всего листа, включая возможные соседние планы и разрезы. Выберите отдельную схему.":
    "Отобраны надписи в области PDF. Это ещё не подтверждённые конструкции."}
 }

 function extractPage({documentId,name,kind,sha256,page,raw,uncertainEncoding=false,registeredMarks=[]}={}){
  const text=String(raw?.text||"").slice(0,24000);
  const sheetType=classSheet(name,text),
   occurrences=uncertainEncoding?[]:markMatches(text,{includeRepeated:true}),
   matches=uncertainEncoding?[]:markMatches(text);
  const fromName=(String(name||"").match(/(?:колонн[аы]|балк[аи]|ригел[ья]|прогон[аы]|связ[ьи]|КМД)[^\d]{0,14}([КKБВBРPСCФFМM]\d{1,4})/iu)||[])[1];
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

  // Bare plan symbols have no structural noun. Keep ONLY known register
  // marks, and treat text positions as unconfirmed manual-review evidence.
  if(sheetType==="plan"&&!uncertainEncoding&&registeredMarks.length){
   const known=new Map();
   for(const row of registeredMarks){
    const name=String(row?.data?.mark||row?.title||"").trim(),k=norm(name);
    if(row?.id&&name&&MARK.test(name)){
     if(known.has(k))known.set(k,null);else known.set(k,name)
    }
   }
   const fragments=Array.isArray(raw?.fragments)?raw.fragments:[],
    found=new Map(),full=/^[КKБВBРPСCФFМM]-?\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu,
    prefix=/^[КKБВBРPСCФFМM]-?$/iu,suffix=/^\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
   const compact=t=>String(t||"").trim().replace(/[\s\u00a0]+/g,"").replace(/[−–—]/g,"-");
   const good=f=>f&&typeof f.text==="string"&&
    ["x","y","width","height"].every(k=>Number.isFinite(Number(f[k])))&&
    Number(f.width)>=0&&Number(f.height)>=0;
   for(let i=0;i<Math.min(fragments.length,20000);i++){
    const first=fragments[i];if(!good(first))continue;
    let value=compact(first.text),last=first,ids=[i];
    if(prefix.test(value)&&good(fragments[i+1])){
     const next=fragments[i+1],n=compact(next.text),
      gap=Number(next.x)-Number(first.x)-Number(first.width);
     if(suffix.test(n)&&gap>=-2&&gap<=10&&
        Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
      value+=n;last=next;ids.push(i+1)
     }
    }
    // Treat a split Ф8 + -1 as Ф8-1, never as its base Ф8.
    if(full.test(value)&&!value.includes("-")&&good(fragments[i+ids.length])){
     const next=fragments[i+ids.length],part=compact(next.text),
      gap=Number(next.x)-Number(last.x)-Number(last.width);
     if(/^-[0-9]{1,3}$/u.test(part)&&gap>=-2&&gap<=10&&
        Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
      value+=part;last=next;ids.push(i+ids.length)
     }
    }
    if(!full.test(value))continue;
    const key=norm(value),mark=known.get(key);
    if(!mark||candidates.some(c=>norm(c.mark)===key))continue;
    let g=found.get(key);
    if(!g){
     if(found.size>=600)continue;
     g={mark,count:0,locations:[],points:[]};found.set(key,g)
    }
    const x=Number(first.x),y=Math.min(Number(first.y),Number(last.y)),
     x2=Math.max(x+Number(first.width),Number(last.x)+Number(last.width)),
     y2=Math.max(Number(first.y)+Number(first.height),Number(last.y)+Number(last.height));
    const cx=(x+x2)/2,cy=(y+y2)/2;
    if(g.points.some(p=>Math.hypot(p.x-cx,p.y-cy)<4))continue;
    g.points.push({x:cx,y:cy});g.count++;
    if(g.locations.length<12)g.locations.push({quote:value,fragmentIds:ids,
     rectPt:{x,y,width:x2-x,height:y2-y}})
   }
   for(const g of found.values())candidates.push({
    mark:norm(g.mark),type:"unknown",source:{
     documentId:Number(documentId),sha256:String(sha256||""),
     name:String(name||""),kind:String(kind||""),page:Number(page)},
    sheetType,axisX:"",axisY:"",endAxisX:"",endAxisY:"",
    z0Mm:null,z1Mm:null,lengthMm:null,locationConfirmed:false,
    origin:"plan_label_only",labelMentions:g.count,
    evidence:["Марка "+g.mark+" · надписей на плане: "+g.count],
    evidenceLocations:g.locations,
    warning:"Надпись найдена в PDF и подтверждена ведомостью. "+
     "Тип, место крепления и отметки Z требуют проверки."})
  }

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
   throw Error("Выберите точную марку из ведомости объекта. Она не создаётся автоматически.");
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

 // Match axis LABELS to actual long vector strokes on one original PDF sheet.
 // Returned calibration only describes page-to-grid alignment candidates.
 // No label/line evidence -> no millimetre transform and no placement.
 function detectPlanGridAxes({raw,vector,grid,region}={}){
  const reject=(reason,extra={})=>({calibrated:false,reason,
   xMatches:[],yMatches:[],...extra});
  if(!grid?.x||!grid?.y||!Array.isArray(vector?.segments))
   return reject("Сохранённая сетка или векторная геометрия недоступна");
  const width=Number(vector.widthPt),height=Number(vector.heightPt);
  if(!(width>0&&height>0)||Number(vector.rotation||0)!==0)
   return reject("Для автоматической калибровки нужен неповёрнутый векторный план");
  if(vector.stats?.truncated===true&&vector.stats?.axisEvidenceComplete!==true)
   return reject("Векторные данные листа неполные; требуется выбрать область схемы или уточнить PDF");
  const area=region||{left:0,top:0,right:1,bottom:1};
  if(![area.left,area.top,area.right,area.bottom].every(v=>
   typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1)||
   area.right-area.left<.15||area.bottom-area.top<.2)
   return reject("Выбрана некорректная область монтажного плана");
  const inside=(x,y)=>x>=width*area.left&&x<=width*area.right&&
   y>=height*area.top&&y<=height*area.bottom;
  const labels=Array.isArray(raw?.fragments)?raw.fragments:[];
  if(!labels.length)return reject("На листе нет текстовых фрагментов с обозначениями осей");
  const canon=x=>String(x||"").toLocaleUpperCase("ru-RU").trim()
   .replace(/^[№#]\s*/,"").replace(/^(?:ОСЬ|ОСИ|AXIS)\s*[:№-]?\s*/iu,"")
   .replace(/A/g,"А").replace(/B/g,"В").replace(/C/g,"С").replace(/K/g,"К")
   .replace(/M/g,"М").trim();
  const axesX=new Map([...grid.x].map(([name,mm])=>[canon(name),{name,mm}]));
  const axesY=new Map([...grid.y].map(([name,mm])=>[canon(name),{name,mm}]));
  const srcVertical=(vector.axisBands?.vertical?.length?
   vector.axisBands.vertical:vector.segments.filter(s=>s.direction==="vertical")),
   srcHorizontal=(vector.axisBands?.horizontal?.length?
   vector.axisBands.horizontal:vector.segments.filter(s=>s.direction==="horizontal"));
  const vertical=srcVertical.filter(line=>Number.isFinite(Number(line.x1))&&
   Number(line.x1)>=width*area.left&&Number(line.x1)<=width*area.right&&
   Math.abs(Number(line.y2)-Number(line.y1))>=height*(area.bottom-area.top)*.20),
   horizontal=srcHorizontal.filter(line=>Number.isFinite(Number(line.y1))&&
   Number(line.y1)>=height*area.top&&Number(line.y1)<=height*area.bottom&&
   Math.abs(Number(line.x2)-Number(line.x1))>=width*(area.right-area.left)*.20);
  const valid=labels.filter(f=>f&&typeof f.text==="string"&&
   ["x","y","width","height"].every(k=>Number.isFinite(Number(f[k])))&&
   Number(f.width)>=0&&Number(f.height)>=0&&
   inside(Number(f.x)+Number(f.width)/2,
    height-Number(f.y)-Number(f.height)/2)).slice(0,1800);
  // A dimension value printed somewhere in the middle of a drawing is NOT
  // an axis label. Require it near an endpoint of a long axis line.
  const find=(map,lines,orientation)=>{
   const found=[],conflicts=new Set();
   const tol=orientation==="vertical"?Math.max(9,Math.min(22,width*.02)):
    Math.max(9,Math.min(22,height*.02));
   const endTol=orientation==="vertical"?Math.max(24,Math.min(60,height*.07)):
    Math.max(24,Math.min(60,width*.07));
   // Axis bubbles form a label row/column. Section numbers elsewhere on
   // the same sheet must not compete with a more complete aligned row.
   const named=valid.filter(f=>map.has(canon(f.text)));
   const ordinate=f=>orientation==="vertical"?
    height-Number(f.y)-Number(f.height)/2:Number(f.x)+Number(f.width)/2;
   const rows=[];
   for(const f of [...named].sort((a,b)=>ordinate(a)-ordinate(b))){
    let row=rows.at(-1);
    if(!row||ordinate(f)-row.start>Math.max(12,Number(f.height))){
     row={start:ordinate(f),labels:[],names:new Set()};rows.push(row)
    }
    row.labels.push(f);row.names.add(canon(f.text))
   }
   rows.sort((a,b)=>b.names.size-a.names.size);
   // A second complete label row in a disjoint drawing area is another
   // plan, even when it has fewer axes. Require explicit region selection.
   if(orientation==="vertical"&&rows[0]?.names.size>=3){
    const range=row=>row.labels.map(f=>Number(f.x)+Number(f.width)/2);
    const primary=range(rows[0]);
    for(const row of rows.slice(1).filter(r=>r.names.size>=3)){
     const other=range(row);
     if(Math.max(...other)<Math.min(...primary)-tol||
        Math.min(...other)>Math.max(...primary)+tol)
      return{matches:[],ambiguous:true}
    }
   }
   // Equal coverage retains all evidence and therefore rejects conflicts.
   const selected=rows[0]?.names.size>=3&&
    (!rows[1]||rows[0].names.size>rows[1].names.size)?rows[0].labels:named;
   for(const fragment of selected){
    const text=canon(fragment.text);
    if(!map.has(text))continue;
    const x=Number(fragment.x)+Number(fragment.width)/2,
      y=height-(Number(fragment.y)+Number(fragment.height)/2);
    const choices=[];
    for(const line of lines){
     const p=orientation==="vertical"?Number(line.x1):Number(line.y1);
     const perpendicular=Math.abs((orientation==="vertical"?x:y)-p);
     const start=orientation==="vertical"?Number(line.y1):Number(line.x1);
     const stop=orientation==="vertical"?Number(line.y2):Number(line.x2);
     const along=orientation==="vertical"?y:x;
     const endpoint=Math.min(Math.abs(along-start),Math.abs(along-stop));
     if(perpendicular<=tol&&endpoint<=endTol)
      choices.push({pagePt:p,perpendicular,endpoint,
       score:perpendicular+endpoint*.18});
    }
    choices.sort((a,b)=>a.score-b.score);
    if(!choices.length)continue;
    if(choices[1]&&Math.abs(choices[1].pagePt-choices[0].pagePt)>5&&
       choices[1].score-choices[0].score<2.5){
     conflicts.add(text);continue
    }
    found.push({...map.get(text),pagePt:choices[0].pagePt,
     fragmentText:fragment.text,fragmentCenter:{x,y},score:choices[0].score})
   }
   const byName=new Map();
   for(const item of found){
    if(conflicts.has(canon(item.name)))continue;
    const key=canon(item.name),old=byName.get(key);
    if(old&&Math.abs(old.pagePt-item.pagePt)>3){
     conflicts.add(key);byName.delete(key);continue
    }
    if(!old||item.score<old.score)byName.set(key,item)
   }
   for(const name of conflicts)byName.delete(name);
   const list=[...byName.values()].sort((a,b)=>a.mm-b.mm);
   const used=new Set();
   for(const item of list){
    const p=Math.round(item.pagePt);
    if(used.has(p))return{matches:[],ambiguous:true};
    used.add(p)
   }
   return{matches:list,ambiguous:conflicts.size>0}
  };
  const x=find(axesX,vertical,"vertical"),
    y=find(axesY,horizontal,"horizontal");
  const summary={xMatches:x.matches,yMatches:y.matches,region:area,
   xTotal:grid.axesX?.length??grid.x.size,yTotal:grid.axesY?.length??grid.y.size,
   vectorLines:{vertical:vertical.length,horizontal:horizontal.length}};
  if(x.matches.length<3||y.matches.length<3)
   return reject("Для калибровки нужно не менее трёх подписанных осей каждого направления",summary);
  if(x.ambiguous||y.ambiguous)
   return reject("Есть неоднозначные совпадения подписей с линиями осей",summary);
  const fit=items=>{
   const n=items.length,meanMm=items.reduce((sum,a)=>sum+a.mm,0)/n,
    meanPt=items.reduce((sum,a)=>sum+a.pagePt,0)/n,
    spread=items.reduce((sum,a)=>sum+(a.mm-meanMm)**2,0);
   if(spread<=0)return null;
   const scale=items.reduce((sum,a)=>sum+(a.mm-meanMm)*(a.pagePt-meanPt),0)/spread,
    offset=meanPt-scale*meanMm;
   const residuals=items.map(a=>Math.abs(a.pagePt-(offset+scale*a.mm)));
   return{scale,offset,residualPt:Math.max(...residuals)}
  };
  const fx=fit(x.matches),fy=fit(y.matches);
  if(!fx||!fy||fx.scale<=0||fy.scale>=0)
   return reject("Ориентация осей на листе отличается от 1–6 слева направо и А–Л снизу вверх",summary);
  const rate=Math.abs(Math.abs(fx.scale)-Math.abs(fy.scale))/
   Math.max(Math.abs(fx.scale),Math.abs(fy.scale));
  if(rate>.07||fx.residualPt>3||fy.residualPt>3)
   return reject("Масштаб осей или размерные шаги PDF не совпадают с сохранённой сеткой",{
    ...summary,fitX:fx,fitY:fy});
  // Geometry evidence is sufficient to propose a transform for review;
  // this is NOT authorisation to infer mark locations or auto-place objects.
  return{calibrated:true,reviewRequired:true,reason:"Привязки осей предварительно согласуются с сеткой. Нужна проверка чертежа",
   ...summary,fitX:fx,fitY:fy,scaleMismatch:rate,
   transform:{x:{ptAtZero:fx.offset,ptPerMm:fx.scale},
    y:{ptAtZero:fy.offset,ptPerMm:fy.scale}}}
 }


 // A PDF sheet may contain two independent KMD drawings OR one continuous
 // grid across its midpoint. Repeated X axis designations separate the cases.
 function selectPlanRegion({selected="auto",calibrate}={}){
  const regions=["full","left","right","top-left","top-right",
   "bottom-left","bottom-right"],chosen=regions.includes(selected)?selected:"auto";
  if(typeof calibrate!=="function")throw Error("Нет функции проверки осей");
  const left=calibrate("left"),right=calibrate("right"),
   available={left:left?.calibrated===true,right:right?.calibrated===true};
  const axes=a=>new Set((a?.xMatches||[]).map(x=>String(x.name||""))
   .filter(Boolean));
  const xl=axes(left),xr=axes(right),
   common=[...xl].filter(x=>xr.has(x));
  // The SAME numbered axis appears in each horizontally separated plan.
  // If axis names are disjoint, the page may be one continuous drawing.
  const multiplePlans=available.left&&available.right&&common.length>=2;
  if(chosen!=="auto"&&chosen!=="full")
   return{analysis:calibrate(chosen),regionName:chosen,
    multiplePlans,available,duplicateAxes:common};
  if(multiplePlans){
   const reason="Обнаружены две схемы с повторяющимися осями ("+
    common.join(", ")+"). Выберите левую или правую область. "+
    "Анализ всего листа остановлен, чтобы не смешивать конструкции.";
   return{analysis:{calibrated:false,reason,xMatches:[],yMatches:[],
     region:{left:0,top:0,right:1,bottom:1}},
    regionName:"multiple",multiplePlans,available,duplicateAxes:common}
  }
  const full=calibrate("full");
  if(chosen==="full")
   return{analysis:full,regionName:"full",multiplePlans,available};
  if(available.left!==available.right){
   const regionName=available.left?"left":"right";
   return{analysis:regionName==="left"?left:right,regionName,multiplePlans,available}
  }
  if(full?.calibrated)return{analysis:full,regionName:"full",multiplePlans,available};
  if(available.left||available.right){
   const regionName=available.left?"left":"right";
   return{analysis:available.left?left:right,regionName,multiplePlans,available}
  }
  const score=x=>(x?.xMatches?.length||0)+(x?.yMatches?.length||0);
  const regionName=score(left)>=score(right)?"left":"right";
  return{analysis:regionName==="left"?left:right,regionName,multiplePlans,available}
 }

 // The centre of a PDF label can identify its GRID CELL, but never the
 // attachment point of a steel member. Do not feed these numbers to payloadFor.
 function locateMarkLabelZones({candidates=[],analysis,grid,heightPt}={}){
  if(!analysis?.calibrated||!grid?.x||!grid?.y||!(Number(heightPt)>0))
   return[];
  const locate=(map,mm)=>{
   const axes=[...map].map(([name,value])=>({name,mm:value}))
    .sort((a,b)=>a.mm-b.mm);
   if(!Number.isFinite(mm)||mm<axes[0].mm||mm>axes.at(-1).mm)return null;
   for(let i=0;i<axes.length-1;i++){
    if(mm>=axes[i].mm&&mm<=axes[i+1].mm)
     return{start:axes[i].name,end:axes[i+1].name}
   }
   return null
  };
  const fX=analysis.fitX,fY=analysis.fitY;
  if(!fX||!fY||!Number.isFinite(fX.scale)||!Number.isFinite(fY.scale)||
    fX.scale===0||fY.scale===0)return[];
  const result=[];
  for(const c of candidates.slice(0,80)){
   const textBoxes=(c.evidenceLocations||[]).filter(v=>
    v?.rectPt&&Number.isFinite(Number(v.rectPt.x))&&
    Number.isFinite(Number(v.rectPt.y))&&
    Number.isFinite(Number(v.rectPt.width))&&
    Number.isFinite(Number(v.rectPt.height))&&
    String(v.quote||"").includes(c.mark));
   if(textBoxes.length!==1)continue;
   const box=textBoxes[0].rectPt;
   // Fragment coordinates are bottom-left PDF points. Axis line viewport
   // coordinates are top-left. Same transform is only supported at rotation 0.
   const pageX=Number(box.x)+Number(box.width)/2,
     pageY=Number(heightPt)-Number(box.y)-Number(box.height)/2;
   const mmX=(pageX-fX.offset)/fX.scale,
     mmY=(pageY-fY.offset)/fY.scale;
   const alongX=locate(grid.x,mmX),alongY=locate(grid.y,mmY);
   if(!alongX||!alongY)continue;
   result.push({mark:c.mark,source:c.source,axesX:alongX,axesY:alongY,
    sourceText:textBoxes[0].quote,
    status:"label_zone_only",exactPlacement:false})
  }
  return result
 }

 // A PDF text label identifies its own location, NOT a physical
 // construction attachment point. Only marks in the saved register pass.
 function detectPlanRegisterLabels({raw,analysis,grid,marks=[],widthPt,heightPt}={}){
  const empty=reason=>({labels:[],ambiguous:0,inspected:0,reason});
  if(!analysis?.calibrated||!analysis.fitX||!analysis.fitY||
     !grid?.x||!grid?.y||!(widthPt>0)||!(heightPt>0))
   return empty("Необходимы сохранённая сетка и калибровка осей");
  const fx=analysis.fitX,fy=analysis.fitY;
  if(!Number.isFinite(fx.scale)||!Number.isFinite(fy.scale)||
     fx.scale<=0||fy.scale>=0||
     !Number.isFinite(fx.offset)||!Number.isFinite(fy.offset))
   return empty("Недостоверное преобразование координат");
  const region=analysis.region||{left:0,top:0,right:1,bottom:1};
  if(![region.left,region.top,region.right,region.bottom].every(
      n=>Number.isFinite(n)&&n>=0&&n<=1)||
     region.right<=region.left||region.bottom<=region.top)
   return empty("Некорректная область чертежа");
  const register=new Map();
  for(const row of marks){
   const mark=String(row?.data?.mark||row?.title||"").trim(),
    id=row?.id,key=norm(mark);
   if(!mark||!id||!MARK.test(mark))continue;
   // If the register has two rows for the same designation, neither
   // is safe to select automatically.
   if(register.has(key))register.set(key,null);
   else register.set(key,{id,mark})
  }
  const fragments=Array.isArray(raw?.fragments)?raw.fragments:[];
  const valid=f=>f&&typeof f.text==="string"&&
   ["x","y","width","height"].every(k=>Number.isFinite(Number(f[k])))&&
   Number(f.width)>=0&&Number(f.height)>=0;
  const compact=v=>String(v||"").trim().replace(/[\s\u00a0]+/g,"").replace(/[−–—]/g,"-");
  const labelRx=/^[КKБВBРPСCФFМM]-?\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
  const prefixRx=/^[КKБВBРPСCФFМM]-?$/iu;
  const suffixRx=/^\d{1,4}(?:-\d{1,3})?[А-ЯA-Z]?$/iu;
  const interval=(map,mm)=>{
   const a=[...map].map(([name,value])=>({name,mm:Number(value)}))
    .sort((x,y)=>x.mm-y.mm);
   if(a.length<2||mm<a[0].mm||mm>a.at(-1).mm)return null;
   for(let i=0;i<a.length-1;i++)if(mm<=a[i+1].mm)
    return{start:a[i].name,end:a[i+1].name};
   return null
  };
  const labels=[],ambiguous=new Set();
  for(let i=0;i<Math.min(fragments.length,20000);i++){
   const first=fragments[i];if(!valid(first))continue;
   let label=compact(first.text),last=first,ids=[i];
   // Some PDFs split "К62" into neighbouring "К" + "62" glyph runs.
   if(prefixRx.test(label)&&valid(fragments[i+1])){
    const next=fragments[i+1],ntext=compact(next.text),
     gap=Number(next.x)-Number(first.x)-Number(first.width);
    if(suffixRx.test(ntext)&&gap>=-2&&gap<=10&&
       Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
     label+=ntext;last=next;ids.push(i+1)
    }
   }
   // A suffix not in the register cannot be reduced to the base mark.
   if(labelRx.test(label)&&!label.includes("-")&&valid(fragments[i+ids.length])){
    const next=fragments[i+ids.length],part=compact(next.text),
     gap=Number(next.x)-Number(last.x)-Number(last.width);
    if(/^-[0-9]{1,3}$/u.test(part)&&gap>=-2&&gap<=10&&
       Math.abs(Number(next.y)-Number(first.y))<=Math.max(3,Number(first.height)*.4)){
     label+=part;last=next;ids.push(i+ids.length)
    }
   }
   if(!labelRx.test(label))continue;
   const normalized=norm(label);
   if(!register.has(normalized))continue;
   const mark=register.get(normalized);
   if(!mark){ambiguous.add(normalized);continue}
   const x1=Number(first.x),y1=Math.min(Number(first.y),Number(last.y)),
    x2=Math.max(Number(first.x)+Number(first.width),Number(last.x)+Number(last.width)),
    y2=Math.max(Number(first.y)+Number(first.height),Number(last.y)+Number(last.height));
   const pageX=(x1+x2)/2,pageY=Number(heightPt)-(y1+y2)/2;
   if(pageX<widthPt*region.left||pageX>widthPt*region.right||
      pageY<heightPt*region.top||pageY>heightPt*region.bottom)continue;
   const mmX=(pageX-fx.offset)/fx.scale,mmY=(pageY-fy.offset)/fy.scale;
   if(!Number.isFinite(mmX)||!Number.isFinite(mmY))continue;
   const axesX=interval(grid.x,mmX),axesY=interval(grid.y,mmY);
   // Text may be outside the outermost axes while still describing a
   // member inside the selected KMD drawing. Preserve the observed label,
   // but NEVER infer its grid cell or physical placement.
   const gridCellKnown=Boolean(axesX&&axesY);
   // A duplicated text glyph is not a second construction instance.
   // Separate printed labels are retained without inferring quantity.
   if(labels.some(old=>old.markId===mark.id&&
      Math.hypot(old.pageX-pageX,old.pageY-pageY)<4))continue;
   labels.push({mark:mark.mark,markId:mark.id,labelText:label,
    axesX:axesX||{start:"?",end:"?"},axesY:axesY||{start:"?",end:"?"},
    gridCellKnown,labelXmm:Math.round(mmX),labelYmm:Math.round(mmY),
    pageX,pageY,fragmentIds:ids,
    rectPt:{x:x1,y:y1,width:x2-x1,height:y2-y1},
    status:gridCellKnown?"label_only_requires_review":"label_outside_grid_requires_review",
    exactPlacement:false});
   if(labels.length>=1000)break
  }
  return{labels,ambiguous:ambiguous.size,inspected:Math.min(fragments.length,20000),
   outsideGrid:labels.filter(x=>!x.gridCellKnown).length,
   reason:labels.length?"Надписи найдены. Точки крепления и отметки Z не определены.":
    "В выбранной области не найдены отдельные надписи марок из ведомости."}
 }


 // Read-only, bounded candidate intersections from CONFIRMED PDF axis strokes.
 // A nearest intersection is only a review hint, never a steel attachment point
 // and never an authorisation for automatic scheme placement.
 // Match registered PDF labels to observable leader strokes and axis crossings.
 // Pure read-only evidence: a PDF line still does not prove a steel member.
 function findAxisNodeCandidates({labels=[],analysis,grid,vector}={}){
  const output={suggested:[],nearby:[],review:[],
   total:Math.min(labels.length,1000),status:"review_only"};
  const refuse=(code,reason)=>{for(const label of labels.slice(0,1000))
   output.review.push({label,reasonCode:code,reason});return output};
  if(!analysis?.calibrated||!grid?.x||!grid?.y||
     !Array.isArray(analysis.xMatches)||!Array.isArray(analysis.yMatches))
   return refuse("uncalibrated","Сетка и векторные оси не откалиброваны");
  if(!vector||!(Number(vector.widthPt)>0)||!(Number(vector.heightPt)>0)||
      Number(vector.rotation||0)!==0||
      vector.stats?.truncated===true&&vector.stats?.axisEvidenceComplete!==true)
   return refuse("incomplete_vector","Геометрия PDF неполная или лист повёрнут");
  const xx=analysis.xMatches,yy=analysis.yMatches;
  if(xx.length<3||yy.length<3||xx.length>100||yy.length>100)
   return refuse("axis_count","Недостаточно осей или слишком крупный план");
  const region=analysis.region||{left:0,top:0,right:1,bottom:1},
   W=Number(vector.widthPt),H=Number(vector.heightPt);
  const inArea=(x,y)=>x>=W*region.left&&x<=W*region.right&&
   y>=H*region.top&&y<=H*region.bottom;
  const segments=Array.isArray(vector.segments)?vector.segments:[],
   vertical=(vector.axisBands?.vertical?.length?vector.axisBands.vertical:
    segments.filter(x=>x.direction==="vertical")),
   horizontal=(vector.axisBands?.horizontal?.length?vector.axisBands.horizontal:
    segments.filter(x=>x.direction==="horizontal"));
  const support=(lines,direction,x,y)=>lines.some(line=>{
   const point=direction==="vertical"?Number(line.x1):Number(line.y1),
    expected=direction==="vertical"?x:y,
    along=direction==="vertical"?y:x,
    from=direction==="vertical"?Number(line.y1):Number(line.x1),
    to=direction==="vertical"?Number(line.y2):Number(line.x2);
   return [point,from,to].every(Number.isFinite)&&
    Math.abs(point-expected)<=2.5&&
    along>=Math.min(from,to)-2.5&&along<=Math.max(from,to)+2.5
  });
  const axisSteps=arr=>arr.slice(1).map((a,i)=>
    Math.abs(Number(a.pagePt)-Number(arr[i].pagePt)))
   .filter(n=>Number.isFinite(n)&&n>3);
  const steps=[...axisSteps(xx),...axisSteps(yy)];
  if(!steps.length)return refuse("axis_spacing","Не удалось оценить шаг осей");
  // Search radius is a bounded screen-space proximity, never a mm tolerance.
  const radiusPt=Math.max(9,Math.min(75,Math.min(...steps)*.60)),nodes=[];
  for(const x of xx)for(const y of yy){
   if(nodes.length>5000)return refuse("too_many_nodes","Слишком много пересечений");
   const xp=Number(x.pagePt),yp=Number(y.pagePt),
    xm=grid.x.get(String(x.name)),ym=grid.y.get(String(y.name));
   if(![xp,yp,xm,ym].every(Number.isFinite)||!inArea(xp,yp))continue;
   if(!support(vertical,"vertical",xp,yp)||
      !support(horizontal,"horizontal",xp,yp))continue;
   nodes.push({axisX:String(x.name),axisY:String(y.name),
    nodeXmm:xm,nodeYmm:ym,pageX:xp,pageY:yp})
  }
  if(!nodes.length)return refuse("no_vector_crossing",
   "Нет подтверждённых пересечений двух векторных линий");
  // A marked point can be linked by a short painted leader terminating at
  // the actual text rectangle AND at the vector axis crossing. A bare nearby
  // glyph, two grid strokes, or an axis stroke itself are not leaders.
  const labelDistance=(label,p)=>{
   const b=label.rectPt;
   if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite))
    return Math.hypot(p.x-Number(label.pageX),p.y-Number(label.pageY));
   const left=Number(b.x),right=left+Number(b.width),
    top=H-Number(b.y)-Number(b.height),bottom=H-Number(b.y);
   return Math.hypot(Math.max(left-p.x,0,p.x-right),
    Math.max(top-p.y,0,p.y-bottom))
  };
  const isAxisStroke=seg=>{
   const ax=xx.some(a=>Math.abs(seg.x1-Number(a.pagePt))<2.5&&
    Math.abs(seg.x2-Number(a.pagePt))<2.5),
    ay=yy.some(a=>Math.abs(seg.y1-Number(a.pagePt))<2.5&&
    Math.abs(seg.y2-Number(a.pagePt))<2.5);
   return ax||ay
  };
  const leaders=segments.filter(seg=>seg&&[seg.x1,seg.y1,seg.x2,seg.y2]
   .every(Number.isFinite)&&
   Math.hypot(seg.x2-seg.x1,seg.y2-seg.y1)>=8&&
   Math.hypot(seg.x2-seg.x1,seg.y2-seg.y1)<=radiusPt*1.6&&
   !isAxisStroke(seg)&&
   inArea(seg.x1,seg.y1)&&inArea(seg.x2,seg.y2));
  const directLeader=(label,node)=>{
   const matched=[];
   for(const seg of leaders){
    const a={x:Number(seg.x1),y:Number(seg.y1)},
     b={x:Number(seg.x2),y:Number(seg.y2)},
     atNode=p=>Math.hypot(p.x-node.pageX,p.y-node.pageY)<=2.5;
    if(labelDistance(label,a)<=2&&atNode(b)||
       labelDistance(label,b)<=2&&atNode(a)){
     matched.push({x1:seg.x1,y1:seg.y1,x2:seg.x2,y2:seg.y2})
     if(matched.length>=3)break
    }
   }
   return matched
  };
  for(const label of labels.slice(0,1000)){
   const x=Number(label.pageX),y=Number(label.pageY);
   if(!Number.isFinite(x)||!Number.isFinite(y)||!inArea(x,y)){
    output.review.push({label,reasonCode:"outside_region",
     reason:"Надпись вне выбранного плана"});continue
   }
   const nearest=nodes.map(node=>({node,distancePt:Math.hypot(
     node.pageX-x,node.pageY-y)})).sort((a,b)=>a.distancePt-b.distancePt).slice(0,2);
   if(!nearest[0]||nearest[0].distancePt>radiusPt){
    output.review.push({label,reasonCode:"far_from_node",
     reason:"Рядом с надписью нет подтверждённого узла осей"});continue
   }
   if(nearest[1]&&nearest[1].distancePt<=radiusPt&&
     nearest[1].distancePt-nearest[0].distancePt<Math.max(5,radiusPt*.22)){
    output.review.push({label,reasonCode:"ambiguous_neighbor",
     reason:"Несколько узлов осей примерно одинаково близки к надписи"});continue
   }
   const n=nearest[0].node;
   const item={label,mark:label.mark,markId:label.markId,
    axisX:n.axisX,axisY:n.axisY,nodeXmm:n.nodeXmm,nodeYmm:n.nodeYmm,
    offsetFromLabelMm:Math.round(Math.hypot(
     n.nodeXmm-label.labelXmm,n.nodeYmm-label.labelYmm)),
    distancePt:Math.round(nearest[0].distancePt*100)/100,
    status:"proximity_only",exactPlacement:false};
   const joined=directLeader(label,n);
   if(!joined.length){
    output.nearby.push(item);
    output.review.push({label,reasonCode:"no_leader",
     reason:"Узел близко, но нет графической линии от надписи к узлу"});continue
   }
   output.suggested.push({...item,status:"leader_linked_unverified",
    evidence:{type:"line_from_label_to_axis_crossing",segments:joined},
    reason:"Найдена графическая линия к узлу; принадлежность конструкции требует проверки"})
  }
  const byNode=new Map();
  for(const item of output.suggested){
   const key=item.axisX+"|"+item.axisY;
   if(!byNode.has(key))byNode.set(key,[]);
   byNode.get(key).push(item)
  }
  // Many distinct designations at one crossing cannot be treated as
  // repeated instances of one column or as one accurate position.
  for(const [nodeKey,items] of byNode)if(items.length>1){
   for(const item of items){
    output.review.push({label:item.label,reasonCode:"node_collision",
     reason:"Несколько марок имеют графическую связь с узлом "+nodeKey});
    output.nearby.push({...item,status:"multiple_leaders_same_node"})
   }
   output.suggested=output.suggested.filter(item=>!items.includes(item))
  }
  output.candidatesWithObservedCrossing=nodes.length;
  output.reviewSummary=Object.entries(output.review.reduce((acc,x)=>{
   acc[x.reasonCode]=(acc[x.reasonCode]||0)+1;return acc
  },{})).sort((a,b)=>b[1]-a[1]).map(([code,count])=>({code,count}));
  return output
 }


 // Search real painted vector outlines around registered plan labels.
 // Two independent parallel strokes can be a possible member outline,
 // but also a wall, dimension chain or other symbol. NEVER identify it as
 // a confirmed steel member or infer a 3D placement from these alone.
 function findPlanMemberStrokes({labels=[],analysis,grid,vector}={}){
  const out={candidates:[],alternatives:[],singleStrokes:[],review:[],inspected:0,
   limited:false,status:"review_only"};
  const deny=(reasonCode,reason)=>{for(const label of labels.slice(0,250))
   out.review.push({label,reasonCode,reason});return out};
  if(!analysis?.calibrated||!analysis.fitX||!analysis.fitY||!grid?.x||!grid?.y)
   return deny("uncalibrated","Требуется подтверждённая калибровка осей");
  if(!Array.isArray(vector?.segments)||!(vector.widthPt>0)||!(vector.heightPt>0)||
    Number(vector.rotation||0)!==0||
    vector.stats?.truncated===true&&vector.stats?.axisEvidenceComplete!==true)
   return deny("incomplete_geometry","Векторные данные неполные или PDF повёрнут");
  const fx=analysis.fitX,fy=analysis.fitY;
  if(!Number.isFinite(fx.scale)||!Number.isFinite(fy.scale)||
   fx.scale<=0||fy.scale>=0)return deny("invalid_transform","Масштаб сетки недостоверен");
  const width=Number(vector.widthPt),height=Number(vector.heightPt),
   region=analysis.region||{left:0,top:0,right:1,bottom:1};
  const within=(x,y)=>x>=width*region.left&&x<=width*region.right&&
   y>=height*region.top&&y<=height*region.bottom;
  const axisX=(analysis.xMatches||[]).map(a=>Number(a.pagePt)),
   axisY=(analysis.yMatches||[]).map(a=>Number(a.pagePt));
  const mm=(pt,fit)=>Math.round((pt-fit.offset)/fit.scale);
  // Spatial PDF detail evidence retains short local outlines that the
  // legacy longest-strokes axis preview can omit.
  const localized=Array.isArray(vector.detailSegments),
   rawStrokes=localized?vector.detailSegments:vector.segments;
  // An incomplete sample cannot establish that the nearest contour is unique.
  // Retain the label for review rather than returning a misleading best match.
  if(localized&&(vector.stats?.detailSampleIncomplete===true||
    rawStrokes.length>14400)||!localized&&
    (vector.stats?.truncated===true||rawStrokes.length>2400))
   return deny("incomplete_geometry",
    "Неполная выборка линий PDF: контуры требуют повторного анализа");
  out.sampling=localized?"local_tiles_short_medium_long":"longest_only_legacy";
  out.availableStrokes=rawStrokes.length;
  const sqDist=(x1,y1,x2,y2)=>(x1-x2)**2+(y1-y2)**2;
  const pointToSegment=(x,y,seg)=>{
   const dx=seg.x2-seg.x1,dy=seg.y2-seg.y1,den=dx*dx+dy*dy;
   if(!den)return Infinity;
   const t=Math.max(0,Math.min(1,((x-seg.x1)*dx+(y-seg.y1)*dy)/den));
   return Math.hypot(x-(seg.x1+t*dx),y-(seg.y1+t*dy))
  };
  const validSegment=seg=>{
   if(!seg||![seg.x1,seg.y1,seg.x2,seg.y2].every(Number.isFinite))return false;
   const len=Math.hypot(seg.x2-seg.x1,seg.y2-seg.y1);
   if(len<4||len>Math.max(width,height)*1.1||
     !within(seg.x1,seg.y1)||!within(seg.x2,seg.y2))return false;
   // Full or fragmented grid axes are not member silhouettes.
   const alignedX=Math.abs(seg.x2-seg.x1)<=2&&
    axisX.some(v=>Math.abs((seg.x1+seg.x2)/2-v)<=3);
   const alignedY=Math.abs(seg.y2-seg.y1)<=2&&
    axisY.some(v=>Math.abs((seg.y1+seg.y2)/2-v)<=3);
   return !alignedX&&!alignedY
  };
  const strokes=rawStrokes.slice(0,14400).filter(validSegment).map((seg,i)=>{
   const dx=seg.x2-seg.x1,dy=seg.y2-seg.y1,
    length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length;
   return{...seg,key:i,length,ux,uy}
  });
  out.processedLabels=Math.min(labels.length,250);
  out.inspected=strokes.length;
  out.limited=localized?vector.stats?.detailSampleIncomplete===true||
   rawStrokes.length>14400:vector.stats?.truncated===true||
   rawStrokes.length>2400;
  const ordered=(seg,dir)=>{
   const dot=seg.ux*dir.ux+seg.uy*dir.uy;
   return dot>=0?[[seg.x1,seg.y1],[seg.x2,seg.y2]]:
    [[seg.x2,seg.y2],[seg.x1,seg.y1]]
  };
  const comparePair=(a,b)=>{
   const cos=Math.abs(a.ux*b.ux+a.uy*b.uy);
   if(cos<.999||Math.abs(a.length-b.length)>Math.max(12,Math.max(a.length,b.length)*.20))
    return null;
   const [a0,a1]=ordered(a,a),[b0,b1]=ordered(b,a);
   // Perpendicular spacing between plausible outline edges in PAGE points.
   const perpendicular=Math.abs((b0[0]-a0[0])*a.uy-
    (b0[1]-a0[1])*a.ux);
   if(perpendicular<.7||perpendicular>10)return null;
   const startShift=Math.hypot(a0[0]-b0[0],a0[1]-b0[1]);
   const endShift=Math.hypot(a1[0]-b1[0],a1[1]-b1[1]);
   if(startShift>Math.max(13,a.length*.23)||
      endShift>Math.max(13,a.length*.23))return null;
   const x1=(a0[0]+b0[0])/2,y1=(a0[1]+b0[1])/2,
    x2=(a1[0]+b1[0])/2,y2=(a1[1]+b1[1])/2;
   return{page:{x1,y1,x2,y2},
    lineMm:{x1:mm(x1,fx),y1:mm(y1,fy),x2:mm(x2,fx),y2:mm(y2,fy)},
    gapPt:Math.round(perpendicular*100)/100,
    strokesPt:[a,b].map(stroke=>({
     x1:stroke.x1,y1:stroke.y1,x2:stroke.x2,y2:stroke.y2})),
    strokeKeys:[a.key,b.key].sort((x,y)=>x-y).join(":")}
  };
  for(const label of labels.slice(0,250)){
   const x=Number(label.pageX),y=Number(label.pageY);
   if(!Number.isFinite(x)||!Number.isFinite(y)||!within(x,y)){
    out.review.push({label,reasonCode:"outside_plan",
     reason:"Надпись находится вне выбранного плана"});continue
   }
   // Candidate search is local to each PDF label: bounded and offline.
   const closest=strokes.map(seg=>({seg,d:pointToSegment(x,y,seg)}))
    .filter(item=>item.d<=24).sort((a,b)=>a.d-b.d).slice(0,70);
   const possible=[];
   for(let i=0;i<closest.length;i++)for(let j=i+1;j<closest.length;j++){
    const a=closest[i].seg,b=closest[j].seg,shape=comparePair(a,b);
    if(!shape)continue;
    const distance=pointToSegment(x,y,shape.page);
    if(distance>24)continue;
    possible.push({...shape,distance,score:distance+shape.gapPt*.08})
   }
   // Duplicated PDF paint calls can form identical outlines. Compare
   // geometry before deciding that several outlines compete for one label.
   possible.sort((a,b)=>a.score-b.score);
   const distinct=[];
   const geomEqual=(a,b)=>{
    const p=a.page,q=b.page;
    const direct=Math.hypot(p.x1-q.x1,p.y1-q.y1)+
     Math.hypot(p.x2-q.x2,p.y2-q.y2);
    const reverse=Math.hypot(p.x1-q.x2,p.y1-q.y2)+
     Math.hypot(p.x2-q.x1,p.y2-q.y1);
    return Math.min(direct,reverse)<=.8&&Math.abs(a.gapPt-b.gapPt)<=.35
   };
   for(const item of possible)if(!distinct.some(old=>geomEqual(old,item)))
    distinct.push(item);
   if(!possible.length){
    if(closest.length){
     const first=closest[0],p=first.seg;
     out.singleStrokes.push({label,mark:label.mark,markId:label.markId,
      lineMm:{x1:mm(p.x1,fx),y1:mm(p.y1,fy),
       x2:mm(p.x2,fx),y2:mm(p.y2,fy)},
      distancePt:Math.round(first.d*10)/10,
      status:"single_stroke_only",exactPlacement:false})
     out.review.push({label,reasonCode:"single_stroke",
      reason:"Поблизости есть отдельные линии, но парный контур не подтверждён"})
    }else out.review.push({label,reasonCode:"no_strokes",
     reason:"Рядом с надписью не найдено подходящих векторных линий"});
    continue
   }
   if(distinct[1]&&distinct[1].score-distinct[0].score<=2){
    out.alternatives.push({label,mark:label.mark,markId:label.markId,
     reasonCode:"multiple_outlines",totalOptions:distinct.length,
     options:distinct.slice(0,3).map((shape,index)=>{
      const l=shape.lineMm;
      return{rank:index+1,lineMm:l,lengthMm:Math.round(Math.hypot(
       l.x2-l.x1,l.y2-l.y1)),distancePt:Math.round(shape.distance*10)/10,
       gapPt:shape.gapPt,evidenceType:"parallel_strokes",
       strokesPt:shape.strokesPt,
       status:"alternative_only",exactPlacement:false}
     })});
    out.review.push({label,reasonCode:"multiple_outlines",
     reason:"Несколько разных контуров у одной марки; показаны альтернативы"});continue
   }
   const best=distinct[0],line=best.lineMm;
   out.candidates.push({label,mark:label.mark,markId:label.markId,
    evidenceType:"parallel_strokes",strokeKeys:best.strokeKeys,
    strokesPt:best.strokesPt,
    lineMm:line,lengthMm:Math.round(Math.hypot(
     line.x2-line.x1,line.y2-line.y1)),
    strokeGapPt:best.gapPt,distancePt:Math.round(best.distance*10)/10,
    status:"geometry_only_requires_review",geometryType:"unknown",
    partOfActualMember:false,exactPlacement:false,
    reason:"Парные графические линии PDF; тип и монтажные координаты не доказаны"})
  }
  const byStrokes=new Map();
  for(const candidate of out.candidates){
   if(!byStrokes.has(candidate.strokeKeys))byStrokes.set(candidate.strokeKeys,[]);
   byStrokes.get(candidate.strokeKeys).push(candidate)
  }
  for(const group of byStrokes.values())if(group.length>1){
   for(const c of group)out.review.push({label:c.label,
    reasonCode:"shared_strokes",reason:"Одни графические линии соответствуют нескольким надписям"});
   out.candidates=out.candidates.filter(c=>!group.includes(c))
  }
  out.summary=Object.entries(out.review.reduce((a,v)=>{
   a[v.reasonCode]=(a[v.reasonCode]||0)+1;return a
  },{})).map(([reason,count])=>({reason,count}));
  return out
 }


 // Join PDF glyph occurrences to reviewed-outline EVIDENCE by SAME mark,
 // page, and glyph centre. Nothing here authorizes an erection placement.
 // A complete source instance never disappears if geometry is unavailable.

 // Read-only dimension-chain evidence. A numeric label is accepted ONLY
 // when its painted line has the expected length in independently calibrated
 // axes and BOTH ends have transverse witness/tick strokes.
 // Never use these labels alone to derive a member location.
 function inspectPdfDimensionChains({raw,vector,analysis,region}={}){
  const out={candidates:[],ambiguous:[],inspectedNumbers:0,inspectedStrokes:0,
   limited:false,reason:"",status:"review_only"};
  const width=Number(vector?.widthPt),height=Number(vector?.heightPt),
   fx=analysis?.fitX,fy=analysis?.fitY;
  if(!analysis?.calibrated||!(width>0)||!(height>0)||
     Number(vector?.rotation||0)!==0||
     !(Number(fx?.scale)>0)||!(Number(fy?.scale)<0)){
   out.reason="Нужен неповёрнутый PDF и калибровка обеих осей";return out
  }
  if(vector?.stats?.detailSampleIncomplete===true||
     vector?.stats?.truncated===true&&
      vector?.stats?.axisEvidenceComplete!==true){
   out.reason="Неполная векторная геометрия PDF";out.limited=true;return out
  }
  const area=region||analysis.region||{left:0,top:0,right:1,bottom:1};
  if(![area.left,area.top,area.right,area.bottom].every(v=>
   typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1)||
    area.left>=area.right||area.top>=area.bottom){
   out.reason="Некорректная область монтажного плана";return out
  }
  const inside=(x,y)=>x>=area.left*width&&x<=area.right*width&&
   y>=area.top*height&&y<=area.bottom*height;
  const rawLines=Array.isArray(vector.detailSegments)?
   vector.detailSegments:vector?.segments||[];
  const maxLines=Math.min(rawLines.length,22000);
  out.limited=rawLines.length>maxLines||
   (vector.stats?.truncated===true&&!Array.isArray(vector.detailSegments));
  const segments=[];
  for(let i=0;i<maxLines;i++){
   const a=rawLines[i];
   if(!a||![a.x1,a.y1,a.x2,a.y2].every(Number.isFinite))continue;
   const dx=a.x2-a.x1,dy=a.y2-a.y1,len=Math.hypot(dx,dy);
   if(len<3||len>Math.max(width,height)*1.1)continue;
   const orientation=Math.abs(dy)<=.75?"x":Math.abs(dx)<=.75?"y":null;
   if(!orientation)continue;
   const cx=(a.x1+a.x2)/2,cy=(a.y1+a.y2)/2;
   if(!inside(cx,cy))continue;
   segments.push({x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2,
    length:len,orientation,cx,cy,
    coord:orientation==="x"?cy:cx})
  }
  out.inspectedStrokes=segments.length;
  const bin=(map,v,obj,step)=>{
   const key=Math.floor(v/step);
   if(!map.has(key))map.set(key,[]);
   map.get(key).push(obj)
  };
  const dimensions={x:new Map(),y:new Map()},witness={x:new Map(),y:new Map()};
  for(const line of segments){
   bin(dimensions[line.orientation],line.coord,line,20);
   bin(witness[line.orientation],line.coord,line,8)
  }
  const nearby=(map,value,step,margin)=>{
   const result=[],a=Math.floor((value-margin)/step),
    b=Math.floor((value+margin)/step);
   for(let k=a;k<=b;k++)if(map.has(k))result.push(...map.get(k));
   return result
  };
  const fragments=Array.isArray(raw?.fragments)?raw.fragments:[],
   limit=Math.min(fragments.length,24000);
  const seen=new Set();
  for(let i=0;i<limit&&out.candidates.length+out.ambiguous.length<800;i++){
   const f=fragments[i];if(!f||typeof f.text!=="string"||
      !["x","y","width","height"].every(k=>Number.isFinite(Number(f[k]))))
    continue;
   const rawValue=f.text.trim().replace(/[\s\u00a0]+/g,"");
   if(!/^\d{3,6}$/u.test(rawValue))continue;
   const valueMm=Number(rawValue);
   if(valueMm<100||valueMm>120000)continue;
   const x=Number(f.x)+Number(f.width)/2,
    y=height-Number(f.y)-Number(f.height)/2;
   if(!inside(x,y))continue;
   const dedupKey=valueMm+":"+Math.round(x/2)+":"+Math.round(y/2);
   if(seen.has(dedupKey))continue;
   seen.add(dedupKey);out.inspectedNumbers++;
   const possibilities=[];
   for(const orientation of ["x","y"]){
    const scale=Math.abs(orientation==="x"?fx.scale:fy.scale),
     expected=valueMm*scale;
    if(expected<10||expected>Math.max(width,height))continue;
    for(const line of nearby(dimensions[orientation],
      orientation==="x"?y:x,20,28)){
     const printedLen=line.length,delta=Math.abs(printedLen-expected);
     if(delta>Math.max(3.5,expected*.045))continue;
     const start=orientation==="x"?
      Math.min(line.x1,line.x2):Math.min(line.y1,line.y2),
      end=orientation==="x"?
      Math.max(line.x1,line.x2):Math.max(line.y1,line.y2),
      along=orientation==="x"?x:y,
      perpendicular=Math.abs((orientation==="x"?y:x)-line.coord);
     if(perpendicular>25||along<start-4||along>end+4)continue;
     if(Math.abs(along-(start+end)/2)>Math.max(10,printedLen*.28))
      continue;
     // A long parallel contour is NOT a dimension without end ticks.
     const crossOrientation=orientation==="x"?"y":"x";
     const verifyTick=endpoint=>{
      const choices=nearby(witness[crossOrientation],endpoint,8,5.5)
       .filter(t=>{
        if(Math.abs(t.coord-endpoint)>5.5)return false;
        const low=crossOrientation==="y"?
         Math.min(t.y1,t.y2):Math.min(t.x1,t.x2),
         high=crossOrientation==="y"?
         Math.max(t.y1,t.y2):Math.max(t.x1,t.x2);
        return line.coord>=low-5&&line.coord<=high+5&&
         Math.min(Math.abs(line.coord-low),Math.abs(line.coord-high),
          Math.abs(line.coord-(low+high)/2))<=20
       });
      choices.sort((a,b)=>Math.abs(a.coord-endpoint)-Math.abs(b.coord-endpoint));
      return choices[0]||null
     };
     const tick0=verifyTick(start),tick1=verifyTick(end);
     if(!tick0||!tick1)continue;
     const nearAxis=orientation==="x"?
      (analysis.xMatches||[]).some(v=>Math.abs(v.pagePt-start)<6)&&
      (analysis.xMatches||[]).some(v=>Math.abs(v.pagePt-end)<6):
      (analysis.yMatches||[]).some(v=>Math.abs(v.pagePt-start)<6)&&
      (analysis.yMatches||[]).some(v=>Math.abs(v.pagePt-end)<6);
     const score=delta/Math.max(expected,1)+perpendicular*.002+
      Math.abs(along-(start+end)/2)/Math.max(expected,1)*.01;
     possibilities.push({valueMm,orientation,
      measuredMm:Math.round(printedLen/scale),
      differenceMm:Math.round(delta/scale),
      nearbyAxes:nearAxis,score,
      numericTextRectPt:{x:Number(f.x),y:Number(f.y),
       width:Number(f.width),height:Number(f.height)},
      valuePoint:{x,y},
      linePt:{x1:line.x1,y1:line.y1,x2:line.x2,y2:line.y2},
      ticksPt:[tick0,tick1].map(t=>({
       x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2})),
      status:"dimension_graphic_hypothesis",verifiedPlacement:false})
    }
   }
   if(!possibilities.length)continue;
   possibilities.sort((a,b)=>a.score-b.score);
   // Source PDF often paints the SAME segment twice. Dedup geometrically.
   const unique=[];
   for(const choice of possibilities){
    const same=unique.some(a=>{
     if(a.orientation!==choice.orientation)return false;
     const p=a.linePt,q=choice.linePt,
      direct=Math.hypot(p.x1-q.x1,p.y1-q.y1)+
       Math.hypot(p.x2-q.x2,p.y2-q.y2),
      reversed=Math.hypot(p.x1-q.x2,p.y1-q.y2)+
       Math.hypot(p.x2-q.x1,p.y2-q.y1);
     return Math.min(direct,reversed)<2
    });
    if(!same)unique.push(choice)
   }
   const close=unique.filter(x=>x.score-unique[0].score<.018);
   if(close.length>1){
    out.ambiguous.push({valueMm,valuePoint:{x,y},
     options:close.slice(0,4),status:"several_dimension_lines"})
   }else out.candidates.push(unique[0])
  }
  out.limited=out.limited||fragments.length>limit;
  out.reason=out.candidates.length?
   "Найдены возможные размерные линии с текстом и двумя засечками. Нужна сверка КМД":
   "Не обнаружены согласованные числа, размерные линии и концевые засечки";
  return out
 }

 // Nearby printed dimensions are CONTEXT only. Do not convert these into
 // offsets, anchors or coordinates of a steel construction.
 function nearDimensionEvidence({instances=[],dimensions={},heightPt}={}){
  const values=dimensions.candidates||[];
  return instances.map(item=>{
   const x=Number(item.pageX),y=Number(heightPt)-Number(item.pageYBottom);
   const nearby=Number.isFinite(y)?values.map(dim=>({
    valueMm:dim.valueMm,orientation:dim.orientation,
    distancePt:Math.round(Math.hypot(x-dim.valuePoint.x,
     y-dim.valuePoint.y)*10)/10,
    dimensionLinePt:dim.linePt,numericTextRectPt:dim.numericTextRectPt,
    relationship:"nearby_only",verifiedForMember:false
   })).filter(v=>v.distancePt<=95)
    .sort((a,b)=>a.distancePt-b.distancePt).slice(0,5):[];
   return{instanceId:item.instanceId,mark:item.mark,nearby,
    relativeOnly:true,confirmedOffsets:0}
  })
 }


 // Recognise independently framed plans at arbitrary page locations. A frame
 // alone is not a plan: every accepted region must fit the user's axis grid.
 function detectFramedPlanRegions({raw,vector,grid}={}){
  if(!grid||!Array.isArray(vector?.contours)||vector.rotation||
   !(vector.widthPt>0)||!(vector.heightPt>0))return[];
  const W=vector.widthPt,H=vector.heightPt,candidates=[];
  for(const contour of vector.contours.slice(0,6000)){
   if(!contour.stroke||contour.clipUnresolved)continue;
   const c=contour.commands;
   if(!Array.isArray(c)||c.length<5||c.length>6||c[0]?.kind!=="M")continue;
   if(c.slice(1).some(v=>!["L","Z"].includes(v.kind)))continue;
   const points=c.filter(v=>v.kind!=="Z").map(v=>v.points?.[0]);
   if(points.length<4||points.length>5||points.some(p=>!Array.isArray(p)||
    p.length!==2||!p.every(Number.isFinite)))continue;
   const [first,last]=[points[0],points.at(-1)];
   if(c.at(-1).kind!=="Z"&&Math.hypot(first[0]-last[0],first[1]-last[1])>.1)continue;
   if(points.length===5){
    if(Math.hypot(first[0]-last[0],first[1]-last[1])>.1)continue;
    points.pop()
   }
   if(points.length!==4)continue;
   const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),
    left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
   if(left<0||top<0||right>W||bottom>H||right-left<W*.12||bottom-top<H*.12||
    (right-left)*(bottom-top)>W*H*.85)continue;
   if(new Set(points.map(p=>p.join(":"))).size!==4||
    points.some((p,i)=>{
     const next=points[(i+1)%4];
     return Math.abs(p[0]-next[0])>.1&&Math.abs(p[1]-next[1])>.1
    }))continue;
   const area={left:left/W,top:top/H,right:right/W,bottom:bottom/H};
   if(candidates.some(r=>["left","top","right","bottom"].every(k=>Math.abs(r.area[k]-area[k])<.002)))continue;
   candidates.push({area,operatorIndex:contour.operatorIndex});
  }
  // Intersecting/nested frames are ambiguous (tables and title blocks can
  // look rectangular). Never assign labels using overlapping local frames.
  const separated=candidates.filter((a,i)=>!candidates.some((b,j)=>i!==j&&
   Math.min(a.area.right,b.area.right)-Math.max(a.area.left,b.area.left)>.002&&
   Math.min(a.area.bottom,b.area.bottom)-Math.max(a.area.top,b.area.top)>.002));
  if(separated.length>24)return[];
  return separated.sort((a,b)=>a.area.top-b.area.top||a.area.left-b.area.left)
   .map(r=>({...r,analysis:detectPlanGridAxes({raw,vector,grid,region:r.area})}))
   .filter(r=>r.analysis.calibrated).map(r=>({...r,
    name:"frame:"+[r.area.left,r.area.top,r.area.right,r.area.bottom].map(v=>v.toFixed(5)).join(":"),
    source:"painted_frame_and_registered_axes"}));
 }

 // Find a horizontal separation from gaps between registered axis labels.
 // Both sides must independently calibrate, with different PDF-to-grid
 // transforms. Two crops of the same physical plan are never two diagrams.
 function detectStackedPlanRegions({raw,vector,grid}={}){
  const H=vector?.heightPt;
  if(!(H>0)||vector.rotation||!grid?.x||!grid?.y)return[];
  const names=new Set([...grid.x.keys(),...grid.y.keys()].map(norm));
  const ys=(raw?.fragments||[]).filter(f=>f&&names.has(norm(f.text))&&
   [f.y,f.height].every(Number.isFinite)&&f.height>=0)
   .map(f=>H-f.y-f.height/2).filter(y=>y>=0&&y<=H).sort((a,b)=>a-b);
  if(ys.length>1800)return[];
  const cuts=[];
  for(let i=1;i<ys.length;i++){
   const gap=ys[i]-ys[i-1],cut=(ys[i]+ys[i-1])/2/H;
   if(gap>=H*.06&&cut>=.2&&cut<=.8)cuts.push({cut,gap})
  }
  cuts.sort((a,b)=>b.gap-a.gap);
  for(const {cut} of cuts.slice(0,12)){
   const areas=[{left:0,top:0,right:1,bottom:cut},
    {left:0,top:cut,right:1,bottom:1}];
   const results=areas.map(area=>({area,analysis:detectPlanGridAxes({raw,vector,grid,region:area})}));
   if(results.some(r=>!r.analysis.calibrated))continue;
   const [a,b]=results.map(r=>r.analysis);
   // Compare their projection at common grid coordinates; scale alone may
   // be identical on two views. Offset must still establish separate views.
   const sameTransform=["fitX","fitY"].every(key=>{
    const aa=a[key],bb=b[key];
    return Math.abs(aa.offset-bb.offset)<3&&
     Math.abs(aa.scale-bb.scale)*Math.max(1,...[...grid[key==="fitX"?"x":"y"].values()].map(Math.abs))<3
   });
   if(sameTransform)continue;
   // Require shared named axes: disjoint halves of one long plan do not
   // establish repeated independent views merely by fitting different data.
   if(!["xMatches","yMatches"].every(key=>
    a[key].filter(v=>b[key].some(w=>w.name===v.name)).length>=3))continue;
   return results.map((r,i)=>({...r,name:i===0?"Верхняя схема":"Нижняя схема",
    source:"independent_axis_grids",reviewRequired:true}))
  }
  return[]
 }

 // Automatically inspect every independent diagram on a sheet. The PDF
 // text/index is a prerequisite, not a final location result. X/Y/Z remain
 // unfilled until a drawing explicitly proves a particular member placement.
 function reviewIndexedPlanPage({raw,vector,grid,marks=[],documentId,sha256,page,
   sheetType="plan"}={}){
  const out={regions:[],reason:"",calibrated:0,foundLabels:0,
   contourHints:0,dimensionHints:0,readyForPlacement:0,readOnly:true};
  if(["section","detail"].includes(sheetType)){
   out.reason="Разрез/деталь: повторные подписи не считаются монтажными экземплярами";
   return out
  }
  if(!grid?.x||!grid?.y){
   out.reason="Нет сохранённой сетки осей проекта";return out
  }
  if(!Array.isArray(vector?.segments)||Number(vector.rotation||0)!==0||
     !(Number(vector.widthPt)>0)||!(Number(vector.heightPt)>0)){
   out.reason="Нет неповёрнутой векторной графики PDF";return out
  }
  const zones={
   full:{left:0,top:0,right:1,bottom:1},
   left:{left:0,top:0,right:.5,bottom:1},
   right:{left:.5,top:0,right:1,bottom:1}
  };
  const cache=new Map();
  const calibrate=name=>{
   if(!cache.has(name))cache.set(name,detectPlanGridAxes({
    raw,vector,grid,region:zones[name]}));
   return cache.get(name)
  };
  const framed=detectFramedPlanRegions({raw,vector,grid});
  for(const frame of framed){zones[frame.name]=frame.area;cache.set(frame.name,frame.analysis)}
  const stacked=framed.length>=2?[]:detectStackedPlanRegions({raw,vector,grid});
  for(const r of stacked){zones[r.name]=r.area;cache.set(r.name,r.analysis)}
  const selection=selectPlanRegion({selected:"auto",calibrate});
  const selected=framed.length>=2?framed.map(r=>r.name):stacked.length===2?stacked.map(r=>r.name):selection.multiplePlans?["left","right"]:
   selection.analysis?.calibrated?[selection.regionName]:[];
  if(!selected.length){
   out.reason=selection.analysis?.reason||"Подписи осей не согласованы с сеткой";
   return out
  }
  for(const name of selected){
   const analysis=calibrate(name);
   if(!analysis.calibrated)continue;
   const region=extractPlanInstances({raw,marks,documentId,sha256,page,
    region:name,regionBounds:zones[name],widthPt:vector.widthPt,heightPt:vector.heightPt,sheetType});
   const labels=region.labels.map(x=>({
    mark:x.mark,markId:x.markId,labelText:x.labelText,
    pageX:x.pageX,pageY:Number(vector.heightPt)-x.pageYBottom,
    rectPt:x.rectPt,fragmentIds:x.fragmentIds
   }));
   const contours=findPlanMemberStrokes({labels,analysis,grid,vector});
   const links=linkInstanceOutlineEvidence({instances:region.labels,
    registeredLabels:labels,outlines:contours,heightPt:vector.heightPt});
   const dimensions=inspectPdfDimensionChains({raw,vector,analysis,
    region:zones[name]});
   const dimensionLinks=nearDimensionEvidence({instances:region.labels,
    dimensions,heightPt:vector.heightPt});
   out.regions.push({name,regionBounds:zones[name],frameEvidence:framed.find(r=>r.name===name)?.operatorIndex,analysis:{calibrated:true,
    xMatches:analysis.xMatches?.length||0,yMatches:analysis.yMatches?.length||0},
    registry:region,links,dimensions,dimensionLinks,
    contoursLimited:!!contours.limited});
   out.calibrated++;out.foundLabels+=region.total;
   out.contourHints+=links.summary.contour_candidate||0;
   out.dimensionHints+=dimensions.candidates.length
  }
  out.reason=out.calibrated? "Оси соотнесены с графикой. X/Y/Z конструкций требуют проверки.":
   "Не удалось откалибровать оси независимо для каждого плана";
  return out
 }

 function linkInstanceOutlineEvidence({instances=[],registeredLabels=[],outlines={},
   heightPt}={}){
  const labels=Array.isArray(registeredLabels)?registeredLabels:[],
   processed=Math.max(0,Math.min(labels.length,250,
    Number(outlines.processedLabels??Math.min(labels.length,250)))),
   arrays={candidate:outlines.candidates||[],multiple:outlines.alternatives||[],
    single:outlines.singleStrokes||[],review:outlines.review||[]},
   statuses=["contour_candidate","multiple_contours","single_stroke",
    "no_graphic_evidence","needs_more_evidence","not_checked","ambiguous_match"],
   summary=Object.fromEntries(statuses.map(s=>[s,0])),
   records=[];
  for(const source of instances.slice(0,6000)){
   const rec={instanceId:source.instanceId,mark:source.mark,
    markId:source.markId,documentId:source.documentId,page:source.page,
    diagramRegion:source.diagramRegion,
    status:"not_checked",confirmedPlacement:false,exactPlacement:false,
    xMm:null,yMm:null,z0Mm:null,z1Mm:null,
    strokeLinesPt:null,lineMm:null,alternatives:0,reason:""};
   const y=Number(heightPt)-Number(source.pageYBottom);
   if(!Number.isFinite(y)||!(Number(heightPt)>0)){
    rec.reason="Размер PDF неизвестен";summary[rec.status]++;records.push(rec);continue
   }
   const matches=labels.filter(label=>
    String(label.markId)===String(source.markId)&&
    norm(label.mark)===norm(source.mark)&&
    Math.hypot(Number(label.pageX)-Number(source.pageX),
     Number(label.pageY)-y)<=2.5);
   if(matches.length!==1){
    rec.status=matches.length?"ambiguous_match":"not_checked";
    rec.reason=matches.length?"Несколько надписей совпали по координатам":
     "Надпись не допущена к анализу калиброванной области";
   }else{
    const match=matches[0],labelIndex=labels.indexOf(match);
    if(labelIndex>=processed){
     rec.status="not_checked";
     rec.reason="Надпись за пределами проверенной выборки";
    }else{
     const chosen=arrays.candidate.filter(x=>x.label===match),
      choices=arrays.multiple.filter(x=>x.label===match),
      singles=arrays.single.filter(x=>x.label===match),
      reviews=arrays.review.filter(x=>x.label===match);
     if(chosen.length>1||choices.length>1||chosen.length&&choices.length){
      rec.status="ambiguous_match";
      rec.reason="Несколько несовместимых геометрических результатов";
     }else if(choices.length){
      rec.status="multiple_contours";
      rec.alternatives=choices[0].totalOptions||choices[0].options?.length||0;
      rec.strokeLinesPt=choices[0].options?.[0]?.strokesPt||null;
      rec.lineMm=choices[0].options?.[0]?.lineMm||null;
      rec.reason="Несколько графических контуров; нет подтверждённого выбора";
     }else if(chosen.length){
      rec.status="contour_candidate";
      rec.strokeLinesPt=chosen[0].strokesPt||null;
      rec.lineMm=chosen[0].lineMm||null;
      rec.reason="Парные линии PDF; принадлежность марке не доказана";
     }else if(singles.length){
      rec.status="single_stroke";
      rec.lineMm=singles[0].lineMm||null;
      rec.reason="Только одиночная линия PDF";
     }else if(outlines.limited||reviews.some(x=>
       ["incomplete_geometry","uncalibrated","invalid_transform",
        "axis_spacing"].includes(x.reasonCode))){
      rec.status="needs_more_evidence";
      rec.reason="Геометрия PDF неполная или калибровка не подтверждена";
     }else{
      rec.status="no_graphic_evidence";
      rec.reason=reviews[0]?.reason||"Подходящая графика рядом не найдена";
     }
    }
   }
   summary[rec.status]++;records.push(rec)
  }
  return{records,summary,total:records.length,checked:records.length-
   summary.not_checked-summary.ambiguous_match,
   confirmedPlacements:0,readyForPlacement:0,sourceReadOnly:true}
 }

 function createPage(){
  let latest=[],candidates=[],batch=null,verifiedPreview=null,
    instanceResults=new Map(),instanceRows=[],instanceLinks=new Map(),
    instanceDimensionHints=new Map(),dimensionResults=new Map(),dimensionRows=[],
    showAllInstances=false,
   lastOperation=null,inventory=null,draftRows=[],
   busy=false,log="",saved=0,disposeLast=null,sweep=null;
  const feedbackByCandidate=new Map();
  const page={
   dispose(){if(sweep)sweep.cancel=true;if(disposeLast)disposeLast();disposeLast=null},
   async render(host,opts={}){
    if(!host)return;
    const {objectId,documents=[],indexes=[],askPassword,
     reviewer,onOpenPdf,onNavigate}=opts;
    page.dispose();
    latest=[];candidates=[];batch=null;verifiedPreview=null;lastOperation=null;inventory=null;draftRows=[];
     instanceResults.clear();instanceRows=[];instanceLinks.clear();
     instanceDimensionHints.clear();dimensionResults.clear();dimensionRows=[];
     showAllInstances=false;
    busy=false;saved=0;log="";sweep=null;feedbackByCandidate.clear();
    const escDoc=esc;const canEdit=true;let live=true;
    const hostWindow=opts.window||root;
    const dataRoot=opts.root||hostWindow?.irProject?.data?.forObject(objectId);
    const marksApi=dataRoot?.section?.("marks"),schemeApi=dataRoot?.section?.("scheme"),
     workApi=dataRoot?.section?.("work-types");
    const pdf=opts.pdf||hostWindow?.irProject?.aiPdf,
     mounting=opts.mounting||hostWindow?.irProject?.aiMounting,
     geometry=opts.geometry||hostWindow?.irProject?.aiPdfGeometry,
     geometryCache=new Map();
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
     '<header class="ir-ai-review-heading"><div><h2>Чертежи КМ/КМД → Монтажная схема</h2>'+
     '<p>Одна кнопка запускает чтение PDF и проверку осей, графики, размеров и повторений марок. Точное X/Y/Z определяется только при достаточных доказательствах.</p></div>'+
     '<b>Локально · без ИИ</b></header>'+
     '<div class="ir-ai-quantity-warning">Индексирование текстового слоя PDF не определяет положение конструкции. После построения черновика автоматически запускается графическая проверка всех индексированных потенциальных монтажных планов; это не изменяет существующую схему.</div>'+
     '<div class="ir-ai-lite-toolbar"><button type="button" data-lite-scan '+(busy?'disabled':'')+'>1. Проанализировать все чертежи</button>'+
     '<button type="button" data-lite-auto>Авторасстановка по PDF</button>'+
     '<button type="button" data-lite-analyze-all disabled>Автоматически проверить оси и контуры всех планов</button>'+
     '<button type="button" data-lite-cancel-analyze disabled>Остановить анализ</button>'+
     '<button type="button" data-lite-scheme>Открыть монтажную схему</button>'+ 
     (hostWindow?.irProject?.schemeReset?.clear?
      '<button type="button" data-lite-clear class="ir-ai-lite-clear">Очистить схему</button>':"")+
     '</div>'+
     '<div data-lite-status role="status">'+escDoc(log||"Доступные проиндексированные PDF можно проверить локально.")+'</div>'+
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

    function instanceMarkup(){
     const unique=new Map();
     for(const part of instanceResults.values())for(const x of part.labels){
      const old=unique.get(x.instanceId);
      if(!old||old.diagramRegion==="full"&&x.diagramRegion!=="full")
       unique.set(x.instanceId,x)
     }
     instanceRows=[...unique.values()].sort((a,b)=>
      a.documentId-b.documentId||a.page-b.page||
      a.mark.localeCompare(b.mark,"ru")||a.pageX-b.pageX||a.pageYBottom-b.pageYBottom);
     if(!instanceResults.size)return"";
     const counts=new Map(),pages=new Map();
     for(const x of instanceRows){
      counts.set(x.mark,(counts.get(x.mark)||0)+1);
      const page="№"+x.documentId+" · лист "+x.page;
      pages.set(page,(pages.get(page)||0)+1)
     }
     dimensionRows=[...dimensionResults.values()].flatMap(x=>x.candidates||[]);
     const dimensionAmbiguous=[...dimensionResults.values()].reduce((a,v)=>
      a+(v.ambiguous?.length||0),0);
     const dimensionNotices=[...dimensionResults.values()].filter(d=>
      !d.candidates?.length&&d.reason).map(d=>d.reason);
     const unknown=[...new Set([...instanceResults.values()]
       .flatMap(x=>x.skippedUnknownMarks||[]))];
     const evidenceCounts=new Map();
     for(const item of instanceRows){
      const link=instanceLinks.get(item.instanceId);
      if(link)evidenceCounts.set(link.status,(evidenceCounts.get(link.status)||0)+1)
     }
     const unscoped=instanceRows.filter(x=>x.diagramRegion==="full").length,
      suspect=instanceRows.filter(x=>x.sheetType!=="plan").length,
      limited=[...instanceResults.values()].filter(x=>x.truncated).length;
     return'<section class="ir-ai-lite-batch ir-ai-lite-instance-register">'+
      '<h3>Реестр отдельных надписей марок КМД</h3>'+
      '<p>Найдено: <b>'+instanceRows.length+'</b> надписей; '+
      'разных обозначений: <b>'+counts.size+'</b>.</p>'+
      '<p><b>В этом реестре подтверждено положений: 0; готовых X/Y/Z: 0.</b> '+
      'Гипотез парного контура: <b>'+(evidenceCounts.get("contour_candidate")||0)+
      '</b>; несколько вариантов: <b>'+(evidenceCounts.get("multiple_contours")||0)+
      '</b>; одиночная линия: <b>'+(evidenceCounts.get("single_stroke")||0)+
      '</b>; недостаточно графики: <b>'+(evidenceCounts.get("needs_more_evidence")||0)+
      '</b>; ещё не проанализировано: <b>'+(
        instanceRows.length-[...evidenceCounts.values()].reduce((n,k)=>n+k,0)+
        (evidenceCounts.get("not_checked")||0)+(evidenceCounts.get("ambiguous_match")||0))+
      '</b>.</p><p>' +
      'Размерных линий с совпадающей длиной и концевыми засечками: <b>'+
      dimensionRows.length+'</b>; неоднозначных размерных цепочек: <b>'+
      dimensionAmbiguous+'</b>. Это только независимые графические подсказки, '+
      'не координаты крепления конструкций.</p>'+
      (dimensionNotices.length?'<p>Размерные цепочки не подтверждены: '+
       escDoc(dimensionNotices[0])+'</p>':"")+
      '<p>'+
      'Надпись может повторяться в разрезах или деталях. '+
      'Каждое место текста считается отдельно, пока его не сверили с планом.</p>'+
      (unknown.length?'<p>Не сопоставлены с ведомостью: '+unknown.length+
       ' обозначений (не добавлены).</p>':"")+
      (unscoped?'<p>Без выбора отдельной схемы: '+unscoped+
       '. Для листов с несколькими чертежами выберите левую и правую части по очереди.</p>':"")+
      (suspect?'<p>Из разрезов/неопределённых листов: '+suspect+
       ' — не считать дополнительными конструкциями без проверки.</p>':"")+
      (limited?'<p>Неполная выборка на '+limited+' областях.</p>':"")+
      (dimensionRows.length?'<details>'+
       '<summary>Размерные цепочки PDF · '+dimensionRows.length+
       ' (текст + линия + 2 засечки)</summary>'+
       '<div class="ir-ai-lite-preview-scroll"><table><thead><tr>'+
       '<th>Размер, мм</th><th>Ориентация</th><th>Длина графики, мм</th>'+
       '<th>Расхождение, мм</th><th>Источник</th></tr></thead><tbody>'+
       dimensionRows.slice(0,150).map((dim,i)=>'<tr><td>'+dim.valueMm+
        '</td><td>'+escDoc(dim.orientation==="x"?"Вдоль X":"Вдоль Y")+
        '</td><td>'+dim.measuredMm+'</td><td>≈'+dim.differenceMm+
        '</td><td><button type="button" data-lite-dimension-source="'+i+
        '">PDF</button></td></tr>').join("")+
       '</tbody></table></div>'+
       '<p>Размерная линия ещё не привязана к конкретной марке. '+
       'Это не монтажная координата.</p></details>':"")+
      '<details><summary>Количество по каждой марке · '+counts.size+'</summary>'+
      '<div class="ir-ai-lite-preview-scroll"><table><thead><tr>'+
      '<th>Марка</th><th>Отдельных надписей</th></tr></thead><tbody>'+
      [...counts].sort((a,b)=>a[0].localeCompare(b[0],"ru"))
       .map(([mark,n])=>'<tr><td>'+escDoc(mark)+'</td><td>'+n+'</td></tr>')
       .join("")+'</tbody></table></div></details>'+
      '<details><summary>Количество по листам · '+pages.size+'</summary>'+
      [...pages].map(([p,n])=>'<div>'+escDoc(p)+': '+n+'</div>').join("")+
      '</details>'+
      '<details><summary>Каждая надпись, отдельная позиция на PDF · '+
       instanceRows.length+'</summary>'+
      '<div class="ir-ai-lite-preview-scroll"><table><thead><tr>'+
      '<th>Марка</th><th>Лист</th><th>Область</th>'+
      '<th>Центр надписи PDF (pt)</th><th>Статус</th><th>Источник</th>'+
      '</tr></thead><tbody>'+
      instanceRows.slice(0,showAllInstances?5000:350).map((x,i)=>'<tr><td>'+escDoc(x.mark)+'</td>'+
       '<td>'+x.page+'</td><td>'+escDoc(x.diagramRegion)+'</td>'+
       '<td>'+x.pageX.toFixed(1)+' / '+x.pageYBottom.toFixed(1)+
        (instanceDimensionHints.get(x.instanceId)?.nearby?.length?
         '<small> · рядом размеры: '+
         instanceDimensionHints.get(x.instanceId).nearby.map(d=>
          d.valueMm+' ('+(d.orientation==="x"?"X":"Y")+')').join(", ")+
         ' (не привязаны к марке)</small>':"")+
        '</td>'+
       '<td>'+escDoc(({
        contour_candidate:"Возможный парный контур",
        multiple_contours:"Несколько контуров · требуется выбор",
        single_stroke:"Одна линия · недостаточно",
        no_graphic_evidence:"Контур пока не найден",
        needs_more_evidence:"Неполная геометрия PDF",
        not_checked:"Геометрия не проверена",
        ambiguous_match:"Неоднозначная связь надписи"
       })[instanceLinks.get(x.instanceId)?.status]||
        "Геометрия не проверена")+
        (instanceLinks.get(x.instanceId)?.alternatives?
         ' ('+instanceLinks.get(x.instanceId).alternatives+' варианта)':'')+
        '; X/Y/Z не подтверждены'+
        (instanceLinks.get(x.instanceId)?.reason?
         '<small> — '+escDoc(instanceLinks.get(x.instanceId).reason)+'</small>':"")+
        '</td>'+
       '<td><button type="button" data-lite-instance-source="'+i+
       '">PDF</button>'+
       (instanceLinks.get(x.instanceId)?.strokeLinesPt?.length===2?
        '<button type="button" data-lite-instance-outline="'+i+
        '">Линии PDF</button>':"")+'</td></tr>').join("")+'</tbody></table></div>'+
      (instanceRows.length>350?'<button type="button" data-lite-instance-expand>'+
       (showAllInstances?'Свернуть список':'Показать все найденные надписи')+
       '</button>':"")+
      (instanceRows.length>5000&&showAllInstances?
       '<small>В одном просмотре максимум 5000 надписей.</small>':"")+
      '</details></section>'
    }
    function draw(){
     const slot=host.querySelector("[data-lite-results]");if(!slot)return;
     const indexesLoaded=latest.length,candidateCount=candidates.length;
     slot.innerHTML=(sweep?'<section class="ir-ai-lite-geometry-summary">'+
      '<h3>Автоматическая проверка монтажных планов</h3>'+
      '<p data-lite-sweep-counts aria-live="polite">Проверено листов: <b>'+sweep.done+'/'+sweep.total+
      '</b> · калибровано схем: <b>'+sweep.calibrated+
      '</b> · найдено надписей в планах: <b>'+sweep.labels+
      '</b> · возможных пар контуров: <b>'+sweep.contours+
      '</b> · ошибок: <b>'+sweep.errors+'</b>.</p>'+
      '<p>Подтверждённых монтажных координат X/Y/Z: <b>0</b>. '+
      'Результаты анализа — графические гипотезы, не готовая расстановка.</p>'+
      (sweep.lastReason?'<p>'+escDoc(sweep.lastReason)+'</p>':"")+
      (sweep.failures?.length?'<details><summary>Проблемные листы · '+
       sweep.failures.length+'</summary>'+
       sweep.failures.slice(0,30).map(x=>'<p>'+escDoc(x)+'</p>').join("")+
       '</details>':"")+
      '</section>':"")+instanceMarkup()+(inventory?'<div class="ir-ai-lite-counts">'+
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
       (batch.ready.length?'<button type="button" data-lite-batch '+''+
        '>2. Расставить готовые марки · '+batch.ready.length+' экз.</button>':"")+
       '</div>'+
       '<p>Подтверждение выполняется для всего списка. Непонятные координаты не придумываются.</p>'+
       (batch.review.length?'<details><summary>Причины ручной проверки · '+
        batch.review.length+'</summary>'+
        batch.review.slice(0,60).map(x=>'<div>'+escDoc(x.candidate.mark)+
         ' · '+escDoc(x.reason)+'</div>').join("")+'</details>':"")+
       '</section>':"")+
      (verifiedPreview?'<section class="ir-ai-lite-batch ir-ai-lite-server-preview">'+
       '<h3>Предпросмотр перед расстановкой</h3>'+
       (verifiedPreview.preview.automatic?'<p>Автоматически проверено листов: '+verifiedPreview.preview.automatic.pages+
        '. Готовых позиций: '+verifiedPreview.preview.automatic.ready+
        (verifiedPreview.preview.automatic.deferred?' · в следующей операции: '+verifiedPreview.preview.automatic.deferred:'')+'.</p>':'')+
       (verifiedPreview.preview.review?.length?'<details open class="ir-ai-auto-review"><summary>Требуют ручной проверки · '+verifiedPreview.preview.review.length+
        '</summary>'+verifiedPreview.preview.review.slice(0,200).map(x=>'<p style="color:#b42318">'+escDoc(x.mark)+' — '+escDoc(x.reason)+'</p>').join('')+'</details>':'')+
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
       '<div class="ir-ai-lite-toolbar"><button type="button" data-lite-apply '+(!verifiedPreview.preview.ready.length?'disabled':'')+'>3. Применить '+
        verifiedPreview.preview.ready.length+' готовых экземпляров</button>'+
        '<button type="button" data-lite-cancel-preview>Отмена</button></div>'+
       '</section>':"")+
      (lastOperation?'<section class="ir-ai-lite-batch ir-ai-lite-last-operation">'+
       '<p>Последняя автоматическая расстановка: <b>'+
       lastOperation.created+'</b> элементов · '+escDoc(lastOperation.createdAt||"")+'</p>'+
       '<button type="button" data-lite-undo>Отменить последнюю расстановку</button>'+
       '</section>':"")+
      (latest.length?'<div class="ir-ai-lite-docs">'+latest.map((x,pi)=>
       '<div><b>'+escDoc(x.name)+' · лист '+x.page+'</b> · '+escDoc(
        {plan:"План расположения",section:"Разрез / фасад",detail:"Чертёж марки",other:"Тип не определён"}[x.sheetType])+
       (x.uncertainEncoding?' · Неоднозначная кодировка: потребуется визуальная проверка':"")+
       (x.marks.length?' · '+x.marks.length+' обозначений'+
        (x.markMentions>x.marks.length?' ('+x.markMentions+' упоминаний)':""):
        ' · Марки не найдены в читаемом тексте')+
       '<button type="button" class="ir-ai-lite-vector-button" data-lite-vector-page="'+pi+
        '">Проверить линии листа</button>'+
        '<button type="button" class="ir-ai-lite-vector-button" data-lite-axis-page="'+pi+
        '">Найти оси на плане</button>'+
        '<button type="button" class="ir-ai-lite-vector-button" data-lite-instances-page="'+pi+
         '">Учесть марки этой области</button>'+
        '<select data-lite-axis-region="'+pi+'" title="Если на одном PDF несколько чертежей, выбирайте только область нужной монтажной схемы">'+
         '<option value="auto">Определить область</option>'+
         '<option value="full">Весь лист</option>'+
         '<option value="left">Левая часть</option>'+
         '<option value="right">Правая часть</option>'+
         '<option value="top-left">Сверху слева</option>'+
         '<option value="top-right">Сверху справа</option>'+
         '<option value="bottom-left">Снизу слева</option>'+
         '<option value="bottom-right">Снизу справа</option></select></div>'
      ).join("")+'</div>'+
       '<div data-lite-axis-result class="ir-ai-lite-axis-result" role="status"></div>'+
       '<div data-lite-vector-result class="ir-ai-lite-vector-result" role="status"></div>':"")+
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
       '<div class="ir-ai-lite-missing">'+
       (c.origin==="plan_label_only"?
        'Найдена надпись марки, но это ещё не подтверждённый экземпляр конструкции. '+
        'Для автоматической проверки положения используйте реестр и кнопку '+
        '«Автоматически проверить оси и контуры всех планов». '+
        'Точные X/Y/Z пока не определены.':
        'В текстовом индексе не подтверждены: '+escDoc([
         !c.axisX?"ось X":"",!c.axisY?"ось Y":"",
         c.z0Mm==null?"низ / начало Z0":"",
         c.z1Mm==null?"верх / конец Z1":"",
         ["beam","brace"].includes(c.type)&&!c.endAxisX?"конечная ось X":"",
         ["beam","brace"].includes(c.type)&&!c.endAxisY?"конечная ось Y":""
        ].filter(Boolean).join(", ")||"привязки к конструкции")+
        '. Геометрию нужно проверить по монтажному плану.')+
       '</div>'+
       '<details class="ir-ai-lite-manual"><summary>Ручная корректировка — только при необходимости</summary>'+
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
       ''+
       '>Сохранить исправления</button><button type="button" data-lite-approve="'+i+'" '+''+
       '>2. Проверить и добавить на монтажную схему</button>'+
       '<small>Координаты берутся только из сохранённой сетки IR Project.</small></div>'+
       '</details>'+'<div class="ir-ai-lite-inline-feedback" data-lite-feedback role="status" aria-live="polite" data-state="'+
       escDoc(feedbackByCandidate.get(i)?.state||"info")+'">'+
       escDoc(feedbackByCandidate.get(i)?.message||"")+'</div></article>').join("")+
       '</div>':
       '<div class="ir-ai-doc-empty">Пока нет предложений по маркам. Для сканирования нужны читаемые текстовые слои PDF. Листы без текста требуют отдельного визуального распознавания.</div>');
     slot.querySelectorAll("[data-lite-instances-page]").forEach(b=>b.onclick=()=>{
      void analyzeInstances(Number(b.dataset.liteInstancesPage))
     });
     const expand=slot.querySelector?.("[data-lite-instance-expand]");
     if(expand)expand.onclick=()=>{showAllInstances=!showAllInstances;draw()};
     slot.querySelectorAll("[data-lite-dimension-source]").forEach(b=>b.onclick=()=>{
      const dim=dimensionRows[Number(b.dataset.liteDimensionSource)];
      if(dim){
       const selected=[...dimensionResults.entries()].find(([key,val])=>
        val.candidates.includes(dim));
       const [documentId,sha,page]=selected?.[0]?.split(":")||[];
       if(documentId&&page)
        onOpenPdf?.(Number(documentId),Number(page),[{
         quote:String(dim.valueMm),rectPt:dim.numericTextRectPt}])
      }
     });
     slot.querySelectorAll("[data-lite-instance-outline]").forEach(b=>b.onclick=()=>{
      const x=instanceRows[Number(b.dataset.liteInstanceOutline)],
       link=x&&instanceLinks.get(x.instanceId);
      if(x&&link?.strokeLinesPt?.length===2)
       onOpenPdf?.(x.documentId,x.page,[{quote:x.labelText,
        fragmentIds:x.fragmentIds,rectPt:x.rectPt,
        strokeLinesPt:link.strokeLinesPt}])
     });
     slot.querySelectorAll("[data-lite-instance-source]").forEach(b=>b.onclick=()=>{
      const x=instanceRows[Number(b.dataset.liteInstanceSource)];
      if(x)onOpenPdf?.(x.documentId,x.page,[{quote:x.labelText,
       fragmentIds:x.fragmentIds,rectPt:x.rectPt}])
     });
     slot.querySelectorAll("[data-lite-axis-page]").forEach(b=>b.onclick=()=>{
      void analyzeAxes(Number(b.dataset.liteAxisPage))
     });
     slot.querySelectorAll("[data-lite-vector-page]").forEach(b=>b.onclick=()=>{
      void analyzeVector(Number(b.dataset.liteVectorPage))
     });
     slot.querySelectorAll("[data-lite-source]").forEach(b=>b.onclick=()=>{
      const c=candidates[Number(b.dataset.liteSource)];if(c)onOpenPdf?.(c.source.documentId,c.source.page,c.evidenceLocations||[])
     });
     slot.querySelectorAll("[data-lite-approve]").forEach(b=>b.onclick=()=>{void approve(Number(b.dataset.liteApprove))});
     slot.querySelectorAll("[data-lite-save-draft]").forEach(b=>b.onclick=()=>{void saveCorrection(Number(b.dataset.liteSaveDraft))});
     const bulk=slot.querySelector?.("[data-lite-batch]");
     if(bulk)bulk.onclick=()=>void approveBatch();
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


    async function reviewAllIndexedPlans(){
     if(busy||!latest.length)return;
     if(!geometry?.page||!pdf?.page||!schemeApi?.list||!marksApi?.list){
      status("Автоматической проверке нужны векторный PDF, ведомость и сетка осей.");return
     }
     // Sweep ALL pages in the current exact-SHA PDF indexes, not just
     // the first 250 excerpts loaded into the legacy manual-card preview.
     const work=indexes.filter(idx=>documents.some(doc=>
       Number(doc.id)===Number(idx.documentId)&&
       doc.sha256===idx.sourceSha256&&doc.exists&&
       ["КМ","КМД"].includes(doc.kind))).flatMap(idx=>
       (idx.pages||[]).filter(p=>p&&Number.isSafeInteger(Number(p.page))&&
        Number(p.page)>=1).map(p=>({
        documentId:Number(idx.documentId),sha256:idx.sourceSha256,
        page:Number(p.page),indexId:idx.id,
        sheetType:classSheet(
         documents.find(doc=>Number(doc.id)===Number(idx.documentId))?.name||"",
         p.excerpt||"")
       }))).filter(x=>!["section","detail"].includes(x.sheetType));
     if(!work.length){status("В индексированных PDF нет монтажных планов или неопределённых листов. "+
      "Проверьте загруженные PDF и их текстовый слой.");return}
     sweep={running:true,cancel:false,done:0,total:work.length,calibrated:0,
      contours:0,labels:0,errors:0,lastReason:"",failures:[]};
     const job=sweep,button=host.querySelector?.("[data-lite-analyze-all]"),
      stop=host.querySelector?.("[data-lite-cancel-analyze]"),
      scan=host.querySelector?.("[data-lite-scan]");
     busy=true;if(button)button.disabled=true;if(stop)stop.disabled=false;
     if(scan)scan.disabled=true;draw();
     try{
      const [rows,marks]=await Promise.all([schemeApi.list(),marksApi.list()]);
      const grid=axisGeometry(rows);
      if(!grid){job.lastReason="Сетка осей не сохранена; сохраните её в монтажной схеме.";return}
      for(const item of work){
       if(!live||job.cancel)break;
       const doc=documents.find(d=>Number(d.id)===Number(item.documentId)&&
        d.sha256===item.sha256&&d.exists),
        idx=indexes.find(d=>Number(d.id)===Number(item.indexId)&&
        Number(d.documentId)===Number(item.documentId)&&
        d.sourceSha256===item.sha256);
       status("Автоматически проверяем лист "+(job.done+1)+
        "/"+job.total+" · "+(doc?.name||"PDF"));
       try{
        if(!doc||!idx)throw Error("Исходный PDF изменён");
        const [textPage,vector]=await Promise.all([
         pdf.page(objectId,idx.id,item.page),
         geometry.page(objectId,doc.id,item.page)
        ]);
        if(!live||job.cancel)break;
        if(textPage.source?.sha256!==doc.sha256||
           Number(textPage.source?.documentId)!==Number(doc.id)||
           vector?.sourceSha256!==doc.sha256||
           Number(vector.documentId)!==Number(doc.id)||
           Number(vector.page)!==Number(item.page))
         throw Error("Индекс и геометрия PDF относятся к разным ревизиям");
        const result=reviewIndexedPlanPage({raw:textPage.page,vector,grid,
         marks,documentId:doc.id,sha256:doc.sha256,
         page:item.page,sheetType:item.sheetType});
        job.calibrated+=result.calibrated;job.labels+=result.foundLabels;
        job.contours+=result.contourHints;job.lastReason=result.reason;
        for(const r of result.regions){
         const key=[doc.id,doc.sha256,item.page,r.name].join(":");
         instanceResults.set(key,r.registry);dimensionResults.set(key,r.dimensions);
         for(const x of r.links.records)instanceLinks.set(x.instanceId,x);
         for(const x of r.dimensionLinks)instanceDimensionHints.set(x.instanceId,x)
        }
       }catch(error){
        job.errors++;job.lastReason=String(error.message||error).slice(0,150);
        job.failures.push((doc?.name||"PDF")+" · лист "+item.page+
         ": "+job.lastReason)
       }
       job.done++;
       status("Проверено "+job.done+"/"+job.total+
        " листов; калибровано схем: "+job.calibrated+
        "; ошибок: "+job.errors+". "+job.lastReason);
       const progress=host.querySelector?.("[data-lite-sweep-counts]");
       if(progress)progress.textContent="Проверено "+job.done+"/"+job.total+
        " листов · калибровано "+job.calibrated+
        " схем · надписей "+job.labels+" · гипотез контуров "+
        job.contours+" · ошибок "+job.errors
      }
     }catch(error){job.errors++;job.lastReason=String(error.message||error)}
     finally{
      job.running=false;busy=false;
      if(button)button.disabled=false;if(stop)stop.disabled=true;
      if(scan)scan.disabled=false;
      if(live){draw();status("Проверено "+job.done+"/"+job.total+
       " листов; калибровано "+job.calibrated+" схем; возможных контуров "+
       job.contours+"; ошибок "+job.errors+
       ". Координаты X/Y/Z конструкций ещё не подтверждены.")}
     }
    }
    async function analyzeInstances(index){
     const sheet=latest[index];if(!sheet||busy)return;
     const selected=host.querySelector("[data-lite-results]")?.querySelector?.(
      '[data-lite-axis-region="'+index+'"]')?.value||"auto",
      region=selected==="auto"?"full":selected;
     const doc=documents.find(d=>Number(d.id)===sheet.documentId),
      idx=indexes.find(x=>Number(x.documentId)===sheet.documentId&&
       x.sourceSha256===sheet.sha256);
     if(!doc?.exists||doc.sha256!==sheet.sha256||!idx){
      status("PDF изменился: повторите индексацию.");return
     }
     if(!pdf?.page||!marksApi?.list)return;
     busy=true;status("Считаем надписи на листе "+sheet.page+"…");
     try{
      const [detail,marks]=await Promise.all([
       pdf.page(objectId,idx.id,sheet.page),marksApi.list()]);
      if(!live)return;
      if(detail.source?.sha256!==doc.sha256||
         Number(detail.source?.documentId)!==Number(doc.id))
       throw Error("PDF изменился после индексации");
      let widthPt,heightPt,g=null;
      if(region!=="full"){
       if(!geometry?.page)throw Error("Для выбранной части нужен векторный модуль PDF");
       const key=[doc.id,doc.sha256,sheet.page].join(":");
       g=geometryCache.get(key);
       if(!g){
        g=await geometry.page(objectId,doc.id,sheet.page);
        if(!live)return;
        if(g.sourceSha256!==doc.sha256)throw Error("Устаревшая геометрия PDF");
        geometryCache.set(key,g)
       }
       if(Number(g.rotation||0)!==0)
        throw Error("Для повёрнутого PDF точное разделение областей пока не поддерживается");
       widthPt=g.widthPt;heightPt=g.heightPt
      }
      const result=extractPlanInstances({raw:detail.page,marks,
       documentId:doc.id,sha256:doc.sha256,page:sheet.page,
       region,widthPt,heightPt,sheetType:sheet.sheetType});
      let linked=null,dimensions=null,dimensionHints=[],linkMessage="";
      // Some genuine vector mounting sheets have an unreadable title.
      // Permit those ONLY after explicit region selection and a successful
      // independent calibration of at least 3 axes in each direction.
      // Known detail and section sheets remain excluded.
      if(region!=="full"&&result.labels.length&&
         !["detail","section"].includes(sheet.sheetType)){
       const grid=axisGeometry(await schemeApi?.list?.()||[]);
       const areas={
        left:{left:0,top:0,right:.5,bottom:1},
        right:{left:.5,top:0,right:1,bottom:1},
        "top-left":{left:0,top:0,right:.5,bottom:.5},
        "top-right":{left:.5,top:0,right:1,bottom:.5},
        "bottom-left":{left:0,top:.5,right:.5,bottom:1},
        "bottom-right":{left:.5,top:.5,right:1,bottom:1}
       };
       const analysis=detectPlanGridAxes({raw:detail.page,vector:g,
        grid,region:areas[region]});
       if(analysis.calibrated){
        const labels=result.labels.map(x=>({
         mark:x.mark,markId:x.markId,labelText:x.labelText,
         pageX:x.pageX,pageY:heightPt-x.pageYBottom,
         rectPt:x.rectPt,fragmentIds:x.fragmentIds
        }));
        const outlines=findPlanMemberStrokes({labels,analysis,grid,vector:g});
        linked=linkInstanceOutlineEvidence({instances:result.labels,
         registeredLabels:labels,outlines,heightPt});
        // Dimensions are source-backed, read-only clues; the closest
        // numerical label is NOT an offset of this member.
        dimensions=inspectPdfDimensionChains({
         raw:detail.page,analysis,vector:g,region:areas[region]});
        dimensionHints=nearDimensionEvidence({
         instances:result.labels,dimensions,heightPt});
        linkMessage="; гипотез контуров: "+
         (linked.summary.contour_candidate||0)+
         "; несколько вариантов: "+(linked.summary.multiple_contours||0)+
         "; требуется дополнительный анализ: "+
         (linked.summary.needs_more_evidence||0)+
         (outlines.limited?"; выборка линий неполная":"")+
         "; возможных размерных цепочек: "+dimensions.candidates.length+
         (dimensions.limited?"; выборка размеров неполная":"")+
         (!dimensions.candidates.length&&dimensions.reason?
          "; "+dimensions.reason:"");
       }else{
        linkMessage="; координаты осей не откалиброваны, геометрия не привязана"
       }
      }else if(region==="full"){
       linkMessage="; выберите отдельную схему для сопоставления с графикой"
      }else if(["section","detail"].includes(sheet.sheetType)){
       linkMessage="; это разрез/деталь: не считаем подписи новыми монтажными экземплярами"
      }
      const prefix=[doc.id,doc.sha256,sheet.page].join(":")+":";
      if(region==="full"){
       for(const k of instanceResults.keys())
        if(k.startsWith(prefix))instanceResults.delete(k)
      }else instanceResults.delete(prefix+"full");
      instanceResults.set(prefix+region,result);
      if(region==="full"){
       for(const k of dimensionResults.keys())
        if(k.startsWith(prefix))dimensionResults.delete(k)
      }else dimensionResults.delete(prefix+"full");
      dimensionResults.delete(prefix+region);
      if(dimensions)dimensionResults.set(prefix+region,dimensions);
      for(const item of result.labels)
       instanceDimensionHints.delete(item.instanceId);
      for(const item of dimensionHints)
       instanceDimensionHints.set(item.instanceId,item);
      // Replace review statuses for this source scope only. A new scan and
      // a new revision invalidate the in-memory geometry linkage.
      for(const item of result.labels)instanceLinks.delete(item.instanceId);
      if(linked)for(const item of linked.records)
       instanceLinks.set(item.instanceId,item);
      status("Лист "+sheet.page+", "+region+": "+result.total+
       " отдельных надписей"+linkMessage+". Монтажные координаты не подтверждены.");
      draw()
     }catch(error){status("Реестр марок: "+String(error.message||error))}
     finally{busy=false}
    }
    async function analyzeAxes(index){
     const sheet=latest[index],slot=host.querySelector("[data-lite-results]");
     const output=slot?.querySelector?.("[data-lite-axis-result]");
     if(!sheet||!output)return;
     if(!geometry?.page||!pdf?.page||!schemeApi?.list){
      output.textContent="Нужны PDF-индекс, сохранённая сетка и Windows Beta 1.7.224.";
      return
     }
     if(output.dataset?.busy==="true")return;
     if(output.dataset)output.dataset.busy="true";
     output.textContent="Ищем совпадения подписей осей с векторными линиями на листе…";
     try{
      const doc=documents.find(d=>Number(d.id)===sheet.documentId);
      const idx=indexes.find(x=>Number(x.documentId)===sheet.documentId&&
       x.sourceSha256===sheet.sha256);
      if(!doc?.exists||doc.sha256!==sheet.sha256||!idx)
       throw Error("Исходный PDF или его индекс изменился");
      const key=[doc.id,doc.sha256,sheet.page].join(":");
      let result=geometryCache.get(key);
      if(!result){
       result=await geometry.page(objectId,doc.id,sheet.page);
       if(!live)return;
       if(result.sourceSha256!==sheet.sha256||
          Number(result.documentId)!==Number(doc.id)||result.page!==sheet.page)
        throw Error("Векторный результат относится к другому исходному PDF");
       geometryCache.set(key,result)
      }
      const [pageData,rows,markRows]=await Promise.all([
       pdf.page(objectId,idx.id,sheet.page),schemeApi.list(),marksApi.list()
      ]);
      if(!live)return;
      if(pageData.source?.sha256!==sheet.sha256||
         Number(pageData.source?.documentId)!==Number(doc.id))
       throw Error("Текстовые фрагменты и геометрия относятся к разным PDF");
      const grid=axisGeometry(rows);
       const regions={
        full:{left:0,top:0,right:1,bottom:1},
        left:{left:0,top:0,right:.5,bottom:1},
        right:{left:.5,top:0,right:1,bottom:1},
        "top-left":{left:0,top:0,right:.5,bottom:.5},
        "top-right":{left:.5,top:0,right:1,bottom:.5},
        "bottom-left":{left:0,top:.5,right:.5,bottom:1},
        "bottom-right":{left:.5,top:.5,right:1,bottom:1}
       };
       const selected=slot?.querySelector?.('[data-lite-axis-region="'+index+'"]')?.value||"auto";
       const test=key=>detectPlanGridAxes({raw:pageData.page,vector:result,grid,region:regions[key]});
       const regionChoice=selectPlanRegion({selected,calibrate:test});
       const {analysis,regionName}=regionChoice;
       const zones=locateMarkLabelZones({candidates:sheet.marks,analysis,grid,
        heightPt:result.heightPt});
       const registerLabels=sheet.uncertainEncoding?
        {labels:[],reason:"Текстовый слой PDF имеет неопределённую кодировку"}:
        detectPlanRegisterLabels({raw:pageData.page,analysis,grid,marks:markRows,
         widthPt:result.widthPt,heightPt:result.heightPt});
       const candidateNodes=findAxisNodeCandidates({labels:registerLabels.labels,
        analysis,grid,vector:result});
       const memberOutlines=findPlanMemberStrokes({labels:registerLabels.labels,
        analysis,grid,vector:result});
       // A label can appear in several diagnostic categories. Show the
       // vector recognition status independently of the obsolete leader test.
       const lineLabels=new Set(memberOutlines.candidates.map(x=>x.label)),
        alternativeLabels=new Set(memberOutlines.alternatives.map(x=>x.label)),
        singleLabels=new Set(memberOutlines.singleStrokes.map(x=>x.label)),
        geometricLabels=new Set([...lineLabels,...alternativeLabels,...singleLabels]),
        withoutGeometry=Math.max(0,registerLabels.labels.length-geometricLabels.size);
       const label=x=>escDoc(x.name)+" · "+escDoc(x.mm)+" мм ↔ "+
       escDoc(Math.round(x.pagePt*100)/100)+" pt";
      const xRows=analysis.xMatches?.map(label)||[],
       yRows=analysis.yMatches?.map(label)||[];
      output.innerHTML='<section class="ir-ai-lite-geometry-summary">'+
       '<h4>Сводка распознавания геометрии</h4>'+
       '<p>Надписей из ведомости: <b>'+registerLabels.labels.length+
       '</b>; возможных пар контуров: <b>'+lineLabels.size+
       '</b>; с альтернативами: <b>'+alternativeLabels.size+
       '</b>; только одиночные линии: <b>'+singleLabels.size+
       '</b>; без подходящих линий: <b>'+withoutGeometry+
       '</b>; надписи вне границ сетки: <b>'+(registerLabels.outsideGrid||0)+
       '</b> (не размещены).</p>'+
       '<p><b>Готовых к автоматической расстановке: 0</b>. '+
       'Контуры ещё не подтверждены размерами, типом, привязками и отметками Z. '+
       'Требуют проверки геометрии: <b>'+memberOutlines.review.length+
       '</b>. Диагностика линий-выносок ниже — отдельная проверка, '+
       'а не общая статистика распознавания.</p>'+
       '</section><div class="ir-ai-vector-info"><b>Калибровка осей · '+
       escDoc(doc.name)+' · лист '+sheet.page+'</b>'+
       '<span>Область: '+escDoc(regionName)+' · Совпадений X: '+
        xRows.length+'/'+Number(analysis.xTotal||0)+
       ' · Y: '+yRows.length+'/'+Number(analysis.yTotal||0)+'</span>'+
       (regionChoice.multiplePlans?'<p class="ir-ai-axis-review">'+
        'На листе обнаружены разные схемы с повторяющимися осями. '+
        'Выберите одну часть листа возле кнопки «Найти оси на плане». '+
        'Общий анализ блокируется для предотвращения ложной расстановки.</p>':
        selected==="auto"&&(regionName==="left"||regionName==="right")?
        '<small>Отдельная область выбрана автоматически: '+
         (regionName==="left"?'левая':'правая')+
         '. Соседняя схема исключена из геометрического поиска.</small>':"")+
       '<p class="'+(analysis.calibrated?'ir-ai-axis-possible':'ir-ai-axis-review')+'">'+
       (analysis.calibrated?'Предварительно согласовано, проверьте чертёж. ':
        'Не подтверждено. ')+escDoc(analysis.reason)+'</p>'+
       (analysis.calibrated?'<small>Масштаб X: '+
        (Math.abs(analysis.fitX.scale)*1000).toFixed(2)+
        ' pt/м; Y: '+(Math.abs(analysis.fitY.scale)*1000).toFixed(2)+
        ' pt/м. Отклонение: '+
        Math.round((analysis.scaleMismatch||0)*1000)/10+
        '%. Это ещё не координаты колонн.</small>':"")+
       '</div><div class="ir-ai-axis-grids">'+
       '<div><strong>Оси X</strong><ol>'+xRows.map(x=>'<li>'+x+'</li>').join("")+
       '</ol></div><div><strong>Оси Y</strong><ol>'+
       yRows.map(x=>'<li>'+x+'</li>').join("")+'</ol></div></div>'+
       (zones.length?'<details class="ir-ai-axis-mark-zones"><summary>'+
        'Надписи марок в ячейках сетки · '+zones.length+
        '</summary><table><thead><tr><th>Марка</th><th>Между осями X</th>'+
        '<th>Между осями Y</th><th>Тип данных</th></tr></thead><tbody>'+
        zones.map(z=>'<tr><td>'+escDoc(z.mark)+'</td><td>'+
         escDoc(z.axesX.start)+'–'+escDoc(z.axesX.end)+'</td><td>'+
         escDoc(z.axesY.start)+'–'+escDoc(z.axesY.end)+'</td>'+
         '<td>Зона надписи; положение конструкции не определено</td></tr>').join("")+
        '</tbody></table></details>':"")+
       (registerLabels.labels.length?'<details class="ir-ai-axis-mark-zones">'+
        '<summary>Надписи марок из ведомости · '+
        registerLabels.labels.length+'</summary>'+
        '<p>Это координаты надписей на PDF, а не точки установки. '+
        'Без проверенных креплений и отметок Z автоматическая расстановка запрещена.</p>'+
        '<table><thead><tr><th>Марка</th><th>Оси X</th><th>Оси Y</th>'+
        '<th>Центр надписи, мм</th></tr></thead><tbody>'+
        registerLabels.labels.slice(0,200).map(z=>'<tr><td>'+escDoc(z.mark)+'</td>'+
         '<td>'+escDoc(z.axesX.start)+'–'+escDoc(z.axesX.end)+'</td>'+
         '<td>'+escDoc(z.axesY.start)+'–'+escDoc(z.axesY.end)+'</td>'+
         '<td>X≈'+z.labelXmm+', Y≈'+z.labelYmm+'</td></tr>').join("")+
        '</tbody></table>'+
        (registerLabels.labels.length>200?'<small>Показаны первые 200 надписей.</small>':"")+
        '</details>':'<p class="ir-ai-axis-review">'+escDoc(registerLabels.reason)+'</p>')+
       (registerLabels.ambiguous?'<p class="ir-ai-axis-review">'+
        'Неоднозначных марок в ведомости: '+registerLabels.ambiguous+'. Нужна проверка.</p>':"")+
       (registerLabels.labels.length?'<details class="ir-ai-axis-mark-zones">'+
        '<summary>Диагностика выносок (не итог распознавания) · '+
        candidateNodes.suggested.length+' линий к узлу; '+
        candidateNodes.nearby.length+' только рядом; '+
        candidateNodes.review.length+' без подтверждённой выноски</summary>'+
        '<p>Проверяются только линии-выноски от надписей к узлам. '+
        'На монтажных планах они часто отсутствуют. '+
        '<b>Отсутствие выноски не означает, что контур не найден.</b> '+
        '<b>Три разных результата:</b> линия от подписи к узлу PDF — графическая гипотеза; '+
        'ближайший узел без линии — только близость; всё остальное — ручная проверка. '+
        'Ни один вариант не является готовой монтажной координатой без размеров, типа и отметок Z.</p>'+
        (candidateNodes.suggested.length?'<table><thead><tr><th>Марка</th>'+
         '<th>Узел осей</th><th>Координаты узла, мм</th>'+
         '<th>Расстояние подписи, мм</th><th>Графика PDF</th></tr></thead><tbody>'+
         candidateNodes.suggested.slice(0,200).map(n=>'<tr><td>'+escDoc(n.mark)+'</td>'+
          '<td>'+escDoc(n.axisX)+' / '+escDoc(n.axisY)+'</td>'+
          '<td>X='+n.nodeXmm+', Y='+n.nodeYmm+'</td>'+
          '<td>≈'+n.offsetFromLabelMm+'</td>'+
          '<td>Линия к узлу; требует проверки '+
          '<button type="button" data-lite-node-source="'+registerLabels.labels.indexOf(n.label)+
          '">PDF</button></td></tr>').join("")+'</tbody></table>':
         '<p>Нет однозначной графической линии от надписи к узлу осей.</p>')+
        (candidateNodes.nearby.length?'<details>'+
         '<summary>Только близость к узлу, без подтверждающей линии · '+
         candidateNodes.nearby.length+'</summary>'+
         '<p>Расстояния ниже относятся к надписям на PDF, не к конструкциям.</p>'+
         '<table><thead><tr><th>Марка</th><th>Ближайшие оси</th>'+
         '<th>Координаты узла</th><th>От надписи</th><th>Источник</th></tr></thead><tbody>'+
         candidateNodes.nearby.slice(0,200).map(n=>'<tr><td>'+escDoc(n.mark)+'</td>'+
          '<td>'+escDoc(n.axisX)+' / '+escDoc(n.axisY)+'</td>'+
          '<td>X='+n.nodeXmm+', Y='+n.nodeYmm+'</td>'+
          '<td>≈'+n.offsetFromLabelMm+' мм</td>'+
          '<td><button type="button" data-lite-node-source="'+registerLabels.labels.indexOf(n.label)+
          '">PDF</button></td></tr>').join("")+'</tbody></table></details>':"")+
        (candidateNodes.review.length?'<details><summary>Требуют разбора · '+
         candidateNodes.review.length+'</summary>'+
         (candidateNodes.reviewSummary?.length?'<p><b>По причинам:</b> '+
          candidateNodes.reviewSummary.map(n=>escDoc({
           no_leader:"нет линии от надписи",node_collision:"несколько подписей у узла",
           ambiguous_neighbor:"несколько близких узлов",far_from_node:"нет близкого узла",
           no_vector_crossing:"нет пересечения линий",outside_region:"вне области"
          }[n.code]||n.code)+': '+n.count).join(' · ')+'</p>':"")+
         candidateNodes.review.slice(0,80).map(n=>'<div>'+escDoc(n.label.mark)+
          ': '+escDoc(n.reason)+'</div>').join("")+
         (candidateNodes.review.length>80?'<small>Показаны первые 80 причин.</small>':"")+
         '</details>':"")+
        '</details>':"");
       if(registerLabels.labels.length){
        output.innerHTML+='<details class="ir-ai-axis-mark-zones" open>'+
         '<summary>Векторные контуры возле марок · '+
          memberOutlines.candidates.length+' пар линий, '+
          memberOutlines.alternatives.length+' с альтернативами, '+
          memberOutlines.singleStrokes.length+' одиночных, '+
          memberOutlines.review.length+' требуют проверки геометрии</summary>'+
         '<small>Проверено локальных штрихов: '+memberOutlines.inspected+
         ' из '+memberOutlines.availableStrokes+'; режим: '+
         (memberOutlines.sampling==="local_tiles_short_medium_long"?
          'короткие, средние и длинные линии по областям PDF':'старый отбор длинных линий')+
         (memberOutlines.limited?' (неполная выборка)':'')+'</small>'+
         '<p>Анализируется реальная графика PDF, а не ближайшая ось или текст. '+
         'Две параллельные линии — <b>только возможный контур элемента</b>; '+
         'они могут также относиться к размерам и другим обозначениям. '+
         'При нескольких контурах ниже показаны варианты вместо случайного выбора. '+
         'Координаты ниже — координаты линий на плане, не подтверждённая монтажная геометрия. '+
         'Высота Z и тип элемента здесь не определяются.</p>'+
         (memberOutlines.limited?'<p class="ir-ai-axis-review">'+
          'Сложный PDF требует дополнительной проверки: выборка графических штрихов неполная. '+
          'Отсутствие контура не означает отсутствия конструкции.</p>':"")+
         (memberOutlines.candidates.length?
          '<div class="ir-ai-lite-preview-scroll"><table><thead><tr>'+
          '<th>Марка</th><th>Начало линии, мм</th><th>Конец линии, мм</th>'+
          '<th>Длина, мм</th><th>Статус</th><th>Чертёж</th>'+
          '</tr></thead><tbody>'+
          memberOutlines.candidates.slice(0,80).map(p=>'<tr>'+
           '<td>'+escDoc(p.mark)+'</td>'+
           '<td>'+p.lineMm.x1+' / '+p.lineMm.y1+'</td>'+
           '<td>'+p.lineMm.x2+' / '+p.lineMm.y2+'</td>'+
           '<td>≈'+p.lengthMm+'</td>'+
           '<td>Возможный парный контур; требуется проверка</td>'+
           '<td><button type="button" data-lite-outline-source="'+
            memberOutlines.candidates.indexOf(p)+'">Показать линии</button></td>'+
          '</tr>').join("")+'</tbody></table></div>'+
          (memberOutlines.candidates.length>80?'<small>Показаны первые 80 гипотез.</small>':""):
          '<p>Однозначных пар графических линий рядом с марками пока нет.</p>')+
         (memberOutlines.alternatives.length?'<details class="ir-ai-axis-alternatives">'+
          '<summary>Несколько похожих контуров возле марки · '+
           memberOutlines.alternatives.length+'</summary>'+
          '<p>Для каждой надписи показаны до трёх различных графических гипотез. '+
          'Порядок определяется расстоянием от надписи, <b>не достоверностью монтажа</b>. '+
          'Проверьте линии и размеры по исходному КМД. Ничего не размещено.</p>'+
          '<div class="ir-ai-lite-preview-scroll"><table><thead><tr>'+
           '<th>Марка</th><th>Вариант</th><th>Начало, мм</th>'+
           '<th>Конец, мм</th><th>Длина графики, мм</th>'+
           '<th>От надписи, pt</th><th>PDF</th></tr></thead><tbody>'+
          memberOutlines.alternatives.slice(0,150).map(group=>
           group.options.map(p=>'<tr>'+
            '<td>'+escDoc(group.mark)+'</td>'+
            '<td>'+p.rank+' из '+group.totalOptions+'</td>'+
            '<td>'+p.lineMm.x1+' / '+p.lineMm.y1+'</td>'+
            '<td>'+p.lineMm.x2+' / '+p.lineMm.y2+'</td>'+
            '<td>≈'+p.lengthMm+'</td><td>≈'+p.distancePt+'</td>'+
            '<td><button type="button" data-lite-alt-source="'+
             memberOutlines.alternatives.indexOf(group)+':'+group.options.indexOf(p)+
             '">Показать линии</button></td></tr>'
           ).join("")).join("")+'</tbody></table></div>'+
          '</details>':"")+
         (memberOutlines.singleStrokes.length?'<details>'+
          '<summary>Одиночные линии рядом с надписями · '+
           memberOutlines.singleStrokes.length+'</summary>'+
          '<p>Одна линия не доказывает существование контура.</p>'+
          '<table><thead><tr><th>Марка</th><th>Начало, мм</th>'+
          '<th>Конец, мм</th><th>PDF</th></tr></thead><tbody>'+
          memberOutlines.singleStrokes.slice(0,60).map(p=>'<tr>'+
           '<td>'+escDoc(p.mark)+'</td>'+
           '<td>'+p.lineMm.x1+' / '+p.lineMm.y1+'</td>'+
           '<td>'+p.lineMm.x2+' / '+p.lineMm.y2+'</td>'+
           '<td><button type="button" data-lite-node-source="'+
            registerLabels.labels.indexOf(p.label)+'">PDF</button></td></tr>').join("")+
          '</tbody></table></details>':"")+
         (memberOutlines.review.length?'<details><summary>'+
          'Почему не определена геометрия · '+memberOutlines.review.length+'</summary>'+
          (memberOutlines.summary?.length?'<p>'+
           memberOutlines.summary.map(x=>escDoc({
            single_stroke:"найдена только одиночная линия",
            no_strokes:"нет подходящих векторных штрихов",
            multiple_outlines:"несколько похожих контуров",
            shared_strokes:"контур связан с несколькими марками",
            outside_plan:"надпись вне области",
            incomplete_geometry:"векторная геометрия неполная",
            uncalibrated:"нет калибровки"
           }[x.reason]||x.reason)+': '+x.count).join(' · ')+'</p>':"")+
          memberOutlines.review.slice(0,35).map(x=>'<div>'+escDoc(x.label.mark)+
           ': '+escDoc(x.reason)+'</div>').join("")+
          (memberOutlines.review.length>35?'<small>Показаны первые 35 замечаний.</small>':"")+
          '</details>':"")+
         '</details>'
       }
       // Read-only visual evidence; never a DB/scheme mutation.
       const openGeometry=(label,lines)=>{
        if(!label||!Array.isArray(lines)||lines.length!==2)return;
        onOpenPdf?.(doc.id,sheet.page,[{quote:label.labelText,
         rectPt:label.rectPt,fragmentIds:label.fragmentIds,
         strokeLinesPt:lines}])
       };
       output.querySelectorAll?.("[data-lite-outline-source]")?.forEach(button=>{
        button.onclick=()=>{
         const item=memberOutlines.candidates[Number(button.dataset.liteOutlineSource)];
         if(item)openGeometry(item.label,item.strokesPt)
        }
       });
       output.querySelectorAll?.("[data-lite-alt-source]")?.forEach(button=>{
        button.onclick=()=>{
         const value=String(button.dataset.liteAltSource||"").split(":");
         if(value.length!==2)return;
         const group=memberOutlines.alternatives[Number(value[0])];
         const choice=group?.options?.[Number(value[1])];
         if(group&&choice)openGeometry(group.label,choice.strokesPt)
        }
       });
       output.querySelectorAll?.("[data-lite-node-source]")?.forEach(button=>{
        button.onclick=()=>{
         const label=registerLabels.labels[Number(button.dataset.liteNodeSource)];
         if(label)onOpenPdf?.(doc.id,sheet.page,[{quote:label.labelText,
          rectPt:label.rectPt,fragmentIds:label.fragmentIds}])
        }
       });
       output.scrollIntoView?.({block:"nearest",behavior:"smooth"})
     }catch(error){
      output.textContent="Не удалось сопоставить оси: "+String(error.message||error)
     }finally{if(output.dataset)output.dataset.busy="false"}
    }
    async function analyzeVector(index){
     const selected=latest[index];
     if(!selected)return;
     const root=host.querySelector("[data-lite-results]");
     const area=root?.querySelector?.("[data-lite-vector-result]");
     if(!area)return;
     if(!geometry?.page){
      area.textContent="Для анализа графических линий требуется Windows Beta 1.7.224.";
      return
     }
     if(area.dataset?.busy==="true")return;
     if(area.dataset)area.dataset.busy="true";
     area.textContent="Читаем векторные линии листа "+selected.page+
      ". Это графика PDF, а не подтверждённые оси сооружения…";
     try{
      const doc=documents.find(d=>Number(d.id)===Number(selected.documentId));
      if(!doc||doc.sha256!==selected.sha256||!doc.exists)
       throw Error("Исходный PDF изменён или не найден");
      const key=[doc.id,doc.sha256,selected.page].join(":");
      let result=geometryCache.get(key);
      if(!result){
       result=await geometry.page(objectId,doc.id,selected.page);
       if(!live)return;
       if(result.sourceSha256!==doc.sha256||result.documentId!==doc.id||
          result.page!==selected.page||!Array.isArray(result.segments))
        throw Error("Ответ геометрического анализатора не соответствует исходному PDF");
       geometryCache.set(key,result)
      }
      const width=Number(result.widthPt),height=Number(result.heightPt);
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
       throw Error("Некорректный размер страницы");
      const list=result.segments.filter(v=>[v.x1,v.y1,v.x2,v.y2].every(Number.isFinite))
       .slice(0,400);
      const lines=list.map(v=>'<line x1="'+v.x1+'" y1="'+v.y1+
       '" x2="'+v.x2+'" y2="'+v.y2+'" class="ir-ai-vector-'+
       (["horizontal","vertical"].includes(v.direction)?v.direction:"diagonal")+
       '"/>').join("");
      area.innerHTML='<div class="ir-ai-vector-info"><b>Графика PDF · '+escDoc(doc.name)+
       ' · лист '+selected.page+'</b>'+
       '<span>Отрезков сохранено: '+Number(result.stats?.storedSegments||0)+
       (result.stats?.truncated?' (ограничен только предпросмотр)':'')+
        ' · Соосных групп: '+Number(result.stats?.axisBandCount||0)+
       ' · горизонтальных: '+Number(result.stats?.horizontal||0)+
       ' · вертикальных: '+Number(result.stats?.vertical||0)+
       ' · диагональных: '+Number(result.stats?.diagonal||0)+'</span>'+
       '<small>Линии извлечены из векторного PDF. Их совпадение с осями и строительными размерами ещё не проверено. Координаты в пунктах листа, НЕ в миллиметрах здания.</small></div>'+
       (list.length?'<svg viewBox="0 0 '+width+' '+height+
         '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Векторные линии PDF">'+
         lines+'</svg>':
         '<p>Векторных штрихов не найдено: для сканированных листов потребуется OCR и визуальный анализ.</p>');
      area.scrollIntoView?.({block:"nearest",behavior:"smooth"})
     }catch(error){
      area.textContent="Не удалось прочитать линии листа: "+String(error.message||error)
     }finally{if(area.dataset)area.dataset.busy="false"}
    }
    async function scan(){
     if(busy)return;busy=true;let completed=false;
     status("Читаем PDF и подготавливаем автоматическую проверку геометрии…");
     latest=[];candidates=[];batch=null;verifiedPreview=null;feedbackByCandidate.clear();
     sweep=null;instanceLinks.clear();instanceDimensionHints.clear();dimensionResults.clear();
      instanceResults.clear();instanceRows=[];
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
      const markRows=await marksApi.list();
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
         uncertainEncoding:p.uncertainEncoding===true,registeredMarks:markRows});
        latest.push(row);candidates.push(...row.marks);
         // Read-only PDF text evidence, never a placement.
         instanceResults.set([doc.id,doc.sha256,p.page,"full"].join(":"),
          extractPlanInstances({raw:detail.page,marks:markRows,documentId:doc.id,
           sha256:doc.sha256,page:p.page,sheetType:row.sheetType}))
       }catch(error){status("Ошибка чтения листа "+p.page+": "+String(error.message||error).slice(0,180))}
      }
      if(live){
       if(mounting?.drafts){
        try{draftRows=await mounting.drafts(objectId)||[]}
        catch(error){status("Черновики пока недоступны: "+String(error.message||error))}
       }
       const [schemeRows,workRows]=await Promise.all([schemeApi.list(),workApi.list()]);
       batch=buildBatchPlan({candidates,pages:latest,marks:markRows,
        schemeRows,workRows});
      }
      status("Быстрое извлечение завершено: "+latest.length+" из "+allEntries.length+
       " листов, "+candidates.length+" возможных марок. "+
       (allEntries.length>250?"За один запуск проверяются первые 250 листов; оставшиеся пока не обработаны. ":"")+
       "Неразборчивые PDF не интерпретировались.");
      draw();if(allButton)allButton.disabled=false;
      completed=true
     }catch(error){status("Не удалось проверить PDF: "+String(error.message||error))}
     finally{
      busy=false;
      const scanBtn=host.querySelector("[data-lite-scan]");
      if(scanBtn)scanBtn.disabled=false;
      // One user action: read text, then inspect the graphical plans.
      // Allow tests that exercise ONLY manual controls to disable this
      // second phase; the normal app enables it by default.
      if(completed&&live&&opts.autoGeometrySweep!==false&&geometry?.page)
       void reviewAllIndexedPlans()
     }
    }
    async function verifyEditor(){
     // The AI page is an offline user tool. No passwords or expiring
     // engineer session; placement still has explicit confirmation and
     // backend checks the register, source SHA, axes and transaction.
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
    async function automaticPreview(){
     if(busy)return;busy=true;
     const button=host.querySelector("[data-lite-auto]");if(button)button.disabled=true;
     status("Готовим авторасстановку по всем актуальным индексам PDF…");
     try{
      if(!mounting?.preview||!mounting?.apply)throw Error("Модуль расстановки недоступен");
      const request={mode:"automatic"},preview=await mounting.preview(objectId,request);
      if(!live)return;
      verifiedPreview={proposals:request,preview};draw();
      status(preview.ready.length?"Авторасстановка подготовлена. Проверьте таблицу и нажмите «Применить».":
       "Готовых размещений пока нет. Причины показаны красным; уточните привязки в карточках марок.");
     }catch(error){status("Авторасстановка: "+String(error.message||error))}
     finally{busy=false;if(button)button.disabled=false}
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
    const autoButton=host.querySelector("[data-lite-auto]");
    if(autoButton)autoButton.onclick=()=>void automaticPreview();
    const allButton=host.querySelector?.("[data-lite-analyze-all]");
    if(allButton)allButton.onclick=()=>void reviewAllIndexedPlans();
    const cancelButton=host.querySelector?.("[data-lite-cancel-analyze]");
    if(cancelButton)cancelButton.onclick=()=>{
     if(sweep?.running)sweep.cancel=true;
     status("Остановка после текущего листа…")
    };
    host.querySelector("[data-lite-scheme]").onclick=()=>onNavigate?.("scheme");
    const clear=host.querySelector("[data-lite-clear]");
    if(clear)clear.onclick=async()=>{
     if(busy)return;
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
 const exported={createPage,extractPage,classSheet,readElevation,lengthHint,axisPair,axisSpan,axisGeometry,payloadFor,buildBatchPlan,fragmentEvidence,matchesDraft,detectPlanGridAxes,locateMarkLabelZones,detectPlanRegisterLabels,findAxisNodeCandidates,findPlanMemberStrokes,selectPlanRegion,extractPlanInstances,linkInstanceOutlineEvidence,inspectPdfDimensionChains,nearDimensionEvidence,reviewIndexedPlanPage,detectFramedPlanRegions,detectStackedPlanRegions};
 if(typeof module!=="undefined"&&module.exports)module.exports=exported;
 if(root&&typeof root==="object")root.irAiSchemeLitePage=createPage()
})(typeof window!=="undefined"?window:null);
