"use strict";
/* Self-contained read-only HTML object archive. Source DB is never changed. */
(()=>{
 const labels={overview:"Обзор объекта",reports:"Ежедневные отчёты","extra-works":"Дополнительные работы","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
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
 async function inlinePhotos(sectionRows){
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
   const details=[["ID",r.id],["Тип",r.record_type],...entries];
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
  const paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h5"/>',weather:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12h2M20 12h2"/>',people:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',equipment:'<path d="M3 18h18M5 18V8h8l5-4M18 4l3 3M5 8l7 6M7 19h.01M17 19h.01"/>',volume:'<path d="m3 7 9-4 9 4-9 4-9-4M3 7v10l9 4 9-4V7M12 11v10"/>'};
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
 function reportWorkTable(works){
  if(!works.length)return'<p class="ir-export-muted">Работы не проводились</p>';
  const rows=works.map(w=>{
   const service=reportService(w),status=service?(w.completed===true||w.service_completed===true||w.status==="done"?"Выполнено":"Не выполнено"):exportFormat(reportVolume(w))+" "+String(w.unit||"");
   return'<tr><td><b>'+esc(w.work_type||w.type||"Работа")+'</b></td><td>'+esc(w.project_code||w.code||"—")+'</td><td>'+esc(w.mark||w.name||"—")+'</td><td>'+esc(w.qty??w.count??w.quantity??"—")+'</td><td><b>'+esc(status)+'</b></td></tr>'
  }).join("");
  return'<div class="ir-export-daily-table"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка / наименование</th><th>Кол-во</th><th>Выполнено</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
 }
 function reportFull(record,r,images){
  const works=reportWorks(r),workers=reportPeople(r),responsible=reportResponsible(r),equipment=array(r.equipment),photos=reportPhotos(r);
  const photoItems=photos.map((p,i)=>{
   const path=photoPath(p),source=dataUrl(path)?path:images.get(path);
   if(!source)return null;
   const id='ir-export-daily-photo-'+String(record.id).replace(/[^a-z0-9_-]/gi,'-')+'-'+i;
   const tile='<figure><a class="ir-export-daily-photo-link" href="#'+esc(id)+'" title="Увеличить фото"><img src="'+esc(source)+'" loading="lazy" alt="Фото отчёта '+(i+1)+'"></a><figcaption>Фото '+(i+1)+'</figcaption></figure>';
   const lightbox='<div class="ir-export-gallery-lightbox" id="'+esc(id)+'"><a class="ir-export-gallery-shade" href="#section-reports" aria-label="Закрыть фото"></a><figure><img src="'+esc(source)+'" alt="Фото отчёта '+(i+1)+'"><figcaption>Фото '+(i+1)+'<a href="#section-reports">✕ Закрыть</a></figcaption></figure></div>';
   return{tile,lightbox}
  }).filter(Boolean);
  const photoHtml=photoItems.map(x=>x.tile).join("");
  const photoLightboxes=photoItems.map(x=>x.lightbox).join("");
  return'<div class="ir-export-daily-full">'+
   '<section><h3>Выполненные работы</h3>'+reportWorkTable(works)+'</section>'+
   '<div class="ir-export-daily-columns"><section><h3>Работники</h3>'+reportChips(workers,"workers")+'</section><section><h3>Ответственные лица</h3>'+reportChips(responsible,"responsible")+'</section></div>'+
   '<section><h3>Техника</h3>'+reportChips(equipment,"equipment")+'</section>'+
   (photoHtml?'<section><h3>Фотографии · '+photoItems.length+'</h3><div class="ir-export-daily-photos">'+photoHtml+'</div></section>':'')+
   photoLightboxes+'</div>'
 }

 function exportMoreCards(htmlList,kind,totalCount=htmlList.length,totalUnits=0){
  const first=htmlList.slice(0,5).join("");
  if(htmlList.length<=5)return first;
  const other=htmlList.slice(5).join("");
  const suffix=kind==="reports"?"отчётов":kind==="positions"?"позиций":("групп · "+exportFormat(totalUnits)+" шт.");
  return first+'<details class="ir-export-more ir-export-more-'+esc(kind)+'"><summary><span class="ir-export-more-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span><span class="ir-export-more-show">Показать ещё (всего '+totalCount+' '+suffix+')</span><span class="ir-export-more-hide">Свернуть (показать первые 5)</span></summary><div class="ir-export-more-items">'+other+'</div></details>'
 }

 function renderDailyReports(rows,images){
  if(!rows.length)return'<div class="ir-export-empty-card">Ежедневных отчётов пока нет</div>';
  const numbers=new Map([...rows].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1]));
  const ordered=[...rows].sort((a,b)=>String(b.data?.date||b.data?.report_date||"").localeCompare(String(a.data?.date||a.data?.report_date||""))||(Number(b.id)||0)-(Number(a.id)||0));
  const cards=ordered.map((record,i)=>{
   const r={...record.data},no=numbers.get(String(record.id))||i+1;
   return'<article class="ir-export-daily-card"><details'+(i===0?' open':'')+'><summary>'+reportBrief(r,no)+'</summary>'+reportFull(record,r,images)+'</details></article>'
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
    (previews[key]??=[]).push('<div class="ir-object-overview-right ir-export-preview-layout"><div class="'+wrapper+'">'+(key==="schedule"?schedulePreviewHtml(card):card.outerHTML)+'</div></div>');
    card.remove()
   }
  }
  copy.querySelectorAll(".ir-object-overview-placeholder").forEach(el=>el.remove());
  const right=copy.querySelector(".ir-object-overview-right");
  if(right&&!right.querySelector(".oor2-card,.ood-card,.object-overview-schedule,.object-overview-marks-card,.ooa-card"))right.remove();
  return Object.fromEntries(Object.entries(previews).map(([key,value])=>[key,value.join("")]))
 }


 function markProgressGroups(markRows,workRows,reportRows){
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
   const wid=String(d.work_type_id||""),work=catalog.get(wid),name=String(work?.name||d.work_type||raw.title||"Без вида работ").trim(),code=String(d.project_code||work?.code||d.code||"").trim();
   const code2=String(d.project_code_2||work?.code2||"").trim();
   const key=(wid||normalize(name))+"|"+normalize(code)+"|"+normalize(code2);
   if(!groups.has(key))groups.set(key,{workId:wid,name,code,code2,total:0,mounted:0,remaining:0,positions:0});
   const mark=groups.get(key),markId=String(raw.id);
   const fromReports=mountedMap.get(markId),done=Math.min(qty,Math.max(0,fromReports==null?exportNumber(d.mounted??d.done):fromReports));
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
   '<div class="ir-export-mark-name"><b>'+esc(group.name)+'</b><small>'+group.positions+' позиций</small></div>'+
   '<div class="ir-export-mark-code"><b>'+esc(group.code||"Без шифра")+'</b>'+(group.code2?'<small>Доп. шифр: '+esc(group.code2)+'</small>':"")+'</div>'+
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
  const left=Math.max(0,total-mounted),percent=total?Math.round(mounted/total*1000)/10:0;
  return'<div class="ir-export-marks-summary">'+
   '<div class="ir-export-marks-title"><div><h3>Готовность по видам работ</h3><p>Количество отправочных марок в штуках · монтаж из ежедневных отчётов</p></div><b>'+esc(exportFormat(percent))+'%</b></div>'+
   '<div class="ir-export-marks-stats"><div><small>Всего марок</small><b>'+esc(exportFormat(total))+' шт.</b></div><div><small>Смонтировано</small><b>'+esc(exportFormat(mounted))+' шт.</b></div><div><small>Осталось</small><b>'+esc(exportFormat(left))+' шт.</b></div><div><small>Групп видов работ / шифров</small><b>'+groups.length+'</b></div></div>'+
   '<div class="ir-export-mark-switcher"><div class="ir-export-mark-head"><span>Вид работы</span><span>Шифр</span><span>Всего марок</span><span>Шкала прогресса</span><span>Смонтировано, шт. / %</span><span>Осталось, шт. / %</span></div>'+
   markProgressPanel(groups,"all")+'</div></div>'
 }

 function markDetailData(markRows,workRows,reportRows){
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
   const done=Math.min(qty,Math.max(0,fromReports==null?exportNumber(d.mounted??d.done):fromReports));
   const left=Math.max(0,qty-done),pct=qty?Math.min(100,done/qty*100):0;
   const uv=exportNumber(d.unit_volume??d.volume_one??d.volume1),unit=String(d.unit||work.unit||"").trim();
   const rawTotal=d.total_value??d.total_volume;
   const total=rawTotal!==null&&rawTotal!==undefined&&String(rawTotal).trim()!==""?exportNumber(rawTotal):qty*uv;
   return{
    id,index:i+1,workId:String(d.work_type_id||""),mark:String(d.mark||raw.title||"—"),name:String(d.name||"").trim(),
    work:String(work.name||d.work_type||"Без вида работы"),code:String(d.project_code||d.code||work.code||"").trim(),code2:String(d.project_code_2||work.code2||"").trim(),
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
       '<div><small>Вид работы</small><b>'+esc(m.work)+'</b></div>'+
       '<div><small>Шифр</small><b>'+esc(m.code||"—")+'</b>'+(m.code2?'<small>Доп. шифр: '+esc(m.code2)+'</small>':"")+'</div>'+
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
  const catalog=new Map();
  for(const m of marks){
   const id=m.workId||"unassigned",workName=m.work||"Без вида работы";
   if(!catalog.has(id))catalog.set(id,{id,name:workName,marks:[]});
   catalog.get(id).marks.push(m)
  }
  const workChoices=[...catalog.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru",{numeric:true}));
  const controls='<input class="ir-export-work-radio ir-export-work-radio-all" type="radio" name="ir-export-work-filter" id="ir-export-work-all" checked>'+
   workChoices.map((w,i)=>'<input class="ir-export-work-radio ir-export-work-radio-'+i+'" type="radio" name="ir-export-work-filter" id="ir-export-work-'+i+'">').join("");
  const choice=(id,name,count)=>'<label for="'+id+'" title="'+esc(name)+'">'+esc(name)+' <span>'+count+'</span></label>';
  const tabs='<div class="ir-export-work-tabs" role="group" aria-label="Выберите вид работ">'+choice("ir-export-work-all","Все виды работ",marks.length)+
   workChoices.map((w,i)=>choice("ir-export-work-"+i,w.name,w.marks.length)).join("")+'</div>';
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

 function renderSection(key,rows,images,preview="",support={}){
  const extras=window.irObjectExportExtras;
  const body=key==="reports"?renderDailyReports(rows,images):key==="marks"?renderMarkSection(rows,support.workTypes||[],support.reports||[],images):
   key==="deliveries"?extras.deliveries(rows):key==="photos"?extras.recentPhotos(support.reports||[],images):
   key==="scheme"?extras.schemeHtml(extras.schemeData(rows,support.schemeDetails||[])):["schedule","acted-days","penalties"].includes(key)?"":renderRows(rows,key,images);
  if(["schedule","acted-days","penalties"].includes(key))return'<div class="ir-export-group" id="section-'+esc(key)+'">'+(preview?'<div class="ir-export-preview">'+preview+'</div>':'<div class="ir-export-empty-card">Нет данных для анализа</div>')+'</div>';
  if(key==="deliveries")return'<div class="ir-export-group" id="section-deliveries"><section class="ir-export-section ir-export-deliveries-unified">'+
   '<header class="ir-export-section-head"><h2>Поставки и монтаж</h2><span class="ir-export-count">'+rows.length+' накладных</span></header>'+
   (preview?'<div class="ir-export-preview">'+preview+'</div>':"")+
   '<div class="ir-export-delivery-register"><h3>Поставки (накладные)</h3>'+body+'</div></section></div>';
  return'<div class="ir-export-group" id="section-'+esc(key)+'">'+(preview?'<div class="ir-export-preview">'+preview+'</div>':"")+
   '<section class="ir-export-section"><header class="ir-export-section-head"><div><h2>'+esc(labels[key]||key)+'</h2></div>'+(key==="photos"||key==="scheme"?"":'<span class="ir-export-count">'+rows.length+' записей</span>')+'</header>'+body+'</section></div>'
 }

 function companyHeaderHtml(parties){
  const cards=[
   {role:"Заказчик",name:parties.customerName,logo:parties.customerLogo},
   {role:"Генподрядчик",name:parties.contractorName,logo:parties.contractorLogo},
   ...(!parties.underContractor?[{role:"Наша компания",name:parties.ownName,logo:parties.ownLogo}]:[])
  ];
  return'<section class="ir-export-companies'+(cards.length===2?' ir-export-companies-two':'')+'" aria-label="Участники строительства"><div class="ir-export-companies-heading">Участники проекта</div><div class="ir-export-companies-grid">'+cards.map(p=>{
   const img=p.logo?'<img src="'+esc(p.logo)+'" alt="Логотип: '+esc(p.role)+'">':
    '<span class="ir-export-company-no-logo">Логотип не указан</span>';
   return'<article class="ir-export-company-card"><div class="ir-export-company-role">'+esc(p.role)+'</div>'+
    '<div class="ir-export-company-logo">'+img+'</div><div class="ir-export-company-name">'+esc(p.name||"Не указано")+'</div></article>'
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
  return{markup:companyHeaderHtml(identity),ownName:identity.ownName}
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
  const icon=key=>original(key)?.querySelector(".nav-icon")?.innerHTML||"";
  const name=key=>original(key)?.querySelector(".nav-label")?.textContent||labels[key]||key;
  const caret='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const item=key=>'<a class="ir-export-subnav-link" href="#section-'+esc(key)+'"><span class="nav-icon" aria-hidden="true">'+icon(key)+'</span><span class="nav-label">'+esc(name(key))+'</span></a>';
  const items=keys.length?keys.map(item).join(""):'<span class="ir-export-menu-empty">Других разделов нет</span>';
  return'<nav class="ir-export-topnav" aria-label="Навигация по HTML-отчёту">'+
   '<div class="ir-export-topnav-inner">'+
   (includeOverview?'<a class="ir-export-toplink active" href="#overview"><span class="nav-icon" aria-hidden="true">'+icon("overview")+'</span><span>Обзор объекта</span></a>':"")+
   '<details class="ir-export-menu">'+
   '<summary class="ir-export-menu-trigger"><span class="ir-export-menu-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span><span>Разделы меню</span><span class="ir-export-menu-caret">'+caret+'</span></summary>'+
   '<div class="ir-export-menu-items" aria-label="Разделы объекта"><div class="ir-export-menu-caption">ПЕРЕЙТИ К РАЗДЕЛУ</div>'+items+'</div>'+
   '</details></div></nav>'
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

 function renderIndicatorBlock(data,keys){
  const works=array(data["work-types"]),marks=array(data.marks),reports=array(data.reports),deliveries=array(data.deliveries);
  const readiness=exportSummaryCompletion(works,marks,reports);
  const resources=exportLatestResources(reports);
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
  const allUnits=new Set([...totals.mounted.keys(),...totals.delivered.keys()]);
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
  const last=resources.date;
  const icons={
   readiness:'<circle cx="12" cy="12" r="9"/><path d="M12 12V6M12 12l4 3"/>',
   mounted:'<path d="M4 17 10 11l4 4 6-8M15 7h5v5"/>',
   delivered:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8v8H8z"/>',
   reports:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/>',
   resources:'<circle cx="8" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2M17 9h4M19 7v4M15 16l3-5 3 5M14 18h8"/>'
  };
  const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>';
  const cards=[
   ["readiness","Средняя готовность",String(Math.round(readiness)),"%","Среднее по видам работ",""],
   ["mounted","Смонтировано","","","По ежедневным отчётам",orderedUnits.length>1?"Объёмы отдельно по единицам":"Фактический объём"],
   ["delivered","Поставлено","","","По накладным",orderedUnits.length>1?"Объёмы отдельно по единицам":orderedUnits.length===1?"Остаток: "+fmt((totals.delivered.get(orderedUnits[0])||0)-(totals.mounted.get(orderedUnits[0])||0))+" "+orderedUnits[0]:"Нет поставок"],
   ["reports","Ежедневные отчёты",String(reports.length),"шт.","История выполненных работ",last?"Последний: "+exportDate(last):"Отчётов пока нет"],
   ["resources","Люди и техника","","","По последнему отчёту",last?"На "+exportDate(last):"Нет отчётов"]
  ];
  const cardHtml=cards.map(([key,title,value,u,desc,footer])=>{
   const values=key==="resources"?
    '<div class="ir-export-resource-values"><div><b>'+esc(resources.people)+'</b><small>чел.</small></div><div><b>'+esc(resources.equipment)+'</b><small>ед. техники</small></div></div>':
    key==="mounted"||key==="delivered"?unitsHtml(key):
    '<div class="ir-export-indicator-value">'+esc(value)+'<small>'+esc(u)+'</small></div>';
   return'<article class="ir-export-indicator-card ir-export-indicator-'+key+'"><div class="ir-export-indicator-icon">'+svg(key)+'</div>'+
    '<div class="ir-export-indicator-title">'+esc(title)+'</div>'+values+
    '<p>'+esc(desc)+'</p><div class="ir-export-indicator-foot">'+(key==="readiness"?'<div class="ir-export-indicator-track"><i style="width:'+Math.max(0,Math.min(100,readiness)).toFixed(2)+'%"></i></div>':esc(footer))+'</div></article>'
  }).join("");
  const linkOptions=[["scheme","Открыть монтажную схему","♜"],["photos","Посмотреть фотографии","▧"],["marks","Объёмы и ведомость марок","▤"]];
  const links=linkOptions.filter(x=>keys.includes(x[0])).map(([key,title,glyph])=>
   '<a class="ir-export-indicator-link" href="#section-'+esc(key)+'"><span><i aria-hidden="true">'+glyph+'</i>'+esc(title)+'</span><b aria-hidden="true">↗</b></a>'
  ).join("");
  return'<section class="ir-export-indicators" aria-label="Показатели объекта">'+
   '<div class="ir-export-indicators-heading"><h2>Показатели объекта</h2><span>на дату выгрузки</span></div>'+
   '<div class="ir-export-indicator-cards">'+cardHtml+'</div>'+(links?'<nav class="ir-export-indicator-links" aria-label="Быстрые переходы по отчёту">'+links+'</nav>':"")+'</section>'
 }

 function snapshot(keys,includeOverview=true,headerMarkup="",indicatorsMarkup=""){
  const live=document.getElementById("app");
  if(!live?.querySelector(".object-overview-hero"))throw Error("Откройте страницу «Обзор» нужного объекта.");
  const copy=live.cloneNode(true);
  copyCanvas(live,copy);
  copy.querySelectorAll("dialog,form,script,iframe,object,embed,video,audio,button,input,textarea,select,[contenteditable],.window-update,.profile-panel,.ir-notice-stack").forEach(el=>el.remove());
  copy.querySelectorAll("a").forEach(el=>{const t=document.createElement("span");t.innerHTML=el.innerHTML;el.replaceWith(t)});
  copy.querySelectorAll("*").forEach(el=>{for(const att of [...el.attributes]){if(/^on/i.test(att.name)||att.name==="tabindex")el.removeAttribute(att.name)}});
  const hero=copy.querySelector(".object-overview-hero");
  if(hero){
   hero.id="overview";
   if(headerMarkup)hero.insertAdjacentHTML("beforebegin",headerMarkup);
   // The offline navigation belongs immediately after the object banner, not in a fixed sidebar.
   hero.insertAdjacentHTML("afterend",sidebarHtml(document.querySelector(".ir-object-sidebar-fixed"),keys,includeOverview));
   if(indicatorsMarkup)copy.querySelector(".ir-export-topnav")?.insertAdjacentHTML("afterend",indicatorsMarkup)
  }
  const menu=copy.querySelector(".object-hero-menu");if(menu)menu.remove();
  const preview=extractOverviewPreviews(copy,keys);
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
    '<div class="ir-export-options-list">'+items.map(x=>'<label><input type="checkbox" data-export-key="'+esc(x.key)+'" checked><span>'+esc(x.name)+'</span></label>').join("")+
    '<div class="ir-export-options-flag"><label><input type="checkbox" data-under-contractor><span>Под флагом Генподрядчика</span></label><p>Не показывать название и логотип нашей компании в выгруженном отчёте. По умолчанию выключено.</p></div></div>'+
    '<div class="ir-export-options-foot"><button type="button" data-export-cancel>Отмена</button><button type="button" class="ir-export-save" data-export-confirm>Выгрузить HTML</button></div>';
   document.body.append(dlg);
   const checks=[...dlg.querySelectorAll("input[data-export-key]")],ok=dlg.querySelector("[data-export-confirm]");
   const refresh=()=>{const n=checks.filter(x=>x.checked).length;ok.disabled=n===0;dlg.querySelector("[data-export-count]").textContent="Выбрано: "+n+" из "+checks.length};
   let result=null;
   dlg.addEventListener("close",()=>{dlg.remove();resolve(result)},{once:true});
   dlg.querySelector("[data-export-all]").addEventListener("click",()=>{checks.forEach(x=>x.checked=true);refresh()});
   dlg.querySelector("[data-export-none]").addEventListener("click",()=>{checks.forEach(x=>x.checked=false);refresh()});
   dlg.querySelector("[data-export-cancel]").addEventListener("click",()=>dlg.close());
   ok.addEventListener("click",()=>{
    if(!checks.some(x=>x.checked))return;
    result={overview:checks.find(x=>x.dataset.exportKey==="overview")?.checked===true,keys:keys.filter(key=>checks.some(x=>x.dataset.exportKey===key&&x.checked)),underContractor:dlg.querySelector("[data-under-contractor]").checked===true};
    dlg.close()
   });
   dlg.addEventListener("change",refresh);
   refresh();dlg.showModal()
  })
 }

 async function exportObject(objectId){
  const id=String(objectId);
  if(!/^\d+$/.test(id))throw Error("Неверный ID объекта.");
  if(exportObject.busy)return false;
  exportObject.busy=true;
  try{
   const object=await irProject.data.objects.get(id);
   if(!object)throw Error("Объект не найден.");
   const sections=array(await irProject.data.sections.get(id));
   const nav=document.querySelector(".ir-object-sidebar-fixed .ir-object-nav");
   const visibleKeys=nav?[...nav.querySelectorAll("button[data-key]")].filter(b=>!b.disabled&&b.dataset.key!=="overview").map(b=>b.dataset.key):[];
   const availableKeys=[...new Set(visibleKeys.length?visibleKeys:sections.filter(s=>s.enabled).map(s=>s.section_key))];
  const selection=await chooseExportSections(availableKeys,nav);
  if(!selection)return false;
  const keys=selection.keys;
   const api=irProject.data.forObject(id);
   const companyHeader=await exportCompanyHeader(api,object,selection.underContractor);
   const batches=await Promise.all(keys.map(async key=>{
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: failed to load section",key,error);return[key,[]]}
   }));
   const rows=Object.fromEntries(batches);
   const supporting=keys.includes("marks")||keys.includes("photos")||keys.includes("scheme")?await Promise.all([
    keys.includes("marks")||keys.includes("scheme")?(rows["work-types"]?Promise.resolve(rows["work-types"]):api.section("work-types").list().catch(()=>[])):Promise.resolve([]),
    rows.reports?Promise.resolve(rows.reports):api.section("reports").list().catch(()=>[])
   ]):[[],[]];
   const schemeMarks=keys.includes("scheme")?(rows.marks||await api.section("marks").list().catch(()=>[])):[];
   const schemeDetails=keys.includes("scheme")?markDetailData(schemeMarks,supporting[0],supporting[1]):[];
   const photoInputs=keys.includes("photos")?{...rows,reports:supporting[1]}:rows;
   const photos=await inlinePhotos(photoInputs);
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
     ".ir-export-indicator-cards{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:10px!important;align-items:stretch!important}",
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
    "body:has(.ir-export-group:target) .ir-export-topnav .ir-export-toplink.active{background:#f4f8fc!important;border-color:#dae6ef!important;color:#315a76!important;box-shadow:none!important}",
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
    ".ir-export-delivery-register{border-top:1px solid #e1eaf2;background:#fff}",
    ".ir-export-delivery-register>h3{margin:0;padding:18px 17px 14px;font-size:14px;color:#234a63;font-weight:800}",
    ".ir-export-delivery-register>.ir-export-invoice-list{margin:0;padding:0 13px 12px}",
    ".ir-export-daily-photo-link{display:block;cursor:zoom-in;border-radius:8px;overflow:hidden}",
    ".ir-export-daily-photo-link:focus-visible{outline:2px solid #3985c2;outline-offset:3px}",
    ".ir-export-daily-photo-link:hover img{filter:brightness(.92);transform:scale(1.015)}",
    ".ir-export-daily-photo-link img{transition:transform .16s ease,filter .16s ease}",
    "#section-scheme>.ir-export-section{padding:0!important;width:100%!important;max-width:none!important}",
    "#section-scheme>.ir-export-section>.ir-export-section-head{padding:18px 20px 15px!important;margin:0!important}",
    "#section-scheme .ir-export-scheme{display:block!important;width:100%!important;max-width:none!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}",
    "#section-scheme .ir-export-scheme-stage{width:100%!important;height:min(82vh,950px)!important;min-height:510px!important}",
    "body.ir-object-overview #app #section-scheme .ir-export-scheme-controls button{display:inline-flex!important;align-items:center!important;justify-content:center!important}",
    "@media(max-width:760px){#section-scheme>.ir-export-section>.ir-export-section-head{padding:14px 12px!important}#section-scheme .ir-export-scheme-stage{min-height:360px!important;height:65vh!important}}",
    "@media print{body.ir-object-route.ir-object-overview{background:#fff!important}body.ir-object-overview #app{margin:0 auto!important;width:100%!important;max-width:1000px!important;box-shadow:none!important}.ir-export-topnav{position:relative!important;top:auto!important}.ir-export-menu-items{box-shadow:none!important}.ir-export-record{break-inside:avoid}.ir-export-section{break-before:page;margin:8px 0!important}.ir-export-daily-card details,.ir-export-mark-card details{display:block!important}}"
   ].join("\n");
   const activeHero=document.querySelector(".object-overview-hero");
   if(String(activeHero?.dataset.objectId||"")!==id)throw Error("Во время выгрузки изменился открытый объект. Повторите действие.");
   const indicatorTypes=["work-types","marks","reports","deliveries","scheme"];
   const indicatorRows=selection.overview?Object.fromEntries(await Promise.all(indicatorTypes.map(async key=>{
    if(rows[key])return[key,rows[key]];
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: indicators unavailable",key,error);return[key,[]]}
   }))):{};
   const indicatorsMarkup=selection.overview?renderIndicatorBlock(indicatorRows,keys):"";
   const overviewSnapshot=snapshot(keys,selection.overview,companyHeader.markup,indicatorsMarkup);
   const htmlSnapshot=overviewSnapshot.overview;
   const activeNavStyles=keys.filter(key=>/^[a-z0-9_-]+$/i.test(key)).map(key=>'body:has(#section-'+key+':target) .ir-export-topnav .ir-export-subnav-link[href="#section-'+key+'"]{background:#e6f2fc!important;color:#176ca7!important;font-weight:800!important}').join("\n");
   const extras=window.irObjectExportExtras;
   if(!extras)throw new Error("Модуль экспорта разделов не загружен. Перезапустите IR Project.");
   const sectionsHtml=keys.map(key=>renderSection(key,rows[key]||[],photos,overviewSnapshot.preview[key]||"",{workTypes:supporting[0],reports:supporting[1],schemeDetails})).join("");
   let viewerScripts="",viewerCsp="";
   if(keys.includes("scheme")){
    const scheme=extras.schemeData(rows.scheme||[],schemeDetails);
    const encoded=JSON.stringify(scheme).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
    const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const engine="("+extras.schemeViewer.toString()+")();";
    viewerCsp="; script-src 'nonce-"+nonce+"'; connect-src 'none'; object-src 'none'";
    viewerScripts='<script type="application/json" id="ir-export-scheme-data" nonce="'+nonce+'">'+encoded+'</script><script nonce="'+nonce+'">'+engine+'</script>'
   }
   const generated=new Date().toLocaleString("ru-RU");
   let html='<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:'+viewerCsp+'"><title>'+esc(object.name||"IR Project")+' — отчёт объекта</title><style>'+css+'</style><style>'+extraStyles+'\n'+(extras?.css||'')+'\n'+activeNavStyles+'</style></head><body class="ir-object-route ir-object-overview"><main id="app">'+htmlSnapshot+sectionsHtml+'<footer class="ir-export-section"><b>IR Project</b> · Снимок объекта от '+esc(generated)+'. Только просмотр. Данные не связаны с рабочей базой.</footer></main>'+viewerScripts+'</body></html>';
   if(selection.underContractor)html=redactCompanyIdentity(html,companyHeader.ownName);
   const name=safeFile(object.short_name||object.name||"Объект");
   const fileName=selection.underContractor?redactCompanyIdentity(name,companyHeader.ownName).trim()||"Объект":name;
   const result=await irProject.reportExport.html(html,"IR Project — "+fileName+" — весь объект.html");
   if(result&&typeof window.irProjectNotice==="function")window.irProjectNotice("HTML-отчёт объекта сохранён. Файл доступен только для просмотра.","success");
   return result
  }catch(error){
   console.error("HTML export of object failed",error);
   if(typeof window.irProjectNotice==="function")window.irProjectNotice("Не удалось выгрузить объект: "+String(error?.message||error),"error");
   else alert("Не удалось выгрузить объект: "+String(error?.message||error));
   return false
  }finally{exportObject.busy=false}
 }
 window.irObjectHtmlExport={save:exportObject};
})();
