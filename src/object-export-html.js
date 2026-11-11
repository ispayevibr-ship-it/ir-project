"use strict";
/* Self-contained read-only HTML object archive. Source DB is never changed. */
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const labels={overview:"Обзор объекта",reports:"Ежедневные отчёты","extra-works":"Дополнительные работы","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы",fasteners:"Ведомость метизов","executive-docs":"Исполнительная документация",letters:"Исходящие письма",trash:"Корзина","ai-recognition":"ИИ-распознавание"};
 // Russian counting words: 1 запись, 2 записи, 5 записей.
 const plural=(n,one,few,many)=>{const a=Math.abs(Math.round(Number(n)||0)),t=a%100,u=a%10;return t>10&&t<20?many:u===1?one:u>=2&&u<=4?few:many};
 const countText=(n,one,few,many)=>n+" "+plural(n,one,few,many);
 // A work type made by the recognition of drawings carries «3 PDF-файлов» for its code: said right.
 const codeText=c=>{const m=String(c||"").match(/^(\d+) PDF-файл\S*$/);return m?countText(+m[1],"PDF-файл","PDF-файла","PDF-файлов"):String(c||"")};
 const fields={mark:"Марка",name:"Наименование",title:"Наименование",date:"Дата",report_date:"Дата отчёта",type:"Тип",work_type:"Вид работы",work_type_id:"ID вида работ",project_code:"Шифр",code:"Шифр",qty:"Кол-во",count:"Кол-во",unit:"Ед. изм.",unit_volume:"Объём 1 ед.",total_volume:"Общий объём",total_value:"Общий объём",volume:"Объём",status:"Статус",note:"Примечание",extra:"Дополнительная информация",address:"Адрес",start_date:"Начало",end_date:"Окончание",weather:"Погода",temperature:"Температура",wind:"Ветер",workers:"Работники",responsible:"Ответственные",equipment:"Техника",items:"Выполненные работы",works:"Выполненные работы",photos:"Фотографии",mark_id:"ID марки",created_at:"Создано",updated_at:"Изменено",record_type:"Тип записи",parent_id:"Родительская запись"};
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const array=x=>Array.isArray(x)?x:[];
 const safeFile=name=>String(name||"IR Project").replace(/[<>:"/\\|?*\u0000-\u001f]/g,"_").trim().slice(0,75)||"IR Project";
 const label=k=>fields[k]||String(k||"").replaceAll("_"," ");
 const type=x=>x===null?"":Array.isArray(x)?"array":typeof x;
 const flatText=v=>type(v)==="object"||type(v)==="array"?JSON.stringify(v,null,2):String(v??"");
 const imageKey=k=>/^(photos?|photo_path|image|image_path|cover|banner|file_path)$/i.test(String(k||""));
 const dataUrl=v=>/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(String(v||""))||/^data:image\/svg\+xml,/i.test(String(v||""));
 function photoRefs(value,refs,key="",depth=0){
  if(depth>10||refs.size>4000||value==null)return;
  if(Array.isArray(value)){for(const item of value)photoRefs(item,refs,key,depth+1);return}
  if(typeof value==="object"){for(const [k,v] of Object.entries(value))photoRefs(v,refs,k,depth+1);return}
  if(typeof value!=="string"||!imageKey(key)||dataUrl(value))return;
  if(/\.(pdf|docx?|xlsx?)$/i.test(value))return;
  if(value.length<1200)refs.add(value)
 }
 async function inlinePhotos(sectionRows,onPhoto){
  const refs=new Set();
  for(const [section,rows] of Object.entries(sectionRows))for(const row of rows){
   const d=row.data||row;
   photoRefs(d,refs);
   if(section==="reports")for(const photo of array(d.photos).length?d.photos:array(d.reportPhotos)){
    const file=typeof photo==="string"?photo:String(photo?.file_path||photo?.file||photo?.path||"");
    if(file&&!dataUrl(file)&&!/\.(pdf|docx?|xlsx?)$/i.test(file)&&file.length<1200)refs.add(file)
   }
  }
  const keys=[...refs],output=new Map();let cursor=0;
  async function worker(){
   while(cursor<keys.length){
    const key=keys[cursor++];
    try{const result=await irProject.images.read(key);if(dataUrl(result))output.set(key,result)}
    catch(error){console.warn("Object HTML: photo unavailable",error)}
    if(onPhoto)onPhoto(output.size,keys.length)
   }
  }
  await Promise.all(Array.from({length:Math.min(keys.length,5)},worker));
  return output
 }
 function mediaHtml(key,value,images){
  if(!imageKey(key))return"";
  const values=Array.isArray(value)?value:typeof value==="string"?[value]:[];
  return values.map(v=>{
   const src=dataUrl(v)?v:images.get(v);
   return src?'<img class="ir-export-photo" src="'+esc(src)+'" loading="lazy" alt="Фото объекта">':""
  }).join("")
 }
 function fieldHtml(key,value,images){
  const media=mediaHtml(key,value,images);
  const t=type(value);
  if(value==null)return'<span class="ir-export-empty">—</span>';
  if(t==="boolean")return value?"Да":"Нет";
  if(t==="array"||t==="object"){
   const count=Array.isArray(value)?value.length:Object.keys(value).length;
   return (media||"")+'<details><summary>Показать данные ('+count+')</summary><pre>'+esc(flatText(value))+'</pre></details>'
  }
  if(value==="")return'<span class="ir-export-empty">—</span>';
  const s=String(value);
  if(media)return'<div class="ir-export-field-media">'+media+(s.startsWith("data:")?"":'<small>'+esc(s)+'</small>')+"</div>";
  return'<span class="ir-export-value">'+esc(s)+'</span>'
 }
 function rowHeading(r,i,key){
  const d=r.data||{};
  const date=d.date||d.report_date||d.delivery_date||"";
  const title=d.mark||d.name||d.work_type||d.title||r.title||d.number||d.invoice_number||"";
  const base=title?String(title):"Запись №"+(i+1);
  return(key==="reports"&&date?"Отчёт за "+date+" — ":"")+base
 }
 function renderRows(rows,key,images){
  if(!rows.length)return'<div class="ir-export-empty-card">Данные в этом разделе отсутствуют</div>';
  return'<div class="ir-export-records">'+rows.map((r,i)=>{
   const d=r.data||{},entries=Object.entries(d).filter(([k,v])=>!k.startsWith("__")&&v!==undefined);
   const heading=rowHeading(r,i,key);
   const pills=[d.date||d.report_date,d.project_code||d.code,d.qty!=null?"Кол-во: "+d.qty:null,d.status].filter(Boolean);
   // (no inner ids and record types — the engineer, 06.11.2026: «блоки внутри … оформи как положенно»)
   const details=entries.filter(([k,v])=>!/(^id$|_id$|^record_type$|^file_?path$)/i.test(k)&&v!==null&&v!==""&&!(Array.isArray(v)&&!v.length));
   return'<article class="ir-export-record"><details><summary><span class="ir-export-row-no">'+(i+1)+'</span><span class="ir-export-row-title">'+esc(heading)+'</span><span class="ir-export-row-meta">'+pills.map(v=>'<small>'+esc(v)+'</small>').join("")+'</span></summary><div class="ir-export-details">'+details.map(([name,value])=>'<div class="ir-export-detail"><b>'+esc(label(name))+'</b><div>'+fieldHtml(name,value,images)+'</div></div>').join("")+'</div></details></article>'
  }).join("")+"</div>"
 }

 const exportNumber=v=>{const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const exportFormat=v=>{const n=exportNumber(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const exportDate=v=>{const d=String(v||"").slice(0,10),p=d.split("-");return p.length===3?p[2]+"."+p[1]+"."+p[0]:(d||"—")};
 const reportPeople=r=>array(r.workers).length?array(r.workers):array(r.people);
 const reportResponsible=r=>array(r.responsible).length?array(r.responsible):array(r.responsibles);
 const reportPhotos=r=>array(r.photos).length?array(r.photos):array(r.reportPhotos);
 const reportWorks=r=>array(r.items).length?array(r.items):array(r.works);
 const photoPath=p=>typeof p==="string"?p:String(p?.file_path||p?.file||p?.path||"");
 const reportWeather=r=>typeof r.weather==="string"?r.weather:r.weather?.text||r.weather?.condition||r.weather_text||"Не указана";
 const reportTemp=r=>{const v=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp;if(v==null||v==="")return"";const n=exportNumber(v);return(n>0?"+":"")+exportFormat(n)+"°C"};
 const reportCountPeople=r=>reportPeople(r).reduce((t,x)=>t+exportNumber(x.count??x.qty),0)+reportResponsible(r).reduce((t,x)=>{const n=exportNumber(x.count??x.qty);return t+(n>0?n:(x.role||x.name?1:0))},0);
 const reportCountEquipment=r=>array(r.equipment).reduce((t,x)=>t+exportNumber(x.count??x.qty),0);
 const reportService=w=>w?.accounting_type==="service"||w?.is_service===true||String(w?.unit||"").toLowerCase()==="услуга";
 const reportVolume=w=>{
  const direct=exportNumber(w.volume??w.total_volume);
  if(direct)return direct;
  const q=exportNumber(w.qty??w.count??w.quantity),unit=exportNumber(w.unit_volume??w.volume_one??w.volume1);
  return unit?q*unit:(w.mark_id||w.mark?0:q)
 };
 const reportTotals=r=>{const totals=new Map();for(const w of reportWorks(r)){if(reportService(w))continue;const unit=String(w.unit||"ед.");totals.set(unit,(totals.get(unit)||0)+reportVolume(w))}return [...totals.entries()].map(([unit,value])=>exportFormat(value)+" "+unit)};
 const exportSvg=name=>{
  const paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h5"/>',weather:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12h2M20 12h2"/>',people:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',equipment:'<path d="M2 17v-3h12v3M14 17v-6h4l3 3.5V17M2 17h19M12 14 5 4.5M5 4.5V10M4 10.5h2"/><circle cx="6" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',volume:'<path d="m3 7 9-4 9 4-9 4-9-4M3 7v10l9 4 9-4V7M12 11v10"/>'};
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.volume)+'</svg>'
 };
 const reportMetric=(icon,title,value,sub="")=>'<div class="ir-export-daily-metric"><span class="ir-export-daily-icon">'+exportSvg(icon)+'</span><div><small>'+esc(title)+'</small><b>'+esc(value)+'</b>'+(sub?'<em>'+esc(sub)+'</em>':"")+'</div></div>';
 function reportBrief(r,no){
  const weather=reportWeather(r),temp=reportTemp(r),wind=r.wind??r.wind_speed??r.windSpeed??r.weather?.wind??"";
  const works=reportWorks(r),volume=reportTotals(r);
  return '<div class="ir-export-daily-brief">'+
   reportMetric("calendar","Дата",exportDate(r.date||r.report_date),"Отчёт №"+no)+
   reportMetric("weather","Погода",weather+(temp?" · "+temp:""),wind?"Ветер: "+wind:"")+
   reportMetric("people","Люди",exportFormat(reportCountPeople(r))+" чел.")+
   reportMetric("equipment","Техника",exportFormat(reportCountEquipment(r))+" ед.")+
   reportMetric("volume","Выполнено",volume.length?volume.join(" · "):(works.length?works.length+" работ":"Работы не проводились"))+
   '<span class="ir-export-daily-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></div>'
 }
 function reportChips(records,mode){
  if(!records.length)return'<p class="ir-export-muted">Не указаны</p>';
  return'<div class="ir-export-daily-chips">'+records.map(item=>{
   const name=item.role||item.name||item.type||"Не указано";
   const value=mode==="responsible"?(item.name||"—"):(exportFormat(item.count??item.qty)+" "+(mode==="equipment"?"ед.":"чел."));
   return'<div class="ir-export-daily-chip"><small>'+esc(name)+'</small><b>'+esc(value)+'</b></div>'
  }).join("")+'</div>'
 }

 function reportMarkNames(rows){
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const byId=new Map(),byKey=new Map();
  for(const row of array(rows)){
   const d=row.data||{},mark=String(d.mark||row.title||"").trim(),name=String(d.name||"").trim();
   if(!mark)continue;
   const ref={mark,name},key=String(d.work_type_id||"")+"|"+norm(d.project_code||d.code)+"|"+norm(mark);
   byId.set(String(row.id),ref);
   if(!byKey.has(key))byKey.set(key,ref);else byKey.set(key,null)
  }
  return{byId,byKey}
 }
 function reportMarkLabel(w,index){
  const mark=String(w.mark||"").trim(),id=String(w.mark_id??w.markId??w.mark_record_id??"");
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const key=String(w.work_type_id||"")+"|"+norm(w.project_code||w.code)+"|"+norm(mark);
  const ref=(id?index?.byId.get(id):null)||index?.byKey.get(key);
  const realMark=mark||ref?.mark||"",name=String(ref?.name||w.name||"").trim();
  return realMark?'<b>'+esc(realMark)+'</b>'+(name?'<small class="ir-export-work-mark-name">'+esc(name)+'</small>':""):esc(name||"—")
 }

 function reportWorkTable(works,markNames){
  if(!works.length)return'<p class="ir-export-muted">Работы не проводились</p>';
  const rows=works.map(w=>{
   const service=reportService(w),status=service?(w.completed===true||w.service_completed===true||w.status==="done"?"Выполнено":"Не выполнено"):exportFormat(reportVolume(w))+" "+String(w.unit||"");
   return'<tr><td><b>'+esc(workLabel(w.work_type||w.type||"Работа","mount"))+'</b></td><td>'+esc(w.project_code||w.code||"—")+'</td><td>'+reportMarkLabel(w,markNames)+'</td><td>'+esc(w.qty??w.count??w.quantity??"—")+'</td><td><b>'+esc(status)+'</b></td></tr>'
  }).join("");
  return'<div class="ir-export-daily-table"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка / наименование</th><th>Кол-во</th><th>Выполнено</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
 }

 function reportAdditionalWorks(r){
  const works=array(r.additional_works).filter(w=>w&&typeof w==="object"&&[w.name,w.work,w.qty,w.count,w.volume].some(v=>String(v??"").trim()));
  if(!works.length)return"";
  const rows=works.map(w=>{
   const name=String(w.name||w.work||"Работа"),qty=w.qty??w.count,unit=String(w.unit||"").trim(),volume=w.volume;
   const qtyText=qty!==null&&qty!==undefined&&String(qty).trim()!==""?String(qty)+" "+unit:"—";
   const volumeText=volume!==null&&volume!==undefined&&String(volume).trim()!==""?String(volume)+(unit?" "+unit:""):"—";
   return'<tr><td><b>'+esc(name)+'</b></td><td>'+esc(qtyText.trim())+'</td><td>'+esc(volumeText.trim())+'</td></tr>'
  }).join("");
  return'<div class="ir-export-daily-additional"><h3>Дополнительные работы</h3><div class="ir-export-daily-table"><table><thead><tr><th>Наименование</th><th>Количество</th><th>Объём</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'
 }

 function reportFull(record,r,images,markNames){
  return '<div class="ir-export-daily-full">'+reportWorkTable(reportWorks(r),markNames)+reportAdditionalWorks(r)+'</div>'
 }

 function exportMoreCards(htmlList,kind,totalCount=htmlList.length,totalUnits=0){
  const first=htmlList.slice(0,5).join("");
  if(htmlList.length<=5)return first;
  const other=htmlList.slice(5).join("");
  const suffix=kind==="reports"?"отчётов":kind==="positions"?"позиций":("групп · "+exportFormat(totalUnits)+" шт.");
  return first+'<details class="ir-export-more ir-export-more-'+esc(kind)+'"><summary><span class="ir-export-more-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span><span class="ir-export-more-show">Показать ещё (всего '+totalCount+' '+suffix+')</span><span class="ir-export-more-hide">Свернуть (показать первые 5)</span></summary><div class="ir-export-more-items">'+other+'</div></details>'
 }

 function renderDailyReports(rows,images,markNames){
  if(!rows.length)return'<div class="ir-export-empty-card">Ежедневных отчётов пока нет</div>';
  const numbers=new Map([...rows].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1]));
  const ordered=[...rows].sort((a,b)=>String(b.data?.date||b.data?.report_date||"").localeCompare(String(a.data?.date||a.data?.report_date||""))||(Number(b.id)||0)-(Number(a.id)||0));
  const cards=ordered.map((record,i)=>{
   const r={...record.data},no=numbers.get(String(record.id))||i+1;
   return'<article class="ir-export-daily-card"><details'+(i===0?' open':'')+'><summary>'+reportBrief(r,no)+'</summary>'+reportFull(record,r,images,markNames)+'</details></article>'
  });
  return'<div class="ir-export-daily-list">'+exportMoreCards(cards,"reports")+'</div>'
 }

 function schedulePreviewHtml(card){
  const rows=[...card.querySelectorAll(".overview-gantt-row")],types=new Map();
  for(const row of rows){
   const name=row.querySelector(".overview-gantt-name b")?.textContent?.trim()||"Вид работы";
   const code=row.querySelector(".overview-gantt-name span")?.textContent?.trim()||"";
   const key=name+"\u001f"+code;
   if(!types.has(key))types.set(key,{name,code,index:types.size});
   row.classList.add("ir-export-gantt-type-"+types.get(key).index)
  }
  if(!types.size)return card.outerHTML;
  const typesList=[...types.values()];
  const radios='<input type="radio" class="ir-export-gantt-radio ir-export-gantt-all" name="ir-export-gantt-choice" id="ir-export-gantt-all" checked>'+
   typesList.map(t=>'<input type="radio" class="ir-export-gantt-radio ir-export-gantt-radio-'+t.index+'" name="ir-export-gantt-choice" id="ir-export-gantt-'+t.index+'">').join("");
  const option=(id,text,count)=>'<label for="'+id+'">'+esc(text)+(count?'<small>'+esc(count)+'</small>':"")+'</label>';
  const labels='<div class="ir-export-gantt-options" role="group" aria-label="Вид работы для графика">'+option("ir-export-gantt-all","Все виды работ",rows.length+"")+
   typesList.map(t=>option("ir-export-gantt-"+t.index,t.name,t.code)).join("")+'</div>';
  const selectors=typesList.map(t=>
   '.ir-export-gantt-radio-'+t.index+':checked ~ .ir-export-gantt-view .overview-gantt-row:not(.ir-export-gantt-type-'+t.index+'){display:none!important}'+
   '.ir-export-gantt-radio-'+t.index+':checked ~ .ir-export-gantt-options label[for="ir-export-gantt-'+t.index+'"]{background:#236da6!important;color:#fff!important;border-color:#236da6!important}'
  ).join("\n");
  return'<div class="ir-export-gantt-filter">'+radios+labels+'<style>'+selectors+'</style><div class="ir-export-gantt-view">'+card.outerHTML+'</div></div>'
 }

 function extractOverviewPreviews(copy,keys){
  const available=new Set(keys),previews={};
  // Daily reports and grouped marks have their own archive cards, not duplicate overview widgets.
  copy.querySelectorAll(".object-overview-reports > .oor2-card,.object-overview-marks-wrap > .object-overview-marks-card,.object-overview-deliveries-wrap > .ood-deliveries").forEach(card=>card.remove());
  const sources=[
   ["deliveries",".object-overview-deliveries-wrap > .ood-comparison"],
   ["schedule",".object-overview-dashboard > .object-overview-schedule"],
   ["acted-days",".object-overview-admin-analysis > .ooa-acted"],
   ["penalties",".object-overview-admin-analysis > .ooa-penalties"]
  ];
  for(const [key,selector] of sources){
   if(!available.has(key))continue;
   for(const card of copy.querySelectorAll(selector)){
    if(card.closest("[hidden]")||card.hidden)continue;
    const wrapper=key==="photos"?"object-overview-reports":
     key==="deliveries"?"object-overview-deliveries-wrap":key==="schedule"?"object-overview-dashboard":
     key==="marks"?"object-overview-marks-wrap":"object-overview-admin-analysis";
    if(key==="schedule")card.querySelector(".schedule-trend")?.remove();
    (previews[key]??=[]).push('<div class="ir-object-overview-right ir-export-preview-layout"><div class="'+wrapper+'">'+(key==="schedule"?schedulePreviewHtml(card):card.outerHTML)+'</div></div>');
    card.remove()
   }
  }
  copy.querySelectorAll(".ir-object-overview-placeholder").forEach(el=>el.remove());
  const right=copy.querySelector(".ir-object-overview-right");
  if(right&&!right.querySelector(".oor2-card,.ood-card,.object-overview-schedule,.object-overview-marks-card,.ooa-card"))right.remove();
  return Object.fromEntries(Object.entries(previews).map(([key,value])=>[key,value.join("")]))
 }


 // The marks register as the program's page «Ведомость марок» shows it (src/marks-page.js): only the work types that have
 // marks (installation, fabrication — not «Другие виды работ», not services), and only marks of such a work type or of
 // none — a mark left from a deleted work type is not shown. The report showed every work type of the object in the
 // readiness of the register and a mark's own title as a work type (the engineer, 06.11.2026: «в самой программе их нигде
 // и нет, а в выгрузке есть, что в ведомостях марок, что в видах работ»).
 function markWorkRows(workRows,markRows){
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  return array(workRows).filter(r=>{const d=r.data||{},service=(d.accounting_type||"")==="service"||norm(d.unit)==="услуга";if(service||d.has_marks===false||d.work_category==="other")return false;if(d.has_marks===true||["installation","fabrication"].includes(d.work_category))return true;const id=String(r.id),name=norm(d.work_type||r.title||"");return name.includes("монтаж")||name.includes("изготов")||array(markRows).some(m=>String(m.data?.work_type_id||"")===id)})
 }
 function liveMarkRows(markRows,workRows){
  const allowed=new Set(markWorkRows(workRows,markRows).map(r=>String(r.id)));
  return array(markRows).filter(m=>{const w=String(m.data?.work_type_id||"");return!w||allowed.has(w)})
 }
 function markProgressGroups(markRows,workRows,reportRows){
  workRows=markWorkRows(workRows,markRows);markRows=liveMarkRows(markRows,workRows);
  const normalize=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const catalog=new Map(array(workRows).map(row=>{
   const d=row.data||{};
   return[String(row.id),{name:String(d.work_type||row.title||"Без вида работ"),code:String(d.project_code||d.code||"").trim(),code2:String(d.project_code_2||"").trim()}]
  }));
  const mountedMap=new Map();
  for(const record of array(reportRows)){
   const data=record.data||record;
   for(const item of array(data.items).length?data.items:array(data.works)){
    if(item?.accounting_type==="service"||item?.is_service===true||normalize(item?.unit)==="услуга")continue;
    const id=String(item?.mark_id??item?.markId??item?.mark_record_id??"");
    if(!id)continue;
    const qty=Math.max(0,exportNumber(item.qty??item.count??item.quantity));
    mountedMap.set(id,(mountedMap.get(id)||0)+qty)
   }
  }
  const groups=new Map();
  for(const raw of array(markRows)){
   const d=raw.data||{},qty=Math.max(0,exportNumber(d.qty??d.count));
   if(qty<=0||d.accounting_type==="service"||normalize(d.unit)==="услуга")continue;
   // (one row for each work type, with its own code, as the program's register: a mark keeping a code of its own — «3
   // PDF-файлов» of the recognition — made a fourth «Монтаж металлоконструкций» the program has not, the engineer,
   // 06.11.2026: «что за вид работы вверху? в программе их три всего, а выдает 4»; a mark of no work type is in none)
   const wid=String(d.work_type_id||""),work=catalog.get(wid);if(!work)continue;
   const name=String(work.name).trim(),code=String(work.code||"").trim(),code2=String(work.code2||"").trim();
   const key=wid+"|"+normalize(code);
   if(!groups.has(key))groups.set(key,{workId:wid,name,code,code2,total:0,mounted:0,remaining:0,positions:0});
   const mark=groups.get(key),markId=String(raw.id);
   const fromReports=mountedMap.get(markId),saved=d.mounted??d.done,done=Math.min(qty,Math.max(0,saved==null?exportNumber(fromReports):exportNumber(saved)));
   mark.total+=qty;mark.mounted+=done;mark.positions++
  }
  // Keep work types with zero marks visible in the complete readiness summary.
  // Do not add a duplicate zero row when this work already has one or more codes.
  for(const [wid,work] of catalog){
   if([...groups.values()].some(group=>group.workId===wid))continue;
   const key=wid+"|"+normalize(work.code);
   if(!groups.has(key))groups.set(key,{workId:wid,name:work.name,code:work.code,code2:work.code2,total:0,mounted:0,remaining:0,positions:0})
  }
  return [...groups.values()].map(x=>({
   ...x,remaining:Math.max(0,x.total-x.mounted),
   mountedPct:x.total?Math.min(100,x.mounted/x.total*100):0,
   remainingPct:x.total?Math.max(0,100-x.mounted/x.total*100):0
  })).sort((a,b)=>a.name.localeCompare(b.name,"ru",{numeric:true})||a.code.localeCompare(b.code,"ru",{numeric:true}))
 }
 function markProgressRow(group){
  const mounted=group.mountedPct,remaining=group.remainingPct;
  const pct=v=>exportFormat(Math.round(v*10)/10)+"%";
  return'<article class="ir-export-mark-row">'+
   '<div class="ir-export-mark-name"><b>'+esc(group.name)+'</b><small>'+esc(countText(group.positions,"позиция","позиции","позиций"))+'</small></div>'+
   '<div class="ir-export-mark-code"><b>'+esc(codeText(group.code)||"Без шифра")+'</b>'+(group.code2?'<small>Доп. шифр: '+esc(group.code2)+'</small>':"")+'</div>'+
   '<div class="ir-export-mark-count"><b>'+esc(exportFormat(group.total))+'</b><small>шт.</small></div>'+
   '<div class="ir-export-mark-progress" role="img" aria-label="Смонтировано '+esc(pct(mounted))+'"><div class="ir-export-mark-track"><i style="width:'+mounted.toFixed(2)+'%"></i></div><small>'+esc(pct(mounted))+' готовность</small></div>'+
   '<div class="ir-export-mark-fact"><b>'+esc(exportFormat(group.mounted))+' шт.</b><small>'+esc(pct(mounted))+'</small></div>'+
   '<div class="ir-export-mark-left"><b>'+esc(exportFormat(group.remaining))+' шт.</b><small>'+esc(pct(remaining))+'</small></div>'+
   '</article>'
 }
 function markProgressPanel(groups,kind){
  if(!groups.length)return'<div class="ir-export-empty-card">По выбранному фильтру марок нет</div>';
  // The readiness summary always shows every work type and project code.
  return'<div class="ir-export-mark-rows">'+groups.map(markProgressRow).join("")+'</div>'
 }
 function renderMarksOverview(markRows,workRows,reportRows){
  const groups=markProgressGroups(markRows,workRows,reportRows);
  const total=groups.reduce((s,x)=>s+x.total,0),mounted=groups.reduce((s,x)=>s+x.mounted,0);
  const left=Math.max(0,total-mounted);
  // This header is the same average-by-work-type KPI as "Показатели объекта".
  // Each row below continues to show the progress by number of marks.
  const percent=exportSummaryCompletion(workRows,markRows,reportRows);
  return'<div class="ir-export-marks-summary">'+
   '<div class="ir-export-marks-title"><div><h3>Готовность по видам работ</h3><p>Средняя готовность по видам работ · ниже прогресс по количеству марок</p></div><b>'+esc(exportFormat(percent))+'%</b></div>'+
   '<div class="ir-export-marks-stats"><div><small>Всего марок</small><b>'+esc(exportFormat(total))+' шт.</b></div><div><small>Смонтировано</small><b>'+esc(exportFormat(mounted))+' шт.</b></div><div><small>Осталось</small><b>'+esc(exportFormat(left))+' шт.</b></div><div><small>Групп видов работ / шифров</small><b>'+groups.length+'</b></div></div>'+
   '<div class="ir-export-mark-switcher"><div class="ir-export-mark-head"><span>Вид работы</span><span>Шифр</span><span>Всего марок</span><span>Шкала прогресса</span><span>Смонтировано, шт. / %</span><span>Осталось, шт. / %</span></div>'+
   markProgressPanel(groups,"all")+'</div></div>'
 }

 function markDetailData(markRows,workRows,reportRows){
  markRows=liveMarkRows(markRows,workRows);
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const works=new Map(array(workRows).map(row=>{
   const d=row.data||{};
   return[String(row.id),{name:d.work_type||row.title||"Без вида работы",code:d.project_code||d.code||"",code2:d.project_code_2||"",unit:d.unit||""}]
  }));
  const mounted=new Map();
  for(const report of array(reportRows)){
   const r=report.data||report;
   for(const item of array(r.items).length?r.items:array(r.works)){
    if(item?.accounting_type==="service"||item?.is_service===true||norm(item?.unit)==="услуга")continue;
    const id=item?.mark_id??item?.markId??item?.mark_record_id;
    if(id==null||id==="")continue;
    const key=String(id),qty=Math.max(0,exportNumber(item.qty??item.count??item.quantity));
    mounted.set(key,(mounted.get(key)||0)+qty)
   }
  }
  return array(markRows).map((raw,i)=>{
   const d=raw.data||{},id=String(raw.id),work=works.get(String(d.work_type_id||""))||{};
   if(d.accounting_type==="service"||norm(d.unit)==="услуга")return null;
   const qty=Math.max(0,exportNumber(d.qty??d.count)),fromReports=mounted.get(id);
   const saved=d.mounted??d.done,done=Math.min(qty,Math.max(0,saved==null?exportNumber(fromReports):exportNumber(saved)));
   const left=Math.max(0,qty-done),pct=qty?Math.min(100,done/qty*100):0;
   const uv=exportNumber(d.unit_volume??d.volume_one??d.volume1),unit=String(d.unit||work.unit||"").trim();
   const rawTotal=d.total_value??d.total_volume;
   const total=rawTotal!==null&&rawTotal!==undefined&&String(rawTotal).trim()!==""?exportNumber(rawTotal):qty*uv;
   return{
    id,index:i+1,workId:String(d.work_type_id||""),mark:String(d.mark||raw.title||"—"),name:String(d.name||"").trim(),
    work:String(work.name||d.work_type||"Без вида работы"),code:String(work.code||d.project_code||d.code||"").trim(),code2:String(work.code2||d.project_code_2||"").trim(),
    qty,done,left,pct,uv,total,unit,
    status:qty>0&&done>=qty-1e-9?"done":done>0?"partial":"left"
   }
  }).filter(Boolean).sort((a,b)=>a.mark.localeCompare(b.mark,"ru",{numeric:true})||a.id.localeCompare(b.id,"ru"))
 }
 function renderMarkCards(markRows,workRows,reportRows){
  const marks=markDetailData(markRows,workRows,reportRows);
  if(!marks.length)return'<div class="ir-export-empty-card">Ведомость пока пустая</div>';
  const pct=n=>exportFormat(Math.round(n*10)/10)+"%";
  const box=(title,value,sub="",kind="")=>'<div class="ir-export-mark-stat '+kind+'"><small>'+esc(title)+'</small><b>'+esc(value)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':"")+'</div>';
  const item=(m,i)=>{
   const status=m.status==="done"?"Смонтировано":m.status==="partial"?"Частично":"Не смонтировано";
   const unit=m.unit||"ед.",unitName=m.unit==="тн"?"Вес":m.unit==="м2"?"Площадь":m.unit==="м3"?"Объём":"Объём";
   return'<article class="ir-export-mark-card status-'+m.status+'"><details>'+
    '<summary class="ir-export-mark-brief">'+
     '<span class="ir-export-mark-num">'+(i+1)+'</span>'+
     '<span class="ir-export-mark-main"><b>'+esc(m.mark)+'</b><small>'+esc(m.name||m.work)+'</small></span>'+
     '<span class="ir-export-mark-brief-code">'+esc(m.code||"Без шифра")+'</span>'+
     '<span class="ir-export-mark-brief-qty">'+esc(exportFormat(m.qty))+' <small>шт.</small></span>'+
     '<span class="ir-export-mark-badge status-'+m.status+'">'+esc(status)+'</span>'+
     '<span class="ir-export-daily-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>'+
    '</summary>'+
    '<div class="ir-export-mark-detail">'+
      '<div class="ir-export-mark-stats">'+
       box("Всего",exportFormat(m.qty)+" шт.","По ведомости")+
       box("Смонтировано",exportFormat(m.done)+" шт.",pct(m.pct),"good")+
       box("Осталось",exportFormat(m.left)+" шт.",pct(100-m.pct),"pending")+
       box("Готовность",pct(m.pct),"По количеству марок")+
      '</div>'+
      '<div class="ir-export-mark-detail-bar"><div class="ir-export-mark-track"><i style="width:'+m.pct.toFixed(2)+'%"></i></div></div>'+
      '<div class="ir-export-mark-specs">'+
       '<div><small>Наименование</small><b>'+esc(m.name||"—")+'</b></div>'+
       '<div><small>Вид работы</small><b>'+esc(workLabel(m.work))+'</b></div>'+
       '<div><small>Шифр</small><b>'+esc(codeText(m.code)||"—")+'</b>'+(m.code2?'<small>Доп. шифр: '+esc(m.code2)+'</small>':"")+'</div>'+
       '<div><small>'+esc(unitName)+' 1 шт.</small><b>'+esc(exportFormat(m.uv))+' '+esc(unit)+'</b></div>'+
       '<div><small>'+esc(unitName)+' всего</small><b>'+esc(exportFormat(m.total))+' '+esc(unit)+'</b></div>'+
      '</div>'+
     '</div>'+
   '</details></article>'
  };

  const panel=(shown,id)=>{
   if(!shown.length)return'<div class="ir-export-empty-card">По выбранному виду работ марок нет</div>';
   const matched={all:shown.length,mounted:shown.filter(m=>m.done>0).length,remaining:shown.filter(m=>m.left>0).length};
   const counts='<span class="ir-export-filter-count"><span class="ir-export-count-all">'+matched.all+'</span><span class="ir-export-count-mounted">'+matched.mounted+'</span><span class="ir-export-count-remaining">'+matched.remaining+'</span> позиций</span>';
   const toggleId="ir-export-marks-show-"+id;
   const more=shown.length>5?'<label class="ir-export-mark-showmore" for="'+toggleId+'"><span class="ir-export-more-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span><span class="ir-export-more-show">Показать всю ведомость марок ('+counts+')</span><span class="ir-export-more-hide">Свернуть до 5 марок</span></label>':"";
   return'<div class="ir-export-mark-cards"><input class="ir-export-mark-show-check" type="checkbox" id="'+toggleId+'"><div class="ir-export-mark-cardlist">'+shown.map(item).join("")+'</div>'+more+'</div>'
  };
  // Each unique pair of project codes has its own mark filter.
  const catalog=new Map();
  for(const mark of marks){
   const code=mark.code||"",code2=mark.code2||"",name=mark.work||"Без вида работы";
   const key=JSON.stringify([mark.workId||"legacy:"+name,code,code2]);
   if(!catalog.has(key))catalog.set(key,{id:key,name,code,code2,marks:[]});
   catalog.get(key).marks.push(mark)
  }
  const tabLabel=work=>{
   const name=String(workLabel(work.name)).trim();
   const noun=/^(?:металлоконструкция|монтаж металлоконструкций)$/i.test(name)?"Металлоконструкции":name;
   return noun+(work.code?" · "+work.code:"")+(work.code2?" ("+work.code2+")":"")
  };
  const workChoices=[...catalog.values()].sort((a,b)=>
   a.name.localeCompare(b.name,"ru",{numeric:true})||
   a.code.localeCompare(b.code,"ru",{numeric:true})||
   a.code2.localeCompare(b.code2,"ru",{numeric:true}));
  const controls='<input class="ir-export-work-radio ir-export-work-radio-all" type="radio" name="ir-export-work-filter" id="ir-export-work-all" checked>'+
   workChoices.map((w,i)=>'<input class="ir-export-work-radio ir-export-work-radio-'+i+'" type="radio" name="ir-export-work-filter" id="ir-export-work-'+i+'">').join("");
  const choice=(id,name,count)=>'<label for="'+id+'" title="'+esc(name)+'">'+esc(name)+' <span>'+count+'</span></label>';
  const tabs='<div class="ir-export-work-tabs" role="group" aria-label="Выберите вид работ">'+choice("ir-export-work-all","Все виды работ",marks.length)+
   workChoices.map((w,i)=>choice("ir-export-work-"+i,tabLabel(w),w.marks.length)).join("")+'</div>';
  const dynamicStyles=workChoices.map((w,i)=>
   '.ir-export-work-radio-'+i+':checked ~ .ir-export-work-tabs label[for="ir-export-work-'+i+'"]{background:#236da6;color:#fff}'+
   '.ir-export-work-radio-'+i+':checked ~ .ir-export-work-panels > .ir-export-work-panel-'+i+'{display:block!important}').join("\n");
  const dynamicTag='<style>'+dynamicStyles+'</style>';
  const panels='<div class="ir-export-work-panels"><div class="ir-export-work-panel ir-export-work-panel-all">'+panel(marks,"all")+'</div>'+
   workChoices.map((w,i)=>'<div class="ir-export-work-panel ir-export-work-panel-'+i+'">'+panel(w.marks,i)+'</div>').join("")+'</div>';
  // State is entirely CSS-driven so the saved HTML remains offline and read-only.
  const status='<input class="ir-export-status-radio ir-export-status-all" type="radio" id="ir-export-status-all" name="ir-export-status-filter" checked>'+
   '<input class="ir-export-status-radio ir-export-status-mounted" type="radio" id="ir-export-status-mounted" name="ir-export-status-filter">'+
   '<input class="ir-export-status-radio ir-export-status-remaining" type="radio" id="ir-export-status-remaining" name="ir-export-status-filter">'+
   '<div class="ir-export-status-tabs" role="group" aria-label="Статус марок"><label for="ir-export-status-all">Все марки</label><label for="ir-export-status-mounted">Смонтировано</label><label for="ir-export-status-remaining">Осталось</label></div>';
  return'<div class="ir-export-work-filter"><div class="ir-export-work-head"><h3>Ведомость марок</h3><span>'+marks.length+' позиций</span></div><p class="ir-export-work-hint">Выберите вид работ и статус марок. Сначала показаны пять подходящих марок.</p>'+
   status+controls+tabs+dynamicTag+panels+'</div>'
 }
 function renderMarkSection(rows,workRows,reportRows,images){
  const summary=renderMarksOverview(rows,workRows,reportRows);
  const full=renderMarkCards(rows,workRows,reportRows);
  return'<div class="ir-export-marks-unified">'+summary+full+'</div>'
 }


 function renderExportTrend(reportRows,workRows){
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const catalog=array(workRows).filter(x=>x.data?.accounting_type!=="service"&&norm(x.data?.unit)!=="услуга").map(x=>{const d=x.data||{};return{id:String(x.id),name:d.work_type||x.title||"Без вида работ",code:d.project_code||"",unit:d.unit||""}}),byId=new Map(catalog.map(x=>[x.id,x])),groups=new Map();
  for(const record of array(reportRows)){
   const d=record.data||record,day=String(d.date||d.report_date||"").slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
   for(const w of array(d.items).length?d.items:array(d.works)){
    if(reportService(w))continue;
    const wid=String(w.work_type_id||""),name=String(w.work_type||w.type||""),code=String(w.project_code||w.code||"");
    let work=byId.get(wid);
    if(work&&((name&&norm(name)!==norm(work.name))||(code&&work.code&&norm(code)!==norm(work.code))))work=null;
    if(!work)work=catalog.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));
    if(!work){const matches=catalog.filter(x=>(code&&norm(x.code)===norm(code))||(name&&norm(x.name)===norm(name)));if(matches.length===1)work=matches[0]}
    if(!work)work={id:"legacy:"+norm(name)+"|"+norm(code)+"|"+norm(w.unit),name:name||"Без вида работ",code,unit:w.unit||""};
    if(!groups.has(work.id))groups.set(work.id,{work,values:new Map()});
    const dates=groups.get(work.id).values;dates.set(day,(dates.get(day)||0)+reportVolume(w))
   }
  }
  const types=[...groups.values()].sort((a,b)=>a.work.name.localeCompare(b.work.name,"ru")||String(a.work.code).localeCompare(String(b.work.code),"ru"));
  if(!types.length)return'<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>Нет выполненных объёмов в ежедневных отчётах</span></div></div>';
  const shortDate=v=>v.slice(8,10)+"."+v.slice(5,7);
  const panels=types.map(({work,values},index)=>{
   const pts=[...values].sort((a,b)=>a[0].localeCompare(b[0])),total=pts.reduce((sum,p)=>sum+p[1],0),active=pts.filter(p=>p[1]>0),avg=active.length?total/active.length:0,max=Math.max(0,...pts.map(p=>p[1])),last=pts.at(-1),prev=pts.at(-2),delta=prev?last[1]-prev[1]:0,unit=work.unit||"ед.";
   const W=Math.max(800,pts.length*50),H=210,L=48,R=20,T=20,B=34,ih=H-T-B,iw=W-L-R,step=iw/Math.max(1,pts.length),bw=Math.max(18,Math.min(64,step*.62)),maxY=Math.max(1,max,avg);
   const bars=pts.map(([day,val],i)=>{const h=ih*val/maxY,x=L+i*step+(step-bw)/2,y=H-B-h;return'<g class="daily-bar"><rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+Math.max(1,h).toFixed(1)+'" rx="4"></rect><text x="'+(x+bw/2).toFixed(1)+'" y="'+Math.max(12,y-5).toFixed(1)+'" text-anchor="middle">'+(val>0?esc(exportFormat(val)):"")+'</text><text class="daily-date" x="'+(x+bw/2).toFixed(1)+'" y="'+(H-11)+'" text-anchor="middle">'+esc(shortDate(day))+'</text></g>'}).join("");
   const ay=T+ih-avg/maxY*ih,txt="Среднее "+exportFormat(avg)+" "+unit,aw=Math.max(112,72+txt.length*4.6),ax=Math.max(L+4,W-R-aw-6),ty=Math.max(T+3,Math.min(H-B-22,ay-12));
   const line=avg>0?'<g class="daily-average-overlay"><line class="daily-average" x1="'+L+'" y1="'+ay.toFixed(1)+'" x2="'+(W-R)+'" y2="'+ay.toFixed(1)+'"></line><rect class="daily-average-bg" x="'+ax.toFixed(1)+'" y="'+ty.toFixed(1)+'" width="'+aw.toFixed(1)+'" height="19" rx="5"></rect><text class="daily-average-label" x="'+(ax+aw-7).toFixed(1)+'" y="'+(ty+13).toFixed(1)+'" text-anchor="end">'+esc(txt)+'</text></g>':"";
   const stat=(label,value,sub)=>'<div><span>'+esc(label)+'</span><b>'+esc(value)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':"")+'</div>';
   return'<div class="ir-export-trend-panel" data-export-trend-panel="'+index+'"'+(index?' hidden':'')+'><div class="schedule-trend-stats">'+stat("Последний день",exportFormat(last[1])+" "+unit,shortDate(last[0]))+stat("Выполнено за период",exportFormat(total)+" "+unit,active.length+" дн. с объёмом")+stat("Максимум за день",exportFormat(max)+" "+unit)+
    '<div class="trend-delta '+(delta>0?"up":delta<0?"down":"flat")+'"><span>К предыдущему отчёту</span><b>'+esc(prev?(delta>0?"+":"")+exportFormat(delta)+" "+unit:"—")+'</b></div></div>'+
    '<div class="schedule-trend-chart daily-volume-chart"><div class="daily-volume-scroll"><svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" aria-label="Объёмы '+esc(work.name)+' по дням"><line class="daily-grid" x1="'+L+'" y1="'+T+'" x2="'+(W-R)+'" y2="'+T+'"></line><line class="daily-grid" x1="'+L+'" y1="'+(T+ih/2)+'" x2="'+(W-R)+'" y2="'+(T+ih/2)+'"></line><line class="daily-grid" x1="'+L+'" y1="'+(H-B)+'" x2="'+(W-R)+'" y2="'+(H-B)+'"></line><text class="daily-axis" x="4" y="'+(T+4)+'">'+esc(exportFormat(maxY))+'</text><text class="daily-axis" x="4" y="'+(H-B+4)+'">0</text>'+bars+line+'</svg></div></div></div>'
  }).join("");
  const options=types.map((g,i)=>'<option value="'+i+'">'+esc(workLabel(g.work.name,"mount"))+(g.work.code?" · "+esc(codeText(g.work.code)):"")+'</option>').join("");
  return'<div class="schedule-trend ir-export-trend"><div class="schedule-trend-head"><div><b>Динамика по ежедневным отчётам</b><span>Фактический объём выбранного вида работ по дням</span></div><select class="schedule-trend-select" data-export-trend-select aria-label="Выберите вид работы">'+options+'</select></div>'+panels+'</div>'
 }
 function renderExportWorkTypes(rows,markRows,reportRows){
  if(!rows.length)return'<div class="ir-export-empty-card">Виды работ пока не добавлены</div>';
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const marks=markDetailData(markRows,rows,reportRows),reports=array(reportRows),main=[],other=[];
  const display=array(rows).map(r=>{
   const d=r.data||{},id=String(r.id),name=String(d.work_type||r.title||"Без вида работ"),code=String(d.project_code||""),service=d.accounting_type==="service"||norm(d.unit)==="услуга";
   let category=d.work_category;
   if(!["installation","fabrication","other"].includes(category))category=d.has_marks===false||service?"other":/изготов/i.test(name)?"fabrication":/монтаж/i.test(name)?"installation":marks.some(m=>m.workId===id)?"installation":"other";
   const same=w=>String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===norm(name));
   let plan=0,done=0,count=0,note="";
   if(service){
    let day="";for(const rec of reports){const data=rec.data||rec,date=String(data.date||data.report_date||"").slice(0,10);for(const item of array(data.items).length?data.items:array(data.works))if(same(item)&&(item.completed===true||item.service_completed===true||["done","выполнено"].includes(norm(item.status)))&&date>day)day=date}
    note=day?"Выполнено "+exportDate(day):"Не выполнено"
   }else if(category==="other"){
    plan=exportNumber(d.planned_volume??d.plan_volume);
    for(const rec of reports){const data=rec.data||rec;for(const item of array(data.items).length?data.items:array(data.works))if(same(item)&&!reportService(item))done+=reportVolume(item)}
    note=plan>0?"Выполнено "+exportFormat(done)+" "+String(d.unit||""):"Объём не задан"
   }else{
    const entries=marks.filter(m=>m.workId===id||(!m.workId&&norm(m.work)===norm(name)&&norm(m.code)===norm(code)));
    count=entries.length;plan=entries.reduce((n,m)=>n+m.total,0);done=entries.reduce((n,m)=>n+(m.qty?m.total*m.done/m.qty:0),0);
    note=count?count+" поз.":"Ведомость не загружена"
   }
   const ready=plan>0?Math.min(100,Math.max(0,done/plan*100)):0;
   return{category,service,name,code,unit:service?"услуга":String(d.unit||"—"),plan,ready,note}
  });
  for(const w of display)(w.category==="other"?other:main).push(w);
  const tableHead='<div class="ir-export-wt-head"><span>Вид работы</span><span>Шифр проекта</span><span>Ед. изм.</span><span>Общий объём</span><span>Готовность</span></div>';
  const table=items=>tableHead+(items.length?items.map(w=>'<div class="ir-export-wt-row"><div><small>Вид работы</small><b>'+esc(workLabel(w.name))+'</b></div><div><small>Шифр проекта</small><b>'+esc(w.category==="other"?"—":codeText(w.code)||"—")+'</b></div><div><small>Ед. изм.</small><b>'+esc(w.unit)+'</b></div><div><small>Общий объём</small><b>'+(w.service?"Не требуется":w.plan>0?esc(exportFormat(w.plan))+" "+esc(w.unit):"—")+'</b><small>'+esc(w.service?"Без ведомости марок":w.note)+'</small></div><div class="ir-export-wt-ready"><small>Готовность</small>'+(w.service?'<b>'+esc(w.note)+'</b>':w.plan>0?'<b>'+exportFormat(Math.round(w.ready*10)/10)+'%</b><i class="ir-export-wt-track"><em style="width:'+w.ready.toFixed(2)+'%"></em></i>':'<b>—</b>')+'</div></div>').join(""):'<div class="ir-export-wt-empty">Виды работ не добавлены</div>');
  return'<div class="ir-export-wt"><input type="radio" class="ir-export-wt-radio" id="ir-export-wt-main" name="ir-export-wt-group" checked><input type="radio" class="ir-export-wt-radio" id="ir-export-wt-other" name="ir-export-wt-group"><div class="ir-export-wt-tabs"><label for="ir-export-wt-main">Монтаж / изготовление <span>'+main.length+'</span></label><label for="ir-export-wt-other">Другие виды работ <span>'+other.length+'</span></label></div><div class="ir-export-wt-list ir-export-wt-main">'+table(main)+'</div><div class="ir-export-wt-list ir-export-wt-other">'+table(other)+'</div></div>'
 }

 // ---- Letters, executive documents and fasteners as their pages show them, not as raw records (the engineer,
 // 06.11.2026: «название на анг, блоки внутри, сами письма и тд оформи как положенно»).
 const own=(rows,type)=>rows.filter(r=>r.record_type===type);
 function sectionCount(key,rows){
  if(key==="letters")return countText(own(rows,"letter").length,"письмо","письма","писем");
  if(key==="fasteners")return countText((own(rows,"fastener").length?own(rows,"fastener"):rows.filter(r=>r.record_type!=="settings")).length,"позиция","позиции","позиций");
  if(key==="executive-docs")return countText(own(rows,"issued").length,"акт","акта","актов");
  return countText(rows.length,"запись","записи","записей")
 }
 // A letter's text as written, without anything that runs or loads (the report opens offline).
 function letterBody(html){
  try{
   const doc=new DOMParser().parseFromString("<div>"+String(html||"")+"</div>","text/html"),root=doc.body.firstChild;
   const okTags=new Set(["P","BR","B","STRONG","I","EM","U","S","UL","OL","LI","TABLE","THEAD","TBODY","TR","TD","TH","DIV","SPAN","H1","H2","H3","H4","BLOCKQUOTE","HR","A","SUB","SUP"]);
   const walk=n=>{[...n.childNodes].forEach(c=>{
    if(c.nodeType===1){
     if(!okTags.has(c.tagName)){c.replaceWith(doc.createTextNode(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|IMG|SVG|NOSCRIPT|TEMPLATE)$/.test(c.tagName)?"":c.textContent));return}
     [...c.attributes].forEach(a=>{if(!/^(colspan|rowspan|href)$/i.test(a.name)||(a.name.toLowerCase()==="href"&&!/^(https?:|mailto:)/i.test(a.value)))c.removeAttribute(a.name)});walk(c)
    }else if(c.nodeType!==3)c.remove()})};
   walk(root);return root.innerHTML.trim()
  }catch{return esc(String(html||"").replace(/<[^>]*>/g," "))}
 }
 const pair=(k,v)=>v?'<div class="ir-export-detail"><b>'+esc(k)+'</b><div><span class="ir-export-value">'+esc(v)+'</span></div></div>':"";
 function renderLetters(rows){
  const list=own(rows,"letter").sort((a,b)=>String(b.data?.date||"").localeCompare(String(a.data?.date||""))||String(b.data?.number||"").localeCompare(String(a.data?.number||""),"ru",{numeric:true}));
  if(!list.length)return'<div class="ir-export-empty-card">Писем нет</div>';
  return'<div class="ir-export-records ir-export-letters">'+list.map((r,i)=>{
   const d=r.data||{},sent=array(d.sent),last=sent[sent.length-1];
   const head="Исх. № "+(d.number||"—")+(d.date?" от "+exportDate(d.date):"");
   const status=last?'<small class="ir-export-letter-sent">Отправлено '+esc(exportDate(String(last.at||"").slice(0,10)))+'</small>':'<small class="ir-export-letter-draft">Не отправлено</small>';
   const body=letterBody(d.html);
   return'<article class="ir-export-record"><details><summary><span class="ir-export-row-no">'+(i+1)+'</span><span class="ir-export-row-title">'+esc(head)+(d.title?'<em class="ir-export-letter-subject">'+esc(d.title)+'</em>':"")+'</span><span class="ir-export-row-meta">'+(d.to?'<small>'+esc(d.to)+'</small>':"")+status+'</span></summary>'+
    '<div class="ir-export-details">'+pair("Кому",d.to)+pair("Эл. почта",d.email)+pair("Копия",d.cc)+pair("Тема",d.title)+
    (d.reply_number?pair("В ответ на","№ "+d.reply_number+(d.reply_date?" от "+exportDate(d.reply_date):"")):"")+
    '<div class="ir-export-letter-text">'+(body||'<span class="ir-export-empty">Текст письма не заполнен</span>')+'</div>'+
    pair("Подпись",[d.sign_position,d.sign_name].filter(Boolean).join(" — "))+pair("Исполнитель",d.executor)+
    (sent.length?pair("Отправки",sent.map(x=>exportDate(String(x.at||"").slice(0,10))+" → "+(x.to||"")+(x.cc?" (копия: "+x.cc+")":"")).join("; ")):"")+
    '</div></details></article>'
  }).join("")+'</div>'
 }
 // Исполнительная документация in the report — only the acts and the tonnage they close (the engineer, 06.11.2026:
 // «убираем сертификаты в выгруженном, только акты оставляем, и тоннаж показываем сколько закрытые»): the tonnes of the
 // daily reports in each act's period and work type; the whole — each day and work type once, however many acts cover it.
 const isTonne=u=>/^(т|тн|тонн[аы]?|t)\.?$/i.test(String(u||"").trim());
 function closedTonnes(reports,workRows,acts){
  const unitOf=new Map(array(workRows).map(w=>[String(w.id),String(w.data?.unit||"")])),items=[];
  for(const r of array(reports)){const d=r.data||r,date=String(d.date||d.report_date||"").slice(0,10);if(!date)continue;
   for(const w of array(d.items).length?d.items:array(d.works)){if(!w||w.accounting_type==="service")continue;const wid=String(w.work_type_id||"");
    if(!isTonne(w.unit||unitOf.get(wid)))continue;const t=exportNumber(w.volume)||exportNumber(w.qty??w.count)*exportNumber(w.unit_volume);if(t>0)items.push({date,wid,t})}}
  const covers=(a,x)=>{const d=a.data||{};return(!d.from||x.date>=String(d.from).slice(0,10))&&(!d.to||x.date<=String(d.to).slice(0,10))&&(!d.work_type_id||String(d.work_type_id)===x.wid)};
  const sum=list=>items.filter(x=>list.some(a=>covers(a,x))).reduce((s,x)=>s+x.t,0);
  return{each:a=>sum([a]),all:sum,total:items.reduce((s,x)=>s+x.t,0)}
 }
 const tonnes=v=>v.toLocaleString("ru-RU",{minimumFractionDigits:v?1:0,maximumFractionDigits:3})+" т";
 function renderExecDocs(rows,workRows,reports){
  const issued=own(rows,"issued").sort((a,b)=>String(b.data?.date||"").localeCompare(String(a.data?.date||"")));
  const workName=id=>{const w=workRows.find(x=>String(x.id)===String(id));return w?String(w.data?.work_type||w.title||""):""};
  const signedOf=d=>d.signed&&array(d.signed.scans).length?d.signed:null;
  const signed=issued.filter(r=>signedOf(r.data||{})),T=closedTonnes(reports,workRows,issued);
  const acts=issued.length?'<div class="ir-export-table-wrap"><table class="ir-export-table"><thead><tr><th>№</th><th>Акт</th><th>Период работ</th><th>Вид работ</th><th>Тоннаж</th><th>Подписание</th></tr></thead><tbody>'+issued.map((r,i)=>{const d=r.data||{},sg=signedOf(d);
   return'<tr><td>'+(i+1)+'</td><td><b>'+esc((d.name||r.title||"Акт")+(d.number?" № "+d.number:""))+'</b>'+(d.date?'<small>от '+esc(exportDate(d.date))+'</small>':"")+'</td><td>'+esc(d.from||d.to?exportDate(d.from)+" — "+exportDate(d.to):"—")+'</td><td>'+esc(d.work_type||workName(d.work_type_id)||"Все виды работ")+'</td><td><b>'+esc(tonnes(T.each(r)))+'</b></td><td>'+(sg?'<span class="ir-export-ok">Подписан всеми'+(sg.date?" "+esc(exportDate(sg.date)):"")+'</span>':'<span class="ir-export-warn">Не подписан</span>')+'</td></tr>'}).join("")+'</tbody></table></div>':'<div class="ir-export-empty-card">Акты ещё не выгружались</div>';
  const closed=T.all(issued),closedSigned=T.all(signed);
  return'<div class="ir-export-exd"><div class="ir-export-exd-stats">'+
   '<div><small>Закрыто актами</small><b>'+esc(tonnes(closed))+'</b>'+(T.total?'<small>из '+esc(tonnes(T.total))+' смонтированных по отчётам</small>':"")+'</div>'+
   '<div><small>Из них подписано всеми</small><b>'+esc(tonnes(closedSigned))+'</b><small>'+esc(countText(signed.length,"акт","акта","актов"))+'</small></div>'+
   '<div><small>Выгружено актов</small><b>'+issued.length+'</b><small>ждут подписания: '+(issued.length-signed.length)+'</small></div></div>'+
   '<div class="ir-export-exd-block"><h3>Выгруженные акты <small>'+esc(countText(issued.length,"акт","акта","актов"))+'</small></h3>'+acts+'</div></div>'
 }
 function renderFasteners(rows){
  const list=own(rows,"fastener").length?own(rows,"fastener"):rows.filter(r=>r.record_type!=="settings");
  if(!list.length)return'<div class="ir-export-empty-card">Метизы не внесены</div>';
  return'<div class="ir-export-table-wrap"><table class="ir-export-table"><thead><tr><th>№</th><th>Обозначение</th><th>Ø, мм</th><th>Длина, мм</th><th>Класс прочности</th><th>Кол-во, шт.</th><th>Марки</th></tr></thead><tbody>'+list.map((r,i)=>{const d=r.data||{};
   return'<tr><td>'+(i+1)+'</td><td><b>'+esc(d.text||r.title||"—")+'</b>'+(d.note?'<small>'+esc(d.note)+'</small>':"")+'</td><td>'+esc(d.d_mm??"—")+'</td><td>'+esc(d.length_mm??"—")+'</td><td>'+esc(d.strength_class||"—")+'</td><td>'+esc(d.qty??"по маркам")+'</td><td>'+esc(d.marks||"—")+'</td></tr>'}).join("")+'</tbody></table></div>'
 }
 // A lighter report (the engineer, 06.11.2026: «Уменьшить размер выгруженного отчета сможем? Удалить дублирующие стили, и то
 // что не используем»): the styles of the program are given whole to every report — of them only the rules for what the
 // report shows are kept, a rule written twice once (the last, it is the one that wins), comments and spaces out; the
 // text of the rules as written (not re-written by the browser — the prefixed properties of other browsers stay).
 // (has(selector) — is there such an element in the report; rules for what the report's scripts make or mark later —
 // the open menu, the dark theme, the scheme on the screen, the chart of deliveries — kept by their names)
 function slimCss(texts,has){
  const strip=t=>{let o="",i=0;while(i<t.length){const c=t[i];if(c==='"'||c==="'"){let j=i+1;while(j<t.length&&t[j]!==c){if(t[j]==="\\")j++;j++}o+=t.slice(i,j+1);i=j+1}else if(c==="/"&&t[i+1]==="*"){const j=t.indexOf("*/",i+2);i=j<0?t.length:j+2;o+=" "}else{o+=c;i++}}return o};
  const squeeze=(t,body)=>t.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/).map((p,k)=>k%2?p:(body?p.replace(/\s+/g," ").replace(/\s*([;:{},])\s*/g,"$1"):p.replace(/\s+/g," ").replace(/\s*,\s*/g,","))).join("").trim();
  // the rules of a text: {pre, body} — body null for «@import …;»; strings and brackets passed over
  const parse=t=>{const out=[];let i=0;const n=t.length;
   while(i<n){while(i<n&&/\s/.test(t[i]))i++;if(i>=n)break;let j=i,par=0;
    while(j<n){const c=t[j];if(c==='"'||c==="'"){j++;while(j<n&&t[j]!==c){if(t[j]==="\\")j++;j++}}else if(c==="(")par++;else if(c===")")par--;else if(!par&&(c==="{"||c===";"||c==="}"))break;j++}
    if(j>=n||t[j]==="}"){if(t.slice(i,j).trim())out.push({pre:t.slice(i,j).trim()+";",body:null});i=j+1;continue}
    if(t[j]===";"){out.push({pre:t.slice(i,j+1).trim(),body:null});i=j+1;continue}
    let k=j+1,depth=1;while(k<n&&depth){const c=t[k];if(c==='"'||c==="'"){k++;while(k<n&&t[k]!==c){if(t[k]==="\\")k++;k++}}else if(c==="{")depth++;else if(c==="}")depth--;k++}
    out.push({pre:t.slice(i,j).trim(),body:t.slice(j+1,k-1)});i=k}
   return out};
  const KEEP=/ir-export-scheme|ir-scheme|ood-|sup-|supply|deliver|mounted|remaining|ir-export-theme|ir-dark/;
  const DYN=/\.(?:active|open|ir-dark-wait|ir-dark|ir-scheme-max|is-open|over|exhausted)(?![\w-])/g;
  const cache=new Map();
  const used=sel=>{if(KEEP.test(sel)||sel.includes("\\")||sel.includes("&")||sel.includes("|"))return true;if(cache.has(sel))return cache.get(sel);
   let s="",i=0;while(i<sel.length){const c=sel[i];
    if(c==="["){let d=1,j=i+1;while(j<sel.length&&d){if(sel[j]==="[")d++;else if(sel[j]==="]")d--;j++}i=j}
    else if(c===":"){let j=i+1;if(sel[j]===":")j++;while(j<sel.length&&/[\w-]/.test(sel[j]))j++;if(sel[j]==="("){let d=1;j++;while(j<sel.length&&d){if(sel[j]==="(")d++;else if(sel[j]===")")d--;j++}}i=j}
    else{s+=c;i++}}
   s=s.replace(DYN,"").replace(/\s+/g," ").replace(/\s*([>+~])\s*/g,"$1").trim().replace(/(^|[ >+~])(?=[ >+~]|$)/g,"$1*");
   let r=true;try{r=!!has(s)}catch(_e){r=true}cache.set(sel,r);return r};
  const split=sel=>{const out=[];let d=0,b=0,last=0;for(let i=0;i<sel.length;i++){const c=sel[i];if(c==="(")d++;else if(c===")")d--;else if(c==="[")b++;else if(c==="]")b--;else if(c===","&&!d&&!b){out.push(sel.slice(last,i));last=i+1}}out.push(sel.slice(last));return out.map(x=>x.trim()).filter(Boolean)};
  const GROUP=/^@(?:media|supports|layer|container|document)\b/i;
  // the rules kept, in order; «where» — the @media … around them, for the twice-written ones
  const keep=(list,where,emit)=>{const out=[];list.forEach(r=>{
   if(r.body==null){out.push({text:squeeze(r.pre,false)});return}
   if(r.pre[0]==="@"){if(GROUP.test(r.pre)){const inner=keep(parse(r.body),where+"|"+squeeze(r.pre,false),emit);if(inner.length)out.push({pre:squeeze(r.pre,false),inner})}
    else out.push({text:squeeze(r.pre,false)+"{"+squeeze(r.body,!/[{}]/.test(r.body)?true:false)+"}"});return}
   const nested=/[{}]/.test(r.body),list2=split(r.pre),sels=nested?(list2.some(used)?list2:[]):list2.filter(used);
   if(!sels.length)return;const body=nested?r.body.replace(/\s+/g," ").trim():squeeze(r.body,true).replace(/;$/,"");if(!body)return;
   const item={text:sels.map(x=>squeeze(x,false)).join(",")+"{"+body+"}"};item.key=where+"\n"+item.text;emit(item);out.push(item)});return out};
  const all=[];const trees=texts.map(t=>keep(parse(strip(String(t||""))),"",x=>all.push(x)));
  const lastOf=new Map();all.forEach((x,i)=>lastOf.set(x.key,i));all.forEach((x,i)=>{x.drop=lastOf.get(x.key)!==i});
  const write=list=>list.map(x=>x.inner?(()=>{const t=write(x.inner);return t?x.pre+"{"+t+"}":""})():x.drop?"":x.text).join("");
  return trees.map(write)
 }
 // The report's styles made light in the report itself (its page as the browser reads it) — see slimCss.
 function slimReportStyles(html,parts){
  if(typeof DOMParser!=="function")return html;
  const doc=new DOMParser().parseFromString(html,"text/html"),slim=slimCss(parts,s=>doc.querySelector(s));
  parts.forEach((p,i)=>{if(p&&p.length>slim[i].length){const at=html.indexOf(p);if(at>=0)html=html.slice(0,at)+slim[i]+html.slice(at+p.length)}});
  return html
 }
 // The montage scheme kept packed in the report (the engineer, 06.11.2026 «Уменьшить размер выгруженного отчета»): its page
 // — with the list of every element — written escaped took about 2,8 MB; packed (gzip, as the scheme packs its own scripts)
 // about 1 MB; opened when «Монтажная схема» is chosen. Where the program cannot pack, it stays as it was.
 async function packSchemePage(html){
  const m=/<script type="application\/json" id="ir-export-scheme-page" nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(html);
  if(!m||typeof CompressionStream!=="function")return html;
  const buf=new Uint8Array(await new Response(new Blob([JSON.parse(m[2])]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s="";for(let i=0;i<buf.length;i+=32768)s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));
  return html.slice(0,m.index)+'<script type="application/gzip" id="ir-export-scheme-page" nonce="'+m[1]+'">'+btoa(s)+'</script>'+html.slice(m.index+m[0].length)
 }
 // The dark theme of the report (the engineer, 06.11.2026: «темную версию доработай, очень все тяжело читаемое», «фон сам
 // тоже темный должен быть»): not an inverted picture — every colour of the page given its dark pair: light fields and
 // cards dark grey-blue, dark text light, grey hints lighter, coloured marks (green, orange, blue) brighter on the dark;
 // borders dim; the light ones put back as they were. Runs in the report (by the moon, top right).
 // (by the rules of the page's styles, one dark rule for each — not element by element: a big report hung, «Страница не
 // отвечает», the engineer 06.11.2026; only elements with colours of their own are gone through one by one)
 // (doc — the page to paint, the report or the scheme in its frame; opts.scope — where elements with colours of their own
 // are gone through ("" — nowhere), opts.skip — rules left as they are: the 3D has its own dark look)
 function exportTheme(doc,opts){
  var document=doc||window.document,win=document.defaultView||window,getComputedStyle=function(e){return win.getComputedStyle(e)};
  opts=opts||{};var SCOPE=opts.scope==null?"#app":opts.scope,SKIP=opts.skip||null;
  var sheet=null,orig=new Map(),cache=new Map(),probe=null;
  var parse=function(v){var m=/rgba?\(([^)]+)\)/.exec(v||"");if(!m)return null;var p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);return{r:p[0]/255,g:p[1]/255,b:p[2]/255,a:p.length>3?p[3]:1}};
  var hsl=function(c){var mx=Math.max(c.r,c.g,c.b),mn=Math.min(c.r,c.g,c.b),l=(mx+mn)/2,h=0,s=0,d=mx-mn;
   if(d){s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===c.r?(c.g-c.b)/d+(c.g<c.b?6:0):mx===c.g?(c.b-c.r)/d+2:(c.r-c.g)/d+4;h/=6}return{h:h,s:s,l:l,a:c.a}};
  var css=function(o){var q=function(t){t=(t%1+1)%1;return t<1/6?p+(r-p)*6*t:t<.5?r:t<2/3?p+(r-p)*(2/3-t)*6:p},r=o.l<.5?o.l*(1+o.s):o.l+o.s-o.l*o.s,p=2*o.l-r,
   v=o.s?[q(o.h+1/3),q(o.h),q(o.h-1/3)]:[o.l,o.l,o.l];return"rgba("+v.map(function(x){return Math.round(x*255)}).join(",")+","+o.a+")"};
  // (fields: white — #161b21, the page's grey-blue — a step darker; strong colours of fields — dimmed, not turned)
  var field=function(o){if(o.l>.55){o.l=.085+(1-o.l)*.5;o.s=Math.min(o.s,.3)}else if(o.s>.25)o.l=Math.min(o.l,.32)*.85;return o};
  // (text: dark — light, grey — lighter grey, coloured — brighter of its hue; light text on a coloured field stays)
  var ink=function(o){if(o.l<.62){o.l=o.s>.35&&o.l>.2?Math.max(.68,1-o.l*.55):.93-o.l*.45;o.s=Math.min(o.s,o.s>.35?.75:.25)}return o};
  // (the borders of the blocks — light grey ones — #313131 in dark: the engineer, 06.11.2026 «сделай в темном режиме бордер
  // блоков на странице отчета 1px solid #313131»; a coloured border keeps its colour, darker)
  var line=function(o){if(o.l>.5){if(o.s<.45){o.h=0;o.s=0;o.l=49/255;return o}o.l=.2+(1-o.l)*.4;o.s=Math.min(o.s,.2)}return o};
  // A colour as the browser reads it (names, #hex, hsl) — once for each written value.
  var rgb=function(v){v=String(v||"").trim();if(!v||/var\(|currentcolor|inherit|initial|unset|transparent/i.test(v))return null;if(/^rgba?\(/i.test(v))return parse(v);
   if(cache.has(v))return cache.get(v);if(!probe){probe=document.createElement("i");probe.style.display="none";document.body.appendChild(probe)}
   probe.style.color="";probe.style.color=v;var c=probe.style.color?parse(getComputedStyle(probe).color):null;cache.set(v,c);return c};
  var conv=function(kind,v){var c=rgb(v);if(!c||c.a===0)return null;var o=hsl(c);return css(kind==="ink"?ink(o):kind==="line"?line(o):field(o))};
  var allColours=function(kind,v){return String(v).replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|\b(?:white|black)\b/gi,function(x){return conv(kind,x)||x})};
  var KIND={"color":"ink","background-color":"field","border-color":"line","border-top-color":"line","border-right-color":"line","border-bottom-color":"line","border-left-color":"line","outline-color":"line","fill":"svg","stroke":"svg","caret-color":"ink","text-decoration-color":"ink","column-rule-color":"line"};
  var svgKind=function(v){var c=rgb(v);if(!c)return null;var o=hsl(c);return o.l>.8?"field":o.l<.3&&o.s<.3?"ink":null};
  // One declaration of the page in dark: what to write, or null.
  function declare(name,value){
   if(/^--/.test(name)){var c=rgb(value);if(!c)return null;var o=hsl(c),k=/bg|background|card|surface|panel|paper|fill|base/i.test(name)?"field":/line|border|rule|stroke|divider/i.test(name)?"line":/ink|text|muted|fg|color|accent|ok|warn|part|wait/i.test(name)?"ink":o.l>.5?"field":"ink";return conv(k,value)}
   var k=KIND[name];
   if(k==="svg"){k=svgKind(value);return k?conv(k,value):null}
   if(k)return /^border-color$/.test(name)?allColours("line",value):conv(k,value);
   if(name==="background-image"&&/gradient/i.test(value))return allColours("field",value);
   if(name==="box-shadow"&&value!=="none")return"none";
   return null
  }
  var scope=function(sel){return sel.split(/,(?![^(]*\))/).map(function(x){x=x.trim();if(/^html\b/.test(x))return x.replace(/^html/,"html.ir-dark");if(/^:root\b/.test(x))return x.replace(/^:root/,"html.ir-dark");return"html.ir-dark "+x}).join(",")};
  function rulesOf(list){var out=[];[].slice.call(list||[]).forEach(function(r){
   if(r.type===1&&r.style){if(SKIP&&SKIP.test(r.selectorText))return;var d=[];for(var i=0;i<r.style.length;i++){var n=r.style[i],v=declare(n,r.style.getPropertyValue(n));if(v)d.push(n+":"+v+(r.style.getPropertyPriority(n)?"!important":""))}
    if(d.length)out.push(scope(r.selectorText)+"{"+d.join(";")+"}")}
   else if(r.type===4&&r.cssRules&&!/print/.test(r.conditionText||r.media&&r.media.mediaText||"")){var inner=rulesOf(r.cssRules);if(inner.length)out.push("@media "+(r.conditionText||r.media.mediaText)+"{"+inner.join("")+"}")}
   else if(r.cssRules&&r.type!==4){out=out.concat(rulesOf(r.cssRules))}});return out}
  function dark(){
   if(!sheet){
    var out=[];[].slice.call(document.styleSheets).forEach(function(s){try{out=out.concat(rulesOf(s.cssRules))}catch(_e){}});
    out.push("html.ir-dark,html.ir-dark body{background:#0f1317!important;color:#e3e9ef}html.ir-dark{color-scheme:dark}html.ir-dark #app img{opacity:.92}");
    sheet=document.createElement("style");sheet.id="ir-export-dark";sheet.textContent=out.join("\n");document.head.appendChild(sheet)
   }
   sheet.disabled=false;
   // (colours written on the elements themselves and in drawings — read all, then write all)
   var todo=[];[].slice.call(SCOPE?document.querySelectorAll(["[style]","[fill]","[stroke]","[color]","[bgcolor]"].map(function(a){return SCOPE+" "+a}).join(",")):[]).forEach(function(el){
    if(el.closest("iframe")||el.id==="ir-export-theme")return;var set=[],st=el.style;
    for(var i=0;i<st.length;i++){var n=st[i],v=declare(n,st.getPropertyValue(n));if(v)set.push([n,v])}
    ["fill","stroke"].forEach(function(a){var v=el.getAttribute(a);if(v&&!st.getPropertyValue(a)){var nv=declare(a,v);if(nv)set.push([a,nv])}});
    if(el.getAttribute("color")&&!st.color){var c=conv("ink",el.getAttribute("color"));if(c)set.push(["color",c])}
    if(el.getAttribute("bgcolor")&&!st.backgroundColor){var b=conv("field",el.getAttribute("bgcolor"));if(b)set.push(["background-color",b])}
    if(set.length)todo.push([el,set])});
   todo.forEach(function(t){if(!orig.has(t[0]))orig.set(t[0],t[0].getAttribute("style"));t[1].forEach(function(x){t[0].style.setProperty(x[0],x[1],"important")})})
  }
  function light(){if(sheet)sheet.disabled=true;orig.forEach(function(v,el){if(v==null)el.removeAttribute("style");else el.setAttribute("style",v)});orig.clear()}
  return{dark:dark,light:light}
 }
 function renderSection(key,rows,images,preview="",support={}){
  const extras=window.irObjectExportExtras;
  // The montage scheme — the page of the exported scheme itself (src/scheme-export-html.js, build), opened in a frame
  // when «Монтажная схема» is chosen: the same 3D, panel, card and nodes as the «HTML» button gives.
  if(key==="scheme"&&support.schemePage)return'<div class="ir-export-group ir-export-scheme3d-group" id="section-scheme"><section class="ir-export-section ir-export-scheme3d-section"><header class="ir-export-section-head"><h2>Монтажная схема</h2></header><div class="ir-export-scheme3d" id="ir-export-scheme3d"><div class="ir-export-scheme3d-wait">Монтажная схема открывается…</div></div></section></div>';
  const body=key==="reports"?renderDailyReports(rows,images,support.markNames):key==="work-types"?renderExportWorkTypes(rows,support.marks||[],support.reports||[]):key==="marks"?renderMarkSection(rows,support.workTypes||[],support.reports||[],images):
   key==="deliveries"?extras.deliveries(rows):key==="photos"?extras.recentPhotos(support.reports||[],images):
   key==="scheme"?extras.schemeHtml(extras.schemeData(rows,support.schemeDetails||[])):["schedule","acted-days","penalties"].includes(key)?"":
   key==="letters"?renderLetters(rows):key==="executive-docs"?renderExecDocs(rows,support.workTypes||[],support.reports||[]):key==="fasteners"?renderFasteners(rows):renderRows(rows,key,images);
  if(["schedule","acted-days","penalties"].includes(key))return'<div class="ir-export-group" id="section-'+esc(key)+'"><section class="ir-export-section ir-export-visual-section"><header class="ir-export-section-head"><h2>'+esc(labels[key]||key)+'</h2></header>'+(preview?'<div class="ir-export-preview">'+preview+'</div>':'<div class="ir-export-empty-card">Нет данных для анализа</div>')+(key==="schedule"?(support.trendHtml||""):"")+'</section></div>';
  if(key==="work-types")return'<div class="ir-export-group" id="section-work-types"><section class="ir-export-section ir-export-worktypes-section"><header class="ir-export-section-head"><h2>Виды работ</h2><span class="ir-export-count">'+esc(countText(rows.length,"вид","вида","видов"))+'</span></header>'+body+'</section></div>';
  if(key==="marks")return'<div class="ir-export-group" id="section-marks"><section class="ir-export-section ir-export-marks-section">'+body+'</section></div>';
  if(key==="deliveries")return'<div class="ir-export-group" id="section-deliveries"><section class="ir-export-section ir-export-deliveries-unified">'+
   (support.supplyModel?'<div class="ir-export-preview">'+window.irSupplyChart.render(support.supplyModel,{})+'</div>':"")+
   '<div class="ir-export-delivery-register"><header class="ir-export-section-head"><h2>Накладные</h2></header>'+body+'</div></section></div>';
  return'<div class="ir-export-group" id="section-'+esc(key)+'">'+(preview?'<div class="ir-export-preview">'+preview+'</div>':"")+
   '<section class="ir-export-section"><header class="ir-export-section-head"><div><h2>'+esc(labels[key]||key)+'</h2></div>'+(key==="photos"||key==="scheme"?"":'<span class="ir-export-count">'+esc(sectionCount(key,rows))+'</span>')+'</header>'+body+'</section></div>'
 }

 function companyHeaderHtml(parties){
  const cards=[
   {tone:"customer",role:"Заказчик",name:parties.customerName,logo:parties.customerLogo},
   {tone:"contractor",role:"Генподрядчик",name:parties.contractorName,logo:parties.contractorLogo},
   ...(!parties.underContractor?[{tone:"own",role:"Исполнитель",name:parties.ownName,logo:parties.ownLogo}]:[])
  ];
  return'<section class="ir-export-companies'+(cards.length===2?' ir-export-companies-two':'')+'" aria-label="Участники строительства"><div class="ir-export-companies-grid">'+cards.map(p=>{
   const img=p.logo?'<img src="'+esc(p.logo)+'" alt="Логотип: '+esc(p.role)+'">':'<span class="ir-export-company-no-logo">Логотип не указан</span>';
   return'<article class="ir-export-company-card ir-export-company-'+p.tone+'"><div class="ir-export-company-logo">'+img+'</div><div class="ir-export-company-meta"><div class="ir-export-company-role">'+esc(p.role)+'</div><div class="ir-export-company-name">'+esc(p.name||"Не указано")+'</div></div></article>'
  }).join("")+'</div></section>'
 }

 async function exportCompanyHeader(api,object,underContractor){
  const [rows,profile]=await Promise.all([
   api.section("object-meta").list().catch(error=>{console.warn("Object HTML: company logos unavailable",error);return []}),
   irProject.company.get().catch(error=>{console.warn("Object HTML: company profile unavailable",error);return {name:"",logo:""}})
  ]);
  const records=new Map(array(rows).filter(r=>["customer_logo","general_contractor_logo"].includes(r.record_type)).map(r=>[r.record_type,r]));
  const filePath=key=>String(records.get(key)?.data?.file_path||"");
  const readLogo=async path=>{
   if(!path)return"";
   if(dataUrl(path))return path;
   try{const src=await irProject.images.read(path);return dataUrl(src)?src:""}catch(error){
    console.warn("Object HTML: logo unavailable",error);return""
   }
  };
  const [customerLogo,contractorLogo,ownLogo]=await Promise.all([
   readLogo(filePath("customer_logo")),readLogo(filePath("general_contractor_logo")),
   underContractor?Promise.resolve(""):readLogo(String(profile?.logo||""))
  ]);
  const identity={
   customerName:String(object.customer||""),contractorName:String(object.general_contractor||""),
   ownName:String(profile?.name||""),customerLogo,contractorLogo,ownLogo,
   underContractor:Boolean(underContractor)
  };
  // (the logo in the report's menu: the company's own, or the general contractor's when the report goes under him — the
  // engineer, 06.11.2026 «логотип фирмы выведи, а если от генподрядчика (флаг генподрядчика) то его логотип»)
  const brandLogo=underContractor?contractorLogo:ownLogo,brandName=underContractor?identity.contractorName:identity.ownName;
  return{markup:companyHeaderHtml(identity),ownName:identity.ownName,brandLogo,brandName}
 }
 function redactCompanyIdentity(html,name){
  const tokens=String(name||"").replace(/(?:&quot;|&#0*34;|&#x0*22;|&laquo;|&raquo;|["'«»“”„])/gi," ").trim().split(/\s+/).filter(Boolean);
  if(!tokens.length)return String(html);
  const special=".*+?^$(){}[]|\\/";
  const literal=x=>[...String(x)].map(c=>special.includes(c)?"\\"+c:c).join("");
  const joiner="(?:\\s|&nbsp;|&#0*160;|&quot;|&#0*34;|&#x0*22;|&laquo;|&raquo;|[\"'«»“”„])+";
  const boundary="[\\p{L}\\p{N}]";
  const closer="(?:&quot;|&#0*34;|&#x0*22;|&laquo;|&raquo;|[\"'«»“”„])+";
  const pattern="(?<!"+boundary+")"+tokens.map(literal).join(joiner)+"(?:"+closer+")?(?!"+boundary+")";
  return String(html).replace(new RegExp(pattern,"giu"),"")
 }

 function sidebarHtml(aside,keys,includeOverview=true){
  const originalNav=aside?.querySelector(".ir-object-nav");
  const links=originalNav?[...originalNav.querySelectorAll("button[data-key]")]:[];
  const original=key=>links.find(el=>el.dataset.key===key);
  const icon=key=>original(key)?.querySelector(".nav-icon")?.innerHTML||'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="'+({scheme:'M4 20V9l8-5 8 5v11M4 13h16M8 20v-7m8 7v-7M12 4v16',overview:'M3 11 12 4l9 7v10h-6v-7H9v7H3z',schedule:'M3 21h18M6 18V9h3v9m3 0V5h3v13m3 0v-7h3v7',deliveries:'M5 3h13v18H5zM9 8h5m-5 4h5m-5 4h4',reports:'M5 4h14v17H5zM9 9h6m-6 4h6m-6 4h4',marks:'m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10',photos:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5'}[key]||'M12 3v18M3 12h18')+'"/></svg>';
  // (the names in full, as the sections are called — the engineer, 06.11.2026: «в меню не сокращая наименования»)
  const name=key=>key==="deliveries"?"Поставки и монтаж":labels[key]||original(key)?.querySelector(".nav-label")?.textContent||key;
  // (no «Монтажная схема» in the menu: the main page opens it by «Открыть монтажную схему» — the engineer, 06.11.2026)
  const primary=["schedule","deliveries","reports","marks","photos"].filter(key=>keys.includes(key));
  const other=keys.filter(key=>!primary.includes(key)&&key!=="scheme");
  const item=(key,extra=false)=>'<a class="'+(extra?"ir-export-subnav-link":"ir-export-toplink")+'" href="#section-'+esc(key)+'"><span class="nav-icon" aria-hidden="true">'+icon(key)+'</span><span class="nav-label">'+esc(name(key))+'</span></a>';
  const gear='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2"/></svg>';
  return'<nav class="ir-export-topnav" aria-label="Навигация по HTML-отчёту"><div class="ir-export-topnav-inner">'+
   (includeOverview?'<a class="ir-export-toplink active" href="#overview"><span class="nav-icon" aria-hidden="true">'+icon("overview")+'</span><span>Обзор объекта</span></a>':"")+
   primary.map(key=>item(key)).join("")+
   '<details class="ir-export-menu"><summary class="ir-export-menu-trigger"><span class="nav-icon" aria-hidden="true">'+gear+'</span><span>Другое</span><span class="ir-export-menu-caret"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></span></summary>'+
   '<div class="ir-export-menu-items" aria-label="Дополнительные разделы">'+(other.length?other.map(key=>item(key,true)).join(""):'<span class="ir-export-menu-empty">Других разделов нет</span>')+'</div></details></div></nav>'
 }
 function copyCanvas(live,copy){
  const originals=[...live.querySelectorAll("canvas")],copies=[...copy.querySelectorAll("canvas")];
  originals.forEach((canvas,i)=>{try{const src=canvas.toDataURL("image/png");if(!dataUrl(src))return;const img=document.createElement("img");img.src=src;img.alt="График";img.style.width=canvas.width+"px";img.style.maxWidth="100%";copies[i]?.replaceWith(img)}catch{copies[i]?.remove()}})
 }
 

 // Keep this calculation identical to src/object-overview-top-stats.js completion().
 function exportSummaryCompletion(workTypes,marks,reports){
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const markTotal=x=>{
   const d=x?.data||x||{},raw=d.total_value??d.total_volume;
   if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return exportNumber(raw);
   return exportNumber(d.qty??d.count)*exportNumber(d.unit_volume??d.volume_one)
  };
  const factVolume=w=>{
   const raw=w?.volume??w?.total_volume,q=exportNumber(w?.qty??w?.count??w?.quantity);
   const hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());
   if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){
    const v=exportNumber(raw);
    return v||(!hasMark?q:0)
   }
   const uv=exportNumber(w?.unit_volume??w?.volume_one);
   return uv?q*uv:(!hasMark?q:0)
  };
  const wt=new Map(array(workTypes).map(r=>{
   const d=r.data||{},id=String(r.id),service=d.accounting_type==="service"||norm(d.unit)==="услуга";
   const explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category);
   const hasMarks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&
    (norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||
     array(marks).some(m=>String(m.data?.work_type_id||"")===id))));
   return[id,{id,service,hasMarks,planned:exportNumber(d.planned_volume??d.plan_volume)}]
  }));
  const plans=new Map(),facts=new Map(),serviceDone=new Set();
  for(const [id,w] of wt)if(!w.service&&!w.hasMarks&&w.planned>0)plans.set(id,w.planned);
  for(const r of array(marks)){
   const d=r.data||{},id=String(d.work_type_id||"");
   if(id&&!wt.get(id)?.service)plans.set(id,(plans.get(id)||0)+markTotal(r))
  }
  for(const raw of array(reports)){
   const d={id:raw.id,...(raw.data||raw)};
   for(const w of array(d.items||d.works)){
    const id=String(w.work_type_id||"");if(!id)continue;
    const m=wt.get(id);
    const service=m?.service||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга";
    if(service){
     if(w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status)))serviceDone.add(id);
     continue
    }
    const v=factVolume(w);
    if(v>0)facts.set(id,(facts.get(id)||0)+v)
   }
  }
  const percentages=[];
  for(const [id,w] of wt){
   if(w.service){percentages.push(serviceDone.has(id)?100:0);continue}
   const plan=plans.get(id)||0;
   if(plan>0)percentages.push(clamp((facts.get(id)||0)/plan*100,0,100))
  }
  return percentages.length?Math.round(percentages.reduce((sum,p)=>sum+p,0)/percentages.length):0
 }
 function exportLatestResources(reports){
  const sorted=[...array(reports)].sort((a,b)=>{
   const first=String((b.data||b).date||(b.data||b).report_date||"");
   const second=String((a.data||a).date||(a.data||a).report_date||"");
   return first.localeCompare(second)||exportNumber(b.id)-exportNumber(a.id)
  });
  if(!sorted.length)return{people:0,equipment:0,workers:0,responsible:0,date:""};
  const d=sorted[0].data||sorted[0];
  const countRows=items=>array(items).reduce((sum,x)=>sum+exportNumber(x?.count??x?.qty),0);
  const workerRows=array(d.workers).length?array(d.workers):array(d.people);
  const responsibleRows=array(d.responsible).length?array(d.responsible):array(d.responsibles);
  const workers=countRows(workerRows);
  const responsible=responsibleRows.reduce((sum,x)=>{
   const n=exportNumber(x?.count??x?.qty);
   return sum+(n>0?n:(String(x?.name||x?.role||"").trim()?1:0))
  },0);
  return{people:workers+responsible,equipment:countRows(d.equipment),workers,responsible,date:String(d.date||d.report_date||"")}
 }

 function exportIndicatorDate(date=new Date()){
  // («Отчёт на 06 ноября 2026г», крупно и выделено цветом — the engineer, 06.11.2026 «на главной отчета сделай больше шрифт и
  // напиши Отчет на 06 ноября 2026г. Прям выдели цветом еще, чтобы понятно было»)
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"long",year:"numeric"})
   .format(date).replace(/\s*г\.?\s*$/u,"г");
 }
 function renderIndicatorBlock(data,keys){
  const works=array(data["work-types"]),marks=array(data.marks),reports=array(data.reports),deliveries=array(data.deliveries);
  const readiness=exportSummaryCompletion(works,marks,reports);
   const unit=u=>{
   const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/[\s.]/g,"");
   return ["т","тн","tn","ton","tons"].includes(s)?"тн":
    ["м2","m2","м^2","m^2","квм","мкв"].includes(s)?"м2":
    ["м3","m3","м^3","m^3","кубм"].includes(s)?"м3":s||"ед."
  };
  const workUnits=new Map(works.map(r=>[String(r.id),r.data?.unit]));
  const markUnits=new Map(marks.map(r=>[String(r.id),r.data?.unit]));
  const totals={mounted:new Map(),delivered:new Map()};
  const add=(which,u,value)=>{
   const n=exportNumber(value);
   if(n<=0)return;
   const k=unit(u);totals[which].set(k,(totals[which].get(k)||0)+n)
  };
  const unitOf=w=>w.unit||markUnits.get(String(w.mark_id??""))||workUnits.get(String(w.work_type_id??""))||"ед.";
  for(const row of reports){
   const d=row.data||row;
   for(const w of reportWorks(d))if(!reportService(w))add("mounted",unitOf(w),reportVolume(w))
  }
  for(const row of deliveries){
   const d=row.data||row;
   const items=["items","marks","positions","rows"].map(k=>d[k]).find(Array.isArray)||[];
   for(const w of items){
    if(reportService(w))continue;
    const value=w.volume??w.total_volume;
    add("delivered",unitOf(w),value!==undefined&&value!==null&&String(value).trim()!==""?value:
     exportNumber(w.qty??w.count??w.quantity)*exportNumber(w.unit_volume??w.volume_one))
   }
   if(!items.length&&d.totals_by_unit&&typeof d.totals_by_unit==="object")
    for(const [u,v]of Object.entries(d.totals_by_unit))add("delivered",u,v)
  }
  // Include configured tonnage/area/volume work types even before the first report or delivery.
  const plannedUnits=[...works,...marks].filter(r=>{
   const d=r.data||r;
   return d.accounting_type!=="service"&&String(d.unit||"").trim().toLowerCase()!=="услуга"
  }).map(r=>unit((r.data||r).unit)).filter(u=>["тн","м2","м3"].includes(u));
  const allUnits=new Set([...plannedUnits,...totals.mounted.keys(),...totals.delivered.keys()]);
  const orderedUnits=[...allUnits].sort((a,b)=>{
   const rank=u=>["тн","м2","м3"].indexOf(u)<0?3:["тн","м2","м3"].indexOf(u);
   return rank(a)-rank(b)||a.localeCompare(b,"ru")
  });
  const fmt=v=>Number(v.toFixed(3)).toLocaleString("ru-RU",{maximumFractionDigits:3});
  const unitsHtml=kind=>{
   if(!orderedUnits.length)return'<div class="ir-export-indicator-value">0<small>—</small></div>';
   if(orderedUnits.length===1){
    const u=orderedUnits[0];
    return'<div class="ir-export-indicator-value">'+esc(fmt(totals[kind].get(u)||0))+'<small>'+esc(u)+'</small></div>'
   }
   return'<div class="ir-export-indicator-unit-list">'+orderedUnits.map(u=>
    '<div class="ir-export-indicator-unit-row"><b>'+esc(fmt(totals[kind].get(u)||0))+'</b><small>'+esc(u)+'</small></div>'
   ).join("")+'</div>'
  };
  const last=exportLatestResources(reports).date;
  const icons={
   readiness:'<circle cx="12" cy="12" r="9"/><path d="M12 12V6M12 12l4 3"/>',
   // (signs of the work itself: a crane lifting a beam — mounted, a lorry — delivered; a rising chart and a square said
   // nothing of mounting: the engineer, 06.11.2026 «знак у поставленно и смонтировано поменяй, вообще не относятся к монтажу»)
   // (mounted — a gear with a tick, as the engineer showed: 06.11.2026 «где смонтировано такую иконку поставь»)
   mounted:'<path d="M20 10.1 22.5 10.4V13.6L20 13.9 19 16.3 20.5 18.3 18.3 20.5 16.3 19 13.9 20 13.6 22.5H10.4L10.1 20 7.7 19 5.7 20.5 3.5 18.3 5 16.3 4 13.9 1.5 13.6V10.4L4 10.1 5 7.7 3.5 5.7 5.7 3.5 7.7 5 10.1 4 10.4 1.5H13.6L13.9 4 16.3 5 18.3 3.5 20.5 5.7 19 7.7Z"/><circle cx="12" cy="12" r="4.6"/><path d="m9.9 12 1.5 1.5 2.8-2.9"/>',
   delivered:'<path d="M2 6h12v10H2zM14 9h4.5l3.5 3.5V16h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
   reports:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/>',
   resources:'<circle cx="8" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2M17 9h4M19 7v4M15 16l3-5 3 5M14 18h8"/>'
  };
  const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>';
  const cards=[
   ["readiness","Средняя готовность",String(Math.round(readiness)),"%","Среднее по видам работ",""],
   ["mounted","Смонтировано","","","По ежедневным отчётам",orderedUnits.length>1?"Объёмы отдельно по единицам":"Фактический объём"],
   ["delivered","Поставлено","","","По накладным",orderedUnits.length>1?"Объёмы отдельно по единицам":orderedUnits.length===1?"Остаток: "+fmt((totals.delivered.get(orderedUnits[0])||0)-(totals.mounted.get(orderedUnits[0])||0))+" "+orderedUnits[0]:"Нет поставок"],
   ["reports","Ежедневные отчёты",String(reports.length),"шт.","История выполненных работ",last?"Последний: "+exportDate(last):"Отчётов пока нет"]
  ];
  const cardHtml=cards.map(([key,title,value,u,desc,footer])=>{
   const values=key==="mounted"||key==="delivered"?unitsHtml(key):
    '<div class="ir-export-indicator-value">'+esc(value)+'<small>'+esc(u)+'</small></div>';
   return'<article class="ir-export-indicator-card ir-export-indicator-'+key+'"><div class="ir-export-indicator-head"><div class="ir-export-indicator-icon">'+svg(key)+'</div>'+
    '<div class="ir-export-indicator-title">'+esc(title)+'</div></div>'+values+
    '<p>'+esc(desc)+'</p><div class="ir-export-indicator-foot">'+(key==="readiness"?'<div class="ir-export-indicator-track"><i style="width:'+Math.max(0,Math.min(100,readiness)).toFixed(2)+'%"></i></div>':esc(footer))+'</div></article>'
  }).join("");
  // (line icons as in the menu, not the glyphs ♜ ▧ ▤ — filled black squares on a phone: the engineer, 06.11.2026
  // «Подправь иконки и тд, в мобильной версии»)
  const lineIcon=d=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
  const linkOptions=[["scheme","Открыть монтажную схему",lineIcon('<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>')],["photos","Посмотреть фотографии",lineIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>')],["marks","Объёмы и ведомость марок",lineIcon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>')]];
  const links=linkOptions.filter(x=>keys.includes(x[0])).map(([key,title,glyph])=>
   '<a class="ir-export-indicator-link" href="#section-'+esc(key)+'"><span><i aria-hidden="true">'+glyph+'</i>'+esc(title)+'</span><b aria-hidden="true">↗</b></a>'
  ).join("");
  return'<section class="ir-export-indicators" aria-label="Показатели объекта">'+
   '<div class="ir-export-indicators-heading"><h2>Показатели объекта</h2><span class="ir-export-report-date">Отчёт на '+esc(exportIndicatorDate())+'</span></div>'+
   '<div class="ir-export-indicator-cards">'+cardHtml+'</div>'+(links?'<nav class="ir-export-indicator-links" aria-label="Быстрые переходы по отчёту">'+links+'</nav>':"")+'</section>'
 }

 // Weather in the live dashboard is populated asynchronously. A static offline
 // export must not capture "Загрузка…" while the request is still pending.
 async function exportWaitForWeather(timeoutMs=7000){
  const app=document.getElementById("app");
  if(!app)return;
  const settled=()=>{
   const weather=app.querySelector(".object-overview-top-stats .oos-weather");
   return Boolean(weather&&!weather.querySelector(".oos-weather-loading"))
  };
  if(settled())return;
  await new Promise(resolve=>{
   let done=false;
   const observer=new MutationObserver(()=>{
    if(settled()||!app.isConnected)finish()
   });
   const finish=()=>{
    if(done)return;
    done=true;
    observer.disconnect();
    clearTimeout(timeout);
    resolve()
   };
   const timeout=setTimeout(finish,timeoutMs);
   observer.observe(app,{subtree:true,childList:true});
   if(settled())finish()
  })
 }
 function exportFinalizeWeather(copy){
  const loading=copy.querySelector(".ir-export-indicators .oos-weather-loading");
  if(!loading)return;
  const title=loading.querySelector("b"),caption=loading.querySelector("small");
  if(title)title.textContent="Нет данных";
  if(caption)caption.textContent="Погода не загрузилась к моменту выгрузки"
 }
 // The "График работ" entries store dates per work type.
 // Use the earliest planned start and latest planned finish across the object.
 function exportWorkPeriod(rows){
  const valid=value=>{
   const s=String(value??"").trim().slice(0,10);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return"";
   const d=new Date(s+"T00:00:00Z");
   return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:""
  };
  const starts=[],ends=[];
  for(const row of array(rows)){
   const data=row?.data||row||{};
   const start=valid(data.start_date),end=valid(data.end_date);
   if(start)starts.push(start);
   if(end)ends.push(end)
  }
  if(!starts.length||!ends.length)return"";
  const first=starts.sort()[0],last=ends.sort().at(-1);
  if(last<first)return"";
  const fmt=d=>d.slice(8,10)+"."+d.slice(5,7)+"."+d.slice(0,4);
  return fmt(first)+" — "+fmt(last)
 }
 function snapshot(keys,includeOverview=true,headerMarkup="",indicatorsMarkup="",reportRows=[],workPeriod=""){
  const live=document.getElementById("app");
  if(!live?.querySelector(".object-overview-hero"))throw Error("Откройте страницу «Обзор объекта» нужного объекта.");
  const copy=live.cloneNode(true);
  copyCanvas(live,copy);
  copy.querySelectorAll("dialog,form,script,iframe,object,embed,video,audio,button,input,textarea,select,[contenteditable],.window-update,.profile-panel,.ir-notice-stack").forEach(el=>el.remove());
  copy.querySelectorAll("a").forEach(el=>{const t=document.createElement("span");t.innerHTML=el.innerHTML;el.replaceWith(t)});
  copy.querySelectorAll("*").forEach(el=>{for(const att of [...el.attributes]){if(/^on/i.test(att.name)||att.name==="tabindex")el.removeAttribute(att.name)}});
  const hero=copy.querySelector(".object-overview-hero");
  if(hero){
   hero.id="overview";
   const bannerName=hero.querySelector(".object-hero-copy h1")?.textContent?.trim()||"";
   const bannerAddress=hero.querySelector(".object-hero-info-item.location b")?.textContent?.trim()||"";
   hero.classList.add("ir-export-banner-only");
   // (the header as high as the banner is — the whole picture, not a strip of it: the engineer, 06.11.2026 «шапку отчета
   // сделай максимальной высотой баннера и шрифт подгони, убери промышленный объект»)
   hero.querySelector(".object-hero-content")?.remove();
   hero.querySelector(".object-hero-shade")?.remove();
   const icon=path=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
   const pin=icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>');
   const calendar=icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2"/>');
   const fact=(symbol,label,value)=>'<div class="ir-export-hero-fact"><span class="ir-export-hero-fact-icon">'+symbol+'</span><span class="ir-export-hero-fact-copy">'+(label?'<span>'+esc(label)+'</span>':"")+'<b>'+esc(value)+'</b></span></div>';
   hero.insertAdjacentHTML("beforeend",'<div class="ir-export-banner-copy"><h1>'+esc(bannerName)+'</h1><div class="ir-export-hero-facts">'+
    (bannerAddress?fact(pin,"",bannerAddress):"")+(workPeriod?fact(calendar,"Период реализации",workPeriod):"")+'</div></div>');
   if(headerMarkup)hero.insertAdjacentHTML("afterend",headerMarkup);
   (copy.querySelector(".ir-export-companies")||hero).insertAdjacentHTML("afterend",sidebarHtml(document.querySelector(".ir-object-sidebar-fixed"),keys,includeOverview));
   if(indicatorsMarkup)copy.querySelector(".ir-export-topnav")?.insertAdjacentHTML("afterend",indicatorsMarkup)
  }
  const menu=copy.querySelector(".object-hero-menu");if(menu)menu.remove();
  // The printed overview is one continuous "Показатели объекта" section.
  copy.querySelector(".ir-object-overview-sidehead")?.remove();
  const latest=exportLatestResources(reportRows);
  const stats=copy.querySelector(".object-overview-top-stats");
  // The archive already has a readiness KPI; remove its duplicate summary tile.
  stats?.querySelector(".oos-progress")?.remove();
  const human=stats?.querySelector(".oos-icon.people")?.closest(".oos-card")?.querySelector(".oos-copy");
  const tech=stats?.querySelector(".oos-icon.equipment")?.closest(".oos-card")?.querySelector(".oos-copy");
  const note=latest.date?"Согласно отчета от "+exportDate(latest.date)+"г.":"Отчётов пока нет";
  if(human){human.querySelector("span").textContent="Люди · "+note;human.querySelector("b").textContent=latest.people+" чел.";human.querySelector("small").textContent="Работники: "+latest.workers+" · Ответственные: "+latest.responsible}
  if(tech){tech.querySelector("span").textContent="Техника · "+note;tech.querySelector("b").textContent=latest.equipment+" ед.";tech.querySelector("small")?.remove()}
  // Include people, equipment and weather immediately under object KPIs, no second heading.
  const indicatorSection=copy.querySelector(".ir-export-indicators");
  if(indicatorSection&&stats){
   const links=indicatorSection.querySelector(".ir-export-indicator-links");
   if(links)links.before(stats);else indicatorSection.append(stats)
  }
  exportFinalizeWeather(copy);
  const preview=extractOverviewPreviews(copy,keys);
  // The remaining dashboard wrappers belong to individual export sections, not an overview column.
  copy.querySelector(".ir-object-overview-layout")?.remove();
  if(!includeOverview){
   const keep=new Set([hero,copy.querySelector(".ir-export-topnav"),copy.querySelector(".ir-export-companies")]);
   for(const child of [...copy.children])if(!keep.has(child))child.remove()
  }
  return {overview:copy.innerHTML,preview}
 }

 function chooseExportSections(keys,nav){
  const names=new Map([...nav?.querySelectorAll("button[data-key]")||[]].map(b=>[b.dataset.key,b.querySelector(".nav-label")?.textContent?.trim()||labels[b.dataset.key]||b.dataset.key]));
  if(!document.getElementById("ir-export-options-style")){
   const st=document.createElement("style");st.id="ir-export-options-style";
   st.textContent=[
    "dialog.ir-export-options{box-sizing:border-box!important;width:min(540px,calc(100vw - 28px))!important;height:min(760px,calc(100dvh - 28px))!important;max-height:calc(100dvh - 28px)!important;min-height:0!important;margin:auto!important;padding:0!important;border:1px solid #d8e5ee!important;border-radius:14px!important;background:#fff!important;color:#29465b!important;box-shadow:0 22px 70px rgba(11,36,57,.28)!important;overflow:hidden!important;font:13px/1.45 'Segoe UI',Arial,sans-serif!important}",
    "dialog.ir-export-options[open]{display:flex!important;flex-direction:column!important}",
    ".ir-export-options-head,.ir-export-options-tools,.ir-export-options-foot{flex:0 0 auto!important}",
    "dialog.ir-export-options::backdrop{background:rgba(13,30,47,.52)!important}",
    ".ir-export-options-head{padding:20px 22px 15px;border-bottom:1px solid #e3ebf1}.ir-export-options-head h2{margin:0 0 6px;font-size:17px;color:#204861}.ir-export-options-head p{margin:0;color:#8295a3;font-size:12px}",
    ".ir-export-options-tools{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 20px;background:#f5f9fc}.ir-export-options-tools small{color:#738da2}",
    ".ir-export-options button{padding:8px 11px;border:1px solid #d8e6ee;border-radius:8px;background:#fff;color:#346d99;cursor:pointer;font-weight:700}.ir-export-options button:disabled{opacity:.5;cursor:not-allowed}",
    ".ir-export-options-list{display:grid;align-content:start;gap:7px;padding:12px 20px;flex:1 1 auto!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain;scrollbar-gutter:stable}",
    ".ir-export-options-list label{display:flex;align-items:center;gap:12px;min-height:42px;padding:9px 12px;border:1px solid #e3ecf2;border-radius:8px;cursor:pointer;font-weight:600}",
    ".ir-export-options-list>label:hover{background:#eef7fc}.ir-export-options-list>label:first-child{background:#f3f9fd}",
    ".ir-export-options-flag{margin:8px 0 4px;padding:12px 13px;background:#f1f7fd;border:1px solid #c9dfef;border-radius:9px}",
    ".ir-export-options-flag label{display:flex;gap:11px;align-items:center;min-height:0;padding:0;border:0;border-radius:0;font-size:12px;font-weight:750;color:#214a68;cursor:pointer}",
    ".ir-export-options-flag input{width:17px;height:17px;flex:0 0 17px;accent-color:#2475b1}",
    ".ir-export-options-flag p{margin:6px 0 0 28px;font-size:11px;line-height:1.5;color:#69879b}",
    ".ir-export-options-list input{width:17px;height:17px;accent-color:#287bb5;cursor:pointer;flex:0 0 17px}",
    ".ir-export-options-foot{display:flex;position:relative;z-index:1;flex:0 0 auto;align-items:center;justify-content:flex-end;gap:9px;min-height:64px;padding:12px 20px;border-top:1px solid #e3ebf1;background:#fff!important}.ir-export-options .ir-export-save{background:#236da6;color:#fff;border-color:#236da6}",
    "@media(max-height:540px){.ir-export-options-head{padding:12px 18px 10px}.ir-export-options-tools{padding:7px 18px}.ir-export-options-list{padding:8px 15px}.ir-export-options-foot{min-height:48px;padding:7px 16px}}",
    ".ir-export-options button:focus-visible{outline:2px solid #3585c5;outline-offset:2px}"
   ].join("\n");document.head.append(st)
  }
  return new Promise(resolve=>{
   const dlg=document.createElement("dialog");dlg.className="ir-export-options";
   const items=[{key:"overview",name:"Обзор объекта — сводка, ресурсы, погода"},...keys.map(key=>({key,name:names.get(key)||labels[key]||key}))];
   dlg.innerHTML='<div class="ir-export-options-head"><h2>Выгрузка объекта в HTML</h2><p>Выберите разделы, которые будут включены в отчёт.</p></div>'+
    '<div class="ir-export-options-tools"><small data-export-count></small><div><button type="button" data-export-all>Выбрать все</button> <button type="button" data-export-none>Снять все</button></div></div>'+
    // («Финансы» unchecked at every opening — put in only by hand: the engineer, 06.11.2026 «раздел финансы выключен
    // всегда при выгрузке»)
    '<div class="ir-export-options-list">'+items.map(x=>'<label><input type="checkbox" data-export-key="'+esc(x.key)+'"'+(x.key==="finance"?"":" checked")+'><span>'+esc(workLabel(x.name))+(x.key==="finance"?' <small>(по умолчанию выключен)</small>':"")+'</span></label>').join("")+
    '<div class="ir-export-options-flag"><label><input type="checkbox" data-under-contractor><span>Под флагом Генподрядчика</span></label><p>Не показывать название и логотип нашей компании в выгруженном отчёте. По умолчанию выключено.</p></div></div>'+
    '<div class="ir-export-options-foot"><button type="button" data-export-cancel>Отмена</button><button type="button" data-export-link title="Отчёт на сервере компании: ссылку можно отправить заказчику — откроется в браузере и на телефоне, без программы">Поделиться ссылкой</button><button type="button" class="ir-export-save" data-export-confirm>Выгрузить HTML</button></div>';
   document.body.append(dlg);
   const checks=[...dlg.querySelectorAll("input[data-export-key]")],ok=dlg.querySelector("[data-export-confirm]");
   const refresh=()=>{const n=checks.filter(x=>x.checked).length;ok.disabled=n===0;dlg.querySelector("[data-export-link]").disabled=n===0;dlg.querySelector("[data-export-count]").textContent="Выбрано: "+n+" из "+checks.length};
   let result=null;
   dlg.addEventListener("close",()=>{dlg.remove();resolve(result)},{once:true});
   dlg.querySelector("[data-export-all]").addEventListener("click",()=>{checks.forEach(x=>x.checked=true);refresh()});
   dlg.querySelector("[data-export-none]").addEventListener("click",()=>{checks.forEach(x=>x.checked=false);refresh()});
   dlg.querySelector("[data-export-cancel]").addEventListener("click",()=>dlg.close());
   const pick=share=>{
    if(!checks.some(x=>x.checked))return;
    result={overview:checks.find(x=>x.dataset.exportKey==="overview")?.checked===true,keys:keys.filter(key=>checks.some(x=>x.dataset.exportKey===key&&x.checked)),underContractor:dlg.querySelector("[data-under-contractor]").checked===true,share};
    dlg.close()
   };
   ok.addEventListener("click",()=>pick(false));
   const linkBtn=dlg.querySelector("[data-export-link]");linkBtn.addEventListener("click",()=>pick(true));
   dlg.addEventListener("change",refresh);
   refresh();dlg.showModal()
  })
 }

 // The bar of the export (the engineer, 06.11.2026: «при выгрузке отчета сделай полосу загрузки, а то будто зависает,
 // ждешь ждешь, а потом бац и уведомление»): what is done now and how much, from the choice of the sections to the file;
 // its light runs by itself (an animation of transform — moves even while a long step holds the page).
 function exportProgress(){
  const box=document.createElement("div");box.className="ir-export-progress";box.setAttribute("role","status");
  box.innerHTML='<style>.ir-export-progress{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(15,30,45,.28)}.ir-export-progress>div{width:min(440px,calc(100% - 32px));padding:16px 18px 14px;background:#fff;border:1px solid #dce5ed;border-radius:12px;box-shadow:0 12px 34px rgba(15,30,60,.22);color:#21435b;font:14px/1.4 Inter,"Segoe UI",Arial,sans-serif}.ir-export-progress b{display:block;font-size:15px;margin-bottom:10px}.ir-export-progress .row{display:flex;align-items:center;gap:10px}.ir-export-progress .bar{position:relative;flex:1 1 auto;height:10px;border-radius:5px;background:#e3eaf3;overflow:hidden}.ir-export-progress .bar i{display:block;height:100%;width:2%;border-radius:5px;background:linear-gradient(90deg,#1f5fbf,#4f8fe6);transition:width .3s ease-out}.ir-export-progress .bar:after{content:"";position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:irExportRun 1.3s linear infinite}@keyframes irExportRun{from{transform:translateX(-100%)}to{transform:translateX(250%)}}.ir-export-progress em{min-width:40px;text-align:right;font-style:normal;font-weight:650;font-variant-numeric:tabular-nums}.ir-export-progress span{display:block;margin-top:8px;color:#6f879b;font-size:13px;min-height:1.4em}</style><div><b>Выгрузка отчёта по объекту</b><div class="row"><div class="bar"><i></i></div><em>0%</em></div><span>Подготовка…</span></div>';
  document.body.appendChild(box);
  const bar=box.querySelector(".bar i"),pct=box.querySelector("em"),what=box.querySelector("span");let at=0;
  return{
   // (the page drawn before the next step: a step that holds the page shows its name, not the one before)
   async step(v,text){at=Math.max(at,Math.min(1,v));bar.style.width=Math.max(2,at*100).toFixed(1)+"%";pct.textContent=Math.round(at*100)+"%";if(text)what.textContent=text;await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)))},
   quiet(v,text){at=Math.max(at,Math.min(1,v));bar.style.width=Math.max(2,at*100).toFixed(1)+"%";pct.textContent=Math.round(at*100)+"%";if(text)what.textContent=text},
   done(){box.remove()}
  }
 }
 // The link to the report on the company's server (the engineer, 10.11.2026 «Отчет по объекту ссылкой»): copy, open,
 // delete. One link per object — the next «Поделиться ссылкой» puts the new report under the same link.
 const linkError=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
 // (kind "scheme" — the montage scheme alone, the «🔗 Ссылка» button of the scheme window, 11.11.2026: its own link)
 function showReportLink(objectId,r,kind){
  const link=r&&r.link;if(!link)throw Error("Сервер не вернул ссылку");
  const sch=kind==="scheme",what=sch?"схему":"отчёт",again=sch?"«🔗 Ссылка» на схеме":"«Поделиться ссылкой»";
  const dlg=document.createElement("dialog");dlg.className="ir-export-options ir-export-link";
  dlg.innerHTML='<style>dialog.ir-export-link{height:auto!important}.ir-export-link .body{padding:16px 22px;display:grid;gap:10px}.ir-export-link input{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #cfdde8;border-radius:8px;font:13px monospace;color:#204861;background:#f5f9fc}.ir-export-link p{margin:0;font-size:12.5px;line-height:1.5;color:#55707f}.ir-export-link .ok{color:#1e7a46;font-weight:700}.ir-export-link .danger{color:#b42318!important;border-color:#f1c4bf!important}</style>'+
   '<div class="ir-export-options-head"><h2>'+(sch?"Монтажная схема по ссылке":"Отчёт по ссылке")+'</h2><p>'+(r.updated?(sch?"Схема обновлена":"Отчёт обновлён")+" — ссылка прежняя, отправлять заново не нужно.":"Ссылка готова — отправьте её заказчику или руководителю.")+'</p></div>'+
   '<div class="body"><input readonly data-link-url value="'+esc(link.url)+'"><p>Открывается в браузере на компьютере и телефоне, без программы и без входа. Видит '+what+' любой, у кого есть ссылка, — только просмотр. '+(sch?"Схема — как сейчас на экране (выгрузка «HTML»); ссылка на отчёт по объекту — своя, отдельно.":"В отчёте то, что вы выбрали сейчас.")+' Чтобы обновить, снова нажмите '+again+'.</p><p data-link-note></p></div>'+
   '<div class="ir-export-options-foot"><button type="button" class="danger" data-link-remove>Удалить ссылку</button><button type="button" data-link-open>Открыть</button><button type="button" data-link-close>Закрыть</button><button type="button" class="ir-export-save" data-link-copy>Копировать ссылку</button></div>';
  document.body.append(dlg);
  const note=dlg.querySelector("[data-link-note]"),input=dlg.querySelector("[data-link-url]");
  const copy=async()=>{try{await navigator.clipboard.writeText(link.url)}catch(_e){input.select();document.execCommand("copy")}note.className="ok";note.textContent="Ссылка скопирована — вставьте её в WhatsApp, Telegram или письмо."};
  dlg.querySelector("[data-link-copy]").onclick=copy;
  dlg.querySelector("[data-link-open]").onclick=()=>irProject.ai.invoke("ai-settings:server-open-link",{url:link.url}).catch(e=>{note.className="";note.textContent=linkError(e)});
  dlg.querySelector("[data-link-close]").onclick=()=>dlg.close();
  dlg.querySelector("[data-link-remove]").onclick=async ev=>{
   if(!confirm("Удалить ссылку? Она сразу перестанет открываться у всех, кому вы её отправили."))return;
   ev.currentTarget.disabled=true;
   try{await irProject.ai.invoke("ai-settings:server-report-unshare",{objectId,kind:sch?"scheme":undefined});note.className="";note.textContent="Ссылка удалена: "+(sch?"схема":"отчёт")+" по ней больше не открывается.";input.value="";dlg.querySelector("[data-link-copy]").disabled=true;dlg.querySelector("[data-link-open]").disabled=true}
   catch(e){note.className="";note.textContent="Не удалено: "+linkError(e);ev.currentTarget.disabled=false}
  };
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  dlg.showModal();copy()
 }
 window.irReportLinkDialog=showReportLink;
 async function exportObject(objectId){
  const id=String(objectId);
  if(!/^\d+$/.test(id))throw Error("Неверный ID объекта.");
  if(exportObject.busy)return false;
  exportObject.busy=true;let bar=null;
  try{
   const object=await irProject.data.objects.get(id);
   if(!object)throw Error("Объект не найден.");
   const sections=array(await irProject.data.sections.get(id));
   const nav=document.querySelector(".ir-object-sidebar-fixed .ir-object-nav");
   const visibleKeys=nav?[...nav.querySelectorAll("button[data-key]")].filter(b=>!b.disabled&&b.dataset.key!=="overview").map(b=>b.dataset.key):[];
   // (the trash is never in the report — not offered, not shown: the engineer, 06.11.2026 «корзина не выводится никогда»)
   const availableKeys=[...new Set(visibleKeys.length?visibleKeys:sections.filter(s=>s.enabled).map(s=>s.section_key))].filter(key=>key!=="trash");
  const selection=await chooseExportSections(availableKeys,nav);
  if(!selection)return false;
  const keys=selection.keys;
   bar=exportProgress();await bar.step(.03,"Логотипы и сведения о компаниях");
   const api=irProject.data.forObject(id);
   const companyHeader=await exportCompanyHeader(api,object,selection.underContractor);
   await bar.step(.08,"Разделы объекта");
   const batches=await Promise.all(keys.map(async key=>{
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: failed to load section",key,error);return[key,[]]}
   }));
   const rows=Object.fromEntries(batches);
   const needsWork=["reports","marks","scheme","work-types","schedule","executive-docs"].some(k=>keys.includes(k));
   const needsReports=["reports","photos","marks","work-types","schedule","scheme","executive-docs"].some(k=>keys.includes(k));
   const needsMarks=["reports","marks","work-types","scheme"].some(k=>keys.includes(k));
   const supporting=await Promise.all([
    needsWork?(rows["work-types"]?Promise.resolve(rows["work-types"]):api.section("work-types").list().catch(()=>[])):Promise.resolve([]),
    needsReports?(rows.reports?Promise.resolve(rows.reports):api.section("reports").list().catch(()=>[])):Promise.resolve([]),
    needsMarks?(rows.marks?Promise.resolve(rows.marks):api.section("marks").list().catch(()=>[])):Promise.resolve([])
   ]);
   const markNames=reportMarkNames(supporting[2]);
   const schemeMarks=keys.includes("scheme")?(rows.marks||await api.section("marks").list().catch(()=>[])):[];
   const schemeDetails=keys.includes("scheme")?markDetailData(schemeMarks,supporting[0],supporting[1]):[];
   const photoInputs=keys.includes("photos")?{...rows,reports:supporting[1]}:rows;
   await bar.step(.25,"Фотографии");
   const photos=await inlinePhotos(photoInputs,(n,all)=>bar.quiet(.25+.25*n/Math.max(1,all),"Фотографии: "+n+" из "+all));
   await bar.step(.5,"Оформление отчёта");
   const cssResponse=await fetch("./ir-styles.css?v=17149",{cache:"no-store"});
   if(!cssResponse.ok)throw Error("Не удалось загрузить оформление отчёта.");
   const css=await cssResponse.text();
   const extraStyles=[
    "*{box-sizing:border-box}",
    "html{scroll-behavior:smooth}body.ir-object-overview{padding-top:0!important;min-width:0!important;background:#eef3f8!important}",
    "body.ir-object-overview #app{padding-bottom:30px!important}",
    "body.ir-object-route.ir-object-overview{margin:0!important;padding:0!important}",
    "body.ir-object-route.ir-object-overview #app{width:100%!important;max-width:1000px!important;min-width:0!important;margin:0 auto!important;padding:0 0 24px!important;box-sizing:border-box!important}",
            ".ir-export-companies{display:block!important;width:auto!important;max-width:none!important;margin:19px 20px 16px!important;padding:0!important;background:#fff!important;border:1px solid #dae5ee!important;border-radius:13px!important;box-shadow:0 5px 18px rgba(24,62,89,.055)!important;overflow:hidden!important;box-sizing:border-box!important}",
    ".ir-export-companies-heading{display:flex!important;align-items:center!important;gap:8px!important;min-height:43px!important;padding:12px 19px!important;background:#f5f9fd!important;border-bottom:1px solid #dde9f2!important;color:#224c68!important;font:800 12px/1.5 'Segoe UI',Arial,sans-serif!important}",
    ".ir-export-companies-heading:before{content:''!important;display:block!important;width:3px!important;height:16px!important;border-radius:4px!important;background:#2a7db6!important}",
    ".ir-export-companies-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;align-items:stretch!important;width:100%!important;min-width:0!important}",
    ".ir-export-companies-two .ir-export-companies-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    ".ir-export-company-card{display:flex!important;flex-direction:column!important;align-items:center!important;gap:10px!important;min-width:0!important;margin:0!important;padding:19px 16px 20px!important;border:0!important;border-right:1px solid #e4edf3!important;border-radius:0!important;background:#fff!important;text-align:center!important;box-shadow:none!important}",
    ".ir-export-company-card:last-child{border-right:0!important}",
    ".ir-export-company-role{display:block!important;min-height:16px!important;color:#69889d!important;font:800 10px/1.45 'Segoe UI',Arial,sans-serif!important;letter-spacing:.65px!important;text-transform:uppercase!important}",
    ".ir-export-company-logo{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;max-width:245px!important;height:108px!important;min-height:108px!important;max-height:108px!important;padding:10px 16px!important;margin:0 auto!important;border:1px solid #e9f0f5!important;border-radius:10px!important;background:#f8fbfd!important;overflow:hidden!important;box-sizing:border-box!important}",
    ".ir-export-company-logo img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}",
    ".ir-export-company-no-logo{color:#95aaba!important;font-size:11px!important;font-weight:500!important}",
    ".ir-export-company-name{width:100%!important;max-width:100%!important;min-width:0!important;min-height:37px!important;color:#24475f!important;font:800 13px/1.45 'Segoe UI',Arial,sans-serif!important;overflow-wrap:anywhere!important;word-break:normal!important}",
    "@media(max-width:760px){.ir-export-companies{margin:13px 12px 12px!important}.ir-export-company-card{padding:15px 9px!important;gap:8px!important}.ir-export-company-logo{height:92px!important;min-height:92px!important;max-height:92px!important;padding:8px!important}.ir-export-company-name{font-size:11px!important}.ir-export-company-role{font-size:9px!important}}",
    "@media(max-width:560px){.ir-export-companies-grid,.ir-export-companies-two .ir-export-companies-grid{grid-template-columns:minmax(0,1fr)!important}.ir-export-company-card{border-right:0!important;border-bottom:1px solid #e4edf3!important;padding:14px 16px!important}.ir-export-company-card:last-child{border-bottom:0!important}.ir-export-company-logo{max-width:250px!important}}",
    "@media print{.ir-export-companies{margin:10px 0 14px!important;break-inside:avoid!important;box-shadow:none!important}.ir-export-company-card{break-inside:avoid!important}}",
         ".ir-export-indicators{box-sizing:border-box!important;display:block!important;width:100%!important;margin:0!important;padding:18px 20px 22px!important;background:#fff!important}",
     ".ir-export-indicators-heading{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;margin:0 0 14px!important}",
     ".ir-export-indicators-heading h2{margin:0!important;color:#214b66!important;font:800 16px/1.35 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicators-heading span{color:#95a9b8!important;font:500 11px/1.4 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-cards{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;align-items:stretch!important}",
     ".ir-export-indicator-card{position:relative!important;display:flex!important;flex-direction:column!important;min-width:0!important;min-height:195px!important;gap:8px!important;overflow:hidden!important;padding:14px 12px 12px!important;border:1px solid #dce6ee!important;border-radius:12px!important;background:#fff!important;box-shadow:0 3px 12px rgba(24,60,87,.045)!important}",
     ".ir-export-indicator-card:before{content:''!important;position:absolute!important;left:17px!important;right:17px!important;top:0!important;height:3px!important;background:#80adca!important;border-radius:0 0 3px 3px!important}",
     ".ir-export-indicator-icon{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 35px!important;width:35px!important;height:35px!important;border-radius:9px!important;background:#eaf2f9!important;color:#397fb4!important}",
     ".ir-export-indicator-icon svg{width:22px!important;height:22px!important}",
     ".ir-export-indicator-mounted .ir-export-indicator-icon{background:#e8f5f1!important;color:#2b9d7b!important}",
     ".ir-export-indicator-delivered .ir-export-indicator-icon{background:#fff4e7!important;color:#be9154!important}",
     ".ir-export-indicator-reports .ir-export-indicator-icon{background:#f1ecfa!important;color:#7f6dae!important}",
     ".ir-export-indicator-scheme .ir-export-indicator-icon{background:#e8f6f7!important;color:#2c909c!important}",
     ".ir-export-indicator-title{color:#718c9e!important;font:750 10px/1.35 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-value{display:flex!important;align-items:baseline!important;gap:4px!important;min-width:0!important;color:#1b4968!important;white-space:nowrap!important;font:850 clamp(19px,2.6vw,32px)/1 'Segoe UI',Arial,sans-serif!important;letter-spacing:-.4px!important;font-variant-numeric:tabular-nums!important}",
     ".ir-export-indicator-value small{color:#90a5b3!important;font:700 10px/1.3 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-card p{margin:0!important;min-height:27px!important;color:#93a8b5!important;font:500 10px/1.35 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-foot{display:flex!important;align-items:center!important;min-height:25px!important;margin-top:auto!important;padding-top:8px!important;border-top:1px solid #e8eef3!important;color:#7892a4!important;font:500 10px/1.4 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-track{width:100%!important;height:6px!important;border-radius:99px!important;background:#e5edf3!important;overflow:hidden!important}",
     ".ir-export-indicator-track i{display:block!important;height:100%!important;border-radius:99px!important;background:#398cbd!important}",
          ".ir-export-resource-values{display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:7px!important;min-width:0!important;white-space:nowrap!important}",
     ".ir-export-resource-values>div{display:flex!important;align-items:baseline!important;gap:3px!important;min-width:0!important}",
     ".ir-export-resource-values b{font:850 clamp(19px,2.45vw,29px)/1 'Segoe UI',Arial,sans-serif!important;color:#1b4968!important;font-variant-numeric:tabular-nums!important}",
     ".ir-export-resource-values small{font:700 9px/1.25 'Segoe UI',Arial,sans-serif!important;color:#849fb0!important;white-space:normal!important}",
     "@media(max-width:580px){.ir-export-resource-values b{font-size:24px!important}.ir-export-resource-values small{font-size:8px!important}}",
     ".ir-export-indicator-links{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;margin-top:14px!important}",
     ".ir-export-indicator-link{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:52px!important;padding:12px 13px!important;border:1px solid #d0e1ef!important;border-radius:9px!important;background:#e7f2fa!important;color:#29688f!important;text-decoration:none!important;font:800 11px/1.3 'Segoe UI',Arial,sans-serif!important}",
     ".ir-export-indicator-link:hover{background:#dceefa!important;color:#15587e!important}",
     ".ir-export-indicator-link span{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important}",
     ".ir-export-indicator-link i{font:700 18px/1 'Segoe UI',Arial,sans-serif!important;font-style:normal!important}",
          ".ir-export-indicator-unit-list{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:5px!important;width:100%!important;min-width:0!important;align-content:start!important}",
     ".ir-export-indicator-unit-row{display:flex!important;align-items:baseline!important;justify-content:space-between!important;gap:7px!important;min-width:0!important;padding:4px 0!important;border-bottom:1px dashed #e7edf3!important}",
     ".ir-export-indicator-unit-row:last-child{border-bottom:0!important}",
     ".ir-export-indicator-unit-row b{min-width:0!important;color:#1b4968!important;font:800 19px/1.12 'Segoe UI',Arial,sans-serif!important;font-variant-numeric:tabular-nums!important;overflow-wrap:anywhere!important}",
     ".ir-export-indicator-unit-row small{flex:0 0 auto!important;color:#7791a4!important;font:750 11px/1.3 'Segoe UI',Arial,sans-serif!important}",
     "@media(max-width:830px){.ir-export-indicator-cards{grid-template-columns:repeat(3,minmax(0,1fr))!important}.ir-export-indicator-links{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ir-export-indicator-value{font-size:27px!important}}",
     "@media(max-width:560px){.ir-export-indicators{padding:14px 12px 18px!important}.ir-export-indicator-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ir-export-indicator-links{grid-template-columns:1fr!important}.ir-export-indicator-card{min-height:180px!important}.ir-export-indicator-value{font-size:24px!important}}",
     "@media print{.ir-export-indicators{break-inside:avoid!important}.ir-export-indicator-card{break-inside:avoid!important}}",
     ".ir-export-topnav{position:sticky!important;top:0!important;z-index:95!important;display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:62px!important;margin:0!important;padding:9px 16px!important;background:rgba(255,255,255,.98)!important;border-bottom:1px solid #dce6ee!important;box-shadow:0 4px 16px rgba(29,60,82,.075)!important;overflow:visible!important;box-sizing:border-box!important}",
    ".ir-export-topnav-inner{display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;max-width:100%;position:relative}",
    ".ir-export-topnav a,.ir-export-topnav summary{text-decoration:none!important;font:700 12px/1.4 'Segoe UI',Arial,sans-serif!important}",
    ".ir-export-toplink,.ir-export-menu-trigger{display:flex!important;align-items:center!important;justify-content:center!important;gap:10px!important;min-height:41px!important;padding:10px 17px!important;border-radius:9px!important;border:1px solid #dae6ef!important;background:#f4f8fc!important;color:#315a76!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important}",
    ".ir-export-toplink:hover,.ir-export-menu-trigger:hover{color:#165d94!important;border-color:#a9d3ee!important;background:#eaf4fc!important}",
    ".ir-export-toplink.active{background:#246da7!important;color:#fff!important;border-color:#246da7!important;box-shadow:0 2px 8px rgba(29,105,170,.17)!important}",
    ".ir-export-toplink .nav-icon{display:grid;place-items:center;width:18px;height:18px;flex:0 0 18px;color:inherit!important}",
    ".ir-export-toplink .nav-icon svg{display:block;width:18px;height:18px;color:inherit!important}",
    ".ir-export-menu{position:relative;min-width:0}",
    ".ir-export-menu>summary{list-style:none!important}",
    ".ir-export-menu>summary::-webkit-details-marker{display:none!important}",
    ".ir-export-menu[open]>.ir-export-menu-trigger{background:#e9f4fc!important;border-color:#99c8eb!important;color:#176da3!important}",
    ".ir-export-menu-glyph,.ir-export-menu-caret{display:grid;place-items:center;flex:0 0 17px;width:17px;height:17px}",
    ".ir-export-menu-glyph svg,.ir-export-menu-caret svg{width:17px;height:17px;display:block}",
    ".ir-export-menu-caret svg{width:15px;height:15px;transition:transform .18s ease}",
    ".ir-export-menu[open] .ir-export-menu-caret svg{transform:rotate(180deg)}",
    ".ir-export-menu-items{position:absolute!important;left:50%!important;top:calc(100% + 9px)!important;transform:translateX(-50%)!important;z-index:120!important;display:flex!important;flex-direction:column!important;gap:3px!important;width:min(330px,calc(100vw - 32px))!important;max-height:min(70vh,540px)!important;overflow-y:auto!important;overflow-x:hidden!important;padding:9px!important;border:1px solid #d8e6f0!important;border-radius:11px!important;background:#fff!important;box-shadow:0 18px 36px rgba(18,52,78,.18)!important;box-sizing:border-box!important}",
    ".ir-export-menu-caption{padding:7px 10px 8px;color:#91a8b9;font:800 10px/1.2 'Segoe UI',Arial,sans-serif;letter-spacing:.8px}",
    ".ir-export-subnav-link{display:flex!important;align-items:center!important;gap:10px!important;min-height:37px!important;padding:9px 11px!important;border-radius:7px!important;color:#335973!important;background:transparent!important;white-space:normal!important;font-size:12px!important;font-weight:600!important;cursor:pointer!important}",
    ".ir-export-subnav-link:hover{background:#edf6fd!important;color:#176ba0!important}",
    ".ir-export-subnav-link .nav-icon{display:grid!important;place-items:center!important;flex:0 0 18px!important;width:18px!important;height:18px!important;color:#5289ae!important}",
    ".ir-export-subnav-link .nav-icon svg{display:block!important;width:18px!important;height:18px!important;color:inherit!important}",
    ".ir-export-subnav-link .nav-label{min-width:0!important;white-space:normal!important;overflow-wrap:anywhere!important;line-height:1.35!important;color:inherit!important}",
    ".ir-export-menu-empty{padding:13px 11px;color:#8197a8;font-size:12px}",
    ".ir-export-topnav :is(a,summary):focus-visible{outline:2px solid #2b7cc0!important;outline-offset:2px!important}",
    "body:has(.ir-export-group:target) .ir-export-topnav .ir-export-menu-trigger{background:#246da7!important;color:#fff!important;border-color:#246da7!important}",
    "body.ir-object-overview #app #overview,body.ir-object-overview #app .ir-export-group{scroll-margin-top:74px!important}",
    "@media(max-width:650px){.ir-export-topnav{padding:8px!important}.ir-export-topnav-inner{gap:6px}.ir-export-toplink,.ir-export-menu-trigger{padding:8px 10px!important;font-size:11px!important}.ir-export-menu-items{left:auto!important;right:0!important;transform:none!important}}",
    "@media print{.ir-export-topnav{position:relative!important;box-shadow:none!important;break-after:avoid}.ir-export-menu-items{position:static!important;transform:none!important;box-shadow:none!important;max-height:none!important}}",
    ".ir-export-group{scroll-margin-top:14px;min-width:0;width:100%;max-width:none;margin:0;padding:0}",
    ".ir-export-preview{margin:18px 0 0;min-width:0;width:100%;max-width:none;display:grid;gap:12px}",
    ".ir-export-preview>.ir-export-preview-layout{display:block!important;margin:0!important}",
    ".ir-export-preview .ir-export-preview-layout>.object-overview-reports,.ir-export-preview .ir-export-preview-layout>.object-overview-deliveries-wrap,.ir-export-preview .ir-export-preview-layout>.object-overview-dashboard,.ir-export-preview .ir-export-preview-layout>.object-overview-marks-wrap,.ir-export-preview .ir-export-preview-layout>.object-overview-admin-analysis{display:contents!important;margin:0!important}",
    ".ir-export-preview :is(.oor2-card,.ood-card,.ooa-card,.object-overview-schedule,.object-overview-marks-card){width:100%!important;margin:0!important;min-width:0!important}",
    ".ir-export-daily-list{display:grid;gap:10px}",
    ".ir-export-daily-card{border:1px solid #dce5ed;background:#fff;border-radius:11px;overflow:hidden;box-shadow:0 1px 5px rgba(27,60,87,.06)}",
    ".ir-export-daily-card>details>summary{list-style:none;cursor:pointer;display:block}",
    ".ir-export-daily-card>details>summary::-webkit-details-marker{display:none}",
    ".ir-export-daily-card>details[open]>summary{background:#f6faff;border-bottom:1px solid #e1eaf2}",
    ".ir-export-daily-card>details>summary:hover{background:#f1f8fe}",
    ".ir-export-daily-brief{display:flex;align-items:stretch;flex-wrap:wrap;gap:8px;padding:12px 14px}",
    // (the brief of a daily report in a narrow window — a grid, not a ragged wrap: the engineer, 09.11.2026 «при маленьком
    // разрешение кривит»; wide — one row, narrow — date and weather, people and equipment, the volume under them, the arrow top right)
    ".ir-export-daily-brief{display:grid!important;grid-template-columns:minmax(120px,1.1fr) minmax(130px,1.25fr) minmax(90px,.8fr) minmax(90px,.8fr) minmax(170px,2fr) 32px;align-items:center}.ir-export-daily-brief>.ir-export-daily-metric{flex:none}",
    "@media(max-width:860px){.ir-export-daily-brief{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 32px;gap:4px 8px;padding:10px 12px}.ir-export-daily-brief>.ir-export-daily-metric:nth-child(1){grid-area:1/1}.ir-export-daily-brief>.ir-export-daily-metric:nth-child(2){grid-area:1/2}.ir-export-daily-brief>.ir-export-daily-metric:nth-child(3){grid-area:2/1}.ir-export-daily-brief>.ir-export-daily-metric:nth-child(4){grid-area:2/2}.ir-export-daily-brief>.ir-export-daily-metric:nth-child(5){grid-area:3/1/4/3}.ir-export-daily-brief>.ir-export-daily-chevron{grid-area:1/3;align-self:start}}",
    ".ir-export-daily-metric{display:flex;align-items:center;gap:8px;flex:1 1 143px;min-width:0;padding:7px}",
    ".ir-export-daily-metric:last-of-type{flex:2 1 220px}",
    ".ir-export-daily-icon{width:29px;height:29px;flex:0 0 29px;display:grid;place-items:center;border-radius:8px;background:#eaf4fd;color:#4385b4}",
    ".ir-export-daily-icon svg{display:block;width:18px;height:18px}",
    ".ir-export-daily-metric>div{display:grid;gap:3px;min-width:0;overflow-wrap:anywhere}",
    ".ir-export-daily-metric small{font-size:10px;color:#8196a6}",
    ".ir-export-daily-metric b{font-size:12px;color:#21465e;font-weight:750;line-height:1.5}",
    ".ir-export-daily-metric em{font-style:normal;font-size:10px;color:#7b94a5}",
    ".ir-export-daily-chevron{align-self:center;flex:0 0 32px;display:grid;place-items:center;width:32px;height:32px;margin:0 2px;border:1px solid #d7e6f3;border-radius:9px;background:#eef6fd;color:#3779ab;transition:background-color .2s,border-color .2s,color .2s}",
    ".ir-export-daily-chevron svg{display:block;width:18px;height:18px;transition:transform .2s ease;pointer-events:none}",
    ".ir-export-daily-card>details[open] .ir-export-daily-chevron{background:#deeffe;border-color:#bddbf3;color:#176fac}",
    ".ir-export-daily-card>details[open] .ir-export-daily-chevron svg{transform:rotate(180deg)}",
    ".ir-export-daily-card>details>summary:hover .ir-export-daily-chevron{background:#dbeefa;border-color:#a8d2f0;color:#1367a3}",
    ".ir-export-daily-card>details>summary:focus-visible{outline:2px solid #448ac9;outline-offset:-3px;border-radius:9px}",
    ".ir-export-daily-full{display:grid;gap:12px;padding:15px;background:#fbfdff}",
    ".ir-export-daily-full>section,.ir-export-daily-columns>section{min-width:0;padding:12px;background:#fff;border:1px solid #e2eaf0;border-radius:9px}",
    ".ir-export-daily-full h3{font-size:13px;color:#23455c;margin:0 0 12px;font-weight:800}",
    ".ir-export-daily-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
    ".ir-export-daily-chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".ir-export-daily-chip{display:grid;gap:3px;padding:8px 10px;min-width:100px;background:#f4f8fc;border:1px solid #e6edf3;border-radius:8px}",
    ".ir-export-daily-chip small{font-size:10px;color:#8296a5}.ir-export-daily-chip b{font-size:12px;color:#28506b}",
    ".ir-export-daily-table{overflow-x:auto}",
    ".ir-export-daily-table table{width:100%;border-collapse:collapse;font-size:11px}",
    ".ir-export-daily-table th{background:#eff6fc;font-weight:700;color:#63839a;text-align:left}",
    ".ir-export-daily-table th,.ir-export-daily-table td{padding:9px 8px;border-bottom:1px solid #e7eef3;vertical-align:top}",
    ".ir-export-daily-table td{color:#2e4e63}.ir-export-daily-table td b{color:#1f4962}",
    ".ir-export-daily-photos{display:flex;flex-wrap:wrap;gap:9px}",
    ".ir-export-daily-photos figure{margin:0;width:175px}",
    ".ir-export-daily-photos img{display:block;width:175px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #dce6ef}",
    ".ir-export-daily-photos figcaption{font-size:10px;color:#7c94a5;padding-top:4px}",
    ".ir-export-muted{font-size:12px;color:#7f93a4;margin:0}",
    "@media(max-width:1000px){.ir-export-preview{margin:12px 0 0}.ir-export-daily-columns{grid-template-columns:1fr}}",
    ".ir-export-more{border:1px solid #d3e4f0;border-radius:10px;background:#f5faff;overflow:hidden;min-width:0}",
    ".ir-export-more>summary{display:flex;align-items:center;justify-content:center;gap:11px;min-height:46px;padding:10px 16px;cursor:pointer;color:#256c9e;list-style:none;font-size:12px;font-weight:750;text-align:center}",
    ".ir-export-more>summary::-webkit-details-marker{display:none}",
    ".ir-export-more>summary:hover{background:#e8f4fc}",
    ".ir-export-more>summary:focus-visible{outline:2px solid #397db8;outline-offset:-3px}",
    ".ir-export-more-icon{display:grid;place-items:center;width:25px;height:25px;background:#e0eef9;border-radius:7px}",
    ".ir-export-more-icon svg{width:16px;height:16px;transition:transform .2s ease}",
    ".ir-export-more[open] .ir-export-more-icon svg{transform:rotate(180deg)}",
    ".ir-export-more-hide{display:none}.ir-export-more[open] .ir-export-more-show{display:none}.ir-export-more[open] .ir-export-more-hide{display:inline}",
    ".ir-export-more-items{display:grid;gap:10px;padding:11px 12px 13px;border-top:1px solid #dceaf3;background:#fff}",
    ".ir-export-marks-summary{border:1px solid #dce6ee;border-radius:11px;overflow:hidden;background:#fff;box-shadow:0 2px 9px rgba(22,59,87,.05)}",
    ".ir-export-marks-title{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid #e8eef3}",
    ".ir-export-marks-title h3{margin:0 0 5px;font-size:15px;line-height:1.4;color:#1b425c;font-weight:800}",
    ".ir-export-marks-title p{margin:0;font-size:11px;color:#8196a5}",
    ".ir-export-marks-title>b{font-size:21px;color:#1f7eaf;background:#eff8fc;border-radius:9px;padding:8px 11px}",
    ".ir-export-marks-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px 15px;background:#f7fbff}",
    ".ir-export-marks-stats>div{min-width:0;display:grid;gap:5px;padding:11px 12px;background:#fff;border:1px solid #e4ecf3;border-radius:8px}",
    ".ir-export-marks-stats small{font-size:10px;color:#839bad}.ir-export-marks-stats b{font-size:15px;color:#25485f}",
    ".ir-export-mark-switcher{position:relative;padding:12px 15px 15px}",
    ".ir-export-mark-radio{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}",
    ".ir-export-mark-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:13px;padding:3px;background:#f0f5f9;border:1px solid #e2ebf2;border-radius:9px;width:max-content;max-width:100%}",
    ".ir-export-mark-tabs label{display:flex;align-items:center;gap:7px;cursor:pointer;padding:8px 12px;border-radius:7px;font-size:11px;font-weight:700;color:#58788e;transition:background-color .15s,color .15s}",
    ".ir-export-mark-tabs label span{font-size:10px;padding:2px 6px;background:rgba(118,152,175,.13);border-radius:5px}",
    ".ir-export-mark-tabs label:hover{color:#216991;background:#e2eff9}",
    ".ir-export-mark-radio--all:checked ~ .ir-export-mark-tabs label[for='ir-export-marks-all'],.ir-export-mark-radio--mounted:checked ~ .ir-export-mark-tabs label[for='ir-export-marks-mounted'],.ir-export-mark-radio--remaining:checked ~ .ir-export-mark-tabs label[for='ir-export-marks-remaining']{color:#fff;background:#236da6;box-shadow:0 2px 5px rgba(38,101,158,.17)}",
    ".ir-export-mark-radio:focus-visible ~ .ir-export-mark-tabs{outline:2px solid #4f95c9;outline-offset:2px}",
    ".ir-export-mark-panel{display:none!important;min-width:0}",
    ".ir-export-mark-radio--all:checked ~ .ir-export-mark-panel--all,.ir-export-mark-radio--mounted:checked ~ .ir-export-mark-panel--mounted,.ir-export-mark-radio--remaining:checked ~ .ir-export-mark-panel--remaining{display:block!important}",
    ".ir-export-mark-head,.ir-export-mark-row{display:grid;grid-template-columns:minmax(135px,1.55fr) minmax(95px,.85fr) minmax(80px,.65fr) minmax(130px,1.4fr) minmax(100px,.9fr) minmax(100px,.9fr);align-items:center;gap:12px}",
    ".ir-export-mark-head{padding:10px 13px;background:#edf5fb;border:1px solid #e2edf5;border-radius:8px 8px 0 0;font-size:10px;font-weight:800;color:#698599}",
    ".ir-export-mark-rows{display:grid;gap:0}",
    ".ir-export-mark-row{padding:12px 13px;border-bottom:1px solid #e8eef4;font-size:11px;background:#fff;min-height:65px}",
    ".ir-export-mark-row:nth-child(even){background:#fbfdff}",
    ".ir-export-mark-row:hover{background:#f1f8ff}",
    ".ir-export-mark-name{display:grid;gap:4px;min-width:0}.ir-export-mark-name b{color:#21465e;font-size:12px;overflow-wrap:anywhere}.ir-export-mark-name small{color:#8da1b0;font-size:10px}",
    ".ir-export-mark-code{color:#617d90;overflow-wrap:anywhere}",
    ".ir-export-mark-count{display:grid;gap:3px}.ir-export-mark-count b{font-size:13px;color:#264b68}.ir-export-mark-count small{font-size:10px;color:#8da1b0}",
    ".ir-export-mark-progress{min-width:0;display:grid;gap:6px}",
    ".ir-export-mark-track{height:9px;background:#e6edf4;border-radius:20px;overflow:hidden}",
    ".ir-export-mark-track i{display:block;height:100%;background:linear-gradient(90deg,#32b59b,#219e78);border-radius:20px}",
    ".ir-export-mark-progress small{font-size:10px;color:#6a8999}",
    ".ir-export-mark-fact,.ir-export-mark-left{display:grid;gap:4px}",
    ".ir-export-mark-fact b,.ir-export-mark-left b{font-size:12px;color:#23835f}.ir-export-mark-left b{color:#d17a44}",
    ".ir-export-mark-fact small,.ir-export-mark-left small{font-size:10px;color:#8399a8}",
    ".ir-export-mark-rows>.ir-export-more{margin:11px 5px 0}",
    ".ir-export-mark-rows .ir-export-more-items{gap:0;padding:0}",
    ".ir-export-mark-rows .ir-export-more-items>.ir-export-mark-row:last-child{border-bottom:0}",
    ".ir-export-mark-cards{display:grid;gap:8px;padding:12px;background:#fff}",
    ".ir-export-mark-card{border:1px solid #dae6ef;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 1px 4px rgba(20,50,70,.035)}",
    ".ir-export-mark-card>details>summary{list-style:none;cursor:pointer}",
    ".ir-export-mark-card>details>summary::-webkit-details-marker{display:none}",
    ".ir-export-mark-brief{display:flex;align-items:center;gap:11px;min-height:66px;padding:11px 14px;background:#fff;transition:background-color .15s}",
    ".ir-export-mark-brief:hover{background:#f3f9ff}",
    ".ir-export-mark-card>details[open]>summary{background:#f1f8fe;border-bottom:1px solid #dce9f4}",
    ".ir-export-mark-card>details>summary:focus-visible{outline:2px solid #478ac3;outline-offset:-3px;border-radius:8px}",
    ".ir-export-mark-num{flex:0 0 24px;text-align:center;color:#97acba;font-size:10px}",
    ".ir-export-mark-main{display:grid;gap:4px;min-width:120px;flex:1 1 240px}",
    ".ir-export-mark-main b{font-weight:800;font-size:13px;color:#214b67;overflow-wrap:anywhere}",
    ".ir-export-mark-main small{font-size:11px;color:#718fa3;overflow-wrap:anywhere;line-height:1.4}",
    ".ir-export-mark-brief-code{flex:0 1 130px;min-width:78px;padding:6px 8px;background:#f0f5fa;border-radius:6px;color:#66849a;font-size:10px;text-align:center;overflow-wrap:anywhere}",
    ".ir-export-mark-brief-qty{flex:0 0 88px;font-size:12px;font-weight:800;color:#234f6a;text-align:center}",
    ".ir-export-mark-brief-qty small{font-weight:600;color:#89a1b1}",
    ".ir-export-mark-badge{flex:0 1 130px;min-width:110px;padding:7px 9px;border-radius:7px;text-align:center;font-size:10px;font-weight:750}",
    ".ir-export-mark-badge.status-done{background:#e2f7eb;color:#16844f}",
    ".ir-export-mark-badge.status-partial{background:#fff4dd;color:#a36c1c}",
    ".ir-export-mark-badge.status-left{background:#fff0ed;color:#b65c47}",
    ".ir-export-mark-card>details[open] .ir-export-daily-chevron{background:#deeffe;border-color:#bddbf3;color:#176fac}",
    ".ir-export-mark-card>details[open] .ir-export-daily-chevron svg{transform:rotate(180deg)}",
    ".ir-export-mark-card>details>summary:hover .ir-export-daily-chevron{background:#dbeefa;border-color:#a8d2f0;color:#1367a3}",
    ".ir-export-mark-detail{display:grid;gap:13px;padding:16px;background:#fcfeff}",
    ".ir-export-mark-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}",
    ".ir-export-mark-stat{display:grid;gap:5px;min-width:0;padding:12px 13px;background:#fff;border:1px solid #e1ebf2;border-radius:9px}",
    ".ir-export-mark-stat small{font-size:10px;color:#8298a8}",
    ".ir-export-mark-stat b{font-size:17px;color:#284f69;font-weight:800}",
    ".ir-export-mark-stat span{font-size:10px;color:#8fa3b0}",
    ".ir-export-mark-stat.good b{color:#21815c}.ir-export-mark-stat.pending b{color:#b98041}",
    ".ir-export-mark-detail-bar .ir-export-mark-track{height:11px}",
    ".ir-export-mark-specs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:14px;background:#f4f9fd;border:1px solid #e6eff5;border-radius:9px}",
    ".ir-export-mark-specs>div{display:grid;gap:5px;min-width:0}",
    ".ir-export-mark-specs small{font-size:10px;color:#859bab}",
    ".ir-export-mark-specs b{font-size:12px;color:#31556d;font-weight:650;overflow-wrap:anywhere}",
    ".ir-export-mark-cards>.ir-export-more{margin-top:4px}",
    "@media(max-width:1100px){.ir-export-mark-brief{flex-wrap:wrap}.ir-export-mark-main{flex:1 1 200px}.ir-export-mark-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ir-export-mark-specs{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    "@media(max-width:700px){.ir-export-mark-badge{min-width:95px}.ir-export-mark-brief-code{flex:1 1 110px}.ir-export-mark-specs{grid-template-columns:1fr}}",
    "@media print{.ir-export-mark-card{break-inside:avoid}.ir-export-mark-detail{display:grid!important}}",
    ".ir-export-work-filter{margin-top:17px;border:1px solid #dce6ee;border-radius:11px;background:#fff;overflow:hidden;position:relative}",
    ".ir-export-work-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 9px}",
    ".ir-export-work-head h3{font-size:17px;margin:0;color:#1d455e}",
    ".ir-export-work-head span{font-size:11px;color:#6b899e;background:#edf5fa;border-radius:7px;padding:7px 10px;white-space:nowrap}",
    ".ir-export-work-hint{margin:0;padding:0 18px 10px;font-size:11px;color:#7e96a7}",
    ".ir-export-work-radio{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden;white-space:nowrap}",
    ".ir-export-work-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:3px;margin:4px 15px 14px;background:#f2f6fa;border:1px solid #e2ebf2;border-radius:9px}",
    ".ir-export-work-tabs label{display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:7px;cursor:pointer;color:#5b7c93;font-size:11px;font-weight:700;line-height:1.35;max-width:100%;overflow-wrap:anywhere}",
    ".ir-export-work-tabs label:hover{background:#e4f0f9;color:#2675a9}",
    ".ir-export-work-tabs label span{font-size:10px;border-radius:5px;padding:2px 6px;background:rgba(118,151,173,.13)}",
    ".ir-export-work-radio-all:checked ~ .ir-export-work-tabs label[for='ir-export-work-all']{background:#236da6;color:#fff}",
    ".ir-export-work-radio:focus-visible ~ .ir-export-work-tabs{outline:2px solid #4589c5;outline-offset:2px}",
    ".ir-export-work-panel{display:none!important}.ir-export-work-radio-all:checked ~ .ir-export-work-panels > .ir-export-work-panel-all{display:block!important}",
    ".ir-export-work-panel>.ir-export-mark-cards{padding-top:0}",
    ".ir-export-mark-full{margin-top:7px;background:#f4f9fe;border:1px solid #d5e7f4;border-radius:9px;overflow:hidden}",
    ".ir-export-mark-full>summary{display:flex;align-items:center;justify-content:center;gap:11px;min-height:47px;padding:11px 13px;cursor:pointer;list-style:none;font-size:12px;font-weight:750;color:#286d9f}",
    ".ir-export-mark-full>summary::-webkit-details-marker{display:none}",
    ".ir-export-mark-full>summary:hover{background:#eaf5fc}",
    ".ir-export-mark-full>summary:focus-visible{outline:2px solid #438ac3;outline-offset:-3px}",
    ".ir-export-mark-full>summary .ir-export-more-icon svg{transition:transform .2s ease}",
    ".ir-export-mark-full[open]>summary .ir-export-more-icon svg{transform:rotate(180deg)}",
    ".ir-export-mark-full>summary .ir-export-more-hide{display:none}.ir-export-mark-full[open]>summary .ir-export-more-hide{display:inline}.ir-export-mark-full[open]>summary .ir-export-more-show{display:none}",
    ".ir-export-mark-full>.ir-export-more-items{display:grid;gap:8px;padding:12px;background:#fff}",
    "@media print{.ir-export-work-tabs{display:none!important}.ir-export-work-panel-all{display:block!important}.ir-export-work-panel:not(.ir-export-work-panel-all){display:none!important}.ir-export-mark-full>.ir-export-more-items{display:grid!important}}",
    ".ir-export-status-radio{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}",
    ".ir-export-status-tabs{display:flex;flex-wrap:wrap;gap:7px;padding:0 16px 12px}",
    ".ir-export-status-tabs label{padding:8px 12px;border:1px solid #dce8f0;border-radius:7px;background:#f5f9fc;color:#547792;font-size:11px;font-weight:750;cursor:pointer}",
    ".ir-export-status-tabs label:hover{background:#e4f3fc}",
    ".ir-export-status-all:checked ~ .ir-export-status-tabs label[for='ir-export-status-all'],.ir-export-status-mounted:checked ~ .ir-export-status-tabs label[for='ir-export-status-mounted'],.ir-export-status-remaining:checked ~ .ir-export-status-tabs label[for='ir-export-status-remaining']{color:#fff;background:#236da6;border-color:#236da6}",
    ".ir-export-status-radio:focus-visible ~ .ir-export-status-tabs{outline:2px solid #408ac7;outline-offset:-2px}",
    ".ir-export-mark-cardlist{display:grid;gap:8px;min-width:0}",
    ".ir-export-mark-show-check{position:absolute;width:1px;height:1px;clip-path:inset(50%);overflow:hidden}",
    ".ir-export-mark-cardlist>.ir-export-mark-card{display:none!important}",
    ".ir-export-work-filter:has(.ir-export-status-all:checked) .ir-export-mark-cardlist>.ir-export-mark-card:nth-child(-n+5){display:block!important}",
    ".ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-mark-cardlist>.ir-export-mark-card:nth-child(-n+5 of .status-done,.status-partial){display:block!important}",
    ".ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-mark-cardlist>.ir-export-mark-card:nth-child(-n+5 of .status-left,.status-partial){display:block!important}",
    ".ir-export-work-filter:has(.ir-export-status-all:checked) .ir-export-mark-cards:has(.ir-export-mark-show-check:checked) .ir-export-mark-cardlist>.ir-export-mark-card{display:block!important}",
    ".ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-mark-cards:has(.ir-export-mark-show-check:checked) .ir-export-mark-cardlist>.status-done,.ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-mark-cards:has(.ir-export-mark-show-check:checked) .ir-export-mark-cardlist>.status-partial{display:block!important}",
    ".ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-mark-cards:has(.ir-export-mark-show-check:checked) .ir-export-mark-cardlist>.status-left,.ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-mark-cards:has(.ir-export-mark-show-check:checked) .ir-export-mark-cardlist>.status-partial{display:block!important}",
    ".ir-export-mark-showmore{display:flex;align-items:center;justify-content:center;gap:10px;min-height:45px;padding:10px;border:1px solid #d6e7f3;border-radius:9px;background:#f2f9fd;color:#2a709f;font-size:12px;font-weight:750;cursor:pointer}",
    ".ir-export-mark-showmore:hover{background:#e7f4fc}",
    ".ir-export-mark-cards .ir-export-mark-show-check:checked ~ .ir-export-mark-showmore .ir-export-more-show{display:none}",
    ".ir-export-mark-cards .ir-export-mark-show-check:checked ~ .ir-export-mark-showmore .ir-export-more-hide{display:inline}",
    ".ir-export-mark-cards .ir-export-mark-show-check:checked ~ .ir-export-mark-showmore svg{transform:rotate(180deg)}",
    ".ir-export-mark-show-check:focus-visible ~ .ir-export-mark-showmore{outline:2px solid #387eb6}",
    ".ir-export-count-mounted,.ir-export-count-remaining{display:none}",
    ".ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-count-all,.ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-count-all{display:none}",
    ".ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-count-mounted{display:inline}",
    ".ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-count-remaining{display:inline}",
    ".ir-export-work-filter:has(.ir-export-status-mounted:checked) .ir-export-mark-cards:not(:has(.ir-export-mark-cardlist>.status-done,.ir-export-mark-cardlist>.status-partial))::after{content:'По выбранному фильтру нет смонтированных марок';color:#8196a5;text-align:center;padding:12px;font-size:12px}",
    ".ir-export-work-filter:has(.ir-export-status-remaining:checked) .ir-export-mark-cards:not(:has(.ir-export-mark-cardlist>.status-left,.ir-export-mark-cardlist>.status-partial))::after{content:'По выбранному фильтру нет оставшихся марок';color:#8196a5;text-align:center;padding:12px;font-size:12px}",
    "@media print{.ir-export-status-tabs{display:none!important}.ir-export-mark-cardlist>.ir-export-mark-card{display:block!important}.ir-export-mark-showmore{display:none!important}}",
    ".ir-export-mark-raw{margin-top:14px;border:1px solid #e2eaf2;border-radius:9px;background:#f8fbfe;overflow:hidden}",
    ".ir-export-mark-raw>summary{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;cursor:pointer;list-style:none;font-weight:750;font-size:12px;color:#37779f}",
    ".ir-export-mark-raw>summary::-webkit-details-marker{display:none}",
    ".ir-export-mark-raw>summary:before{content:'';width:8px;height:8px;border-right:2px solid #3a83b3;border-bottom:2px solid #3a83b3;transform:rotate(45deg);transition:transform .2s ease}",
    ".ir-export-mark-raw[open]>summary:before{transform:rotate(225deg)}",
    ".ir-export-mark-raw>.ir-export-records{padding:12px;gap:8px;background:#fff}",
    "@media(max-width:1200px){.ir-export-mark-head,.ir-export-mark-row{grid-template-columns:minmax(110px,1.3fr) minmax(70px,.8fr) minmax(70px,.6fr) minmax(105px,1fr) minmax(90px,.8fr) minmax(90px,.8fr);gap:8px}.ir-export-marks-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    "@media(max-width:850px){.ir-export-marks-stats{grid-template-columns:1fr 1fr}.ir-export-mark-row{font-size:10px;padding:10px 8px}.ir-export-mark-head{padding:10px 8px;font-size:9px}}",
    "@media print{.ir-export-mark-tabs{display:none!important}.ir-export-mark-panel--all{display:block!important}.ir-export-mark-raw{break-inside:avoid}.ir-export-more-items{display:grid!important}.ir-export-more-show{display:none!important}}",
    ".ir-export-section{box-sizing:border-box;width:100%;max-width:none;padding:18px;margin:18px 0;border:1px solid #dce5ed;border-radius:13px;background:#fff;scroll-margin-top:14px;color:#21435b}",
    ".ir-export-section-head{display:flex;justify-content:space-between;align-items:center;gap:14px;border-bottom:1px solid #e4edf3;padding:0 0 15px;margin-bottom:12px}",
    ".ir-export-section-head small{font-size:11px;color:#7d92a3}.ir-export-section-head h2{font:750 20px/1.4 'Segoe UI',sans-serif;margin:4px 0 0}",
    ".ir-export-count{white-space:nowrap;font-size:12px;color:#63849c;background:#f2f7fb;border-radius:8px;padding:8px 12px}",
    ".ir-export-records{display:grid;gap:8px}.ir-export-record{border:1px solid #e3ebf1;border-radius:9px;background:#fbfdff;overflow:hidden}",
    ".ir-export-record>details>summary{display:flex;align-items:center;gap:12px;min-height:45px;padding:10px 13px;cursor:pointer;list-style:none}",
    ".ir-export-record>details>summary::-webkit-details-marker{display:none}.ir-export-record>details>summary:after{content:'';display:block;flex:0 0 8px;width:8px;height:8px;border-right:2px solid #6087a3;border-bottom:2px solid #6087a3;transform:rotate(45deg);margin:0 8px 4px auto;transition:transform .2s ease}",
    ".ir-export-record>details[open]>summary:after{transform:rotate(225deg);margin-top:5px;margin-bottom:0}",
    ".ir-export-record>details[open]>summary{border-bottom:1px solid #e2eaf0;background:#eff7fd}.ir-export-row-no{flex:0 0 24px;color:#91a7b6;text-align:right;font-size:11px}",
    ".ir-export-row-title{min-width:150px;flex:1;font-size:12px;font-weight:700;overflow-wrap:anywhere}.ir-export-row-meta{display:flex;flex-wrap:wrap;gap:5px}",
    ".ir-export-row-meta small{font-size:10px;color:#53839f;background:#edf5fa;border-radius:5px;padding:3px 6px}",
    ".ir-export-details{padding:4px 14px 12px}.ir-export-detail{display:grid;grid-template-columns:minmax(130px,23%) minmax(0,1fr);gap:16px;padding:9px 0;border-bottom:1px solid #edf1f4;font-size:12px}",
    ".ir-export-detail:last-child{border:0}.ir-export-detail>b{color:#627f92}.ir-export-detail>div{min-width:0;overflow-wrap:anywhere}",
    ".ir-export-detail pre{margin:8px 0;white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f6f9;border-radius:7px;padding:10px;font-size:11px}",
    ".ir-export-detail details>summary{cursor:pointer;color:#3976a5;list-style:none;display:flex;align-items:center;gap:9px}.ir-export-detail details>summary::-webkit-details-marker{display:none}",
    ".ir-export-detail details>summary:before{content:'';display:block;width:7px;height:7px;border-right:2px solid #4386b4;border-bottom:2px solid #4386b4;transform:rotate(-45deg);transition:transform .2s ease}",
    ".ir-export-detail details[open]>summary:before{transform:rotate(45deg)}.ir-export-photo{max-width:210px;max-height:150px;object-fit:contain;border-radius:7px;margin:4px 6px 4px 0}",
    ".ir-export-field-media{display:grid;gap:4px}.ir-export-field-media small{color:#8298a8;overflow-wrap:anywhere}.ir-export-empty{color:#99a9b5}",
    ".ir-export-empty-card{padding:20px;text-align:center;color:#8195a6;font-size:12px}",
    "body.ir-object-overview #app button,body.ir-object-overview #app .object-hero-actions{display:none!important}",
    "body.ir-object-overview #app .ir-export-section{display:block!important}",
    "@media(max-width:1000px){.ir-export-section{margin:12px 0!important}.ir-export-row-meta{display:none}}",
    "/* Full-width, continuous archive layout: the large outer section cards are removed. */",
    "body.ir-object-route.ir-object-overview{background:#eef3f8!important}",
    "body.ir-object-route.ir-object-overview #app{background:#fff!important;box-shadow:0 3px 28px rgba(26,60,86,.09)!important}",
    "body.ir-object-route.ir-object-overview #app>.object-overview-hero{width:100%!important;max-width:100%!important;box-sizing:border-box!important}",
    "body.ir-object-overview #app .ir-object-overview-layout{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:19px 20px 20px!important;gap:0!important;background:#fff!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-object-overview-left{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:0!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important}",
    "body.ir-object-overview #app .ir-object-overview-sidehead{width:100%!important;max-width:none!important;margin:0 0 13px!important;padding:0 0 14px!important;min-height:0!important;border:0!important;border-bottom:1px solid #e2eaf0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-object-overview-left>.object-overview-top-stats{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;gap:12px!important}",
    "body.ir-object-overview #app .ir-export-group{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:#fff!important;border:0!important;border-top:1px solid #edf1f4!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-export-preview{box-sizing:border-box!important;width:100%!important;max-width:none!important;margin:0!important;padding:18px 20px 0!important;gap:10px!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-export-section{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:22px 20px 25px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:#21435b!important}",
    "body.ir-object-overview #app .ir-export-section-head{box-sizing:border-box!important;min-height:0!important;margin:0 0 14px!important;padding:0 0 14px!important;border-bottom:1px solid #e2eaf0!important;border-radius:0!important}",
    "body.ir-object-overview #app .ir-export-section-head h2{margin:0!important}",
    "body.ir-object-overview #app > footer.ir-export-section{border-top:1px solid #e3eaf0!important;padding-top:16px!important;padding-bottom:18px!important;font-size:11px!important;color:#7990a0!important}",
    "@media(max-width:760px){body.ir-object-overview #app .ir-object-overview-layout{padding:14px 12px 16px!important}body.ir-object-overview #app .ir-export-preview{padding:12px 12px 0!important}body.ir-object-overview #app .ir-export-section{padding:18px 12px 20px!important}}",
    "@media print{body.ir-object-overview #app .ir-export-group{border-top:0!important}body.ir-object-overview #app .ir-export-section{padding:12px 0!important}body.ir-object-overview #app .ir-object-overview-layout{padding:10px 0!important}}",
    ".ir-export-gantt-filter{position:relative;display:block;width:100%;min-width:0}",
    ".ir-export-gantt-radio{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}",
    ".ir-export-gantt-options{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:12px 15px;background:#f6fafe;border-bottom:1px solid #dce9f2}",
    ".ir-export-gantt-options label{display:inline-flex;align-items:center;gap:7px;cursor:pointer;border:1px solid #d9e6f0;border-radius:7px;padding:8px 11px;color:#426b88;background:#fff;font-size:11px;font-weight:750;max-width:100%;overflow-wrap:anywhere}",
    ".ir-export-gantt-options label:hover{background:#e6f3fc}",
    ".ir-export-gantt-options small{font-size:10px;color:inherit;opacity:.72}",
    ".ir-export-gantt-all:checked ~ .ir-export-gantt-options label[for='ir-export-gantt-all']{background:#236da6!important;color:#fff!important;border-color:#236da6!important}",
    ".ir-export-gantt-radio:focus-visible ~ .ir-export-gantt-options{outline:2px solid #397eae;outline-offset:-2px}",
    ".ir-export-marks-unified{overflow:hidden;border:1px solid #dce6ee;border-radius:11px;background:#fff;box-shadow:0 1px 4px rgba(20,50,76,.04)}",
    ".ir-export-marks-unified>.ir-export-marks-summary{margin:0!important;border:0!important;border-bottom:1px solid #dfe9f0!important;border-radius:0!important;box-shadow:none!important}",
    ".ir-export-marks-unified>.ir-export-work-filter{margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    ".ir-export-marks-unified>.ir-export-work-filter>.ir-export-work-head{padding-top:17px!important}",
    ".ir-export-deliveries-unified>.ir-export-preview{margin:0!important;padding:0!important;display:block!important}",
    ".ir-export-deliveries-unified>.ir-export-preview :is(.ood-card,.ood-comparison){border:0!important;border-radius:0!important;box-shadow:none!important}",
    ".ir-export-deliveries-unified{overflow:visible;border-radius:0}",
    ".ir-export-deliveries-unified .ood-comparison .ood-head h2{display:none!important}",


    ".ir-export-daily-additional{box-sizing:border-box;width:100%;margin:16px 0 0;padding:15px 0 0;border-top:1px solid #dce7ef}",
    "body.ir-object-overview #app .ir-export-daily-additional h3{margin:0 0 12px!important;color:#214b66!important;font:800 14px/1.35 'Segoe UI',Arial,sans-serif!important}",
    ".ir-export-work-mark-name{display:block;margin-top:3px;font-size:10px;font-weight:400;color:#8294a3}",
    ".ir-export-delivery-register{padding-top:16px!important}",
    ".ir-export-delivery-register>h3{padding-top:12px!important}",
    ".ir-export-trend{margin:18px 0 10px!important}",
    ".ir-export-trend-panel[hidden]{display:none!important}",
    ".ir-export-wt{width:100%;min-width:0}",
    ".ir-export-wt-radio{position:absolute;width:1px;height:1px;opacity:0}",
    ".ir-export-wt-tabs{display:inline-flex;gap:4px;padding:4px;margin:0 0 14px;border-radius:9px;background:#eef3f6;border:1px solid #dce5eb;max-width:100%}",
    ".ir-export-wt-tabs label{display:flex;align-items:center;gap:9px;cursor:pointer;padding:9px 13px;border-radius:6px;font-size:11px;color:#607482;font-weight:750}",
    ".ir-export-wt-tabs label span{border-radius:99px;background:#dfe7ec;color:#6d7e89;padding:3px 7px;font-size:10px}",
    ".ir-export-wt #ir-export-wt-main:checked~.ir-export-wt-tabs label[for=ir-export-wt-main],.ir-export-wt #ir-export-wt-other:checked~.ir-export-wt-tabs label[for=ir-export-wt-other]{background:#fff;color:#1769e0;box-shadow:0 1px 4px #21415b1a}",
    ".ir-export-wt-other{display:none!important}",
    ".ir-export-wt #ir-export-wt-other:checked~.ir-export-wt-main{display:none!important}",
    ".ir-export-wt #ir-export-wt-other:checked~.ir-export-wt-other{display:block!important}",
    ".ir-export-wt-list{border:1px solid #dce5eb;border-radius:10px;overflow:hidden;background:#fff}",
    ".ir-export-wt-head,.ir-export-wt-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) 70px minmax(0,1.25fr) minmax(0,1.4fr);align-items:center;gap:12px;padding:10px 15px}",
    ".ir-export-wt-head{background:#f3f6f8;color:#718392;font-size:10px;font-weight:700}",
    ".ir-export-wt-row{min-height:65px;border-top:1px solid #e7edf1;font-size:11px}",
    ".ir-export-wt-row:hover{background:#f9fbfc}",
    ".ir-export-wt-row>div{min-width:0}",
    ".ir-export-wt-row b{display:block;font-size:11px;color:#263b4a;overflow-wrap:anywhere}",
    ".ir-export-wt-row small{display:block;font-size:9px;font-weight:400;color:#8897a3;margin-top:4px}",
    ".ir-export-wt-row>div>small:first-child{display:none}",
    ".ir-export-wt-ready{display:flex;align-items:center;gap:9px}",
    ".ir-export-wt-track{flex:1 1 auto;display:block;height:7px;border-radius:99px;background:#e8edf2;overflow:hidden}",
    ".ir-export-wt-track em{display:block;height:100%;border-radius:99px;background:#38a574}",
    ".ir-export-wt-empty{padding:25px;text-align:center;color:#8799a7;font-size:12px}",
    "@media(max-width:640px){.ir-export-wt-tabs{display:grid;grid-template-columns:1fr 1fr;width:100%}.ir-export-wt-tabs label{justify-content:center;font-size:10px;padding:8px}.ir-export-wt-head{display:none}.ir-export-wt-row{grid-template-columns:1fr 1fr;gap:12px}.ir-export-wt-row>div>small:first-child{display:block}.ir-export-wt-ready{align-items:flex-start;flex-direction:column}}",
    ".ir-export-delivery-register{border-top:1px solid #e1eaf2;background:#fff}",
    ".ir-export-delivery-register>h3{margin:0;padding:18px 17px 14px;font-size:14px;color:#234a63;font-weight:800}",
    ".ir-export-delivery-register>.ir-export-invoice-list{margin:0;padding:0 13px 12px}",
    ".ir-export-daily-photo-link{display:block;cursor:zoom-in;border-radius:8px;overflow:hidden}",
    ".ir-export-daily-photo-link:focus-visible{outline:2px solid #3985c2;outline-offset:3px}",
    ".ir-export-daily-photo-link:hover img{filter:brightness(.92);transform:scale(1.015)}",
    ".ir-export-daily-photo-link img{transition:transform .16s ease,filter .16s ease}",
    ".ir-export-companies{position:relative!important;margin:15px 20px!important;padding:22px!important;background:radial-gradient(circle at 95% 0,rgba(92,151,248,.2),transparent 35%),linear-gradient(130deg,#f9fbff,#eef5ff)!important;border:1px solid #dce8f8!important;border-radius:23px!important;box-shadow:0 12px 30px rgba(40,86,146,.08)!important;overflow:visible!important}",
    ".ir-export-companies-heading{min-height:0!important;display:flex!important;gap:12px!important;align-items:center!important;padding:0 0 20px!important;background:transparent!important;border:0!important;text-transform:none!important}.ir-export-companies-heading:before{display:none!important}.ir-export-companies-heading>span:last-child{display:grid!important;gap:4px!important}.ir-export-companies-heading b{font-size:22px!important;color:#14284b!important}.ir-export-companies-heading small{color:#8b9ab2!important;font-size:11px!important}",
    ".ir-export-companies-glyph{width:45px!important;height:45px!important;display:grid!important;place-items:center!important;border-radius:12px!important;color:#fff!important;background:linear-gradient(145deg,#78a6ee,#4074d1)!important}.ir-export-companies-glyph svg{width:26px!important;height:26px!important}",
    ".ir-export-companies-grid{gap:17px!important;overflow:visible!important}.ir-export-company-card{position:relative!important;gap:12px!important;padding:16px 13px!important;border:1px solid #e3ecf8!important;border-radius:17px!important;background:#fff!important;box-shadow:0 8px 16px rgba(28,72,122,.045)!important}",
    ".ir-export-company-card:not(:last-child):after{content:'➜'!important;position:absolute!important;right:-25px!important;top:46%!important;z-index:2!important;display:grid!important;place-items:center!important;width:31px!important;height:31px!important;border-radius:50%!important;background:#fff!important;border:1px solid #dce8f7!important;color:#5584c6!important;font-size:20px!important}",
    ".ir-export-company-role{align-self:stretch!important;display:flex!important;align-items:center!important;gap:8px!important;color:#b85c21!important;text-align:left!important;font-size:11px!important}.ir-export-company-role-icon{width:34px!important;height:34px!important;flex:0 0 34px!important;display:grid!important;place-items:center!important;border-radius:50%!important;background:#fff0e4!important}.ir-export-company-role-icon svg{width:21px!important;height:21px!important}",
    ".ir-export-company-contractor .ir-export-company-role{color:#5344b4!important}.ir-export-company-contractor .ir-export-company-role-icon{background:#eceafd!important}.ir-export-company-own .ir-export-company-role{color:#10754d!important}.ir-export-company-own .ir-export-company-role-icon{background:#e2f6eb!important}",
    ".ir-export-company-logo{height:108px!important;min-height:108px!important;max-height:108px!important;background:linear-gradient(130deg,#fff9f5,#f9eee9)!important;border:0!important;border-radius:13px!important}.ir-export-company-contractor .ir-export-company-logo{background:#f5f3ff!important}.ir-export-company-own .ir-export-company-logo{background:#eef9f3!important}.ir-export-company-name{font-weight:850!important;color:#102849!important}",
    ".ir-export-banner-only{height:180px!important;min-height:180px!important;max-height:180px!important}.ir-export-daily-full{display:block!important;padding:0!important;margin:0!important;background:#fff!important}.ir-export-daily-full>.ir-export-daily-table{width:100%!important;border:0!important;padding:0!important;margin:0!important}",
    "@media(max-width:830px){.ir-export-indicator-cards{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ir-export-companies{margin:12px!important;padding:14px!important}.ir-export-companies-grid{gap:10px!important}}",
    "@media(max-width:560px){.ir-export-companies-grid,.ir-export-companies-two .ir-export-companies-grid{grid-template-columns:1fr!important}.ir-export-company-card:not(:last-child):after{top:auto!important;bottom:-22px!important;right:calc(50% - 16px)!important;transform:rotate(90deg)!important}.ir-export-company-name{font-size:13px!important}}",
    "/* Consistent exported headings and three-column summary after removing duplicated readiness. */",
    "body.ir-object-overview #app .object-overview-top-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}",
    "body.ir-object-overview #app :is(.ir-export-indicators-heading h2,.ir-export-section-head h2,.ir-export-companies-heading b,.ir-object-overview-sidehead h2,.ir-object-overview-sidehead h3,.ir-export-marks-title h3,.ir-export-work-head h3,.ir-export-delivery-register>h3,.object-overview-block-head h2,.ood-head h2,.ooa-head h2){margin:0!important;padding:0!important;color:#214b66!important;font:800 16px/1.35 'Segoe UI',Arial,sans-serif!important;letter-spacing:0!important;text-transform:none!important}",
    "@media(max-width:760px){body.ir-object-overview #app .object-overview-top-stats{grid-template-columns:1fr!important}}",
    "/* Full-width blue participant strip; the heading and outer card are intentionally absent. */",
    "body.ir-object-overview #app .ir-export-companies{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:20px!important;border:0!important;border-radius:0!important;background:linear-gradient(112deg,#163c62 0%,#215a89 60%,#2c73a7 100%)!important;box-shadow:none!important;overflow:visible!important;box-sizing:border-box!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}",
    "body.ir-object-overview #app .ir-export-companies-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;width:100%!important;margin:0!important;align-items:stretch!important}",
    "body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    "body.ir-object-overview #app .ir-export-company-card{margin:0!important;padding:15px!important;min-height:213px!important;background:#fff!important;border:1px solid #d9e7f5!important;border-radius:14px!important;box-shadow:0 3px 12px rgba(3,23,47,.12)!important}",
    "body.ir-object-overview #app .ir-export-company-logo{width:100%!important;max-width:100%!important;margin:0!important}",
    "body.ir-object-overview #app .ir-export-banner-only{position:relative!important;isolation:isolate!important;height:180px!important;min-height:180px!important;max-height:180px!important}",
    "body.ir-object-overview #app .ir-export-banner-only:after{content:''!important;position:absolute!important;inset:0!important;z-index:1!important;pointer-events:none!important;background:linear-gradient(90deg,rgba(5,25,43,.9),rgba(8,34,58,.63) 65%,rgba(8,36,65,.2))!important}",
    "body.ir-object-overview #app .ir-export-banner-copy{position:relative!important;z-index:2!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:10px!important;height:100%!important;width:100%!important;padding:20px 25px!important;box-sizing:border-box!important}",
    "body.ir-object-overview #app .ir-export-banner-copy h1{display:block!important;max-width:890px!important;margin:0!important;color:#fff!important;font:850 27px/1.2 'Segoe UI',Arial,sans-serif!important;letter-spacing:0!important;text-shadow:0 2px 9px rgba(0,0,0,.4)!important;overflow-wrap:anywhere!important;-webkit-line-clamp:unset!important}",
    "body.ir-object-overview #app .ir-export-banner-copy p{max-width:880px!important;margin:0!important;color:#edf6ff!important;font:650 15px/1.4 'Segoe UI',Arial,sans-serif!important;text-shadow:0 2px 7px rgba(0,0,0,.4)!important;overflow-wrap:anywhere!important}",
    "@media(max-width:760px){body.ir-object-overview #app .ir-export-companies{padding:13px!important}body.ir-object-overview #app .ir-export-companies-grid{gap:10px!important}body.ir-object-overview #app .ir-export-banner-copy{padding:15px!important}body.ir-object-overview #app .ir-export-banner-copy h1{font-size:21px!important}body.ir-object-overview #app .ir-export-banner-copy p{font-size:12px!important}}",
    "@media(max-width:560px){body.ir-object-overview #app .ir-export-companies-grid,body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:minmax(0,1fr)!important}body.ir-object-overview #app .ir-export-banner-copy h1{font-size:19px!important}body.ir-object-overview #app .ir-export-banner-copy p{font-size:12px!important}}",
    "@media print{body.ir-object-overview #app .ir-export-companies{margin:0!important;padding:13px!important;break-inside:avoid!important}body.ir-object-overview #app .ir-export-company-card{break-inside:avoid!important}body.ir-object-overview #app .ir-export-banner-only{break-inside:avoid!important}}",
    "/* Continuous blue party strip and photographic banner; no outer card around companies. */",
    "body.ir-object-overview #app .ir-export-companies{display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:21px 20px 19px!important;border:0!important;border-radius:0!important;background:linear-gradient(180deg,#174367 0%,#205a88 54%,#276b9c 100%)!important;box-shadow:none!important;overflow:visible!important;box-sizing:border-box!important;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}",
    "body.ir-object-overview #app .ir-export-companies-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;align-items:stretch!important;width:100%!important;margin:0!important}",
    "body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    "body.ir-object-overview #app .ir-export-company-card{position:relative!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:12px!important;min-width:0!important;min-height:220px!important;margin:0!important;padding:9px 10px 11px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;text-align:center!important}",
    "body.ir-object-overview #app .ir-export-company-role{display:flex!important;align-self:stretch!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;width:100%!important;min-height:40px!important;color:#fff!important;font:850 11px/1.3 'Segoe UI',Arial,sans-serif!important;letter-spacing:.55px!important;text-transform:uppercase!important;text-align:left!important}",
    "body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-role,body.ir-object-overview #app .ir-export-company-own .ir-export-company-role{color:#fff!important}",
    "body.ir-object-overview #app .ir-export-company-role-icon{display:grid!important;place-items:center!important;flex:0 0 40px!important;width:40px!important;height:40px!important;border-radius:50%!important;background:#ffeadc!important;color:#b95c17!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)!important}",
    "body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-role-icon{background:#ede9ff!important;color:#5140b1!important}body.ir-object-overview #app .ir-export-company-own .ir-export-company-role-icon{background:#e3f7ec!important;color:#08764f!important}",
    "body.ir-object-overview #app .ir-export-company-role-icon svg{width:24px!important;height:24px!important;stroke:currentColor!important;stroke-width:1.9!important}",
    "body.ir-object-overview #app .ir-export-company-logo{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 112px!important;width:100%!important;max-width:100%!important;height:112px!important;min-height:112px!important;max-height:112px!important;margin:0!important;padding:10px 14px!important;border:0!important;border-radius:13px!important;background:#fff!important;box-shadow:0 4px 13px rgba(6,26,51,.1)!important;overflow:hidden!important}",
    "body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-logo,body.ir-object-overview #app .ir-export-company-own .ir-export-company-logo{background:#fff!important}",
    "body.ir-object-overview #app .ir-export-company-logo img{display:block!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}",
    "body.ir-object-overview #app .ir-export-company-name{width:100%!important;min-width:0!important;min-height:40px!important;margin:0!important;color:#fff!important;font:850 13px/1.4 'Segoe UI',Arial,sans-serif!important;text-align:center!important;text-shadow:0 1px 2px rgba(8,37,65,.16)!important;overflow-wrap:anywhere!important}",
    "body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{content:'➜'!important;position:absolute!important;z-index:3!important;right:-25px!important;top:109px!important;display:grid!important;place-items:center!important;width:31px!important;height:31px!important;border:1px solid #d6e6f6!important;border-radius:50%!important;background:#fff!important;color:#4e81bd!important;box-shadow:0 3px 9px rgba(5,27,50,.12)!important;font-size:19px!important}",
    "body.ir-object-overview #app .ir-export-banner-only{position:relative!important;isolation:isolate!important;height:180px!important;min-height:180px!important;max-height:180px!important;margin-top:-1px!important}",
    "body.ir-object-overview #app .ir-export-banner-only:before{content:''!important;position:absolute!important;inset:0 0 auto 0!important;height:43px!important;z-index:2!important;pointer-events:none!important;background:linear-gradient(180deg,#276b9c 0%,rgba(39,107,156,.78) 35%,rgba(39,107,156,0) 100%)!important}",
    "body.ir-object-overview #app .ir-export-banner-only:after{content:''!important;position:absolute!important;inset:0!important;z-index:1!important;pointer-events:none!important;background:linear-gradient(90deg,rgba(5,25,43,.84) 0%,rgba(8,34,58,.56) 61%,rgba(8,36,65,.17) 100%)!important}",
    "body.ir-object-overview #app .ir-export-banner-copy{position:relative!important;z-index:3!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:10px!important;height:100%!important;width:100%!important;padding:22px 27px!important;box-sizing:border-box!important}",
    "body.ir-object-overview #app .ir-export-banner-copy h1{display:block!important;max-width:925px!important;margin:0!important;color:#fff!important;font:850 28px/1.17 'Segoe UI',Arial,sans-serif!important;letter-spacing:0!important;text-shadow:0 2px 9px rgba(0,0,0,.4)!important;overflow-wrap:anywhere!important;-webkit-line-clamp:unset!important}",
    "body.ir-object-overview #app .ir-export-banner-address{display:flex!important;align-items:flex-start!important;gap:9px!important;max-width:920px!important;min-width:0!important}",
    "body.ir-object-overview #app .ir-export-banner-address-icon{display:grid!important;place-items:center!important;flex:0 0 20px!important;width:20px!important;height:20px!important;margin-top:1px!important;color:#eaf4ff!important}",
    "body.ir-object-overview #app .ir-export-banner-address-icon svg{display:block!important;width:20px!important;height:20px!important}",
    "body.ir-object-overview #app .ir-export-banner-copy p{max-width:880px!important;margin:0!important;color:#edf6ff!important;font:650 15px/1.4 'Segoe UI',Arial,sans-serif!important;text-shadow:0 2px 7px rgba(0,0,0,.35)!important;overflow-wrap:anywhere!important}",
    "@media(max-width:760px){body.ir-object-overview #app .ir-export-companies{padding:14px 10px 12px!important}body.ir-object-overview #app .ir-export-companies-grid{gap:8px!important}body.ir-object-overview #app .ir-export-company-card{padding:8px 5px!important;gap:9px!important}body.ir-object-overview #app .ir-export-company-name{font-size:11px!important}body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{right:-20px!important;width:26px!important;height:26px!important;font-size:16px!important}body.ir-object-overview #app .ir-export-banner-copy{padding:17px!important}body.ir-object-overview #app .ir-export-banner-copy h1{font-size:22px!important}body.ir-object-overview #app .ir-export-banner-copy p{font-size:13px!important}}",
    "@media(max-width:560px){body.ir-object-overview #app .ir-export-companies-grid,body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:minmax(0,1fr)!important;gap:24px!important}body.ir-object-overview #app .ir-export-company-card{min-height:0!important;padding:5px 8px 8px!important}body.ir-object-overview #app .ir-export-company-logo{height:106px!important;min-height:106px!important;max-height:106px!important;flex-basis:106px!important}body.ir-object-overview #app .ir-export-company-name{font-size:13px!important;min-height:0!important}body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{top:auto!important;bottom:-25px!important;right:calc(50% - 15px)!important;transform:rotate(90deg)!important}body.ir-object-overview #app .ir-export-banner-copy h1{font-size:19px!important}body.ir-object-overview #app .ir-export-banner-copy p{font-size:12px!important}}",
    "@media print{body.ir-object-overview #app .ir-export-companies{padding:14px!important;break-inside:avoid!important}body.ir-object-overview #app .ir-export-company-card{break-inside:avoid!important;box-shadow:none!important}body.ir-object-overview #app .ir-export-banner-only{break-inside:avoid!important}}",
    "/* Clean participant layout: roles, rounded logos and names without cards or arrows. */",
    "body.ir-object-overview #app .ir-export-companies{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:10px 18px 11px!important;border:0!important;border-radius:0!important;background:linear-gradient(180deg,#174367 0%,#205a88 54%,#276b9c 100%)!important;box-shadow:none!important;overflow:hidden!important;box-sizing:border-box!important}",
    "body.ir-object-overview #app .ir-export-companies-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:14px!important;width:100%!important;min-width:0!important;margin:0!important;padding:0!important;align-items:start!important}",
    "body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    "body.ir-object-overview #app .ir-export-company-card{display:flex!important;flex-direction:column!important;align-items:center!important;gap:7px!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;text-align:center!important}",
    "body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{content:none!important;display:none!important}",
    "body.ir-object-overview #app .ir-export-company-role,body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-role,body.ir-object-overview #app .ir-export-company-own .ir-export-company-role{display:block!important;align-self:center!important;width:100%!important;min-height:0!important;margin:0!important;padding:0!important;color:#fff!important;font:800 11px/1.35 'Segoe UI',Arial,sans-serif!important;letter-spacing:.4px!important;text-transform:uppercase!important;text-align:center!important}",
    "body.ir-object-overview #app .ir-export-company-logo,body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-logo,body.ir-object-overview #app .ir-export-company-own .ir-export-company-logo{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;width:100%!important;max-width:100%!important;height:100px!important;min-height:100px!important;max-height:100px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}",
    "body.ir-object-overview #app .ir-export-company-logo img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:100px!important;object-fit:contain!important;border-radius:12px!important}",
    "body.ir-object-overview #app .ir-export-company-name{display:block!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;color:#fff!important;font:800 12px/1.35 'Segoe UI',Arial,sans-serif!important;text-align:center!important;overflow-wrap:anywhere!important}",
    "@media(max-width:760px){body.ir-object-overview #app .ir-export-companies{padding:9px 10px!important}body.ir-object-overview #app .ir-export-companies-grid{gap:8px!important}body.ir-object-overview #app .ir-export-company-logo{height:80px!important;min-height:80px!important;max-height:80px!important}body.ir-object-overview #app .ir-export-company-logo img{max-height:80px!important}body.ir-object-overview #app .ir-export-company-name{font-size:10px!important}}",
    "@media(max-width:560px){body.ir-object-overview #app .ir-export-companies-grid,body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:minmax(0,1fr)!important;gap:13px!important}body.ir-object-overview #app .ir-export-company-logo{height:85px!important;min-height:85px!important;max-height:85px!important}body.ir-object-overview #app .ir-export-company-logo img{max-height:85px!important}body.ir-object-overview #app .ir-export-company-name{font-size:12px!important}}",
    "@media print{body.ir-object-overview #app .ir-export-companies{margin:0!important;padding:9px 12px!important;break-inside:avoid!important}body.ir-object-overview #app .ir-export-company-card{break-inside:avoid!important}}",
    "/* Continuous full-width archive sections, one separator after each logical section. */",
    "body.ir-object-overview #app .ir-export-indicators{width:100%!important;max-width:none!important;margin:0!important;padding:19px 20px 23px!important;border:0!important;border-bottom:1px solid #dbe5ed!important;border-radius:0!important;box-shadow:none!important;background:#fff!important}",
    "body.ir-object-overview #app .ir-export-indicator-head{display:flex!important;align-items:center!important;gap:10px!important;width:100%!important;min-height:37px!important;flex:0 0 auto!important}",
    "body.ir-object-overview #app .ir-export-indicator-head .ir-export-indicator-icon{flex:0 0 35px!important;margin:0!important}",
    "body.ir-object-overview #app .ir-export-indicator-head .ir-export-indicator-title{flex:1 1 auto!important;min-width:0!important;display:block!important;margin:0!important;color:#375870!important;font:800 11px/1.3 'Segoe UI',Arial,sans-serif!important;text-align:left!important;overflow-wrap:anywhere!important}",
    "body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats{box-sizing:border-box!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important;width:100%!important;max-width:none!important;margin:16px 0 0!important;padding:0!important}",
    "body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats .oos-card{min-width:0!important;margin:0!important}",
    "body.ir-object-overview #app .ir-export-indicators>.ir-export-indicator-links{margin-top:14px!important}",
    "body.ir-object-overview #app .ir-export-group{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-bottom:1px solid #dbe5ed!important;border-radius:0!important;box-shadow:none!important;background:#fff!important}",
    "body.ir-object-overview #app .ir-export-group .ir-export-section{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:22px 20px 23px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-export-group .ir-export-section-head{border:0!important;padding:0!important;margin:0 0 15px!important;min-height:0!important}",
    "body.ir-object-overview #app #section-marks>.ir-export-marks-section{padding-top:21px!important}",
    "body.ir-object-overview #app #section-marks .ir-export-marks-unified,body.ir-object-overview #app #section-marks .ir-export-marks-summary,body.ir-object-overview #app #section-marks .ir-export-work-filter{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}",
    "body.ir-object-overview #app #section-marks .ir-export-marks-title{padding:0 0 12px!important;margin:0!important;border:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-marks-stats,body.ir-object-overview #app #section-marks .ir-export-mark-switcher{width:100%!important;max-width:none!important;min-width:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-head{padding:20px 0 9px!important;margin:0!important;border-top:1px solid #edf1f4!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-hint{margin:0 0 12px!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs,body.ir-object-overview #app #section-marks .ir-export-work-panels,body.ir-object-overview #app #section-marks .ir-export-mark-cards{box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important}",
    "body.ir-object-overview #app #section-schedule>.ir-export-visual-section{padding:22px 20px 23px!important}",
    "body.ir-object-overview #app #section-schedule .ir-export-preview{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "body.ir-object-overview #app #section-schedule .ir-export-preview-layout,body.ir-object-overview #app #section-schedule .object-overview-dashboard,body.ir-object-overview #app #section-schedule .ir-export-gantt-filter,body.ir-object-overview #app #section-schedule .object-overview-schedule{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;overflow:visible!important}",
    "body.ir-object-overview #app #section-schedule .object-overview-block-head{padding:0 0 14px!important;margin:0 0 14px!important;border:0!important;min-height:0!important}",
    "body.ir-object-overview #app #section-schedule .ir-export-gantt-options{margin:0!important}",
    "@media(max-width:760px){body.ir-object-overview #app .ir-export-indicators{padding:15px 12px 19px!important}body.ir-object-overview #app .ir-export-group .ir-export-section{padding:18px 12px 20px!important}body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats{grid-template-columns:1fr!important}body.ir-object-overview #app #section-schedule>.ir-export-visual-section{padding:18px 12px 20px!important}}",
    "@media print{body.ir-object-overview #app .ir-export-group{break-inside:auto!important}body.ir-object-overview #app .ir-export-indicators{border-bottom:1px solid #dbe5ed!important}body.ir-object-overview #app .ir-export-group .ir-export-section{padding:16px 0!important}body.ir-object-overview #app #section-schedule>.ir-export-visual-section{padding:16px 0!important}}",
    "/* Stabilize the archived weather widget after moving resources below object KPIs. */",
    "body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.65fr)!important;align-items:stretch!important}",
    "body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats>.oos-weather{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-width:0!important;min-height:110px!important;padding:12px!important;overflow:hidden!important;flex-wrap:wrap!important}",
    "body.ir-object-overview #app .ir-export-indicators .oos-weather-main{min-width:0!important;flex:1 1 130px!important}",
    "body.ir-object-overview #app .ir-export-indicators .oos-weather-meta{min-width:0!important;flex:0 1 158px!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    "body.ir-object-overview #app .ir-export-indicators .oos-weather-chip{min-width:0!important}",
    "@media(max-width:830px){body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats>.oos-weather{grid-column:1/-1!important}}",
    "@media(max-width:560px){body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats{grid-template-columns:minmax(0,1fr)!important}body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats>.oos-weather{grid-column:auto!important}body.ir-object-overview #app .ir-export-indicators .oos-weather-meta{flex:1 1 100%!important}}",
    "@media print{body.ir-object-overview #app .ir-export-indicators>.object-overview-top-stats>.oos-weather{break-inside:avoid!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}",
    "/* Full-width divider and contained project-code filter bar. */",
    "body.ir-object-overview #app #section-marks .ir-export-marks-summary{border-bottom:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-filter{position:relative!important;min-width:0!important;max-width:100%!important;border-top:0!important;padding:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-filter::before{content:''!important;display:block!important;position:relative!important;left:-20px!important;width:calc(100% + 40px)!important;height:1px!important;margin:12px 0 18px!important;background:#dbe5ed!important;box-sizing:border-box!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-head{margin:0!important;padding:0 0 9px!important;border-top:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs{box-sizing:border-box!important;display:flex!important;flex-wrap:wrap!important;align-items:stretch!important;gap:6px!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:4px 0 14px!important;padding:4px!important;overflow-wrap:anywhere!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs label{box-sizing:border-box!important;display:inline-flex!important;flex:0 1 auto!important;align-items:center!important;gap:7px!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:9px 10px!important;white-space:normal!important;overflow-wrap:anywhere!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs label span{flex:0 0 auto!important;white-space:nowrap!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-panels,body.ir-object-overview #app #section-marks .ir-export-mark-cards,body.ir-object-overview #app #section-marks .ir-export-mark-cardlist{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important}",
    "@media(max-width:760px){body.ir-object-overview #app #section-marks .ir-export-work-filter::before{left:-12px!important;width:calc(100% + 24px)!important}body.ir-object-overview #app #section-marks .ir-export-work-tabs{gap:5px!important;padding:3px!important}body.ir-object-overview #app #section-marks .ir-export-work-tabs label{padding:8px!important;font-size:10px!important}}",
    "@media print{body.ir-object-overview #app #section-marks .ir-export-work-filter::before{left:0!important;width:100%!important;margin:10px 0 14px!important}}",
    "/* Mark register follows the section grid, never exceeding its right border. */",
    "body.ir-object-overview #app #section-marks,body.ir-object-overview #app #section-marks .ir-export-marks-section,body.ir-object-overview #app #section-marks .ir-export-marks-unified,body.ir-object-overview #app #section-marks .ir-export-work-filter{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;min-width:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-hint{box-sizing:border-box!important;margin:0 0 12px!important;padding:0!important;max-width:100%!important}",
    "body.ir-object-overview #app #section-marks .ir-export-status-tabs{box-sizing:border-box!important;margin:0!important;padding:0 0 12px!important;max-width:100%!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs{box-sizing:border-box!important;display:flex!important;flex-wrap:wrap!important;gap:6px!important;align-items:center!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:4px 0 14px!important;padding:4px!important;overflow:hidden!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs label{box-sizing:border-box!important;flex:0 1 auto!important;max-width:100%!important;min-width:0!important;margin:0!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-tabs label span{white-space:nowrap!important;flex-shrink:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-work-panels,body.ir-object-overview #app #section-marks .ir-export-work-panel,body.ir-object-overview #app #section-marks .ir-export-mark-cards,body.ir-object-overview #app #section-marks .ir-export-mark-cardlist{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-mark-cards{display:grid!important;grid-template-columns:minmax(0,1fr)!important;margin:0!important;padding:0!important;gap:9px!important;background:transparent!important}",
    "body.ir-object-overview #app #section-marks .ir-export-mark-card,body.ir-object-overview #app #section-marks .ir-export-mark-card details,body.ir-object-overview #app #section-marks .ir-export-mark-brief{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important}",
    "body.ir-object-overview #app #section-marks .ir-export-mark-main{min-width:0!important}",
    "@media(max-width:640px){body.ir-object-overview #app #section-marks .ir-export-mark-brief{flex-wrap:wrap!important;gap:8px!important}body.ir-object-overview #app #section-marks .ir-export-mark-main{flex:1 1 55%!important}body.ir-object-overview #app #section-marks .ir-export-mark-badge{flex:0 1 auto!important;min-width:0!important}}",    "/* Reference masthead: project banner / three horizontal identities / full inline menu */",
    "body.ir-object-overview #app .object-overview-hero.ir-export-banner-only{position:relative!important;isolation:isolate!important;height:310px!important;min-height:310px!important;max-height:310px!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;overflow:hidden!important}",
    "body.ir-object-overview #app .object-overview-hero.ir-export-banner-only:before{content:none!important;display:none!important}",
    // (the header of the report — the height of the banner in the program, 180 px, the font fitted to it: the engineer,
    // 06.11.2026 «шапку отчета сделай максимальной высотой баннера … высота баннер 180 пикселей в программе»)
    "html body.ir-object-overview #app .object-overview-hero.ir-export-banner-only{height:180px!important;min-height:180px!important;max-height:180px!important;aspect-ratio:auto!important}",
    "html body.ir-object-overview #app .ir-export-banner-copy{gap:10px!important;padding:16px 28px!important;min-height:0!important}",
    "html body.ir-object-overview #app .ir-export-banner-copy h1{font-size:26px!important;line-height:1.15!important;max-width:900px!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;overflow:hidden!important}",
    "html body.ir-object-overview #app .ir-export-hero-facts{margin-top:2px!important}html body.ir-object-overview #app .ir-export-hero-fact-copy b{font-size:13px!important}html body.ir-object-overview #app .ir-export-hero-fact-copy span{font-size:11.5px!important}html body.ir-object-overview #app .ir-export-hero-fact-copy{gap:1px!important}html body.ir-object-overview #app .ir-export-hero-fact-icon,html body.ir-object-overview #app .ir-export-hero-fact-icon svg{width:22px!important;height:22px!important;flex-basis:22px!important}",
    "@media(max-width:640px){html body.ir-object-overview #app .object-overview-hero.ir-export-banner-only{height:auto!important;min-height:180px!important;max-height:none!important}html body.ir-object-overview #app .ir-export-banner-copy{min-height:180px!important;padding:14px 14px!important}html body.ir-object-overview #app .ir-export-banner-copy h1{font-size:20px!important;-webkit-line-clamp:4!important}}",
    "body.ir-object-overview #app .object-overview-hero.ir-export-banner-only:after{content:''!important;position:absolute!important;inset:0!important;z-index:1!important;background:linear-gradient(90deg,rgba(2,28,54,.97) 0%,rgba(2,35,64,.88) 33%,rgba(5,39,70,.53) 62%,rgba(3,27,51,.06) 100%)!important}",
    "body.ir-object-overview #app .ir-export-banner-copy{position:relative!important;z-index:3!important;display:flex!important;flex-direction:column!important;align-items:flex-start!important;justify-content:center!important;gap:16px!important;width:100%!important;height:100%!important;margin:0!important;padding:26px 29px!important}",
    "body.ir-object-overview #app .ir-export-banner-copy h1{display:block!important;max-width:760px!important;margin:0!important;color:#fff!important;font:850 31px/1.16 'Segoe UI',Arial,sans-serif!important;letter-spacing:0!important;overflow-wrap:anywhere!important;-webkit-line-clamp:unset!important}",
    "body.ir-object-overview #app .ir-export-hero-type{display:inline-flex!important;align-items:center!important;gap:9px!important;max-width:100%!important;padding:7px 14px!important;background:rgba(30,110,165,.67)!important;border-radius:23px!important;color:#f3faff!important;font:650 11px/1.3 'Segoe UI',Arial,sans-serif!important}",
    "body.ir-object-overview #app .ir-export-hero-type svg{width:18px!important;height:18px!important;flex:0 0 18px!important}",
    "body.ir-object-overview #app .ir-export-hero-facts{display:flex!important;align-items:stretch!important;min-width:0!important;max-width:100%!important;gap:0!important;margin-top:5px!important}",
    "body.ir-object-overview #app .ir-export-hero-fact{display:flex!important;align-items:center!important;gap:9px!important;min-width:0!important;max-width:350px!important;padding:0 18px!important;border-left:1px solid rgba(255,255,255,.4)!important}",
    "body.ir-object-overview #app .ir-export-hero-fact:first-child{border-left:0!important;padding-left:0!important}",
    "body.ir-object-overview #app .ir-export-hero-fact-icon{display:grid!important;place-items:center!important;flex:0 0 24px!important;width:24px!important;height:24px!important;color:#eff8ff!important}",
    "body.ir-object-overview #app .ir-export-hero-fact-icon svg{display:block!important;width:24px!important;height:24px!important}",
    "body.ir-object-overview #app .ir-export-hero-fact-copy{display:grid!important;gap:3px!important;min-width:0!important}",
    "body.ir-object-overview #app .ir-export-hero-fact-copy span{color:#d9e7f3!important;font:450 12px/1.35 'Segoe UI',Arial,sans-serif!important}",
    "body.ir-object-overview #app .ir-export-hero-fact-copy b{color:#fff!important;font:750 13px/1.35 'Segoe UI',Arial,sans-serif!important;overflow-wrap:anywhere!important}",
    "body.ir-object-overview #app .ir-export-companies{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:14px 20px!important;border:0!important;border-bottom:1px solid #dbe6ef!important;border-radius:0!important;background:linear-gradient(180deg,#fbfdff,#edf4f9)!important;box-shadow:none!important;overflow:hidden!important}",
    "body.ir-object-overview #app .ir-export-companies-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;align-items:center!important;width:100%!important}",
    "body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}",
    "body.ir-object-overview #app .ir-export-company-card{position:relative!important;display:grid!important;grid-template-columns:minmax(0,44%) minmax(0,1fr)!important;align-items:center!important;gap:12px!important;min-width:0!important;min-height:84px!important;margin:0!important;padding:0 12px!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;text-align:left!important}",
    "body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{content:''!important;display:block!important;position:absolute!important;right:0!important;top:10px!important;bottom:10px!important;width:1px!important;height:auto!important;border:0!important;border-radius:0!important;background:#d7e3ec!important;box-shadow:none!important}",
    "body.ir-object-overview #app .ir-export-company-logo,body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-logo,body.ir-object-overview #app .ir-export-company-own .ir-export-company-logo{display:flex!important;align-items:center!important;justify-content:center!important;flex:none!important;width:100%!important;max-width:100%!important;height:78px!important;min-height:78px!important;max-height:78px!important;margin:0!important;padding:8px!important;border:0!important;border-radius:12px!important;background:white!important;box-shadow:none!important;overflow:hidden!important}",
    "body.ir-object-overview #app .ir-export-company-logo img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;border-radius:10px!important}",
    "body.ir-object-overview #app .ir-export-company-meta{display:grid!important;align-content:center!important;justify-items:start!important;gap:8px!important;min-width:0!important}",
    "body.ir-object-overview #app .ir-export-company-role,body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-role,body.ir-object-overview #app .ir-export-company-own .ir-export-company-role{display:block!important;width:100%!important;min-height:0!important;margin:0!important;padding:0!important;color:#879bac!important;font:600 10px/1.3 'Segoe UI',Arial,sans-serif!important;letter-spacing:.5px!important;text-align:left!important;text-transform:uppercase!important}",
    "body.ir-object-overview #app .ir-export-company-name{display:block!important;min-height:0!important;width:100%!important;margin:0!important;padding:0!important;color:#17334c!important;font:800 13px/1.35 'Segoe UI',Arial,sans-serif!important;text-align:left!important;overflow-wrap:anywhere!important;text-shadow:none!important}",
    "body.ir-object-overview #app .ir-export-topnav{display:block!important;position:sticky!important;top:0!important;z-index:95!important;box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-height:65px!important;margin:0!important;padding:9px 12px!important;background:linear-gradient(180deg,#fff,#f5f9fc)!important;border:0!important;border-bottom:1px solid #d9e5ed!important;box-shadow:0 3px 12px rgba(15,55,84,.04)!important;overflow:visible!important}",
    "body.ir-object-overview #app .ir-export-topnav-inner{display:flex!important;align-items:stretch!important;justify-content:space-between!important;gap:0!important;width:100%!important;max-width:100%!important;min-width:0!important;position:relative!important}",
    "body.ir-object-overview #app .ir-export-topnav a,body.ir-object-overview #app .ir-export-topnav summary{font:750 11px/1.35 'Segoe UI',Arial,sans-serif!important;text-decoration:none!important}",
    "body.ir-object-overview #app .ir-export-toplink,body.ir-object-overview #app .ir-export-menu-trigger{display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;flex:1 1 auto!important;min-width:0!important;min-height:45px!important;margin:0!important;padding:8px 6px!important;border:0!important;border-right:1px solid #d7e2ea!important;border-radius:0!important;background:transparent!important;color:#557189!important;box-shadow:none!important;white-space:nowrap!important}",
    "body.ir-object-overview #app .ir-export-toplink.active{flex:0 0 auto!important;padding:8px 13px!important;background:#277bb3!important;color:#fff!important;border:0!important;border-radius:9px!important;box-shadow:0 3px 10px rgba(27,101,156,.14)!important}",
    "body.ir-object-overview #app .ir-export-topnav .nav-icon{display:grid!important;place-items:center!important;flex:0 0 21px!important;width:21px!important;height:21px!important;color:inherit!important}",
    "body.ir-object-overview #app .ir-export-topnav .nav-icon svg{display:block!important;width:21px!important;height:21px!important;stroke:currentColor!important}",
    "body.ir-object-overview #app .ir-export-menu{position:relative!important;flex:0 0 auto!important;min-width:0!important}",
    "body.ir-object-overview #app .ir-export-menu-trigger{height:100%!important;border-right:0!important;list-style:none!important}",
    "body.ir-object-overview #app .ir-export-menu-items{left:auto!important;right:0!important;top:calc(100% + 9px)!important;transform:none!important}",
    "@media(max-width:870px){body.ir-object-overview #app .ir-export-topnav-inner{flex-wrap:wrap!important;justify-content:center!important}body.ir-object-overview #app .ir-export-toplink{flex:1 1 30%!important}body.ir-object-overview #app .ir-export-menu{flex:1 1 30%!important}body.ir-object-overview #app .ir-export-menu-trigger{width:100%!important}body.ir-object-overview #app .ir-export-company-card{gap:8px!important;padding:0 7px!important}}",
    "@media(max-width:640px){body.ir-object-overview #app .object-overview-hero.ir-export-banner-only{height:auto!important;min-height:315px!important;max-height:none!important}body.ir-object-overview #app .ir-export-banner-copy{min-height:315px!important;gap:13px!important;padding:20px 15px!important}body.ir-object-overview #app .ir-export-banner-copy h1{font-size:23px!important}body.ir-object-overview #app .ir-export-hero-facts{flex-wrap:wrap!important;gap:12px 0!important}body.ir-object-overview #app .ir-export-hero-fact{flex:0 1 50%!important;padding:0 10px!important}body.ir-object-overview #app .ir-export-hero-fact:first-child{flex-basis:100%!important;padding:0!important}body.ir-object-overview #app .ir-export-companies{padding:8px 12px!important}body.ir-object-overview #app .ir-export-companies-grid,body.ir-object-overview #app .ir-export-companies-two .ir-export-companies-grid{grid-template-columns:1fr!important}body.ir-object-overview #app .ir-export-company-card{grid-template-columns:110px minmax(0,1fr)!important;gap:12px!important;min-height:76px!important;padding:7px 0!important;border-bottom:1px solid #e2ebf2!important}body.ir-object-overview #app .ir-export-company-card:not(:last-child):after{display:none!important}body.ir-object-overview #app .ir-export-company-logo{height:64px!important;min-height:64px!important;max-height:64px!important}body.ir-object-overview #app .ir-export-topnav{padding:6px!important}body.ir-object-overview #app .ir-export-toplink{flex:1 1 45%!important}}",
    "@media print{body.ir-object-overview #app .ir-export-topnav{position:relative!important}body.ir-object-overview #app .object-overview-hero.ir-export-banner-only,body.ir-object-overview #app .ir-export-companies{break-inside:avoid!important}}",
    "/* Common archive section titles and full-width mounting scene. */",
    "body.ir-object-overview #app :is(.ir-export-indicators-heading,.ir-export-section-head,.ir-export-marks-title,.ir-export-work-head,.object-overview-block-head,.ooa-head,.ood-head){box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:0!important;margin:0 0 16px!important;padding:0 0 14px!important;border:0!important;border-bottom:1px solid #e2eaf0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}",
    "body.ir-object-overview #app :is(.ir-export-indicators-heading h2,.ir-export-section-head h2,.ir-export-marks-title h3,.ir-export-work-head h3,.object-overview-block-head h2,.ooa-head h2,.ood-head h2,.schedule-trend-head b){margin:0!important;padding:0!important;color:#214b66!important;font:800 16px/1.35 'Segoe UI',Arial,sans-serif!important;letter-spacing:0!important;text-transform:none!important}",
    "body.ir-object-overview #app #section-schedule .object-overview-block-head,body.ir-object-overview #app #section-acted-days .ooa-head,body.ir-object-overview #app #section-penalties .ooa-head{display:none!important}",
    "body.ir-object-overview #app #section-deliveries .ir-export-delivery-register{padding:18px 0 0!important;border-top:1px solid #e2eaf0!important}",
    "body.ir-object-overview #app #section-deliveries .ir-export-delivery-register>.ir-export-section-head{margin:0 20px 16px!important}",
    "@media print{body.ir-object-route.ir-object-overview{background:#fff!important}body.ir-object-overview #app{margin:0 auto!important;width:100%!important;max-width:1000px!important;box-shadow:none!important}.ir-export-topnav{position:relative!important;top:auto!important}.ir-export-menu-items{box-shadow:none!important}.ir-export-record{break-inside:avoid}.ir-export-section{break-before:page;margin:8px 0!important}.ir-export-daily-card details,.ir-export-mark-card details{display:block!important}}"
   ].join("\n");
   const activeHero=document.querySelector(".object-overview-hero");
   if(String(activeHero?.dataset.objectId||"")!==id)throw Error("Во время выгрузки изменился открытый объект. Повторите действие.");
   const indicatorTypes=["work-types","marks","reports","deliveries","scheme"];
   // Reuse exactly the in-app chart engine, with all rows from this object's storage.
   const supplyModel=keys.includes("deliveries")?window.irSupplyChart.prepare(
    await api.section("work-types").list().catch(()=>[]),
    rows.deliveries||await api.section("deliveries").list().catch(()=>[]),
    rows.reports||await api.section("reports").list().catch(()=>[]),
    rows.marks||await api.section("marks").list().catch(()=>[])
   ):null;
   const indicatorRows=selection.overview?Object.fromEntries(await Promise.all(indicatorTypes.map(async key=>{
    if(rows[key])return[key,rows[key]];
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: indicators unavailable",key,error);return[key,[]]}
   }))):{};
   const indicatorsMarkup=selection.overview?renderIndicatorBlock(indicatorRows,keys):"";
   await bar.step(.55,"Показатели объекта");
   if(selection.overview)await exportWaitForWeather();
   // Read work-type schedule dates even when the schedule section is not selected for export.
   const scheduleRows=rows.schedule||await api.section("schedule").list().catch(error=>{console.warn("Object HTML: work schedule dates unavailable",error);return []});
   const workPeriod=exportWorkPeriod(scheduleRows);
   // (the banner's own proportion: the header shows the whole picture)
   const overviewSnapshot=snapshot(keys,selection.overview,companyHeader.markup,indicatorsMarkup,indicatorRows.reports||[],workPeriod);
   const htmlSnapshot=overviewSnapshot.overview;
   const activeNavStyles=keys.filter(key=>/^[a-z0-9_-]+$/i.test(key)).map(key=>'body:has(#section-'+key+':target) .ir-export-topnav .ir-export-subnav-link[href="#section-'+key+'"]{background:#e6f2fc!important;color:#176ca7!important;font-weight:800!important}').join("\n");
   // The montage scheme is not on the main page: a page of its own by «Монтажная схема» in the top bar (the engineer,
   // 06.11.2026: «убери монтажную схему с главной страницы. создай отдельный пункт переключения на монтажную схему и там
   // выводи»); the whole page light or dark by the icon in the top right corner («на всю страницу сделай темную версию,
   // текста, поля все переделывай на темную при переключение. знак где-нибудь вверху в правом углу поставь»).
   const pageStyles=[
    "html body.ir-object-overview #app #section-scheme.ir-export-group:not(:target){display:none!important}",
    // (the exported scheme in a frame under the top bar, to the edges of the window)
    // (a section like the others — its title, its card; the 3D in a box of the card, to the bottom of the window)
    "#section-scheme>.ir-export-section{padding:0!important;width:100%!important;max-width:none!important}",
    "#section-scheme>.ir-export-section>.ir-export-section-head{padding:18px 20px 15px!important;margin:0!important}",
    "#section-scheme .ir-export-scheme{display:block!important;width:100%!important;max-width:none!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "#section-scheme .ir-export-scheme-stage{width:100%!important;height:min(82vh,950px)!important;min-height:510px!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-controls button{display:inline-flex!important;align-items:center!important;justify-content:center!important}",
    "@media(max-width:760px){#section-scheme>.ir-export-section>.ir-export-section-head{padding:14px 12px!important}#section-scheme .ir-export-scheme-stage{min-height:360px!important;height:65vh!important}}",
    "body.ir-object-overview #app #section-scheme.ir-export-group{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;overflow:visible!important}",
    "body.ir-object-overview #app #section-scheme.ir-export-group>.ir-export-section{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important}",
    "body.ir-object-overview #app #section-scheme.ir-export-group>.ir-export-section>.ir-export-section-head{box-sizing:border-box!important;width:100%!important;margin:0!important;padding:17px 20px 15px!important;border-bottom:1px solid #e2eaf0!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-controls{box-sizing:border-box!important;width:100%!important;margin:0!important;padding:12px 20px!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-stage{box-sizing:border-box!important;position:relative!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;height:min(80vh,850px)!important;min-height:500px!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-stage canvas{display:block!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-info{margin:0!important;padding:12px 20px!important}",
    "@media(max-width:760px){body.ir-object-overview #app #section-scheme.ir-export-group>.ir-export-section>.ir-export-section-head{padding:15px 12px!important}body.ir-object-overview #app #section-scheme .ir-export-scheme-controls{padding:10px 12px!important}body.ir-object-overview #app #section-scheme .ir-export-scheme-info{padding:10px 12px!important}body.ir-object-overview #app #section-scheme .ir-export-scheme-stage{height:65vh!important;min-height:360px!important}}",
    "html body.ir-object-overview #app #section-scheme .ir-export-scheme3d{box-sizing:border-box;position:relative;width:auto;margin:16px 20px 20px;height:calc(100vh - 170px);min-height:420px;border:1px solid #dce5ed;border-radius:10px;overflow:hidden;background:#f4f8fc}.ir-export-scheme3d-frame{display:block;width:100%;height:100%;border:0}@media(max-width:760px){html body.ir-object-overview #app #section-scheme .ir-export-scheme3d{margin:10px 8px 12px}}",
    ".ir-export-scheme3d-wait{padding:48px 16px;text-align:center;color:#5d6b80;font-size:15px}",
    // (the scheme opened — on the whole window under the menu of the report, without the section's header: the engineer,
    // 06.11.2026 «сделай при переходе в Монтажную схему в отчете выгруженном на всю страницу»)
    "html body.ir-object-route.ir-object-overview:has(#section-scheme:target) #app{max-width:none!important}",
    "html body.ir-object-overview #app #section-scheme.ir-export-scheme3d-group:target .ir-export-section-head{display:none!important}",
    "body.ir-scheme-max #section-scheme .ir-export-scheme3d{top:0!important;z-index:300!important}",
    // (the menu over the scheme smaller — the engineer, 06.11.2026 «Меню поменьше в монтажной схеме»)
    "html body.ir-object-overview:has(#section-scheme:target) .ir-export-topnav{min-height:0!important;padding:3px 12px!important}",
    "html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-toplink,html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-menu-trigger{min-height:0!important;padding:6px 10px!important;font-size:12px!important}",
    "html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-topnav .nav-icon svg{width:16px!important;height:16px!important}",
    // (the logo only over the montage scheme; the names of the menu in full, no «…» — the engineer, 06.11.2026 «на главной
    // странице убери логотип из меню, только в монтажной оставь, и сокращения точками убери в меню»)
    "html body.ir-object-overview #app .ir-export-brand{display:none!important}",
    "html body.ir-object-overview #app .ir-export-menu.active>.ir-export-menu-trigger{background:#277bb3!important;color:#fff!important;border-radius:9px!important}",
    "html body.ir-object-overview #app .ir-export-subnav-link.active{background:#e8f1f8!important;color:#1d5f92!important;font-weight:700!important}",
    // (over the montage scheme: the logo, the name of the object (12 px) and «Отчёт от ДД.ММ.ГГГГг», the line under them the
    // whole width — the engineer, 06.11.2026; before:
    // the engineer, 06.11.2026 «в монтажной схеме … логотип и название объекта. дата выгрузки. а внизу меню»)
    "html body.ir-object-overview #app .ir-export-scheme-title{display:none!important}",
    "html body.ir-object-overview #app .ir-export-indicators-heading .ir-export-report-date{display:inline-flex!important;align-items:center!important;padding:7px 16px!important;border-radius:999px!important;background:#e3f0fb!important;border:1px solid #b9d7f0!important;color:#145f97!important;font:800 15px/1.3 'Segoe UI',Arial,sans-serif!important;white-space:nowrap!important}",
    "html.ir-dark body.ir-object-overview #app .ir-export-indicators .ir-export-indicators-heading span.ir-export-report-date{background:#163b5c!important;border-color:#2f6c9f!important;color:#d4ebff!important}",
    "@media(max-width:560px){html body.ir-object-overview #app .ir-export-indicators-heading{flex-wrap:wrap!important}html body.ir-object-overview #app .ir-export-indicators-heading .ir-export-report-date{font-size:13px!important;padding:5px 12px!important}}",
    "html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-topnav .ir-export-scheme-title{display:flex!important;align-items:center;gap:12px;min-width:0;padding:5px 16px 6px;margin:-3px -12px 3px;border-bottom:1px solid #e3ebf1}",
    ".ir-export-scheme-title img{display:block;flex:none;max-height:30px;max-width:130px;object-fit:contain}",
    ".ir-export-scheme-title b{flex:1 1 auto;min-width:0;color:#183b56;font:800 12px/1.3 'Segoe UI',Arial,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".ir-export-scheme-title span{flex:none;color:#6b8399;font:600 12px/1.3 'Segoe UI',Arial,sans-serif;white-space:nowrap}",
    "@media(max-width:650px){html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-topnav .ir-export-scheme-title{flex-wrap:wrap;gap:2px 10px;margin:-4px 0 4px;padding:5px 12px 6px}.ir-export-scheme-title b{flex:1 1 0;font-size:12px;white-space:normal}.ir-export-scheme-title img{max-height:24px;max-width:80px}.ir-export-scheme-title span{flex-basis:100%;font-size:11px}}",
    // (the menu even: every item the same width, the icon and the name in one line, the opened one only coloured, not wider —
    // the engineer, 06.11.2026 «все меню корявое»; narrow window — the icon over the name)
    "html body.ir-object-overview #app .ir-export-topnav .nav-label,html body.ir-object-overview #app .ir-export-toplink>span:not(.nav-icon),html body.ir-object-overview #app .ir-export-menu-trigger>span:not(.nav-icon){overflow:visible!important;text-overflow:clip!important;white-space:nowrap!important;text-align:center!important;line-height:1.2!important}",
    "html body.ir-object-overview #app .ir-export-topnav-inner{align-items:center!important;gap:4px!important}",
    "html body.ir-object-overview #app .ir-export-toplink,html body.ir-object-overview #app .ir-export-toplink.active{flex:1 1 0!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;gap:4px!important;min-width:0!important;min-height:46px!important;padding:6px 4px!important;border:0!important;border-radius:9px!important;box-shadow:none!important;font-size:11.5px!important}",
    "html body.ir-object-overview #app .ir-export-toplink>span:not(.nav-icon){white-space:normal!important}",
    "html body.ir-object-overview #app .ir-export-toplink:not(.active):hover,html body.ir-object-overview #app .ir-export-menu-trigger:hover{background:#eef4f9!important}",
    "html body.ir-object-overview #app .ir-export-menu{flex:1 1 0!important;align-self:stretch!important}html body.ir-object-overview #app .ir-export-menu-trigger{display:grid!important;grid-template-columns:auto auto!important;justify-content:center!important;align-content:center!important;gap:4px 3px!important;width:100%!important;min-height:46px!important;height:100%!important;padding:6px 4px!important;border:0!important;border-radius:9px!important;font-size:11.5px!important;white-space:nowrap!important}",
    "html body.ir-object-overview #app .ir-export-menu-trigger>.nav-icon{grid-column:1/-1!important;justify-self:center!important}html body.ir-object-overview #app .ir-export-menu-caret,html body.ir-object-overview #app .ir-export-menu-caret svg{width:12px!important;height:12px!important}",
    "html body.ir-object-overview #app .ir-export-topnav .nav-icon,html body.ir-object-overview #app .ir-export-topnav .nav-icon svg{flex:0 0 19px!important;width:19px!important;height:19px!important}",
    "@media(min-width:701px){html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-toplink,html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-toplink.active{flex-direction:row!important;gap:6px!important;min-height:0!important;padding:6px 6px!important}html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-toplink>span:not(.nav-icon){white-space:nowrap!important}html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-menu-trigger{display:flex!important;align-items:center!important;min-height:0!important;padding:6px!important}html body.ir-object-overview:has(#section-scheme:target) #app .ir-export-menu-trigger>.nav-icon{grid-column:auto!important}}",
    // (a phone: the menu one thin strip, swiped sideways — not three rows over a third of the screen: the engineer,
    // 06.11.2026 «Меню в моб версии кривое»; the opened section scrolled into the middle of the strip, «Другое» opens over
    // the page, the theme icon stays at the right end)
    "@media(max-width:700px){html body.ir-object-overview #app .ir-export-topnav{padding:4px 0!important;min-height:0!important}html body.ir-object-overview #app .ir-export-topnav-inner{flex-wrap:nowrap!important;justify-content:flex-start!important;gap:4px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:0 0 0 8px!important;scrollbar-width:none!important;-webkit-overflow-scrolling:touch}html body.ir-object-overview #app .ir-export-topnav-inner::-webkit-scrollbar{display:none}html body.ir-object-overview #app .ir-export-toplink,html body.ir-object-overview #app .ir-export-toplink.active{flex:0 0 auto!important;flex-direction:row!important;gap:6px!important;min-height:36px!important;padding:6px 12px!important;font-size:13px!important}html body.ir-object-overview #app .ir-export-toplink>span:not(.nav-icon){white-space:nowrap!important}html body.ir-object-overview #app .ir-export-menu{flex:0 0 auto!important;position:static!important}html body.ir-object-overview #app .ir-export-menu-trigger{display:flex!important;align-items:center!important;min-height:36px!important;padding:6px 12px!important;font-size:13px!important}html body.ir-object-overview #app .ir-export-menu-trigger>.nav-icon{grid-column:auto!important}html body.ir-object-overview #app .ir-export-menu-items{position:fixed!important;top:auto!important;left:8px!important;right:8px!important;width:auto!important;max-height:60vh!important;overflow:auto!important;transform:none!important;margin-top:6px!important}html body.ir-object-overview #app .ir-export-topnav .nav-icon,html body.ir-object-overview #app .ir-export-topnav .nav-icon svg{flex-basis:17px!important;width:17px!important;height:17px!important}html body.ir-object-overview #app .ir-export-theme{position:sticky!important;right:0!important;z-index:2!important;flex:none!important;width:36px!important;height:36px!important;margin:0 0 0 auto!important;border-radius:10px 0 0 10px!important;box-shadow:-6px 0 10px rgba(15,40,60,.08)!important}html body.ir-object-overview #app .ir-export-topnav .ir-export-scheme-title{margin:-4px 0 4px!important;padding:5px 12px 6px!important}}",
    "html.ir-dark body.ir-object-overview #app .ir-export-toplink:not(.active):hover,html.ir-dark body.ir-object-overview #app .ir-export-menu-trigger:hover{background:#1d242b!important}",
    "html body.ir-object-overview #app .ir-export-brand{align-items:center!important;flex:none!important;padding:0 14px 0 6px!important;border:0!important;background:none!important}.ir-export-brand img{display:block;max-height:34px;max-width:130px;object-fit:contain}",
    "html body.ir-object-overview:has(#section-scheme:target) .ir-export-brand img{max-height:24px}",
    "html body.ir-object-overview #app #section-scheme.ir-export-scheme3d-group:target .ir-export-scheme3d{position:fixed;left:0;right:0;bottom:0;top:var(--ir-scheme-top,62px);width:auto;height:auto!important;min-height:0;margin:0;border:0;border-radius:0;z-index:5}",
    "html body.ir-object-overview:has(#section-scheme:target) #app>:not(.ir-export-topnav):not(#section-scheme){display:none!important}",
    "html body.ir-object-overview:has(#section-scheme:target) .ir-export-topnav .ir-export-toplink[href=\"#section-scheme\"]{background:#246da7!important;color:#fff!important;border-color:#246da7!important}",
    "html body.ir-object-overview #app .ir-export-theme{position:static;flex:none;align-self:center;display:grid!important;visibility:visible!important;place-items:center;width:38px;height:38px;margin:0 6px 0 8px;padding:0;border:1px solid #d3dfe8;border-radius:10px;background:#fff;color:#24435c;cursor:pointer;box-shadow:none}",
    ".ir-export-theme svg{width:20px;height:20px}.ir-export-theme:focus-visible{outline:2px solid #2b7cc0;outline-offset:2px}",
    "html.ir-dark,html.ir-dark body{background:#111417!important}",
    "html.ir-dark{color-scheme:dark}html.ir-dark #app img{opacity:.92}",
    "html.ir-dark body.ir-object-overview #app .ir-export-theme{background:#22282f;border-color:#3a434d;color:#e7edf3}",
    "@media(max-width:650px){html body.ir-object-overview #app .ir-export-theme{width:34px;height:34px}}",
    "html body.ir-object-overview #app .ir-export-lang{width:auto;min-width:42px;padding:0 8px;margin-right:0;font:700 12px/1 Inter,\"Segoe UI\",Arial,sans-serif;letter-spacing:.03em}",
    // (on a phone the theme icon stays at the right end over the menu — the language button beside it, one pair)
    "@media(max-width:700px){html body.ir-object-overview #app .ir-export-lang{right:36px!important;width:auto!important;min-width:40px!important;padding:0 6px!important}html body.ir-object-overview #app .ir-export-lang+.ir-export-theme{margin-left:0!important;border-radius:0!important;box-shadow:none!important;border-left:0!important}}",
    // (the report on a phone, the engineer, 09.11.2026 «подправь косяки в отчете в мобильной»: ҚАЗ and the theme no longer lie
    // over the sections of the menu — they stand in their own place at the right of the bar, the sections scroll beside them;
    // a card of the marks list — two rows without empty places: number, mark and name, quantity, arrow; the code in one line
    // beside the status)
    "@media(max-width:700px){html body.ir-object-overview #app .ir-export-topnav-inner{position:static!important;width:auto!important;margin-right:86px!important;padding-right:4px!important}html body.ir-object-overview #app .ir-export-topnav-inner:not(:has(.ir-export-lang)){margin-right:48px!important}html body.ir-object-overview #app .ir-export-topnav .ir-export-theme{position:absolute!important;top:auto!important;bottom:4px!important;right:8px!important;width:36px!important;height:36px!important;margin:0!important;border:1px solid #d3dfe8!important;border-radius:10px!important;box-shadow:none!important}html body.ir-object-overview #app .ir-export-topnav .ir-export-theme.ir-export-lang{right:50px!important;width:36px!important;min-width:36px!important;padding:0!important;font-size:11px!important}html.ir-dark body.ir-object-overview #app .ir-export-topnav .ir-export-theme{border-color:#3a434d!important}}",
    "@media(max-width:640px){body.ir-object-overview #app #section-marks .ir-export-mark-brief{display:grid!important;grid-template-columns:18px minmax(0,1fr) auto 32px!important;grid-template-areas:'num main qty chev' 'code code badge badge'!important;align-items:center!important;gap:8px!important;min-height:0!important;padding:10px 12px!important}body.ir-object-overview #app #section-marks .ir-export-mark-num{grid-area:num!important;align-self:start!important;padding-top:3px!important;text-align:left!important}body.ir-object-overview #app #section-marks .ir-export-mark-main{grid-area:main!important;gap:2px!important}body.ir-object-overview #app #section-marks .ir-export-mark-brief-qty{grid-area:qty!important;flex:none!important;white-space:nowrap!important}body.ir-object-overview #app #section-marks .ir-export-mark-card .ir-export-daily-chevron{grid-area:chev!important;margin:0!important}body.ir-object-overview #app #section-marks .ir-export-mark-brief-code{grid-area:code!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;overflow-wrap:normal!important;text-align:left!important}body.ir-object-overview #app #section-marks .ir-export-mark-badge{grid-area:badge!important;min-width:0!important;white-space:nowrap!important}}",
    ".ir-export-table-wrap{overflow-x:auto;border:1px solid #e3ebf1;border-radius:10px;background:#fff}.ir-export-table{width:100%;border-collapse:collapse;font-size:13px;color:#24435c}",
    ".ir-export-table th{background:#eef5fb;color:#55708a;font-weight:700;text-align:left;padding:10px 12px;border-bottom:1px solid #dbe6ef;white-space:nowrap}",
    ".ir-export-table td{padding:10px 12px;border-bottom:1px solid #edf1f4;vertical-align:top}.ir-export-table tr:last-child td{border-bottom:0}.ir-export-table td small{display:block;color:#7a8fa3;font-size:11.5px;margin-top:2px}",
    ".ir-export-table td:first-child{color:#8aa0b4;width:34px}.ir-export-ok{color:#13895a;font-weight:700}.ir-export-warn{color:#c0612b;font-weight:700}",
    ".ir-export-exd{display:grid;gap:16px}.ir-export-exd-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ir-export-exd-stats>div{border:1px solid #e3ebf1;border-radius:10px;background:#fbfdff;padding:10px 14px}",
    ".ir-export-exd-stats small{display:block;color:#7a8fa3;font-size:12px}.ir-export-exd-stats b{font-size:20px;color:#1f3d55}.ir-export-exd-block h3{margin:0 0 8px;font-size:15px;color:#1f3d55}.ir-export-exd-block h3 small{color:#7a8fa3;font-weight:600;font-size:12px;margin-left:6px}",
    ".ir-export-letter-subject{display:block;font-style:normal;font-weight:500;color:#5b7389;font-size:12.5px;margin-top:2px}.ir-export-letter-sent{color:#13895a!important}.ir-export-letter-draft{color:#c0612b!important}",
    ".ir-export-letter-text{margin:10px 0;padding:16px 18px;border:1px solid #e3ebf1;border-radius:10px;background:#fff;font:14px/1.6 'Times New Roman',Georgia,serif;color:#1d2b38;overflow-wrap:anywhere}.ir-export-letter-text p{margin:0 0 8px}.ir-export-letter-text table{border-collapse:collapse}.ir-export-letter-text td,.ir-export-letter-text th{border:1px solid #c9d5df;padding:4px 8px}",
    // (a phone: the wide table of the acts scrolls inside its frame — as a grid item it widened the whole page, and the page
    // went sideways: the engineer's screenshot, 06.11.2026; and nothing of the report wider than the window)
    ".ir-export-exd{grid-template-columns:minmax(0,1fr)}.ir-export-exd>*,.ir-export-exd-block{min-width:0}.ir-export-table-wrap{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}",
    // (a phone: the readiness by work types — each row a card, the headings over the values — not a six-column table
    // wider than the screen: the engineer's screenshot, 06.11.2026)
    "@media(max-width:700px){html body.ir-object-overview #app .ir-export-mark-switcher{padding:10px!important}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-head{display:none!important}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;grid-template-areas:'name name' 'code count' 'bar bar' 'fact left'!important;align-items:start!important;gap:8px 12px!important;min-width:0!important;padding:12px!important;border:1px solid #e3ebf1!important;border-radius:10px!important;margin:0 0 8px!important;font-size:12px!important}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-name{grid-area:name}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-code{grid-area:code;min-width:0;overflow-wrap:anywhere}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-count{grid-area:count}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-progress{grid-area:bar}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-fact{grid-area:fact}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-left{grid-area:left}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row :is(.ir-export-mark-code,.ir-export-mark-count,.ir-export-mark-fact,.ir-export-mark-left):before{display:block;margin:0 0 2px;color:#7a8fa3;font-size:10.5px;font-weight:700}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-code:before{content:'Шифр'}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-count:before{content:'Всего марок'}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-fact:before{content:'Смонтировано'}html body.ir-object-overview #app .ir-export-mark-switcher .ir-export-mark-row .ir-export-mark-left:before{content:'Осталось'}html body.ir-object-overview #app .ir-export-marks-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}",
    ".ir-export-indicator-link i{display:grid!important;place-items:center!important;flex:0 0 22px!important;width:22px!important;height:22px!important}.ir-export-indicator-link i svg{display:block;width:20px;height:20px}",
    // (a phone: the facts of the header one under another, each with its icon, no dividers; the participants compact —
    // the logo 96×52 beside the name; the indicator cards without empty height; the engineer, 06.11.2026)
    "@media(max-width:700px){html body.ir-object-overview #app .ir-export-hero-facts{flex-direction:column!important;flex-wrap:nowrap!important;gap:8px!important;margin-top:4px!important}html body.ir-object-overview #app .ir-export-hero-fact,html body.ir-object-overview #app .ir-export-hero-fact:first-child{flex:none!important;max-width:none!important;padding:0!important;border:0!important;gap:10px!important;align-items:center!important}html body.ir-object-overview #app .ir-export-hero-fact-icon,html body.ir-object-overview #app .ir-export-hero-fact-icon svg{width:20px!important;height:20px!important;flex-basis:20px!important}html body.ir-object-overview #app .ir-export-banner-copy{padding:16px 14px!important;gap:10px!important;justify-content:flex-end!important}html body.ir-object-overview #app .ir-export-banner-copy h1{font-size:19px!important;-webkit-line-clamp:4!important}html body.ir-object-overview #app .ir-export-companies{padding:6px 12px!important}html body.ir-object-overview #app .ir-export-company-card{grid-template-columns:96px minmax(0,1fr)!important;min-height:0!important;gap:12px!important;padding:8px 0!important}html body.ir-object-overview #app .ir-export-company-logo,html body.ir-object-overview #app .ir-export-company-contractor .ir-export-company-logo,html body.ir-object-overview #app .ir-export-company-own .ir-export-company-logo{height:52px!important;min-height:52px!important;max-height:52px!important;padding:4px!important}html body.ir-object-overview #app .ir-export-company-logo img{max-height:44px!important}html body.ir-object-overview #app .ir-export-company-name{font-size:12.5px!important}html body.ir-object-overview #app .ir-export-indicator-card{min-height:0!important;padding:12px 10px 10px!important}html body.ir-object-overview #app .ir-export-indicator-card p{min-height:0!important}html body.ir-object-overview #app .ir-export-indicator-link{min-height:46px!important;padding:10px 12px!important}}",
    "html body.ir-object-overview #app{overflow-x:clip!important}html body.ir-object-overview #app :is(.ir-export-group,.ir-export-section){min-width:0!important;max-width:100%!important}",
    "@media(max-width:650px){.ir-export-exd-stats{grid-template-columns:1fr}.ir-export-table{font-size:12px}.ir-export-table th,.ir-export-table td{padding:8px}}",
    "@media print{.ir-export-theme{display:none}html.ir-dark #app,html.ir-dark #app img{filter:none}html.ir-dark,html.ir-dark body{background:#fff!important}html body.ir-object-overview #app #section-scheme.ir-export-group:not(:target){display:block!important}}"
   ].join("\n");
   const extras=window.irObjectExportExtras;
   if(!extras)throw new Error("Модуль экспорта разделов не загружен. Перезапустите IR Project.");
   const trendHtml=keys.includes("schedule")?renderExportTrend(supporting[1],supporting[0]):"";
   // The scheme of the report is the exported scheme (the engineer, 06.11.2026: «монтажную схему выведи ту которую мы при
   // выгрузке используем … 100%. В будущем если какие-то изменения в выгруженной схеме делаем, но и в отчетной»): its
   // data gathered as by the «HTML» button (src/scheme-page.js, exportData) and its page built by the same code.
   let schemePage="";if(keys.includes("scheme"))await bar.step(.62,"Монтажная схема — элементы, узлы, болты");
   if(keys.includes("scheme")&&typeof window.irSchemePage==="function"&&window.irSchemeHtmlExport?.build){
    try{const data=await window.irSchemePage(id,{exportData:true});if(data){data.shots=[];if(selection.underContractor)data.company={name:"",logo:""};schemePage=await window.irSchemeHtmlExport.build(data)}}
    catch(error){console.warn("Object HTML: the exported scheme was not built",error);schemePage=""}
   }
   await bar.step(.88,"Сборка страниц отчёта");
   const sectionsHtml=keys.map(key=>renderSection(key,rows[key]||[],photos,overviewSnapshot.preview[key]||"",{workTypes:supporting[0],reports:supporting[1],marks:supporting[2],markNames,schemeDetails,supplyModel,trendHtml,schemePage:Boolean(schemePage)})).join("");
   let viewerScripts="",viewerCsp="";
   const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
   const safeJson=value=>JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
   if(schemePage){
    const EMBED_CSS=[
     ".wrap>.hx,#bgBtn{display:none!important}",
     ":root{--bg:#f4f8fc;--card:#fff;--ink:#21435b;--muted:#6f879b;--line:#dce5ed;--accent:#246da7}",
     "body{font-family:Inter,'Segoe UI',Arial,sans-serif;color:var(--ink);background:var(--bg)}",
     ".stage-bar{background:#fff;padding:5px 10px;gap:6px}",
     ".stage-bar button,.stage-bar label{border:1px solid #dae6ef;border-radius:9px;color:#315a76;font-weight:650;font-size:12px;padding:4px 9px;background:#fff}",
     ".stage-bar button:hover,.stage-bar label:hover{background:#f4f8fc}.box{border-radius:12px;border-color:var(--line)}.box h3{color:#6f879b}",
     "html.ir-dark .stage-bar button,html.ir-dark .stage-bar label{color:#d5e2ee}"
    ].join("\n");
    // (the frame takes the rule of the report: its scripts with the report's nonce, the scripts it unpacks — with theirs)
    const inner=schemePage.replace(/<script(?=[\s>])/g,'<script nonce="'+nonce+'"');
    viewerScripts+='<script type="application/json" id="ir-export-scheme-page" nonce="'+nonce+'">'+safeJson(inner)+'</script><script nonce="'+nonce+'">(function(){var box=document.getElementById("ir-export-scheme3d"),src=document.getElementById("ir-export-scheme-page"),f=null;'+
     'function fit(){var n=document.querySelector(".ir-export-topnav");if(box)box.style.setProperty("--ir-scheme-top",(n&&n.offsetParent!==null?n.offsetHeight:0)+"px")}'+
     // (a reload on the scheme: the browser put back the scroll of before after the first measure, and the scheme stood
     // half down the window without the menu — the engineer, 06.11.2026 «после перезагрузки страницы»)
     'try{history.scrollRestoration="manual"}catch(e){}addEventListener("load",function(){if(location.hash==="#section-scheme"){scrollTo(0,0);fit()}});setTimeout(fit,300);setTimeout(fit,1500);'+
     'function open(){if(location.hash==="#section-scheme"){scrollTo(0,0);fit()}if(f||!box||!src||location.hash!=="#section-scheme")return;f=document.createElement("iframe");f.className="ir-export-scheme3d-frame";f.title="Монтажная схема";f.setAttribute("allow","fullscreen");f.setAttribute("allowfullscreen","");'+
     // (the scheme inside the report looks as the report: no header of its own, the report's font, colours and buttons;
     // the report's theme on it — dark the whole scheme and its 3D background: the engineer, 06.11.2026 «если стоит темная
     // тема, то везде будет темная и в монтажной схеме. Монтажная схема не как отдельная страница со своими стилями»)
     'f.addEventListener("load",function(){var d=f.contentDocument;if(!d)return;'+
     // («На весь экран» of the scheme — the report puts its frame on the screen: asked from inside the frame it was refused,
     // «Disallowed by permissions policy» — the engineer, 06.11.2026; where the screen is not given, the frame covers the window)
     'd.addEventListener("click",function(e){if(!e.target||!e.target.closest||!e.target.closest("#full"))return;e.stopImmediatePropagation();e.preventDefault();if(document.fullscreenElement){document.exitFullscreen().catch(function(){});return}if(document.body.classList.contains("ir-scheme-max")){document.body.classList.remove("ir-scheme-max");return}var go=box.requestFullscreen?box.requestFullscreen():Promise.reject();go.catch(function(){document.body.classList.add("ir-scheme-max")})},true);'+
     'd.addEventListener("pointerdown",function(){[].forEach.call(document.querySelectorAll(".ir-export-topnav details[open]"),function(x){x.removeAttribute("open")})},true);var st=d.createElement("style");st.id="ir-embed";st.textContent='+JSON.stringify(EMBED_CSS)+';d.head.appendChild(st);'+
     'window.__irLangSync&&window.__irLangSync();window.__irSchemeTheme=('+exportTheme.toString()+')(d,{scope:""});window.__irSchemeSync&&window.__irSchemeSync();f.style.visibility=""});'+
     // (the page of the scheme packed — unpacked here; written plain in a report of before)
     '(src.type==="application/gzip"?new Response(new Blob([Uint8Array.from(atob(src.textContent),function(c){return c.charCodeAt(0)})]).stream().pipeThrough(new DecompressionStream("gzip"))).text():Promise.resolve(JSON.parse(src.textContent))).then(function(page){'+
     'var dk=document.documentElement.classList.contains("ir-dark");if(dk){f.style.visibility="hidden";page=page.replace(/<head>/i,function(h){return h+\'<script nonce="'+nonce+'">window.__irBg="dark"<\\/script><style>html,body{background:#0f1317!important}</style>\'})}'+
     'f.srcdoc=page;box.textContent="";box.appendChild(f)}).catch(function(){box.textContent="Монтажная схема не открылась в этом браузере — откройте отчёт в Chrome, Edge или Safari."})}'+
     // (the theme of the report given to the scheme: its page and its 3D background — once the 3D button is there)
     'window.__irSchemeSync=function(){var d=f&&f.contentDocument,T=window.__irSchemeTheme;if(!d||!T)return;var dark=document.documentElement.classList.contains("ir-dark");'+
     'T.light();if(dark)T.dark();d.documentElement.classList.toggle("ir-dark",dark);var b=d.getElementById("bgBtn"),tries=0,bg=function(){b=d.getElementById("bgBtn");var w=d.defaultView;dark=document.documentElement.classList.contains("ir-dark");if(b&&(b.getAttribute("aria-pressed")==="true")!==dark)b.click();if((!b||!w||w.__irOk===undefined)&&tries++<300)setTimeout(bg,200)};bg()};'+
     'addEventListener("hashchange",open);addEventListener("resize",fit);open()})();</script>'
   }else if(keys.includes("scheme")){
    const scheme=extras.schemeData(rows.scheme||[],schemeDetails);
    const engine="("+extras.schemeViewer.toString()+")();";
    viewerScripts+='<script type="application/json" id="ir-export-scheme-data" nonce="'+nonce+'">'+safeJson(scheme)+'</script><script nonce="'+nonce+'">'+engine+'</script>'
   }
   // (the menu shows where the reader is — the section opened, not always «Обзор объекта»; an open menu closes by a click
   // elsewhere, Esc or a choice: the engineer, 06.11.2026 «открытые окна закрываются при нажатие в другую область экрана,
   // меню также. при переключение в меню не показывается активная вкладка, всегда обзор объекта»)
   viewerScripts+='<script nonce="'+nonce+'">(function(){'+
    'function mark(){var h=location.hash&&location.hash!=="#"?location.hash:"#overview";'+
    '[].forEach.call(document.querySelectorAll(".ir-export-topnav a.ir-export-toplink,.ir-export-topnav a.ir-export-subnav-link"),function(a){a.classList.toggle("active",a.getAttribute("href")===h)});'+
    '[].forEach.call(document.querySelectorAll(".ir-export-menu"),function(m){m.classList.toggle("active",!!m.querySelector("a.active"))});'+
    'var act=document.querySelector(".ir-export-topnav a.ir-export-toplink.active")||document.querySelector(".ir-export-menu.active"),row=act&&act.parentNode;if(row&&row.scrollWidth>row.clientWidth)row.scrollLeft=Math.max(0,act.offsetLeft-(row.clientWidth-act.offsetWidth)/2)}'+
    'function shut(except){[].forEach.call(document.querySelectorAll("details[open]"),function(x){if(x!==except&&!x.contains(except))x.removeAttribute("open")})}'+
    'window.__irShutMenus=function(){shut(null)};'+
    'document.addEventListener("click",function(e){var t=e.target,d=t&&t.closest?t.closest("details"):null;if(t&&t.closest&&t.closest(".ir-export-menu-items a")){shut(null);return}if(!d||!d.closest(".ir-export-topnav,.ir-export-menu")){[].forEach.call(document.querySelectorAll(".ir-export-topnav details[open]"),function(x){x.removeAttribute("open")})}else shut(d)});'+
    'document.addEventListener("keydown",function(e){if(e.key==="Escape")[].forEach.call(document.querySelectorAll(".ir-export-topnav details[open]"),function(x){x.removeAttribute("open")})});'+
    'addEventListener("hashchange",mark);mark()})();</script>';
   if(trendHtml&&keys.includes("schedule"))viewerScripts+='<script nonce="'+nonce+'">(function(){document.querySelectorAll("[data-export-trend-select]").forEach(function(select){var root=select.closest(".ir-export-trend");function update(){root.querySelectorAll("[data-export-trend-panel]").forEach(function(panel){panel.hidden=panel.getAttribute("data-export-trend-panel")!==select.value;});}select.addEventListener("change",update);update();});})();</script>';
   if(supplyModel){
    const engine="("+window.irSupplyChartFactory.toString()+")().initOffline();";
    viewerScripts+='<script type="application/json" id="ir-supply-chart-data" nonce="'+nonce+'">'+safeJson(supplyModel)+'</script><script nonce="'+nonce+'">'+engine+'</script>';
   }
   const moon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>',
    sun='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
   const themeButton='<button type="button" class="ir-export-theme" id="ir-export-theme" title="Тёмная тема" aria-label="Тёмная тема" aria-pressed="false">'+moon+'</button>';
   viewerScripts+='<script nonce="'+nonce+'">(function(){var b=document.getElementById("ir-export-theme"),k="ir-project.object-export-theme",moon='+JSON.stringify(moon)+',sun='+JSON.stringify(sun)+',T=('+exportTheme.toString()+')();'+
    'function paint(d){T.light();if(d)T.dark();document.documentElement.classList.toggle("ir-dark",d);window.__irSchemeSync&&window.__irSchemeSync();document.documentElement.classList.remove("ir-dark-wait");b.innerHTML=d?sun:moon;b.title=d?"Светлая тема":"Тёмная тема";b.setAttribute("aria-label",b.title);b.setAttribute("aria-pressed",String(d))}'+
    'var d=false;try{d=localStorage.getItem(k)==="dark"}catch(e){}paint(d);'+
    'b.addEventListener("click",function(){d=!document.documentElement.classList.contains("ir-dark");paint(d);try{localStorage.setItem(k,d?"dark":"light")}catch(e){}});'+
    'addEventListener("beforeprint",function(){T.light()});addEventListener("afterprint",function(){if(d)T.dark()})})();</script>';
   // (the report in Kazakh: the button РУС/ҚАЗ beside the theme — the words of the report and of its scheme put into Kazakh and
   // back, the data as entered; the choice kept — the engineer, 06.11.2026 «Сделай перевод выгруженного отчета на казахский
   // язык, кнопку переключения рус-каз»; src/object-export-kk.js)
   const kk=window.irReportKk;let langButton="";
   if(kk&&typeof kk.runtime==="function"){
    langButton='<button type="button" class="ir-export-theme ir-export-lang" id="ir-export-lang" title="Қазақша" aria-label="Қазақша" aria-pressed="false" lang="kk">ҚАЗ</button>';
    viewerScripts+='<script nonce="'+nonce+'">(function(){var K=('+kk.runtime.toString()+')('+safeJson(kk.dict)+','+safeJson(kk.patterns)+'),b=document.getElementById("ir-export-lang"),key="ir-project.object-export-lang",main=K.make(document),fd=null,fk=null,on=false;'+
     'if(!b)return;function frame(){var f=document.querySelector(".ir-export-scheme3d-frame"),d=f&&f.contentDocument;if(!d||!d.body)return null;if(fd!==d){fd=d;fk=K.make(d)}return fk}'+
     'function paint(){main.set(on);var x=frame();if(x)x.set(on);b.textContent=on?"РУС":"ҚАЗ";b.title=on?"Орысша":"Қазақша";b.setAttribute("lang",on?"ru":"kk");b.setAttribute("aria-label",b.title);b.setAttribute("aria-pressed",String(on))}'+
     'try{on=localStorage.getItem(key)==="kk"}catch(e){}window.__irLangSync=function(){var x=frame();if(x)x.set(on)};if(on)paint();'+
     'b.addEventListener("click",function(){on=!on;paint();try{localStorage.setItem(key,on?"kk":"ru")}catch(e){}})})();</script>'
   }
   if(viewerScripts)viewerCsp="; script-src 'nonce-"+nonce+"'; connect-src 'none'; object-src 'none'";
   const generated=new Date().toLocaleString("ru-RU");
   // (a dark report opens dark: the page waits hidden on the dark background until the dark colours are made — the engineer,
   // 06.11.2026 «весь отчет то белый, то темный при перезагрузке. если стоял темный режим»)
   let html='<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:'+viewerCsp+'"><title>'+esc(object.name||"IR Project")+' — отчёт объекта</title><style>html.ir-dark-wait,html.ir-dark-wait body{background:#111417!important}html.ir-dark-wait body>*{visibility:hidden!important}</style>'+(viewerScripts?'<script nonce="'+nonce+'">try{if(localStorage.getItem("ir-project.object-export-theme")==="dark"){document.documentElement.classList.add("ir-dark-wait");setTimeout(function(){document.documentElement.classList.remove("ir-dark-wait")},15000)}}catch(e){}</script>':'')+'<style>'+css+'</style><style>'+extraStyles+'\n'+(extras?.css||'')+'\n'+(supplyModel?window.irSupplyChart.css:'')+'\n'+activeNavStyles+'\n'+pageStyles+'</style></head><body class="ir-object-route ir-object-overview"><main id="app">'+htmlSnapshot+sectionsHtml+'<footer class="ir-export-section"><b>IR Project</b> · Снимок объекта от '+esc(generated)+'. Только просмотр. Данные не связаны с рабочей базой.</footer></main>'+viewerScripts+'</body></html>';
   // (the theme switch an icon of the menu itself — the engineer, 06.11.2026 «переключение режима в выгруженном отчете
   // встрой в меню как иконку»)
   html=html.replace('</details></div></nav>',()=>'</details>'+langButton+themeButton+'</div></nav>');
   if(companyHeader.brandLogo)html=html.replace('<div class="ir-export-topnav-inner">',()=>'<div class="ir-export-topnav-inner"><a class="ir-export-brand" href="#overview" title="'+esc(companyHeader.brandName||"")+'"><img src="'+esc(companyHeader.brandLogo)+'" alt="Логотип"></a>');
   const exportedDate=new Date().toLocaleDateString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"})+"г";
   html=html.replace('<div class="ir-export-topnav-inner">',()=>'<div class="ir-export-scheme-title">'+(companyHeader.brandLogo?'<img src="'+esc(companyHeader.brandLogo)+'" alt="Логотип">':'')+'<b>'+esc(object.name||object.short_name||"Объект")+'</b><span>Отчёт от '+esc(exportedDate)+'</span></div><div class="ir-export-topnav-inner">');
   // (lighter: only the styles the report uses, a twice-written rule once; the scheme packed)
   await bar.step(.93,"Сжатие отчёта");
   try{html=slimReportStyles(html,[css,extraStyles,pageStyles]);html=await packSchemePage(html)}catch(e){console.warn("Сжатие отчёта:",e)}
   // (the name of the report: «Отчёт на 06.11.2026г., <short name of the object>» — the file and the page's title; the
   // engineer, 06.11.2026 «При выгрузке пиши в название отчета. Отчет на 06.11.2026г. (Пример), Краткое название объекта»)
   const reportName="Отчёт на "+exportedDate+"., "+String(object.short_name||object.name||"Объект").trim();
   html=html.replace(/<title>[^<]*<\/title>/,()=>"<title>"+esc(reportName)+"</title>");
   if(selection.underContractor)html=redactCompanyIdentity(html,companyHeader.ownName);
   const name=safeFile(reportName);
   const fileName=selection.underContractor?redactCompanyIdentity(name,companyHeader.ownName).trim()||"Объект":name;
   if(selection.share){
    await bar.step(.96,"Отправка отчёта на сервер компании");
    const r=await irProject.ai.invoke("ai-settings:server-report-share",{objectId:id,objectName:object.name||object.short_name||"",title:reportName,html});
    bar.done();bar=null;showReportLink(id,r);return true
   }
   await bar.step(.96,"Сохранение файла");
   const result=await irProject.reportExport.html(html,fileName+".html");
   if(result&&typeof window.irProjectNotice==="function")window.irProjectNotice("HTML-отчёт объекта сохранён. Файл доступен только для просмотра.","success");
   return result
  }catch(error){
   console.error("HTML export of object failed",error);
   if(typeof window.irProjectNotice==="function")window.irProjectNotice("Не удалось выгрузить объект: "+String(error?.message||error),"error");
   else alert("Не удалось выгрузить объект: "+String(error?.message||error));
   return false
  }finally{exportObject.busy=false;if(bar)bar.done()}
 }
 // (the daily report saved as HTML takes the same dark theme and the same slimming of styles: src/report-export-html.js)
 window.irObjectHtmlExport={save:exportObject,theme:exportTheme,slimCss};
})();
