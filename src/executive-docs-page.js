"use strict";
/*
 * «Исполнительная документация» of an object (route #/objects/object/<id>/executive-docs): the participants (technical
 * and author's supervision only when they exist), the period and the work type, the acts to make, the documents of
 * quality — each metal, fastener, electrode, paint and primer a separate point — and «Выгрузить» to Word or PDF.
 * Records of the object section «executive-docs»: one «settings», and a «certificate» per point of the documents of quality.
 * Rights: those of the daily reports.
 */
(()=>{
 const X=window.irExecDocs;if(!X)return;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const arr=v=>Array.isArray(v)?v:[];
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("reports"):false;
 const call=(channel,payload)=>window.irProject?.ai?.invoke?irProject.ai.invoke(channel,payload):Promise.reject(Error("Нет связи с программой"));
 const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
 const DOC_KINDS=["Сертификат качества","Паспорт качества","Сертификат соответствия","Декларация о соответствии","Протокол испытаний"];
 // The last choice of the period, work type and acts is kept for the next export.
 const DEFAULT_ACTS=["aosr","aook","certs"];
 async function loadAll(oid){
  const root=irProject.data.forObject(oid),get=k=>root.section(k).list().catch(()=>[]);
  const [own,marks,workTypes,reports,scheme,logs,kb,object,company]=await Promise.all([get("executive-docs"),get("marks"),get("work-types"),get("reports"),get("scheme"),get("ai-project-log"),get("ai-project-kb"),irProject.data.objects.get(oid),irProject.company?.get?.().catch(()=>null)]);
  let fast=[];try{if(window.irFasteners){const d=await window.irFasteners.load(oid);fast=window.irFasteners.account(d).rows.map(r=>({text:r.text,total:r.total,marks:arr(r.marks).map(m=>m?.mark||m)}))}}catch(e){console.warn("exec docs: fasteners",e)}
  const texts=[];let size=0;for(const r of[...logs,...kb]){const t=JSON.stringify(r.data||{});if(size+t.length>3e6)break;size+=t.length;texts.push(t)}
  const settingsRec=own.find(r=>r.record_type==="settings")||null,certs=own.filter(r=>r.record_type==="certificate");
  const markRows=marks.map(r=>({id:String(r.id),...(r.data||{}),title:r.title||r.data?.title||""})).filter(x=>x.accounting_type!=="service");
  const s=settingsRec?.data||{};
  // What the object already knows fills the empty fields.
  const settings={...s,object:{name:object?.name||"",address:object?.address||"",...(s.object||{})},participants:{...(s.participants||{})}};
  const fill=(key,org)=>{const p=settings.participants[key]||{};if(!p.org&&org)settings.participants[key]={...p,org}};
  fill("customer",object?.customer);fill("general",object?.general_contractor);fill("contractor",company?.name);
  const needs=X.needs({marks:markRows,scheme,fasteners:fast,texts,records:certs});
  return{object,settingsRec,settings,certs,marks:markRows,workTypes:workTypes.map(r=>({id:String(r.id),...(r.data||{}),name:r.data?.name||r.title||""})),reports,scheme,needs}
 }
 window.irExecDocsPage=async oid=>{
  const app=document.getElementById("app"),api=irProject.data.forObject(oid).section("executive-docs");
  let D=await loadAll(oid),open={people:false,certs:true},busy=false,note="",filterGroup="",editing=null,adding=null;
  const last=()=>D.settings.last||{};
  const saveSettings=async patch=>{D.settings={...D.settings,...patch};const payload={record_type:"settings",title:"Настройки исполнительной документации",data:D.settings};
   if(D.settingsRec)D.settingsRec=await api.update(D.settingsRec.id,payload)||D.settingsRec;else D.settingsRec=await api.create(payload)};
  const certRecord=async(need,patch)=>{const r=need.record,data={key:need.key,group:need.group,title:need.title,...(r?.data||{}),...patch},payload={record_type:"certificate",title:need.title,data};
   if(r)await api.update(r.id,payload);else await api.create(payload)};
  const reload=async()=>{D=await loadAll(oid);paint()};
  function peopleHtml(){
   const P=D.settings.participants||{},ed=canEdit();
   return X.ROLES.map(r=>{const p=P[r.key]||{},on=r.optional?p.enabled===true:p.enabled!==false;
    return`<div class="exd-person ${on?"":"off"}" data-role="${r.key}"><label class="exd-check"><input type="checkbox" data-f="enabled" ${on?"checked":""} ${ed?"":"disabled"}> <b>${esc(r.name)}</b>${r.optional?' <small>если есть</small>':""}</label>
     <div class="exd-grid"><label>Организация<input data-f="org" value="${esc(p.org||"")}" ${ed?"":"disabled"}></label><label>Должность<input data-f="position" value="${esc(p.position||"")}" ${ed?"":"disabled"}></label><label>ФИО<input data-f="fio" value="${esc(p.fio||"")}" ${ed?"":"disabled"}></label><label>Документ о полномочиях (приказ №, дата)<input data-f="order" value="${esc(p.order||"")}" ${ed?"":"disabled"}></label></div></div>`}).join("")
  }
  function objectHtml(){
   const o=D.settings.object||{},ed=canEdit()?"":"disabled",f=(k,l,ph="")=>`<label>${esc(l)}<input data-o="${k}" value="${esc(o[k]||"")}" placeholder="${esc(ph)}" ${ed}></label>`;
   return`<div class="exd-grid">${f("name","Объект")}${f("address","Адрес")}${f("city","Город (место составления)")}${f("project_code","Шифр проекта","напр. 047-2025-КМ")}${f("designer","Проектная организация")}<label>Номер первого акта<input data-s="start_number" inputmode="numeric" value="${esc(D.settings.start_number||"1")}" ${ed}></label><label>Экземпляров<input data-s="copies" value="${esc(D.settings.copies||"3")}" ${ed}></label><label class="wide">Разрешается производство последующих работ<input data-s="next_works" value="${esc(D.settings.next_works||"")}" placeholder="напр. монтаж ограждающих конструкций" ${ed}></label></div>`
  }
  function exportHtml(){
   const L=last(),acts=new Set(L.acts||DEFAULT_ACTS),from=L.from||firstDate(),to=L.to||today();
   const preview=X.buildPackage({settings:D.settings,reports:D.reports,marks:D.marks,scheme:D.scheme,workTypes:D.workTypes,needsList:D.needs,acts:[...acts],from,to,workTypeId:L.workTypeId||"",split:L.split||"period"});
   const missing=preview.missing;
   return`<div class="exd-grid exd-period"><label>С<input type="date" id="exdFrom" value="${esc(from)}"></label><label>По<input type="date" id="exdTo" value="${esc(to)}"></label>
    <label class="wide">Вид работы<select id="exdWork"><option value="">Все виды работ</option>${D.workTypes.map(w=>`<option value="${esc(w.id)}" ${String(L.workTypeId||"")===w.id?"selected":""}>${esc(w.name)}${w.code?" ("+esc(w.code)+")":""}</option>`).join("")}</select></label>
    <label>Акты<select id="exdSplit"><option value="period" ${L.split!=="day"?"selected":""}>один на период</option><option value="day" ${L.split==="day"?"selected":""}>отдельно за каждый день</option></select></label></div>
    <div class="exd-acts">${X.ACTS.map(a=>`<label class="exd-act ${acts.has(a.key)?"on":""}"><input type="checkbox" data-act="${a.key}" ${acts.has(a.key)?"checked":""}><span><b>${esc(a.name)}</b><small>${esc(a.basis)}</small></span></label>`).join("")}</div>
    <div class="exd-summary">За период — ${preview.works.length?`<b>${preview.works.length}</b> позиций работ (${esc(preview.works.slice(0,6).map(r=>r.mark||r.work_type).join(", "))}${preview.works.length>6?"…":""})`:"<b>работ в ежедневных отчётах нет</b>"}; документов к выгрузке: <b>${preview.docs.length}</b>; документов о качестве в папку: <b>${preview.attachments.length}</b>.</div>
    ${missing.length?`<div class="exd-warn">Нет документа о качестве у ${missing.length} поз.: ${esc(missing.slice(0,8).map(x=>x.title).join("; "))}${missing.length>8?"…":""}. В актах будет «документ о качестве не загружен».</div>`:""}
    <div class="exd-actions"><button class="primary" id="exdDocx" ${busy?"disabled":""}>Выгрузить исполнительную документацию — Word</button><button class="primary exd-pdf" id="exdPdf" ${busy?"disabled":""}>Выгрузить — PDF</button>${note?`<span class="exd-note">${note}</span>`:""}</div>`
  }
  const firstDate=()=>{const d=D.reports.map(r=>String((r.data||{}).date||"").slice(0,10)).filter(Boolean).sort();return d[0]||today()};
  function certsHtml(){
   const ed=canEdit(),list=D.needs.filter(x=>!filterGroup||x.group===filterGroup),done=D.needs.filter(x=>!x.hidden&&x.docs.length).length,total=D.needs.filter(x=>!x.hidden).length;
   const groups=X.GROUPS.filter(g=>D.needs.some(x=>x.group===g.key)||g.key==="other");
   const rows=groups.map(g=>{const items=list.filter(x=>x.group===g.key);if(!items.length&&filterGroup&&filterGroup!==g.key)return"";if(!items.length&&g.key!=="other")return"";
    return`<div class="exd-group"><div class="exd-group-head"><b>${esc(g.name)}</b><small>${esc(g.hint)}</small>${ed?`<button data-addcustom="${g.key}" class="exd-mini">＋ пункт</button>`:""}</div>${ed&&adding===g.key?newItemHtml(g):""}${items.map(x=>itemHtml(x,ed)).join("")||(adding===g.key?"":'<div class="exd-empty">Пунктов нет</div>')}</div>`}).join("");
   return`<div class="exd-cert-top"><div class="exd-progress"><b>${done} из ${total}</b> пунктов с документами<div class="exd-bar"><i style="width:${total?Math.round(done/total*100):0}%"></i></div></div><select id="exdGroup"><option value="">Все группы</option>${X.GROUPS.map(g=>`<option value="${g.key}" ${filterGroup===g.key?"selected":""}>${esc(g.name)}</option>`).join("")}</select></div>${rows}`
  }
  // A new point of the group: its name typed in the page (a window of the system asking for it does not open in the program).
  function newItemHtml(g){
   return`<div class="exd-newitem"><input id="exdNewTitle" placeholder="Наименование, напр. «Электроды УОНИ-13/55 Э50А ⌀4 мм», «Эмаль ПФ-115 серая»" maxlength="200"><button class="primary exd-mini" id="exdNewSave">Добавить</button><button class="exd-mini ghost" id="exdNewCancel">Отмена</button></div>`
  }
  function itemHtml(x,ed){
   const st=x.hidden?"hidden":x.docs.length?"ok":"no";
   const docs=x.docs.map((d,i)=>`<div class="exd-doc"><span>${esc(X.certText(d))}${d.qty?` · ${esc(d.qty)}`:""}</span>${d.file?.path?`<button class="exd-link" data-open="${esc(x.key)}" data-i="${i}">${esc(d.file.name||"файл")}</button>`:'<small class="exd-nofile">без файла</small>'}${ed?`<button class="exd-x" data-deldoc="${esc(x.key)}" data-i="${i}" title="Удалить">×</button>`:""}</div>`).join("");
   const form=editing&&editing.key===x.key?docForm(editing):"";
   return`<div class="exd-item ${st}"><div class="exd-item-head"><span class="exd-dot"></span><div><b>${esc(x.title)}</b>${x.detail?`<small>${esc(x.detail)}</small>`:""}${arr(x.marks).length?`<small>марки: ${esc(arr(x.marks).slice(0,10).join(", "))}${x.marks.length>10?` и ещё ${x.marks.length-10}`:""}</small>`:""}${x.source?`<small>${esc(x.source)}</small>`:""}</div>
    ${ed?`<div class="exd-item-act"><button data-adddoc="${esc(x.key)}" class="exd-mini">＋ Загрузить документ</button><button data-hide="${esc(x.key)}" class="exd-mini ghost" title="${x.hidden?"Вернуть пункт":"Не нужен на этом объекте"}">${x.hidden?"Вернуть":"Не нужен"}</button>${x.custom?`<button data-delitem="${esc(x.key)}" class="exd-mini ghost">Удалить</button>`:""}</div>`:""}</div>${docs}${form}</div>`
  }
  function docForm(e){
   return`<div class="exd-docform"><div class="exd-grid"><label>Вид документа<select data-d="kind">${DOC_KINDS.map(k=>`<option ${e.kind===k?"selected":""}>${k}</option>`).join("")}</select></label><label>Номер<input data-d="number" value="${esc(e.number||"")}"></label><label>Дата<input type="date" data-d="date" value="${esc(e.date||"")}"></label><label>Поставщик / изготовитель<input data-d="supplier" value="${esc(e.supplier||"")}"></label><label>Партия, количество<input data-d="qty" value="${esc(e.qty||"")}"></label><label>Файл<span class="exd-file">${e.file?esc(e.file.name):"не выбран"} <button class="exd-mini" id="exdPick">${e.file?"Заменить":"Выбрать файл"}</button></span></label></div><div class="exd-form-act"><button class="primary" id="exdDocSave">Сохранить</button><button id="exdDocCancel">Отмена</button></div></div>`
  }
  function paint(){
   const ed=canEdit();
   app.innerHTML=`<div class="exec-docs-page"><div class="marks-top"><button class="back" id="execDocsBack">← Назад</button><div><h1>Исполнительная документация</h1><p>${esc(D.object?.name||"")}</p></div></div>
    <section class="exd-card"><div class="exd-card-head"><h2>Выгрузка</h2><small>период, вид работы и какие акты нужны</small></div>${exportHtml()}</section>
    <section class="exd-card"><button class="exd-card-head exd-toggle" data-open="people"><h2>Участники и объект</h2><small>${esc(X.people(D.settings).map(p=>p.name.split(" (")[0]).join(" · "))}</small><span>${open.people?"▴":"▾"}</span></button>${open.people?`${objectHtml()}${peopleHtml()}${ed?"":'<p class="exd-help">Изменять может тот, у кого есть права на ежедневные отчёты.</p>'}`:""}</section>
    <section class="exd-card"><button class="exd-card-head exd-toggle" data-open="certs"><h2>Документы о качестве</h2><small>металл, метизы, электроды, грунтовка, краска — каждый отдельным пунктом</small><span>${open.certs?"▴":"▾"}</span></button>${open.certs?certsHtml():""}</section>
    <p class="exd-help">Работы актов берутся из ежедневных отчётов за выбранный период и вид работы, марки и их оси — из ведомости марок и монтажной схемы, метизы — из ведомости метизов, сталь и профили — из монтажной схемы (ведомостей КМ). Марки электродов, грунтовки и краски программа ищет в распознанных чертежах; не нашла — пункт «по КМ», его можно переименовать своим пунктом. Загруженные сертификаты кладутся рядом с выгруженным файлом в папку «… — документы о качестве».</p></div>`;
   bind()
  }
  const choice=()=>{const acts=[...app.querySelectorAll("[data-act]:checked")].map(i=>i.dataset.act);return{from:val("exdFrom"),to:val("exdTo"),workTypeId:val("exdWork"),split:val("exdSplit"),acts}};
  const val=id=>document.getElementById(id)?.value||"";
  function bind(){
   document.getElementById("execDocsBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   app.querySelectorAll(".exd-toggle").forEach(b=>b.onclick=()=>{open[b.dataset.open]=!open[b.dataset.open];paint()});
   const keep=async()=>{const c=choice();D.settings.last={...last(),...c};paint();try{await saveSettings({last:D.settings.last})}catch(e){console.warn(e)}};
   ["exdFrom","exdTo","exdWork","exdSplit"].forEach(id=>document.getElementById(id)?.addEventListener("change",keep));
   app.querySelectorAll("[data-act]").forEach(i=>i.onchange=keep);
   document.getElementById("exdGroup")?.addEventListener("change",e=>{filterGroup=e.target.value;paint()});
   // Participants and object: saved as typed.
   const later=fn=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),400)}};
   const saveLater=later(()=>saveSettings({}).catch(e=>console.warn(e)));
   app.querySelectorAll(".exd-person").forEach(box=>box.querySelectorAll("[data-f]").forEach(i=>i.addEventListener(i.type==="checkbox"?"change":"input",()=>{
    const k=box.dataset.role,P=D.settings.participants,p={...(P[k]||{})};p[i.dataset.f]=i.type==="checkbox"?i.checked:i.value;P[k]=p;if(i.type==="checkbox")box.classList.toggle("off",!i.checked);saveLater()})));
   app.querySelectorAll("[data-o]").forEach(i=>i.addEventListener("input",()=>{D.settings.object={...(D.settings.object||{}),[i.dataset.o]:i.value};saveLater()}));
   app.querySelectorAll("[data-s]").forEach(i=>i.addEventListener("input",()=>{D.settings[i.dataset.s]=i.value;saveLater()}));
   // Documents of quality.
   const need=k=>D.needs.find(x=>x.key===k);
   app.querySelectorAll("[data-adddoc]").forEach(b=>b.onclick=()=>{editing={key:b.dataset.adddoc,kind:DOC_KINDS[0],date:"",number:"",supplier:"",qty:"",file:null};paint()});
   app.querySelectorAll("[data-hide]").forEach(b=>b.onclick=async()=>{const x=need(b.dataset.hide);await certRecord(x,{hidden:!x.hidden});reload()});
   app.querySelectorAll("[data-delitem]").forEach(b=>b.onclick=async()=>{const x=need(b.dataset.delitem);if(!x?.record||!confirm(`Удалить пункт «${x.title}»?`))return;for(const d of x.docs)if(d.file?.path)await call("ai-documents:exec-cert-remove",{path:d.file.path}).catch(()=>{});await api.remove(x.record.id);reload()});
   app.querySelectorAll("[data-addcustom]").forEach(b=>b.onclick=()=>{adding=adding===b.dataset.addcustom?null:b.dataset.addcustom;open.certs=true;paint();document.getElementById("exdNewTitle")?.focus()});
   const nt=document.getElementById("exdNewTitle");
   if(nt){const g=X.GROUPS.find(x=>x.key===adding);
    const add=async()=>{const t=nt.value.trim();if(!t){nt.focus();return}
     try{await api.create({record_type:"certificate",title:t,data:{key:"custom:"+Date.now(),group:g.key,title:t,custom:true,docs:[]}});adding=null;await reload()}
     catch(e){alert("Пункт не добавлен: "+(e.message||e))}};
    document.getElementById("exdNewSave").onclick=add;document.getElementById("exdNewCancel").onclick=()=>{adding=null;paint()};
    nt.addEventListener("keydown",e=>{if(e.key==="Enter")add();else if(e.key==="Escape"){adding=null;paint()}})}
   app.querySelectorAll("[data-open]").forEach(b=>{if(!b.dataset.i)return;b.onclick=()=>{const d=need(b.dataset.open)?.docs[Number(b.dataset.i)];if(d?.file?.path)call("ai-documents:exec-cert-open",{path:d.file.path}).catch(e=>alert("Файл не открылся: "+e.message))}});
   app.querySelectorAll("[data-deldoc]").forEach(b=>b.onclick=async()=>{const x=need(b.dataset.deldoc),d=x?.docs[Number(b.dataset.i)];if(!d||!confirm(`Удалить «${X.certText(d)}»?`))return;
    if(d.file?.path)await call("ai-documents:exec-cert-remove",{path:d.file.path}).catch(()=>{});await certRecord(x,{docs:x.docs.filter((_,i)=>i!==Number(b.dataset.i))});reload()});
   const form=app.querySelector(".exd-docform");
   if(form){form.querySelectorAll("[data-d]").forEach(i=>i.addEventListener("input",()=>{editing[i.dataset.d]=i.value}));
    form.querySelector("#exdPick").onclick=async()=>{try{const files=await call("ai-documents:exec-cert-add",{objectId:oid});if(files?.length){editing.file=files[0];
      // Several files at once: the rest become documents of the same point with the same number and date.
      editing.more=files.slice(1);paint()}}catch(e){alert("Файл не загружен: "+e.message)}};
    form.querySelector("#exdDocCancel").onclick=()=>{if(editing.file?.path)call("ai-documents:exec-cert-remove",{path:editing.file.path}).catch(()=>{});editing=null;paint()};
    form.querySelector("#exdDocSave").onclick=async()=>{const x=need(editing.key);if(!editing.number&&!editing.file){alert("Укажите номер документа или выберите файл.");return}
     const one=f=>({kind:editing.kind,number:editing.number,date:editing.date,supplier:editing.supplier,qty:editing.qty,file:f});
     await certRecord(x,{docs:[...x.docs,one(editing.file),...arr(editing.more).map(one)]});editing=null;reload()}}
   // Export.
   const run=async format=>{const c=choice();if(!c.acts.length){alert("Выберите хотя бы один акт.");return}if(c.from&&c.to&&c.from>c.to){alert("Дата «с» позже даты «по».");return}
    busy=true;note="Готовлю документы…";paint();
    try{const pkg=X.buildPackage({settings:D.settings,reports:D.reports,marks:D.marks,scheme:D.scheme,workTypes:D.workTypes,needsList:D.needs,...c});
     const wt=D.workTypes.find(w=>w.id===c.workTypeId),name=["ИД",D.settings.object?.name||D.object?.name||"",wt?.name||"",X.ru(c.from)+"–"+X.ru(c.to)].filter(Boolean).join(" ");
     const r=await call("ai-documents:exec-export",{format,name,html:format==="pdf"?X.toHtml(pkg):"",docx:format==="docx"?X.toDocx(pkg):null,attachments:pkg.attachments});
     note=r?.path?`Сохранено: ${esc(r.path)}${r.copied?` · документов о качестве: ${r.copied}`:""}${r.missing?.length?` · не найдено файлов: ${r.missing.length}`:""}`:"Выгрузка отменена"}
    catch(e){note=`<span class="exd-bad">Не выгружено: ${esc(e.message||e)}</span>`}
    busy=false;paint()};
   document.getElementById("exdDocx").onclick=()=>run("docx");document.getElementById("exdPdf").onclick=()=>run("pdf");
  }
  paint()
 };
 // The page loads after the runtime's first route: open it when the tab starts on it.
 {const m=/^#\/objects\/object\/(\d+)\/executive-docs$/.exec(location.hash);if(m)window.irExecDocsPage(m[1])}
})();
