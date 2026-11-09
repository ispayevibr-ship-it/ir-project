"use strict";
/*
 * Исполнительная документация of an object: the act types, the documents of quality the montage needs (metal, fasteners,
 * electrodes, paint, primer…), and the documents themselves — one model of blocks that becomes a Word file (.docx, made
 * here: a ZIP of WordprocessingML without packages) or the HTML the main process prints into PDF.
 * The works of an act come from the daily reports of the chosen period and work type; the marks, their mass and axes —
 * from the marks register and the montage scheme; the documents of quality — from what the engineer loaded here.
 * As-built surveys loaded here go to the acts they cover (work type, period, marks or axes); the program can also draw
 * the as-built scheme itself — a plan of the montage scheme in axes with the marks of the period and a table for the
 * measured deviations (PNG for Word made in the window, SVG in the PDF).
 * Only the documents Kazakhstan requires (просьба инженера 04.11.2026: «все акты только РК»): the list of СН РК
 * 1.03-00-2022 «Строительное производство. Организация строительства предприятий, зданий и сооружений» п. 15.2, the
 * forms of its приложений В (журнал производства работ), Г (ведомость несмонтированного), Д (акт освидетельствования
 * скрытых работ) and Е (акт промежуточной приёмки ответственных конструкций).
 */
(root=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{if(v==null||String(v).trim()==="")return null;const n=Number(String(v).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
 const fmt=(v,dp=0)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("ru-RU",{minimumFractionDigits:dp,maximumFractionDigits:dp});
 const day=v=>String(v||"").slice(0,10);
 const ru=v=>{const d=day(v);return/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+"."+d.slice(5,7)+"."+d.slice(0,4):String(v||"")};
 const ruLong=v=>{const d=day(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return String(v||"");const M=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];return`«${d.slice(8,10)}» ${M[Number(d.slice(5,7))-1]} ${d.slice(0,4)} г.`};

 // Who takes part: the commission of the acts and its signatures, in the words of the forms Д and Е of СН РК 1.03-00-2022.
 // Technical and author's supervision only when they exist.
 const ROLES=[
  {key:"customer",name:"Заказчик",short:"Представитель заказчика"},
  {key:"tech",name:"Технический надзор заказчика",short:"Представитель технического надзора заказчика",optional:true},
  {key:"author",name:"Авторский надзор",short:"Представитель авторского надзора",optional:true},
  {key:"general",name:"Генеральный подрядчик",short:"Представитель генерального подрядчика",auto:true},
  {key:"contractor",name:"Подрядчик (выполнивший работы)",short:"Представитель подрядной организации"},
  {key:"sub",name:"Субподрядная организация",short:"Представитель субподрядной организации",optional:true}
 ];
 // The documents of quality the montage needs and what each act shows of them.
 const GROUPS=[
  {key:"structures",name:"Металлоконструкции (завод-изготовитель)",hint:"Сертификат (паспорт) завода на изготовленные конструкции по КМД"},
  {key:"metal",name:"Металлопрокат",hint:"Сертификат на прокат — по каждой стали и профилю отдельно"},
  {key:"fasteners",name:"Метизы",hint:"Сертификат на каждую позицию ведомости метизов"},
  {key:"electrodes",name:"Электроды, сварочные материалы",hint:"Сертификат на каждую марку и диаметр"},
  {key:"primer",name:"Грунтовка",hint:"Паспорт качества / сертификат"},
  {key:"paint",name:"Краска (эмаль)",hint:"Паспорт качества / сертификат"},
  {key:"fire",name:"Огнезащита",hint:"Сертификат и паспорт на огнезащитный состав"},
  {key:"other",name:"Прочие материалы",hint:"Анкеры, бетон подливки, сэндвич-панели, кровля…"}
 ];
 // The documents of СН РК 1.03-00-2022 п. 15.2 for the montage of steel structures and equipment. form: D — акт
 // освидетельствования скрытых работ (прил. Д), E — акт промежуточной приёмки ответственных конструкций (прил. Е).
 // need: the groups of documents of quality the act lists in «применены». single: one for the whole period. list: a
 // journal, a register or a list — without a number. geo: the act refers to an as-built survey.
 const RK="СН РК 1.03-00-2022";
 const ACTS=[
  {key:"aosr",name:"Акт освидетельствования скрытых работ (монтаж металлоконструкций)",basis:RK+", приложение Д",form:"D",need:["structures","metal","fasteners","electrodes","primer","paint","other"],geo:true},
  {key:"aosr_grout",name:"Акт освидетельствования скрытых работ (подливка опорных плит колонн и оборудования)",basis:RK+", приложение Д",form:"D",need:["other"],work:"Подливка опорных плит (баз) колонн и опорных частей оборудования",geo:true},
  {key:"aosr_akz",name:"Акт освидетельствования скрытых работ (антикоррозионная защита металлоконструкций)",basis:RK+", приложение Д",form:"D",need:["primer","paint"],work:"Антикоррозионная защита металлоконструкций (подготовка поверхности, грунтование, окраска)"},
  {key:"aosr_fire",name:"Акт освидетельствования скрытых работ (огнезащита металлоконструкций)",basis:RK+", приложение Д",form:"D",need:["fire"],work:"Огнезащитная обработка металлоконструкций"},
  {key:"aosr_equipment",name:"Акт освидетельствования скрытых работ (установка оборудования на фундамент)",basis:RK+", приложение Д",form:"D",need:["structures","fasteners","other"],work:"Установка оборудования на фундамент",geo:true},
  {key:"aook",name:"Акт промежуточной приёмки ответственных конструкций",basis:RK+", приложение Е",form:"E",need:["structures","metal","fasteners","electrodes"],geo:true},
  {key:"geodesy",name:"Акт приёмки геодезической разбивочной основы",basis:RK+", п. 15.2",single:true},
  {key:"asbuilt",name:"Исполнительная геодезическая схема возведённых конструкций",basis:RK+", п. 15.2 (схема из монтажной схемы программы)"},
  {key:"equipment_test",name:"Акт индивидуального испытания оборудования",basis:RK+", п. 15.2",need:["structures","electrodes"],single:true},
  {key:"equipment_complex",name:"Акт приёмки оборудования после комплексного опробования",basis:RK+", п. 15.2",single:true},
  {key:"journal",name:"Журнал производства работ (выписка за период)",basis:RK+", приложение В",single:true,list:true},
  {key:"welding",name:"Специальный журнал сварочных работ (выписка за период)",basis:RK+", п. 15.2",need:["electrodes"],single:true,list:true},
  {key:"input",name:"Специальный журнал входного контроля",basis:RK+", п. 15.2",need:["structures","metal","fasteners","electrodes","primer","paint","fire","other"],single:true,list:true},
  {key:"unmounted",name:"Ведомость несмонтированного и неиспользованного оборудования, конструкций и материалов",basis:RK+", приложение Г",single:true,list:true},
  {key:"certs",name:"Реестр сертификатов о происхождении товара (СТ-KZ), индустриальных сертификатов и документов о качестве",basis:RK+", п. 15.2",need:["structures","metal","fasteners","electrodes","primer","paint","fire","other"],single:true,list:true}
 ];
 const ACT=Object.fromEntries(ACTS.map(a=>[a.key,a]));

 // ---- the needs: what metal, fasteners, electrodes, paint and primer the object takes, each a separate point ----
 const steelOf=d=>String(d.steel||d.steel_grade||d.material||"").trim();
 const profileOf=d=>String(d.profile||d.section||"").trim();
 // From the drawings' texts (analysis logs, project knowledge base): electrodes, primers, paints, fire protection.
 const L="(?<![А-Яа-яЁёA-Za-z0-9-])",R="(?![А-Яа-яЁёA-Za-z0-9])";
 const MATERIAL_RX=[
  ["electrodes",new RegExp(L+"Э\\s?(42|46|50|55|60)А?"+R,"g"),m=>"Электроды "+m.replace(/\s+/g,"")],
  ["electrodes",new RegExp(L+"(УОНИ|ОЗС|МР|АНО|ЛБ)-?\\d{1,2}(\\/\\d{2})?"+R,"g"),m=>"Электроды "+m],
  ["electrodes",new RegExp(L+"Св-?08[А-Яа-яA-Za-z0-9-]*","g"),m=>"Сварочная проволока "+m],
  ["primer",new RegExp(L+"(ГФ|ФЛ|ЭП|ХС|ХВ|АК)-?0\\d{1,3}"+R,"g"),m=>"Грунтовка "+m],
  ["paint",new RegExp(L+"(ПФ|ХВ|ЭП|ХС|МЛ|КО|АС)-?(1\\d{2}|[2-9]\\d{2,3})"+R,"g"),m=>"Эмаль "+m],
  ["fire",/огнезащит[а-я]*\s+(состав|краск[а-я]*|покрыти[а-я]*)\s+«[^»\n]{1,30}»/gi,m=>m.charAt(0).toUpperCase()+m.slice(1)]
 ];
 function fromTexts(texts){
  const out=new Map(),text=texts.join("\n");
  for(const[group,rx,name]of MATERIAL_RX){for(const m of text.matchAll(rx)){const t=name(m[0]).replace(/\s+/g," ").trim(),key=group+":"+norm(t);if(!out.has(key))out.set(key,{key,group,title:t,source:"из чертежей"})}}
  return[...out.values()].slice(0,40)
 }
 // Every point of the documents of quality: computed needs, then the engineer's own points (records «certificate»).
 function needs({marks=[],scheme=[],fasteners=[],texts=[],records=[]}){
  const list=[],seen=new Set(),add=x=>{if(seen.has(x.key))return;seen.add(x.key);list.push(x)};
  const markNames=arr(marks).map(m=>String(m.mark||m.title||"").trim()).filter(Boolean);
  if(markNames.length)add({key:"structures:all",group:"structures",title:"Металлоконструкции по КМД",detail:`${markNames.length} марок по ведомости`,marks:markNames});
  // metal: each steel with each profile, from the montage scheme (the marks register keeps no steel).
  const metal=new Map();
  for(const r of arr(scheme)){const d=r.data||r,st=steelOf(d),pr=profileOf(d),mark=String(d.mark||"").trim();if(!st&&!pr)continue;
   const key="metal:"+norm(st)+"|"+norm(pr);const x=metal.get(key)||{key,group:"metal",title:[st?"Сталь "+st.replace(/^сталь\s*/i,""):"",pr].filter(Boolean).join(", "),steel:st,profile:pr,standard:String(d.profile_standard||""),marks:new Set()};
   if(mark)x.marks.add(mark);metal.set(key,x)}
  [...metal.values()].sort((a,b)=>a.title.localeCompare(b.title,"ru",{numeric:true})).forEach(x=>add({...x,marks:[...x.marks],detail:x.standard}));
  for(const f of arr(fasteners)){const t=String(f.text||"").trim();if(!t)continue;add({key:"fasteners:"+norm(t),group:"fasteners",title:t,detail:f.total?fmt(f.total)+" шт.":"",marks:arr(f.marks).map(m=>m.mark||m).filter(Boolean)})}
  fromTexts(texts).forEach(add);
  const has=g=>list.some(x=>x.group===g);
  if(!has("electrodes"))add({key:"electrodes:default",group:"electrodes",title:"Электроды (марка по КМ)",detail:"марка в чертежах не найдена — уточните"});
  if(!has("primer"))add({key:"primer:default",group:"primer",title:"Грунтовка (марка по КМ)",detail:"марка в чертежах не найдена — уточните"});
  if(!has("paint"))add({key:"paint:default",group:"paint",title:"Краска / эмаль (марка по КМ)",detail:"марка в чертежах не найдена — уточните"});
  const byKey=new Map(arr(records).map(r=>[String(r.data?.key||""),r]));
  const out=list.map(x=>{const r=byKey.get(x.key);return{...x,record:r||null,...(r?.data?.title_override?{title:r.data.title_override}:{})}});
  for(const r of arr(records)){const k=String(r.data?.key||"");if(!k||seen.has(k))continue;if(r.data?.custom||k.startsWith("custom:"))out.push({key:k,group:r.data.group||"other",title:r.data.title||r.title||"",detail:r.data.detail||"",marks:[],record:r,custom:true})}
  return out.map(x=>({...x,docs:docsOf(x.record),hidden:!!x.record?.data?.hidden}))
 }
 const docsOf=r=>arr(r?.data?.docs).filter(d=>d&&(d.number||d.file||d.date));
 const certText=d=>[d.kind||"Сертификат",d.number?"№ "+d.number:"",d.date?"от "+ru(d.date):"",d.supplier?"("+d.supplier+")":""].filter(Boolean).join(" ");

 // ---- the works of the period ----
 function reportsIn(reports,{from,to}){return arr(reports).filter(r=>{const d=day((r.data||r).date||(r.data||r).report_date);return d&&(!from||d>=from)&&(!to||d<=to)}).sort((a,b)=>day((a.data||a).date).localeCompare(day((b.data||b).date))||(Number(a.id)||0)-(Number(b.id)||0))}
 const itemsOf=r=>{const d=r.data||r;return arr(d.items).length?d.items:arr(d.works)};
 // Each mark (or a volume without marks) of the chosen work type, summed over the reports: pieces, volume, dates.
 function works(reports,{workTypeId="",marks=[]}={}){
  const byMark=new Map(arr(marks).map(m=>[String(m.id),m])),rows=new Map();
  for(const r of arr(reports)){const date=day((r.data||r).date||(r.data||r).report_date);
   for(const w of itemsOf(r)){if(!w||w.accounting_type==="service")continue;if(workTypeId&&String(w.work_type_id||"")!==String(workTypeId))continue;
    const qty=num(w.qty??w.count??w.quantity)||0,vol=num(w.volume)??qty*(num(w.unit_volume)||0);if(!qty&&!vol)continue;
    const m=byMark.get(String(w.mark_id||"")),mark=String(w.mark||m?.mark||m?.title||"").trim(),key=(w.work_type_id||"")+"|"+(mark||"·"+(w.work_type||""));
    const x=rows.get(key)||{mark,name:String(w.name||m?.name||"").trim(),work_type:String(w.work_type||""),work_type_id:String(w.work_type_id||""),code:String(w.project_code||""),unit:String(w.unit||""),qty:0,volume:0,dates:new Set(),mark_id:String(w.mark_id||"")};
    x.qty+=qty;x.volume+=vol||0;x.dates.add(date);rows.set(key,x)}}
  return[...rows.values()].map(x=>({...x,dates:[...x.dates].sort()})).sort((a,b)=>a.mark.localeCompare(b.mark,"ru",{numeric:true}))
 }
 // The plan of the montage scheme: the grid (axes and their positions from the first one) and the elements of the marks —
 // where each stands (absolute coordinates, else an axis and the offset from it, as the scheme page reads them), its end
 // and its levels.
 function plan(scheme){
  if(scheme&&scheme.els)return scheme;
  const rows=arr(scheme),g=rows.find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")?.data||null;
  const pos=(names,spans)=>{let s=0;return arr(names).map((n,i)=>{const p=s;s+=num(arr(spans)[i])||0;return[String(n).trim(),p]})};
  const X=g?pos(g.axes_x,g.x_spans_mm):[],Y=g?pos(g.axes_y,g.y_spans_mm):[];
  const at=(list,a)=>{const f=list.find(x=>x[0]===String(a??"").trim());return f?f[1]:null};
  const els=[];
  for(const r of rows){const d=r.data||{};if(r.record_type&&r.record_type!=="scheme_column")continue;if(d.entity_type==="grid"||!String(d.mark||"").trim())continue;
   let x=num(d.absolute_x_mm),y=num(d.absolute_y_mm);
   if(x==null||y==null){const ax=at(X,d.axis_x),ay=at(Y,d.axis_y);if(ax!=null&&ay!=null){x=ax+(num(d.offset_x_mm)||0);y=ay+(num(d.offset_y_mm)||0)}else{x=num(d.x_mm);y=num(d.y_mm)}}
   if(x==null||y==null)continue;
   const x2=num(d.absolute_x2_mm)??num(d.x2_mm)??x,y2=num(d.absolute_y2_mm)??num(d.y2_mm)??y,point=Math.hypot(x2-x,y2-y)<5;
   els.push({mark:String(d.mark).trim(),kind:point?"column":String(d.geometry_type||"beam"),x,y,x2,y2,z0:num(d.z0_mm),z1:point?num(d.z1_mm):num(d.end_z_mm)??num(d.z1_mm),status:String(d.status||"")})}
  return{X,Y,els}
 }
 const nearAxis=(list,v)=>{let b=null;for(const[n,p]of list){const d=v-p;if(!b||Math.abs(d)<Math.abs(b[1]))b=[n,d]}return b};
 const axisPoint=(P,x,y)=>{const a=nearAxis(P.X,x),b=P.Y.length?nearAxis(P.Y,y):null,t=v=>v&&Math.abs(v[1])>=5?`${v[0]} (${v[1]>0?"+":"−"}${fmt(Math.abs(v[1]))})`:v?.[0]||"";return[t(a),t(b)].filter(Boolean).join("/")};
 // The axes of the marks on the montage scheme: «1–8 / А–Г».
 function axesOf(scheme,markNames){
  const P=plan(scheme);if(!P.X.length)return"";
  const want=new Set(arr(markNames).map(norm)),xs=new Set(),ys=new Set();
  for(const e of P.els){if(!want.has(norm(e.mark)))continue;for(const[x,y]of[[e.x,e.y],[e.x2,e.y2]]){xs.add(nearAxis(P.X,x)[0]);if(P.Y.length)ys.add(nearAxis(P.Y,y)[0])}}
  if(!xs.size)return"";
  const range=(list,set)=>{const idx=list.map(a=>a[0]).filter(n=>set.has(n));return idx.length>1?idx[0]+"–"+idx[idx.length-1]:idx[0]||""};
  return[range(P.X,xs),range(P.Y,ys)].filter(Boolean).join(" / ")
 }
 // «1–8 / А–Г» against another such text: they overlap when each axis direction given in both shares an axis of the grid.
 function axesOverlap(a,b,P){
  const parse=t=>String(t||"").split("/").map(x=>x.split(/[–—-]/).map(v=>v.trim()).filter(Boolean));
  const A=parse(a),Bx=parse(b);if(!A[0]?.length||!Bx[0]?.length)return true;
  return[0,1].every(i=>{const r1=A[i],r2=Bx[i];if(!r1?.length||!r2?.length)return true;const list=(i?P?.Y:P?.X)?.map(v=>v[0])||[];
   const span=r=>{const k=r.map(v=>list.indexOf(v));return k.some(v=>v<0)?null:[Math.min(...k),Math.max(...k)]};const s1=span(r1),s2=span(r2);
   if(!s1||!s2)return r1.some(v=>r2.includes(v));return s1[0]<=s2[1]&&s2[0]<=s1[1]})
 }
 // Исполнительные съёмки loaded by the engineer (records «survey»).
 const surveyOf=r=>{const d=r?.data||r||{};return{id:r?.id,title:String(d.title||"Исполнительная геодезическая схема"),number:String(d.number||""),date:day(d.date),axes:String(d.axes||""),workTypeId:String(d.work_type_id||""),marks:String(d.marks||"").split(/[,;]/).map(v=>v.trim()).filter(Boolean),surveyor:String(d.surveyor||""),files:arr(d.files).filter(f=>f?.path)}};
 const surveyText=s=>`${s.title}${s.number?" № "+s.number:""}${s.date?" от "+ru(s.date):""}${s.axes?" (оси "+s.axes+")":""}`;
 const plusDays=(d,n)=>{const t=Date.parse(d+"T00:00:00Z");return Number.isFinite(t)?new Date(t+n*864e5).toISOString().slice(0,10):d};
 // A survey goes to an act of its work type whose period it belongs to (made up to 30 days after the works) and whose
 // marks or axes it covers; what it does not say does not narrow it.
 function surveysFor(list,{from,to,workTypeId,marks=[],axes="",P}){
  const ms=new Set(marks.map(norm));
  return arr(list).filter(s=>{if(s.workTypeId&&workTypeId&&s.workTypeId!==String(workTypeId))return false;
   if(s.date&&((from&&s.date<from)||(to&&s.date>plusDays(to,30))))return false;
   if(s.marks.length&&ms.size)return s.marks.some(m=>ms.has(norm(m)));
   return axesOverlap(s.axes,axes,P)})
 }
 // The plan of the marks of an act as SVG (mm, Y up as on drawings): the grid with its bubbles, every element of the
 // scheme pale, the marks of the act dark and signed.
 // The elements of the marks: where the scheme marks some of a mark's pieces as mounted — those, else all of the mark
 // (a partial montage does not say which pieces).
 function elementsOf(P,markNames){
  const want=new Set(arr(markNames).map(norm)),by=new Map();
  for(const e of P.els){const k=norm(e.mark);if(!want.has(k))continue;if(!by.has(k))by.set(k,[]);by.get(k).push(e)}
  return[...by.values()].flatMap(list=>{const done=list.filter(e=>e.status==="mounted"||e.status==="partial");return done.length?done:list})
 }
 function planSvg(P,markNames){
  const mine=elementsOf(P,markNames),mineSet=new Set(mine);
  const xs=[...P.X.map(a=>a[1]),...mine.flatMap(e=>[e.x,e.x2])],ys=[...P.Y.map(a=>a[1]),...mine.flatMap(e=>[e.y,e.y2])];
  if(!xs.length||!ys.length)return null;
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),ext=Math.max(x1-x0,y1-y0,6000),fs=ext/55,pad=fs*4.5;
  const W=x1-x0+pad*2,H=y1-y0+pad*2,X=v=>(v-x0+pad).toFixed(0),Y=v=>(y1-v+pad).toFixed(0);
  const out=[];
  for(const[n,p]of P.X){out.push(`<line x1="${X(p)}" y1="${(pad-fs*1.2).toFixed(0)}" x2="${X(p)}" y2="${(H-pad+fs*1.2).toFixed(0)}" class="ax"/>`);
   out.push(`<circle cx="${X(p)}" cy="${(H-pad+fs*2.4).toFixed(0)}" r="${(fs*1.2).toFixed(0)}" class="bub"/><text x="${X(p)}" y="${(H-pad+fs*2.8).toFixed(0)}" class="bt">${esc(n)}</text>`)}
  for(const[n,p]of P.Y){out.push(`<line x1="${(pad-fs*1.2).toFixed(0)}" y1="${Y(p)}" x2="${(W-pad+fs*1.2).toFixed(0)}" y2="${Y(p)}" class="ax"/>`);
   out.push(`<circle cx="${(pad-fs*2.4).toFixed(0)}" cy="${Y(p)}" r="${(fs*1.2).toFixed(0)}" class="bub"/><text x="${(pad-fs*2.4).toFixed(0)}" y="${(Number(Y(p))+fs*0.4).toFixed(0)}" class="bt">${esc(n)}</text>`)}
  const inView=e=>[e.x,e.x2].every(v=>v>=x0-pad&&v<=x1+pad)&&[e.y,e.y2].every(v=>v>=y0-pad&&v<=y1+pad);
  const el=(e,c)=>e.kind==="column"?`<rect x="${(X(e.x)-fs*0.45).toFixed(0)}" y="${(Y(e.y)-fs*0.45).toFixed(0)}" width="${(fs*0.9).toFixed(0)}" height="${(fs*0.9).toFixed(0)}" class="${c}"/>`:`<line x1="${X(e.x)}" y1="${Y(e.y)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" class="${c}l"/>`;
  for(const e of P.els)if(!mineSet.has(e)&&inView(e))out.push(el(e,"o"));
  const signed=new Set();
  for(const e of mine){out.push(el(e,"m"));const k=e.mark+"|"+Math.round((e.x+e.x2)/2/500)+"|"+Math.round((e.y+e.y2)/2/500);if(mine.length<=120&&!signed.has(k)){signed.add(k);out.push(`<text x="${(Number(X((e.x+e.x2)/2))+fs*0.6).toFixed(0)}" y="${(Number(Y((e.y+e.y2)/2))-fs*0.6).toFixed(0)}" class="mt">${esc(e.mark)}</text>`)}}
  const sw=(fs*0.08).toFixed(0);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${W.toFixed(0)}" height="${H.toFixed(0)}"><style>.ax{stroke:#555;stroke-width:${sw};stroke-dasharray:${(fs*1.2).toFixed(0)} ${(fs*0.4).toFixed(0)} ${(fs*0.2).toFixed(0)} ${(fs*0.4).toFixed(0)}}.bub{fill:#fff;stroke:#000;stroke-width:${sw}}.bt{font:${fs.toFixed(0)}px Arial,sans-serif;text-anchor:middle;fill:#000}.mt{font:${(fs*0.8).toFixed(0)}px Arial,sans-serif;fill:#000}.o{fill:#d4d8dc}.ol{stroke:#d4d8dc;stroke-width:${(fs*0.18).toFixed(0)}}.m{fill:#000}.ml{stroke:#000;stroke-width:${(fs*0.22).toFixed(0)}}</style><rect width="100%" height="100%" fill="#fff"/>${out.join("")}</svg>`;
  return{svg,ratio:H/W,count:mine.length}
 }

 // ---- documents ----
 const B={
  title:text=>({t:"title",text}),center:text=>({t:"center",text}),p:(text,o={})=>({t:"p",text,...o}),
  field:(label,value)=>({t:"field",label,value:value||"_______________________________"}),
  table:(head,rows,w)=>({t:"table",head,rows,w}),sign:rows=>({t:"sign",rows}),brk:()=>({t:"break"}),small:text=>({t:"small",text}),plan:p=>({t:"plan",svg:p.svg,ratio:p.ratio})
 };
 const personText=p=>[p.org,p.position,p.fio,p.order?"(документ о полномочиях: "+p.order+")":""].filter(Boolean).join(", ")||"_______________________________";
 const signRows=parts=>parts.map(p=>[p.short,[p.position,p.fio].filter(Boolean).join(" ")]);
 function people(settings){
  const P=settings.participants||{};
  return ROLES.map(r=>({...r,...(P[r.key]||{})})).filter(r=>r.optional?r.enabled===true:r.enabled!==false&&(!r.auto||r.org||r.fio))
 }
 function worksText(rows){
  return rows.map(r=>{const v=r.volume?`${fmt(r.volume,r.volume<10?3:1)} ${r.unit||""}`.trim():"";return r.mark?`${r.mark}${r.name?" ("+r.name+")":""} — ${fmt(r.qty)} шт.${v?", "+v:""}`:`${r.work_type||"работы"}${v?" — "+v:""}`}).join("; ")
 }
 const materialsOf=(act,list,markSet)=>list.filter(x=>!x.hidden&&arr(act.need).includes(x.group)&&(!x.marks?.length||!markSet.size||x.marks.some(m=>markSet.has(norm(m)))));
 const materialText=x=>x.title+(x.docs.length?" — "+x.docs.map(certText).join("; "):" — документ о качестве не загружен");
 const objText=o=>[o.name,o.address].filter(Boolean).join(", ");
 const doerOf=ctx=>ctx.people.find(p=>p.key==="sub")||ctx.people.find(p=>p.key==="contractor")||{};
 // The text of each act as a template the engineer can change and keep (просьба инженера 09.11.2026: «сделай возможность
 // редактировать акт и сохранять, чтобы потом был такой постоянно»): the name, the line under it, the words after the
 // commission and the paragraphs. What changes from act to act stays a marker in square brackets — [работы], [материалы],
 // [начало]… — and is filled from the reports, the scheme and the certificates at each export. Kept in the settings of the
 // object (settings.texts[<act>]); a paragraph starting with «Решение комиссии» is bold.
 const LINE="_______________________________";
 const MARKERS=[["работы","что предъявлено: вид работ, оси, марки и количество за период"],["вид работ","вид работ и оси"],["оборудование","марки и количество за период"],["проект","проектная организация и шифр"],["материалы","применённые материалы с документами о качестве"],["отклонения","«отсутствуют» или «допущены: …» из настроек"],["начало","дата начала работ"],["окончание","дата окончания работ"],["период","период акта"],["документация","съёмка, акты скрытых работ этой выгрузки, отчёты"],["приложения","съёмка и документы о качестве"],["последующие работы","поле «Разрешается производство последующих работ»"],["исполнитель","организация, выполнившая работы"],["экземпляров","число экземпляров"],["объект","наименование и адрес объекта"]];
 const DECISION_D="Работы выполнены в соответствии с проектно-сметной документацией, стандартами, строительными нормами и правилами и отвечают требованиям их приёмки. На основании изложенного разрешается производство последующих работ по устройству (монтажу): [последующие работы].";
 const DECISION_E="Конструкции выполнены в соответствии с проектно-сметной документацией, стандартами, строительными нормами и правилами и отвечают требованиям их приёмки. На основании изложенного разрешается использование конструкций по назначению (или производство последующих работ): [последующие работы].";
 const ITEMS=["2. Работы выполнены по проектно-сметной документации: [проект].","3. При выполнении работ применены: [материалы].","4. При выполнении работ отклонения от проектно-сметной документации [отклонения].","5. Даты: начала работ [начало], окончания работ [окончание]."];
 function defaultText(act){
  if(act.form==="D")return{title:"Акт освидетельствования скрытых работ",subtitle:act.work||"",intro:"произвела осмотр работ, выполненных [исполнитель], и составила настоящий акт о нижеследующем:",
   paras:["1. К освидетельствованию предъявлены следующие работы: [работы].",...ITEMS,"Решение комиссии:",DECISION_D,"Приложения: [приложения].","Акт составлен в экземплярах: [экземпляров]."]};
  if(act.form==="E")return{title:"Акт промежуточной приёмки ответственных конструкций",subtitle:"",intro:"произвела осмотр конструкций и проверку качества работ, выполненных [исполнитель], и составила настоящий акт о нижеследующем:",
   paras:["1. К приёмке предъявлены следующие конструкции: [работы].",...ITEMS,"6. Документация, на основании которой производилась приёмка: [документация].","Решение комиссии:",DECISION_E,"Акт составлен в экземплярах: [экземпляров]."]};
  if(act.key==="geodesy")return{title:act.name,subtitle:"",intro:"произвела осмотр и проверку геодезической разбивочной основы и составила настоящий акт о нижеследующем:",
   paras:["1. Предъявлена к приёмке геодезическая разбивочная основа для монтажа: [вид работ].","2. Знаки разбивочной основы закреплены; их положение и отметки соответствуют проекту, отклонения не превышают допускаемых. Схема закрепления знаков и каталог координат прилагаются.","Решение комиссии: геодезическая разбивочная основа принимается для производства работ."]};
  if(act.key==="equipment_test")return{title:act.name,subtitle:"",intro:"произвела проверку результатов индивидуального испытания оборудования и составила настоящий акт о нижеследующем:",
   paras:["1. Предъявлено к испытанию оборудование: [оборудование].","2. Оборудование испытано по программе индивидуальных испытаний (для резервуаров — наливом воды до проектного уровня с выдержкой) в течение ______ ч, с __________ по __________.","3. При испытании дефектов изготовления и монтажа, течей и недопустимых деформаций не обнаружено.","4. Применены: [материалы].","Решение комиссии: оборудование выдержало индивидуальное испытание и считается готовым к комплексному опробованию."]};
  if(act.key==="equipment_complex")return{title:act.name,subtitle:"",intro:"произвела проверку результатов комплексного опробования оборудования и составила настоящий акт о нижеследующем:",
   paras:["1. Оборудование: [оборудование] прошло комплексное опробование в течение ______ ч, с __________ по __________, по утверждённой программе.","2. При комплексном опробовании оборудование работало нормально; выявленные дефекты устранены.","Решение комиссии: оборудование, прошедшее комплексное опробование, считается принятым для предъявления приёмочной комиссии."]};
  // Journals, lists and the as-built scheme: the name and the notes under the table.
  return{title:act.name,subtitle:"",intro:null,paras:act.key==="asbuilt"?["Допускаемые отклонения — по проекту и действующим нормам на монтаж стальных конструкций."]:[]}
 }
 // The text of the act: the engineer's kept one over the standard.
 function textOf(act,settings){
  const d=defaultText(act),c=settings?.texts?.[act.key];if(!c)return{...d,custom:false};
  const str=(v,def)=>typeof v==="string"?v:def;
  return{title:str(c.title,d.title).trim()||d.title,subtitle:str(c.subtitle,d.subtitle),intro:d.intro==null?null:str(c.intro,d.intro),paras:Array.isArray(c.paras)?c.paras.map(String):d.paras,custom:true}
 }
 const fill=(t,V)=>String(t||"").replace(/\[([^\]]{1,40})\]/g,(m,k)=>{const v=V[norm(k)];return v==null?m:v});
 const textBlocks=(paras,V)=>arr(paras).map(t=>fill(t,V).trim()).filter(Boolean).map(t=>B.p(t,/^решение комиссии/i.test(t)?{b:true}:{}));
 // The name of the document in the inventory and the list of exported acts.
 const docName=(act,T)=>T&&T.custom?T.title+(T.subtitle?" ("+T.subtitle+")":""):act.name;
 // The head of an act: the name, the object, the date and the commission.
 function header(act,ctx,n,date,T,V){
  const o=ctx.settings.object||{};
  return[B.title(T.title+(n?" № "+n:"")),...(T.subtitle?[B.center(fill(T.subtitle,V))]:[]),B.small(act.basis),
   B.p((o.city||"")+(o.city?"   ":"")+ruLong(date),{align:"right"}),
   B.field("Объект",objText(o)),B.field("Шифр проекта (рабочей документации)",o.project_code),
   B.p("Комиссия в составе:",{b:true}),...ctx.people.map(p=>B.field(p.short,personText(p))),
   ...(T.intro?[B.p(fill(T.intro,V),{})]:[])]
 }
 function footer(ctx,extra){return[...(extra||[]),B.p("Подписи членов комиссии:",{b:true}),B.sign(signRows(ctx.people))]}
 const listHead=(act,ctx,workName,period,T)=>[B.title(T.title),...(T.subtitle?[B.center(T.subtitle)]:[]),B.small(act.basis),B.field("Объект",objText(ctx.settings.object||{})),B.field("Вид работ",workName),B.field("Период",period)];
 const docText=d=>(d.text?.title||d.act.name.replace(/ \(.*\)$/,""))+(d.number?" № "+d.number:"")+" от "+ru(d.to||d.from);
 function actBlocks(act,ctx,part,n){
  const {rows,from,to}=part,date=to||from,marks=rows.map(r=>r.mark).filter(Boolean),markSet=new Set(marks.map(norm));
  const axes=axesOf(ctx.plan,marks),wt=ctx.workType,mats=materialsOf(act,ctx.needs,markSet);
  const workName=(wt?.name||rows[0]?.work_type||"Монтаж металлоконструкций")+(axes?" в осях "+axes:"");
  const period=from===to?ru(from):ru(from)+" – "+ru(to);
  const scope=rows.length?worksText(rows):"работы за период в ежедневных отчётах не найдены";
  const dates=rows.flatMap(r=>r.dates).sort();
  // The as-built survey of the act: the loaded ones that cover it, else the scheme the program draws, else a line to fill.
  const surveys=act.geo?surveysFor(ctx.surveys,{from,to,workTypeId:ctx.workTypeId,marks,axes,P:ctx.plan}):[];part.surveys=surveys;
  const survey=surveys.length?surveys.map(surveyText).join("; "):ctx.asbuilt?"Исполнительная геодезическая схема"+(axes?" в осях "+axes:"")+" (прилагается)":"Исполнительная геодезическая схема"+(axes?" в осях "+axes:"")+" № ____ от ________";
  const project=[ctx.settings.object?.designer,[ctx.settings.object?.project_code,rows.map(r=>r.code).filter(Boolean)[0]].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", ")].filter(Boolean).join(", ");
  const used=mats.map(materialText).join("; ")||"—";
  const T=part.text=textOf(act,ctx.settings);
  const what=act.work?act.work+(axes?" в осях "+axes:"")+" — "+scope:workName+" — "+scope;
  const V={"работы":what,"вид работ":workName,"оборудование":scope,"проект":project||LINE,"материалы":used,"отклонения":ctx.settings.deviations?"допущены: "+ctx.settings.deviations:"отсутствуют",
   "начало":ru(dates[0]||from),"окончание":ru(dates.slice(-1)[0]||to),"период":period,"приложения":survey+"; документы о качестве по п. 3",
   "документация":[survey,...ctx.issued.filter(d=>d.act.form==="D").map(docText),"ежедневные отчёты о выполненных работах за "+period].join("; "),
   "последующие работы":ctx.settings.next_works||LINE,"исполнитель":doerOf(ctx).org||LINE,"экземпляров":String(ctx.settings.copies||"3"),"объект":objText(ctx.settings.object||{})};
  const notes=()=>textBlocks(T.paras,V);
  const certRows=list=>list.map((x,i)=>[String(i+1),x.title+(x.detail?" ("+x.detail+")":""),x.docs.length?x.docs.map(certText).join("; "):"не загружен",arr(x.marks).slice(0,12).join(", ")+(arr(x.marks).length>12?"…":"")]);
  if(act.key==="certs")return[...listHead(act,ctx,workName,period,T).filter(b=>!["Вид работ","Период"].includes(b.label)),B.table(["№","Материал / изделие","Сертификат (СТ-KZ, индустриальный), документ о качестве","Марки"],certRows(ctx.needs.filter(x=>!x.hidden)),[5,38,37,20]),...notes(),...footer(ctx)];
  if(act.key==="input")return[...listHead(act,ctx,workName,period,T).filter(b=>!["Вид работ","Период"].includes(b.label)),
   B.table(["№","Дата поступления","Материал, изделие, конструкция","Документ о качестве","Количество, партия","Результат контроля","Подпись"],mats.flatMap(x=>(x.docs.length?x.docs:[{}]).map(d=>[x.title,d]).map(([t,d])=>["",ru(d.date),t,d.number||d.kind?certText(d):"не загружен",String(d.qty||""),d.number||d.file?"соответствует":"",""])).map((r,i)=>(r[0]=String(i+1),r)),[5,11,28,24,12,12,8]),...notes(),...footer(ctx)];
  if(act.key==="journal"){
   const lines=[];for(const r of ctx.reports){const d=r.data||r,w=itemsOf(r).filter(x=>!ctx.workTypeId||String(x.work_type_id||"")===String(ctx.workTypeId));if(!w.length)continue;
    lines.push([ru(d.date),worksText(works([r],{workTypeId:ctx.workTypeId,marks:ctx.marks})),String(d.weather||""),arr(d.responsible).map(x=>x?.name||x).filter(Boolean).join(", ")||String(d.responsible||""),String(d.note||"")])}
   return[...listHead(act,ctx,workName,period,T),B.table(["Дата","Наименование работ, выполненных за смену (марки, количество, объём)","Условия производства работ","Ответственный","Замечания контролирующих лиц"],lines.length?lines:[["—","записей нет","","",""]],[12,46,12,15,15]),...notes(),...footer(ctx)]
  }
  if(act.key==="welding"){
   const el=mats.map(x=>x.title+(x.docs.length?" ("+x.docs.map(certText).join("; ")+")":"")).join("; ")||"по КМ";
   const lines=[];for(const r of ctx.reports){const d=r.data||r,w=works([r],{workTypeId:ctx.workTypeId,marks:ctx.marks});if(!w.length)continue;lines.push([ru(d.date),worksText(w),"",el,"",""])}
   return[...listHead(act,ctx,workName,period,T),B.table(["Дата","Конструкции, узлы (марки)","Сварщик: ФИО, клеймо, № удостоверения","Сварочные материалы, документ о качестве","Температура воздуха, °С","Результат контроля швов"],lines.length?lines:[["—","записей нет","","","",""]],[11,33,16,22,8,10]),...notes(),...footer(ctx)]
  }
  if(act.key==="unmounted"){
   const done=new Map();for(const r of works(ctx.reportsTo,{workTypeId:ctx.workTypeId,marks:ctx.marks}))if(r.mark)done.set(norm(r.mark),(done.get(norm(r.mark))||0)+r.qty);
   const list=arr(ctx.marks).map(m=>{const mark=String(m.mark||m.title||"").trim(),q=num(m.qty)||0,got=done.get(norm(mark))||0,left=Math.max(0,q-got),uv=num(m.unit_volume);return{mark,name:String(m.name||""),q,got,left,mass:uv?left*uv:null}}).filter(x=>x.mark&&x.left>0).sort((a,b)=>a.mark.localeCompare(b.mark,"ru",{numeric:true}));
   const t=list.reduce((s,x)=>s+(x.mass||0),0);
   return[...listHead(act,ctx,workName,"на "+ru(to),T),B.table(["№","Марка","Наименование","По проекту, шт.","Смонтировано, шт.","Не смонтировано, шт.","Масса, т","Причина"],list.length?list.map((x,i)=>[String(i+1),x.mark,x.name,fmt(x.q),fmt(x.got),fmt(x.left),x.mass==null?"":fmt(x.mass,3),""]):[["—","все конструкции ведомости марок смонтированы","","","","","",""]],[5,11,25,11,12,12,10,14]),
    ...(t?[B.p("Итого не смонтировано: "+fmt(t,3)+" т.",{})]:[]),...notes(),...footer(ctx)]
  }
  if(act.key==="asbuilt"){
   const P=ctx.plan,pic=planSvg(P,marks),els=elementsOf(P,marks).sort((a,b)=>a.mark.localeCompare(b.mark,"ru",{numeric:true})||a.x-b.x||a.y-b.y);
   const lv=v=>v==null?"":(v>0?"+":v<0?"−":"±")+(Math.abs(v)/1000).toFixed(3).replace(".",",");
   const rows=els.slice(0,300).map((e,i)=>[String(i+1),e.mark,e.kind==="column"?axisPoint(P,e.x,e.y):axisPoint(P,e.x,e.y)+" – "+axisPoint(P,e.x2,e.y2),e.kind==="column"?lv(e.z0)+" / "+lv(e.z1):lv(e.z0)+(e.z1!=null&&Math.abs(e.z1-e.z0)>5?" … "+lv(e.z1):""),"","","",""]);
   return[B.title(T.title+(n?" № "+n:"")),...(T.subtitle?[B.center(T.subtitle)]:[]),B.small(act.basis),B.field("Объект",objText(ctx.settings.object||{})),B.field("Вид работ",workName),B.field("Период",period),
    pic?B.plan(pic):B.p("Сетка осей монтажной схемы не задана — план не построен.",{}),
    B.small("Условные обозначения: чёрным — конструкции марок, смонтированных за период (смонтированные экземпляры, если они отмечены на монтажной схеме, иначе все элементы марки); серым — остальные конструкции схемы. Отклонения — в мм; «+» — в сторону возрастания координаты (от оси 1 / А)."),
    B.table(["№","Марка","Оси","Отметка по проекту (низ / верх)","Смещение по X, мм","Смещение по Y, мм","Отметка факт.","Вертикальность, мм"],rows.length?rows:[["—","конструкций за период на схеме нет","","","","","",""]],[5,10,21,18,11,11,12,12]),
    ...(els.length>300?[B.small(`Показаны первые 300 из ${els.length} элементов.`)]:[]),
    ...notes(),...footer(ctx,[B.field("Съёмку выполнил (геодезист, организация)",""),B.field("Прибор (марка, № свидетельства о поверке)","")])]
  }
  // Acts of paragraphs (forms Д and Е, geodesy, equipment): the head, the text with its markers filled, the signatures.
  return[...header(act,ctx,n,date,T,V),...textBlocks(T.paras,V),...footer(ctx)]
 }
 // The whole set: the inventory first, then each chosen document in the order of the list (one for the period or one
 // per day of works); acts of the form Е after the hidden works they refer to.
 function buildPackage(input){
  const {settings={},reports=[],marks=[],scheme=[],workTypes=[],needsList=[],acts=[],from="",to="",workTypeId="",split="period",surveys=[]}=input;
  const inPeriod=reportsIn(reports,{from,to}),workType=arr(workTypes).find(w=>String(w.id)===String(workTypeId))||null;
  const ctx={settings,reports:inPeriod,reportsTo:reportsIn(reports,{to}),marks,scheme,plan:plan(scheme),surveys:arr(surveys).map(surveyOf),asbuilt:acts.includes("asbuilt"),needs:needsList,workType,workTypeId,people:people(settings),issued:[]};
  const all=works(inPeriod,{workTypeId,marks});
  const days=[...new Set(all.flatMap(r=>r.dates))].sort();
  const parts=split==="day"&&days.length?days.map(d=>({from:d,to:d,rows:works(inPeriod.filter(r=>day((r.data||r).date)===d),{workTypeId,marks})})):[{from:from||days[0]||"",to:to||days[days.length-1]||"",rows:all}];
  let n=Math.max(1,Math.round(num(settings.start_number)||1));const docs=ctx.issued;
  for(const act of ACTS.filter(a=>acts.includes(a.key))){
   for(const part of act.single?[{from:parts[0].from,to:parts[parts.length-1].to,rows:all}]:parts){const no=act.list?"":String(n++);const blocks=actBlocks(act,ctx,part,no);docs.push({act,name:docName(act,part.text),text:part.text,number:no,from:part.from,to:part.to,blocks,surveys:part.surveys||[]})}}
  // Acts that point to an as-built survey and got none: loaded surveys do not cover them and the program draws none.
  const used=new Map();
  for(const d of docs)for(const x of d.surveys)used.set(String(x.id??surveyText(x)),x);
  const noSurvey=ctx.asbuilt?[]:docs.filter(d=>d.act.geo&&!d.surveys.length).map(d=>d.name+(d.number?" № "+d.number:""));
  const o=settings.object||{};
  const inventory=[B.title("Опись исполнительной документации"),B.small(RK+", п. 15.2"),B.field("Объект",objText(o)),B.field("Вид работ",workType?.name||"все виды работ"),B.field("Период",ru(from)+" – "+ru(to)),
   B.table(["№","Наименование документа","Дата","Листов"],docs.map((d,i)=>[String(i+1),d.name+(d.number?" № "+d.number:""),d.from===d.to?ru(d.to):ru(d.from)+" – "+ru(d.to),"1"]).concat([...used.values()].map((x,i)=>[String(docs.length+i+1),surveyText(x)+(x.surveyor?", "+x.surveyor:""),x.date?ru(x.date):"",String(x.files.length||1)])).concat(needsList.filter(x=>!x.hidden&&x.docs.length).map((x,i)=>[String(docs.length+used.size+i+1),"Документ о качестве: "+x.title+" — "+x.docs.map(certText).join("; "),x.docs[0]?.date?ru(x.docs[0].date):"",String(x.docs.length)])),[6,64,16,14])];
  const missing=needsList.filter(x=>!x.hidden&&!x.docs.length&&acts.some(k=>arr(ACT[k]?.need).includes(x.group)));
  return{title:"Исполнительная документация — "+(o.name||"объект"),docs,inventory,missing,noSurvey,surveys:[...used.values()],works:all,people:ctx.people,
   blocks:[...inventory,...docs.flatMap(d=>[B.brk(),...d.blocks])],
   attachments:[...[...used.values()].flatMap(x=>x.files.map(f=>({path:f.path,name:f.name,group:"Исполнительные съёмки",title:surveyText(x)}))),
    ...needsList.filter(x=>!x.hidden).flatMap(x=>x.docs.filter(d=>d.file?.path).map(d=>({path:d.file.path,name:d.file.name,group:GROUPS.find(g=>g.key===x.group)?.name||"Прочее",title:x.title})))]}
 }
 // Old choices of the page (before the РК list): kept acts map to their new keys, the rest are dropped.
 const OLD={foundation:"aosr_grout",equipment:"aosr_equipment",akz:"aosr_akz",fireproof:"aosr_fire",tank:"equipment_test",welds:"welding",ready:"aook"};
 const actKeys=list=>[...new Set(arr(list).map(k=>ACT[k]?k:OLD[k]).filter(Boolean))];

 // ---- HTML (for PDF) ----
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 function toHtml(pkg){
  const b=pkg.blocks.map(x=>{switch(x.t){
   case"title":return`<h1>${esc(x.text)}</h1>`;case"center":return`<p class="c">${esc(x.text)}</p>`;case"small":return`<p class="s">${esc(x.text)}</p>`;
   case"p":return`<p class="${x.align==="right"?"r":""}">${x.b?"<b>":""}${esc(x.text)}${x.b?"</b>":""}</p>`;
   case"field":return`<p class="f"><b>${esc(x.label)}:</b> <u>${esc(x.value)}</u></p>`;
   case"table":return`<table><colgroup>${arr(x.w).map(w=>`<col style="width:${w}%">`).join("")}</colgroup><thead><tr>${x.head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${x.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
   case"sign":return`<table class="sign">${x.rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="line"></td><td>${esc(r[1])}</td></tr><tr class="hint"><td></td><td>(подпись)</td><td>(ФИО)</td></tr>`).join("")}</table>`;
   case"plan":return`<div class="plan">${x.svg.replace(/ width="\d+" height="\d+"/,"")}</div>`;
   case"break":return'<div class="pb"></div>';default:return""}}).join("\n");
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(pkg.title)}</title><style>@page{size:A4;margin:15mm 15mm 15mm 25mm}body{font-family:"Times New Roman",serif;font-size:12pt;color:#000;line-height:1.3}h1{font-size:13pt;text-align:center;margin:0 0 4pt}p{margin:0 0 6pt;text-align:justify}p.c{text-align:center}p.r{text-align:right}p.s{text-align:center;font-size:9pt;color:#333;margin-bottom:10pt}p.f u{text-decoration:none;border-bottom:1px solid #000}table{width:100%;border-collapse:collapse;margin:4pt 0 10pt;font-size:10.5pt;page-break-inside:auto}th,td{border:1px solid #000;padding:3pt 4pt;vertical-align:top;text-align:left}th{background:#eee}tr{page-break-inside:avoid}table.sign td{border:0;padding:8pt 4pt 0}table.sign td.line{border-bottom:1px solid #000;width:28%}table.sign tr.hint td{font-size:8pt;padding-top:0;text-align:center;color:#444}.pb{page-break-after:always}.plan{margin:6pt 0 8pt;border:1px solid #000}.plan svg{display:block;width:100%;height:auto;max-height:150mm}</style></head><body>${b}</body></html>`
 }

 // ---- DOCX ----
 const xml=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const run=(t,o={})=>`<w:r><w:rPr>${o.b?"<w:b/>":""}${o.u?'<w:u w:val="single"/>':""}${o.sz?`<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`:""}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
 const para=(runs,o={})=>`<w:p><w:pPr>${o.brk?'<w:pageBreakBefore/>':""}<w:spacing w:after="${o.after??100}"/><w:jc w:val="${o.jc||"both"}"/></w:pPr>${runs}</w:p>`;
 function tableXml(head,rows,w,{border=true}={}){
  const total=9638,cols=arr(w).length?w.map(x=>Math.round(total*x/100)):head.map(()=>Math.round(total/head.length));
  const bd=border?'<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>':"";
  const cell=(t,i,o={})=>`<w:tc><w:tcPr><w:tcW w:w="${cols[i]||cols[0]}" w:type="dxa"/>${o.fill?'<w:shd w:val="clear" w:fill="EEEEEE"/>':""}${o.line?'<w:tcBorders><w:bottom w:val="single" w:sz="4"/></w:tcBorders>':""}</w:tcPr>${para(run(t,{b:o.b,sz:o.sz||21}),{after:0,jc:o.jc||"left"})}</w:tc>`;
  const tr=(r,o)=>`<w:tr>${r.map((c,i)=>cell(c,i,typeof o==="function"?o(i):o)).join("")}</w:tr>`;
  return`<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cols.map(c=>`<w:gridCol w:w="${c}"/>`).join("")}</w:tblGrid>${head?tr(head,{b:true,fill:true}):""}${rows.map(r=>tr(r,{})).join("")}</w:tbl>${para("",{after:60})}`
 }
 function signXml(rows){
  const cols=[38,30,32],out=[];
  for(const r of rows){out.push(tableRow([r[0],"",r[1]],cols,i=>i===1?{line:true}:{}));out.push(tableRow(["","(подпись)","(ФИО)"],cols,()=>({sz:16,jc:"center"})))}
  const total=9638;return`<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${cols.map(c=>`<w:gridCol w:w="${Math.round(total*c/100)}"/>`).join("")}</w:tblGrid>${out.join("")}</w:tbl>`
 }
 function tableRow(r,w,o){const total=9638;return`<w:tr>${r.map((c,i)=>{const x=o(i)||{};return`<w:tc><w:tcPr><w:tcW w:w="${Math.round(total*w[i]/100)}" w:type="dxa"/>${x.line?'<w:tcBorders><w:bottom w:val="single" w:sz="4"/></w:tcBorders>':""}</w:tcPr>${para(run(c,{sz:x.sz||22}),{after:x.sz?40:0,jc:x.jc||"left"})}</w:tc>`}).join("")}</w:tr>`}
 // A plan as a picture of Word: its PNG (made by rasterize in the window) in word/media, 170 mm wide.
 function pictureXml(png,ratio,media){
  const n=media.length+1,id="rIdImg"+n,cx=6120000,cy=Math.round(cx*Math.min(ratio||0.7,1.3));media.push({id,name:`plan${n}.png`,data:png});
  return`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="План ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="plan${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
 }
 function documentXml(pkg,media=[]){
  let brk=false;const body=[];
  for(const x of pkg.blocks){const o={brk};brk=false;
   if(x.t==="break"){brk=true;continue}
   if(x.t==="title")body.push(para(run(x.text,{b:true,sz:26}),{...o,jc:"center",after:40}));
   else if(x.t==="center")body.push(para(run(x.text),{...o,jc:"center"}));
   else if(x.t==="small")body.push(para(run(x.text,{sz:18}),{...o,jc:"center",after:160}));
   else if(x.t==="p")body.push(para(run(x.text,{b:x.b}),{...o,jc:x.align==="right"?"right":"both"}));
   else if(x.t==="field")body.push(para(run(x.label+": ",{b:true})+run(x.value,{u:true}),{...o,jc:"left"}));
   else if(x.t==="table")body.push((o.brk?para("",{brk:true,after:0}):"")+tableXml(x.head,x.rows,x.w));
   else if(x.t==="sign")body.push((o.brk?para("",{brk:true,after:0}):"")+signXml(x.rows));
   else if(x.t==="plan")body.push(x.png?para(pictureXml(x.png,x.ratio,media),{...o,jc:"center"}):para(run("[план — в выгрузке PDF]",{sz:20}),{...o,jc:"center"}))}
  return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
 }
 const STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
 function docxFiles(pkg){
  const media=[],doc=documentXml(pkg,media);
  return[
   ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
   ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
   ["docProps/core.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(pkg.title)}</dc:title><dc:creator>IR Project</dc:creator></cp:coreProperties>`],
   ["word/_rels/document.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+media.map(m=>`<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join("")+'</Relationships>'],
   ["word/styles.xml",STYLES],
   ["word/document.xml",doc],...media.map(m=>["word/media/"+m.name,m.data])]
 }
 // A ZIP without compression (method 0): what Word needs, with no package.
 const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
 const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
 function zip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const u16=v=>[v&255,v>>>8&255],u32=v=>[v&255,v>>>8&255,v>>>16&255,v>>>24&255];
  for(const[name,content]of files){const n=enc.encode(name),data=typeof content==="string"?enc.encode(content):content,c=crc32(data);
   const head=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(data.length),...u32(data.length),...u16(n.length),...u16(0)];
   parts.push(Uint8Array.from(head),n,data);
   central.push(Uint8Array.from([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(data.length),...u32(data.length),...u16(n.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),n);
   offset+=head.length+n.length+data.length}
  const size=central.reduce((s,x)=>s+x.length,0),end=Uint8Array.from([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(size),...u32(offset),...u16(0)]);
  const all=[...parts,...central,end],out=new Uint8Array(all.reduce((s,x)=>s+x.length,0));let p=0;for(const x of all){out.set(x,p);p+=x.length}return out
 }
 const toDocx=pkg=>zip(docxFiles(pkg));
 // In the window: each plan of the package drawn into a PNG for Word (the PDF takes the SVG itself).
 async function rasterize(pkg,width=2400){
  for(const b of pkg.blocks){if(b.t!=="plan"||b.png)continue;
   try{const img=new Image(),url="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(b.svg);await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});
    const c=document.createElement("canvas");c.width=width;c.height=Math.round(width*b.ratio);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
    const blob=await new Promise(ok=>c.toBlob(ok,"image/png"));b.png=new Uint8Array(await blob.arrayBuffer())}catch(e){console.warn("plan picture",e)}}
  return pkg
 }

 const api={MARKERS,defaultText,textOf,fill,RK,ROLES,GROUPS,ACTS,ACT,actKeys,needs,fromTexts,reportsIn,works,axesOf,axesOverlap,plan,planSvg,surveysFor,surveyOf,surveyText,people,buildPackage,toHtml,toDocx,rasterize,documentXml,zip,crc32,certText,ru,day};
 root.irExecDocs=api;
 if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
