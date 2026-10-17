"use strict";
/* IR Project: deterministic KM/KMD drawings only.
 * Keeps all original files, document indexes, source-evidence PDF viewer,
 * mark registers, geometry inspection and assembly/3D. No model runtime.
 */
window.irAiRecognitionPage=async function(objectId){
 const app=document.getElementById("app"),id=String(objectId||"");
 if(!app||!/^\d+$/.test(id))return;
 const route=location.hash;
 const api=window.irProject||{},docsApi=api.aiDocuments,pdf=api.aiPdf;
 const esc=value=>String(value??"").replace(/[&<>"']/g,
  c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const fmt=value=>Number(value)>=1048576?
  (Number(value)/1048576).toFixed(1).replace(".",",")+" МБ":
  Math.ceil((Number(value)||0)/1024)+" КБ";
 let object=null,docs=[],archived=[],indexes=[],ocrStates=[],ocrSaved=[],markAudit=null,active="documents",search="",kind="КМД",
  busy=false,notice="",error=false,bulk=null,loader=null,disposed=false;
 const isCurrent=()=>!disposed&&location.hash===route;
 const matchingIndex=doc=>indexes.find(r=>String(r.documentId)===String(doc.id)&&
  r.sourceSha256===doc.sha256&&Array.isArray(r.pages)&&r.pages.length>0);
 const completeIndex=index=>index&&Number.isSafeInteger(Number(index.totalPages))&&
  Number(index.totalPages)>0&&index.pages.length===Number(index.totalPages)&&
  new Set(index.pages.map(p=>Number(p.page))).size===Number(index.totalPages)&&
  index.pages.every(p=>Number.isSafeInteger(Number(p.page))&&
   Number(p.page)>=1&&Number(p.page)<=Number(index.totalPages));
 const completeGeometry=doc=>{
  const index=matchingIndex(doc);
  const saved=new Set((doc.geometryPages||[]).map(Number));
  return completeIndex(index)&&index.pages.every(p=>saved.has(Number(p.page)))
 };
 const statusOf=doc=>{
  if(!doc.exists)return{value:"Файл отсутствует",css:"missing"};
  const state=bulk?.rows.get(String(doc.id));
  if(state?.state==="running")return{value:"Индексируется · лист "+
   (state.page||"…")+(state.total?" из "+state.total+" · "+Math.floor((state.page||0)/state.total*100)+"%":""),css:"indexing"};
  if(state?.state==="error")return{value:"✕ Ошибка: "+state.message,css:"index-error"};
  const ready=matchingIndex(doc);
  const geometryComplete=completeGeometry(doc);
  if(geometryComplete)return{value:"✓ Текст и геометрия · "+
   (ready?.totalPages||ready.pages.length)+" лист(ов)",css:"indexed"};
  if(ready&&completeIndex(ready))return{value:"✓ Индексирован текст · "+
   (state?.pages||ready?.totalPages||ready?.pages?.length||0)+" лист(ов)",css:"indexed"};
  if(ready)return{value:"⚠ Неполный текстовый индекс · требуется повторная обработка",css:"index-error"};
  return{value:"Ожидает индексации",css:"waiting"}
 };
 async function reload(){
  if(!isCurrent())return;
  try{
   const [records,pages,ocr,saved,audit]=await Promise.all([docsApi.list(id),pdf.list(id),
    typeof pdf.ocrStatus==="function"?pdf.ocrStatus(id).catch(()=>[]):Promise.resolve([]),
    typeof pdf.ocrList==="function"?pdf.ocrList(id).catch(()=>[]):Promise.resolve([]),
    typeof pdf.markSummary==="function"?pdf.markSummary(id).catch(()=>null):Promise.resolve(null)]);
   if(!isCurrent())return;
   docs=records.filter(x=>!x.archived);archived=records.filter(x=>x.archived);
   indexes=Array.isArray(pages)?pages:[];
   ocrStates=Array.isArray(ocr)?ocr:[];
   ocrSaved=Array.isArray(saved)?saved:[];
   markAudit=audit;
  }catch(ex){error=true;notice="Ошибка чтения документов: "+String(ex.message||ex)}
  paint()
 }
 function progress(){
  if(!bulk)return"";
  const rows=[...bulk.rows.values()],done=rows.filter(r=>r.state==="done").length,
   errors=rows.filter(r=>r.state==="error").length;
  return (bulk.running?"Индексируем PDF по одному файлу":bulk.cancelled?"Индексация остановлена":"Индексация завершена")+
   " · готово "+done+" из "+rows.length+(errors?" · ошибок "+errors:"")+
   (bulk.current?" · сейчас: "+bulk.current:"")
 }
 function paint(){
  if(!isCurrent())return;
  app.innerHTML='<div class="ir-ai-page">'+
   '<div class="ir-ai-header"><div><h1>Чертежи КМ/КМД</h1>'+
   '<p>Локальная обработка PDF: текст, оси, геометрия, размерные цепочки и размещение марок. Без нейросетей.</p></div>'+
   '<button type="button" data-kmd-scheme>Открыть монтажную схему 2D/3D</button></div>'+
   '<div class="ir-ai-doc-toolbar"><label>Комплект <select data-kmd-kind>'+
   '<option value="КМ"'+(kind==="КМ"?" selected":"")+'>КМ</option>'+
   '<option value="КМД"'+(kind==="КМД"?" selected":"")+'>КМД</option></select></label>'+
   '<button type="button" data-kmd-upload '+(busy?'disabled':'')+'>Добавить чертежи</button>'+
   '<button type="button" data-kmd-register>Ведомость марок</button></div>'+
   '<nav class="ir-ai-tabs"><button type="button" data-kmd-tab="documents" class="'+
   (active==="documents"?"active":"")+'">Чертежи и индексация</button>'+
   '<button type="button" data-kmd-tab="scheme-lite" class="'+
   (active==="scheme-lite"?"active":"")+'">Геометрический анализ</button></nav>'+
   (notice?'<p role="status" class="ir-ai-message'+(error?' error':'')+'">'+esc(notice)+'</p>':"")+
   '<div id="irAiContent" class="ir-ai-content"></div></div>';
  for(const btn of app.querySelectorAll("[data-kmd-tab]"))
   btn.onclick=()=>switchTab(btn.dataset.kmdTab);
  app.querySelector("[data-kmd-scheme]").onclick=()=>location.hash=
   "/objects/object/"+id+"/scheme";
  app.querySelector("[data-kmd-register]").onclick=()=>location.hash=
   "/objects/object/"+id+"/marks";
  const select=app.querySelector("[data-kmd-kind]");
  if(select)select.onchange=()=>{kind=select.value};
  const upload=app.querySelector("[data-kmd-upload]");
  if(upload)upload.onclick=async()=>{
   if(busy||!docsApi?.select)return;
   busy=true;notice="Добавляем чертежи…";error=false;paint();
   try{
    const result=await docsApi.select(id,kind);
    if(!result.canceled)notice="Загружено: "+(result.imported?.length||0)+
     " · дубликатов: "+(result.skipped?.length||0)+
     " · ошибок: "+(result.errors?.length||0);
   }catch(ex){notice="Не удалось добавить PDF: "+String(ex.message||ex);error=true}
   finally{busy=false;await reload()}
  };
  if(active==="scheme-lite")void showScheme();
  else showDocuments()
 }
 function switchTab(tab){
  if(tab!==active&&active==="scheme-lite")window.irAiSchemeLitePage?.dispose?.();
  if(tab!=="documents"&&tab!=="scheme-lite")return;
  active=tab;paint()
 }
 function showDocuments(){
  const box=app.querySelector("#irAiContent");if(!box)return;
  const matches=docs.filter(doc=>(doc.name+" "+doc.kind).toLowerCase().includes(search.toLowerCase()));
  const all=docs.filter(x=>x.ext===".pdf"&&x.exists);
  const indexed=all.map(doc=>({doc,index:matchingIndex(doc)})).filter(x=>x.index);
  const totalIndexedSheets=indexed.reduce((n,x)=>n+x.index.pages.length,0);
  const savedGeometrySheets=indexed.reduce((n,x)=>{
   const saved=new Set((x.doc.geometryPages||[]).map(Number));
   return n+x.index.pages.filter(p=>saved.has(Number(p.page))).length
  },0);
  box.innerHTML='<div class="ir-ai-doc-head"><div><h2>Исходные чертежи</h2>'+
   '<p>Сохраняем текст и векторную геометрию листов. Повторный запуск использует кэш. Галочка текстового индекса не подтверждает координаты монтажа.</p></div>'+
   '<div class="ir-ai-doc-index-tools"><button type="button" data-kmd-all '+
   (busy||!all.length?'disabled':'')+'>Проиндексировать все чертежи</button>'+
   '<button type="button" data-kmd-ocr '+(busy||!ocrStates.length?'disabled':'')+'>Распознать сканированные листы (OCR)</button>'+
   (bulk?.running?'<button type="button" data-kmd-stop>Остановить после текущего листа</button>':'')+
   '<input data-kmd-search type="search" placeholder="Поиск чертежа" value="'+esc(search)+'"></div></div>'+
   '<div data-kmd-progress class="ir-ai-bulk-summary" role="status" aria-live="polite">'+
   esc(bulk?progress():all.length+
    " PDF · проиндексировано "+indexed.length+
    " · геометрия сохранена: "+savedGeometrySheets+" из "+totalIndexedSheets+" листов")+'</div>'+
   (markAudit?'<div class="ir-ai-bulk-summary"><strong>Сверка с ведомостью марок:</strong> '+Number(markAudit.totalRegisterMarks||0)+' обозначений в ведомости · '+Number(markAudit.matchedMarks||0)+' найдено · '+Number(markAudit.unmatchedMarks?.length||0)+' не найдено · '+Number(markAudit.totalOccurrences||0)+' упоминаний в PDF. <strong>Размещений с проверенными X/Y/Z: 0 по данным текстового индекса.</strong> Упоминания не равны количеству конструкций.</div>':"")+
   (markAudit?.unmatchedMarks?.length?'<details class="ir-ai-bulk-summary"><summary>Не найдены в PDF: '+markAudit.unmatchedMarks.length+' обозначений · показать список</summary><div style="max-height:240px;overflow:auto;line-height:1.9">'+markAudit.unmatchedMarks.map(mark=>'<span style="display:inline-block;padding:2px 8px;margin:2px;border:1px solid var(--border,#aaa);border-radius:6px">'+esc(mark)+'</span>').join("")+'</div><p>Проверьте ведомость, OCR и листы. Отсутствие совпадения не означает отсутствие конструкции.</p></details>':"")+
   (ocrStates.some(r=>r.ocrCandidatePages>0)?'<p class="ir-ai-bulk-summary">OCR: требуется на '+ocrStates.reduce((n,r)=>n+Number(r.ocrCandidatePages||0),0)+' листах · '+(ocrStates.every(r=>!r.ocrCandidatePages||r.runtime?.ready)?'локальный движок готов':'для запуска нужны Tesseract.js и локальные языковые файлы rus/eng')+'. Автоматическое распознавание пока не запущено.</p>':"")+
   (!matches.length?'<div class="ir-ai-doc-empty">Чертежи не найдены. Добавьте PDF или очистите поиск.</div>':
   '<div class="ir-ai-table-wrap"><table class="ir-ai-doc-table"><thead>'+
   '<tr><th>Чертёж</th><th>Комплект</th><th>Размер</th><th>Индекс</th><th>Действия</th></tr>'+
   '</thead><tbody>'+matches.map(d=>{
    const st=statusOf(d);
    return'<tr><td><strong>'+esc(d.name)+'</strong></td><td>'+esc(d.kind||"—")+
     '</td><td>'+fmt(d.size)+'</td><td><span data-kmd-state="'+esc(d.id)+
     '" class="ir-ai-doc-status '+st.css+'">'+esc(st.value)+'</span></td>'+
     '<td><div class="ir-ai-doc-actions">'+
     (d.ext===".pdf"?'<button type="button" data-kmd-index="'+esc(d.id)+'" '+
       (busy||!d.exists?'disabled':'')+'>Индексировать</button>'+
      '<button type="button" data-kmd-preview="'+esc(d.id)+':1" '+
       (!d.exists?'disabled':'')+'>Просмотр PDF</button>':"")+
     '<button type="button" data-kmd-open="'+esc(d.id)+'" '+(!d.exists?'disabled':'')+'>Открыть</button>'+
     (docsApi.archive?'<button type="button" data-kmd-archive="'+esc(d.id)+
      '">В архив</button>':"")+'</div></td></tr>'
   }).join("")+'</tbody></table></div>')+
   (archived.length?'<details><summary>Архив чертежей · '+archived.length+'</summary>'+
    archived.map(d=>'<p>'+esc(d.name)+' <button type="button" data-kmd-restore="'+esc(d.id)+
     '">Восстановить</button></p>').join("")+'</details>':"")+
   (indexes.length?'<details class="ir-ai-pdf-results"><summary>Текстовые индексы · '+
    indexes.length+'</summary>'+indexes.filter(x=>docs.some(d=>String(d.id)===String(x.documentId)))
    .map(x=>'<article class="ir-ai-pdf-card"><header><strong>'+esc(x.sourceName||"PDF")+
     '</strong><span>'+Number(x.totalPages||x.pages.length)+' листов</span></header>'+
     (x.markStats?'<p>Марки из ведомости: '+Number(x.markStats.matchedMarks||0)+
      ' из '+Number(x.markStats.registerMarks||0)+
      ' · упоминаний: '+Number(x.markStats.occurrences||0)+
      ' · размещение не подтверждено</p>':'')+
     '<div class="ir-ai-pdf-sheets">'+(x.pages||[]).map(p=>
       '<details><summary>Лист '+p.page+' · '+(p.hasTextLayer?'Текст найден':
        'Нет текстового слоя · нужен OCR')+
        (x.markStats?.perPage?' · совпадений: '+Number(
         x.markStats.perPage.find(v=>Number(v.page)===Number(p.page))?.occurrences||0):'')+
        '</summary><pre>'+esc(p.excerpt||"Текст отсутствует")+
        '</pre><button type="button" data-kmd-preview="'+x.documentId+':'+p.page+
        '">Просмотр листа</button></details>').join("")+'</div></article>').join("")+
    '</details>':"");
  const searchField=box.querySelector("[data-kmd-search]");
  if(searchField)searchField.oninput=()=>{
   const pos=searchField.selectionStart;search=searchField.value;showDocuments();
   const next=box.querySelector("[data-kmd-search]");
   next?.focus();try{next?.setSelectionRange(pos,pos)}catch{}
  };
  const btn=box.querySelector("[data-kmd-all]");
  if(btn)btn.onclick=()=>void indexAll();
  const ocrButton=box.querySelector("[data-kmd-ocr]");
  if(ocrButton)ocrButton.onclick=()=>void runOcr();
  const stop=box.querySelector("[data-kmd-stop]");
  if(stop)stop.onclick=()=>{if(bulk)bulk.cancelled=true;stop.disabled=true};
  box.querySelectorAll("[data-kmd-index]").forEach(el=>el.onclick=()=>void indexOne(el.dataset.kmdIndex));
  box.querySelectorAll("[data-kmd-preview]").forEach(el=>el.onclick=()=>{
   const [doc,page]=el.dataset.kmdPreview.split(":");void openPdf(doc,page)
  });
  box.querySelectorAll("[data-kmd-open]").forEach(el=>el.onclick=()=>docsApi.open(id,el.dataset.kmdOpen));
  box.querySelectorAll("[data-kmd-archive]").forEach(el=>el.onclick=async()=>{
   if(busy)return;
   if(!window.confirm("Переместить чертёж в архив? Оригинал и индексы сохраняются."))return;
   try{await docsApi.archive(id,el.dataset.kmdArchive);await reload()}
   catch(ex){error=true;notice=String(ex.message||ex);paint()}
  });
  box.querySelectorAll("[data-kmd-restore]").forEach(el=>el.onclick=async()=>{
   try{await docsApi.restore(id,el.dataset.kmdRestore);await reload()}
   catch(ex){error=true;notice=String(ex.message||ex);paint()}
  })
 }
 function updateProgress(){
  const summary=app.querySelector("[data-kmd-progress]");
  if(summary)summary.textContent=progress();
  for(const d of docs){
   const el=app.querySelector('[data-kmd-state="'+d.id+'"]');
   if(!el)continue;
   const state=statusOf(d);
   el.textContent=state.value;el.className="ir-ai-doc-status "+state.css
  }
 }
 async function runOcr(){
  if(busy||typeof pdf.ocrRun!=="function")return;
  const targets=[];
  for(const doc of docs){
   const index=matchingIndex(doc);
   if(!index)continue;
   for(const p of index.pages||[]){
    if(p.hasTextLayer&&!p.uncertainEncoding&&!p.ocr?.needed)continue;
    if(ocrSaved.some(r=>String(r.documentId)===String(doc.id)&&Number(r.page)===Number(p.page)&&r.sourceSha256===doc.sha256))continue;
    targets.push({documentId:doc.id,page:p.page});
   }
  }
  if(!targets.length){notice="Нет новых сканированных листов для OCR.";error=false;paint();return}
  busy=true;error=false;let done=0,failed=0;
  for(const target of targets){
   if(!isCurrent())break;
   notice="OCR: лист "+target.page+" · "+(done+failed+1)+" из "+targets.length;
   paint();
   try{await pdf.ocrRun(id,target.documentId,target.page);done++}
   catch(ex){failed++;notice="OCR: "+String(ex.message||ex);error=true;
    if(/language|Tesseract|языков|not found/i.test(notice))break}
  }
  busy=false;
  await reload();
  notice="OCR: обработано "+done+" листов"+(failed?", ошибок "+failed:"")+". Результаты требуют проверки.";
  paint();
 }
 async function indexOne(documentId){
  if(busy||!pdf?.index)return;busy=true;notice="Индексируем PDF…";error=false;paint();
  try{
   await pdf.index(id,documentId);notice="PDF проиндексирован."
  }catch(ex){notice="Ошибка индексации: "+String(ex.message||ex);error=true}
  finally{busy=false;await reload()}
 }
 async function indexAll(){
  if(busy||!pdf?.index)return;
  const selected=docs.filter(d=>d.ext===".pdf"&&d.exists&&
   !completeGeometry(d));
  if(!selected.length){notice="Все доступные PDF уже имеют сохранённый текст и геометрию.";error=false;paint();return}
  busy=true;error=false;notice="Обрабатываем только PDF с недостающим индексом или геометрией.";
  bulk={running:true,current:"",rows:new Map(selected.map(d=>[String(d.id),
   {state:"waiting"}]))};
  paint();let unsubscribe=null;
  if(typeof pdf.onProgress==="function"){
   try{unsubscribe=pdf.onProgress(event=>{
    if(String(event?.objectId)!==id)return;
    const row=bulk?.rows.get(String(event.documentId));
    if(!row||row.state!=="running")return;
    if(Number.isInteger(Number(event.page)))row.page=Number(event.page);
    if(Number.isInteger(Number(event.total)))row.total=Number(event.total);
    updateProgress()
   })}catch{}
  }
  try{
   for(const d of selected){
    if(!isCurrent()||bulk.cancelled)break;
    const row=bulk.rows.get(String(d.id));
    if(row.state==="done")continue;
    row.state="running";bulk.current=d.name;updateProgress();
    try{
     const result=await pdf.index(id,d.id);
     if(String(result.documentId)!==String(d.id)||
      result.sourceSha256!==d.sha256||!completeIndex(result))
      throw Error("PDF-индекс неполный: отсутствуют листы или повторяются номера");
     if(!api.aiPdfGeometry?.page)throw Error("Модуль геометрии PDF недоступен");
     const savedPages=new Set((d.geometryPages||[]).map(Number));
     const pendingPages=result.pages.filter(sheet=>!savedPages.has(Number(sheet.page)));
     row.total=pendingPages.length;row.page=0;updateProgress();
     for(const sheet of pendingPages){
      if(!isCurrent()||bulk.cancelled)break;
      const geometry=await api.aiPdfGeometry.page(id,d.id,sheet.page);
      if(geometry.sourceSha256!==d.sha256)
       throw Error("Геометрия не соответствует исходному PDF");
      row.page++;updateProgress()
     }
     if(!isCurrent()||bulk.cancelled)break;
     // Refresh persisted geometryPages from the database, not a temporary progress flag.
     const refreshed=await docsApi.list(id);
     const persisted=refreshed.find(x=>String(x.id)===String(d.id));
     const savedAfter=new Set((persisted?.geometryPages||[]).map(Number));
     if(!persisted||persisted.sha256!==d.sha256||
      !result.pages.every(p=>savedAfter.has(Number(p.page))))
      throw Error("Не все листы геометрии подтверждены в базе данных");
     if(!isCurrent()||bulk.cancelled)break;
     indexes=indexes.filter(x=>String(x.documentId)!==String(d.id));
     indexes.push(result);row.state="done";row.pages=result.totalPages||result.pages.length;
     if(isCurrent()){
      docs=refreshed.filter(x=>!x.archived);
      archived=refreshed.filter(x=>x.archived);
     }
    }catch(ex){row.state="error";row.message=String(ex.message||ex).slice(0,130)}
    updateProgress()
   }
  }finally{
   unsubscribe?.();bulk.running=false;bulk.current="";busy=false;
   for(const row of bulk.rows.values())if(row.state==="running")row.state="waiting";
   await reload()
  }
 }
 async function showScheme(){
  const box=app.querySelector("#irAiContent");if(!box)return;
  box.innerHTML='<p class="ir-ai-doc-empty">Загружаем анализ осей и контуров PDF…</p>';
  try{
   if(!window.irAiSchemeLitePage){
    if(!loader)loader=new Promise((resolve,reject)=>{
     const el=document.createElement("script");
     el.src="irapp://app/src/ai-scheme-lite-page.js";
     el.onload=()=>window.irAiSchemeLitePage?resolve():reject(Error("Модуль анализа не загрузился"));
     el.onerror=()=>reject(Error("Не удалось загрузить анализатор"));
     document.head.appendChild(el)
    });
    await loader
   }
   if(!isCurrent()||active!=="scheme-lite"||box!==app.querySelector("#irAiContent"))return;
   await window.irAiSchemeLitePage.render(box,{objectId:id,documents:docs,indexes,
    root:api.data.forObject(id),window,pdf,
    onOpenPdf:(doc,page,evidence)=>openPdf(doc,page,evidence),
    onNavigate:tab=>tab==="scheme"?location.hash="/objects/object/"+id+"/scheme":
     switchTab("documents")});
   if(isCurrent()&&active==="scheme-lite"&&api.aiMounting?.candidates){
    const result=await api.aiMounting.candidates(id);
    const review=result?.pdfPlacementReview;
    const panel=document.createElement("section");
    panel.className="ir-ai-doc-head";
    panel.textContent="Распознано экземпляров: "+(review?.occurrences||0)+" · марок: "+(review?.matchedMarks||0)+" · требуется проверка: "+(review?.requiresReview?.length||0);
    if(!isCurrent()||active!=="scheme-lite")return;
    box.prepend(panel);
    const table=document.createElement("table");
    table.className="ir-ai-review-table";
    const head=document.createElement("thead");
    head.innerHTML="<tr><th>Марка</th><th>Лист</th><th>Тип</th><th>X, мм</th><th>Y, мм</th><th>Статус</th><th>Проверка</th><th>Чертёж</th></tr>";
    table.appendChild(head);
    const body=document.createElement("tbody");
    const approvedCoordinates=new Map();
    for(const item of (review?.candidates||[]).slice(0,200)){
     const tr=document.createElement("tr");
     for(const value of [item.mark,item.page,item.type,item.xMm,item.yMm,"Требует проверки"]){
      const td=document.createElement("td");td.textContent=value==null?"—":String(value);tr.appendChild(td)
     }
     const verify=document.createElement("button");
     verify.type="button";verify.textContent="Проверить координаты";
     verify.onclick=()=>{
      const values=[item.xMm,item.yMm,item.z0Mm,item.z1Mm].map(v=>v==null?"":String(v));
      const raw=window.prompt("X, Y, низ Z, верх Z (мм; через запятую)",values.join(", "));
      if(raw===null)return;
      const parts=raw.split(",").map(v=>v.trim());
      if(parts.length!==4||parts.some(v=>v===""||!Number.isFinite(Number(v)))||(["колонна","фахверк"].includes(item.type)&&Number(parts[3])<=Number(parts[2]))){
       window.alert("Введите четыре числа в мм. Для колонн верх Z должен быть выше низа.");return
      }
      approvedCoordinates.set(item.placementId,{placementId:item.placementId,approved:true,xMm:Number(parts[0]),yMm:Number(parts[1]),z0Mm:Number(parts[2]),z1Mm:Number(parts[3])});
      if(!["колонна","фахверк"].includes(item.type)){
       const endRaw=window.prompt("Конечная точка X, Y, Z (мм; через запятую)","");
       if(endRaw===null){approvedCoordinates.delete(item.placementId);return}
       const end=endRaw.split(",").map(v=>v.trim());
       if(end.length!==3||end.some(v=>v===""||!Number.isFinite(Number(v)))){
        approvedCoordinates.delete(item.placementId);window.alert("Введите три координаты конечной точки");return
       }
       approvedCoordinates.get(item.placementId).endPoint={xMm:Number(end[0]),yMm:Number(end[1]),zMm:Number(end[2])}
      }
      verify.textContent="✓ Координаты проверены"
     };
     const tdVerify=document.createElement("td");tdVerify.appendChild(verify);tr.appendChild(tdVerify);
     const tdPdf=document.createElement("td");
     if(item.documentId&&Number(item.page)>0){
      const open=document.createElement("button");
      open.type="button";open.textContent="Открыть PDF";
      open.onclick=()=>void openPdf(item.documentId,item.page);
      tdPdf.appendChild(open)
     }
     tr.appendChild(tdPdf);
     body.appendChild(tr)
    }
    table.appendChild(body);panel.appendChild(table);
    const reviewed=document.createElement("p");
    reviewed.textContent="Подтверждено: 0 из "+(review?.candidates?.length||0)+" · размещение не выполняется";
    panel.appendChild(reviewed);
    panel.addEventListener("click",()=>{reviewed.textContent="Подтверждено: "+approvedCoordinates.size+" из "+(review?.candidates?.length||0)+" · размещение не выполняется"})
   }
  }catch(ex){if(isCurrent()){
   const warning=document.createElement("p");
   warning.className="ir-ai-message error";
   warning.textContent="Ошибка анализа PDF: "+String(ex.message||ex);
   box.prepend(warning)
  }}
 }
 async function openPdf(documentId,page,evidence=[]){
  if(!pdf?.preview)return;
  try{
   const result=await pdf.preview(id,documentId,Number(page));
   if(!isCurrent())return;
   if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result?.dataUrl||""))
    throw Error("Неверное изображение листа PDF");
   const dlg=document.createElement("dialog");dlg.className="ir-ai-pdf-preview-dialog";
   dlg.innerHTML='<div class="ir-ai-pdf-preview-header"><b>Чертёж · лист '+Number(page)+
    '</b>'+(Array.isArray(evidence)&&evidence.length?
    '<button type="button" data-pdf-evidence aria-pressed="true">Скрыть подсветку</button>':"")+
    (api.aiPdfGeometry?.page?'<button type="button" data-sheet-analysis>Марки и линии</button>':"")+
    '<button type="button" data-close>Закрыть ✕</button></div>'+
    '<div data-sheet-results style="max-height:190px;overflow:auto;padding:0 12px" hidden></div>'+
    '<div class="ir-ai-pdf-preview-stage"><div class="ir-ai-pdf-image-wrap" style="position:relative">'+
    '<img alt="Исходный лист КМД" style="display:block;width:100%;height:auto">'+
    '<div class="ir-ai-pdf-region-layer" style="position:absolute;inset:0;pointer-events:none"></div>'+
    '</div></div>';
   const img=dlg.querySelector("img");img.src=result.dataUrl;
   const layer=dlg.querySelector(".ir-ai-pdf-region-layer"),
    original=indexes.find(x=>String(x.documentId)===String(documentId)),
    pageInfo=original?.pages?.find(x=>Number(x.page)===Number(page));
   const W=Number(pageInfo?.widthPt),H=Number(pageInfo?.heightPt);
   const evidenceBoxes=[];
   if(Number(pageInfo?.rotation||0)===0&&W>0&&H>0){
    for(const item of (Array.isArray(evidence)?evidence:[]).slice(0,30)){
     const rect=item?.rectPt;
     if(!rect||!["x","y","width","height"].every(k=>Number.isFinite(Number(rect[k]))))continue;
     const x=Number(rect.x),y=Number(rect.y),w=Number(rect.width),h=Number(rect.height);
     if(x<0||y<0||w<=0||h<=0||x+w>W+1||y+h>H+1)continue;
     const node=document.createElement("div");node.className="ir-ai-pdf-source-evidence";
     node.style.left=x/W*100+"%";node.style.top=(H-y-h)/H*100+"%";
     node.style.width=w/W*100+"%";node.style.height=h/H*100+"%";
     node.title="Надпись PDF: "+String(item.quote||"");
     layer.appendChild(node);evidenceBoxes.push(node);
     // Source glyphs use bottom-left PDF coordinates. Geometric stroke
     // evidence uses the TOP-left PDF.js viewport: keep the two systems
     // separate to avoid placing a mark at a text-label position.
     const lines=Array.isArray(item.strokeLinesPt)?item.strokeLinesPt:[];
     if(lines.length>=1&&lines.length<=2&&lines.every(l=>l&&
       ["x1","y1","x2","y2"].every(k=>Number.isFinite(l[k]))&&
       [l.x1,l.x2].every(v=>v>=0&&v<=W)&&
       [l.y1,l.y2].every(v=>v>=0&&v<=H))){
      const ns="http://www.w3.org/2000/svg";
      const overlay=document.createElementNS(ns,"svg");
      overlay.setAttribute("viewBox","0 0 "+W+" "+H);
      overlay.setAttribute("preserveAspectRatio","none");
      overlay.setAttribute("class","ir-ai-pdf-source-strokes");
      overlay.style.position="absolute";overlay.style.inset="0";
      overlay.style.width="100%";overlay.style.height="100%";
      overlay.setAttribute("aria-hidden","true");
      lines.forEach((l,n)=>{
       const stroke=document.createElementNS(ns,"line");
       stroke.setAttribute("data-edge",String(n));
       for(const k of ["x1","y1","x2","y2"])
        stroke.setAttribute(k,String(l[k]));
       stroke.setAttribute("stroke",n===0?"#f4514d":"#35b8f5");
       stroke.setAttribute("stroke-width","2");
       stroke.setAttribute("vector-effect","non-scaling-stroke");
       overlay.appendChild(stroke)
      });
      layer.appendChild(overlay);evidenceBoxes.push(overlay)
     }
    }
   }
   document.body.appendChild(dlg);
   const toggle=dlg.querySelector("[data-pdf-evidence]");
   if(toggle)toggle.onclick=()=>{
    const shown=toggle.getAttribute("aria-pressed")==="true";
    toggle.setAttribute("aria-pressed",String(!shown));
    toggle.textContent=shown?"Показать подсветку":"Скрыть подсветку";
    for(const node of evidenceBoxes)node.hidden=shown
   };
   const analyzeButton=dlg.querySelector("[data-sheet-analysis]");
   let analysisOverlay=null;
   if(analyzeButton)analyzeButton.onclick=async()=>{
    const panel=dlg.querySelector("[data-sheet-results]");
    analyzeButton.disabled=true;panel.hidden=false;
    analysisOverlay?.remove();analysisOverlay=null;
    panel.textContent="Сопоставляем марки с линиями листа…";
    try{
     const geometry=await api.aiPdfGeometry.page(id,documentId,Number(page));
     if(!dlg.isConnected||!isCurrent())return;
     if(!result.sha256||geometry.sourceSha256!==result.sha256)
      throw Error("PDF изменился. Закройте просмотр и откройте лист заново.");
     const analysis=geometry.sheetAnalysis;
     if(!analysis){
      panel.textContent="Для анализа требуется актуальный текстовый индекс. Проиндексируйте этот PDF.";
      return;
     }
     const candidates=analysis.candidates||[];
     panel.innerHTML='<p>Упоминаний из ведомости: '+candidates.length+
      '. Зелёная точка — надпись, оранжевые линии — ближайшие штрихи. Выберите обозначение для подсветки. Линии пока не классифицированы; место монтажа и X/Y/Z не подтверждены.</p>'+
      (!analysis.geometryAligned?'<p>Подсветка недоступна: системы координат листа и геометрии не согласованы.</p>':'')+
      (candidates.length?'<div style="display:flex;flex-wrap:wrap;gap:6px">'+
       candidates.map((c,n)=>'<button type="button" data-sheet-hit="'+n+'" '+
        (!analysis.geometryAligned||!Number.isFinite(c.pdfX)||!Number.isFinite(c.pdfY)?'disabled':'')+
        '>'+esc(c.mark)+' · линий: '+c.nearbySegments.length+'</button>').join("")+'</div>':
       '<p>На этом листе обозначения из ведомости не найдены.</p>');
     panel.querySelectorAll("[data-sheet-hit]").forEach(button=>button.onclick=()=>{
      const candidate=candidates[Number(button.dataset.sheetHit)];
      analysisOverlay?.remove();
      const ns="http://www.w3.org/2000/svg",overlay=document.createElementNS(ns,"svg");
      overlay.setAttribute("viewBox","0 0 "+geometry.widthPt+" "+geometry.heightPt);
      overlay.setAttribute("preserveAspectRatio","none");
      overlay.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
      for(const line of candidate.nearbySegments){
       const node=document.createElementNS(ns,"line");
       for(const key of ["x1","y1","x2","y2"])node.setAttribute(key,String(line[key]));
       node.setAttribute("stroke","#f97316");node.setAttribute("stroke-width","3");
       node.setAttribute("vector-effect","non-scaling-stroke");overlay.appendChild(node);
      }
      const dot=document.createElementNS(ns,"circle");
      dot.setAttribute("cx",String(candidate.pdfX));
      dot.setAttribute("cy",String(geometry.heightPt-candidate.pdfY));
      dot.setAttribute("r","6");dot.setAttribute("fill","#22c55e");
      dot.setAttribute("stroke","#fff");dot.setAttribute("stroke-width","1");
      overlay.appendChild(dot);layer.appendChild(overlay);analysisOverlay=overlay;
      panel.querySelectorAll("[data-sheet-hit]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
     });
    }catch(ex){if(dlg.isConnected)panel.textContent=String(ex.message||ex)}
    finally{analyzeButton.disabled=false}
   };
   dlg.querySelector("[data-close]").onclick=()=>dlg.close();
   dlg.addEventListener("close",()=>dlg.remove(),{once:true});
   dlg.showModal()
  }catch(ex){error=true;notice="Не удалось открыть лист: "+String(ex.message||ex);paint()}
 }
 try{object=await api.data.objects.get(id)}catch(ex){app.textContent="Ошибка объекта: "+String(ex.message||ex);return}
 if(!object){location.hash="/objects";return}
 if(!docsApi?.list||!pdf?.list){
  app.textContent="Для просмотра КМ/КМД нужна актуальная базовая сборка Windows.";return
 }
 await reload()
};
