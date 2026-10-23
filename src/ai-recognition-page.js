"use strict";
/* IR Project AI: PDF → montage scheme. Sub-pages: drawings and sheets, analysis, Claude, placement, journal. */
window.irAiRecognitionPage=async function(objectId){
 const app=document.getElementById("app"),id=String(objectId||"");
 if(!app||!/^[0-9]+$/.test(id))return;
 const route=location.hash,esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 // What the program reads itself and what came from Claude; what Claude's runs taught it.
 const learnedLine=view=>{
  const n=view?.sources,l=view?.lessons;if(!n&&!l)return"";
  const all=n?n.program+n.base+n.claude:0;
  return'<p><small>'+(all?'Элементов на схеме '+all+': прочитано программой '+n.program+', из проверенной базы '+n.base+', от Claude '+n.claude+'.':'')+
   (l?' Программа выучила правил: '+l.total+(l.checked?' (проверено '+l.checked+')':'')+(l.run?', из этой обработки '+l.run:'')+'.':'')+'</small></p>'
 };
 const mm=v=>Number(v||0).toLocaleString("ru-RU");
 const bridge=irProject.aiDocuments,montage=irProject.aiMontage,runtime=irProject.aiEngine;
 const canEdit=!!window.irAccess?.canEdit?.("ai-recognition");
 const TABS=[["drawings","Чертежи"],["analyze","Анализ"],["claude","Обработка Claude"],["place","Монтажная схема"],["journal","Журнал"]];
 const tabKey="ir-ms-tab-"+id;
 let object,pdfs=[],picked=new Set(),view=null,engine=null,busy="",error="",heights={},progress="",filter="";
 // The engineer's comment to Claude for this analysis: null until edited, then the typed text (saved with the run).
 let aiNote=null;
 // What the program has learned from the engineer (src/ai-knowledge.js) and the catalog of structure types.
 let knowledge={rules:[],notes:[],types:[]},stypes=[],sgroups=[],teach={mark:"",prefix:false,type:"",project:"",note:""},newType={name:"",group:"other",geometry:"beam",marks:"",words:""};
 const invoke=(ch,arg)=>irProject.ai?.invoke?irProject.ai.invoke(String(ch).replace(/^ai-(knowledge|github|diag):/,"ai-settings:$1-"),arg):Promise.reject(Error("Обновите программу"));
 async function loadKnowledge(){
  try{const [k,t,g]=await Promise.all([invoke("ai-knowledge:list"),invoke("ai-knowledge:types"),invoke("ai-knowledge:groups").catch(()=>[])]);knowledge={types:[],...k};stypes=t;sgroups=g;
   // The engineer's own kinds join the catalog of this window too (scheme page, 3D, panel).
   window.irStructureTypes?.extend?.(knowledge.types)}catch{}
 }
 let tab=(()=>{try{const t=localStorage.getItem(tabKey);return TABS.some(x=>x[0]===t)?t:"drawings"}catch{return"drawings"}})();
 let selected=null,sheetFilter="";const sheetCache=new Map(),openJournal=new Set();
 try{object=await irProject.data.objects.get(id)}catch(e){app.textContent="Не удалось прочитать объект: "+String(e.message||e);return}
 if(!object){location.hash="/objects";return}
 if(!montage||!bridge){
  app.innerHTML='<div class="ir-ms"><div class="ir-ms-error">Эта установка IR Project не содержит модуля «Монтажная схема из PDF». Установите новую версию программы.</div></div>';return
 }
 const alive=()=>location.hash===route;
 const setPdfs=list=>{pdfs=list.filter(x=>x.ext===".pdf"&&x.exists);if(!pdfs.some(d=>String(d.id)===String(selected)))selected=pdfs[0]?.id??null};
 async function load(){
  const jobs=[bridge.list(id).then(setPdfs).catch(()=>{pdfs=[]}),
   montage.latest(id).then(v=>{view=v}).catch(e=>{error=String(e.message||e)})];
  if(runtime)jobs.push(runtime.status().then(v=>{engine=v}).catch(()=>{engine=null}));
  jobs.push(loadKnowledge(),loadWorks());
  await Promise.all(jobs);
  syncHeights();
  if(alive()){render();loadSheets(selected)}
 }
 // Heights shown on the placement page: the engineer's values, otherwise the AI's.
 function syncHeights(){
  const next={};
  for(const s of view?.plan?.schemes||[])next[s.key]={place:s.place,z0_mm:s.z0_mm??"",z1_mm:s.z1_mm??""};
  heights=next
 }
 const aiDone=()=>["done","skipped"].includes(view?.ai?.status);
 async function run(step,job){
  if(busy)return;busy=step;error="";render();
  try{await job()}catch(e){error=String(e.message||e)}
  finally{busy="";progress="";if(alive())render()}
 }
 function go(next){tab=next;try{localStorage.setItem(tabKey,next)}catch{}render();if(next==="drawings")loadSheets(selected)}

 // ---- Drawings: kind of every PDF and the sheets taken into the analysis.
 const KINDS=["КМ","КМД сборочные","КМД монтажные","АР","ТХ","Не анализировать"];
 const typed=d=>KINDS.includes(d.kind);
 const kindSelect=(attr,value,placeholder)=>'<select '+attr+' '+(busy||!canEdit?'disabled':'')+'>'+(placeholder?'<option value="">'+esc(placeholder)+'</option>':'')+
  KINDS.map(k=>'<option value="'+esc(k)+'" '+(k===value?'selected':'')+'>'+esc(k)+'</option>').join("")+'</select>';
 async function setKinds(items){
  const valid=items.filter(x=>KINDS.includes(x.kind));
  if(!valid.length||!bridge.setKinds)return;
  try{setPdfs((await bridge.setKinds(id,valid)).documents)}catch(e){error=String(e.message||e)}
  render()
 }
 // The work types of the object (section «Виды работ»): each drawing goes under one; the montage scheme shows them
 // together or each apart.
 let works=[];
 async function loadWorks(){
  try{works=(await irProject.data.forObject(id).section("work-types").list()).map(r=>({id:String(r.id),name:String(r.data?.work_type||r.title||"Без названия"),code:String(r.data?.project_code||"")}))}
  catch{works=[]}
 }
 const workOf=d=>works.some(w=>w.id===d.workTypeId)?d.workTypeId:"";
 const workSelect=(attr,value,placeholder)=>'<select '+attr+' '+(busy||!canEdit||!works.length?'disabled':'')+' title="'+(works.length?'Вид работ объекта, под которым элементы этого чертежа встанут в монтажную схему':'У объекта нет видов работ — добавьте в разделе «Виды работ»')+'">'+
  '<option value="">'+esc(placeholder)+'</option>'+works.map(w=>'<option value="'+esc(w.id)+'" '+(w.id===value?'selected':'')+'>'+esc(w.name)+(w.code?' · '+esc(w.code):'')+'</option>').join("")+'</select>';
 async function setWorkTypes(items){
  if(!items.length)return;
  try{setPdfs((await invoke("ai-documents:set-work-types",{objectId:id,items})).documents)}catch(e){error=String(e.message||e)}
  render()
 }
 async function loadSheets(docId,force=false){
  if(docId==null||!bridge.sheets||(!force&&sheetCache.has(String(docId))))return;
  sheetCache.set(String(docId),{loading:true});render();
  try{const r=await bridge.sheets(id,docId);sheetCache.set(String(docId),{sheets:r.sheets,excluded:new Set(r.excluded||[])})}
  catch(e){sheetCache.set(String(docId),{error:String(e.message||e)})}
  if(alive())render()
 }
 async function setExcluded(docId,excluded){
  const entry=sheetCache.get(String(docId));if(!entry?.sheets)return;
  entry.excluded=new Set(excluded);render();
  try{const doc=await bridge.setExcluded(id,docId,[...entry.excluded]);setPdfs(pdfs.map(d=>String(d.id)===String(docId)?doc:d))}
  catch(e){error=String(e.message||e)}
  render()
 }
 const sheetCount=d=>{const c=sheetCache.get(String(d.id));const total=c?.sheets?.length||d.pages;
  if(!total)return'<span class="muted">—</span>';const ex=(c?.excluded?c.excluded.size:(d.excluded||[]).length);return(total-ex)+" из "+total};
 async function upload(){
  if(busy||!canEdit)return;
  let imported=null;
  try{imported=await bridge.select(id,"")}catch(e){error=String(e.message||e);render();return}
  if(!imported||imported.canceled)return;
  if(imported.errors?.length)error=imported.errors.map(x=>x.name+": "+x.error).join("; ");
  const first=imported.imported?.find(x=>x.ext===".pdf");
  await load();if(first){selected=first.id;render();loadSheets(first.id)}
 }
 // One, picked or all files; the source files on disk stay.
 async function removeDocs(list){
  if(!list.length)return;
  if(!confirm((list.length===1?"Удалить «"+list[0].name+"»":"Удалить файлов: "+list.length)+" из IR Project AI? Исходные файлы на диске не затрагиваются."))return;
  busy="remove";render();
  for(const doc of list){try{await bridge.remove(id,doc.id);sheetCache.delete(String(doc.id));picked.delete(String(doc.id))}catch(e){error=String(e.message||e)}}
  busy="";await load()
 }
 async function previewSheet(docId,page){
  if(!bridge.preview)return;
  const dlg=document.createElement("dialog");dlg.className="ir-ms-preview";
  dlg.innerHTML='<header><b>Лист '+page+'</b><button type="button" data-close>Закрыть ✕</button></header><div class="ir-ms-preview-body"><p class="ir-ms-wait"><i></i>Готовим изображение листа…</p></div>';
  dlg.querySelector("[data-close]").onclick=()=>dlg.close();dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  document.body.appendChild(dlg);dlg.showModal();
  try{const r=await bridge.preview(id,docId,page);
   if(!/^data:image\/png;base64,/.test(r.dataUrl))throw Error("Неверный формат изображения");
   dlg.querySelector(".ir-ms-preview-body").innerHTML='<img alt="Лист '+page+'" src="'+r.dataUrl+'">'}
  catch(e){dlg.querySelector(".ir-ms-preview-body").innerHTML='<p class="ir-ms-error">'+esc(e.message||e)+'</p>'}
 }
 function drawingsPage(){
  const missing=pdfs.filter(d=>!typed(d)).length,counts={};for(const d of pdfs)if(typed(d))counts[d.kind]=(counts[d.kind]||0)+1;
  const doc=pdfs.find(d=>String(d.id)===String(selected)),entry=doc&&sheetCache.get(String(doc.id));
  const chosen=pdfs.filter(d=>picked.has(String(d.id)));
  const files='<div class="ir-ms-pane ir-ms-files"><div class="ir-ms-pane-head"><b>Файлы · '+pdfs.length+'</b>'+
   '<button class="primary" data-ms-upload '+(busy||!canEdit?'disabled':'')+'>Загрузить PDF…</button></div>'+
   (pdfs.length?'<div class="ir-ms-row ir-ms-bulk">Всем без типа: '+kindSelect("data-ms-bulk","","— тип —")+'<button data-ms-bulk-apply '+(busy||!canEdit||!missing?'disabled':'')+'>Применить</button></div>':'')+
   (pdfs.length&&works.length?'<div class="ir-ms-row ir-ms-bulk">Вид работ всем без него: '+workSelect("data-ms-work-bulk","","— вид работ —")+'<button data-ms-work-bulk-apply '+(busy||!canEdit||!pdfs.some(d=>!workOf(d))?'disabled':'')+'>Применить</button></div>':'')+
   (pdfs.length&&canEdit?'<div class="ir-ms-row ir-ms-bulk"><button data-ms-remove-picked '+(busy||!chosen.length?'disabled':'')+'>Удалить выбранные'+(chosen.length?' ('+chosen.length+')':'')+'</button><button data-ms-remove-all '+(busy?'disabled':'')+'>Удалить все</button></div>':'')+
   '<div class="ir-ms-scroll"><table class="ir-ms-table ir-ms-log ir-ms-filelist"><thead><tr>'+(canEdit?'<th><input type="checkbox" data-ms-pick-all aria-label="Выбрать все файлы" '+(pdfs.length&&chosen.length===pdfs.length?'checked':'')+'></th>':'')+'<th>Файл</th><th>Тип чертежа</th><th>Вид работ</th><th>Листы</th><th></th></tr></thead><tbody>'+
   (pdfs.length?pdfs.map(d=>'<tr class="'+(String(d.id)===String(selected)?'sel ':'')+(typed(d)?'':'warn')+'" data-ms-select="'+d.id+'">'+(canEdit?'<td><input type="checkbox" data-ms-pick="'+d.id+'" '+(picked.has(String(d.id))?'checked':'')+'></td>':'')+'<td title="'+esc(d.name)+'">'+esc(d.name)+'</td>'+
    '<td>'+kindSelect('data-ms-kind="'+d.id+'"',typed(d)?d.kind:"","не выбран")+'</td><td>'+workSelect('data-ms-work="'+d.id+'"',workOf(d),"не выбран")+'</td><td>'+sheetCount(d)+'</td>'+
    '<td>'+(canEdit?'<button class="link" data-ms-remove="'+d.id+'" title="Удалить из IR Project AI">✕</button>':'')+'</td></tr>').join(""):
    '<tr><td colspan="6" class="muted">Загрузите PDF чертежей: КМ, КМД сборочные, КМД монтажные, АР, ТХ.</td></tr>')+'</tbody></table></div>'+
   '<p class="ir-ms-note">'+(missing?'<b class="bad">Без типа: '+missing+'</b> · ':'')+Object.entries(counts).map(([k,v])=>esc(k)+' — '+v).join(" · ")+'</p>'+
   (pdfs.length?'<p class="ir-ms-note">'+(works.length?'Вид работ — под каким видом работ объекта элементы чертежа встанут в монтажную схему (там можно смотреть все виды вместе или каждый отдельно). Не выбран — «Монтаж металлоконструкций (из PDF)».':'У объекта нет видов работ: элементы встанут под «Монтаж металлоконструкций (из PDF)». Свои виды работ добавляются в разделе «Виды работ».')+'</p>':'')+'</div>';
  let sheets='<div class="ir-ms-pane ir-ms-sheets"><p class="muted">Выберите файл слева.</p></div>';
  if(doc){
   const list=entry?.sheets||[],excluded=entry?.excluded||new Set();
   const shown=list.filter(s=>!sheetFilter||(s.page+" "+s.name+" "+s.code).toLowerCase().includes(sheetFilter.toLowerCase()));
   sheets='<div class="ir-ms-pane ir-ms-sheets"><div class="ir-ms-pane-head"><b title="'+esc(doc.name)+'">'+esc(doc.name)+'</b>'+kindSelect('data-ms-kind="'+doc.id+'"',typed(doc)?doc.kind:"","тип не выбран")+(works.length?workSelect('data-ms-work="'+doc.id+'"',workOf(doc),"вид работ не выбран"):'')+'</div>'+
    (doc.kind==="Не анализировать"?'<p class="muted">Файл не участвует в анализе.</p>':
    entry?.loading?'<p class="ir-ms-wait"><i></i>Читаем листы и штампы…</p>':entry?.error?'<p class="ir-ms-error">'+esc(entry.error)+'</p>':
    '<div class="ir-ms-row ir-ms-sheet-tools"><input type="search" data-ms-sheet-filter placeholder="Найти лист по номеру, названию, марке" value="'+esc(sheetFilter)+'">'+
     '<button data-ms-sheets-on '+(busy||!canEdit?'disabled':'')+'>Отметить'+(sheetFilter?' найденные':' все')+'</button>'+
     '<button data-ms-sheets-off '+(busy||!canEdit?'disabled':'')+'>Снять'+(sheetFilter?' найденные':' все')+'</button>'+
     '<span class="muted">На анализ: '+(list.length-excluded.size)+' из '+list.length+'</span></div>'+
    '<div class="ir-ms-scroll"><table class="ir-ms-table ir-ms-log"><thead><tr><th></th><th>Лист</th><th>Название (из штампа)</th><th>Шифр</th><th></th></tr></thead><tbody>'+
     shown.map(s=>'<tr class="'+(excluded.has(s.page)?'off':'')+'"><td><input type="checkbox" data-ms-sheet="'+s.page+'" '+(excluded.has(s.page)?'':'checked')+' '+(busy||!canEdit?'disabled':'')+'></td>'+
      '<td>'+s.page+'</td><td>'+(s.name?esc(s.name):'<span class="muted">—</span>')+'</td><td><small>'+esc(s.code)+'</small></td>'+
      '<td><button class="link" data-ms-preview="'+s.page+'">Просмотр</button></td></tr>').join("")+
    '</tbody></table></div>')+'</div>'
  }
  const ready=!missing&&pdfs.some(d=>typed(d)&&d.kind!=="Не анализировать");
  return'<div class="ir-ms-split">'+files+sheets+'</div>'+
   '<div class="ir-ms-next">'+(ready?'':'<span class="ir-ms-hint">'+(pdfs.length?'Укажите тип для всех чертежей':'Загрузите чертежи')+'</span>')+
   '<button class="primary" data-ms-go="analyze" '+(ready?'':'disabled')+'>Далее: анализ →</button></div>'
 }

 // ---- Analysis.
 const wait=text=>'<p class="ir-ms-wait"><i></i><span data-ms-progress>'+esc(progress||text)+'</span></p>';
 const sheetLabel=s=>s.file?esc(s.file)+", лист "+s.sheet:"Лист "+s.page;
 async function analyze(){await run("analyze",async()=>{view=await montage.analyze(id,null);syncHeights()});await autoPlace()}
 // Everything goes on the scheme by itself: after the analysis Claude (when connected), then the placement, with no
 // drafts to confirm. What the program is unsure of is placed too, with a note «проверьте» on the element.
 async function autoPlace(){
  if(!canEdit||!view||error)return;
  if(!aiDone()&&engine?.installed&&view.ai?.status!=="failed")await processAI(false);
  if(!aiDone())await run("skip",async()=>{view=await montage.skipAI(id,view.draftId);syncHeights()});
  if(!aiDone()||!view?.plan?.ready)return;
  await run("place",async()=>{view=await montage.place(id,view.draftId,heights)});
  if(alive())go("place")
 }
 function analyzePage(){
  const missing=pdfs.filter(d=>!typed(d)).length,files=pdfs.filter(d=>typed(d)&&d.kind!=="Не анализировать");
  const sheetsTotal=files.reduce((n,d)=>{const c=sheetCache.get(String(d.id));const total=c?.sheets?.length||d.pages||0;return n+Math.max(0,total-(c?.excluded?c.excluded.size:(d.excluded||[]).length))},0);
  const types={};for(const d of files)types[d.kind]=(types[d.kind]||0)+1;
  let body='<p>Файлов на анализ: <b>'+files.length+'</b> ('+Object.entries(types).map(([k,v])=>esc(k)+' — '+v).join(", ")+')'+(sheetsTotal?' · отмечено листов: '+sheetsTotal:'')+'</p>'+
   '<p class="muted">Из КМД монтажных — оси, координаты и марки; из КМД сборочных — отметки низа и верха, длины и количество марок; из КМ — схемы и профили. Без интернета.</p>';
  if(busy==="analyze")body+=wait("Разбираем PDF…");
  else body+='<div class="ir-ms-row"><button class="primary" data-ms-analyze '+(busy||!canEdit||!files.length||missing?'disabled':'')+'>'+(view?'Анализировать заново':'Анализировать')+'</button>'+
   (missing?'<span class="ir-ms-hint">Укажите тип для всех чертежей на странице «Чертежи»</span>':'')+'</div>';
  if(view&&busy!=="analyze"){
   const types2={};for(const f of view.journal?.files||[])types2[f.type]=(types2[f.type]||0)+1;
   if(view.outdated)body+='<div class="ir-ms-card warn"><b>Анализ сделан старой версией правил</b><p>Программа обновилась и читает чертежи лучше. Нажмите «Анализировать все PDF» ещё раз — иначе на монтажную схему пойдёт старый результат.</p></div>';
   body+='<div class="ir-ms-card ok"><b>Последний анализ</b><p>Файлов: <b>'+view.files+'</b> ('+Object.entries(types2).map(([k,v])=>esc(k)+' — '+v).join(", ")+') · листов: '+view.sheets+
    ' · схем: <b>'+view.schemesFound+'</b>, элементов: '+view.elementsFound+' · марок с чертежей: '+(view.journal?.catalog||[]).filter(c=>c.sources?.some(x=>!/монтажная схема/.test(x))).length+'</p>'+
    (view.failed?.length?'<details class="ir-ms-skipped"><summary>Не разобрано файлов: '+view.failed.length+'</summary><ul>'+view.failed.map(f=>'<li>'+esc(f.name)+' — '+esc(f.error)+'</li>').join("")+'</ul></details>':'')+'</div>'+
    '<div class="ir-ms-next"><button class="primary" data-ms-go="claude">Далее: обработка Claude →</button></div>'
  }
  return'<div class="ir-ms-page">'+body+'</div>'
 }

 // ---- Claude. After an error the finished batches are kept: a new run continues unless a restart is asked for.
 async function processAI(restart=false){
  const comment=aiNote===null?(view?.comment||""):aiNote;
  await run("ai",async()=>{try{view=await (irProject.ai?.invoke?invoke("ai-montage:process",{objectId:id,draftId:view.draftId,restart:restart===true,comment}):montage.process(id,view.draftId,restart===true));aiNote=null}finally{if(!view?.ai||view.ai.status!=="done")view=await montage.latest(id)}syncHeights()})
 }
 // What Claude should pay attention to — sent with every request of the run and kept with the analysis.
 const noteBox=()=>'<label class="ir-ms-note"><b>Комментарий для Claude</b> — на что обратить внимание при обработке'+
  '<textarea data-ms-ai-note rows="3" '+(busy||!canEdit?'disabled':'')+' placeholder="Например: «колонны К1 стоят на отметке +0.150», «связи СВ1 только в осях 3–4», «лестницу и площадки не ставить», «марки на листе 5 читать по спецификации»">'+esc(aiNote===null?(view?.comment||""):aiNote)+'</textarea></label>';
 function claudePage(){
  const ai=view?.ai;let body="";
  if(!view)body='<p class="muted">Сначала выполните анализ.</p>';
  else if(busy==="ai")body=wait("Claude изучает листы, разрезы и отметки…");
  else if(ai?.status==="done"){
   body=(ai.source==="knowledge"?'<div class="ir-ms-card ok"><b>Комплект уже знаком — взят из базы знаний</b><p>'+esc((view.knowledge||[]).map(k=>"«"+(k.title||k.id)+"» ("+k.origin+(k.source?", "+k.source:"")+")").join("; "))+'. Запрос к Claude не нужен; «Обработать через Claude» — если хотите прочитать заново.</p></div>':'')+
    '<div class="ir-ms-card ok"><p>'+esc(ai.summary||"Готово.")+'</p><small>'+esc(ai.model)+' · запросов '+ai.batches+' · марок прочитано '+ai.marks+'</small>'+learnedLine(view)+(view.comment?'<p><small>С вашим комментарием: «'+esc(view.comment)+'»</small></p>':'')+'</div><ul class="ir-ms-list">'+view.plan.schemes.map(s=>
    '<li><b>'+sheetLabel(s)+' · '+esc(s.title)+'</b> — '+(s.place?'ставим, отметки '+mm(s.z0_mm)+' … '+mm(s.z1_mm)+' мм':'не ставим')+(s.reason?'<small>'+esc(s.reason)+'</small>':'')+'</li>').join("")+'</ul>'+noteBox()+
    '<div class="ir-ms-next"><button class="link" data-ms-ai-restart '+(busy?'disabled':'')+'>Обработать заново</button><button class="primary" data-ms-go="place">Далее: монтажная схема →</button></div>'
  }else if(ai?.status==="skipped")body='<p>Продолжено без ИИ: отметки укажите на странице «Монтажная схема».</p><div class="ir-ms-row">'+(engine?.installed?'<button data-ms-ai '+(busy?'disabled':'')+'>Обработать через Claude</button>':'')+'<button class="primary" data-ms-go="place">Далее: монтажная схема →</button></div>';
  else{
   const noKey=!engine?.installed;
   body=(ai?.status==="failed"?'<p class="ir-ms-error">'+esc(ai.error)+'</p>':
    noKey?'<p>Claude не подключён. Укажите API-ключ в настройках или продолжите без ИИ.</p>':'<p>Claude посмотрит монтажные схемы, сборочные чертежи и таблицы: решит, какие схемы ставить, уточнит типы элементов и отметки, прочитает профили, длины и количество марок. Запускается только по кнопке.</p>')+
    (noKey?'':noteBox())+'<div class="ir-ms-row">'+(noKey?'<button data-ms-settings>Настроить Claude</button>':'<button class="primary" data-ms-ai '+(busy||!canEdit?'disabled':'')+'>'+(ai?.status==="failed"&&ai.partial?'Продолжить (готово запросов: '+ai.partial+')':ai?.status==="failed"?'Повторить':engine?.provider==="claude-code"?'Обработать через Claude Code (подписка)':'Обработать через Claude')+'</button>')+
    '<button data-ms-skip '+(busy||!canEdit?'disabled':'')+'>Продолжить без ИИ</button>'+
    (ai?.status==="failed"&&ai.partial&&!noKey?'<button class="link" data-ms-ai-restart '+(busy||!canEdit?'disabled':'')+'>Начать заново</button>':'')+'</div>'
  }
  return'<div class="ir-ms-page">'+body+'</div>'
 }

 // ---- Placement.
 async function preview(){
  try{view=await montage.preview(id,view.draftId,heights);syncHeights()}catch(e){error=String(e.message||e)}
  render()
 }
 function skippedHtml(list,count){
  if(!count)return"";
  return'<details class="ir-ms-skipped"><summary>Не расставлено: '+count+'</summary><ul>'+(list||[]).map(s=>'<li>'+esc(s.mark)+' · лист '+s.page+(s.file?' ('+esc(s.file)+')':'')+' — '+esc(s.reason)+'</li>').join("")+'</ul></details>'
 }
 // Clearing goes through the generic AI channel (installer 1.8.1 and later).
 const clearButton=()=>irProject.ai?.invoke?'<button class="link" data-ms-clear '+(busy||!canEdit?'disabled':'')+'>Очистить монтажную схему</button>':"";
 async function clearScheme(){
  if(!confirm("Удалить все элементы монтажной схемы? Сетка осей останется. Копия сохранится — её можно вернуть на странице монтажной схемы."))return;
  await run("clear",async()=>{const r=await irProject.ai.invoke("ai-montage:clear-scheme",{objectId:id});alert("Удалено элементов: "+r.removed)})
 }
 // The journal of edits: elements the engineer sent with «В журнал» on the scheme page. Sent to GitHub every hour by
 // itself, or now with the button.
 let edits=null;
 async function loadEdits(){
  if(!irProject.ai?.invoke||edits?.loading)return;
  edits={loading:true};
  try{edits=await irProject.ai.invoke("ai-montage:journal-list",{objectId:id,limit:300})}catch(e){edits={error:String(e.message||e)}}
  if(alive())render()
 }
 async function sendEdits(){
  await run("send",async()=>{const r=await irProject.ai.invoke("ai-montage:journal-send",{});edits=null;alert(r.sent?"Отправлено файлов: "+r.sent:"Новых записей нет — всё уже отправлено")})
 }
 function editsCard(){
  if(!irProject.ai?.invoke)return"";
  if(!edits){setTimeout(loadEdits,0);return""}
  if(edits.loading)return"";
  if(edits.error)return'<div class="ir-ms-card"><p class="muted">'+esc(edits.error)+'</p></div>';
  const g=edits.github||{},last=g.last?.at?new Date(g.last.at).toLocaleString("ru-RU"):"ещё не отправлялся";
  const rows=(edits.entries||[]).map(e=>'<tr><td>'+esc(new Date(e.at).toLocaleString("ru-RU"))+'</td><td><b>'+esc(e.element?.mark||"")+'</b></td><td>'+esc(e.text)+'</td><td>'+esc(e.comment||"")+'</td></tr>');
  return'<div class="ir-ms-card"><p><b>Журнал правок</b> · записей по объекту: <b>'+edits.count+'</b> (всего '+edits.total+')</p>'+
   '<p class="muted">После правки элемента на монтажной схеме нажмите у него «В журнал». Журнал уходит на GitHub сам каждый час'+(g.hasToken?'':' — когда в настройках ИИ указан ключ GitHub')+'. Последняя отправка: '+esc(last)+(g.lastError?' · <span class="bad">'+esc(g.lastError)+'</span>':'')+'.</p>'+
   (rows.length?table(["Когда","Марка","Что изменено","Комментарий"],rows):'')+
   '<div class="ir-ms-row"><button data-ms-edits-send '+(busy||!g.hasToken?'disabled':'')+'>Отправить журнал сейчас</button></div></div>'
 }
 // The journal of fixes: what Claude changed by the engineers' messages from the chat (knowledge/chat/journal.json of
 // the update) — the message, the answer, the rules it went into.
 let fixes=null;
 async function loadFixes(){
  if(!irProject.ai?.invoke||fixes?.loading)return;
  fixes={loading:true};
  try{fixes=await irProject.ai.invoke("ai-montage:chat-journal",{})}catch(e){fixes={entries:[],error:String(e.message||e)}}
  if(alive())render()
 }
 function fixesCard(){
  if(!irProject.ai?.invoke)return"";
  if(!fixes){setTimeout(loadFixes,0);return""}
  if(fixes.loading||fixes.error&&/No handler|не зарегистр/i.test(fixes.error))return"";
  const rows=(fixes.entries||[]).map(e=>'<tr><td>'+esc(e.at?new Date(e.at).toLocaleString("ru-RU"):"")+'</td><td>'+esc(e.version||"")+'</td><td>'+esc(e.question||"")+
   (e.element?'<small>'+esc(e.element)+'</small>':'')+'</td><td>'+esc(e.text||"")+'</td><td>'+esc((e.rules||[]).join("; "))+'</td></tr>');
  return'<div class="ir-ms-card"><p><b>Исправления Claude по сообщениям из чата</b> · записей: <b>'+rows.length+'</b></p>'+
   '<p class="muted">Напишите в чат (значок чата на монтажной схеме), что не так, — Claude исправит программу, а запись появится здесь с обновлением.</p>'+
   (rows.length?table(["Когда","Обновление","Сообщение","Что сделано","Правило"],rows):'')+'</div>'
 }
 function placePage(){
  const placed=view?.placed,plan=view?.plan;let body="";
  if(!view)body='<p class="muted">Сначала выполните анализ.</p>';
  else if(!aiDone())body='<p class="muted">Сначала обработайте листы через Claude или выберите «Продолжить без ИИ» на странице «Обработка Claude».</p>';
  else if(busy==="place")body=wait("Расставляем элементы…");
  else if(placed){
   const gridText={created:"сетка осей создана",replaced:"сетка осей заменена",kept:"сетка осей сохранена, элементы привязаны по названиям осей"}[placed.gridMode]||"";
   body='<div class="ir-ms-card ok"><p>Новых элементов: <b>'+placed.created+'</b>'+(placed.updated?' · обновлено (координаты и отметки): <b>'+placed.updated+'</b>':'')+(placed.removed?' · удалено прежних: '+placed.removed:'')+
    (placed.keptMounted?' · смонтированные оставлены: '+placed.keptMounted:'')+(placed.linked?' · с ведомостью связано '+placed.linked:'')+(placed.marksCreated?' · в ведомость добавлено марок: '+placed.marksCreated+(placed.workCreated?' (вид работ «Монтаж металлоконструкций (из PDF)»)':''):'')+(placed.byWork?.length>1||placed.byWork?.[0]&&!placed.workCreated?' · по видам работ: '+placed.byWork.map(w=>'«'+esc(w.name)+'» '+w.count).join(', '):'')+' · '+esc(gridText)+(placed.skippedCount?' · пропущено '+placed.skippedCount:'')+'</p></div>'+
    '<div class="ir-ms-row"><button class="primary" data-ms-open>Открыть монтажную схему</button><button data-ms-placeit '+(busy||!plan?.ready||!canEdit?'disabled':'')+'>Расставить заново</button><button data-ms-undo '+(busy||!canEdit?'disabled':'')+'>Отменить расстановку</button>'+clearButton()+'</div>'+
    skippedHtml(placed.skipped,placed.skippedCount)+editsCard()
  }else{
   const g=plan.grid;
   body=(g?'<p class="ir-ms-result">Оси '+esc(g.axes_x.join(", "))+' · '+mm(g.span_x_mm)+' мм; оси '+esc(g.axes_y.join(", "))+' · '+mm(g.span_y_mm)+' мм</p>':'')+
    '<div class="ir-ms-scroll"><table class="ir-ms-table"><thead><tr><th></th><th>Схема</th><th>Низ, мм</th><th>Верх, мм</th></tr></thead><tbody>'+
    plan.schemes.map(s=>{const h=heights[s.key]||{};return'<tr><td><input type="checkbox" data-ms-place="'+esc(s.key)+'" '+(h.place?'checked':'')+' '+(s.count?'':'disabled')+'></td>'+
     '<td>'+sheetLabel(s)+' · '+esc(s.title)+'<small>'+s.count+' элементов'+(s.reason&&!s.place?' · '+esc(s.reason):'')+'</small></td>'+
     '<td><input type="number" step="1" data-ms-z0="'+esc(s.key)+'" value="'+esc(h.z0_mm)+'" '+(h.place?'':'disabled')+'></td>'+
     '<td><input type="number" step="1" data-ms-z1="'+esc(s.key)+'" value="'+esc(h.z1_mm)+'" '+(h.place?'':'disabled')+'></td></tr>'}).join("")+'</tbody></table></div>'+
    (plan.problems.length?'<ul class="ir-ms-problems">'+plan.problems.map(p=>'<li>'+esc(p)+'</li>').join("")+'</ul>':'')+
    '<p class="ir-ms-result">Будет расставлено: <b>'+plan.elements+'</b>'+Object.entries(plan.groups).map(([k,v])=>' · '+esc(k)+' '+v).join("")+'</p>'+
    '<p class="muted">Прежняя расстановка из PDF заменяется: те же марки получают новые координаты и отметки (статус монтажа сохраняется), исчезнувшие марки удаляются. Элементы, добавленные вручную, не трогаются. Марок, которых нет в ведомости, программа добавит её сама (вид работ «Монтаж металлоконструкций (из PDF)»), сетку осей — тоже, если её нет.</p>'+
    '<div class="ir-ms-row"><button class="primary big" data-ms-placeit '+(busy||!plan.ready||!canEdit?'disabled':'')+'>Расставить на монтажной схеме</button>'+clearButton()+'</div>'+
    skippedHtml(plan.skipped,plan.skippedCount)
  }
  return'<div class="ir-ms-page">'+body+'</div>'
 }

 // ---- Journal: everything found by the analysis, Claude and the placement.
 const cell=v=>v===null||v===undefined||v===""?'<span class="muted">—</span>':esc(typeof v==="number"?mm(v):v);
 const table=(head,rows)=>'<div class="ir-ms-scroll"><table class="ir-ms-table ir-ms-log"><thead><tr>'+head.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+
  (rows.length?rows.join(""):'<tr><td colspan="'+head.length+'" class="muted">Нет данных</td></tr>')+'</tbody></table></div>';
 const block=(key,title,count,body)=>'<details data-ms-journal="'+key+'" '+(openJournal.has(key)?'open':'')+'><summary>'+esc(title)+(count!==null?' · '+count:'')+'</summary>'+body+'</details>';
 const matches=(...values)=>!filter||values.join(" ").toLowerCase().includes(filter.toLowerCase());
 // Teaching: "this mark (or every mark on these letters) is such a structure", for all objects or one project.
 function teachBlock(){
  const groups={};for(const t of stypes)(groups[t.groupName||t.group]=groups[t.groupName||t.group]||[]).push(t);
  const options='<option value="">— вид конструкции —</option>'+Object.entries(groups).map(([g,list])=>'<optgroup label="'+esc(g)+'">'+list.map(t=>'<option value="'+esc(t.key)+'" '+(t.key===teach.type?'selected':'')+'>'+esc(t.name)+'</option>').join("")+'</optgroup>').join("");
  const rows=knowledge.rules.map(r=>'<tr><td><b>'+esc(r.mark||r.prefix+"…")+'</b></td><td>'+esc(r.typeName)+'</td><td>'+esc(r.project||"подсказка для всех комплектов")+'</td><td><small>'+esc(r.note||"")+'</small></td><td><button type="button" class="ir-ms-link" data-teach-del="'+esc(r.id)+'">удалить</button></td></tr>');
  const notes=knowledge.notes.map(n=>'<li>'+esc(n.text)+' <button type="button" class="ir-ms-link" data-teach-del="'+esc(n.id)+'">удалить</button></li>');
  return'<p class="muted">Что вы укажете здесь, программа запомнит для всех объектов: при расстановке это важнее её собственных догадок, а Claude получает это в каждом запросе.</p>'+
   '<div class="ir-ms-teach"><input data-teach-mark placeholder="Марка (А20) или буквы (А)" value="'+esc(teach.mark)+'">'+
   '<label><input type="checkbox" data-teach-prefix '+(teach.prefix?'checked':'')+'> все марки на эти буквы</label>'+
   '<select data-teach-type>'+options+'</select>'+
   '<input data-teach-project placeholder="Комплект (шифр); пусто — этот комплект" value="'+esc(teach.project)+'">'+
   '<button type="button" class="primary" data-teach-save '+(canEdit?'':'disabled')+'>Запомнить</button></div>'+
   table(["Марка / буквы","Вид конструкции","Где действует","Примечание",""],rows)+
   '<div class="ir-ms-teach"><input data-teach-note placeholder="Заметка для Claude: например, «в проектах КГНТ пояса стенки по 1490 мм»" value="'+esc(teach.note)+'">'+
   '<button type="button" data-teach-note-add '+(canEdit?'':'disabled')+'>Добавить заметку</button></div>'+(notes.length?'<ul class="ir-ms-events">'+notes.join("")+'</ul>':'')+typesBlock()
 }
 // New kinds of structures for the catalog: the engineer's own and those Claude met in the drawings.
 const GEOMETRY_NAME={column:"Стойка (вертикально)",beam:"Горизонтальный элемент",brace:"Наклонный элемент",plate:"Плоский (лист, площадка)"};
 function typesBlock(){
  const gopts=v=>(sgroups.length?sgroups:[{key:"other",label:"Прочее"}]).map(g=>'<option value="'+esc(g.key)+'" '+(g.key===v?'selected':'')+'>'+esc(g.label)+'</option>').join("");
  const geo=v=>Object.entries(GEOMETRY_NAME).map(([k,n])=>'<option value="'+k+'" '+(k===v?'selected':'')+'>'+n+'</option>').join("");
  const own=(knowledge.types||[]).map(t=>'<tr><td><b>'+esc(t.name)+'</b></td><td>'+esc(t.groupName||t.group)+'</td><td>'+esc(GEOMETRY_NAME[t.geometry]||t.geometry)+'</td><td>'+esc((t.marks||[]).join(", "))+'</td><td><small>'+esc((t.words||[]).join(", "))+(t.source&&t.source!=="инженер"?" · "+esc(t.source):"")+'</small></td><td><button type="button" class="ir-ms-link" data-teach-del="'+esc(t.key)+'">удалить</button></td></tr>');
  const offers=(view?.ai?.newTypes||[]).filter(o=>!(knowledge.types||[]).some(t=>t.name.toLowerCase()===String(o.name).toLowerCase()));
  return'<h4 style="margin:16px 0 6px">Виды конструкций</h4><p class="muted">Вида нет в справочнике (например, «Балка-стенка», «Опора под оборудование»)? Добавьте его: программа сразу будет так называть, группировать и рисовать такие элементы, Claude получит его в запросах, а с отправкой на GitHub он попадёт во встроенный справочник для всех компьютеров.</p>'+
   (offers.length?'<div class="ir-ms-card warn"><b>Claude предлагает новые виды</b>'+offers.map((o,i)=>'<p><b>'+esc(o.name)+'</b> — '+esc((sgroups.find(g=>g.key===o.group)||{}).label||o.group)+', '+esc(GEOMETRY_NAME[o.geometry]||o.geometry)+((o.marks||[]).length?', марки '+esc(o.marks.join(", ")):"")+(o.reason?'. <small>'+esc(o.reason)+'</small>':"")+' <button type="button" class="ir-ms-link" data-type-offer="'+i+'" '+(canEdit?'':'disabled')+'>Добавить в справочник</button></p>').join("")+'</div>':'')+
   '<div class="ir-ms-teach"><input data-nt-name placeholder="Наименование, напр. Балка-стенка" value="'+esc(newType.name)+'">'+
   '<select data-nt-group title="Группа на монтажной схеме">'+gopts(newType.group)+'</select><select data-nt-geometry title="Как ставится">'+geo(newType.geometry)+'</select>'+
   '<input data-nt-marks placeholder="Буквы марок через запятую (БСт)" value="'+esc(newType.marks)+'">'+
   '<input data-nt-words placeholder="Слова наименования через запятую (балка-стенк)" value="'+esc(newType.words)+'">'+
   '<button type="button" class="primary" data-nt-save '+(canEdit?'':'disabled')+'>Добавить вид</button></div>'+
   (own.length?table(["Вид","Группа схемы","Геометрия","Буквы марок","Слова наименования",""],own):'')
 }
 function journalPage(){
  if(!view?.journal)return'<div class="ir-ms-page">'+fixesCard()+editsCard()+'<p class="muted">Журнал анализа появится после анализа.</p></div>';
  const j=view.journal,ai=view.ai;
  const marks=j.catalog.filter(c=>matches(c.mark,c.doc,c.profile,(c.sources||[]).join(" ")));
  const elements=j.elements.filter(e=>matches(e.mark,e.group,e.profile,e.file));
  const files=j.files.map(f=>'<tr><td>'+esc(f.name)+'</td><td><b>'+esc(f.type)+'</b></td><td>'+f.pages+'</td><td>'+f.schemes+'</td><td>'+f.marks+'</td></tr>');
  const sheets=j.sheets.map(p=>'<tr><td>'+p.page+'</td><td>'+esc(p.file)+', стр. '+p.sheet+'</td><td>'+esc(p.docType)+'</td><td>'+esc(p.kind)+'</td><td>'+esc(p.name)+
   (p.schemes.length?'<small>'+esc(p.schemes.join("; "))+'</small>':'')+(p.sections?'<small>разрезы: '+p.sections+' марок с отметками</small>':'')+
   (p.noText?(p.ocr?'<small>Текст в кривых — прочитан OCR: '+p.ocr+' надп.; проверьте, лист также уйдёт Claude</small>':'<small class="ir-ms-error">Текст в кривых — локально не читается, лист прочитает только Claude</small>'):'')+'</td><td>'+(p.views||"")+'</td></tr>');
  const markRows=marks.slice(0,1500).map(c=>{
   const short=c.count&&c.planned&&c.planned<c.count,over=c.count&&c.planned>c.count;
   return'<tr class="'+(over?'bad':short?'warn':'')+'"><td><b>'+esc(c.mark)+'</b></td><td>'+cell(c.doc)+'</td><td>'+cell(c.profile)+(c.steel?' <small>'+esc(c.steel)+'</small>':'')+'</td><td>'+cell(c.length_mm)+'</td>'+
    '<td>'+cell(c.z0_mm)+'</td><td>'+cell(c.z1_mm)+'</td><td>'+cell(c.levelsFrom)+'</td><td>'+cell(c.count)+'</td><td>'+(c.planned||'<span class="muted">0</span>')+'</td><td>'+cell(c.mass_kg)+'</td>'+
    '<td><small>'+esc((c.sources||[]).join("; "))+'</small></td></tr>'});
  const elementRows=elements.slice(0,1500).map(e=>'<tr><td><b>'+esc(e.mark)+'</b> <button type="button" class="ir-ms-link" data-teach-pick="'+esc(e.mark)+'" title="Указать вид конструкции для этой марки">✎</button></td><td>'+esc(e.kind||"—")+'<small>'+esc(e.group)+'</small></td><td>'+cell(e.x)+(e.x2!==undefined&&e.x2!==null&&e.x2!==e.x?' → '+mm(e.x2):'')+'</td>'+
   '<td>'+cell(e.y)+(e.y2!==undefined&&e.y2!==null&&e.y2!==e.y?' → '+mm(e.y2):'')+'</td><td>'+cell(e.z0)+'</td><td>'+cell(e.z1)+'</td><td>'+cell(e.levels)+'</td><td>'+cell(e.profile)+'</td><td>'+esc(e.file)+', стр. '+e.sheet+'</td></tr>');
  const log=j.log.map(l=>'<li class="'+(l.error?'bad':'')+'"><time>'+esc(new Date(l.at).toLocaleString("ru-RU"))+'</time>'+esc(l.text)+'</li>');
  // The object's project base: one card per mark, every value with the sheet it was read from.
  const fv=(c,k)=>{const v=c.fields[k];return v?'<span title="'+esc(v.source+(v.status==="confirmed"?" · подтверждено":" · требует проверки"))+'">'+(typeof v.value==="number"?mm(v.value):esc(v.value))+'</span>':'<span class="muted">—</span>'};
  const cards=(j.projectCards||[]).filter(c=>matches(c.mark,c.scope,c.fields.profile?.value,c.fields.steel?.value));
  const cardRows=cards.slice(0,1500).map(c=>'<tr class="'+(c.conflicts.length?'warn':'')+'"><td><b>'+esc(c.mark)+'</b></td><td>'+esc(c.scope)+'</td><td>'+fv(c,"profile")+(c.fields.steel?' <small>'+fv(c,"steel")+'</small>':'')+'</td>'+
   '<td>'+fv(c,"length_mm")+'</td><td>'+fv(c,"size_mm")+'</td><td>'+fv(c,"z0_mm")+'</td><td>'+fv(c,"z1_mm")+'</td><td>'+fv(c,"count")+'</td><td>'+fv(c,"mass_kg")+'</td>'+
   '<td><small>'+esc([...new Set(Object.values(c.fields).map(v=>v.source))].join("; "))+'</small>'+(c.conflicts.length?'<small class="ir-ms-error">Расхождения: '+esc(c.conflicts.join("; "))+'</small>':'')+'</td></tr>');
  const runs=(j.projectLog||[]).map(e=>'<tr class="'+(e.status==="error"?'bad':'')+'"><td>'+esc(new Date(e.at).toLocaleString("ru-RU"))+'</td><td>'+esc(e.file)+'</td><td>'+esc(e.kind||"")+'</td><td>'+(e.sheets??"")+'</td>'+
   '<td>'+(e.marks||[]).length+'</td><td>'+(e.placements||0)+'</td><td>'+(e.duration_ms!=null?Math.round(e.duration_ms/1000)+' с':'')+'</td><td><small>'+esc([...(e.errors||[]),...(e.uncertain||[]),...(e.checks||[])].slice(0,6).join("; "))+'</small></td></tr>');
  // Fasteners of the last processing of each file (the log is newest first).
  const ITEM={bolt:"Болт",nut:"Гайка",washer:"Шайба",anchor:"Фундаментный болт",stud:"Шпилька",screw:"Саморез, винт",rivet:"Заклёпка",pin:"Штифт, шплинт"};
  const lastRun=new Map();for(const e of j.projectLog||[])if(e.status!=="error"&&!lastRun.has(e.file))lastRun.set(e.file,e);
  const fasteners=[...lastRun.values()].flatMap(e=>(e.fasteners||[]).map(f=>({...f,file:e.file}))).filter(f=>matches(f.text,f.file,f.standard));
  const fastenerRows=fasteners.slice(0,1500).map(f=>'<tr class="'+(f.high_strength?'warn':'')+'"><td>'+esc(f.text)+'</td><td>'+esc(ITEM[f.item]||f.item)+(f.high_strength?' <small>высокопрочный</small>':'')+'</td><td>'+(f.d_mm?'М'+f.d_mm:'')+'</td><td>'+(f.length_mm??'')+'</td>'+
   '<td>'+esc(f.strength_class||(f.tensile_MPa?f.tensile_MPa+' МПа':''))+(f.steel?' <small>'+esc(f.steel)+'</small>':'')+'</td><td>'+esc(f.standard||'')+(f.standard_note?'<small class="ir-ms-error">'+esc(f.standard_note)+'</small>':'')+'</td><td>'+(f.count??'')+'</td><td><small>'+esc(f.file)+(f.sheets?.length?', л. '+f.sheets.join(", "):'')+'</small></td></tr>');
  return'<div class="ir-ms-page ir-ms-journal">'+fixesCard()+editsCard()+
   '<input type="search" class="ir-ms-filter" data-ms-filter placeholder="Поиск по марке, профилю, файлу" value="'+esc(filter)+'">'+
   block("files","Файлы",j.files.length,table(["Файл","Тип","Листов","Схем","Марок на сборочных"],files))+
   block("sheets","Листы",j.sheets.length,table(["№","Файл","Документ","Тип листа","Название","Видов марок"],sheets))+
   block("marks","Марки",marks.length,'<p class="muted">Жёлтым — на схеме меньше, чем требуется; красным — больше. Отметки «PDF» прочитаны с вида марки, «Claude» — с картинки.</p>'+
    table(["Марка","Документ","Профиль","Длина","Низ","Верх","Отметки","Требуется","На схеме","Масса, кг","Источник"],markRows))+
   block("cards","Карточки марок объекта",cards.length,'<p class="muted">Проектная база объекта: значения только этого объекта, у каждого — лист и способ (наведите на значение). Всё прочитанное программой требует проверки; жёлтым — листы дают разные значения.</p>'+
    (j.projectError?'<p class="ir-ms-error">'+esc(j.projectError)+'</p>':'')+
    table(["Марка","Документ","Профиль","Длина","Размер вида","Низ","Верх","Требуется","Масса, кг","Откуда"],cardRows))+
   block("fasteners","Метизы",fasteners.length,'<p class="muted">Болты, гайки, шайбы, анкеры из таблиц листов. Метизы не марки: на схему не ставятся. Количество — только из графы «Кол.».</p>'+
    table(["Обозначение","Вид","Резьба","Длина","Класс, прочность","Стандарт","Кол.","Где"],fastenerRows))+
   block("runs","Журнал обработки объекта",(j.projectLog||[]).length,table(["Когда","Файл","Тип","Листов","Марок","Размещений","Время","Ошибки и неопределённости"],runs))+
   block("elements","Элементы к расстановке",elements.length,table(["Марка","Вид конструкции","X, мм","Y, мм","Низ","Верх","Отметки из","Профиль","Лист"],elementRows))+
   (ai?block("ai","Claude",null,'<p>'+(ai.status==="done"?esc(ai.summary||"")+'<br><small>'+esc(ai.model)+' · запросов '+ai.batches+' · марок прочитано '+ai.marks+' · токенов: вход '+mm(ai.usage.input)+', из кэша '+mm(ai.usage.cacheRead)+', запись в кэш '+mm(ai.usage.cacheWrite)+', ответ '+mm(ai.usage.output)+'</small>':
    ai.status==="failed"?'Ошибка: '+esc(ai.error):'Не использовался')+'</p>'):'')+
   block("teach","Обучение программы",knowledge.rules.length+knowledge.notes.length+(knowledge.types||[]).length,teachBlock())+
   block("log","События",j.log.length,'<ul class="ir-ms-events">'+log.join("")+'</ul>')+
  '</div>'
 }

 // ---- Shell: header, sub-page navigation with the state of every step.
 function tabState(key){
  const missing=pdfs.filter(d=>!typed(d)).length;
  if(key==="drawings")return{done:pdfs.length>0&&!missing,note:pdfs.length?(missing?"без типа: "+missing:pdfs.length+" файлов"):"нет файлов"};
  if(key==="analyze")return{done:!!view&&!view.outdated,note:busy==="analyze"?"идёт…":view?.outdated?"устарел — повторите":view?"схем "+view.schemesFound+(view.tank?" · резервуар":""):"не выполнен"};
  if(key==="claude")return{done:aiDone(),note:busy==="ai"?"идёт…":view?.ai?.source==="knowledge"?"из базы знаний":{done:"готово",skipped:"без ИИ",failed:"ошибка",running:"прервано"}[view?.ai?.status]||"не запускался"};
  if(key==="place")return{done:!!view?.placed,note:view?.placed?"расставлено "+view.placed.created:view?.plan?"к расстановке "+view.plan.elements:"—"};
  return{done:false,note:view?.journal?(view.journal.log.length+" событий"):"—"}
 }
 function render(){
  if(!alive())return;
  const page={drawings:drawingsPage,analyze:analyzePage,claude:claudePage,place:placePage,journal:journalPage}[tab]();
  app.innerHTML='<div class="ir-ms"><header class="ir-ms-hero"><div><small>IR PROJECT AI</small><h1>Монтажная схема из PDF</h1><p>'+esc(object.name)+'</p></div>'+
   '<button class="ir-ms-claude '+(engine?.installed?'on':'')+'" data-ms-settings>'+(engine?.installed?'Claude подключён':'Claude не подключён')+'</button></header>'+
   '<nav class="ir-ms-tabs">'+TABS.map(([key,title],i)=>{const st=tabState(key);
    return'<button type="button" data-ms-tab="'+key+'" class="'+(tab===key?'active ':'')+(st.done?'done':'')+'"><span class="ir-ms-num">'+(key==="journal"?"≡":st.done?"✓":i+1)+'</span><span><b>'+esc(title)+'</b><small>'+esc(st.note)+'</small></span></button>'}).join("")+'</nav>'+
   (error?'<div class="ir-ms-error" role="alert">'+esc(error)+'</div>':'')+
   '<section class="ir-ms-content">'+page+'</section></div>';
  const on=(sel,fn,type)=>app.querySelectorAll(sel).forEach(el=>el.addEventListener(type||(el.tagName==="SELECT"||el.tagName==="INPUT"?"change":"click"),fn));
  on("[data-ms-tab]",e=>go(e.currentTarget.dataset.msTab));
  on("[data-ms-go]",e=>go(e.currentTarget.dataset.msGo));
  on("[data-ms-select]",e=>{if(e.target.closest("select,button,input"))return;selected=e.currentTarget.dataset.msSelect;sheetFilter="";render();loadSheets(selected)},"click");
  on("[data-ms-kind]",e=>setKinds([{id:Number(e.target.dataset.msKind),kind:e.target.value}]));
  on("[data-ms-work]",e=>setWorkTypes([{id:Number(e.target.dataset.msWork),workTypeId:e.target.value}]));
  on("[data-ms-work-bulk-apply]",()=>{const w=app.querySelector("[data-ms-work-bulk]")?.value;if(w)setWorkTypes(pdfs.filter(d=>!workOf(d)).map(d=>({id:d.id,workTypeId:w})))});
  on("[data-ms-bulk-apply]",()=>{const kind=app.querySelector("[data-ms-bulk]")?.value;if(kind)setKinds(pdfs.filter(d=>!typed(d)).map(d=>({id:d.id,kind})))});
  on("[data-ms-remove]",e=>{const d=pdfs.find(x=>String(x.id)===e.currentTarget.dataset.msRemove);if(d)removeDocs([d])});
  on("[data-ms-pick]",e=>{const k=e.target.dataset.msPick;if(e.target.checked)picked.add(k);else picked.delete(k);render()});
  on("[data-ms-pick-all]",e=>{picked.clear();if(e.target.checked)for(const d of pdfs)picked.add(String(d.id));render()});
  on("[data-ms-remove-picked]",()=>removeDocs(pdfs.filter(d=>picked.has(String(d.id)))));
  on("[data-ms-remove-all]",()=>removeDocs(pdfs));
  on("[data-ms-upload]",upload);
  const sheetsOf=()=>sheetCache.get(String(selected));
  const filtered=()=>(sheetsOf()?.sheets||[]).filter(s=>!sheetFilter||(s.page+" "+s.name+" "+s.code).toLowerCase().includes(sheetFilter.toLowerCase())).map(s=>s.page);
  on("[data-ms-sheet]",e=>{const ex=new Set(sheetsOf().excluded),n=Number(e.target.dataset.msSheet);if(e.target.checked)ex.delete(n);else ex.add(n);setExcluded(selected,[...ex])});
  on("[data-ms-sheets-on]",()=>{const ex=new Set(sheetsOf().excluded);for(const n of filtered())ex.delete(n);setExcluded(selected,[...ex])});
  on("[data-ms-sheets-off]",()=>{const ex=new Set(sheetsOf().excluded);for(const n of filtered())ex.add(n);setExcluded(selected,[...ex])});
  on("[data-ms-preview]",e=>previewSheet(selected,Number(e.currentTarget.dataset.msPreview)));
  const keepTyping=(sel,apply)=>{const el=app.querySelector(sel);if(el)el.addEventListener("input",e=>{const at=e.target.selectionStart;apply(e.target.value);render();const next=app.querySelector(sel);next?.focus();try{next?.setSelectionRange(at,at)}catch{}})};
  keepTyping("[data-ms-sheet-filter]",v=>{sheetFilter=v});
  keepTyping("[data-ms-filter]",v=>{filter=v});
  on("[data-ms-analyze]",()=>analyze());
  const teachValues=()=>({mark:app.querySelector("[data-teach-mark]")?.value||"",prefix:!!app.querySelector("[data-teach-prefix]")?.checked,
   type:app.querySelector("[data-teach-type]")?.value||"",project:app.querySelector("[data-teach-project]")?.value||"",note:app.querySelector("[data-teach-note]")?.value||""});
  const setCode=()=>{const n=String(pdfs[0]?.name||"").replace(/\.pdf$/i,"");return(/\d{2,}(?:[-.]\d{2,})+/.exec(n)||[n])[0].slice(0,60)};
  const relearn=async()=>{await loadKnowledge();if(view)view=await montage.latest(id);syncHeights()};
  on("[data-teach-pick]",e=>{teach={...teachValues(),mark:e.currentTarget.dataset.teachPick,prefix:false};openJournal.add("teach");render();app.querySelector("[data-teach-type]")?.focus()});
  on("[data-teach-save]",()=>run("teach",async()=>{const v=teachValues();teach=v;if(!v.type)throw Error("Выберите вид конструкции");
   // A mark means different things in different sets: one mark is remembered for this set (its code or file) only.
   const mark=v.mark.trim(),project=v.project.trim()||(v.prefix?"":setCode());
   await invoke("ai-knowledge:set-type",v.prefix?{prefix:mark,type:v.type,project}:{mark,type:v.type,project});
   teach={...teach,mark:"",type:""};await relearn()}));
  on("[data-teach-note-add]",()=>run("teach",async()=>{const v=teachValues();await invoke("ai-knowledge:add-note",{text:v.note});teach={...teach,note:""};await relearn()}));
  const ntValues=()=>({name:app.querySelector("[data-nt-name]")?.value||"",group:app.querySelector("[data-nt-group]")?.value||"other",geometry:app.querySelector("[data-nt-geometry]")?.value||"beam",
   marks:app.querySelector("[data-nt-marks]")?.value||"",words:app.querySelector("[data-nt-words]")?.value||""});
  on("[data-nt-save]",()=>run("teach",async()=>{const v=ntValues();newType=v;await invoke("ai-knowledge:add-type",v);newType={name:"",group:v.group,geometry:v.geometry,marks:"",words:""};await relearn()}));
  on("[data-type-offer]",e=>run("teach",async()=>{const o=(view?.ai?.newTypes||[])[Number(e.currentTarget.dataset.typeOffer)];if(!o)return;
   await invoke("ai-knowledge:add-type",{name:o.name,group:o.group,geometry:o.geometry,marks:o.marks||[],words:o.words||[],note:o.reason||"",source:"предложил Claude"});await relearn()}));
  on("[data-teach-del]",e=>run("teach",async()=>{await invoke("ai-knowledge:remove",{id:e.currentTarget.dataset.teachDel});await relearn()}));
  app.querySelectorAll("[data-ms-journal]").forEach(d=>d.addEventListener("toggle",()=>{if(d.open)openJournal.add(d.dataset.msJournal);else openJournal.delete(d.dataset.msJournal)}));
  on("[data-ms-ai]",async()=>{await processAI(false);if(aiDone())await autoPlace()});
  on("[data-ms-ai-note]",e=>{aiNote=e.target.value},"input");
  on("[data-ms-ai-restart]",()=>{if(confirm("Обработать все листы заново? Уже полученные ответы Claude будут отброшены."))processAI(true)});
  on("[data-ms-skip]",async()=>{await run("skip",async()=>{view=await montage.skipAI(id,view.draftId);syncHeights()});await autoPlace()});
  on("[data-ms-settings]",()=>{
   const open=window.irAiModelSettings?.open;
   if(typeof open!=="function"){error="Настройки ИИ недоступны в этой версии";render();return}
   open(app).then(()=>{const dlg=document.querySelector(".ir-ai-model-dialog");dlg?.addEventListener("close",()=>load(),{once:true})})
  });
  on("[data-ms-place]",e=>{const k=e.target.dataset.msPlace;heights[k]={...heights[k],place:e.target.checked};preview()});
  on("[data-ms-z0]",e=>{const k=e.target.dataset.msZ0;heights[k]={...heights[k],z0_mm:e.target.value};preview()});
  on("[data-ms-z1]",e=>{const k=e.target.dataset.msZ1;heights[k]={...heights[k],z1_mm:e.target.value};preview()});
  on("[data-ms-placeit]",()=>run("place",async()=>{view=await montage.place(id,view.draftId,heights)}));
  on("[data-ms-undo]",()=>{
   if(!confirm("Удалить расставленные элементы из монтажной схемы?"))return;
   run("undo",async()=>{const r=await montage.undo(id,view.draftId);view=r.view;syncHeights()})
  });
  on("[data-ms-clear]",clearScheme);
  on("[data-ms-edits-send]",sendEdits);
  on("[data-ms-open]",()=>{location.hash="#/objects/object/"+id+"/scheme"})
 }
 // Live progress without re-rendering the page.
 const stopProgress=montage.onProgress?.(d=>{
  if(String(d?.objectId)!==id)return;
  progress=d.step==="analyze"?"Файл "+d.file+" из "+d.files+": "+d.name+(d.page?" — лист "+d.page+" из "+d.total+(d.ocr?" · распознаём текст-кривые (OCR)":""):""):
   d.step==="ai"?"Claude обрабатывает листы: пакет "+d.batch+" из "+d.batches+(d.resumed?" (продолжение, готово ранее: "+d.resumed+")":"")+"…":"";
  const el=app.querySelector("[data-ms-progress]");if(el)el.textContent=progress
 });
 window.addEventListener("hashchange",()=>stopProgress?.(),{once:true});
 render();
 await load()
};
