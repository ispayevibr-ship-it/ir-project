"use strict";
/* IR Project: everything of a sheet the special readers do not take — by rules, for any drawing (КМ, КМД, АР, ТХ).
   The engineer, 13.11.2026: «измени правила чтобы все брал по листам всем, без разницы км, кмд, ар, тх». Until 1.12.120
   the rules took the schemes, sections, assembly sheets and АР tables; the rest of a sheet — the general notes, the
   tables of steel and loads, the details of the nodes, the sketches of the flashings, the free levels and dimensions —
   went to Claude only as text. Now every sheet gives `details`:
   - notes: the numbered notes and paragraphs of text, each whole, in the order of their column;
   - requirements: what the notes require — steel grades, bolts (diameter, class), welding (electrodes, wire), weld legs,
     coating (primer, enamel, RAL, thickness), fire protection, corrosion, loads, norms — each with its sentence;
   - tables: every table of the sheet, its head and rows by cells, with its kind (steel, loads, floors, fixings,
     openings, panels, list of sheets, other) and for a table of steel its rows of profile, grade and mass;
   - views: every view of the sheet by its title (Узел, Разрез, Сечение, Вид, Схема, План, Фасад, Деталь, Поз.) with what
     is written on it: plates, profiles, bolts, welds, positions, marks, levels, dimensions, the rest of its text;
   - trims: the sketches of flashings «Поз. N» — their outline by the thick lines, scaled by its dimensions: the legs in
     mm and the bends in degrees;
   - title: the large lettering of a title sheet;
   - counts: how many labels of the sheet went where (none left out). */

const LEVEL=/^[+\-−±]?\d{1,2}[,.]\d{3}$/u;
const DIM=/^[~≈]?\d{2,6}(?:[,.]\d)?\*?$/u;
const MARK=/^[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z]{0,4}[-\s]?\d{1,3}(?:[.\-]\d{1,2})?[а-яa-z]?$/u;
const AXIS=/^(?:[А-ЯЁ]\d?|\d{1,2}[а-я]?|0\d{1,2}(?:\/\d)?)$/u;
const PLATE=/^[-–—−]\s?\d{1,2}(?:[,.]\d)?\s*[xх×*]\s*\d{2,4}(?:\s*[xх×*]\s*\d{2,5})?/u;
const PROFILE=/(?:^|\s)(L\s?\d{2,3}\s*[xх×]\s*\d{1,3}(?:\s*[xх×]\s*\d{1,2})?|∟\s?\d{2,3}\s*[xх×]\s*\d{1,2}|\[\s?\d{1,2}[ПУПа-я]*|I\s?\d{2}[А-ЯБКШ]\d?|\d{2}[БКШ]\d|□\s?\d{2,3}\s*[xх×]\s*\d{1,2}(?:[,.]\d)?|гн\.?\s?\[?\s?\d{2,3}\s*[xх×]\s*\d{2,3}\s*[xх×]\s*\d|Тр\.?\s?\S+|Ø\s?\d{1,3}(?:\s*[xх×]\s*\d{1,2}(?:[,.]\d)?)?)/u;
const BOLT=/(?:^|[^А-ЯЁA-Za-z])(М\s?\d{2})(?:\s*[xх×]\s*\d{2,3})?/u;
const WELD=/(?:[kк]\s?[fф]\s*=?\s*\d{1,2}|катет\S*\s*\d{1,2}|^\d{1,2}\s*[▷◁⊿]|Ш\d+|по\s+контуру)/iu;
const POS=/^(?:поз\.?\s*)?(\d{1,3})$|поз\s*\.?\s*(\d{1,3})/iu;
const TITLE=/^(Узел|Узлы|Разрез|Сечение|Вид|Схема|План|Фасад|Деталь|Фрагмент|Развертка|Развёртка|Поз\s*\.?)\s*/iu;

function frameOf(t){
 const str=String(t?.str||"").replace(/\s+/gu," ").trim(),h=Math.max(1,Number(t?.size)||8),ang=((Number(t?.angle)||0)%360+360)%360;
 const vert=Math.abs(ang-90)<20||Math.abs(ang-270)<20,w=Math.max(h*.5,Number(t?.width)||str.length*h*.55);
 const x=Number(t?.x)||0,y=Number(t?.y)||0;
 // (pdf text sits on its baseline: y is the bottom of the letters)
 const c=vert?{x:x-h*.36,y:y-w/2}:{x:x+w/2,y:y-h*.36};
 return{str,h,vert,c,x0:vert?x-h:x,x1:vert?x:x+w,y0:vert?y-w:y-h,y1:y}
}

// Lines of horizontal text: the runs of one baseline a little apart joined.
function linesOf(items){
 const hz=items.filter(t=>!t.vert).sort((p,q)=>p.y1-q.y1||p.x0-q.x0),out=[];
 for(const t of hz){
  const l=out.findLast?out.findLast(o=>Math.abs(o.y1-t.y1)<Math.min(o.h,t.h)*.45&&t.x0-o.x1<Math.min(o.h,t.h)*1.6&&t.x0>=o.x0-1):null;
  if(l){l.str+=(t.x0-l.x1>l.h*.15?" ":"")+t.str;l.x1=Math.max(l.x1,t.x1);l.n++}
  else out.push({str:t.str,x0:t.x0,x1:t.x1,y1:t.y1,h:t.h,n:1})
 }
 return out
}
// Paragraphs: lines under each other in one column — the next line 0,8…2,4 heights lower, its start within 4 heights.
function paragraphsOf(lines){
 const sorted=[...lines].sort((p,q)=>p.y1-q.y1||p.x0-q.x0),open=[],out=[];
 for(const l of sorted){
  let best=null,score=Infinity;
  for(const p of open){const last=p.lines[p.lines.length-1],dy=l.y1-last.y1,h=Math.min(l.h,last.h);
   if(Math.abs(l.h-last.h)>h*.35||dy<h*.8||dy>h*2.4)continue;
   const dx=Math.abs(l.x0-p.x0);if(dx>h*4)continue;if(l.x0>last.x1||l.x1<p.x0)continue;
   const s=dx+dy;if(s<score){score=s;best=p}}
  if(best)best.lines.push(l);else{const p={x0:l.x0,lines:[l]};open.push(p);out.push(p)}
  // (paragraphs left far above are closed)
  for(let i=open.length-1;i>=0;i--){const last=open[i].lines[open[i].lines.length-1];if(l.y1-last.y1>last.h*6)open.splice(i,1)}
 }
 return out.map(p=>({x:Math.round(p.x0),y:Math.round(p.lines[0].y1-p.lines[0].h),h:p.lines[0].h,text:p.lines.map(l=>l.str).join(" ").replace(/\s+-\s+/gu,"-").replace(/\s+/gu," ").trim(),n:p.lines.length}))
}
const wordy=s=>(String(s).match(/[А-ЯЁа-яёA-Za-z]{3,}/gu)||[]).length;
// The notes: paragraphs of words, split at their numbers «1.», «2)» where a numbered list is written as one column.
function notesOf(paragraphs){
 const out=[];
 for(const p of paragraphs){
  if(wordy(p.text)<4||p.text.length<25)continue;
  const parts=p.text.split(/(?<=[.;:!?]\s|^)(?=\d{1,2}[.)]\s+[А-ЯЁA-Z«"])/u).map(s=>s.trim()).filter(Boolean);
  for(const s of parts){const m=/^(\d{1,2})[.)]\s+/u.exec(s);out.push({...(m?{n:Number(m[1])}:{}),text:m?s.slice(m[0].length):s,at:{x:p.x,y:p.y}})}
 }
 return out
}

// Requirements of the notes: each kind with its values and the sentence they come from.
const sentences=text=>String(text).split(/(?<=[.;])\s+(?=[А-ЯЁA-Z«"\d])/u).map(s=>s.trim()).filter(s=>s.length>4);
function requirementsOf(notes){
 const req={steel:[],bolts:[],welding:[],welds:[],coating:[],fire:[],corrosion:[],loads:[],norms:[],gussets:[]};
 const add=(k,value,text)=>{const v=String(value).replace(/\s+/gu," ").trim();if(!v)return;const r=req[k].find(x=>x.value===v);if(r){if(r.text.length<2)r.text.push(text.slice(0,240))}else req[k].push({value:v,text:[text.slice(0,240)]})};
 const norm=new Set();
 for(const n of notes)for(const s of sentences(n.text)){
  let m;
  const steel=/(?:^|[^А-ЯЁA-Za-z\d])(С\s?(?:2[3-9]\d|3[0-9]\d|4[0-4]\d)(?:-\d)?|\d{2}Г2С(?:Д)?|\d{2}ХГ\S*|ВСт\s?3\s?\S{0,4}|Ст\s?3\s?(?:сп|пс|кп)\d?|S\d{3}[A-Z]{0,3})(?![\d])/gu;
  while((m=steel.exec(s)))if(/стал|марк|прокат|конструкц|лист|плит|элемент|ГОСТ\s*27772|ГОСТ\s*19281|ГОСТ\s*380/iu.test(s))add("steel",m[1].replace(/\s/gu,""),s);
  if(/болт|гайк|шайб|анкер|шпильк/iu.test(s)){
   const d=[...new Set((s.match(/М\s?\d{2}/gu)||[]).map(x=>x.replace(/\s/gu,"")))],cls=(/класс\S*\s+прочности\s*(\d{1,2}\.\d)/iu.exec(s)||/(?:^|\s)(\d{1,2}\.\d)(?:\s|$|,)/u.exec(s)||[])[1],
    gost=(/ГОСТ\s?(?:Р\s?)?(?:ISO\s?)?[\d\-–.*]+/iu.exec(s)||[])[0],hs=/высокопрочн/iu.test(s),acc=(/класса?\s+точности\s+([АВС])/iu.exec(s)||[])[1];
   if(d.length||cls||hs)add("bolts",[d.join(", "),cls?"кл. "+cls:"",acc?"точн. "+acc:"",hs?"высокопрочные":"",gost||""].filter(Boolean).join(" "),s)}
  const el=/электрод\S*[^.]{0,40}?(Э\s?\d{2}А?)/iu.exec(s)||/(Э\s?(?:42|46|50)А?)(?![\d])/u.exec(s);if(el)add("welding","электроды "+el[1].replace(/\s/gu,""),s);
  const wire=/(Св\s?-\s?\d{2}\S*)/u.exec(s);if(wire)add("welding","проволока "+wire[1].replace(/\s/gu,""),s);
  if(/полуавтомат|автоматическ\S*\s+сварк|ручн\S*\s+(?:дугов\S*\s+)?сварк/iu.test(s))add("welding",/полуавтомат/iu.test(s)?"полуавтоматическая сварка":/автоматическ/iu.test(s)?"автоматическая сварка":"ручная дуговая сварка",s);
  const leg=/катет\S*[^.]{0,60}?(\d{1,2})\s*мм/iu.exec(s)||/[kк]\s?[fф]\s*=\s*(\d{1,2})/iu.exec(s);if(leg)add("welds","катет "+leg[1]+" мм",s);
  if(/непрерывн\S*\s+(?:сварн\S*\s+)?шв|сплошн\S*\s+шв|по\s+контуру/iu.test(s)&&/шв|свар/iu.test(s))add("welds",/по\s+контуру/iu.test(s)?"швы по контуру":"швы сплошные",s);
  const coat=/(?:^|[^А-ЯЁA-Za-z])((?:ГФ|ПФ|ХВ|ЭП|АК|КО|ХС|ЭФ|ФЛ|УР|АУ|ЦВЭС|Цинотан|Цинол)\s?-?\s?\d{2,4}(?:-\d{2})?[А-ЯЁA-Z]{0,2})/gu;
  while((m=coat.exec(s))){const v=m[1].replace(/\s/gu,"").replace(/[.,;]+$/u,"").replace(/^([А-ЯЁA-Z]+)-?(\d)/u,"$1-$2");if(!/^грунт/iu.test(v))add("coating",v,s)}
  const ral=/RAL\s?(\d{4})/gu;while((m=ral.exec(s)))add("coating","RAL "+m[1],s);
  const thick=/(\d{2,3})\s*мкм/u.exec(s);if(thick&&/покрыт|слой|грунт|эмал|окрас|лакокрас/iu.test(s))add("coating","толщина "+thick[1]+" мкм",s);
  if(/грунт\S*|эмал\S*|окрас\S*|лакокрас/iu.test(s)&&!/(ГФ|ПФ|ХВ|ЭП|АК|КО|ХС)\s?-?\s?\d/u.test(s)&&/металл|конструкц|стал/iu.test(s))add("coating",/грунт/iu.test(s)?"грунтовка":/эмал/iu.test(s)?"эмаль":"окраска",s);
  if(/огнезащит|огнестойк|\bR\s?\d{2,3}\b/iu.test(s)){const r=/\bR\s?(\d{2,3})\b/u.exec(s);add("fire",r?"R "+r[1]:/огнезащит/iu.test(s)?"огнезащита":"огнестойкость",s)}
  if(/агрессивн|степень\s+(?:агрессивн|воздейств)|коррози/iu.test(s))add("corrosion",(/(слабо|средне|сильно|не)агрессивн\S*/iu.exec(s)||[])[0]||"защита от коррозии",s);
  const load=/(снегов\S*|ветров\S*|кранов\S*|гололёдн\S*|гололедн\S*|сейсмичност\S*|нагрузк\S*)[^.]{0,80}?(\d+(?:[,.]\d+)?)\s*(кПа|кН\/м2|кН\/м²|кН|кгс\/м2|тс|т|балл\S*)/iu.exec(s);
  if(load)add("loads",load[1]+" "+load[2]+" "+load[3],s);
  const g=/толщин\S*\s+(?:всех\s+)?фасон\S*(?:\s+[а-яё]+){0,2}?\s*[—–-]?\s*(\d{1,2})\s*мм/iu.exec(s)||/фасон\S*(?:\s+[а-яё]+){0,2}?\s*(?:толщин\S*|t\s*=|δ\s*=?)\s*(\d{1,2})(?:[,.]\d)?\s*мм/iu.exec(s);
  if(g&&+g[1]>=4&&+g[1]<=40)add("gussets","фасонки t = "+g[1]+" мм",s);
  const nr=/(?:^|[\s(«"])((?:СП|СН|СНиП|ГОСТ|ТР\s?ТС|СТ\s?РК|EN|ISO|МСН|РДС|ТУ)\s?(?:РК\s|Р\s)?[\dА-Я][\d.\-–*/А-Я]{1,24}(?:-\d{2,4})?)/gu;
  while((m=nr.exec(s))){const v=m[1].replace(/\s+/gu," ").replace(/[.,;\-–]+$/u,"");if(!norm.has(v)){norm.add(v);req.norms.push({value:v,text:[s.slice(0,240)]})}}
 }
 for(const k of Object.keys(req)){req[k]=req[k].slice(0,40);if(!req[k].length)delete req[k]}
 return req
}

// Tables: blocks of the sheet with rows of cells (sheetText: rows « / », cells « | »).
function kindOfTable(text){
 const t=String(text);
 if(/масса|вес\b|кг|т\s*\|/iu.test(t)&&/профил|сортамент|марка\s+стал|наименование\s+проф|ГОСТ|прокат/iu.test(t))return"steel";
 if(/(?:^|[\s|])[NQM]\s*(?:,|\(|\|)|усили|нагрузк|реакци|кН/u.test(t)&&/кН|кН[·*]м|т[·*]м|тс/u.test(t))return"loads";
 if(/тип\s+пола|экспликац\S*\s+пол|покрыти\S*\s+пол|пол\S*\s+тип/iu.test(t))return"floors";
 if(/ККУ|КПГШ|саморез|заклёп|заклеп|дюбел|утеплит|уплотнит|герметик|крепёж|крепеж|анкер/iu.test(t))return"fixings";
 if(/проём|проем|окн|двер|ворот/iu.test(t)&&/марк|обознач/iu.test(t))return"openings";
 if(/Пс-|Пк-|сэндвич|панел/iu.test(t))return"panels";
 if(/ведомость\s+(?:рабочих\s+)?чертеж|ссылочн|прилагаем/iu.test(t))return"sheets";
 if(/фасонн|нащельник|отлив|планк/iu.test(t))return"trims";
 if(/болт|гайк|шайб|метиз/iu.test(t))return"fasteners";
 return"other"
}
function steelRow(cells){
 const s=cells.join(" "),prof=PROFILE.exec(" "+s)?.[1]||PLATE.exec(s)?.[0]||"";
 const grade=(/(?:^|\s)(С\s?\d{3}(?:-\d)?|\d{2}Г2С\S*|Ст3\S*)/u.exec(s)||[])[1]||"";
 const nums=cells.map(c=>String(c).trim()).filter(c=>/^\d+(?:[,.]\d+)?$/u.test(c)).map(c=>Number(c.replace(",",".")));
 return prof||grade?{profile:prof.trim(),steel:grade.replace(/\s/gu,""),numbers:nums.slice(-4)}:null
}
function tablesOf(blocks){
 const out=[];
 for(const b of blocks||[]){
  const rows=String(b.text||"").split(" / ").map(r=>r.split(" | ").map(c=>c.trim()).filter(Boolean));
  if(rows.filter(r=>r.length>=2).length<2)continue;
  const kind=kindOfTable(b.text);
  const tab={at:{x:b.x,y:b.y},kind,head:rows[0].slice(0,20),rows:rows.slice(1,240).map(r=>r.slice(0,20))};
  if(kind==="steel"){const st=tab.rows.map(steelRow).filter(Boolean);if(st.length)tab.steel=st.slice(0,200)}
  out.push(tab)
 }
 return out.slice(0,80)
}

// Views: each title of a view, and the labels nearest it from below and beside (a title stands over its view; the
// label of a sketch «Поз. 54» — over its sketch).
function viewsOf(items,segments,W=0,H=0){
 // (the stamp — 185×55 mm in the lower right corner — and the strip of signatures along the left edge are not of a view)
 const stamp=t=>W>0&&H>0&&(t.c.x>W-540&&t.c.y>H-170||t.c.x<70);
 // (КМ, КМД: a node is titled by its number in a circle, a section by «13-13», «Б-Б» — written larger than the rest)
 const hs=items.map(t=>t.h).sort((a,b)=>a-b),med=hs[Math.floor(hs.length/2)]||8;
 const named=t=>{if(TITLE.test(t.str)&&t.str.length<=90&&!/^(Схема|План|Узел|Разрез)\s*$/iu.test(t.str)&&!/^поз\.?\s*$/iu.test(t.str))return t.str;
  if(t.h<med*1.4||t.vert)return null;
  if(/^\d{1,3}[а-я]?$/u.test(t.str))return"Узел "+t.str;
  if(/^(?:\d{1,2}[а-я]?\s*-\s*\d{1,2}[а-я]?|[А-ЯЁ]\s*-\s*[А-ЯЁ])$/u.test(t.str))return"Разрез "+t.str.replace(/\s+/gu,"");
  return null};
 const titles=items.filter(t=>{const n=named(t);if(n)t.title=n;return Boolean(n)});
 if(!titles.length)return[];
 const sizeOf=t=>t.h;
 const views=titles.map(t=>({title:t.title,at:{x:Math.round(t.c.x),y:Math.round(t.c.y)},t,b:{x0:t.c.x,y0:t.c.y-t.h,x1:t.c.x,y1:t.c.y},plates:new Set(),profiles:new Set(),steel:new Set(),refs:new Set(),bolts:new Set(),welds:new Set(),positions:new Set(),marks:new Set(),levels:new Set(),dims:new Set(),text:[]}));
 const owner=c=>{let best=null,score=Infinity;
  for(const v of views){const t=v.t,dy=c.y-t.c.y;if(dy<-sizeOf(t)*1.5)continue;const dx=Math.abs(c.x-t.c.x),s=Math.max(0,dy)+dx*.7+(dy<0?-dy*3:0);if(s<score&&s<900){score=s;best=v}}
  return best};
 for(const t of items){
  if(titles.includes(t)||stamp(t))continue;const v=owner(t.c);if(!v)continue;const s=t.str;
  // (the frame of the view by its labels — the piece of the sheet a picture of the node is cut from, 1.12.140)
  v.b.x0=Math.min(v.b.x0,t.c.x);v.b.x1=Math.max(v.b.x1,t.c.x);v.b.y0=Math.min(v.b.y0,t.c.y);v.b.y1=Math.max(v.b.y1,t.c.y);
  if(/^(?:С|C)\s?\d{3}(?:-\d)?$/u.test(s)){v.steel.add(s.replace(/\s/gu,"").replace(/^C/u,"С"));continue}
  if(/^(?:КМД?|АР|ТХ|КЖ)\s?\d*\s?-\s?\d{1,3}$|^(?:см\.\s*)?л(?:ист)?\.?\s*(?:КМД?|АР)?\s?\d/iu.test(s)){v.refs.add(s);continue}
  if(PLATE.test(s))v.plates.add(s);
  const pr=PROFILE.exec(" "+s);if(pr)v.profiles.add(pr[1].trim());
  const b=BOLT.exec(s);if(b&&!/кл\.?\s*$/iu.test(s))v.bolts.add(s.length<=40?s:b[1].replace(/\s/gu,""));
  if(WELD.test(s))v.welds.add(s.slice(0,40));
  if(LEVEL.test(s))v.levels.add(s);else if(DIM.test(s))v.dims.add(s);
  else if(/поз/iu.test(s)){const m=POS.exec(s);if(m)v.positions.add(m[1]||m[2])}
  else if(MARK.test(s)&&!PLATE.test(s)&&!pr&&!b)v.marks.add(s);
  else if(!PLATE.test(s)&&!pr&&!b&&!WELD.test(s)&&v.text.length<60&&wordy(s))v.text.push(s.slice(0,160))
 }
 return views.map(v=>{const o={title:v.title,at:v.at,box:{x0:Math.round(v.b.x0),y0:Math.round(v.b.y0),x1:Math.round(v.b.x1),y1:Math.round(v.b.y1)}};
  for(const k of ["plates","profiles","steel","bolts","welds","positions","marks","levels","dims","refs"])if(v[k].size)o[k]=[...v[k]].slice(0,80);
  if(v.text.length)o.text=v.text;return o})
}

// The sketches of flashings: «Поз. N» over its outline — the thick lines under the label chained into one polyline,
// scaled by the dimensions written on it (their sum against the outline's length).
function trimsOf(items,segments){
 if(!items.some(t=>/фасонн\S*\s+элемент|нащельник|Схемы\s+фасонных/iu.test(t.str)))return[];
 const labels=items.filter(t=>/^Поз\s*\.?\s*\d{1,3}\s*$/iu.test(t.str));if(!labels.length)return[];
 const big=Math.max(...labels.map(l=>l.h)),sketch=labels.filter(l=>l.h>=big*.9);
 const ownerOf=c=>{let best=null,score=Infinity;for(const l of sketch){const dy=c.y-l.c.y;if(dy<-l.h*.5)continue;const s=dy+Math.abs(c.x-l.c.x)*.8;if(s<score&&s<l.h*18){score=s;best=l}}return best};
 const thick=(segments||[]).filter(s=>Number(s.w)>=1);
 return sketch.map(l=>{
  const pos=Number(/(\d{1,3})/u.exec(l.str)[1]);
  const dims=items.filter(t=>DIM.test(t.str)&&ownerOf(t.c)===l).map(t=>({v:Number(t.str.replace(/[~≈*]/gu,"").replace(",",".")),c:t.c}));
  const notes=items.filter(t=>wordy(t.str)>=2&&ownerOf(t.c)===l&&t!==l&&Math.hypot(t.c.x-l.c.x,t.c.y-l.c.y)<l.h*10).map(t=>t.str);
  const segs=thick.filter(s=>{const m={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2};return ownerOf(m)===l&&Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)>.8});
  // chain the outline: from an end used once, each next segment from the point reached; every chain of the sketch so,
  // the outline is the one whose legs most agree with the dimensions written on it (a hatch or a symbol of thick lines
  // beside it is another chain)
  const key=p=>Math.round(p.x*2)+","+Math.round(p.y*2),deg=new Map();for(const s of segs)for(const p of [s.a,s.b])deg.set(key(p),(deg.get(key(p))||0)+1);
  const left=[...segs],chains=[];
  while(left.length&&chains.length<12){
   const start=left.find(s=>deg.get(key(s.a))===1||deg.get(key(s.b))===1)||left[0];
   let cur=deg.get(key(start.a))===1?start.a:start.b;const pts=[cur];
   while(left.length){const i=left.findIndex(s=>Math.hypot(s.a.x-cur.x,s.a.y-cur.y)<1.5||Math.hypot(s.b.x-cur.x,s.b.y-cur.y)<1.5);
    if(i<0){
     // (a shelf ending on the middle of another line — a standing fold: the sheet goes to the nearer end of that line and
     // back along all of it; ИР-71535 АР ч.2 л.27 поз. 37 — 230, up 55, down 340; л.28 поз. 48)
     const j=left.findIndex(s=>{const L=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);if(L<6)return false;const t=((cur.x-s.a.x)*(s.b.x-s.a.x)+(cur.y-s.a.y)*(s.b.y-s.a.y))/(L*L);
      return t>.04&&t<.96&&Math.hypot(s.a.x+(s.b.x-s.a.x)*t-cur.x,s.a.y+(s.b.y-s.a.y)*t-cur.y)<1.2});
     // (a fold of the sheet back on itself drawn as two lines beside each other, up to 4 pt apart, not joined at the top:
     // the next line starts beside the end and goes back — поз. 37, the fold of 55 and the 340 down, 2,7 pt apart)
     if(j<0&&pts.length>=2){const p=pts[pts.length-2],dx=cur.x-p.x,dy=cur.y-p.y,dl=Math.hypot(dx,dy)||1;
      const f=left.findIndex(s=>[[s.a,s.b],[s.b,s.a]].some(([n,o])=>{const g=Math.hypot(n.x-cur.x,n.y-cur.y),L=Math.hypot(o.x-n.x,o.y-n.y);return g<4&&L>2&&((o.x-n.x)*dx+(o.y-n.y)*dy)/(L*dl)<-.95}));
      if(f>=0){const s=left.splice(f,1)[0],n=Math.hypot(s.a.x-cur.x,s.a.y-cur.y)<4&&((s.b.x-s.a.x)*dx+(s.b.y-s.a.y)*dy)<0?s.a:s.b,o=n===s.a?s.b:s.a;pts.push(n,o);cur=o;continue}}
     if(j<0||pts.length<2)break;const s=left.splice(j,1)[0],da=Math.hypot(s.a.x-cur.x,s.a.y-cur.y),db=Math.hypot(s.b.x-cur.x,s.b.y-cur.y),near=da<=db?s.a:s.b,far=da<=db?s.b:s.a;
     pts.push(near,far);cur=far;continue}
    const s=left.splice(i,1)[0];cur=Math.hypot(s.a.x-cur.x,s.a.y-cur.y)<1.5?s.b:s.a;
    // (a straight run of pieces is one leg — going on, not back)
    const n=pts.length;if(n>=2){const p=pts[n-2],q=pts[n-1],cr=(q.x-p.x)*(cur.y-q.y)-(q.y-p.y)*(cur.x-q.x),on=(q.x-p.x)*(cur.x-q.x)+(q.y-p.y)*(cur.y-q.y);if(on>0&&Math.abs(cr)<.5*Math.hypot(q.x-p.x,q.y-p.y)){pts[n-1]=cur;continue}}
    pts.push(cur)}
   if(left.includes(start))left.splice(left.indexOf(start),1);
   if(pts.length>=2)chains.push(pts)}
  // (a standing fold drawn as three lines at one point — the shelf, the fold up and the rest of the fold down in one line:
  // the chain that took the fold as its end and the chain going on from that point are one sheet — the shelf, up the fold,
  // back down all of it; поз. 37: 230, 55 up, 340 down, 25)
  for(let a=0;a<chains.length;a++)for(let b=0;b<chains.length;b++){if(a===b)continue;let M=chains[a],C=chains[b];if(M.length<3||C.length<2)continue;
   const at=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<1.5;
   for(const rm of [0,1]){const m=rm?[...M].reverse():M,J=m[m.length-2],tip=m[m.length-1];
    for(const rc of [0,1]){const c=rc?[...C].reverse():C;if(!at(c[0],J))continue;
     const ux=tip.x-J.x,uy=tip.y-J.y,vx=c[1].x-J.x,vy=c[1].y-J.y,lu=Math.hypot(ux,uy),lv=Math.hypot(vx,vy);
     if(!(lu>0&&lv>lu)||ux*vx+uy*vy>=0||Math.abs(ux*vy-uy*vx)>.08*lu*lv)continue;
     chains[a]=[...m,...c.slice(1)];chains.splice(b,1);a=-1;b=chains.length;break}
    if(a<0)break}}
  const fit=pts=>{const legs=[];for(let i=1;i<pts.length;i++)legs.push(Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
   // (the scale: the one most legs agree with a dimension written on it, ±8 %)
   // (each dimension written once is one leg's: two legs of 90 are not two of the «10» of a hem — поз. 33 read 10 + 10)
   // (of two scales with as many legs agreeing — the one whose agreeing dimensions are greater: the shelves, not the hems)
   const count=c=>{const used=new Set();let n=0,sum=0;for(const x of legs){const j=dims.findIndex((e,i)=>!used.has(i)&&Math.abs(x*c-e.v)<=e.v*.08);if(j>=0){used.add(j);n++;sum+=dims[j].v}}return[n,sum]};
   // (the longest shelf is always dimensioned: a scale by it first — ribs drawn larger than to scale with the hems beside them
   // agreed with more dimensions than the shelves did, поз. 5, 6 of л.24 read 280 for 50)
   let k=null,hits=0,total=0;const long=Math.max(...legs,0);
   for(const set of [[long],legs]){for(const L of set)for(const d of dims){if(!(L>0&&d.v>0))continue;const c=d.v/L;const [n,sum]=count(c);if(n>hits||(n===hits&&sum>total)){hits=n;total=sum;k=c}}
    if(hits>=Math.min(2,legs.length))break;k=null;hits=0;total=0}
   // (two shelves and two dimensions, drawn out of scale: the longer one the greater — поз. 30, 180 × 55)
   if(hits<2&&legs.length===2&&dims.length===2&&legs[0]>0&&legs[1]>0&&dims[0].v!==dims[1].v)return{pts,legs,k:null,hits:2,pair:legs[0]>=legs[1]===dims[0].v>=dims[1].v?[dims[0].v,dims[1].v]:[dims[1].v,dims[0].v],len:legs[0]+legs[1]};
   return{pts,legs,k,hits,len:legs.reduce((a,b)=>a+b,0)}};
  const best=chains.map(fit).sort((p,q)=>q.hits-p.hits||q.len-p.len)[0]||{pts:[],legs:[],k:null,hits:0};
  const pts=best.pts,legsPt=best.legs;let k=best.k;
  if(best.hits<Math.min(2,legsPt.length))k=null;
  if(best.pair)k=1;
  // (each leg that agrees takes that dimension)
  const legsMm=best.pair?best.pair:k?legsPt.map(x=>{const v=x*k,d=dims.find(e=>Math.abs(v-e.v)<=e.v*.08);return d?d.v:Math.round(v)}):null;
  const bends=[];for(let i=2;i<pts.length;i++){const a=Math.atan2(pts[i-1].y-pts[i-2].y,pts[i-1].x-pts[i-2].x),b=Math.atan2(pts[i].y-pts[i-1].y,pts[i].x-pts[i-1].x);let d=(b-a)*180/Math.PI;while(d>180)d-=360;while(d<-180)d+=360;bends.push(Math.round(d))}
  // (the colour of its face: «RAL 5012» beside the sketch)
  const ralT=items.filter(t=>/^RAL\s*\d{4}$/iu.test(t.str.trim())&&ownerOf(t.c)===l).sort((p,q)=>Math.hypot(p.c.x-l.c.x,p.c.y-l.c.y)-Math.hypot(q.c.x-l.c.x,q.c.y-l.c.y))[0],ral=ralT?/(\d{4})/u.exec(ralT.str)[1]:"";
  return{pos,label:l.str,...(ral?{ral}:{}),dims:dims.map(d=>d.v),...(k?{legs_mm:legsMm,bends_deg:bends,developed_mm:legsMm.reduce((a,b)=>a+b,0)}:{legs_pt:legsPt.map(x=>Math.round(x))}),...(notes.length?{notes:notes.slice(0,6)}:{})}
 }).filter(x=>x.dims.length||x.legs_mm||x.legs_pt?.length)
}

// The lettering of a title sheet: its largest lines.
function titleOf(lines){
 if(!lines.length)return null;const top=[...lines].sort((p,q)=>q.h-p.h).filter(l=>wordy(l.str)||/\d{2,}/u.test(l.str)).slice(0,8);
 return top.map(l=>l.str.slice(0,200))
}

function sheetDetails(geometry,blocks){
 const items=(geometry?.texts||[]).map(frameOf).filter(t=>t.str);
 const lines=linesOf(items),paragraphs=paragraphsOf(lines),notes=notesOf(paragraphs);
 const requirements=requirementsOf(notes),tables=tablesOf(blocks),views=viewsOf(items,geometry?.segments,Number(geometry?.widthPt)||0,Number(geometry?.heightPt)||0),trims=trimsOf(items,geometry?.segments);
 const counts={labels:items.length,notes:notes.length,tables:tables.length,views:views.length,trims:trims.length,levels:0,dims:0,marks:0,text:0};
 for(const t of items){if(LEVEL.test(t.str))counts.levels++;else if(DIM.test(t.str))counts.dims++;else if(MARK.test(t.str))counts.marks++;else counts.text++}
 const out={notes:notes.slice(0,400),requirements,tables,views:views.slice(0,160),trims,counts};
 if(items.length<80){const t=titleOf(lines);if(t)out.title=t}
 return out
}

// A view of the sheet a label stands in (for the check of the sheet: a level, a dimension, a mark not in a scheme is
// still kept — in the details of its view).
function viewOfLabel(details,text){
 const s=String(text||"").trim();if(!s)return null;
 for(const v of details?.views||[])for(const k of ["levels","dims","marks","positions","plates","profiles","bolts"])if((v[k]||[]).includes(s))return v.title;
 return null
}

// Short lines of the details for Claude and the card: what the rules took of the sheet.
function detailLines(details){
 if(!details)return[];const out=[],r=details.requirements||{};
 const names={steel:"сталь",bolts:"болты",welding:"сварка",welds:"швы",coating:"покрытие",fire:"огнезащита",corrosion:"коррозия",loads:"нагрузки",norms:"нормы",gussets:"фасонки"};
 const req=Object.entries(r).map(([k,v])=>names[k]+": "+v.map(x=>x.value).slice(0,12).join(", "));
 if(req.length)out.push("Требования листа (правилами): "+req.join("; "));
 const tabs=(details.tables||[]).filter(t=>t.kind!=="other").map(t=>t.kind+" "+t.rows.length+" стр.");
 if(tabs.length)out.push("Таблицы листа: "+tabs.slice(0,12).join(", "));
 for(const v of (details.views||[]).filter(v=>v.plates||v.bolts||v.welds||v.profiles).slice(0,40))
  out.push(v.title+": "+[v.plates&&"пластины "+v.plates.slice(0,8).join(", "),v.profiles&&"профили "+v.profiles.slice(0,8).join(", "),v.bolts&&"болты "+v.bolts.slice(0,6).join(", "),v.welds&&"швы "+v.welds.slice(0,4).join(", ")].filter(Boolean).join("; "));
 for(const t of (details.trims||[]).slice(0,30))out.push("Фасонный элемент поз. "+t.pos+": размеры "+t.dims.join(", ")+(t.developed_mm?" (развёртка "+t.developed_mm+" мм, гибы "+t.bends_deg.join("°, ")+"°)":""));
 return out
}

module.exports={sheetDetails,viewOfLabel,detailLines,requirementsOf,notesOf,paragraphsOf,linesOf,tablesOf,trimsOf,viewsOf,kindOfTable,frameOf};
