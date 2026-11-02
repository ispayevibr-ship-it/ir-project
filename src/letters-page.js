"use strict";
/*
 * «Исходящие письма» объекта (route #/objects/object/<id>/letters): список писем, письмо — исходящий номер и дата,
 * «на №», адресат, адрес почты, заголовок, текст в редакторе программы (жирный, курсив, подчёркнутый, списки,
 * выравнивание), подпись и исполнитель; выгрузка в Word / PDF на бланке компании и отправка на почту прямо отсюда.
 * Вход в почту — Настройки → «Почта» (window.irMailSettings, тот же диалог открывается и отсюда).
 * Записи раздела объекта «letters» (record_type «letter»); бланк и почта — общие для программы (src/mail-smtp.js).
 * Права: как у ежедневных отчётов.
 */
(()=>{
 const L=window.irLetters;if(!L)return;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
 const call=(channel,payload)=>window.irProject?.ai?.invoke?irProject.ai.invoke(channel,payload):Promise.reject(Error("Нет связи с программой"));
 const errText=e=>/No handler|не зарегистр/i.test(String(e?.message||e))?"Почта и выгрузка писем заработают после перезапуска программы (обновление уже установлено): закройте IR Project и откройте снова.":String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
 const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
 const when=iso=>{const d=new Date(iso);return isNaN(d)?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})};
 const icon=p=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
 const TOOLS=[
  ["bold","Жирный (Ctrl+B)","<b>Ж</b>"],["italic","Курсив (Ctrl+I)","<i>К</i>"],["underline","Подчёркнутый (Ctrl+U)","<u>Ч</u>"],null,
  ["insertUnorderedList","Маркированный список",icon('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')],
  ["insertOrderedList","Нумерованный список",icon('<path d="M10 6h10M10 12h10M10 18h10M4 4v4M3 18h3l-3 2h3"/>')],null,
  ["justifyLeft","По левому краю",icon('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>')],["justifyCenter","По центру",icon('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>')],
  ["justifyRight","По правому краю",icon('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>')],["justifyFull","По ширине",icon('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>')],null,
  ["removeFormat","Убрать оформление",icon('<path d="M6 4h12M12 4l-4 16M4 20l16-16"/>')],["undo","Отменить (Ctrl+Z)",icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>')],["redo","Вернуть (Ctrl+Y)",icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>')]];
 // Бланк и почта программы (главный процесс); до перезапуска программы каналов ещё нет.
 let mailInfo=null;
 const loadMail=async()=>{try{mailInfo=await call("ai-settings:mail-info")}catch(e){mailInfo={error:errText(e),letterhead:{}}}return mailInfo};
 async function companyHead(){
  const head={...(mailInfo?.letterhead||{})};let company=null;try{company=await irProject.company?.get?.()}catch{}
  if(!head.org&&company?.name)head.org=company.name;
  if(company?.logo)try{const url=await irProject.images.read(company.logo);if(url)head.logo=await pngOf(url)}catch(e){console.warn("letter logo",e)}
  return head
 }
 // Логотип для Word — PNG (webp Word не читает) и его пропорция.
 async function pngOf(url){
  const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});
  const k=Math.min(1,600/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);const blob=await new Promise(ok=>c.toBlob(ok,"image/png"));
  return{url,type:"image/png",data:new Uint8Array(await blob.arrayBuffer()),ratio:c.height/c.width}
 }
 // Номера писем всех объектов: следующий исходящий номер — общий для компании.
 async function allNumbers(){
  const out=[];try{const objs=await irProject.data.objects.list();
   for(const o of arr(objs)){const rows=await irProject.data.forObject(o.id).section("letters").list().catch(()=>[]);for(const r of rows)if(r.data?.number)out.push(r.data.number)}}catch{}
  return out
 }
 const letterOf=d=>({...d,blocks:L.blocksFromHtml(d.html||"")});
 const files=async(d,head)=>{const x=letterOf(d);return{name:L.fileName(d),html:L.toHtml(x,head),docx:L.toDocx(x,head)}};

 window.irLettersPage=async oid=>{
  const app=document.getElementById("app"),api=irProject.data.forObject(oid).section("letters"),object=await irProject.data.objects.get(oid);
  let rows=[],cur=null,query="",note="",noteKind="",saveTimer=null,dirty=false,busy=false,headOpen=false;
  const reload=async()=>{rows=(await api.list().catch(()=>[])).filter(r=>(r.record_type||"letter")==="letter").sort((a,b)=>String(b.data?.date||"").localeCompare(String(a.data?.date||""))||Number(b.id)-Number(a.id))};
  await Promise.all([reload(),loadMail()]);
  const say=(text,kind="")=>{note=text;noteKind=kind;const n=app.querySelector("[data-note]");if(n){n.className="ltr-note "+kind;n.textContent=text}};
  const routeOk=()=>new RegExp(`^/objects/object/${oid}/letters$`).test(location.hash.slice(1));
  // ---- список ----
  function listHtml(){
   const q=query.trim().toLowerCase(),shown=rows.filter(r=>!q||[r.data?.number,r.data?.title,r.data?.to,r.data?.email].join(" ").toLowerCase().includes(q));
   const status=d=>{const s=arr(d.sent);if(!s.length)return'<span class="ltr-badge draft">Черновик</span>';const last=s[s.length-1];return`<span class="ltr-badge sent" title="${esc(s.map(x=>when(x.at)+" → "+arr(x.to).join(", ")).join("\n"))}">Отправлено ${esc(when(last.at))}</span><small>${esc(arr(last.to).join(", "))}</small>`};
   return`<div class="ltr-tools"><input id="ltrSearch" placeholder="Поиск по номеру, заголовку, адресату" value="${esc(query)}">${canEdit()?'<button class="primary" id="ltrNew">＋ Новое письмо</button>':""}</div>
   ${shown.length?`<div class="ltr-table"><div class="ltr-row head"><span>Исх. №</span><span>Дата</span><span>Кому</span><span>Заголовок</span><span>Статус</span><span></span></div>${shown.map(r=>{const d=r.data||{};return`<div class="ltr-row" role="button" tabindex="0" data-open="${r.id}"><b>${esc(d.number||"б/н")}</b><span>${esc(L.ruDate(d.date))}</span><span class="ltr-to">${esc(String(d.to||"").split(/\n/).filter(Boolean).join(", "))}</span><span class="ltr-title">${esc(d.title||"Без заголовка")}</span><span class="ltr-st">${status(d)}</span><span class="ltr-act">${canEdit()?`<button type="button" data-copy="${r.id}" title="Копировать письмо"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button>`:""}</span></div>`}).join("")}</div>`
   :`<div class="ltr-empty">${rows.length?"Ничего не найдено":"Писем пока нет."+(canEdit()?" Нажмите «＋ Новое письмо».":"")}</div>`}`
  }
  function headHtml(){
   const h=mailInfo?.letterhead||{},ed=canEdit()&&!mailInfo?.error?"":"disabled";
   return`<div class="ltr-card"><button class="ltr-card-head" id="ltrHeadToggle"><h2>Бланк письма</h2><small>Название и реквизиты компании, начало номера, подпись и исполнитель по умолчанию — для всех объектов. Логотип — из профиля компании.</small><span>${headOpen?"▲":"▼"}</span></button>
   ${headOpen?`${mailInfo?.error?`<div class="ltr-note err">${esc(mailInfo.error)}</div>`:""}<div class="ltr-grid"><label class="wide">Организация (строки бланка)<textarea data-h="org" rows="2" placeholder="ТОО «А-Темир Строй»" ${ed}>${esc(h.org||"")}</textarea></label><label class="wide">Реквизиты (адрес, БИН, телефон, почта)<textarea data-h="details" rows="2" ${ed}>${esc(h.details||"")}</textarea></label>
   <label>Начало номера<input data-h="prefix" placeholder="напр. АТС-" value="${esc(h.prefix||"")}" ${ed}></label><label>Должность подписанта<textarea data-h="signPosition" rows="2" placeholder="Директор ТОО «…»" ${ed}>${esc(h.signPosition||"")}</textarea></label><label>ФИО подписанта<input data-h="signName" placeholder="И.И. Иванов" value="${esc(h.signName||"")}" ${ed}></label><label>Исполнитель<textarea data-h="executor" rows="2" placeholder="Исп.: Петров П.П.&#10;тел. +7 …" ${ed}>${esc(h.executor||"")}</textarea></label></div>
   ${ed?"":'<div class="ltr-actions"><button id="ltrHeadSave">Сохранить бланк</button></div>'}`:""}</div>`
  }
  function mailLine(){
   if(mailInfo?.error)return`<div class="ltr-mail warn">${esc(mailInfo.error)}</div>`;
   return mailInfo?.ready?`<div class="ltr-mail ok">Письма уходят с адреса <b>${esc(mailInfo.user)}</b><button class="link" data-mailset>изменить</button></div>`:`<div class="ltr-mail warn">Почта не подключена — письма можно выгружать в Word и PDF. Чтобы отправлять прямо отсюда, войдите в почту: <button class="link" data-mailset>Настройки → Почта</button></div>`
  }
  function paintList(){
   cur=null;
   app.innerHTML=`<div class="letters-page"><div class="marks-top"><button class="back" id="lettersBack">← Назад</button><div><h1>Исходящие письма</h1><p>${esc(object?.name||"")}</p></div></div>${mailLine()}${headHtml()}${listHtml()}</div>`;
   document.getElementById("lettersBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   const s=document.getElementById("ltrSearch");s.oninput=()=>{query=s.value;const pos=s.selectionStart;paintList();const n=document.getElementById("ltrSearch");n.focus();n.setSelectionRange(pos,pos)};
   document.getElementById("ltrNew")?.addEventListener("click",create);
   app.querySelectorAll("[data-open]").forEach(b=>{const go=()=>{cur=rows.find(r=>String(r.id)===b.dataset.open);if(cur)paintEdit()};b.onclick=ev=>{if(!ev.target.closest("[data-copy]"))go()};b.onkeydown=ev=>{if(ev.key==="Enter"&&ev.target===b)go()}});
   app.querySelectorAll("[data-copy]").forEach(b=>b.onclick=ev=>{ev.stopPropagation();const r=rows.find(x=>String(x.id)===b.dataset.copy);if(r)copyLetter(r)});
   app.querySelectorAll("[data-mailset]").forEach(b=>b.onclick=()=>openMail());
   document.getElementById("ltrHeadToggle").onclick=()=>{headOpen=!headOpen;paintList()};
   document.getElementById("ltrHeadSave")?.addEventListener("click",async()=>{
    const h={};app.querySelectorAll("[data-h]").forEach(i=>h[i.dataset.h]=i.value);
    try{mailInfo=await call("ai-settings:mail-set",{letterhead:h});headOpen=false;paintList()}catch(e){alert(errText(e))}});
  }
  async function create(){
   const h=mailInfo?.letterhead||{},number=L.nextNumber(await allNumbers(),h.prefix||"");
   const data={number,date:today(),to:"",email:"",cc:"",title:"",html:"",sign_position:h.signPosition||"",sign_name:h.signName||"",executor:h.executor||"",reply_number:"",reply_date:"",sent:[]};
   cur=await api.create({record_type:"letter",title:"Исх. "+number,data});await reload();paintEdit()
  }
  // Копия письма: тот же адресат, почта, заголовок, текст и подпись; новый номер, сегодняшняя дата, не отправлено.
  async function copyLetter(src){
   if(busy||!canEdit())return;busy=true;
   try{if(cur&&dirty)await save();const h=mailInfo?.letterhead||{},number=L.nextNumber(await allNumbers(),h.prefix||""),d=src.data||{};
    const data={...d,number,date:today(),reply_number:"",reply_date:"",sent:[],copied_from:d.number||""};
    cur=await api.create({record_type:"letter",title:(d.title||"Исх. "+number).slice(0,200),data});dirty=false;await reload();
    note="Создана копия письма № "+(d.number||"б/н")+" — новый номер "+number+". Проверьте адресата и текст.";noteKind="ok";paintEdit()}
   catch(e){alert(errText(e))}finally{busy=false}
  }
  // ---- письмо ----
  function editHtml(){
   const d=cur.data||{},ed=canEdit()?"":"disabled",f=(k,l,o={})=>`<label class="${o.cls||""}">${esc(l)}<input data-f="${k}" ${o.type?`type="${o.type}"`:""} value="${esc(d[k]||"")}" placeholder="${esc(o.ph||"")}" ${ed}></label>`;
   const sent=arr(d.sent);
   return`<div class="letters-page"><div class="marks-top"><button class="back" id="ltrToList">← К списку писем</button><div><h1>${esc(d.title||"Новое письмо")}</h1><p>${esc(object?.name||"")} · Исх. № ${esc(d.number||"б/н")}</p></div><span class="ltr-saved" data-saved>${dirty?"Не сохранено":"Сохранено"}</span></div>
   <div class="ltr-note ${noteKind}" data-note>${esc(note)}</div>
   <div class="ltr-edit"><div class="ltr-side">
    <div class="ltr-card"><div class="ltr-grid two">${f("number","Исх. №")}${f("date","Дата",{type:"date"})}${f("reply_number","На ваш №",{ph:"если ответ"})}${f("reply_date","от",{type:"date"})}</div>
    <label class="ltr-lbl">Кому (адресат)<textarea data-f="to" rows="4" placeholder="Директору ТОО «…»&#10;Иванову И.И." ${ed}>${esc(d.to||"")}</textarea></label>
    ${f("email","Эл. почта получателя",{ph:"name@company.kz; можно несколько через ;",cls:"ltr-lbl"})}${f("cc","Копия",{ph:"необязательно",cls:"ltr-lbl"})}</div>
    <div class="ltr-card"><label class="ltr-lbl">Должность подписанта<textarea data-f="sign_position" rows="2" ${ed}>${esc(d.sign_position||"")}</textarea></label>${f("sign_name","ФИО подписанта",{cls:"ltr-lbl"})}
    <label class="ltr-lbl">Исполнитель<textarea data-f="executor" rows="2" ${ed}>${esc(d.executor||"")}</textarea></label></div>
    ${sent.length?`<div class="ltr-card"><h3>Отправлено</h3>${sent.slice().reverse().map(s=>`<div class="ltr-sent"><b>${esc(when(s.at))}</b> ${esc(arr(s.to).join(", "))}${arr(s.cc).length?`<small>копия: ${esc(arr(s.cc).join(", "))}</small>`:""}<small>с ${esc(s.from||"")} · ${esc((s.format||"").toUpperCase())}</small></div>`).join("")}</div>`:""}
   </div><div class="ltr-main">
    <input class="ltr-title-input" data-f="title" placeholder="Заголовок письма (напр. «О поставке металлоконструкций»)" value="${esc(d.title||"")}" ${ed}>
    ${ed?"":`<div class="ltr-toolbar">${TOOLS.map(t=>t?`<button type="button" data-cmd="${t[0]}" title="${esc(t[1])}">${t[2]}</button>`:'<i></i>').join("")}</div>`}
    <div class="ltr-paper"><div class="ltr-editor" id="ltrEditor" contenteditable="${ed?"false":"true"}" spellcheck="true" data-ph="Текст письма…">${L.blocksHtml(L.blocksFromHtml(d.html||""))}</div></div>
    <div class="ltr-actions"><button id="ltrDocx">Выгрузить в Word</button><button id="ltrPdf">Выгрузить в PDF</button><button id="ltrCopy" title="Новое письмо с тем же адресатом и текстом, со следующим номером">Копировать письмо</button><button class="primary" id="ltrSend">Отправить на почту</button><span class="grow"></span>${canEdit()?'<button class="danger" id="ltrDel">Удалить письмо</button>':""}</div>
   </div></div></div>`
  }
  const collect=()=>{const d={...(cur.data||{})};app.querySelectorAll("[data-f]").forEach(i=>d[i.dataset.f]=i.value);const e=document.getElementById("ltrEditor");if(e)d.html=L.blocksHtml(L.blocksFromHtml(e.innerHTML));return d};
  const markSaved=t=>{const s=app.querySelector("[data-saved]");if(s)s.textContent=t};
  async function save(){
   if(!cur||!canEdit())return;clearTimeout(saveTimer);saveTimer=null;const data=collect();
   try{const r=await api.update(cur.id,{record_type:"letter",title:(data.title||"Исх. "+(data.number||"")).slice(0,200),data});if(r)cur=r;else cur.data=data;dirty=false;markSaved("Сохранено");
    const i=rows.findIndex(x=>x.id===cur.id);if(i>=0)rows[i]=cur}catch(e){markSaved("Не сохранено: "+errText(e))}
  }
  const later=()=>{dirty=true;markSaved("Сохраняется…");clearTimeout(saveTimer);saveTimer=setTimeout(save,900)};
  // Лишнее оформление из Word и сайтов не нужно: вставляется текст.
  function bindEditor(e){
   e.addEventListener("input",later);
   e.addEventListener("paste",ev=>{ev.preventDefault();const t=ev.clipboardData?.getData("text/plain")||"";document.execCommand("insertText",false,t)});
   e.addEventListener("keydown",ev=>{if(ev.key==="Tab"){ev.preventDefault();document.execCommand(ev.shiftKey?"outdent":"indent")}});
   try{document.execCommand("defaultParagraphSeparator",false,"p")}catch{}
   app.querySelectorAll("[data-cmd]").forEach(b=>{b.onmousedown=ev=>ev.preventDefault();b.onclick=()=>{e.focus();document.execCommand(b.dataset.cmd,false,null);later();tools()}});
   const tools=()=>app.querySelectorAll("[data-cmd]").forEach(b=>{let on=false;try{on=/^(bold|italic|underline|insert|justify)/.test(b.dataset.cmd)&&document.queryCommandState(b.dataset.cmd)}catch{}b.classList.toggle("on",on)});
   document.addEventListener("selectionchange",()=>{if(document.activeElement===e)tools()});
  }
  function paintEdit(){
   app.innerHTML=editHtml();
   document.getElementById("ltrToList").onclick=async()=>{if(dirty)await save();note="";await reload();paintList()};
   app.querySelectorAll("[data-f]").forEach(i=>i.addEventListener("input",()=>{later();if(i.dataset.f==="title"){const h=app.querySelector(".marks-top h1");if(h)h.textContent=i.value||"Новое письмо"}}));
   const e=document.getElementById("ltrEditor");if(canEdit())bindEditor(e);
   document.getElementById("ltrDocx").onclick=()=>exportAs("docx");
   document.getElementById("ltrPdf").onclick=()=>exportAs("pdf");
   document.getElementById("ltrSend").onclick=()=>sendDialog();
   document.getElementById("ltrCopy").onclick=()=>copyLetter(cur);
   document.getElementById("ltrDel")?.addEventListener("click",async()=>{if(!confirm(`Удалить письмо «${cur.data?.title||cur.data?.number||""}»?`))return;clearTimeout(saveTimer);await api.remove(cur.id);dirty=false;await reload();paintList()});
  }
  async function exportAs(format){
   if(busy)return;busy=true;try{if(dirty)await save();say(format==="pdf"?"Готовим PDF…":"Готовим Word…");
    const head=await companyHead(),x=await files(collect(),head);
    const r=await call("ai-documents:letter-export",{format,name:x.name,html:format==="pdf"?x.html:"",docx:format==="docx"?x.docx:null});
    say(r?.path?"Сохранено: "+r.path:"","ok")}catch(e){say(errText(e),"err")}finally{busy=false}
  }
  // ---- отправка ----
  async function sendDialog(){
   if(dirty)await save();await loadMail();
   if(!mailInfo?.ready){if(mailInfo?.error){say(mailInfo.error,"err");return}
    if(confirm("Почта не подключена. Открыть Настройки → «Почта», чтобы войти в почтовый ящик?"))await openMail();await loadMail();if(!mailInfo?.ready)return}
   const d=collect(),subject=(d.title?d.title+" — ":"")+L.numberText(d).replace(/^Исх\. /,"исх. ");
   const sign=[d.sign_position&&String(d.sign_position).split(/\n/).join(" "),d.sign_name].filter(Boolean).join(" ");
   const text=`Добрый день!\n\nНаправляем письмо ${L.numberText(d).replace(/^Исх\. /,"исх. ")}${d.title?" «"+d.title+"»":""}. Письмо во вложении.\n\nС уважением,\n${sign||mailInfo.fromName||""}${object?.name?"\nОбъект: "+object.name:""}`;
   const dlg=document.createElement("dialog");dlg.className="ltr-send";let extra=[];
   dlg.innerHTML=`<form method="dialog"><h2>Отправить письмо</h2><p class="ltr-from">С адреса <b>${esc(mailInfo.user)}</b>${mailInfo.copySelf?" · копия придёт вам":""}</p>
    <label>Кому<input name="to" value="${esc(d.email||"")}" placeholder="name@company.kz; можно несколько через ;" required></label>
    <label>Копия<input name="cc" value="${esc(d.cc||"")}"></label>
    <label>Тема<input name="subject" value="${esc(subject)}"></label>
    <label>Текст письма<textarea name="text" rows="8">${esc(text)}</textarea></label>
    <div class="ltr-fmt">Письмо во вложении: <label><input type="radio" name="fmt" value="pdf" checked> PDF</label><label><input type="radio" name="fmt" value="docx"> Word</label><button type="button" data-add>＋ Приложить файлы</button></div>
    <div class="ltr-files" data-files></div>
    <div class="ltr-note" data-st></div>
    <div class="ltr-actions"><span class="grow"></span><button type="button" data-cancel>Отмена</button><button type="submit" class="primary" data-go>Отправить</button></div></form>`;
   document.body.appendChild(dlg);dlg.showModal();dlg.addEventListener("close",()=>dlg.remove());
   const st=dlg.querySelector("[data-st]"),go=dlg.querySelector("[data-go]");
   const paintFiles=()=>{dlg.querySelector("[data-files]").innerHTML=extra.map((f,i)=>`<span>${esc(f.name)} <button type="button" data-rm="${i}" title="Убрать">✕</button></span>`).join("");dlg.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{extra.splice(Number(b.dataset.rm),1);paintFiles()})};
   dlg.querySelector("[data-cancel]").onclick=()=>dlg.close();
   dlg.querySelector("[data-add]").onclick=async()=>{try{extra=extra.concat(await call("ai-documents:letter-attach")||[]);paintFiles()}catch(e){st.className="ltr-note err";st.textContent=errText(e)}};
   dlg.querySelector("form").onsubmit=async ev=>{
    ev.preventDefault();if(go.disabled)return;const fd=new FormData(ev.target),format=fd.get("fmt");go.disabled=true;st.className="ltr-note";st.textContent="Отправляем…";
    try{const head=await companyHead(),x=await files(collect(),head);
     const r=await call("ai-settings:mail-send",{to:fd.get("to"),cc:fd.get("cc"),subject:fd.get("subject"),text:fd.get("text"),letter:{format,name:x.name,html:format==="pdf"?x.html:"",docx:format==="docx"?x.docx:null,extra}});
     const data={...collect(),sent:[...arr(cur.data?.sent),{at:r.at,to:r.to,cc:r.cc,from:r.from,format,subject:fd.get("subject")}]};
     if(!data.email)data.email=String(fd.get("to")||"");
     cur=await api.update(cur.id,{record_type:"letter",title:(data.title||"Исх. "+(data.number||"")).slice(0,200),data})||{...cur,data};dirty=false;
     dlg.close();note="Письмо отправлено: "+r.to.join(", ");noteKind="ok";if(routeOk())paintEdit()}
    catch(e){st.className="ltr-note err";st.textContent=errText(e);go.disabled=false}
   };
  }
  async function openMail(){if(window.irMailSettings?.open)await window.irMailSettings.open(document.body);await loadMail();if(!cur&&routeOk())paintList()}
  paintList()
 };

 // ---- Настройки → «Почта»: вход в почтовый ящик ----
 const STYLE_ID="ir-mail-style-1";
 const CSS=`.ir-mail{inset:0;margin:auto;box-sizing:border-box;width:min(640px,96vw);max-height:92vh;padding:0;border:0;border-radius:16px;background:#f3f6fa;color:#1d3247;box-shadow:0 30px 90px rgba(8,28,48,.45);font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;overflow:auto}
.ir-mail *{box-sizing:border-box}.ir-mail::backdrop{background:rgba(6,24,42,.62)}
.ir-mail-head{display:flex;justify-content:space-between;gap:16px;padding:20px 24px;background:linear-gradient(115deg,#0f3553,#17628b);color:#fff}
.ir-mail-head small{display:block;font-size:10.5px;letter-spacing:.12em;font-weight:700;color:#9fd0ee}.ir-mail-head h2{margin:4px 0;font-size:21px;color:#fff}.ir-mail-head p{margin:0;font-size:12px;color:#cfe5f3}
.ir-mail-x{flex:none;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
.ir-mail-body{padding:18px 24px;display:grid;gap:12px}
.ir-mail-body label{display:grid;gap:4px;font-size:11.5px;font-weight:600;color:#3c5568}
.ir-mail-body input,.ir-mail-body select{height:36px;border:1px solid #cfdbe5;border-radius:8px;padding:0 10px;font:inherit;background:#fff}
.ir-mail-row{display:grid;grid-template-columns:2fr 1fr 1.3fr;gap:10px}
.ir-mail-body .ir-mail-check{display:flex;justify-content:flex-start;align-items:center;gap:8px;font-weight:500}.ir-mail-body .ir-mail-check input{flex:none;width:16px;height:16px;margin:0;padding:0}.ir-mail-check span{flex:1}
.ir-mail-help{padding:10px 12px;border-radius:9px;background:#eaf3fb;border:1px solid #d3e4f2;color:#2f5876;font-size:11.5px}
.ir-mail-st{min-height:18px;font-size:12px}.ir-mail-st.ok{color:#1f7a4c}.ir-mail-st.err{color:#b4321f}
.ir-mail-foot{display:flex;gap:8px;align-items:center;padding:14px 24px;border-top:1px solid #dbe5ee;background:#fff}.ir-mail-foot .grow{flex:1}
.ir-mail-btn{height:36px;padding:0 14px;border:1px solid #c9d8e4;border-radius:8px;background:#fff;color:#1d4f75;font-weight:650;cursor:pointer}.ir-mail-btn.main{background:#176dc1;border-color:#176dc1;color:#fff}.ir-mail-btn:disabled{opacity:.5;cursor:default}
.ir-mail-btn.danger{color:#b4321f;border-color:#efc9c3}`;
 async function openSettings(menu){
  const doc=menu?.ownerDocument||document;
  if(!doc.getElementById(STYLE_ID)){const s=doc.createElement("style");s.id=STYLE_ID;s.textContent=CSS;doc.head.appendChild(s)}
  if(window.irAccess?.role?.()==="guest"){alert("Почту подключает администратор или инженер (войдите в профиль).");return}
  let info;try{info=await call("ai-settings:mail-info")}catch(e){alert(errText(e));return}
  const dlg=doc.createElement("dialog");dlg.className="ir-mail";
  dlg.innerHTML=`<form><div class="ir-mail-head"><div><small>IR PROJECT · НАСТРОЙКИ</small><h2>Почта</h2><p>Вход в почтовый ящик, с которого раздел «Исходящие письма» отправляет письма. Пароль хранится на этом компьютере зашифрованным.</p></div><button type="button" class="ir-mail-x" data-close aria-label="Закрыть">✕</button></div>
   <div class="ir-mail-body"><label>Адрес почты<input name="user" type="email" autocomplete="off" value="${esc(info.user)}" placeholder="name@gmail.com" required></label>
   <label>Пароль${info.hasPassword?" (сохранён — введите, чтобы заменить)":""}<input name="password" type="password" autocomplete="new-password" placeholder="${info.hasPassword?"••••••••":"пароль приложения"}"></label>
   <label>Имя отправителя<input name="fromName" value="${esc(info.fromName)}" placeholder="ТОО «А-Темир Строй», ПТО"></label>
   <div class="ir-mail-row"><label>Сервер SMTP<input name="host" value="${esc(info.host)}" placeholder="smtp.gmail.com"></label><label>Порт<input name="port" inputmode="numeric" value="${esc(info.port||465)}"></label><label>Шифрование<select name="security"><option value="ssl" ${info.security!=="starttls"?"selected":""}>SSL (порт 465)</option><option value="starttls" ${info.security==="starttls"?"selected":""}>STARTTLS (порт 587)</option></select></label></div>
   <label class="ir-mail-check"><input type="checkbox" name="copySelf" ${info.copySelf?"checked":""}><span>Присылать себе копию каждого отправленного письма</span></label>
   <div class="ir-mail-help" data-help></div><div class="ir-mail-st" data-st>${info.ready?(info.checkedAt?"Почта подключена, проверена "+esc(when(info.checkedAt)):"Почта сохранена"):""}</div></div>
   <div class="ir-mail-foot">${info.user?'<button type="button" class="ir-mail-btn danger" data-out>Выйти из почты</button>':""}<span class="grow"></span><button type="button" class="ir-mail-btn" data-close>Закрыть</button><button type="submit" class="ir-mail-btn main" data-go>Сохранить и проверить</button></div></form>`;
  doc.body.appendChild(dlg);dlg.showModal();
  const form=dlg.querySelector("form"),st=dlg.querySelector("[data-st]"),help=dlg.querySelector("[data-help]"),go=dlg.querySelector("[data-go]");
  const preset=u=>{const dom=String(u||"").split("@")[1]?.toLowerCase()||"";return arr(info.presets).find(p=>arr(p.domains).includes(dom))};
  const showHelp=()=>{const p=preset(form.user.value);help.innerHTML=p?esc(p.help):"Для корпоративной почты сервер, порт и шифрование даёт администратор почты (обычно smtp.<домен>, порт 465 SSL или 587 STARTTLS). Если в ящике включён двухэтапный вход — нужен пароль приложения."};
  form.user.addEventListener("input",()=>{const p=preset(form.user.value);if(p){form.host.value=p.host;form.port.value=p.port;form.security.value=p.security}showHelp()});
  form.security.onchange=()=>{if(form.security.value==="ssl"&&form.port.value==="587")form.port.value="465";if(form.security.value==="starttls"&&form.port.value==="465")form.port.value="587"};
  showHelp();
  return new Promise(resolve=>{
   dlg.addEventListener("close",()=>{dlg.remove();resolve()},{once:true});
   dlg.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>dlg.close());
   dlg.querySelector("[data-out]")?.addEventListener("click",async()=>{if(!confirm("Выйти из почты? Адрес и пароль будут удалены с этого компьютера."))return;try{await call("ai-settings:mail-clear");dlg.close()}catch(e){st.className="ir-mail-st err";st.textContent=errText(e)}});
   form.onsubmit=async ev=>{ev.preventDefault();go.disabled=true;st.className="ir-mail-st";st.textContent="Сохраняем и входим в почту…";
    try{const v={user:form.user.value.trim(),fromName:form.fromName.value,host:form.host.value.trim(),port:form.port.value,security:form.security.value,copySelf:form.copySelf.checked};
     if(form.password.value)v.password=form.password.value;
     await call("ai-settings:mail-set",v);form.password.value="";
     info=await call("ai-settings:mail-test");st.className="ir-mail-st ok";st.textContent="Вход выполнен — письма можно отправлять."}
    catch(e){st.className="ir-mail-st err";st.textContent=errText(e)}finally{go.disabled=false}}
  })
 }
 window.irMailSettings={open:openSettings};
})();
