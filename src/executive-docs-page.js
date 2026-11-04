"use strict";
/*
 * «Исполнительная документация» of an object (route #/objects/object/<id>/executive-docs): the participants (technical
 * and author's supervision only when they exist), the period and the work type, the acts to make, the documents of
 * quality — each metal, fastener, electrode, paint and primer a separate point — and «Выгрузить» to Word or PDF.
 * As-built surveys (исполнительные съёмки) loaded with their date, axes, work type and marks go to the acts they cover.
 * Records of the object section «executive-docs»: one «settings», a «certificate» per point of the documents of quality,
 * a «survey» per as-built survey, an «issued» per exported act (its number, date, period, a copy of the exported file and,
 * once signed, «Подписан всеми подписантами» with the date and the signed scan — просьба инженера 04.11.2026).
 * The acts: only those of СН РК 1.03-00-2022 п. 15.2 (просьба инженера 04.11.2026).
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
 // The page is split into tabs (просьба инженера 03.11.2026: «раздели на разделы и сверху сделай переключение»); the open
 // tab is remembered. The acts of the export are grouped by what they are.
 const TABS=[["export","Выгрузка"],["issued","Выгруженные акты"],["people","Участники"],["certs","Сертификаты"],["surveys","Исполнительные съёмки"]];
 const ACT_GROUPS=[["Скрытые работы и ответственные конструкции (приложения Д, Е)",["aosr","aosr_grout","aosr_akz","aosr_fire","aosr_equipment","aook"]],["Геодезия",["geodesy","asbuilt"]],["Оборудование",["equipment_test","equipment_complex"]],["Журналы, ведомость, сертификаты",["journal","welding","input","unmounted","certs"]]];
 const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
 async function loadAll(oid){
  const root=irProject.data.forObject(oid),get=k=>root.section(k).list().catch(()=>[]);
  const [own,marks,workTypes,reports,scheme,logs,kb,object,company]=await Promise.all([get("executive-docs"),get("marks"),get("work-types"),get("reports"),get("scheme"),get("ai-project-log"),get("ai-project-kb"),irProject.data.objects.get(oid),irProject.company?.get?.().catch(()=>null)]);
  let fast=[];try{if(window.irFasteners){const d=await window.irFasteners.load(oid);fast=window.irFasteners.account(d).rows.map(r=>({text:r.text,total:r.total,marks:arr(r.marks).map(m=>m?.mark||m)}))}}catch(e){console.warn("exec docs: fasteners",e)}
  const texts=[];let size=0;for(const r of[...logs,...kb]){const t=JSON.stringify(r.data||{});if(size+t.length>3e6)break;size+=t.length;texts.push(t)}
  const settingsRec=own.find(r=>r.record_type==="settings")||null,certs=own.filter(r=>r.record_type==="certificate"),surveys=own.filter(r=>r.record_type==="survey").sort((a,b)=>String(b.data?.date||"").localeCompare(String(a.data?.date||"")));
  const issued=own.filter(r=>r.record_type==="issued").sort((a,b)=>String(b.data?.exported_at||"").localeCompare(String(a.data?.exported_at||""))||(Number(a.data?.number)||0)-(Number(b.data?.number)||0));
  const markRows=marks.map(r=>({id:String(r.id),...(r.data||{}),title:r.title||r.data?.title||""})).filter(x=>x.accounting_type!=="service");
  const s=settingsRec?.data||{};
  // What the object already knows fills the empty fields.
  const settings={...s,object:{name:object?.name||"",address:object?.address||"",...(s.object||{})},participants:{...(s.participants||{})}};
  const fill=(key,org)=>{const p=settings.participants[key]||{};if(!p.org&&org)settings.participants[key]={...p,org}};
  fill("customer",object?.customer);fill("general",object?.general_contractor);fill("contractor",company?.name);
  const needs=X.needs({marks:markRows,scheme,fasteners:fast,texts,records:certs});
  return{object,settingsRec,settings,certs,marks:markRows,workTypes:workTypes.map(r=>({id:String(r.id),...(r.data||{}),name:r.data?.name||r.title||""})),reports,scheme,needs,surveys,issued}
 }
 window.irExecDocsPage=async oid=>{
  const app=document.getElementById("app"),api=irProject.data.forObject(oid).section("executive-docs");
  let D=await loadAll(oid),busy=false,note="",signing=null,filterGroup="",editing=null,adding=null,surveyEdit=null,tab=TABS.some(t=>t[0]===store.get("ir-exd-tab"))?store.get("ir-exd-tab"):"export";
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
   const L=last(),acts=new Set(L.acts?X.actKeys(L.acts):DEFAULT_ACTS),from=L.from||firstDate(),to=L.to||today();
   const preview=X.buildPackage({settings:D.settings,reports:D.reports,marks:D.marks,scheme:D.scheme,workTypes:D.workTypes,needsList:D.needs,surveys:D.surveys,acts:[...acts],from,to,workTypeId:L.workTypeId||"",split:L.split||"period"});
   const missing=preview.missing;
   return`<div class="exd-grid exd-period"><label>С<input type="date" id="exdFrom" value="${esc(from)}"></label><label>По<input type="date" id="exdTo" value="${esc(to)}"></label>
    <label>Вид работы<select id="exdWork"><option value="">Все виды работ</option>${D.workTypes.map(w=>`<option value="${esc(w.id)}" ${String(L.workTypeId||"")===w.id?"selected":""}>${esc(w.name)}${w.code?" ("+esc(w.code)+")":""}</option>`).join("")}</select></label>
    <label>Акты<select id="exdSplit"><option value="period" ${L.split!=="day"?"selected":""}>один на период</option><option value="day" ${L.split==="day"?"selected":""}>отдельно за каждый день</option></select></label></div>
    <div class="exd-stats"><div><small>Работ за период</small><b>${preview.works.length}</b><span>${preview.works.length?esc(preview.works.slice(0,4).map(r=>r.mark||r.work_type).join(", "))+(preview.works.length>4?"…":""):"в ежедневных отчётах нет"}</span></div>
     <div><small>Документов к выгрузке</small><b>${preview.docs.length}</b><span>с описью</span></div>
     <button data-goto="surveys" class="${preview.noSurvey.length?"warn":""}"><small>Исполнительные съёмки</small><b>${preview.surveys.length}</b><span>${preview.noSurvey.length?`нет для ${preview.noSurvey.length} акт.`:"к актам"}</span></button>
     <button data-goto="certs" class="${missing.length?"warn":""}"><small>Сертификаты</small><b>${missing.length?missing.length:"✓"}</b><span>${missing.length?"позиций без документа":"все загружены"}</span></button></div>
    <div class="exd-actions"><button class="primary" id="exdDocx" ${busy?"disabled":""}>Выгрузить исполнительную документацию — Word</button><button class="primary exd-pdf" id="exdPdf" ${busy?"disabled":""}>Выгрузить — PDF</button>${note?`<span class="exd-note">${note}</span>`:""}</div>
    <div class="exd-acts-title">Какие акты нужны</div>
    ${ACT_GROUPS.map(([title,keys])=>{const list=keys.map(k=>X.ACT[k]).filter(Boolean);const on=list.filter(a=>acts.has(a.key)).length;
     return`<div class="exd-actgroup"><div class="exd-actgroup-head"><b>${esc(title)}</b><small>${on?`выбрано ${on} из ${list.length}`:""}</small></div><div class="exd-acts">${list.map(a=>`<label class="exd-act ${acts.has(a.key)?"on":""}" title="${esc(a.basis)}"><input type="checkbox" data-act="${a.key}" ${acts.has(a.key)?"checked":""}><span><b>${esc(a.name)}</b><small>${esc(a.basis)}</small></span></label>`).join("")}</div></div>`}).join("")}`
  }
 // As-built surveys: the list and the form of one.
  function surveysHtml(){
   const ed=canEdit(),wt=id=>D.workTypes.find(w=>w.id===String(id))?.name||"";
   const rows=D.surveys.map(r=>{const s=X.surveyOf(r);return`<div class="exd-item ${s.files.length?"ok":"no"}"><div class="exd-item-head"><span class="exd-dot"></span><div><b>${esc(X.surveyText(s))}</b><small>${esc([wt(s.workTypeId),s.marks.length?"марки: "+s.marks.slice(0,12).join(", ")+(s.marks.length>12?"…":""):"",s.surveyor].filter(Boolean).join(" · ")||"без вида работ и марок — подходит ко всем актам своего периода")}</small></div>
     ${ed?`<div class="exd-item-act"><button class="exd-mini ghost" data-sedit="${esc(r.id)}">Изменить</button><button class="exd-mini ghost" data-sdel="${esc(r.id)}">Удалить</button></div>`:""}</div>
     ${s.files.map((f,i)=>`<div class="exd-doc"><span></span><button class="exd-link" data-sopen="${esc(r.id)}" data-i="${i}">${esc(f.name||"файл")}</button></div>`).join("")}${surveyEdit&&String(surveyEdit.id)===String(r.id)?surveyForm(surveyEdit):""}</div>`}).join("");
   return`${ed?`<div class="exd-tools"><button class="exd-mini" id="exdSurveyAdd">＋ Загрузить съёмку</button><small>PDF, скан, фото или чертёж DWG / DXF геодезиста. Съёмка попадает в акты своего вида работ, за период до её даты (до 30 дней после работ), по маркам или осям.</small></div>`:""}
    ${surveyEdit&&!surveyEdit.id?surveyForm(surveyEdit):""}${rows||'<div class="exd-empty">Съёмок пока нет</div>'}`
  }
  function surveyForm(e){
   const auto=X.axesOf(D.scheme,String(e.marks||"").split(/[,;]/).map(v=>v.trim()).filter(Boolean));
   return`<div class="exd-docform exd-survey-form"><div class="exd-grid"><label class="wide">Наименование<input data-sv="title" value="${esc(e.title??"Исполнительная геодезическая схема")}"></label><label>Номер<input data-sv="number" value="${esc(e.number||"")}"></label><label>Дата съёмки<input type="date" data-sv="date" value="${esc(e.date||"")}"></label>
    <label>Вид работы<select data-sv="work_type_id"><option value="">любой</option>${D.workTypes.map(w=>`<option value="${esc(w.id)}" ${String(e.work_type_id||"")===w.id?"selected":""}>${esc(w.name)}</option>`).join("")}</select></label>
    <label class="wide">Марки (через запятую)<input data-sv="marks" value="${esc(e.marks||"")}" placeholder="К-1, К-2, Б-1 — пусто, если по осям"></label><label>Оси<input data-sv="axes" value="${esc(e.axes||"")}" placeholder="${esc(auto||"1–8 / А–Г")}"></label>
    <label class="wide">Геодезист, организация<input data-sv="surveyor" value="${esc(e.surveyor||"")}"></label><label class="wide">Файлы<span class="exd-file">${arr(e.files).map(f=>esc(f.name)).join(", ")||"не выбраны"} <button class="exd-mini" id="exdSurveyPick">${arr(e.files).length?"Добавить":"Выбрать файлы"}</button></span></label></div>
    <p class="exd-help exd-auto">${auto&&!e.axes?`Оси по монтажной схеме для этих марок: ${esc(auto)} — подставятся, если поле пустое.`:""}</p><div class="exd-form-act"><button class="primary" id="exdSurveySave">Сохранить</button><button id="exdSurveyCancel">Отмена</button></div></div>`
  }
  // The exported acts: each with its number, date and file; «Подписан всеми подписантами» with the date and the signed scan.
  const isOf=r=>{const d=r.data||{};return{...d,id:r.id,signed:d.signed&&arr(d.signed.scans).length?d.signed:null}};
  function issuedHtml(){
   const ed=canEdit(),list=D.issued.map(isOf),signed=list.filter(x=>x.signed).length;
   if(!list.length)return'<div class="exd-empty">Выгруженных актов пока нет. Акты появляются здесь после выгрузки на вкладке «Выгрузка».</div>';
   const row=x=>{const s=x.signed,title=`${x.name||"Акт"}${x.number?" № "+x.number:""}${x.date?" от "+X.ru(x.date):""}`;
    return`<div class="exd-item ${s?"ok":"no"}"><div class="exd-item-head"><span class="exd-dot"></span><div><b>${esc(title)}</b><small>${esc([x.from&&x.to?(x.from===x.to?"за "+X.ru(x.from):"период "+X.ru(x.from)+" – "+X.ru(x.to)):"",x.work_type||"",(x.format==="pdf"?"PDF":"Word")+", выгружен "+X.ru(x.exported_at)].filter(Boolean).join(" · "))}</small>
     <small class="${s?"exd-signed":"exd-unsigned"}">${s?`✓ Подписан всеми подписантами ${esc(X.ru(s.date))}`:"Не подписан"}</small></div>
     <div class="exd-item-act">${x.file?.path?`<button class="exd-mini ghost" data-iopen="${esc(x.id)}">Открыть акт</button>`:""}${ed&&!s?`<button class="exd-mini" data-isign="${esc(x.id)}">Подписан всеми подписантами</button>`:""}${ed&&s?`<button class="exd-mini ghost" data-iunsign="${esc(x.id)}">Снять отметку</button>`:""}${ed?`<button class="exd-mini ghost" data-idel="${esc(x.id)}">Удалить</button>`:""}</div></div>
     ${s?arr(s.scans).map((f,i)=>`<div class="exd-doc"><span>Скан подписанного акта</span><button class="exd-link" data-iscan="${esc(x.id)}" data-i="${i}">${esc(f.name||"файл")}</button></div>`).join(""):""}
     ${signing&&String(signing.id)===String(x.id)?signForm(signing):""}</div>`};
   return`<div class="exd-stats exd-stats3"><div><small>Выгружено актов</small><b>${list.length}</b></div><div><small>Подписаны всеми</small><b>${signed}</b></div><div class="${list.length-signed?"warn":""}"><small>Ждут подписи</small><b>${list.length-signed}</b></div></div>${list.map(row).join("")}`
  }
  function signForm(e){
   return`<div class="exd-docform exd-sign-form"><div class="exd-grid"><label>Дата подписания<input type="date" data-sg="date" value="${esc(e.date||"")}"></label><label class="wide">Скан подписанного акта (обязательно)<span class="exd-file">${arr(e.scans).map(f=>esc(f.name)).join(", ")||"не выбран"} <button class="exd-mini" id="exdSignPick">${arr(e.scans).length?"Добавить":"Выбрать скан"}</button></span></label></div>
    <p class="exd-help">Отметку «Подписан всеми подписантами» можно поставить только со сканом акта со всеми подписями (PDF, JPG, PNG или TIFF).</p><div class="exd-form-act"><button class="primary" id="exdSignSave">Подтвердить</button><button id="exdSignCancel">Отмена</button></div></div>`
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
    <div class="exd-tabs">${TABS.map(([k,t])=>`<button data-tab="${k}" class="${tab===k?"on":""}">${esc(t)}${count(k)}</button>`).join("")}</div>
    <section class="exd-card">${tab==="export"?exportHtml():tab==="issued"?issuedHtml():tab==="people"?`${objectHtml()}${peopleHtml()}${ed?"":'<p class="exd-help">Изменять может тот, у кого есть права на ежедневные отчёты.</p>'}`:tab==="surveys"?surveysHtml():certsHtml()}</section>
    <p class="exd-help">${HELP[tab]}</p></div>`;
   bind()
  }
 const HELP={export:"Работы актов берутся из ежедневных отчётов за выбранный период и вид работы, марки и их оси — из ведомости марок и монтажной схемы. Загруженные сертификаты и съёмки кладутся рядом с выгруженным файлом в папку «… — приложения». Перечень документов — по СН РК 1.03-00-2022 п. 15.2, формы актов — по его приложениям Д и Е.",
   people:"Технический и авторский надзор попадают в акты, только если отмечены. Названия организаций при первом открытии берутся из карточки объекта и профиля компании.",
   certs:"Каждая сталь с профилем и каждая строка ведомости метизов — отдельный пункт; сталь и профили — из монтажной схемы (ведомостей КМ), метизы — из ведомости метизов. Марки электродов, грунтовки и краски программа ищет в распознанных чертежах; не нашла — пункт «по КМ», можно добавить свой пункт.",
   issued:"Каждая выгрузка добавляет сюда свои акты с номером и датой; копия выгруженного файла хранится в программе. Когда акт подписан всеми членами комиссии — нажмите «Подписан всеми подписантами» и загрузите скан. Номер следующего акта продолжает последний выгруженный.",
   surveys:"Съёмка попадает в акты своего вида работ, за период до её даты (до 30 дней после работ), по маркам или осям. Схему может нарисовать и сама программа — пункт «Исполнительная геодезическая схема возведённых конструкций» на вкладке «Выгрузка»."};
  // The counter of a tab: certificates loaded of needed, surveys loaded.
  const count=k=>{if(k==="issued"){const l=D.issued.map(isOf);return l.length?` <small>${l.filter(x=>x.signed).length}/${l.length}</small>`:""}if(k==="certs"){const t=D.needs.filter(x=>!x.hidden),d=t.filter(x=>x.docs.length).length;return` <small>${d}/${t.length}</small>`}if(k==="surveys")return D.surveys.length?` <small>${D.surveys.length}</small>`:"";if(k==="people")return` <small>${X.people(D.settings).length}</small>`;return""};
  const choice=()=>{const acts=[...app.querySelectorAll("[data-act]:checked")].map(i=>i.dataset.act);return{from:val("exdFrom"),to:val("exdTo"),workTypeId:val("exdWork"),split:val("exdSplit"),acts}};
  const val=id=>document.getElementById(id)?.value||"";
  function bind(){
   document.getElementById("execDocsBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   app.querySelectorAll("[data-tab],[data-goto]").forEach(b=>b.onclick=()=>{tab=b.dataset.tab||b.dataset.goto;store.set("ir-exd-tab",tab);editing=null;surveyEdit=null;adding=null;if(signing)dropSigning();paint();app.scrollTop=0;window.scrollTo?.(0,0)});
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
   app.querySelectorAll("[data-addcustom]").forEach(b=>b.onclick=()=>{adding=adding===b.dataset.addcustom?null:b.dataset.addcustom;paint();document.getElementById("exdNewTitle")?.focus()});
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
   const form=app.querySelector(".exd-docform:not(.exd-survey-form):not(.exd-sign-form)");
   if(form){form.querySelectorAll("[data-d]").forEach(i=>i.addEventListener("input",()=>{editing[i.dataset.d]=i.value}));
    form.querySelector("#exdPick").onclick=async()=>{try{const files=await call("ai-documents:exec-cert-add",{objectId:oid});if(files?.length){editing.file=files[0];
      // Several files at once: the rest become documents of the same point with the same number and date.
      editing.more=files.slice(1);paint()}}catch(e){alert("Файл не загружен: "+e.message)}};
    form.querySelector("#exdDocCancel").onclick=()=>{if(editing.file?.path)call("ai-documents:exec-cert-remove",{path:editing.file.path}).catch(()=>{});editing=null;paint()};
    form.querySelector("#exdDocSave").onclick=async()=>{const x=need(editing.key);if(!editing.number&&!editing.file){alert("Укажите номер документа или выберите файл.");return}
     const one=f=>({kind:editing.kind,number:editing.number,date:editing.date,supplier:editing.supplier,qty:editing.qty,file:f});
     await certRecord(x,{docs:[...x.docs,one(editing.file),...arr(editing.more).map(one)]});editing=null;reload()}}
   // As-built surveys.
   const sRec=id=>D.surveys.find(r=>String(r.id)===String(id));
   document.getElementById("exdSurveyAdd")?.addEventListener("click",()=>{surveyEdit={title:"Исполнительная геодезическая схема",date:last().to||today(),work_type_id:last().workTypeId||"",files:[],added:[]};paint()});
   app.querySelectorAll("[data-sedit]").forEach(b=>b.onclick=()=>{const r=sRec(b.dataset.sedit);surveyEdit={id:r.id,...(r.data||{}),files:arr(r.data?.files),added:[]};paint()});
   app.querySelectorAll("[data-sdel]").forEach(b=>b.onclick=async()=>{const r=sRec(b.dataset.sdel);if(!r||!confirm(`Удалить «${X.surveyText(X.surveyOf(r))}» вместе с файлами?`))return;
    for(const f of arr(r.data?.files))if(f?.path)await call("ai-documents:exec-cert-remove",{path:f.path}).catch(()=>{});await api.remove(r.id);reload()});
   app.querySelectorAll("[data-sopen]").forEach(b=>b.onclick=()=>{const f=arr(sRec(b.dataset.sopen)?.data?.files)[Number(b.dataset.i)];if(f?.path)call("ai-documents:exec-cert-open",{path:f.path}).catch(e=>alert("Файл не открылся: "+e.message))});
   const sf=document.getElementById("exdSurveySave")?.closest(".exd-docform");
   if(sf){sf.querySelectorAll("[data-sv]").forEach(i=>i.addEventListener(i.tagName==="SELECT"?"change":"input",()=>{surveyEdit[i.dataset.sv]=i.value}));
    // The axes of the typed marks on the montage scheme: shown as the hint of the empty axes field.
    sf.querySelector("[data-sv=marks]").addEventListener("input",()=>{const a=X.axesOf(D.scheme,String(surveyEdit.marks||"").split(/[,;]/).map(v=>v.trim()).filter(Boolean)),ax=sf.querySelector("[data-sv=axes]");ax.placeholder=a||"1–8 / А–Г";const h=sf.querySelector(".exd-auto");if(h)h.textContent=a?`Оси по монтажной схеме для этих марок: ${a} — подставятся, если поле пустое.`:""});
    document.getElementById("exdSurveyPick").onclick=async()=>{try{const files=await call("ai-documents:exec-cert-add",{objectId:oid,kind:"survey"});if(files?.length){surveyEdit.files=[...arr(surveyEdit.files),...files];surveyEdit.added=[...arr(surveyEdit.added),...files];paint()}}catch(e){alert("Файл не загружен: "+e.message)}};
    document.getElementById("exdSurveyCancel").onclick=()=>{for(const f of arr(surveyEdit.added))call("ai-documents:exec-cert-remove",{path:f.path}).catch(()=>{});surveyEdit=null;paint()};
    document.getElementById("exdSurveySave").onclick=async()=>{const e=surveyEdit;if(!arr(e.files).length&&!String(e.number||"").trim()){alert("Выберите файл съёмки или укажите её номер.");return}
     const marks=String(e.marks||"").split(/[,;]/).map(v=>v.trim()).filter(Boolean),axes=String(e.axes||"").trim()||X.axesOf(D.scheme,marks);
     const data={title:String(e.title||"").trim()||"Исполнительная геодезическая схема",number:String(e.number||"").trim(),date:e.date||"",work_type_id:e.work_type_id||"",marks:marks.join(", "),axes,surveyor:String(e.surveyor||"").trim(),files:arr(e.files)};
     try{const payload={record_type:"survey",title:data.title,data};if(e.id)await api.update(e.id,payload);else await api.create(payload);surveyEdit=null;await reload()}catch(err){alert("Съёмка не сохранена: "+(err.message||err))}}}
   // Exported acts and their signing.
   const iRec=id=>D.issued.find(r=>String(r.id)===String(id));
   const open=f=>{if(f?.path)call("ai-documents:exec-cert-open",{path:f.path}).catch(e=>alert("Файл не открылся: "+e.message))};
   app.querySelectorAll("[data-iopen]").forEach(b=>b.onclick=()=>open(iRec(b.dataset.iopen)?.data?.file));
   app.querySelectorAll("[data-iscan]").forEach(b=>b.onclick=()=>open(arr(iRec(b.dataset.iscan)?.data?.signed?.scans)[Number(b.dataset.i)]));
   app.querySelectorAll("[data-isign]").forEach(b=>b.onclick=()=>{if(signing)dropSigning();signing={id:b.dataset.isign,date:today(),scans:[]};paint()});
   const putIssued=async(r,data)=>{await api.update(r.id,{record_type:"issued",title:r.title||data.name||"Акт",data});await reload()};
   app.querySelectorAll("[data-iunsign]").forEach(b=>b.onclick=async()=>{const r=iRec(b.dataset.iunsign);if(!r||!confirm("Снять отметку «Подписан всеми подписантами»? Скан будет удалён."))return;
    for(const f of arr(r.data?.signed?.scans))await call("ai-documents:exec-cert-remove",{path:f.path}).catch(()=>{});const {signed,...rest}=r.data||{};void signed;await putIssued(r,rest)});
   app.querySelectorAll("[data-idel]").forEach(b=>b.onclick=async()=>{const r=iRec(b.dataset.idel),x=r&&isOf(r);if(!r||!confirm(`Удалить из списка «${x.name||"акт"}${x.number?" № "+x.number:""}» вместе с копией файла${x.signed?" и сканом":""}?`))return;
    for(const f of[r.data?.file,...arr(r.data?.signed?.scans)])if(f?.path)await call("ai-documents:exec-cert-remove",{path:f.path}).catch(()=>{});await api.remove(r.id);reload()});
   if(document.getElementById("exdSignSave")){
    app.querySelector("[data-sg=date]").addEventListener("input",e=>{signing.date=e.target.value});
    document.getElementById("exdSignPick").onclick=async()=>{try{const files=await call("ai-documents:exec-cert-add",{objectId:oid,kind:"scan"});if(files?.length){signing.scans=[...arr(signing.scans),...files];paint()}}catch(e){alert("Скан не загружен: "+e.message)}};
    document.getElementById("exdSignCancel").onclick=()=>{dropSigning();paint()};
    document.getElementById("exdSignSave").onclick=async()=>{const r=iRec(signing.id);if(!arr(signing.scans).length){alert("Загрузите скан акта со всеми подписями.");return}if(!signing.date){alert("Укажите дату подписания.");return}
     try{await putIssued(r,{...(r.data||{}),signed:{date:signing.date,scans:signing.scans,at:new Date().toISOString()}});signing=null;await reload()}catch(e){alert("Отметка не сохранена: "+(e.message||e))}}}
   // Export.
   const run=async format=>{const c=choice();if(!c.acts.length){alert("Выберите хотя бы один акт.");return}if(c.from&&c.to&&c.from>c.to){alert("Дата «с» позже даты «по».");return}
    busy=true;note="Готовлю документы…";paint();
    try{const pkg=X.buildPackage({settings:D.settings,reports:D.reports,marks:D.marks,scheme:D.scheme,workTypes:D.workTypes,needsList:D.needs,surveys:D.surveys,...c});
     if(format==="docx")await X.rasterize(pkg);
     const wt=D.workTypes.find(w=>w.id===c.workTypeId),name=["ИД",D.settings.object?.name||D.object?.name||"",wt?.name||"",X.ru(c.from)+"–"+X.ru(c.to)].filter(Boolean).join(" ");
     const r=await call("ai-documents:exec-export",{format,name,html:format==="pdf"?X.toHtml(pkg):"",docx:format==="docx"?X.toDocx(pkg):null,attachments:pkg.attachments,objectId:oid});
     let more="";if(r?.path){try{more=await keepIssued(pkg,c,format,r,wt)}catch(e){console.warn("exec docs: issued",e);more=" · список выгруженных актов не пополнен: "+esc(e.message||e)}}
     note=r?.path?`Сохранено: ${esc(r.path)}${more}${r.copied?` · приложений в папке: ${r.copied}`:""}${r.missing?.length?` · не найдено файлов: ${r.missing.length}`:""}`:"Выгрузка отменена"}
    catch(e){note=`<span class="exd-bad">Не выгружено: ${esc(e.message||e)}</span>`}
    busy=false;paint()};
   document.getElementById("exdDocx")?.addEventListener("click",()=>run("docx"));document.getElementById("exdPdf")?.addEventListener("click",()=>run("pdf"));
  }
  // A dropped signing form: the scans it loaded go away.
  function dropSigning(){for(const f of arr(signing?.scans))call("ai-documents:exec-cert-remove",{path:f.path}).catch(()=>{});signing=null}
  // After an export: an «issued» record per document of the set; the next act number continues the last one.
  async function keepIssued(pkg,c,format,r,wt){
   const at=new Date().toISOString(),file=r.archived?{path:r.archived,name:String(r.path).split(/[\\/]/).pop()}:null,id="exp-"+Date.now();
   for(const d of pkg.docs)await api.create({record_type:"issued",title:d.act.name+(d.number?" № "+d.number:""),data:{act:d.act.key,name:d.act.name,number:d.number,date:d.to||d.from,from:d.from,to:d.to,work_type_id:c.workTypeId||"",work_type:wt?.name||"",format,file,saved_path:r.path,export_id:id,exported_at:at}});
   const nums=pkg.docs.map(d=>Number(d.number)).filter(Number.isFinite);let next="";
   if(nums.length){next=String(Math.max(...nums)+1);await saveSettings({start_number:next})}
   D=await loadAll(oid);
   return` · в «Выгруженные акты» добавлено: ${pkg.docs.length}${next?` · следующий акт — № ${next}`:""}`
  }
  paint()
 };
 // The page loads after the runtime's first route: open it when the tab starts on it.
 {const m=/^#\/objects\/object\/(\d+)\/executive-docs$/.exec(location.hash);if(m)window.irExecDocsPage(m[1])}
})();
