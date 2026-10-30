"use strict";
/*
 * Исполнительная документация of an object: the act types, the documents of quality the montage needs (metal, fasteners,
 * electrodes, paint, primer…), and the documents themselves — one model of blocks that becomes a Word file (.docx, made
 * here: a ZIP of WordprocessingML without packages) or the HTML the main process prints into PDF.
 * The works of an act come from the daily reports of the chosen period and work type; the marks, their mass and axes —
 * from the marks register and the montage scheme; the documents of quality — from what the engineer loaded here.
 * Forms follow РД-11-02-2006 (прил. 3, 4), СН РК 1.03-00-2011, СП 70.13330, СП 72.13330, ГОСТ 24297, ГОСТ 31385.
 */
(root=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{if(v==null||String(v).trim()==="")return null;const n=Number(String(v).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
 const fmt=(v,dp=0)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("ru-RU",{minimumFractionDigits:dp,maximumFractionDigits:dp});
 const day=v=>String(v||"").slice(0,10);
 const ru=v=>{const d=day(v);return/^\d{4}-\d{2}-\d{2}$/.test(d)?d.slice(8,10)+"."+d.slice(5,7)+"."+d.slice(0,4):String(v||"")};
 const ruLong=v=>{const d=day(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return String(v||"");const M=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];return`«${d.slice(8,10)}» ${M[Number(d.slice(5,7))-1]} ${d.slice(0,4)} г.`};

 // Who takes part: the order of the acts' lists and signatures. Technical and author's supervision only when they exist.
 const ROLES=[
  {key:"customer",name:"Заказчик (технический заказчик)",short:"Представитель заказчика"},
  {key:"tech",name:"Технический надзор",short:"Представитель технического надзора",optional:true},
  {key:"author",name:"Авторский надзор",short:"Представитель авторского надзора (проектной организации)",optional:true},
  {key:"general",name:"Генеральный подрядчик",short:"Представитель генерального подрядчика",auto:true},
  {key:"contractor",name:"Подрядчик (выполнивший работы)",short:"Представитель подрядчика, выполнившего работы"},
  {key:"sub",name:"Субподрядчик",short:"Представитель субподрядчика",optional:true}
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
 // Act types. need: the groups of documents of quality the act lists in «применены».
 const ACTS=[
  {key:"aosr",name:"Акт освидетельствования скрытых работ",basis:"РД-11-02-2006 прил. 3; СН РК 1.03-00-2011",need:["structures","metal","fasteners","electrodes","primer","paint","other"],next:true},
  {key:"aook",name:"Акт промежуточной приёмки ответственных конструкций",basis:"РД-11-02-2006 прил. 4; СП 70.13330.2012 п. 10.6",need:["structures","metal","fasteners","electrodes"],next:true},
  {key:"foundation",name:"Акт приёмки фундаментов (опор) под монтаж металлоконструкций",basis:"СП 70.13330.2012 п. 4.5, 10.1",need:["other"],handover:true},
  {key:"equipment",name:"Акт установки оборудования на фундамент",basis:"СП 76.13330.2016 (СНиП 3.05.05-84)",need:["structures","fasteners","other"],equipment:true},
  {key:"bolts",name:"Акт контроля натяжения высокопрочных болтов",basis:"СП 70.13330.2012 п. 10.3, прил. Ж; СТО НОСТРОЙ 2.10.64",need:["fasteners"],bolts:true},
  {key:"welds",name:"Акт визуального и измерительного контроля сварных соединений",basis:"СП 70.13330.2012 п. 10.4; РД 03-606-03; ГОСТ 23118",need:["electrodes"],welds:true},
  {key:"akz",name:"Акт освидетельствования антикоррозионной защиты (грунтование, окраска)",basis:"СП 72.13330.2016; СП 28.13330",need:["primer","paint"],akz:true},
  {key:"fireproof",name:"Акт освидетельствования огнезащитной обработки металлоконструкций",basis:"СП 2.13130; ГОСТ Р 53295",need:["fire"],akz:true},
  {key:"input",name:"Акт входного контроля металлоконструкций и материалов",basis:"ГОСТ 24297-2013; СП 48.13330 п. 7.1",need:["structures","metal","fasteners","electrodes","primer","paint","fire","other"],input:true},
  {key:"geodesy",name:"Акт приёмки геодезической разбивочной основы",basis:"РД-11-02-2006 прил. 1; СП 126.13330",need:[],geodesy:true},
  {key:"tank",name:"Акт испытания резервуара на прочность и герметичность (гидравлическое)",basis:"ГОСТ 31385-2016 п. 9; СП 365.1325800",need:["structures","metal","electrodes"],tank:true},
  {key:"vacuum",name:"Акт контроля герметичности сварных швов днища (вакуум-камерой)",basis:"ГОСТ 31385-2016 п. 8.4",need:["electrodes"],welds:true},
  {key:"ready",name:"Акт технической готовности смонтированных металлоконструкций",basis:"СП 70.13330.2012 п. 10.6; СН РК 1.03-00-2011",need:["structures","metal","fasteners","electrodes","primer","paint"],ready:true},
  {key:"journal",name:"Журнал монтажных работ (выписка за период)",basis:"СП 70.13330.2012 прил. А; РД-11-05-2007",need:[],journal:true},
  {key:"certs",name:"Реестр документов о качестве",basis:"РД-11-02-2006 п. 9",need:["structures","metal","fasteners","electrodes","primer","paint","fire","other"],register:true}
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
 // The axes of the marks on the montage scheme: «1–8 / А–Г» (the grid: axes and spans from the first axis).
 function axesOf(scheme,markNames){
  const grid=arr(scheme).find(r=>(r.record_type||r.data?.entity_type)==="scheme_grid"||r.data?.entity_type==="grid")?.data;
  if(!grid||!arr(grid.axes_x).length)return"";
  const pos=(names,spans)=>{let s=0;return arr(names).map((n,i)=>{const p=s;s+=num(arr(spans)[i])||0;return[String(n),p]})};
  const X=pos(grid.axes_x,grid.x_spans_mm),Y=pos(grid.axes_y,grid.y_spans_mm);
  const near=(list,v)=>{let b=null;for(const[n,p]of list){const d=Math.abs(v-p);if(!b||d<b[1])b=[n,d]}return b?b[0]:""};
  const want=new Set(arr(markNames).map(norm));const xs=new Set(),ys=new Set();
  for(const r of arr(scheme)){const d=r.data||{};if(r.record_type!=="scheme_column"&&d.entity_type==="grid")continue;if(!want.has(norm(d.mark)))continue;
   for(const[x,y]of[[d.x_mm,d.y_mm],[d.x2_mm,d.y2_mm]]){if(num(x)==null||num(y)==null)continue;xs.add(near(X,num(x)));if(Y.length)ys.add(near(Y,num(y)))}}
  if(!xs.size)return"";
  const range=(list,set)=>{const idx=list.map(a=>a[0]).filter(n=>set.has(n));return idx.length>1?idx[0]+"–"+idx[idx.length-1]:idx[0]||""};
  return[range(X,xs),range(Y,ys)].filter(Boolean).join(" / ")
 }

 // ---- documents ----
 const B={
  title:text=>({t:"title",text}),center:text=>({t:"center",text}),p:(text,o={})=>({t:"p",text,...o}),
  field:(label,value)=>({t:"field",label,value:value||"_______________________________"}),
  table:(head,rows,w)=>({t:"table",head,rows,w}),sign:rows=>({t:"sign",rows}),brk:()=>({t:"break"}),small:text=>({t:"small",text})
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
 const materialsOf=(act,list,markSet)=>list.filter(x=>!x.hidden&&act.need.includes(x.group)&&(!x.marks?.length||!markSet.size||x.marks.some(m=>markSet.has(norm(m)))));
 const materialText=x=>x.title+(x.docs.length?" — "+x.docs.map(certText).join("; "):" — документ о качестве не загружен");
 function header(act,ctx,n,date){
  const o=ctx.settings.object||{};
  return[B.title(act.name+(n?" № "+n:"")),B.small(act.basis),B.p((o.city||"")+(o.city?"   ":"")+ruLong(date),{align:"right"}),
   B.field("Объект капитального строительства",[o.name,o.address].filter(Boolean).join(", ")),
   B.field("Шифр проекта (рабочей документации)",o.project_code),B.field("Проектная организация",o.designer),
   B.p("Представители, участвующие в освидетельствовании:",{b:true}),...ctx.people.map(p=>B.field(p.short,personText(p)))]
 }
 function footer(ctx,extra){return[...(extra||[]),B.p("Подписи:",{b:true}),B.sign(signRows(ctx.people))]}
 function actBlocks(act,ctx,part,n){
  const {rows,from,to}=part,date=to||from,marks=rows.map(r=>r.mark).filter(Boolean),markSet=new Set(marks.map(norm));
  const axes=axesOf(ctx.scheme,marks),wt=ctx.workType,mats=materialsOf(act,ctx.needs,markSet);
  const workName=(wt?.name||rows[0]?.work_type||"Монтаж металлоконструкций")+(axes?" в осях "+axes:"");
  const period=from===to?ru(from):ru(from)+" – "+ru(to);
  const scope=rows.length?worksText(rows):"работы за период в ежедневных отчётах не найдены";
  const docs=["Ежедневные отчёты о выполненных работах за "+period,"Исполнительная геодезическая схема "+(axes?"в осях "+axes:"")];
  const out=header(act,ctx,n,date);
  if(act.register)return[...header(act,ctx,n,date).slice(0,4),B.table(["№","Материал / изделие","Документ о качестве","Марки"],ctx.needs.filter(x=>!x.hidden).map((x,i)=>[String(i+1),x.title+(x.detail?" ("+x.detail+")":""),x.docs.length?x.docs.map(certText).join("; "):"не загружен",arr(x.marks).slice(0,12).join(", ")+(arr(x.marks).length>12?"…":"")]),[5,40,35,20]),...footer(ctx)];
  if(act.journal){
   const lines=[];for(const r of ctx.reports){const d=r.data||r,w=itemsOf(r).filter(x=>!ctx.workTypeId||String(x.work_type_id||"")===String(ctx.workTypeId));if(!w.length)continue;
    lines.push([ru(d.date),worksText(works([r],{workTypeId:ctx.workTypeId,marks:ctx.marks})),String(d.weather||""),arr(d.responsible).map(x=>x?.name||x).filter(Boolean).join(", ")||String(d.responsible||""),String(d.note||"")])}
   return[B.title(act.name),B.small(act.basis),B.field("Объект",[ctx.settings.object?.name,ctx.settings.object?.address].filter(Boolean).join(", ")),B.field("Вид работ",workName),B.field("Период",period),
    B.table(["Дата","Выполненные работы (марки, количество, объём)","Погода","Ответственный","Примечание"],lines.length?lines:[["—","записей нет","","",""]],[13,47,12,16,12]),...footer(ctx)]
  }
  if(act.input){
   return[...out,B.p("1. Входному контролю подвергнуты: "+(rows.length?"металлоконструкции марок "+marks.join(", "):"металлоконструкции и материалы, поступившие на объект")+".",{}),
    B.p("2. Проверено: наличие и соответствие документов о качестве, маркировка, комплектность, геометрические размеры, отсутствие повреждений и деформаций, качество заводских сварных швов и защитного покрытия.",{}),
    B.table(["№","Материал / изделие","Документ о качестве"],mats.map((x,i)=>[String(i+1),x.title,x.docs.length?x.docs.map(certText).join("; "):"не загружен"]),[6,50,44]),
    B.p("3. Заключение: материалы и изделия соответствуют требованиям проектной документации и допускаются к применению.",{}),...footer(ctx)]
  }
  if(act.geodesy)return[...out,B.p("1. Предъявлена к приёмке геодезическая разбивочная основа для монтажа: "+workName+".",{}),B.p("2. Знаки закреплены, отклонения не превышают допускаемых СП 126.13330. Схема закрепления знаков прилагается.",{}),B.p("3. Геодезическая разбивочная основа принята.",{}),...footer(ctx)];
  if(act.handover)return[...out,B.p("1. Предъявлены к приёмке фундаменты (опоры) под монтаж металлоконструкций"+(axes?" в осях "+axes:"")+".",{}),B.p("2. Проверены: отметки опорных поверхностей, положение анкерных болтов в плане, их выступ и состояние резьбы, прочность бетона (не ниже 70 % проектной), наличие исполнительной геодезической схемы.",{}),B.p("3. Отклонения не превышают допускаемых СП 70.13330 (табл. 4.5).",{}),B.p("4. Фундаменты принимаются под монтаж металлоконструкций.",{}),...footer(ctx,[B.field("Приложение","исполнительная геодезическая схема фундаментов")])];
  if(act.equipment)return[...out,B.p("1. Установлено на фундамент оборудование: "+scope+".",{}),B.p("2. Проверены: отметки и горизонтальность опорных поверхностей, положение осей оборудования относительно осей фундамента, затяжка фундаментных болтов, плотность прилегания подкладок.",{}),B.table(["Параметр","По проекту","Фактически","Допуск"],[["Отметка опорной поверхности","","",""],["Смещение осей в плане","","",""],["Отклонение от горизонтали","","",""],["Затяжка фундаментных болтов","","",""]],[40,20,20,20]),
   B.p("3. Применены: "+(mats.map(materialText).join("; ")||"—")+".",{}),B.p("4. Оборудование установлено в соответствии с проектом; разрешается подливка опорных частей.",{}),...footer(ctx)];
  if(act.bolts){const bolts=ctx.needs.filter(x=>x.group==="fasteners"&&/болт/i.test(x.title));return[...out,B.p("1. Предъявлены монтажные соединения на высокопрочных болтах: "+scope+".",{}),
   B.table(["Болт","Документ о качестве","Способ контроля","Результат"],(bolts.length?bolts:[{title:"Болты высокопрочные",docs:[]}]).map(x=>[x.title,x.docs.length?x.docs.map(certText).join("; "):"не загружен","по моменту закручивания","натяжение соответствует проекту"]),[34,30,18,18]),
   B.p("2. Подготовка контактных поверхностей выполнена способом, указанным в проекте; тарировка ключей проведена, журнал контроля натяжения ведётся.",{}),B.p("3. Соединения выполнены в соответствии с проектом и СП 70.13330.",{}),...footer(ctx)]}
  if(act.welds)return[...out,B.p("1. Предъявлены монтажные сварные соединения: "+scope+".",{}),B.p("2. Сварка выполнена с применением: "+(mats.map(materialText).join("; ")||"—")+".",{}),B.p("3. Выполнен визуальный и измерительный контроль 100 % швов; недопустимых дефектов (трещин, непроваров, подрезов, пор сверх норм) не выявлено. Размеры швов соответствуют проекту.",{}),B.p("4. Сварные соединения признаны годными.",{}),...footer(ctx,[B.field("Сварщики (ФИО, клеймо, удостоверение)","")])];
  if(act.akz)return[...out,B.p("1. Предъявлены работы: "+(act.key==="fireproof"?"огнезащитная обработка":"антикоррозионная защита (подготовка поверхности, грунтование, окраска)")+" металлоконструкций — "+scope+".",{}),B.p("2. Применены: "+(mats.map(materialText).join("; ")||"—")+".",{}),B.table(["Параметр","По проекту","Фактически"],[["Степень очистки поверхности","",""],["Число слоёв","",""],["Толщина покрытия, мкм","",""],["Адгезия, балл","",""]],[50,25,25]),B.p("3. Работы выполнены в соответствии с проектом и "+(act.key==="fireproof"?"технологическим регламентом на огнезащитный состав":"СП 72.13330")+".",{}),...footer(ctx)];
  if(act.tank)return[...out,B.p("1. Резервуар испытан наливом воды до проектного уровня с выдержкой по ГОСТ 31385; проверены прочность и герметичность стенки, днища и узлов, осадка основания.",{}),B.p("2. Течи, отпотевания и недопустимые деформации не обнаружены; осадка основания в пределах допуска.",{}),B.p("3. Применены: "+(mats.map(materialText).join("; ")||"—")+".",{}),B.p("4. Резервуар признан выдержавшим гидравлическое испытание.",{}),...footer(ctx)];
  if(act.ready)return[...out,B.p("1. Предъявлены законченные монтажом металлоконструкции: "+workName+" — "+scope+".",{}),B.p("2. Работы выполнены в период "+period+".",{}),B.p("3. Применены: "+(mats.map(materialText).join("; ")||"—")+".",{}),B.p("4. Предъявлены документы: "+docs.join("; ")+"; акты освидетельствования скрытых работ и промежуточной приёмки; журнал монтажных работ.",{}),B.p("5. Металлоконструкции смонтированы в соответствии с проектом и СП 70.13330 и признаются готовыми к дальнейшему производству работ.",{}),...footer(ctx)];
  // АОСР and АООК: the forms of РД-11-02-2006.
  return[...out,
   B.p("1. К освидетельствованию предъявлены "+(act.key==="aook"?"следующие ответственные конструкции":"следующие работы")+": "+workName+" — "+scope+".",{}),
   B.p("2. Работы выполнены по проектной документации: "+[ctx.settings.object?.project_code,rows.map(r=>r.code).filter(Boolean)[0]].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", ")+(ctx.settings.object?.designer?" ("+ctx.settings.object.designer+")":"")+".",{}),
   B.p("3. При выполнении работ применены: "+(mats.map(materialText).join("; ")||"—")+".",{}),
   B.p("4. Предъявлены документы, подтверждающие соответствие работ предъявляемым к ним требованиям: "+docs.join("; ")+".",{}),
   B.p("5. Даты: начала работ "+ru(rows.flatMap(r=>r.dates).sort()[0]||from)+", окончания работ "+ru(rows.flatMap(r=>r.dates).sort().slice(-1)[0]||to)+".",{}),
   B.p("6. Работы выполнены в соответствии с проектной документацией, техническими регламентами и СП 70.13330.",{}),
   B.p("7. "+(act.key==="aook"?"На основании изложенного разрешается использование конструкций по назначению / производство последующих работ: ":"Разрешается производство последующих работ: ")+(ctx.settings.next_works||"_______________________________")+".",{}),
   B.field("Дополнительные сведения",""),B.field("Акт составлен в экземплярах",ctx.settings.copies||"3"),B.field("Приложения","исполнительная геодезическая схема, документы о качестве по п. 3"),...footer(ctx)]
 }
 // The whole set: the inventory first, then each chosen act (one for the period or one per day of works).
 function buildPackage(input){
  const {settings={},reports=[],marks=[],scheme=[],workTypes=[],needsList=[],acts=[],from="",to="",workTypeId="",split="period"}=input;
  const inPeriod=reportsIn(reports,{from,to}),workType=arr(workTypes).find(w=>String(w.id)===String(workTypeId))||null;
  const ctx={settings,reports:inPeriod,marks,scheme,needs:needsList,workType,workTypeId,people:people(settings)};
  const all=works(inPeriod,{workTypeId,marks});
  const days=[...new Set(all.flatMap(r=>r.dates))].sort();
  const parts=split==="day"&&days.length?days.map(d=>({from:d,to:d,rows:works(inPeriod.filter(r=>day((r.data||r).date)===d),{workTypeId,marks})})):[{from:from||days[0]||"",to:to||days[days.length-1]||"",rows:all}];
  let n=Math.max(1,Math.round(num(settings.start_number)||1));const docs=[];
  for(const key of acts){const act=ACT[key];if(!act)continue;const single=act.journal||act.register||act.input||act.geodesy||act.handover||act.tank;
   for(const part of single?[{from:parts[0].from,to:parts[parts.length-1].to,rows:all}]:parts){const no=act.journal||act.register?"":String(n++);docs.push({act,number:no,from:part.from,to:part.to,blocks:actBlocks(act,ctx,part,no)})}}
  const o=settings.object||{};
  const inventory=[B.title("Опись исполнительной документации"),B.field("Объект",[o.name,o.address].filter(Boolean).join(", ")),B.field("Вид работ",workType?.name||"все виды работ"),B.field("Период",ru(from)+" – "+ru(to)),
   B.table(["№","Наименование документа","Дата","Листов"],docs.map((d,i)=>[String(i+1),d.act.name+(d.number?" № "+d.number:""),d.from===d.to?ru(d.to):ru(d.from)+" – "+ru(d.to),"1"]).concat(needsList.filter(x=>!x.hidden&&x.docs.length).map((x,i)=>[String(docs.length+i+1),"Документ о качестве: "+x.title+" — "+x.docs.map(certText).join("; "),x.docs[0]?.date?ru(x.docs[0].date):"",String(x.docs.length)])),[6,64,16,14])];
  const missing=needsList.filter(x=>!x.hidden&&!x.docs.length&&acts.some(k=>ACT[k]?.need.includes(x.group)));
  return{title:"Исполнительная документация — "+(o.name||"объект"),docs,inventory,missing,works:all,people:ctx.people,
   blocks:[...inventory,...docs.flatMap(d=>[B.brk(),...d.blocks])],
   attachments:needsList.filter(x=>!x.hidden).flatMap(x=>x.docs.filter(d=>d.file?.path).map(d=>({path:d.file.path,name:d.file.name,group:GROUPS.find(g=>g.key===x.group)?.name||"Прочее",title:x.title})))}
 }

 // ---- HTML (for PDF) ----
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 function toHtml(pkg){
  const b=pkg.blocks.map(x=>{switch(x.t){
   case"title":return`<h1>${esc(x.text)}</h1>`;case"center":return`<p class="c">${esc(x.text)}</p>`;case"small":return`<p class="s">${esc(x.text)}</p>`;
   case"p":return`<p class="${x.align==="right"?"r":""}">${x.b?"<b>":""}${esc(x.text)}${x.b?"</b>":""}</p>`;
   case"field":return`<p class="f"><b>${esc(x.label)}:</b> <u>${esc(x.value)}</u></p>`;
   case"table":return`<table><colgroup>${arr(x.w).map(w=>`<col style="width:${w}%">`).join("")}</colgroup><thead><tr>${x.head.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${x.rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
   case"sign":return`<table class="sign">${x.rows.map(r=>`<tr><td>${esc(r[0])}</td><td class="line"></td><td>${esc(r[1])}</td></tr><tr class="hint"><td></td><td>(подпись)</td><td>(ФИО)</td></tr>`).join("")}</table>`;
   case"break":return'<div class="pb"></div>';default:return""}}).join("\n");
  return`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(pkg.title)}</title><style>@page{size:A4;margin:15mm 15mm 15mm 25mm}body{font-family:"Times New Roman",serif;font-size:12pt;color:#000;line-height:1.3}h1{font-size:13pt;text-align:center;margin:0 0 4pt}p{margin:0 0 6pt;text-align:justify}p.c{text-align:center}p.r{text-align:right}p.s{text-align:center;font-size:9pt;color:#333;margin-bottom:10pt}p.f u{text-decoration:none;border-bottom:1px solid #000}table{width:100%;border-collapse:collapse;margin:4pt 0 10pt;font-size:10.5pt;page-break-inside:auto}th,td{border:1px solid #000;padding:3pt 4pt;vertical-align:top;text-align:left}th{background:#eee}tr{page-break-inside:avoid}table.sign td{border:0;padding:8pt 4pt 0}table.sign td.line{border-bottom:1px solid #000;width:28%}table.sign tr.hint td{font-size:8pt;padding-top:0;text-align:center;color:#444}.pb{page-break-after:always}</style></head><body>${b}</body></html>`
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
 function documentXml(pkg){
  let brk=false;const body=[];
  for(const x of pkg.blocks){const o={brk};brk=false;
   if(x.t==="break"){brk=true;continue}
   if(x.t==="title")body.push(para(run(x.text,{b:true,sz:26}),{...o,jc:"center",after:40}));
   else if(x.t==="center")body.push(para(run(x.text),{...o,jc:"center"}));
   else if(x.t==="small")body.push(para(run(x.text,{sz:18}),{...o,jc:"center",after:160}));
   else if(x.t==="p")body.push(para(run(x.text,{b:x.b}),{...o,jc:x.align==="right"?"right":"both"}));
   else if(x.t==="field")body.push(para(run(x.label+": ",{b:true})+run(x.value,{u:true}),{...o,jc:"left"}));
   else if(x.t==="table")body.push((o.brk?para("",{brk:true,after:0}):"")+tableXml(x.head,x.rows,x.w));
   else if(x.t==="sign")body.push((o.brk?para("",{brk:true,after:0}):"")+signXml(x.rows))}
  return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1418" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`
 }
 const STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
 function docxFiles(pkg){
  return[
   ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
   ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
   ["docProps/core.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(pkg.title)}</dc:title><dc:creator>IR Project</dc:creator></cp:coreProperties>`],
   ["word/_rels/document.xml.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ["word/styles.xml",STYLES],
   ["word/document.xml",documentXml(pkg)]]
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

 const api={ROLES,GROUPS,ACTS,ACT,needs,fromTexts,reportsIn,works,axesOf,people,buildPackage,toHtml,toDocx,documentXml,zip,crc32,certText,ru,day};
 root.irExecDocs=api;
 if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
