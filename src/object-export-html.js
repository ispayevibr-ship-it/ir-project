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
  const photoHtml=photos.map((p,i)=>{const path=photoPath(p),source=dataUrl(path)?path:images.get(path);return source?'<figure><img src="'+esc(source)+'" loading="lazy" alt="Фото отчёта '+(i+1)+'"><figcaption>Фото '+(i+1)+'</figcaption></figure>':''}).join("");
  return'<div class="ir-export-daily-full">'+
   '<section><h3>Выполненные работы</h3>'+reportWorkTable(works)+'</section>'+
   '<div class="ir-export-daily-columns"><section><h3>Работники</h3>'+reportChips(workers,"workers")+'</section><section><h3>Ответственные лица</h3>'+reportChips(responsible,"responsible")+'</section></div>'+
   '<section><h3>Техника</h3>'+reportChips(equipment,"equipment")+'</section>'+
   (photoHtml?'<section><h3>Фотографии · '+photos.length+'</h3><div class="ir-export-daily-photos">'+photoHtml+'</div></section>':'')+
   '</div>'
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
 function extractOverviewPreviews(copy,keys){
  const available=new Set(keys),previews={};
  // Daily reports and grouped marks have their own archive cards, not duplicate overview widgets.
  copy.querySelectorAll(".object-overview-reports > .oor2-card:not(.oor2-photo-card):not(.oor-marks-card),.object-overview-marks-wrap > .object-overview-marks-card,.object-overview-reports > .oor-marks-card").forEach(card=>card.remove());
  const sources=[
   ["photos",".object-overview-reports > .oor2-photo-card"],
   ["deliveries",".object-overview-deliveries-wrap > .ood-deliveries"],
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
    (previews[key]??=[]).push('<div class="ir-object-overview-right ir-export-preview-layout"><div class="'+wrapper+'">'+card.outerHTML+'</div></div>');
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
   return[String(row.id),{name:String(d.work_type||row.title||"Без вида работ"),code:String(d.project_code||d.code||"").trim()}]
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
   const key=(wid||normalize(name))+"|"+normalize(code);
   if(!groups.has(key))groups.set(key,{name,code,total:0,mounted:0,remaining:0,positions:0});
   const mark=groups.get(key),markId=String(raw.id);
   const fromReports=mountedMap.get(markId),done=Math.min(qty,Math.max(0,fromReports==null?exportNumber(d.mounted??d.done):fromReports));
   mark.total+=qty;mark.mounted+=done;mark.positions++
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
   '<div class="ir-export-mark-code">'+esc(group.code||"Без шифра")+'</div>'+
   '<div class="ir-export-mark-count"><b>'+esc(exportFormat(group.total))+'</b><small>шт.</small></div>'+
   '<div class="ir-export-mark-progress" role="img" aria-label="Смонтировано '+esc(pct(mounted))+'"><div class="ir-export-mark-track"><i style="width:'+mounted.toFixed(2)+'%"></i></div><small>'+esc(pct(mounted))+' готовность</small></div>'+
   '<div class="ir-export-mark-fact"><b>'+esc(exportFormat(group.mounted))+' шт.</b><small>'+esc(pct(mounted))+'</small></div>'+
   '<div class="ir-export-mark-left"><b>'+esc(exportFormat(group.remaining))+' шт.</b><small>'+esc(pct(remaining))+'</small></div>'+
   '</article>'
 }
 function markProgressPanel(groups,kind){
  if(!groups.length)return'<div class="ir-export-empty-card">По выбранному фильтру марок нет</div>';
  const cards=groups.map(markProgressRow);
  return'<div class="ir-export-mark-rows">'+exportMoreCards(cards,"marks",groups.length,groups.reduce((s,x)=>s+x.total,0))+'</div>'
 }
 function renderMarksOverview(markRows,workRows,reportRows){
  const groups=markProgressGroups(markRows,workRows,reportRows);
  const total=groups.reduce((s,x)=>s+x.total,0),mounted=groups.reduce((s,x)=>s+x.mounted,0);
  const left=Math.max(0,total-mounted),percent=total?Math.round(mounted/total*1000)/10:0;
  const mountedGroups=groups.filter(x=>x.mounted>0),remainingGroups=groups.filter(x=>x.remaining>0);
  const mode=(key,label,count)=>'<label for="ir-export-marks-'+key+'">'+label+' <span>'+count+'</span></label>';
  return'<div class="ir-export-marks-summary">'+
   '<div class="ir-export-marks-title"><div><h3>Готовность по видам работ</h3><p>Количество отправочных марок в штуках · монтаж из ежедневных отчётов</p></div><b>'+esc(exportFormat(percent))+'%</b></div>'+
   '<div class="ir-export-marks-stats"><div><small>Всего марок</small><b>'+esc(exportFormat(total))+' шт.</b></div><div><small>Смонтировано</small><b>'+esc(exportFormat(mounted))+' шт.</b></div><div><small>Осталось</small><b>'+esc(exportFormat(left))+' шт.</b></div><div><small>Групп видов работ / шифров</small><b>'+groups.length+'</b></div></div>'+
   '<div class="ir-export-mark-switcher">'+
   '<input class="ir-export-mark-radio ir-export-mark-radio--all" type="radio" name="ir-export-mark-mode" id="ir-export-marks-all" checked>'+
   '<input class="ir-export-mark-radio ir-export-mark-radio--mounted" type="radio" name="ir-export-mark-mode" id="ir-export-marks-mounted">'+
   '<input class="ir-export-mark-radio ir-export-mark-radio--remaining" type="radio" name="ir-export-mark-mode" id="ir-export-marks-remaining">'+
   '<div class="ir-export-mark-tabs" role="group" aria-label="Фильтр ведомости марок">'+mode("all","Все",groups.length)+mode("mounted","Смонтировано",mountedGroups.length)+mode("remaining","Осталось",remainingGroups.length)+'</div>'+
   '<div class="ir-export-mark-panel ir-export-mark-panel--all"><div class="ir-export-mark-head"><span>Вид работы</span><span>Шифр</span><span>Всего марок</span><span>Шкала прогресса</span><span>Смонтировано, шт. / %</span><span>Осталось, шт. / %</span></div>'+markProgressPanel(groups,"all")+'</div>'+
   '<div class="ir-export-mark-panel ir-export-mark-panel--mounted"><div class="ir-export-mark-head"><span>Вид работы</span><span>Шифр</span><span>Всего марок</span><span>Шкала прогресса</span><span>Смонтировано, шт. / %</span><span>Осталось, шт. / %</span></div>'+markProgressPanel(mountedGroups,"mounted")+'</div>'+
   '<div class="ir-export-mark-panel ir-export-mark-panel--remaining"><div class="ir-export-mark-head"><span>Вид работы</span><span>Шифр</span><span>Всего марок</span><span>Шкала прогресса</span><span>Смонтировано, шт. / %</span><span>Осталось, шт. / %</span></div>'+markProgressPanel(remainingGroups,"remaining")+'</div>'+
   '</div></div>'
 }

 function markDetailData(markRows,workRows,reportRows){
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  const works=new Map(array(workRows).map(row=>{
   const d=row.data||{};
   return[String(row.id),{name:d.work_type||row.title||"Без вида работы",code:d.project_code||d.code||"",unit:d.unit||""}]
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
    id,index:i+1,mark:String(d.mark||raw.title||"—"),name:String(d.name||"").trim(),
    work:String(work.name||d.work_type||"Без вида работы"),code:String(d.project_code||d.code||work.code||"").trim(),
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
   return'<article class="ir-export-mark-card status-'+m.status+'"><details'+(i===0?' open':'')+'>'+
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
       '<div><small>Шифр</small><b>'+esc(m.code||"—")+'</b></div>'+
       '<div><small>'+esc(unitName)+' 1 шт.</small><b>'+esc(exportFormat(m.uv))+' '+esc(unit)+'</b></div>'+
       '<div><small>'+esc(unitName)+' всего</small><b>'+esc(exportFormat(m.total))+' '+esc(unit)+'</b></div>'+
      '</div>'+
     '</div>'+
   '</details></article>'
  };
  const cards=marks.map(item);
  return'<div class="ir-export-mark-cards">'+exportMoreCards(cards,"positions",marks.length)+'</div>'
 }

 function renderMarkSection(rows,workRows,reportRows,images){
  const summary=renderMarksOverview(rows,workRows,reportRows);
  const full=rows.length?'<details class="ir-export-mark-raw"><summary>Подробная ведомость по маркам ('+rows.length+' позиций)</summary>'+renderMarkCards(rows,workRows,reportRows)+'</details>':"";
  return summary+full
 }

 function renderSection(key,rows,images,preview="",support={}){
  const body=key==="reports"?renderDailyReports(rows,images):key==="marks"?renderMarkSection(rows,support.workTypes||[],support.reports||[],images):renderRows(rows,key,images);
  return'<div class="ir-export-group" id="section-'+esc(key)+'">'+(preview?'<div class="ir-export-preview">'+preview+'</div>':"")+
   '<section class="ir-export-section"><header class="ir-export-section-head"><div><small>IR Project / Объект</small><h2>'+esc(labels[key]||key)+'</h2></div><span class="ir-export-count">'+rows.length+' записей</span></header>'+body+'</section></div>'
 }
 function sidebarHtml(aside,keys){
  const nav=aside?.querySelector(".ir-object-nav");
  const links=nav?[...nav.querySelectorAll("button[data-key]")].filter(el=>!el.disabled):[];
  const original=key=>links.find(el=>el.dataset.key===key);
  const icon=key=>original(key)?.querySelector(".nav-icon")?.innerHTML||"";
  const name=key=>original(key)?.querySelector(".nav-label")?.textContent||labels[key]||key;
  const link=(key,href,active=false)=>'<a class="ir-export-nav'+(active?' active':'')+'" href="'+href+'" data-key="'+esc(key)+'"><span class="nav-icon" aria-hidden="true">'+icon(key)+'</span><span class="nav-label">'+esc(name(key))+'</span></a>';
  const navHtml=link("overview","#overview",true)+keys.map(key=>link(key,"#section-"+esc(key))).join("");
  const logoImage=aside?.querySelector(".ir-object-brand img");
  const logo=logoImage?'<img src="'+esc(logoImage.src)+'" alt="'+esc(logoImage.alt||"Логотип компании")+'">':'<span>'+esc(aside?.querySelector(".ir-object-brand span")?.textContent||"IR Project")+'</span>';
  const backIcon=aside?.querySelector(".ir-object-all .menu-icon")?.innerHTML||"";
  const upIcon=aside?.querySelector(".ir-object-top .menu-icon")?.innerHTML||"";
  return'<aside class="ir-object-sidebar-fixed ir-export-sidebar" aria-label="Разделы HTML-отчёта">'+
   '<a class="ir-object-brand" href="#overview" title="К обзору объекта">'+logo+'</a>'+
   '<a class="ir-object-all" href="#overview" title="В HTML-отчёте доступен один объект"><span class="menu-icon">'+backIcon+'</span><b>Все объекты</b></a>'+
   '<nav class="ir-object-nav" aria-label="Разделы объекта">'+navHtml+'</nav>'+
   '<a class="ir-object-top" href="#overview"><span class="menu-icon round">'+upIcon+'</span><b>Наверх</b></a>'+
   '</aside>'
 }
 function copyCanvas(live,copy){
  const originals=[...live.querySelectorAll("canvas")],copies=[...copy.querySelectorAll("canvas")];
  originals.forEach((canvas,i)=>{try{const src=canvas.toDataURL("image/png");if(!dataUrl(src))return;const img=document.createElement("img");img.src=src;img.alt="График";img.style.width=canvas.width+"px";img.style.maxWidth="100%";copies[i]?.replaceWith(img)}catch{copies[i]?.remove()}})
 }
 function snapshot(keys){
  const live=document.getElementById("app");
  if(!live?.querySelector(".object-overview-hero"))throw Error("Откройте страницу «Обзор» нужного объекта.");
  const copy=live.cloneNode(true);
  copyCanvas(live,copy);
  copy.querySelectorAll("dialog,form,script,iframe,object,embed,video,audio,button,input,textarea,select,[contenteditable],.window-update,.profile-panel,.ir-notice-stack").forEach(el=>el.remove());
  copy.querySelectorAll("a").forEach(el=>{const t=document.createElement("span");t.innerHTML=el.innerHTML;el.replaceWith(t)});
  copy.querySelectorAll("*").forEach(el=>{for(const att of [...el.attributes]){if(/^on/i.test(att.name)||att.name==="tabindex")el.removeAttribute(att.name)}});
  const hero=copy.querySelector(".object-overview-hero");if(hero)hero.id="overview";
  const menu=copy.querySelector(".object-hero-menu");if(menu)menu.remove();
  const preview=extractOverviewPreviews(copy,keys);
  return {overview:copy.innerHTML,preview}
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
   const keys=[...new Set(visibleKeys.length?visibleKeys:sections.filter(s=>s.enabled).map(s=>s.section_key))];
   const api=irProject.data.forObject(id);
   const batches=await Promise.all(keys.map(async key=>{
    try{return[key,array(await api.section(key).list())]}
    catch(error){console.warn("Object HTML: failed to load section",key,error);return[key,[]]}
   }));
   const rows=Object.fromEntries(batches);
   const supporting=keys.includes("marks")?await Promise.all([
    rows["work-types"]?Promise.resolve(rows["work-types"]):api.section("work-types").list().catch(()=>[]),
    rows.reports?Promise.resolve(rows.reports):api.section("reports").list().catch(()=>[])
   ]):[[],[]];
   const photos=await inlinePhotos(rows);
   const cssResponse=await fetch("./ir-styles.css?v=17149",{cache:"no-store"});
   if(!cssResponse.ok)throw Error("Не удалось загрузить оформление отчёта.");
   const css=await cssResponse.text();
   const extraStyles=[
    "*{box-sizing:border-box}",
    "html{scroll-behavior:smooth}body.ir-object-overview{padding-top:0!important;min-width:760px;background:#f4f6f9}",
    "body.ir-object-overview #app{padding-bottom:30px!important}",
    "body.ir-object-route.ir-object-overview #app{margin-left:174px!important;width:calc(100% - 174px)!important;max-width:none!important}",
    ".ir-export-sidebar.ir-object-sidebar-fixed{top:0!important;left:0!important;width:174px!important;height:100vh!important;padding:0 9px 10px!important;background:linear-gradient(180deg,#14283c 0%,#0d2032 100%)!important;color:#d5dee7!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;border-right:0!important}",
    ".ir-export-sidebar .ir-object-brand{width:calc(100% + 18px)!important;margin:0 -9px 0!important;padding:8px 0 9px!important;background:#fff!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;min-height:0!important;border:0!important;text-decoration:none!important}",
    ".ir-export-sidebar .ir-object-brand img{display:block!important;width:100%!important;height:auto!important;max-height:none!important;object-fit:cover!important;object-position:center!important;padding:0!important}",
    ".ir-export-sidebar .ir-object-brand span{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:58px!important;padding:8px!important;font-size:12px!important;font-weight:800!important;color:#17364d!important;text-align:center!important}",
    ".ir-export-sidebar .ir-object-all{display:flex!important;align-items:center!important;gap:9px!important;flex:0 0 auto!important;width:100%!important;min-height:36px!important;margin:4px 0 5px!important;padding:0 9px!important;border:0!important;border-radius:5px!important;background:rgba(255,255,255,.045)!important;color:#d5e0e9!important;text-decoration:none!important;text-align:left!important;font-size:10px!important}",
    ".ir-export-sidebar .ir-object-all:hover{background:rgba(255,255,255,.08)!important;color:#fff!important}",
    ".ir-export-sidebar .ir-object-all b{font-weight:600!important;line-height:1!important}",
    ".ir-export-sidebar .ir-object-nav{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;gap:3px!important;padding:7px 0!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:none!important}",
    ".ir-export-sidebar .ir-object-nav::-webkit-scrollbar{display:none!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav{position:relative!important;display:flex!important;align-items:center!important;gap:9px!important;flex:0 0 auto!important;width:100%!important;min-height:36px!important;padding:0 9px!important;border:0!important;border-radius:5px!important;background:transparent!important;color:#b9c6d2!important;text-decoration:none!important;text-align:left!important;font-size:10px!important;font-weight:500!important;white-space:nowrap!important;cursor:pointer!important;box-shadow:none!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav:hover{background:rgba(255,255,255,.055)!important;color:#fff!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav.active{background:#1e61b4!important;color:#fff!important;font-weight:700!important;box-shadow:inset 0 0 0 1px rgba(91,157,238,.15)!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav.active .nav-icon{color:#fff!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav .nav-icon{display:grid!important;place-items:center!important;flex:0 0 18px!important;width:18px!important;height:18px!important;color:#c5d4df!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav .nav-icon svg{display:block!important;width:18px!important;height:18px!important}",
    ".ir-export-sidebar .ir-object-nav a.ir-export-nav .nav-label{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;color:inherit!important}",
    ".ir-export-sidebar .ir-object-top{margin-top:auto!important;display:flex!important;align-items:center!important;gap:9px!important;flex:0 0 auto!important;width:100%!important;min-height:40px!important;padding:0 10px!important;border:0!important;border-top:1px solid rgba(255,255,255,.07)!important;background:transparent!important;color:#c5d1db!important;text-decoration:none!important;text-align:left!important;font-size:10px!important}",
    ".ir-export-sidebar .ir-object-top:hover{background:rgba(255,255,255,.05)!important;color:#fff!important}",
    ".ir-export-sidebar .ir-object-top b{font-weight:500!important;line-height:1!important}",
    "body:has(.ir-export-section:target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href=\"#overview\"].active{background:transparent!important;color:#b9c6d2!important;font-weight:500!important;box-shadow:none!important}",
    "body:has(.ir-export-section:target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href=\"#overview\"].active .nav-icon{color:#c5d4df!important}",
    "@media(max-width:900px){.ir-export-sidebar.ir-object-sidebar-fixed{width:150px!important}body.ir-object-route.ir-object-overview #app{margin-left:150px!important;width:calc(100% - 150px)!important}.ir-export-sidebar .ir-object-nav a.ir-export-nav{font-size:9px!important;padding:0 7px!important}.ir-export-sidebar .ir-object-all,.ir-export-sidebar .ir-object-top{font-size:9px!important}}",
    ".ir-export-group{scroll-margin-top:14px;min-width:0}",
    ".ir-export-preview{margin:18px 22px 0;min-width:0;display:grid;gap:12px}",
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
    "@media(max-width:1000px){.ir-export-preview{margin:12px 12px 0}.ir-export-daily-columns{grid-template-columns:1fr}}",
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
    ".ir-export-mark-raw{margin-top:14px;border:1px solid #e2eaf2;border-radius:9px;background:#f8fbfe;overflow:hidden}",
    ".ir-export-mark-raw>summary{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;cursor:pointer;list-style:none;font-weight:750;font-size:12px;color:#37779f}",
    ".ir-export-mark-raw>summary::-webkit-details-marker{display:none}",
    ".ir-export-mark-raw>summary:before{content:'';width:8px;height:8px;border-right:2px solid #3a83b3;border-bottom:2px solid #3a83b3;transform:rotate(45deg);transition:transform .2s ease}",
    ".ir-export-mark-raw[open]>summary:before{transform:rotate(225deg)}",
    ".ir-export-mark-raw>.ir-export-records{padding:12px;gap:8px;background:#fff}",
    "@media(max-width:1200px){.ir-export-mark-head,.ir-export-mark-row{grid-template-columns:minmax(110px,1.3fr) minmax(70px,.8fr) minmax(70px,.6fr) minmax(105px,1fr) minmax(90px,.8fr) minmax(90px,.8fr);gap:8px}.ir-export-marks-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
    "@media(max-width:850px){.ir-export-marks-stats{grid-template-columns:1fr 1fr}.ir-export-mark-row{font-size:10px;padding:10px 8px}.ir-export-mark-head{padding:10px 8px;font-size:9px}}",
    "@media print{.ir-export-mark-tabs{display:none!important}.ir-export-mark-panel--all{display:block!important}.ir-export-mark-raw{break-inside:avoid}.ir-export-more-items{display:grid!important}.ir-export-more-show{display:none!important}}",
    ".ir-export-section{padding:18px;margin:18px 22px;border:1px solid #dce5ed;border-radius:13px;background:#fff;scroll-margin-top:14px;color:#21435b}",
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
    "@media(max-width:1000px){.ir-export-section{margin:12px!important}.ir-export-row-meta{display:none}}",
    "@media print{.ir-export-sidebar{position:static!important;width:100%!important;height:auto!important}.ir-export-sidebar .ir-object-nav{display:flex!important;flex-wrap:wrap!important}body.ir-object-overview #app{margin:0!important;width:100%!important}.ir-export-record{break-inside:avoid}.ir-export-section{break-before:page;margin:8px 0!important}details{display:block!important}}"
   ].join("\n");
   const activeHero=document.querySelector(".object-overview-hero");
   if(String(activeHero?.dataset.objectId||"")!==id)throw Error("Во время выгрузки изменился открытый объект. Повторите действие.");
   const overviewSnapshot=snapshot(keys);
   const htmlSnapshot=overviewSnapshot.overview;
   const activeNavStyles=keys.map(key=>'body:has(#section-'+key+':target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href="#section-'+key+'"]{background:#1e61b4!important;color:#fff!important;font-weight:700!important;box-shadow:inset 0 0 0 1px rgba(91,157,238,.15)!important}body:has(#section-'+key+':target) .ir-export-sidebar .ir-object-nav a.ir-export-nav[href="#section-'+key+'"] .nav-icon{color:#fff!important}').join("\n");
   const sidebar=sidebarHtml(document.querySelector(".ir-object-sidebar-fixed"),keys);
   const sectionsHtml=keys.map(key=>renderSection(key,rows[key]||[],photos,overviewSnapshot.preview[key]||"",{workTypes:supporting[0],reports:supporting[1]})).join("");
   const generated=new Date().toLocaleString("ru-RU");
   const html='<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; font-src data:"><title>'+esc(object.name||"IR Project")+' — отчёт объекта</title><style>'+css+'</style><style>'+extraStyles+'\n'+activeNavStyles+'</style></head><body class="ir-object-route ir-object-overview">'+sidebar+'<main id="app">'+htmlSnapshot+sectionsHtml+'<footer class="ir-export-section"><b>IR Project</b> · Снимок объекта от '+esc(generated)+'. Только просмотр. Данные не связаны с рабочей базой.</footer></main></body></html>';
   const name=safeFile(object.short_name||object.name||"Объект");
   const result=await irProject.reportExport.html(html,"IR Project — "+name+" — весь объект.html");
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
