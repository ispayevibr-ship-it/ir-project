/* #41: src/object-overview-top-stats.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:r.id,...(r.data||r)});
 function markTotal(x){const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)}
 function reportVolume(w){const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)}
 function meta(workTypes,marks){return new Map(arr(workTypes).map(r=>{const d=r.data||{},id=String(r.id),service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),hasMarks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===id))));return[id,{id,service,hasMarks,planned:num(d.planned_volume??d.plan_volume)}]}))}
 function completion(workTypes,marks,reports){
  const wt=meta(workTypes,marks),plans=new Map(),facts=new Map(),serviceDone=new Set();
  for(const [id,w] of wt)if(!w.service&&!w.hasMarks&&w.planned>0)plans.set(id,w.planned);
  for(const r of arr(marks)){const d=r.data||{},id=String(d.work_type_id||"");if(id&&!wt.get(id)?.service)plans.set(id,(plans.get(id)||0)+markTotal(r))}
  for(const raw of arr(reports)){const d=record(raw);for(const w of arr(d.items||d.works)){const id=String(w.work_type_id||"");if(!id)continue;const m=wt.get(id),service=m?.service||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга";if(service){const done=w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));if(done)serviceDone.add(id);continue}const v=reportVolume(w);if(v>0)facts.set(id,(facts.get(id)||0)+v)}}
  const percentages=[];
  for(const [id,w] of wt){if(w.service){percentages.push(serviceDone.has(id)?100:0);continue}const plan=plans.get(id)||0;if(plan>0)percentages.push(clamp((facts.get(id)||0)/plan*100,0,100))}
  return percentages.length?Math.round(percentages.reduce((s,x)=>s+x,0)/percentages.length):0;
 }
 function averages(reports){
  const all=arr(reports).map(record),n=all.length;
  if(!n)return{people:0,workers:0,responsible:0,equipment:0,days:0};
  let workers=0,responsible=0,equipment=0;
  for(const d of all){
   workers+=arr(d.workers||d.people).reduce((s,x)=>s+num(x.count),0);
   responsible+=arr(d.responsible).filter(x=>String(x?.name||x?.role||"").trim()).length;
   equipment+=arr(d.equipment).reduce((s,x)=>s+num(x.count),0);
  }
  const avg=v=>Math.ceil(v/n);
  return{people:avg(workers+responsible),workers:avg(workers),responsible:avg(responsible),equipment:avg(equipment),days:n};
 }
 const ring=pct=>`<div class="oos-ring" style="--p:${clamp(pct,0,100)}"><div><b>${pct}%</b><span>выполнено</span></div></div>`;
 const peopleIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-2.2A4.8 4.8 0 0 1 7.8 13h.4a4.8 4.8 0 0 1 4.8 4.8V20M14 14.5c.7-.7 1.7-1.1 2.8-1.1h.3A3.9 3.9 0 0 1 21 17.3V20"/></svg>';
 const equipmentIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h15M5 18v-5h6v5M11 13V8l7-5 1.5 2-6.5 5v3M18 5h2v9M20 14v2"/><circle cx="6" cy="20" r="1.5"/><circle cx="14" cy="20" r="1.5"/><circle cx="20" cy="18" r="1.5"/></svg>';
 const weatherCache=new Map();
 const weatherCodes={0:["Ясно","☀"],1:["Преим. ясно","🌤"],2:["Переменная облачность","⛅"],3:["Пасмурно","☁"],45:["Туман","🌫"],48:["Туман","🌫"],51:["Морось","🌦"],53:["Морось","🌦"],55:["Морось","🌦"],61:["Дождь","🌧"],63:["Дождь","🌧"],65:["Сильный дождь","🌧"],71:["Снег","🌨"],73:["Снег","🌨"],75:["Сильный снег","🌨"],80:["Ливень","🌧"],81:["Ливень","🌧"],82:["Сильный ливень","🌧"],95:["Гроза","⛈"],96:["Гроза","⛈"],99:["Гроза","⛈"]};
 async function loadWeather(address){
  const addr=String(address||"").trim();if(!addr)return{error:true};
  const cached=weatherCache.get(addr);if(cached&&Date.now()-cached.cachedAt<1800000)return cached;
  try{
   let loc=/варваринск|варваринка/i.test(addr)?{latitude:52.945736,longitude:62.125258,name:"Варваринское",country_code:"KZ"}:null;
   if(!loc){
    const clean=x=>String(x||"").replace(/^(республика\s+казахстан|республика|рк|город|г\.?|село|с\.?|поселок|п\.?|аул|а\.?|станция|ст\.?)\s*/i,"").replace(/\s+(область|обл\.?|район|р-н)$/i,"").trim();
    const parts=addr.split(",").map(x=>x.trim()).filter(Boolean),candidates=[];
    for(const x of parts.slice().reverse()){const q=clean(x);if(q&&q.length>2&&!/^(казахстан|kazakhstan)$/i.test(q)&&!/^\d/.test(q))candidates.push(q)}
    candidates.push(addr);
    for(const q of [...new Set(candidates)]){
     const g=await fetch("https://geocoding-api.open-meteo.com/v1/search?count=5&language=ru&format=json&countryCode=KZ&name="+encodeURIComponent(q),{cache:"no-store"});
     if(!g.ok)continue;const gj=await g.json(),list=arr(gj.results);loc=list.find(x=>String(x.country_code||"").toUpperCase()==="KZ")||list[0]||null;if(loc)break;
    }
   }
   if(!loc)throw new Error("location_not_found");
   const w=await fetch("https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=temperature_2m,weather_code,wind_speed_10m,precipitation&wind_speed_unit=ms&timezone=auto&forecast_days=1",{cache:"no-store"});
   if(!w.ok)throw new Error("weather_failed");const j=await w.json(),wc=weatherCodes[j.current?.weather_code]||["Погода","☀"],out={cachedAt:Date.now(),place:loc.name||"",temp:Math.round(num(j.current?.temperature_2m)),text:wc[0],icon:wc[1],wind:num(j.current?.wind_speed_10m).toFixed(1),precip:num(j.current?.precipitation).toFixed(1)};weatherCache.set(addr,out);return out;
  }catch{return{error:true}}
 }
 function weatherHtml(w,address){
  if(!w)return`<section class="oos-card oos-weather oos-weather-cloud"><div class="oos-weather-loading"><span>Погода сегодня</span><b>Загрузка…</b><small>${esc(address||"Адрес объекта не указан")}</small></div></section>`;
  if(w.error)return`<section class="oos-card oos-weather oos-weather-cloud"><div class="oos-weather-loading"><span>Погода сегодня</span><b>Нет данных</b><small>Не удалось получить погоду по адресу объекта</small></div></section>`;
  const kind=/ясно/i.test(w.text)?"sun":/гроз/i.test(w.text)?"storm":/снег/i.test(w.text)?"snow":/дожд|ливень|морось/i.test(w.text)?"rain":/туман/i.test(w.text)?"fog":/облач|пасмур/i.test(w.text)?"cloud":"sun";
  const wind=Number(w.wind)||0,windTone=wind>=15?" danger":wind>=10?" warn":"";
  return`<section class="oos-card oos-weather oos-weather-${kind}">
   <span class="oos-weather-orb orb-one"></span><span class="oos-weather-orb orb-two"></span>
   <div class="oos-weather-main">
    <div class="oos-weather-title"><span>Погода сегодня</span><small>${esc(w.place||"")}</small></div>
    <div class="oos-weather-current"><div class="oos-weather-icon"><i>${w.icon}</i></div><div class="oos-weather-temp"><b>${w.temp>0?"+":""}${w.temp}°</b><span>${esc(w.text)}</span></div></div>
   </div>
   <div class="oos-weather-meta">
    <span class="oos-weather-chip${windTone}"><small>Ветер</small><b>${esc(w.wind)} м/с</b></span>
    <span class="oos-weather-chip"><small>Осадки</small><b>${esc(w.precip)} мм</b></span>
   </div>
  </section>`;
 }
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),dashboard=app?.querySelector(".object-overview-dashboard");if(!app||!dashboard)return false;
  app.querySelector(".object-overview-top-stats")?.remove();
  const root=irProject.data.forObject(oid),[workTypes,marks,reports,object]=await Promise.all([root.section("work-types").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("reports").list().catch(()=>[]),irProject.data.objects.get(oid).catch(()=>null)]);
  if(objectId()!==String(oid))return true;
  const pct=completion(workTypes,marks,reports),avg=averages(reports),wrap=document.createElement("div");wrap.className="object-overview-top-stats";
  const address=object?.address||"";wrap.innerHTML=`<section class="oos-card oos-progress"><div class="oos-copy"><span>Общий показатель</span><b>Выполнение по всем работам</b><small>Средняя готовность по видам работ</small></div>${ring(pct)}</section><section class="oos-card"><div class="oos-icon people">${peopleIcon}</div><div class="oos-copy"><span>Среднее количество людей</span><b class="oos-value">${avg.people} чел.</b><small>Работники: ${avg.workers} · Ответственные: ${avg.responsible}</small></div></section><section class="oos-card"><div class="oos-icon equipment">${equipmentIcon}</div><div class="oos-copy"><span>Среднее количество техники</span><b class="oos-value">${avg.equipment} ед.</b><small>Среднее по ${avg.days} ${avg.days===1?"отчёту":"отчётам"}</small></div></section>${weatherHtml(null,address)}`;
  dashboard.insertAdjacentElement("beforebegin",wrap);
  const weather=await loadWeather(address);if(objectId()===String(oid)&&wrap.isConnected){const card=wrap.querySelector(".oos-weather");if(card)card.outerHTML=weatherHtml(weather,address)}
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview top stats",e)}if(++tries<30)setTimeout(run,120)};setTimeout(run,20)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();
;

/* #42: src/object-data-recovery.js */
"use strict";
(()=>{
 const KEYS=["reports","schedule","work-types","marks","deliveries"];
 const ALIASES={
  reports:["daily-reports","daily_reports","dailyreports","report"],
  schedule:["work-schedule","work_schedule","schedule-items","timeline"],
  "work-types":["work_types","worktypes","works"],
  marks:["mark-list","mark_list","statement-marks","statement_marks"],
  deliveries:["invoices","delivery","supplies"]
 };
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const sameObject=(a,b)=>norm(a?.name)===norm(b?.name)&&norm(a?.customer)===norm(b?.customer)&&norm(a?.address)===norm(b?.address);
 async function readOnce(oid,key){return irProject.data.forObject(oid).section(key).list()}
 async function readRetry(oid,key,tries=3){
  let firstError=false,lastError=null;
  for(let i=0;i<tries;i++){
   try{
    const rows=await readOnce(oid,key);
    if(Array.isArray(rows))return{rows,firstError,retried:i>0};
    return{rows:[],firstError,retried:i>0};
   }catch(e){if(i===0)firstError=true;lastError=e;if(i<tries-1)await sleep(90*(i+1))}
  }
  console.error(`IR data read failed: object ${oid}, section ${key}`,lastError);
  return{rows:[],firstError:true,retried:true,error:lastError};
 }
 async function copyRows(oid,key,rows){
  if(!rows?.length)return 0;
  const api=irProject.data.forObject(oid).section(key);let count=0;
  for(const r of rows){
   const payload={record_type:r.record_type||"item",title:r.title||"",data:{...(r.data||{})}};
   try{await api.create(payload);count++}catch(e){console.error(`IR recovery copy failed: ${key}`,e)}
  }
  return count;
 }
 async function readAny(oid,key){
  const primary=await readRetry(oid,key);
  if(primary.rows.length)return{...primary,key};
  for(const alias of ALIASES[key]||[]){
   const x=await readRetry(oid,alias,2);
   if(x.rows.length)return{...x,key:alias,alias:true};
  }
  return{...primary,key};
 }
 async function exactSibling(oid,current,objects){
  const matches=(objects||[]).filter(o=>String(o.id)!==String(oid)&&sameObject(o,current));
  return matches.length===1?matches[0]:null;
 }
 async function ensureObject(oid){
  const current=await irProject.data.objects.get(oid).catch(()=>null);if(!current)return{changed:false,refresh:false};
  const objects=await irProject.data.objects.list().catch(()=>[]),sibling=await exactSibling(oid,current,objects);
  let changed=false,refresh=false;
  for(const key of KEYS){
   const target=await readRetry(oid,key);
   if(target.rows.length){if(target.firstError||target.retried)refresh=true;continue}
   let source=null;
   for(const alias of ALIASES[key]||[]){const a=await readRetry(oid,alias,2);if(a.rows.length){source=a.rows;break}}
   if(!source&&sibling){const s=await readAny(sibling.id,key);if(s.rows.length)source=s.rows}
   if(source?.length){const copied=await copyRows(oid,key,source);if(copied){changed=true;refresh=true;console.warn(`IR recovery: restored ${copied} ${key} rows for object ${oid}`)}}
  }
  return{changed,refresh};
 }
 window.irObjectDataRecovery={ensureObject,readRetry,readAny};
 const overviewId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 let busy=false,lastRefresh="",lastRouteObject=overviewId();
 async function run(){
  const oid=overviewId();if(!oid||busy)return;busy=true;
  try{
   const result=await ensureObject(oid);
   if(result.refresh&&lastRefresh!==String(oid)){
    lastRefresh=String(oid);
    const render=typeof window.objectPage==="function"?window.objectPage:(typeof objectPage==="function"?objectPage:null);
    if(render)await render(oid);
    setTimeout(()=>window.dispatchEvent(new Event("hashchange")),40);
   }
  }catch(e){console.error("IR object data recovery",e)}finally{busy=false}
 }
 window.addEventListener("hashchange",()=>{const oid=overviewId();if(oid!==lastRouteObject){lastRefresh="";lastRouteObject=oid}setTimeout(run,60)});
 setTimeout(run,80);
})();

;

/* #43: src/deliveries-page.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??0).trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const record=r=>({id:String(r.id),record_type:r.record_type||"delivery",title:r.title||"",...(r.data||{})});
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
 const editIcon=svg('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>');
 const trashIcon=svg('<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>');
 window.irDeliveriesPage=async oid=>{
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("deliveries"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);if(!object){location.hash="/objects";return}
  let [raw,workRows,markRows]=await Promise.all([api.list().catch(()=>[]),wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]),selectedId="";
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("deliveries"):false;
  const rows=()=>raw.map(record).sort((a,b)=>String(b.date||b.delivery_date||"").localeCompare(String(a.date||a.delivery_date||""))||Number(b.id)-Number(a.id));
  const workTypes=()=>arr(workRows).filter(r=>{const d=r.data||{},service=(d.accounting_type||"")==="service"||norm(d.unit)==="услуга";if(service||d.has_marks===false||d.work_category==="other")return false;if(d.has_marks===true||["installation","fabrication"].includes(d.work_category))return true;const id=String(r.id),name=norm(d.work_type||r.title||"");return name.includes("монтаж")||name.includes("изготов")||arr(markRows).some(m=>String(m.data?.work_type_id||"")===id)}).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||""}});
  const serviceWorkIds=()=>new Set(arr(workRows).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id)));
  const isServiceItem=x=>x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||serviceWorkIds().has(String(x?.work_type_id||""));
  const deliveryItems=r=>itemsOf(r).filter(x=>!isServiceItem(x));
  const marks=()=>arr(markRows).map(r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})}));
  const totalTonnage=()=>rows().reduce((s,x)=>s+num(x.total_tonnage??x.tonnage),0);
  const deliveredMap=excludeId=>{const map={};for(const r of rows()){if(excludeId&&String(r.id)===String(excludeId))continue;for(const x of deliveryItems(r)){const mid=String(x.mark_id||"");if(mid)map[mid]=(map[mid]||0)+num(x.qty??x.count??x.quantity)}}return map};
  const markState=(m,excludeId)=>{const total=num(m.qty??m.count),delivered=Math.min(total,deliveredMap(excludeId)[String(m.id)]||0),left=Math.max(0,total-delivered),uv=num(m.unit_volume??m.volume_one);return{total,delivered,left,uv}};
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(w.name)}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
  const positionRow=x=>`<div class="delivery-position-row" data-initial-mark="${esc(x?.mark_id||"")}"><label class="dp-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="dp-code">Шифр<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="dp-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="dp-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label class="dp-volume">Объём<input name="volume" readonly value="${esc(x?.volume??x?.total_volume??"")}" placeholder="0"></label><label class="dp-unit">Ед.<input name="unit" readonly value="${esc(x?.unit||"")}" placeholder="—"></label><button type="button" class="delivery-position-remove row-remove" title="Удалить позицию">×</button></div>`;
  const composition=r=>{const items=deliveryItems(r);if(!items.length)return'<span class="delivery-composition-empty">Позиции не указаны</span>';const map=new Map();for(const x of items){const key=[x.work_type_id||x.work_type||"",x.project_code||""].join("|");if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}const groups=[...map.values()];return `<div class="delivery-composition">${groups.slice(0,2).map(g=>`<div><b>${esc(g.name)}</b><span>${esc(g.code||"Шифр не указан")} · ${g.count} поз.</span></div>`).join("")}${groups.length>2?`<small>+ ещё ${groups.length-2}</small>`:""}</div>`};
  function dialogHtml(){return canEdit()?`<dialog id="deliveryDialog" class="delivery-dialog"><form id="deliveryForm"><input type="hidden" name="id"><div class="delivery-form-head"><div><h2 id="deliveryFormTitle">Добавить накладную</h2><p>Данные накладной и фактически привезённые марки</p></div><button type="button" id="deliveryDialogX" class="delivery-dialog-x">×</button></div><div class="delivery-form-grid delivery-main-fields"><label>Номер накладной<input name="number" required placeholder="Например: 154"></label><label>Дата<input type="date" name="date" required></label><label>Машина №<input name="vehicle_number" placeholder="Например: 777 ABC 09"></label><label>ФИО водителя<input name="driver_name" placeholder="ФИО водителя"></label><label class="wide">Общий тоннаж<input name="total_tonnage" inputmode="decimal" required placeholder="0,000"><small>Общий вес по накладной, тн</small></label></div><section class="delivery-positions"><div class="delivery-positions-head"><div><h3>Марки по накладной</h3><p>Вид работы → шифр → марка → количество</p></div><button type="button" id="deliveryAddPosition">＋ Добавить марку</button></div><div id="deliveryPositionsList" class="delivery-positions-list"></div></section><div class="delivery-form-actions"><button type="button" id="deliveryCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`:""}
  function list(){
   selectedId="";const all=rows();
   const body=all.length?all.map(r=>`<div class="delivery-row" data-delivery-id="${esc(r.id)}"><div><span>№</span><b>${esc(r.number||r.delivery_number||r.id)}</b></div><div><span>Дата</span><b>${dmy(r.date||r.delivery_date)}</b></div><div class="delivery-row-composition"><span>Вид работы · Шифр · Марки</span>${composition(r)}</div><div><span>Машина №</span><b>${esc(r.vehicle_number||"—")}</b></div><div><span>Водитель</span><b>${esc(r.driver_name||"—")}</b></div><div class="delivery-tonnage"><span>Общий тоннаж</span><b>${fmt(r.total_tonnage??r.tonnage)} тн</b></div>${canEdit()?`<div class="delivery-actions report-actions"><button type="button" data-delivery-edit="${esc(r.id)}" title="Редактировать">${editIcon}</button><button type="button" data-delivery-delete="${esc(r.id)}" class="report-delete" title="Удалить">${trashIcon}</button></div>`:"<div></div>"}</div>`).join(""):'<div class="delivery-empty">Раздел Поставки пуст</div>';
   app.innerHTML=`<div class="deliveries-page"><div class="deliveries-head"><button class="back" id="deliveriesBack">← Назад</button><div><h1>Поставки</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="delivery-add" id="deliveryAdd">＋ Добавить накладную</button>':""}</div><div class="delivery-summary"><div><span>Накладных</span><b>${all.length}</b></div><div><span>Общий тоннаж</span><b>${fmt(totalTonnage())} тн</b></div><div><span>Последняя поставка</span><b>${all.length?dmy(all[0].date||all[0].delivery_date):"—"}</b></div></div><div class="delivery-card"><div class="delivery-table-head"><span>Номер</span><span>Дата</span><span>Вид работы · Шифр · Марки</span><span>Машина №</span><span>Водитель</span><span>Тоннаж</span><span></span></div><div class="delivery-list">${body}</div></div>${dialogHtml()}</div>`;
   document.getElementById("deliveriesBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.querySelectorAll("[data-delivery-id]").forEach(row=>row.onclick=e=>{if(e.target.closest(".delivery-actions"))return;detail(row.dataset.deliveryId)});
   if(canEdit())setupDialog();
  }
  function detail(id){
   selectedId=String(id);const r=rows().find(x=>String(x.id)===selectedId);if(!r)return list();const items=deliveryItems(r);
   const tableRows=items.length?items.map(x=>`<tr><td><b>${esc(x.work_type||"Работа")}</b></td><td>${esc(x.project_code||"—")}</td><td><b>${esc(x.mark||"—")}</b>${x.name?`<small>${esc(x.name)}</small>`:""}</td><td>${fmt(x.qty??x.count)}</td><td><b>${fmt(x.volume??x.total_volume)} ${esc(x.unit||"")}</b></td></tr>`).join(""):'<tr><td colspan="5" class="delivery-detail-empty">Позиции по маркам не указаны</td></tr>';
   app.innerHTML=`<div class="deliveries-page"><div class="deliveries-head"><button class="back" id="deliveryDetailBack">← К накладным</button><div><h1>Накладная №${esc(r.number||r.delivery_number||r.id)}</h1><p>${esc(object.name||"")}</p></div>${canEdit()?`<div class="delivery-detail-actions report-actions"><button id="deliveryDetailEdit" title="Редактировать">${editIcon}</button><button id="deliveryDetailDelete" class="report-delete" title="Удалить">${trashIcon}</button></div>`:""}</div><div class="delivery-detail-card"><div class="delivery-detail-title"><span>ПОСТАВКА</span><h2>Накладная №${esc(r.number||r.delivery_number||r.id)}</h2><p>от ${dmy(r.date||r.delivery_date)}</p></div><div class="delivery-detail-grid"><div><span>Номер накладной</span><b>${esc(r.number||r.delivery_number||r.id)}</b></div><div><span>Дата</span><b>${dmy(r.date||r.delivery_date)}</b></div><div><span>Машина №</span><b>${esc(r.vehicle_number||"—")}</b></div><div><span>ФИО водителя</span><b>${esc(r.driver_name||"—")}</b></div><div><span>Позиций</span><b>${items.length}</b></div><div class="accent"><span>Общий тоннаж</span><b>${fmt(r.total_tonnage??r.tonnage)} тн</b></div></div><section class="delivery-items-section"><div class="delivery-items-title"><h3>Марки по накладной</h3><span>${items.length} поз.</span></div><div class="delivery-items-table"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка</th><th>Кол-во</th><th>Объём</th></tr></thead><tbody>${tableRows}</tbody></table></div></section></div>${dialogHtml()}</div>`;
   document.getElementById("deliveryDetailBack").onclick=list;
   if(canEdit()){setupDialog();document.getElementById("deliveryDetailEdit").onclick=()=>openDialog(r);document.getElementById("deliveryDetailDelete").onclick=()=>remove(r)}
  }
  function setupPositionRow(row,editId){
   const wt=row.querySelector('[name="work_type_id"]'),code=row.querySelector('[name="project_code"]'),unit=row.querySelector('[name="unit"]'),search=row.querySelector('[name="mark_search"]'),mid=row.querySelector('[name="mark_id"]'),qty=row.querySelector('[name="qty"]'),volume=row.querySelector('[name="volume"]'),box=row.querySelector('.mark-results'),balance=row.querySelector('.selected-mark-balance');let selected=marks().find(m=>String(m.id)===String(mid.value));
   const showBalance=()=>{if(!selected){balance.hidden=true;return}const s=markState(selected,editId);balance.innerHTML=`<span>Всего: <b>${fmt(s.total)}</b></span><span class="mounted">Завезено: <b>${fmt(s.delivered)}</b></span><span class="left">Осталось: <b>${fmt(s.left)}</b></span>`;balance.hidden=false;qty.max=String(s.left)};
   const calc=()=>{if(!selected){volume.value="0";return}const s=markState(selected,editId),q=Math.max(0,num(qty.value));if(q>s.left)qty.value=fmt(s.left);volume.value=fmt(num(qty.value)*s.uv)};
   const renderMarks=()=>{const wid=String(wt.value),q=search.value.trim().toLowerCase();if(!wid){box.innerHTML='<div class="mark-result-empty">Сначала выберите вид работы</div>';box.hidden=false;return}const list=marks().filter(m=>String(m.work_type_id||"")===wid&&(!q||`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q))).sort((a,b)=>String(a.mark||a.title||"").localeCompare(String(b.mark||b.title||""),"ru",{numeric:true}));box.innerHTML=list.length?list.map(m=>{const s=markState(m,editId),done=s.left<=0;return `<button type="button" data-mid="${m.id}" class="${done?"mark-result-done":s.delivered>0?"mark-result-partial":"mark-result-left"}" ${done?'disabled title="Марка завезена полностью"':""}><b>${esc(m.mark||m.title||"—")}</b><span>${esc(m.name||"")}</span><i>Всего ${fmt(s.total)} · Завезено ${fmt(s.delivered)} · Ост. ${fmt(s.left)}</i></button>`}).join(""):'<div class="mark-result-empty">Марки не найдены</div>';box.hidden=false;box.querySelectorAll("button:not(:disabled)[data-mid]").forEach(b=>b.onclick=()=>{selected=marks().find(m=>String(m.id)===String(b.dataset.mid));mid.value=selected.id;search.value=`${selected.mark||selected.title||""}${selected.name?" — "+selected.name:""}`;box.hidden=true;showBalance();calc()})};
   wt.onchange=()=>{const w=workTypes().find(x=>x.id===String(wt.value));code.value=w?.code||"";unit.value=w?.unit||"";selected=null;mid.value="";search.value="";qty.value="";volume.value="";balance.hidden=true;box.hidden=true};
   search.onfocus=renderMarks;search.oninput=()=>{selected=null;mid.value="";balance.hidden=true;renderMarks()};qty.oninput=calc;row.querySelector('.delivery-position-remove').onclick=()=>row.remove();showBalance();calc();
  }
  function setupDialog(){
   const d=document.getElementById("deliveryDialog"),f=document.getElementById("deliveryForm"),listEl=document.getElementById("deliveryPositionsList");if(!d||!f||!listEl)return;
   document.getElementById("deliveryAdd")?.addEventListener("click",()=>openDialog());
   document.getElementById("deliveryDialogX").onclick=()=>d.close();document.getElementById("deliveryCancel").onclick=()=>d.close();
   document.getElementById("deliveryAddPosition").onclick=()=>{listEl.insertAdjacentHTML("beforeend",positionRow({}));setupPositionRow(listEl.lastElementChild,String(f.elements.id.value||""))};
   document.querySelectorAll("[data-delivery-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();openDialog(rows().find(x=>String(x.id)===String(b.dataset.deliveryEdit)))});
   document.querySelectorAll("[data-delivery-delete]").forEach(b=>b.onclick=e=>{e.stopPropagation();const r=rows().find(x=>String(x.id)===String(b.dataset.deliveryDelete));if(r)remove(r)});
   f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),id=String(fd.get("id")||""),number=String(fd.get("number")||"").trim(),date=String(fd.get("date")||""),vehicle=String(fd.get("vehicle_number")||"").trim(),driver=String(fd.get("driver_name")||"").trim(),tonnage=num(fd.get("total_tonnage"));if(!number||!date)return;if(tonnage<0)return alert("Общий тоннаж не может быть отрицательным.");const items=[...f.querySelectorAll('.delivery-position-row')].map(row=>{const wid=String(row.querySelector('[name="work_type_id"]').value),w=workTypes().find(x=>x.id===wid),mid=String(row.querySelector('[name="mark_id"]').value),m=marks().find(x=>String(x.id)===mid),q=num(row.querySelector('[name="qty"]').value),uv=num(m?.unit_volume??m?.volume_one);return{work_type_id:wid,work_type:w?.name||"",project_code:w?.code||"",unit:w?.unit||m?.unit||"",mark_id:mid,mark:m?.mark||m?.title||"",name:m?.name||"",qty:q,unit_volume:uv,volume:q*uv}}).filter(x=>x.work_type_id&&x.mark_id&&x.qty>0);if(!items.length)return alert("Добавьте хотя бы одну марку в накладную.");const byMark={};for(const x of items)byMark[x.mark_id]=(byMark[x.mark_id]||0)+num(x.qty);for(const [mid,q] of Object.entries(byMark)){const m=marks().find(x=>String(x.id)===String(mid)),s=m?markState(m,id):null;if(s&&q>s.left+1e-9)return alert(`По марке ${m.mark||m.title||""} осталось ${fmt(s.left)}, а в накладной указано ${fmt(q)}.`)}const duplicate=rows().find(x=>String(x.id)!==id&&String(x.number||x.delivery_number||"").trim().toLowerCase()===number.toLowerCase());if(duplicate&&!confirm(`Накладная №${number} уже существует. Всё равно сохранить?`))return;const payload={record_type:"delivery",title:`Накладная №${number}`,data:{number,date,vehicle_number:vehicle,driver_name:driver,total_tonnage:tonnage,items}};if(id)await api.update(id,payload);else await api.create(payload);raw=await api.list().catch(()=>raw);d.close();if(selectedId&&id===selectedId)detail(id);else list()};
  }
  function openDialog(r){
   const d=document.getElementById("deliveryDialog"),f=document.getElementById("deliveryForm"),listEl=document.getElementById("deliveryPositionsList");if(!d||!f||!listEl)return;f.reset();const editId=String(r?.id||"");f.elements.id.value=editId;f.elements.number.value=r?.number||r?.delivery_number||"";f.elements.date.value=String(r?.date||r?.delivery_date||"").slice(0,10);f.elements.vehicle_number.value=r?.vehicle_number||"";f.elements.driver_name.value=r?.driver_name||"";f.elements.total_tonnage.value=r?fmt(r.total_tonnage??r.tonnage):"";const items=deliveryItems(r||{});listEl.innerHTML=(items.length?items:[{}]).map(positionRow).join("");listEl.querySelectorAll('.delivery-position-row').forEach(row=>setupPositionRow(row,editId));document.getElementById("deliveryFormTitle").textContent=r?"Редактировать накладную":"Добавить накладную";d.showModal()
  }
  async function remove(r){if(!confirm(`Удалить накладную №${r.number||r.delivery_number||r.id}?`))return;await api.remove(r.id);raw=await api.list().catch(()=>[]);list()}
  list();
 };
 const direct=location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries$/);if(direct)setTimeout(()=>window.irDeliveriesPage(direct[1]),0);
})();

;

/* #44: src/deliveries-route-v2.js */
"use strict";
(()=>{
 const base=window.irDeliveriesPage;if(typeof base!=="function")return;
 const PAGE_SIZE=15;
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??0).trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const record=r=>({id:String(r.id),record_type:r.record_type||"delivery",title:r.title||"",...(r.data||{})});
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const normUnit=u=>{const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s/g,"");if(["т","тн","tn","ton","tons"].includes(s))return"тн";if(["м2","m2"].includes(s))return"м2";if(["м3","m3"].includes(s))return"м3";return s||"ед."};
 const serviceIdsFromRows=rows=>new Set(arr(rows).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id)));
 const isServiceItem=(x,ids)=>x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||ids?.has(String(x?.work_type_id||""));
 const visibleItems=(r,ids)=>itemsOf(r).filter(x=>!isServiceItem(x,ids));
 const baseHash=oid=>`/objects/object/${oid}/deliveries`;
 const detailHash=(oid,id)=>`${baseHash(oid)}?id=${encodeURIComponent(id)}`;
 const newHash=oid=>`${baseHash(oid)}?mode=new`;
 const editHash=(oid,id)=>`${baseHash(oid)}?mode=edit&id=${encodeURIComponent(id)}`;
 const pageHash=(oid,page)=>page>1?`${baseHash(oid)}?page=${page}`:baseHash(oid);
 const copyIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path></svg>`;
 function syncBodyClass(){document.body.classList.toggle("ir-delivery-form-route",/^#?\/objects\/object\/\d+\/deliveries\?(?=[^#]*mode=(?:new|edit))/.test(location.hash))}
 window.addEventListener("hashchange",syncBodyClass);syncBodyClass();
 function replaceButton(el,handler){if(!el)return null;const clone=el.cloneNode(true);el.replaceWith(clone);clone.onclick=e=>{e.preventDefault();e.stopPropagation();handler(e)};return clone}
 function workGroups(r,serviceIds){const map=new Map();for(const x of visibleItems(r,serviceIds)){const key=`${x.work_type_id||x.work_type||""}|${x.project_code||""}`;if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}return[...map.values()]}
 function volumeTotals(r,serviceIds){const totals={};for(const x of visibleItems(r,serviceIds)){const u=normUnit(x.unit),v=num(x.volume??x.total_volume??(num(x.qty??x.count)*num(x.unit_volume??x.volume_one)));totals[u]=(totals[u]||0)+v}if(!Object.keys(totals).length&&!itemsOf(r).length&&r?.totals_by_unit&&typeof r.totals_by_unit==="object")for(const [u,v] of Object.entries(r.totals_by_unit))totals[normUnit(u)]=(totals[normUnit(u)]||0)+num(v);return totals}
 function totalsText(totals){const parts=Object.entries(totals).filter(([,v])=>Math.abs(num(v))>1e-9).map(([u,v])=>`${fmt(v)} ${u}`);return parts.length?parts.join(" · "):"0"}
 function patchList(oid,records,serviceIds){
  const byId=new Map(records.map(r=>[String(r.id),r]));
  const head=document.querySelector(".delivery-table-head span:nth-child(3)");if(head)head.textContent="Наименование работы · Шифр · Позиций";
  const volumeHead=document.querySelector(".delivery-table-head span:nth-child(6)");if(volumeHead)volumeHead.textContent="Объём";
  document.querySelectorAll(".delivery-row[data-delivery-id]").forEach(row=>{
   const r=byId.get(String(row.dataset.deliveryId));if(!r)return;
   const cell=row.querySelector(".delivery-row-composition");if(cell){const groups=workGroups(r,serviceIds);cell.innerHTML=`<span>Наименование работы · Шифр · Позиций</span>${groups.length?`<div class="delivery-composition">${groups.map(g=>`<div><b>${esc(g.name)}</b><span>${esc(g.code||"Шифр не указан")} · ${g.count} поз.</span></div>`).join("")}</div>`:'<span class="delivery-composition-empty">Позиции не указаны</span>'}`}
   const total=row.querySelector(".delivery-tonnage b");if(total)total.textContent=totalsText(volumeTotals(r,serviceIds));
  });
  replaceButton(document.getElementById("deliveryAdd"),()=>location.hash=newHash(oid));
  document.querySelectorAll("[data-delivery-edit]").forEach(btn=>replaceButton(btn,()=>location.hash=editHash(oid,btn.dataset.deliveryEdit)));
 }
 function wireDetail(oid,id,r,serviceIds){
  const back=document.getElementById("deliveryDetailBack");if(back)back.onclick=()=>location.hash=baseHash(oid);
  replaceButton(document.getElementById("deliveryDetailEdit"),()=>location.hash=editHash(oid,id));
  const grid=document.querySelector(".delivery-detail-grid");if(grid){const accent=grid.querySelector(".accent");if(accent){const s=accent.querySelector("span"),b=accent.querySelector("b");if(s)s.textContent="Общий объём";if(b)b.textContent=totalsText(volumeTotals(r,serviceIds))}}
 }
 function paginate(oid,page){
  const list=document.querySelector(".delivery-list");if(!list)return;
  const rows=[...list.querySelectorAll(".delivery-row")];if(!rows.length)return;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.max(1,Math.min(totalPages,Number(page)||1));
  rows.forEach((row,i)=>{row.hidden=i<(current-1)*PAGE_SIZE||i>=current*PAGE_SIZE;row.addEventListener("click",e=>{if(e.target.closest(".delivery-actions"))return;e.preventDefault();e.stopImmediatePropagation();location.hash=detailHash(oid,row.dataset.deliveryId)},true)});
  document.querySelector(".delivery-pagination")?.remove();if(totalPages<=1)return;
  const wrap=document.createElement("div");wrap.className="delivery-pagination";const nums=Array.from({length:totalPages},(_,i)=>i+1);
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${Math.min((current-1)*PAGE_SIZE+1,rows.length)}–${Math.min(current*PAGE_SIZE,rows.length)} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-page="${current-1}" ${current<=1?"disabled":""}>‹</button>${nums.map(n=>`<button type="button" data-page="${n}" class="${n===current?"active":""}">${n}</button>`).join("")}<button type="button" data-page="${current+1}" ${current>=totalPages?"disabled":""}>›</button></div>`;
  document.querySelector(".delivery-card")?.insertAdjacentElement("afterend",wrap);wrap.querySelectorAll("button[data-page]").forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=totalPages)location.hash=pageHash(oid,p)})
 }
 async function renderForm(oid,route){
  document.body.classList.add("ir-delivery-form-route");
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("deliveries"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);if(!object){location.hash="/objects";return}
  const [raw,workRows,markRows]=await Promise.all([api.list().catch(()=>[]),wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]),records=raw.map(record),editing=route.mode==="edit",editId=editing?String(route.deliveryId||""):"",current=editing?records.find(x=>String(x.id)===editId):null;
  if(editing&&!current){location.hash=baseHash(oid);return}
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("deliveries"):false;if(!canEdit()){location.hash=editing?detailHash(oid,editId):baseHash(oid);return}
  const serviceWorkIds=serviceIdsFromRows(workRows);
  const workTypes=()=>arr(workRows).filter(r=>{const d=r.data||{},service=(d.accounting_type||"")==="service"||norm(d.unit)==="услуга";if(service||d.has_marks===false||d.work_category==="other")return false;if(d.has_marks===true||["installation","fabrication"].includes(d.work_category))return true;const id=String(r.id),name=norm(d.work_type||r.title||"");return name.includes("монтаж")||name.includes("изготов")||arr(markRows).some(m=>String(m.data?.work_type_id||"")===id)}).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:normUnit(d.unit||"")}});
  const marks=()=>arr(markRows).map(r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})}));
  const deliveredMap=excludeId=>{const map={};for(const r of records){if(excludeId&&String(r.id)===String(excludeId))continue;for(const x of visibleItems(r,serviceWorkIds)){const mid=String(x.mark_id||"");if(mid)map[mid]=(map[mid]||0)+num(x.qty??x.count??x.quantity)}}return map};
  const delivered=deliveredMap(editId);
  const baseState=m=>{const total=num(m.qty??m.count),done=Math.min(total,delivered[String(m.id)]||0),uv=num(m.unit_volume??m.volume_one);return{total,done,left:Math.max(0,total-done),uv}};
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(w.name)}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
  const positionRow=x=>`<div class="delivery-form-position"><label class="dfp-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="dfp-code">Шифр<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="dfp-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="dfp-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label class="dfp-volume">Объём<input name="volume" readonly value="${esc(x?.volume??x?.total_volume??"")}" placeholder="0"></label><label class="dfp-unit">Ед.<input name="unit" readonly value="${esc(normUnit(x?.unit||""))}" placeholder="—"></label><button type="button" class="delivery-form-copy" title="Копировать позицию">${copyIcon}</button><button type="button" class="row-remove delivery-form-remove" title="Удалить позицию">×</button></div>`;
  const initial=editing?visibleItems(current,serviceWorkIds):[];
  app.innerHTML=`<div class="delivery-form-page"><div class="delivery-form-page-head"><button class="back" id="deliveryFormBack">← К накладным</button><div><h1>${editing?`Редактирование накладной №${esc(current.number||current.delivery_number||current.id)}`:"Новая накладная"}</h1><p>${esc(object.name||"")}</p></div><button class="delivery-form-save-top" form="deliveryStandaloneForm">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div><form id="deliveryStandaloneForm" class="delivery-standalone-form"><section class="delivery-form-section"><div class="delivery-form-section-head"><span>01</span><div><h2>Данные накладной</h2><p>Номер, дата и транспорт</p></div></div><div class="delivery-form-section-body delivery-form-main-grid"><label>Номер накладной<input name="number" required value="${esc(current?.number||current?.delivery_number||"")}" placeholder="Например: 154"></label><label>Дата<input type="date" name="date" required value="${esc(String(current?.date||current?.delivery_date||"").slice(0,10))}"></label><label>Машина №<input name="vehicle_number" value="${esc(current?.vehicle_number||"")}" placeholder="Например: 777 ABC 09"></label><label>ФИО водителя<input name="driver_name" value="${esc(current?.driver_name||"")}" placeholder="ФИО водителя"></label><label>Общий объём<input id="deliveryAutoTotal" readonly value=""><small>Рассчитывается автоматически по выбранным маркам</small></label></div></section><section class="delivery-form-section"><div class="delivery-form-section-head"><span>02</span><div><h2>Марки по накладной</h2><p>Вид работы → шифр → марка → количество</p></div><button type="button" class="delivery-form-add-position" id="deliveryFormAddPosition">＋ Добавить марку</button></div><div class="delivery-form-section-body"><div id="deliveryFormPositions" class="delivery-form-positions">${(initial.length?initial:[{}]).map(positionRow).join("")}</div></div></section><div class="delivery-form-bottom"><button type="button" id="deliveryFormCancel">Отмена</button><button type="submit" class="delivery-form-save">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div></form></div>`;
  const list=document.getElementById("deliveryFormPositions"),form=document.getElementById("deliveryStandaloneForm"),totalField=document.getElementById("deliveryAutoTotal");
  const rowQtyForMark=(mid,except)=>[...list.querySelectorAll(".delivery-form-position")].reduce((s,r)=>r===except||String(r.querySelector('[name="mark_id"]')?.value||"")!==String(mid)?s:s+num(r.querySelector('[name="qty"]')?.value),0);
  const stateFor=(m,row)=>{const s=baseState(m);return{...s,left:Math.max(0,s.left-rowQtyForMark(m.id,row))}};
  const currentTotals=()=>{const totals={};for(const row of list.querySelectorAll(".delivery-form-position")){const u=normUnit(row.querySelector('[name="unit"]')?.value),v=num(row.querySelector('[name="volume"]')?.value);if(v>0)totals[u]=(totals[u]||0)+v}return totals};
  const updateTotal=()=>{totalField.value=totalsText(currentTotals())};
  const rowData=row=>({work_type_id:row.querySelector('[name="work_type_id"]')?.value||"",project_code:row.querySelector('[name="project_code"]')?.value||"",mark_id:row.querySelector('[name="mark_id"]')?.value||"",mark:(()=>{const mid=row.querySelector('[name="mark_id"]')?.value,m=marks().find(x=>String(x.id)===String(mid));return m?.mark||m?.title||""})(),name:(()=>{const mid=row.querySelector('[name="mark_id"]')?.value,m=marks().find(x=>String(x.id)===String(mid));return m?.name||""})(),qty:row.querySelector('[name="qty"]')?.value||"",volume:row.querySelector('[name="volume"]')?.value||"",unit:row.querySelector('[name="unit"]')?.value||""});
  const appendRow=data=>{const host=document.createElement("div");host.innerHTML=positionRow(data||{});const row=host.firstElementChild;list.appendChild(row);setupRow(row);updateTotal();return row};
  const setupRow=row=>{
   const wt=row.querySelector('[name="work_type_id"]'),code=row.querySelector('[name="project_code"]'),unit=row.querySelector('[name="unit"]'),search=row.querySelector('[name="mark_search"]'),mid=row.querySelector('[name="mark_id"]'),qty=row.querySelector('[name="qty"]'),volume=row.querySelector('[name="volume"]'),box=row.querySelector('.mark-results'),balance=row.querySelector('.selected-mark-balance');let selected=marks().find(m=>String(m.id)===String(mid.value));
   const showBalance=()=>{if(!selected){balance.hidden=true;return}const s=stateFor(selected,row);balance.innerHTML=`<span>Всего: <b>${fmt(s.total)}</b></span><span class="mounted">Завезено: <b>${fmt(s.done)}</b></span><span class="left">Доступно: <b>${fmt(s.left)}</b></span>`;balance.hidden=false};
   const calc=()=>{if(!selected){volume.value="0";updateTotal();return}const s=stateFor(selected,row);let q=Math.max(0,num(qty.value));if(q>s.left){q=s.left;qty.value=fmt(q)}volume.value=fmt(q*s.uv);showBalance();updateTotal()};
   const renderMarks=()=>{const wid=String(wt.value),q=search.value.trim().toLowerCase();if(!wid){box.innerHTML='<div class="mark-result-empty">Сначала выберите вид работы</div>';box.hidden=false;return}const found=marks().filter(m=>String(m.work_type_id||"")===wid&&(!q||`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q))).sort((a,b)=>String(a.mark||a.title||"").localeCompare(String(b.mark||b.title||""),"ru",{numeric:true}));box.innerHTML=found.length?found.map(m=>{const s=stateFor(m,row),done=s.left<=0;return `<button type="button" data-mid="${esc(m.id)}" class="${done?"mark-result-done":s.done>0?"mark-result-partial":"mark-result-left"}" ${done?'disabled title="Марка завезена полностью"':""}><b>${esc(m.mark||m.title||"—")}</b><span>${esc(m.name||"")}</span><i>Всего ${fmt(s.total)} · Завезено ${fmt(s.done)} · Доступно ${fmt(s.left)} · ${fmt(s.uv)} ${esc(normUnit(m.unit||unit.value||""))}</i></button>`}).join(""):'<div class="mark-result-empty">Марки не найдены</div>';box.hidden=false;box.querySelectorAll("button:not(:disabled)[data-mid]").forEach(b=>b.onclick=()=>{selected=marks().find(m=>String(m.id)===String(b.dataset.mid));mid.value=selected?.id||"";search.value=selected?`${selected.mark||selected.title||""}${selected.name?" — "+selected.name:""}`:"";const w=workTypes().find(x=>x.id===String(wt.value));unit.value=normUnit(selected?.unit||w?.unit||"");box.hidden=true;showBalance();calc()})};
   wt.onchange=()=>{const w=workTypes().find(x=>x.id===String(wt.value));code.value=w?.code||"";unit.value=w?.unit||"";selected=null;mid.value="";search.value="";qty.value="";volume.value="";balance.hidden=true;box.hidden=true;updateTotal()};
   search.onfocus=renderMarks;search.oninput=()=>{selected=null;mid.value="";balance.hidden=true;renderMarks();updateTotal()};qty.oninput=calc;
   row.querySelector(".delivery-form-copy").onclick=()=>appendRow(rowData(row));
   row.querySelector(".delivery-form-remove").onclick=()=>{if(list.children.length===1){wt.value="";wt.onchange();return}row.remove();[...list.children].forEach(r=>{const q=r.querySelector('[name="qty"]');if(q)q.dispatchEvent(new Event("input"))});updateTotal()};
   showBalance();calc();
  };
  [...list.children].forEach(setupRow);updateTotal();
  document.getElementById("deliveryFormAddPosition").onclick=()=>appendRow({});
  const back=()=>location.hash=editing?detailHash(oid,editId):baseHash(oid);document.getElementById("deliveryFormBack").onclick=back;document.getElementById("deliveryFormCancel").onclick=back;
  form.onsubmit=async e=>{
   e.preventDefault();const fd=new FormData(form),number=String(fd.get("number")||"").trim(),date=String(fd.get("date")||""),vehicle=String(fd.get("vehicle_number")||"").trim(),driver=String(fd.get("driver_name")||"").trim();if(!number||!date)return;
   const duplicate=records.find(x=>String(x.id)!==editId&&String(x.number||x.delivery_number||"").trim().toLowerCase()===number.toLowerCase());if(duplicate&&!confirm(`Накладная №${number} уже существует. Всё равно сохранить?`))return;
   const items=[...list.querySelectorAll(".delivery-form-position")].map(row=>{const wid=String(row.querySelector('[name="work_type_id"]').value),w=workTypes().find(x=>x.id===wid),mid=String(row.querySelector('[name="mark_id"]').value),m=marks().find(x=>String(x.id)===mid),q=num(row.querySelector('[name="qty"]').value),uv=num(m?.unit_volume??m?.volume_one),unit=normUnit(m?.unit||w?.unit||row.querySelector('[name="unit"]').value);return{work_type_id:wid,work_type:w?.name||"",project_code:w?.code||"",unit,mark_id:mid,mark:m?.mark||m?.title||"",name:m?.name||"",qty:q,unit_volume:uv,volume:q*uv}}).filter(x=>x.work_type_id&&x.mark_id&&x.qty>0);
   if(!items.length)return alert("Добавьте хотя бы одну марку в накладную.");
   const byMark={};for(const x of items)byMark[x.mark_id]=(byMark[x.mark_id]||0)+num(x.qty);for(const [mid,q] of Object.entries(byMark)){const m=marks().find(x=>String(x.id)===String(mid));if(m&&q>baseState(m).left+1e-9)return alert(`Количество по марке ${m.mark||m.title||mid} превышает доступный остаток.`)}
   const totals={};for(const x of items)totals[x.unit]=(totals[x.unit]||0)+num(x.volume);const keys=Object.keys(totals),payload={record_type:"delivery",title:`Накладная №${number}`,data:{number,date,vehicle_number:vehicle,driver_name:driver,items,totals_by_unit:totals,total_tonnage:num(totals["тн"]),total_volume:keys.length===1?num(totals[keys[0]]):0,total_unit:keys.length===1?keys[0]:""}};
   let saved;if(editing){saved=await api.update(editId,payload);location.hash=detailHash(oid,editId)}else{saved=await api.create(payload);location.hash=detailHash(oid,saved?.id||"")}
  };
 }
 window.irDeliveriesPage=async(oid,route={})=>{
  if(route.mode==="new"||route.mode==="edit")return renderForm(oid,route);
  document.body.classList.remove("ir-delivery-form-route");
  const root=irProject.data.forObject(oid),api=root.section("deliveries"),[deliveryRows,workRows]=await Promise.all([api.list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]),records=deliveryRows.map(record),serviceIds=serviceIdsFromRows(workRows);
  await base(oid);
  const id=String(route.deliveryId||"");if(id){const row=[...document.querySelectorAll(".delivery-row[data-delivery-id]")].find(x=>String(x.dataset.deliveryId)===id);if(!row){location.hash=baseHash(oid);return}row.click();wireDetail(oid,id,records.find(r=>String(r.id)===id),serviceIds);return}
  patchList(oid,records,serviceIds);paginate(oid,route.page||1);
 };
})();

;

/* #45: src/deliveries-filters.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const rec=r=>({id:String(r.id),title:r.title||"",...(r.data||{})});
 const states=window.irDeliveryFiltersState||(window.irDeliveryFiltersState=new Map());
 let token=0;
 function route(){
  const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries(?:\?([^#]*))?$/);if(!m)return null;
  const p=new URLSearchParams(m[2]||"");if(p.get("mode")||p.get("id"))return null;
  return{oid:m[1]};
 }
 function resolveItem(item,typesById){
  const wt=typesById.get(String(item.work_type_id||""));
  return{
   work:item.work_type||item.type||wt?.name||"",
   code:item.project_code||item.code||wt?.code||"",
   mark:item.mark||item.title||"",
   name:item.name||item.mark_name||item.item_name||""
  };
 }
 async function build(){
  const r=route();if(!r)return true;
  const card=document.querySelector(".delivery-card"),summary=document.querySelector(".delivery-summary");
  if(!card||!summary)return false;
  document.querySelector(".delivery-filters")?.remove();
  document.querySelector(".delivery-filter-empty")?.remove();
  const root=irProject.data.forObject(r.oid);
  const [rawDeliveries,rawTypes]=await Promise.all([
   root.section("deliveries").list().catch(()=>[]),
   root.section("work-types").list().catch(()=>[])
  ]);
  if(!route()||route().oid!==r.oid)return true;
  const deliveries=rawDeliveries.map(rec);
  const types=rawTypes.map(x=>({id:String(x.id),name:x.data?.work_type||x.title||"",code:x.data?.project_code||""}));
  const byTypeId=new Map(types.map(x=>[x.id,x]));
  const byDeliveryId=new Map(deliveries.map(x=>[x.id,x]));
  const worksMap=new Map(),codesByWork=new Map(),allCodes=new Map();
  for(const d of deliveries)for(const raw of itemsOf(d)){
   const x=resolveItem(raw,byTypeId),wk=norm(x.work),ck=norm(x.code);
   if(wk&&!worksMap.has(wk))worksMap.set(wk,x.work);
   if(ck&&!allCodes.has(ck))allCodes.set(ck,x.code);
   if(wk&&ck){if(!codesByWork.has(wk))codesByWork.set(wk,new Map());if(!codesByWork.get(wk).has(ck))codesByWork.get(wk).set(ck,x.code)}
  }
  let state=states.get(String(r.oid));if(!state){state={q:"",work:"",code:""};states.set(String(r.oid),state)}
  const workOptions=[...worksMap.entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru",{numeric:true}));
  const toolbar=document.createElement("div");toolbar.className="delivery-filters";
  toolbar.innerHTML=`<div class="delivery-filter-search"><span class="delivery-filter-search-icon">⌕</span><input type="search" id="deliveryFilterQuery" placeholder="Поиск: № накладной, марка или наименование марки" value="${esc(state.q)}"></div><select id="deliveryFilterWork"><option value="">Все виды работ</option>${workOptions.map(([v,t])=>`<option value="${esc(v)}" ${state.work===v?"selected":""}>${esc(t)}</option>`).join("")}</select><select id="deliveryFilterCode"><option value="">Все шифры</option></select><button type="button" id="deliveryFilterReset">Сбросить</button><div class="delivery-filter-count" id="deliveryFilterCount"></div>`;
  summary.insertAdjacentElement("afterend",toolbar);
  const qEl=toolbar.querySelector("#deliveryFilterQuery"),workEl=toolbar.querySelector("#deliveryFilterWork"),codeEl=toolbar.querySelector("#deliveryFilterCode"),resetEl=toolbar.querySelector("#deliveryFilterReset"),countEl=toolbar.querySelector("#deliveryFilterCount");
  function fillCodes(){
   const source=state.work?(codesByWork.get(state.work)||new Map()):allCodes;
   const opts=[...source.entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru",{numeric:true}));
   if(state.code&&!source.has(state.code))state.code="";
   codeEl.innerHTML=`<option value="">Все шифры</option>${opts.map(([v,t])=>`<option value="${esc(v)}" ${state.code===v?"selected":""}>${esc(t)}</option>`).join("")}`;
  }
  function matches(d){
   const q=norm(state.q),number=norm(d.number||d.delivery_number||d.title||d.id),items=itemsOf(d).map(x=>resolveItem(x,byTypeId));
   const searchOk=!q||number.includes(q)||items.some(x=>norm(x.mark).includes(q)||norm(x.name).includes(q));
   if(!searchOk)return false;
   if(!state.work&&!state.code)return true;
   return items.some(x=>(!state.work||norm(x.work)===state.work)&&(!state.code||norm(x.code)===state.code));
  }
  function apply(resetPage=false){
   let found=0;const rows=[...document.querySelectorAll(".delivery-list .delivery-row[data-delivery-id]")];
   for(const row of rows){const d=byDeliveryId.get(String(row.dataset.deliveryId)),ok=!!d&&matches(d);row.dataset.filterMatch=ok?"1":"0";if(ok)found++}
   countEl.textContent=`Найдено: ${found} из ${deliveries.length}`;
   document.querySelector(".delivery-filter-empty")?.remove();
   if(!found){const empty=document.createElement("div");empty.className="delivery-filter-empty";empty.textContent="По заданным условиям накладные не найдены";card.insertAdjacentElement("afterend",empty)}
   if(resetPage){const base=`/objects/object/${r.oid}/deliveries`;if(location.hash.replace(/^#/,"")!==base)history.replaceState(null,"",`#${base}`)}
   window.dispatchEvent(new CustomEvent("deliveries-filter-change",{detail:{oid:r.oid,found}}));
  }
  let timer=0;qEl.addEventListener("input",()=>{state.q=qEl.value;clearTimeout(timer);timer=setTimeout(()=>apply(true),120)});
  workEl.addEventListener("change",()=>{state.work=workEl.value;state.code="";fillCodes();apply(true)});
  codeEl.addEventListener("change",()=>{state.code=codeEl.value;apply(true)});
  resetEl.addEventListener("click",()=>{state.q="";state.work="";state.code="";qEl.value="";workEl.value="";fillCodes();apply(true);qEl.focus()});
  fillCodes();apply(false);return true;
 }
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{if(await build())return}catch(e){console.error("deliveries filters",e)}if(++tries<40)setTimeout(run,100)};setTimeout(run,30)}
 window.addEventListener("hashchange",schedule);
 setInterval(()=>{if(route()&&!document.querySelector(".delivery-filters")&&document.querySelector(".delivery-card"))schedule()},350);
 schedule();
})();

;

/* #46: src/deliveries-pagination-fix.js */
"use strict";
(()=>{
 const PAGE_SIZE=15;
 let token=0,lastSig="";
 const route=()=>{
  const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries(?:\?([^#]*))?$/);
  if(!m)return null;
  const params=new URLSearchParams(m[2]||"");
  if(params.get("mode")||params.get("id"))return null;
  return{oid:m[1],page:Math.max(1,Number(params.get("page"))||1)};
 };
 const hashFor=(oid,page)=>page>1?`/objects/object/${oid}/deliveries?page=${page}`:`/objects/object/${oid}/deliveries`;
 function apply(){
  const r=route();if(!r)return false;
  const list=document.querySelector(".delivery-list");
  if(!list)return false;
  const allRows=[...list.querySelectorAll(".delivery-row[data-delivery-id]")];
  if(!allRows.length){document.querySelectorAll(".delivery-pagination").forEach(x=>x.remove());return true}
  const rows=allRows.filter(row=>row.dataset.filterMatch!=="0");
  allRows.filter(row=>row.dataset.filterMatch==="0").forEach(row=>{row.hidden=true;row.style.display="none"});
  document.querySelectorAll(".delivery-pagination").forEach(x=>x.remove());
  if(!rows.length)return true;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  const current=Math.min(totalPages,r.page);
  if(current!==r.page){location.hash=hashFor(r.oid,current);return true}
  rows.forEach((row,i)=>{
   const visible=i>=(current-1)*PAGE_SIZE&&i<current*PAGE_SIZE;
   row.hidden=!visible;
   row.style.display=visible?"":"none";
  });
  if(totalPages<=1)return true;
  const start=(current-1)*PAGE_SIZE+1,end=Math.min(current*PAGE_SIZE,rows.length);
  const wrap=document.createElement("div");wrap.className="delivery-pagination delivery-pagination-fixed";
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${start}–${end} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-fixed-page="${current-1}" ${current===1?"disabled":""}>‹</button>${Array.from({length:totalPages},(_,i)=>i+1).map(p=>`<button type="button" data-fixed-page="${p}" class="${p===current?"active":""}">${p}</button>`).join("")}<button type="button" data-fixed-page="${current+1}" ${current===totalPages?"disabled":""}>›</button></div>`;
  (document.querySelector(".delivery-card")||list).insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("button[data-fixed-page]").forEach(btn=>btn.addEventListener("click",e=>{
   e.preventDefault();e.stopPropagation();
   const p=Number(btn.dataset.fixedPage);if(!p||p<1||p>totalPages||p===current)return;
   location.hash=hashFor(r.oid,p);
   setTimeout(schedule,30);
  }));
  return true;
 }
 function schedule(){
  const mine=++token;let tries=0;
  const run=()=>{
   if(mine!==token)return;
   try{if(apply())return}catch(e){console.error("deliveries pagination fix",e)}
   if(++tries<40)setTimeout(run,100);
  };
  setTimeout(run,20);
 }
 window.addEventListener("hashchange",()=>{lastSig="";schedule()});
 window.addEventListener("deliveries-filter-change",()=>{lastSig="";schedule()});
 setInterval(()=>{
  const r=route();if(!r)return;
  const rows=[...document.querySelectorAll(".delivery-list .delivery-row[data-delivery-id]")];
  const matched=rows.filter(x=>x.dataset.filterMatch!=="0").length;
  const sig=`${location.hash}|${rows.length}|${matched}|${!!document.querySelector(".delivery-card")}`;
  if(sig!==lastSig){lastSig=sig;schedule()}
 },300);
 schedule();
})();

;

/* #47: src/photos-page.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const iso=v=>String(v||"").slice(0,10);
 const dmy=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const reportData=r=>({id:String(r.id),title:r.title||"",...(r.data||{})});
 async function loadPhotos(report){
  const out=[];
  for(const [index,path] of arr(report.photos).slice(0,12).entries()){
   if(!path)continue;
   const src=await irProject.images.read(path).catch(()=>"");
   if(src)out.push({path,src,index});
  }
  return out;
 }
 window.irPhotosPage=async oid=>{
  const app=document.getElementById("app"),object=await irProject.data.objects.get(oid);
  if(!object){location.hash="/objects";return}
  document.body.classList.remove("ir-object-overview");
  const raw=await irProject.data.forObject(oid).section("reports").list().catch(()=>[]);
  const reports=raw.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id));
  const groups=[];
  for(const report of reports){
   const photos=await loadPhotos(report);
   if(photos.length)groups.push({report,photos});
  }
  const total=groups.reduce((s,g)=>s+g.photos.length,0),latest=groups[0]?.report?.date||groups[0]?.report?.report_date||"";
  const content=groups.length?groups.map(g=>{
   const date=g.report.date||g.report.report_date;
   return `<section class="object-photo-report-group" data-report-id="${esc(g.report.id)}"><div class="object-photo-report-head"><div><h2>${esc(dmy(date))}</h2><p>Ежедневный отчёт · ${g.photos.length} фото</p></div><button type="button" data-open-report="${esc(g.report.id)}">Открыть отчёт</button></div><div class="object-photo-grid">${g.photos.map((p,i)=>`<button type="button" class="object-photo-tile" data-photo-src="${esc(p.src)}" data-photo-date="${esc(dmy(date))}" data-photo-number="${i+1}"><img src="${esc(p.src)}" alt="Фото ${i+1} от ${esc(dmy(date))}" loading="lazy"><span>Фото ${i+1}</span></button>`).join("")}</div></section>`;
  }).join(""):`<div class="object-photos-empty"><b>Фотографий пока нет</b><span>Здесь появятся только фотографии, добавленные в ежедневные отчёты.</span></div>`;
  app.innerHTML=`<div class="object-photos-page"><div class="object-photos-head"><button class="back" id="objectPhotosBack">← Назад</button><div><h1>Фотографии объекта</h1><p>${esc(object.name||"")} · только фото из ежедневных отчётов</p></div></div><div class="object-photos-summary"><div><span>Всего фотографий</span><b>${total}</b></div><div><span>Отчётов с фото</span><b>${groups.length}</b></div><div><span>Последняя съёмка</span><b>${latest?dmy(latest):"—"}</b></div></div><div class="object-photo-groups">${content}</div></div><div class="object-photo-lightbox" id="objectPhotoLightbox" hidden><button type="button" class="object-photo-lightbox-close" id="objectPhotoLightboxClose">×</button><div class="object-photo-lightbox-meta" id="objectPhotoLightboxMeta"></div><img id="objectPhotoLightboxImg" alt="Фото из ежедневного отчёта"></div>`;
  document.getElementById("objectPhotosBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  document.querySelectorAll("[data-open-report]").forEach(btn=>btn.onclick=()=>location.hash=`/objects/object/${oid}/reports/${btn.dataset.openReport}`);
  const lb=document.getElementById("objectPhotoLightbox"),img=document.getElementById("objectPhotoLightboxImg"),meta=document.getElementById("objectPhotoLightboxMeta");
  document.querySelectorAll(".object-photo-tile").forEach(tile=>tile.onclick=()=>{img.src=tile.dataset.photoSrc||"";meta.textContent=`${tile.dataset.photoDate||""} · Фото ${tile.dataset.photoNumber||""}`;lb.hidden=false});
  const close=()=>{lb.hidden=true;img.src=""};
  document.getElementById("objectPhotoLightboxClose").onclick=close;lb.onclick=e=>{if(e.target===lb)close()};
 };
})();

;

/* #48: src/section-unified.js */
"use strict";
(()=>{
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const names={deliveries:"Поставки",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 const previous=typeof sectionPage==="function"?sectionPage:null;
 sectionPage=async(id,key)=>{
  if(key==="schedule"&&previous)return previous(id,key);
  if(key==="photos"&&typeof window.irPhotosPage==="function")return window.irPhotosPage(id);
  if(key==="acted-days"&&typeof window.irActedDaysPageV3==="function")return window.irActedDaysPageV3(id);
  if(key==="acted-days"&&typeof window.irActedDaysPageV2==="function")return window.irActedDaysPageV2(id);
  if(key==="acted-days"&&typeof window.irActedDaysPage==="function")return window.irActedDaysPage(id);
  if(key==="penalties"&&typeof window.irPenaltiesPageV2==="function")return window.irPenaltiesPageV2(id);
  if(key==="penalties"&&typeof window.irPenaltiesPage==="function")return window.irPenaltiesPage(id);
  if(key==="finance"&&typeof window.irFinancePage==="function")return window.irFinancePage(id);
  if(key==="scheme"&&typeof window.irSchemePage==="function")return window.irSchemePage(id);
  const deliveryMatch=String(key||"").match(/^deliveries(?:\?(.*))?$/);
  if(deliveryMatch&&typeof window.irDeliveriesPage==="function"){
   const params=new URLSearchParams(deliveryMatch[1]||"");
   return window.irDeliveriesPage(id,{deliveryId:params.get("id")||"",page:Number(params.get("page")||1),mode:params.get("mode")||""});
  }
  const o=await irProject.data.objects.get(id);if(!o){location.hash="/objects";return}
  const sections=await irProject.data.sections.get(id).catch(()=>[]),section=sections.find(x=>x.section_key===key);if(section&&!section.enabled){location.hash=`/objects/object/${id}`;return}
  document.body.classList.remove("ir-object-overview");
  const title=section?.title||names[key]||key,api=irProject.data.forObject(id).section(key),rows=await api.list().catch(()=>[]),app=document.getElementById("app");
  const rowHtml=rows.map((r,i)=>{const d=r.data||{},main=r.title||d.title||d.name||d.number||`${title} #${i+1}`,sub=d.date||d.report_date||d.delivery_date||d.invoice_date||r.created_at||"";return `<div class="section-unified-row"><b>${esc(main)}</b><span>${esc(sub)}</span></div>`}).join("");
  app.innerHTML=`<div class="section-unified-page"><div class="section-unified-head"><button class="back" id="unifiedBack">← Назад</button><div><h1>${esc(title)}</h1><p>${esc(o.name||"")}</p></div></div><div class="section-unified-card">${rows.length?`<div class="section-unified-list">${rowHtml}</div>`:`<div class="section-unified-empty" data-empty="Раздел ${esc(title)} пуст"></div>`}</div></div>`;
  document.getElementById("unifiedBack").onclick=()=>location.hash=`/objects/object/${id}`;
 };
 const enhanceWorkTypes=()=>{const page=document.querySelector(".wt-page"),list=page?.querySelector(".wt-list");if(!page||!list)return;let tabs=page.querySelector(".wt-switch");if(tabs){tabs.style.display="inline-flex";return}const rows=[...list.querySelectorAll(".wt-row[data-id]")],other=rows.filter(r=>r.classList.contains("wt-other-row")||r.classList.contains("wt-service-row")),main=rows.filter(r=>!other.includes(r)),active=page.dataset.wtGroup==="other"?"other":"main";tabs=document.createElement("div");tabs.className="wt-switch wt-switch-fallback";tabs.setAttribute("role","tablist");tabs.innerHTML=`<button type="button" data-wt-fallback="main" class="${active==="main"?"on":""}">Монтаж / изготовление <span>${main.length}</span></button><button type="button" data-wt-fallback="other" class="${active==="other"?"on":""}">Другие виды работ <span>${other.length}</span></button>`;list.insertAdjacentElement("beforebegin",tabs);const apply=group=>{page.dataset.wtGroup=group;tabs.querySelectorAll("[data-wt-fallback]").forEach(b=>b.classList.toggle("on",b.dataset.wtFallback===group));for(const r of main)r.hidden=group!=="main";for(const r of other)r.hidden=group!=="other"};tabs.querySelectorAll("[data-wt-fallback]").forEach(b=>b.onclick=()=>apply(b.dataset.wtFallback));apply(active)};
 const observer=new MutationObserver(()=>queueMicrotask(enhanceWorkTypes));observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(enhanceWorkTypes,0));setTimeout(enhanceWorkTypes,0);
})();

;

/* #49: src/object-card-photo.js */
"use strict";
(()=>{
  async function enhance(){
    const root=window.irProject?.data;
    const imageApi=window.irProject?.images;
    if(!root?.forObject)return;
    for(const card of document.querySelectorAll(".object-card[data-object]")){
      if(card.dataset.photoReady==="1")continue;
      card.dataset.photoReady="1";
      try{
        const objectId=card.dataset.object,photosApi=root.forObject(objectId).section("photos");
        const photos=await photosApi.list();
        const photo=photos.find(x=>x.record_type==="cover"||x.data?.photo_type==="cover");
        let file=photo?.data?.file_path||photo?.data?.file||"";
        const cover=card.querySelector(".object-cover");
        if(!cover||!file)continue;
        if(imageApi?.optimize&&photo){const old=file,optimized=await imageApi.optimize(file,"cover");if(optimized&&optimized!==file){await photosApi.update(photo.id,{record_type:photo.record_type||"cover",title:photo.title||"cover",data:{...(photo.data||{}),photo_type:"cover",file_path:optimized}});file=optimized;if(imageApi.remove)await imageApi.remove(old)}}
        const url=imageApi?.read?await imageApi.read(file):"";
        if(!url)continue;
        cover.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.08),rgba(10,17,27,.70)),url("${url}")`;
        cover.style.backgroundSize="100% 100%,cover";
        cover.style.backgroundPosition="center,center";
        cover.style.backgroundRepeat="no-repeat,no-repeat";
        cover.classList.add("has-object-photo");
      }catch(e){console.warn("Object cover:",e)}
    }
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();

;

/* #50: src/object-media-ui.js */
"use strict";
(()=>{
  const patchHints=()=>{
    const photo=document.querySelector("#photoPreview")?.closest("label")?.querySelector(".file-hint");
    const banner=document.querySelector("#bannerPreview")?.closest("label")?.querySelector(".file-hint");
    if(photo&&photo.textContent!=="Размер в программе: 900×400 px. Сохраняется только подготовленная версия.")photo.textContent="Размер в программе: 900×400 px. Сохраняется только подготовленная версия.";
    if(banner&&banner.textContent!=="Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.")banner.textContent="Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.";
  };
  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;patchHints()});
  };
  const app=document.getElementById("app");
  if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  window.addEventListener("hashchange",schedule);
  schedule();
})();

;
