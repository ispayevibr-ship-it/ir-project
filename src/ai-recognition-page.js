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
 let object=null,docs=[],archived=[],indexes=[],active="documents",search="",kind="КМД",
  busy=false,notice="",error=false,bulk=null,loader=null,disposed=false;
 const isCurrent=()=>!disposed&&location.hash===route;
 const matchingIndex=doc=>indexes.find(r=>String(r.documentId)===String(doc.id)&&
  r.sourceSha256===doc.sha256&&Array.isArray(r.pages)&&r.pages.length>0);
 const statusOf=doc=>{
  if(!doc.exists)return{value:"Файл отсутствует",css:"missing"};
  const state=bulk?.rows.get(String(doc.id));
  if(state?.state==="running")return{value:"Индексируется · лист "+
   (state.page||"…")+(state.total?" из "+state.total:""),css:"indexing"};
  if(state?.state==="error")return{value:"✕ Ошибка: "+state.message,css:"index-error"};
  const ready=matchingIndex(doc);
  if(state?.state==="done"||ready)return{value:"✓ Индексирован · "+
   (state?.pages||ready?.totalPages||ready?.pages?.length||0)+" лист(ов)",css:"indexed"};
  return{value:"Ожидает индексации",css:"waiting"}
 };
 async function reload(){
  if(!isCurrent())return;
  try{
   const [records,pages]=await Promise.all([docsApi.list(id),pdf.list(id)]);
   if(!isCurrent())return;
   docs=records.filter(x=>!x.archived);archived=records.filter(x=>x.archived);
   indexes=Array.isArray(pages)?pages:[];
  }catch(ex){error=true;notice="Ошибка чтения документов: "+String(ex.message||ex)}
  paint()
 }
 function progress(){
  if(!bulk)return"";
  const rows=[...bulk.rows.values()],done=rows.filter(r=>r.state==="done").length,
   errors=rows.filter(r=>r.state==="error").length;
  return (bulk.running?"Индексируем PDF по одному файлу":"Индексация завершена")+
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
  const all=docs.filter(x=>x.ext===".pdf"&&x.exists),pending=all.some(x=>!matchingIndex(x));
  box.innerHTML='<div class="ir-ai-doc-head"><div><h2>Исходные чертежи</h2>'+
   '<p>Индексируем каждый PDF один раз. Галочка подтверждает сохранённый текстовый индекс, а не монтажную координату.</p></div>'+
   '<div class="ir-ai-doc-index-tools"><button type="button" data-kmd-all '+
   (busy||!pending?'disabled':'')+'>Проиндексировать все чертежи</button>'+
   '<input data-kmd-search type="search" placeholder="Поиск чертежа" value="'+esc(search)+'"></div></div>'+
   '<div data-kmd-progress class="ir-ai-bulk-summary" role="status" aria-live="polite">'+
   esc(bulk?progress():all.length+
    " PDF · проиндексировано "+all.filter(matchingIndex).length)+'</div>'+
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
     '<div class="ir-ai-pdf-sheets">'+(x.pages||[]).map(p=>
       '<details><summary>Лист '+p.page+' · '+(p.hasTextLayer?'Текст найден':
        'Нет текстового слоя')+'</summary><pre>'+esc(p.excerpt||"Текст отсутствует")+
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
 async function indexOne(documentId){
  if(busy||!pdf?.index)return;busy=true;notice="Индексируем PDF…";error=false;paint();
  try{
   await pdf.index(id,documentId);notice="PDF проиндексирован."
  }catch(ex){notice="Ошибка индексации: "+String(ex.message||ex);error=true}
  finally{busy=false;await reload()}
 }
 async function indexAll(){
  if(busy||!pdf?.index)return;
  const selected=docs.filter(d=>d.ext===".pdf"&&d.exists);
  if(!selected.length)return;
  busy=true;error=false;notice="Индексируем последовательно, без нейросетей.";
  bulk={running:true,current:"",rows:new Map(selected.map(d=>[String(d.id),
   matchingIndex(d)?{state:"done",pages:matchingIndex(d).totalPages||matchingIndex(d).pages.length}:
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
    if(!isCurrent())break;
    const row=bulk.rows.get(String(d.id));
    if(row.state==="done")continue;
    row.state="running";bulk.current=d.name;updateProgress();
    try{
     const result=await pdf.index(id,d.id);
     if(String(result.documentId)!==String(d.id)||
      result.sourceSha256!==d.sha256||!result.pages?.length)
      throw Error("Индекс не соответствует исходному PDF");
     indexes=indexes.filter(x=>String(x.documentId)!==String(d.id));
     indexes.push(result);row.state="done";row.pages=result.totalPages||result.pages.length
    }catch(ex){row.state="error";row.message=String(ex.message||ex).slice(0,130)}
    updateProgress()
   }
  }finally{
   unsubscribe?.();bulk.running=false;bulk.current="";busy=false;
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
     switchTab("documents")})
  }catch(ex){if(isCurrent())box.textContent="Ошибка геометрического анализа: "+String(ex.message||ex)}
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
    '<button type="button" data-close>Закрыть ✕</button></div>'+
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
     if(lines.length===2&&lines.every(l=>l&&
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
