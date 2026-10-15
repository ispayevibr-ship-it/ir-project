/* #1: src/access.js */
"use strict";
window.irAccess=(()=>{
 const KEYS=["reports","work-types","marks","deliveries","schedule","photos","scheme","acted-days","penalties","finance"];
 const defaults=()=>Object.fromEntries(KEYS.map(k=>[k,true]));
 function load(){try{const saved=JSON.parse(localStorage.getItem("ir-access"))||{};const savedRole=localStorage.getItem("ir-active-role");return {role:["admin","engineer","guest"].includes(savedRole)?savedRole:"guest",engineer:{...defaults(),...(saved.engineer||{})}}}catch{return {role:"guest",engineer:defaults()}}}
 function savePermissions(s){localStorage.setItem("ir-access",JSON.stringify({engineer:s.engineer}));return s}
 function state(){const s=load();s.engineer={...defaults(),...(s.engineer||{})};return s}
 function role(){return state().role||"guest"}
 function setRole(role){const next=["admin","engineer","guest"].includes(role)?role:"guest";localStorage.setItem("ir-active-role",next);return next}
 function logout(){localStorage.setItem("ir-active-role","guest");return "guest"}
 function canEdit(section){const s=state();if(s.role==="admin")return true;if(s.role==="guest")return false;return section?Boolean(s.engineer[section]):false}
 function canView(){return true}
 function setEngineer(section,enabled){if(!KEYS.includes(section))return;const s=state();s.engineer[section]=Boolean(enabled);savePermissions(s)}
 function engineer(){return state().engineer}
 return {KEYS,role,setRole,logout,canEdit,canView,setEngineer,engineer};
})();

;

/* #2: src/measurement-utils.js */
"use strict";
(()=>{
 // Visual labels only; source work types and IDs are preserved.
 const labels={
  metal:["Металлоконструкция","Монтаж металлоконструкций","Поставка металлоконструкций"],
  sandwich:["Сэндвич-панели","Монтаж сэндвич-панелей","Поставка сэндвич-панелей"],
  profile:["Профнастил","Монтаж профнастила","Поставка профнастила"]
 };
 const normalizeName=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е")
  .replace(/\s+/g," ").replace(/\s*[-–—]\s*/g,"-").replace(/^(?:монтаж|поставка)\s+/,"");
 // Preserve descriptive Cyrillic tails (боксов, кровли, веншахт).
 // Numeric drawing identifiers stay untouched.
 const parseWork=raw=>{
  const m=normalizeName(raw).match(/^(металлоконструкция|металлоконструкции|металлоконструкций|сэндвич-панель|сэндвич-панели|сэндвич-панелей|профнастил|профнастила)(\s+[а-яё]+(?:[\s-][а-яё]+)*)?$/u);
  if(!m)return null;
  const kind=m[1].startsWith("металло")?"metal":m[1].startsWith("сэндвич")?"sandwich":"profile";
  return{kind,suffix:m[2]||""}
 };
 const workKind=raw=>parseWork(raw)?.kind||null;
 const formatName=(raw,context="base")=>{
  const parsed=parseWork(raw);
  if(!parsed)return String(raw??"");
  const noun=parsed.kind==="metal"&&parsed.suffix&&context==="base"?"Металлоконструкции":
   labels[parsed.kind][context==="mount"?1:context==="delivery"?2:0];
  return noun+parsed.suffix
 };
 window.irWorkNames={category:workKind,format:formatName,base:v=>formatName(v),mount:v=>formatName(v,"mount"),delivery:v=>formatName(v,"delivery")};
 const clean=u=>String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s+/g,"");
 const meta=unit=>{
  const u=clean(unit);
  if(["тн","т","тонна","тонн","kg","кг"].includes(u))return{kind:"mass",totalLabel:"Общий вес",itemLabel:"Вес 1 ед.",accent:"blue"};
  if(["м2","m2","кв.м","квм"].includes(u))return{kind:"area",totalLabel:"Общая площадь",itemLabel:"Площадь 1 ед.",accent:"violet"};
  if(["м3","m3","куб.м","кубм"].includes(u))return{kind:"volume",totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"green"};
  if(["м","m","пог.м","погм","п.м"].includes(u))return{kind:"length",totalLabel:"Общая длина",itemLabel:"Длина 1 ед.",accent:"cyan"};
  if(["шт","шт.","ед","ед.","компл","комплект","комп."].includes(u))return{kind:"count",totalLabel:"Общее количество",itemLabel:"Количество",accent:"amber"};
  return{kind:"other",totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"slate"};
 };
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const valueOf=w=>{const direct=num(w?.volume),q=num(w?.qty??w?.count),uv=num(w?.unit_volume??w?.volume_one??w?.volume1),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());return direct||(uv?q*uv:(!hasMark?q:0))};
 const totals=items=>{
  const map=new Map();
  for(const w of Array.isArray(items)?items:[]){
   const unit=String(w?.unit||"").trim()||"ед.",workType=String(w?.work_type||w?.type||"Работа").trim(),code=String(w?.project_code||w?.code||"").trim(),m=meta(unit),key=[workType.toLowerCase(),code.toLowerCase(),clean(unit)||unit].join("|");
   if(!map.has(key))map.set(key,{unit,workType,projectCode:code,label:code?`${m.totalLabel} · ${code}`:m.totalLabel,kind:m.kind,accent:m.accent,value:0});
   map.get(key).value+=valueOf(w);
  }
  return [...map.values()];
 };
 window.irMeasure={clean,meta,valueOf,totals};
})();
;

/* #3: src/marks-page.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const parseNum=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:NaN};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const inputNum=v=>String(v??"").replace(".",",");
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const fmtDate=v=>{if(!v)return"дата не указана";const s=String(v).slice(0,10),p=s.split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
 const measureMeta=unit=>window.irMeasure?.meta?.(unit)||{kind:"other",totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"slate"};
 const projectLabel=kind=>({mass:"Вес по проекту",area:"Площадь по проекту",volume:"Объём по проекту",length:"Длина по проекту",count:"Количество по проекту"})[kind]||"Объём по проекту";
 window.irMarksPage=async oid=>{
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),o=await irProject.data.objects.get(oid),marksApi=root.section("marks"),wtApi=root.section("work-types"),reportsApi=root.section("reports"),deliveriesApi=root.section("deliveries");
  let [markRows,workRows,reportRows,deliveryRows]=await Promise.all([marksApi.list().catch(()=>[]),wtApi.list().catch(()=>[]),reportsApi.list().catch(()=>[]),deliveriesApi.list().catch(()=>[])]),active="all",query="",statusFilter="all",page=1,usage=new Map(),usageDetails=new Map(),excelRows=null,excelFile="";const pageSize=20;
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("marks"):false;
  const supportsMarks=r=>{const d=r.data||{},service=(d.accounting_type||"")==="service"||norm(d.unit)==="услуга";if(service||d.has_marks===false||d.work_category==="other")return false;if(d.has_marks===true||["installation","fabrication"].includes(d.work_category))return true;const id=String(r.id),name=norm(d.work_type||r.title||"");return name.includes("монтаж")||name.includes("изготов")||markRows.some(m=>String(m.data?.work_type_id||"")===id)};
  const workTypes=()=>workRows.filter(supportsMarks).map(r=>({id:String(r.id),name:r.data?.work_type||r.title||"Без названия",code:r.data?.project_code||"",unit:r.data?.unit||""}));
  const serviceWorkIds=()=>new Set(workRows.filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id)));
  const items=()=>{const allowed=new Set(workTypes().map(w=>w.id));return markRows.map(x=>({id:String(x.id),...(x.data||{}),title:x.title||x.data?.title||""})).filter(x=>x.accounting_type!=="service"&&norm(x.unit)!=="услуга"&&(!x.work_type_id||allowed.has(String(x.work_type_id))))};
  const countFor=id=>items().filter(x=>String(x.work_type_id||"")===String(id)).length;
  const state=x=>{const q=num(x.qty??x.count),d=Math.min(q,num(x.mounted??x.done));return q>0&&d>=q?"done":d>0?"partial":"left"};
  const markTotal=x=>{const raw=x?.total_value??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const n=parseNum(raw);if(Number.isFinite(n))return n}return num(x?.qty??x?.count)*num(x?.unit_volume??x?.volume_one)};
  const previewText=(rows,unit="")=>{const m=measureMeta(unit),head=["Марка","Наименование","Кол-во",m.itemLabel,m.totalLabel].join("\t"),body=arr(rows).map(x=>[x.mark||x.title||"",x.name||"",fmt(x.qty??x.count),fmt(x.unit_volume??x.volume_one),fmt(markTotal(x))].join("\t")).join("\n");return body?`${head}\n${body}`:head};
  const mountedTotal=x=>{const q=num(x.qty??x.count);if(!q)return 0;return markTotal(x)*(Math.min(q,num(x.mounted??x.done))/q)};
  const usageText=set=>{const a=[...set||[]];if(a.includes("reports")&&a.includes("deliveries"))return"Марка используется в отчётах и накладных";if(a.includes("reports"))return"Марка используется в ежедневных отчётах";if(a.includes("deliveries"))return"Марка используется в накладных";return""};
  function buildUsage(){
   const all=items(),byId=new Map(all.map(x=>[String(x.id),x])),byComposite=new Map(),byCode=new Map(),byMark=new Map();usage=new Map();usageDetails=new Map();
   const addIndex=(map,key,id)=>{if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(id)};
   all.forEach(x=>{const id=String(x.id),m=norm(x.mark||x.title),wid=String(x.work_type_id||""),code=norm(x.project_code);addIndex(byComposite,`${wid}|${code}|${m}`,id);addIndex(byCode,`${code}|${m}`,id);addIndex(byMark,m,id)});
   const markUsed=(id,source,record)=>{id=String(id||"");if(!byId.has(id))return;if(!usage.has(id))usage.set(id,new Set());usage.get(id).add(source);if(!record)return;const rd=record.data||record,detail={source,id:String(record.id||rd.id||""),date:rd.date||rd.report_date||rd.delivery_date||rd.invoice_date||record.created_at||"",number:rd.number||rd.no||rd.invoice_number||rd.delivery_number||""},list=usageDetails.get(id)||[],key=`${source}|${detail.id}`;if(detail.id&&!list.some(x=>`${x.source}|${x.id}`===key)){list.push(detail);usageDetails.set(id,list)}};
   const resolveObject=(obj,source,record)=>{
    if(!obj||typeof obj!=="object")return;
    const wid=String(obj.work_type_id??obj.workTypeId??""),service=obj.accounting_type==="service"||obj.is_service===true||norm(obj.unit)==="услуга"||(wid&&serviceWorkIds().has(wid));if(service)return;
    const direct=obj.mark_id??obj.markId??obj.mark_record_id??obj.markRecordId;
    if(direct!=null&&direct!=="")markUsed(direct,source,record);
    const ids=obj.mark_ids??obj.markIds;if(Array.isArray(ids))ids.forEach(id=>markUsed(id,source,record));
    const text=norm(obj.mark??obj.mark_name??obj.markName??obj.position_mark??obj.positionMark);
    if(text){const wid=String(obj.work_type_id??obj.workTypeId??""),code=norm(obj.project_code??obj.projectCode??obj.code),sets=[];if(wid||code)sets.push(byComposite.get(`${wid}|${code}|${text}`));if(code)sets.push(byCode.get(`${code}|${text}`));sets.push(byMark.get(text));for(const s of sets){if(s&&s.size===1){markUsed([...s][0],source,record);break}}}
    for(const v of Object.values(obj)){if(v&&typeof v==="object"){if(Array.isArray(v))v.forEach(x=>resolveObject(x,source,record));else resolveObject(v,source,record)}}
   };
   reportRows.forEach(r=>resolveObject(r.data||r,"reports",r));deliveryRows.forEach(r=>resolveObject(r.data||r,"deliveries",r));
  }
  buildUsage();
  const isUsed=x=>usage.has(String(x.id));
  const workLocked=wid=>items().some(x=>String(x.work_type_id||"")===String(wid)&&isUsed(x));
  async function refreshReferences(){[reportRows,deliveryRows]=await Promise.all([reportsApi.list().catch(()=>[]),deliveriesApi.list().catch(()=>[])]);buildUsage()}
  function workCards(){return workTypes().map(w=>{const locked=workLocked(w.id),title=locked?"Ведомость нельзя заменить: одна или несколько марок используются в отчётах или накладных":"Загрузить или заменить ведомость";return`<div class="marks-work-card ${active===w.id?"on":""} ${locked?"locked":""}" data-work="${w.id}" role="button" tabindex="0"><span class="mwc-title">${esc(workLabel(w.name))}</span><span class="mwc-code">${esc(w.code||"Шифр не указан")}</span><span class="mwc-meta">${countFor(w.id)} поз. · ${esc(w.unit||"ед.")}</span>${canEdit()?`<button type="button" class="mwc-import ${locked?"locked":""}" data-import="${w.id}" ${locked?"disabled":""} title="${esc(title)}">${locked?"🔒 Ведомость используется":"＋ Загрузить ведомость"}</button>`:""}</div>`}).join("")}
  function statsHtml(base){
   if(active!=="all"){
    const w=workTypes().find(x=>x.id===active),unit=w?.unit||base[0]?.unit||"",m=measureMeta(unit),project=base.reduce((s,x)=>s+markTotal(x),0),mounted=base.reduce((s,x)=>s+mountedTotal(x),0),pct=project?Math.round(mounted/project*100):0;
    return `<div class="marks-stats"><div class="marks-stat"><span>Позиций</span><b>${base.length}</b></div><div class="marks-stat"><span>${esc(projectLabel(m.kind))}</span><b>${fmt(project)} ${esc(unit)}</b></div><div class="marks-stat"><span>Смонтировано</span><b>${fmt(mounted)} ${esc(unit)}</b></div><div class="marks-stat"><span>Осталось</span><b>${fmt(Math.max(0,project-mounted))} ${esc(unit)}</b></div><div class="marks-stat good"><span>Готовность</span><b>${pct}%</b></div></div>`;
   }
   const groups=workTypes().map(w=>{const rows=base.filter(x=>String(x.work_type_id||"")===w.id);if(!rows.length)return"";const m=measureMeta(w.unit),project=rows.reduce((s,x)=>s+markTotal(x),0),mounted=rows.reduce((s,x)=>s+mountedTotal(x),0),pct=project?Math.round(mounted/project*100):0;return`<div class="marks-unit-summary accent-${esc(m.accent)}"><div><strong>${esc(workLabel(w.name))}</strong><small>${esc(w.code||"Без шифра")} · ${esc(w.unit||"ед.")}</small></div><div><span>${esc(m.totalLabel)}</span><b>${fmt(project)} ${esc(w.unit)}</b></div><div><span>Смонтировано</span><b>${fmt(mounted)} ${esc(w.unit)}</b></div><div><span>Осталось</span><b>${fmt(Math.max(0,project-mounted))} ${esc(w.unit)}</b></div><div><span>Готовность</span><b>${pct}%</b></div></div>`}).join("");
   return `<div class="marks-all-summary"><div class="marks-stat marks-total-positions"><span>Всего позиций</span><b>${base.length}</b></div>${groups||'<div class="marks-empty">Ведомость пока пустая</div>'}</div>`;
  }
  function usageDialog(){return `<dialog id="markUsageDialog" class="mark-usage-dialog"><div class="form-heading"><div><h2 id="markUsageTitle">Где используется марка</h2><p class="form-subtitle">Связанные ежедневные отчёты и накладные</p></div><button type="button" class="dialog-x" id="markUsageX">×</button></div><div id="markUsageList" class="mark-usage-list"></div><div class="actions"><button type="button" id="markUsageClose">Закрыть</button></div></dialog>`}
  function draw(){
   const all=items(),base=all.filter(x=>(active==="all"||String(x.work_type_id||"")===active)&&(!query||`${x.mark||x.title||""} ${x.name||""}`.toLowerCase().includes(query))),filtered=base.filter(x=>statusFilter==="all"||(statusFilter==="done"?state(x)==="done":state(x)!=="done")),totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,totalPages);const shown=filtered.slice((page-1)*pageSize,page*pageSize),selectedWork=workTypes().find(x=>x.id===active),selectedMeta=measureMeta(selectedWork?.unit||"");
   const lockedActive=active!=="all"&&workLocked(active),lockHint=lockedActive?'<div class="marks-lock-hint">🔒 Ведомость используется в ежедневных отчётах или накладных. Чтобы загрузить новую ведомость, сначала удалите связанные марки из отчётов и накладных.</div>':"";
   const itemHead=active!=="all"?selectedMeta.itemLabel:"Значение 1 ед.",totalHead=active!=="all"?selectedMeta.totalLabel:"Итого";
   app.innerHTML=`<div class="marks-page"><div class="marks-top"><button class="back" id="marksBack">← Назад</button><div><h1>Ведомость марок</h1><p>${esc(o?.name||"")}</p></div></div><div class="marks-work-types"><div class="marks-work-head"><div><b>Виды работ</b><span>Выберите вид работ для просмотра или загрузки ведомости марок</span></div></div><div class="marks-work-grid"><div class="marks-work-card ${active==="all"?"on":""}" data-work="all" role="button" tabindex="0"><span class="mwc-title">Все виды работ</span><span class="mwc-code">Общая ведомость</span><span class="mwc-meta">${all.length} позиций</span></div>${workCards()}</div></div>${lockHint}${statsHtml(base)}<div class="marks-tools"><input id="marksSearch" value="${esc(query)}" placeholder="Поиск по марке или наименованию…"><div class="marks-filter-tabs"><button data-status="all" class="${statusFilter==="all"?"on":""}">Все</button><button data-status="done" class="${statusFilter==="done"?"on":""}">Смонтировано</button><button data-status="left" class="${statusFilter==="left"?"on":""}">Осталось</button></div>${canEdit()&&active!=="all"?'<button class="primary" id="markAdd">＋ Добавить марку</button>':""}</div><div class="marks-table"><div class="marks-head ${canEdit()?"with-actions":""}"><span>Марка</span><span>Наименование</span><span>Кол-во</span><span>${esc(itemHead)}</span><span>${esc(totalHead)}</span><span>Статус</span><span>Факт монтажа</span><span>Прогресс</span>${canEdit()?"<span></span>":""}</div>${shown.length?shown.map(x=>{const q=num(x.qty??x.count),uv=num(x.unit_volume??x.volume_one),d=Math.min(q,num(x.mounted??x.done)),total=markTotal(x),st=state(x),manual=x.manual_status;let label=st==="done"?"Смонтировано":st==="partial"?"Частично":"Не начато",badge=st;if(manual==="added"){label="Добавлено";badge="changed"}else if(manual==="changed"){label="Изменено";badge="changed"}const p=q?Math.min(100,Math.round(d/q*100)):0,used=isUsed(x),reason=usageText(usage.get(String(x.id))),links=(usageDetails.get(String(x.id))||[]).length;return`<div class="marks-row ${canEdit()?"with-actions":""} mark-row-${badge}"><div class="mark-title-cell"><b>${esc(x.mark||x.title||"—")}</b><button type="button" data-mark-usage="${x.id}" title="Где используется">${links?`Связи ${links}`:"Связи"}</button></div><span>${esc(x.name||"")}</span><span>${fmt(q)}</span><span>${fmt(uv)} ${esc(x.unit||"")}</span><span>${fmt(total)} ${esc(x.unit||"")}</span><span><i class="mark-badge ${badge}">${label}</i></span><span>${fmt(d)} / ${fmt(q)}</span><span class="marks-bar ${st}"><i style="width:${p}%"></i></span>${canEdit()?`<span class="mark-actions"><button data-edit-mark="${x.id}" title="Редактировать">✎</button><button data-delete-mark="${x.id}" ${used?"disabled":""} class="${used?"locked":""}" title="${esc(used?reason+". Сначала удалите её использование.":"Удалить")}">${used?"🔒":"×"}</button></span>`:""}</div>`}).join(""):'<div class="marks-empty">По выбранному фильтру марок нет</div>'}</div>${filtered.length>pageSize?`<div class="marks-pagination"><span>Показано ${(page-1)*pageSize+1}–${Math.min(page*pageSize,filtered.length)} из ${filtered.length}</span><div><button data-page="prev" ${page===1?"disabled":""}>←</button><b>Страница ${page} из ${totalPages}</b><button data-page="next" ${page===totalPages?"disabled":""}>→</button></div></div>`:""}${canEdit()?dialogs():""}${usageDialog()}</div>`;bind(totalPages)}
  function dialogs(){return `<dialog id="markEditDialog" class="mark-edit-dialog"><form id="markEditForm"><input type="hidden" name="id"><input type="hidden" name="work_type_id"><div class="form-heading"><div><h2 id="markEditTitle">Редактировать марку</h2><p class="form-subtitle">Данные позиции ведомости</p></div><button type="button" class="dialog-x" id="markEditX">×</button></div><label>Марка<input name="mark" required></label><label>Наименование<input name="name"></label><div class="mark-edit-grid"><label>Кол-во<input name="qty" required inputmode="decimal"></label><label id="markUnitVolumeLabel">Объём 1 ед.<input name="unit_volume" required inputmode="decimal"></label></div><div class="actions"><button type="button" id="markEditCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog><dialog id="marksImport" class="marks-import-dialog"><form id="marksImportForm"><input type="hidden" name="work_type_id"><div class="form-heading"><div><h2>Загрузить ведомость марок</h2><p id="marksImportWork" class="form-subtitle"></p></div><button type="button" class="dialog-x" id="marksImportX">×</button></div><p class="marks-import-note">Excel или вставка из таблицы. Колонки: <b>Марка | Наименование | Кол-во | Объём 1 ед. | Общий объём</b>. Пятый столбец необязателен, но если он есть — программа использует его как точный итог. Если ведомость уже есть и её марки не используются, новая загрузка полностью заменит старую.</p><div class="marks-excel-actions"><button type="button" class="primary" id="marksExcelSelect">Выбрать Excel (.xlsx/.xls)</button><button type="button" id="marksExcelExample">Скачать пример Excel</button><span id="marksExcelStatus">Файл не выбран</span></div><div class="marks-import-or"><span>или вставьте строки вручную</span></div><textarea name="rows" placeholder="М1 Балка 1000 0,7 700" aria-describedby="marksImportFeedback"></textarea><div class="marks-import-feedback" id="marksImportFeedback" role="status" aria-live="polite" hidden></div><div id="marksImportPreviewWrap" hidden><div class="marks-import-or"><span id="marksImportPreviewTitle">Предпросмотр ведомости</span></div><textarea id="marksImportPreview" readonly></textarea></div><div class="actions"><button type="button" id="marksImportCancel">Отмена</button><button type="submit" class="primary">Загрузить ведомость</button></div></form></dialog>`}
  function parseManual(text){
   const output=[],lines=String(text||"").split(/\r?\n/);
   const numeric=v=>Number.isFinite(parseNum(v));
   const spaceColumns=line=>{
    const parts=line.trim().split(/\s+/);
    if(parts.length<4)throw new Error("Укажите марку, наименование, количество и вес одной единицы");
    const candidates=parts.slice(-3),three=candidates.every(numeric);
    const qty3=three?parseNum(candidates[0]):NaN,unit3=three?parseNum(candidates[1]):NaN,total3=three?parseNum(candidates[2]):NaN;
    // For single-space input, a trailing number may belong to a product name.
    const plausible=three&&parts.length>=5&&Math.abs(qty3*unit3-total3)<=Math.max(.01,Math.abs(total3)*.05);
    const numericCount=plausible?3:2;
    if(parts.length-numericCount<2||!parts.slice(-numericCount).every(numeric))throw new Error("Не удалось определить числовые колонки");
    return[parts[0],parts.slice(1,-numericCount).join(" "),...parts.slice(-numericCount)]
   };
   for(let index=0;index<lines.length;index++){
    const line=lines[index].trim();
    if(!line)continue;
    if(/^марка(?:\s|[;|]|$)/i.test(line)&&/наименование/i.test(line)&&/(кол[\s-]*во|количество)/i.test(line))continue;
    try{
     let columns=/[\t;]/.test(line)?line.split(/[\t;]/).map(x=>x.trim()):
      /\s{2,}/.test(line)?line.split(/\s{2,}/).map(x=>x.trim()):spaceColumns(line);
     // Recover rows whose entire pasted line was previously stored as a mark.
     if(columns.length>=5&&columns[0].includes(" ")&&!columns[1]&&
      columns.slice(2,5).every(x=>!x||parseNum(x)===0))columns=spaceColumns(columns[0]);
     if(columns.length<4)throw new Error("Нужно минимум четыре колонки");
     const c=columns.length>5?[columns[0],columns.slice(1,-3).join(" "),...columns.slice(-3)]:columns;
     const mark=String(c[0]||"").trim(),name=String(c[1]||"").trim();
     const qty=parseNum(c[2]),unit_volume=parseNum(c[3]);
     const hasTotal=c[4]!==undefined&&String(c[4]).trim()!=="";
     const total_value=hasTotal?parseNum(c[4]):qty*unit_volume;
     if(!mark||!name)throw new Error("Не заполнена марка или наименование");
     if(!Number.isFinite(qty)||qty<=0)throw new Error("Количество должно быть больше нуля");
     if(!Number.isFinite(unit_volume)||unit_volume<0)throw new Error("Неверный вес/объём одной единицы");
     if(!Number.isFinite(total_value)||total_value<0)throw new Error("Неверный общий вес/объём");
     output.push({mark,name,qty,unit_volume,total_value})
    }catch(error){
     throw new Error("Строка "+(index+1)+": "+error.message+".\n"+line)
    }
   }
   return output
  }
  function bind(totalPages){
   document.getElementById("marksBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.querySelectorAll("[data-work]").forEach(b=>b.onclick=e=>{if(e.target.closest("[data-import]"))return;active=b.dataset.work;page=1;draw()});
   document.querySelectorAll("[data-status]").forEach(b=>b.onclick=()=>{statusFilter=b.dataset.status;page=1;draw()});
   const s=document.getElementById("marksSearch");s.oninput=e=>{query=e.target.value.toLowerCase();page=1;draw();const n=document.getElementById("marksSearch");n.focus();n.setSelectionRange(n.value.length,n.value.length)};
   document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{page+=b.dataset.page==="next"?1:-1;page=Math.max(1,Math.min(totalPages,page));draw()});
   const ud=document.getElementById("markUsageDialog"),ul=document.getElementById("markUsageList"),ut=document.getElementById("markUsageTitle"),closeUsage=()=>ud.close();
   document.getElementById("markUsageX").onclick=closeUsage;document.getElementById("markUsageClose").onclick=closeUsage;
   document.querySelectorAll("[data-mark-usage]").forEach(b=>b.onclick=()=>{const x=items().find(r=>String(r.id)===b.dataset.markUsage),refs=usageDetails.get(String(x?.id))||[];ut.textContent=`Где используется марка «${x?.mark||x?.title||""}»`;ul.innerHTML=refs.length?refs.map((r,i)=>{const label=r.source==="reports"?`Отчёт от ${fmtDate(r.date)}`:`Накладная${r.number?` №${esc(r.number)}`:""} от ${fmtDate(r.date)}`;return`<button type="button" class="mark-usage-item" data-usage-index="${i}"><span><b>${label}</b><small>${r.source==="reports"?"Ежедневный отчёт":"Накладная"}</small></span><i>Перейти →</i></button>`}).join(""):'<div class="mark-usage-empty">Марка пока не используется ни в отчётах, ни в накладных.</div>';ul.querySelectorAll("[data-usage-index]").forEach(btn=>btn.onclick=()=>{const r=refs[Number(btn.dataset.usageIndex)];ud.close();if(r.source==="reports"){location.hash=`/objects/object/${oid}/reports/${r.id}`}else{sessionStorage.setItem(`ir-open-delivery-${oid}`,String(r.id));location.hash=`/objects/object/${oid}/deliveries`}});ud.showModal()});
   if(!canEdit())return;
   const ed=document.getElementById("markEditDialog"),ef=document.getElementById("markEditForm"),openEdit=(x,wid)=>{ef.reset();const work=workTypes().find(w=>w.id===String(x?.work_type_id||wid||active));ef.elements.id.value=x?.id||"";ef.elements.work_type_id.value=work?.id||"";ef.elements.mark.value=x?.mark||x?.title||"";ef.elements.name.value=x?.name||"";ef.elements.qty.value=x?inputNum(x.qty??x.count):"1";ef.elements.unit_volume.value=x?inputNum(x.unit_volume??x.volume_one):"0";document.getElementById("markEditTitle").textContent=x?"Редактировать марку":"Добавить марку";const meta=measureMeta(work?.unit);document.getElementById("markUnitVolumeLabel").childNodes[0].nodeValue=meta.itemLabel;ed.showModal()};
   document.getElementById("markEditX").onclick=()=>ed.close();document.getElementById("markEditCancel").onclick=()=>ed.close();document.getElementById("markAdd")?.addEventListener("click",()=>openEdit(null,active));document.querySelectorAll("[data-edit-mark]").forEach(b=>b.onclick=()=>openEdit(items().find(x=>String(x.id)===b.dataset.editMark)));
   document.querySelectorAll("[data-delete-mark]").forEach(b=>b.onclick=async()=>{const x=items().find(r=>String(r.id)===b.dataset.deleteMark);await refreshReferences();if(isUsed(x)){alert(`${usageText(usage.get(String(x.id)))}.\n\nСначала удалите эту марку из связанных отчётов и накладных.`);draw();return}if(!confirm(`Удалить марку «${x?.mark||x?.title||""}»?`))return;await marksApi.remove(x.id);markRows=await marksApi.list();buildUsage();draw()});
   ef.onsubmit=async e=>{e.preventDefault();const fd=new FormData(ef),id=fd.get("id"),wid=String(fd.get("work_type_id")),w=workTypes().find(x=>x.id===wid),q=parseNum(fd.get("qty")),uv=parseNum(fd.get("unit_volume"));if(!w||!Number.isFinite(q)||!Number.isFinite(uv))return alert("Проверьте количество и значение 1 ед.");const old=id?items().find(x=>String(x.id)===String(id)):null,payload={record_type:"item",title:fd.get("mark"),data:{...(old||{}),work_type_id:wid,work_type:w.name,project_code:w.code,unit:w.unit,mark:fd.get("mark"),name:fd.get("name"),qty:q,unit_volume:uv,total_value:q*uv,mounted:num(old?.mounted??old?.done),received:num(old?.received??old?.got),manual_status:id?"changed":"added"}};delete payload.data.id;delete payload.data.title;if(id)await marksApi.update(id,payload);else await marksApi.create(payload);markRows=await marksApi.list();buildUsage();ed.close();draw()};
   const d=document.getElementById("marksImport"),f=document.getElementById("marksImportForm"),previewWrap=document.getElementById("marksImportPreviewWrap"),preview=document.getElementById("marksImportPreview"),previewTitle=document.getElementById("marksImportPreviewTitle"),manual=f.querySelector('textarea[name="rows"]'),feedback=document.getElementById("marksImportFeedback"),setPreview=(rows,w,title)=>{const list=arr(rows);previewWrap.hidden=!list.length;previewTitle.textContent=title||"Предпросмотр ведомости";preview.value=list.length?previewText(list,w?.unit):""};
    let previousRows=[];
    const updateManualPreview=()=>{
     const raw=manual.value.trim(),w=workTypes().find(x=>x.id===String(f.elements.work_type_id.value));
     if(!raw){
      feedback.hidden=true;feedback.textContent="";feedback.className="marks-import-feedback";
      setPreview(previousRows,w,previousRows.length?"Уже загруженная ведомость · "+previousRows.length+" строк":"");
      preview.readOnly=document.getElementById("marksExcelStatus").classList.contains("ready");
      return
     }
     preview.readOnly=true;
     try{
      const rows=parseManual(raw);
      if(!rows.length)throw new Error("Введите хотя бы одну строку данных");
      setPreview(rows,w,"Предпросмотр НОВОЙ ведомости · "+rows.length+" строк");
      feedback.textContent="✓ Распознано "+rows.length+" строк. Чтобы записать данные, нажмите «Сохранить ведомость».";
      feedback.className="marks-import-feedback valid";feedback.hidden=false
     }catch(err){
      setPreview([],w,"");
      feedback.textContent=err?.message||String(err);
      feedback.className="marks-import-feedback invalid";feedback.hidden=false
     }
    };
    manual.addEventListener("input",updateManualPreview);
   document.querySelectorAll("[data-import]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const wid=b.dataset.import,w=workTypes().find(x=>x.id===wid);await refreshReferences();if(workLocked(wid)){alert("Загрузка новой ведомости заблокирована.\n\nОдна или несколько марок этого вида работ используются в ежедневных отчётах или накладных. Сначала удалите их использование.");draw();return}excelRows=null;excelFile="";f.reset();f.elements.work_type_id.value=w.id;const excelStatus=document.getElementById("marksExcelStatus");excelStatus.textContent="Файл не выбран";excelStatus.classList.remove("ready");document.getElementById("marksImportWork").textContent=`${w.name} · ${w.code} · ${w.unit}`;const current=items().filter(x=>String(x.work_type_id||"")===wid);previousRows=current;setPreview(current,w,current.length?`Уже загруженная ведомость · ${current.length} строк`:"");feedback.hidden=true;feedback.textContent="";feedback.className="marks-import-feedback";d.showModal()});
   document.getElementById("marksImportX").onclick=()=>d.close();document.getElementById("marksImportCancel").onclick=()=>d.close();
   document.getElementById("marksExcelSelect").onclick=async()=>{try{const result=await irProject.marksExcel?.select?.();if(!result)return;excelRows=arr(result.rows);excelFile=result.name||"Excel";const w=workTypes().find(x=>x.id===String(f.elements.work_type_id.value));document.getElementById("marksExcelStatus").textContent=`${excelFile} · ${excelRows.length} строк`;document.getElementById("marksExcelStatus").classList.add("ready");manual.value="";feedback.hidden=true;feedback.textContent="";feedback.className="marks-import-feedback";setPreview(excelRows,w,`Предпросмотр выбранного файла · ${excelRows.length} строк`)}catch(err){alert(err.message||String(err))}};
   document.getElementById("marksExcelExample").onclick=async()=>{try{await irProject.marksExcel?.saveExample?.()}catch(err){alert(err.message||String(err))}};
   f.onsubmit=async e=>{e.preventDefault();const fd=new FormData(f),wid=String(fd.get("work_type_id")),w=workTypes().find(x=>x.id===wid);await refreshReferences();if(workLocked(wid)){alert("Нельзя заменить ведомость: её марки используются в ежедневных отчётах или накладных. Сначала удалите связанные записи.");d.close();draw();return}let rows;try{const entered=String(fd.get("rows")||"").trim();rows=entered?parseManual(entered):excelRows?.length?excelRows:[]}catch(error){alert(error?.message||String(error));return}if(!rows.length)return alert("Выберите Excel-файл или вставьте строки ведомости");const invalid=rows.find(x=>!x.mark||!Number.isFinite(Number(x.qty))||!Number.isFinite(Number(x.unit_volume)));if(invalid)return alert("В ведомости есть строки с неверными данными");const old=items().filter(x=>String(x.work_type_id||"")===wid);for(const x of old)await marksApi.remove(x.id);for(const x of rows){const exact=Number(x.total_value);await marksApi.create({record_type:"item",title:x.mark,data:{work_type_id:wid,work_type:w.name,project_code:w.code,unit:w.unit,mark:x.mark,name:x.name||"",qty:Number(x.qty),unit_volume:Number(x.unit_volume),total_value:Number.isFinite(exact)?exact:Number(x.qty)*Number(x.unit_volume),mounted:0,received:0}})}markRows=await marksApi.list();active=wid;page=1;excelRows=null;excelFile="";buildUsage();d.close();draw()};
  }
  draw();
 };
})();

;

/* #4: src/marks-editable-preview.js */
"use strict";
(()=>{
 const patch=()=>{
  document.querySelectorAll("#marksImportForm").forEach(form=>{
   if(form.dataset.editablePreview==="1")return;
   const preview=form.querySelector("#marksImportPreview"),wrap=form.querySelector("#marksImportPreviewWrap"),status=form.querySelector("#marksExcelStatus"),manual=form.querySelector('textarea[name="rows"]'),submit=form.querySelector('button[type="submit"]');
   if(!preview||!wrap||!manual||!submit)return;
   form.dataset.editablePreview="1";
   preview.removeAttribute("readonly");
   preview.spellcheck=false;
   submit.textContent="Сохранить ведомость";
   const hint=document.createElement("div");hint.className="marks-import-edit-hint";wrap.appendChild(hint);
   const syncMode=()=>{const excelReady=!!status?.classList.contains("ready"),hasManual=!!manual.value.trim();preview.readOnly=excelReady||hasManual;hint.textContent=hasManual?"Ниже показано, как программа разобрала новую строку. Для записи нажмите «Сохранить ведомость».":excelReady?"Предпросмотр Excel. Для изменения данных исправьте Excel или вставьте строки вручную выше.":"Это ранее сохранённая ведомость. Её можно исправить здесь либо ввести новые строки выше."};
   if(status)new MutationObserver(syncMode).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
   syncMode();
   manual.addEventListener("input",syncMode);
   const originalSubmit=form.onsubmit;
   form.onsubmit=async e=>{const editingCurrent=!wrap.hidden&&!status?.classList.contains("ready");if(editingCurrent&&!manual.value.trim()&&preview.value.trim())manual.value=preview.value;return originalSubmit?originalSubmit.call(form,e):undefined};
  });
 };
 new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
 patch();
})();

;

/* #5: src/marks-summary-ui.js */
"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const oidFromHash=()=>{const m=String(location.hash||"").match(/\/objects\/object\/([^/]+)\/marks/);return m?decodeURIComponent(m[1]):""};
 const style=document.createElement("style");style.textContent=`.marks-overview-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.marks-overview-metrics .marks-stat{margin:0}.marks-summary-progress{height:6px;margin-top:7px;border-radius:999px;background:#e8edf1;overflow:hidden}.marks-summary-progress i{display:block;height:100%;border-radius:inherit;background:#2a9b63;transition:width .2s ease}@media(max-width:900px){.marks-overview-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}`;document.head.appendChild(style);
 let timer=0,requestId=0;
 function renameButtons(){document.querySelectorAll(".marks-work-card").forEach(card=>{const btn=card.querySelector(".mwc-import"),meta=card.querySelector(".mwc-meta");if(!btn||!meta)return;const m=meta.textContent.match(/(\d+)\s*поз/),count=m?Number(m[1]):0,wanted=count>0?"Редактировать":"＋ Загрузить ведомость";if(btn.textContent!==wanted)btn.textContent=wanted})}
 function progressLines(){document.querySelectorAll(".marks-unit-summary").forEach(row=>{const cells=[...row.children],ready=cells[cells.length-1],value=ready?.querySelector("b");if(!ready||!value)return;const pct=Math.max(0,Math.min(100,Number(String(value.textContent).replace(/[^0-9.,-]/g,"").replace(",","."))||0));let bar=ready.querySelector(".marks-summary-progress");if(!bar){bar=document.createElement("div");bar.className="marks-summary-progress";bar.innerHTML="<i></i>";ready.appendChild(bar)}const fill=bar.querySelector("i"),width=`${pct}%`;if(fill.style.width!==width)fill.style.width=width})}
 async function enhance(){const page=document.querySelector(".marks-page"),oid=oidFromHash();if(!page||!oid||!window.irProject?.data?.forObject)return;const id=++requestId;let rows=[];try{rows=await irProject.data.forObject(oid).section("marks").list()}catch{return}if(id!==requestId||!document.querySelector(".marks-page"))return;const items=(Array.isArray(rows)?rows:[]).map(r=>({id:r.id,...(r.data||{})}));const summary=document.querySelector(".marks-all-summary");if(!summary)return;summary.querySelectorAll(":scope > .marks-stat").forEach(el=>el.hidden=true);const positions=items.length,totalMarks=items.reduce((s,x)=>s+num(x.qty??x.count),0),mountedPositions=items.filter(x=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return q>0&&d>=q}).length,mountedMarks=items.reduce((s,x)=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return s+Math.min(q,Math.max(0,d))},0);let box=summary.querySelector(".marks-overview-metrics");if(!box){box=document.createElement("div");box.className="marks-overview-metrics";summary.insertBefore(box,summary.firstChild)}const signature=[positions,totalMarks,mountedPositions,mountedMarks].join("|");if(box.dataset.signature!==signature){box.dataset.signature=signature;box.innerHTML=`<div class="marks-stat"><span>Всего позиций</span><b>${fmt(positions)}</b></div><div class="marks-stat"><span>Всего марок</span><b>${fmt(totalMarks)}</b></div><div class="marks-stat"><span>Всего позиций смонтировано</span><b>${fmt(mountedPositions)}</b></div><div class="marks-stat good"><span>Всего марок смонтировано</span><b>${fmt(mountedMarks)}</b></div>`}}
 const schedule=()=>{renameButtons();progressLines();clearTimeout(timer);timer=setTimeout(enhance,20)};
 new MutationObserver(schedule).observe(document.getElementById("app")||document.documentElement,{childList:true,subtree:true});
 addEventListener("hashchange",schedule);schedule();
})();

;

/* #6: src/marks-summary-selected-fix.js */
"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const parseNum=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:NaN};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const oidFromHash=()=>{const m=String(location.hash||"").match(/\/objects\/object\/([^/]+)\/marks/);return m?decodeURIComponent(m[1]):""};
 const markTotal=x=>{const raw=x?.total_value??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const n=parseNum(raw);if(Number.isFinite(n))return n}return num(x?.qty??x?.count)*num(x?.unit_volume??x?.volume_one)};
 const style=document.createElement("style");style.textContent=`.marks-stats>.marks-selected-count-metrics{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.marks-stats>.marks-selected-count-metrics .marks-stat{margin:0}@media(max-width:1200px){.marks-stats>.marks-selected-count-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:900px){.marks-stats>.marks-selected-count-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}`;document.head.appendChild(style);
 let timer=0,requestId=0;
 async function enhance(){
  const page=document.querySelector(".marks-page"),summary=document.querySelector(".marks-stats"),activeCard=document.querySelector('.marks-work-card.on[data-work]:not([data-work="all"])'),oid=oidFromHash();
  if(!page||!summary||!activeCard||!oid||!window.irProject?.data?.forObject)return;
  const id=++requestId;let markRows=[],workRows=[];try{[markRows,workRows]=await Promise.all([irProject.data.forObject(oid).section("marks").list(),irProject.data.forObject(oid).section("work-types").list()])}catch{return}
  if(id!==requestId||!document.querySelector(".marks-page"))return;
  const wid=String(activeCard.dataset.work||""),items=(Array.isArray(markRows)?markRows:[]).map(r=>({id:r.id,...(r.data||{})})).filter(x=>String(x.work_type_id||"")===wid),work=(Array.isArray(workRows)?workRows:[]).map(r=>({id:String(r.id),...(r.data||{})})).find(x=>x.id===wid);
  const unit=String(work?.unit||items.find(x=>x.unit)?.unit||"").trim(),meta=window.irMeasure?.meta?.(unit)||{totalLabel:"Общий объём"},positions=items.length,totalMarks=items.reduce((s,x)=>s+num(x.qty??x.count),0),totalValue=items.reduce((s,x)=>s+markTotal(x),0),mountedPositions=items.filter(x=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return q>0&&d>=q}).length,mountedMarks=items.reduce((s,x)=>{const q=num(x.qty??x.count),d=num(x.mounted??x.done);return s+Math.min(q,Math.max(0,d))},0);
  summary.querySelectorAll(":scope > .marks-stat").forEach(el=>el.hidden=true);
  let box=summary.querySelector(":scope > .marks-selected-count-metrics");if(!box){box=document.createElement("div");box.className="marks-selected-count-metrics";summary.insertBefore(box,summary.firstChild)}
  const sig=[wid,positions,totalMarks,totalValue,unit,mountedPositions,mountedMarks].join("|");if(box.dataset.signature===sig)return;box.dataset.signature=sig;box.innerHTML=`<div class="marks-stat"><span>Всего позиций</span><b>${fmt(positions)}</b></div><div class="marks-stat"><span>Всего марок</span><b>${fmt(totalMarks)}</b></div><div class="marks-stat"><span>${meta.totalLabel||"Общий объём"}</span><b>${fmt(totalValue)}${unit?` ${unit}`:""}</b></div><div class="marks-stat"><span>Всего позиций смонтировано</span><b>${fmt(mountedPositions)}</b></div><div class="marks-stat good"><span>Всего марок смонтировано</span><b>${fmt(mountedMarks)}</b></div>`;
 }
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(enhance,20)};
 new MutationObserver(schedule).observe(document.getElementById("app")||document.documentElement,{childList:true,subtree:true});addEventListener("hashchange",schedule);schedule();
})();

;

/* #7: src/work-types-page.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:""};
 const isServiceData=d=>(d?.accounting_type||"")==="service"||norm(d?.unit)==="услуга";
 const markTotal=x=>{const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)};
 const mountedTotal=x=>{const d=x?.data||x||{},q=num(d.qty??d.count);if(!q)return 0;const mounted=Math.min(q,num(d.mounted??d.done));return markTotal(x)*(mounted/q)};
 const units=[
  ["тн","тн"],["кг","кг"],["м","м"],["м2","м2"],["м3","м3"],["шт","шт"],["компл","компл"],
  ["пог.м","пог.м"],["км","км"],["л","л"],["час","час"],["смена","смена"],["маш/час","маш/час"],
  ["чел/час","чел/час"],["рейс","рейс"],["услуга","услуга"],["__other__","Другая"]
 ];
 const knownUnits=new Set(units.filter(x=>x[0]!=="__other__").map(x=>x[0]));
 const unitOptions=selected=>units.map(([v,t])=>`<option value="${esc(v)}" ${v===selected?"selected":""}>${esc(t)}</option>`).join("");
 const categories=[["installation","Монтажные работы"],["fabrication","Изготовление металлоконструкций"],["other","Другой вид работы"]];
 const categoryOptions=selected=>categories.map(([v,t])=>`<option value="${v}" ${v===selected?"selected":""}>${t}</option>`).join("");
 window.irWorkTypesPage=async oid=>{
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("work-types"),marksApi=root.section("marks"),reportsApi=root.section("reports"),o=await irProject.data.objects.get(oid);
  let [rows,marks,reports]=await Promise.all([api.list().catch(()=>[]),marksApi.list().catch(()=>[]),reportsApi.list().catch(()=>[])]),activeGroup="main";
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("work-types"):false;
  const isService=r=>isServiceData(r?.data||r||{});
  const categoryOf=r=>{const d=r?.data||r||{},saved=String(d.work_category||"");if(["installation","fabrication","other"].includes(saved))return saved;if(d.has_marks===false||isServiceData(d))return"other";const name=norm(d.work_type||r?.title||"");if(name.includes("изготов"))return"fabrication";if(name.includes("монтаж"))return"installation";const id=String(r?.id||"");return marks.some(m=>String(m.data?.work_type_id||"")===id)?"installation":"other"};
  const hasMarks=r=>categoryOf(r)!=="other"&&!isService(r);
  function workMarks(r){if(!hasMarks(r))return[];const d=r.data||{},id=String(r.id),name=norm(d.work_type||r.title),code=norm(d.project_code);return marks.filter(m=>{const x=m.data||{};if(String(x.work_type_id||"")===id)return true;const xName=norm(x.work_type),xCode=norm(x.project_code);return !x.work_type_id&&((name&&xName===name&&(!code||!xCode||xCode===code))||(code&&xCode===code))})}
  function workStats(r){const list=workMarks(r),total=list.reduce((s,x)=>s+markTotal(x),0),mounted=list.reduce((s,x)=>s+mountedTotal(x),0),ready=total>0?Math.max(0,Math.min(100,mounted/total*100)):0;return{total,mounted,ready,count:list.length}}
  function otherStats(r){const d=r.data||{},id=String(r.id),name=norm(d.work_type||r.title),plan=num(d.planned_volume??d.plan_volume),fact=arr(reports).reduce((sum,rec)=>{const rd=rec.data||rec;return sum+arr(rd.items||rd.works).reduce((s,w)=>{const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===name);if(!same||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")return s;const raw=num(w.volume??w.total_volume),q=num(w.qty??w.count??w.quantity);return s+(raw||q)},0)},0),ready=plan>0?Math.max(0,Math.min(100,fact/plan*100)):0;return{plan,fact,ready}}
  function serviceState(r){const d=r.data||{},id=String(r.id),name=norm(d.work_type||r.title);let completed=false,when="";for(const rec of arr(reports)){const rd=rec.data||rec,date=String(rd.date||rd.report_date||"").slice(0,10);for(const w of arr(rd.items||rd.works)){const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===name);if(!same)continue;const done=w.completed===true||w.service_completed===true||String(w.status||"").toLowerCase()==="done"||String(w.status||"").toLowerCase()==="выполнено";if(done){completed=true;if(!when||date>when)when=date}}}return{completed,when}}
  function item(r){
   const d=r.data||{},service=isService(r),category=categoryOf(r),code=d.project_code||"—";
   if(service){const s=serviceState(r);return `<div class="wt-row wt-service-row" data-id="${r.id}"><div><span>Вид работы</span><b>${esc(workLabel(d.work_type||r.title||"—"))}</b></div><div><span>Шифр проекта</span><b>—</b></div><div><span>Ед. изм.</span><b>услуга</b></div><div class="wt-volume"><span>Общий объём</span><b>Не требуется</b><small>Без ведомости марок</small></div><div class="wt-ready"><span>Готовность</span><div class="wt-service-status ${s.completed?"done":"pending"}"><b>${s.completed?"✓ Выполнено":"Не выполнено"}</b>${s.when?`<small>${dmy(s.when)}</small>`:""}</div></div>${canEdit()?`<div class="wt-actions"><button type="button" data-edit="${r.id}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/></svg></button><button type="button" class="danger" data-delete="${r.id}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`}
   if(category==="other"){const s=otherStats(r),unit=d.unit||"—",ready=String(Number(s.ready.toFixed(1))).replace(".",",");return `<div class="wt-row wt-other-row" data-id="${r.id}"><div><span>Вид работы</span><b>${esc(workLabel(d.work_type||r.title||"—"))}</b></div><div><span>Шифр проекта</span><b>—</b></div><div><span>Ед. изм.</span><b>${esc(unit)}</b></div><div class="wt-volume"><span>Общий объём</span><b>${s.plan?esc(fmt(s.plan))+" "+esc(unit):"—"}</b><small>${s.plan?`Выполнено ${esc(fmt(s.fact))} ${esc(unit)}`:"Объём не задан"}</small></div><div class="wt-ready"><span>Готовность</span><div class="wt-ready-value"><b>${s.plan?ready+"%":"—"}</b>${s.plan?`<i><em style="width:${s.ready.toFixed(2)}%"></em></i>`:""}</div></div>${canEdit()?`<div class="wt-actions"><button type="button" data-edit="${r.id}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/></svg></button><button type="button" class="danger" data-delete="${r.id}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`}
   const s=workStats(r),unit=d.unit||"—",ready=String(Number(s.ready.toFixed(1))).replace(".",",");
   return `<div class="wt-row" data-id="${r.id}"><div><span>Вид работы</span><b>${esc(workLabel(d.work_type||r.title||"—"))}</b></div><div><span>Шифр проекта</span><b>${esc(code)}</b></div><div><span>Ед. изм.</span><b>${esc(unit)}</b></div><div class="wt-volume"><span>Общий объём</span><b>${s.count?esc(fmt(s.total))+" "+esc(unit):"—"}</b><small>${s.count?s.count+" поз.":"Ведомость не загружена"}</small></div><div class="wt-ready"><span>Средняя готовность</span><div class="wt-ready-value"><b>${s.count?ready+"%":"—"}</b>${s.count?`<i><em style="width:${s.ready.toFixed(2)}%"></em></i>`:""}</div></div>${canEdit()?`<div class="wt-actions"><button type="button" data-edit="${r.id}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/></svg></button><button type="button" class="danger" data-delete="${r.id}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`
  }
  function draw(){
   const mainRows=rows.filter(r=>categoryOf(r)!=="other"),otherRows=rows.filter(r=>categoryOf(r)==="other"),shown=activeGroup==="other"?otherRows:mainRows,emptyText=activeGroup==="other"?"Другие виды работ пока не добавлены":"Монтажные работы и изготовление пока не добавлены";
   app.innerHTML=`<div class="wt-page"><div class="wt-head"><button class="back" id="wtBack">← Назад</button><div><h1>Виды работ</h1><p>${esc(o?.name||"")}</p></div>${canEdit()?'<button class="primary" id="wtAdd">＋ Добавить вид работ</button>':""}</div><div class="wt-switch" role="tablist"><button type="button" class="${activeGroup==="main"?"on":""}" data-wt-group="main" role="tab" aria-selected="${activeGroup==="main"}">Монтаж / изготовление <span>${mainRows.length}</span></button><button type="button" class="${activeGroup==="other"?"on":""}" data-wt-group="other" role="tab" aria-selected="${activeGroup==="other"}">Другие виды работ <span>${otherRows.length}</span></button></div><div class="wt-list"><div class="wt-table-head"><span>Вид работы</span><span>Шифр проекта</span><span>Ед. изм.</span><span>Общий объём</span><span>Готовность</span><span></span></div>${shown.length?shown.map(item).join(""):`<div class="wt-empty">${emptyText}</div>`}</div>${canEdit()?`<dialog id="wtDialog" class="wt-dialog"><form id="wtForm" novalidate><input type="hidden" name="id"><div class="form-heading"><div><h2 id="wtTitle">Добавить вид работ</h2><p class="form-subtitle">Параметры вида работ для этого объекта</p></div><button type="button" class="dialog-x" id="wtX">×</button></div><label>Вид работы<select name="work_category" required>${categoryOptions("installation")}</select></label><label data-subtype>Подвид работы<input name="work_type" placeholder="Например: Монтаж сэндвич-панелей"></label><label data-other-name hidden>Вид работы<input name="other_work_type" placeholder="Например: Уборка территории"></label><label data-project-code>Шифр проекта<input name="project_code" placeholder="Например: 053-2025-КМД"></label><label data-project-code-2>Дополнительный шифр<input name="project_code_2" placeholder="Например: КМ-1"></label><label>Ед. измерения<select name="unit_select" required>${unitOptions("тн")}</select></label><label data-custom-unit hidden>Другая единица измерения<input name="unit_custom" placeholder="Например: секция, узел, м.п."></label><label data-plan-volume hidden>Объём выполняемой работы<input name="planned_volume" inputmode="decimal" placeholder="Например: 120"></label><label class="wt-scheme-option" data-scheme-option><input type="checkbox" name="scheme_enabled"><span><b>Нужна монтажная схема</b><small>Показывать этот вид работ в разделе «Монтажная схема»</small></span></label><div class="wt-service-hint" data-service-hint hidden>Единица «услуга»: объём не считается. В ежедневном отчёте указывается только выполнено / не выполнено.</div><div class="actions"><button type="button" id="wtCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`:""}</div>`;
   // A wide grid must never leave the entire object page scrolled sideways.
   const pageScroll=document.scrollingElement||document.documentElement;
   if(pageScroll?.scrollLeft)pageScroll.scrollLeft=0;
   if(document.body.scrollLeft)document.body.scrollLeft=0;
   document.getElementById("wtBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.querySelectorAll("[data-wt-group]").forEach(b=>b.onclick=()=>{activeGroup=b.dataset.wtGroup==="other"?"other":"main";draw()});
   if(!canEdit())return;
   const dialog=document.getElementById("wtDialog"),form=document.getElementById("wtForm"),categorySelect=form.elements.work_category,unitSelect=form.elements.unit_select,customWrap=form.querySelector("[data-custom-unit]"),serviceHint=form.querySelector("[data-service-hint]"),subtypeWrap=form.querySelector("[data-subtype]"),otherNameWrap=form.querySelector("[data-other-name]"),planWrap=form.querySelector("[data-plan-volume]"),schemeWrap=form.querySelector("[data-scheme-option]");
   const prettySelect=select=>{select.classList.add("ir-pretty-native");const box=document.createElement("div");box.className="ir-pretty-select";const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-pretty-trigger";const menu=document.createElement("div");menu.className="ir-pretty-menu";menu.hidden=true;box.append(trigger,menu);select.insertAdjacentElement("afterend",box);const close=()=>{menu.hidden=true;box.classList.remove("open","open-up");trigger.setAttribute("aria-expanded","false")};const refresh=()=>{const current=select.options[select.selectedIndex];trigger.innerHTML=`<span>${esc(current?.textContent||"Выберите")}</span><i></i>`;menu.innerHTML=[...select.options].map(o=>`<button type="button" data-value="${esc(o.value)}" class="${o.selected?"selected":""}" ${o.disabled?"disabled":""}>${esc(o.textContent)}</button>`).join("")};const openMenu=()=>{document.querySelectorAll(".ir-pretty-select.open").forEach(x=>{if(x!==box){x.classList.remove("open","open-up");const m=x.querySelector(".ir-pretty-menu");if(m)m.hidden=true}});refresh();menu.hidden=false;box.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>{const r=trigger.getBoundingClientRect(),need=Math.min(menu.scrollHeight,280)+10,below=window.innerHeight-r.bottom;box.classList.toggle("open-up",below<need&&r.top>below)})};trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?openMenu():close()};menu.onclick=e=>{const b=e.target.closest("button[data-value]");if(!b||b.disabled)return;e.preventDefault();select.value=b.dataset.value;select.dispatchEvent(new Event("change",{bubbles:true}));refresh();close()};box.onclick=e=>e.stopPropagation();refresh();return{refresh,close}};
   const categoryPretty=prettySelect(categorySelect),unitPretty=prettySelect(unitSelect);dialog.addEventListener("click",e=>{if(!e.target.closest(".ir-pretty-select")){categoryPretty.close();unitPretty.close()}});
   const codeWrap=form.querySelector("[data-project-code]"),code2Wrap=form.querySelector("[data-project-code-2]");
   form.noValidate=true;
   const clearCodeRequirement=()=>{for(const input of [form.elements.project_code,form.elements.project_code_2]){input.required=false;input.removeAttribute("required")}};
   const syncForm=()=>{const category=categorySelect.value||"installation",marked=category!=="other";let service=unitSelect.value==="услуга";const serviceOption=unitSelect.querySelector('option[value="услуга"]');if(serviceOption)serviceOption.disabled=marked;if(marked&&service){unitSelect.value="тн";service=false}const otherUnit=unitSelect.value==="__other__";subtypeWrap.hidden=!marked;otherNameWrap.hidden=marked;codeWrap.hidden=!marked;code2Wrap.hidden=!marked;planWrap.hidden=marked||service;schemeWrap.hidden=!marked;customWrap.hidden=!otherUnit;serviceHint.hidden=!service;if(!marked)form.elements.scheme_enabled.checked=false;form.elements.work_type.required=marked;form.elements.other_work_type.required=!marked;form.elements.unit_custom.required=otherUnit;form.elements.planned_volume.required=!marked&&!service;clearCodeRequirement();if(!otherUnit)form.elements.unit_custom.value="";categoryPretty.refresh();unitPretty.refresh()};
   const open=r=>{form.reset();const d=r?.data||{},category=r?categoryOf(r):"installation",rawUnit=isServiceData(d)?"услуга":String(d.unit||"тн").trim(),known=knownUnits.has(rawUnit),name=d.work_type||r?.title||"";form.elements.id.value=r?.id||"";categorySelect.value=category;if(category==="other")form.elements.other_work_type.value=name;else form.elements.work_type.value=name;form.elements.project_code.value=d.project_code||"";form.elements.project_code_2.value=d.project_code_2||"";form.elements.planned_volume.value=d.planned_volume??d.plan_volume??"";form.elements.scheme_enabled.checked=d.scheme_enabled===true;unitSelect.value=known?rawUnit:"__other__";form.elements.unit_custom.value=known?"":rawUnit;syncForm();document.getElementById("wtTitle").textContent=r?"Редактировать вид работ":"Добавить вид работ";dialog.showModal()};
   categorySelect.onchange=syncForm;unitSelect.onchange=syncForm;document.getElementById("wtAdd").onclick=()=>open();document.getElementById("wtX").onclick=()=>dialog.close();document.getElementById("wtCancel").onclick=()=>dialog.close();
   document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(shown.find(r=>String(r.id)===b.dataset.edit)||rows.find(r=>String(r.id)===b.dataset.edit)));
   document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=rows.find(x=>String(x.id)===b.dataset.delete);if(!confirm(`Удалить вид работ «${r?.data?.work_type||r?.title||""}»?`))return;await api.remove(r.id);rows=await api.list();draw()});
   form.onsubmit=async e=>{e.preventDefault();clearCodeRequirement();const fd=new FormData(form),id=String(fd.get("id")||""),category=String(fd.get("work_category")||"installation"),marked=category!=="other",workType=String(fd.get(marked?"work_type":"other_work_type")||"").trim(),selected=String(fd.get("unit_select")||"").trim(),unit=selected==="__other__"?String(fd.get("unit_custom")||"").trim():selected,service=norm(unit)==="услуга",code=marked?String(fd.get("project_code")||"").trim():"",code2=marked?String(fd.get("project_code_2")||"").trim():"",planned=marked||service?0:num(fd.get("planned_volume")),scheme_enabled=marked&&fd.get("scheme_enabled")==="on";if(!workType)return alert(marked?"Укажите подвид работы.":"Укажите вид работы.");if(!unit)return alert("Введите единицу измерения.");if(selected==="__other__"&&!unit)return alert("Введите единицу измерения.");if(!marked&&!service&&planned<=0)return alert("Укажите объём выполняемой работы.");const payload={record_type:"item",title:workType,data:{work_category:category,has_marks:marked&&!service,work_type:workType,accounting_type:service?"service":"volume",project_code:service?"":code,project_code_2:service?"":code2,unit,planned_volume:planned,scheme_enabled}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list();window.dispatchEvent(new CustomEvent("ir-work-types-changed",{detail:{objectId:String(oid)}}));dialog.close();draw()};
  }
  draw();
 };
})();
;

/* #8: src/work-types-secondary-code.js */
"use strict";
(()=>{ /* Дополнительный шифр теперь встроен прямо в work-types-page.js. Файл оставлен для совместимости hot-update. */ })();
;

/* #9: src/reports-page.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const date=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:v};
 const weatherIcon=w=>({"Ясно":"☀","Облачно":"☁","Дождь":"🌧","Снег":"🌨","Гроза":"⛈","Туман":"🌫"})[w]||"☁";
 const weatherText=d=>typeof d.weather==="string"?d.weather:(d.weather?.text||d.weather_text||"Не указана");
 const peopleCount=d=>arr(d.workers).reduce((s,x)=>s+num(x.count),0)+arr(d.people).reduce((s,x)=>s+num(x.count),0);
 const equipmentCount=d=>arr(d.equipment).reduce((s,x)=>s+num(x.count),0);
 const reportData=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const groupedWorks=d=>{
  const map=new Map();
  for(const w of arr(d.items||d.works)){
   const service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",key=[w.work_type_id||w.work_type||"",w.project_code||"",service?"service":w.unit||""].join("|");
   if(!map.has(key))map.set(key,{work_type:w.work_type||"Работа",project_code:w.project_code||"",unit:w.unit||"",volume:0,service,completed:false});
   if(service)map.get(key).completed=map.get(key).completed||serviceDone(w);else map.get(key).volume+=num(w.volume)||num(w.qty)*num(w.unit_volume);
  }
  return [...map.values()];
 };
 window.irReportsPage=async(oid,route={})=>{
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("reports"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);
  let reportRows=await api.list().catch(()=>[]),query="",workRows=null,markRows=null;
  const reports=()=>reportRows.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id));
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
  const loadRefs=async()=>{if(!workRows||!markRows)[workRows,markRows]=await Promise.all([wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]);};
  const workTypes=()=>arr(workRows).map(r=>{const d=r.data||{},unit=d.unit||"",service=(d.accounting_type||"")==="service"||norm(unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),explicitPlain=d.has_marks===false||d.work_category==="other",legacyMarked=!explicitMarked&&!explicitPlain&&!service&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(markRows).some(m=>String(m.data?.work_type_id||"")===String(r.id))),has_marks=!service&&(explicitMarked||legacyMarked);return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:service?"услуга":unit,accounting_type:service?"service":"volume",has_marks,work_category:d.work_category||"",planned_volume:num(d.planned_volume??d.plan_volume)}});
  const isServiceWork=w=>w?.accounting_type==="service"||w?.is_service===true||norm(w?.unit)==="услуга"||workTypes().some(x=>x.id===String(w?.work_type_id||"")&&x.accounting_type==="service");
  const marks=()=>arr(markRows).map(r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})}));
  const mountedMap=excludeId=>{const map={};for(const r of reports()){if(excludeId&&String(r.id)===String(excludeId))continue;for(const w of arr(r.items||r.works)){if(isServiceWork(w))continue;const id=String(w.mark_id||"");if(id)map[id]=(map[id]||0)+num(w.qty??w.count??w.quantity)}}return map};
  const allMountedMap=()=>mountedMap(null);
  async function syncMarks(){await loadRefs();const mm=allMountedMap();for(const raw of markRows){const d=raw.data||{},total=num(d.qty??d.count),next=Math.max(0,Math.min(total,mm[String(raw.id)]||0)),current=num(d.mounted??d.done);if(Math.abs(next-current)<1e-9)continue;await marksApi.update(raw.id,{record_type:raw.record_type||"item",title:raw.title||d.mark||"",data:{...d,mounted:next}})}markRows=await marksApi.list().catch(()=>markRows)}
  function list(){
   const all=reports(),q=query.trim().toLowerCase(),shown=all.filter(r=>!q||arr(r.items||r.works).some(w=>`${w.work_type||""} ${w.project_code||""} ${w.mark||""} ${w.name||""}`.toLowerCase().includes(q)));
   app.innerHTML=`<div class="reports-page"><div class="reports-titlebar"><button class="back" id="reportsBack">← Назад</button><div><h1>Ежедневные отчёты</h1><p>${esc(object?.name||"")}</p></div>${canEdit()?'<button class="reports-new" id="reportNew">＋ Новый отчёт</button>':""}</div><div class="reports-summary"><div><span>Всего отчётов</span><b>${all.length}</b></div><div><span>Последний отчёт</span><b>${all.length?date(all[0].date||all[0].report_date):"—"}</b></div><div><span>Дней с работами</span><b>${new Set(all.map(x=>x.date||x.report_date).filter(Boolean)).size}</b></div></div><div class="reports-toolbar"><input id="reportsSearch" value="${esc(query)}" placeholder="Поиск по виду работы, шифру или марке…"></div><div class="reports-list">${shown.length?shown.map(card).join(""):'<div class="reports-empty">Сохранённых ежедневных отчётов пока нет</div>'}</div></div>`;
   document.getElementById("reportsBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   document.getElementById("reportNew")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports/new`);
   const s=document.getElementById("reportsSearch");if(s)s.oninput=e=>{query=e.target.value;list();const n=document.getElementById("reportsSearch");n.focus();n.setSelectionRange(n.value.length,n.value.length)};
   document.querySelectorAll("[data-report-id]").forEach(row=>{row.onclick=e=>{if(e.target.closest(".report-actions"))return;location.hash=`/objects/object/${oid}/reports/${row.dataset.reportId}`}});
   document.querySelectorAll("[data-report-edit]").forEach(b=>b.onclick=e=>{e.stopPropagation();location.hash=`/objects/object/${oid}/reports/${b.dataset.reportEdit}/edit`});
   document.querySelectorAll("[data-report-copy]").forEach(b=>b.onclick=e=>{e.stopPropagation();const r=all.find(x=>String(x.id)===String(b.dataset.reportCopy));if(!r)return;sessionStorage.setItem(`ir-report-copy-${window.name?.startsWith("ir-tab-")?window.name+"-":""}${oid}`,JSON.stringify(r));location.hash=`/objects/object/${oid}/reports/new`});
   document.querySelectorAll("[data-report-delete]").forEach(b=>b.onclick=async e=>{e.stopPropagation();const id=b.dataset.reportDelete;if(!confirm(`Удалить ежедневный отчёт #${id}?`))return;await api.remove(id);reportRows=await api.list().catch(()=>[]);await syncMarks();list()});
  }
  function card(r){
   const groups=groupedWorks(r),w=weatherText(r),wind=String(r.wind||"").trim(),people=peopleCount(r),equipment=equipmentCount(r);
   const measured=groups.filter(g=>!g.service&&g.volume>0),services=groups.filter(g=>g.service),activity=window.irReportActivityPreview?.(r);
    const showText=!measured.length&&activity?.kind!=="empty",content=measured.length?[...measured,...services]:showText?[]:services;
    const workHtml=content.length?content.map(g=>`<div class="report-work-line"><strong>${esc(workLabel(g.work_type,"mount"))}</strong><span>${g.service?(g.completed?"✓ Выполнено":"Не выполнено"):`${g.project_code?`Шифр: ${esc(g.project_code)} · `:""}Объём: ${fmt(g.volume)} ${esc(g.unit)}`}</span></div>`).join(""):(activity?.lines||["Работы не проводились"]).slice(0,4).map(t=>'<div class="report-work-line"><strong>'+esc(workLabel(t,"mount"))+'</strong></div>').join("");
   return `<article class="report-row" data-report-id="${r.id}"><div class="report-date"><b>${date(r.date||r.report_date)}</b><span>Отчёт #${r.id}</span></div><div class="report-main">${workHtml}<div class="report-meta"><span>${weatherIcon(w)} ${esc(w)}</span>${wind?`<span>🌬 ${esc(wind)}</span>`:""}<span>♟ ${fmt(people)} чел.</span><span>🏗 ${fmt(equipment)} ед. техники</span></div></div><div class="report-side"><span>${arr(r.items||r.works).length} работ</span>${canEdit()?`<div class="report-actions"><button data-report-edit="${r.id}" title="Редактировать">✎</button><button data-report-copy="${r.id}" title="Копировать">⧉</button><button data-report-delete="${r.id}" class="report-delete" title="Удалить">⌫</button></div>`:""}</div></article>`;
  }
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(workLabel(w.name,"mount"))}${w.accounting_type==="service"?" · Услуга":w.has_marks?`${w.code?" · "+esc(w.code):""} · ${esc(w.unit)}`:` · ${esc(w.unit)}`}</option>`).join("")}`;
  const workerRow=x=>`<div class="dynamic-row worker-row"><label>Должность<input name="worker_role" value="${esc(x?.role||x?.name||"Монтажник")}"></label><label>Количество<input type="number" min="1" name="worker_count" value="${esc(x?.count||1)}"></label><button type="button" class="row-remove">×</button></div>`;
  const responsibleRow=x=>`<div class="dynamic-row responsible-row"><label>Должность<input name="responsible_role" value="${esc(x?.role||"")}" placeholder="Прораб"></label><label>ФИО<input name="responsible_name" value="${esc(x?.name||"")}"></label><button type="button" class="row-remove">×</button></div>`;
  const equipmentRow=x=>`<div class="dynamic-row equipment-row"><label>Техника<input name="equipment_name" value="${esc(x?.name||"")}" placeholder="Автокран"></label><label>Количество<input type="number" min="1" name="equipment_count" value="${esc(x?.count||1)}"></label><button type="button" class="row-remove">×</button></div>`;
  const workRow=x=>`<div class="dynamic-row work-row report-work-picker" data-initial-mark="${esc(x?.mark_id||"")}" data-initial-qty="${esc(x?.qty||"")}"><label class="rw-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="rw-code">Шифр проекта<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="rw-unit">Ед. изм.<input name="unit" readonly value="${esc(x?.unit||"")}" placeholder="—"></label><label class="rw-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="rw-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty||"")}" placeholder="0"></label><label class="rw-volume">Объём<input name="volume" readonly value="${esc(x?.volume||"")}" placeholder="0"></label><label class="rw-service" hidden>Статус услуги<select name="service_completed"><option value="1" ${x?.completed!==false?"selected":""}>Выполнено</option><option value="0" ${x?.completed===false?"selected":""}>Не выполнено</option></select></label><button type="button" class="row-remove">×</button></div>`;
  async function form(mode,data={}){
   await loadRefs();
   const editing=mode==="edit",view=mode==="view",editId=editing||view?String(data.id||route.reportId||""):null,baseMounted=mountedMap(editing?editId:null),mountedAll=allMountedMap();
   const workers=arr(data.workers||data.people),responsible=arr(data.responsible),equipment=arr(data.equipment),rawWorks=arr(data.items||data.works),works=[];{const serviceIndex=new Map();for(const w of rawWorks){const wt=workTypes().find(x=>x.id===String(w.work_type_id||"")),service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга"||wt?.accounting_type==="service";if(!service){works.push(w);continue}const key=String(w.work_type_id||wt?.id||w.work_type||"");if(!serviceIndex.has(key)){serviceIndex.set(key,works.length);works.push({...w,accounting_type:"service",is_service:true,unit:"услуга"})}else{const i=serviceIndex.get(key),prev=works[i],done=serviceDone(prev)||serviceDone(w);works[i]={...prev,...w,completed:done,service_completed:done,accounting_type:"service",is_service:true,unit:"услуга"}}}}
   const title=view?`Ежедневный отчёт #${editId}`:editing?`Редактирование ежедневного отчёта #${editId}`:"Новый ежедневный отчёт";
   app.innerHTML=`<div class="report-form-page"><div class="report-form-head"><button class="back" id="reportFormBack">← К отчётам</button><div><h1>${title}</h1><p>${esc(object?.name||"")}</p></div>${!view?`<button class="report-save" form="dailyReportForm">${editing?"Сохранить изменения":"Сохранить отчёт"}</button>`:""}</div><form id="dailyReportForm" class="daily-report-form"><section class="report-form-section"><div class="rfs-head"><span>01</span><div><h2>Дата и погода</h2><p>Основная информация за рабочий день</p></div></div><div class="rfs-body report-grid-3"><label>Дата отчёта<input type="date" name="date" required value="${esc(data.date||data.report_date||"")}"></label><label>Погода<select name="weather">${["Ясно","Облачно","Дождь","Снег","Гроза","Туман"].map(x=>`<option ${weatherText(data)===x?"selected":""}>${x}</option>`).join("")}</select></label><label>Ветер<input name="wind" value="${esc(data.wind||"")}" placeholder="Например: 5 м/с"></label></div></section><section class="report-form-section"><div class="rfs-head"><span>02</span><div><h2>Работники по должностям</h2><p>Количество людей на объекте</p></div>${!view?'<button type="button" class="rfs-add" data-add="workers">＋ Добавить</button>':""}</div><div class="rfs-body dynamic-list" id="workersList">${(workers.length?workers:[{}]).map(workerRow).join("")}</div></section><section class="report-form-section"><div class="rfs-head"><span>03</span><div><h2>Ответственные лица</h2><p>Прораб, мастер, инженер ПТО и другие</p></div>${!view?'<button type="button" class="rfs-add" data-add="responsible">＋ Добавить</button>':""}</div><div class="rfs-body dynamic-list" id="responsibleList">${(responsible.length?responsible:[{}]).map(responsibleRow).join("")}</div></section><section class="report-form-section"><div class="rfs-head"><span>04</span><div><h2>Техника</h2><p>Техника, задействованная за день</p></div>${!view?'<button type="button" class="rfs-add" data-add="equipment">＋ Добавить</button>':""}</div><div class="rfs-body dynamic-list" id="equipmentList">${(equipment.length?equipment:[{}]).map(equipmentRow).join("")}</div></section><section class="report-form-section"><div class="rfs-head"><span>05</span><div><h2>Выполненные работы</h2><p>Монтаж и изготовление — по маркам; другие работы — по объёму; услуги — выполнено / не выполнено</p></div>${!view?'<button type="button" class="rfs-add" data-add="works">＋ Добавить работу</button>':""}</div><div class="rfs-body dynamic-list" id="worksList">${(works.length?works:[{}]).map(workRow).join("")}</div></section><section class="report-form-section"><div class="rfs-head"><span>06</span><div><h2>Дополнительная информация</h2></div></div><div class="rfs-body"><textarea name="note" class="report-note" placeholder="Введите дополнительную информацию…">${esc(data.note||"")}</textarea></div></section><section class="report-form-section"><div class="rfs-head"><span>07</span><div><h2>Фото</h2><p>До 12 фотографий с объекта</p></div></div><div class="rfs-body"><div class="report-photo-grid">${Array.from({length:12},(_,i)=>`<button type="button" class="report-photo-slot"><b>＋</b><span>Фото ${i+1}</span></button>`).join("")}</div></div></section>${!view?`<div class="report-form-bottom"><button type="button" id="reportCancel">Отмена</button><button class="report-save">${editing?"Сохранить изменения":"Сохранить отчёт"}</button></div>`:""}</form></div>`;
   if(!view){const reportForm=document.getElementById("dailyReportForm");reportForm.dataset.extraInlineSave="1";await window.irReportExtraSections?.enhanceForm?.(data)}
   const back=()=>location.hash=`/objects/object/${oid}/reports`;document.getElementById("reportFormBack").onclick=back;document.getElementById("reportCancel")?.addEventListener("click",back);
   if(view){document.querySelectorAll("#dailyReportForm input,#dailyReportForm select,#dailyReportForm textarea,#dailyReportForm button").forEach(x=>x.disabled=true);return}
   const markState=m=>{const total=num(m.qty??m.count),mounted=Math.min(total,mountedAll[String(m.id)]||0),base=Math.min(total,baseMounted[String(m.id)]||0),left=Math.max(0,total-mounted),available=Math.max(0,total-base),uv=num(m.unit_volume??m.volume_one);return{total,mounted,left,available,uv}};
   function setupWorkRow(r){
    const wt=r.querySelector('[name="work_type_id"]'),code=r.querySelector('[name="project_code"]'),unit=r.querySelector('[name="unit"]'),search=r.querySelector('[name="mark_search"]'),mid=r.querySelector('[name="mark_id"]'),qty=r.querySelector('[name="qty"]'),vol=r.querySelector('[name="volume"]'),serviceSelect=r.querySelector('[name="service_completed"]'),box=r.querySelector('.mark-results'),balance=r.querySelector('.selected-mark-balance');let selected=marks().find(m=>m.id===String(mid.value));
    const showBalance=()=>{if(!selected){balance.hidden=true;return}const s=markState(selected);balance.innerHTML=`<span>Всего: <b>${fmt(s.total)}</b></span><span class="mounted">Смонтировано: <b>${fmt(s.mounted)}</b></span><span class="left">Осталось: <b>${fmt(s.left)}</b></span><span>Доступно в отчёте: <b>${fmt(s.available)}</b></span>`;balance.hidden=false;qty.max=String(s.available)};
    const calc=()=>{const w=workTypes().find(x=>x.id===String(wt.value));if(w&&!w.has_marks&&w.accounting_type!=="service"){vol.value=fmt(num(qty.value));return}if(!selected){vol.value="0";return}const s=markState(selected),q=num(qty.value);if(q>s.available)qty.value=fmt(s.available);vol.value=fmt(num(qty.value)*s.uv)};
    const renderMarks=()=>{const q=search.value.trim().toLowerCase(),wid=String(wt.value),list=marks().filter(m=>String(m.work_type_id||"")===wid&&(!q||`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q))).sort((a,b)=>String(a.mark||a.title||"").localeCompare(String(b.mark||b.title||""),"ru",{numeric:true}));box.innerHTML=list.length?list.map(m=>{const s=markState(m),done=s.left<=0&&!editing;return `<button type="button" data-mid="${m.id}" class="mark-result-${done?"done":s.mounted>0?"partial":"left"}" ${done?"disabled title=\"Марка смонтирована на 100%\"":""}><b>${esc(m.mark||m.title||"—")}</b><span>${esc(m.name||"")}</span><i>Всего ${fmt(s.total)} · Смонт. ${fmt(s.mounted)} · Ост. ${fmt(s.left)} · ${fmt(s.uv)} ${esc(m.unit||unit.value)}</i></button>`}).join(""):'<div class="mark-result-empty">Марки не найдены</div>';box.hidden=false;box.querySelectorAll("button:not(:disabled)[data-mid]").forEach(b=>b.onclick=()=>{selected=marks().find(m=>m.id===String(b.dataset.mid));mid.value=selected.id;search.value=`${selected.mark||selected.title||""}${selected.name?" — "+selected.name:""}`;box.hidden=true;showBalance();calc()})};
    const syncType=()=>{const w=workTypes().find(x=>x.id===String(wt.value)),service=w?.accounting_type==="service",plain=Boolean(w&&!service&&!w.has_marks),serviceLabel=serviceSelect?.closest(".rw-service"),markLabel=search?.closest(".rw-mark"),qtyLabel=qty?.closest(".rw-qty"),volumeLabel=vol?.closest(".rw-volume");r.classList.toggle("service-mode",service);r.classList.toggle("plain-mode",plain);if(serviceLabel)serviceLabel.hidden=!service;if(markLabel)markLabel.hidden=service||plain;if(qtyLabel){qtyLabel.hidden=service;const text=[...qtyLabel.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue=plain?"Объём выполнено":"Количество"}if(volumeLabel)volumeLabel.hidden=service||plain;code.value=service||plain?"":w?.code||"";unit.value=service?"услуга":w?.unit||"";if(service||plain){selected=null;mid.value="";search.value="";balance.hidden=true;box.hidden=true;if(service){qty.value="";vol.value=""}else calc()}else{showBalance();calc()}};wt.onchange=()=>{const w=workTypes().find(x=>x.id===String(wt.value));if(w?.accounting_type==="service"&&wt.value){const duplicate=[...document.querySelectorAll(".work-row")].some(other=>other!==r&&String(other.querySelector('[name="work_type_id"]')?.value||"")===String(wt.value));if(duplicate){reportError("Эта услуга уже добавлена в отчёт. Одна работа не может одновременно быть выполнена и не выполнена.");wt.value="";}}selected=null;mid.value="";search.value="";qty.value="";vol.value="";balance.hidden=true;box.hidden=true;syncType()};search.onfocus=()=>{const w=workTypes().find(x=>x.id===String(wt.value));if(w?.accounting_type!=="service")renderMarks()};search.oninput=()=>{selected=null;mid.value="";balance.hidden=true;renderMarks()};qty.oninput=calc;syncType();
   }
   const bindRows=()=>{document.querySelectorAll(".work-row").forEach(r=>{if(!r.dataset.bound){r.dataset.bound="1";setupWorkRow(r)}});document.querySelectorAll(".row-remove").forEach(b=>b.onclick=()=>{const list=b.closest(".dynamic-list");if(list.children.length>1)b.closest(".dynamic-row").remove()})};
   document.querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>{const map={workers:["workersList",()=>workerRow({})],responsible:["responsibleList",()=>responsibleRow({})],equipment:["equipmentList",()=>equipmentRow({})],works:["worksList",()=>workRow({})]},[id,fn]=map[b.dataset.add];document.getElementById(id).insertAdjacentHTML("beforeend",fn());bindRows()});bindRows();
   const reportForm=document.getElementById("dailyReportForm");
   const reportError=(message,field)=>{
    let box=reportForm.querySelector(".report-inline-error");
    if(!box){box=document.createElement("div");box.className="report-inline-error";box.setAttribute("role","alert");reportForm.prepend(box)}
    box.textContent=String(message);box.hidden=false;
    if(field)reportForm.querySelector('[name="'+field+'"]')?.focus();
   };
   reportForm.addEventListener("input",()=>{const box=reportForm.querySelector(".report-inline-error");if(box)box.hidden=true});
   reportForm.onsubmit=async e=>{
    e.preventDefault();const f=e.currentTarget,fd=new FormData(f),chosenDate=String(fd.get("date")||"");
    if(!chosenDate)return reportError("Укажите дату отчёта.","date");
    if(reports().some(r=>String(r.id)!==String(editId||"")&&String(r.date||r.report_date||"")===chosenDate))return reportError(`На дату ${date(chosenDate)} ежедневный отчёт уже существует.`,"date");
    const workersNow=[...f.querySelectorAll(".worker-row")].map(r=>({role:r.querySelector('[name="worker_role"]').value,count:num(r.querySelector('[name="worker_count"]').value)})).filter(x=>x.role&&x.count);
    const responsibleNow=[...f.querySelectorAll(".responsible-row")].map(r=>({role:r.querySelector('[name="responsible_role"]').value,name:r.querySelector('[name="responsible_name"]').value})).filter(x=>x.role||x.name);
    const equipmentNow=[...f.querySelectorAll(".equipment-row")].map(r=>({name:r.querySelector('[name="equipment_name"]').value,count:num(r.querySelector('[name="equipment_count"]').value)})).filter(x=>x.name&&x.count);
    const worksNow=[...f.querySelectorAll(".work-row")].map(r=>{const wid=String(r.querySelector('[name="work_type_id"]').value),w=workTypes().find(x=>x.id===wid),service=w?.accounting_type==="service";if(service){const completed=r.querySelector('[name="service_completed"]')?.value!=="0";return{work_type_id:wid,work_type:w?.name||"",accounting_type:"service",is_service:true,completed,service_completed:completed,project_code:"",unit:"услуга",mark_id:"",mark:"",name:"",qty:0,unit_volume:0,volume:0}}const q=num(r.querySelector('[name="qty"]').value);if(w&&!w.has_marks)return{work_type_id:wid,work_type:w.name||"",accounting_type:"volume",project_code:"",unit:w.unit||"",mark_id:"",mark:"",name:"",qty:q,unit_volume:1,volume:q};const mid=String(r.querySelector('[name="mark_id"]').value),m=marks().find(x=>x.id===mid),uv=num(m?.unit_volume??m?.volume_one);return{work_type_id:wid,work_type:w?.name||"",accounting_type:"volume",project_code:w?.code||"",unit:w?.unit||"",mark_id:mid,mark:m?.mark||m?.title||"",name:m?.name||"",qty:q,unit_volume:uv,volume:q*uv}}).filter(x=>x.work_type_id&&(x.accounting_type==="service"||x.mark_id||x.qty));const serviceIds=worksNow.filter(x=>x.accounting_type==="service").map(x=>String(x.work_type_id));if(new Set(serviceIds).size!==serviceIds.length)return reportError("Одна услуга может быть добавлена в ежедневный отчёт только один раз.");
        const byMark={};for(const w of worksNow)if(w.mark_id)byMark[w.mark_id]=(byMark[w.mark_id]||0)+num(w.qty);for(const [mid,q] of Object.entries(byMark)){const m=marks().find(x=>x.id===mid),s=m?markState(m):null;if(s&&q>s.available+1e-9)return reportError(`По марке ${m.mark||m.title||""} доступно ${fmt(s.available)}, а указано ${fmt(q)}.`)}
    const extra=window.irReportExtraSections?.capture?.(f)||{daily_summary:arr(data.daily_summary),additional_works:arr(data.additional_works),signed_act:data.signed_act||null};
    const filledSummary=arr(extra.daily_summary).some(x=>String(typeof x==="string"?x:x?.text||"").trim());
    const filledAdditional=arr(extra.additional_works).some(x=>String(x?.name||x?.qty||x?.volume||"").trim());
    if(!worksNow.length&&!String(fd.get("note")||"").trim()&&!filledSummary&&!filledAdditional)return reportError("Добавьте выполненную работу, сводку за день или дополнительную информацию.");
    const payload={record_type:"item",title:`Отчёт ${date(chosenDate)}`,data:{date:chosenDate,weather:fd.get("weather"),wind:fd.get("wind"),workers:workersNow,responsible:responsibleNow,equipment:equipmentNow,items:worksNow,note:fd.get("note"),photos:arr(data.photos),daily_summary:arr(extra.daily_summary),additional_works:arr(extra.additional_works),signed_act:extra.signed_act||null}};
    try{
    let saved;if(editing){await api.update(editId,payload);saved={id:editId}}else saved=await api.create(payload);
    if(extra.delete_act&&extra.delete_act!==extra.signed_act?.path){try{await irProject.reportDocuments?.remove?.(extra.delete_act)}catch(e){console.warn("Старый общий акт не удалён:",e)}}
    reportRows=await api.list().catch(()=>reportRows);await syncMarks();location.hash=`/objects/object/${oid}/reports/${saved.id}`;
    }catch(error){console.error("Report save failed",error);reportError("Не удалось сохранить отчёт: "+String(error?.message||error));}
   };
  }
  if(route.mode==="new"){
   let copied={};try{const raw=sessionStorage.getItem(`ir-report-copy-${window.name?.startsWith("ir-tab-")?window.name+"-":""}${oid}`);if(raw){copied=JSON.parse(raw)||{};sessionStorage.removeItem(`ir-report-copy-${window.name?.startsWith("ir-tab-")?window.name+"-":""}${oid}`)}}catch{}return form("new",copied);
  }
  if(route.mode==="edit"||route.mode==="view"){
   const rec=reports().find(r=>String(r.id)===String(route.reportId));if(!rec){location.hash=`/objects/object/${oid}/reports`;return}return form(route.mode,rec);
  }
  list();
 };
})();

;

/* #10: src/report-view-page.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const hasMark=w=>Boolean(String(w?.mark_id||w?.mark||"").trim());
 const workQty=w=>num(w?.qty??w?.count??w?.quantity);
 const workValue=w=>{const direct=num(w?.volume??w?.total_volume);if(direct)return direct;const uv=num(w?.unit_volume??w?.volume_one??w?.volume1);if(uv)return workQty(w)*uv;return hasMark(w)?0:workQty(w)};
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
 const reportData=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const countPeople=r=>{const workers=arr(r.workers).length?arr(r.workers):arr(r.people),responsible=arr(r.responsible).length?arr(r.responsible):arr(r.responsibles),workersCount=workers.reduce((s,x)=>s+num(x.count??x.qty),0),responsibleCount=responsible.reduce((s,x)=>{const explicit=num(x.count??x.qty);return s+(explicit>0?explicit:(String(x.name||x.role||"").trim()?1:0))},0);return workersCount+responsibleCount};
 const countEquipment=r=>arr(r.equipment).reduce((s,x)=>s+num(x.count??x.qty),0);
 const measure=()=>window.irMeasure||{meta:()=>({totalLabel:"Общий объём",itemLabel:"Объём 1 ед.",accent:"slate"}),totals:()=>[]};
 const tempText=v=>{if(v===""||v==null)return"Температура не указана";const n=num(v);return`${n>0?"+":""}${fmt(n)}°C`};
 const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
 const weatherKind=w=>({"Ясно":"sun","Облачно":"cloud","Дождь":"rain","Снег":"snow","Гроза":"storm","Туман":"fog"})[w]||"cloud";
 const weatherSvg=w=>{const k=weatherKind(w),m={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',cloud:'<path d="M6 18h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>',rain:'<path d="M6 15h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 6 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',snow:'<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>',storm:'<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>',fog:'<path d="M4 8h16M2 12h20M5 16h14"/>'};return svg(m[k])};
 const userSvg=()=>svg('<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>');
 const photoSvg=()=>svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>');
 const printableHtml=(title,card)=>`<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>@page{size:A4;margin:8mm 0}*{box-sizing:border-box}body{margin:0;padding:0;background:#fff;color:#17364d;font:13px Arial,sans-serif}.report-view-card{width:100%;margin:0;padding:0 8mm}.report-view-hero{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #d9e4eb;padding:0 0 12px;margin-bottom:14px}.report-view-hero h1{margin:4px 0;font-size:22px}.rv-summary,.rv-totals{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.rv-summary>div,.rv-total-card,.rv-section{border:1px solid #dfe7ed;border-radius:10px;padding:12px}.rv-section{margin-top:10px}.rv-work-table{width:100%;border-collapse:collapse}.rv-work-table th,.rv-work-table td{padding:8px;border-bottom:1px solid #e7edf1;text-align:left}.rv-photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.rv-photo-grid img{width:100%;height:160px;object-fit:cover;border-radius:7px}.report-view-actions,.report-view-back,.rv-lightbox{display:none!important}</style></head><body>${card}</body></html>`;
 async function renderView(oid,reportId){
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("reports"),object=await irProject.data.objects.get(oid),raw=await api.list().catch(()=>[]),record=raw.find(x=>String(x.id)===String(reportId));if(!record){location.hash=`/objects/object/${oid}/reports`;return}
  const r=reportData(record),ordered=[...raw].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)),no=Math.max(1,ordered.findIndex(x=>String(x.id)===String(reportId))+1),weather=typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather?.condition||"Не указана"),temperature=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp??"",people=countPeople(r),equipment=countEquipment(r),rawWorks=arr(r.items||r.works),works=[];{const serviceIndex=new Map();for(const w of rawWorks){const service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга";if(!service){works.push(w);continue}const key=String(w.work_type_id||w.work_type||"");if(!serviceIndex.has(key)){serviceIndex.set(key,works.length);works.push({...w,unit:"услуга",accounting_type:"service",is_service:true})}else{const i=serviceIndex.get(key),prev=works[i],done=serviceDone(prev)||serviceDone(w);works[i]={...prev,...w,completed:done,service_completed:done,unit:"услуга",accounting_type:"service",is_service:true}}}}const photos=arr(r.photos).slice(0,12),photoUrls=await Promise.all(photos.map(p=>irProject.images.read(p).catch(()=>"")));
  const workers=arr(r.workers||r.people),responsible=arr(r.responsible||r.responsibles),equipmentRows=arr(r.equipment),isService=w=>w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",volumeWorks=works.filter(w=>!isService(w)).map(w=>({...w,volume:workValue(w)})),totals=measure().totals(volumeWorks);
  const activity=window.irReportActivityPreview?.(r);
  const markedWorks=works.filter(w=>!isService(w)&&hasMark(w)),plainWorks=works.filter(w=>!isService(w)&&!hasMark(w)),serviceWorks=works.filter(isService),markedRows=markedWorks.map(w=>{const m=measure().meta(w.unit);return`<tr><td><b>${esc(workLabel(w.work_type||w.type||"Работа","mount"))}</b></td><td>${esc(w.project_code||w.code||"—")}</td><td>${esc(w.mark||"—")}${w.name?`<small>${esc(w.name)}</small>`:""}</td><td>${fmt(workQty(w))}</td><td><span class="rv-value-label">${esc(m.totalLabel)}</span><b>${fmt(workValue(w))} ${esc(w.unit||"")}</b></td></tr>`}).join(""),plainRows=plainWorks.map(w=>`<tr><td><b>${esc(workLabel(w.work_type||w.type||"Работа","mount"))}</b></td><td></td><td>${esc(w.unit||"—")}</td><td><b>${fmt(workQty(w))}</b></td></tr>`).join(""),serviceRows=serviceWorks.map(w=>`<tr class="rv-service-row"><td><b>${esc(workLabel(w.work_type||w.type||"Услуга","mount"))}</b></td><td><b class="${serviceDone(w)?"rv-service-done":"rv-service-pending"}">${serviceDone(w)?"✓ Выполнено":"Не выполнено"}</b></td></tr>`).join(""),markedBlock=markedWorks.length?`<div class="rv-work-block"><div class="rv-work-block-title">Работы по маркам</div><div class="rv-table-wrap"><table class="rv-work-table"><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка</th><th>Кол-во</th><th>Итог</th></tr></thead><tbody>${markedRows}</tbody></table></div></div>`:"",plainBlock=plainWorks.length?`<div class="rv-work-block rv-plain-work-block"><div class="rv-work-block-title">Работы</div><div class="rv-table-wrap"><table class="rv-work-table rv-plain-work-table"><thead><tr><th>Вид работы</th><th></th><th>Ед. измерения</th><th>Кол-во Итого</th></tr></thead><tbody>${plainRows}</tbody></table></div></div>`:"",serviceBlock=serviceWorks.length?`<div class="rv-work-block rv-service-work-block"><div class="rv-work-block-title">Услуги</div><div class="rv-table-wrap"><table class="rv-work-table rv-service-work-table"><thead><tr><th>Вид работы</th><th>Статус</th></tr></thead><tbody>${serviceRows}</tbody></table></div></div>`:"",workBlocks=markedBlock+plainBlock+serviceBlock||(activity?.kind!=="empty"?"":'<div class="rv-empty">Работы не проводились</div>');
  const serviceDoneCount=serviceWorks.filter(serviceDone).length,totalHtml=(totals.length?totals.map(t=>`<div class="rv-total-card rv-accent-${esc(t.accent)}"><small>${esc(t.label)}</small><b>${fmt(t.value)} ${esc(t.unit)}</b></div>`).join(""):"")+(serviceWorks.length?`<div class="rv-total-card rv-accent-green"><small>Услуги выполнено</small><b>${serviceDoneCount} / ${serviceWorks.length}</b></div>`:"")||(activity?.kind!=="empty"?"":'<div class="rv-total-card"><small>Выполненные работы</small><b>Нет объёмов</b></div>');
  const chip=(title,value)=>`<div class="rv-chip"><small>${esc(title)}</small><b>${esc(value)}</b></div>`;
  const workerChips=workers.map(x=>chip(x.role||x.name||"Работник",`${fmt(x.count??x.qty)} чел.`)).join("")||'<span class="rv-empty">Не указаны</span>';
  const responsibleChips=responsible.map(x=>chip(x.role||"Ответственный",x.name||"—")).join("")||'<span class="rv-empty">Не указаны</span>';
  const equipmentChips=equipmentRows.map(x=>chip(x.name||x.type||"Техника",`${fmt(x.count??x.qty)} ед.`)).join("")||'<span class="rv-empty">Не указана</span>';
  const photoCount=photoUrls.filter(Boolean).length,photoHtml=photoCount?photoUrls.map((src,i)=>src?`<button type="button" class="rv-photo" data-photo-index="${i}"><img src="${src}" alt="Фото ${i+1}"><span>Фото ${i+1}</span></button>`:"").join(""):'<div class="rv-empty">Фотографии не добавлены</div>';
  app.innerHTML=`<div class="report-view-page"><div class="report-view-top"><button class="back report-view-back" id="rvBack">← Ко всем отчётам</button><div class="report-view-actions">${canEdit()?`<button id="rvEdit">✎ Редактировать</button><button id="rvDelete" class="danger">Удалить</button>`:""}<button id="rvHtml">HTML</button><button id="rvPdf">PDF</button><button id="rvPrint">Печать</button></div></div><article class="report-view-card" id="rvCard"><div class="report-view-hero"><div><small>ЕЖЕДНЕВНЫЙ ОТЧЁТ №${no}</small><h1>Отчёт за ${dmy(r.date||r.report_date)}</h1><p>${esc(object?.name||"")}</p></div><div class="rv-report-id">ID ${esc(r.id)}</div></div><div class="rv-summary"><div class="rv-summary-weather weather-${weatherKind(weather)}"><span class="rv-summary-icon">${weatherSvg(weather)}</span><div><small>Погода</small><b>${esc(weather)} <strong>${esc(tempText(temperature))}</strong></b><em>${r.wind?`Ветер: ${esc(r.wind)}`:"Ветер не указан"}</em></div></div><div class="rv-summary-people"><span class="rv-summary-icon">${userSvg()}</span><div><small>Работники</small><b>${fmt(people)} чел.</b></div></div><div class="rv-summary-equipment"><span class="rv-summary-icon rv-crane-icon"></span><div><small>Техника</small><b>${fmt(equipment)} ед.</b></div></div><div class="rv-summary-photo"><span class="rv-summary-icon">${photoSvg()}</span><div><small>Фото</small><b>${photoCount}</b><em>Фотографий: ${photoCount}</em></div></div></div><section class="rv-section rv-works-section" ${!works.length&&activity?.kind!=="empty"?'style="display:none"':""}><div class="rv-section-title"><h2>Выполненные работы</h2><span>${works.length} работ</span></div>${totalHtml?`<div class="rv-totals">${totalHtml}</div>`:""}${workBlocks}</section><div class="rv-two"><section class="rv-section rv-people-section"><h2>Работники</h2><div class="rv-chip-list">${workerChips}</div></section><section class="rv-section rv-responsible-section"><h2>Ответственные лица</h2><div class="rv-chip-list">${responsibleChips}</div></section></div><section class="rv-section rv-equipment-section"><h2>Техника</h2><div class="rv-chip-list">${equipmentChips}</div></section>${r.note||r.extra?`<section class="rv-section rv-note-section"><h2>Дополнительная информация</h2><div class="rv-note">${esc(r.note||r.extra)}</div></section>`:""}<section class="rv-section rv-photo-section"><div class="rv-section-title"><h2>Фотографий: ${photoCount}</h2><span>до 12</span></div><div class="rv-photo-grid">${photoHtml}</div></section></article><div class="rv-lightbox" id="rvLightbox" hidden><button id="rvLightboxClose">×</button><img id="rvLightboxImg" alt="Фото отчёта"></div></div>`;
  document.getElementById("rvBack").onclick=()=>location.hash=`/objects/object/${oid}/reports`;
  document.getElementById("rvEdit")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports/${reportId}/edit`);
  document.getElementById("rvDelete")?.addEventListener("click",async()=>{if(!confirm(`Удалить ежедневный отчёт №${no}?`))return;await api.remove(reportId);for(const p of photos)await irProject.reportPhotos?.remove?.(p).catch(()=>{});if(window.irSyncMountedFromReports)await window.irSyncMountedFromReports(oid);location.hash=`/objects/object/${oid}/reports`});
  const title=`IR Project — ежедневный отчёт №${no} — ${dmy(r.date||r.report_date)}`;
  document.getElementById("rvHtml").onclick=()=>{const html=printableHtml(title,document.getElementById("rvCard").outerHTML);return irProject.reportExport?.html?.(html,`Отчёт №${no} ${dmy(r.date||r.report_date).replaceAll(".","-")}.html`)};
  document.getElementById("rvPdf").onclick=()=>irProject.reportExport?.pdf?.(`Отчёт №${no} ${dmy(r.date||r.report_date).replaceAll(".","-")}.pdf`);
  document.getElementById("rvPrint").onclick=()=>irProject.reportExport?.print?.();
  const lb=document.getElementById("rvLightbox"),img=document.getElementById("rvLightboxImg");document.querySelectorAll("[data-photo-index]").forEach(b=>b.onclick=()=>{img.src=photoUrls[Number(b.dataset.photoIndex)]||"";lb.hidden=false});document.getElementById("rvLightboxClose").onclick=()=>lb.hidden=true;lb.onclick=e=>{if(e.target===lb)lb.hidden=true};document.addEventListener("keydown",e=>{if(e.key==="Escape")lb.hidden=true});
 }
 window.irReportsPage=async(oid,route={})=>route?.mode==="view"&&route.reportId?renderView(oid,String(route.reportId)):base(oid,route);
})();
;

;
/* #11: src/report-secondary-code.js */
"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 async function addSecondaryCode(oid,reportId){
  const table=document.querySelector(".rv-work-table tbody");if(!table)return;
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const record=reports.find(r=>String(r.id)===String(reportId));if(!record)return;
  const works=Array.isArray(record.data?.items)?record.data.items:Array.isArray(record.data?.works)?record.data.works:[];
  const wtMap=new Map(workTypes.map(r=>[String(r.id),r.data||{}]));
  [...table.querySelectorAll("tr")].forEach((tr,i)=>{
   const w=works[i];if(!w)return;
   const secondary=String(w.project_code_2||wtMap.get(String(w.work_type_id||""))?.project_code_2||"").trim();if(!secondary)return;
   const cell=tr.children[1];if(!cell||cell.querySelector(".rv-project-code-2"))return;
   const small=document.createElement("small");small.className="rv-project-code-2";small.textContent=`Доп. шифр: ${secondary}`;cell.appendChild(small);
  });
 }
 window.irReportsPage=async(oid,route={})=>{await base(oid,route);if(route?.mode==="view"&&route.reportId)await addSecondaryCode(oid,String(route.reportId))};
})();

;

/* #12: src/report-temperature.js */
"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const pendingKey=oid=>`ir-report-temperature-pending-${oid}`;
 const numText=v=>String(v??"").replace(",",".");
 const clearPending=oid=>sessionStorage.removeItem(pendingKey(oid));
 async function applyPending(oid,route){
  if(route?.mode!=="view"||!route.reportId)return;
  const raw=sessionStorage.getItem(pendingKey(oid));if(!raw)return;
  let p;try{p=JSON.parse(raw)}catch{clearPending(oid);return}
  const age=Date.now()-Number(p.at||0),validAge=age>=0&&age<60000,validTarget=p.mode==="new"||String(p.reportId||"")===String(route.reportId);
  if(!validAge||!validTarget){clearPending(oid);return}
  clearPending(oid);
  const api=irProject.data.forObject(oid).section("reports"),rec=await api.get(route.reportId).catch(()=>null);if(!rec)return;
  const data={...(rec.data||{}),temperature:p.value===""?"":Number(numText(p.value))};
  await api.update(route.reportId,{record_type:rec.record_type||"item",title:rec.title||"",data}).catch(()=>{});
 }
 async function enhanceForm(oid,route){
  if(!["new","edit"].includes(route?.mode))return;
  const form=document.getElementById("dailyReportForm"),grid=form?.querySelector(".report-grid-3");if(!form||!grid||form.querySelector('[name="temperature"]'))return;
  let initial="";if(route.mode==="edit"&&route.reportId){const rec=await irProject.data.forObject(oid).section("reports").get(route.reportId).catch(()=>null),d=rec?.data||{};initial=d.temperature??d.temp??""}
  const label=document.createElement("label");label.className="report-temperature-field";label.innerHTML=`Температура, °C<input type="number" step="0.1" name="temperature" value="${String(initial).replace(/"/g,"&quot;")}" placeholder="Например: 12">`;
  const wind=grid.querySelector('[name="wind"]')?.closest('label');grid.insertBefore(label,wind||null);grid.classList.add("report-grid-weather");
  const old=form.onsubmit;form.onsubmit=async e=>{sessionStorage.setItem(pendingKey(oid),JSON.stringify({value:String(form.querySelector('[name="temperature"]')?.value||""),mode:route.mode,reportId:route.reportId||"",at:Date.now()}));return old?.call(form,e)};
  document.getElementById("reportCancel")?.addEventListener("click",()=>clearPending(oid),{once:true});
 }
 window.irReportsPage=async(oid,route={})=>{
  if(!["new","edit","view"].includes(route?.mode))clearPending(oid);
  await applyPending(oid,route);
  const out=await base(oid,route);
  await enhanceForm(oid,route);
  return out;
 };
})();
;

/* #13: src/report-extra-sections.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],arr=v=>Array.isArray(v)?v:[],esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const route=()=>{const h=location.hash;let m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/new$/);if(m)return{oid:m[1],mode:"new",rid:""};m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)\/edit$/);if(m)return{oid:m[1],mode:"edit",rid:m[2]};m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)$/);if(m)return{oid:m[1],mode:"view",rid:m[2]};return null};
 const tabScope=()=>window.name?.startsWith("ir-tab-")?window.name+"-":"";
 const pendingKey=oid=>`ir-report-extra-pending-${tabScope()}${oid}`,api=oid=>irProject.data.forObject(oid).section("reports");
 const summaryText=x=>{if(typeof x==="string")return x;if(x?.text)return String(x.text);const parts=[];if(x?.name||x?.point)parts.push(String(x.name||x.point));if(x?.work||x?.stage)parts.push(String(x.work||x.stage));if(x?.percent!==""&&x?.percent!=null)parts.push(`${x.percent}% завершено`);else if(x?.progress!==""&&x?.progress!=null)parts.push(`${x.progress}% завершено`);return parts.join(" — ")};
 window.irReportActivityPreview=r=>{
   const summaries=arr(r?.daily_summary).map(summaryText).map(s=>String(s||"").trim()).filter(Boolean);
   if(summaries.length)return{kind:"summary",label:"Сводка за день",lines:summaries};
   const notes=[r?.note,r?.extra].map(s=>String(s||"").trim()).filter(Boolean);
   const additional=arr(r?.additional_works).map(x=>{
    const name=String(x?.name||x?.work||"").trim(),qty=String(x?.qty??x?.count??"").trim(),unit=String(x?.unit||"").trim();
    return[name,qty?[qty,unit].filter(Boolean).join(" "):""].filter(Boolean).join(" · ")
   }).filter(Boolean);
   if(notes.length||additional.length)return{kind:"additional",label:"Дополнительная информация / работы",lines:[...notes,...additional]};
   return{kind:"empty",label:"Работы",lines:["Работы не проводились"]}
  };
  const summaryRow=x=>`<div class="dynamic-row daily-summary-row"><label>Сводка<textarea name="summary_text" rows="2" placeholder="Например: Конвейер 1 — укрупнительная сборка завершена на 75%">${esc(summaryText(x))}</textarea></label><button type="button" class="row-remove" title="Удалить">×</button></div>`;
 const newExtraId=()=>["EW",Date.now().toString(36),Math.random().toString(36).slice(2,10)].join("-");
 const extraId=(entry,rid,index)=>String(entry?.id||entry?.work_id||((rid&&index>=0)?"EW-"+rid+"-"+(index+1):newExtraId()));
 const extraAct=x=>x?.signed_act?.path?x.signed_act:null;
 const extraRow=(x={},reportId="",index=-1)=>`<div class="dynamic-row additional-work-row" data-extra-id="${esc(extraId(x,reportId,index))}" data-extra-act="${esc(JSON.stringify(extraAct(x)))}"><label>Наименование<input name="additional_name" value="${esc(x?.name||"")}" placeholder="Наименование работы"></label><label>Количество<input name="additional_qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label>Ед. измерения<input name="additional_unit" list="irAdditionalUnits" value="${esc(x?.unit||"")}" placeholder="тн, м2, м3, шт..."></label><label>Объём<input name="additional_volume" inputmode="decimal" value="${esc(x?.volume??"")}" placeholder="0"></label><button type="button" class="row-remove" title="Удалить">×</button></div>`;
 function copyData(oid){try{const x=JSON.parse(sessionStorage.getItem(`ir-report-copy-${tabScope()}${oid}`)||"null");return x?.data||x||{}}catch{return{}}}
 async function initial(r){if(r.mode==="edit"){const rec=await api(r.oid).get(r.rid).catch(()=>null);return rec?.data||{}}return r.mode==="new"?copyData(r.oid):{}}
 function renumber(form){qa('.report-form-section .rfs-head>span',form).forEach((n,i)=>n.textContent=String(i+1).padStart(2,'0'))}
 function collect(form){return{daily_summary:qa('.daily-summary-row',form).map(row=>({text:q('[name="summary_text"]',row)?.value.trim()||""})).filter(x=>x.text),additional_works:qa('.additional-work-row',form).map(row=>({id:row.dataset.extraId||newExtraId(),signed_act:(()=>{try{return JSON.parse(row.dataset.extraAct||"null")}catch{return null}})(),name:q('[name="additional_name"]',row)?.value.trim()||"",qty:q('[name="additional_qty"]',row)?.value.trim()||"",unit:q('[name="additional_unit"]',row)?.value.trim()||"",volume:q('[name="additional_volume"]',row)?.value.trim()||""})).filter(x=>x.name||x.qty||x.unit||x.volume)}}
 function wireRows(section,type){if(section.dataset.rowsWired==="1")return;section.dataset.rowsWired="1";section.addEventListener('click',e=>{const add=e.target.closest('[data-extra-add]');if(add&&section.contains(add)){e.preventDefault();e.stopPropagation();const list=q('.dynamic-list',section);if(list)list.insertAdjacentHTML('beforeend',type==='summary'?summaryRow({}):extraRow({id:newExtraId()}));return}const remove=e.target.closest('.row-remove');if(remove&&section.contains(remove)){e.preventDefault();e.stopPropagation();remove.closest('.dynamic-row')?.remove()}})}

 // Visibility only: collapse does not clear inputs or modify saved records.
 function setupCollapsibleSections(form,mode){
  if(form.dataset.reportFoldWired==="1")return;
  const names=new Set(["Дополнительные работы","Сводка за день","Работники по должностям","Ответственные лица","Техника","Дополнительная информация"]);
  const sections=qa(".report-form-section",form).filter(s=>names.has(q(".rfs-head h2",s)?.textContent?.trim()||""));
  if(sections.length!==6)return;
  form.dataset.reportFoldWired="1";
  for(const section of sections){
   const head=q(".rfs-head",section),caption=q("h2",head)?.textContent||"раздел";
   const content=[...section.children].filter(node=>node!==head);
   const button=document.createElement("button");
   button.type="button";button.className="report-fold-toggle";
   button.setAttribute("aria-label","Свернуть или развернуть: "+caption);
   button.innerHTML='<span class="report-fold-chevron" aria-hidden="true">⌄</span>';
   const collapse=closed=>{
    section.classList.toggle("report-section-collapsed",closed);
    section.dataset.collapsed=closed?"1":"0";
    content.forEach(node=>node.hidden=closed);
    button.setAttribute("aria-expanded",String(!closed));
    button.title=(closed?"Развернуть: ":"Свернуть: ")+caption;
   };
   head.appendChild(button);
   button.addEventListener("click",()=>collapse(section.dataset.collapsed!=="1"));
   head.addEventListener("click",event=>{
    if(event.target.closest("button,a,input,select,textarea"))return;
    collapse(section.dataset.collapsed!=="1");
   });
   head.querySelectorAll("[data-add],[data-extra-add]").forEach(add=>
    add.addEventListener("click",()=>collapse(false),true));
   collapse(mode==="new");
  }
 }

 function paintAct(section,act){const name=q('.report-act-name',section),open=q('.report-act-open',section),remove=q('.report-act-remove',section);section.dataset.actPath=act?.path||"";section.dataset.actName=act?.name||"";if(name)name.textContent=act?.name||"Документ не прикреплён";const select=q(".report-act-select",section);if(select)select.textContent=act?.path?"Заменить":"Загрузить документ";if(open)open.hidden=!act?.path;if(remove)remove.hidden=!act?.path}
 function wireAct(section,initialAct){section.dataset.originalActPath=initialAct?.path||"";paintAct(section,initialAct);q('.report-act-select',section).onclick=async()=>{const file=await irProject.reportDocuments?.selectAct?.();if(!file)return;const current=section.dataset.actPath;if(current&&current!==section.dataset.originalActPath)await irProject.reportDocuments.remove(current).catch(()=>{});paintAct(section,file)};q('.report-act-open',section).onclick=()=>irProject.reportDocuments?.open?.(section.dataset.actPath);q('.report-act-remove',section).onclick=()=>paintAct(section,null)}
 async function enhanceForm(reportData){const r=route(),form=q('#dailyReportForm');if(!r||!["new","edit"].includes(r.mode)||!form||form.dataset.extraSections==='1'||(form.dataset.extraInlineSave==='1'&&!reportData))return;const sections=qa('.report-form-section',form),info=sections.find(s=>/Дополнительная информация/i.test(q('h2',s)?.textContent||""));if(!info)return;form.dataset.extraSections='1';if(!q('#irAdditionalUnits'))document.body.insertAdjacentHTML('beforeend','<datalist id="irAdditionalUnits"><option value="тн"><option value="кг"><option value="м2"><option value="м3"><option value="м"><option value="шт"><option value="ед."></datalist>');const data=reportData&&typeof reportData==='object'?reportData:await initial(r);if(!form.isConnected||route()?.oid!==r.oid||route()?.mode!==r.mode)return;
  const extra=document.createElement('section');extra.className='report-form-section report-additional-works-section';extra.innerHTML=`<div class="rfs-head"><span></span><div><h2>Дополнительные работы</h2><p>Работы вне основной ведомости марок</p></div><button type="button" class="rfs-add" data-extra-add>＋ Добавить работу</button></div><div class="rfs-body dynamic-list">${(arr(data.additional_works).length?arr(data.additional_works):[{}]).map((w,i)=>extraRow(r.mode==='new'?{...w,id:newExtraId(),signed_act:null}:w,r.rid,i)).join('')}</div><div class="report-act-box"><div><strong>Подтверждающий документ к ежедневному отчёту</strong><span class="report-act-name">Документ не прикреплён</span></div><div class="report-act-actions"><button type="button" class="report-act-select">Загрузить документ</button><button type="button" class="report-act-open" hidden>Открыть</button><button type="button" class="report-act-remove" hidden>Удалить</button></div></div>`;
  const summary=document.createElement('section');summary.className='report-form-section report-daily-summary-section';summary.innerHTML=`<div class="rfs-head"><span></span><div><h2>Сводка за день</h2><p>Краткие текстовые пункты за рабочий день</p></div><button type="button" class="rfs-add" data-extra-add>＋ Добавить пункт</button></div><div class="rfs-body dynamic-list">${(arr(data.daily_summary).length?arr(data.daily_summary):[{}]).map(summaryRow).join('')}</div>`;
  info.parentNode.insertBefore(extra,info);info.parentNode.insertBefore(summary,info);wireRows(extra,'extra');wireRows(summary,'summary');wireAct(extra,r.mode==='new'?null:data.signed_act||null);renumber(form);setupCollapsibleSections(form,r.mode);
  if(form.dataset.extraInlineSave!=='1')form.addEventListener('submit',()=>{if(!form.checkValidity())return;const c=collect(form),act=extra.dataset.actPath?{path:extra.dataset.actPath,name:extra.dataset.actName}:null,old=extra.dataset.originalActPath||"";sessionStorage.setItem(pendingKey(r.oid),JSON.stringify({...c,signed_act:act,delete_act:old&&old!==(act?.path||"")?old:"",targetId:r.rid||"",date:q('[name="date"]',form)?.value||""}))},true)
 }
 async function applyPending(){const r=route();if(!r||r.mode!=="view")return;const raw=sessionStorage.getItem(pendingKey(r.oid));if(!raw)return;let p;try{p=JSON.parse(raw)}catch{return sessionStorage.removeItem(pendingKey(r.oid))}const rec=await api(r.oid).get(r.rid).catch(()=>null);if(!rec)return;const d=rec.data||{};if(p.targetId&&String(p.targetId)!==String(r.rid))return;if(!p.targetId&&p.date&&String(d.date||d.report_date||"")!==String(p.date))return;await api(r.oid).update(r.rid,{record_type:rec.record_type||"item",title:rec.title||"",data:{...d,daily_summary:arr(p.daily_summary),additional_works:arr(p.additional_works),signed_act:p.signed_act||null}});if(p.delete_act)await irProject.reportDocuments?.remove?.(p.delete_act).catch(()=>{});sessionStorage.removeItem(pendingKey(r.oid))}
 function summaryHtml(items){const texts=arr(items).map(summaryText).map(x=>x.trim()).filter(Boolean);if(!texts.length)return"";return `<section class="rv-section rv-daily-summary-section"><div class="rv-section-title"><h2>Сводка за день</h2><span>${texts.length} пункт.</span></div><div class="rv-summary-text-list">${texts.map((text,i)=>`<div class="rv-summary-text-item"><span>${i+1}</span><p>${esc(text)}</p></div>`).join('')}</div></section>`}
 function extraHtml(items,act,oid,reportId){if(!items.length&&!act?.path)return"";return`<section class="rv-section rv-additional-works-section"><div class="rv-section-title"><h2>Дополнительные работы</h2><span>${items.length} поз.</span></div>${items.length?`<div class="rv-table-wrap"><table class="rv-work-table"><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед. измерения</th><th>Объём</th><th>Карточка</th></tr></thead><tbody>${items.map((x,i)=>`<tr><td><b>${esc(x.name||"—")}</b></td><td>${esc(x.qty||"—")}</td><td>${esc(x.unit||"—")}</td><td><b>${esc(x.volume||"—")}${x.unit?` ${esc(x.unit)}`:""}</b></td><td><a class="rv-extra-open" href="#/objects/object/${encodeURIComponent(oid)}/extra-works/${encodeURIComponent(extraId(x,reportId,i))}">Открыть →</a></td></tr>`).join('')}</tbody></table></div>`:""}${act?.path?`<div class="rv-act"><div><small>Приложение к отчёту</small><b>${esc(act.name||"Акт")}</b></div><button type="button" data-report-act-open="${esc(act.path)}">Открыть приложение</button></div>`:""}</section>`}
 async function enhanceView(){const r=route(),card=q('#rvCard');if(!r||r.mode!=="view"||!card||card.dataset.extraSections==='1')return;await applyPending();const rec=await api(r.oid).get(r.rid).catch(()=>null),d=rec?.data||{};card.dataset.extraSections='1';const works=q('.rv-works-section',card),note=q('.rv-note-section',card),photo=q('.rv-photo-section',card);const eh=extraHtml(arr(d.additional_works),d.signed_act,r.oid,r.rid),sh=summaryHtml(arr(d.daily_summary));if(eh&&works)works.insertAdjacentHTML('afterend',eh);if(sh)(note||photo)?.insertAdjacentHTML('beforebegin',sh);qa('[data-report-act-open]',card).forEach(b=>b.onclick=()=>irProject.reportDocuments?.open?.(b.dataset.reportActOpen))}
 function capture(form){
  const section=q('.report-additional-works-section',form);
  const rows=collect(form);
  const act=section?.dataset.actPath?{path:section.dataset.actPath,name:section.dataset.actName}:null;
  const old=section?.dataset.originalActPath||'';
  return{...rows,signed_act:act,delete_act:old&&old!==(act?.path||'')?old:''}
 }
 // Called directly from daily report rendering and saving; observer is only a fallback.
 window.irReportExtraSections={enhanceForm,capture,enhanceView};
 let busy=false;async function run(){if(busy)return;busy=true;try{await enhanceForm();await enhanceView()}finally{busy=false}}
 let timer=0;new MutationObserver(()=>{if(!route())return;clearTimeout(timer);timer=setTimeout(run,75)}).observe(q('#app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',()=>{clearTimeout(timer);if(route())timer=setTimeout(run,40)});run();
})();
;

/* #14: src/reports-list-layout.js */
"use strict";
(()=>{
 let running=false,lastKey="";
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const date=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:v};
 const windText=v=>{const s=String(v??"").trim();if(!s)return"";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 const peopleTotal=r=>{const workers=arr(r.workers).length?arr(r.workers):arr(r.people),responsible=arr(r.responsible).length?arr(r.responsible):arr(r.responsibles),workersCount=workers.reduce((s,x)=>s+num(x.count??x.qty),0),responsibleCount=responsible.reduce((s,x)=>{const explicit=num(x.count??x.qty);return s+(explicit>0?explicit:(String(x.name||x.role||"").trim()?1:0))},0);return workersCount+responsibleCount};
 const oid=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"";
 const icon=name=>{
  if(name==="equipment")return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="13" cy="51" r="6"/><circle cx="31" cy="51" r="6"/><circle cx="51" cy="51" r="6"/><path d="M5 45h48v6H5zM28 44V29l19-17 4 4-17 18v10M47 16h7v22M54 38v5"/><path d="M50 45a4 4 0 0 0 8 0M35 33h12l7 12H35zM38 36h6l4 7H38zM10 45V35h16v10"/></svg>';
  const icons={calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14l2 2 5-5"/>',user:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',image:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',edit:'<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',cloud:'<path d="M6 18h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>',rain:'<path d="M6 15h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 6 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',snow:'<path d="M6 14h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>',storm:'<path d="M6 14h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>',fog:'<path d="M4 8h16M2 12h20M5 16h14"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.cloud}</svg>`;
 };
 const weatherType=w=>({"Ясно":"sun","Облачно":"cloud","Дождь":"rain","Снег":"snow","Гроза":"storm","Туман":"fog"})[w]||"cloud";
 const reportData=r=>({id:String(r.id),...(r.data||{})});
 const groups=d=>{const types=new Map();for(const w of arr(d.items||d.works)){const type=w.work_type||"Работа",service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",plain=!service&&!String(w.mark_id||w.mark||"").trim();if(!types.has(type))types.set(type,new Map());const byCode=types.get(type);if(service){const key="__service__";if(!byCode.has(key))byCode.set(key,{service:true,completed:false});byCode.get(key).completed=byCode.get(key).completed||serviceDone(w);continue}if(plain){const unit=w.unit||"",key="__plain__|"+unit,value=num(w.volume)||num(w.qty)*num(w.unit_volume)||num(w.qty);if(!byCode.has(key))byCode.set(key,{plain:true,service:false,unit,volume:0});byCode.get(key).volume+=value;continue}const code=w.project_code||"Без шифра",unit=w.unit||"",key=code+"|"+unit;if(!byCode.has(key))byCode.set(key,{project_code:code,unit,volume:0,service:false,plain:false});byCode.get(key).volume+=num(w.volume)||num(w.qty)*num(w.unit_volume)}return [...types.entries()].map(([work_type,codes])=>({work_type,codes:[...codes.values()]}))};
 async function enhance(){if(running)return;const id=oid(),list=document.querySelector(".reports-list");if(!id||!list||!document.querySelector(".reports-page"))return;const key=id+":"+[...list.querySelectorAll(".report-row")].map(x=>x.dataset.reportId).join(",");if(key===lastKey&&[...list.querySelectorAll(".report-row")].every(x=>x.dataset.referenceLayout==="1"))return;running=true;try{const api=irProject.data.forObject(id).section("reports"),raw=await api.list().catch(()=>[]),map=new Map(raw.map(r=>[String(r.id),reportData(r)])),reportNo=new Map([...raw].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1]));for(const row of list.querySelectorAll(".report-row[data-report-id]")){const r=map.get(String(row.dataset.reportId));if(!r)continue;const people=peopleTotal(r),equipment=arr(r.equipment).reduce((s,x)=>s+num(x.count),0),photos=arr(r.photos||r.reportPhotos).length,w=typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather_text||"Не указана"),wind=windText(r.wind),workGroups=groups(r),defaultWorkHtml=workGroups.length?workGroups.map(g=>{const details=g.codes.map(c=>c.service?`<span>Услуга — ${c.completed?"✓ Выполнено":"Не выполнено"}</span>`:c.plain?(c.volume>0?`<span>${fmt(c.volume)} ${esc(c.unit)}</span>`:""):`<span>${esc(c.project_code)} — ${fmt(c.volume)} ${esc(c.unit)}</span>`).join(""),plainOnly=!details;return `<div class="reference-work-group ${plainOnly?"reference-work-group-plain":""}"><strong>${esc(g.work_type)}</strong>${details?`<div class="reference-work-codes">${details}</div>`:""}</div>`}).join('<div class="reference-work-separator" aria-hidden="true"></div>'):`<div class="reference-work-group"><strong>Работы не проводились</strong></div>`,activity=window.irReportActivityPreview?.(r),hasMeasured=workGroups.some(g=>g.codes.some(c=>!c.service&&Number(c.volume)>0)),workHtml=!hasMeasured&&activity?.kind!=="empty"?'<div class="reference-work-summary"><strong>'+esc(activity.label)+'</strong>'+activity.lines.slice(0,3).map(t=>'<span>'+esc(t)+'</span>').join("")+(activity.lines.length>3?'<small>+ ещё '+(activity.lines.length-3)+'</small>':"")+'</div>':defaultWorkHtml,wt=weatherType(w),no=reportNo.get(String(r.id))||1;row.classList.add("ir-reference-row");row.dataset.referenceLayout="1";row.innerHTML=`<div class="report-cell report-cell-date"><span class="report-list-icon">${icon("calendar")}</span><div><b>${date(r.date||r.report_date)}</b><small>Отчёт №${no}</small></div></div><div class="report-cell report-cell-people"><span class="report-list-icon">${icon("user")}</span><div><b>${fmt(people)}</b><small>чел.</small></div></div><div class="report-cell report-cell-equipment"><span class="report-list-icon">${icon("equipment")}</span><div><b>${fmt(equipment)}</b><small>ед. техники</small></div></div><div class="report-cell report-cell-photo"><span class="report-list-icon">${icon("image")}</span><div><b>${fmt(photos)}</b><small>фото</small></div></div><div class="report-cell report-cell-weather weather-${wt}"><span class="report-list-icon">${icon(wt)}</span><div><b>${esc(w)}</b>${wind?`<small>≈ ${esc(wind)}</small>`:"<small>—</small>"}</div></div><div class="report-cell report-cell-work">${workHtml}</div><div class="report-cell report-cell-actions">${window.irAccess&&window.irAccess.canEdit("reports")?`<div class="report-actions"><button type="button" data-ref-copy="${r.id}" title="Копировать">${icon("copy")}</button><button type="button" data-ref-edit="${r.id}" title="Редактировать">${icon("edit")}</button><button type="button" data-ref-delete="${r.id}" class="report-delete" title="Удалить">${icon("trash")}</button></div>`:""}</div>`;row.querySelector('[data-ref-edit]')?.addEventListener("click",e=>{e.stopPropagation();location.hash=`/objects/object/${id}/reports/${r.id}/edit`});row.querySelector('[data-ref-copy]')?.addEventListener("click",e=>{e.stopPropagation();sessionStorage.setItem(`ir-report-copy-${id}`,JSON.stringify(r));location.hash=`/objects/object/${id}/reports/new`});row.querySelector('[data-ref-delete]')?.addEventListener("click",async e=>{e.stopPropagation();if(!confirm(`Удалить ежедневный отчёт №${no}?`))return;await api.remove(r.id);if(window.irSyncMountedFromReports)await window.irSyncMountedFromReports(id);await window.irReportsPage(id)})}lastKey=key}catch(e){console.error("reports reference layout",e)}finally{running=false}}
 const mo=new MutationObserver(()=>setTimeout(enhance,0));mo.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener("hashchange",()=>{lastKey="";setTimeout(enhance,0)});setTimeout(enhance,0);
})();
;

/* #15: src/reports-no-flicker.js */
"use strict";
(()=>{
 const app=document.getElementById("app");if(!app)return;
 function sync(){
  document.querySelectorAll(".reports-page .reports-list").forEach(list=>{
   const rows=[...list.querySelectorAll(":scope > .report-row")];
   const ready=!rows.length||rows.every(r=>r.dataset.referenceLayout==="1"||r.classList.contains("ir-reference-row"));
   list.classList.toggle("reports-final-ready",ready);
  });
 }
 const mo=new MutationObserver(sync);
 mo.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:["class","data-reference-layout"]});
 window.addEventListener("hashchange",()=>requestAnimationFrame(sync));
 sync();
})();

;

/* #16: src/reports-pagination.js */
"use strict";
(()=>{
 const PAGE_SIZE=15;
 const pages=new Map();
 let timer=0;
 const objectKey=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"reports";
 const schedule=(delay=20)=>{clearTimeout(timer);timer=setTimeout(apply,delay)};
 function controls(list,total,page,totalPages){
  let bar=list.parentElement.querySelector(':scope > .reports-pagination');
  if(totalPages<=1){bar?.remove();return}
  if(!bar){bar=document.createElement('div');bar.className='reports-pagination';list.insertAdjacentElement('afterend',bar)}
  const start=(page-1)*PAGE_SIZE+1,end=Math.min(page*PAGE_SIZE,total),sig=`${total}:${page}:${totalPages}`;
  if(bar.dataset.sig===sig)return;
  bar.dataset.sig=sig;
  const nums=[];for(let p=1;p<=totalPages;p++){if(totalPages<=7||p===1||p===totalPages||Math.abs(p-page)<=1)nums.push(p);else if(nums[nums.length-1]!==0)nums.push(0)}
  bar.innerHTML=`<div class="reports-pagination-info">Показано ${start}–${end} из ${total}</div><div class="reports-pagination-buttons"><button type="button" data-page="prev" ${page===1?'disabled':''} aria-label="Предыдущая страница">←</button>${nums.map(p=>p===0?'<span class="reports-pagination-dots">…</span>':`<button type="button" data-page="${p}" class="${p===page?'active':''}">${p}</button>`).join('')}<button type="button" data-page="next" ${page===totalPages?'disabled':''} aria-label="Следующая страница">→</button></div>`;
  bar.querySelectorAll('button[data-page]').forEach(btn=>btn.onclick=()=>{const key=objectKey(),cur=pages.get(key)||1,v=btn.dataset.page;const next=v==='prev'?cur-1:v==='next'?cur+1:Number(v);pages.set(key,Math.max(1,Math.min(totalPages,next)));apply(true)});
 }
 function apply(fromClick=false){
  const list=document.querySelector('.reports-page .reports-list');if(!list)return;
  const rows=[...list.querySelectorAll(':scope > .report-row')],total=rows.length,key=objectKey();
  if(!total){list.parentElement.querySelector(':scope > .reports-pagination')?.remove();return}
  const totalPages=Math.ceil(total/PAGE_SIZE);let page=pages.get(key)||1;if(page>totalPages)page=totalPages;if(page<1)page=1;pages.set(key,page);
  rows.forEach((row,i)=>{const visible=totalPages<=1||Math.floor(i/PAGE_SIZE)+1===page;if(visible)row.style.removeProperty('display');else row.style.setProperty('display','none','important')});
  controls(list,total,page,totalPages);
  if(fromClick){document.querySelector('.reports-toolbar')?.scrollIntoView({block:'nearest'})}
 }
 document.addEventListener('input',e=>{if(e.target?.id==='reportsSearch'){pages.set(objectKey(),1);schedule(30)}},true);
 window.addEventListener('hashchange',()=>schedule(30));
 new MutationObserver(()=>schedule()).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 schedule(50);
})();
;

/* #17: src/report-form-tools.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 function closeMarks(except){qa(".mark-results").forEach(x=>{if(x!==except)x.hidden=true})}
 function syncMarkGate(row){const wt=q('[name="work_type_id"]',row),code=q('[name="project_code"]',row),search=q('[name="mark_search"]',row),box=q('.mark-results',row);if(!wt||!code||!search)return;const ready=Boolean(wt.value&&String(code.value||"").trim());search.disabled=!ready;search.placeholder=ready?"Поиск по марке или наименованию…":"Сначала выберите вид работы и шифр проекта";if(!ready){if(box)box.hidden=true;search.value="";const mid=q('[name="mark_id"]',row);if(mid)mid.value=""}}
 function workOptionLabels(row){const wt=q('[name="work_type_id"]',row);if(!wt)return;qa('option',wt).forEach(opt=>{if(!opt.value)return;const parts=String(opt.textContent||"").split(' · ');if(parts.length<3)return;const unit=parts.pop(),code=parts.pop(),name=parts.join(' · ').trim();opt.textContent=code?`${name} · ${code}`:name})}
 function volumeLabel(unit){const u=String(unit||"").trim(),kind=window.irMeasure?.meta?.(u)?.kind||"other",base=kind==="mass"?"Вес":kind==="area"?"Общая площадь":kind==="volume"?"Общий объём":kind==="length"?"Общая длина":kind==="count"?"Количество":"Объём";return u?`${base}, ${u}`:base}
 function syncVolumeLabel(row){const label=q('.rw-volume',row),unit=q('[name="unit"]',row)?.value||"";if(!label)return;const text=[...label.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue=volumeLabel(unit)}
 function lockCompletedMarks(row){const box=q('.mark-results',row);if(!box)return;qa('button[data-mid]',box).forEach(btn=>{const info=q('i',btn)?.textContent||"",m=info.match(/Ост\.\s*([-+]?\d+(?:[.,]\d+)?)/i);if(!m)return;const left=Number(m[1].replace(',','.'));if(Number.isFinite(left)&&left<=0){btn.disabled=true;btn.dataset.irComplete="1";btn.classList.remove('mark-result-left','mark-result-partial');btn.classList.add('mark-result-done');btn.title='Марка смонтирована на 100% и больше недоступна для выбора'}})}
 function polishRow(row){workOptionLabels(row);syncVolumeLabel(row);lockCompletedMarks(row)}
 async function copyWorkRow(src){const add=q('[data-add="works"]');if(!add)return;const wt=q('[name="work_type_id"]',src)?.value||"",mid=q('[name="mark_id"]',src)?.value||"",qty=q('[name="qty"]',src)?.value||"",serviceCompleted=q('[name="service_completed"]',src)?.value||"1";add.click();await sleep(0);const rows=qa('.work-row'),dst=rows[rows.length-1];if(!dst||dst===src)return;const dwt=q('[name="work_type_id"]',dst);if(dwt){dwt.value=wt;dwt.dispatchEvent(new Event("change",{bubbles:true}))}await sleep(0);syncMarkGate(dst);polishRow(dst);if(mid){const search=q('[name="mark_search"]',dst),box=q('.mark-results',dst);if(search&&!search.disabled){search.focus();await sleep(0);lockCompletedMarks(dst);const btn=box?.querySelector(`[data-mid="${CSS.escape(mid)}"]`);if(btn&&!btn.disabled)btn.click()}}const dqty=q('[name="qty"]',dst);if(dqty){dqty.value=qty;dqty.dispatchEvent(new Event("input",{bubbles:true}))}const dservice=q('[name="service_completed"]',dst);if(dservice)dservice.value=serviceCompleted}
 function normalizeWind(form){const input=q('[name="wind"]',form);if(!input||input.dataset.windReady)return;input.dataset.windReady="1";input.value=String(input.value||"").replace(/\s*(?:м\s*\/\s*с|m\s*\/\s*s)\s*$/i,"").trim();input.placeholder="Например: 5";input.inputMode="decimal";const label=input.closest('label'),text=label&&[...label.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue="Ветер, м/с"}
 function enhance(form){normalizeWind(form);const worksSection=qa('.report-form-section',form).find(s=>q('h2',s)?.textContent.trim()==='Выполненные работы'),hint=worksSection&&q('.rfs-head p',worksSection);if(hint)hint.textContent='Монтаж и изготовление — по маркам; другие работы — по объёму; услуги — выполнено / не выполнено';qa('.work-row',form).forEach(row=>{polishRow(row);if(row.dataset.irTools)return;row.dataset.irTools="1";syncMarkGate(row);const wt=q('[name="work_type_id"]',row),search=q('[name="mark_search"]',row),box=q('.mark-results',row);wt?.addEventListener("change",()=>setTimeout(()=>{syncMarkGate(row);polishRow(row)},0));if(search&&box){search.addEventListener("pointerdown",()=>{search.dataset.wasOpen=box.hidden?"0":"1"});search.addEventListener("click",e=>{if(search.disabled)return;if(search.dataset.wasOpen==="1"){box.hidden=true;e.stopPropagation()}})}const remove=q('.row-remove',row);if(remove&&!q('.work-copy',row)){const b=document.createElement('button');b.type='button';b.className='work-copy';b.title='Копировать выполненную работу';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';b.onclick=()=>copyWorkRow(row);remove.insertAdjacentElement('beforebegin',b)}})}
 function run(){const form=q('#dailyReportForm');if(form)enhance(form)}
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.mark-picker'))closeMarks()},true);document.addEventListener('click',e=>{if(e.target.closest('.mark-result-done[disabled],[data-ir-complete="1"]')){e.preventDefault();e.stopImmediatePropagation()}},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMarks()});
 let t=0;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,0)}).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',()=>setTimeout(run,0));run();
})();
;

/* #18: src/report-photo-manager.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
 const oid=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"";
 const pendingDeleteKey=id=>`ir-report-photo-delete-${id}`;
 const added=new Set(),deleted=new Set();
 const trashIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
 async function paint(slot,path,index){slot.dataset.photoPath=path||"";slot.innerHTML="";if(!path){slot.classList.remove("has-photo");slot.innerHTML=`<b>＋</b><span>Фото ${index+1}</span>`;return}const src=await irProject.images.read(path).catch(()=>"");if(!src){slot.classList.remove("has-photo");slot.innerHTML=`<b>＋</b><span>Фото ${index+1}</span>`;slot.dataset.photoPath="";return}slot.classList.add("has-photo");slot.innerHTML=`<img src="${src}" alt="Фото ${index+1}"><span>Фото ${index+1}</span><button type="button" class="report-photo-remove" title="Удалить фото" aria-label="Удалить фото">${trashIcon}</button>`;slot.querySelector(".report-photo-remove").onclick=async e=>{e.stopPropagation();const old=slot.dataset.photoPath||"";if(!old)return;if(added.has(old)){added.delete(old);await irProject.reportPhotos?.remove?.(old).catch(()=>{})}else deleted.add(old);await paint(slot,"",index)}}
 async function choose(slot,index){if(slot.dataset.photoPath)return;const path=await (irProject.reportPhotos?.selectImage?.()||irProject.objects.selectImage());if(!path)return;added.add(path);await paint(slot,path,index)}
 async function wireSlots(){const form=q("#dailyReportForm"),grid=q(".report-photo-grid",form||document);if(!form||!grid)return;const slots=qa(".report-photo-slot",grid);if(!slots.length)return;for(let i=0;i<slots.length;i++){const slot=slots[i],path=slot.dataset.photoPath||"";if(path&&!slot.querySelector(".report-photo-remove"))await paint(slot,path,i);slot.onclick=e=>{if(e.target.closest(".report-photo-remove"))return;choose(slot,i)}}if(form.dataset.photoManagerSubmit!=="1"){form.dataset.photoManagerSubmit="1";form.addEventListener("submit",()=>{const id=oid();if(id&&deleted.size)sessionStorage.setItem(pendingDeleteKey(id),JSON.stringify([...deleted]))},true)}}
 async function commitDeletes(){const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)$/);if(!m)return;const key=pendingDeleteKey(m[1]),raw=sessionStorage.getItem(key);if(!raw)return;sessionStorage.removeItem(key);let files=[];try{files=JSON.parse(raw)||[]}catch{}for(const file of files)await irProject.reportPhotos?.remove?.(file).catch(()=>{});deleted.clear();added.clear()}
 let timer=0;function schedule(){clearTimeout(timer);timer=setTimeout(()=>{wireSlots();commitDeletes()},220);setTimeout(wireSlots,700);setTimeout(wireSlots,1200)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();new MutationObserver(schedule).observe(document.getElementById("app")||document.body,{subtree:true,childList:true});window.addEventListener("hashchange",schedule);
})();
;

/* #19: src/report-mounted-sync.js */
"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 async function syncMounted(oid){
  oid=String(oid||"");if(!oid)throw Error("Не указан объект для сверки ведомости.");
  const root=irProject.data.forObject(oid),reportsApi=root.section("reports"),marksApi=root.section("marks");
  // Ошибка чтения не должна превращаться в пустой список: иначе можно обнулить монтаж.
  const [reports,marks]=await Promise.all([reportsApi.list(),marksApi.list()]);
  if(!Array.isArray(reports)||!Array.isArray(marks))throw Error("Не удалось получить отчёты или ведомость марок.");
  const mounted=Object.create(null),ids=new Set(marks.map(m=>String(m.id)));
  let workLines=0,linkedLines=0,withoutMarkId=0;
  for(const report of reports){
   const d=report.data||report,works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
   for(const w of works){
    workLines++;
    if(w?.accounting_type==="service"||w?.is_service===true)continue;
    const id=String(w?.mark_id??w?.markId??"").trim();
    if(!id){if(w?.mark||w?.mark_name||w?.markName)withoutMarkId++;continue}
    const qty=Math.max(0,num(w.qty??w.count??w.quantity));
    mounted[id]=(mounted[id]||0)+qty;linkedLines++
   }
  }
  const updates=[];
  for(const m of marks){
   const d=m.data||{},total=Math.max(0,num(d.qty??d.count)),next=Math.max(0,Math.min(total,mounted[String(m.id)]||0)),current=num(d.mounted??d.done);
   if(Math.abs(next-current)<1e-9)continue;
   updates.push({m,data:d,next,before:current})
  }
  const changedMarks=[];
  for(const item of updates){
   const {m,data,next,before}=item;
   await marksApi.update(m.id,{record_type:m.record_type||"item",title:m.title||data.mark||"",data:{...data,mounted:next}});
   changedMarks.push({id:String(m.id),mark:String(data.mark||m.title||m.id),before,after:next})
  }
  const unrecognizedIds=Object.keys(mounted).filter(id=>!ids.has(id));
  return{reportsChecked:reports.length,workLines,linkedLines,withoutMarkId,unrecognizedIds,marksChecked:marks.length,updated:changedMarks.length,changedMarks}
 }
 window.irSyncMountedFromReports=syncMounted;
 const original=window.irMarksPage;
 if(typeof original==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return original(oid)};
})();

;

/* #20: src/measurement-ui.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],meta=u=>window.irMeasure?.meta?.(u)||{totalLabel:"Общий объём",itemLabel:"Объём 1 ед."};
 function unitFromActiveMarks(){const card=q('.marks-work-card.on');if(!card)return"";if(card.dataset.work==="all"){const units=qa('.marks-work-card:not([data-work="all"]) .mwc-meta').map(x=>(x.textContent.split('·').pop()||'').trim()).filter(Boolean);const uniq=[...new Set(units)];return uniq.length===1?uniq[0]:""}return(card.querySelector('.mwc-meta')?.textContent.split('·').pop()||'').trim()}
 function directText(label){return[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()}
 function textBeforeInput(label,text){if(!label||directText(label)===text)return false;for(const n of [...label.childNodes])if(n.nodeType===3)n.remove();label.insertBefore(document.createTextNode(text),label.firstChild);return true}
 function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
 function apply(){
  const marks=q('.marks-page');if(marks){const unit=unitFromActiveMarks(),m=meta(unit),heads=qa('.marks-head>span',marks);setText(heads[3],unit?m.itemLabel:'Объём / вес 1 ед.');setText(heads[4],unit?m.totalLabel:'Общий объём / вес');const ed=q('#markEditForm',marks),active=q('.marks-work-card.on',marks);if(ed&&active&&unit)textBeforeInput(ed.querySelector('label:nth-of-type(4)'),m.itemLabel)}
  qa('.work-row').forEach(row=>{const unit=q('[name="unit"]',row)?.value||'',label=q('.rw-volume',row);if(label&&unit)textBeforeInput(label,meta(unit).totalLabel.replace('Общий ','')||'Объём')});
 }
 let t=0;const schedule=()=>{clearTimeout(t);t=setTimeout(apply,30)};new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});document.addEventListener('change',schedule,true);window.addEventListener('hashchange',schedule);schedule();
})();

;

;
/* #21: src/wind-units.js */
"use strict";
(()=>{
 const unit=v=>{const s=String(v??"").trim();if(!s)return"";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 function apply(){const el=document.querySelector('.rv-summary-weather em');if(!el||el.dataset.windUnitReady==='1')return;const t=el.textContent.trim();if(/^Ветер:\s*/i.test(t)&&!/не указан/i.test(t)){el.textContent=`Ветер: ${unit(t.replace(/^Ветер:\s*/i,""))}`;el.dataset.windUnitReady='1'}}
 let timer=0;const schedule=()=>{clearTimeout(timer);timer=setTimeout(apply,20)};new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',schedule);schedule();
})();
;

/* #22: src/reports-view-weather-fix.js */
"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const fmt=v=>{const n=num(v);if(n===null)return"";return String(Number(n.toFixed(1))).replace(".",",")};
 const tempText=v=>{const n=num(v);return n===null?"":`${n>0?"+":""}${fmt(n)}°C`};
 const dataOf=r=>({id:String(r.id),...(r.data||{})});
 async function refs(oid){const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);return{reports:reports.map(dataOf),workTypes:workTypes.map(r=>({id:String(r.id),...(r.data||{}),title:r.title||""}))}}
 function findWorkType(work,types){const id=String(work?.work_type_id||"");if(id){const byId=types.find(x=>x.id===id);if(byId)return byId}const code=norm(work?.project_code||work?.code),name=norm(work?.work_type||work?.type);return types.find(x=>norm(x.project_code)===code&&(!name||norm(x.work_type||x.title)===name))||types.find(x=>name&&norm(x.work_type||x.title)===name)||types.find(x=>code&&norm(x.project_code)===code)||null}
 async function fixView(oid,reportId){const table=document.querySelector(".rv-work-table tbody");if(!table)return false;const {reports,workTypes}=await refs(oid),report=reports.find(x=>x.id===String(reportId));if(!report)return false;const works=arr(report.items||report.works),trs=[...table.querySelectorAll("tr")];trs.forEach((tr,i)=>{const w=works[i];if(!w)return;const wt=findWorkType(w,workTypes),secondary=String(w.project_code_2||w.secondary_project_code||w.code_2||wt?.project_code_2||wt?.secondary_project_code||wt?.code_2||"").trim();if(!secondary)return;const cell=tr.children[1];if(!cell)return;let small=cell.querySelector(".rv-project-code-2");if(!small){small=document.createElement("small");small.className="rv-project-code-2";cell.appendChild(small)}small.textContent=`Доп. шифр: ${secondary}`});return true}
 async function fixList(oid){const rows=[...document.querySelectorAll(".report-row[data-report-id]")];if(!rows.length)return false;const {reports}=await refs(oid),map=new Map(reports.map(r=>[r.id,r]));rows.forEach(row=>{const r=map.get(String(row.dataset.reportId));if(!r)return;const t=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp,txt=tempText(t),b=row.querySelector(".report-cell-weather b");if(!b)return;let s=b.querySelector(".report-list-temperature");if(!txt){s?.remove();return}if(!s){s=document.createElement("strong");s.className="report-list-temperature";b.appendChild(s)}s.textContent=txt});return true}
 async function apply(oid,route){if(route?.mode==="view"&&route.reportId){for(const ms of [0,30,100])setTimeout(()=>fixView(oid,String(route.reportId)),ms);return}if(!route?.mode){for(const ms of [0,40,120])setTimeout(()=>fixList(oid),ms)}}
 window.irReportsPage=async(oid,route={})=>{const out=await base(oid,route);apply(oid,route);return out};
})();

;

/* #23: src/report-photos-sync.js */
"use strict";
(()=>{
 const base=window.irReportsPage;
 if(typeof base!=="function")return;
 const arr=v=>Array.isArray(v)?v:[];
 const pendingKey=oid=>`ir-report-photos-sync-${oid}`;
 const api=oid=>irProject.data.forObject(oid).section("reports");
 const uniq=a=>[...new Set(arr(a).map(x=>String(x||"").trim()).filter(Boolean))].slice(0,12);
 const collect=()=>uniq([...document.querySelectorAll("#dailyReportForm .report-photo-slot")].map(x=>x.dataset.photoPath||""));
 async function paintSeed(slot,path,index){
  slot.dataset.photoPath=path||"";
  if(!path)return;
  const src=await irProject.images.read(path).catch(()=>"");
  if(!src)return;
  slot.classList.add("has-photo");
  slot.innerHTML=`<img src="${src}" alt="Фото ${index+1}"><span>Фото ${index+1}</span>`;
 }
 async function seedForm(photos){
  const form=document.getElementById("dailyReportForm");
  if(!form||form.dataset.photoSyncSeeded==="1")return;
  form.dataset.photoSyncSeeded="1";
  const slots=[...form.querySelectorAll(".report-photo-slot")],list=uniq(photos);
  for(let i=0;i<slots.length;i++)if(list[i])await paintSeed(slots[i],list[i],i);
 }
 function wireSubmit(oid,route){
  const form=document.getElementById("dailyReportForm");
  if(!form||form.dataset.photoSyncSubmit==="1")return;
  form.dataset.photoSyncSubmit="1";
  form.addEventListener("submit",()=>{
   const date=form.querySelector('[name="date"]')?.value||"";
   sessionStorage.setItem(pendingKey(oid),JSON.stringify({targetId:route?.mode==="edit"?String(route.reportId||""):"",date,photos:collect()}));
  },true);
  const clear=()=>sessionStorage.removeItem(pendingKey(oid));
  document.getElementById("reportCancel")?.addEventListener("click",clear,{once:true});
  document.getElementById("reportFormBack")?.addEventListener("click",clear,{once:true});
 }
 async function applyPending(oid,rid){
  const raw=sessionStorage.getItem(pendingKey(oid));
  if(!raw)return;
  let p;try{p=JSON.parse(raw)||{}}catch{return sessionStorage.removeItem(pendingKey(oid))}
  const rec=await api(oid).get(rid).catch(()=>null);
  if(!rec)return;
  const d=rec.data||{};
  if(p.targetId&&String(p.targetId)!==String(rid))return;
  if(!p.targetId&&p.date&&String(d.date||d.report_date||"").slice(0,10)!==String(p.date).slice(0,10))return;
  const next=uniq(p.photos),prev=uniq(d.photos);
  if(JSON.stringify(next)!==JSON.stringify(prev))await api(oid).update(rid,{record_type:rec.record_type||"item",title:rec.title||"",data:{...d,photos:next}});
  sessionStorage.removeItem(pendingKey(oid));
 }
 window.irReportsPage=async(oid,route={})=>{
  let initialPhotos=[];
  if(route?.mode==="view"&&route.reportId)await applyPending(oid,String(route.reportId));
  if(route?.mode==="edit"&&route.reportId){const rec=await api(oid).get(String(route.reportId)).catch(()=>null);initialPhotos=arr(rec?.data?.photos)}
  if(route?.mode==="new"){
   try{const copy=JSON.parse(sessionStorage.getItem(`ir-report-copy-${oid}`)||"null")||{};initialPhotos=arr(copy?.data?.photos||copy?.photos)}catch{}
  }
  const result=await base(oid,route);
  if(route?.mode==="new"||route?.mode==="edit"){
   await seedForm(initialPhotos);
   wireSubmit(oid,route);
  }
  return result;
 };
})();

;

/* #24: src/acted-days-page.js */
"use strict";
window.irActedDaysPage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("acted-days"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("acted-days"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const reasons=[
  ["wind","Ветер"],
  ["power","Отключение электроэнергии"],
  ["readiness","Отсутствие стройготовности"],
  ["low_temp","Низкая температура (например, −40 °C)"],
  ["high_temp","Повышенная температура (например, +40 °C)"],
  ["precipitation","Сильные осадки"],
  ["other","Другая причина"]
 ];
 const reasonText=(code,other="")=>code==="other"?(String(other||"").trim()||"Другая причина"):(reasons.find(x=>x[0]===code)?.[1]||code||"—");
 const dmy=v=>{const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return`${d}.${m}.${y}`};
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const duration=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=h=>{const n=Math.round(Number(h||0)*100)/100;return String(n).replace(".",",")+" ч"};
 let rows=await api.list().catch(()=>[]);
 const data=r=>({id:r.id,title:r.title||"",...(r.data||{})});
 const sorted=()=>rows.map(data).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 function dialogHtml(){if(!canEdit())return"";return `<dialog id="actedDialog" class="acted-dialog"><form id="actedForm" novalidate><input type="hidden" name="id"><div class="acted-form-head"><div><h2 id="actedFormTitle">Добавить актированный день</h2><p>Дата, причина и время остановки работ</p></div><button type="button" id="actedX" class="acted-x">×</button></div><label>Дата<input type="date" name="date" required></label><label>Причина актирования<select name="reason" required>${reasons.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join("")}</select></label><label data-other-reason hidden>Другая причина<input name="reason_other" placeholder="Укажите причину актирования"></label><label>Показатель<input name="indicator" placeholder="Например: 22 м/с"></label><div class="acted-time-grid"><label>Время с<input type="time" name="time_from" value="08:00" required></label><label>Время по<input type="time" name="time_to" value="17:00" required></label></div><div class="acted-form-error" id="actedError" hidden></div><div class="actions"><button type="button" id="actedCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function draw(){
  const all=sorted(),uniqueDays=new Set(all.map(x=>x.date).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+duration(x.time_from,x.time_to),0),latest=all[0]?.date||"";
  const body=all.length?all.map(r=>`<div class="acted-row" data-id="${esc(r.id)}"><div><span>Дата</span><b>${dmy(r.date)}</b></div><div class="acted-reason"><span>Причина</span><b>${esc(reasonText(r.reason,r.reason_other))}</b></div><div class="acted-indicator"><span>Показатель</span><b>${esc(r.indicator||"—")}</b></div><div><span>Время актирования</span><b>${esc(r.time_from||"—")} — ${esc(r.time_to||"—")}</b></div><div><span>Продолжительность</span><b>${fmtHours(duration(r.time_from,r.time_to))}</b></div>${canEdit()?`<div class="acted-actions"><button type="button" data-edit="${esc(r.id)}">Редактировать</button><button type="button" class="danger" data-delete="${esc(r.id)}">Удалить</button></div>`:"<div></div>"}</div>`).join(""):'<div class="acted-empty">Актированные дни пока не добавлены</div>';
  app.innerHTML=`<div class="acted-days-page"><div class="acted-head"><button class="back" id="actedBack">← Назад</button><div><h1>Актированные дни</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="primary" id="actedAdd">＋ Добавить актированный день</button>':""}</div><div class="acted-summary"><div><span>Записей</span><b>${all.length}</b></div><div><span>Актированных дней</span><b>${uniqueDays}</b></div><div><span>Всего времени</span><b>${fmtHours(totalHours)}</b></div><div><span>Последняя дата</span><b>${latest?dmy(latest):"—"}</b></div></div><div class="acted-card"><div class="acted-table-head"><span>Дата</span><span>Причина актирования</span><span>Показатель</span><span>Время актирования</span><span>Продолжительность</span><span></span></div><div class="acted-list">${body}</div></div>${dialogHtml()}</div>`;
  document.getElementById("actedBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())wireForm(all);
 }
 function wireForm(all){
  const dialog=document.getElementById("actedDialog"),form=document.getElementById("actedForm"),otherWrap=form.querySelector("[data-other-reason]"),error=document.getElementById("actedError"),reason=form.elements.reason;
  const prettySelect=select=>{select.classList.add("ir-pretty-native");const box=document.createElement("div");box.className="ir-pretty-select";const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-pretty-trigger";const menu=document.createElement("div");menu.className="ir-pretty-menu";menu.hidden=true;box.append(trigger,menu);select.insertAdjacentElement("afterend",box);const close=()=>{menu.hidden=true;box.classList.remove("open","open-up");trigger.setAttribute("aria-expanded","false")};const refresh=()=>{const current=select.options[select.selectedIndex];trigger.innerHTML=`<span>${esc(current?.textContent||"Выберите")}</span><i></i>`;menu.innerHTML=[...select.options].map(o=>`<button type="button" data-value="${esc(o.value)}" class="${o.selected?"selected":""}" ${o.disabled?"disabled":""}>${esc(o.textContent)}</button>`).join("")};const openMenu=()=>{refresh();menu.hidden=false;box.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>{const r=trigger.getBoundingClientRect(),need=Math.min(menu.scrollHeight,280)+10,below=window.innerHeight-r.bottom;box.classList.toggle("open-up",below<need&&r.top>below)})};trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?openMenu():close()};menu.onclick=e=>{const b=e.target.closest("button[data-value]");if(!b||b.disabled)return;e.preventDefault();select.value=b.dataset.value;select.dispatchEvent(new Event("change",{bubbles:true}));refresh();close()};box.onclick=e=>e.stopPropagation();refresh();return{refresh,close}};
  const reasonPretty=prettySelect(reason);dialog.addEventListener("click",e=>{if(!e.target.closest(".ir-pretty-select"))reasonPretty.close()});
  const syncReason=()=>{const other=reason.value==="other";otherWrap.hidden=!other;form.elements.reason_other.required=other;if(!other)form.elements.reason_other.value="";const hints={wind:"Например: 22 м/с",low_temp:"Например: -30 °C",high_temp:"Например: +40 °C",precipitation:"Например: 20 мм",power:"Например: 380 В отсутствует",readiness:"Например: 0% готовности",other:"Введите показатель"};form.elements.indicator.placeholder=hints[reason.value]||"Введите показатель";reasonPretty.refresh()};
  const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.date.value=r?.date||new Date().toISOString().slice(0,10);form.elements.reason.value=r?.reason||"wind";form.elements.reason_other.value=r?.reason_other||"";form.elements.indicator.value=r?.indicator||"";form.elements.time_from.value=r?.time_from||"08:00";form.elements.time_to.value=r?.time_to||"17:00";syncReason();document.getElementById("actedFormTitle").textContent=r?"Редактировать актированный день":"Добавить актированный день";dialog.showModal()};
  reason.onchange=syncReason;document.getElementById("actedAdd").onclick=()=>open(null);document.getElementById("actedX").onclick=()=>dialog.close();document.getElementById("actedCancel").onclick=()=>dialog.close();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(all.find(r=>String(r.id)===String(b.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=all.find(x=>String(x.id)===String(b.dataset.delete));if(!r||!confirm(`Удалить актирование за ${dmy(r.date)}?`))return;await api.remove(r.id);rows=await api.list().catch(()=>[]);draw()});
  form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),date=String(fd.get("date")||""),reasonCode=String(fd.get("reason")||""),other=String(fd.get("reason_other")||"").trim(),indicator=String(fd.get("indicator")||"").trim(),from=String(fd.get("time_from")||""),to=String(fd.get("time_to")||"");if(!date||!reasonCode||!from||!to){error.textContent="Заполните дату, причину и время актирования.";error.hidden=false;return}if(reasonCode==="other"&&!other){error.textContent="Укажите другую причину актирования.";error.hidden=false;return}if(mins(to)<=mins(from)){error.textContent="Время окончания должно быть позже времени начала.";error.hidden=false;return}const payload={record_type:"acted_day",title:`Актированный день ${dmy(date)}`,data:{date,reason:reasonCode,reason_other:reasonCode==="other"?other:"",indicator,time_from:from,time_to:to}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list().catch(()=>[]);dialog.close();draw()};
 }
 draw();
};
;

/* #25: src/acted-days-page-v2.js */
"use strict";
window.irActedDaysPageV2=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("acted-days"),reportsApi=root.section("reports"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("acted-days"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const reasons=[
  ["wind","Ветер"],
  ["power","Отключение электроэнергии"],
  ["readiness","Отсутствие стройготовности"],
  ["low_temp","Низкая температура (например, −40 °C)"],
  ["high_temp","Повышенная температура (например, +40 °C)"],
  ["precipitation","Сильные осадки"],
  ["other","Другая причина"]
 ];
 const reasonText=(code,other="")=>code==="other"?(String(other||"").trim()||"Другая причина"):(reasons.find(x=>x[0]===code)?.[1]||code||"—");
 const dmy=v=>{const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return`${d}.${m}.${y}`};
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const duration=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=h=>{const n=Math.round(Number(h||0)*100)/100;return String(n).replace(".",",")+" ч"};
 let [rows,reportRows]=await Promise.all([api.list().catch(()=>[]),reportsApi.list().catch(()=>[])]);
 const data=r=>({id:r.id,title:r.title||"",...(r.data||{})});
 const sorted=()=>rows.map(data).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 const isoDate=v=>{const s=String(v||"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:""};
 const monthNames=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
 const weekdays=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
 const reportData=r=>({id:r.id,...(r.data||r)});
 const reportWorkDates=()=>new Set(reportRows.map(reportData).filter(r=>{const items=Array.isArray(r.items)?r.items:Array.isArray(r.works)?r.works:[];return items.length>0}).map(r=>isoDate(r.date||r.report_date)).filter(Boolean));
 const calendarHtml=all=>{const workDates=reportWorkDates(),actedDates=new Set(all.map(r=>isoDate(r.date)).filter(Boolean)),months=[...new Set([...workDates,...actedDates].map(d=>d.slice(0,7)))].sort();if(!months.length)return'<section class="acted-calendar-section"><div class="acted-calendar-head"><div><h2>Календарь работ</h2><p>Рабочие и актированные дни по месяцам</p></div></div><div class="acted-calendar-empty">Пока нет дат для отображения</div></section>';const cards=months.map(key=>{const[y,m]=key.split("-").map(Number),first=new Date(Date.UTC(y,m-1,1)),days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;let cells="";for(let i=0;i<offset;i++)cells+='<div class="acted-cal-day empty"></div>';let workCount=0,actedCount=0;for(let d=1;d<=days;d++){const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,work=workDates.has(iso),acted=actedDates.has(iso);if(work)workCount++;if(acted)actedCount++;const actRows=acted?all.filter(r=>isoDate(r.date)===iso):[],tip=[work?"Работы выполнялись":"",...actRows.map(r=>`${reasonText(r.reason,r.reason_other)}${r.indicator?" · "+r.indicator:""}${r.time_from&&r.time_to?" · "+r.time_from+"–"+r.time_to:""}`)].filter(Boolean).join(" | ");cells+=`<div class="acted-cal-day${work?" work":""}${acted?" acted":""}" title="${esc(tip)}"><b>${d}</b>${work?'<i class="work-dot"></i>':""}${acted?'<i class="acted-dot"></i>':""}</div>`}let totalCells=offset+days;while(totalCells%7!==0){cells+='<div class="acted-cal-day empty"></div>';totalCells++;}return`<article class="acted-calendar-month"><div class="acted-calendar-month-head"><div><b>${monthNames[m-1]}</b><span>${y}</span></div><small>Работы: ${workCount} · Акт.: ${actedCount}</small></div><div class="acted-calendar-weekdays">${weekdays.map(x=>`<span>${x}</span>`).join("")}</div><div class="acted-calendar-days">${cells}</div></article>`}).join("");return`<section class="acted-calendar-section"><div class="acted-calendar-head"><div><h2>Календарь работ и актированных дней</h2><p>По месяцам, в которых есть ежедневные отчёты или актирование</p></div><div class="acted-calendar-legend"><span><i class="work"></i>Работы</span><span><i class="acted"></i>Актированный день</span></div></div><div class="acted-calendar-grid">${cards}</div></section>`};
 function dialogHtml(){if(!canEdit())return"";return `<dialog id="actedDialog" class="acted-dialog"><form id="actedForm" novalidate><input type="hidden" name="id"><div class="acted-form-head"><div><h2 id="actedFormTitle">Добавить актированный день</h2><p>Дата, причина, показатель и время остановки работ</p></div><button type="button" id="actedX" class="acted-x">×</button></div><label>Дата<input type="date" name="date" required></label><label>Причина актирования<select name="reason" required>${reasons.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join("")}</select></label><label data-other-reason hidden>Другая причина<input name="reason_other" placeholder="Укажите причину актирования"></label><label>Показатель<input name="indicator" placeholder="Например: 22 м/с"></label><div class="acted-time-grid"><label>Время с<input type="time" name="time_from" value="08:00" required></label><label>Время по<input type="time" name="time_to" value="17:00" required></label></div><div class="acted-form-error" id="actedError" hidden></div><div class="actions"><button type="button" id="actedCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function draw(){
  const all=sorted(),uniqueDays=new Set(all.map(x=>x.date).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+duration(x.time_from,x.time_to),0),latest=all[0]?.date||"";
  const body=all.length?all.map(r=>`<div class="acted-row" data-id="${esc(r.id)}"><div><span>Дата</span><b>${dmy(r.date)}</b></div><div class="acted-reason"><span>Причина</span><b>${esc(reasonText(r.reason,r.reason_other))}</b></div><div class="acted-indicator"><span>Показатель</span><b>${esc(r.indicator||"—")}</b></div><div><span>Время актирования</span><b>${esc(r.time_from||"—")} — ${esc(r.time_to||"—")}</b></div><div><span>Продолжительность</span><b>${fmtHours(duration(r.time_from,r.time_to))}</b></div>${canEdit()?`<div class="acted-actions"><button type="button" data-edit="${esc(r.id)}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" class="acted-delete" data-delete="${esc(r.id)}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`).join(""):'<div class="acted-empty">Актированные дни пока не добавлены</div>';
  app.innerHTML=`<div class="acted-days-page"><div class="acted-head"><button class="back" id="actedBack">← Назад</button><div><h1>Актированные дни</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="primary" id="actedAdd">＋ Добавить актированный день</button>':""}</div><div class="acted-summary"><div><span>Записей</span><b>${all.length}</b></div><div><span>Актированных дней</span><b>${uniqueDays}</b></div><div><span>Всего времени</span><b>${fmtHours(totalHours)}</b></div><div><span>Последняя дата</span><b>${latest?dmy(latest):"—"}</b></div></div>${calendarHtml(all)}<div class="acted-card"><div class="acted-table-head"><span>Дата</span><span>Причина актирования</span><span>Показатель</span><span>Время актирования</span><span>Продолжительность</span><span></span></div><div class="acted-list">${body}</div></div>${dialogHtml()}</div>`;
  document.getElementById("actedBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())wireForm(all);
 }
 function wireForm(all){
  const dialog=document.getElementById("actedDialog"),form=document.getElementById("actedForm"),otherWrap=form.querySelector("[data-other-reason]"),error=document.getElementById("actedError"),reason=form.elements.reason;
  const prettySelect=select=>{select.classList.add("ir-pretty-native");const box=document.createElement("div");box.className="ir-pretty-select";const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-pretty-trigger";const menu=document.createElement("div");menu.className="ir-pretty-menu";menu.hidden=true;box.append(trigger,menu);select.insertAdjacentElement("afterend",box);const close=()=>{menu.hidden=true;box.classList.remove("open","open-up");trigger.setAttribute("aria-expanded","false")};const refresh=()=>{const current=select.options[select.selectedIndex];trigger.innerHTML=`<span>${esc(current?.textContent||"Выберите")}</span><i></i>`;menu.innerHTML=[...select.options].map(o=>`<button type="button" data-value="${esc(o.value)}" class="${o.selected?"selected":""}" ${o.disabled?"disabled":""}>${esc(o.textContent)}</button>`).join("")};const openMenu=()=>{refresh();menu.hidden=false;box.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>{const r=trigger.getBoundingClientRect(),need=Math.min(menu.scrollHeight,280)+10,below=window.innerHeight-r.bottom;box.classList.toggle("open-up",below<need&&r.top>below)})};trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?openMenu():close()};menu.onclick=e=>{const b=e.target.closest("button[data-value]");if(!b||b.disabled)return;e.preventDefault();select.value=b.dataset.value;select.dispatchEvent(new Event("change",{bubbles:true}));refresh();close()};box.onclick=e=>e.stopPropagation();refresh();return{refresh,close}};
  const reasonPretty=prettySelect(reason);dialog.addEventListener("click",e=>{if(!e.target.closest(".ir-pretty-select"))reasonPretty.close()});
  const syncReason=()=>{const other=reason.value==="other";otherWrap.hidden=!other;form.elements.reason_other.required=other;if(!other)form.elements.reason_other.value="";const hints={wind:"Например: 22 м/с",low_temp:"Например: -30 °C",high_temp:"Например: +40 °C",precipitation:"Например: 20 мм",power:"Например: 380 В отсутствует",readiness:"Например: 0% готовности",other:"Введите показатель"};form.elements.indicator.placeholder=hints[reason.value]||"Введите показатель";reasonPretty.refresh()};
  const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.date.value=r?.date||new Date().toISOString().slice(0,10);form.elements.reason.value=r?.reason||"wind";form.elements.reason_other.value=r?.reason_other||"";form.elements.indicator.value=r?.indicator||"";form.elements.time_from.value=r?.time_from||"08:00";form.elements.time_to.value=r?.time_to||"17:00";syncReason();document.getElementById("actedFormTitle").textContent=r?"Редактировать актированный день":"Добавить актированный день";dialog.showModal()};
  reason.onchange=syncReason;document.getElementById("actedAdd").onclick=()=>open(null);document.getElementById("actedX").onclick=()=>dialog.close();document.getElementById("actedCancel").onclick=()=>dialog.close();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(all.find(r=>String(r.id)===String(b.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=all.find(x=>String(x.id)===String(b.dataset.delete));if(!r||!confirm(`Удалить актирование за ${dmy(r.date)}?`))return;await api.remove(r.id);rows=await api.list().catch(()=>[]);draw()});
  form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),date=String(fd.get("date")||""),reasonCode=String(fd.get("reason")||""),other=String(fd.get("reason_other")||"").trim(),indicator=String(fd.get("indicator")||"").trim(),from=String(fd.get("time_from")||""),to=String(fd.get("time_to")||"");if(!date||!reasonCode||!from||!to){error.textContent="Заполните дату, причину и время актирования.";error.hidden=false;return}if(reasonCode==="other"&&!other){error.textContent="Укажите другую причину актирования.";error.hidden=false;return}if(mins(to)<=mins(from)){error.textContent="Время окончания должно быть позже времени начала.";error.hidden=false;return}const payload={record_type:"acted_day",title:`Актированный день ${dmy(date)}`,data:{date,reason:reasonCode,reason_other:reasonCode==="other"?other:"",indicator,time_from:from,time_to:to}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list().catch(()=>[]);dialog.close();draw()};
 }
 draw();
};
;

/* #26: src/acted-days-page-v3.js */
"use strict";
window.irActedDaysPageV3=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("acted-days"),reportsApi=root.section("reports"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("acted-days"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const reasons=[
  ["wind","Ветер"],
  ["power","Отключение электроэнергии"],
  ["readiness","Отсутствие стройготовности"],
  ["low_temp","Низкая температура (например, −40 °C)"],
  ["high_temp","Повышенная температура (например, +40 °C)"],
  ["precipitation","Сильные осадки"],
  ["other","Другая причина"]
 ];
 const reasonText=(code,other="")=>code==="other"?(String(other||"").trim()||"Другая причина"):(reasons.find(x=>x[0]===code)?.[1]||code||"—");
 const dmy=v=>{const s=String(v||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return`${d}.${m}.${y}`};
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const duration=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=h=>{const n=Math.round(Number(h||0)*100)/100;return String(n).replace(".",",")+" ч"};
 let [rows,reportRows]=await Promise.all([api.list().catch(()=>[]),reportsApi.list().catch(()=>[])]);
 const data=r=>({id:r.id,title:r.title||"",...(r.data||{})});
 const sorted=()=>rows.map(data).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 const isoDate=v=>{const s=String(v||"").slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:""};
 const monthNames=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
 const weekdays=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
 const reportData=r=>({id:r.id,...(r.data||r)});
 const reportWorkDates=()=>new Set(reportRows.map(reportData).filter(r=>{const items=Array.isArray(r.items)?r.items:Array.isArray(r.works)?r.works:[];return items.length>0}).map(r=>isoDate(r.date||r.report_date)).filter(Boolean));
 const analysisHtml=all=>{if(!all.length)return'<section class="acted-analysis"><div class="analysis-head"><div><h2>Анализ</h2><p>Причины актированных дней</p></div></div><div class="analysis-empty">Недостаточно данных для анализа</div></section>';const map=new Map();for(const r of all){const key=r.reason==="other"?"other":String(r.reason||"other"),label=key==="other"?"Другая причина":reasonText(key,"");if(!map.has(key))map.set(key,{key,label,count:0,hours:0});const x=map.get(key);x.count++;x.hours+=duration(r.time_from,r.time_to)}const total=all.length,max=Math.max(1,...[...map.values()].map(x=>x.count)),items=[...map.values()].sort((a,b)=>b.count-a.count||b.hours-a.hours).map(x=>{const pct=Math.round(x.count/total*100),width=x.count/max*100;return`<div class="analysis-row"><div class="analysis-row-top"><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"случай":"случ."} · ${fmtHours(x.hours)}</span></div><strong>${pct}%</strong></div><div class="analysis-bar"><i style="width:${width.toFixed(2)}%"></i></div></div>`}).join("");return`<section class="acted-analysis"><div class="analysis-head"><div><h2>Анализ</h2><p>Причины актированных дней</p></div><span>Всего: ${total}</span></div><div class="analysis-list">${items}</div></section>`};
 const calendarHtml=all=>{const workDates=reportWorkDates(),actedDates=new Set(all.map(r=>isoDate(r.date)).filter(Boolean)),months=[...new Set([...workDates,...actedDates].map(d=>d.slice(0,7)))].sort();if(!months.length)return'<section class="acted-calendar-section"><div class="acted-calendar-head"><div><h2>Календарь работ</h2><p>Рабочие и актированные дни по месяцам</p></div></div><div class="acted-calendar-empty">Пока нет дат для отображения</div></section>';const cards=months.map(key=>{const[y,m]=key.split("-").map(Number),first=new Date(Date.UTC(y,m-1,1)),days=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(first.getUTCDay()+6)%7;let cells="";for(let i=0;i<offset;i++)cells+='<div class="acted-cal-day empty"></div>';let workCount=0,actedCount=0;for(let d=1;d<=days;d++){const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,work=workDates.has(iso),acted=actedDates.has(iso);if(work)workCount++;if(acted)actedCount++;const actRows=acted?all.filter(r=>isoDate(r.date)===iso):[],tip=[work?"Работы выполнялись":"",...actRows.map(r=>`${reasonText(r.reason,r.reason_other)}${r.indicator?" · "+r.indicator:""}${r.time_from&&r.time_to?" · "+r.time_from+"–"+r.time_to:""}`)].filter(Boolean).join(" | ");cells+=`<div class="acted-cal-day${work?" work":""}${acted?" acted":""}" title="${esc(tip)}"><b>${d}</b>${work?'<i class="work-dot"></i>':""}${acted?'<i class="acted-dot"></i>':""}</div>`}let totalCells=offset+days;while(totalCells%7!==0){cells+='<div class="acted-cal-day empty"></div>';totalCells++;}return`<article class="acted-calendar-month"><div class="acted-calendar-month-head"><div><b>${monthNames[m-1]}</b><span>${y}</span></div><small>Работы: ${workCount} · Акт.: ${actedCount}</small></div><div class="acted-calendar-weekdays">${weekdays.map(x=>`<span>${x}</span>`).join("")}</div><div class="acted-calendar-days">${cells}</div></article>`}).join("");return`<section class="acted-calendar-section"><div class="acted-calendar-head"><div><h2>Календарь работ и актированных дней</h2><p>По месяцам, в которых есть ежедневные отчёты или актирование</p></div><div class="acted-calendar-legend"><span><i class="work"></i>Работы</span><span><i class="acted"></i>Актированный день</span></div></div><div class="acted-calendar-grid">${cards}</div></section>`};
 function dialogHtml(){if(!canEdit())return"";return `<dialog id="actedDialog" class="acted-dialog"><form id="actedForm" novalidate><input type="hidden" name="id"><div class="acted-form-head"><div><h2 id="actedFormTitle">Добавить актированный день</h2><p>Дата, причина, показатель и время остановки работ</p></div><button type="button" id="actedX" class="acted-x">×</button></div><label>Дата<input type="date" name="date" required></label><label>Причина актирования<select name="reason" required>${reasons.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join("")}</select></label><label data-other-reason hidden>Другая причина<input name="reason_other" placeholder="Укажите причину актирования"></label><label>Показатель<input name="indicator" placeholder="Например: 22 м/с"></label><div class="acted-time-grid"><label>Время с<input type="time" name="time_from" value="08:00" required></label><label>Время по<input type="time" name="time_to" value="17:00" required></label></div><div class="acted-form-error" id="actedError" hidden></div><div class="actions"><button type="button" id="actedCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function draw(){
  const all=sorted(),uniqueDays=new Set(all.map(x=>x.date).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+duration(x.time_from,x.time_to),0),latest=all[0]?.date||"";
  const body=all.length?all.map(r=>`<div class="acted-row" data-id="${esc(r.id)}"><div><span>Дата</span><b>${dmy(r.date)}</b></div><div class="acted-reason"><span>Причина</span><b>${esc(reasonText(r.reason,r.reason_other))}</b></div><div class="acted-indicator"><span>Показатель</span><b>${esc(r.indicator||"—")}</b></div><div><span>Время актирования</span><b>${esc(r.time_from||"—")} — ${esc(r.time_to||"—")}</b></div><div><span>Продолжительность</span><b>${fmtHours(duration(r.time_from,r.time_to))}</b></div>${canEdit()?`<div class="acted-actions"><button type="button" data-edit="${esc(r.id)}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" class="acted-delete" data-delete="${esc(r.id)}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`).join(""):'<div class="acted-empty">Актированные дни пока не добавлены</div>';
  app.innerHTML=`<div class="acted-days-page"><div class="acted-head"><button class="back" id="actedBack">← Назад</button><div><h1>Актированные дни</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="primary" id="actedAdd">＋ Добавить актированный день</button>':""}</div><div class="acted-summary"><div><span>Записей</span><b>${all.length}</b></div><div><span>Актированных дней</span><b>${uniqueDays}</b></div><div><span>Всего времени</span><b>${fmtHours(totalHours)}</b></div><div><span>Последняя дата</span><b>${latest?dmy(latest):"—"}</b></div></div>${analysisHtml(all)}${calendarHtml(all)}<div class="acted-card"><div class="acted-table-head"><span>Дата</span><span>Причина актирования</span><span>Показатель</span><span>Время актирования</span><span>Продолжительность</span><span></span></div><div class="acted-list">${body}</div></div>${dialogHtml()}</div>`;
  document.getElementById("actedBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())wireForm(all);
 }
 function wireForm(all){
  const dialog=document.getElementById("actedDialog"),form=document.getElementById("actedForm"),otherWrap=form.querySelector("[data-other-reason]"),error=document.getElementById("actedError"),reason=form.elements.reason;
  const prettySelect=select=>{select.classList.add("ir-pretty-native");const box=document.createElement("div");box.className="ir-pretty-select";const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-pretty-trigger";const menu=document.createElement("div");menu.className="ir-pretty-menu";menu.hidden=true;box.append(trigger,menu);select.insertAdjacentElement("afterend",box);const close=()=>{menu.hidden=true;box.classList.remove("open","open-up");trigger.setAttribute("aria-expanded","false")};const refresh=()=>{const current=select.options[select.selectedIndex];trigger.innerHTML=`<span>${esc(current?.textContent||"Выберите")}</span><i></i>`;menu.innerHTML=[...select.options].map(o=>`<button type="button" data-value="${esc(o.value)}" class="${o.selected?"selected":""}" ${o.disabled?"disabled":""}>${esc(o.textContent)}</button>`).join("")};const openMenu=()=>{refresh();menu.hidden=false;box.classList.add("open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(()=>{const r=trigger.getBoundingClientRect(),need=Math.min(menu.scrollHeight,280)+10,below=window.innerHeight-r.bottom;box.classList.toggle("open-up",below<need&&r.top>below)})};trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?openMenu():close()};menu.onclick=e=>{const b=e.target.closest("button[data-value]");if(!b||b.disabled)return;e.preventDefault();select.value=b.dataset.value;select.dispatchEvent(new Event("change",{bubbles:true}));refresh();close()};box.onclick=e=>e.stopPropagation();refresh();return{refresh,close}};
  const reasonPretty=prettySelect(reason);dialog.addEventListener("click",e=>{if(!e.target.closest(".ir-pretty-select"))reasonPretty.close()});
  const syncReason=()=>{const other=reason.value==="other";otherWrap.hidden=!other;form.elements.reason_other.required=other;if(!other)form.elements.reason_other.value="";const hints={wind:"Например: 22 м/с",low_temp:"Например: -30 °C",high_temp:"Например: +40 °C",precipitation:"Например: 20 мм",power:"Например: 380 В отсутствует",readiness:"Например: 0% готовности",other:"Введите показатель"};form.elements.indicator.placeholder=hints[reason.value]||"Введите показатель";reasonPretty.refresh()};
  const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.date.value=r?.date||new Date().toISOString().slice(0,10);form.elements.reason.value=r?.reason||"wind";form.elements.reason_other.value=r?.reason_other||"";form.elements.indicator.value=r?.indicator||"";form.elements.time_from.value=r?.time_from||"08:00";form.elements.time_to.value=r?.time_to||"17:00";syncReason();document.getElementById("actedFormTitle").textContent=r?"Редактировать актированный день":"Добавить актированный день";dialog.showModal()};
  reason.onchange=syncReason;document.getElementById("actedAdd").onclick=()=>open(null);document.getElementById("actedX").onclick=()=>dialog.close();document.getElementById("actedCancel").onclick=()=>dialog.close();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(all.find(r=>String(r.id)===String(b.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=all.find(x=>String(x.id)===String(b.dataset.delete));if(!r||!confirm(`Удалить актирование за ${dmy(r.date)}?`))return;await api.remove(r.id);rows=await api.list().catch(()=>[]);draw()});
  form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),date=String(fd.get("date")||""),reasonCode=String(fd.get("reason")||""),other=String(fd.get("reason_other")||"").trim(),indicator=String(fd.get("indicator")||"").trim(),from=String(fd.get("time_from")||""),to=String(fd.get("time_to")||"");if(!date||!reasonCode||!from||!to){error.textContent="Заполните дату, причину и время актирования.";error.hidden=false;return}if(reasonCode==="other"&&!other){error.textContent="Укажите другую причину актирования.";error.hidden=false;return}if(mins(to)<=mins(from)){error.textContent="Время окончания должно быть позже времени начала.";error.hidden=false;return}const payload={record_type:"acted_day",title:`Актированный день ${dmy(date)}`,data:{date,reason:reasonCode,reason_other:reasonCode==="other"?other:"",indicator,time_from:from,time_to:to}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list().catch(()=>[]);dialog.close();draw()};
 }
 draw();
};
;

/* #27: src/penalties-page.js */
"use strict";
window.irPenaltiesPage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("penalties"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("penalties"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const dmy=v=>{const s=String(v||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return`${d}.${m}.${y}`};
 const data=r=>({id:r.id,title:r.title||"",...(r.data||{})});
 let rows=await api.list().catch(()=>[]);
 const sorted=()=>rows.map(data).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 function dialogHtml(){if(!canEdit())return"";return `<dialog id="penaltyDialog" class="penalty-dialog"><form id="penaltyForm" novalidate><input type="hidden" name="id"><div class="penalty-form-head"><div><h2 id="penaltyFormTitle">Добавить штраф</h2><p>Дата, ответственный, причина и сумма штрафа</p></div><button type="button" id="penaltyX" class="penalty-x">×</button></div><label>Дата<input type="date" name="date" required></label><label>Ответственный<input name="responsible" required placeholder="ФИО ответственного"></label><label>Причина штрафа<textarea name="reason" required placeholder="Укажите причину штрафа"></textarea></label><label>Сумма штрафа, тг<input name="amount" inputmode="decimal" required placeholder="Например: 50 000"></label><div class="penalty-form-error" id="penaltyError" hidden></div><div class="actions"><button type="button" id="penaltyCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function draw(){
  const all=sorted(),total=all.reduce((s,r)=>s+num(r.amount),0),latest=all[0]?.date||"",people=new Set(all.map(r=>String(r.responsible||"").trim()).filter(Boolean)).size;
  const body=all.length?all.map(r=>`<div class="penalty-row" data-id="${esc(r.id)}"><div><span>Дата</span><b>${dmy(r.date)}</b></div><div class="penalty-responsible"><span>Ответственный</span><b>${esc(r.responsible||"—")}</b></div><div class="penalty-reason"><span>Причина штрафа</span><b>${esc(r.reason||"—")}</b></div><div class="penalty-amount"><span>Сумма</span><b>${money(r.amount)}</b></div>${canEdit()?`<div class="penalty-actions"><button type="button" data-edit="${esc(r.id)}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" class="penalty-delete" data-delete="${esc(r.id)}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`).join(""):'<div class="penalty-empty">Штрафы пока не добавлены</div>';
  app.innerHTML=`<div class="penalties-page"><div class="penalties-head"><button class="back" id="penaltiesBack">← Назад</button><div><h1>Штрафы</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="primary" id="penaltyAdd">＋ Добавить штраф</button>':""}</div><div class="penalty-summary"><div><span>Всего штрафов</span><b>${all.length}</b></div><div><span>Общая сумма</span><b>${money(total)}</b></div><div><span>Ответственных</span><b>${people}</b></div><div><span>Последний штраф</span><b>${latest?dmy(latest):"—"}</b></div></div><div class="penalty-card"><div class="penalty-table-head"><span>Дата</span><span>Ответственный</span><span>Причина штрафа</span><span>Сумма</span><span></span></div><div class="penalty-list">${body}</div></div>${dialogHtml()}</div>`;
  document.getElementById("penaltiesBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())wireForm(all);
 }
 function wireForm(all){
  const dialog=document.getElementById("penaltyDialog"),form=document.getElementById("penaltyForm"),error=document.getElementById("penaltyError");
  const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.date.value=r?.date||new Date().toISOString().slice(0,10);form.elements.responsible.value=r?.responsible||"";form.elements.reason.value=r?.reason||"";form.elements.amount.value=r?.amount??"";document.getElementById("penaltyFormTitle").textContent=r?"Редактировать штраф":"Добавить штраф";dialog.showModal()};
  document.getElementById("penaltyAdd").onclick=()=>open(null);document.getElementById("penaltyX").onclick=()=>dialog.close();document.getElementById("penaltyCancel").onclick=()=>dialog.close();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(all.find(r=>String(r.id)===String(b.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=all.find(x=>String(x.id)===String(b.dataset.delete));if(!r||!confirm(`Удалить штраф за ${dmy(r.date)} на сумму ${money(r.amount)}?`))return;await api.remove(r.id);rows=await api.list().catch(()=>[]);draw()});
  form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),date=String(fd.get("date")||""),responsible=String(fd.get("responsible")||"").trim(),reason=String(fd.get("reason")||"").trim(),amount=num(fd.get("amount"));if(!date||!responsible||!reason){error.textContent="Заполните дату, ответственного и причину штрафа.";error.hidden=false;return}if(amount<=0){error.textContent="Сумма штрафа должна быть больше 0.";error.hidden=false;return}const payload={record_type:"penalty",title:`Штраф ${dmy(date)} · ${responsible}`,data:{date,responsible,reason,amount}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list().catch(()=>[]);dialog.close();draw()};
 }
 draw();
};
;

/* #28: src/penalties-page-v2.js */
"use strict";
window.irPenaltiesPageV2=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("penalties"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("penalties"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const dmy=v=>{const s=String(v||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return`${d}.${m}.${y}`};
 const data=r=>({id:r.id,title:r.title||"",...(r.data||{})});
 let rows=await api.list().catch(()=>[]);
 const sorted=()=>rows.map(data).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 function dialogHtml(){if(!canEdit())return"";return `<dialog id="penaltyDialog" class="penalty-dialog"><form id="penaltyForm" novalidate><input type="hidden" name="id"><div class="penalty-form-head"><div><h2 id="penaltyFormTitle">Добавить штраф</h2><p>Дата, ответственный, причина и сумма штрафа</p></div><button type="button" id="penaltyX" class="penalty-x">×</button></div><label>Дата<input type="date" name="date" required></label><label>Ответственный<input name="responsible" required placeholder="ФИО ответственного"></label><label>Причина штрафа<textarea name="reason" required placeholder="Укажите причину штрафа"></textarea></label><label>Сумма штрафа, тг<input name="amount" inputmode="decimal" required placeholder="Например: 50 000"></label><div class="penalty-form-error" id="penaltyError" hidden></div><div class="actions"><button type="button" id="penaltyCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function analysisHtml(all){if(!all.length)return'<section class="penalty-analysis"><div class="analysis-head"><div><h2>Анализ</h2><p>Причины штрафов</p></div></div><div class="analysis-empty">Недостаточно данных для анализа</div></section>';const map=new Map();for(const r of all){const label=String(r.reason||"Без причины").trim()||"Без причины",key=label.toLowerCase().replace(/\s+/g," ");if(!map.has(key))map.set(key,{label,count:0,amount:0});const x=map.get(key);x.count++;x.amount+=num(r.amount)}const totalAmount=all.reduce((s,r)=>s+num(r.amount),0),max=Math.max(1,...[...map.values()].map(x=>x.amount));const items=[...map.values()].sort((a,b)=>b.amount-a.amount||b.count-a.count).map(x=>{const pct=totalAmount>0?Math.round(x.amount/totalAmount*100):0,width=x.amount/max*100;return`<div class="analysis-row"><div class="analysis-row-top"><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"штраф":"штрафа/ов"} · ${money(x.amount)}</span></div><strong>${pct}%</strong></div><div class="analysis-bar"><i style="width:${width.toFixed(2)}%"></i></div></div>`}).join("");return`<section class="penalty-analysis"><div class="analysis-head"><div><h2>Анализ</h2><p>Причины штрафов по сумме и количеству</p></div><span>Всего: ${money(totalAmount)}</span></div><div class="analysis-list">${items}</div></section>`}
 function draw(){
  const all=sorted(),total=all.reduce((s,r)=>s+num(r.amount),0),latest=all[0]?.date||"",people=new Set(all.map(r=>String(r.responsible||"").trim()).filter(Boolean)).size;
  const body=all.length?all.map(r=>`<div class="penalty-row" data-id="${esc(r.id)}"><div><span>Дата</span><b>${dmy(r.date)}</b></div><div class="penalty-responsible"><span>Ответственный</span><b>${esc(r.responsible||"—")}</b></div><div class="penalty-reason"><span>Причина штрафа</span><b>${esc(r.reason||"—")}</b></div><div class="penalty-amount"><span>Сумма</span><b>${money(r.amount)}</b></div>${canEdit()?`<div class="penalty-actions"><button type="button" data-edit="${esc(r.id)}" title="Редактировать" aria-label="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button><button type="button" class="penalty-delete" data-delete="${esc(r.id)}" title="Удалить" aria-label="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg></button></div>`:"<div></div>"}</div>`).join(""):'<div class="penalty-empty">Штрафы пока не добавлены</div>';
  app.innerHTML=`<div class="penalties-page"><div class="penalties-head"><button class="back" id="penaltiesBack">← Назад</button><div><h1>Штрафы</h1><p>${esc(object.name||"")}</p></div>${canEdit()?'<button class="primary" id="penaltyAdd">＋ Добавить штраф</button>':""}</div><div class="penalty-summary"><div><span>Всего штрафов</span><b>${all.length}</b></div><div><span>Общая сумма</span><b>${money(total)}</b></div><div><span>Ответственных</span><b>${people}</b></div><div><span>Последний штраф</span><b>${latest?dmy(latest):"—"}</b></div></div>${analysisHtml(all)}<div class="penalty-card"><div class="penalty-table-head"><span>Дата</span><span>Ответственный</span><span>Причина штрафа</span><span>Сумма</span><span></span></div><div class="penalty-list">${body}</div></div>${dialogHtml()}</div>`;
  document.getElementById("penaltiesBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())wireForm(all);
 }
 function wireForm(all){
  const dialog=document.getElementById("penaltyDialog"),form=document.getElementById("penaltyForm"),error=document.getElementById("penaltyError");
  const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.date.value=r?.date||new Date().toISOString().slice(0,10);form.elements.responsible.value=r?.responsible||"";form.elements.reason.value=r?.reason||"";form.elements.amount.value=r?.amount??"";document.getElementById("penaltyFormTitle").textContent=r?"Редактировать штраф":"Добавить штраф";dialog.showModal()};
  document.getElementById("penaltyAdd").onclick=()=>open(null);document.getElementById("penaltyX").onclick=()=>dialog.close();document.getElementById("penaltyCancel").onclick=()=>dialog.close();
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>open(all.find(r=>String(r.id)===String(b.dataset.edit))));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{const r=all.find(x=>String(x.id)===String(b.dataset.delete));if(!r||!confirm(`Удалить штраф за ${dmy(r.date)} на сумму ${money(r.amount)}?`))return;await api.remove(r.id);rows=await api.list().catch(()=>[]);draw()});
  form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),date=String(fd.get("date")||""),responsible=String(fd.get("responsible")||"").trim(),reason=String(fd.get("reason")||"").trim(),amount=num(fd.get("amount"));if(!date||!responsible||!reason){error.textContent="Заполните дату, ответственного и причину штрафа.";error.hidden=false;return}if(amount<=0){error.textContent="Сумма штрафа должна быть больше 0.";error.hidden=false;return}const payload={record_type:"penalty",title:`Штраф ${dmy(date)} · ${responsible}`,data:{date,responsible,reason,amount}};if(id)await api.update(id,payload);else await api.create(payload);rows=await api.list().catch(()=>[]);dialog.close();draw()};
 }
 draw();
};
;

/* #29: src/finance-page.js */
"use strict";
window.irFinancePage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("finance"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);
 if(!object){location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("finance"):false;
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?n.toLocaleString("ru-RU"):Number(n.toFixed(4)).toLocaleString("ru-RU",{maximumFractionDigits:4})};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const dmy=v=>{const s=String(v||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s||"—";const[y,m,d]=s.split("-");return d+"."+m+"."+y};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const markTotal=x=>{const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)};
 const docTypeText=t=>t==="invoice"?"Накладная":"АВР";
 let [financeRows,workRows,markRows]=await Promise.all([api.list().catch(()=>[]),wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]);
 const rec=r=>({id:r.id,record_type:r.record_type||"",title:r.title||"",...(r.data||{})});
 const finance=()=>financeRows.map(rec);
 const rateRows=()=>finance().filter(x=>x.record_type==="finance_rate");
 const documents=()=>finance().filter(x=>x.record_type==="finance_document").sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))||Number(b.id)-Number(a.id));
 const workTypes=()=>workRows.map(r=>{const d=r.data||{},id=String(r.id),unit=d.accounting_type==="service"||norm(d.unit)==="услуга"?"услуга":String(d.unit||""),service=unit==="услуга",marked=!service&&(d.has_marks===true||["installation","fabrication"].includes(d.work_category)||(!d.work_category&&d.has_marks!==false&&arr(markRows).some(m=>String(m.data?.work_type_id||"")===id))),workPlan=num(d.planned_volume??d.plan_volume),marksPlan=markRows.filter(m=>String(m.data?.work_type_id||"")===id).reduce((s,m)=>s+markTotal(m),0),plan=service?1:Math.max(workPlan,marksPlan);return{id,name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit,service,marked,workPlan,marksPlan,plan}});
 const rateFor=id=>rateRows().find(r=>String(r.work_type_id||"")===String(id));
 const docItems=(excludeId="")=>documents().filter(d=>String(d.id)!==String(excludeId)).flatMap(d=>arr(d.items));
 const closedQty=(wid,excludeId="")=>docItems(excludeId).filter(x=>String(x.work_type_id||"")===String(wid)).reduce((s,x)=>s+num(x.qty),0);
 const closedAmount=wid=>documents().flatMap(d=>arr(d.items)).filter(x=>String(x.work_type_id||"")===String(wid)).reduce((s,x)=>s+num(x.amount??num(x.qty)*num(x.price)),0);
 const totalDoc=d=>arr(d.items).reduce((s,x)=>s+num(x.amount??num(x.qty)*num(x.price)),0);
 function rateDialog(){if(!canEdit())return"";return`<dialog id="financeRateDialog" class="finance-dialog finance-rate-dialog"><form id="financeRateForm" novalidate><input type="hidden" name="id"><input type="hidden" name="work_type_id"><div class="finance-form-head"><div><h2>Договорная расценка</h2><p id="financeRateWork"></p></div><button type="button" class="finance-x" id="financeRateX">×</button></div><div class="finance-rate-grid"><label>Цена за 1 ед., тг<input name="price" inputmode="decimal" required placeholder="Например: 240 000"></label><label>Закрывается документом<select name="closing_type"><option value="avr">Акт выполненных работ (АВР)</option><option value="invoice">Накладная</option></select></label></div><div class="finance-form-error" id="financeRateError" hidden></div><div class="actions"><button type="button" id="financeRateCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`}
 function docDialog(){if(!canEdit())return"";return`<dialog id="financeDocDialog" class="finance-dialog finance-doc-dialog"><form id="financeDocForm" novalidate><input type="hidden" name="id"><div class="finance-form-head"><div><h2 id="financeDocTitle">Добавить закрывающий документ</h2><p>АВР или накладная по договорным расценкам</p></div><button type="button" class="finance-x" id="financeDocX">×</button></div><div class="finance-doc-meta"><label>Тип документа<select name="doc_type"><option value="avr">Акт выполненных работ (АВР)</option><option value="invoice">Накладная</option></select></label><label>№ документа<input name="number" required placeholder="Например: 5"></label><label>Дата<input type="date" name="date" required></label></div><div class="finance-doc-items-head"><div><b>Позиции документа</b><span>Объём × договорная цена = сумма</span></div><button type="button" id="financeAddItem">＋ Добавить позицию</button></div><div id="financeDocItems" class="finance-doc-items"></div><div class="finance-doc-total"><span>Итого по документу</span><b id="financeDocTotal">0 тг</b></div><div class="finance-form-error" id="financeDocError" hidden></div><div class="actions"><button type="button" id="financeDocCancel">Отмена</button><button type="submit" class="primary">Сохранить документ</button></div></form></dialog>`}
 function summary(allWorks){
  const contract=allWorks.reduce((s,w)=>{const r=rateFor(w.id);return s+(r&&w.plan>0?num(r.price)*w.plan:0)},0),closed=documents().reduce((s,d)=>s+totalDoc(d),0),left=Math.max(0,contract-closed),pct=contract?Math.max(0,Math.min(100,closed/contract*100)):0;
  return`<div class="finance-summary"><div><span>Сумма договора</span><b>${money(contract)}</b><small>По видам работ с заданной ценой</small></div><div><span>Закрыто</span><b>${money(closed)}</b><small>АВР + накладные</small></div><div><span>Осталось закрыть</span><b>${money(left)}</b><small>От договорной стоимости</small></div><div class="finance-progress-card"><div><span>Закрыто</span><b>${Math.round(pct)}%</b></div><i style="--p:${pct.toFixed(2)}"><em></em></i></div></div>`
 }
 function workTable(allWorks){
  const rows=allWorks.map(w=>{const rate=rateFor(w.id),price=rate?num(rate.price):0,cost=price*w.plan,closed=closedAmount(w.id),left=Math.max(0,cost-closed),pct=cost?Math.min(100,closed/cost*100):0,closing=rate?docTypeText(rate.closing_type):"—";return`<div class="finance-work-row"><div><span>Вид работы</span><b>${esc(w.name)}</b><small>${esc(w.code||"Без шифра")}</small></div><div><span>Объём</span><b>${w.plan>0?fmt(w.plan)+" "+esc(w.unit):"—"}</b><small>${w.service?"Услуга":w.marksPlan>w.workPlan?"Из ведомости марок":w.workPlan>0?"Из вида работ":w.marksPlan>0?"Из ведомости марок":""}</small></div><div><span>Цена за 1 ед.</span><b>${rate?money(price):"Не задана"}</b></div><div><span>Стоимость</span><b>${rate&&w.plan>0?money(cost):"—"}</b></div><div><span>Закрыто</span><b>${money(closed)}</b><small>${cost?Math.round(pct)+"%":"—"}</small></div><div><span>Остаток</span><b>${rate&&w.plan>0?money(left):"—"}</b></div><div><span>Документ</span><b>${closing}</b></div>${canEdit()?`<div class="finance-work-actions"><button type="button" data-rate="${w.id}" title="${rate?"Изменить цену":"Указать цену"}">${rate?"Редактировать":"Указать цену"}</button></div>`:"<div></div>"}</div>`}).join("");
  return`<section class="finance-card finance-contract"><div class="finance-card-head"><div><h2>Стоимость по видам работ</h2><p>Объёмы подтягиваются из видов работ и ведомостей марок</p></div></div><div class="finance-work-head"><span>Вид работы</span><span>Объём</span><span>Цена за 1 ед.</span><span>Стоимость</span><span>Закрыто</span><span>Остаток</span><span>Документ</span><span></span></div><div class="finance-work-list">${rows||'<div class="finance-empty">Сначала добавьте виды работ</div>'}</div></section>`
 }
 function docsTable(){
  const docs=documents(),rows=docs.map(d=>{const total=totalDoc(d);return`<div class="finance-doc-row"><div><span>Документ</span><b><i class="finance-doc-badge ${d.doc_type==="invoice"?"invoice":"avr"}">${docTypeText(d.doc_type)}</i> № ${esc(d.number||"—")}</b></div><div><span>Дата</span><b>${dmy(d.date)}</b></div><div><span>Позиций</span><b>${arr(d.items).length}</b></div><div><span>Сумма</span><b>${money(total)}</b></div>${canEdit()?`<div class="finance-doc-actions"><button type="button" data-doc-edit="${d.id}" title="Редактировать">✎</button><button type="button" class="danger" data-doc-delete="${d.id}" title="Удалить">×</button></div>`:"<div></div>"}</div>`}).join("");
  return`<section class="finance-card finance-documents"><div class="finance-card-head"><div><h2>Закрывающие документы</h2><p>Акты выполненных работ и накладные</p></div>${canEdit()?'<button type="button" id="financeAddDoc">＋ Добавить документ</button>':""}</div><div class="finance-doc-head"><span>Документ</span><span>Дата</span><span>Позиций</span><span>Сумма</span><span></span></div><div class="finance-doc-list">${rows||'<div class="finance-empty">Закрывающие документы пока не добавлены</div>'}</div></section>`
 }
 function draw(){
  const works=workTypes();
  app.innerHTML=`<div class="finance-page"><div class="finance-head"><button class="back" id="financeBack">← Назад</button><div><h1>Финансы</h1><p>${esc(object.name||"")}</p></div></div>${summary(works)}${workTable(works)}${docsTable()}${rateDialog()}${docDialog()}</div>`;
  document.getElementById("financeBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  if(canEdit())bind(works);
 }
 function bind(works){
  const rateDialogEl=document.getElementById("financeRateDialog"),rateForm=document.getElementById("financeRateForm"),rateErr=document.getElementById("financeRateError");
  const openRate=wid=>{const w=works.find(x=>x.id===String(wid)),r=rateFor(wid);if(!w)return;rateForm.reset();rateErr.hidden=true;rateForm.elements.id.value=r?.id||"";rateForm.elements.work_type_id.value=w.id;rateForm.elements.price.value=r?.price??"";rateForm.elements.closing_type.value=r?.closing_type||"avr";document.getElementById("financeRateWork").textContent=`${w.name} · ${w.plan?fmt(w.plan)+" "+w.unit:"объём не задан"}`;rateDialogEl.showModal()};
  document.querySelectorAll("[data-rate]").forEach(b=>b.onclick=()=>openRate(b.dataset.rate));
  document.getElementById("financeRateX").onclick=()=>rateDialogEl.close();document.getElementById("financeRateCancel").onclick=()=>rateDialogEl.close();
  rateForm.onsubmit=async e=>{e.preventDefault();rateErr.hidden=true;const fd=new FormData(rateForm),id=String(fd.get("id")||""),wid=String(fd.get("work_type_id")||""),price=num(fd.get("price")),closing=String(fd.get("closing_type")||"avr"),w=works.find(x=>x.id===wid);if(!w||price<=0){rateErr.textContent="Укажите цену за 1 ед. больше 0.";rateErr.hidden=false;return}const payload={record_type:"finance_rate",title:w.name,data:{work_type_id:w.id,work_type:w.name,unit:w.unit,price,closing_type:closing}};if(id)await api.update(id,payload);else await api.create(payload);financeRows=await api.list().catch(()=>financeRows);rateDialogEl.close();draw()};

  const dialog=document.getElementById("financeDocDialog"),form=document.getElementById("financeDocForm"),itemsBox=document.getElementById("financeDocItems"),err=document.getElementById("financeDocError"),docType=form.elements.doc_type;
  const eligible=type=>works.filter(w=>{const r=rateFor(w.id);return r&&r.closing_type===type&&w.plan>0});
  const rowOptions=(type,selected="")=>'<option value="">Выберите вид работы</option>'+eligible(type).map(w=>`<option value="${w.id}" ${String(selected)===w.id?"selected":""}>${esc(w.name)} · ${esc(w.unit)}</option>`).join("");
  const rowHtml=(item={},excludeId="")=>`<div class="finance-doc-item"><label>Вид работы<select name="item_work_type">${rowOptions(docType.value,item.work_type_id||"")}</select></label><label>Объём<input name="item_qty" inputmode="decimal" value="${item.qty??""}" placeholder="0"></label><div class="finance-item-price"><span>Цена</span><b data-item-price>—</b></div><div class="finance-item-amount"><span>Сумма</span><b data-item-amount>0 тг</b><small data-item-left></small></div><button type="button" class="finance-item-remove" title="Удалить позицию">×</button></div>`;
  const refreshTotal=()=>{let total=0;itemsBox.querySelectorAll(".finance-doc-item").forEach(row=>{const wid=String(row.querySelector('[name="item_work_type"]').value||""),qty=num(row.querySelector('[name="item_qty"]').value),r=rateFor(wid),amount=qty*num(r?.price);total+=amount;row.querySelector("[data-item-price]").textContent=r?money(r.price):"—";row.querySelector("[data-item-amount]").textContent=money(amount);const w=works.find(x=>x.id===wid),docId=form.elements.id.value,available=w?Math.max(0,w.plan-closedQty(wid,docId)):0;row.querySelector("[data-item-left]").textContent=w?`Доступно: ${fmt(available)} ${w.unit}`:""}) ;document.getElementById("financeDocTotal").textContent=money(total)};
  const bindItem=row=>{const sel=row.querySelector('[name="item_work_type"]'),qty=row.querySelector('[name="item_qty"]');sel.onchange=refreshTotal;qty.oninput=refreshTotal;row.querySelector(".finance-item-remove").onclick=()=>{row.remove();refreshTotal()};refreshTotal()};
  const addItem=item=>{itemsBox.insertAdjacentHTML("beforeend",rowHtml(item,form.elements.id.value));bindItem(itemsBox.lastElementChild)};
  const refillOptions=()=>{itemsBox.querySelectorAll(".finance-doc-item").forEach(row=>{const s=row.querySelector('[name="item_work_type"]'),old=s.value;s.innerHTML=rowOptions(docType.value,old);if(![...s.options].some(o=>o.value===old))s.value="";s._irSelectUI?.refresh?.()});refreshTotal()};
  const openDoc=d=>{form.reset();itemsBox.innerHTML="";err.hidden=true;form.elements.id.value=d?.id||"";docType.value=d?.doc_type||"avr";form.elements.number.value=d?.number||"";form.elements.date.value=d?.date||new Date().toISOString().slice(0,10);document.getElementById("financeDocTitle").textContent=d?"Редактировать закрывающий документ":"Добавить закрывающий документ";arr(d?.items).forEach(addItem);if(!d?.items?.length)addItem({});dialog.showModal();docType._irSelectUI?.refresh?.();refreshTotal()};
  document.getElementById("financeAddDoc").onclick=()=>openDoc(null);document.querySelectorAll("[data-doc-edit]").forEach(b=>b.onclick=()=>openDoc(documents().find(x=>String(x.id)===String(b.dataset.docEdit))));
  document.querySelectorAll("[data-doc-delete]").forEach(b=>b.onclick=async()=>{const d=documents().find(x=>String(x.id)===String(b.dataset.docDelete));if(!d||!confirm(`Удалить ${docTypeText(d.doc_type)} № ${d.number||"—"} на сумму ${money(totalDoc(d))}?`))return;await api.remove(d.id);financeRows=await api.list().catch(()=>financeRows);draw()});
  document.getElementById("financeDocX").onclick=()=>dialog.close();document.getElementById("financeDocCancel").onclick=()=>dialog.close();document.getElementById("financeAddItem").onclick=()=>addItem({});docType.onchange=refillOptions;
  form.onsubmit=async e=>{e.preventDefault();err.hidden=true;const fd=new FormData(form),id=String(fd.get("id")||""),type=String(fd.get("doc_type")||"avr"),number=String(fd.get("number")||"").trim(),date=String(fd.get("date")||"");if(!number||!date){err.textContent="Укажите номер и дату документа.";err.hidden=false;return}const items=[];for(const row of itemsBox.querySelectorAll(".finance-doc-item")){const wid=String(row.querySelector('[name="item_work_type"]').value||""),qty=num(row.querySelector('[name="item_qty"]').value),w=works.find(x=>x.id===wid),r=rateFor(wid);if(!wid&&!qty)continue;if(!w||!r||r.closing_type!==type||qty<=0){err.textContent="Проверьте вид работы и объём в позициях документа.";err.hidden=false;return}const available=Math.max(0,w.plan-closedQty(wid,id));if(qty>available+1e-9){err.textContent=`По работе «${w.name}» доступно к закрытию ${fmt(available)} ${w.unit}, указано ${fmt(qty)}.`;err.hidden=false;return}items.push({work_type_id:w.id,work_type:w.name,unit:w.unit,qty,price:num(r.price),amount:qty*num(r.price)})}if(!items.length){err.textContent="Добавьте хотя бы одну позицию.";err.hidden=false;return}const payload={record_type:"finance_document",title:`${docTypeText(type)} № ${number}`,data:{doc_type:type,number,date,items}};if(id)await api.update(id,payload);else await api.create(payload);financeRows=await api.list().catch(()=>financeRows);dialog.close();draw()};
 }
 draw();
};
;

/* #30: src/scheme-page.js */
"use strict";
// Visible immediately on navigation, before the DB and GPU work begins.
// A generation token prevents an old paint callback from hiding a newer load.
const irSchemeLoading=(()=>{
 let active=null,nextId=0;
 function begin(){
  const id=++nextId,route=location.hash;
  active?.element?.remove();
  const element=document.createElement("div");
  element.id="irSchemeLoading";
  element.className="ir-scheme-loading";
  element.setAttribute("role","status");
  element.setAttribute("aria-live","polite");
  element.innerHTML='<div class="ir-scheme-loading-card">'+
   '<div class="ir-scheme-loading-wheel" aria-hidden="true"></div>'+
   '<strong>Загрузка монтажной схемы</strong>'+
   '<p>Подготавливаем оси, элементы и 3D-модель…</p>'+
   '</div>';
  document.body.appendChild(element);
  active={id,route,element};
  const current=()=>active?.id===id&&active.element===element;
  const cancel=()=>{if(current()){element.remove();active=null}};
  return {
   cancel,
   done(){
    if(!current())return;
    requestAnimationFrame(()=>{if(current()&&location.hash===route)cancel()})
   },
   fail(error){
    if(!current())return;
    const card=element.querySelector(".ir-scheme-loading-card");
    if(!card)return cancel();
    card.classList.add("error");
    card.innerHTML='<strong>Не удалось загрузить монтажную схему</strong>'+
     '<p>Проверьте данные или попробуйте открыть схему повторно.</p>'+
     '<button type="button" class="ir-scheme-loading-back">Вернуться к объекту</button>';
    card.querySelector("button").onclick=()=>{cancel();location.hash=route.replace(/\/scheme$/,"")};
    console.error("Монтажная схема: ошибка загрузки",error)
   }
  }
 }
 window.addEventListener("hashchange",()=>{
  if(active&&location.hash!==active.route){active.element.remove();active=null}
 });
 return{begin}
})();
window.irSchemePage=async function(objectId){
 const oid=String(objectId||"");if(!oid)return;
 const loading=irSchemeLoading.begin(),requestedRoute=location.hash;
 try{
 const app=document.getElementById("app"),root=irProject.data.forObject(oid),schemeApi=root.section("scheme"),object=await irProject.data.objects.get(oid);
 if(location.hash!==requestedRoute){loading.cancel();return}
 if(!object){loading.cancel();location.hash="/objects";return}
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("scheme"):false;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>Number(num(v).toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1});
 const defaultAxesX=["1","2","3","4","5","6"],defaultAxesY=["А","Б","В","Г","Д","Е","Ж","И","К","Л"],defaultSpanX=45000,defaultSpanY=60000;
 let axesX=[...defaultAxesX],axesY=[...defaultAxesY],targetSpanX=defaultSpanX,targetSpanY=defaultSpanY,gridDirX="ltr",gridDirY="btt";
 let frameMode=true,mode="building",viewRotation=0,zoom=1,panX=0,panY=0,selectedId="",activeWorkId="",activeScheme="all",rows=[],markRows=[],workRows=[],gridXSpans=[],gridYSpans=[],spanX=targetSpanX,spanY=targetSpanY,axisXPos=new Map(),axisYPos=new Map(),labelsVisible=false,dimensionsVisible=false,hiddenGroups=new Set(),statusFilter="all",levelMin="",levelMax="",layersPanelOpen=false,elementSearch="",pickerScrollTop=0,previewFullscreen=false,previewNativeFullscreen=false,previewOriginalOverflow="";
 const backgroundChoices=["standard","white","gray","blue","sand","dark","custom"],
  backgroundStorageKey="ir-project.scheme-background."+oid,
  planBackgroundStorageKey=backgroundStorageKey+".plan";
 // The former single background preference belongs to 3D. Plan starts light;
 // users can still explicitly select and remember a dark/custom plan surface.
 let schemeBackground="standard",schemeCustomBackground="#e9f2ff",
  planBackground="standard",planCustomBackground="#e9f2ff";
 const isHexColor=v=>/^#[\da-f]{6}$/i.test(String(v||""));
 try{
  const stored=JSON.parse(window.localStorage?.getItem(backgroundStorageKey)||"null");
  if(stored&&backgroundChoices.includes(stored.mode))schemeBackground=stored.mode;
  if(stored&&isHexColor(stored.color))schemeCustomBackground=stored.color.toLowerCase();
  const savedPlan=JSON.parse(window.localStorage?.getItem(planBackgroundStorageKey)||"null");
  if(savedPlan&&backgroundChoices.includes(savedPlan.mode))planBackground=savedPlan.mode;
  if(savedPlan&&isHexColor(savedPlan.color))planCustomBackground=savedPlan.color.toLowerCase()
 }catch(e){}
 const currentBackground=()=>mode==="plan"?planBackground:schemeBackground;
 const currentCustomBackground=()=>mode==="plan"?planCustomBackground:schemeCustomBackground;
 const backgroundIsDark=()=>{
  const selected=currentBackground();
  if(selected==="dark")return true;
  if(selected!=="custom")return false;
  const hex=currentCustomBackground(),r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return(r*299+g*587+b*114)/1000<155
 };
 function applySchemeBackground(selected=currentBackground(),color=currentCustomBackground()){
  if(!backgroundChoices.includes(selected))selected="standard";
  if(mode==="plan"){
   planBackground=selected;
   if(isHexColor(color))planCustomBackground=color.toLowerCase()
  }else{
   schemeBackground=selected;
   if(isHexColor(color))schemeCustomBackground=color.toLowerCase()
  }
  const stage=document.getElementById("schemePreviewStage");
  if(stage){
   stage.dataset.schemeBackground=currentBackground();
   stage.dataset.schemeContrast=backgroundIsDark()?"dark":"light";
   stage.style.setProperty("--scheme-custom-background",currentCustomBackground())
  }
  const select=document.getElementById("schemeBackgroundSelect");
  if(select)select.value=currentBackground();
  const custom=document.getElementById("schemeBackgroundCustom");
  if(custom){custom.value=currentCustomBackground();custom.hidden=currentBackground()!=="custom"}
  const key=mode==="plan"?planBackgroundStorageKey:backgroundStorageKey;
  try{window.localStorage?.setItem(key,JSON.stringify({mode:currentBackground(),color:currentCustomBackground()}))}catch(e){}
 }
 [rows,markRows,workRows]=await Promise.all([schemeApi.list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
 if(location.hash!==requestedRoute){loading.cancel();return}
 const equalSpans=(total,count)=>{count=Math.max(1,count);const base=Math.floor(total/count),rem=Math.round(total-base*count);return Array.from({length:count},(_,i)=>base+(i<rem?1:0))};
 const validAxes=v=>Array.isArray(v)&&v.length>=2&&v.every(x=>String(x||"").trim());
 const validSpans=(v,count,total)=>Array.isArray(v)&&v.length===count&&v.every(x=>num(x)>0)&&Math.abs(v.reduce((s,x)=>s+num(x),0)-total)<.11;
 // Grid and view records are unchanged during a single render. Recomputing
 // them for every steel member made legacy placements O(members * DB rows).
 let gridRowsSnapshot=null,gridRowSnapshot=null;
 let viewRowsSnapshot=null,viewWorkSnapshot=null,viewRowsSnapshotValue=[];
 const emptyGrid=Object.freeze({});
 const gridRecord=()=>{
  if(gridRowsSnapshot!==rows){
   gridRowsSnapshot=rows;
   gridRowSnapshot=arr(rows).find(r=>r.record_type==="scheme_grid"||r.data?.entity_type==="grid")||null
  }
  return gridRowSnapshot
 };
 const customViews=()=>{
  if(viewRowsSnapshot!==rows||viewWorkSnapshot!==activeWorkId){
   viewRowsSnapshot=rows;viewWorkSnapshot=activeWorkId;
   viewRowsSnapshotValue=arr(rows).filter(r=>(r.record_type==="scheme_view"||r.data?.entity_type==="scheme_view")&&String(r.data?.work_type_id||"")===activeWorkId)
  }
  return viewRowsSnapshotValue
 };
 let activeViewSnapshotRows=null,activeViewSnapshotWork=null,activeViewSnapshotKey=null,activeViewSnapshot=null;
 const activeView=()=>{
  if(frameMode)return null;
  if(activeViewSnapshotRows!==rows||activeViewSnapshotWork!==activeWorkId||activeViewSnapshotKey!==activeScheme){
   activeViewSnapshotRows=rows;activeViewSnapshotWork=activeWorkId;activeViewSnapshotKey=activeScheme;
   activeViewSnapshot=customViews().find(r=>"view:"+r.id===activeScheme)||null
  }
  return activeViewSnapshot
 };
 const baseGrid=()=>gridRecord()?.data||emptyGrid;
 const activeGrid=()=>activeView()?.data?.grid||baseGrid();
 const groupKeys=v=>arr(v?.data?.mark_groups).map(String);
 const availableGroups=()=>{const map=new Map();for(const m of workMarks()){const g=markGroup(m),x=map.get(g.key)||{...g,count:0};x.count++;map.set(g.key,x)}return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,"ru"))};
 const gridCoords=(g,key)=>{const x=key==="x",axes=validAxes(g[x?"axes_x":"axes_y"])?g[x?"axes_x":"axes_y"]:(x?defaultAxesX:defaultAxesY),total=num(g[x?"span_x_mm":"span_y_mm"])||(x?defaultSpanX:defaultSpanY),spans=validSpans(g[x?"x_spans_mm":"y_spans_mm"],axes.length-1,total)?g[x?"x_spans_mm":"y_spans_mm"]:equalSpans(total,axes.length-1);return cumulative(axes,spans)};
 let baseCoordGrid=null,baseCoordX=null,baseCoordY=null;
 const worldPosition=c=>{
  if(c.absolute_x_mm!==undefined&&c.absolute_y_mm!==undefined&&Number.isFinite(Number(c.absolute_x_mm))&&Number.isFinite(Number(c.absolute_y_mm)))
   return{x:Number(c.absolute_x_mm),y:Number(c.absolute_y_mm)};
  const grid=baseGrid();
  if(baseCoordGrid!==grid){baseCoordGrid=grid;baseCoordX=gridCoords(grid,"x");baseCoordY=gridCoords(grid,"y")}
  return{x:num(baseCoordX.get(String(c.axis_x)))+num(c.offset_x_mm),y:num(baseCoordY.get(String(c.axis_y)))+num(c.offset_y_mm)}
 };
 const cumulative=(axes,spans)=>{let at=0;return new Map(axes.map((axis,i)=>{const here=at;if(i<spans.length)at+=num(spans[i]);return[axis,here]}))};
 const refreshGridModel=()=>{const g=activeGrid();axesX=validAxes(g.axes_x)?g.axes_x.map(x=>String(x).trim()):[...defaultAxesX];axesY=validAxes(g.axes_y)?g.axes_y.map(x=>String(x).trim()):[...defaultAxesY];gridDirX=g.x_direction==="rtl"?"rtl":"ltr";gridDirY=g.y_direction==="ttb"?"ttb":"btt";targetSpanX=num(g.span_x_mm)>0?num(g.span_x_mm):defaultSpanX;targetSpanY=num(g.span_y_mm)>0?num(g.span_y_mm):defaultSpanY;const gx=validSpans(g.x_spans_mm,axesX.length-1,targetSpanX)?g.x_spans_mm.map(num):equalSpans(targetSpanX,axesX.length-1),gy=validSpans(g.y_spans_mm,axesY.length-1,targetSpanY)?g.y_spans_mm.map(num):equalSpans(targetSpanY,axesY.length-1);gridXSpans=gx;gridYSpans=gy;spanX=gx.reduce((s,x)=>s+x,0);spanY=gy.reduce((s,x)=>s+x,0);axisXPos=cumulative(axesX,gx);axisYPos=cumulative(axesY,gy)};
 const workById=new Map(arr(workRows).map(r=>[String(r.id),r.data||{}]));
 const marks=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
 const norm=s=>String(s||"").trim().toLowerCase().replace(/ё/g,"е");
 const enabledWorks=()=>arr(workRows).filter(r=>r.data?.scheme_enabled===true).map(r=>({id:String(r.id),name:r.data?.work_type||r.title||"Без названия",code:r.data?.project_code||"",data:r.data||{}}));
 const schemeGroupOf=(name,mark="")=>{const s=norm(name);if(s.includes("фахвер"))return{key:"fahwerk",label:"Фахверк"};if(s.includes("колон"))return{key:"columns",label:"Колонны"};if(s.includes("связ"))return{key:"ties",label:"Связи"};if(s.includes("прогон"))return{key:"purlins",label:"Прогоны"};if(s.includes("распорк"))return{key:"spacers",label:"Распорки"};if(s.includes("балк"))return{key:"beams",label:"Балки"};if(s.includes("ферм"))return{key:"trusses",label:"Фермы"};if(s.includes("ригел"))return{key:"girders",label:"Ригели"};if(s.includes("огражд"))return{key:"guards",label:"Ограждения"};if(s.includes("лестн"))return{key:"stairs",label:"Лестницы"};if(s.includes("площад"))return{key:"platforms",label:"Площадки"};if(s.includes("стойк"))return{key:"posts",label:"Стойки"};const raw=String(name||mark||"Прочие марки").trim()||"Прочие марки",key="name:"+norm(raw).replace(/[^a-zа-я0-9]+/gi,"-").replace(/^-|-$/g,"");return{key,label:raw}};
 const markGroupCache=new WeakMap();
 const markGroup=m=>{
  if(m&&typeof m==="object"&&markGroupCache.has(m))return markGroupCache.get(m);
  const group=schemeGroupOf([m?.name,m?.work_type,workById.get(String(m?.work_type_id||""))?.work_type].filter(Boolean).join(" "),m?.mark||m?.title);
  if(m&&typeof m==="object")markGroupCache.set(m,group);
  return group
 };
  const frameCategories=["columns","fahwerk","girders","purlins","spacers","ties","beams","posts"];
  const frameKeys=new Set(frameCategories);
  const frameLabels={columns:"Колонны",fahwerk:"Фахверки",girders:"Ригели",purlins:"Прогоны",spacers:"Распорки",ties:"Связи",beams:"Балки",posts:"Стойки"};
 const markLabel=m=>{const w=workById.get(String(m.work_type_id||""))||{},name=m.name||"",wt=w.work_type||m.work_type||"";return [m.mark||m.title||"Без марки",name||wt].filter(Boolean).join(" · ")};

 const markById=new Map(marks.map(m=>[m.id,m]));
 // Preserve the original unique-match rules for old records without IDs,
 // but use indexed lookups instead of filtering every mark per member.
 const marksByName=new Map(),marksByWorkName=new Map();
 const markLookupKey=(workId,label)=>String(workId)+"\u001f"+norm(label);
 const appendMarkLookup=(index,key,value)=>{
  let values=index.get(key);if(!values){values=[];index.set(key,values)}values.push(value)
 };
 function rebuildMarkLookup(){
  marksByName.clear();marksByWorkName.clear();
  for(const mark of marks){
   const label=norm(mark.mark||mark.title);
   appendMarkLookup(marksByName,label,mark);
   appendMarkLookup(marksByWorkName,markLookupKey(mark.work_type_id||"",label),mark)
  }
 }
 rebuildMarkLookup();
 let updatingMarkProgress=false,syncNotice=null;
 async function refreshSchemeMarkProgress(){
  if(updatingMarkProgress)return;updatingMarkProgress=true;syncNotice=null;
  const button=document.getElementById("schemeRefreshMarkProgress"),message=document.getElementById("schemeMarkSyncNotice");
  if(button){button.disabled=true;button.textContent="Обновляем…"}
  if(message){message.hidden=false;message.className="scheme-mark-sync-result pending";message.textContent="Сверяем ежедневные отчёты и обновляем ведомость марок…"}
  const snapshot=m=>({id:String(m.id),mark:String(m.mark||m.title||""),workId:String(m.work_type_id||""),qty:Math.max(0,num(m.qty??m.count)),mounted:Math.max(0,num(m.mounted??m.done))});
  const before=new Map(activeMarks().map(m=>{const v=snapshot(m);return[v.id,v]}));
  try{
   if(typeof window.irSyncMountedFromReports!=="function")throw Error("Модуль сверки отчётов не подключён. Перезапустите приложение после обновления.");
   const audit=await window.irSyncMountedFromReports(oid);
   const fresh=await root.section("marks").list();
   const updated=arr(fresh).map(x=>({id:String(x.id),title:x.title||"",...(x.data||{})}));
   markRows=fresh;marks.splice(0,marks.length,...updated);
   markById.clear();marks.forEach(x=>markById.set(x.id,x));
   rebuildMarkLookup();
   cachedPlacementRows=null; // refreshed mark links invalidate the quota index
   const after=activeMarks().map(snapshot),seen=new Set(),changed=[];
   for(const v of after){
    seen.add(v.id);const old=before.get(v.id);
    if(!old||old.qty!==v.qty||old.mounted!==v.mounted)changed.push(v.mark||v.id)
   }
   for(const old of before.values())if(!seen.has(old.id))changed.push(old.mark||old.id);
   const summary=statusCounts(),names=[...new Set(changed)].slice(0,5);
   const details=changed.length?"Изменено марок: "+changed.length+(names.length?" ("+names.join(", ")+(changed.length>names.length?", …":"")+")":"")+".":"Изменений нет.";
   const verified="Сверено отчётов: "+audit.reportsChecked+", строк с привязкой к маркам: "+audit.linkedLines+". В ведомости объекта обновлено позиций: "+audit.updated+". ";
   const warnings=(audit.unrecognizedIds?.length?" В отчётах найдены отсутствующие в ведомости ID марок: "+audit.unrecognizedIds.length+".":"")+(audit.withoutMarkId?" Строк с названием марки, но без ID: "+audit.withoutMarkId+".":"");
   syncNotice={ok:true,text:"✓ Проверено в "+new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+". "+verified+details+" Смонтировано "+fmt(summary.mounted)+" из "+fmt(summary.total)+" шт., осталось "+fmt(summary.left)+" шт."+warnings};
  }catch(e){
   syncNotice={ok:false,text:"Не удалось обновить ведомость: "+String(e?.message||e)}
  }finally{
   updatingMarkProgress=false;draw();
   const ready=document.getElementById("schemeRefreshMarkProgress");if(ready){ready.disabled=false;ready.textContent="↻ Обновить по ведомости"}
  }
 }
 const markProgress=m=>{
  if(!m)return null;
  const total=Math.max(0,num(m.qty??m.count)),mounted=Math.min(total,Math.max(0,num(m.mounted??m.done)));
  return{total,mounted,left:Math.max(0,total-mounted),state:total<=0?"unknown":mounted>=total-1e-9?"mounted":mounted>0?"partial":"planned"}
 };
 const linkedMark=r=>{
  const byId=markById.get(String(r.mark_id||"")),workId=recordWorkId(r);
  if(byId&&String(byId.work_type_id||"")===workId)return byId;
  const candidates=marksByWorkName.get(markLookupKey(workId,r.mark))||[];
  return candidates.length===1?candidates[0]:null
 };
 const effectiveStatus=r=>{
  const progress=markProgress(linkedMark(r));
  return progress&&progress.state!=="unknown"?progress.state:String(r.status||"planned")
 };
 const statusCounts=()=>{
  const m=activeMarks(),placed=records(),total=m.reduce((acc,x)=>acc+(markProgress(x)?.total||0),0),mounted=m.reduce((acc,x)=>acc+(markProgress(x)?.mounted||0),0),partial=placed.filter(x=>effectiveStatus(x)==="partial").length,done=placed.filter(x=>effectiveStatus(x)==="mounted").length;
  return{total,mounted,left:Math.max(0,total-mounted),pct:total?Math.round(mounted/total*100):0,placed:placed.length,placedMounted:done,placedPartial:partial}
 };
 // Cache the placed records once per database snapshot. The editor previously
 // rescanned the complete scheme for every mark and every filter refresh.
 let cachedSchemeRows=null,cachedSchemeElements=[],indexedSchemeElements=new Map();
 let cachedPlacementRows=null,cachedPlacementCounts=new Map();
 const allRecords=()=>{
  if(cachedSchemeRows!==rows){
   cachedSchemeRows=rows;
   cachedSchemeElements=arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")
    .map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})}));
   indexedSchemeElements=new Map(cachedSchemeElements.map(r=>[String(r.id),r]));
   cachedPlacementRows=null;
  }
  return cachedSchemeElements;
 };
 const storedSchemeElement=id=>{allRecords();return indexedSchemeElements.get(String(id))||null};
 // Merge the normalized saved row from SQLite: a second full list() is not
 // necessary for a single create/update and would block a large 3D view.
 function rememberSavedSchemeRecord(saved){
  if(saved?.id==null)return false;
  const id=String(saved.id),at=arr(rows).findIndex(r=>String(r.id)===id);
  rows=at>=0?rows.map((r,i)=>i===at?saved:r):[saved,...rows];
  return true
 }
 const recordWorkId=r=>{
  const direct=String(r?.work_type_id||"");if(direct)return direct;
  const byId=markById.get(String(r?.mark_id||""));
  if(byId?.work_type_id)return String(byId.work_type_id);
  const matches=marksByName.get(norm(r?.mark))||[];
  return matches.length===1?String(matches[0].work_type_id||""):""
 };
 const workMarks=()=>frameMode?marks.filter(m=>frameKeys.has(markGroup(m).key)):activeWorkId?marks.filter(m=>String(m.work_type_id||"")===activeWorkId):[];
 const workRecords=()=>frameMode?allRecords().filter(r=>frameKeys.has(recordMarkGroup(r).key)):activeWorkId?allRecords().filter(r=>recordWorkId(r)===activeWorkId):[];
 const recordGroup=r=>r?.scheme_group&&String(r.scheme_group)!=="all"?{key:String(r.scheme_group),label:String(r.scheme_group_label||schemeGroupOf(r.mark_name,r.mark).label)}:schemeGroupOf(r?.mark_name,r?.mark);
 const recordMarkGroup=r=>{const m=markById.get(String(r.mark_id||""));return m?markGroup(m):recordGroup(r)};
 const inView=(r,v)=>{const assigned=String(r.scheme_view_id||"");return assigned?assigned!=="all"&&assigned===String(v.id):groupKeys(v).includes(recordMarkGroup(r).key)};
 const schemeGroups=()=>{const scoped=workMarks(),placed=workRecords();if(frameMode)return[{key:"all",label:"Весь каркас",marks:scoped.length,placed:placed.length},...frameCategories.map(key=>({key,label:frameLabels[key],marks:scoped.filter(m=>markGroup(m).key===key).length,placed:placed.filter(r=>recordMarkGroup(r).key===key).length}))];return[{key:"all",label:"Общая схема",marks:scoped.length,placed:placed.length},...customViews().map(v=>({key:"view:"+v.id,label:v.data?.name||v.title||"Новая сетка",marks:scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)).length,placed:placed.filter(r=>inView(r,v)).length}))]};
 const records=()=>{const v=activeView();return activeScheme==="all"?workRecords():frameMode?workRecords().filter(r=>recordMarkGroup(r).key===activeScheme):v?workRecords().filter(r=>inView(r,v)):[]};
 const activeGroup=()=>schemeGroups().find(g=>g.key===activeScheme)||schemeGroups()[0];
 const activeMarks=()=>{const scoped=workMarks(),v=activeView();return activeScheme==="all"?scoped:frameMode?scoped.filter(m=>markGroup(m).key===activeScheme):v?scoped.filter(m=>groupKeys(v).includes(markGroup(m).key)):[]};
 if(!activeWorkId)activeWorkId=enabledWorks()[0]?.id||String(workRows[0]?.id||"");
 refreshGridModel();
 const guessGeometry=m=>{const key=markGroup(m).key;if(["columns","fahwerk","posts"].includes(key))return"column";if(key==="ties")return"brace";if(key==="trusses")return"truss";return"beam"};
 const geometry=c=>["column","beam","bent","brace","truss"].includes(c.geometry_type)?c.geometry_type:c.absolute_x2_mm!==undefined&&c.absolute_y2_mm!==undefined?guessGeometry(c):"column";
 const closestAxis=(value,axes,pos)=>axes.reduce((best,a)=>Math.abs(num(pos.get(a))-value)<Math.abs(num(pos.get(best))-value)?a:best,axes[0]||"");
 const coord=c=>{const p=worldPosition(c),v=activeView(),own=v&&String(c.scheme_view_id||"")===String(v.id),axisX=own&&axesX.includes(String(c.axis_x))?String(c.axis_x):closestAxis(p.x,axesX,axisXPos),axisY=own&&axesY.includes(String(c.axis_y))?String(c.axis_y):closestAxis(p.y,axesY,axisYPos),dx=p.x-num(axisXPos.get(axisX)),dy=p.y-num(axisYPos.get(axisY)),x2=c.absolute_x2_mm!==undefined?num(c.absolute_x2_mm):p.x,y2=c.absolute_y2_mm!==undefined?num(c.absolute_y2_mm):p.y,z0=num(c.z0_mm),z1=num(c.z1_mm??8400),kind=geometry(c);return{x:p.x,y:p.y,x2,y2,z0,z1,z2:kind==="column"?z1:num(c.end_z_mm??c.z1_mm??8400),mx:num(c.absolute_mid_x_mm??p.x),my:num(c.absolute_mid_y_mm??p.y),mz:num(c.mid_z_mm??z1),axisX,axisY,dx,dy,geometryType:kind}};
 const allVisibleTypes=()=>availableGroups().filter(g=>activeScheme==="all"||(frameMode?g.key===activeScheme:groupKeys(activeView()).includes(g.key))).sort((a,b)=>frameMode?frameCategories.indexOf(a.key)-frameCategories.indexOf(b.key):a.label.localeCompare(b.label,"ru"));
 const isShown=c=>{if(hiddenGroups.has(recordMarkGroup(c).key))return false;if(statusFilter!=="all"&&effectiveStatus(c)!==statusFilter)return false;const start=num(c.z0_mm),end=num(c.end_z_mm??c.z1_mm??8400),mid=geometry(c)==="bent"?num(c.mid_z_mm):start,lo=Math.min(start,end,mid),hi=Math.max(start,end,mid),min=String(levelMin).trim()===""?null:Number(levelMin),max=String(levelMax).trim()===""?null:Number(levelMax);if(min!==null&&Number.isFinite(min)&&hi<min)return false;if(max!==null&&Number.isFinite(max)&&lo>max)return false;return true};
 const columns=()=>records().filter(isShown).map(c=>({...c,...coord(c),status:effectiveStatus(c)}));
 const selected=()=>columns().find(x=>x.id===selectedId)||null;
 const resolveSavedMarkId=c=>{const pool=activeMarks();if(!c)return String(pool[0]?.id||"");const direct=pool.find(m=>m.id===String(c.mark_id||""));if(direct)return direct.id;const snap=String(c.mark||"").trim().toLowerCase(),snapName=String(c.mark_name||"").trim().toLowerCase();const exact=snap&&pool.find(m=>String(m.mark||m.title||"").trim().toLowerCase()===snap);if(exact)return exact.id;const byName=snapName&&pool.find(m=>String(m.name||"").trim().toLowerCase()===snapName);return byName?.id||""};
 const gridForEditor=key=>{
  const v=String(key||"")==="all"?null:customViews().find(view=>"view:"+view.id===key)||null;
  const g=v?.data?.grid||baseGrid();
  const ax=validAxes(g.axes_x)?g.axes_x.map(String):[...defaultAxesX],ay=validAxes(g.axes_y)?g.axes_y.map(String):[...defaultAxesY];
  return{view:v,key:v?"view:"+v.id:"all",axesX:ax,axesY:ay,xPos:gridCoords(g,"x"),yPos:gridCoords(g,"y")}
 };
 const marksForGrid=key=>{
  const v=key==="all"?null:customViews().find(x=>"view:"+x.id===key);
  return v?workMarks().filter(m=>groupKeys(v).includes(markGroup(m).key)):workMarks()
 };
 const markPlacement=m=>{
  if(!m)return{total:0,placed:0,left:0};
  allRecords();
  if(cachedPlacementRows!==rows){
   const counts=new Map();
   for(const r of cachedSchemeElements){
    const ids=new Set([String(r.mark_id||""),String(linkedMark(r)?.id||"")]);
    ids.delete("");
    for(const id of ids)counts.set(id,(counts.get(id)||0)+1);
   }
   cachedPlacementCounts=counts;
   cachedPlacementRows=rows;
  }
  const total=Math.max(0,Math.floor(num(m.qty??m.count)));
  const placed=cachedPlacementCounts.get(String(m.id))||0;
  return{total,placed,left:Math.max(0,total-placed)}
 };
 const markAvailable=(m,editingId="")=>{
  const q=markPlacement(m),own=editingId&&storedSchemeElement(editingId);
  // Existing placements remain editable even if older data exceeded today's quantity.
  return Boolean(own&&(String(own.mark_id||"")===String(m.id)||String(linkedMark(own)?.id||"")===String(m.id)))||q.placed<q.total
 };
 const searchMarks=(query,pool=activeMarks())=>{const q=String(query||"").trim().toLowerCase();if(!q)return [...pool];return pool.map(m=>{const mark=String(m.mark||m.title||"").trim().toLowerCase(),name=String(m.name||"").trim().toLowerCase(),text=`${mark} ${name}`;let score=99;if(mark===q)score=0;else if(mark.startsWith(q))score=1;else if(mark.includes(q))score=2;else if(name.startsWith(q))score=3;else if(name.includes(q)||text.includes(q))score=4;return{m,score}}).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||String(a.m.mark||a.m.title||"").localeCompare(String(b.m.mark||b.m.title||""),"ru",{numeric:true,sensitivity:"base"})).map(x=>x.m)};
 const markOptions=(selectedMark,query="",unresolved=false,pool=activeMarks(),editingId="")=>{
  const q=String(query||"").trim(),visible=searchMarks(q,pool),available=visible.filter(m=>markAvailable(m,editingId));
  const hasSelected=visible.some(m=>m.id===String(selectedMark)&&markAvailable(m,editingId));
  let prefix="";
  if(unresolved&&!q)prefix='<option value="" selected>Марка не найдена — выберите заново</option>';
  else if(!hasSelected)prefix='<option value="" selected>Выберите марку (доступно: '+available.length+')</option>';
  if(!visible.length)return'<option value="" selected>Ничего не найдено</option>';
  return prefix+visible.map(m=>{
   const q=markPlacement(m),remaining=markAvailable(m,editingId),disabled=!remaining;
   return `<option value="${esc(m.id)}" ${disabled?'disabled data-exhausted="1"':''} ${hasSelected&&String(selectedMark)===m.id?"selected":""}>${esc(markLabel(m))} · На схеме: ${q.placed} из ${q.total} · Осталось: ${q.left}${disabled?" · НЕТ ОСТАТКА":""}</option>`
  }).join("")
 };
 const axisOptions=(items,value)=>items.map(x=>`<option value="${esc(x)}" ${String(value)===x?"selected":""}>${esc(x)}</option>`).join("");
 const statusText=s=>s==="mounted"?"Смонтирована":s==="partial"?"Частично смонтирована":"Не смонтирована";
 const sectionType=c=>{const explicit=String(c?.section_type||"").trim().toLowerCase();if(["ibeam","square","round","box"].includes(explicit))return explicit;const s=`${c?.profile_name||""} ${c?.mark_name||""}`.toLowerCase();if(/круг|труб.*ø|труб.*ф|ø|⌀/.test(s))return"round";if(/квад|проф.*труб|\d+\s*[xх×]\s*\d+/.test(s))return"square";if(/короб|сварн.*короб/.test(s))return"box";return"ibeam"};
 const sectionTypeLabel=t=>({ibeam:"Двутавр",square:"Квадратная труба",round:"Круглая труба",box:"Короб / сплошное"}[t]||"Двутавр");
 const profileText=c=>String(c?.profile_name||"").trim()||sectionTypeLabel(sectionType(c));
 const sectionOptions=value=>[["ibeam","Двутавр"],["square","Квадратная труба"],["round","Круглая труба"],["box","Короб / сплошное"]].map(([v,n])=>`<option value="${v}" ${value===v?"selected":""}>${n}</option>`).join("");
 const geometryLabel=kind=>({column:"Колонна / стойка",beam:"Балка / прогон / ригель",bent:"Ломаная балка (3 точки)",brace:"Связь / раскос",truss:"Ферма"}[kind]||"Колонна / стойка");
 const geometryOptions=kind=>[["column","Колонна / стойка"],["beam","Балка / прогон / ригель"],["bent","Ломаная балка (3 точки)"],["brace","Связь / раскос"],["truss","Ферма"]].map(([k,label])=>`<option value="${k}" ${k===kind?"selected":""}>${label}</option>`).join("");
 const spanSummary=spans=>{const min=Math.min(...spans),max=Math.max(...spans),avg=spans.reduce((s,x)=>s+x,0)/Math.max(1,spans.length);return max-min<=1?`≈ по ${fmt(avg)} мм`:"индивидуальные размеры"};
 const pairLabel=(items,i)=>`${items[i]}–${items[i+1]}`;
 function stats(){
  const cols=records(),mounted=cols.filter(x=>effectiveStatus(x)==="mounted").length,partial=cols.filter(x=>effectiveStatus(x)==="partial").length;
  return{total:cols.length,mounted,partial,left:cols.length-mounted-partial,pct:cols.length?Math.round(mounted/cols.length*100):0}
 }
 const line=(a,b,cls)=>`<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" class="${cls}"/>`;
 function axisText(c){
  const x=c.dx?`${c.axisX} ${c.dx>=0?"+":"−"} ${fmt(Math.abs(c.dx))} мм`:c.axisX,y=c.dy?`${c.axisY} ${c.dy>=0?"+":"−"} ${fmt(Math.abs(c.dy))} мм`:c.axisY;
  return{x,y}
 }
 function offsetText(c){
  const parts=[],xn=`${axesX[0]}–${axesX.at(-1)}`,yn=`${axesY[0]}–${axesY.at(-1)}`;if(c.dx)parts.push(`по ${xn}: ${c.dx>=0?"+":"−"}${fmt(Math.abs(c.dx))} мм`);if(c.dy)parts.push(`по ${yn}: ${c.dy>=0?"+":"−"}${fmt(Math.abs(c.dy))} мм`);return parts.join(" · ")
 }
 function columnTitle(c){
  const a=axisText(c),mark=c.mark||"—",name=c.mark_name||"",kind=c.geometryType||geometry(c),progress=markProgress(linkedMark(c));
  return `${mark}${name?" · "+name:""}\nТип: ${geometryLabel(kind)}\nПрофиль: ${profileText(c)}${progress?.total>0?"\nПо ведомости: "+fmt(progress.mounted)+" из "+fmt(progress.total)+" смонтировано · осталось "+fmt(progress.left):""}\nОси: ${a.x} / ${a.y}\nНачало: X ${fmt(c.x)} · Y ${fmt(c.y)} · Z ${fmt(c.z0)} мм${kind==="bent"?"\nКонёк: X "+fmt(c.mx)+" · Y "+fmt(c.my)+" · Z "+fmt(c.mz)+" мм":""}\nКонец: X ${fmt(c.x2)} · Y ${fmt(c.y2)} · Z ${fmt(c.z2)} мм${kind==="bent"?"\nДлина: "+fmt(Math.hypot(c.mx-c.x,c.my-c.y,c.mz-c.z0)+Math.hypot(c.x2-c.mx,c.y2-c.my,c.z2-c.mz))+" мм":""}${c.dx||c.dy?"\nСмещение: "+offsetText(c):""}`
 }
 function placeSchemeLabel(px,py,lw,lh,index,occupied,W,H,preferBelow=false){
  const gap=9,side=index%2?-1:1,clamp=(v,min,max)=>Math.max(min,Math.min(max,v)),hits=r=>occupied.some(o=>!(r.x+r.w+4<o.x||r.x>o.x+o.w+4||r.y+r.h+4<o.y||r.y>o.y+o.h+4));
  const raw=[
   {x:px+(side>0?gap:-lw-gap),y:preferBelow?py+gap:py-lh-gap},
   {x:px+(side<0?gap:-lw-gap),y:preferBelow?py+gap:py-lh-gap},
   {x:px-lw/2,y:py-lh-13},
   {x:px-lw/2,y:py+13},
   {x:px+(side>0?gap:-lw-gap),y:py-lh/2},
   {x:px+(side<0?gap:-lw-gap),y:py-lh/2}
  ];
  for(const d of [24,44,64]){raw.push({x:px+(side>0?gap:-lw-gap),y:py-lh-d},{x:px+(side<0?gap:-lw-gap),y:py-lh-d},{x:px+(side>0?gap:-lw-gap),y:py+d},{x:px+(side<0?gap:-lw-gap),y:py+d})}
  let best=null;
  for(const q of raw){const r={x:clamp(q.x,6,W-lw-6),y:clamp(q.y,6,H-lh-6),w:lw,h:lh};if(!hits(r)){best=r;break}}
  if(!best){let row=0;do{const y=clamp(8+row*(lh+5),6,H-lh-6),x=clamp(px-lw/2+(row%2?lw+8:-lw-8),6,W-lw-6),r={x,y,w:lw,h:lh};if(!hits(r)){best=r;break}row++}while(row<20)}
  best=best||{x:clamp(px+gap,6,W-lw-6),y:clamp(py-lh-gap,6,H-lh-6),w:lw,h:lh};occupied.push(best);
  const ax=px<best.x?best.x:px>best.x+lw?best.x+lw:px,ay=py<best.y?best.y:py>best.y+lh?best.y+lh:py;
  return{lx:best.x,ly:best.y,anchorX:ax,anchorY:ay}
 }
 function svgBubble(x,y,label,cls="scheme-axis-bubble"){
  return `<g class="${cls}"><circle cx="${x}" cy="${y}" r="10"/><text x="${x}" y="${y+3.4}">${esc(label)}</text></g>`
 }
 function planSectionSymbol(c,x,y,radius=6){
  const t=sectionType(c),rot=num(c.rotation_deg)+viewRotation,factor=radius/6,stroke=Math.min(2.2,Math.max(.45,radius*.31)),tr=`translate(${x} ${y}) rotate(${rot}) scale(${factor.toFixed(4)})`,style=` style="--scheme-symbol-stroke:${stroke.toFixed(2)}px"`;
  if(t==="round")return`<g transform="${tr}" class="scheme-plan-section"${style}><circle r="6" class="scheme-plan-section-outer"/><circle r="3.4" class="scheme-plan-section-inner"/></g>`;
  if(t==="square")return`<g transform="${tr}" class="scheme-plan-section"${style}><rect x="-6" y="-6" width="12" height="12" rx="1" class="scheme-plan-section-outer"/><rect x="-3.5" y="-3.5" width="7" height="7" rx=".7" class="scheme-plan-section-inner"/></g>`;
  if(t==="box")return`<g transform="${tr}" class="scheme-plan-section"${style}><rect x="-5.5" y="-5.5" width="11" height="11" rx="1" class="scheme-plan-box"/></g>`;
  return`<g transform="${tr}" class="scheme-plan-section"${style}><path d="M-6 -5V5 M6 -5V5 M-6 0H6" class="scheme-plan-ibeam"/><circle r="1.8" class="scheme-plan-dot"/></g>`
 }
 function planSvg(cols){
  const W=1040,H=650,padX=190,padY=98,r=((viewRotation%360)+360)%360,xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`;
  const rot90=r===90||r===270,totalW=rot90?spanY:spanX,totalH=rot90?spanX:spanY,availW=W-padX*2,availH=H-padY*2,scale=Math.min(availW/Math.max(1,totalW),availH/Math.max(1,totalH)),gridW=totalW*scale,gridH=totalH*scale,left=(W-gridW)/2,gridTop=(H-gridH)/2;
  const p=(x,y)=>{const bx=gridDirX==="rtl"?spanX-x:x,by=gridDirY==="btt"?spanY-y:y;let u=bx,v=by;if(r===90){u=spanY-by;v=bx}else if(r===180){u=spanX-bx;v=spanY-by}else if(r===270){u=by;v=spanX-bx}return{x:left+u*scale,y:gridTop+v*scale}};
  const extend=(a,b,d)=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.max(1,Math.hypot(dx,dy)),ux=dx/l,uy=dy/l;return[{x:a.x-ux*d,y:a.y-uy*d},{x:b.x+ux*d,y:b.y+uy*d}]};
  const outward=(q,d)=>{const dx=q.x-W/2,dy=q.y-H/2,l=Math.max(1,Math.hypot(dx,dy));return{x:q.x+dx/l*d,y:q.y+dy/l*d}};
  const corners=[p(0,0),p(spanX,0),p(spanX,spanY),p(0,spanY)],poly=corners.map(q=>`${q.x},${q.y}`).join(" ");
  let grid=`<polygon points="${poly}" class="scheme-grid-floor-plan"/><polygon points="${poly}" class="scheme-grid-outline-plan" fill="none" stroke="#a7bfd0" stroke-width="1.2"/>`;
  axesX.forEach(axis=>{const x=axisXPos.get(axis),a=p(x,0),b=p(x,spanY),[la,lb]=extend(a,b,20);grid+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="scheme-grid-line"/>${svgBubble(la.x,la.y,axis)}${svgBubble(lb.x,lb.y,axis)}`});
  axesY.forEach(axis=>{const y=axisYPos.get(axis),a=p(0,y),b=p(spanX,y),[la,lb]=extend(a,b,20);grid+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="scheme-grid-line"/>${svgBubble(la.x,la.y,axis)}${svgBubble(lb.x,lb.y,axis)}`});
  if(dimensionsVisible){
   const drawSpan=(q1,q2,dist)=>{
    const horizontal=Math.abs(q2.x-q1.x)>=Math.abs(q2.y-q1.y);
    if(horizontal){
     const y=gridTop+gridH+42,x1=q1.x,x2=q2.x,mx=(x1+x2)/2;
     grid+=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="scheme-span-line"/><line x1="${x1}" y1="${y-4}" x2="${x1}" y2="${y+4}" class="scheme-span-tick"/><line x1="${x2}" y1="${y-4}" x2="${x2}" y2="${y+4}" class="scheme-span-tick"/><text x="${mx}" y="${y+13}" class="scheme-span-text">${fmt(dist)} мм</text>`
    }else{
     const x=left-38,y1=q1.y,y2=q2.y,my=(y1+y2)/2,tx=x-12;
     grid+=`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" class="scheme-span-line"/><line x1="${x-4}" y1="${y1}" x2="${x+4}" y2="${y1}" class="scheme-span-tick"/><line x1="${x-4}" y1="${y2}" x2="${x+4}" y2="${y2}" class="scheme-span-tick"/><text x="${tx}" y="${my}" class="scheme-span-text" transform="rotate(-90 ${tx} ${my})">${fmt(dist)} мм</text>`
    }
   };
   gridXSpans.forEach((dist,i)=>drawSpan(p(axisXPos.get(axesX[i]),0),p(axisXPos.get(axesX[i+1]),0),dist));
   gridYSpans.forEach((dist,i)=>drawSpan(p(0,axisYPos.get(axesY[i])),p(0,axisYPos.get(axesY[i+1])),dist))
  }
  const horizName=rot90?yName:xName,horizSize=rot90?spanY:spanX,vertName=rot90?xName:yName,vertSize=rot90?spanX:spanY,totalY=gridTop+gridH+(dimensionsVisible?72:52),totalX=left+gridW+(dimensionsVisible?66:54);
  grid+=`<line x1="${left}" y1="${totalY}" x2="${left+gridW}" y2="${totalY}" class="scheme-dim-line"/><line x1="${left}" y1="${totalY-5}" x2="${left}" y2="${totalY+5}" class="scheme-dim-line"/><line x1="${left+gridW}" y1="${totalY-5}" x2="${left+gridW}" y2="${totalY+5}" class="scheme-dim-line"/><text x="${W/2}" y="${totalY+17}" class="scheme-dim-text">${esc(horizName)} = ${fmt(horizSize)} мм</text>`;
  grid+=`<line x1="${totalX}" y1="${gridTop}" x2="${totalX}" y2="${gridTop+gridH}" class="scheme-dim-line"/><line x1="${totalX-5}" y1="${gridTop}" x2="${totalX+5}" y2="${gridTop}" class="scheme-dim-line"/><line x1="${totalX-5}" y1="${gridTop+gridH}" x2="${totalX+5}" y2="${gridTop+gridH}" class="scheme-dim-line"/><text x="${totalX+18}" y="${H/2}" class="scheme-dim-text" transform="rotate(-90 ${totalX+18} ${H/2})">${esc(vertName)} = ${fmt(vertSize)} мм</text>`;
  const projectedColumns=cols.filter(c=>c.geometryType==="column").map(c=>({id:c.id,at:p(c.x,c.y)}));
  const nearestPlanDistance=(id,at)=>{let nearest=Infinity;for(const other of projectedColumns){if(other.id===id)continue;const d=Math.hypot(other.at.x-at.x,other.at.y-at.y);if(d>.01&&d<nearest)nearest=d}return nearest};
  let columnsSvg="",labelBoxes=[];
  cols.forEach((c,index)=>{
   const q=p(c.x,c.y),end=p(c.x2,c.y2),kink=c.geometryType==="bent"?p(c.mx,c.my):null,isColumn=c.geometryType==="column",center=isColumn?q:kink||{x:(q.x+end.x)/2,y:(q.y+end.y)/2},axis=p(axisXPos.get(c.axisX),axisYPos.get(c.axisY)),x=center.x,y=center.y,axisX=axis.x,axisY=axis.y,isSelected=c.id===selectedId,sel=isSelected?" selected":"",status=c.status==="mounted"?" mounted":c.status==="partial"?" partial":" planned",between=c.dx||c.dy?" between":"",showLabel=isSelected||(labelsVisible&&index<Math.max(24,zoom>1.8?70:36)),label=String(c.mark||"—"),lw=Math.max(28,Math.min(64,14+label.length*6.2)),lh=20,placed=showLabel?placeSchemeLabel(x,y,lw,lh,index,labelBoxes,W,H,y<gridTop+70):null,lx=placed?.lx||0,ly=placed?.ly||0,anchorX=placed?.anchorX||x,anchorY=placed?.anchorY||y;
   const showOffset=!!(c.dx||c.dy)&&dimensionsVisible&&isSelected,midX=(q.x+axisX)/2,midY=(q.y+axisY)/2,kind=c.geometryType;
   const nearest=isColumn?nearestPlanDistance(c.id,q):Infinity,symbolRadius=isColumn?Math.max(.8,Math.min(6,650*scale,(nearest-3.5)/2)):6,hitRadius=isColumn?Math.max(1.5,Math.min(10,nearest*.42)):10;
   const symbol=isColumn?planSectionSymbol(c,q.x,q.y,symbolRadius):kind==="bent"?line(q,kink,"scheme-plan-member")+line(kink,end,"scheme-plan-member"):kind==="truss"?`${line(q,end,"scheme-plan-member")}${line({x:q.x,y:q.y+3},{x:end.x,y:end.y+3},"scheme-plan-truss")}`:line(q,end,kind==="brace"?"scheme-plan-brace":"scheme-plan-member");
   columnsSvg+=`<g class="scheme-column scheme-geometry-${kind}${status}${sel}${between}" data-column="${esc(c.id)}" tabindex="0"><title>${esc(columnTitle(c))}</title><circle cx="${q.x}" cy="${q.y}" r="${hitRadius}" class="scheme-column-hit"/>${isColumn?"":kink?`<line x1="${q.x}" y1="${q.y}" x2="${kink.x}" y2="${kink.y}" class="scheme-column-hit-line"/><line x1="${kink.x}" y1="${kink.y}" x2="${end.x}" y2="${end.y}" class="scheme-column-hit-line"/>`:`<line x1="${q.x}" y1="${q.y}" x2="${end.x}" y2="${end.y}" class="scheme-column-hit-line"/>`}${showOffset?`<line x1="${axisX}" y1="${axisY}" x2="${q.x}" y2="${q.y}" class="scheme-offset-line"/><circle cx="${axisX}" cy="${axisY}" r="3" class="scheme-offset-origin"/><text x="${midX}" y="${midY-7}" class="scheme-offset-text">${esc(offsetText(c))}</text>`:""}${symbol}${showLabel?`<line x1="${x}" y1="${y}" x2="${anchorX}" y2="${anchorY}" class="scheme-label-leader"/><g class="scheme-column-label compact${isSelected?" selected-label":""}"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="5"/><text x="${lx+7}" y="${ly+13.5}" class="scheme-label-position">${esc(label)}</text></g>`:""}</g>`;

  });
  return`<g class="scheme-grid-layer">${grid}</g><g class="scheme-column-layer">${columnsSvg}</g>`
 }
 function zoomTransform(){return `translate(${520+panX} ${325+panY}) scale(${zoom}) translate(-520 -325)`}
 function setZoom(next,resetPan=false){
  zoom=Math.max(.6,Math.min(3,Math.round(next*100)/100));if(resetPan){panX=0;panY=0}renderScene();const z=document.getElementById("schemeZoomValue");if(z)z.textContent=`${Math.round(zoom*100)}%`
 }
 function bindScenePanZoom(box){
  const svg=box.querySelector("svg"),layer=box.querySelector("#schemeZoomLayer");if(!svg||!layer)return;
  let dragging=false,lastX=0,lastY=0,startX=0,startY=0,moved=false;
  svg.onpointerdown=e=>{if(e.button!==0||e.target.closest?.("[data-column]"))return;dragging=true;moved=false;startX=lastX=e.clientX;startY=lastY=e.clientY;svg.classList.add("dragging");svg.setPointerCapture?.(e.pointerId);e.preventDefault()};
  svg.onpointermove=e=>{if(!dragging)return;if(Math.hypot(e.clientX-startX,e.clientY-startY)>4)moved=true;const rect=svg.getBoundingClientRect(),sx=1040/Math.max(1,rect.width),sy=650/Math.max(1,rect.height);if(moved){panX+=(e.clientX-lastX)*sx;panY+=(e.clientY-lastY)*sy;layer.setAttribute("transform",zoomTransform())}lastX=e.clientX;lastY=e.clientY};
  const stop=(e,clearOnClick=false)=>{if(!dragging)return;const wasMoved=moved;dragging=false;svg.classList.remove("dragging");try{svg.releasePointerCapture?.(e.pointerId)}catch{};if(clearOnClick&&!wasMoved&&selectedId){selectedId="";renderScene();renderDetails()}};
  svg.onpointerup=e=>stop(e,true);svg.onpointercancel=e=>stop(e,false);svg.onpointerleave=e=>{if(dragging&&e.buttons===0)stop(e,false)};
  svg.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();setZoom(zoom+(e.deltaY<0?.15:-.15))};
 }

 // Direct placement uses the existing scheme_column record format.
 async function createFrameMember(placement){
  if(!canEdit())throw Error("Нет прав для изменения монтажной схемы.");
  const mark=marks.find(m=>m.id===String(placement?.markId||""));
  if(!mark||!activeMarks().some(m=>m.id===mark.id)||!markAvailable(mark))throw Error("Марка отсутствует или все экземпляры уже размещены.");
  const kind=guessGeometry(mark);
  if(kind!==placement.geometry&&!(kind==="beam"&&placement.geometry==="bent"))throw Error("Выбранная марка и тип конструкции не совпадают.");
  const existingAnchors=allRecords();
  // An existing column or beam may legitimately overhang the nominal grid.
  // The exact snap point is allowed only when it lies ON that stored element.
  const attachedToExisting=(id,x,y,z)=>{
   const found=existingAnchors.find(r=>String(r.id)===id);
   if(!found)return false;
   const c=coord(found),start=[c.x,c.y,c.z0],
    end=c.geometryType==="column"?[c.x,c.y,c.z2]:[c.x2,c.y2,c.z2],
    vertices=c.geometryType==="bent"?[start,[c.mx,c.my,c.mz],end]:[start,end];
   return vertices.slice(1).some((b,i)=>{
    const a=vertices[i],vx=b[0]-a[0],vy=b[1]-a[1],vz=b[2]-a[2],
     length2=vx*vx+vy*vy+vz*vz,
     t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy+(z-a[2])*vz)/(length2||1)));
    return Math.hypot(x-a[0]-vx*t,y-a[1]-vy*t,z-a[2]-vz*t)<=35
   });
  };
  const point=a=>{
   if(!a||!axesX.includes(String(a.ax))||!axesY.includes(String(a.ay))||!Number.isFinite(Number(a.z)))throw Error("Укажите оси и точную отметку Z.");
   const rawX=num(axisXPos.get(String(a.ax)))+num(a.dx),
    rawY=num(axisYPos.get(String(a.ay)))+num(a.dy),z=Number(a.z),
    // Treat only sub-millimetre numeric imprecision at an edge as in-bounds.
    x=rawX<0&&rawX>=-1?0:rawX>spanX&&rawX<=spanX+1?spanX:rawX,
    y=rawY<0&&rawY>=-1?0:rawY>spanY&&rawY<=spanY+1?spanY:rawY,
    memberId=String(a.memberId||a.columnId||""),
    inBounds=x>=0&&x<=spanX&&y>=0&&y<=spanY;
   if(!inBounds&&!memberId)throw Error("Точка X "+fmt(x)+" / Y "+fmt(y)+" мм выходит за сетку "+fmt(spanX)+" × "+fmt(spanY)+" мм. Выберите место внутри сетки или привязку к существующему элементу.");
   if(memberId&&!attachedToExisting(memberId,x,y,z))throw Error("Точка крепления не совпадает с существующим элементом. Выберите его ещё раз.");
   return{x,y,z,ax:String(a.ax),ay:String(a.ay),dx:x-num(axisXPos.get(String(a.ax))),dy:y-num(axisYPos.get(String(a.ay))),memberId};
  };
  const start=point(placement.start);
  const end=kind==="column"?{...start,z:Number(placement.topZ)}:point(placement.end);
  const centerRidge=placement.geometry==="bent"&&placement.ridgeMode!=="manual";
  // In center mode, X/Y are derived from the two endpoints, never from a
  // cursor-picked coordinate or an arbitrary nearby axis.
  const ridgeInput=placement.geometry==="bent"?placement.middle:null;
  const middle=placement.geometry!=="bent"?null:centerRidge?
   (()=>{
    if(!ridgeInput||!Number.isFinite(Number(ridgeInput.z)))throw Error("Укажите отметку Z конька.");
    const x=Math.round((start.x+end.x)/2),y=Math.round((start.y+end.y)/2),
     ax=closestAxis(x,axesX,axisXPos),ay=closestAxis(y,axesY,axisYPos);
    return{x,y,z:Number(ridgeInput.z),ax,ay,dx:x-num(axisXPos.get(ax)),dy:y-num(axisYPos.get(ay)),memberId:""}
   })():point(ridgeInput);
  if(middle&&(Math.hypot(middle.x-start.x,middle.y-start.y,middle.z-start.z)<1||Math.hypot(end.x-middle.x,end.y-middle.y,end.z-middle.z)<1))throw Error("Для ломаной балки нужны три различные точки.");
  if(!Number.isFinite(end.z)||Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)<1)throw Error("Начало и конец должны различаться.");
  if(kind==="column"&&end.z<=start.z)throw Error("Верх колонны должен быть выше низа.");
  const existing=allRecords(),used=new Set(existing.map(r=>String(r.position||r.title||"")));
  let index=1,title;do{title="COL-"+String(index++).padStart(4,"0")}while(used.has(title));
  const group=markGroup(mark),reference=existing.find(r=>String(r.mark_id||"")===mark.id);
  const payload={record_type:"scheme_column",title,data:{
   entity_type:"column",position:title,mark_id:mark.id,mark:mark.mark||mark.title||"",mark_name:mark.name||"",work_type_id:String(mark.work_type_id||""),
   axis_x:start.ax,axis_y:start.ay,offset_x_mm:start.dx,offset_y_mm:start.dy,absolute_x_mm:start.x,absolute_y_mm:start.y,
   geometry_type:placement.geometry,absolute_x2_mm:kind==="column"?undefined:end.x,absolute_y2_mm:kind==="column"?undefined:end.y,
   absolute_mid_x_mm:middle?.x,absolute_mid_y_mm:middle?.y,mid_z_mm:middle?.z,
   mid_axis_x:middle?.ax,mid_axis_y:middle?.ay,mid_offset_x_mm:middle?.dx,mid_offset_y_mm:middle?.dy,mid_anchor_member_id:middle?.memberId||undefined,
   ridge_mode:placement.geometry==="bent"?(centerRidge?"center":"manual"):undefined,
   end_axis_x:kind==="column"?undefined:end.ax,end_axis_y:kind==="column"?undefined:end.ay,
   end_offset_x_mm:kind==="column"?undefined:end.dx,end_offset_y_mm:kind==="column"?undefined:end.dy,
   z0_mm:start.z,z1_mm:end.z,end_z_mm:kind==="column"?undefined:end.z,
   start_anchor_member_id:start.memberId||undefined,end_anchor_member_id:end.memberId||undefined,
   status:"planned",section_type:sectionType(reference||{}),profile_name:reference?.profile_name||"",
   scheme_group:group.key,scheme_group_label:group.label,scheme_view_id:"all"
  }};
  const saved=await schemeApi.create(payload);
  if(!rememberSavedSchemeRecord(saved))rows=await schemeApi.list();
  selectedId=String(saved?.id||"");
  return{savedEnd:{ax:end.ax,ay:end.ay,x:end.x,y:end.y,z:end.z}};
 }

 // Confirm dialogs in nested Electron tabs can leave the keyboard aimed
 // at a destroyed/hidden native browsing context, despite a visible caret.
 function restoreKeyboardAfterConfirm(){
  try{window.frameElement?.focus({preventScroll:true});window.focus()}catch(_error){}
  requestAnimationFrame(()=>{
   try{window.frameElement?.focus({preventScroll:true});window.focus()}catch(_error){}
   const search=document.getElementById("irbMarkSearch");
   if(search?.isConnected)search.focus({preventScroll:true});
  });
 }
 // Preserve the existing 3D canvas, WebGL context and active input on
 // layer/status/elevation changes. Only update currently visible elements.
 function updateLayerVisibility(){
  const groups=allVisibleTypes();
  document.querySelectorAll("[data-scheme-layer]").forEach(btn=>{
   const visible=!hiddenGroups.has(btn.dataset.schemeLayer);
   btn.classList.toggle("on",visible);btn.classList.toggle("off",!visible);
   btn.setAttribute("aria-pressed",String(visible));
  });
  const heading=document.querySelector(".scheme-layers>summary small");
  if(heading)heading.textContent=groups.filter(g=>!hiddenGroups.has(g.key)).length+" из "+groups.length;
  const visible=columns();
  const count=document.querySelector(".scheme-visible-counter b");if(count)count.textContent=String(visible.length);
  if(mode==="building"&&window.irBuildingView?.updateVisibility)
   window.irBuildingView.updateVisibility(visible,groups.map(g=>({...g,visible:!hiddenGroups.has(g.key)})));
  else renderScene();
 }

 // Updating the current 3D model does not require destroying the entire
 // application layout or recreating its expensive WebGL resources.
 function refreshAfterMemberChange(){
  if(mode!=="building"||!document.getElementById("irbCanvas")||typeof window.irBuildingView?.updateRecords!=="function"){
   draw();return
  }
  const visible=columns(),groups=allVisibleTypes();
  const available=activeMarks().map(m=>{
   const q=markPlacement(m);
   return{id:m.id,title:markLabel(m),mark:m.mark||m.title,total:q.total,placed:q.placed,left:q.left,geometry:guessGeometry(m)}
  });
  window.irBuildingView.updateRecords(visible,groups.map(g=>({...g,visible:!hiddenGroups.has(g.key)})),available,selectedId);
  // The live 3D sidebar is updated by updateRecords; also refresh the
  // separate schemeDetails panel, which otherwise retains old Z values.
  renderDetails();
  const s=stats(),mp=statusCounts();
  const summary=document.querySelector(".scheme-summary");
  if(summary?.children[2]){
   const value=summary.children[2].querySelector("b");
   if(value)value.textContent=String(s.total);
   const note=summary.children[2].querySelector("small");
   if(note)note.textContent=activeGroup().label+" · "+activeMarks().length+" позиций ведомости";
  }
  if(summary?.children[3]){
   const value=summary.children[3].querySelector("b");
   if(value)value.textContent=mp.pct+"%";
   const note=summary.children[3].querySelector("small");
   if(note)note.textContent=fmt(mp.mounted)+" из "+fmt(mp.total)+" шт. смонтировано";
  }
  const markSummary=document.querySelector(".scheme-mark-summary");
  if(markSummary?.children[3]){
   const value=markSummary.children[3].querySelector("b");
   if(value)value.innerHTML=mp.placed+' <small>элем.</small>';
   const note=markSummary.children[3].querySelector("small:last-child");
   if(note)note.textContent=mp.placedMounted+" полностью смонтировано · "+mp.placedPartial+" частично";
  }
  const counter=document.querySelector(".scheme-visible-counter b");
  if(counter)counter.textContent=String(visible.length);
  const caption=document.querySelector(".scheme-preview-title span");
  if(caption)caption.textContent=s.total+" элементов · Общий 3D";
  const select=document.getElementById("schemeTypeSelect");
  if(select){
   const byKey=new Map(schemeGroups().map(g=>[g.key,g]));
   for(const option of select.options){
    const g=byKey.get(option.value);
    if(g)option.textContent=g.label+" · "+g.marks+" марок · "+g.placed+" элементов";
   }
  }
 }
 // Copy a complete member to a new XY location, preserving length,
 // cross-section, elevations, orientation and intermediate bend.
 async function copySchemeMember(sourceId,destination){
  if(!canEdit())throw Error("Нет прав на копирование монтажной схемы.");
  // Re-read the authoritative rows before counting placements.
  rows=await schemeApi.list();
  const source=allRecords().find(r=>String(r.id)===String(sourceId));
  if(!source)throw Error("Исходный элемент удалён. Выберите его заново.");
  const mark=linkedMark(source);
  if(!mark)throw Error("Марка элемента отсутствует в ведомости. Копирование недоступно.");
  const quota=markPlacement(mark);
  if(quota.left<=0)throw Error("Нет остатка по марке "+String(mark.mark||mark.title)+": "+quota.placed+" из "+quota.total+" шт.");
  const original=coord(source),targetX=Number(destination?.x),targetY=Number(destination?.y);
  if(!Number.isFinite(targetX)||!Number.isFinite(targetY))throw Error("Укажите точные координаты нового начала X/Y.");
  const dx=targetX-original.x,dy=targetY-original.y;
  if(Math.hypot(dx,dy)<1)throw Error("Выберите другое место: копию нельзя наложить на оригинал.");
  const kind=original.geometryType,roundMm=value=>Math.round(value*1000)/1000;
  const translate=(x,y)=>{
   const px=roundMm(x+dx),py=roundMm(y+dy);
   if(!Number.isFinite(px)||!Number.isFinite(py)||px<0||px>spanX||py<0||py>spanY)
    throw Error("Весь элемент должен помещаться в сетку "+fmt(spanX)+" × "+fmt(spanY)+" мм. Точка X "+fmt(px)+" / Y "+fmt(py)+" выходит за границу.");
   const ax=closestAxis(px,axesX,axisXPos),ay=closestAxis(py,axesY,axisYPos);
   return{x:px,y:py,ax,ay,offX:roundMm(px-num(axisXPos.get(ax))),offY:roundMm(py-num(axisYPos.get(ay)))}
  };
  const start=translate(original.x,original.y),
   end=kind==="column"?start:translate(original.x2,original.y2),
   middle=kind==="bent"?translate(original.mx,original.my):null;
  const samePoint=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<5;
  const destPoints=[{...start,z:original.z0},...(middle?[{...middle,z:original.mz}]:[]),{...end,z:original.z2}];
  const collides=allRecords().some(r=>{
   if(String(r.mark_id||"")!==String(mark.id)&&String(linkedMark(r)?.id||"")!==String(mark.id))return false;
   const p=coord(r);
   if(p.geometryType!==kind)return false;
   const points=[{x:p.x,y:p.y,z:p.z0},...(kind==="bent"?[{x:p.mx,y:p.my,z:p.mz}]:[]),
    {x:kind==="column"?p.x:p.x2,y:kind==="column"?p.y:p.y2,z:p.z2}];
   return points.every((a,i)=>samePoint(a,destPoints[i]))||
    points.every((a,i)=>samePoint(a,destPoints[points.length-1-i]));
  });
  if(collides)throw Error("В этом месте уже размещён такой же элемент. Выберите другой ряд.");
  const used=new Set(allRecords().map(r=>String(r.position||r.title||"")));
  let index=1,title;do{title="COL-"+String(index++).padStart(4,"0")}while(used.has(title));
  const group=recordMarkGroup(source);
  const ridgeIsCentered=kind==="bent"&&Math.hypot(original.mx-(original.x+original.x2)/2,
   original.my-(original.y+original.y2)/2)<0.01;
  const saved=await schemeApi.create({record_type:"scheme_column",title,data:{
   entity_type:"column",position:title,mark_id:mark.id,
   mark:mark.mark||mark.title||"",mark_name:mark.name||source.mark_name||"",
   work_type_id:recordWorkId(source)||String(mark.work_type_id||""),
   axis_x:start.ax,axis_y:start.ay,offset_x_mm:start.offX,offset_y_mm:start.offY,
   absolute_x_mm:start.x,absolute_y_mm:start.y,geometry_type:kind,
   absolute_x2_mm:kind==="column"?undefined:end.x,absolute_y2_mm:kind==="column"?undefined:end.y,
   end_axis_x:kind==="column"?undefined:end.ax,end_axis_y:kind==="column"?undefined:end.ay,
   end_offset_x_mm:kind==="column"?undefined:end.offX,end_offset_y_mm:kind==="column"?undefined:end.offY,
   absolute_mid_x_mm:middle?.x,absolute_mid_y_mm:middle?.y,
   mid_axis_x:middle?.ax,mid_axis_y:middle?.ay,
   mid_offset_x_mm:middle?.offX,mid_offset_y_mm:middle?.offY,
   mid_z_mm:middle?original.mz:undefined,
   // Preserve an off-centre ridge without re-centring on the next edit.
   ridge_mode:kind==="bent"?(ridgeIsCentered?String(source.ridge_mode||"manual"):"manual"):undefined,
   z0_mm:original.z0,
   z1_mm:source.z1_mm!=null&&Number.isFinite(Number(source.z1_mm))?Number(source.z1_mm):original.z2,
   end_z_mm:kind==="column"?undefined:original.z2,
   rotation_deg:num(source.rotation_deg),
   section_type:sectionType(source),profile_name:String(source.profile_name||""),
   scheme_group:group.key,scheme_group_label:group.label,
   scheme_view_id:String(source.scheme_view_id||"all"),status:"planned"
  }});
  if(!rememberSavedSchemeRecord(saved))rows=await schemeApi.list();
  return String(saved?.id||"");
 }

 function renderUnifiedBuilding(box){
  if(!window.irBuildingView){box.innerHTML='<p>Модель загружается…</p>';return}
  window.irBuildingView.render(box,{
   objectId:oid,
   axesX:[...axesX],axesY:[...axesY],spanX,spanY,
   gridX:Object.fromEntries(axisXPos),gridY:Object.fromEntries(axisYPos),
   elements:columns(),
   scopeLabel:frameMode?"Каркас всех видов работ":"Текущий вид работ",
   marks:activeMarks().map(m=>{const q=markPlacement(m);return{id:m.id,title:markLabel(m),mark:m.mark||m.title,total:q.total,placed:q.placed,left:q.left,geometry:guessGeometry(m)}}),
   groups:allVisibleTypes().map(g=>({...g,visible:!hiddenGroups.has(g.key)})),
   canEdit:canEdit(),selected:selectedId,showLabels:labelsVisible,showDimensions:dimensionsVisible,
   onAnnotationToggle:(labels,dimensions)=>{
    labelsVisible=Boolean(labels);dimensionsVisible=Boolean(dimensions);
    document.getElementById("schemeToggleLabels")?.classList.toggle("on",labelsVisible);
    document.getElementById("schemeToggleDimensions")?.classList.toggle("on",dimensionsVisible)
   },
   onSelect:id=>{selectedId=id;renderDetails()},
   onEdit:id=>{
    if(!canEdit())return;
    const record=workRecords().find(x=>String(x.id)===String(id));
    if(record)openEditor({...record,...coord(record)});
   },
   copyQuota:id=>{
    const source=allRecords().find(r=>String(r.id)===String(id));
    const mark=source&&linkedMark(source);
    const q=mark?markPlacement(mark):null;
    return{left:q?.left||0,total:q?.total||0,placed:q?.placed||0};
   },
   onCopyPlacement:(id,target)=>copySchemeMember(id,target),
   onCopyPosition:id=>{
    if(!canEdit())return;
    const record=workRecords().find(r=>String(r.id)===String(id));
    if(record)openEditor({...record,...coord(record)},true)
   },
   onCopySaved:id=>{selectedId=String(id||"");refreshAfterMemberChange()},
   onDelete:async id=>{
    if(!canEdit())return;
    const record=workRecords().find(x=>String(x.id)===String(id));
    if(!record)return;
    const name=String(record.mark||record.title||"").trim();
    if(!confirm(`Удалить элемент ${name?`«${name}» `:""}со схемы?`)){restoreKeyboardAfterConfirm();return}
    restoreKeyboardAfterConfirm();
    try{
     await schemeApi.remove(id);
     rows=await schemeApi.list().catch(()=>rows.filter(r=>String(r.id)!==String(id)));
     selectedId="";
     draw();restoreKeyboardAfterConfirm();
    }catch(error){
     alert("Не удалось удалить элемент: "+String(error?.message||error))
    }
   },
   onLayer:key=>{hiddenGroups.has(key)?hiddenGroups.delete(key):hiddenGroups.add(key);updateLayerVisibility()},
   onQuickPlace:frameMode?createFrameMember:null,
   onQuickPlaced:()=>refreshAfterMemberChange(),
   onPlacement:placement=>openEditor(null,false,placement),
   onFirstPaint:()=>loading.done(),
   onFirstPaintError:error=>loading.fail(error)
  })
 }
 function renderScene(){
  const box=document.getElementById("schemeCanvas");if(!box)return;const cols=columns(),xName=`${axesX[0]}–${axesX.at(-1)}`,yName=`${axesY[0]}–${axesY.at(-1)}`,meta=`<div class="scheme-grid-meta"><b>${fmt(spanX)} × ${fmt(spanY)} мм</b><span>${esc(xName)}: ${axesX.length} осей</span><span>${esc(yName)}: ${axesY.length} осей</span><small>Поворот ${viewRotation}° · Ctrl + колесо — масштаб · перетащить — перемещение · клик по пустому месту — снять выбор</small></div>`;
  if(mode==="building"){renderUnifiedBuilding(box);return}
  box.innerHTML=`${meta}<svg viewBox="0 0 1040 650" aria-label="План монтажной схемы"><g id="schemeZoomLayer" transform="${zoomTransform()}">${planSvg(cols)}</g></svg>`;
  // The initial plan needs one browser paint before releasing the overlay.
  loading.done();
  box.querySelectorAll("[data-column]").forEach(el=>{const pick=()=>{selectedId=el.dataset.column;renderScene();renderDetails()};el.onclick=pick;el.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}}});
  bindScenePanZoom(box)
 }

 function pickerRecords(){
  return records().map(c=>({...c,...coord(c),status:effectiveStatus(c)})).sort((a,b)=>String(a.mark||"").localeCompare(String(b.mark||""),"ru",{numeric:true,sensitivity:"base"})||Number(a.id)-Number(b.id))
 }
 function pickerMatches(c,query){
  const q=norm(query);return !q||norm([c.mark,c.mark_name,c.position,c.title,c.id,c.axisX,c.axisY,fmt(c.x),fmt(c.y)].join(" ")).includes(q)
 }
 function pickerOptionText(c){const progress=markProgress(linkedMark(c));return [c.mark||"Без марки",c.axisX+"/"+c.axisY,"X "+fmt(c.x),"Y "+fmt(c.y),progress?.total>0?fmt(progress.mounted)+"/"+fmt(progress.total)+" смонт.":"Статус вручную","#"+c.id].join(" · ")}
 function pickerOptions(found){
  return '<option value="">Выберите размещённый элемент…</option>'+found.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===selectedId?'selected':'')+'>'+esc(pickerOptionText(c))+'</option>').join("")
 }
 function pickerRows(found){
  const overlapping=new Map();
  for(const r of records()){const p=coord(r),key=[Math.round(p.x),Math.round(p.y),Math.round(p.z0)].join("|");overlapping.set(key,(overlapping.get(key)||0)+1)}
  return found.slice(0,150).map(c=>{
   const key=[Math.round(c.x),Math.round(c.y),Math.round(c.z0)].join("|"),stack=overlapping.get(key)||1,progress=markProgress(linkedMark(c));
   return '<div class="scheme-element-row '+(c.id===selectedId?'on':'')+' status-'+esc(c.status)+'"><button type="button" data-pick-element="'+esc(c.id)+'" title="Выбрать элемент"><b>'+esc(c.mark||"Без марки")+'</b><span>'+esc(c.axisX+'/'+c.axisY)+' · X '+fmt(c.x)+' · Y '+fmt(c.y)+'</span><small>#'+esc(c.id)+(stack>1?' · '+stack+' в точке':'')+(progress?.total>0?' · '+fmt(progress.mounted)+'/'+fmt(progress.total)+' смонт.':'')+'</small></button>'+(canEdit()?'<button type="button" class="scheme-list-copy" data-copy-element="'+esc(c.id)+'" title="Копировать элемент">⧉</button>':'')+'</div>'
  }).join("")+(found.length>150?'<div class="scheme-picker-more">Показаны первые 150 из '+found.length+'. Уточните поиск.</div>':'')
 }
 function pickerHtml(){
  const all=pickerRecords(),found=all.filter(c=>pickerMatches(c,elementSearch));
  return '<section class="scheme-element-picker"><div class="scheme-picker-title"><b>Размещённые элементы</b><span>'+all.length+'</span></div>'+
   '<label class="scheme-picker-search">Поиск марки или осей<input id="schemeElementSearch" type="search" value="'+esc(elementSearch)+'" autocomplete="off" placeholder="Марка, ось, ID"></label>'+
   '<select id="schemeElementSelect" data-native-select="1" aria-label="Выбрать размещённый элемент">'+pickerOptions(found)+'</select>'+
   '<div class="scheme-picker-count" id="schemeElementCount">Найдено: '+found.length+(found.length<all.length?' из '+all.length:'')+'</div>'+
   '<div class="scheme-element-list" id="schemeElementRows">'+pickerRows(found)+'</div></section>'
 }
 function selectFromPicker(id){
  const entry=records().find(c=>String(c.id)===String(id));selectedId=entry?String(entry.id):"";
  if(entry&&!isShown(entry)){hiddenGroups.delete(recordMarkGroup(entry).key);statusFilter="all";levelMin="";levelMax="";draw();return}
  renderScene();renderDetails()
 }
 function bindElementPicker(panel){
  const search=panel.querySelector("#schemeElementSearch"),select=panel.querySelector("#schemeElementSelect");
  if(search)search.oninput=()=>{
   elementSearch=search.value;pickerScrollTop=0;const all=pickerRecords(),found=all.filter(c=>pickerMatches(c,elementSearch));
   if(select)select.innerHTML=pickerOptions(found);
   const list=panel.querySelector("#schemeElementRows");if(list){list.innerHTML=pickerRows(found);list.scrollTop=0}
   const counter=panel.querySelector("#schemeElementCount");if(counter)counter.textContent="Найдено: "+found.length+(found.length<all.length?" из "+all.length:"")
  };
  if(select)select.onchange=()=>selectFromPicker(select.value);
  const list=panel.querySelector("#schemeElementRows");if(list){list.scrollTop=pickerScrollTop;list.onscroll=()=>{pickerScrollTop=list.scrollTop}}
  panel.onclick=e=>{
   const copy=e.target.closest?.("[data-copy-element]");if(copy){const row=records().find(r=>String(r.id)===copy.dataset.copyElement);if(row&&canEdit())openEditor({...row,...coord(row)},true);return}
   const pick=e.target.closest?.("[data-pick-element]");if(pick)selectFromPicker(pick.dataset.pickElement)
  }
 }
 function cloneOffset(c){
  const step=Math.min(1000,Math.max(200,Math.min(spanX,spanY)/10));
  const options=[[step,0],[-step,0],[0,step],[0,-step],[step,step],[-step,-step],[step,-step],[-step,step]];
  const existing=allRecords().map(r=>({...r,...coord(r)}));
  const inside=(dx,dy)=>[c.x+dx,c.x2+dx].every(x=>x>=0&&x<=spanX)&&[c.y+dy,c.y2+dy].every(y=>y>=0&&y<=spanY);
  return options.find(([dx,dy])=>inside(dx,dy)&&!existing.some(r=>Math.hypot(r.x-(c.x+dx),r.y-(c.y+dy))<100&&Math.abs(r.z0-c.z0)<100))||options.find(([dx,dy])=>inside(dx,dy))||[step,0]
 }
 function renderDetails(){
  const panel=document.getElementById("schemeDetails");if(!panel)return;const c=selected();
  if(!c){panel.innerHTML=pickerHtml()+`<div class="scheme-detail-empty"><b>Элемент не выбран</b><span>Нажмите на элемент на схеме или добавьте новый.</span>${canEdit()?'<button type="button" data-scheme-add>＋ Добавить элемент</button>':""}</div>`;panel.querySelector("[data-scheme-add]")?.addEventListener("click",()=>openEditor());bindElementPicker(panel);return}
  const a=axisText(c),between=c.dx||c.dy,progress=markProgress(linkedMark(c));
  panel.innerHTML=pickerHtml()+`${c.import_requires_verification?`<div class="scheme-import-review-warning">Черновое размещение по КМД · координаты и отметки требуют проверки${c.source_import_doc?" · "+esc(c.source_import_doc):""}</div>`:""}<div class="scheme-detail-title"><span>Выбранный элемент</span><b>${esc(c.mark||"—")}</b>${c.mark_name?`<small>${esc(c.mark_name)}</small>`:""}</div>
   <div class="scheme-detail-grid">
    <div><span>Наименование</span><b>${esc(c.mark_name||"—")}</b></div>
    <div><span>Тип элемента</span><b>${esc(geometryLabel(c.geometryType))}</b></div><div><span>Сечение</span><b>${esc(sectionTypeLabel(sectionType(c)))}</b></div>
    <div><span>Профиль</span><b>${esc(profileText(c))}</b></div>
    <div><span>${progress?.total>0?"Статус по ведомости":"Статус (ручной)"}</span><b class="${c.status==="mounted"?"ok":c.status==="partial"?"partial":"wait"}">${statusText(c.status)}</b></div>
    <div><span>Ось ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${esc(a.x)}</b></div>
    <div><span>Ось ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${esc(a.y)}</b></div>
    <div><span>Коорд. X</span><b>${fmt(c.x)} мм</b></div>
    <div><span>Коорд. Y</span><b>${fmt(c.y)} мм</b></div>
    <div><span>Низ</span><b>${fmt(c.z0)} мм</b></div>
    <div><span>Верх / конец Z</span><b>${fmt(c.z2)} мм</b></div>
    ${c.geometryType==="bent"?`<div><span>Конёк X</span><b>${fmt(c.mx)} мм</b></div><div><span>Конёк Y</span><b>${fmt(c.my)} мм</b></div><div><span>Конёк Z</span><b>${fmt(c.mz)} мм</b></div><div><span>Длина обеих ветвей</span><b>${fmt(Math.hypot(c.mx-c.x,c.my-c.y,c.mz-c.z0)+Math.hypot(c.x2-c.mx,c.y2-c.my,c.z2-c.mz))} мм</b></div>`:""}
    ${c.geometryType!=="column"?`<div><span>Конец X</span><b>${fmt(c.x2)} мм</b></div><div><span>Конец Y</span><b>${fmt(c.y2)} мм</b></div>`:""}
   </div>
   ${progress?.total>0?`<div class="scheme-mark-progress">
    <b>Марка ${esc(c.mark)} · данные из ведомости</b>
    <div><span>Всего <strong>${fmt(progress.total)} шт.</strong></span><span>Смонтировано <strong>${fmt(progress.mounted)} шт.</strong></span><span>Осталось <strong>${fmt(progress.left)} шт.</strong></span></div>
    <div class="scheme-mark-progress-bar"><i style="width:${Math.max(0,Math.min(100,progress.mounted/progress.total*100))}%"></i></div>
    ${progress.state==="partial"?'<small>Ведомость показывает частичное выполнение марки, но не указывает, какой именно экземпляр смонтирован.</small>':""}
   </div>`:""}
   ${between?`<div class="scheme-between"><b>Элемент между осями</b><span>${esc(a.x)} / ${esc(a.y)}</span><small>Положение вычисляется от выбранных базовых осей и сохраняется точно в миллиметрах.</small></div>`:""}
   ${canEdit()?`<div class="scheme-detail-actions"><button type="button" data-scheme-edit>Редактировать</button><button type="button" data-scheme-copy>⧉ Копировать позицию</button><button type="button" class="danger" data-scheme-delete>Удалить</button></div>`:""}`;
  panel.querySelector("[data-scheme-edit]")?.addEventListener("click",()=>openEditor(c));
  panel.querySelector("[data-scheme-copy]")?.addEventListener("click",()=>openEditor(c,true));
  panel.querySelector("[data-scheme-delete]")?.addEventListener("click",async()=>{if(!confirm(`Удалить элемент ${c.mark?`«${c.mark}» `:""}со схемы?`)){restoreKeyboardAfterConfirm();return}restoreKeyboardAfterConfirm();await schemeApi.remove(c.id);rows=await schemeApi.list().catch(()=>rows);selectedId="";draw();restoreKeyboardAfterConfirm()});bindElementPicker(panel)
 }
 let gridDraft=null;
 const yAlphabet=["А","Б","В","Г","Д","Е","Ж","З","И","К","Л","М","Н","П","Р","С","Т","У","Ф","Х","Ц","Ч","Ш","Щ","Э","Ю","Я"];
 function nextAxisLabel(key,items){
  if(key==="x"){const nums=items.map(x=>Number(x)).filter(Number.isFinite);return String((nums.length?Math.max(...nums):items.length)+1)}
  return yAlphabet.find(x=>!items.includes(x))||`Ось ${items.length+1}`
 }
 function gridDirectionHtml(key){
  const isX=key==="x",items=isX?gridDraft.axesX:gridDraft.axesY,spans=isX?gridDraft.spansX:gridDraft.spansY,size=isX?gridDraft.sizeX:gridDraft.sizeY,title=`${items[0]}–${items.at(-1)}`,direction=isX?gridDraft.dirX:gridDraft.dirY;
  return`<section data-grid-section="${key}">
   <div class="scheme-grid-config-head"><div><b>Направление ${esc(title)}</b><span>${items.length} осей · ${spans.length} пролётов</span></div><button type="button" data-grid-equal="${key}">Распределить равномерно</button></div>
   <label class="scheme-grid-size"><span>Общий размер</span><input type="text" inputmode="decimal" data-grid-size="${key}" value="${esc(fmt(size))}"><small>мм</small></label>
   <label class="scheme-grid-direction"><span>Отображение осей</span><select data-grid-direction="${key}">${isX?`<option value="ltr" ${direction==="ltr"?"selected":""}>Слева направо: ${esc(items[0])} → ${esc(items.at(-1))}</option><option value="rtl" ${direction==="rtl"?"selected":""}>Справа налево: ${esc(items[0])} → ${esc(items.at(-1))}</option>`:`<option value="btt" ${direction==="btt"?"selected":""}>Снизу вверх: ${esc(items[0])} → ${esc(items.at(-1))}</option><option value="ttb" ${direction==="ttb"?"selected":""}>Сверху вниз: ${esc(items[0])} → ${esc(items.at(-1))}</option>`}</select></label>
   <div class="scheme-grid-axis-title"><span>Оси</span><small>Название оси можно изменить</small></div>
   <div class="scheme-axis-list">${items.map((axis,i)=>`<div class="scheme-axis-item"><input type="text" data-grid-axis="${key}" data-index="${i}" value="${esc(axis)}"><button type="button" data-grid-remove-axis="${key}" data-index="${i}" ${items.length<=2?"disabled":""} title="Удалить ось">×</button></div>`).join("")}<button type="button" class="scheme-add-axis" data-grid-add-axis="${key}">＋ Добавить ось</button></div>
   <div class="scheme-grid-axis-title"><span>Пролёты</span><small>Расстояние между соседними осями</small></div>
   <div class="scheme-grid-spans">${spans.map((value,i)=>`<label><span>${esc(pairLabel(items,i))}</span><input type="text" inputmode="decimal" data-grid-span="${key}" data-index="${i}" value="${esc(fmt(value))}"><small>мм</small></label>`).join("")}</div>
   <div class="scheme-grid-total" id="schemeGridTotal${isX?"X":"Y"}"></div>
  </section>`
 }
 function gridEditorHtml(){
  return`<dialog id="schemeGridEditor" class="scheme-grid-editor"><form id="schemeGridForm" novalidate><div class="scheme-editor-head"><div><h2>Параметры сетки</h2><p>Добавляйте и удаляйте оси, меняйте их названия, пролёты и общий размер сетки.</p></div><button type="button" id="schemeGridX">×</button></div>
   <div class="scheme-grid-warning">В Общей схеме нельзя удалить используемые оси. Дополнительная сетка настраивается отдельно, координаты элементов сохраняются в миллиметрах.</div>
   <div class="scheme-grid-config" id="schemeGridBody"></div>
   <div class="scheme-form-error" id="schemeGridError" hidden></div>
   <div class="actions"><button type="button" id="schemeGridCancel">Отмена</button><button type="submit" class="primary" id="schemeGridSave">Сохранить сетку</button></div>
  </form></dialog>`
 }
 function showGridError(message){
  const err=document.getElementById("schemeGridError");if(!err)return;err.textContent=message||"";err.hidden=!message
 }
 function renderGridEditor(){
  const body=document.getElementById("schemeGridBody");if(!body||!gridDraft)return;body.innerHTML=gridDirectionHtml("x")+gridDirectionHtml("y");
  body.querySelectorAll("[data-grid-axis]").forEach(el=>{el.oninput=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value};el.onchange=()=>{const key=el.dataset.gridAxis,i=Number(el.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY;items[i]=el.value.trim();renderGridEditor()}});
  body.querySelectorAll("[data-grid-span]").forEach(el=>el.oninput=()=>{const key=el.dataset.gridSpan,i=Number(el.dataset.index),spans=key==="x"?gridDraft.spansX:gridDraft.spansY;spans[i]=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-size]").forEach(el=>el.oninput=()=>{if(el.dataset.gridSize==="x")gridDraft.sizeX=num(el.value);else gridDraft.sizeY=num(el.value);refreshGridEditor()});
  body.querySelectorAll("[data-grid-direction]").forEach(el=>el.onchange=()=>{if(el.dataset.gridDirection==="x")gridDraft.dirX=el.value;else gridDraft.dirY=el.value});
  body.querySelectorAll("[data-grid-equal]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridEqual,count=(key==="x"?gridDraft.axesX:gridDraft.axesY).length-1,total=key==="x"?gridDraft.sizeX:gridDraft.sizeY,vals=equalSpans(total,count);if(key==="x")gridDraft.spansX=vals;else gridDraft.spansY=vals;renderGridEditor()});
  body.querySelectorAll("[data-grid-add-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridAddAxis,items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY",suggested=Math.max(1,Math.round(spans.length?spans.reduce((s,x)=>s+num(x),0)/spans.length:6000));items.push(nextAxisLabel(key,items));sources.push(null);spans.push(suggested);gridDraft[sizeKey]+=suggested;renderGridEditor()});
  body.querySelectorAll("[data-grid-remove-axis]").forEach(btn=>btn.onclick=()=>{const key=btn.dataset.gridRemoveAxis,i=Number(btn.dataset.index),items=key==="x"?gridDraft.axesX:gridDraft.axesY,sources=key==="x"?gridDraft.sourceX:gridDraft.sourceY,spans=key==="x"?gridDraft.spansX:gridDraft.spansY,sizeKey=key==="x"?"sizeX":"sizeY";if(items.length<=2)return;const source=sources[i],used=activeScheme==="all"&&source&&allRecords().some(r=>String(key==="x"?r.axis_x:r.axis_y)===String(source));if(used){showGridError(`Ось «${source}» используется колоннами. Сначала перенесите эти колонны на другую ось.`);return}showGridError("");if(i===0){gridDraft[sizeKey]-=num(spans.shift());items.shift();sources.shift()}else if(i===items.length-1){gridDraft[sizeKey]-=num(spans.pop());items.pop();sources.pop()}else{spans[i-1]=num(spans[i-1])+num(spans[i]);spans.splice(i,1);items.splice(i,1);sources.splice(i,1)}renderGridEditor()});
  refreshGridEditor()
 }
 function openGridEditor(){
  const d=document.getElementById("schemeGridEditor");if(!d)return;gridDraft={axesX:[...axesX],axesY:[...axesY],sourceX:[...axesX],sourceY:[...axesY],spansX:[...gridXSpans],spansY:[...gridYSpans],sizeX:targetSpanX,sizeY:targetSpanY,dirX:gridDirX,dirY:gridDirY};showGridError("");renderGridEditor();d.showModal()
 }
 function refreshGridEditor(){
  if(!gridDraft)return;const tx=document.getElementById("schemeGridTotalX"),ty=document.getElementById("schemeGridTotalY"),save=document.getElementById("schemeGridSave"),sx=gridDraft.spansX.reduce((s,x)=>s+num(x),0),sy=gridDraft.spansY.reduce((s,x)=>s+num(x),0);
  const paint=(el,sum,target)=>{const diff=target-sum,ok=target>0&&Math.abs(diff)<.11;el.className=`scheme-grid-total ${ok?"ok":"bad"}`;el.innerHTML=`<span>Сумма пролётов</span><b>${fmt(sum)} мм</b><small>${ok?"Совпадает с размером":diff>0?`Не хватает ${fmt(diff)} мм`:`Превышение ${fmt(Math.abs(diff))} мм`}</small>`;return ok};
  const unique=a=>a.length===new Set(a.map(x=>String(x).trim().toLowerCase())).size&&a.every(x=>String(x).trim()),okX=paint(tx,sx,gridDraft.sizeX),okY=paint(ty,sy,gridDraft.sizeY),positive=gridDraft.spansX.every(x=>num(x)>0)&&gridDraft.spansY.every(x=>num(x)>0),names=unique(gridDraft.axesX)&&unique(gridDraft.axesY);save.disabled=!(okX&&okY&&positive&&names&&gridDraft.axesX.length>=2&&gridDraft.axesY.length>=2)
 }
 function bindGridEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeGridEditor"),form=document.getElementById("schemeGridForm");if(!d||!form)return;
  document.getElementById("schemeGridConfig")?.addEventListener("click",openGridEditor);document.getElementById("schemeGridX").onclick=()=>d.close();document.getElementById("schemeGridCancel").onclick=()=>d.close();
  form.onsubmit=async e=>{e.preventDefault();showGridError("");if(!gridDraft)return;const ax=gridDraft.axesX.map(x=>String(x).trim()),ay=gridDraft.axesY.map(x=>String(x).trim()),xs=gridDraft.spansX.map(num),ys=gridDraft.spansY.map(num),sx=xs.reduce((s,x)=>s+x,0),sy=ys.reduce((s,x)=>s+x,0);if(ax.some(x=>!x)||ay.some(x=>!x)||new Set(ax.map(x=>x.toLowerCase())).size!==ax.length||new Set(ay.map(x=>x.toLowerCase())).size!==ay.length){showGridError("Названия осей должны быть заполнены и не должны повторяться.");return}if(xs.some(x=>x<=0)||ys.some(x=>x<=0)||gridDraft.sizeX<=0||gridDraft.sizeY<=0){showGridError("Размеры и расстояния между осями должны быть больше 0.");return}if(Math.abs(sx-gridDraft.sizeX)>=.11||Math.abs(sy-gridDraft.sizeY)>=.11){showGridError("Сумма пролётов должна совпадать с общим размером каждого направления.");return}
   const mapX=new Map(gridDraft.sourceX.map((old,i)=>old?[String(old),ax[i]]:null).filter(Boolean)),mapY=new Map(gridDraft.sourceY.map((old,i)=>old?[String(old),ay[i]]:null).filter(Boolean));
   const nextGrid={axes_x:ax,axes_y:ay,x_spans_mm:xs,y_spans_mm:ys,span_x_mm:gridDraft.sizeX,span_y_mm:gridDraft.sizeY,x_direction:gridDraft.dirX,y_direction:gridDraft.dirY};
   const view=activeView();try{
    if(view)await schemeApi.update(view.id,{record_type:"scheme_view",title:view.data?.name||view.title||"Монтажная сетка",data:{...view.data,grid:nextGrid}});
    else{
     for(const row of arr(rows).filter(r=>r.record_type==="scheme_column"||r.data?.entity_type==="column")){
      const d0=row.data||{},nx=mapX.get(String(d0.axis_x||""))||String(d0.axis_x||""),ny=mapY.get(String(d0.axis_y||""))||String(d0.axis_y||"");
      if(nx!==String(d0.axis_x||"")||ny!==String(d0.axis_y||""))await schemeApi.update(row.id,{record_type:row.record_type||"scheme_column",title:row.title||d0.position||"Колонна",data:{...d0,axis_x:nx,axis_y:ny}})
     }
     const existing=gridRecord(),payload={record_type:"scheme_grid",title:"Сетка осей",data:{entity_type:"grid",...nextGrid}};
     if(existing)await schemeApi.update(existing.id,payload);else await schemeApi.create(payload);
    }
    rows=await schemeApi.list();refreshGridModel();d.close();gridDraft=null;draw()
   }catch(error){showGridError("Не удалось сохранить сетку: "+String(error?.message||error))}
  }
 }
 function editorHtml(){
  return`<dialog id="schemeEditor" class="scheme-editor"><form id="schemeForm" novalidate><input type="hidden" name="id"><div class="scheme-editor-head"><div><h2 id="schemeEditorTitle">Добавить элемент</h2><p>Выберите марку для текущей монтажной схемы и задайте положение относительно осей.</p></div><button type="button" id="schemeEditorX">×</button></div>
   <div class="scheme-form-grid">
    <label class="wide scheme-editor-grid-field">Сетка размещения<select name="scheme_target" id="schemeEditorGridSelect" data-native-select="1">${schemeGroups().map(g=>`<option value="${esc(g.key)}">${esc(g.label)}</option>`).join("")}</select><small>По умолчанию — текущая сетка. На Общей схеме видны все размещённые конструкции.</small></label>
    <label class="wide scheme-mark-field">Марка из ведомости<div class="scheme-mark-search"><input id="schemeMarkSearch" type="search" autocomplete="off" placeholder="Поиск по марке или наименованию…"><span id="schemeMarkCount"></span></div><select name="mark_id" required>${markOptions("")}</select><div id="schemeMarkPlacementInfo" class="scheme-mark-placement-info" aria-live="polite"></div></label>
    <label>Статус монтажа<select name="status"><option value="planned">Не смонтирована</option><option value="partial">Частично</option><option value="mounted">Смонтирована</option></select></label><div class="scheme-editor-mount-info wide" id="schemeEditorMountInfo"></div>
    <label>Геометрия элемента<select name="geometry_type" id="schemeGeometryType">${geometryOptions("column")}</select></label>
    <label>Тип сечения<select name="section_type">${sectionOptions("ibeam")}</select></label>
    <label class="wide">Профиль / обозначение<input name="profile_name" placeholder="Например: 40К2, 300×300×10, Ø273×8"></label>
    <div class="scheme-form-axis"><b>Направление ${esc(axesX[0])}–${esc(axesX.at(-1))}</b><label>Базовая ось<select name="axis_x">${axisOptions(axesX,axesX[0])}</select></label><label>Смещение, мм<input name="offset_x_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-form-axis"><b>Направление ${esc(axesY[0])}–${esc(axesY.at(-1))}</b><label>Базовая ось<select name="axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение, мм<input name="offset_y_mm" inputmode="decimal" value="0"></label></div>
    <div class="scheme-member-end wide" id="schemeMemberEnd" hidden><b>Конец элемента — вторая точка для балки, связи или фермы</b>
     <div><label>Ось по X<select name="end_axis_x">${axisOptions(axesX,axesX[1]||axesX[0])}</select></label><label>Смещение X, мм<input name="end_offset_x_mm" inputmode="decimal" value="0"></label>
     <label>Ось по Y<select name="end_axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение Y, мм<input name="end_offset_y_mm" inputmode="decimal" value="0"></label></div></div>
    <div class="scheme-member-end wide" id="schemeMemberMiddle" hidden><b>Конёк / излом — одна балка, две наклонные части</b>
     <label class="wide scheme-ridge-mode">Расположение конька
      <select name="ridge_mode" id="schemeRidgeMode" data-native-select="1">
       <option value="center">По центру — X/Y между началом и концом</option>
       <option value="manual">Вручную — точные оси и смещения X/Y</option>
      </select>
     </label>
     <div class="scheme-middle-coordinates" id="schemeMiddleCoordinates">
      <label>Ось по X<select name="mid_axis_x">${axisOptions(axesX,axesX[1]||axesX[0])}</select></label><label>Смещение X, мм<input name="mid_offset_x_mm" inputmode="decimal" value="0"></label>
      <label>Ось по Y<select name="mid_axis_y">${axisOptions(axesY,axesY[0])}</select></label><label>Смещение Y, мм<input name="mid_offset_y_mm" inputmode="decimal" value="0"></label>
     </div>
     <div class="scheme-ridge-note" id="schemeRidgeNote">X/Y конька рассчитываются автоматически точно посередине между началом и концом. Смещения вручную не требуются.</div>
     <label>Отметка конька Z, мм<input name="mid_z_mm" inputmode="decimal" value="10000"></label>
    </div>
    <label>Отметка низа / начала, мм<input name="z0_mm" inputmode="decimal" value="0"></label>
    <label>Отметка верха / конца, мм<input name="z1_mm" inputmode="decimal" value="8400"></label>
    <label>Поворот, °<input name="rotation_deg" inputmode="decimal" value="0"></label>
    <div class="scheme-coordinate-preview wide" id="schemeCoordPreview"></div>
   </div>
   <div class="scheme-form-error" id="schemeFormError" hidden></div>
   <div class="actions"><button type="button" id="schemeEditorCancel">Отмена</button><button type="submit" class="primary">Сохранить элемент</button></div>
  </form></dialog>`
 }
 let pendingBuildingPlacement=null;
 function openEditor(c=null,copy=false,placement=null){
  pendingBuildingPlacement=placement?.zigzag?placement:null;
  const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");if(!d||!f)return;
  // Position templates retain exact XY, both Z elevations, ridge, profile
  // and rotation, while creating a new record with its own available mark.
  const copyingPosition=Boolean(c&&copy);
  if(copyingPosition)c={...c,id:"",status:"planned",position:"",title:""};
  f.reset();f.dataset.copyPosition=copyingPosition?"1":"0";err.hidden=true;
  document.getElementById("schemeEditorTitle").textContent=copyingPosition?"Копировать позицию — параметры и отметки Z":c?"Редактировать элемент":"Добавить элемент";
  f.elements.id.value=copyingPosition?"":c?.id||"";
  // Reopen the actual stored grid for edits and copies, including the shared grid.
  const sourceView=c?.scheme_view_id&&c.scheme_view_id!=="all"?customViews().find(x=>String(x.id)===String(c.scheme_view_id)):null;
  let gridChoice=c?.scheme_view_id==="all"?"all":sourceView?"view:"+sourceView.id:activeScheme,editorGrid=gridForEditor(gridChoice),editorMarks=marksForGrid(gridChoice);
  const sourceGeometry=c?.geometryType||c?.geometry_type||"";
  const compatibleMark=m=>!copyingPosition||guessGeometry(m)===(sourceGeometry==="bent"?"beam":sourceGeometry);
  if(copyingPosition)editorMarks=editorMarks.filter(compatibleMark);
  f.elements.scheme_target.value=gridChoice;
  let chosenMark=placement?.markId||resolveSavedMarkId(c),currentMark=chosenMark;
  const editingId=String(f.elements.id.value||""),unresolvedExisting=!!editingId&&!currentMark,
   search=document.getElementById("schemeMarkSearch"),count=document.getElementById("schemeMarkCount"),
   selection=f.elements.mark_id,availability=document.getElementById("schemeMarkPlacementInfo");
  if(!editorMarks.some(m=>m.id===chosenMark&&markAvailable(m,editingId)))chosenMark=editorMarks.find(m=>markAvailable(m,editingId))?.id||"";
  const renderMarkOptions=()=>{
   const q=search?.value||"",matched=searchMarks(q,editorMarks),valid=matched.some(m=>m.id===chosenMark&&markAvailable(m,editingId));
   if(!valid)chosenMark="";
   selection.innerHTML=markOptions(chosenMark,q,unresolvedExisting&&!chosenMark,editorMarks,editingId);
   selection.value=chosenMark;
   count.textContent=q?`Найдено: ${matched.length} · Доступно: ${matched.filter(m=>markAvailable(m,editingId)).length}`:`Марок: ${editorMarks.length} · Доступно: ${editorMarks.filter(m=>markAvailable(m,editingId)).length}`;
   selection._irSelectUI?.refresh?.();refreshEditorProgress()
  };
  selection.onchange=()=>{
   const value=String(selection.value||"");
   if(value&&!editorMarks.some(m=>m.id===value&&markAvailable(m,editingId))){selection.value="";chosenMark="";renderMarkOptions();return}
   chosenMark=value;
   if(value&&!editingId&&!copyingPosition){const m=editorMarks.find(x=>x.id===value),same=allRecords().find(x=>String(x.mark_id||"")===value);f.elements.section_type.value=sectionType(same||{});f.elements.profile_name.value=same?.profile_name||"";f.elements.geometry_type.value=m?guessGeometry(m):"column";updateGeometry(true)}
   refreshEditorProgress()
  };
  if(search){search.value="";search.oninput=renderMarkOptions}
  f.elements.status.value=c?.status||"planned";
  function refreshEditorProgress(){
   const m=editorMarks.find(x=>x.id===String(selection.value||"")),progress=markProgress(m),info=document.getElementById("schemeEditorMountInfo");
   const q=markPlacement(m),remaining=m?markAvailable(m,editingId):false;
   availability.classList.toggle("exhausted",!remaining);
   selection.classList.toggle("exhausted",!remaining);
   const field=selection.closest(".scheme-mark-field");field?.classList.toggle("exhausted",!remaining);
   availability.textContent=m?`По ведомости: ${q.total} шт. · На схеме: ${q.placed} шт. · Осталось разместить: ${q.left} шт.${remaining?"":" · НЕТ ОСТАТКА"}`:"Выберите марку, доступную для размещения. Красные марки уже полностью размещены.";

   f.elements.status.disabled=!!progress&&progress.total>0;
   if(progress?.total>0){
    f.elements.status.value=progress.state;
    if(info)info.innerHTML=`<b>Статус определяется по ведомости марок</b><span>Всего: ${fmt(progress.total)} шт. · Смонтировано: ${fmt(progress.mounted)} шт. · Осталось: ${fmt(progress.left)} шт.</span>${progress.state==="partial"?"<small>Частичный монтаж: конкретные экземпляры пока не сопоставлены с отчётами.</small>":""}`
   }else{
    f.elements.status.value=c?.status||"planned";
    if(info)info.innerHTML='<span>У этой марки нет количества в ведомости. Доступен ручной статус.</span>'
   }
  }
  refreshEditorProgress();
  const sameMark=allRecords().find(x=>String(x.mark_id||"")===chosenMark&&(!c||x.id!==c.id)),shapeSource=c||sameMark||{},chosen=editorMarks.find(x=>x.id===chosenMark);
  f.elements.section_type.value=sectionType(shapeSource);f.elements.profile_name.value=shapeSource.profile_name||"";
  f.elements.axis_x.value=c?.axisX||editorGrid.axesX[0]||"";f.elements.axis_y.value=c?.axisY||editorGrid.axesY[0]||"";
  f.elements.offset_x_mm.value=c?.dx??0;f.elements.offset_y_mm.value=c?.dy??0;
  f.elements.z0_mm.value=c?.z0??c?.z0_mm??0;f.elements.z1_mm.value=c?.z2??c?.z1_mm??8400;f.elements.rotation_deg.value=c?.rotation_deg??0;
  f.elements.geometry_type.value=c?.geometryType||c?.geometry_type||(chosen?guessGeometry(chosen):"column");
  const assignAxes=(reset=false)=>{
   editorGrid=gridForEditor(gridChoice);
   const prevX=reset?editorGrid.axesX[0]:f.elements.axis_x.value,
    prevY=reset?editorGrid.axesY[0]:f.elements.axis_y.value;
   f.elements.axis_x.innerHTML=axisOptions(editorGrid.axesX,prevX);
   f.elements.axis_y.innerHTML=axisOptions(editorGrid.axesY,prevY);
   f.elements.end_axis_x.innerHTML=axisOptions(editorGrid.axesX,editorGrid.axesX[1]||editorGrid.axesX[0]);
   f.elements.end_axis_y.innerHTML=axisOptions(editorGrid.axesY,editorGrid.axesY[0]);
   f.elements.mid_axis_x.innerHTML=axisOptions(editorGrid.axesX,editorGrid.axesX[1]||editorGrid.axesX[0]);
   f.elements.mid_axis_y.innerHTML=axisOptions(editorGrid.axesY,editorGrid.axesY[0]);
   if(!reset&&c){
    // Prefer the saved axes and offsets. Nearest-axis matching is only for legacy records.
    const firstX=editorGrid.axesX.includes(String(c.axis_x||""))?String(c.axis_x):editorGrid.axesX.includes(String(c.axisX||""))?String(c.axisX):closestAxis(c.x,editorGrid.axesX,editorGrid.xPos);
    const firstY=editorGrid.axesY.includes(String(c.axis_y||""))?String(c.axis_y):editorGrid.axesY.includes(String(c.axisY||""))?String(c.axisY):closestAxis(c.y,editorGrid.axesY,editorGrid.yPos);
    f.elements.axis_x.value=firstX;f.elements.axis_y.value=firstY;
    const eX=editorGrid.axesX.includes(String(c.end_axis_x||""))?String(c.end_axis_x):closestAxis(c.x2,editorGrid.axesX,editorGrid.xPos);
    const eY=editorGrid.axesY.includes(String(c.end_axis_y||""))?String(c.end_axis_y):closestAxis(c.y2,editorGrid.axesY,editorGrid.yPos);
    f.elements.end_axis_x.value=eX;f.elements.end_axis_y.value=eY;
    f.elements.offset_x_mm.value=c.offset_x_mm!==undefined?c.offset_x_mm:c.x-num(editorGrid.xPos.get(firstX));
    f.elements.offset_y_mm.value=c.offset_y_mm!==undefined?c.offset_y_mm:c.y-num(editorGrid.yPos.get(firstY));
    f.elements.end_offset_x_mm.value=c.end_offset_x_mm!==undefined?c.end_offset_x_mm:c.x2-num(editorGrid.xPos.get(eX));
    f.elements.end_offset_y_mm.value=c.end_offset_y_mm!==undefined?c.end_offset_y_mm:c.y2-num(editorGrid.yPos.get(eY));
    const mxAxis=closestAxis(c.mx,editorGrid.axesX,editorGrid.xPos),myAxis=closestAxis(c.my,editorGrid.axesY,editorGrid.yPos);
    f.elements.mid_axis_x.value=editorGrid.axesX.includes(String(c.mid_axis_x))?String(c.mid_axis_x):mxAxis;
    f.elements.mid_axis_y.value=editorGrid.axesY.includes(String(c.mid_axis_y))?String(c.mid_axis_y):myAxis;
    f.elements.mid_offset_x_mm.value=c.mx-num(editorGrid.xPos.get(f.elements.mid_axis_x.value));
    f.elements.mid_offset_y_mm.value=c.my-num(editorGrid.yPos.get(f.elements.mid_axis_y.value));
    f.elements.mid_z_mm.value=c.mz;
   }else{
    f.elements.offset_x_mm.value=0;f.elements.offset_y_mm.value=0;
    f.elements.end_offset_x_mm.value=0;f.elements.end_offset_y_mm.value=0;
    f.elements.mid_offset_x_mm.value=0;f.elements.mid_offset_y_mm.value=0
   }
   const heads=f.querySelectorAll(".scheme-form-axis>b");
   if(heads[0])heads[0].textContent="Направление "+editorGrid.axesX[0]+"–"+editorGrid.axesX.at(-1);
   if(heads[1])heads[1].textContent="Направление "+editorGrid.axesY[0]+"–"+editorGrid.axesY.at(-1);
   f.elements.axis_x._irSelectUI?.refresh?.();f.elements.axis_y._irSelectUI?.refresh?.();
   f.elements.end_axis_x._irSelectUI?.refresh?.();f.elements.end_axis_y._irSelectUI?.refresh?.();
   f.elements.mid_axis_x._irSelectUI?.refresh?.();f.elements.mid_axis_y._irSelectUI?.refresh?.()
  };
  assignAxes(false);
  f.elements.scheme_target.onchange=()=>{
   gridChoice=f.elements.scheme_target.value;
   editorGrid=gridForEditor(gridChoice);editorMarks=marksForGrid(gridChoice).filter(compatibleMark);
   chosenMark=editorMarks.some(m=>m.id===chosenMark&&markAvailable(m,editingId))?chosenMark:editorMarks.find(m=>markAvailable(m,editingId))?.id||"";
   assignAxes(true);renderMarkOptions();refreshPreview()
  };
  renderMarkOptions();
  function updateGeometry(defaultHeights=false){
   const kind=f.elements.geometry_type.value,member=kind!=="column",end=document.getElementById("schemeMemberEnd");
   if(end)end.hidden=!member;
   const middle=document.getElementById("schemeMemberMiddle");if(middle)middle.hidden=kind!=="bent";
   const manual=f.elements.ridge_mode.value==="manual",
    midCoords=document.getElementById("schemeMiddleCoordinates"),
    note=document.getElementById("schemeRidgeNote");
   if(midCoords)midCoords.hidden=!manual;
   if(note)note.hidden=manual;
   if(defaultHeights&&member){if(kind==="brace"){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}else{f.elements.z0_mm.value=8400;f.elements.z1_mm.value=8400}}
   if(defaultHeights&&!member){f.elements.z0_mm.value=0;f.elements.z1_mm.value=8400}
   if(defaultHeights&&kind==="bent"){f.elements.z0_mm.value=9400;f.elements.z1_mm.value=9400;f.elements.mid_z_mm.value=10000}
   refreshPreview()
  }
  const refreshPreview=()=>{
   const ax=f.elements.axis_x.value,ay=f.elements.axis_y.value,x=num(editorGrid.xPos.get(ax))+num(f.elements.offset_x_mm.value),y=num(editorGrid.yPos.get(ay))+num(f.elements.offset_y_mm.value),member=f.elements.geometry_type.value!=="column",endX=num(editorGrid.xPos.get(f.elements.end_axis_x.value))+num(f.elements.end_offset_x_mm.value),endY=num(editorGrid.yPos.get(f.elements.end_axis_y.value))+num(f.elements.end_offset_y_mm.value),
   bent=f.elements.geometry_type.value==="bent",centered=f.elements.ridge_mode.value!=="manual",
   mx=centered?(x+endX)/2:num(editorGrid.xPos.get(f.elements.mid_axis_x.value))+num(f.elements.mid_offset_x_mm.value),
   my=centered?(y+endY)/2:num(editorGrid.yPos.get(f.elements.mid_axis_y.value))+num(f.elements.mid_offset_y_mm.value),
   length=bent?Math.hypot(mx-x,my-y,num(f.elements.mid_z_mm.value)-num(f.elements.z0_mm.value))+Math.hypot(endX-mx,endY-my,num(f.elements.z1_mm.value)-num(f.elements.mid_z_mm.value)):0;
   document.getElementById("schemeCoordPreview").innerHTML=`<span>Точные координаты</span><b>Начало X = ${fmt(x)} мм · Y = ${fmt(y)} мм</b><small>${member?`${bent?"Конёк X = "+fmt(mx)+" мм · Y = "+fmt(my)+" мм · Z = "+fmt(f.elements.mid_z_mm.value)+" мм · ":""}Конец X = ${fmt(endX)} мм · Y = ${fmt(endY)} мм${bent?" · Длина "+fmt(length)+" мм":""}`:"Колонна расположена вертикально"}</small>`;
  };
  // Existing asymmetric beams must stay asymmetric unless explicitly changed.
  // Legacy records without a ridge_mode are classified using their saved X/Y.
  const existingCentered=c?.geometryType==="bent"&&
   Math.hypot(num(c.mx)-(num(c.x)+num(c.x2))/2,num(c.my)-(num(c.y)+num(c.y2))/2)<1.1;
  f.elements.ridge_mode.value=c?.ridge_mode==="manual"?"manual":
   c?.ridge_mode==="center"||!c||existingCentered?"center":"manual";
  f.elements.ridge_mode.onchange=()=>updateGeometry(false);
  f.elements.geometry_type.onchange=()=>updateGeometry(false);updateGeometry(!c&&f.elements.geometry_type.value!=="column");
  if(placement){
   const start=placement.start,end=placement.end||start;
   f.elements.mark_id.value=placement.markId;chosenMark=placement.markId;
   f.elements.geometry_type.value=placement.geometry;
   f.elements.axis_x.value=start.ax;f.elements.axis_y.value=start.ay;
   f.elements.offset_x_mm.value=start.dx??0;f.elements.offset_y_mm.value=start.dy??0;
   f.elements.end_axis_x.value=end.ax;f.elements.end_axis_y.value=end.ay;
   f.elements.end_offset_x_mm.value=end.dx??0;f.elements.end_offset_y_mm.value=end.dy??0;
   f.elements.z0_mm.value=placement.geometry==="column"?0:(start.z??placement.height);
   f.elements.z1_mm.value=placement.geometry==="column"?placement.height:(end.z??placement.height);
   if(placement.middle){const mid=placement.middle;f.elements.mid_axis_x.value=mid.ax;f.elements.mid_axis_y.value=mid.ay;f.elements.mid_offset_x_mm.value=mid.dx??0;f.elements.mid_offset_y_mm.value=mid.dy??0;f.elements.mid_z_mm.value=mid.z??10000}
   f.elements.ridge_mode.value=placement.ridgeMode==="manual"?"manual":"center";
   updateGeometry(false);renderMarkOptions();
  }
  ["axis_x","axis_y","offset_x_mm","offset_y_mm","end_axis_x","end_axis_y","end_offset_x_mm","end_offset_y_mm","mid_axis_x","mid_axis_y","mid_offset_x_mm","mid_offset_y_mm","mid_z_mm","z0_mm","z1_mm"].forEach(n=>f.elements[n].addEventListener("input",refreshPreview));refreshPreview();d.showModal()
 }
 function bindEditor(){
  if(!canEdit())return;const d=document.getElementById("schemeEditor"),f=document.getElementById("schemeForm"),err=document.getElementById("schemeFormError");
  const cancelPending=()=>{pendingBuildingPlacement=null;window.irBuildingView?.placementCancelled?.()};
   document.getElementById("schemeAdd")?.addEventListener("click",()=>mode==="building"?window.irBuildingView?.start():openEditor());document.getElementById("schemeEditorX").onclick=()=>{cancelPending();d.close()};document.getElementById("schemeEditorCancel").onclick=()=>{cancelPending();d.close()};
   d.addEventListener("cancel",cancelPending);
  f.onsubmit=async e=>{
   e.preventDefault();err.hidden=true;
   const fd=new FormData(f),id=String(fd.get("id")||"");
   const choice=String(fd.get("scheme_target")||"all"),allowed=schemeGroups().some(g=>g.key===choice);
   if(!allowed){err.textContent="Выбранная сетка больше не существует.";err.hidden=false;return}
   const targetGrid=gridForEditor(choice),pool=marksForGrid(choice);
   if(!pool.length){err.textContent="Для выбранной сетки нет подходящих марок.";err.hidden=false;return}
   const m=pool.find(x=>x.id===String(fd.get("mark_id")||""));
   if(!m){err.textContent="Выберите доступную марку из ведомости.";err.hidden=false;return}
   try{rows=await schemeApi.list()}catch(error){err.textContent="Не удалось проверить остатки по схеме: "+String(error?.message||error);err.hidden=false;return}
   if(!markAvailable(m,id)){const quota=markPlacement(m);err.textContent="Марка "+(m.mark||m.title)+" полностью размещена: "+quota.placed+" из "+quota.total+" шт. Добавление невозможно.";err.hidden=false;return}
   const axisX=String(fd.get("axis_x")||targetGrid.axesX[0]),axisY=String(fd.get("axis_y")||targetGrid.axesY[0]),dx=num(fd.get("offset_x_mm")),dy=num(fd.get("offset_y_mm")),x=num(targetGrid.xPos.get(axisX))+dx,y=num(targetGrid.yPos.get(axisY))+dy;
   const kind=String(fd.get("geometry_type")||"column"),z0=num(fd.get("z0_mm")),z1=num(fd.get("z1_mm"));
   if(!id&&f.dataset.copyPosition==="1"&&guessGeometry(m)!==(kind==="bent"?"beam":kind)){
    err.textContent="Для копируемой позиции выберите марку соответствующего типа конструкции.";err.hidden=false;return
   }
   const endX=String(fd.get("end_axis_x")||targetGrid.axesX[0]),endY=String(fd.get("end_axis_y")||targetGrid.axesY[0]),endDx=num(fd.get("end_offset_x_mm")),endDy=num(fd.get("end_offset_y_mm")),x2=num(targetGrid.xPos.get(endX))+endDx,y2=num(targetGrid.yPos.get(endY))+endDy;
   const ridgeMode=fd.get("ridge_mode")==="manual"?"manual":"center",
    manualMidX=String(fd.get("mid_axis_x")||targetGrid.axesX[0]),
    manualMidY=String(fd.get("mid_axis_y")||targetGrid.axesY[0]),
    manualDx=num(fd.get("mid_offset_x_mm")),manualDy=num(fd.get("mid_offset_y_mm")),
    mx=ridgeMode==="center"?Math.round((x+x2)/2):num(targetGrid.xPos.get(manualMidX))+manualDx,
    my=ridgeMode==="center"?Math.round((y+y2)/2):num(targetGrid.yPos.get(manualMidY))+manualDy,
    midX=ridgeMode==="center"?closestAxis(mx,targetGrid.axesX,targetGrid.xPos):manualMidX,
    midY=ridgeMode==="center"?closestAxis(my,targetGrid.axesY,targetGrid.yPos):manualMidY,
    mdx=mx-num(targetGrid.xPos.get(midX)),mdy=my-num(targetGrid.yPos.get(midY)),
    mz=num(fd.get("mid_z_mm"));
   if(!targetGrid.axesX.includes(axisX)||!targetGrid.axesY.includes(axisY)||kind!=="column"&&(!targetGrid.axesX.includes(endX)||!targetGrid.axesY.includes(endY))){err.textContent="Выберите существующие оси выбранной сетки.";err.hidden=false;return}
   if(kind==="bent"){
    if(guessGeometry(m)!=="beam"||!targetGrid.axesX.includes(midX)||!targetGrid.axesY.includes(midY)){err.textContent="Ломаная балка подходит только для балок, ригелей и прогонов. Проверьте оси конька.";err.hidden=false;return}
    if(!String(fd.get("mid_z_mm")||"").trim()||Math.hypot(mx-x,my-y,mz-z0)<1||Math.hypot(x2-mx,y2-my,z1-mz)<1){err.textContent="Нужны три различные точки и отметка Z конька.";err.hidden=false;return}
   }
   if(kind==="column"&&z1<=z0){err.textContent="У колонны верх должен быть выше низа.";err.hidden=false;return}
   if(kind!=="column"&&Math.hypot(x2-x,y2-y,z1-z0)<1){err.textContent="Конечная точка должна отличаться от начальной.";err.hidden=false;return}
   if(!id&&f.dataset.copyPosition==="1"){
    const overlap=allRecords().some(row=>{
     const q=coord(row);if(q.geometryType!==kind)return false;
     const same=(a,b)=>Math.abs(a-b)<5;
     return same(q.x,x)&&same(q.y,y)&&same(q.z0,z0)&&
      (kind==="column"||same(q.x2,x2)&&same(q.y2,y2))&&same(q.z2,z1)&&
      (kind!=="bent"||same(q.mx,mx)&&same(q.my,my)&&same(q.mz,mz))
    });
    if(overlap){err.textContent="Позиция полностью совпадает с размещённой конструкцией. Измените оси, смещение или отметки Z перед сохранением копии.";err.hidden=false;return}
   }
   const storedRow=id?records().find(x=>String(x.id)===id):null,status=String(fd.get("status")||storedRow?.status||"planned"),section_type=String(fd.get("section_type")||"ibeam"),profile_name=String(fd.get("profile_name")||"").trim(),rot=num(fd.get("rotation_deg"));
   const existing=id?records().find(r=>r.id===id):null,used=new Set(allRecords().map(r=>String(r.position||r.title||"")));
   let internalPosition=String(existing?.position||existing?.title||"");
   if(!internalPosition){let n=1;do{internalPosition="COL-"+String(n++).padStart(4,"0")}while(used.has(internalPosition))}
   const g=markGroup(m),oldRow=id?arr(rows).find(r=>String(r.id)===id):null,previous=oldRow?.data||{},view=targetGrid.view;
   const payload={record_type:"scheme_column",title:internalPosition,data:{...previous,entity_type:"column",position:internalPosition,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:m.work_type_id||"",axis_x:axisX,axis_y:axisY,offset_x_mm:dx,offset_y_mm:dy,absolute_x_mm:x,absolute_y_mm:y,geometry_type:kind,absolute_x2_mm:kind==="column"?undefined:x2,absolute_y2_mm:kind==="column"?undefined:y2,
   absolute_mid_x_mm:kind==="bent"?mx:undefined,absolute_mid_y_mm:kind==="bent"?my:undefined,mid_z_mm:kind==="bent"?mz:undefined,
   mid_axis_x:kind==="bent"?midX:undefined,mid_axis_y:kind==="bent"?midY:undefined,
   mid_offset_x_mm:kind==="bent"?mdx:undefined,mid_offset_y_mm:kind==="bent"?mdy:undefined,
   ridge_mode:kind==="bent"?ridgeMode:undefined,
   mid_anchor_member_id:kind==="bent"&&ridgeMode==="manual"?previous.mid_anchor_member_id:undefined,end_axis_x:kind==="column"?undefined:endX,end_axis_y:kind==="column"?undefined:endY,end_offset_x_mm:kind==="column"?undefined:endDx,end_offset_y_mm:kind==="column"?undefined:endDy,end_z_mm:kind==="column"?undefined:z1,z0_mm:z0,z1_mm:z1,rotation_deg:rot,status,section_type,profile_name,scheme_group:g.key,scheme_group_label:g.label,scheme_view_id:view?.id||"all"}};
   try{
    const saved=id?await schemeApi.update(id,payload):await schemeApi.create(payload);
    const merged=rememberSavedSchemeRecord(saved);
    // Edited elevations must be read back from the authoritative saved record
    // before refreshing the in-place 3D renderer. Otherwise an older local
    // snapshot can remain on screen until the entire page is reloaded.
    if(id||!merged){
     try{
      const latest=await schemeApi.list();
      if(Array.isArray(latest))rows=latest;
      else if(!merged)throw Error("Список элементов не получен после сохранения.");
     }catch(refreshError){
      if(!merged)throw refreshError;
      console.warn("Монтажная схема: чтение сохранённых координат недоступно, используем подтверждённую запись.",refreshError);
     }
    }
    selectedId=String(saved?.id||id||"");d.close();
    if(pendingBuildingPlacement){
     if(kind!=="column")window.irBuildingView?.placementSaved?.({...pendingBuildingPlacement,savedEnd:{ax:endX,ay:endY,x:x2,y:y2,z:z1}});
     else window.irBuildingView?.placementCancelled?.();
     pendingBuildingPlacement=null
    }
    refreshAfterMemberChange()
   }catch(error){err.textContent="Не удалось сохранить элемент: "+String(error?.message||error);err.hidden=false}
  }
 }

 function importDialogHtml(){
  return `<dialog id="schemeImportDialog" class="scheme-view-dialog scheme-import-dialog">
    <div class="scheme-editor-head"><div><h2>Импорт размещения из КМД (JSON)</h2><p>Проверка марок по ведомости текущего вида работ, без изменения существующих элементов.</p></div><button type="button" id="schemeImportClose">×</button></div>
    <label class="scheme-view-name">Файл примера JSON<input id="schemeImportFile" type="file" accept=".json,application/json"></label>
    <div class="scheme-import-result" id="schemeImportResult">Выберите файл размещения. Он будет сначала проверен без записи в базу данных.</div>
    <label class="scheme-import-consent"><input id="schemeImportConsent" type="checkbox"><span>Я понимаю, что черновые координаты и высоты требуют проверки по чертежам. Импортируемые элементы будут помечены «Не смонтирована».</span></label>
    <div class="scheme-form-error" id="schemeImportError" hidden></div>
    <div class="actions"><button type="button" id="schemeImportCancel">Отмена</button><button type="button" class="primary" id="schemeImportApply" disabled>Добавить проверенные совпадения марок</button></div>
   </dialog>`
 }
 function bindImportDialog(){
  if(!canEdit()||!activeWorkId)return;
  const dialog=document.getElementById("schemeImportDialog"),fileInput=document.getElementById("schemeImportFile"),message=document.getElementById("schemeImportResult"),consent=document.getElementById("schemeImportConsent"),apply=document.getElementById("schemeImportApply"),error=document.getElementById("schemeImportError");
  if(!dialog||!fileInput||!message||!consent||!apply||!error)return;
  let batch=[];
  const reportError=text=>{error.textContent=text;error.hidden=!text};
  const updateApply=()=>{apply.disabled=!batch.length||!consent.checked};
  const normalizedMark=v=>norm(v).replace(/\s+/g,"").replace(/^k(?=\d)/,"к").replace(/^b(?=\d)/,"в").replace(/^f(?=\d)/,"ф");
  const open=()=>{batch=[];fileInput.value="";consent.checked=false;message.textContent="Сначала выберите файл: данные не будут записаны до вашего подтверждения.";reportError("");updateApply();dialog.showModal()};
  document.getElementById("schemeImportOpen")?.addEventListener("click",open);
  document.getElementById("schemeImportCancel").onclick=()=>dialog.close();
  document.getElementById("schemeImportClose").onclick=()=>dialog.close();
  consent.onchange=updateApply;
  fileInput.onchange=async()=>{
   batch=[];consent.checked=false;updateApply();reportError("");
   const file=fileInput.files?.[0];if(!file)return;
   if(file.size>5*1024*1024){reportError("Слишком большой JSON-файл (максимум 5 МБ).");return}
   try{
    const info=JSON.parse(await file.text());
    if(info?.schema!=="ir-project-scheme-placements-v1"||!Array.isArray(info.placements)||info.placements.length>3000||!info.placements.length)throw Error("Неверный формат или отсутствуют элементы.");
    const scoped=workMarks(),candidates=new Map();
    for(const m of scoped){const k=normalizedMark(m.mark||m.title);if(k){if(!candidates.has(k))candidates.set(k,[]);candidates.get(k).push(m)}}
    const keys=new Set(),existing=workRecords(),unmatched=[],ambiguous=[],invalid=[],duplicates=[];
    for(const p of info.placements){
     const key=String(p?.source_key||"").trim(),mark=String(p?.mark||"").trim(),matches=candidates.get(normalizedMark(mark))||[],kind=String(p?.geometry_type||"column"),x=Number(p?.x_mm),y=Number(p?.y_mm),z0=Number(p?.z0_mm),z1=Number(p?.z1_mm),x2=Number(p?.x2_mm),y2=Number(p?.y2_mm);
     if(!key||keys.has(key)||!mark||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z0)||!Number.isFinite(z1)||x<0||x>spanX||y<0||y>spanY||Math.abs(z0)>100000||Math.abs(z1)>100000||!["column","beam","brace","truss"].includes(kind)||kind==="column"&&z1<=z0||kind!=="column"&&(!Number.isFinite(x2)||!Number.isFinite(y2)||Math.hypot(x2-x,y2-y,z1-z0)<1)){invalid.push(mark||key||"неизвестный");continue}
     keys.add(key);
     if(!matches.length){unmatched.push(mark);continue}
     if(matches.length>1){ambiguous.push(mark);continue}
     const m=matches[0];
     if(existing.some(r=>String(r.source_import_key||"")===key||String(r.mark_id||"")===String(m.id)&&Math.abs(worldPosition(r).x-x)<250&&Math.abs(worldPosition(r).y-y)<250&&Math.abs(num(r.z0_mm)-z0)<250)){duplicates.push(mark);continue}
     batch.push({m,p,key,kind,x,y,z0,z1,x2,y2})
    }
    const gridNote=(JSON.stringify(info.axes_x||[])!==JSON.stringify(axesX)||JSON.stringify(info.axes_y||[])!==JSON.stringify(axesY))?" Названия осей отличаются от активной сетки — применены абсолютные координаты в миллиметрах.":"";
    message.innerHTML=`<b>${esc(info.project||file.name)}</b><div>В файле: ${info.placements.length}; можно добавить: <strong>${batch.length}</strong>; уже размещены: ${duplicates.length}; не найдены в ведомости: ${unmatched.length}; неоднозначные марки: ${ambiguous.length}; ошибки: ${invalid.length}.</div><small>${esc(gridNote)}${unmatched.length?" Не найдены: "+esc([...new Set(unmatched)].slice(0,16).join(", ")):""}${ambiguous.length?" Неоднозначные: "+esc([...new Set(ambiguous)].slice(0,12).join(", ")):""}</small><p><b>Внимание:</b> координаты и отметки в демо-файле предварительные. Никакие существующие записи не изменяются.</p>`;
    updateApply()
   }catch(e){reportError("Не удалось прочитать пример: "+String(e?.message||e))}
  };
  apply.onclick=async()=>{
   if(!canEdit()||!batch.length||!consent.checked)return;
   apply.disabled=true;fileInput.disabled=true;reportError("");
   let created=0,failed=0;
   for(const item of batch){
    const {m,p,key,kind,x,y,z0,z1,x2,y2}=item;
    const ax=closestAxis(x,axesX,axisXPos),ay=closestAxis(y,axesY,axisYPos),g=markGroup(m);
    const position="COL-DEMO-"+key.replace(/[^a-z0-9_-]/gi,"").slice(0,48);
    const payload={record_type:"scheme_column",title:position,data:{entity_type:"column",position,mark_id:m.id,mark:m.mark||m.title||"",mark_name:m.name||"",work_type_id:activeWorkId,axis_x:ax,axis_y:ay,offset_x_mm:x-num(axisXPos.get(ax)),offset_y_mm:y-num(axisYPos.get(ay)),absolute_x_mm:x,absolute_y_mm:y,geometry_type:kind,absolute_x2_mm:kind==="column"?undefined:x2,absolute_y2_mm:kind==="column"?undefined:y2,end_z_mm:kind==="column"?undefined:z1,z0_mm:z0,z1_mm:z1,status:"planned",section_type:"ibeam",profile_name:"",scheme_group:g.key,scheme_group_label:g.label,source_import_key:key,source_import_doc:String(p.source_sheet||"КМД"),import_requires_verification:true,import_approximate:p.approximate===true}};
    try{await schemeApi.create(payload);created++}catch(e){failed++;console.error("Ошибка импорта КМД",key,e)}
   }
   fileInput.disabled=false;
   try{rows=await schemeApi.list()}catch(e){reportError("Элементы добавлены, но перечитать базу не удалось: "+String(e?.message||e));return}
   activeScheme="all";selectedId="";hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";
   dialog.close();draw();
   alert(`Импорт чернового размещения завершён. Добавлено: ${created}. Ошибок: ${failed}. Проверьте координаты и высоты по КМД.`)
  };
 }
 function viewDialogHtml(){
  const types=availableGroups();
  return `<dialog id="schemeViewDialog" class="scheme-view-dialog"><form id="schemeViewForm" novalidate><input type="hidden" name="view_id">
  <div class="scheme-editor-head"><div><h2 id="schemeViewTitle">Добавить сетку</h2><p>Общая схема остаётся всегда. Выберите виды марок для дополнительной сетки.</p></div><button type="button" id="schemeViewClose">×</button></div>
  <label class="scheme-view-name">Название сетки<input type="text" name="view_name" maxlength="90" required placeholder="Например: Фахверк, стены А–Л"></label>
  <b class="scheme-view-types-title">Виды марок из ведомости</b>
  <div class="scheme-view-types">${types.map(t=>`<label><input type="checkbox" name="mark_group" value="${esc(t.key)}"><span><b>${esc(t.label)}</b><small>${t.count} марок</small></span></label>`).join("")||'<p>В ведомости нет подходящих марок.</p>'}</div>
  <p class="scheme-view-explain">Каждая сетка может иметь собственные оси и размеры. Все элементы дополнительно отображаются в Общей схеме.</p>
  <div id="schemeViewError" class="scheme-form-error" hidden></div>
  <div class="actions"><button type="button" id="schemeViewCancel">Отмена</button><button type="submit" class="primary">Сохранить сетку</button></div></form></dialog>`
 }
 function bindViewManager(){
  if(!canEdit())return;
  const dlg=document.getElementById("schemeViewDialog"),form=document.getElementById("schemeViewForm"),err=document.getElementById("schemeViewError");if(!dlg||!form)return;
  const open=(v=null)=>{form.reset();err.hidden=true;form.elements.view_id.value=v?.id||"";form.elements.view_name.value=v?.data?.name||v?.title||"";document.getElementById("schemeViewTitle").textContent=v?"Настроить сетку":"Добавить сетку";const keys=groupKeys(v);form.querySelectorAll('input[name="mark_group"]').forEach(el=>el.checked=keys.includes(el.value));dlg.showModal()};
  document.getElementById("schemeNewView")?.addEventListener("click",()=>open());
  document.getElementById("schemeEditView")?.addEventListener("click",()=>open(activeView()));
  document.getElementById("schemeViewCancel").onclick=()=>dlg.close();document.getElementById("schemeViewClose").onclick=()=>dlg.close();
  document.getElementById("schemeDeleteView")?.addEventListener("click",async()=>{const v=activeView();if(!v||!confirm(`Удалить сетку «${v.data?.name||v.title}»? Все элементы останутся на Общей схеме.`))return;try{await schemeApi.remove(v.id);rows=await schemeApi.list();activeScheme="all";selectedId="";refreshGridModel();draw()}catch(e){alert("Ошибка удаления сетки: "+String(e?.message||e))}});
  form.onsubmit=async e=>{e.preventDefault();err.hidden=true;const id=String(form.elements.view_id.value||""),name=String(form.elements.view_name.value||"").trim(),groups=[...form.querySelectorAll('input[name="mark_group"]:checked')].map(el=>el.value);
   if(!name||!groups.length){err.textContent="Введите название сетки и выберите минимум один вид марок.";err.hidden=false;return}
   if(customViews().some(v=>String(v.id)!==id&&norm(v.data?.name||v.title)===norm(name))){err.textContent="Такая сетка уже существует.";err.hidden=false;return}
   const old=customViews().find(v=>String(v.id)===id),data={...old?.data,entity_type:"scheme_view",work_type_id:activeWorkId,name,mark_groups:groups,grid:old?.data?.grid||JSON.parse(JSON.stringify(baseGrid()))};
   try{const saved=id?await schemeApi.update(id,{record_type:"scheme_view",title:name,data}):await schemeApi.create({record_type:"scheme_view",title:name,data});rows=await schemeApi.list();const v=customViews().find(v=>String(v.id)===String(saved?.id||id))||customViews().find(v=>v.data?.name===name);
    activeScheme=v?"view:"+v.id:"all";selectedId="";refreshGridModel();dlg.close();draw()
   }catch(e){err.textContent="Ошибка сохранения сетки: "+String(e?.message||e);err.hidden=false}
  }
 }

 function onSchemePreviewKeydown(event){
  if(event.key==="Escape"&&previewFullscreen){event.preventDefault();leaveSchemeFullscreen()}
 }
 function onSchemePreviewNativeChange(){
  if(previewFullscreen&&previewNativeFullscreen&&!document.fullscreenElement)leaveSchemeFullscreen()
 }
 function onSchemePreviewRouteChange(){
  if(previewFullscreen)leaveSchemeFullscreen(false)
 }
 function leaveSchemeFullscreen(redraw=true){
  if(!previewFullscreen)return;
  const wasNative=previewNativeFullscreen;
  previewFullscreen=false;previewNativeFullscreen=false;
  document.body.style.overflow=previewOriginalOverflow;
  document.removeEventListener("keydown",onSchemePreviewKeydown);
  document.removeEventListener("fullscreenchange",onSchemePreviewNativeChange);
  window.removeEventListener("hashchange",onSchemePreviewRouteChange);
  if(wasNative&&document.fullscreenElement&&typeof document.exitFullscreen==="function")Promise.resolve(document.exitFullscreen()).catch(()=>{});
  if(redraw)draw()
 }
 function enterSchemeFullscreen(){
  if(previewFullscreen)return;
  previewOriginalOverflow=document.body.style.overflow;
  previewFullscreen=true;document.body.style.overflow="hidden";
  document.addEventListener("keydown",onSchemePreviewKeydown);
  document.addEventListener("fullscreenchange",onSchemePreviewNativeChange);
  window.addEventListener("hashchange",onSchemePreviewRouteChange);
  draw();
  if(!document.fullscreenElement&&typeof document.documentElement?.requestFullscreen==="function"){
   let fullscreenPromise;try{fullscreenPromise=document.documentElement.requestFullscreen()}catch(e){fullscreenPromise=Promise.reject(e)}
   Promise.resolve(fullscreenPromise).then(()=>{
    if(previewFullscreen)previewNativeFullscreen=true;
    else if(document.fullscreenElement&&typeof document.exitFullscreen==="function")return document.exitFullscreen()
   }).catch(()=>{})
  }
 }
 function draw(){
  if(activeScheme!=="all"&&!frameMode&&!activeView()){activeScheme="all";refreshGridModel()}
  if(selectedId&&!columns().some(c=>c.id===selectedId))selectedId="";
  const s=stats(),mp=statusCounts(),works=enabledWorks(),currentWork=works.find(w=>w.id===activeWorkId)||null,workOptions='<option value="__frame__" '+(frameMode?'selected':'')+'>Каркас — все виды работ</option>'+works.map(w=>'<option value="'+esc(w.id)+'" '+(!frameMode&&w.id===activeWorkId?'selected':'')+'>'+esc(w.name)+(w.code?' · '+esc(w.code):'')+'</option>').join(""),groupOptions=schemeGroups().map(g=>`<option value="${esc(g.key)}" ${g.key===activeScheme?"selected":""}>${esc(g.label)} · ${g.marks} марок · ${g.placed} элементов</option>`).join(""),editActions=canEdit()?`<button type="button" class="scheme-grid-button" id="schemeGridConfig">⚙ Параметры сетки</button>${!frameMode&&activeWorkId?`<button type="button" class="scheme-grid-button" id="schemeNewView">＋ Добавить сетку</button>${activeView()?`<button type="button" class="scheme-grid-button" id="schemeEditView">Изменить</button><button type="button" class="scheme-grid-button danger" id="schemeDeleteView">Удалить сетку</button>`:""}`:""}`:"",emptyOverlay=activeWorkId?(s.total?"":`<div class="scheme-empty-overlay"><b>Схема пока пустая</b><span>Нажмите «Добавить элемент» и выберите марку для этой монтажной схемы.</span></div>`):`<div class="scheme-empty-overlay"><b>Монтажная схема не включена</b><span>Откройте «Виды работ» и включите галочку «Нужна монтажная схема» у нужного вида работ.</span></div>`;
  app.innerHTML=`<div class="scheme-page ${canEdit()&&activeWorkId?"has-add-dock":""} ${mode==="building"?"scheme-page-building":""}">
   <div class="scheme-head"><button class="back" id="schemeBack">← Назад</button><div><h1>Монтажная схема</h1><p>${esc(object.name||"")}${frameMode?"":currentWork?` · ${esc(currentWork.name)}`:""} · ${esc(activeGroup().label)}</p></div><div class="scheme-head-actions"><label class="scheme-type-select-wrap work"><span>Режим / вид работ</span><select id="schemeWorkSelect" data-native-select="1">${workOptions}</select></label><label class="scheme-type-select-wrap"><span>Схема</span><select id="schemeTypeSelect" data-native-select="1" ${frameMode||activeWorkId?"":"disabled"}>${groupOptions}</select></label><div class="scheme-view-switch"><button data-mode="building" class="${mode==="building"?"on":""}">Общий 3D</button><button data-mode="plan" class="${mode==="plan"?"on":""}">План</button></div>${editActions}</div></div>
   <div class="scheme-summary">
    <div><span>Оси ${esc(axesX[0])}–${esc(axesX.at(-1))}</span><b>${fmt(spanX)} мм</b><small>${gridDirX==="ltr"?"Слева направо":"Справа налево"}: ${esc(axesX[0])} → ${esc(axesX.at(-1))} · ${gridXSpans.length} пролётов</small></div>
    <div><span>Оси ${esc(axesY[0])}–${esc(axesY.at(-1))}</span><b>${fmt(spanY)} мм</b><small>${gridDirY==="btt"?"Снизу вверх":"Сверху вниз"}: ${esc(axesY[0])} → ${esc(axesY.at(-1))} · ${gridYSpans.length} пролётов</small></div>
    <div><span>Размещено на схеме</span><b>${s.total}</b><small>${esc(activeGroup().label)} · ${activeMarks().length} позиций ведомости</small></div>
    <div><span>Готовность по ведомости</span><b>${mp.pct}%</b><small>${fmt(mp.mounted)} из ${fmt(mp.total)} шт. смонтировано</small></div>
   </div>
   <div class="scheme-mark-summary" aria-label="Состояние марок по ведомости">
    <div><span>Всего по ведомости</span><b>${fmt(mp.total)} <small>шт.</small></b></div>
    <div class="mounted"><span>Смонтировано</span><b>${fmt(mp.mounted)} <small>шт.</small></b></div>
    <div class="remaining"><span>Осталось</span><b>${fmt(mp.left)} <small>шт.</small></b></div>
    <div><span>На схеме</span><b>${mp.placed} <small>элем.</small></b><small>${mp.placedMounted} полностью смонтировано · ${mp.placedPartial} частично</small></div>
   </div>
   <div class="scheme-mark-sync-hint"><span>Статусы связаны с ведомостью марок и ежедневными отчётами. Частичное выполнение не определяет конкретную установленную конструкцию.</span><button type="button" id="schemeRefreshMarkProgress">↻ Обновить по ведомости</button></div>
   <div id="schemeMarkSyncNotice" class="scheme-mark-sync-result ${syncNotice?(syncNotice.ok?"success":"error"):""}" role="status" aria-live="polite" ${syncNotice?"":"hidden"}>${syncNotice?esc(syncNotice.text):""}</div>
   <section class="scheme-visibility" aria-label="Фильтры монтажной схемы">
    <div class="scheme-visibility-top">
     <details class="scheme-layers" ${layersPanelOpen?"open":""}><summary>Слои по видам марок <small>${allVisibleTypes().filter(g=>!hiddenGroups.has(g.key)).length} из ${allVisibleTypes().length}</small></summary>
      <div class="scheme-layer-panel">
       <div class="scheme-layer-header"><b>Показать конструкции</b><div><button type="button" id="schemeLayersShowAll">Все</button><button type="button" id="schemeLayersHideAll">Скрыть</button></div></div>
       <div class="scheme-layer-list">${allVisibleTypes().map(g=>`<button type="button" data-scheme-layer="${esc(g.key)}" class="${hiddenGroups.has(g.key)?"off":"on"}" aria-pressed="${!hiddenGroups.has(g.key)}" title="${esc(g.label)}">${esc(g.label)} <small>${g.count}</small></button>`).join("")}</div>
      </div>
     </details>
     <label>Статус<select id="schemeStatusFilter" data-native-select="1"><option value="all" ${statusFilter==="all"?"selected":""}>Все</option><option value="planned" ${statusFilter==="planned"?"selected":""}>Не смонтированы</option><option value="mounted" ${statusFilter==="mounted"?"selected":""}>Смонтированы</option><option value="partial" ${statusFilter==="partial"?"selected":""}>Частично</option></select></label>
     <label>Отметка от, мм<input id="schemeLevelMin" type="number" step="100" placeholder="Любая" value="${esc(levelMin)}"></label>
     <label>До, мм<input id="schemeLevelMax" type="number" step="100" placeholder="Любая" value="${esc(levelMax)}"></label>
     <button id="schemeVisibilityReset" type="button">Сбросить фильтры</button>
     <span class="scheme-visible-counter">На экране: <b>${columns().length}</b> из ${s.total}</span>
    </div>
   </section>
   <div class="scheme-workspace">
    <section class="scheme-stage ${mode==="building"?"scheme-building-stage":""} ${previewFullscreen?"scheme-preview-fullscreen":""}" id="schemePreviewStage" aria-label="Предпросмотр монтажной схемы" data-scheme-background="${currentBackground()}" data-scheme-contrast="${backgroundIsDark()?"dark":"light"}" style="--scheme-custom-background:${currentCustomBackground()}">
     <div class="scheme-stage-toolbar"><div class="scheme-preview-title"><b>Монтажная схема · ${esc(activeGroup().label)}</b><span>${s.total} элементов · ${mode==="building"?"Общий 3D":"План"}</span></div>
      <div class="scheme-legend"><span><i class="mounted"></i>Смонтировано</span><span><i class="planned"></i>Не смонтировано</span><span><i class="partial"></i>Частично</span><span><i class="between"></i>Со смещением от оси</span></div>
      <div class="scheme-toolbar-actions"><div class="scheme-preview-mode-switch"><button type="button" data-mode="building" class="${mode==="building"?"on":""}">Общий 3D</button><button type="button" data-mode="plan" class="${mode==="plan"?"on":""}">План</button></div><button type="button" id="schemeFullscreenToggle" class="scheme-fullscreen-toggle" title="${previewFullscreen?"Закрыть полноэкранный просмотр":"Предпросмотр схемы на весь экран"}">${previewFullscreen?"✕ Закрыть":"⛶ На весь экран"}</button><label class="scheme-background-picker" title="Цвет фона поля монтажной схемы"><span>Фон</span><select id="schemeBackgroundSelect" data-native-select="1" aria-label="Цвет фона монтажной схемы"><option value="standard" ${currentBackground()==="standard"?"selected":""}>Стандартный</option><option value="white" ${currentBackground()==="white"?"selected":""}>Белый</option><option value="gray" ${currentBackground()==="gray"?"selected":""}>Серый</option><option value="blue" ${currentBackground()==="blue"?"selected":""}>Голубой</option><option value="sand" ${currentBackground()==="sand"?"selected":""}>Бежевый</option><option value="dark" ${currentBackground()==="dark"?"selected":""}>Тёмный</option><option value="custom" ${currentBackground()==="custom"?"selected":""}>Свой цвет</option></select><input id="schemeBackgroundCustom" type="color" aria-label="Выбрать свой цвет фона" value="${currentCustomBackground()}" ${currentBackground()==="custom"?"":"hidden"}></label><button type="button" id="schemeToggleLabels" class="${labelsVisible?"on":""}">Подписи</button><button type="button" id="schemeToggleDimensions" class="${dimensionsVisible?"on":""}" title="Показать межосевые размеры сетки">Размеры</button><div class="scheme-zoom"><button type="button" id="schemeZoomOut" title="Уменьшить">−</button><button type="button" id="schemeZoomValue" title="Вернуть 100%">${Math.round(zoom*100)}%</button><button type="button" id="schemeZoomIn" title="Увеличить">+</button></div><div class="scheme-orient"><button type="button" id="schemeRotate90Left" title="Повернуть на 90° влево">↶90°</button><button type="button" id="schemeRotationValue" title="Вернуть поворот в 0°">${viewRotation}°</button><button type="button" id="schemeRotate90Right" title="Повернуть на 90° вправо">↷90°</button></div></div>
     </div>
     <div class="scheme-canvas" id="schemeCanvas"></div>
     ${mode==="building"?"":emptyOverlay}
    </section>
    <aside class="scheme-details" id="schemeDetails" ${mode==="building"?"hidden":""}></aside>
   </div>
   ${canEdit()&&activeWorkId?'<div class="scheme-add-dock"><button type="button" class="primary" id="schemeAdd">＋ Добавить элемент</button></div>':""}
   <div class="scheme-hint"><b>Сетка:</b><span><strong>${esc(axesX[0])} → ${esc(axesX.at(-1))}</strong> — ${gridDirX==="ltr"?"слева направо":"справа налево"}, <strong>${esc(axesY[0])} → ${esc(axesY.at(-1))}</strong> — ${gridDirY==="btt"?"снизу вверх":"сверху вниз"}. Направление можно изменить в «Параметрах сетки».</span></div>
   ${canEdit()?gridEditorHtml()+editorHtml()+viewDialogHtml():""}
  </div>`;
  document.getElementById("schemeBack").onclick=()=>location.hash=`/objects/object/${oid}`;document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{if(!["building","plan"].includes(b.dataset.mode))return;mode=b.dataset.mode;if(mode==="building"&&!frameMode){activeScheme="all";refreshGridModel()}draw()});document.getElementById("schemeWorkSelect")?.addEventListener("change",e=>{frameMode=e.target.value==="__frame__";if(!frameMode)activeWorkId=e.target.value;activeScheme="all";selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";panX=0;panY=0;refreshGridModel();draw()});document.getElementById("schemeTypeSelect")?.addEventListener("change",e=>{activeScheme=e.target.value;selectedId="";syncNotice=null;elementSearch="";pickerScrollTop=0;panX=0;panY=0;refreshGridModel();draw()});
  document.querySelector(".scheme-layers")?.addEventListener("toggle",e=>{layersPanelOpen=e.target.open});
  document.querySelectorAll("[data-scheme-layer]").forEach(btn=>btn.addEventListener("click",()=>{layersPanelOpen=true;const key=btn.dataset.schemeLayer;if(hiddenGroups.has(key))hiddenGroups.delete(key);else hiddenGroups.add(key);updateLayerVisibility()}));
  document.getElementById("schemeLayersShowAll")?.addEventListener("click",()=>{layersPanelOpen=true;hiddenGroups.clear();updateLayerVisibility()});
  document.getElementById("schemeLayersHideAll")?.addEventListener("click",()=>{layersPanelOpen=true;allVisibleTypes().forEach(g=>hiddenGroups.add(g.key));updateLayerVisibility()});
  document.getElementById("schemeRefreshMarkProgress")?.addEventListener("click",refreshSchemeMarkProgress);
  document.getElementById("schemeStatusFilter")?.addEventListener("change",e=>{statusFilter=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeLevelMin")?.addEventListener("change",e=>{levelMin=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeLevelMax")?.addEventListener("change",e=>{levelMax=e.target.value;updateLayerVisibility()});
  document.getElementById("schemeVisibilityReset")?.addEventListener("click",()=>{hiddenGroups.clear();statusFilter="all";levelMin="";levelMax="";updateLayerVisibility()});
  document.getElementById("schemeFullscreenToggle")?.addEventListener("click",()=>previewFullscreen?leaveSchemeFullscreen():enterSchemeFullscreen());
  document.getElementById("schemeBackgroundSelect")?.addEventListener("change",e=>applySchemeBackground(e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("input",e=>applySchemeBackground("custom",e.target.value));
  document.getElementById("schemeBackgroundCustom")?.addEventListener("change",e=>applySchemeBackground("custom",e.target.value));
  // Annotation switches only repaint the existing canvas; never recreate WebGL.
  const updateAnnotations=()=>{
   document.getElementById("schemeToggleLabels")?.classList.toggle("on",labelsVisible);
   document.getElementById("schemeToggleDimensions")?.classList.toggle("on",dimensionsVisible);
   if(mode==="building"&&document.getElementById("irbCanvas")&&window.irBuildingView?.updateAnnotations)
    window.irBuildingView.updateAnnotations(labelsVisible,dimensionsVisible);
   else renderScene();
  };
  document.getElementById("schemeToggleLabels")?.addEventListener("click",()=>{labelsVisible=!labelsVisible;updateAnnotations()});
  document.getElementById("schemeToggleDimensions")?.addEventListener("click",()=>{dimensionsVisible=!dimensionsVisible;updateAnnotations()});
  document.getElementById("schemeZoomOut")?.addEventListener("click",()=>setZoom(zoom-.15));document.getElementById("schemeZoomIn")?.addEventListener("click",()=>setZoom(zoom+.15));document.getElementById("schemeZoomValue")?.addEventListener("click",()=>setZoom(1,true));
  const rotateView=delta=>{viewRotation=((viewRotation+delta)%360+360)%360;panX=0;panY=0;renderScene();const v=document.getElementById("schemeRotationValue");if(v)v.textContent=`${viewRotation}°`};document.getElementById("schemeRotate90Left")?.addEventListener("click",()=>rotateView(-90));document.getElementById("schemeRotate90Right")?.addEventListener("click",()=>rotateView(90));document.getElementById("schemeRotationValue")?.addEventListener("click",()=>{viewRotation=0;panX=0;panY=0;renderScene()});
  renderScene();renderDetails();bindGridEditor();bindEditor();bindViewManager()
 }
 draw();
 }catch(error){loading.fail(error)}
};
;

;
/* #31: src/additional-works-page.js */
"use strict";
window.irAdditionalWorksPage=async function(objectId,route={}){
 const oid=String(objectId||""),app=document.getElementById("app"),root=irProject.data.forObject(oid),reportsApi=root.section("reports");
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const unit=v=>String(v??"").trim()||"—";
 const number=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const value=v=>{const n=number(v);return n==null?"—":n.toLocaleString("ru-RU",{maximumFractionDigits:4})};
 const date=v=>{const t=String(v||"");if(/^\d{4}-\d{2}-\d{2}/.test(t))return t.slice(8,10)+"."+t.slice(5,7)+"."+t.slice(0,4);return t||"—"};
 const legacyId=(rid,index)=>"EW-"+String(rid)+"-"+String(index+1);
 const listRoute="/objects/object/"+encodeURIComponent(oid)+"/extra-works";
 const itemRoute=id=>listRoute+"/"+encodeURIComponent(id);
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
 const safeAct=act=>act&&typeof act==="object"&&typeof act.path==="string"&&act.path?{path:act.path,name:String(act.name||"Подписанный акт")}:null;
 const sections=await Promise.all([irProject.data.objects.get(oid),reportsApi.list()]);
 let [object,reportRows]=sections;
 if(!object){location.hash="/objects";return}
 // Assign each old additional-work line its own permanent ID, retaining its report and data.
 if(canEdit()){
  const normalized=[];
  for(const report of arr(reportRows)){
   const previous=arr(report.data?.additional_works);
   if(!previous.some(w=>!w?.id&&!w?.work_id)){normalized.push(report);continue}
   const additional_works=previous.map((w,i)=>({...w,id:String(w?.id||w?.work_id||legacyId(report.id,i))}));
   try{
    await reportsApi.update(report.id,{record_type:report.record_type||"item",title:report.title||"",data:{...(report.data||{}),additional_works}});
    normalized.push({...report,data:{...(report.data||{}),additional_works}})
   }catch(error){normalized.push(report);console.warn("Не удалось закрепить ID доп. работ в отчёте "+report.id,error)}
  }
  reportRows=normalized
 }
 const all=arr(reportRows).flatMap(report=>{
  const d=report.data||{},items=arr(d.additional_works);
  return items.map((w,index)=>({
   id:String(w?.id||w?.work_id||legacyId(report.id,index)),
   reportId:String(report.id),
   reportTitle:String(report.title||""),
   report,
   index,
   name:String(w?.name||"").trim(),
   qty:w?.qty??w?.count??"",
   volume:w?.volume??"",
   unit:unit(w?.unit),
   date:String(d.date||d.report_date||""),
   signedAct:safeAct(w?.signed_act),
   reportAct:safeAct(d.signed_act)
  })).filter(w=>w.name||String(w.qty).trim()||String(w.volume).trim());
 }).sort((a,b)=>b.date.localeCompare(a.date)||Number(b.reportId)-Number(a.reportId)||a.index-b.index);
 // IDs must remain unique, including after legacy report copies.
 const byId=new Map();for(const entry of all){if(!byId.has(entry.id))byId.set(entry.id,entry)}
 const workId=String(route.workId||"");
 let search="";
 const head=caption=>'<div class="additional-works-top"><button type="button" id="additionalWorksBack" class="additional-works-back">← '+(workId?"К списку дополнительных работ":"К объекту")+'</button><div><h1 style="font-size:20px!important;line-height:1.2!important;font-weight:750!important;color:#18364b!important">'+esc(caption)+'</h1><p>'+esc(object.name||"Объект")+'</p></div></div>';
 function openAct(path){
  return irProject.reportDocuments?.open?.(path).then(ok=>{if(ok===false)alert("Не удалось открыть акт: файл не найден.")}).catch(e=>alert("Не удалось открыть акт: "+String(e.message||e)))
 }
 // Match the other object section KPIs even in an existing Electron tab
 // where a stale stylesheet or more specific theme rules might remain loaded.
 function enforceCompactSummary(){
  const set=(selector,props)=>{
   app.querySelectorAll(selector).forEach(node=>{
    for(const [property,value] of Object.entries(props))node.style.setProperty(property,value,"important");
   });
  };
  set(".aw-stats",{gap:"9px"});
  set(".aw-stats > div",{
   "min-height":"64px",padding:"11px 13px",gap:"5px",
   "align-content":"center","border-radius":"9px"
  });
  set(".aw-stats span",{
   "font-size":"8px","font-weight":"400","line-height":"1.35",
   color:"#7c8d99"
  });
  set(".aw-stats b",{
   "font-size":"16px","font-weight":"750","line-height":"1.15",
   color:"#17364d"
  });
 }
 function listView(){
  const matched=all.filter(w=>!search||[w.name,w.id,w.reportId,w.date,w.unit].join(" ").toLowerCase().includes(search.toLowerCase())),withActs=all.filter(w=>w.signedAct).length;
  app.innerHTML='<div class="additional-works-page">'+head("Доп. работы")+
   '<div class="aw-stats"><div><span>Всего дополнительных работ</span><b>'+all.length+'</b></div><div><span>Подписанные акты загружены</span><b>'+withActs+'</b></div><div><span>Без индивидуального акта</span><b>'+Math.max(0,all.length-withActs)+'</b></div></div>'+
   '<div class="aw-list-toolbar"><div><h2>Дополнительные работы из ежедневных отчётов</h2><p>Каждая запись имеет собственный ID. Нажмите на строку, чтобы открыть её карточку и акт.</p></div><input type="search" id="awSearch" placeholder="Поиск по названию, ID, отчёту…" value="'+esc(search)+'" aria-label="Поиск дополнительных работ"></div>'+
   '<div class="aw-list-wrap"><table class="aw-table"><thead><tr><th>ID</th><th>Дата отчёта</th><th>Дополнительная работа</th><th>Количество</th><th>Объём</th><th>Подписанный акт</th></tr></thead><tbody>'+
   (matched.length?matched.map(w=>'<tr data-aw-id="'+esc(w.id)+'" tabindex="0" role="link"><td><span class="aw-id">'+esc(w.id)+'</span></td><td>'+esc(date(w.date))+'</td><td><b>'+esc(w.name||"Без наименования")+'</b><small>Ежедневный отчёт · ID '+esc(w.reportId)+'</small></td><td>'+esc(value(w.qty))+' '+esc(w.unit)+'</td><td>'+esc(value(w.volume))+' '+esc(w.unit)+'</td><td><span class="aw-status '+(w.signedAct?"ok":"pending")+'">'+(w.signedAct?"✓ Загружен":"Не загружен")+'</span></td></tr>').join(""):'<tr><td colspan="6" class="aw-empty">Дополнительных работ'+(search?" по запросу не найдено":" в ежедневных отчётах пока нет")+'.</td></tr>')+
   '</tbody></table></div><p class="aw-help">Список формируется из сохранённых ежедневных отчётов объекта. Для добавления работы откройте нужный отчёт.</p></div>';
  enforceCompactSummary();
  document.getElementById("additionalWorksBack").onclick=()=>location.hash="/objects/object/"+oid;
  document.getElementById("awSearch").oninput=e=>{const pos=e.target.selectionStart;search=e.target.value;listView();const i=document.getElementById("awSearch");i.focus();i.setSelectionRange(pos,pos)};
  document.querySelectorAll("[data-aw-id]").forEach(row=>{const go=()=>location.hash=itemRoute(row.dataset.awId);row.onclick=go;row.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}})
 }
 function detailView(entry){
  const act=entry.signedAct,reportAct=entry.reportAct;
  app.innerHTML='<div class="additional-works-page aw-detail">'+head("Дополнительная работа")+
   '<div class="aw-detail-head"><div><span>ID дополнительной работы</span><strong>'+esc(entry.id)+'</strong><h2>'+esc(entry.name||"Без наименования")+'</h2></div><span class="aw-status '+(act?"ok":"pending")+'">'+(act?"✓ Файл акта загружен":"Акт не загружен")+'</span></div>'+
   '<div class="aw-detail-metrics"><div><span>Дата ежедневного отчёта</span><b>'+esc(date(entry.date))+'</b></div><div><span>Количество</span><b>'+esc(value(entry.qty))+' '+esc(entry.unit)+'</b></div><div><span>Объём</span><b>'+esc(value(entry.volume))+' '+esc(entry.unit)+'</b></div><div><span>Отчёт</span><button id="awSourceReport">Открыть ежедневный отчёт #'+esc(entry.reportId)+' →</button></div></div>'+
   '<section class="aw-document"><div class="aw-document-heading"><div><h2>Подписанный акт</h2><p>Отдельный документ, закреплённый за этой дополнительной работой. PDF, JPG или PNG.</p></div></div>'+
   '<div class="aw-document-body"><div class="aw-file-icon">PDF</div><div class="aw-document-info"><b>'+esc(act?.name||"Подписанный акт не прикреплён")+'</b><small>'+(act?"Файл хранится в документах IR Project":"Выберите подписанный акт для этой работы")+'</small></div></div>'+
   '<div class="aw-document-actions">'+(act?'<button id="awOpenAct" class="aw-primary">Открыть акт</button>':'')+(canEdit()?'<button id="awUploadAct" class="'+(act?"":"aw-primary")+'">'+(act?"Заменить акт":"＋ Загрузить подписанный акт")+'</button>':'')+(act&&canEdit()?'<button id="awRemoveAct" class="aw-danger">Удалить акт</button>':'')+'</div><p id="awActionNote" class="aw-action-note" role="status" aria-live="polite"></p></section>'+
   (reportAct?'<section class="aw-legacy-document"><div><b>Приложение к ежедневному отчёту</b><p>Подтверждающий документ относится к отчёту целиком и не является индивидуальным актом дополнительной работы.</p></div><button id="awOpenReportAct">Открыть приложение</button></section>':'')+
   '</div>';
  document.getElementById("additionalWorksBack").onclick=()=>location.hash=listRoute;
  document.getElementById("awSourceReport").onclick=()=>location.hash="/objects/object/"+oid+"/reports/"+entry.reportId;
  document.getElementById("awOpenAct")?.addEventListener("click",()=>openAct(act.path));
  document.getElementById("awOpenReportAct")?.addEventListener("click",()=>openAct(reportAct.path));
  const note=document.getElementById("awActionNote"),busy=new Set();
  async function saveAct(next){
   const previous=entry.signedAct,report=entry.report,current=arr(report.data?.additional_works);
   const latest=await reportsApi.get(entry.reportId);
   if(!latest)throw Error("Исходный отчёт не найден.");
   const works=arr(latest.data?.additional_works);
   const found=works.findIndex((w,i)=>String(w.id||w.work_id||legacyId(entry.reportId,i))===entry.id);
   if(found<0)throw Error("Работа больше не найдена в ежедневном отчёте.");
   const normalized=works.map((w,i)=>({...w,id:String(w.id||w.work_id||legacyId(entry.reportId,i))}));
   const latestAct=safeAct(normalized[found].signed_act);
   normalized[found]={...normalized[found],signed_act:next};
   await reportsApi.update(entry.reportId,{record_type:latest.record_type||"item",title:latest.title||"",data:{...(latest.data||{}),additional_works:normalized}});
   // Do not delete any shared or legacy report act automatically.
   if(latestAct?.path&&latestAct.path!==next?.path){
    const stillUsed=normalized.some(w=>w.signed_act?.path===latestAct.path)||latest.data?.signed_act?.path===latestAct.path;
    if(!stillUsed)await irProject.reportDocuments?.remove?.(latestAct.path).catch(()=>{});
   }
   entry.signedAct=next;
   detailView(entry);
   const success=document.getElementById("awActionNote");if(success)success.textContent=next?"Акт сохранён для этой дополнительной работы.":"Индивидуальный акт удалён из карточки."
  }
  const run=async(callback)=>{
   if(busy.size)return;busy.add("saving");
   document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=true);note.textContent="Сохраняем изменения…";
   try{await callback()}catch(error){note.textContent="Ошибка: "+String(error?.message||error);document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=false)}finally{busy.clear()}
  };
  document.getElementById("awUploadAct")?.addEventListener("click",()=>run(async()=>{
   const file=await irProject.reportDocuments?.selectAct?.();
   if(!file?.path){note.textContent="Загрузка отменена.";document.querySelectorAll(".aw-document-actions button").forEach(b=>b.disabled=false);return}
   try{await saveAct({path:file.path,name:file.name||"Подписанный акт"})}catch(e){await irProject.reportDocuments?.remove?.(file.path).catch(()=>{});throw e}
  }));
  document.getElementById("awRemoveAct")?.addEventListener("click",()=>{if(!confirm("Убрать подписанный акт из карточки этой работы?"))return;return run(()=>saveAct(null))});
 }
 if(!workId){listView();return}
 const entry=byId.get(workId);
 if(!entry){app.innerHTML='<div class="additional-works-page aw-not-found">'+head("Дополнительная работа не найдена")+'<p>Запись удалена из ежедневного отчёта или её ID изменён.</p></div>';document.getElementById("additionalWorksBack").onclick=()=>location.hash=listRoute;return}
 detailView(entry)
};
;

/* #32: src/app.js */
"use strict";
const app=document.getElementById("app");
const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
let displayedVersion="...";const el=id=>document.getElementById(id);const data=()=>irProject.data||irProject;const objectSection=(id,key)=>data().forObject(id).section(key);
async function refreshVersion(){try{displayedVersion=await irProject.updater.version()}catch{}const v=document.querySelector(".app-version");if(v)v.textContent=`IR Project v${displayedVersion}`;const homeVersion=el("homeInstalledVersion");if(homeVersion)homeVersion.textContent=`IR Project · версия ${displayedVersion}`}
function go(path){location.hash=path}function mb(v){return(Number(v||0)/1048576).toFixed(1).replace(".",",")}function versionHtml(){return `<div class="app-version">IR Project v${esc(displayedVersion)}</div>`}
function updateDialogHtml(){return `<dialog id="updateDialog" class="update-dialog"><h2 id="updateTitle">Проверка обновления</h2><p id="updateText">Проверяем наличие новой версии...</p><div id="updateProgress" class="update-progress" hidden><div id="updateBar"></div></div><div id="updateActions" class="actions"></div></dialog>`}
function updateRefs(){return{d:el("updateDialog"),title:el("updateTitle"),text:el("updateText"),progress:el("updateProgress"),bar:el("updateBar"),actions:el("updateActions")}}
function showUpdate(){if(window!==window.top){try{if(window.parent?.irTabUpdates?.open)return window.parent.irTabUpdates.open()}catch(e){}}const u=updateRefs();if(!u.d)return;u.d.showModal();u.title.textContent="Проверка обновления";u.text.textContent="Проверяем наличие новой версии...";u.progress.hidden=true;u.actions.innerHTML="";irProject.updater.check().catch(e=>showUpdateError(e.message))}
function showUpdateError(message){const u=updateRefs();if(!u.d)return;if(!u.d.open)u.d.showModal();u.title.textContent="Ошибка обновления";u.text.textContent=message||"Не удалось проверить обновление.";u.progress.hidden=true;u.actions.innerHTML='<button id="updateClose">Закрыть</button>';el("updateClose").onclick=()=>u.d.close()}
if(window===window.top)irProject.updater.onStatus(status=>{const u=updateRefs();if(!u.d)return;if(!u.d.open)u.d.showModal();if(status.type==="available"){u.title.textContent="Доступно обновление";u.text.textContent=`Доступна версия ${status.version}. Обновить IR Project?`;u.progress.hidden=true;u.actions.innerHTML='<button id="updateNo">Нет</button><button id="updateYes" class="primary">Да, обновить</button>';el("updateNo").onclick=()=>u.d.close();el("updateYes").onclick=()=>{u.title.textContent="Скачивание обновления";u.text.textContent="Подготовка к загрузке...";u.progress.hidden=false;u.bar.style.width="0%";u.actions.innerHTML="";irProject.updater.download().catch(e=>showUpdateError(e.message))}}else if(status.type==="current"){displayedVersion=status.version||displayedVersion;refreshVersion();u.title.textContent="Обновление не требуется";u.text.textContent=`У вас установлена последняя версия IR Project ${displayedVersion}.`;u.progress.hidden=true;u.actions.innerHTML='<button id="updateClose">Закрыть</button>';el("updateClose").onclick=()=>u.d.close()}else if(status.type==="progress"){u.title.textContent="Скачивание обновления";u.text.textContent=`Загружено ${status.total?`${mb(status.transferred)} МБ из ${mb(status.total)} МБ`:mb(status.transferred)+" МБ"} — ${status.percent}%`;u.progress.hidden=false;u.bar.style.width=`${status.percent}%`}else if(status.type==="downloaded"){u.title.textContent="Обновление готово";u.text.textContent=`Версия ${status.version} скачана.`;u.progress.hidden=true;u.actions.innerHTML='<button id="installUpdate" class="primary">Установить и перезапустить</button>';el("installUpdate").onclick=()=>irProject.updater.install()}else if(status.type==="error")showUpdateError(status.message)});
function objectCard(o){const active=o.status!=="Завершен";return `<article class="object-card" data-object="${o.id}"><div class="object-cover"><div class="object-cover-top"><span class="status ${active?"active":"done"}"><i></i>${esc(o.status||"В работе")}</span><span class="open-arrow">↗</span></div><div class="object-cover-title"><h2>${esc(o.name)}</h2><p>${esc(o.address||"Адрес не указан")}</p></div></div><div class="object-info"><div><span>Заказчик</span><strong>${esc(o.customer||"—")}</strong></div><div><span>Генподрядчик</span><strong>${esc(o.general_contractor||"—")}</strong></div></div></article>`}
function sectionChecks(values={}){return Object.entries(sectionNames).map(([key,name])=>`<label class="section-check"><input type="checkbox" data-form-section="${key}" ${values[key]!==false?"checked":""}><span><strong>${esc(name)}</strong><small>${values[key]!==false?"Раздел включён":"Раздел отключён"}</small></span></label>`).join("")}
function formHtml(){return `<dialog id="formDialog" class="object-dialog"><form id="objectForm"><input type="hidden" name="id"><div class="form-heading"><div><h2 id="formTitle">Новый объект</h2><p class="form-subtitle">Основная информация и доступные разделы объекта</p></div><button type="button" class="dialog-x" id="dialogX">×</button></div><div class="form-grid object-basic-fields"><label>Название объекта<input name="name" required></label><label>Краткое название объекта *<input name="short_name" required maxlength="80" placeholder="Например, Варваринское"></label><label>Статус<select name="status"><option>В работе</option><option>Завершен</option></select></label><label>Адрес<input name="address" required></label></div><div class="object-parties"><div class="object-party-field"><label>Заказчик<input name="customer" required></label><div class="company-logo-editor object-party-logo-preview" id="customerLogoPreview"><span>Логотип не выбран</span></div><div class="object-party-logo-actions"><button type="button" id="customerLogoButton">Выбрать логотип</button><span id="customerLogoName">Не выбрано</span></div><small class="file-hint">Рекомендуемый размер: 360×120 px</small></div><div class="object-party-field"><label>Генподрядчик<input name="general_contractor" placeholder="Наименование генподрядчика"></label><div class="company-logo-editor object-party-logo-preview" id="contractorLogoPreview"><span>Логотип не выбран</span></div><div class="object-party-logo-actions"><button type="button" id="contractorLogoButton">Выбрать логотип</button><span id="contractorLogoName">Не выбрано</span></div><small class="file-hint">Рекомендуемый размер: 360×120 px</small></div></div><div class="file-row object-media-fields"><label>Фото объекта<small class="file-hint">Размер в программе: 900×155 px. Сохраняется только подготовленная версия.</small><div class="asset-preview asset-preview-cover" id="photoPreview"><span>Предпросмотр фото</span></div><div><button type="button" id="photoButton">Выбрать фото</button><span id="photoName">Не выбрано</span></div></label><label>Баннер объекта<small class="file-hint">Размер в программе: 1920×180 px. Сохраняется только подготовленная версия.</small><div class="asset-preview asset-preview-banner" id="bannerPreview"><span>Предпросмотр баннера</span></div><div><button type="button" id="bannerButton">Выбрать баннер</button><span id="bannerName">Не выбрано</span></div></label></div><div class="form-section-title"><div><strong>Разделы объекта</strong><span>Выберите, какие разделы будут доступны в этом объекте</span></div><button type="button" id="toggleAllSections">Включить все</button></div><div class="form-sections" id="formSections">${sectionChecks()}</div><div class="actions split"><button type="button" id="deleteObject" class="danger" hidden>Удалить объект</button><div><button type="button" id="cancel">Отмена</button><button type="submit" class="primary" id="saveObject">Создать объект</button></div></div></form></dialog>`}
function readSectionChecks(){const out={};document.querySelectorAll("[data-form-section]").forEach(x=>out[x.dataset.formSection]=x.checked);return out}function syncSectionLabels(){document.querySelectorAll("[data-form-section]").forEach(x=>{const small=x.closest(".section-check")?.querySelector("small");if(small)small.textContent=x.checked?"Раздел включён":"Раздел отключён"})}
async function objectPhotoMap(objectId){const rows=await objectSection(objectId,"photos").list();return Object.fromEntries(rows.filter(x=>["cover","banner"].includes(x.record_type)||["cover","banner"].includes(x.data?.photo_type)).map(x=>[x.record_type!=="item"?x.record_type:x.data.photo_type,x]))}
async function saveObjectPhoto(objectId,type,file,current){const old=current?.data?.file_path||current?.data?.file||"",payload={record_type:type,title:type,data:{photo_type:type,file_path:file}},saved=current?await objectSection(objectId,"photos").update(current.id,payload):await objectSection(objectId,"photos").create(payload);if(old&&old!==file)try{await irProject.images.remove(old)}catch{}return saved}

async function objectLogoMap(objectId){
 const rows=await objectSection(objectId,"object-meta").list();
 return Object.fromEntries(rows.filter(r=>["customer_logo","general_contractor_logo"].includes(r.record_type)).map(r=>[r.record_type,r]))
}
async function saveObjectLogo(objectId,type,file,current){
 const api=objectSection(objectId,"object-meta");
 const payload={record_type:type,title:type==="customer_logo"?"Логотип заказчика":"Логотип генподрядчика",data:{file_path:file}};
 const saved=current?await api.update(current.id,payload):await api.create(payload);
 const old=current?.data?.file_path||"";
 if(old&&old!==file)try{await irProject.images.remove(old)}catch{}
 return saved
}
async function objectActivity(id){let lastId=0,lastTime=0;await Promise.all(Object.keys(sectionNames).map(async key=>{try{const rows=await objectSection(id,key).list();for(const r of rows){const rid=Number(r.id)||0,t=Date.parse(String(r.updated_at||r.created_at||"").replace(" ","T")+"Z")||0;if(rid>lastId)lastId=rid;if(t>lastTime)lastTime=t}}catch{}}));return{lastId,lastTime}}
async function sortedObjects(){const objects=await data().objects.list(),enriched=await Promise.all(objects.map(async o=>({...o,_activity:await objectActivity(o.id)})));return enriched.sort((a,b)=>{const aDone=a.status==="Завершен",bDone=b.status==="Завершен";if(aDone!==bDone)return aDone?1:-1;if(b._activity.lastId!==a._activity.lastId)return b._activity.lastId-a._activity.lastId;if(b._activity.lastTime!==a._activity.lastTime)return b._activity.lastTime-a._activity.lastTime;return Number(b.id)-Number(a.id)})}

async function renderHomePortfolio(objects){
 const host=document.getElementById("homePortfolio");if(!host)return;
 const arr=x=>Array.isArray(x)?x:[];
 const val=x=>{const n=Number(String(x??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const norm=x=>String(x??"").trim().toLowerCase();
 const rec=r=>({id:String(r.id),...(r.data||{})});
 const time=r=>{const s=String(r.date||r.report_date||"").trim(),v=/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):/^\d{2}\.\d{2}\.\d{4}/.test(s)?s.slice(6,10)+"-"+s.slice(3,5)+"-"+s.slice(0,2):"";return v?Date.parse(v+"T00:00:00Z")||0:0};
 const day=r=>{const s=String(r.date||r.report_date||"");return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(8,10)+"."+s.slice(5,7)+"."+s.slice(0,4):s||"—"};
 const fmt=x=>Number(x.toFixed(1)).toLocaleString("ru-RU",{maximumFractionDigits:1});
 const personnel=r=>{const w=arr(r.workers).length?arr(r.workers):arr(r.people),c=arr(r.responsible).length?arr(r.responsible):arr(r.responsibles);return w.reduce((s,x)=>s+val(x.count??x.qty),0)+c.reduce((s,x)=>s+(val(x.count??x.qty)>0?val(x.count??x.qty):(String(x.name||x.role||"").trim()?1:0)),0)};
 const equipment=r=>arr(r.equipment).reduce((s,x)=>s+val(x.count??x.qty),0);
 const volume=w=>{const n=w.volume??w.total_volume,q=val(w.qty??w.count??w.quantity),marked=!!String(w.mark_id||w.mark||"").trim(),uv=val(w.unit_volume??w.volume_one);return n!==undefined&&n!==null&&String(n).trim()!==""?(val(n)||(!marked?q:0)):(uv?q*uv:(!marked?q:0))};
 const markVolume=m=>{const d=m.data||m,n=d.total_value??d.total_volume;return n!==undefined&&n!==null&&String(n).trim()!==""?val(n):val(d.qty??d.count)*val(d.unit_volume??d.volume_one)};
  const reportVolumes=r=>{
   const grouped=new Map();
   for(const w of arr(r.items||r.works)){
    const service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга";
    const name=String(w.work_type||w.type||"Работа").trim()||"Работа";
    const unit=String(w.unit||w.measure_unit||"").trim()||(service?"":"ед.");
    const quantity=service?0:volume(w);
    if(!service&&quantity<=0)continue;
    const key=name.toLowerCase()+"|"+(service?"service":unit.toLowerCase());
    if(!grouped.has(key))grouped.set(key,{name,unit,total:0,service,done:false});
    const item=grouped.get(key);
    if(service)item.done=item.done||w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));
    else item.total+=quantity;
   }
   return [...grouped.values()];
  };

 // Identifies overdue scheduled works and works more than 10 percentage points behind plan.
 function lateWorkRows(schedule,work,marks,reports){
  const DAY=86400000,todayLocal=new Date(),today=Date.UTC(todayLocal.getFullYear(),todayLocal.getMonth(),todayLocal.getDate());
  const parse=x=>{const s=String(x||"").slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const ms=Date.parse(s+"T00:00:00Z");return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===s?ms:null};
  const types=new Map(arr(work).map(row=>{const d=row.data||row,id=String(row.id),service=d.accounting_type==="service"||norm(d.unit)==="услуга";const hasMarks=!service&&(d.has_marks===true||["installation","fabrication"].includes(d.work_category)||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||row.title).includes("монтаж")||norm(d.work_type||row.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===id))));return[id,{name:d.work_type||row.title||"Без названия",service,hasMarks,plan:val(d.planned_volume??d.plan_volume)}]}));
  const plans=new Map(),facts=new Map(),done=new Set();
  for(const [id,t] of types)if(!t.service&&!t.hasMarks&&t.plan>0)plans.set(id,t.plan);
  for(const m of arr(marks)){const d=m.data||m,id=String(d.work_type_id||""),t=types.get(id),amount=markVolume(m);if(t&&!t.service&&amount>0)plans.set(id,(plans.get(id)||0)+amount)}
  for(const r of reports)for(const w of arr(r.items||r.works)){
   const id=String(w.work_type_id||""),type=types.get(id),finished=w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));
   if(type?.service){if(finished)done.add(id)}
   else if(type){if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const amount=volume(w);if(amount>0)facts.set(id,(facts.get(id)||0)+amount)}
   else if(finished&&!id){for(const [key,t] of types)if(t.service&&norm(t.name)===norm(w.work_type||w.type))done.add(key)}
  }
  const results=[];
  for(const row of arr(schedule)){
   const d=row.data||row||{},id=String(d.work_type_id||""),type=types.get(id),start=parse(d.start_date),end=parse(d.end_date);
   if(!type||start===null||end===null||end<start||today<start)continue;
   const expired=today>end,days=expired?Math.floor((today-end)/DAY):0,name=type.name;
   if(type.service){if(expired&&!done.has(id))results.push({name,start:String(d.start_date).slice(0,10),end:String(d.end_date).slice(0,10),days,lag:null,progress:0,kind:"overdue"});continue}
   const plan=plans.get(id)||0;if(plan<=0)continue;
   const percentage=Math.max(0,Math.min(100,(facts.get(id)||0)/plan*100));
   if(percentage>=99.999)continue;
   const duration=Math.max(1,Math.floor((end-start)/DAY)+1),elapsed=expired?duration:Math.floor((today-start)/DAY)+1,expected=Math.max(0,Math.min(100,elapsed/duration*100)),lag=expected-percentage;
   if(expired||lag>10)results.push({name,start:String(d.start_date).slice(0,10),end:String(d.end_date).slice(0,10),days,lag:Number(lag.toFixed(1)),progress:Number(percentage.toFixed(1)),kind:expired?"overdue":"behind"});
  }
  return results.sort((a,b)=>b.days-a.days||(b.lag??0)-(a.lag??0)||a.end.localeCompare(b.end));
 }

 function completion(work,marks,reports){
  const t=new Map(arr(work).map(r=>{const d=r.data||{},id=String(r.id),service=d.accounting_type==="service"||norm(d.unit)==="услуга",marked=d.has_marks===true||["installation","fabrication"].includes(d.work_category)||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===id)));return[id,{service,marked,plan:val(d.planned_volume??d.plan_volume)}]}));
  const plan=new Map(),fact=new Map(),done=new Set();
  for(const [id,x] of t)if(!x.service&&!x.marked&&x.plan>0)plan.set(id,x.plan);
  for(const m of arr(marks)){const id=String(m.data?.work_type_id||"");if(t.has(id)&&!t.get(id).service)plan.set(id,(plan.get(id)||0)+markVolume(m))}
  for(const r of reports)for(const w of arr(r.items||r.works)){const id=String(w.work_type_id||""),x=t.get(id);if(!x)continue;if(x.service||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга"){if(w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status)))done.add(id)}else{const n=volume(w);if(n>0)fact.set(id,(fact.get(id)||0)+n)}}
  let sum=0,count=0;
  for(const [id,x] of t){if(x.service){sum+=done.has(id)?100:0;count++}else if((plan.get(id)||0)>0){sum+=Math.min(100,Math.max(0,(fact.get(id)||0)/plan.get(id)*100));count++}}
  return{sum,count};
 }
 try{
  let incomplete=false;
  const bundles=await Promise.all(objects.map(async o=>{
   const load=async section=>{try{return arr(await objectSection(o.id,section).list())}catch(e){console.warn("Home portfolio:",o.id,section,e);incomplete=true;return[]}};
   const [w,m,raw,schedule,objectMeta]=await Promise.all([load("work-types"),load("marks"),load("reports"),o.status==="В работе"?load("schedule"):Promise.resolve([]),load("object-meta")]);
   const reports=raw.map(rec).filter(r=>time(r)>0).sort((a,b)=>time(b)-time(a)||val(b.id)-val(a.id));
   const numbers=new Map([...reports].sort((a,b)=>val(a.id)-val(b.id)).map((x,i)=>[x.id,i+1]));
   return{object:o,shortName:String(objectMeta.find(x=>x.record_type==="object_short_name"||x.data?.entity_type==="object_short_name")?.data?.value||o.name),active:o.status==="В работе",reports,numbers,progress:completion(w,m,reports),late:o.status==="В работе"?lateWorkRows(schedule,w,m,reports):[]};
  }));
  if(!host.isConnected||location.hash.slice(1)!=="/objects")return;
  const active=bundles.filter(b=>b.active),last=active.map(b=>b.reports[0]).filter(Boolean),staff=last.reduce((s,r)=>s+personnel(r),0),totalEquipment=last.reduce((s,r)=>s+equipment(r),0);
  const sum=bundles.reduce((s,b)=>s+b.progress.sum,0),count=bundles.reduce((s,b)=>s+b.progress.count,0),pct=count?Math.round(sum/count):0;
  const recent=active.flatMap(b=>b.reports.map(r=>({r,obj:b.object,shortName:b.shortName,num:b.numbers.get(r.id)||1}))).sort((a,b)=>time(b.r)-time(a.r)||val(b.r.id)-val(a.r.id)).slice(0,4);
  const homeSvg=b=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+b+'</svg>';
  const chartIcon=homeSvg('<path d="M3 20h18M6 17v-6m6 6V5m6 12V9"/><path d="m5 8 4-4 4 4 6-5"/>');
  const peopleIcon=homeSvg('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>');
  const craneIcon=homeSvg('<path d="M3 17h14M5 17v-5h6v5M11 12V8l6-5 2 2-6 6v6M17 5h4v8"/><circle cx="6" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/><circle cx="21" cy="17" r="1.5"/>');
  const tile=x=>{
   const r=x.r,all=reportVolumes(r),shown=all.slice(0,3);
   const weather=String(typeof r.weather==="string"?r.weather:r.weather?.text||r.weather?.condition||r.weather_text||"Не указана");
   const rawTemperature=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp;
   const temperature=rawTemperature===null||rawTemperature===undefined||String(rawTemperature).trim()===""?"":String(rawTemperature).trim();
   const w=norm(weather),weatherKey=w.includes("ясно")?"sun":w.includes("дожд")?"rain":w.includes("снег")?"snow":w.includes("гроз")?"storm":w.includes("туман")?"fog":"cloud";
   const weatherShapes={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',cloud:'<path d="M6 18h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>',rain:'<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',snow:'<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>',storm:'<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>',fog:'<path d="M4 8h16M2 12h20M5 16h14"/>'};
   const weatherIcon=homeSvg(weatherShapes[weatherKey]);
   const pretty=v=>Number(v.toFixed(4)).toLocaleString("ru-RU",{maximumFractionDigits:4});
   const hasMeasuredVolume=all.some(w=>!w.service&&w.total>0);
   const activity=window.irReportActivityPreview?.(r),dailySummaries=activity?.kind!=="empty"?activity?.lines||[]:[];
   const volumeHtml=!hasMeasuredVolume&&dailySummaries.length
    ?dailySummaries.slice(0,2).map(t=>'<span class="hpr-summary-line">'+esc(t)+'</span>').join("")+(dailySummaries.length>2?'<small class="hpr-volume-more">+ ещё '+(dailySummaries.length-2)+' пункт.</small>':"")
    :shown.length
    ?shown.map(w=>'<span class="hpr-volume-row"><span class="hpr-volume-name" title="'+esc(w.name)+'">'+esc(w.name)+'</span><strong class="hpr-volume-value">'+(w.service?(w.done?"✓ Выполнено":"Не выполнено"):pretty(w.total)+" "+esc(w.unit))+'</strong></span>').join("")+(all.length>3?'<small class="hpr-volume-more">+ ещё '+(all.length-3)+' видов работ</small>':"")
    :'<small class="hpr-volume-empty">Работы не проводились</small>';
   return '<button class="home-portfolio-report" type="button" data-home-object="'+esc(x.obj.id)+'" data-home-report="'+esc(r.id)+'" title="'+esc(x.obj.name)+'">'+
    '<span class="hpr-head"><span class="hpr-date">'+esc(day(r))+'</span><span class="hpr-number">Отчёт №'+x.num+'</span></span>'+
    '<strong class="hpr-object">'+esc(x.shortName||x.obj.name)+'</strong>'+
    '<span class="hpr-section-title">'+(!hasMeasuredVolume&&dailySummaries.length?activity.label:hasMeasuredVolume?"Выполненные объёмы":"Работы за день")+'</span>'+
    '<span class="hpr-volumes">'+volumeHtml+'</span>'+
    '<span class="hpr-footer"><span class="hpr-footer-stat">'+peopleIcon+' '+fmt(personnel(r))+' чел.</span><span class="hpr-footer-stat">'+craneIcon+' '+fmt(equipment(r))+' ед.</span><span class="hpr-arrow" aria-hidden="true">↗</span></span>'+
    '<span class="hpr-weather">'+weatherIcon+'<span>'+esc(weather)+(temperature?" · "+esc(temperature)+(temperature.includes("°")?"":"°C"):"")+'</span></span>'+
   '</button>';
  };
  const lateObjects=active.filter(b=>b.late.length).sort((a,b)=>(b.late[0]?.days||0)-(a.late[0]?.days||0)||(b.late[0]?.lag||0)-(a.late[0]?.lag||0)||String(a.object.name).localeCompare(String(b.object.name),"ru"));
  const lateDate=s=>{const p=String(s||"").split("-");return p.length===3?p[2]+"."+p[1]+"."+p[0]:"—"};
  const ganttMarkup=rows=>{
   const DAY=86400000,parse=s=>Date.parse(String(s||"")+"T00:00:00Z");
   const dates=rows.flatMap(r=>[parse(r.start),parse(r.end)]).filter(Number.isFinite);
   if(!dates.length)return'<div class="home-gantt-missing">Не заполнены плановые даты графика.</div>';
   const clock=new Date(),today=Date.UTC(clock.getFullYear(),clock.getMonth(),clock.getDate());
   const min=Math.min(...dates),max=Math.max(...dates,today),span=Math.max(DAY,max-min+DAY);
   const position=ms=>Math.max(0,Math.min(100,(ms-min)/span*100));
   const ticks=[0,25,50,75,100].map(i=>'<i style="left:'+i+'%">'+lateDate(new Date(min+(max-min)*i/100).toISOString().slice(0,10))+'</i>').join("");
   const bars=rows.map(r=>{
    const start=parse(r.start),stop=parse(r.end);if(!Number.isFinite(start)||!Number.isFinite(stop))return"";
    const left=position(start),width=Math.max(.8,Math.min(100-left,(stop-start+DAY)/span*100)),done=Math.max(0,Math.min(100,Number(r.progress)||0));
    const percent=done.toLocaleString("ru-RU",{maximumFractionDigits:1})+"%";
    return '<div class="home-gantt-row" title="'+esc(r.name)+' · План: '+lateDate(r.start)+' — '+lateDate(r.end)+' · Факт: '+percent+'">'+
     '<span class="home-gantt-name">'+esc(r.name)+'</span><div class="home-gantt-track">'+
     '<i class="home-gantt-plan" style="left:'+left.toFixed(3)+'%;width:'+width.toFixed(3)+'%"></i>'+
     '<i class="home-gantt-fact" style="left:'+left.toFixed(3)+'%;width:'+(width*done/100).toFixed(3)+'%"></i>'+
     '<i class="home-gantt-today" style="left:'+position(today).toFixed(3)+'%"></i></div>'+
     '<b class="home-gantt-percent">'+percent+'</b></div>'
   }).join("");
   return '<div class="home-gantt" role="group" aria-label="График Ганта: план и фактическое выполнение">'+
    '<div class="home-gantt-title">План и факт по срокам</div>'+
    '<div class="home-gantt-header"><span>Виды работ</span><div class="home-gantt-ticks">'+ticks+'</div><span>Факт</span></div>'+
    '<div class="home-gantt-rows">'+bars+'</div>'+
    '<div class="home-gantt-legend"><span><i class="plan"></i>План</span><span><i class="fact"></i>Выполнено</span><span><i class="today"></i>Сегодня</span></div></div>'
  };
  const lateTile=b=>{
   const overdue=b.late.filter(x=>x.kind==="overdue"),main=overdue[0]||b.late[0],visible=b.late.slice(0,4);
   return '<button type="button" class="home-late-object" data-late-object="'+esc(b.object.id)+'" title="Перейти в график работ объекта">'+
    '<span class="home-late-top"><strong>'+esc(b.shortName||b.object.name)+'</strong><span class="home-late-badge '+(overdue.length?"is-expired":"is-behind")+'">'+(overdue.length?"Срок истёк":"Отставание")+'</span></span>'+
    '<span class="home-late-summary">'+b.late.length+' '+(b.late.length===1?"отстающий вид работ":b.late.length<5?"отстающих вида работ":"отстающих видов работ")+'</span>'+
    ganttMarkup(visible)+(b.late.length>4?'<small class="home-gantt-more">Ещё '+(b.late.length-4)+' видов работ</small>':"")+
    '<span class="home-late-open">Перейти в график работ объекта <span aria-hidden="true">→</span></span></button>'
  };
  host.innerHTML=
   '<div class="home-portfolio-shell">'+
    '<div class="home-portfolio-heading"><div><h2>Общая статистика</h2></div></div>'+
    '<div class="home-portfolio-kpis">'+
      '<article class="home-portfolio-kpi hpk-active"><div class="home-kpi-top"><span class="home-kpi-icon">'+homeSvg('<path d="M3 21V6l9-4 9 4v15M3 21h18M8 21v-7h8v7M7 8h2M15 8h2M7 11h2M15 11h2"/>')+'</span><span class="home-kpi-scope">Объекты компании</span></div><h3>Объектов в работе</h3><div class="home-kpi-value">'+active.length+' <em>объектов</em></div><div class="home-kpi-foot"></div></article>'+
     '<article class="home-portfolio-kpi hpk-progress"><div class="home-kpi-top"><span class="home-kpi-icon">'+chartIcon+'</span><span class="home-kpi-scope">Все объекты</span></div><h3>Среднее выполнение работ</h3><div class="home-kpi-value">'+(count?pct+"%":"—")+'</div><div class="home-kpi-foot"><div class="hpk-track"><i style="width:'+pct+'%"></i></div></div></article>'+
     '<article class="home-portfolio-kpi hpk-workers"><div class="home-kpi-top"><span class="home-kpi-icon">'+peopleIcon+'</span><span class="home-kpi-scope">Объекты в работе</span></div><h3>Всего людей на объектах</h3><div class="home-kpi-value">'+fmt(staff)+' <em>чел.</em></div><div class="home-kpi-foot"></div></article>'+
     '<article class="home-portfolio-kpi hpk-equipment"><div class="home-kpi-top"><span class="home-kpi-icon">'+craneIcon+'</span><span class="home-kpi-scope">Объекты в работе</span></div><h3>Всего техники на объектах</h3><div class="home-kpi-value">'+fmt(totalEquipment)+' <em>ед.</em></div><div class="home-kpi-foot"></div></article>'+
    '</div>'+
    '<section class="home-portfolio-reports"><div class="home-portfolio-reports-title"><div><h2>Последние отчёты с объектов</h2></div></div>'+
     '<div class="home-portfolio-report-scroll"><div class="home-portfolio-report-grid">'+(recent.length?recent.map(tile).join(""):'<div class="home-portfolio-empty">По действующим объектам пока нет отчётов</div>')+'</div></div></section>'+
    '<section class="home-late-section">'+
     '<div class="home-late-heading"><div><h2>Объекты, требующие внимания</h2></div>'+
      '<span class="home-late-count">'+lateObjects.length+' '+(lateObjects.length===1?"объект":lateObjects.length<5?"объекта":"объектов")+'</span></div>'+
     '<div class="home-late-grid">'+(lateObjects.length?lateObjects.map(lateTile).join(""):'<div class="home-late-empty">По заполненным графикам работ отстающих объектов нет.</div>')+'</div>'+
    '</section>'+
    (incomplete?'<p class="home-portfolio-warning">Часть данных не загружена — статистика может быть неполной.</p>':"")+
   '</div>';
  host.querySelectorAll("[data-home-report]").forEach(b=>b.onclick=()=>go("/objects/object/"+b.dataset.homeObject+"/reports/"+b.dataset.homeReport));
  host.querySelectorAll("[data-late-object]").forEach(b=>b.onclick=()=>go("/objects/object/"+b.dataset.lateObject+"/schedule"));
 }catch(e){console.error("Home portfolio",e);if(host.isConnected)host.innerHTML='<div class="home-portfolio-error">Не удалось загрузить общую статистику</div>'}
}

async function objectsPage(){try{const objects=await sortedObjects();const active=objects.filter(o=>o.status!=="Завершен").length,done=objects.length-active;app.innerHTML=`<div class="home-shell"><header class="home-header"><div class="brand" data-company-ready="0" aria-label="Логотип компании загружается"></div></header><section class="home-hero"><div><h1>Объекты</h1><p>Контроль текущих строительных проектов, отчётности и выполнения работ.</p></div><div class="summary"><div><span>Всего объектов</span><strong>${objects.length}</strong></div><div><span>В работе</span><strong>${active}</strong></div><div><span>Завершено</span><strong>${done}</strong></div></div></section><section class="home-portfolio" id="homePortfolio" aria-label="Общая статистика"><div class="home-portfolio-loading">Загрузка общей статистики…</div></section><section class="objects-section"><div class="section-head"><div><h3>Все объекты</h3><p>Показано объектов: ${objects.length}</p></div><button id="add" class="primary">＋ Добавить объект</button></div><div class="objects">${objects.map(objectCard).join("")}</div></section><footer class="home-update-footer"><button id="homeCheckUpdate" type="button" class="home-update-button"><span aria-hidden="true">↻</span> Проверить обновления</button><span id="homeInstalledVersion" class="home-update-version"></span></footer></div>${formHtml()}${updateDialogHtml()}${versionHtml()}`;refreshVersion();renderHomePortfolio(objects);document.querySelectorAll("[data-object]").forEach(x=>x.onclick=()=>go(`/objects/object/${x.dataset.object}`));setupObjectForm();el("add").onclick=()=>openObjectForm();const homeCheckUpdate=el("homeCheckUpdate");if(homeCheckUpdate)homeCheckUpdate.onclick=()=>{try{if(window!==window.top&&window.parent?.irTabUpdates?.open)return window.parent.irTabUpdates.open()}catch(e){}return showUpdate()}}catch(e){console.error(e);app.innerHTML=`<div class="empty-state" style="margin:50px"><h2>Не удалось открыть список объектов</h2><p>${esc(e.message||e)}</p></div>`}}
async function objectShortNameRecord(id){const list=await objectSection(id,"object-meta").list();return list.find(x=>x.record_type==="object_short_name"||x.data?.entity_type==="object_short_name")||null}
 function setupObjectForm(){const d=el("formDialog"),form=el("objectForm");let photo="",banner="",customerLogo="",contractorLogo="",savedPhotos={},savedLogos={};const showPreview=async(id,file,text)=>{const box=el(id);if(!box)return;if(!file){box.innerHTML=`<span>${esc(text)}</span>`;return}try{const url=await irProject.images.read(file);box.innerHTML=url?`<img src="${url}" alt="${esc(text)}">`:`<span>${esc(text)}</span>`}catch{box.innerHTML=`<span>${esc(text)}</span>`}};const resetFiles=()=>{photo="";banner="";customerLogo="";contractorLogo="";savedPhotos={};savedLogos={};el("photoName").textContent="Не выбрано";el("bannerName").textContent="Не выбрано";el("customerLogoName").textContent="Не выбрано";el("contractorLogoName").textContent="Не выбрано";showPreview("photoPreview","","Предпросмотр фото");showPreview("bannerPreview","","Предпросмотр баннера");showPreview("customerLogoPreview","","Логотип не выбран");showPreview("contractorLogoPreview","","Логотип не выбран")};const discardPending=async()=>{for(const file of [photo,banner,customerLogo,contractorLogo])if(file)try{await irProject.images.remove(file)}catch{}photo="";banner="";customerLogo="";contractorLogo=""};window.openObjectForm=async id=>{form.reset();resetFiles();el("formSections").innerHTML=sectionChecks();el("deleteObject").hidden=!id;el("formTitle").textContent=id?"Редактирование объекта":"Новый объект";el("saveObject").textContent=id?"Сохранить изменения":"Создать объект";if(id){const o=await data().objects.get(id),sections=await data().sections.get(id);if(!o)return;form.elements.id.value=o.id;form.elements.name.value=o.name;const shortRecord=await objectShortNameRecord(id);form.elements.short_name.value=String(shortRecord?.data?.value||o.name||"");form.elements.customer.value=o.customer;form.elements.general_contractor.value=o.general_contractor||"";form.elements.address.value=o.address;form.elements.status.value=o.status;savedPhotos=await objectPhotoMap(id);savedLogos=await objectLogoMap(id);const coverFile=savedPhotos.cover?.data?.file_path||"",bannerFile=savedPhotos.banner?.data?.file_path||"";el("photoName").textContent=coverFile.split(/[\\/]/).pop()||"Не выбрано";el("bannerName").textContent=bannerFile.split(/[\\/]/).pop()||"Не выбрано";const customerLogoFile=savedLogos.customer_logo?.data?.file_path||"",contractorLogoFile=savedLogos.general_contractor_logo?.data?.file_path||"";el("customerLogoName").textContent=customerLogoFile.split(/[\\/]/).pop()||"Не выбрано";el("contractorLogoName").textContent=contractorLogoFile.split(/[\\/]/).pop()||"Не выбрано";await Promise.all([showPreview("photoPreview",coverFile,"Предпросмотр фото"),showPreview("bannerPreview",bannerFile,"Предпросмотр баннера"),showPreview("customerLogoPreview",customerLogoFile,"Логотип заказчика"),showPreview("contractorLogoPreview",contractorLogoFile,"Логотип генподрядчика")]);const vals={};sections.forEach(s=>vals[s.section_key]=s.enabled);el("formSections").innerHTML=sectionChecks(vals)}syncSectionLabels();d.showModal()};const closeWithoutSave=async()=>{await discardPending();d.close()};el("cancel").onclick=closeWithoutSave;el("dialogX").onclick=closeWithoutSave;el("photoButton").onclick=async()=>{const x=await irProject.objects.selectImage("cover");if(x){if(photo)try{await irProject.images.remove(photo)}catch{}photo=x;el("photoName").textContent=x.split(/[\\/]/).pop();await showPreview("photoPreview",x,"Предпросмотр фото")}};el("bannerButton").onclick=async()=>{const x=await irProject.objects.selectImage("banner");if(x){if(banner)try{await irProject.images.remove(banner)}catch{}banner=x;el("bannerName").textContent=x.split(/[\\/]/).pop();await showPreview("bannerPreview",x,"Предпросмотр баннера")}};el("customerLogoButton").onclick=async()=>{const x=await irProject.company.selectLogo();if(x){if(customerLogo)try{await irProject.images.remove(customerLogo)}catch{}customerLogo=x;el("customerLogoName").textContent=x.split(/[\\/]/).pop();await showPreview("customerLogoPreview",x,"Логотип заказчика")}};el("contractorLogoButton").onclick=async()=>{const x=await irProject.company.selectLogo();if(x){if(contractorLogo)try{await irProject.images.remove(contractorLogo)}catch{}contractorLogo=x;el("contractorLogoName").textContent=x.split(/[\\/]/).pop();await showPreview("contractorLogoPreview",x,"Логотип генподрядчика")}};el("formSections").addEventListener("change",syncSectionLabels);form.elements.short_name.addEventListener("input",()=>form.elements.short_name.setCustomValidity(""));el("toggleAllSections").onclick=()=>{document.querySelectorAll("[data-form-section]").forEach(x=>x.checked=true);syncSectionLabels()};form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),id=f.get("id"),shortName=String(f.get("short_name")||"").trim(),payload={name:f.get("name"),customer:f.get("customer"),general_contractor:f.get("general_contractor"),address:f.get("address"),status:f.get("status"),sections:readSectionChecks()};if(!shortName){form.elements.short_name.focus();form.elements.short_name.setCustomValidity("Укажите краткое название объекта.");form.elements.short_name.reportValidity();return}
 let objectId=id;if(id)await data().objects.update(id,payload);else objectId=(await data().objects.create(payload)).id;
 const previousShort=await objectShortNameRecord(objectId),shortPayload={record_type:"object_short_name",title:"Краткое название объекта",data:{entity_type:"object_short_name",value:shortName}};
 if(previousShort)await objectSection(objectId,"object-meta").update(previousShort.id,shortPayload);
 else await objectSection(objectId,"object-meta").create(shortPayload);
 try{window.parent?.irTabRefreshObjectName?.(String(objectId))}catch(e){}
 if(photo){savedPhotos.cover=await saveObjectPhoto(objectId,"cover",photo,savedPhotos.cover);photo=""}if(banner){savedPhotos.banner=await saveObjectPhoto(objectId,"banner",banner,savedPhotos.banner);banner=""}if(customerLogo){savedLogos.customer_logo=await saveObjectLogo(objectId,"customer_logo",customerLogo,savedLogos.customer_logo);customerLogo=""}if(contractorLogo){savedLogos.general_contractor_logo=await saveObjectLogo(objectId,"general_contractor_logo",contractorLogo,savedLogos.general_contractor_logo);contractorLogo=""}d.close();if(id)go(`/objects/object/${id}`);else objectsPage()};el("deleteObject").onclick=async()=>{const id=form.elements.id.value,name=form.elements.name.value;if(!id)return;if(!confirm(`Удалить объект «${name}»?\n\nВсе данные этого объекта будут удалены.`))return;await discardPending();await data().objects.remove(id);d.close();go("/objects");objectsPage()}}
async function objectPage(id){const o=await data().objects.get(id);if(!o)return go("/objects");const [sections,photos]=await Promise.all([data().sections.get(id),objectPhotoMap(id)]);let bannerUrl="";const bannerFile=photos.banner?.data?.file_path||"";if(bannerFile)try{bannerUrl=await irProject.images.read(bannerFile)}catch{}app.innerHTML=`${bannerUrl?'<div class="object-page-banner" id="objectPageBanner"></div>':""}<div class="object-page-head"><button class="back" id="back">← Объекты</button><div><h1>${esc(o.name)}</h1><p>Заказчик: ${esc(o.customer||"—")} · Генподрядчик: ${esc(o.general_contractor||"—")} · ${esc(o.address)}</p></div><button class="ghost-btn" id="editObject">✎ Редактировать объект</button></div><div class="sections">${sections.map(s=>`<div class="section-row"><button class="section-link" data-section="${esc(s.section_key)}" ${s.enabled?"":"disabled"}>${esc(s.title||sectionNames[s.section_key]||s.section_key)}</button><span class="section-state ${s.enabled?"on":"off"}">${s.enabled?"Включён":"Отключён"}</span></div>`).join("")}</div>${formHtml()}${versionHtml()}`;if(bannerUrl){const b=el("objectPageBanner");b.style.backgroundImage=`linear-gradient(180deg,rgba(10,17,27,.03),rgba(10,17,27,.20)),url("${bannerUrl}")`}refreshVersion();el("back").onclick=()=>go("/objects");document.querySelectorAll("[data-section]").forEach(x=>x.onclick=()=>go(`/objects/object/${id}/${x.dataset.section}`));setupObjectForm();el("editObject").onclick=()=>openObjectForm(id)}
async function sectionPage(id,key){const o=await data().objects.get(id);if(!o)return go("/objects");const sections=await data().sections.get(id),section=sections.find(x=>x.section_key===key);if(!section?.enabled)return go(`/objects/object/${id}`);app.innerHTML=`<button class="back" id="back">← ${esc(o.name)}</button><h1>${esc(section.title||sectionNames[key]||key)}</h1>${versionHtml()}`;refreshVersion();el("back").onclick=()=>go(`/objects/object/${id}`)}
async function render(){const route=location.hash.slice(1)||"/objects";if(route==="/objects")return objectsPage();let m=route.match(/^\/objects\/object\/(\d+)$/);if(m)return objectPage(m[1]);m=route.match(/^\/objects\/object\/(\d+)\/reports(?:\/(new|\d+)(?:\/(edit))?)?$/);if(m&&window.irReportsPage){const oid=m[1],part=m[2]||"",edit=m[3]==="edit";if(part==="new")return window.irReportsPage(oid,{mode:"new"});if(/^\d+$/.test(part))return window.irReportsPage(oid,{mode:edit?"edit":"view",reportId:part});return window.irReportsPage(oid)}m=route.match(/^\/objects\/object\/(\d+)\/extra-works(?:\/([A-Za-z0-9_-]+))?$/);if(m&&window.irAdditionalWorksPage)return window.irAdditionalWorksPage(m[1],{workId:m[2]||""});m=route.match(/^\/objects\/object\/(\d+)\/([^/]+)$/);if(m){const key=decodeURIComponent(m[2]);if(key==="reports"&&window.irReportsPage)return window.irReportsPage(m[1]);if(key==="marks"&&window.irMarksPage)return window.irMarksPage(m[1]);if(key==="work-types"&&window.irWorkTypesPage)return window.irWorkTypesPage(m[1]);if(key==="acted-days"&&window.irActedDaysPageV3)return window.irActedDaysPageV3(m[1]);if(key==="acted-days"&&window.irActedDaysPageV2)return window.irActedDaysPageV2(m[1]);if(key==="acted-days"&&window.irActedDaysPage)return window.irActedDaysPage(m[1]);if(key==="penalties"&&window.irPenaltiesPageV2)return window.irPenaltiesPageV2(m[1]);if(key==="penalties"&&window.irPenaltiesPage)return window.irPenaltiesPage(m[1]);if(key==="finance"&&window.irFinancePage)return window.irFinancePage(m[1]);if(key==="scheme"&&window.irSchemePage)return window.irSchemePage(m[1]);return sectionPage(m[1],key)}go("/objects")}
try{if("scrollRestoration"in history)history.scrollRestoration="manual"}catch{}
function scrollPageTop(){window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0}
async function routeChanged(){scrollPageTop();await render();requestAnimationFrame(()=>scrollPageTop())}
window.addEventListener("hashchange",routeChanged);routeChanged();
;

/* #33: src/object-sort-latest-report.js */
"use strict";
(()=>{
 const originalActivity=typeof objectActivity==="function"?objectActivity:null;
 const dateStamp=v=>{
  const s=String(v||"").trim();if(!s)return 0;
  const iso=s.slice(0,10),t=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso)?`${iso}T00:00:00Z`:s);
  return Number.isFinite(t)?t:0;
 };
 const updatedStamp=r=>{const s=String(r?.updated_at||r?.created_at||"").trim();if(!s)return 0;const t=Date.parse(s.includes("T")?s:s.replace(" ","T")+"Z");return Number.isFinite(t)?t:0};
 async function reportFreshness(id){
  try{
   const rows=await irProject.data.forObject(id).section("reports").list();
   let best={has:false,date:0,id:0,updated:0};
   for(const r of Array.isArray(rows)?rows:[]){
    const d=r?.data||r||{},date=dateStamp(d.date||d.report_date),rid=Number(r?.id)||0,updated=updatedStamp(r);
    if(!best.has||date>best.date||(date===best.date&&rid>best.id)||(date===best.date&&rid===best.id&&updated>best.updated))best={has:true,date,id:rid,updated};
   }
   return best;
  }catch(e){console.error("object latest report sort",id,e);return{has:false,date:0,id:0,updated:0}}
 }
 async function sortObjectsByLatestReport(){
  const objects=await irProject.data.objects.list();
  const enriched=await Promise.all((Array.isArray(objects)?objects:[]).map(async o=>({
   ...o,
   _latestReport:await reportFreshness(o.id),
   _activity:originalActivity?await originalActivity(o.id):{lastId:0,lastTime:0}
  })));
  return enriched.sort((a,b)=>{
   const aActive=a.status!=="Завершен",bActive=b.status!=="Завершен";
   if(aActive!==bActive)return aActive?-1:1;
   if(a._latestReport.has!==b._latestReport.has)return a._latestReport.has?-1:1;
   if(b._latestReport.date!==a._latestReport.date)return b._latestReport.date-a._latestReport.date;
   if(b._latestReport.id!==a._latestReport.id)return b._latestReport.id-a._latestReport.id;
   if(b._latestReport.updated!==a._latestReport.updated)return b._latestReport.updated-a._latestReport.updated;
   if((b._activity?.lastId||0)!==(a._activity?.lastId||0))return(b._activity?.lastId||0)-(a._activity?.lastId||0);
   if((b._activity?.lastTime||0)!==(a._activity?.lastTime||0))return(b._activity?.lastTime||0)-(a._activity?.lastTime||0);
   return Number(b.id)-Number(a.id);
  });
 }
 try{sortedObjects=sortObjectsByLatestReport}catch{}
 try{window.sortedObjects=sortObjectsByLatestReport}catch{}
 if((location.hash.slice(1)||"/objects")==="/objects")setTimeout(()=>{try{if(typeof objectsPage==="function")objectsPage()}catch(e){console.error(e)}},0);
})();

;

/* #34: src/schedule-page-v2.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
 const route=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/schedule\/?$/)?.[1]||"";
 const DAY=86400000;
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const nfmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const dateMs=v=>{const s=iso(v),t=s?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)?t:null};
 const todayMs=()=>{const d=new Date();return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())};
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const markTotal=x=>{const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 window.irSchedulePage=async oid=>{
  document.body.classList.remove("ir-object-overview");
  const app=document.getElementById("app"),o=await irProject.data.objects.get(oid);if(!app||!o)return;
  const root=irProject.data.forObject(oid),scheduleApi=root.section("schedule"),workApi=root.section("work-types"),marksApi=root.section("marks"),reportsApi=root.section("reports");
  let [rows,workTypes,marks,reports]=await Promise.all([scheduleApi.list().catch(()=>[]),workApi.list().catch(()=>[]),marksApi.list().catch(()=>[]),reportsApi.list().catch(()=>[])]);
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("schedule"):false;
  const sortRows=()=>rows.sort((a,b)=>String(a.data?.start_date||"").localeCompare(String(b.data?.start_date||""))||Number(a.id)-Number(b.id));
  const optionText=w=>{const d=w.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга";return `${workLabel(d.work_type||w.title||"Без названия","mount")}${service?" · Услуга":d.project_code?` · ${d.project_code}`:""}`};
  const catalog=()=>arr(workTypes).map(w=>{const d=w.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),has_marks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||w.title).includes("монтаж")||norm(d.work_type||w.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===String(w.id)))));return{id:String(w.id),name:d.work_type||w.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:service?"service":"volume",has_marks,planned_volume:num(d.planned_volume??d.plan_volume)}});
  const resolveWork=(rawId,name,code)=>{const list=catalog(),id=String(rawId||""),byId=list.find(x=>x.id===id);if(byId){const nameOk=!name||norm(byId.name)===norm(name),codeOk=!code||!byId.code||norm(byId.code)===norm(code);if(nameOk&&codeOk)return byId}let hit=list.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));if(!hit&&code){const a=list.filter(x=>norm(x.code)===norm(code));if(a.length===1)hit=a[0]}if(!hit&&name){const a=list.filter(x=>norm(x.name)===norm(name));if(a.length===1)hit=a[0]}return hit||{id,name:name||"Без названия",code:code||"",unit:""}};
  function analysisMaps(){
   const plans=new Map(),facts=new Map(),days=new Map(),first=new Map();
   for(const w of catalog())if(w.accounting_type!=="service"&&!w.has_marks&&w.planned_volume>0)plans.set(w.id,w.planned_volume);
   for(const r of arr(marks)){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type,d.project_code);if(!m?.id||m.accounting_type==="service")continue;plans.set(m.id,(plans.get(m.id)||0)+markTotal(r))}
   for(const r of arr(reports)){const d=r.data||r,day=iso(d.date||d.report_date);for(const w of arr(d.items||d.works)){const m=resolveWork(w.work_type_id,w.work_type||w.type,w.project_code||w.code);if(!m?.id||m.accounting_type==="service"||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const v=reportVolume(w);if(v<=0)continue;facts.set(m.id,(facts.get(m.id)||0)+v);if(day){if(!days.has(m.id))days.set(m.id,new Set());days.get(m.id).add(day);const t=dateMs(day);if(t!==null&&(first.get(m.id)==null||t<first.get(m.id)))first.set(m.id,t)}}}
   return{plans,facts,days,first}
  }
  function analysisFor(r){
   const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type||r.title,d.project_code),id=m.id,start=dateMs(d.start_date),end=dateMs(d.end_date),today=todayMs(),unit=m.unit||"ед.";
   if(m.accounting_type==="service"){
    let completed=false,doneDate="";
    for(const rec of arr(reports)){const rd=rec.data||rec,date=iso(rd.date||rd.report_date);for(const w of arr(rd.items||rd.works)){const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===norm(m.name));if(!same)continue;const done=w.completed===true||w.service_completed===true||String(w.status||"").toLowerCase()==="done"||String(w.status||"").toLowerCase()==="выполнено";if(done){completed=true;if(!doneDate||date>doneDate)doneDate=date}}}
    let tone="neutral",status="Не выполнено",note="Услуга ещё не отмечена выполненной в ежедневном отчёте.";
    if(completed){tone="good";status="Выполнено";note=doneDate?`Выполнение отмечено в отчёте от ${fmt(doneDate)}.`:"Услуга выполнена."}
    else if(end!==null&&today>end){tone="bad";status="Просрочено";note="Плановый срок услуги истёк, выполнение не отмечено."}
    else if(start!==null&&today<start){status="Ещё не начато";note=`По графику услуга начинается ${fmt(d.start_date)}.`}
    return{service:true,start,end,completed,doneDate,tone,status,note}
   }
   const maps=analysisMaps();
   const plan=maps.plans.get(id)||0,fact=maps.facts.get(id)||0,remain=Math.max(0,plan-fact),workedDays=maps.days.get(id)?.size||0,avg=workedDays?fact/workedDays:0;
   const totalDays=start!==null&&end!==null&&end>=start?Math.max(1,Math.floor((end-start)/DAY)+1):0,elapsed=totalDays?(today<start?0:today>end?totalDays:Math.floor((today-start)/DAY)+1):0,planPct=totalDays?clamp(elapsed/totalDays*100,0,100):0,factPct=plan>0?clamp(fact/plan*100,0,100):0,deviation=factPct-planPct,daysLeft=end===null?0:(today>end?0:Math.max(0,Math.ceil((end-today)/DAY))),need=daysLeft>0?remain/daysLeft:remain>0?Infinity:0;
   const firstMs=maps.first.get(id),calendarDays=firstMs!=null?Math.max(1,Math.floor((Math.max(firstMs,today)-firstMs)/DAY)+1):0,calendarRate=calendarDays?fact/calendarDays:0;
   let forecast="Нет темпа",forecastMs=null;if(plan<=0)forecast="Нет плана";else if(remain<=1e-9){forecast="Завершено";forecastMs=today}else if(calendarRate>0){forecastMs=today+Math.ceil(remain/calendarRate)*DAY;forecast=fmt(new Date(forecastMs).toISOString().slice(0,10))}
   let tone="neutral",status="Не начато",note="Фактические объёмы ещё не отражены в ежедневных отчётах.";
   if(plan<=0){status="Нет плана";note=m.has_marks?"В ведомости марок нет планового объёма для этого вида работ.":"Не указан объём выполняемой работы."}
   else if(factPct>=99.999){tone="good";status="Выполнено";note="Плановый объём выполнен."}
   else if(end!==null&&today>end&&remain>0){tone="bad";status="Срок истёк";note=`До выполнения плана осталось ${nfmt(remain)} ${unit}; плановый срок уже завершён.`}
   else if(start!==null&&today<start){status="Ещё не начато";note=`Работы по графику начинаются ${fmt(d.start_date)}.`}
   else if(deviation>=-3){tone="good";status="По графику";note=avg>0?`Текущий средний темп — ${nfmt(avg)} ${unit}/день.`:"Работы идут в пределах планового графика."}
   else if(deviation>=-10){tone="warn";status="Есть риск";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; требуется темп ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"срок истёк"}.`}
   else{tone="bad";status="Отставание";note=`Отставание от плана ${nfmt(Math.abs(deviation))} п.п.; для выхода в срок требуется ${Number.isFinite(need)?nfmt(need)+" "+unit+"/день":"пересмотр срока"}.`}
   return{unit,plan,fact,remain,workedDays,avg,need,daysLeft,planPct,factPct,deviation,forecast,forecastMs,end,tone,status,note}
  }
  const metric=(label,value,sub="")=>`<div class="schedule-analysis-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>`;
  function analysisHtml(r){const a=analysisFor(r);if(a.service)return `<div class="schedule-analysis schedule-analysis-service tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ услуги</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics service">${metric("Ед. изм.","услуга")}${metric("Начало",a.start!==null?fmt(new Date(a.start).toISOString().slice(0,10)):"—")}${metric("Срок",a.end!==null?fmt(new Date(a.end).toISOString().slice(0,10)):"—")}${metric("Выполнено",a.completed?(a.doneDate?fmt(a.doneDate):"Да"):"Нет")}</div></div>`;const u=a.unit,needText=Number.isFinite(a.need)?`${nfmt(a.need)} ${u}/день`:a.remain>0?"Срок истёк":"0",dev=`${a.deviation>=0?"+":""}${String(Number(a.deviation.toFixed(1))).replace(".",",")}%`,progress=a.plan>0?`<div class="schedule-analysis-progress"><div class="schedule-analysis-progress-labels"><span>Факт <b>${nfmt(a.factPct)}%</b></span><span>План на сегодня <b>${nfmt(a.planPct)}%</b></span></div><div class="schedule-analysis-track"><i class="schedule-analysis-fact" style="width:${a.factPct.toFixed(2)}%"></i><i class="schedule-analysis-plan" style="left:${a.planPct.toFixed(2)}%"></i></div></div>`:"";return `<div class="schedule-analysis tone-${a.tone}"><div class="schedule-analysis-title"><div><b>Анализ</b><span>${esc(a.note)}</span></div><em>${esc(a.status)}</em></div><div class="schedule-analysis-metrics">${metric("План",a.plan>0?`${nfmt(a.plan)} ${u}`:"—")}${metric("Выполнено",`${nfmt(a.fact)} ${u}`,a.plan>0?`${nfmt(a.factPct)}%`:"")}${metric("Осталось",a.plan>0?`${nfmt(a.remain)} ${u}`:"—")}${metric("Среднее / день",a.avg?`${nfmt(a.avg)} ${u}`:"—",a.workedDays?`${a.workedDays} дн. с работами`:"Нет факта")}${metric("Нужно / день",a.plan>0?needText:"—")}${metric("Дней осталось",a.daysLeft?String(a.daysLeft):a.remain>0?"0":"—")}${metric("Отклонение",a.plan>0?dev:"—")}${metric("Прогноз",a.forecast,a.forecastMs&&a.end&&a.forecastMs>a.end?"Позже плана":a.forecastMs&&a.end&&a.forecastMs<=a.end?"В пределах срока":"")}</div>${progress}</div>`}
  function rowHtml(r,i){const d=r.data||{},m=resolveWork(d.work_type_id,d.work_type||r.title,d.project_code),service=m.accounting_type==="service";return `<div class="schedule-row ${service?"schedule-service-row":""}" data-id="${r.id}"><div class="schedule-num">${i+1}</div><div><span>Вид работы</span><b>${esc(workLabel(d.work_type||r.title||"—","mount"))}</b></div><div><span>Шифр</span><b>${service?"—":esc(d.project_code||"—")}</b></div><div><span>Дата начала</span><b>${fmt(d.start_date)}</b></div><div><span>Дата окончания</span><b>${fmt(d.end_date)}</b></div>${canEdit()?`<div class="schedule-actions"><button type="button" data-schedule-edit="${r.id}">Редактировать</button><button type="button" class="danger" data-schedule-delete="${r.id}">Удалить</button></div>`:"<div></div>"}</div>${analysisHtml(r)}`}
  function draw(){
   sortRows();
   app.innerHTML=`<div class="schedule-page"><div class="wt-head schedule-head"><button class="back" id="scheduleBack">← Назад</button><div><h1>График работ</h1><p>${esc(o.name||"")}</p></div>${canEdit()?'<button type="button" class="primary" id="scheduleAdd">＋ Добавить срок</button>':""}</div><div class="schedule-card"><div class="schedule-table-head"><span>№</span><span>Вид работы</span><span>Шифр</span><span>Дата начала</span><span>Дата окончания</span><span></span></div><div class="schedule-list">${rows.length?rows.map(rowHtml).join(""):'<div class="schedule-empty">График работ пока не заполнен</div>'}</div></div>${canEdit()?`<dialog id="scheduleDialog" class="schedule-dialog"><form id="scheduleForm"><input type="hidden" name="id"><div class="form-heading"><div><h2 id="scheduleDialogTitle">Добавить срок</h2><p class="form-subtitle">Плановые даты выполнения выбранного вида работ</p></div><button type="button" class="dialog-x" id="scheduleX">×</button></div><label>Вид работы / шифр<select name="work_type_id" required><option value="">Выберите вид работы</option>${workTypes.map(w=>`<option value="${w.id}">${esc(optionText(w))}</option>`).join("")}</select></label><div class="schedule-date-grid"><label>Дата начала<input type="date" name="start_date" required></label><label>Дата окончания<input type="date" name="end_date" required></label></div><div class="schedule-form-error" id="scheduleError" hidden></div><div class="actions"><button type="button" id="scheduleCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form></dialog>`:""}</div>`;
   document.getElementById("scheduleBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   if(!canEdit())return;
   const dialog=document.getElementById("scheduleDialog"),form=document.getElementById("scheduleForm"),error=document.getElementById("scheduleError");
   const open=r=>{form.reset();error.hidden=true;form.elements.id.value=r?.id||"";form.elements.work_type_id.value=r?.data?.work_type_id||"";form.elements.start_date.value=r?.data?.start_date||"";form.elements.end_date.value=r?.data?.end_date||"";document.getElementById("scheduleDialogTitle").textContent=r?"Редактировать срок":"Добавить срок";dialog.showModal()};
   document.getElementById("scheduleAdd").onclick=()=>{if(!workTypes.length){alert("Сначала добавьте хотя бы один вид работы в разделе «Виды работ».");return}open()};
   document.getElementById("scheduleX").onclick=()=>dialog.close();document.getElementById("scheduleCancel").onclick=()=>dialog.close();
   document.querySelectorAll("[data-schedule-edit]").forEach(b=>b.onclick=()=>open(rows.find(r=>String(r.id)===b.dataset.scheduleEdit)));
   document.querySelectorAll("[data-schedule-delete]").forEach(b=>b.onclick=async()=>{const r=rows.find(x=>String(x.id)===b.dataset.scheduleDelete);if(!r)return;if(!confirm(`Удалить срок для «${r.data?.work_type||r.title||""}»?`))return;await scheduleApi.remove(r.id);rows=await scheduleApi.list().catch(()=>[]);draw()});
   form.onsubmit=async e=>{e.preventDefault();error.hidden=true;const fd=new FormData(form),id=fd.get("id"),wid=String(fd.get("work_type_id")||""),start=String(fd.get("start_date")||""),end=String(fd.get("end_date")||"");if(end<start){error.textContent="Дата окончания не может быть раньше даты начала.";error.hidden=false;return}const wt=workTypes.find(w=>String(w.id)===wid);if(!wt){error.textContent="Выберите вид работы.";error.hidden=false;return}const duplicate=rows.find(r=>String(r.data?.work_type_id||"")===wid&&String(r.id)!==String(id||""));if(duplicate){error.textContent="Для этого вида работ график уже задан. Откройте существующую строку и отредактируйте её.";error.hidden=false;return}const d=wt.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",payload={record_type:"schedule_item",title:d.work_type||wt.title||"",data:{work_type_id:Number(wt.id),work_type:d.work_type||wt.title||"",accounting_type:service?"service":"volume",project_code:service?"":d.project_code||"",unit:service?"услуга":d.unit||"",start_date:start,end_date:end}};if(id)await scheduleApi.update(id,payload);else await scheduleApi.create(payload);rows=await scheduleApi.list().catch(()=>[]);dialog.close();draw()};
  }
  draw();
 };
 const baseSectionPage=typeof sectionPage==="function"?sectionPage:null;
 if(baseSectionPage){sectionPage=async(id,key)=>key==="schedule"?window.irSchedulePage(id):baseSectionPage(id,key)}
 const initial=route();if(initial)setTimeout(()=>window.irSchedulePage(initial),0);
})();
;

/* #35: src/object-overview-direct-v3.js */
"use strict";
(()=>{
const icon=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icons={check:icon('<path d="m5 12 4 4L19 6"/>'),calendar:icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'),pin:icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>'),plus:icon('<path d="M12 5v14M5 12h14"/>'),edit:icon('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),dots:icon('<circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>')};
const DAY=86400000;
const arr=v=>Array.isArray(v)?v:[];
const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
const isoDate=v=>String(v||"").slice(0,10);
const dateMs=v=>{const s=isoDate(v),t=s?Date.parse(`${s}T00:00:00Z`):NaN;return Number.isFinite(t)?t:null};
const formatDate=v=>{if(!v)return"";const p=isoDate(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v)};
const formatMs=t=>formatDate(new Date(t).toISOString().slice(0,10));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const todayMs=()=>{const n=new Date();return Date.UTC(n.getFullYear(),n.getMonth(),n.getDate())};
function scheduleDates(rows){const starts=[],ends=[];for(const row of arr(rows)){const d=row?.data||row||{};if(d.start_date)starts.push(isoDate(d.start_date));if(d.end_date)ends.push(isoDate(d.end_date))}starts.sort();ends.sort();return{start:starts[0]?formatDate(starts[0]):"",end:ends.length?formatDate(ends[ends.length-1]):""}}
function markTotal(x){const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(d.qty??d.count)*num(d.unit_volume??d.volume_one)}
function reportVolume(w){const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)}
function workTypeMeta(rows,marks){return new Map(arr(rows).map(r=>{const d=r.data||{},service=d.accounting_type==="service"||norm(d.unit)==="услуга",explicitMarked=d.has_marks===true||["installation","fabrication"].includes(d.work_category),has_marks=!service&&(explicitMarked||(!d.work_category&&d.has_marks!==false&&(norm(d.work_type||r.title).includes("монтаж")||norm(d.work_type||r.title).includes("изготов")||arr(marks).some(m=>String(m.data?.work_type_id||"")===String(r.id)))));return[String(r.id),{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:service?"service":"volume",has_marks,planned_volume:num(d.planned_volume??d.plan_volume)}]}))}
function planByWork(marks,wt){const map=new Map();for(const [id,w] of wt)if(w.accounting_type!=="service"&&!w.has_marks&&w.planned_volume>0)map.set(id,w.planned_volume);for(const r of arr(marks)){const d=r.data||{},id=String(d.work_type_id||"");if(!id||wt.get(id)?.accounting_type==="service")continue;map.set(id,(map.get(id)||0)+markTotal(r))}return map}
function factByWork(reports,wt){const map=new Map(),days=new Map(),first=new Map();for(const r of arr(reports)){const d=r.data||r||{},day=isoDate(d.date||d.report_date);for(const w of arr(d.items||d.works)){const id=String(w.work_type_id||"");if(!id||wt.get(id)?.accounting_type==="service"||w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const v=reportVolume(w);if(v<=0)continue;map.set(id,(map.get(id)||0)+v);if(day){if(!days.has(id))days.set(id,new Set());days.get(id).add(day);const t=dateMs(day);if(t!==null&&(first.get(id)==null||t<first.get(id)))first.set(id,t)}}}return{map,days,first}}
function controlRows(schedule,workTypes,marks,reports){
 const wt=workTypeMeta(workTypes,marks),plans=planByWork(marks,wt),facts=factByWork(reports,wt),today=todayMs();
 return arr(schedule).map(row=>{const d=row.data||{},id=String(d.work_type_id||""),meta=wt.get(id)||{id,name:d.work_type||row.title||"Без названия",code:d.project_code||"",unit:d.unit||"",accounting_type:d.accounting_type||"volume"},start=dateMs(d.start_date),end=dateMs(d.end_date);if(start===null||end===null||end<start)return null;
  if(meta.accounting_type==="service"){let completed=false,doneDate="";for(const rec of arr(reports)){const rd=rec.data||rec,day=isoDate(rd.date||rd.report_date);for(const w of arr(rd.items||rd.works)){const same=String(w.work_type_id||"")===id||(!w.work_type_id&&norm(w.work_type||w.type)===norm(meta.name));if(!same)continue;const done=w.completed===true||w.service_completed===true||["done","выполнено"].includes(norm(w.status));if(done){completed=true;if(!doneDate||day>doneDate)doneDate=day}}}let tone="neutral",statusText="Не выполнено";if(completed){tone="good";statusText="Выполнено"}else if(today>end){tone="bad";statusText="Просрочено"}else if(today<start){statusText="Ещё не начато"}return{id,meta,start,end,service:true,completed,doneDate,tone,statusText}}
  const plan=plans.get(id)||0,fact=facts.map.get(id)||0,remain=Math.max(0,plan-fact),factPct=plan>0?clamp(fact/plan*100,0,100):0,totalDays=Math.max(1,Math.floor((end-start)/DAY)+1),elapsed=today<start?0:today>end?totalDays:Math.floor((today-start)/DAY)+1,planPct=clamp(elapsed/totalDays*100,0,100),deviation=factPct-planPct,daysLeft=today>end?0:Math.max(0,Math.ceil((end-today)/DAY)),workedDays=facts.days.get(id)?.size||0,avg=workedDays?fact/workedDays:0,need=daysLeft>0?remain/daysLeft:remain>0?Infinity:0,first=facts.first.get(id),elapsedCalendar=first!=null?Math.max(1,Math.floor((Math.max(first,today)-first)/DAY)+1):0,calendarRate=elapsedCalendar?fact/elapsedCalendar:0;
  let forecast="Нет темпа",forecastMs=null;if(remain<=1e-9){forecast="Завершено";forecastMs=today}else if(calendarRate>0){forecastMs=today+Math.ceil(remain/calendarRate)*DAY;forecast=formatMs(forecastMs)}
  let tone="neutral",statusText="Не начато";if(factPct>=99.999){tone="good";statusText="Выполнено"}else if(today>end&&remain>0){tone="bad";statusText="Срок истёк"}else if(today<start){tone="neutral";statusText="Ещё не начато"}else if(deviation>=-3){tone="good";statusText="По графику"}else if(deviation>=-10){tone="warn";statusText="Есть риск"}else{tone="bad";statusText="Отставание"}
  return{id,meta,start,end,plan,fact,remain,factPct,planPct,deviation,daysLeft,workedDays,avg,need,forecast,forecastMs,tone,statusText};
 }).filter(Boolean).sort((a,b)=>a.start-b.start||a.end-b.end||a.meta.name.localeCompare(b.meta.name,"ru"));
}
function metric(label,value,sub=""){return `<div class="schedule-control-metric"><span>${esc(label)}</span><b>${esc(value)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>`}
function scheduleControl(schedule,workTypes,marks,reports){
 const rows=controlRows(schedule,workTypes,marks,reports),today=todayMs();
 const head=`<div class="object-overview-block-head"><div><h2>График работ</h2><p>План, факт, темп выполнения и прогноз по срокам</p></div><button type="button" data-overview-schedule>Открыть график</button></div>`;
 if(!rows.length)return `<div class="object-overview-dashboard"><section class="object-overview-schedule">${head}<div class="object-overview-empty">Раздел График работ пуст</div></section></div>`;
 const good=rows.filter(x=>x.tone==="good").length,warn=rows.filter(x=>x.tone==="warn").length,bad=rows.filter(x=>x.tone==="bad").length,overallEnd=Math.max(...rows.map(x=>x.end)),overallLeft=Math.max(0,Math.ceil((overallEnd-today)/DAY));
 const summary=`<div class="schedule-control-summary">${metric("Видов работ",String(rows.length))}${metric("По графику",String(good))}${metric("Риск / отставание",String(warn+bad),bad?`${bad} с отставанием`:warn?`${warn} в зоне риска`:"Отклонений нет")}${metric("До общего срока",overallLeft?`${overallLeft} дн.`:"Срок наступил",formatMs(overallEnd))}</div>`;
 const html=rows.map(x=>{const period=`${formatMs(x.start)} — ${formatMs(x.end)}`;if(x.service)return `<article class="schedule-control-row tone-${x.tone} schedule-control-service"><div class="schedule-control-row-head"><div class="schedule-control-title"><div><b>${esc(x.meta.name)}</b><span>Услуга · выполнено / не выполнено</span></div><em>${esc(period)}</em></div><span class="schedule-control-status">${esc(x.statusText)}</span></div><div class="schedule-control-metrics service">${metric("Ед. изм.","услуга")}${metric("Срок",formatMs(x.end))}${metric("Выполнено",x.completed?(x.doneDate?formatDate(x.doneDate):"Да"):"Нет")}</div></article>`;const unit=x.meta.unit||"ед.",needText=Number.isFinite(x.need)?`${fmt(x.need)} ${unit}/день`:x.remain>0?"Срок истёк":"0",devText=`${x.deviation>=0?"+":""}${String(Number(x.deviation.toFixed(1))).replace(".",",")}%`;return `<article class="schedule-control-row tone-${x.tone}"><div class="schedule-control-row-head"><div class="schedule-control-title"><div><b>${esc(x.meta.name)}</b><span>${esc(x.meta.code||"Шифр не указан")} · ${esc(unit)}</span></div><em>${esc(period)}</em></div><span class="schedule-control-status">${esc(x.statusText)}</span></div><div class="schedule-control-metrics">${metric("План",`${fmt(x.plan)} ${unit}`)}${metric("Выполнено",`${fmt(x.fact)} ${unit}`,`${String(Number(x.factPct.toFixed(1))).replace(".",",")}%`)}${metric("Осталось",`${fmt(x.remain)} ${unit}`)}${metric("Среднее / день",x.avg?`${fmt(x.avg)} ${unit}`:"—",x.workedDays?`${x.workedDays} дн. с работами`:"Нет факта")}${metric("Нужно / день",needText)}${metric("Дней осталось",x.daysLeft?String(x.daysLeft):x.remain>0?"0":"—")}${metric("План на сегодня",`${String(Number(x.planPct.toFixed(1))).replace(".",",")}%`)}${metric("Отклонение",devText)}${metric("Прогноз",x.forecast,x.forecastMs&&x.forecastMs>x.end?"Позже плана":x.forecastMs&&x.forecastMs<=x.end?"В пределах срока":"")}</div><div class="schedule-control-progress"><div class="schedule-control-progress-labels"><span>Факт <b>${String(Number(x.factPct.toFixed(1))).replace(".",",")}%</b></span><span>План <b>${String(Number(x.planPct.toFixed(1))).replace(".",",")}%</b></span></div><div class="schedule-control-track"><i class="schedule-control-fact" style="width:${x.factPct.toFixed(2)}%"></i><i class="schedule-control-plan" style="left:${x.planPct.toFixed(2)}%"></i></div></div></article>`}).join("");
 return `<div class="object-overview-dashboard"><section class="object-overview-schedule">${head}${summary}<div class="schedule-control-list">${html}</div></section></div>`;
}
async function directObjectPageV3(id){
 const o=await data().objects.get(id);if(!o)return go("/objects");
 document.body.classList.add("ir-object-overview");
 const root=data().forObject(id),[photos,schedule,workTypes,marks,reports]=await Promise.all([objectPhotoMap(id),root.section("schedule").list().catch(()=>[]),root.section("work-types").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("reports").list().catch(()=>[])]);
 let bannerUrl="";const bannerFile=photos.banner?.data?.file_path||"";if(bannerFile)try{bannerUrl=await irProject.images.read(bannerFile)}catch{}
 const dates=scheduleDates(schedule),period=dates.start&&dates.end?`${dates.start} — ${dates.end}`:dates.start?`с ${dates.start}`:dates.end?`до ${dates.end}`:"Срок не задан";
 const status=o.status||"В работе",active=status!=="Завершен";
 app.innerHTML=`<section class="object-overview-hero" data-object-id="${id}">${bannerUrl?`<div class="object-overview-hero-bg" style="background-image:linear-gradient(180deg,rgba(10,17,27,.03),rgba(10,17,27,.20)),url(&quot;${bannerUrl}&quot;)"></div>`:""}<div class="object-hero-shade"></div><div class="object-hero-content"><div class="object-hero-top"><div class="object-hero-copy"><div class="object-hero-breadcrumbs"><button type="button" data-hero-objects>Объекты</button><span>›</span><span>${esc(o.name)}</span></div><h1>${esc(o.name)}</h1><div class="object-hero-contract"><span><b>Заказчик:</b> ${esc(o.customer||"—")}</span><span><b>Генподрядчик:</b> ${esc(o.general_contractor||"—")}</span></div></div><div class="object-hero-actions"><button type="button" class="object-hero-action primary" data-hero-report>${icons.plus}<span>Добавить отчёт</span></button><button type="button" class="object-hero-action" data-hero-edit>${icons.edit}<span>Редактировать</span></button><button type="button" class="object-hero-action icon-only" data-hero-more aria-label="Дополнительные действия">${icons.dots}</button><div class="object-hero-menu" data-hero-menu hidden><button type="button" data-hero-export-html>Выгрузить весь объект в HTML</button><button type="button" data-hero-menu-edit>Редактировать объект</button><button type="button" data-hero-menu-objects>Все объекты</button></div></div></div><div class="object-hero-info"><div class="object-hero-status ${active?"active":"done"}">${icons.check}<span>${esc(status)}</span></div><div class="object-hero-info-item">${icons.calendar}<div><b>${esc(period)}</b><span>Срок строительства</span></div></div><div class="object-hero-info-item location">${icons.pin}<div><b>${esc(o.address||"Адрес не указан")}</b><span>Расположение объекта</span></div></div></div></div></section>${scheduleControl(schedule,workTypes,marks,reports)}${formHtml()}${versionHtml()}`;
 refreshVersion();setupObjectForm();
 const hero=app.querySelector(".object-overview-hero"),goObjects=()=>go("/objects"),edit=()=>openObjectForm(id);
 hero.querySelector("[data-hero-objects]").onclick=goObjects;hero.querySelector("[data-hero-report]").onclick=()=>go(`/objects/object/${id}/reports/new`);hero.querySelector("[data-hero-edit]").onclick=edit;hero.querySelector("[data-hero-menu-edit]").onclick=edit;hero.querySelector("[data-hero-menu-objects]").onclick=goObjects;
 hero.querySelector("[data-hero-export-html]").onclick=()=>{menu.hidden=true;const save=window.irObjectHtmlExport?.save;if(typeof save==="function")void save(id);else alert("Экспорт HTML пока недоступен. Перезапустите IR Project.")};
 app.querySelector("[data-overview-schedule]")?.addEventListener("click",()=>go(`/objects/object/${id}/schedule`));
 const more=hero.querySelector("[data-hero-more]"),menu=hero.querySelector("[data-hero-menu]");more.onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden};setTimeout(()=>document.addEventListener("click",e=>{if(!hero.contains(e.target))menu.hidden=true},{once:true}),0);
}
try{objectPage=directObjectPageV3}catch{}window.objectPage=directObjectPageV3;
const m=location.hash.match(/^#\/objects\/object\/(\d+)\/?$/);if(m)setTimeout(()=>directObjectPageV3(m[1]),0);
})();

;

/* #36: src/object-overview-trend-v3.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=num(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=num(raw);return v||(!hasMark?q:0)}const uv=num(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 const selected=new Map();
 function objectId(){return location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||""}
 async function buildData(oid){
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const serviceIds=new Set(arr(workTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id))),catalog=arr(workTypes).filter(r=>(r.data?.accounting_type||"")!=="service"&&norm(r.data?.unit)!=="услуга").map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:d.unit||""}}),byId=new Map(catalog.map(x=>[x.id,x]));
  const exact=(name,code)=>catalog.find(x=>norm(x.name)===norm(name)&&norm(x.code)===norm(code));
  const resolve=w=>{
   const rawId=String(w.work_type_id||""),name=w.work_type||w.type||"",code=w.project_code||w.code||"",unit=w.unit||"";
   const byRaw=rawId?byId.get(rawId):null;
   if(byRaw){const nameOk=!name||norm(byRaw.name)===norm(name),codeOk=!code||!byRaw.code||norm(byRaw.code)===norm(code);if(nameOk&&codeOk)return byRaw}
   let hit=exact(name,code);
   if(!hit&&code){const matches=catalog.filter(x=>norm(x.code)===norm(code));if(matches.length===1)hit=matches[0]}
   if(!hit&&name){const matches=catalog.filter(x=>norm(x.name)===norm(name));if(matches.length===1)hit=matches[0]}
   if(hit)return hit;
   const id=`legacy:${norm(name)}|${norm(code)}|${norm(unit)}`;return{id,name:name||"Без названия",code,unit};
  };
  const volumes=new Map(),used=new Map();
  for(const r of arr(reports)){
   const d=r.data||r,date=iso(d.date||d.report_date);if(!date)continue;
   for(const w of arr(d.items||d.works)){
    if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга"||serviceIds.has(String(w.work_type_id||"")))continue;const type=resolve(w),id=type.id;used.set(id,type);
    if(!volumes.has(id))volumes.set(id,new Map());
    const byDate=volumes.get(id);byDate.set(date,(byDate.get(date)||0)+reportVolume(w));
   }
  }
  const types=[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru"));
  return{volumes,types};
 }
 function chartHtml(oid,data){
  if(!data.types.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>Нет выполненных объёмов в ежедневных отчётах</span></div></div>`;
  let active=selected.get(String(oid));if(!data.types.some(x=>x.id===active))active=data.types[0].id;selected.set(String(oid),active);
  const m=data.types.find(x=>x.id===active),byDate=data.volumes.get(active)||new Map(),dates=[...byDate.keys()].sort(),points=dates.map(date=>({date,value:byDate.get(date)||0}));
  if(!points.length)return `<div class="schedule-trend schedule-trend-empty"><div><b>Динамика по ежедневным отчётам</b><span>По выбранному виду работ нет объёмов</span></div></div>`;
  const nonZero=points.filter(x=>x.value>0),last=points.at(-1),prev=points.length>1?points.at(-2):null,total=points.reduce((s,x)=>s+x.value,0),avg=nonZero.length?total/nonZero.length:0,max=Math.max(0,...points.map(x=>x.value)),diff=prev?last.value-prev.value:0,trend=prev?(diff>0?`▲ +${fmt(diff)}`:diff<0?`▼ ${fmt(diff)}`:`● 0`):"—",trendClass=diff>0?"up":diff<0?"down":"flat",unit=m.unit||"ед.";
  const W=Math.max(900,points.length*48),H=210,L=48,R=20,T=20,B=34,innerH=H-T-B,innerW=W-L-R,maxY=Math.max(1,max,avg),step=innerW/Math.max(1,points.length),barW=Math.max(18,Math.min(72,step*.64)),avgY=T+innerH-(avg/maxY)*innerH;
  const bars=points.map((p,i)=>{const h=(p.value/maxY)*innerH,x=L+i*step+(step-barW)/2,yy=H-B-h;return `<g class="daily-bar"><rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}" rx="4"></rect><text x="${(x+barW/2).toFixed(1)}" y="${Math.max(12,yy-5).toFixed(1)}" text-anchor="middle">${p.value>0?esc(fmt(p.value)):""}</text><text class="daily-date" x="${(x+barW/2).toFixed(1)}" y="${H-11}" text-anchor="middle">${esc(fmtDate(p.date))}</text></g>`}).join("");
  const options=data.types.map(x=>`<option value="${esc(x.id)}" ${x.id===active?"selected":""}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:""}</option>`).join("");
  const avgLabel=`Среднее ${fmt(avg)} ${unit}`,avgBoxW=Math.max(112,72+String(avgLabel).length*4.6),avgBoxX=Math.max(L+4,W-R-avgBoxW-6),avgBoxY=Math.max(T+3,Math.min(H-B-22,avgY-12));
  const averageOverlay=avg>0?`<g class="daily-average-overlay"><line class="daily-average" x1="${L}" y1="${avgY.toFixed(1)}" x2="${W-R}" y2="${avgY.toFixed(1)}"></line><rect class="daily-average-bg" x="${avgBoxX.toFixed(1)}" y="${avgBoxY.toFixed(1)}" width="${avgBoxW.toFixed(1)}" height="19" rx="5"></rect><text class="daily-average-label" x="${(avgBoxX+avgBoxW-7).toFixed(1)}" y="${(avgBoxY+13).toFixed(1)}" text-anchor="end">${esc(avgLabel)}</text></g>`:"";
  return `<div class="schedule-trend"><div class="schedule-trend-head"><div><b>Динамика по ежедневным отчётам</b><span>Фактический объём выбранного вида работ по дням</span></div><select class="schedule-trend-select" data-trend-work>${options}</select></div><div class="schedule-trend-stats"><div><span>Последний день</span><b>${esc(fmt(last.value))} ${esc(unit)}</b><small>${esc(fmtDate(last.date))}</small></div><div><span>Выполнено за период</span><b>${esc(fmt(total))} ${esc(unit)}</b><small>${nonZero.length} дн. с объёмом</small></div><div><span>Максимум за день</span><b>${esc(fmt(max))} ${esc(unit)}</b></div><div class="trend-delta ${trendClass}"><span>К предыдущему отчёту</span><b>${esc(trend)} ${esc(unit)}</b></div></div><div class="schedule-trend-chart daily-volume-chart"><div class="daily-volume-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Фактические объёмы выбранного вида работ"><line class="daily-grid" x1="${L}" y1="${T}" x2="${W-R}" y2="${T}"></line><line class="daily-grid" x1="${L}" y1="${T+innerH/2}" x2="${W-R}" y2="${T+innerH/2}"></line><line class="daily-grid" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"></line><text class="daily-axis" x="4" y="${T+4}">${esc(fmt(maxY))}</text><text class="daily-axis" x="4" y="${H-B+4}">0</text>${bars}${averageOverlay}</svg></div></div></div>`;
 }
 async function renderInto(oid,host){
  const data=await buildData(oid);if(objectId()!==String(oid))return;
  const current=host.querySelector(".schedule-trend"),summary=host.querySelector(".schedule-control-summary"),wrap=document.createElement("div");wrap.innerHTML=chartHtml(oid,data);const node=wrap.firstElementChild;
  if(current)current.replaceWith(node);else if(summary)summary.replaceWith(node);else host.querySelector(".schedule-control-list")?.before(node);
  node.querySelector("[data-trend-work]")?.addEventListener("change",e=>{selected.set(String(oid),e.target.value);renderInto(oid,host)});
 }
 async function apply(){const oid=objectId();if(!oid)return;const host=document.querySelector(".object-overview-schedule");if(!host)return;await renderInto(oid,host)}
 window.addEventListener("hashchange",()=>setTimeout(apply,80));
 setTimeout(apply,120);
})();

;

/* #37: src/object-overview-reports-v4.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??0).replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const dmy=v=>{const p=String(v||"").slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:"—"};
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const reportData=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const workersOf=r=>arr(r.workers).length?arr(r.workers):arr(r.people);
 const responsibleOf=r=>arr(r.responsible).length?arr(r.responsible):arr(r.responsibles);
 const peopleTotal=r=>workersOf(r).reduce((s,x)=>s+num(x.count??x.qty),0)+responsibleOf(r).reduce((s,x)=>{const n=num(x.count??x.qty);return s+(n>0?n:(String(x.name||x.role||"").trim()?1:0))},0);
 const equipmentTotal=r=>arr(r.equipment).reduce((s,x)=>s+num(x.count??x.qty),0);
 const weatherText=r=>typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather?.condition||r.weather_text||"Не указана");
 const temperatureText=r=>{const raw=r.temperature??r.temp??r.weather?.temperature??r.weather?.temp;if(raw===""||raw==null)return"";const n=num(raw);return`${n>0?"+":""}${fmt(n)}°C`};
 const windText=r=>{const raw=r.wind??r.wind_speed??r.windSpeed??r.weather?.wind??r.weather?.wind_speed??r.weather?.windSpeed??r.wind_text??"";const s=String(raw??"").trim();if(!s)return"Не указан";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 const hasMark=w=>Boolean(String(w?.mark_id||w?.mark||"").trim());
 const workQty=w=>num(w?.qty??w?.count??w?.quantity);
 const workValue=w=>{const direct=num(w?.volume??w?.total_volume);if(direct)return direct;const uv=num(w?.unit_volume??w?.volume1);if(uv)return workQty(w)*uv;return hasMark(w)?0:workQty(w)};
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const weatherKind=w=>({"Ясно":"sun","Облачно":"cloud","Дождь":"rain","Снег":"snow","Гроза":"storm","Туман":"fog"})[w]||"cloud";
 const svg=body=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
 const icons={calendar:svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14l2 2 5-5"/>'),user:svg('<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>'),crane:svg('<circle cx="5" cy="19" r="2"/><circle cx="14" cy="19" r="2"/><path d="M2 16h17v3H2zM11 16V9l7-6 2 2-7 7v4M18 5h3v9M21 14v2"/>'),box:svg('<path d="M4 7l8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/>'),sun:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),cloud:svg('<path d="M6 18h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>'),rain:svg('<path d="M6 15h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 6 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>'),snow:svg('<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>'),storm:svg('<path d="M6 14h11a4 4 0 0 0 .4-8A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>'),fog:svg('<path d="M4 8h16M2 12h20M5 16h14"/>'),chevron:svg('<path d="m7 9 5 5 5-5"/>')};
 function totals(r){const map=new Map();for(const w of arr(r.items||r.works)){if(w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга")continue;const unit=String(w.unit||"ед.");map.set(unit,(map.get(unit)||0)+workValue(w))}return [...map.entries()].map(([unit,value])=>({unit,value}))}
 function workGroups(r){const map=new Map();for(const w of arr(r.items||r.works)){const service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",plain=!service&&!hasMark(w),name=w.work_type||w.type||"Работа",code=service?"Услуга":plain?"":w.project_code||w.code||"Без шифра",unit=service?"":w.unit||"ед.",key=[name,code,service?"service":unit].join("|");if(!map.has(key))map.set(key,{name,code,unit,value:0,service,plain,completed:false});const g=map.get(key);if(service)g.completed=g.completed||serviceDone(w);else g.value+=workValue(w)}return [...map.values()]}
 function volumeHtml(r){const groups=workGroups(r).filter(x=>x.service||x.value>0),measured=groups.some(x=>!x.service&&x.value>0),activity=window.irReportActivityPreview?.(r);
 if(!measured&&activity?.kind!=="empty")return '<div class="oor2-volume-groups">'+activity.lines.slice(0,3).map(t=>'<div class="oor2-volume-line"><span><b>'+esc(t)+'</b></span></div>').join("")+(activity.lines.length>3?'<small>+ ещё '+(activity.lines.length-3)+'</small>':"")+'</div>';
 if(!groups.length)return'<span class="oor2-volume-empty">Работы не проводились</span>';return `<div class="oor2-volume-groups">${groups.slice(0,3).map(x=>`<div class="oor2-volume-line"><span><b>${esc(workLabel(x.name,"mount"))}</b>${x.code?`<em>${esc(x.code)}</em>`:""}</span><strong>${x.service?(x.completed?"✓ Выполнено":"Не выполнено"):`${fmt(x.value)} ${esc(x.unit)}`}</strong></div>`).join("")}${groups.length>3?`<small>+ ещё ${groups.length-3}</small>`:""}</div>`}
 function toggleHtml(){return `<span class="oor2-chevron">${icons.chevron}</span>`}
 function brief(r,no,open){const weather=weatherText(r),temp=temperatureText(r),wind=windText(r),kind=weatherKind(weather),label=open?"Свернуть":"Развернуть";return `<div class="oor2-brief oor2-brief-wrap ${open?"is-open":""}" data-toggle-report="${esc(r.id)}"><div class="oor2-brief-metrics"><div class="oor2-cell oor2-date"><span class="oor2-icon">${icons.calendar}</span><div><small>Дата</small><b>${dmy(r.date||r.report_date)}</b><em>Отчёт №${no}</em></div></div><div class="oor2-cell oor2-weather weather-${kind}"><span class="oor2-icon">${icons[kind]}</span><div><small>Погода</small><b>${esc(weather)}${temp?` · ${esc(temp)}`:""}</b><em>Ветер: ${esc(wind)}</em></div></div><div class="oor2-cell"><span class="oor2-icon people">${icons.user}</span><div><small>Люди</small><b>${fmt(peopleTotal(r))} чел.</b></div></div><div class="oor2-cell"><span class="oor2-icon equipment">${icons.crane}</span><div><small>Техника</small><b>${fmt(equipmentTotal(r))} ед.</b></div></div><div class="oor2-cell oor2-volume"><span class="oor2-icon volume">${icons.box}</span><div><small>${!workGroups(r).some(g=>!g.service&&g.value>0)?esc(window.irReportActivityPreview?.(r)?.label||"Объём"):"Объём"}</small>${volumeHtml(r)}</div></div></div><button class="oor2-toggle" type="button" data-toggle-button="${esc(r.id)}" aria-expanded="${open?"true":"false"}" aria-label="${label}" title="${label}">${toggleHtml()}</button></div>`}
 function works(r){const rows=arr(r.items||r.works),activity=window.irReportActivityPreview?.(r),isService=w=>w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",marked=rows.filter(w=>!isService(w)&&hasMark(w)),hasMeasured=rows.some(w=>!isService(w)&&workValue(w)>0),plain=rows.filter(w=>!isService(w)&&!hasMark(w)),services=rows.filter(isService),t=totals(r),hasServices=services.length>0,totalsHtml=t.length?t.map(x=>`<div class="oor2-total"><small>Выполнено</small><b>${fmt(x.value)} ${esc(x.unit)}</b></div>`).join(""):(hasServices?'<div class="oor2-total"><small>Услуги</small><b>Без объёма</b></div>':(window.irReportActivityPreview?.(r)?.kind!=="empty"?"":'<div class="oor2-total"><small>Выполненные работы</small><b>Нет объёмов</b></div>')),markedBody=marked.map(w=>`<tr><td><b>${esc(workLabel(w.work_type||w.type||"Работа","mount"))}</b></td><td>${esc(w.project_code||w.code||"—")}</td><td>${esc(w.mark||"—")}${w.name?`<small>${esc(w.name)}</small>`:""}</td><td>${fmt(workQty(w))}</td><td><span>Объём</span><b>${fmt(workValue(w))} ${esc(w.unit||"")}</b></td></tr>`).join(""),plainBody=plain.map(w=>`<tr><td><b>${esc(workLabel(w.work_type||w.type||"Работа","mount"))}</b></td><td></td><td>${esc(w.unit||"—")}</td><td><b>${fmt(workQty(w))}</b></td></tr>`).join(""),serviceBody=services.map(w=>`<tr><td><b>${esc(w.work_type||w.type||"Услуга")}</b></td><td><b class="${serviceDone(w)?"oor2-service-done":"oor2-service-pending"}">${serviceDone(w)?"✓ Выполнено":"Не выполнено"}</b></td></tr>`).join(""),markedBlock=marked.length?`<div class="oor2-work-block"><div class="oor2-work-block-title">Работы по маркам</div><div class="oor2-table-wrap"><table><thead><tr><th>Вид работы</th><th>Шифр</th><th>Марка</th><th>Кол-во</th><th>Итог</th></tr></thead><tbody>${markedBody}</tbody></table></div></div>`:"",plainBlock=plain.length?`<div class="oor2-work-block oor2-plain-work-block"><div class="oor2-work-block-title">Работы</div><div class="oor2-table-wrap"><table class="oor2-plain-table"><thead><tr><th>Вид работы</th><th></th><th>Ед. измерения</th><th>Кол-во Итого</th></tr></thead><tbody>${plainBody}</tbody></table></div></div>`:"",serviceBlock=services.length?`<div class="oor2-work-block oor2-service-block"><div class="oor2-work-block-title">Услуги</div><div class="oor2-table-wrap"><table class="oor2-service-table"><thead><tr><th>Вид работы</th><th>Статус</th></tr></thead><tbody>${serviceBody}</tbody></table></div></div>`:"",body=(!hasMeasured&&activity?.kind!=="empty")?'<div class="oor2-activity"><div class="oor2-activity-kind">'+esc(activity.label)+'</div><div class="oor2-activity-list">'+activity.lines.map((line,i)=>'<div class="oor2-activity-line"><span>'+String(i+1).padStart(2,"0")+'</span><p>'+esc(line)+'</p></div>').join("")+'</div></div>':markedBlock+plainBlock+serviceBlock||'<div class="oor2-empty-cell">Работы не проводились</div>';return `<div class="oor2-details" data-details-report="${esc(r.id)}"><section class="oor2-works"><div class="oor2-works-title"><div><h3>${!hasMeasured&&activity?.kind!=="empty"?esc(activity.label):"Выполненные работы"}</h3><p>Детализация отчёта за ${dmy(r.date||r.report_date)}</p></div><button type="button" data-open-report="${esc(r.id)}">Открыть отчёт</button></div>${totalsHtml?`<div class="oor2-totals">${totalsHtml}</div>`:""}${body}</section></div>`}
 const photoPath=p=>typeof p==="string"?p:String(p?.file_path||p?.file||p?.path||"").trim();
 async function latestPhotos(reports,noMap){const candidates=[];for(const r of reports){const list=arr(r.photos).length?arr(r.photos):arr(r.reportPhotos);for(const p of list){const path=photoPath(p);if(path)candidates.push({path,reportId:String(r.id),date:r.date||r.report_date||"",no:noMap.get(String(r.id))||1})}}const out=[];for(let i=0;i<candidates.length&&out.length<12;i+=12){const batch=candidates.slice(i,i+12),urls=await Promise.all(batch.map(x=>irProject.images.read(x.path).catch(()=>"")));for(let j=0;j<batch.length&&out.length<12;j++)if(urls[j])out.push({...batch[j],src:urls[j]})}return out}
 function overviewMarksBlock(markRows,workRows,reports){
  const workMap=new Map(arr(workRows).map(r=>{const d=r.data||{};return[String(r.id),{name:d.work_type||r.title||"Без вида работ",code:d.project_code||"",unit:d.unit||""}]}));
  const mounted=new Map();for(const r of arr(reports).map(reportData))for(const w of arr(r.items||r.works)){const id=String(w.mark_id||"");if(id)mounted.set(id,(mounted.get(id)||0)+workQty(w))}
  const markTotal=x=>{const raw=x.total_value??x.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x.qty??x.count)*num(x.unit_volume??x.volume_one)};
  const rows=arr(markRows).map(r=>({id:String(r.id),title:r.title||"",...(r.data||{})})).filter(x=>x.accounting_type!=="service"&&norm(x.unit)!=="услуга").map(x=>{const total=num(x.qty??x.count),done=Math.min(total,mounted.has(x.id)?num(mounted.get(x.id)):num(x.mounted??x.done)),status=total>0&&done>=total-1e-9?"done":done>0?"partial":"left",work=workMap.get(String(x.work_type_id||""))||{name:x.work_type||"Без вида работ",code:x.project_code||"",unit:x.unit||""},pct=total?Math.min(100,done/total*100):0;return{...x,total,done,status,work,pct,totalVolume:markTotal(x)}}).filter(x=>x.total>0);
  const order={partial:0,left:1,done:2},shown=[...rows].sort((a,b)=>order[a.status]-order[b.status]||String(a.work.name).localeCompare(String(b.work.name),"ru")||String(a.mark||a.title).localeCompare(String(b.mark||b.title),"ru",{numeric:true})).slice(0,6);
  const totalQty=rows.reduce((s,x)=>s+x.total,0),doneQty=rows.reduce((s,x)=>s+x.done,0),ready=totalQty?Math.min(100,doneQty/totalQty*100):0,doneCount=rows.filter(x=>x.status==="done").length,partialCount=rows.filter(x=>x.status==="partial").length,leftCount=rows.length-doneCount;
  const body=shown.length?shown.map(x=>`<div class="oor-marks-row"><div><b>${esc(x.mark||x.title||"—")}</b><span>${esc(x.name||"")}</span></div><div><b>${esc(workLabel(x.work.name))}</b><span>${esc(x.work.code||"Без шифра")}</span></div><div><b>${fmt(x.done)} / ${fmt(x.total)}</b><span>${esc(x.unit||x.work.unit||"шт")}</span></div><div class="oor-marks-progress"><i><em style="width:${x.pct.toFixed(2)}%"></em></i><b>${Math.round(x.pct)}%</b></div><span class="oor-marks-status ${x.status}">${x.status==="done"?"Смонтировано":x.status==="partial"?"Частично":"Не начато"}</span></div>`).join(""):'<div class="oor2-empty">Ведомость марок пока пустая</div>';
  return`<section class="oor2-card oor-marks-card"><div class="oor2-head"><div><h2>Ведомость / марки</h2><p>Краткий контроль монтажа по маркам</p></div><button type="button" data-all-marks>Открыть ведомость</button></div><div class="oor-marks-stats"><div><span>Позиций</span><b>${rows.length}</b></div><div><span>Смонтировано</span><b>${doneCount}</b></div><div><span>В работе</span><b>${partialCount}</b></div><div><span>Осталось</span><b>${leftCount}</b></div><div class="oor-marks-ready"><span>Готовность</span><b>${Math.round(ready)}%</b><i><em style="width:${ready.toFixed(2)}%"></em></i></div></div><div class="oor-marks-head"><span>Марка</span><span>Вид работы</span><span>Монтаж</span><span>Прогресс</span><span>Статус</span></div><div class="oor-marks-list">${body}</div>${rows.length>shown.length?`<div class="oor-marks-footer"><span>Показано ${shown.length} из ${rows.length}</span><button type="button" data-all-marks>Показать все</button></div>`:""}</section>`;
 }
 function photosBlock(items){const head=`<div class="oor2-head"><div><h2>Последние фото</h2><p>Последние 12 фото из ежедневных отчётов</p></div><button type="button" data-photo-reports>Все отчёты</button></div>`;if(!items.length)return `<section class="oor2-card oor2-photo-card">${head}<div class="oor2-empty">В ежедневных отчётах пока нет фотографий</div></section>`;return `<section class="oor2-card oor2-photo-card">${head}<div class="oor2-photo-grid">${items.map((x,i)=>`<button type="button" class="oor2-photo-item" data-photo-report="${esc(x.reportId)}" title="Открыть отчёт №${esc(x.no)} за ${esc(dmy(x.date))}"><img src="${esc(x.src)}" alt="Фото из отчёта №${esc(x.no)}"><span><b>${esc(dmy(x.date))}</b><em>Отчёт №${esc(x.no)}</em></span></button>`).join("")}</div></section>`}
 function findReport(wrap,id){return [...wrap.querySelectorAll("[data-report]")].find(x=>String(x.dataset.report)===String(id))||null}
 async function renderOnce(){const oid=objectId();if(!oid)return true;const app=document.getElementById("app"),schedule=app?.querySelector(".object-overview-dashboard");if(!app||!schedule)return false;app.querySelector(".object-overview-reports")?.remove();const root=irProject.data.forObject(oid),[raw,rawMarks,rawWorkTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("marks").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);if(objectId()!==String(oid))return true;const orderedAll=raw.map(reportData).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||""))||Number(b.id)-Number(a.id)),noMap=new Map([...raw].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1])),reports=orderedAll.slice(0,5),photos=await latestPhotos(orderedAll,noMap);if(objectId()!==String(oid))return true;const wrap=document.createElement("div");wrap.className="object-overview-reports";const head=`<div class="oor2-head"><div><h2>Последние ежедневные отчёты</h2><p>Последние 5 отчётов по объекту</p></div><button type="button" data-all-reports>Все отчёты</button></div>`,reportsHtml=reports.length?`<section class="oor2-card">${head}<div class="oor2-list">${reports.map((r,i)=>{const open=i===0,detail=works(r);return `<article class="oor2-report" data-report="${esc(r.id)}">${brief(r,noMap.get(String(r.id))||1,open)}${open?detail:detail.replace('<div class="oor2-details"','<div class="oor2-details" hidden')}</article>`}).join("")}</div></section>`:`<section class="oor2-card">${head}<div class="oor2-empty">Раздел Ежедневные отчёты пуст</div></section>`;wrap.innerHTML=`${overviewMarksBlock(rawMarks,rawWorkTypes,raw)}${reportsHtml}${photosBlock(photos)}`;schedule.insertAdjacentElement("afterend",wrap);wrap.querySelectorAll("[data-all-marks]").forEach(b=>b.addEventListener("click",()=>location.hash=`/objects/object/${oid}/marks`));wrap.querySelector("[data-all-reports]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports`);wrap.querySelector("[data-photo-reports]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports`);wrap.querySelectorAll("[data-photo-report]").forEach(b=>b.addEventListener("click",()=>location.hash=`/objects/object/${oid}/reports/${b.dataset.photoReport}`));const toggle=id=>{const report=findReport(wrap,id);if(!report)return;const details=report.querySelector(".oor2-details"),briefRow=report.querySelector(".oor2-brief"),button=report.querySelector(".oor2-toggle");if(!details||!briefRow||!button)return;const opening=details.hasAttribute("hidden");if(opening)details.removeAttribute("hidden");else details.setAttribute("hidden","");briefRow.classList.toggle("is-open",opening);button.setAttribute("aria-expanded",opening?"true":"false");const label=opening?"Свернуть":"Развернуть";button.setAttribute("aria-label",label);button.setAttribute("title",label);button.innerHTML=toggleHtml()};wrap.querySelectorAll("[data-toggle-report]").forEach(row=>row.addEventListener("click",e=>{if(e.target.closest("button"))return;toggle(row.dataset.toggleReport)}));wrap.querySelectorAll("[data-toggle-button]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggle(b.dataset.toggleButton)});wrap.querySelectorAll("[data-open-report]").forEach(b=>b.onclick=e=>{e.stopPropagation();location.hash=`/objects/object/${oid}/reports/${b.dataset.openReport}`});return true}
 let runToken=0;function scheduleApply(){const token=++runToken;let attempt=0;const run=async()=>{if(token!==runToken)return;try{const done=await renderOnce();if(done||token!==runToken)return}catch(e){console.error("object overview reports",e)}if(++attempt<30)setTimeout(run,150)};setTimeout(run,0)}window.addEventListener("hashchange",scheduleApply);scheduleApply();
})();

;

/* #38: src/object-overview-deliveries.js */
"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v||"—")};
 const fmtShort=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const normUnit=u=>{const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s/g,"");if(["т","тн","tn","ton","tons"].includes(s))return"тн";if(["м2","m2"].includes(s))return"м2";if(["м3","m3"].includes(s))return"м3";return s||"ед."};
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const record=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const selected=new Map();
 function valueOf(x){const raw=x?.volume??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x?.qty??x?.count??x?.quantity)*num(x?.unit_volume??x?.volume_one)}
 function isServiceItem(x,serviceIds){return x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||serviceIds?.has(String(x?.work_type_id||""))}
 function workGroups(r,serviceIds){const map=new Map();for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const key=[x.work_type_id||x.work_type||"",x.project_code||""].join("|");if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}return[...map.values()]}
 function totalsByUnit(r,serviceIds){const out={};for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const u=normUnit(x.unit),v=valueOf(x);out[u]=(out[u]||0)+v}if(!Object.keys(out).length&&!itemsOf(r).length&&r?.totals_by_unit&&typeof r.totals_by_unit==="object")for(const [u,v] of Object.entries(r.totals_by_unit))out[normUnit(u)]=(out[normUnit(u)]||0)+num(v);return out}
 function totalsText(r,serviceIds){const p=Object.entries(totalsByUnit(r,serviceIds)).filter(([,v])=>Math.abs(v)>1e-9).map(([u,v])=>`${fmt(v)} ${u}`);return p.length?p.join(" · "):"0"}
 function buildCatalog(rows){return arr(rows).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:normUnit(d.unit||"")}})}
 function resolver(catalog){const byId=new Map(catalog.map(x=>[x.id,x]));return x=>{const rawId=String(x?.work_type_id||""),name=x?.work_type||x?.type||"",code=x?.project_code||x?.code||"",unit=normUnit(x?.unit||"");const direct=rawId?byId.get(rawId):null;if(direct){const nameOk=!name||norm(direct.name)===norm(name),codeOk=!code||!direct.code||norm(direct.code)===norm(code);if(nameOk&&codeOk)return direct}let hit=catalog.find(w=>norm(w.name)===norm(name)&&norm(w.code)===norm(code));if(!hit&&code){const m=catalog.filter(w=>norm(w.code)===norm(code));if(m.length===1)hit=m[0]}if(!hit&&name){const m=catalog.filter(w=>norm(w.name)===norm(name));if(m.length===1)hit=m[0]}return hit||{id:`legacy:${norm(name)}|${norm(code)}|${unit}`,name:name||"Без названия",code,unit}}}
 function summarizeTypes(deliveries,reports,catalog,serviceIds){const resolve=resolver(catalog),used=new Map(),del=new Map(),mnt=new Map();
  const add=(map,type,date,value)=>{if(!date||value<=0)return;used.set(type.id,type);if(!map.has(type.id))map.set(type.id,new Map());const d=map.get(type.id);d.set(date,(d.get(date)||0)+value)};
  for(const r of deliveries){const date=iso(r.date||r.delivery_date);for(const x of itemsOf(r)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(del,t,date,valueOf(x))}}
  for(const r of reports){const date=iso(r.date||r.report_date);for(const x of arr(r.items||r.works)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(mnt,t,date,valueOf(x))}}
  return{types:[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru")),del,mnt};
 }
 const irSupplyChartFactory=function SupplyEngine(){
 const arr=x=>Array.isArray(x)?x:[],str=x=>String(x??"").trim(),norm=x=>str(x).toLowerCase().replace(/ё/g,"е").replace(/\s+/g," "),num=x=>{const n=Number(str(x).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const unit=x=>{const u=norm(x).replace(/[²³]/g,c=>c==="²"?"2":"3").replace(/\s/g,"");return["т","тн","тонна","тонн","тонны"].includes(u)?"тн":["м2","m2"].includes(u)?"м2":["м3","m3"].includes(u)?"м3":u||"ед."};
 const date=x=>{const v=str(x),m=v.match(/^(\d{2})\.(\d{2})\.(\d{4})/);return /^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):m?`${m[3]}-${m[2]}-${m[1]}`:""};
 const fmt=v=>num(v).toLocaleString("ru-RU",{maximumFractionDigits:3}),short=x=>x?x.slice(8,10)+"."+x.slice(5,7):"",long=x=>x?short(x)+"."+x.slice(0,4):"";
 const vol=(x,marks)=>{
  const v=x.volume??x.total_volume;if(v!==undefined&&v!==null&&str(v)!=="")return num(v);
  const q=num(x.qty??x.count??x.quantity),uv=x.unit_volume??x.volume_one??marks.get(str(x.mark_id))?.unit_volume;
  return uv!==undefined&&uv!==null&&str(uv)!==""?q*num(uv):x.mark_id?0:q
 };
 function prepare(workRows,deliveries,reports,markRows=[]){
  const types=arr(workRows).map(r=>{const d=r.data||r;return{id:str(r.id),name:str(d.work_type||r.title||"Вид работ"),code:str(d.project_code||d.code),unit:unit(d.unit),service:d.accounting_type==="service"||norm(d.unit)==="услуга",codes:[]}});
  const marks=new Map(arr(markRows).map(r=>[str(r.id),r.data||r])),byId=new Map(types.map(t=>[t.id,t])),events=[];
  const resolve=x=>{const t=byId.get(str(x.work_type_id));if(t)return t;const n=norm(x.work_type||x.type),c=norm(x.project_code||x.code);let hits=types.filter(t=>norm(t.name)===n&&norm(t.code)===c);if(!hits.length&&c)hits=types.filter(t=>norm(t.code)===c);if(!hits.length&&n)hits=types.filter(t=>norm(t.name)===n);return hits.length===1?hits[0]:null};
  for(const [records,kind] of [[deliveries,"delivered"],[reports,"mounted"]])for(const r of arr(records)){
   const d=r.data||r,dt=date(d.date||d.delivery_date||d.report_date);if(!dt)continue;
   const items=arr(d.items).length?d.items:kind==="delivered"?(d.marks||d.positions||[]):(d.works||[]);
   for(const x of arr(items)){
    const t=resolve(x);if(!t||t.service||x.accounting_type==="service"||x.is_service===true||norm(x.unit)==="услуга")continue;
    const u=unit(x.unit||marks.get(str(x.mark_id))?.unit||t.unit),value=vol(x,marks);
    if(!(value>0))continue;
    if(t.unit!=="ед."&&u!==t.unit)continue;
    const code=str(x.project_code||x.code||t.code);if(code&&!t.codes.includes(code))t.codes.push(code);
    events.push({typeId:t.id,code,unit:u,date:dt,kind,value})
   }
  }
  for(const t of types){if(t.code&&!t.codes.includes(t.code))t.codes.push(t.code);if(t.unit==="ед.")t.unit=events.find(e=>e.typeId===t.id)?.unit||"ед."}
  // Merge duplicate work types across codes, but never across measurement units.
  const displayName=value=>{
   const name=str(value).replace(/^(?:монтаж|поставка)\s+/i,"");
   const n=norm(name),pos=name.indexOf(" "),suffix=pos<0?"":name.slice(pos);
   if(/^металлоконструкц/.test(n))return"Монтаж металлоконструкций"+suffix;
   if(/^сэндвич-панел/.test(n))return"Монтаж сэндвич-панелей"+suffix;
   if(/^профнастил/.test(n))return"Монтаж профнастила"+suffix;
   return /^(?:монтаж|поставка)\s/i.test(str(value))?str(value):name
  };
  const groups=new Map();
  for(const t of types){
   const name=displayName(t.name),key=norm(name)+"|"+t.unit;
   if(!groups.has(key))groups.set(key,{...t,name,members:[],codes:[]});
   const group=groups.get(key);group.members.push(t.id);
   for(const code of [t.code,...t.codes])if(code&&!group.codes.includes(code))group.codes.push(code)
  }
  for(const group of groups.values()){
   group.codes.sort((a,b)=>a.localeCompare(b,"ru",{numeric:true}));
   const activities=events.filter(e=>group.members.includes(e.typeId)&&e.unit===group.unit);
   group.activeDays=new Set(activities.map(e=>e.date)).size;
   group.activities=activities.length
  }
  const ranked=[...groups.values()].sort((a,b)=>b.activeDays-a.activeDays||b.activities-a.activities||a.name.localeCompare(b.name,"ru",{numeric:true})||a.unit.localeCompare(b.unit,"ru"));
  return{types:ranked,events}
 }
 function calc(model,id,code="",mode="daily"){
  const type=arr(model.types).find(t=>t.id===id)||arr(model.types)[0];
  if(!type)return{type:null,points:[],delivered:0,mounted:0,remaining:0,unit:""};
  const members=new Set(type.members||[type.id]);
  const data=arr(model.events).filter(e=>members.has(e.typeId)&&e.unit===type.unit&&(!code||code===e.code));
  const delivered=data.filter(e=>e.kind==="delivered").reduce((sum,e)=>sum+e.value,0),mounted=data.filter(e=>e.kind==="mounted").reduce((sum,e)=>sum+e.value,0);
  const grouped=new Map();
  for(const e of data){if(!grouped.has(e.date))grouped.set(e.date,{date:e.date,delivered:0,mounted:0});grouped.get(e.date)[e.kind]+=e.value}
  const points=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(mode==="cumulative"){let a=0,b=0;for(const p of points){a+=p.delivered;b+=p.mounted;p.delivered=a;p.mounted=b}}
  return{type,points,delivered,mounted,remaining:delivered-mounted,unit:type.unit}
 }
 function graph(s,mode){
  if(!s.points.length)return'<div class="supply-empty">Нет данных за выбранный период</div>';
  const pts=s.points,n=pts.length,W=Math.max(660,n*(mode==="daily"?86:76)),H=328,L=55,R=20,T=20,B=50,IW=W-L-R,IH=H-T-B,top=Math.max(1,...pts.flatMap(p=>[p.delivered,p.mounted]))*1.15,y=x=>T+IH-(x/top)*IH,x=i=>L+IW*(i+.5)/n;
  const grid=[0,.25,.5,.75,1].map(z=>`<line class="sup-grid" x1="${L}" x2="${W-R}" y1="${y(top*z)}" y2="${y(top*z)}"/><text class="sup-axis" x="${L-7}" y="${y(top*z)+4}" text-anchor="end">${esc(fmt(top*z))}</text>`).join("");
  const labels=pts.map((p,i)=>`<text class="sup-axis" text-anchor="middle" x="${x(i)}" y="${H-17}">${short(p.date)}</text>`).join("");
  let shapes="";
  if(mode==="daily"){shapes=pts.map((p,i)=>[["delivered","#3B82F6",-1],["mounted","#16A34A",1]].map(([key,color,side])=>{const bw=Math.min(28,IW/n*.3),h=p[key]/top*IH,xx=x(i)+(side===-1?-bw-2:2);return`<rect fill="${color}" x="${xx}" y="${y(p[key])}" width="${bw}" height="${h}"><title>${long(p.date)}\nПоставлено: ${fmt(p.delivered)} ${s.unit}\nСмонтировано: ${fmt(p.mounted)} ${s.unit}</title></rect>`}).join("")).join("")}
  else{const path=k=>pts.map((p,i)=>`${i?"L":"M"}${x(i)},${y(p[k])}`).join(" ");shapes=`<path stroke="#3B82F6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none" d="${path("delivered")}"/><path stroke="#16A34A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none" d="${path("mounted")}"/>`+pts.map((p,i)=>["delivered","mounted"].map(k=>`<circle fill="${k==="delivered"?"#3B82F6":"#16A34A"}" stroke="white" stroke-width="1.5" cx="${x(i)}" cy="${y(p[k])}" r="4"><title>${long(p.date)}: ${k==="delivered"?"Поставлено":"Смонтировано"} ${fmt(p[k])} ${s.unit}</title></circle>`).join("")).join("")}
  return`<div class="supply-scroll" tabindex="0"><svg width="${W}" height="${H}" style="min-width:${W}px" viewBox="0 0 ${W} ${H}" role="img" aria-label="Поставки и монтаж, ${esc(s.unit)}">${grid}${shapes}${labels}</svg></div>`
 }
 function render(model,state={}){
  const types=arr(model.types),type=types.find(t=>t.id===state.typeId)||types[0],id=type?.id,code=type?.codes.includes(state.code)?state.code:"",mode=state.mode==="cumulative"?"cumulative":"daily",s=calc(model,id,code,mode);
  const opt=types.map(t=>`<option value="${esc(t.id)}"${t.id===id?" selected":""}>${esc(t.name)}</option>`).join("");
  return`<section class="ood-card ood-comparison ir-supply-chart" data-supply-chart><div class="supply-title"><h2>Поставки и монтаж</h2><p>Поставки из накладных · монтаж из ежедневных отчётов</p></div><div class="supply-filters"><label class="supply-work">Вид работ<select data-supply-work aria-label="Вид работ">${opt}</select></label><label>Шифр<select data-supply-code aria-label="Шифр"><option value="">Все шифры</option>${(type?.codes||[]).map(c=>`<option value="${esc(c)}"${c===code?" selected":""}>${esc(c)}</option>`).join("")}</select></label><div class="supply-modes"><button type="button" data-supply-mode="daily" class="${mode==="daily"?"active":""}" aria-pressed="${mode==="daily"}">По дням</button><button type="button" data-supply-mode="cumulative" class="${mode==="cumulative"?"active":""}" aria-pressed="${mode==="cumulative"}">Накопительно</button></div></div><div class="supply-metrics"><div><span>Поставлено</span><b>${fmt(s.delivered)} <small>${esc(s.unit)}</small></b></div><div><span>Смонтировано</span><b>${fmt(s.mounted)} <small>${esc(s.unit)}</small></b></div><div class="${s.remaining<0?"negative":""}"><span>Остаток</span><b>${fmt(s.remaining)} <small>${esc(s.unit)}</small></b></div></div><div class="supply-legend"><span><i class="delivered"></i>Поставки</span><span><i class="mounted"></i>Монтаж</span></div>${graph(s,mode)}</section>`
 }
 function bind(card,model,state={},onChange){
  if(!card)return;const curr={...state};
  const next=()=>{onChange?.(curr);const temp=document.createElement("div");temp.innerHTML=render(model,curr);const fresh=temp.firstElementChild;card.replaceWith(fresh);bind(fresh,model,curr,onChange)};
  card.addEventListener("change",e=>{if(e.target.matches("[data-supply-work]")){curr.typeId=e.target.value;curr.code="";next()}else if(e.target.matches("[data-supply-code]")){curr.code=e.target.value;next()}});
  card.addEventListener("click",e=>{const b=e.target.closest("[data-supply-mode]");if(b){curr.mode=b.dataset.supplyMode;next()}});
 }
 function initOffline(){const e=document.getElementById("ir-supply-chart-data");if(!e)return;try{const model=JSON.parse(e.textContent);for(const c of document.querySelectorAll("[data-supply-chart]"))bind(c,model)}catch{}}
 const css=`
 .ir-supply-chart{box-sizing:border-box;max-width:100%;min-width:0;width:100%;overflow:hidden;background:white;font-family:'Segoe UI',Arial,sans-serif}.ir-supply-chart *{box-sizing:border-box}
 .ir-supply-chart .supply-title{padding:17px 18px 5px}.ir-supply-chart .supply-title h2{color:#214b66;font-size:16px;font-weight:850;margin:0 0 4px}.ir-supply-chart .supply-title p{color:#859cad;font-size:11px;margin:0}
 .ir-supply-chart .supply-filters{display:grid;grid-template-columns:minmax(0,2fr) minmax(125px,1fr) auto;align-items:end;gap:10px;padding:14px 18px}
 .ir-supply-chart .supply-filters label{display:grid;gap:5px;min-width:0;color:#56778b;font-size:11px;font-weight:700}
 .ir-supply-chart input,.ir-supply-chart select{box-sizing:border-box;width:100%;min-width:0;height:36px;padding:0 10px;background:#f9fbfe;border:1px solid #d5e3ed;border-radius:8px;color:#35546c;font:600 12px 'Segoe UI',Arial,sans-serif}
.ir-supply-chart .supply-modes{display:flex;gap:3px;padding:3px;background:#f0f5fa;border:1px solid #dae6ef;border-radius:8px}
 .ir-supply-chart .supply-modes button{padding:9px 11px;border:0;border-radius:7px;background:transparent;color:#59788b;cursor:pointer;white-space:nowrap;font:700 11px 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-modes button.active{background:#246da7;color:white}
 .ir-supply-chart .supply-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 18px 13px}
 .ir-supply-chart .supply-metrics>div{padding:12px;border:1px solid #e0e9f0;border-radius:10px;background:#f8fbfe;min-width:0}
 .ir-supply-chart .supply-metrics span{font-size:10px;color:#8498a8}.ir-supply-chart .supply-metrics b{display:block;margin-top:5px;color:#3B82F6;font-size:19px;overflow-wrap:anywhere}
 .ir-supply-chart .supply-metrics>div:nth-child(2) b{color:#16A34A}.ir-supply-chart .supply-metrics>div:nth-child(3) b{color:#244c69}.ir-supply-chart .supply-metrics .negative b{color:#c24b4b}.ir-supply-chart .supply-metrics small{font-size:10px}
 .ir-supply-chart .supply-legend{display:flex;justify-content:flex-end;gap:17px;padding:1px 18px 9px;color:#698397;font-size:11px}.ir-supply-chart .supply-legend span{display:flex;align-items:center;gap:5px}
 .ir-supply-chart .supply-legend i{width:16px;height:5px;border-radius:6px;background:#3B82F6}.ir-supply-chart .supply-legend i.mounted{background:#16A34A}
 .ir-supply-chart .supply-scroll{max-width:100%;overflow-x:auto;overflow-y:hidden;margin:0 16px 16px;border:1px solid #e0e8ee;border-radius:9px}
 .ir-supply-chart .supply-scroll svg{display:block;height:328px;max-width:none}.ir-supply-chart .sup-axis{fill:#8096a6;font-size:10px;font-family:Arial,sans-serif}.ir-supply-chart .sup-grid{stroke:#e7eef4;stroke-width:1}
 .ir-supply-chart .supply-empty{height:328px;display:flex;align-items:center;justify-content:center;text-align:center;margin:0 16px 16px;border:1px dashed #d6e1e9;border-radius:9px;color:#8fa4b2;font-size:12px}
 @media(max-width:850px){.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,1fr) minmax(120px,1fr)}.ir-supply-chart .supply-modes{grid-column:1/-1;width:max-content}}
 @media(max-width:550px){.ir-supply-chart .supply-title{padding:15px 11px 5px}.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,1fr);padding:11px}.ir-supply-chart .supply-modes{grid-column:auto;width:100%}.ir-supply-chart .supply-modes button{flex:1}.ir-supply-chart .supply-metrics{gap:5px;padding:0 8px 11px}.ir-supply-chart .supply-metrics>div{padding:8px 5px;text-align:center}.ir-supply-chart .supply-metrics b{font-size:14px}.ir-supply-chart .supply-scroll{margin:0 8px 12px}.ir-supply-chart .supply-empty{margin:0 8px 12px}}
 
 /* IR Project shared compact chart layout: same spacing and typography in the app and exported HTML. */
 .ir-supply-chart{width:100%;max-width:100%;min-width:0;margin:0;box-shadow:none;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.35}
 .ir-supply-chart .supply-title{padding:12px 14px 5px}
 .ir-supply-chart .supply-title h2{font:800 14px/1.35 'Segoe UI',Arial,sans-serif;color:#214b66;margin:0}
 .ir-supply-chart .supply-title p{font:400 11px/1.4 'Segoe UI',Arial,sans-serif;color:#8195a4;margin:3px 0 0}
 .ir-supply-chart .supply-filters{grid-template-columns:minmax(0,2fr) minmax(0,1fr);align-items:end;gap:10px;padding:10px 14px}
 .ir-supply-chart .supply-filters label{font:700 11px/1.3 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-filters select{width:100%;max-width:100%;font:600 12px/1.35 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-modes{grid-column:1/-1;justify-self:end;min-width:0;max-width:100%}
 .ir-supply-chart .supply-modes button{font:700 11px/1.35 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-metrics{gap:9px;padding:0 14px 10px}
 .ir-supply-chart .supply-metrics>div{padding:10px 11px}
 .ir-supply-chart .supply-metrics span{font-size:11px}
 .ir-supply-chart .supply-metrics b{font:800 18px/1.2 'Segoe UI',Arial,sans-serif;margin-top:5px}
 .ir-supply-chart .supply-metrics small{font-size:11px;font-weight:600}
 .ir-supply-chart .supply-legend{gap:15px;padding:3px 14px 9px;font:500 11px/1.35 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-scroll{box-sizing:border-box;width:calc(100% - 28px);max-width:calc(100% - 28px);margin:0 14px 12px;overflow-x:auto;overflow-y:hidden}
 .ir-supply-chart .supply-scroll svg{width:100%;max-width:none;height:328px}
 .ir-supply-chart .supply-empty{margin:0 14px 12px}
 /* The offline archive wraps this card twice. Remove those extra wrappers, not the chart content. */
 body.ir-object-overview #app #section-deliveries .ir-export-deliveries-unified{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:14px 20px 18px!important}
 body.ir-object-overview #app #section-deliveries .ir-export-deliveries-unified>.ir-export-preview{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important}
 body.ir-object-overview #app #section-deliveries .ir-export-preview>.ir-supply-chart{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-title{padding:0 0 5px!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-title h2{font:800 16px/1.35 'Segoe UI',Arial,sans-serif!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-filters{padding:10px 0!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-metrics{padding:0 0 10px!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-legend{padding:2px 0 8px!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-scroll{width:100%!important;max-width:100%!important;margin:0 0 12px!important}
 body.ir-object-overview #app #section-deliveries .ir-supply-chart .supply-empty{margin:0 0 12px!important}
 @media(max-width:850px){.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}.ir-supply-chart .supply-modes{grid-column:1/-1;justify-self:end;width:auto}}
 @media(max-width:550px){.ir-supply-chart .supply-title{padding:11px 10px 4px}.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,1fr);gap:8px;padding:9px 10px}.ir-supply-chart .supply-modes{width:100%;justify-self:stretch}.ir-supply-chart .supply-metrics{gap:5px;padding:0 8px 9px}.ir-supply-chart .supply-metrics>div{padding:8px 5px}.ir-supply-chart .supply-metrics b{font-size:14px}.ir-supply-chart .supply-metrics span{font-size:10px}.ir-supply-chart .supply-legend{padding:2px 9px 8px}.ir-supply-chart .supply-scroll{width:calc(100% - 16px);max-width:calc(100% - 16px);margin:0 8px 10px}.ir-supply-chart .supply-empty{margin:0 8px 10px}body.ir-object-overview #app #section-deliveries .ir-export-deliveries-unified{padding:12px 12px 16px!important}}
 `;
 return {prepare,calc,render,bind,initOffline,css}
};
 window.irSupplyChartFactory=irSupplyChartFactory;
 window.irSupplyChart=irSupplyChartFactory();
 if(!document.getElementById("ir-supply-styles")){const style=document.createElement("style");style.id="ir-supply-styles";style.textContent=window.irSupplyChart.css;document.head.appendChild(style)}
 const chartStates=new Map();
 function comparisonHtml(oid,model){return window.irSupplyChart.render(model,chartStates.get(String(oid))||{})}
 function deliveriesHtml(oid,deliveries,serviceIds){const ordered=[...deliveries].sort((a,b)=>String(b.date||b.delivery_date||"").localeCompare(String(a.date||a.delivery_date||""))||Number(b.id)-Number(a.id)).slice(0,5);const head=`<div class="ood-head"><div><h2>Последние накладные</h2><p>Последние 5 поставок по объекту</p></div><button type="button" data-ood-all>Все накладные</button></div>`;if(!ordered.length)return `<section class="ood-card ood-deliveries">${head}<div class="ood-empty">Раздел Поставки пуст</div></section>`;
  const rows=ordered.map(r=>{const groups=workGroups(r,serviceIds);return `<article class="ood-delivery-row" data-ood-delivery="${esc(r.id)}"><div><small>Накладная</small><b>№${esc(r.number||r.delivery_number||r.id)}</b><span>${fmtDate(r.date||r.delivery_date)}</span></div><div><small>Транспорт</small><b>${esc(r.vehicle_number||"—")}</b><span>${esc(r.driver_name||"Водитель не указан")}</span></div><div class="ood-delivery-works"><small>Работы</small>${groups.length?groups.slice(0,3).map(g=>`<span><b>${esc(workLabel(g.name,"delivery"))}</b> · ${esc(g.code||"Без шифра")} · ${g.count} поз.</span>`).join(""):'<span>Позиции не указаны</span>'}${groups.length>3?`<em>+ ещё ${groups.length-3}</em>`:""}</div><div class="ood-delivery-total"><small>Общий объём</small><b>${esc(totalsText(r,serviceIds))}</b></div><span class="ood-open">›</span></article>`}).join("");return `<section class="ood-card ood-deliveries">${head}<div class="ood-delivery-list">${rows}</div></section>`;
 }
 async function renderOnce(){const oid=objectId();if(!oid)return true;const app=document.getElementById("app"),anchor=app?.querySelector(".object-overview-reports")||app?.querySelector(".object-overview-dashboard");if(!app||!anchor)return false;app.querySelector(".object-overview-deliveries-wrap")?.remove();const root=irProject.data.forObject(oid),[rawDeliveries,rawReports,rawTypes]=await Promise.all([root.section("deliveries").list().catch(()=>[]),root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);if(objectId()!==String(oid))return true;const deliveries=rawDeliveries.map(record),reports=rawReports.map(record),serviceIds=new Set(arr(rawTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга"||r.data?.has_marks===false||r.data?.work_category==="other").map(r=>String(r.id))),model=window.irSupplyChart.prepare(rawTypes,rawDeliveries,rawReports),wrap=document.createElement("div");wrap.className="object-overview-deliveries-wrap";wrap.innerHTML=`${comparisonHtml(oid,model)}${deliveriesHtml(oid,deliveries,serviceIds)}`;anchor.insertAdjacentElement("afterend",wrap);window.irSupplyChart.bind(wrap.querySelector("[data-supply-chart]"),model,chartStates.get(String(oid))||{},s=>chartStates.set(String(oid),{...s}));wrap.querySelector("[data-ood-all]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries`);wrap.querySelectorAll("[data-ood-delivery]").forEach(row=>row.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries?id=${encodeURIComponent(row.dataset.oodDelivery)}`));return true}
 let token=0;function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview deliveries",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,60)}window.addEventListener("hashchange",schedule);schedule();
})();

;

/* #39: src/object-overview-deliveries-donut.js */
"use strict";
(()=>{
 const num=v=>{const m=String(v??"").replace(/\s/g,"").replace(",",".").match(/-?\d+(?:\.\d+)?/);const n=m?Number(m[0]):0;return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=v=>{const n=Number(v)||0;return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 function unitOf(text){return String(text||"").replace(/[-+]?\d[\d\s]*(?:[,.]\d+)?/g,"").trim()||"ед."}
 function patchLabels(card){
  const head=card.querySelector(".ood-head h2");if(head)head.textContent="Поставки и монтаж";
  const sub=card.querySelector(".ood-head p");if(sub)sub.textContent="Поставлено по накладным и смонтировано по ежедневным отчётам";
  const legend=card.querySelectorAll(".ood-legend span");
  if(legend[0])legend[0].innerHTML='<i class="delivered"></i>Поставлено по накладным';
  if(legend[1])legend[1].innerHTML='<i class="mounted"></i>Смонтировано по отчётам';
 }
 function apply(){
  const card=document.querySelector(".ood-comparison");if(!card||card.matches(".ir-supply-chart"))return;
  patchLabels(card);
  const stats=card.querySelector(".ood-stats");if(!stats||card.querySelector(".ood-donut-summary"))return;
  const values=[...stats.querySelectorAll(":scope > div b")].map(x=>x.textContent.trim());if(values.length<3)return;
  const delivered=num(values[0]),mounted=num(values[1]),unit=unitOf(values[0]),remaining=Math.max(0,delivered-mounted),over=Math.max(0,mounted-delivered);
  const ratio=delivered>0?Math.max(0,Math.min(1,mounted/delivered)):0,C=2*Math.PI*42,green=C*ratio;
  const wrap=document.createElement("div");wrap.className="ood-donut-summary";
  wrap.innerHTML=`<div class="ood-donut-visual"><svg viewBox="0 0 160 160" role="img" aria-label="Поставлено ${esc(fmt(delivered))} ${esc(unit)}, смонтировано ${esc(fmt(mounted))} ${esc(unit)}, остаток ${esc(fmt(remaining))} ${esc(unit)}"><circle class="ood-donut-outer" cx="80" cy="80" r="58"></circle><circle class="ood-donut-rest" cx="80" cy="80" r="42"></circle><circle class="ood-donut-mounted" cx="80" cy="80" r="42" stroke-dasharray="${green.toFixed(2)} ${(C-green).toFixed(2)}"></circle></svg><div class="ood-donut-center"><span>Поставлено</span><b>${esc(fmt(delivered))}</b><small>${esc(unit)}</small></div></div><div class="ood-donut-info"><div class="ood-donut-row delivered"><i></i><span>Поставлено по накладным</span><b>${esc(fmt(delivered))} ${esc(unit)}</b></div><div class="ood-donut-row mounted"><i></i><span>Смонтировано по отчётам</span><b>${esc(fmt(mounted))} ${esc(unit)}</b></div><div class="ood-donut-row remaining"><i></i><span>Остаток на площадке</span><b>${esc(fmt(remaining))} ${esc(unit)}</b></div>${over>0?`<div class="ood-donut-warning">Смонтировано больше, чем поставлено по накладным, на <b>${esc(fmt(over))} ${esc(unit)}</b>. Проверь данные поставок.</div>`:""}</div>`;
  stats.replaceWith(wrap);
 }
 let lastHash="";setInterval(()=>{const h=location.hash;if(h!==lastHash)lastHash=h;apply()},180);window.addEventListener("hashchange",()=>setTimeout(apply,80));setTimeout(apply,120);
})();

;

/* #40: src/object-overview-admin-analysis.js */
"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const money=v=>Math.round(num(v)).toLocaleString("ru-RU")+" тг";
 const mins=v=>{const m=String(v||"").match(/^(\d{1,2}):(\d{2})$/);return m?(Number(m[1])*60+Number(m[2])):0};
 const hours=(a,b)=>{const x=mins(a),y=mins(b);return y>x?(y-x)/60:0};
 const fmtHours=v=>String(Math.round(num(v)*100)/100).replace(".",",")+" ч";
 const objectId=()=>{const m=(location.hash||"").match(/^#?\/objects\/object\/(\d+)$/);return m?m[1]:""};
 const record=r=>({id:r.id,...(r.data||r)});
 const actedLabels={
  wind:"Ветер",
  power:"Отключение электроэнергии",
  readiness:"Отсутствие стройготовности",
  low_temp:"Низкая температура",
  high_temp:"Повышенная температура",
  precipitation:"Сильные осадки",
  other:"Другая причина"
 };
 const palette=["#2f91cc","#d76969","#d8a13b","#6f72c9","#43a67a","#8e6db0","#7f929f","#c57b3f"];
 const donutStyle=items=>{
  const total=items.reduce((s,x)=>s+x.value,0);
  if(total<=0)return"background:conic-gradient(#e8edf1 0 100%)";
  let at=0;const parts=items.map((x,i)=>{const start=at,end=at+(x.value/total*100);at=end;return`${palette[i%palette.length]} ${start.toFixed(3)}% ${end.toFixed(3)}%`});
  return`background:conic-gradient(${parts.join(",")})`;
 };
 const actedCard=rows=>{
  const all=rows.map(record),days=new Set(all.map(x=>String(x.date||"").slice(0,10)).filter(Boolean)).size,totalHours=all.reduce((s,x)=>s+hours(x.time_from,x.time_to),0),map=new Map();
  for(const r of all){const key=String(r.reason||"other"),label=key==="other"?(String(r.reason_other||"").trim()||actedLabels.other):(actedLabels[key]||key||"Другая причина");if(!map.has(label))map.set(label,{label,count:0,hours:0});const x=map.get(label);x.count++;x.hours+=hours(r.time_from,r.time_to)}
  const items=[...map.values()].sort((a,b)=>b.count-a.count).map(x=>({...x,value:x.count}));
  const total=all.length||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"случай":"случ."} · ${fmtHours(x.hours)}</span></div><strong>${Math.round(x.count/total*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Актированных дней пока нет</div>';
  return`<section class="ooa-card ooa-acted"><div class="ooa-head"><div><h2>Актированные дни</h2><p>Анализ причин остановки работ</p></div><button type="button" data-ooa-open="acted-days">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${days}</b><span>дней</span></div></div><div class="ooa-mini-stats"><span>Записей <b>${all.length}</b></span><span>Время <b>${fmtHours(totalHours)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 const penaltyCard=rows=>{
  const all=rows.map(record),totalAmount=all.reduce((s,x)=>s+num(x.amount),0),map=new Map();
  for(const r of all){const label=String(r.reason||"Без причины").trim()||"Без причины",key=label.toLowerCase().replace(/\s+/g," ");if(!map.has(key))map.set(key,{label,count:0,amount:0});const x=map.get(key);x.count++;x.amount+=num(r.amount)}
  const items=[...map.values()].sort((a,b)=>b.amount-a.amount||b.count-a.count).map(x=>({...x,value:x.amount>0?x.amount:x.count}));
  const divisor=totalAmount||items.reduce((s,x)=>s+x.count,0)||1,legend=items.length?items.map((x,i)=>`<div class="ooa-legend-row"><i style="background:${palette[i%palette.length]}"></i><div><b>${esc(x.label)}</b><span>${x.count} ${x.count===1?"штраф":"штрафа/ов"} · ${money(x.amount)}</span></div><strong>${Math.round((totalAmount>0?x.amount:x.count)/divisor*100)}%</strong></div>`).join(""):'<div class="ooa-empty-list">Штрафов пока нет</div>';
  return`<section class="ooa-card ooa-penalties"><div class="ooa-head"><div><h2>Штрафы</h2><p>Анализ причин по сумме штрафов</p></div><button type="button" data-ooa-open="penalties">Открыть раздел</button></div><div class="ooa-body"><div class="ooa-donut-wrap"><div class="ooa-donut" style="${donutStyle(items)}"><div><b>${all.length}</b><span>штрафов</span></div></div><div class="ooa-mini-stats penalty"><span>Общая сумма <b>${money(totalAmount)}</b></span></div></div><div class="ooa-legend">${legend}</div></div></section>`;
 };
 async function renderOnce(){
  const oid=objectId();if(!oid)return true;
  const app=document.getElementById("app"),dashboard=app?.querySelector(".object-overview-dashboard");if(!app||!dashboard)return false;
  app.querySelector(".object-overview-admin-analysis")?.remove();
  const root=irProject.data.forObject(oid),[acted,penalties]=await Promise.all([root.section("acted-days").list().catch(()=>[]),root.section("penalties").list().catch(()=>[])]);
  if(objectId()!==String(oid))return true;
  const wrap=document.createElement("div");wrap.className="object-overview-admin-analysis";wrap.innerHTML=actedCard(acted)+penaltyCard(penalties);
  const anchor=app.querySelector(".object-overview-deliveries-wrap")||app.querySelector(".object-overview-reports")||dashboard;
  anchor.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("[data-ooa-open]").forEach(b=>b.onclick=()=>location.hash=`/objects/object/${oid}/${b.dataset.ooaOpen}`);
  return true;
 }
 let token=0;
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview acted/penalties",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,120)}
 window.addEventListener("hashchange",schedule);
 schedule();
})();
;

;
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
   const workerRows=arr(d.workers).length?arr(d.workers):arr(d.people);
   const responsibleRows=arr(d.responsible).length?arr(d.responsible):arr(d.responsibles);
   workers+=workerRows.reduce((s,x)=>s+num(x?.count??x?.qty),0);
   responsible+=responsibleRows.reduce((s,x)=>{
    const count=num(x?.count??x?.qty);
    return s+(count>0?count:(String(x?.name||x?.role||"").trim()?1:0));
   },0);
   equipment+=arr(d.equipment).reduce((s,x)=>s+num(x?.count??x?.qty),0);
  }
  // The displayed total must equal the sum of the separately rounded
  // category averages; rounding the raw combined total can show 7 vs 6 + 2.
  const avg=v=>Math.ceil(v/n),averageWorkers=avg(workers),averageResponsible=avg(responsible);
  return{people:averageWorkers+averageResponsible,workers:averageWorkers,responsible:averageResponsible,equipment:avg(equipment),days:n};
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
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
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
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(workLabel(w.name,"delivery"))}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
  const positionRow=x=>`<div class="delivery-position-row" data-initial-mark="${esc(x?.mark_id||"")}"><label class="dp-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="dp-code">Шифр<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="dp-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="dp-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label class="dp-volume">Объём<input name="volume" readonly value="${esc(x?.volume??x?.total_volume??"")}" placeholder="0"></label><label class="dp-unit">Ед.<input name="unit" readonly value="${esc(x?.unit||"")}" placeholder="—"></label><button type="button" class="delivery-position-remove row-remove" title="Удалить позицию">×</button></div>`;
  const composition=r=>{const items=deliveryItems(r);if(!items.length)return'<span class="delivery-composition-empty">Позиции не указаны</span>';const map=new Map();for(const x of items){const key=[x.work_type_id||x.work_type||"",x.project_code||""].join("|");if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}const groups=[...map.values()];return `<div class="delivery-composition">${groups.slice(0,2).map(g=>`<div><b>${esc(workLabel(g.name,"delivery"))}</b><span>${esc(g.code||"Шифр не указан")} · ${g.count} поз.</span></div>`).join("")}${groups.length>2?`<small>+ ещё ${groups.length-2}</small>`:""}</div>`};
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
   const tableRows=items.length?items.map(x=>`<tr><td><b>${esc(workLabel(x.work_type||"Работа","delivery"))}</b></td><td>${esc(x.project_code||"—")}</td><td><b>${esc(x.mark||"—")}</b>${x.name?`<small>${esc(x.name)}</small>`:""}</td><td>${fmt(x.qty??x.count)}</td><td><b>${fmt(x.volume??x.total_volume)} ${esc(x.unit||"")}</b></td></tr>`).join(""):'<tr><td colspan="5" class="delivery-detail-empty">Позиции по маркам не указаны</td></tr>';
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
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
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
   const cell=row.querySelector(".delivery-row-composition");if(cell){const groups=workGroups(r,serviceIds);cell.innerHTML=`<span>Наименование работы · Шифр · Позиций</span>${groups.length?`<div class="delivery-composition">${groups.map(g=>`<div><b>${esc(workLabel(g.name,"delivery"))}</b><span>${esc(g.code||"Шифр не указан")} · ${g.count} поз.</span></div>`).join("")}</div>`:'<span class="delivery-composition-empty">Позиции не указаны</span>'}`}
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
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(workLabel(w.name,"delivery"))}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
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

;
/* #51: src/object-card-actions.js */
"use strict";
(()=>{
  function enhance(){
    document.querySelectorAll(".object-card[data-object]").forEach(card=>{
      if(card.querySelector(".object-card-actions"))return;
      const id=card.dataset.object;
      const info=card.querySelector(".object-info");
      if(!info)return;
      const actions=document.createElement("div");
      actions.className="object-card-actions";
      actions.innerHTML='<button type="button" class="object-card-edit">✎ Редактировать</button><button type="button" class="object-card-delete">Удалить</button>';
      actions.addEventListener("click",e=>e.stopPropagation());
      actions.querySelector(".object-card-edit").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        if(typeof window.openObjectForm==="function")await window.openObjectForm(id);
      };
      actions.querySelector(".object-card-delete").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        const api=window.irProject?.data?.objects||window.irProject?.objects;
        if(!api)return;
        const object=await api.get(id);
        if(!object)return;
        if(!confirm(`Удалить объект «${object.name}»?\n\nВсе данные этого объекта будут удалены.`))return;
        await api.remove(id);
        card.remove();
        location.reload();
      };
      card.appendChild(actions);
    });
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();

;

/* #52: src/profile-ui.js */
"use strict";
(()=>{
 const names={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"};
 const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 function sectionFromHash(){const m=location.hash.match(/^#\/objects\/object\/\d+\/([^/]+)$/);return m?m[1]:null}
 function editable(){const r=irAccess.role();if(r==="admin")return true;if(r==="guest")return false;const section=sectionFromHash();return section?irAccess.canEdit(section):false}
 function apply(){document.querySelectorAll("[data-access-lock]").forEach(x=>x.removeAttribute("data-access-lock"));const role=irAccess.role(),can=editable();document.querySelectorAll("#add,#photoButton,#bannerButton,[data-toggle]").forEach(el=>{if(role!=="admin"){el.disabled=true;el.setAttribute("data-access-lock","1")}});if(!can&&sectionFromHash())document.querySelectorAll("button").forEach(el=>{if(!el.classList.contains("back")&&!el.closest(".profile-panel")&&!el.closest(".login-dialog")){el.disabled=true;el.setAttribute("data-access-lock","1")}});const badge=document.getElementById("profileBadge");if(badge)badge.textContent=names[role];const settings=document.getElementById("engineerSettings");if(settings)settings.hidden=role!=="admin";const select=document.getElementById("roleSelect");if(select)select.value=role;}
 function passwordDialog(role){return new Promise(resolve=>{const d=document.createElement("dialog");d.className="login-dialog";d.innerHTML=`<form method="dialog" style="min-width:340px"><h2 style="margin-top:0">Вход: ${names[role]}</h2><p>Введите пароль для продолжения.</p><input id="rolePassword" type="password" autocomplete="current-password" placeholder="Пароль" style="box-sizing:border-box;width:100%;padding:10px 12px;margin:8px 0 6px"><div id="loginError" style="min-height:20px;color:#b42318;font-size:13px"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" id="loginCancel">Отмена</button><button type="submit" id="loginSubmit">Войти</button></div></form>`;document.body.appendChild(d);const input=d.querySelector("#rolePassword"),err=d.querySelector("#loginError"),cancel=d.querySelector("#loginCancel"),form=d.querySelector("form");let finished=false;const done=v=>{if(finished)return;finished=true;try{d.close()}catch{}d.remove();resolve(v)};cancel.onclick=()=>done(false);d.addEventListener("cancel",e=>{e.preventDefault();done(false)});form.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";let ok=false;try{ok=await irProject.access.login(role,input.value)}catch{err.textContent="Не удалось проверить пароль.";return}if(!ok){err.textContent="Неверный пароль.";input.select();return}done(true)});d.showModal();setTimeout(()=>input.focus(),0)})}
 async function switchRole(next){const current=irAccess.role();if(next===current)return true;if(next==="guest"){irAccess.logout?irAccess.logout():irAccess.setRole("guest");apply();return true}if(next!=="admin"&&next!=="engineer")return false;const ok=await passwordDialog(next);if(!ok){apply();return false}irAccess.setRole(next);apply();return true}
 // A single read-only "About" dialog for both standalone windows and the
 // tab host: the settings menu is moved into the host document when bridged.
 async function aboutDialog(settingsMenu){
  const doc=settingsMenu.ownerDocument;
  if(doc.querySelector(".ir-about-dialog"))return;
  const dialog=doc.createElement("dialog");
  dialog.className="ir-about-dialog";
  dialog.setAttribute("aria-labelledby","irAboutTitle");
  dialog.innerHTML='<div class="ir-about-head">'+
   '<span class="ir-about-icon" aria-hidden="true">i</span>'+
   '<div><h2 id="irAboutTitle">О программе</h2><p>IR Project</p></div>'+
   '<button type="button" class="ir-about-close" aria-label="Закрыть">×</button></div>'+
   '<div class="ir-about-info">'+
   '<div class="ir-about-line"><span>Авторское право</span>'+
   '<strong>© 2026 IR Project. Все права защищены.</strong></div>'+
   '<div class="ir-about-line"><span>Версия программы</span>'+
   '<strong class="ir-about-version">Определяется…</strong></div></div>'+
   '<div class="ir-about-footer"><button type="button" class="ir-about-done">Закрыть</button></div>';
  doc.body.appendChild(dialog);
  const close=()=>dialog.close();
  dialog.querySelector(".ir-about-close").onclick=close;
  dialog.querySelector(".ir-about-done").onclick=close;
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  dialog.showModal();
  try{
   const version=await irProject.updater.version();
   if(dialog.isConnected)
    dialog.querySelector(".ir-about-version").textContent=String(version||"Не определена")
  }catch(_error){
   if(dialog.isConnected)dialog.querySelector(".ir-about-version").textContent="Не определена"
  }
 }
 function panel(){
  const old=document.querySelector(".profile-panel");if(old)old.remove();
  const p=document.createElement("div");p.className="profile-panel";
  const gear='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4l.7 2.4a8 8 0 0 1 2.1 1.2l2.4-.6 2 3.5-1.7 1.8a8 8 0 0 1 0 2.4l1.7 1.8-2 3.5-2.4-.6a8 8 0 0 1-2.1 1.2L14 22h-4l-.7-2.4a8 8 0 0 1-2.1-1.2l-2.4.6-2-3.5 1.7-1.8a8 8 0 0 1 0-2.4L2.8 9.5l2-3.5 2.4.6a8 8 0 0 1 2.1-1.2L10 2Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const menuIcon=shape=>'<span class="program-settings-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shape+'</svg></span>';
  const companyIcon=menuIcon('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M7 7V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3M3 12h18M10 12v2h4v-2"/>');
  const aboutIcon=menuIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>');
  const refreshIcon=menuIcon('<path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 20v-5h-5"/>');
  const backupIcon=menuIcon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v7c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12v7c0 1.66 4.03 3 9 3s9-1.34 9-3v-7"/>');
  p.innerHTML='<button type="button" id="profileBadge" class="profile-badge">'+names[irAccess.role()]+'</button>'+
   '<button type="button" id="programSettingsButton" class="program-settings-button" title="Настройки программы" aria-label="Настройки программы" aria-expanded="false">'+gear+'</button>'+
   '<div id="programSettingsMenu" class="program-settings-menu" hidden role="group" aria-label="Настройки программы">'+
   '<div class="program-settings-menu-head"><div class="program-settings-menu-title">Настройки</div><small>IR Project</small></div>'+
   '<div class="program-settings-menu-items">'+
   '<button type="button" id="companyProfileSettings" class="program-settings-item">'+companyIcon+'<span class="program-settings-item-text"><strong>Профиль компании</strong><small>Реквизиты и логотип</small></span></button>'+
   '<button type="button" id="programExportDatabase" class="program-settings-item" title="Выбрать папку для сохранения файла базы данных">'+backupIcon+'<span class="program-settings-item-text"><strong>Выгрузить базу данных</strong><small>Выбрать папку и сохранить .db</small></span></button>'+
   '<button type="button" id="programAboutButton" class="program-settings-item">'+aboutIcon+'<span class="program-settings-item-text"><strong>О программе</strong><small>Авторские права и версия</small></span></button>'+
   '<div class="program-settings-divider" role="separator"></div>'+
   '<button type="button" id="programCheckUpdates" class="program-settings-item program-settings-update">'+refreshIcon+'<span class="program-settings-item-text"><strong>Проверить обновления</strong><small>Найти новую версию</small></span></button>'+
   '</div></div>'+
   '<div id="profileMenu" class="profile-menu" hidden><label>Профиль<select id="roleSelect"><option value="guest">Гость</option><option value="admin">Администратор</option><option value="engineer">Инженер ПТО</option></select></label><button id="engineerSettings" hidden>Доступ инженера</button></div>';
  document.body.appendChild(p);
  const badge=p.querySelector("#profileBadge"),menu=p.querySelector("#profileMenu"),
   select=p.querySelector("#roleSelect"),settings=p.querySelector("#engineerSettings"),
   settingsButton=p.querySelector("#programSettingsButton"),settingsMenu=p.querySelector("#programSettingsMenu"),
   companyButton=p.querySelector("#companyProfileSettings"),aboutButton=p.querySelector("#programAboutButton"),
   backupButton=p.querySelector("#programExportDatabase"),updateButton=p.querySelector("#programCheckUpdates");
  // A moved profile panel lives in the tab host, while its page remains in
  // an iframe. Pointer events do not cross iframe boundaries, so observe both.
  const settingsDismissDocs=new Set();
  const closeSettings=()=>{
   settingsMenu.hidden=true;settingsButton.setAttribute("aria-expanded","false");
   settingsButton.classList.remove("is-open");
   for(const doc of settingsDismissDocs){
    doc.removeEventListener("pointerdown",onSettingsOutside,true);
    doc.removeEventListener("keydown",onSettingsEscape,true)
   }
   settingsDismissDocs.clear()
  };
  const onSettingsOutside=event=>{
   if(settingsMenu.hidden)return;
   if(settingsMenu.contains(event.target)||settingsButton.contains(event.target))return;
   closeSettings()
  };
  const onSettingsEscape=event=>{
   if(event.key==="Escape"&&!settingsMenu.hidden)closeSettings()
  };
  const watchSettingsDismiss=()=>{
   for(const doc of [document,settingsMenu.ownerDocument]){
    if(!doc||settingsDismissDocs.has(doc))continue;
    doc.addEventListener("pointerdown",onSettingsOutside,true);
    doc.addEventListener("keydown",onSettingsEscape,true);
    settingsDismissDocs.add(doc)
   }
  };
  // The tab bar clips absolute-positioned dropdowns. Position a fixed menu
  // against the real gear button using the owning document's viewport.
  const positionSettings=()=>{
   const doc=settingsMenu.ownerDocument;
   if(!settingsButton.closest(".tabs-profile-slot")){
    settingsMenu.style.left="";settingsMenu.style.top="";settingsMenu.style.right="";settingsMenu.style.bottom="";
    return
   }
   const rect=settingsButton.getBoundingClientRect();
   const viewport=doc.defaultView?.innerWidth||doc.documentElement.clientWidth;
   const width=286,gap=8;
   settingsMenu.style.left=Math.max(gap,Math.min(Math.round(rect.right-width),viewport-width-gap))+"px";
   settingsMenu.style.top=Math.round(rect.bottom+8)+"px";
   settingsMenu.style.right="auto";settingsMenu.style.bottom="auto"
  };
  select.value=irAccess.role();
  badge.onclick=()=>{closeSettings();menu.hidden=!menu.hidden};
  settingsButton.onclick=()=>{
   if(!settingsMenu.hidden){closeSettings();return}
   menu.hidden=true;settingsMenu.hidden=false;
   settingsButton.setAttribute("aria-expanded","true");
   settingsButton.classList.add("is-open");
   positionSettings();
   watchSettingsDismiss()
  };
  settingsMenu.ownerDocument.defaultView?.addEventListener("resize",()=>{
   if(!settingsMenu.hidden)positionSettings()
  });
  select.onchange=async()=>{const requested=select.value;select.value=irAccess.role();menu.hidden=true;await switchRole(requested);select.value=irAccess.role()};
  settings.onclick=()=>permissions();
  aboutButton.onclick=()=>{
   closeSettings();
   void aboutDialog(settingsMenu)
  };
  // Use the existing native Save dialog: the user selects both destination
  // folder and .db filename. No database schema or updater code changes.
  let exportingDatabase=false;
  backupButton.onclick=async()=>{
   if(exportingDatabase)return;
   closeSettings();
   if(irAccess.role()!=="admin"){
    alert("Выгрузка базы данных доступна только администратору.");
    return
   }
   if(typeof irProject.backup?.create!=="function"){
    alert("Выгрузка базы данных недоступна. Перезапустите IR Project.");
    return
   }
   exportingDatabase=true;backupButton.disabled=true;
   try{
    const saved=await irProject.backup.create();
    if(saved===true){
     const message="База данных успешно выгружена в выбранную папку.";
     if(typeof irProjectNotice==="function")irProjectNotice(message,"success");
     else alert(message)
    }
    // false means the user cancelled the Save dialog; no message needed.
   }catch(error){
    alert("Не удалось выгрузить базу данных: "+String(error?.message||error))
   }finally{
    exportingDatabase=false;backupButton.disabled=false
   }
  };
  updateButton.onclick=()=>{
   closeSettings();
   try{
    const host=window.parent!==window?window.parent:window;
    if(typeof host.irTabUpdates?.open==="function"){host.irTabUpdates.open();return}
   }catch(error){console.warn("Settings update dialog:",error)}
   if(typeof showUpdate==="function"){showUpdate();return}
   alert("Проверка обновлений недоступна в этом окне IR Project.");
  };
  companyButton.onclick=async()=>{
   closeSettings();
   if(irAccess.role()!=="admin"){alert("Профиль компании может изменять только администратор.");return}
   const open=window.irCompanyProfile?.open;
   if(typeof open!=="function"){alert("Редактор профиля компании временно недоступен.");return}
   await open();
  };
  apply()
 }
 function permissions(){if(irAccess.role()!=="admin"){alert("Настройки доступа изменяет только администратор.");return}const current=irAccess.engineer();const d=document.createElement("dialog");d.className="permissions-dialog";d.innerHTML=`<h2>Доступ инженера ПТО</h2><p>Отметьте разделы, которые инженер ПТО может изменять. Остальные доступны только для просмотра.</p><div class="permission-list">${irAccess.KEYS.map(k=>`<label><input type="checkbox" data-perm="${k}" ${current[k]?"checked":""}>${sectionNames[k]}</label>`).join("")}</div><div class="actions"><button id="permClose">Готово</button></div>`;document.body.appendChild(d);d.querySelectorAll("[data-perm]").forEach(x=>x.onchange=()=>irAccess.setEngineer(x.dataset.perm,x.checked));d.querySelector("#permClose").onclick=()=>{d.close();d.remove()};d.showModal()}
 const observer=new MutationObserver(()=>apply());observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(apply,0));panel();apply();
})();

;

/* #53: src/company-profile.js */
"use strict";
(()=>{
let profile={name:"",logo:""},profileLoaded=false,brandPaintSerial=0;
const esc=v=>String(v||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function load(){try{profile=await irProject.company.get()||profile;if(profile.logo&&irProject.images?.optimize){const old=profile.logo,optimized=await irProject.images.optimize(old,"logo");if(optimized&&optimized!==old){profile=await irProject.company.save({...profile,logo:optimized});if(irProject.images.remove)await irProject.images.remove(old)}}}catch(e){console.warn("Company profile:",e)}finally{profileLoaded=true;await paintBrand(true)}}
async function paintBrand(force=false){
 if(!profileLoaded)return;
 const brand=document.querySelector(".brand");
 if(!brand||(!force&&(brand.dataset.companyReady==="1"||brand.dataset.companyLoading==="1")))return;
 const serial=++brandPaintSerial;
 brand.dataset.companyLoading="1";
 let logo="";
 if(profile.logo)try{logo=await irProject.images.read(profile.logo)}catch(error){console.warn("Company logo read:",error)}
 let image=null;
 if(logo){
  const candidate=document.createElement("img");
  candidate.alt=profile.name||"Логотип компании";
  candidate.src=logo;
  try{
   // Wait until the image itself is decoded, not just its IPC read.
   if(typeof candidate.decode==="function")await candidate.decode();
   else if(!candidate.complete)await new Promise((resolve,reject)=>{
    candidate.onload=resolve;candidate.onerror=reject;
   });
   if(candidate.naturalWidth>0)image=candidate;
  }catch(error){console.warn("Company logo decode:",error)}
 }
 // Ignore a stale async result when the route changes or a new logo is saved.
 if(serial!==brandPaintSerial||!brand.isConnected||document.querySelector(".brand")!==brand)return;
 if(image){
  const mark=document.createElement("div");
  mark.className="brand-mark company-logo";
  mark.appendChild(image);
  brand.classList.add("brand-logo-only");
  brand.replaceChildren(mark);
 }else{
  brand.classList.remove("brand-logo-only");
  brand.innerHTML=`<div class="brand-mark company-logo">IR</div><div><strong>${esc(profile.name||"IR Project")}</strong><span>Управление строительными объектами</span></div>`;
 }
 brand.style.cursor="pointer";
 brand.title="На главную страницу";
 brand.setAttribute("role","link");
 brand.tabIndex=0;
 brand.onclick=()=>{location.hash="/objects"};
 brand.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();location.hash="/objects"}};
 brand.dataset.companyReady="1";
 delete brand.dataset.companyLoading;
 brand.removeAttribute("aria-label");
}
async function open(){if(window.irAccess?.role?.()!=="admin"){alert("Настройки профиля компании доступны только администратору.");return}let d=document.getElementById("companyDialog");if(!d){d=document.createElement("dialog");d.id="companyDialog";d.className="company-dialog";document.body.appendChild(d)}const originalLogo=profile.logo||"";let pendingLogo=originalLogo,pendingOwned="",logoUrl="";if(pendingLogo)try{logoUrl=await irProject.images.read(pendingLogo)}catch{};const discard=async()=>{if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=""};const draw=()=>{d.innerHTML=`<form id="companyForm"><div class="form-heading"><div><h2>Профиль компании</h2><p class="form-subtitle">Фирменные данные для IR Project и документов</p></div><button type="button" class="dialog-x" id="companyClose">×</button></div><div class="company-profile-body"><div class="company-logo-editor" id="companyLogoPreview">${logoUrl?`<img src="${logoUrl}" alt="Логотип">`:`<span>Логотип не выбран</span>`}</div><div class="company-fields"><label>Название компании<input id="companyName" value="${esc(profile.name)}" placeholder="Например, ТОО «А-Темир Строй»" required></label><div><button type="button" class="ghost-btn" id="companyLogoButton">${logoUrl?"Заменить логотип":"Выбрать логотип"}</button><p class="company-hint"><strong>Рекомендуемый размер: 360×120 px.</strong><br>PNG, JPG или WEBP. В IR Project сохраняется только оптимизированная версия логотипа.</p></div></div></div><div class="actions"><button type="button" id="companyCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form>`;const close=async()=>{await discard();d.close()};d.querySelector("#companyClose").onclick=d.querySelector("#companyCancel").onclick=close;d.querySelector("#companyLogoButton").onclick=async()=>{const x=await irProject.company.selectLogo();if(!x)return;if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=x;pendingLogo=x;logoUrl=await irProject.images.read(x);draw()};d.querySelector("#companyForm").onsubmit=async e=>{e.preventDefault();profile=await irProject.company.save({name:d.querySelector("#companyName").value,logo:pendingLogo});if(originalLogo&&originalLogo!==pendingLogo)try{await irProject.images.remove(originalLogo)}catch{}pendingOwned="";d.close();paintBrand(true);window.dispatchEvent(new Event("ir-company-profile-updated"));try{localStorage.setItem("ir-company-profile-updated",String(Date.now()))}catch{}}};draw();d.showModal()}
window.irCompanyProfile={open};
window.addEventListener("storage",async e=>{if(e.key!=="ir-company-profile-updated")return;try{profile=await irProject.company.get()||profile;profileLoaded=true;await paintBrand(true);window.dispatchEvent(new Event("ir-company-profile-updated"))}catch(error){console.warn("Company profile refresh:",error)}});
const root=document.getElementById("app");if(root)new MutationObserver(()=>paintBrand()).observe(root,{childList:true,subtree:true});load();
})();
;

/* #54: src/object-filters.js */
"use strict";
(()=>{
  let lastSignature="";
  async function enhance(){
    const section=document.querySelector(".objects-section"),grid=section?.querySelector(".objects"),head=section?.querySelector(".section-head");
    if(!section||!grid||!head||head.dataset.filtersReady)return;
    head.dataset.filtersReady="1";
    const addButton=head.querySelector("#add");
    if(addButton&&window.irAccess?.role?.()==="guest")addButton.remove();
    const cards=[...grid.querySelectorAll(".object-card")];
    const meta=cards.map(card=>({card,id:card.dataset.object,status:card.querySelector(".status")?.textContent.trim()||"В работе"}));
    const left=head.querySelector("div");
    if(left){left.innerHTML='<div class="object-filter-tabs"><button class="object-filter active" data-filter="all">Все</button><button class="object-filter" data-filter="active">В работе</button><button class="object-filter" data-filter="done">Завершен</button></div><p class="object-count"></p>'}
    const apply=filter=>{
      let shown=0;
      meta.forEach(x=>{const visible=filter==="all"||(filter==="active"&&x.status!=="Завершен")||(filter==="done"&&x.status==="Завершен");x.card.hidden=!visible;if(visible)shown++});
      head.querySelectorAll(".object-filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
      const count=head.querySelector(".object-count");if(count)count.textContent=`Показано объектов: ${shown}`;
    };
    head.querySelectorAll(".object-filter").forEach(b=>b.onclick=()=>apply(b.dataset.filter));
    apply("all");
  }
  setInterval(()=>{const sig=location.hash+":"+(document.querySelector(".objects")?.childElementCount||0)+":"+(window.irAccess?.role?.()||"");if(sig!==lastSignature){lastSignature=sig;enhance().catch(console.error)}},300);
})();

;

/* #55: src/route-indicator.js */
"use strict";
(()=>{
 function routeLabel(){
  const route=(location.hash.slice(1)||"/objects").replace(/^\//,"");
  return route.replace(/\/object\/(\d+)/,"/id$1");
 }
 function update(){let el=document.getElementById("routeIndicator");if(!el){el=document.createElement("div");el.id="routeIndicator";el.className="route-indicator";document.body.appendChild(el)}el.textContent=routeLabel()}
 window.addEventListener("hashchange",update);update();
})();

;

/* #56: src/titlebar.js */
"use strict";
(async()=>{try{const v=await irProject.updater.version(),el=document.getElementById("titlebarVersion");if(el)el.textContent="("+v+")"}catch{}})();
const updateBtn=document.getElementById("titlebarUpdate");if(updateBtn)updateBtn.onclick=async()=>{
 const b=document.getElementById("checkUpdate");if(b){b.click();return}
 const dialog=document.getElementById("updateDialog");if(dialog&&typeof showUpdate==="function"){showUpdate();return}
 updateBtn.disabled=true;
 try{
  const r=await irProject.updater.check(),remote=r&&r.updateInfo&&r.updateInfo.version,current=await irProject.updater.version();
  if(!remote||remote===current){alert("У вас установлена последняя версия IR Project "+current+".");return}
  if(!confirm("Доступна версия "+remote+". Обновить IR Project?"))return;
  await irProject.updater.download();await irProject.updater.install();
 }catch(e){alert("Не удалось проверить обновление: "+(e&&e.message?e.message:e))}
 finally{updateBtn.disabled=false}
};
;

/* #57: src/object-shell.js */
"use strict";
(()=>{
const root=document.getElementById("app");if(!root)return;
const names={reports:"Ежедневные отчёты","extra-works":"Доп. работы","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
const iconPaths={
overview:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
reports:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6M9 19h4"/>',
"extra-works":'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h4m-4 4h8m-5-4 1.5 1.5L17 9"/>',
"work-types":'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
marks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
deliveries:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3"/>',
photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
scheme:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/>',
"acted-days":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2.5 2.5L16 12"/>',
penalties:'<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
finance:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M16 14h2"/>'};
const svg=(key,cls="")=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]||'<circle cx="12" cy="12" r="7"/>'}</svg>`;
const simpleSvg=(kind,cls="")=>kind==="back"?`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`:`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;
let sidebar=null,currentObjectId="",navSerial=0;
const routeInfo=()=>{const r=(location.hash.slice(1)||"/objects").split(/[?#]/)[0];const m=r.match(/^\/objects\/object\/(\d+)(?:\/([^/]+))?/);return m?{id:m[1],key:m[2]||"overview"}:null};
function cleanupLegacyShell(){const shell=root.querySelector(":scope > .ir-object-shell");if(!shell)return;const main=shell.querySelector(":scope > .ir-object-main");const nodes=main?[...main.childNodes]:[];root.replaceChildren(...nodes)}
function makeButton(label,key,disabled,onClick){const b=document.createElement("button");b.type="button";b.dataset.key=key;b.disabled=!!disabled;const i=document.createElement("span");i.className="nav-icon";i.innerHTML=svg(key);const t=document.createElement("span");t.className="nav-label";t.textContent=label;b.append(i,t);if(!disabled)b.onclick=onClick;return b}
function ensureSidebar(){if(sidebar&&document.body.contains(sidebar))return sidebar;sidebar=document.createElement("aside");sidebar.className="ir-object-sidebar-fixed";sidebar.innerHTML=`<button class="ir-object-brand" type="button" title="На главную страницу" aria-label="На главную страницу"><span>IR Project</span></button><button class="ir-object-all" type="button"><span class="menu-icon">${simpleSvg("back")}</span><b>Все объекты</b></button><nav class="ir-object-nav"></nav><button class="ir-object-top" type="button"><span class="menu-icon round">${simpleSvg("up")}</span><b>Наверх</b></button>`;sidebar.querySelector(".ir-object-brand").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-all").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-top").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});document.body.appendChild(sidebar);paintBrand();return sidebar}
async function paintBrand(){const aside=sidebar;if(!aside)return;const host=aside.querySelector(".ir-object-brand");if(!host)return;try{const p=await irProject.company.get()||{};if(aside!==sidebar)return;if(p.logo){const u=await irProject.images.read(p.logo);if(u){const im=document.createElement("img");im.src=u;im.alt=p.name||"Логотип компании";host.replaceChildren(im);return}}const s=document.createElement("span");s.textContent=p.name||"IR Project";host.replaceChildren(s)}catch{if(aside!==sidebar)return;const s=document.createElement("span");s.textContent="IR Project";host.replaceChildren(s)}}
function setActive(key){if(!sidebar)return;sidebar.querySelectorAll(".ir-object-nav button").forEach(b=>b.classList.toggle("active",b.dataset.key===key))}
async function buildNav(info){const aside=ensureSidebar(),nav=aside.querySelector(".ir-object-nav"),token=++navSerial;nav.replaceChildren();nav.append(makeButton("Обзор","overview",false,()=>location.hash=`/objects/object/${info.id}`));let sections=[],schemeVisible=false;try{sections=await irProject.data.sections.get(info.id)||[]}catch{}try{const wt=await irProject.data.forObject(info.id).section("work-types").list();schemeVisible=Array.isArray(wt)&&wt.some(r=>r?.data?.scheme_enabled===true)}catch{}if(token!==navSerial||aside!==sidebar||currentObjectId!==info.id)return;for(const s of sections){const key=s.section_key;if(key==="scheme"&&!schemeVisible)continue;const label=names[key]||s.title||key;nav.append(makeButton(label,key,!s.enabled,()=>location.hash=`/objects/object/${info.id}/${encodeURIComponent(key)}`));if(key==="reports")nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`))}if(!sections.some(s=>s.section_key==="reports"))nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`));setActive(info.key)}
function routeClasses(info){document.body.classList.toggle("ir-object-route",!!info);document.body.classList.toggle("ir-object-overview",!!info&&info.key==="overview")}
function leaveObject(){routeClasses(null);currentObjectId="";navSerial++;if(sidebar){sidebar.remove();sidebar=null}}
function apply(){cleanupLegacyShell();const info=routeInfo();if(!info){leaveObject();return}routeClasses(info);ensureSidebar();if(currentObjectId!==info.id){currentObjectId=info.id;buildNav(info)}else setActive(info.key)}
window.addEventListener("ir-company-profile-updated",()=>{if(sidebar)paintBrand()});window.addEventListener("hashchange",apply);window.addEventListener("ir-work-types-changed",e=>{const id=String(e?.detail?.objectId||"");if(id&&id===currentObjectId){const info=routeInfo();if(info)buildNav(info)}});apply();
})();

;

/* #58: src/select-ui.js */
"use strict";
window.irSelectUI=(()=>{
 const openState={api:null};
 const isSelect=x=>x&&x.tagName==="SELECT"&&!x.multiple;
 const optionText=o=>String(o?.textContent||"").trim();
 const close=api=>{
  if(!api)return;
  api.menu.hidden=true;
  api.wrap.classList.remove("open");
  api.trigger.setAttribute("aria-expanded","false");
  if(openState.api===api)openState.api=null;
 };
 const closeOpen=()=>close(openState.api);
 const place=api=>{
  if(!api||api.menu.hidden||!api.trigger.isConnected)return;
  const r=api.trigger.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,gap=6,pad=8;
  const width=Math.max(180,r.width),below=vh-r.bottom-gap-pad,above=r.top-gap-pad;
  const want=Math.min(280,Math.max(120,api.menu.scrollHeight||180));
  const up=below<want&&above>below;
  const maxH=Math.max(90,Math.min(280,up?above:below));
  const left=Math.max(pad,Math.min(r.left,vw-width-pad));
  api.menu.style.width=width+"px";
  api.menu.style.maxHeight=maxH+"px";
  api.menu.style.left=left+"px";
  api.menu.style.top=up?Math.max(pad,r.top-gap-maxH)+"px":Math.min(vh-pad,r.bottom+gap)+"px";
  api.menu.classList.toggle("open-up",up);
 };
 const renderMenu=api=>{
  const select=api.select;
  api.menu.innerHTML=[...select.options].map((o,i)=>`<button type="button" data-index="${i}" class="${o.selected?"selected":""}${o.dataset.exhausted==="1"?" exhausted":""}" ${o.disabled?"disabled":""}><span>${optionText(o)}</span>${o.selected?'<i>✓</i>':""}</button>`).join("");
 };
 const refresh=api=>{
  const s=api.select,o=s.options[s.selectedIndex];
  api.trigger.querySelector("span").textContent=optionText(o)||"Выберите";
  api.trigger.disabled=Boolean(s.disabled);
  api.wrap.classList.toggle("disabled",Boolean(s.disabled));
  if(!api.menu.hidden){renderMenu(api);requestAnimationFrame(()=>place(api))}
 };
 const open=api=>{
  if(api.select.disabled)return;
  if(openState.api&&openState.api!==api)close(openState.api);
  renderMenu(api);
  api.menu.hidden=false;
  api.wrap.classList.add("open");
  api.trigger.setAttribute("aria-expanded","true");
  openState.api=api;
  requestAnimationFrame(()=>place(api));
 };
 const enhance=select=>{
  if(!isSelect(select)||select.classList.contains("ir-global-native")||select.classList.contains("ir-pretty-native")||select.dataset.nativeSelect==="1")return;
  select.classList.add("ir-global-native");
  const wrap=document.createElement("div");wrap.className="ir-global-select";
  const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-global-select-trigger";trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");trigger.innerHTML="<span></span><i></i>";
  wrap.appendChild(trigger);select.insertAdjacentElement("afterend",wrap);
  const host=select.closest("dialog")||document.body,menu=document.createElement("div");menu.className="ir-global-select-menu";menu.setAttribute("role","listbox");menu.hidden=true;host.appendChild(menu);
  const api={select,wrap,trigger,menu,refresh:null,close:null};api.refresh=()=>refresh(api);api.close=()=>close(api);select._irSelectUI=api;
  trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?open(api):close(api)};
  trigger.onkeydown=e=>{
   if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){e.preventDefault();if(menu.hidden)open(api);const enabled=[...menu.querySelectorAll("button:not(:disabled)")];if(!enabled.length)return;const active=document.activeElement,at=enabled.indexOf(active),next=e.key==="ArrowUp"?Math.max(0,at<=0?enabled.length-1:at-1):Math.min(enabled.length-1,at<0?0:at+1);enabled[next]?.focus()}
   if(e.key==="Escape"){e.preventDefault();close(api);trigger.focus()}
  };
  menu.onclick=e=>{
   const b=e.target.closest("button[data-index]");if(!b||b.disabled)return;
   e.preventDefault();e.stopPropagation();
   const idx=Number(b.dataset.index),opt=select.options[idx];if(!opt)return;
   select.selectedIndex=idx;
   select.dispatchEvent(new Event("input",{bubbles:true}));
   select.dispatchEvent(new Event("change",{bubbles:true}));
   refresh(api);close(api);trigger.focus();
  };
  menu.onkeydown=e=>{
   const enabled=[...menu.querySelectorAll("button:not(:disabled)")],at=enabled.indexOf(document.activeElement);
   if(e.key==="ArrowDown"){e.preventDefault();enabled[Math.min(enabled.length-1,at+1)]?.focus()}
   if(e.key==="ArrowUp"){e.preventDefault();enabled[Math.max(0,at-1)]?.focus()}
   if(e.key==="Escape"){e.preventDefault();close(api);trigger.focus()}
   if(e.key==="Enter"||e.key===" "){const b=document.activeElement;if(b?.matches?.("button[data-index]")){e.preventDefault();b.click()}}
  };
  select.addEventListener("change",()=>refresh(api));
  select.addEventListener("invalid",()=>{wrap.classList.add("invalid");setTimeout(()=>wrap.classList.remove("invalid"),1400)});
  const mo=new MutationObserver(()=>refresh(api));mo.observe(select,{attributes:true,childList:true,subtree:true,characterData:true});
  refresh(api);
 };
 const scan=root=>{
  if(!root)return;
  if(isSelect(root))enhance(root);
  root.querySelectorAll?.("select").forEach(enhance);
 };
 const refreshAll=root=>(root||document).querySelectorAll?.("select.ir-global-native").forEach(s=>s._irSelectUI?.refresh());
 document.addEventListener("mousedown",e=>{const api=openState.api;if(api&&!api.wrap.contains(e.target)&&!api.menu.contains(e.target))close(api)},true);
 document.addEventListener("change",e=>{if(isSelect(e.target))e.target._irSelectUI?.refresh()},true);
 window.addEventListener("resize",()=>place(openState.api));
 window.addEventListener("scroll",()=>place(openState.api),true);
 const observer=new MutationObserver(muts=>{
  for(const m of muts){
   if(m.type==="childList")m.addedNodes.forEach(n=>n.nodeType===1&&scan(n));
   if(m.type==="attributes"&&m.target.tagName==="DIALOG"&&m.target.hasAttribute("open"))requestAnimationFrame(()=>refreshAll(m.target));
  }
 });
 const start=()=>{scan(document);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]})};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
 return{scan,refreshAll,closeOpen};
})();
;

/* #59: src/scheme-building-view.js */
"use strict";
/*
 * Unified building 3D viewer for IR Project.
 * All construction members are derived exclusively from existing scheme records.
 * The faint roof and outline are visual guides, never persisted as building marks.
 * 2D canvas projection: offline, no dependencies or database access.
 */
window.irBuildingView=(()=>{
 const state={yaw:-.75,pitch:.60,zoom:1,panX:0,panY:0,preset:"iso",grid:true,roof:false,placing:false,mark:"",start:null,end:null,hover:"",selected:"",layersOpen:false,markSearch:"",zigzag:false,chainNext:null,hoverAnchor:null,continuing:false,topZ:"",error:"",busy:false,repeat:false,directColumns:true,bent:false,middle:null,ridgeMode:"center",copySource:null,copyTarget:null,copyHover:null,colorMode:"status",renderMode:"real",hiddenSections:[],sectionKey:"",sectionsOpen:false,findQuery:""};
 let observer=null,paint=null,webgl=null,panelsInitialized=false,animationFrame=0,drawFrame=null,updateVisibleScene=null,updateRecordsScene=null,updateAnnotationsScene=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const pt=(x,y,z)=>({x:Number(x)||0,y:Number(y)||0,z:Number(z)||0});
 const num=v=>Number(v)||0;
 const fmt=n=>Math.round(n).toLocaleString("ru-RU");
 const memberLength=c=>{
  const first=Math.hypot(num(c.geometryType==="bent"?c.mx:c.x2??c.x)-num(c.x),
   num(c.geometryType==="bent"?c.my:c.y2??c.y)-num(c.y),
   num(c.geometryType==="bent"?c.mz:c.z2)-num(c.z0));
  return c.geometryType==="bent"?first+Math.hypot(num(c.x2)-num(c.mx),num(c.y2)-num(c.my),num(c.z2)-num(c.mz)):first;
 };
 // Every distinct mark gets a stable deterministic colour, unaffected by layer
 // filters and placement order. All copies of a mark share one colour.
 const markName=c=>String(c?.mark||c?.mark_name||c?.title||c?.id||"Без марки").trim().toLocaleUpperCase("ru");
 const markColorCache=new Map();
 const markRgb=c=>{
  const key=markName(c),cached=markColorCache.get(key);
  if(cached)return cached;
  let hash=2166136261;
  for(const char of key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619)}
  // Large spread across the spectrum; varied lightness reduces adjacent confusion.
  const hue=((hash>>>0)*.6180339887498949%1)*360,
   saturation=.66+((hash>>>9)%3)*.045,
   lightness=.39+((hash>>>13)%4)*.033;
  const k=n=>(n+hue/30)%12,
   a=saturation*Math.min(lightness,1-lightness),
   channel=n=>lightness-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  const rgb=[channel(0),channel(8),channel(4)];markColorCache.set(key,rgb);return rgb;
 };
 const markCss=c=>"rgb("+markRgb(c).map(x=>Math.round(x*255)).join(",")+")";

 // One fixed color per construction type (not per mark number).
 const types=[
  ["columns","Колонны",[.16,.44,.83]],["beams","Балки",[.15,.63,.40]],
  ["fahwerk","Фахверки",[.57,.34,.82]],["girders","Ригели",[.87,.52,.17]],
  ["purlins","Прогоны",[.12,.67,.72]],["spacers","Распорки",[.74,.35,.24]],
  ["ties","Связи",[.39,.47,.61]],["posts","Стойки",[.68,.64,.20]],
  ["trusses","Фермы",[.79,.29,.51]],["guards","Ограждения",[.46,.56,.66]],
  ["stairs","Лестницы",[.65,.48,.34]],["platforms","Площадки",[.55,.60,.72]],
  ["other","Прочее",[.55,.61,.66]]
 ];
 const typeMap=new Map(types.map(([k,label,rgb])=>[k,{label,rgb}]));
 const typeKey=c=>{
  const key=String(c?.scheme_group||c?.schemeGroup||c?.groupKey||"").trim().toLowerCase();
  if(typeMap.has(key))return key;
  const name=[c?.scheme_group_label,c?.mark_name,c?.name,c?.work_type,
   key.startsWith("name:")?key.slice(5):""].filter(Boolean).join(" ").toLowerCase().replace(/ё/g,"е");
  for(const [rx,k] of [[/фахвер/,"fahwerk"],[/колон/,"columns"],[/связ/,"ties"],
   [/прогон/,"purlins"],[/распорк/,"spacers"],[/балк/,"beams"],
   [/ферм/,"trusses"],[/ригел/,"girders"],[/огражд/,"guards"],
   [/лестниц/,"stairs"],[/площад/,"platforms"],[/стойк/,"posts"]])if(rx.test(name))return k;
  const g=String(c?.geometryType||c?.geometry_type||"").toLowerCase();
  return g==="column"?"columns":g==="brace"?"ties":g==="truss"?"trusses":
   ["beam","bent"].includes(g)?"beams":"other";
 };
 const typeRgb=c=>typeMap.get(typeKey(c)).rgb;
 const typeCss=c=>"rgb("+typeRgb(c).map(x=>Math.round(x*255)).join(",")+")";
 const paletteCss=rgb=>"rgb("+rgb.map(x=>Math.round(x*255)).join(",")+")";
 const dist=(q,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(q.x-(a.x+dx*t),q.y-(a.y+dy*t))};

 // Offline WebGL renderer; real 3D prisms, depth testing and per-face lighting.
 // The 2D canvas above it remains a precise picking/placement/annotation layer.
 function makeWebGL(surface){
  if(window.irSteelRenderer)return window.irSteelRenderer(surface,state,{markRgb,typeRgb,typeKey,pt});
  const gl=surface.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false,depth:true});
  if(!gl)return null;
  const shader=(type,source)=>{
   const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
   if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){gl.deleteShader(item);return null}
   return item;
  };
  const vertex=shader(gl.VERTEX_SHADER,
   "attribute vec3 aPosition;attribute vec3 aColor;varying vec3 vColor;void main(){gl_Position=vec4(aPosition,1.0);vColor=aColor;}");
  const fragment=shader(gl.FRAGMENT_SHADER,
   "precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.0);}");
  if(!vertex||!fragment)return null;
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return null}
  const buffer=gl.createBuffer(),position=gl.getAttribLocation(program,"aPosition"),color=gl.getAttribLocation(program,"aColor");
  // Cuboid corners are constant until a scheme record changes. Keep them
  // across camera frames instead of recalculating six faces on every drag.
  let boxCache=new WeakMap();
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d)};
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(v,s)=>v.map(x=>x*s);
  const palette={
   mounted:[.13,.62,.47],partial:[.82,.60,.28],planned:[.78,.42,.47],
   selected:[.12,.45,.95],hover:[.12,.68,.93]
  };
  function render(segments,projection,viewWidth,viewHeight,dpr){
   const width=Math.max(1,Math.round(viewWidth*dpr)),height=Math.max(1,Math.round(viewHeight*dpr));
   if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height}
   gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const data=[],extent=Math.max(40,...segments.map(s=>Math.abs(projection.raw(s.start).depth)),...segments.map(s=>Math.abs(projection.raw(s.end).depth)))*1.65;
   const push=(v,rgb)=>{const p=projection.project(pt(...v));data.push(2*p.x/viewWidth-1,1-2*p.y/viewHeight,-clamp(p.depth/extent,-.95,.95),...rgb)};
   const quad=(corners,rgb,factor)=>{
    const shade=rgb.map((v,i)=>clamp(v*factor+(i===2?.014:0),0,1));
    for(const i of [0,1,2,0,2,3])push(corners[i],shade);
   };
   for(const part of segments){
    const c=part.c,side=part.part||0;
    let cached=boxCache.get(c);
    if(!cached){cached=[];boxCache.set(c,cached)}
    let faces=cached[side];
    if(!faces){
     const a=[part.start.x,part.start.y,part.start.z],b=[part.end.x,part.end.y,part.end.z],
      vector=sub(b,a),len=Math.hypot(...vector);if(len<.5)continue;
     const direction=unit(vector),ref=Math.abs(direction[2])>.78?[0,1,0]:[0,0,1],
      right=unit(cross(direction,ref)),up=unit(cross(direction,right)),
      widthMm=c.geometryType==="column"?180:c.geometryType==="brace"?78:c.geometryType==="truss"?145:115,
      breadth=widthMm*.73,
      outset=[add(mul(right,widthMm),mul(up,breadth)),add(mul(right,-widthMm),mul(up,breadth)),
        add(mul(right,-widthMm),mul(up,-breadth)),add(mul(right,widthMm),mul(up,-breadth))];
     faces=[outset.map(v=>add(a,v)),outset.map(v=>add(b,v))];
     cached[side]=faces;
    }
    const [cornersA,cornersB]=faces,
     rgb=String(c.id)===String(state.selected)?palette.selected:
       String(c.id)===String(state.hover)?palette.hover:
       state.colorMode==="mark"?markRgb(c):state.colorMode==="type"?typeRgb(c):palette[c.status]||palette.planned;
    quad([cornersA[0],cornersB[0],cornersB[1],cornersA[1]],rgb,1.17);
    quad([cornersA[1],cornersB[1],cornersB[2],cornersA[2]],rgb,.88);
    quad([cornersA[2],cornersB[2],cornersB[3],cornersA[3]],rgb,.72);
    quad([cornersA[3],cornersB[3],cornersB[0],cornersA[0]],rgb,1.0);
    quad([cornersA[0],cornersA[1],cornersA[2],cornersA[3]],rgb,.81);
    quad([cornersB[3],cornersB[2],cornersB[1],cornersB[0]],rgb,1.28);
   }
   if(!data.length)return;
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
   gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(color);
   gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
   gl.vertexAttribPointer(color,3,gl.FLOAT,false,24,12);
   gl.drawArrays(gl.TRIANGLES,0,data.length/6);
  }
  return{render,invalidate(){boxCache=new WeakMap()},dispose(){
   gl.deleteBuffer(buffer);gl.deleteProgram(program);
   // A new route creates a new surface; release its old GPU context.
   gl.getExtension("WEBGL_lose_context")?.loseContext();
  }};
 }

 function render(host,props){
  state.copySource=null;state.copyTarget=null;state.copyHover=null;
  updateVisibleScene=null;updateRecordsScene=null;updateAnnotationsScene=null;
  if(!panelsInitialized){
   state.layersOpen=window.innerWidth>=1000;
   try{
    const stored=localStorage.getItem("ir-project-3d-colors");
    const v2=localStorage.getItem("ir-project-3d-colors-v2")==="ready";
    // Show the new category colours on first upgrade from the old rainbow mode.
    state.colorMode=v2&&["status","type","mark"].includes(stored)?stored:stored==="status"?"status":"type";
    localStorage.setItem("ir-project-3d-colors",state.colorMode);
    localStorage.setItem("ir-project-3d-colors-v2","ready");
   }catch(_error){state.colorMode="type"}
   panelsInitialized=true
  }
  if(observer){observer.disconnect();observer=null}
  if(animationFrame){window.cancelAnimationFrame(animationFrame);animationFrame=0}
  drawFrame=null;
  if(webgl){webgl.dispose();webgl=null}
  const axesX=props.axesX,axesY=props.axesY,spanX=props.spanX,spanY=props.spanY,
   gridX=props.gridX,gridY=props.gridY,cols=props.elements,marks=props.marks,groups=props.groups;
  let showDimensions=Boolean(props.showDimensions),showMemberLabels=Boolean(props.showLabels);
  const sectionKey="ir-project-3d-sections."+String(props.objectId||"default");
  if(!state.renderModeInitialized){
   try{state.renderMode=localStorage.getItem("ir-project-3d-render-mode")==="simple"?"simple":"real"}catch(_error){state.renderMode="real"}
   state.renderModeInitialized=true
  }
  const sections=[
   ...axesX.slice(0,-1).map((axis,i)=>({
    id:"x:"+axis+":"+axesX[i+1],axis:"X",label:axis+"–"+axesX[i+1],
    center:(num(gridX[axis])+num(gridX[axesX[i+1]]))/2,
    widthMm:Math.abs(num(gridX[axesX[i+1]])-num(gridX[axis])),index:i
   })),
   ...axesY.slice(0,-1).map((axis,i)=>({
    id:"y:"+axis+":"+axesY[i+1],axis:"Y",label:axis+"–"+axesY[i+1],
    center:(num(gridY[axis])+num(gridY[axesY[i+1]]))/2,
    widthMm:Math.abs(num(gridY[axesY[i+1]])-num(gridY[axis])),index:i
   }))
  ];
  if(state.sectionKey!==sectionKey){
   state.sectionKey=sectionKey;state.hiddenSections=[];state.sectionsOpen=false;state.findQuery="";
   try{
    const stored=JSON.parse(localStorage.getItem(sectionKey)||"[]");
    if(Array.isArray(stored))state.hiddenSections=stored.filter(id=>sections.some(a=>a.id===id))
   }catch(_error){}
  }else state.hiddenSections=state.hiddenSections.filter(id=>sections.some(a=>a.id===id));
  const sectionFor=(c,axis)=>{
   const choices=sections.filter(a=>a.axis===axis);
   if(!choices.length)return null;
   const position=axis==="X"?
    c.geometryType==="column"?num(c.x):c.geometryType==="bent"?(num(c.x)+num(c.mx)+num(c.x2))/3:(num(c.x)+num(c.x2))/2:
    c.geometryType==="column"?num(c.y):c.geometryType==="bent"?(num(c.y)+num(c.my)+num(c.y2))/3:(num(c.y)+num(c.y2))/2;
   const coords=axis==="X"?axesX.map(a=>num(gridX[a])):axesY.map(a=>num(gridY[a]));
   // A member on a shared boundary is consistently assigned to one bay.
   const first=choices.find(row=>{
    const lo=Math.min(coords[row.index],coords[row.index+1]),
     hi=Math.max(coords[row.index],coords[row.index+1]);
    return position>=lo-.1&&position<=hi+.1
   });
   return first||choices.reduce((best,row)=>Math.abs(row.center-position)<Math.abs(best.center-position)?row:best,choices[0])
  };
  const visibleMember=c=>!["X","Y"].some(axis=>{
   const band=sectionFor(c,axis);
   return band&&state.hiddenSections.includes(band.id)
  });
  // Bay visibility is stable until a section checkbox changes.
  let visibleKey=null,visibleMembers=null;
  const visibleCols=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(key!==visibleKey||!visibleMembers){visibleKey=key;visibleMembers=cols.filter(visibleMember)}
   return visibleMembers
  };
  const saveSections=()=>{
   try{localStorage.setItem(sectionKey,JSON.stringify(state.hiddenSections))}catch(_error){}
  };
  // Record IDs from the currently painted 3D model. Newly placed members
  // may fall inside a cut bay that was hidden in a previous editing session.
  let knownRecordIds=new Set(cols.map(c=>String(c.id)));
  const markById=id=>marks.find(m=>String(m.id)===String(id));
  const selectedMark=()=>markById(state.mark);
  const leftMark=()=>marks.filter(m=>m.left>0);
  if(!markById(state.mark)||selectedMark()?.left<=0){
   // Keep the chain endpoint when the previous mark is exhausted.
   const next=state.continuing?leftMark().find(m=>m.geometry!=="column"):leftMark()[0];
   if(!next){state.placing=false;state.zigzag=false;state.start=null;state.end=null;state.continuing=false}
   state.mark=next?.id||"";
  }
  const cutWidthText=mm=>Number(mm.toFixed(3)).toLocaleString("ru-RU",{maximumFractionDigits:3})+" мм";
  const sectionsMarkup=()=>{
   const rows=axis=>'<div class="irb-cut-axis"><b>'+(axis==="X"?"Между цифровыми осями":"Между буквенными осями")+'</b>'+
    sections.filter(s=>s.axis===axis).map(row=>'<label class="irb-cut-row"><input type="checkbox" data-irb-cut="'+html(row.id)+'" '+
     (state.hiddenSections.includes(row.id)?"":"checked")+'><span class="irb-cut-name">Оси '+html(row.label)+'</span>'+
     '<span class="irb-cut-width" title="Расстояние между осями '+html(row.label)+'">'+cutWidthText(row.widthMm)+'</span></label>').join("")+'</div>';
   return '<details class="irb-cuts" id="irbCuts" '+(state.sectionsOpen?"open":"")+'>'+
    '<summary>Разрезы / участки <small id="irbHiddenCount"></small></summary>'+
    '<p>Справа указана ширина участка между осями в мм. Снимите галочку, чтобы скрыть его конструкции — марки останутся на схеме.</p>'+
    '<div class="irb-cuts-list">'+rows("X")+rows("Y")+'</div>'+
    '<button type="button" id="irbCutsReset">Показать все участки</button>'+
    '<div class="irb-cuts-result" id="irbCutsResult"></div></details>'
  };
  const header='<div class="irb-panel-head"><b>Слои модели</b></div>';
  host.innerHTML='<div class="irb-wrap"><aside class="irb-layers">'+header+
   '<div class="irb-layer-list">'+groups.map(g=>'<button type="button" class="irb-layer '+(g.visible?'active':'')+'" data-irb-layer="'+html(g.key)+'"><i>'+(g.visible?'✓':'')+'</i><b>'+html(g.label)+'</b><small>'+g.count+'</small></button>').join("")+'</div>'+
   sectionsMarkup()+
   '<section class="irb-find" role="search" aria-label="Поиск конструкций в 3D">'+
    '<label class="irb-find-label" for="irbFindMark">Найти конструкцию</label>'+
    '<div class="irb-find-input-wrap">'+
     '<span class="irb-find-icon" aria-hidden="true">⌕</span>'+
     '<input id="irbFindMark" type="search" autocomplete="off" spellcheck="false" placeholder="Марка, например К41" aria-label="Найти конструкцию по марке" value="'+html(state.findQuery)+'">'+
     '<button id="irbFindClear" class="irb-find-clear" type="button" title="Очистить поиск" aria-label="Очистить поиск">×</button>'+
    '</div>'+
    '<div class="irb-find-actions">'+
     '<span id="irbFindCount" class="irb-find-count" role="status" aria-live="polite">Введите марку</span>'+
     '<div class="irb-find-pager">'+
      '<button id="irbFindPrev" type="button" title="Предыдущая конструкция (Shift+Enter)" aria-label="Предыдущая найденная конструкция">‹</button>'+
      '<button id="irbFindNext" type="button" title="Следующая конструкция (Enter)" aria-label="Следующая найденная конструкция">›</button>'+
     '</div>'+
    '</div>'+
    '<small class="irb-find-hint">Enter — далее · Shift+Enter — назад</small>'+
   '</section>'+
   '<div class="irb-panel-head"><b>Цвет конструкций</b></div>'+
   '<div class="irb-color-modes" role="group" aria-label="Раскраска 3D-модели">'+
    '<button type="button" id="irbColorStatus" aria-pressed="true">По статусу</button>'+
    '<button type="button" id="irbColorTypes" aria-pressed="false">По видам</button>'+
     '<button type="button" id="irbColorMarks" aria-pressed="false">По маркам</button>'+
   '</div>'+
   '<div class="irb-color-caption" id="irbColorCaption">Зелёный — смонтировано, красный — не смонтировано, жёлтый — частично.</div>'+
   '<div class="irb-color-legend" id="irbColorLegend" hidden></div>'+
   '<div class="irb-panel-head"><b>Режим 3D</b></div>'+
   '<div class="irb-render-modes" role="group" aria-label="Детализация 3D">'+
    '<button type="button" id="irbRenderSimple">Обычный</button>'+
    '<button type="button" id="irbRenderReal">Реалистичный</button>'+
   '</div>'+
   '<small class="irb-render-note" id="irbRenderNote"></small>'+
   '<div class="irb-panel-head"><b>Отображение</b></div>'+
   '<label class="irb-switch"><input type="checkbox" id="irbGrid" '+(state.grid?'checked':'')+'><span>Сетка осей</span></label>'+
   '<label class="irb-switch"><input type="checkbox" id="irbRoof" '+(state.roof?'checked':'')+'><span>Контур кровли (эскиз)</span></label>'+
   '<div class="irb-info"><b>Управление каркасом</b><span>ЛКМ / один палец — вращение. ПКМ / два пальца — перемещение. Колесо / разведение пальцев — масштаб. Щелчок — выбор марки.</span></div>'+
   '<div class="irb-count"><span>'+html(props.scopeLabel||"На схеме")+'</span><strong id="irbVisibleCount">'+visibleCols().length+'</strong><small>Показано из '+cols.length+' размещённых элементов</small></div>'+
   (props.canEdit?'<button type="button" class="irb-add" id="irbStart" data-ir-label="add-element" title="Добавить элемент" aria-label="Добавить элемент">＋ Добавить элемент</button>':'')+
   '</aside><div class="irb-viewport">'+
   '<canvas id="irbSolid" aria-hidden="true"></canvas><canvas id="irbCanvas" aria-label="Интерактивный 3D-каркас здания"></canvas>'+
   '<div class="irb-view-title"><b>3D-каркас</b><small>Живая модель монтажной схемы · WebGL</small></div>'+
   '<div class="irb-view-modes" id="irbCameraButtons"><button data-irb-camera="iso" type="button">3D</button><button data-irb-camera="top" type="button">Сверху</button><button data-irb-camera="front" type="button">Фасад</button><button data-irb-camera="side" type="button">Сбоку</button></div>'+
   '<div class="irb-tags"><span>● Общая модель здания</span><span>'+fmt(spanX/1000)+' × '+fmt(spanY/1000)+' м · '+axesX.length+' × '+axesY.length+' осей</span></div>'+
   '<label class="irb-camera">Вид <select id="irbView"><option value="iso">Изометрия</option><option value="top">Сверху</option><option value="front">Фасад</option><option value="side">Сбоку</option><option value="free" disabled>Свободный ракурс</option></select></label>'+
   '<div class="irb-hint" id="irbHint"></div>'+
   '<div class="irb-bottom"><div class="irb-legend" id="irbLegend"><i class="green"></i> Смонтировано <i class="red"></i> Не смонтировано <i class="orange"></i> Частично <i class="blue"></i> Выбрано</div>'+
   '<div class="irb-controls"><button type="button" id="irbMinus">−</button><button type="button" id="irbPlus">＋</button><button type="button" id="irbFit">⛶</button></div></div>'+
   '</div><aside class="irb-properties" id="irbProperties"></aside></div>';
  // The panels float over one full-size viewport rather than defining its dimensions.
  const shell=host.querySelector(".irb-wrap"),viewport=host.querySelector(".irb-viewport"),
   layerPanel=host.querySelector(".irb-layers"),detailPanel=host.querySelector(".irb-properties");
  shell.classList.add("irb-immersive");
  viewport.prepend(layerPanel,detailPanel);
  const topControls=document.createElement("div");
  topControls.className="irb-top-actions";
  topControls.innerHTML='<button type="button" id="irbLayerToggle" aria-expanded="'+(state.layersOpen?'true':'false')+'">☷ Слои</button>'+
   '<button type="button" id="irbCutsToggle" title="Скрыть или показать участки каркаса по осям">▤ Разрезы</button>'+
   '<button type="button" id="irbDimensionsToggle" title="Показать размерные линии между осями на 3D-чертёже" aria-pressed="'+String(showDimensions)+'">↔ Размеры</button>'+
   '<button type="button" id="irbLabelsToggle" title="Показать обозначения марок непосредственно на 3D-чертёже" aria-pressed="'+String(showMemberLabels)+'">⌗ Подписи</button>'+
   '<button type="button" id="irbColorToggle" title="Переключить цветовой режим" aria-label="Переключить цветовой режим">◉ Цвет: статус</button>'+
   '<button type="button" id="irbRenderToggle" title="Переключить реалистичный / обычный 3D" aria-label="Режим 3D">⬡ Реалистичный 3D</button>'+
   '';
  viewport.appendChild(topControls);
  if(props.canEdit){
   const addButton=document.createElement("button");
   addButton.type="button";addButton.id="irbQuickAdd";addButton.className="irb-top-add irb-floating-add";
   addButton.textContent="＋ Добавить элемент";addButton.setAttribute("aria-label","Добавить элемент");
   viewport.appendChild(addButton)
  }
  const layerClose=document.createElement("button");layerClose.type="button";
  layerClose.className="irb-pane-close";layerClose.textContent="×";layerClose.title="Скрыть слои";
  layerClose.setAttribute("aria-label","Закрыть панель слоёв");
  layerPanel.prepend(layerClose);
  const updateLayers=()=>{
   layerPanel.hidden=!state.layersOpen;
   topControls.querySelector("#irbLayerToggle")?.setAttribute("aria-expanded",state.layersOpen?"true":"false");
  };
  layerClose.onclick=()=>{state.layersOpen=false;updateLayers();paint()};
  topControls.querySelector("#irbLayerToggle").onclick=()=>{state.layersOpen=!state.layersOpen;updateLayers();paint()};
  updateLayers();detailPanel.hidden=true;
  const el=id=>host.querySelector("#"+id),canvas=el("irbCanvas"),ctx=canvas.getContext("2d");
  const colorSummary=()=>{
   const m=new Map();
   for(const c of visibleCols()){
    const key=markName(c),row=m.get(key);
    if(row)row.count++;else m.set(key,{key,count:1,rgb:markCss(c)});
   }
   return [...m.values()].sort((a,b)=>a.key.localeCompare(b.key,"ru",{numeric:true}));
  };
  const typeSummary=()=>{
   const counts=new Map();
   for(const c of visibleCols()){const k=typeKey(c);counts.set(k,(counts.get(k)||0)+1)}
   return types.filter(([k])=>counts.has(k)).map(([k,label,rgb])=>({label,count:counts.get(k),rgb:paletteCss(rgb)}));
  };
  const showColorMode=()=>{
   const mode=state.colorMode,
    top=el("irbColorToggle"),caption=el("irbColorCaption"),list=el("irbColorLegend"),footer=el("irbLegend");
   for(const [btn,on] of [[el("irbColorStatus"),mode==="status"],[el("irbColorTypes"),mode==="type"],[el("irbColorMarks"),mode==="mark"]]){
    if(btn){btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",String(on))}
   }
   if(top){
    top.textContent=mode==="type"?"◉ Цвет: виды":mode==="mark"?"◉ Цвет: марки":"◉ Цвет: статус";
    top.setAttribute("aria-label",top.textContent+". Нажмите для переключения режима");
   }
   if(caption)caption.textContent=mode==="type"?"Один цвет для всех колонн, другой для балок, фахверков, прогонов и остальных видов.":
    mode==="mark"?"Каждая марка своим цветом. Повторяющиеся марки одного цвета.":
    "Зелёный — смонтировано, красный — не смонтировано, жёлтый — частично.";
   if(list){
    list.hidden=mode==="status";
    if(mode!=="status"){
     const rows=mode==="type"?typeSummary():colorSummary();
     list.innerHTML='<div class="irb-color-legend-title">'+(mode==="type"?"Виды конструкций":"Марки на экране")+' · '+rows.length+'</div>'+
      (rows.length?rows.map(r=>'<div class="irb-color-entry"><i style="background:'+r.rgb+'"></i><span>'+html(r.label||r.key)+'</span><small>'+r.count+' шт.</small></div>').join(""):
      '<div class="irb-color-empty">На текущем участке нет видимых конструкций. Включите нужные слои или разрезы.</div>');
     list.scrollTop=0;
    }else list.replaceChildren();
   }
   if(footer)footer.innerHTML=mode==="type"?'<i class="blue"></i> Выбрано <span>· Цвет по видам конструкций</span>':
    mode==="mark"?'<i class="blue"></i> Выбрано <span>· Цвет по маркам</span>':
    '<i class="green"></i> Смонтировано <i class="red"></i> Не смонтировано <i class="orange"></i> Частично <i class="blue"></i> Выбрано';
  };
  const setColorMode=mode=>{
   if(!["status","type","mark"].includes(mode)||state.colorMode===mode)return;
   state.colorMode=mode;
   try{
    localStorage.setItem("ir-project-3d-colors",mode);
    localStorage.setItem("ir-project-3d-colors-v2","ready");
   }catch(_error){}
   showColorMode();paint();
  };
  el("irbColorStatus").onclick=()=>setColorMode("status");
  el("irbColorTypes").onclick=()=>setColorMode("type");
  el("irbColorMarks").onclick=()=>setColorMode("mark");
  el("irbColorToggle").onclick=()=>setColorMode(state.colorMode==="status"?"type":state.colorMode==="type"?"mark":"status");
  showColorMode();
  if(!ctx){
   el("irbProperties").textContent="3D Canvas недоступен";
   props.onFirstPaintError?.(new Error("3D Canvas недоступен"));return
  }
  webgl=makeWebGL(el("irbSolid"));
  viewport.classList.toggle("irb-webgl",!!webgl);
  if(!webgl){el("irbSolid").hidden=true}
  const showRenderMode=()=>{
   const real=!!webgl&&state.renderMode==="real";
   for(const [id,active] of [["irbRenderSimple",!real],["irbRenderReal",real]]){
    const b=el(id);
    if(b){b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));b.disabled=!webgl}
   }
   const button=el("irbRenderToggle");
   if(button){button.textContent=real?"⬡ Реалистичный 3D":"▤ Обычный 3D";button.setAttribute("aria-pressed",String(real));button.disabled=!webgl}
   const caption=el("irbRenderNote");
   if(caption)caption.textContent=!webgl?"WebGL недоступен — используется упрощённая схема.":
    real?"Двутавры, коробчатые и круглые профили. Размеры по обозначению, если указаны.":
    "Упрощённая геометрия для быстрого размещения конструкций.";
  };
  const setRenderMode=mode=>{
   if(!webgl||!["real","simple"].includes(mode)||mode===state.renderMode)return;
   state.renderMode=mode;
   try{localStorage.setItem("ir-project-3d-render-mode",mode)}catch(_error){}
   showRenderMode();paint()
  };
  el("irbRenderSimple").onclick=()=>setRenderMode("simple");
  el("irbRenderReal").onclick=()=>setRenderMode("real");
  el("irbRenderToggle").onclick=()=>setRenderMode(state.renderMode==="real"?"simple":"real");
  showRenderMode();
  
  const maxZ=Math.max(7000,8400,...cols.map(c=>Math.max(num(c.z0),num(c.z2),c.geometryType==="bent"?num(c.mz):0)),1);
  const projectFactory=()=>{
   const rect=canvas.getBoundingClientRect(),w=Math.max(260,rect.width),h=Math.max(320,rect.height);
    const smallScreen=window.innerWidth<=820,
    insetL=!smallScreen&&state.layersOpen?Math.min(257,w*.25):0,
    insetR=!smallScreen&&(state.selected||state.placing)?Math.min(305,w*.28):0;
    const safeW=Math.max(200,w-insetL-insetR),centerX=insetL+safeW/2;
   const raw=point=>{
    const x=(point.x-spanX/2)/1000,y=(point.y-spanY/2)/1000,z=(point.z-maxZ/2)/1000;
    const co=Math.cos(state.yaw),si=Math.sin(state.yaw),sp=Math.sin(state.pitch),cp=Math.cos(state.pitch),r=x*si+y*co;
    return {x:x*co-y*si,y:r*sp-z*cp,depth:r*cp+z*sp};
   };
   const vertices=[];for(const x of [0,spanX])for(const y of [0,spanY])for(const z of [0,maxZ*1.23])vertices.push(raw(pt(x,y,z)));
   const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),
    minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
   const scale=Math.min((safeW-100)/Math.max(1,maxX-minX),(h-118)/Math.max(1,maxY-minY))*state.zoom;
   const project=point=>{const v=raw(point);return{x:centerX+state.panX+(v.x-(minX+maxX)/2)*scale,y:h/2+state.panY+(v.y-(minY+maxY)/2)*scale,depth:v.depth}};
   return {w,h,raw,project,centerX};
  };
  const pickGeometry=()=>selectedMark()?.geometry==="beam"&&state.bent?"bent":selectedMark()?.geometry||"column";
  const anchorZ=()=>pickGeometry()==="column"?0:maxZ*.94;
  const originAxis=(m,a)=>num(m[a]);
  const anchorPoint=(a,z=a?.z??anchorZ())=>pt(
   Number.isFinite(Number(a?.worldX))?Number(a.worldX):originAxis(gridX,a.x),
   Number.isFinite(Number(a?.worldY))?Number(a.worldY):originAxis(gridY,a.y),z);
  // Independent column-head anchors retain exact X, Y and elevation, even
  // for columns located between grid axes or having different heights.
  let gridAnchorKey=null,gridAnchorCache=null;
  const gridAnchors=()=>{
   const key=pickGeometry();
   if(gridAnchorCache&&gridAnchorKey===key)return gridAnchorCache;
   gridAnchorKey=key;
   gridAnchorCache=axesX.flatMap(x=>axesY.map(y=>({
    kind:"grid",x,y,worldX:originAxis(gridX,x),worldY:originAxis(gridY,y),z:anchorZ(),zConfirmed:key==="column"
   })));
   return gridAnchorCache
  };
  const closest=(axes,map,value)=>axes.reduce((best,a)=>
   Math.abs(originAxis(map,a)-value)<Math.abs(originAxis(map,best)-value)?a:best,axes[0]);
  const centeredRidge=()=>state.bent&&state.ridgeMode==="center";
  const recenterRidge=()=>{
   if(!centeredRidge()||!state.start||!state.end)return;
   const x=Math.round((num(state.start.worldX)+num(state.end.worldX))/2),
    y=Math.round((num(state.start.worldY)+num(state.end.worldY))/2),
    previous=state.middle,initialZ=Math.round((num(state.start.z)+num(state.end.z))/2);
   state.middle={kind:"ground",x:closest(axesX,gridX,x),y:closest(axesY,gridY,y),
    worldX:x,worldY:y,z:previous?num(previous.z):initialZ,
    zConfirmed:previous?.zConfirmed===true,autoCentered:true};
  };
  // Invert the orthographic projection on Z=0: this also allows placing
  // columns between axes, instead of restricting users to grid intersections.
  const groundAt=(x,y,z=0)=>{
   if(Math.abs(Math.sin(state.pitch))<.18)return null; // front/side views are edge-on
   const project=projectFactory().project,o=project(pt(0,0,z)),
    xp=project(pt(1000,0,z)),yp=project(pt(0,1000,z)),
    xx=xp.x-o.x,xy=xp.y-o.y,yx=yp.x-o.x,yy=yp.y-o.y,
    det=xx*yy-yx*xy;
   if(Math.abs(det)<.01)return null;
   const dx=x-o.x,dy=y-o.y,
    worldX=Math.round(1000*(dx*yy-dy*yx)/det),
    worldY=Math.round(1000*(xx*dy-xy*dx)/det);
   if(worldX<0||worldX>spanX||worldY<0||worldY>spanY)return null;
   return{kind:"ground",x:closest(axesX,gridX,worldX),y:closest(axesY,gridY,worldY),
    worldX,worldY,z,zConfirmed:pickGeometry()==="column"};
  };
  const columnOccupied=a=>!!a&&cols.some(c=>c.geometryType==="column"&&
   Math.hypot(num(c.x)-num(a.worldX),num(c.y)-num(a.worldY))<25&&Math.abs(num(c.z0)-num(a.z))<25);
  let memberAnchorKey=null,memberAnchorCache=null,columnAnchorCache=null;
  const updateAttachmentAnchors=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(memberAnchorKey===key&&memberAnchorCache&&columnAnchorCache)return;
   memberAnchorKey=key;
   const visible=visibleCols();
   columnAnchorCache=visible.filter(c=>c.geometryType==="column").map(c=>{
    const x=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x));
    const y=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
    return {kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
     x,y,worldX:num(c.x),worldY:num(c.y),z:num(c.z2),zConfirmed:true,minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
   });
   memberAnchorCache=visible.filter(c=>c.geometryType!=="column").flatMap(c=>
    [{worldX:num(c.x),worldY:num(c.y),z:num(c.z0)},...(c.geometryType==="bent"?[{worldX:num(c.mx),worldY:num(c.my),z:num(c.mz)}]:[]),{worldX:num(c.x2),worldY:num(c.y2),z:num(c.z2)}].map(v=>({
     kind:"member",memberId:String(c.id),label:String(c.mark||"Элемент"),
     x:closest(axesX,gridX,v.worldX),y:closest(axesY,gridY,v.worldY),...v,zConfirmed:true
    }))
   );
  };
  const columnAnchors=()=>{updateAttachmentAnchors();return columnAnchorCache};
  const memberAnchors=()=>{updateAttachmentAnchors();return memberAnchorCache};
  const memberSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=11,hit=null;
   for(const s of memberSegments()){
    if(s.c.geometryType==="column")continue;
    const a=project(s.start),b=project(s.end),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    if(den<20)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/den,0,1),distance=Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
    if(distance>best)continue;
    const px=s.start.x+(s.end.x-s.start.x)*t,py=s.start.y+(s.end.y-s.start.y)*t;
    best=distance;hit={kind:"member",memberId:String(s.c.id),memberPart:s.part,label:String(s.c.mark||"Элемент"),
     x:closest(axesX,gridX,px),y:closest(axesY,gridY,py),worldX:Math.round(px),worldY:Math.round(py),
     z:Math.round(s.start.z+(s.end.z-s.start.z)*t),zConfirmed:true};
   }
   return hit;
  };
  const availableAnchors=()=>pickGeometry()==="column"?gridAnchors():[...gridAnchors(),...columnAnchors(),...memberAnchors()];
  const columnSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=12,hit=null;
   for(const c of visibleCols()){
    if(c.geometryType!=="column")continue;
    const a=project(pt(c.x,c.y,c.z0)),b=project(pt(c.x,c.y,c.z2)),
     dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    if(length2<25)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/length2,0,1),
     distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(distance>best)continue;
    const xAxis=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x)),
     yAxis=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
    best=distance;
    hit={kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
     x:xAxis,y:yAxis,worldX:num(c.x),worldY:num(c.y),
     z:Math.round(num(c.z0)+(num(c.z2)-num(c.z0))*t),zConfirmed:true,
     minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
   }
   return hit;
  };
  // Choose the closest projected member instead of always prioritising a column.
  const segmentHit=(x,y)=>{
   const hits=[columnSegmentHit(x,y),memberSegmentHit(x,y)].filter(Boolean);
   if(hits.length<2)return hits[0]||null;
   const project=projectFactory().project;
   const d=a=>{const p=project(anchorPoint(a));return Math.hypot(p.x-x,p.y-y)};
   return d(hits[0])<=d(hits[1])?hits[0]:hits[1];
  };
  const sameAnchor=(a,b)=>Boolean(a&&b&&Math.hypot(num(a.worldX)-num(b.worldX),num(a.worldY)-num(b.worldY),num(a.z)-num(b.z))<1);
  let segmentsKey=null,segmentsCache=null;
  const memberSegments=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(segmentsCache&&segmentsKey===key)return segmentsCache;
   segmentsKey=key;
   segmentsCache=visibleCols().flatMap(c=>{
    const start=pt(c.x,c.y,c.z0),end=pt(c.geometryType==="column"?c.x:c.x2,c.geometryType==="column"?c.y:c.y2,c.z2);
    if(c.geometryType==="bent"){const mid=pt(c.mx,c.my,c.mz);return[{c,start,end:mid,part:0},{c,start:mid,end,part:1}]}
    return[{c,start,end,part:0}];
   });
   return segmentsCache
  };
  const paintLabel=(p,label,border)=>{ctx.font="700 10px Segoe UI,Arial";const w=Math.max(24,ctx.measureText(label).width+15);ctx.fillStyle="#fff";ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-25,w,20,5);ctx.fill();ctx.stroke();ctx.fillStyle="#24649a";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,p.x,p.y-15)};
  const line=(a,b,color,width=1,dash=[])=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([])};
  const circle=(p,r,color)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()};
  const outline=(m)=>{
   const p=m.project;
   const floor=[p(pt(0,0,0)),p(pt(spanX,0,0)),p(pt(spanX,spanY,0)),p(pt(0,spanY,0))];
   if(state.grid){
    ctx.fillStyle="rgba(217,233,249,.27)";ctx.strokeStyle="rgba(146,182,215,.52)";ctx.lineWidth=1;ctx.beginPath();floor.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fill();ctx.stroke();
    for(const ax of axesX){const x=originAxis(gridX,ax);line(p(pt(x,0,0)),p(pt(x,spanY,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(x,-Math.max(1000,spanY*.03),0)),ax,"#c8d8e8")}
    for(const ay of axesY){const y=originAxis(gridY,ay);line(p(pt(0,y,0)),p(pt(spanX,y,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(-Math.max(1000,spanX*.03),y,0)),ay,"#c8d8e8")}
   }
   if(state.roof){
    const roof=y=>maxZ*.94+Math.min(2200,maxZ*.17)*(1-Math.abs(y-spanY/2)/Math.max(1,spanY/2));
    const rf=(x,y)=>p(pt(x,y,roof(y)));
    for(const y of [0,spanY/2,spanY])line(rf(0,y),rf(spanX,y),"rgba(92,154,203,.48)",1.15,[5,5]);
    for(const ax of axesX){const x=originAxis(gridX,ax);line(rf(x,0),rf(x,spanY/2),"rgba(107,156,200,.37)",1,[4,6]);line(rf(x,spanY/2),rf(x,spanY),"rgba(107,156,200,.37)",1,[4,6])}
    for(const x of [0,spanX])for(const y of [0,spanY])line(p(pt(x,y,0)),rf(x,y),"rgba(104,155,200,.28)",1,[5,6]);
   }
  };
  // Draw actual bay dimensions in model-space, projected with the live 3D
  // camera. A separate dimension chain for each axis follows rotation/zoom.
  const paintGridDimensions=m=>{
   const lineColor="#3178a6",textColor="#205b80";
   const xOffset=Math.max(550,spanX*.025),yOffset=Math.max(550,spanY*.025);
   const formatSpan=value=>Number(value.toFixed(3)).toLocaleString("ru-RU",{maximumFractionDigits:3})+" мм";
   const annotate=(begin,end,span)=>{
    const a=m.project(begin),b=m.project(end),length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length<10)return;
    const normal={x:-(b.y-a.y)/length,y:(b.x-a.x)/length};
    line(a,b,"rgba(255,255,255,.93)",4.5);
    line(a,b,lineColor,1.35);
    for(const q of [a,b])line({x:q.x-normal.x*4,y:q.y-normal.y*4},
     {x:q.x+normal.x*4,y:q.y+normal.y*4},lineColor,1.35);
    const label=formatSpan(span),midX=(a.x+b.x)/2,midY=(a.y+b.y)/2;
    ctx.font="700 10px Segoe UI,Arial";
    const width=Math.max(35,ctx.measureText(label).width+10);
    // Skip overlapping labels on distant zoom levels; ticks remain visible.
    if(length<width+5)return;
    const x=midX-width/2,y=midY-10;
    ctx.fillStyle="rgba(255,255,255,.95)";
    ctx.strokeStyle="rgba(49,120,166,.45)";ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x,y,width,18,4);ctx.fill();ctx.stroke();
    ctx.fillStyle=textColor;ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.fillText(label,midX,midY-1);
   };
   for(let i=0;i<axesX.length-1;i++){
    const start=originAxis(gridX,axesX[i]),end=originAxis(gridX,axesX[i+1]);
    for(const x of [start,end])line(m.project(pt(x,spanY,0)),
      m.project(pt(x,spanY+yOffset,0)),"rgba(57,115,153,.35)",.9);
    annotate(pt(start,spanY+yOffset,0),pt(end,spanY+yOffset,0),Math.abs(end-start));
   }
   for(let i=0;i<axesY.length-1;i++){
    const start=originAxis(gridY,axesY[i]),end=originAxis(gridY,axesY[i+1]);
    for(const y of [start,end])line(m.project(pt(0,y,0)),
      m.project(pt(-xOffset,y,0)),"rgba(57,115,153,.35)",.9);
    annotate(pt(-xOffset,start,0),pt(-xOffset,end,0),Math.abs(end-start));
   }
  };
  let projectedSegments=[];
  paint=()=>{
   const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
   const dpr=Math.min(1.5,window.devicePixelRatio||1),w=Math.floor(rect.width*dpr),h=Math.floor(rect.height*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.lineJoin="round";ctx.lineCap="round";
   const m=projectFactory();outline(m);
   if(showDimensions)paintGridDimensions(m);
   const segments=memberSegments().map(s=>({...s,a:m.project(s.start),b:m.project(s.end),depth:(m.raw(s.start).depth+m.raw(s.end).depth)/2}));
   if(!webgl)segments.sort((a,b)=>a.depth-b.depth);
   projectedSegments=segments;
   if(webgl)webgl.render(memberSegments(),m,rect.width,rect.height,dpr);
   let memberLabels=0;
   for(const s of segments){
    const chosen=String(s.c.id)===String(state.selected),hover=String(s.c.id)===String(state.hover),
     color=chosen?"#2879df":hover?"#168fca":state.colorMode==="mark"?markCss(s.c):state.colorMode==="type"?typeCss(s.c):
      s.c.status==="mounted"?"#2e9b7b":s.c.status==="partial"?"#c4a051":"#c16670";
    const width=s.c.geometryType==="column"?7:s.c.geometryType==="truss"?6:s.c.geometryType==="brace"?3.7:4.8;
    if(!webgl){
     line(s.a,s.b,"rgba(35,63,87,.25)",width+2);line(s.a,s.b,color,width);
     line({x:s.a.x-1.15,y:s.a.y-1.15},{x:s.b.x-1.15,y:s.b.y-1.15},"rgba(255,255,255,.5)",Math.max(1,width*.25));
    }
    if(!webgl&&s.c.geometryType==="truss"){
     const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,len=Math.max(1,Math.hypot(dx,dy)),ox=-dy/len*6,oy=dx/len*6;
     line({x:s.a.x+ox,y:s.a.y+oy},{x:s.b.x+ox,y:s.b.y+oy},color,2.5);
     const steps=Math.max(2,Math.min(9,Math.round(len/35)));
     for(let i=0;i<steps;i++)line({x:s.a.x+dx*i/steps,y:s.a.y+dy*i/steps},{x:s.a.x+dx*(i+1)/steps+ox*(i%2),y:s.a.y+dy*(i+1)/steps+oy*(i%2)},color,1.2);
    }
    if(s.part===0&&(chosen||showMemberLabels&&memberLabels<140)){
     const at={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2};
     if(chosen||(at.x>28&&at.x<m.w-28&&at.y>28&&at.y<m.h-28)){
      paintLabel(at,String(s.c.mark||"?"),chosen?"#2c85e9":"#c7d9e9");
      if(!chosen)memberLabels++;
     }
    }
   }
   // An upright projects to a point in top view. Draw an architectural
   // footprint for every visible column and post, even in realistic WebGL.
   if(state.preset==="top"){
    for(const c of visibleCols()){
     if(!isPlanUpright(c))continue;
     const p=m.project(pt(c.x,c.y,c.z0)),chosen=String(c.id)===String(state.selected),
      hover=String(c.id)===String(state.hover),post=typeKey(c)==="posts";
     const base=state.colorMode==="mark"?markCss(c):state.colorMode==="type"?typeCss(c):
      c.status==="mounted"?"#2e9b7b":c.status==="partial"?"#c4a051":"#c16670",
      color=chosen?"#2879df":hover?"#168fca":base,size=chosen?13:post?11:12;
     ctx.save();ctx.fillStyle="rgba(255,255,255,.96)";ctx.strokeStyle=color;ctx.lineWidth=chosen?3:2;
     ctx.beginPath();
     if(post){ctx.arc(p.x,p.y,size/2,0,Math.PI*2);ctx.fill();ctx.stroke()}
     else{ctx.fillRect(p.x-size/2,p.y-size/2,size,size);ctx.strokeRect(p.x-size/2,p.y-size/2,size,size)}
     ctx.fillStyle=color;ctx.fillRect(p.x-2.4,p.y-2.4,4.8,4.8);
     if(chosen){ctx.beginPath();ctx.arc(p.x,p.y,size/2+4,0,Math.PI*2);ctx.stroke()}
     ctx.restore()
    }
   }
    if(state.copySource){
    const src=state.copySource,dst=state.copyHover||state.copyTarget;
    if(dst){
     const dx=dst.x-num(src.x),dy=dst.y-num(src.y),
      start=m.project(pt(dst.x,dst.y,num(src.z0))),
      end=m.project(pt(src.geometryType==="column"?dst.x:num(src.x2)+dx,
       src.geometryType==="column"?dst.y:num(src.y2)+dy,num(src.z2)));
     const points=[start];
     if(src.geometryType==="bent")points.push(m.project(pt(num(src.mx)+dx,num(src.my)+dy,num(src.mz))));
     points.push(end);
     const invalid=Boolean(copyError(src,dst)),color=invalid?"#d54e55":"#ed9a28";
     for(let i=0;i<points.length-1;i++){
      line(points[i],points[i+1],"rgba(255,255,255,.94)",10);
      line(points[i],points[i+1],color,5,[9,5]);
     }
     for(const p of points){circle(p,8,"#fff");circle(p,5.6,color)}
    }
   }
  if(state.placing){
    // Free grid nodes are small; real column heads are prominent blue points.
    for(const a of gridAnchors()){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.middle)||sameAnchor(a,state.end);
     circle(q,selected?5.8:2.7,selected?"#ed9a2b":"rgba(88,143,194,.62)");
    }
    if(pickGeometry()!=="column")for(const a of [...columnAnchors(),...memberAnchors()]){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.middle)||sameAnchor(a,state.end);
     circle(q,selected?8.5:6.2,"#fff");
     circle(q,selected?6.2:4.5,selected?"#ee9a25":"#217ce7");
    }
    if(state.hoverAnchor&&!sameAnchor(state.hoverAnchor,state.start)&&!sameAnchor(state.hoverAnchor,state.middle)&&!sameAnchor(state.hoverAnchor,state.end)){
     const hover=m.project(anchorPoint(state.hoverAnchor));
     circle(hover,7,"#fff");circle(hover,5,"#e89927")
    }
    if(pickGeometry()==="column"&&state.directColumns){
     const anchor=state.hoverAnchor||state.start;
     if(anchor){
      const height=Number(state.topZ),valid=state.topZ!==""&&Number.isFinite(height)&&height>num(anchor.z),
       previewZ=valid?height:maxZ*.94,occupied=columnOccupied(anchor);
      const a=m.project(anchorPoint(anchor)),b=m.project(anchorPoint(anchor,previewZ)),
       color=occupied?"#c94c4c":valid?"#168ee0":"#b68e45";
      line(a,b,"rgba(255,255,255,.88)",10);
      line(a,b,color,6,[9,5]);circle(a,8,"#fff");circle(a,5.5,color);
      ctx.font="800 11px Segoe UI,Arial";ctx.textAlign="left";ctx.textBaseline="middle";
      const text=occupied?"Место занято":valid?String(selectedMark()?.mark||selectedMark()?.title||"Колонна"):"Задайте верх Z";
      const tw=Math.min(180,ctx.measureText(text).width+16),tx=Math.min(m.w-tw-6,Math.max(5,b.x+12)),ty=Math.max(6,Math.min(m.h-26,b.y-12));
      ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillRect(tx,ty,tw,23);
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(tx,ty,tw,23);
      ctx.fillStyle=color;ctx.fillText(text,tx+8,ty+12,tw-12);
     }
    }else if(state.start){
     const a=m.project(anchorPoint(state.start));
     if(pickGeometry()==="bent"){
      const middle=state.middle?m.project(anchorPoint(state.middle)):state.hoverAnchor?m.project(anchorPoint(state.hoverAnchor)):null,
       end=state.end?m.project(anchorPoint(state.end)):state.middle&&state.hoverAnchor?m.project(anchorPoint(state.hoverAnchor)):null;
      if(middle){line(a,middle,"#e5982e",4,[7,4]);circle(middle,5.8,"#e5982e")}
      if(middle&&end){line(middle,end,"#e5982e",4,[7,4]);circle(end,5.8,"#e5982e")}
     }else{
      const b=m.project(pickGeometry()==="column"?anchorPoint(state.start,maxZ*.94):state.end?anchorPoint(state.end):anchorPoint(state.start));
      line(a,b,"#e5982e",4,[7,4]);if(state.end)circle(b,5.8,"#e5982e");
     }
     circle(a,5.8,"#e5982e");
    }
   };
  };
  const isPlanUpright=c=>c.geometryType==="column"||["columns","posts"].includes(typeKey(c))||
   (Math.hypot(num(c.x2)-num(c.x),num(c.y2)-num(c.y))<5&&Math.abs(num(c.z2)-num(c.z0))>50);
  // Batch pointer/zoom/resize requests into a single draw per display frame.
  // The loading overlay closes only after an actual, nonzero-size canvas frame.
  let firstFrameReady=false;
  drawFrame=paint;
  paint=()=>{
   if(animationFrame)return;
   const current=drawFrame;
   animationFrame=window.requestAnimationFrame(()=>{
    animationFrame=0;
    if(drawFrame!==current)return;
    try{
     current();
     if(!firstFrameReady&&canvas.isConnected&&canvas.width>1&&canvas.height>1){
      firstFrameReady=true;
      props.onFirstPaint?.()
     }
    }catch(error){
     if(!firstFrameReady)props.onFirstPaintError?.(error);
     else console.error("Монтажная схема: ошибка отрисовки",error)
    }
   });
  };
  // Fast hover picking uses the projected segments from the last frame.
  const nearestMember=(x,y)=>{
   const point={x,y};let best=null,distance=14;
   if(state.preset==="top"){
    const project=projectFactory().project;
    for(const c of visibleCols()){
     if(!isPlanUpright(c))continue;
     const p=project(pt(c.x,c.y,c.z0)),d=Math.hypot(p.x-x,p.y-y);
     if(d<distance){distance=d;best=c}
    }
    if(best&&distance<=12)return best
   }
   for(const s of projectedSegments){const d=dist(point,s.a,s.b);if(d<distance){distance=d;best=s.c}}
   return best;
  };
  const nearestAxis=(x,y)=>{
   const m=projectFactory();let best=null,minScore=18;
   for(const a of availableAnchors()){
    const q=m.project(anchorPoint(a)),d=Math.hypot(q.x-x,q.y-y);
    if(d>19)continue;
    const score=d-(a.kind==="column"?3:0);
    if(score<minScore){minScore=score;best=a}
   }
   const segment=segmentHit(x,y);
   if(pickGeometry()==="column")return best||groundAt(x,y);
   const snap=segment&&(!best||minScore>5)?segment:best;
   return snap||(pickGeometry()==="bent"?groundAt(x,y,anchorZ()):null)
  };
  const position=a=>a?html((a.kind==="column"||a.kind==="member"?a.label+" · крепление · ":a.kind==="ground"?"Между осями · ":"Ось ")+a.x+" / "+a.y+
   " · X "+fmt(a.worldX)+" · Y "+fmt(a.worldY)+" · Z "+(a.zConfirmed===false?"нужно указать":fmt(a.z)+" мм")+
   (a.kind==="ground"?" · смещение X "+fmt(num(a.worldX)-originAxis(gridX,a.x))+" / Y "+fmt(num(a.worldY)-originAxis(gridY,a.y))+" мм":a.kind==="grid"?" (сетка)":"")):"Выберите точку на модели";
  const searchMatches=m=>!state.markSearch.trim()||String(m.title+" "+(m.mark||"")).toLocaleLowerCase("ru").includes(state.markSearch.trim().toLocaleLowerCase("ru"));
  const markOptions=()=>'<option value="">Выберите марку</option>'+
   marks.filter(searchMatches).map(a=>'<option value="'+html(a.id)+'" '+(a.left>0?"":"disabled")+
   ' '+(a.id===state.mark?"selected":"")+'>'+html(a.title)+' · остаток '+a.left+
   (a.left?"":" · НЕТ ОСТАТКА")+'</option>').join("");
  const matchedCount=()=>marks.filter(searchMatches).length;
  const zEditor=(a,index)=>a?
   '<label class="irb-level">Отметка Z, мм<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-irb-level="'+index+
   '" value="'+(a.zConfirmed===false?"":Math.round(num(a.z)))+'" placeholder="Отметка по КМД" aria-label="Отметка Z в миллиметрах">'+
   '<small class="irb-level-feedback" hidden></small></label>':"";
  let commitQuickPlacement=()=>{};
  const updateHoverInfo=()=>{
   const field=el("irbHoverPosition");if(!field)return;
   field.textContent=state.hoverAnchor?position(state.hoverAnchor):"Наведите курсор на точку установки на каркасе";
   field.classList.toggle("occupied",columnOccupied(state.hoverAnchor));
  };
  const updateHint=()=>{
   if(state.copySource){
    el("irbHint").textContent=state.copyTarget?
     "Копия готова. Нажмите «Вставить копию» справа или выберите другое место.":
     "Копирование: щёлкните по новому месту или укажите оси и смещения справа.";
    return;
   }
   const column=selectedMark()?.geometry==="column";
   const hasHeight=state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>0;
   el("irbHint").textContent=!state.placing?"ЛКМ — вращение · колесо — масштаб · нажатие на элемент — свойства":
    column&&state.directColumns?(!hasHeight?"Сначала задайте «Верх Z, мм» · затем щёлкните по месту колонны":
     "Наведите курсор — появится колонна · щелчок — установить · перетаскивание — вращать"):
    pickGeometry()==="bent"?(centeredRidge()?
     (!state.start?"1. Выберите начало балки":!state.end?"2. Выберите конец балки — конёк X/Y встанет по центру":!state.middle?.zConfirmed?"3. Введите отметку Z конька":"Проверьте отметки Z и сохраните одну марку"):
     (!state.start?"1. Выберите начало балки":!state.middle?"2. Выберите конёк / излом":!state.end?"3. Выберите конец балки":"Проверьте три отметки Z и сохраните одну марку")):
    !state.start?"1. Выберите начальную точку":column||state.end?"Проверьте отметки и нажмите «Сохранить на схеме»":"2. Выберите конечную точку";
  };
  // Use this same translated-outline check for preview and insert button.
  const copyError=(source,destination)=>{
   if(!source||!destination)return "";
   const dx=Number(destination.x)-Number(source.x),dy=Number(destination.y)-Number(source.y);
   if(!Number.isFinite(dx)||!Number.isFinite(dy))return "Введите корректные координаты X/Y.";
   if(Math.hypot(dx,dy)<1)return "Выберите другое место: это положение исходного элемента.";
   const points=[{x:num(source.x),y:num(source.y)}];
   if(source.geometryType==="bent")points.push({x:num(source.mx),y:num(source.my)});
   if(source.geometryType!=="column")points.push({x:num(source.x2),y:num(source.y2)});
   for(const p of points){
    const x=p.x+dx,y=p.y+dy;
    if(x<0||x>spanX||y<0||y>spanY)
     return "Контур выходит за границу сетки: X "+fmt(x)+" / Y "+fmt(y)+" мм.";
   }
   return "";
  };
  function refreshPanel(){
   const m=selectedMark(),left=num(m?.left),column=m?.geometry==="column",available=left>0;
   updateHint();
   const pane=el("irbProperties"),previousScroll=pane.scrollTop,previousMode=pane.dataset.irbPanelMode;
    const readyToSave=()=>!!(state.start&&selectedMark()?.left>0&&(column||state.end)&&state.start.zConfirmed!==false&&
     (column?state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(state.start.z):
      state.end?.zConfirmed!==false&&(pickGeometry()!=="bent"||state.middle&&state.middle.zConfirmed!==false)));
   const ready=readyToSave();
   const current=cols.find(c=>String(c.id)===String(state.selected));
   pane.hidden=!state.placing&&!state.copySource&&!current;
   if(state.copySource){
    const source=state.copySource,quota=props.copyQuota?.(String(source.id))||{left:0},
     destination=state.copyTarget,current=destination||{x:num(source.x),y:num(source.y)},
     positionError=copyError(source,destination),
     xAxis=closest(axesX,gridX,current.x),yAxis=closest(axesY,gridY,current.y),
     xOptions=axesX.map(a=>'<option value="'+html(a)+'" '+(a===xAxis?'selected':'')+'>'+html(a)+'</option>').join(""),
     yOptions=axesY.map(a=>'<option value="'+html(a)+'" '+(a===yAxis?'selected':'')+'>'+html(a)+'</option>').join("");
    pane.innerHTML='<div class="irb-panel-head"><b>Копирование конструкции</b><small>НОВАЯ МАРКА</small></div>'+
     '<div class="irb-selected"><small>Исходный элемент</small><strong>'+html(source.mark||"—")+'</strong><span>'+html(source.mark_name||"")+'</span></div>'+
     '<p class="irb-copy-note">Перенесите копию на другой ряд: выберите новое начало на модели или установите оси и смещения. Длина, направление, профиль, высоты и форма сохраняются. Исходный элемент остаётся.</p>'+
     '<div class="irb-copy-axes"><label>Ось 1–6<select id="irbCopyAxisX">'+xOptions+'</select></label>'+
     '<label>Смещение X, мм<input id="irbCopyOffsetX" type="text" inputmode="decimal" value="'+html(Math.round((current.x-originAxis(gridX,xAxis))*1000)/1000)+'"></label>'+
     '<label>Ось А–Л<select id="irbCopyAxisY">'+yOptions+'</select></label>'+
     '<label>Смещение Y, мм<input id="irbCopyOffsetY" type="text" inputmode="decimal" value="'+html(Math.round((current.y-originAxis(gridY,yAxis))*1000)/1000)+'"></label></div>'+
     '<div class="irb-copy-position'+(positionError?' irb-copy-invalid':'')+'" id="irbCopyPosition">'+(positionError||
      (destination?'Новое начало: X '+fmt(destination.x)+' · Y '+fmt(destination.y)+' мм':
      'Укажите новое положение щелчком на 3D или измените оси / смещения.'))+'</div>'+
     '<small class="irb-copy-shape">Предварительный контур: '+(source.geometryType==="bent"?'3 точки · конёк сохранён':source.geometryType==="column"?'колонна':'начало и конец')+' · Z, длина, профиль и поворот без изменений</small>'+
     '<div class="irb-quota">Остаток по ведомости: <b>'+fmt(quota.left)+' шт.</b></div>'+
     '<div class="irb-form-error" id="irbCopyError" role="alert" hidden></div>'+
     '<button type="button" class="irb-save" id="irbCopySave" '+(!destination||positionError||quota.left<=0||state.busy?'disabled':'')+'>✓ Вставить копию</button>'+
     '<button type="button" class="irb-secondary" id="irbCopyCancel">Отмена</button>';
    const error=el("irbCopyError"),save=el("irbCopySave"),
     controls=["irbCopyAxisX","irbCopyAxisY","irbCopyOffsetX","irbCopyOffsetY"].map(el);
    const inputChanged=()=>{
     const rawX=controls[2].value.trim().replace(/\s/g,"").replace(",","."),rawY=controls[3].value.trim().replace(/\s/g,"").replace(",","."),
      dx=Number(rawX),dy=Number(rawY);
     state.copyTarget=rawX!==""&&rawY!==""&&Number.isFinite(dx)&&Number.isFinite(dy)?
      {x:Math.round((originAxis(gridX,controls[0].value)+dx)*1000)/1000,
       y:Math.round((originAxis(gridY,controls[1].value)+dy)*1000)/1000}:null;
     state.copyHover=null;
     const dest=state.copyTarget;
     const problem=dest?copyError(source,dest):"Введите корректные смещения X/Y.";
     const preview=el("irbCopyPosition");
     preview.textContent=problem||"Новое начало: X "+fmt(dest.x)+" · Y "+fmt(dest.y)+" мм";
     preview.classList.toggle("irb-copy-invalid",Boolean(problem));
     save.disabled=!dest||Boolean(problem)||quota.left<=0||state.busy;
     error.hidden=true;updateHint();paint();
    };
    controls.forEach(input=>input.addEventListener(input.tagName==="SELECT"?"change":"input",inputChanged));
    el("irbCopyCancel").onclick=()=>{state.copySource=null;state.copyTarget=null;state.copyHover=null;refreshPanel();paint()};
    save.onclick=async()=>{
     if(!state.copyTarget||copyError(source,state.copyTarget)||state.busy)return;
     state.busy=true;save.disabled=true;error.hidden=true;
     try{
      const id=await props.onCopyPlacement(String(source.id),{...state.copyTarget});
      state.busy=false;state.copySource=null;state.copyTarget=null;state.copyHover=null;
      props.onCopySaved?.(id);
     }catch(e){
      state.busy=false;save.disabled=Boolean(copyError(source,state.copyTarget));
      error.textContent=String(e?.message||e);error.hidden=false;
      controls[2]?.focus({preventScroll:true});
     }
    };
   }else if(state.placing){
    pane.innerHTML='<div class="irb-panel-head"><b>Размещение элемента</b><small>НОВАЯ МАРКА</small></div>'+
    '<label class="irb-field">Поиск марки<input type="search" id="irbMarkSearch" autocomplete="off" spellcheck="false" placeholder="Марка или наименование…" aria-label="Поиск марки для размещения" value="'+html(state.markSearch)+'"></label>'+
    '<label class="irb-field">Марка из ведомости<select id="irbMark">'+markOptions()+'</select><small>Найдено: '+matchedCount()+' из '+marks.length+'</small></label>'+
    '<div class="irb-placement-type"><span>Тип выбранной марки</span><b>'+html(column?"Колонна / стойка":m?.geometry==="brace"?"Связь / раскос":m?.geometry==="truss"?"Ферма":"Балка / ригель / прогон")+'</b>'+
     (!column?'<small>Для установки колонн щелчком выберите марку из категории «Колонны», «Фахверки» или «Стойки».</small>':"")+'</div>'+
    (m?.geometry==="beam"?'<label class="irb-zigzag"><input id="irbBentMode" type="checkbox" '+(state.bent?"checked":"")+'><span><b>Ломаная балка (3 точки)</b><small>Два наклонных участка — одна отправочная марка.</small></span></label>':"")+
    (pickGeometry()==="bent"?'<div class="irb-ridge-mode"><b>Положение конька</b>'+
     '<label><input type="radio" name="irbRidgeMode" value="center" '+(centeredRidge()?"checked":"")+'> По центру (автоматически X/Y)</label>'+
     '<label><input type="radio" name="irbRidgeMode" value="manual" '+(!centeredRidge()?"checked":"")+'> Вручную (три точки на каркасе)</label>'+
     '<small>В режиме «По центру» выбирайте начало и конец, а отметку Z конька задайте ниже. Случайные смещения от клика не применяются.</small></div>':"")+
    '<div class="irb-quota">По ведомости: '+num(m?.total)+' шт.<br>На схеме: '+num(m?.placed)+' шт.<br><b>Осталось: '+left+' шт.</b></div>'+
    (column?'<div class="irb-direct-info"><b>Установка колонн на каркасе</b><span>Укажите верх Z по КМД. Затем наведите мышь на модель: появится контур колонны. Один щелчок размещает её на выбранной точке, в том числе между осями.</span></div>'+
    '<label class="irb-click-toggle"><input type="checkbox" id="irbClickPlace" '+(state.directColumns?"checked":"")+'><span>Устанавливать колонны щелчком</span></label>'+
    '<div class="irb-hover-position" id="irbHoverPosition"></div>':"")+
    '<div class="irb-anchor"><b>1. Начало</b><span>'+position(state.start)+'</span>'+zEditor(state.start,"start")+'</div>'+
    (pickGeometry()==="bent"?'<div class="irb-anchor"><b>'+(centeredRidge()?"Конёк — автоматически между началом и концом":"2. Конёк / излом")+'</b><span>'+position(state.middle)+'</span>'+zEditor(state.middle,"middle")+
     (centeredRidge()?'<small class="irb-ridge-note">X/Y рассчитаны по середине пролёта. Для несимметричной балки переключите режим «Вручную».</small>':"")+'</div>':"")+
    '<div class="irb-anchor"><b>'+(pickGeometry()==="bent"?(centeredRidge()?"2. Конец":"3. Конец"):column?"2. Верх колонны":"2. Конец")+'</b><span>'+(column?"Укажите проектную отметку":position(state.end))+'</span>'+(column?'<label class="irb-level">Верх Z, мм<input type="number" step="1" id="irbTopZ" placeholder="По КМД" value="'+html(state.topZ)+'"></label>':zEditor(state.end,"end"))+'</div>'+
    (typeof props.onQuickPlace==="function"?'<label class="irb-zigzag"><input id="irbRepeat" type="checkbox" '+(state.repeat?"checked":"")+'><span><b>Серия одной марки</b><small>После сохранения выбирайте следующие точки без повторного поиска марки (пока есть остаток).</small></span></label>':"")+
     (!column&&pickGeometry()!=="bent"?'<label class="irb-zigzag"><input id="irbZigzag" type="checkbox" '+(state.zigzag?"checked":"")+'><span><b>Зигзаг / цепочка</b><small>После сохранения следующая связь начнётся от конца предыдущей. Каждому отрезку соответствует своя марка из ведомости.</small></span></label>':"")+
    '<p class="irb-help">'+(column?"Точная привязка к сетке либо свободная точка между осями. В виде «Фасад» и «Сбоку» для установки используйте изометрию или вид сверху.":"Привязка к колоннам, балкам и ригелям. Для точек сетки требуется проектная отметка Z по КМД.")+'</p>'+
     '<div class="irb-form-error" id="irbQuickError" role="alert" '+(state.error?'':'hidden')+'>'+html(state.error)+'</div>'+
     (typeof props.onQuickPlace==="function"?'<button type="button" class="irb-save irb-quick-save" id="irbQuickSave" '+(!ready||state.busy?'disabled':'')+'>✓ Сохранить на схеме</button>':'')+
    '<button class="irb-save" id="irbContinue" '+(!(state.start&&(column||state.end)&&(pickGeometry()!=="bent"||state.middle)&&available)?'disabled':'')+'>Продолжить в редакторе →</button>'+
    '<button class="irb-secondary" id="irbClear">Сбросить точки</button><button class="irb-secondary" id="irbCancel">Отмена</button>';
    el("irbMark").onchange=e=>{
     const next=markById(e.target.value),keep=state.continuing&&next?.geometry!=="column";
     state.mark=e.target.value;state.topZ="";state.error="";state.bent=false;state.ridgeMode="center";state.middle=null;if(!keep){state.start=null;state.continuing=false}
     if(next?.geometry==="column")state.zigzag=false;
     state.repeat=next?.geometry==="column";
     state.hoverAnchor=null;state.end=null;refreshPanel();paint()
    };
    const markSearchInput=el("irbMarkSearch"),markSelect=el("irbMark"),
     markCount=markSelect.closest(".irb-field")?.querySelector("small");
    const updateMarkSearch=()=>{
     // Never recreate the active search input on every keystroke: replacing
     // pane.innerHTML cancels focus, IME composition and typed characters.
     const matched=marks.filter(searchMatches),available=matched.filter(a=>a.left>0);
     const keepSelection=available.some(a=>String(a.id)===String(state.mark));
     markSelect.innerHTML=markOptions();
     markSelect.value=keepSelection?String(state.mark):"";
     if(markCount)markCount.textContent="Найдено: "+matched.length+" из "+marks.length+
      (matched.length&&!available.length?" · нет остатка":"");
     markSelect._irSelectUI?.refresh?.();
    };
    markSearchInput.addEventListener("input",()=>{
     state.markSearch=markSearchInput.value;
     updateMarkSearch();
    });
    markSearchInput.addEventListener("search",()=>{
     // Handles the native clear (×) control in Chromium/Electron.
     state.markSearch=markSearchInput.value;
     updateMarkSearch();
    });
    markSearchInput.addEventListener("keydown",e=>{
     if(e.key!=="Enter"||e.isComposing||e.keyCode===229)return;
     e.preventDefault();
     const matched=marks.filter(a=>a.left>0&&searchMatches(a));
     if(!matched.length)return;
     // Pressing Enter confirms the first match without interfering with typing.
     const choice=matched.find(a=>String(a.id)===String(state.mark))||matched[0];
     markSelect.value=String(choice.id);
     markSelect.dispatchEvent(new Event("change",{bubbles:true}));
    });
    if(el("irbBentMode"))el("irbBentMode").onchange=e=>{
     state.bent=e.target.checked;state.ridgeMode="center";state.start=null;state.middle=null;state.end=null;state.error="";state.zigzag=false;state.repeat=false;refreshPanel();paint()
    };
    pane.querySelectorAll('input[name="irbRidgeMode"]').forEach(radio=>radio.onchange=e=>{
     const value=e.target.value;
     if(state.ridgeMode===value)return;
     state.ridgeMode=value;state.error="";
     if(value==="center")recenterRidge();
     else{state.middle=null;state.end=null}
     refreshPanel();paint()
    });
    if(el("irbRepeat"))el("irbRepeat").onchange=e=>{state.repeat=e.target.checked};
    if(el("irbClickPlace"))el("irbClickPlace").onchange=e=>{state.directColumns=e.target.checked;updateHint();paint()};
    updateHoverInfo();
     if(el("irbZigzag"))el("irbZigzag").onchange=e=>{state.zigzag=e.target.checked};
    if(el("irbTopZ"))el("irbTopZ").oninput=e=>{
      state.topZ=e.target.value;const save=el("irbQuickSave");
      if(save)save.disabled=state.busy||!readyToSave();
      updateHint();paint();
     };
    const applyLevel=(input,finalize=false)=>{
     const part=input.dataset.irbLevel,
      a=part==="start"?state.start:part==="middle"?state.middle:state.end;
     if(!a)return;
     const raw=input.value.trim().replace(/\s/g,"").replace(",","."),
      numeric=/^[+-]?\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN,
      minimum=a.kind==="column"?num(a.minZ):-20000,
      maximum=a.kind==="column"?num(a.maxZ):200000;
     let message="";
     if(!raw||!Number.isFinite(numeric))message="Укажите отметку Z числом в миллиметрах.";
     else if(numeric<minimum||numeric>maximum)message=a.kind==="column"?
      "Точка на колонне допускает Z от "+fmt(minimum)+" до "+fmt(maximum)+" мм.":
      "Допустимая отметка Z: от "+fmt(minimum)+" до "+fmt(maximum)+" мм.";
     // Editing elevation must not move the chosen X/Y attachment point.
     // The persisted quick-placement validator checks anchors in 3D within
     // 35 mm. Use the same tolerance here to keep preview and saved model
     // identical, without touching any existing construction record.
     let detachMember=false;
     if(!message&&a.kind==="member"&&a.memberId){
      const ref=cols.find(c=>String(c.id)===String(a.memberId));
      const x=num(a.worldX),y=num(a.worldY);
      const vertices=!ref?[]:ref.geometryType==="bent"?
       [pt(ref.x,ref.y,ref.z0),pt(ref.mx,ref.my,ref.mz),pt(ref.x2,ref.y2,ref.z2)]:
       [pt(ref.x,ref.y,ref.z0),pt(ref.x2,ref.y2,ref.z2)];
      const stillAttached=vertices.slice(1).some((end,i)=>{
       const start=vertices[i],vx=end.x-start.x,vy=end.y-start.y,vz=end.z-start.z;
       const length2=vx*vx+vy*vy+vz*vz;
       const t=clamp(((x-start.x)*vx+(y-start.y)*vy+(numeric-start.z)*vz)/(length2||1),0,1);
       return Math.hypot(x-start.x-vx*t,y-start.y-vy*t,numeric-start.z-vz*t)<=35;
      });
      if(!stillAttached){
       if(x<0||x>spanX||y<0||y>spanY)
        message="Точка за границами сетки должна оставаться на опорной конструкции. Выберите допустимую отметку Z.";
       else detachMember=true;
      }
     }
     const feedback=input.parentElement.querySelector(".irb-level-feedback");
     input.classList.toggle("irb-level-invalid",!!message&&finalize);
     input.setAttribute("aria-invalid",String(!!message&&finalize));
     if(feedback){feedback.classList.remove("irb-level-detached");feedback.hidden=!message||!finalize;if(message&&finalize)feedback.textContent=message}
     if(message){
      a.zConfirmed=false;
      if(finalize)state.error=message;
     }else{
      if(detachMember){
       // An unsaved attachment no longer lies on its supporting beam at this
       // Z. Turn it into a free point, rather than moving X/Y along the beam.
       a.kind="ground";delete a.memberId;delete a.memberPart;
      }
      a.z=Math.round(numeric);a.zConfirmed=true;state.error="";
      // A centered ridge depends on endpoint X/Y only; editing Z must never
      // recenter or shift any of the three horizontal coordinates.
      if(detachMember&&feedback){
       feedback.classList.add("irb-level-detached");
       feedback.textContent="Привязка к балке снята; координаты X/Y сохранены.";
       feedback.hidden=false;
      }
      if(finalize)input.value=String(a.z);
     }
     const row=input.closest(".irb-anchor"),label=row?.querySelector("span");
     if(label)label.innerHTML=position(a);
     const save=el("irbQuickSave");if(save)save.disabled=state.busy||!readyToSave();
     const cont=el("irbContinue");
     if(cont)cont.disabled=!(state.start&&(column||state.end)&&(pickGeometry()!=="bent"||state.middle)&&available);
     const error=el("irbQuickError");
     if(error){error.textContent=state.error;error.hidden=!state.error}
     // IMPORTANT: Never call refreshPanel here. Replacing pane.innerHTML
     // while a Z input is active used to destroy focus and cancel Save clicks.
     updateHint();paint();
    };
    // Typing a multi-digit elevation used to redraw the beam at Z=5,
    // Z=55, Z=556, then Z=5565. Commit only the complete number on blur,
    // Enter or Tab. Never mutate cached model anchors on each keystroke.
    const levelInputs=[...pane.querySelectorAll("[data-irb-level]")];
    const isLevelPending=input=>{
     const part=input.dataset.irbLevel,
      a=part==="start"?state.start:part==="middle"?state.middle:state.end;
     if(!a)return false;
     const raw=input.value.trim().replace(/\s/g,"").replace(",",".");
     return !a.zConfirmed||!raw||!Number.isFinite(Number(raw))||
      Math.abs(Number(raw)-num(a.z))>.001
    };
    const refreshLevelPending=()=>{
     const pending=levelInputs.some(isLevelPending);
     const save=el("irbQuickSave");
     if(save)save.disabled=state.busy||pending||!readyToSave();
     const next=el("irbContinue");
     if(next)next.disabled=pending||!(state.start&&(column||state.end)&&(pickGeometry()!=="bent"||state.middle)&&available);
     for(const input of levelInputs){
      const dirty=isLevelPending(input),info=input.parentElement.querySelector(".irb-level-feedback");
      input.classList.toggle("irb-level-editing",dirty);
      if(info&&dirty&&!input.classList.contains("irb-level-invalid")){
       info.hidden=false;
       info.textContent="Нажмите Enter или выйдите из поля, чтобы применить отметку Z."
      }else if(info&&!dirty&&!input.classList.contains("irb-level-invalid")&&!info.classList.contains("irb-level-detached"))info.hidden=true
     }
    };
    levelInputs.forEach(input=>{
     input.addEventListener("input",refreshLevelPending);
     input.addEventListener("change",()=>{
      applyLevel(input,true);
      refreshLevelPending();
     });
     input.addEventListener("keydown",e=>{
      if(e.key==="Enter"){e.preventDefault();input.blur()}
      if(e.key==="Escape"){
       e.preventDefault();
       const part=input.dataset.irbLevel,
        a=part==="start"?state.start:part==="middle"?state.middle:state.end;
       input.value=a?.zConfirmed===true?String(Math.round(num(a.z))):"";
       input.blur();
      }
     });
    });
    el("irbClear").onclick=()=>{state.start=null;state.middle=null;state.end=null;state.error="";state.continuing=false;refreshPanel();paint()};
    el("irbCancel").onclick=()=>{state.placing=false;state.start=null;state.end=null;state.chainNext=null;state.continuing=false;refreshPanel();paint()};
         const quickSave=el("irbQuickSave");
     commitQuickPlacement=async()=>{
      if(!readyToSave()||state.busy)return;
      if(m.geometry==="column"&&columnOccupied(state.start)){
       state.error="В этой точке уже установлена колонна. Выберите другое место.";
       const err=el("irbQuickError");if(err){err.textContent=state.error;err.hidden=false}
       return
      }
      const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),memberId:a.memberId||a.columnId||""}:null;
      if(centeredRidge())recenterRidge();
      const data={markId:state.mark,start:pack(state.start),middle:pickGeometry()==="bent"?pack(state.middle):null,end:column?null:pack(state.end),topZ:column?Number(state.topZ):undefined,geometry:pickGeometry(),ridgeMode:state.ridgeMode,zigzag:state.zigzag&&!state.bent};
      state.busy=true;quickSave.disabled=true;state.error="";
      try{
       const result=await props.onQuickPlace(data);
       if(state.zigzag&&!column&&state.end){
        state.start={...state.end,zConfirmed:true,worldX:num(result.savedEnd.x),worldY:num(result.savedEnd.y),z:num(result.savedEnd.z)};
        state.end=null;state.placing=true;state.continuing=true;
       }else if(state.repeat&&num(m.left)>1){
        state.start=null;state.middle=null;state.end=null;state.placing=true;state.continuing=false;
       }else{state.start=null;state.middle=null;state.end=null;state.placing=false;state.continuing=false}
       if(!(column&&state.placing&&state.repeat))state.topZ="";
       state.error="";state.busy=false;state.hoverAnchor=null;
       props.onQuickPlaced?.(result);
      }catch(e){state.error=String(e?.message||e);state.busy=false;refreshPanel();paint()}
     };
     if(quickSave)quickSave.onclick=commitQuickPlacement;
     el("irbContinue").onclick=()=>{
     if(!state.start||!selectedMark()||left<=0||!column&&!state.end||pickGeometry()==="bent"&&!state.middle)return;
     const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),source:a.kind,columnId:a.columnId||""}:null;
     if(centeredRidge())recenterRidge();
     const data={markId:state.mark,start:pack(state.start),middle:pickGeometry()==="bent"?pack(state.middle):null,end:pack(state.end),geometry:pickGeometry(),ridgeMode:state.ridgeMode,height:maxZ,zigzag:state.zigzag&&!state.bent};
     state.chainNext=state.zigzag&&state.end?{...state.end}:null;
     state.placing=false;state.continuing=false;refreshPanel();paint();props.onPlacement(data);
    };
   }else{
    const c=cols.find(c=>String(c.id)===String(state.selected));
    pane.innerHTML='<div class="irb-panel-head"><b>Свойства конструкции</b></div>'+
      (c?'<div class="irb-selected"><small>Выбранная марка</small><strong>'+html(c.mark||"—")+'</strong><span>'+html(c.mark_name||c.title||"")+'</span><em>'+html(c.status==="mounted"?"Смонтировано":c.status==="partial"?"Частично":"Не смонтировано")+'</em></div>'+
      '<div class="irb-row"><span>Начальная ось</span><b>'+html(c.axisX+" / "+c.axisY)+'</b></div>'+
      '<div class="irb-row"><span>Начало, мм</span><b>X '+fmt(c.x)+' · Y '+fmt(c.y)+' · Z '+fmt(c.z0)+'</b></div>'+
       (c.geometryType==="bent"?'<div class="irb-row"><span>Конёк / излом, мм</span><b>X '+fmt(c.mx)+' · Y '+fmt(c.my)+' · Z '+fmt(c.mz)+'</b></div>':"")+
       '<div class="irb-row"><span>Конец, мм</span><b>X '+fmt(c.x2??c.x)+' · Y '+fmt(c.y2??c.y)+' · Z '+fmt(c.z2)+'</b></div>'+
       '<div class="irb-row irb-length"><span>Длина элемента по осям</span><b>'+fmt(memberLength(c))+' мм · '+(memberLength(c)/1000).toLocaleString("ru-RU",{minimumFractionDigits:3,maximumFractionDigits:3})+' м</b></div>'+
      '<div class="irb-row"><span>Отметка низа, мм</span><b>'+fmt(c.z0)+'</b></div>'+
      '<div class="irb-row"><span>Отметка конца, мм</span><b>'+fmt(c.z2)+'</b></div>'+
      (props.canEdit?'<div class="irb-action-row">'+
       '<button type="button" class="irb-secondary" id="irbSelectDetails">Подробнее и редактирование →</button>'+
       '<button type="button" class="irb-secondary irb-copy-button" id="irbCopySelected" title="Копировать размещение этой марки в другое место (по остатку)">⧉ Размещение</button>'+       '<button type="button" class="irb-secondary irb-copy-params" id="irbCopyPosition" title="Взять оси, X/Y, низ, верх, конёк и профиль в редактор новой позиции">⧉ Копировать позицию</button>'+
       '<button type="button" class="irb-icon-delete" id="irbDeleteSelected" title="Удалить элемент со схемы" aria-label="Удалить выбранный элемент со схемы">'+
        '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
         '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6m4-6v6"/>'+
        '</svg></button></div>':''):
      '<div class="irb-empty">Выберите конструкцию на общей модели, чтобы посмотреть её марку и положение. Все реальные элементы берутся из вашей монтажной схемы.</div>')+
      (props.canEdit?'<button class="irb-save" id="irbStartRight">＋ Добавить элемент</button>':'');
    const btn=el("irbStartRight");if(btn)btn.onclick=startPlacement;
    const detail=el("irbSelectDetails");if(detail)detail.onclick=()=>{
     if(props.canEdit&&typeof props.onEdit==="function")props.onEdit(String(c.id));
    };
    const copyButton=el("irbCopySelected");
    if(copyButton){
     const quota=props.copyQuota?.(String(c.id));
     if(!quota?.left){copyButton.disabled=true;copyButton.title="Нет остатка марки по ведомости";}
     copyButton.onclick=()=>{
      if(!props.canEdit||!quota?.left)return;
      state.copySource={...c};state.copyTarget=null;state.copyHover=null;state.placing=false;state.error="";
      refreshPanel();paint();
     };
    }
    const copyParams=el("irbCopyPosition");if(copyParams)copyParams.onclick=()=>{
     if(props.canEdit&&typeof props.onCopyPosition==="function")props.onCopyPosition(String(c.id))
    };
    const deleteButton=el("irbDeleteSelected");if(deleteButton)deleteButton.onclick=()=>{
     if(props.canEdit&&typeof props.onDelete==="function")props.onDelete(String(c.id));
    };
   }
   const nextMode=state.copySource?"copy":state.placing?"placing":"details";
   pane.dataset.irbPanelMode=nextMode;
   if(previousMode===nextMode)pane.scrollTop=previousScroll;
   if(!pane.hidden){
    const dismiss=document.createElement("button");dismiss.type="button";
    dismiss.className="irb-pane-close";dismiss.textContent="×";dismiss.title="Скрыть свойства";
    dismiss.setAttribute("aria-label","Закрыть свойства");
    dismiss.onclick=()=>{state.copySource=null;state.copyTarget=null;state.copyHover=null;state.placing=false;state.continuing=false;state.chainNext=null;state.start=null;state.end=null;state.selected="";props.onSelect("");refreshPanel();paint()};
    pane.prepend(dismiss);
   }
  }
  function startPlacement(){
   state.copySource=null;state.copyTarget=null;state.copyHover=null;
   if(!props.canEdit||!marks.some(m=>m.left>0))return;
   state.placing=true;state.start=null;state.middle=null;state.end=null;state.chainNext=null;state.continuing=false;state.topZ="";state.error="";state.markSearch="";state.hoverAnchor=null;state.directColumns=true;state.bent=false;state.ridgeMode="center";state.mark=leftMark().find(m=>m.id===state.mark)?.id||leftMark()[0]?.id||"";state.repeat=selectedMark()?.geometry==="column";
   refreshPanel();paint();
   // Opening placement after deleting a member should immediately make the
   // search usable, rather than leaving keyboard focus on the removed button.
   el("irbMarkSearch")?.focus({preventScroll:true});
  }
  const setCamera=mode=>{
   state.preset=mode;state.zoom=1;state.panX=0;state.panY=0;
   if(mode==="top"){state.yaw=0;state.pitch=Math.PI/2}else if(mode==="front"){state.yaw=0;state.pitch=.03}
   else if(mode==="side"){state.yaw=Math.PI/2;state.pitch=.03}else{state.yaw=-.75;state.pitch=.60}
   syncCameraButtons();paint();
  };
  const syncCameraButtons=()=>{
   host.querySelectorAll("[data-irb-camera]").forEach(b=>b.classList.toggle("active",b.dataset.irbCamera===state.preset))
  };
  const setZoom=v=>{state.zoom=clamp(v,.45,4);paint()};
  const cutDetails=el("irbCuts");
  const updateCutControls=()=>{
   const n=state.hiddenSections.length,visible=visibleCols().length;
   const count=el("irbHiddenCount");if(count)count.textContent=n?"Скрыто: "+n:"Все видны";
   const text=el("irbCutsResult");if(text)text.textContent="Показано "+visible+" из "+cols.length+" конструкций";
   const title=el("irbVisibleCount");if(title)title.textContent=String(visible);
   const toggle=el("irbCutsToggle");
   if(toggle){toggle.textContent=n?"▤ Разрезы ("+n+")":"▤ Разрезы";toggle.classList.toggle("has-hidden",n>0)}
  };
  const cutsChanged=()=>{
   state.hiddenSections=[...new Set(state.hiddenSections)].filter(id=>sections.some(a=>a.id===id));
   saveSections();updateCutControls();
   refreshFindControls();
   // A hidden member cannot remain selected or intercept picking.
   if(state.selected&&!visibleCols().some(c=>String(c.id)===String(state.selected))){
    state.selected="";state.hover="";props.onSelect("");refreshPanel()
   }
   if(state.colorMode==="mark"||state.colorMode==="type")showColorMode();
   paint();
  };
  if(cutDetails)cutDetails.addEventListener("toggle",()=>{state.sectionsOpen=cutDetails.open});
  host.querySelectorAll("[data-irb-cut]").forEach(input=>input.onchange=()=>{
   const id=input.dataset.irbCut;
   state.hiddenSections=input.checked?state.hiddenSections.filter(x=>x!==id):[...state.hiddenSections,id];
   cutsChanged()
  });
  el("irbCutsReset").onclick=()=>{
   state.hiddenSections=[];
   host.querySelectorAll("[data-irb-cut]").forEach(input=>input.checked=true);
   cutsChanged()
  };
  el("irbCutsToggle").onclick=()=>{
   state.layersOpen=true;updateLayers();
   state.sectionsOpen=true;cutDetails.open=true;
   layerPanel.scrollTop=Math.max(0,cutDetails.offsetTop-layerPanel.offsetTop-12)
  };
  updateCutControls();
  host.querySelectorAll("[data-irb-layer]").forEach(b=>b.onclick=()=>props.onLayer(b.dataset.irbLayer));
  const findInput=el("irbFindMark");
  const findVisibleMatches=()=>{
   const query=state.findQuery.trim().toLocaleLowerCase("ru");
   if(!query)return[];
   const members=visibleCols();
   const exact=members.filter(c=>markName(c).toLocaleLowerCase("ru")===query);
   const selected=exact.length?exact:members.filter(c=>
    markName(c).toLocaleLowerCase("ru").includes(query)||
    String(c.mark_name||c.title||"").toLocaleLowerCase("ru").includes(query));
   // Stable order between repeated finds, even after camera rotation.
   return selected.slice().sort((a,b)=>
    num(a.x)-num(b.x)||num(a.y)-num(b.y)||num(a.z0)-num(b.z0)||
    String(a.id).localeCompare(String(b.id),"ru",{numeric:true}));
  };
  const refreshFindControls=()=>{
   const matches=findVisibleMatches(),total=matches.length,
    idx=matches.findIndex(c=>String(c.id)===String(state.selected)),
    current=idx<0?0:idx+1,
    message=el("irbFindCount");
   if(message){
    message.textContent=!state.findQuery.trim()?"Введите марку":
     !total?"Ничего не найдено":current+" из "+total+" найдено";
    message.classList.toggle("irb-find-empty",Boolean(state.findQuery.trim()&&!total))
   }
   for(const id of ["irbFindPrev","irbFindNext"]){const button=el(id);if(button)button.disabled=!total}
   const clear=el("irbFindClear");if(clear)clear.hidden=!findInput.value;
  };
  const focusFound=c=>{
   state.placing=false;state.selected=String(c.id);state.hover="";
   props.onSelect(state.selected);refreshPanel();
   const focusPoint=c.geometryType==="bent"?pt(c.mx,c.my,c.mz):
    c.geometryType==="column"?pt(c.x,c.y,(num(c.z0)+num(c.z2))/2):
    pt((num(c.x)+num(c.x2))/2,(num(c.y)+num(c.y2))/2,(num(c.z0)+num(c.z2))/2);
   const projection=projectFactory(),screen=projection.project(focusPoint);
   state.panX+=projection.centerX-screen.x;
   state.panY+=projection.h/2-screen.y;
   refreshFindControls();paint()
  };
  const moveFound=direction=>{
   const matches=findVisibleMatches();if(!matches.length){refreshFindControls();return}
   const index=matches.findIndex(c=>String(c.id)===String(state.selected));
   const next=index<0?(direction<0?matches.length-1:0):(index+direction+matches.length)%matches.length;
   focusFound(matches[next]);
  };
  findInput.oninput=()=>{
   state.findQuery=findInput.value;
   refreshFindControls()
  };
  findInput.onkeydown=e=>{
   if(e.key==="Enter"){e.preventDefault();moveFound(e.shiftKey?-1:1)}
   else if(e.key==="Escape"&&findInput.value){
    e.preventDefault();findInput.value="";state.findQuery="";refreshFindControls()
   }
  };
  el("irbFindPrev").onclick=()=>moveFound(-1);
  el("irbFindNext").onclick=()=>moveFound(1);
  el("irbFindClear").onclick=()=>{
   findInput.value="";state.findQuery="";refreshFindControls();findInput.focus()
  };
  refreshFindControls();
  el("irbGrid").onchange=e=>{state.grid=e.target.checked;paint()};
  el("irbRoof").onchange=e=>{state.roof=e.target.checked;paint()};
  if(el("irbStart"))el("irbStart").onclick=startPlacement;
  if(el("irbQuickAdd"))el("irbQuickAdd").onclick=startPlacement;
  el("irbView").value=state.preset;
  el("irbView").onchange=e=>setCamera(e.target.value);
  host.querySelectorAll("[data-irb-camera]").forEach(b=>b.onclick=()=>{el("irbView").value=b.dataset.irbCamera;setCamera(b.dataset.irbCamera)});
  syncCameraButtons();
  el("irbMinus").onclick=()=>setZoom(state.zoom/1.18);
  el("irbPlus").onclick=()=>setZoom(state.zoom*1.18);
  el("irbFit").onclick=()=>setCamera("iso");
  let drag=null,twoFinger=null,multiTouch=false;
  const pointers=new Map();
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  const pair=()=>{
   const [a,b]=[...pointers.values()];
   return{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))}
  };
  canvas.oncontextmenu=e=>e.preventDefault();
  canvas.onpointerdown=e=>{
   if(e.button!==0&&e.button!==2)return;
   const p=point(e);
   if(e.pointerType==="touch"){
    pointers.set(e.pointerId,p);
    if(pointers.size===2){const t=pair();twoFinger={...t,panX:state.panX,panY:state.panY,zoom:state.zoom};multiTouch=true;drag=null}
   }
   if(!twoFinger)drag={...p,lastX:p.x,lastY:p.y,moved:false,mode:e.button===2?"pan":"orbit"};
   try{canvas.setPointerCapture(e.pointerId)}catch(_e){}
  };
  canvas.onpointermove=e=>{
   const p=point(e);
   if(e.pointerType==="touch"&&pointers.has(e.pointerId)){
    pointers.set(e.pointerId,p);
    if(twoFinger&&pointers.size>=2){
     const t=pair();
     state.panX=twoFinger.panX+t.cx-twoFinger.cx;
     state.panY=twoFinger.panY+t.cy-twoFinger.cy;
     state.zoom=clamp(twoFinger.zoom*t.distance/twoFinger.distance,.45,4);
     paint();return
    }
   }
   if(drag){
    if(Math.hypot(p.x-drag.x,p.y-drag.y)>4)drag.moved=true;
    if(drag.moved){
     if(drag.mode==="pan"){state.panX+=p.x-drag.lastX;state.panY+=p.y-drag.lastY}
     else{state.yaw+=(p.x-drag.lastX)*.008;state.pitch=clamp(state.pitch+(p.y-drag.lastY)*.006,.02,Math.PI/2);state.preset="free";el("irbView").value="free";syncCameraButtons()}
     paint()
    }
    drag.lastX=p.x;drag.lastY=p.y;return;
   }
   if(state.copySource){
   const a=groundAt(p.x,p.y,0),target=a?{x:a.worldX,y:a.worldY}:null,old=state.copyHover;
   if(Boolean(target)!==Boolean(old)||target&&old&&Math.hypot(target.x-old.x,target.y-old.y)>15){
    state.copyHover=target;paint()
   }
   canvas.style.cursor=target?"copy":"not-allowed";return;
  }
  if(!state.placing){const id=nearestMember(p.x,p.y)?.id||"";if(state.hover!==id){state.hover=id;paint()}canvas.style.cursor=id?"pointer":"grab"}
   else{
    const anchor=nearestAxis(p.x,p.y);
    const previous=state.hoverAnchor;
    const changed=!!anchor!==!!previous||anchor&&previous&&
     (Math.hypot(num(anchor.worldX)-num(previous.worldX),num(anchor.worldY)-num(previous.worldY))>15||
      Math.abs(num(anchor.z)-num(previous.z))>50||anchor.kind!==previous.kind);
    if(changed){state.hoverAnchor=anchor;updateHoverInfo();paint()}
    canvas.style.cursor=pickGeometry()==="column"&&columnOccupied(anchor)?"not-allowed":"crosshair"
   }
  };
  canvas.onpointerup=e=>{
   if(e.pointerType==="touch"){
    pointers.delete(e.pointerId);
    if(twoFinger||multiTouch){twoFinger=null;drag=null;if(!pointers.size)multiTouch=false;return}
   }
   if(!drag)return;const moved=drag.moved,mode=drag.mode;drag=null;if(moved||mode==="pan")return;
   const p=point(e);
   if(state.copySource){
    const a=groundAt(p.x,p.y,0);
    if(!a)return;
    state.copyTarget={x:a.worldX,y:a.worldY};state.copyHover=null;
    refreshPanel();paint();return;
   }
   if(state.placing){
    if(state.busy||!selectedMark())return;
    const a=nearestAxis(p.x,p.y);if(!a)return;
    const column=pickGeometry()==="column";
    if(column&&columnOccupied(a)){
     state.error="В выбранной точке уже есть колонна. Выберите свободное место.";
     refreshPanel();paint();return
    }
    if(!state.start||state.end||column){state.start={...a};state.middle=null;state.end=null;if(!column)state.topZ="";}
    else if(pickGeometry()==="bent"){
     if(centeredRidge()){
      if(!sameAnchor(a,state.start)){state.end={...a};recenterRidge()}
     }else if(!state.middle){if(!sameAnchor(a,state.start))state.middle={...a}}
     else if(!sameAnchor(a,state.middle)&&!sameAnchor(a,state.start))state.end={...a};
    }else if(!sameAnchor(a,state.start))state.end={...a};
    state.error="";refreshPanel();paint();
    if(column&&state.directColumns&&state.topZ!==""&&
     Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(a.z)){
     // Use exactly the same validated save path as the sidebar button.
     void commitQuickPlacement()
    }
   }else{state.selected=String(nearestMember(p.x,p.y)?.id||"");props.onSelect(state.selected);refreshPanel();refreshFindControls();paint()}
  };
  canvas.onpointerleave=()=>{if(state.copySource&&state.copyHover){state.copyHover=null;paint()}if(!drag&&state.hoverAnchor){state.hoverAnchor=null;updateHoverInfo();paint()}};
  canvas.onpointercancel=e=>{pointers.delete(e.pointerId);drag=null;twoFinger=null;if(!pointers.size)multiTouch=false};
  canvas.onwheel=e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY>0?.9:1.1))};
  if(window.ResizeObserver){observer=new ResizeObserver(()=>paint());observer.observe(canvas)}
  // Changing layers must not destroy and recreate the whole Electron page
  // or WebGL context; update only the existing GPU mesh visibility.
  updateVisibleScene=(elements,nextGroups)=>{
   cols.splice(0,cols.length,...elements);
   groups.splice(0,groups.length,...nextGroups);
   visibleKey=null;visibleMembers=null;
   segmentsKey=null;segmentsCache=null;
   memberAnchorKey=null;memberAnchorCache=null;columnAnchorCache=null;
   host.querySelectorAll("[data-irb-layer]").forEach(button=>{
    const item=groups.find(g=>g.key===button.dataset.irbLayer);
    if(!item)return;
    button.classList.toggle("active",!!item.visible);
    button.setAttribute("aria-pressed",String(!!item.visible));
    const icon=button.querySelector("i");if(icon)icon.textContent=item.visible?"✓":"";
    const small=button.querySelector("small");if(small)small.textContent=String(item.count);
   });
   if(state.selected&&!cols.some(c=>String(c.id)===String(state.selected))){
    state.selected="";state.hover="";props.onSelect("");refreshPanel();
   }
   updateCutControls();refreshFindControls();
   if(state.colorMode!=="status")showColorMode();
   paint();
  };
  updateAnnotationsScene=(labels,dimensions)=>{
   showMemberLabels=Boolean(labels);showDimensions=Boolean(dimensions);
   for(const [id,enabled] of [["irbLabelsToggle",showMemberLabels],["irbDimensionsToggle",showDimensions]]){
    const button=el(id);if(!button)continue;
    button.classList.toggle("active",enabled);
    button.setAttribute("aria-pressed",String(enabled));
   }
   paint()
  };
  const dimensionButton=el("irbDimensionsToggle"),labelButton=el("irbLabelsToggle");
  if(dimensionButton)dimensionButton.onclick=()=>{
   updateAnnotationsScene(showMemberLabels,!showDimensions);
   props.onAnnotationToggle?.(showMemberLabels,showDimensions)
  };
  if(labelButton)labelButton.onclick=()=>{
   updateAnnotationsScene(!showMemberLabels,showDimensions);
   props.onAnnotationToggle?.(showMemberLabels,showDimensions)
  };
  for(const [button,enabled] of [[dimensionButton,showDimensions],[labelButton,showMemberLabels]]){
   if(button)button.classList.toggle("active",enabled)
  }
  updateRecordsScene=(elements,nextGroups,nextMarks,nextSelected)=>{
   // The standalone steel renderer must discard cached GPU extrusions when
   // geometry changes or a member is newly placed in the current model.
   webgl?.invalidate();
   marks.splice(0,marks.length,...nextMarks);
   state.selected=String(nextSelected||"");state.hover="";
   const newlyPlaced=elements.find(c=>String(c.id)===state.selected&&!knownRecordIds.has(String(c.id)));
   knownRecordIds=new Set(elements.map(c=>String(c.id)));
   if(newlyPlaced){
    // Plan does not apply 3D cut filters. Reveal only the bays containing
    // the saved member; keep all unrelated cut visibility preferences.
    const cutsToReveal=new Set(["X","Y"].map(axis=>sectionFor(newlyPlaced,axis)?.id).filter(Boolean));
    const restored=state.hiddenSections.filter(id=>!cutsToReveal.has(id));
    if(restored.length!==state.hiddenSections.length){
     state.hiddenSections=restored;saveSections();
     host.querySelectorAll("[data-irb-cut]").forEach(input=>{input.checked=!state.hiddenSections.includes(input.dataset.irbCut)});
    }
   }
   if(!marks.some(m=>String(m.id)===String(state.mark)&&m.left>0))
    state.mark=marks.find(m=>m.left>0)?.id||"";
   updateVisibleScene(elements,nextGroups);
   if(!visibleCols().some(c=>String(c.id)===state.selected))state.selected="";
   refreshPanel();refreshFindControls()
  };
  state.selected=String(props.selected||"");
  if(!visibleCols().some(c=>String(c.id)===state.selected))state.selected="";
  refreshPanel();refreshFindControls();paint();
 }
 return {render,updateVisibility:(elements,groups)=>updateVisibleScene?.(elements,groups),
  updateRecords:(elements,groups,marks,selected)=>updateRecordsScene?.(elements,groups,marks,selected),
  updateAnnotations:(labels,dimensions)=>updateAnnotationsScene?.(labels,dimensions),
  start:()=>{const b=document.getElementById("irbStart");if(b)b.click()},
  placementSaved:placement=>{
   if(!placement?.zigzag||!state.chainNext)return;
   const previous=state.chainNext,saved=placement.savedEnd;
   // Continue from the actual endpoint persisted in the standard editor.
   const sameColumn=saved&&previous.kind==="column"&&
    Math.hypot(num(saved.x)-num(previous.worldX),num(saved.y)-num(previous.worldY))<1&&
    num(saved.z)>=num(previous.minZ)&&num(saved.z)<=num(previous.maxZ);
   state.start=!saved?{...previous}:sameColumn?{...previous,z:num(saved.z)}:{
    kind:"grid",x:String(saved.ax),y:String(saved.ay),
    worldX:num(saved.x),worldY:num(saved.y),z:num(saved.z)
   };
   state.end=null;state.placing=true;state.continuing=true;
   state.markSearch="";state.hoverAnchor=null;state.chainNext=null
  },
  placementCancelled:()=>{state.chainNext=null;state.continuing=false;state.placing=false;state.start=null;state.middle=null;state.end=null;state.hoverAnchor=null},
  dispose:()=>{
   observer?.disconnect();observer=null;
   if(animationFrame){window.cancelAnimationFrame(animationFrame);animationFrame=0}
   drawFrame=null;updateVisibleScene=null;updateRecordsScene=null;updateAnnotationsScene=null;webgl?.dispose();webgl=null;paint=null
  }};
})();
;

/* #60: src/object-overview-right-column.js */
"use strict";
/* Object overview right column, version 1.7.73.
 * Move existing module WRAPPERS, not their interactive children:
 * report toggles, photos, delivery filters and graph links keep their handlers.
 * Source sections and database records are never changed.
 */
(()=>{
 const app=document.getElementById("app");if(!app)return;
 const routeId=()=>String((location.hash||"").match(/^#?\/objects\/object\/(\d+)\/?$/)?.[1]||"");
 const blocks=[
  ["reports",".object-overview-reports"],
  ["deliveries",".object-overview-deliveries-wrap"],
  ["schedule",".object-overview-dashboard"],
  ["marks",".object-overview-marks-wrap"],
  ["analysis",".object-overview-admin-analysis"]
 ];
 const cards=[
  ["reports","Последние отчёты","Последние ежедневные отчёты"],
  ["photos","Фото","Последние фотографии из отчётов"],
  ["deliveries","Накладные","Последние поставки по объекту"],
  ["schedule","График работ","План и выполнение по видам работ"],
  ["supply","График поставок","Поставлено и смонтировано"],
  ["marks","Ведомость марок","Монтаж, остатки и готовность"],
  ["acted","Актированные дни","Причины остановки работ"],
  ["penalties","Штрафы","Суммы и причины штрафов"]
 ];
 let pending=false,lastId="";
 function queue(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(()=>{pending=false;apply()});
 }
 function childrenFor(right){
  const report=right.querySelector(".object-overview-reports"),
   delivery=right.querySelector(".object-overview-deliveries-wrap"),
   schedule=right.querySelector(".object-overview-dashboard"),
   marks=right.querySelector(".object-overview-marks-wrap"),
   analysis=right.querySelector(".object-overview-admin-analysis");
  const overviewMarks=report?.querySelector(".oor-marks-card");
  const detailedMarks=marks?.querySelector(".object-overview-marks-card");
  return {
   reports:!!report?.querySelector(".oor2-card:not(.oor2-photo-card):not(.oor-marks-card)"),
   photos:!!report?.querySelector(".oor2-photo-card"),
   deliveries:!!delivery?.querySelector(".ood-deliveries"),
   schedule:!!schedule?.querySelector(".object-overview-schedule"),
   supply:!!delivery?.querySelector(".ood-comparison"),
   marks:!!(detailedMarks||overviewMarks),
   acted:!!analysis?.querySelector(".ooa-acted"),
   penalties:!!analysis?.querySelector(".ooa-penalties"),
   detailedMarks:!!detailedMarks
  };
 }
 function makeLayout(id,anchor){
  const shell=document.createElement("section");
  shell.className="ir-object-overview-layout";shell.dataset.objectId=id;
  const left=document.createElement("aside");
  left.className="ir-object-overview-left";
  left.setAttribute("aria-label","Сводка объекта");
  const heading=document.createElement("div");heading.className="ir-object-overview-sidehead";
  heading.innerHTML="<h2>Сводка объекта</h2><p>Готовность, ресурсы и погода</p>";
  left.appendChild(heading);
  const right=document.createElement("div");
  right.className="ir-object-overview-right";
  right.setAttribute("aria-label","Разделы объекта");
  for(const [key,title,subtitle] of cards){
   const fallback=document.createElement("section");
   fallback.className="ir-object-overview-placeholder";fallback.dataset.panel=key;
   fallback.innerHTML="<div><h2>"+title+"</h2><p>"+subtitle+"</p></div><span>Раздел пока не отображается</span>";
   right.appendChild(fallback);
  }
  shell.append(left,right);
  app.insertBefore(shell,anchor);
  return shell;
 }
 function apply(){
  const id=routeId();if(!id){lastId="";return}
  const dashboard=app.querySelector(".object-overview-dashboard");
  if(!dashboard)return;
  const existing=app.querySelector(":scope > .ir-object-overview-layout");
  let layout=existing;
  if(layout&&layout.dataset.objectId!==id){layout.remove();layout=null}
  if(!layout){
   const anchor=app.contains(dashboard)?dashboard:null;
   layout=makeLayout(id,anchor);
  }
  lastId=id;
  const left=layout.querySelector(".ir-object-overview-left"),right=layout.querySelector(".ir-object-overview-right");
  const stats=app.querySelector(".object-overview-top-stats");
  if(stats&&stats.parentElement!==left)left.append(stats);
  for(const [,selector] of blocks){
   const wrapper=app.querySelector(selector);
   if(wrapper&&wrapper.parentElement!==right)right.append(wrapper);
  }
  const present=childrenFor(right);
  layout.classList.toggle("ir-object-overview-has-marks",present.detailedMarks);
  for(const card of right.querySelectorAll(":scope > .ir-object-overview-placeholder")){
   card.hidden=Boolean(present[card.dataset.panel]);
  }
 }
 const observer=new MutationObserver(queue);
 observer.observe(app,{subtree:true,childList:true});
 window.addEventListener("hashchange",queue);
 window.addEventListener("ir-project-object-updated",queue);
 queue();
})();

;
