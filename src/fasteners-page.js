"use strict";
/*
 * «Ведомость метизов» of an object (route #/objects/object/<id>/fasteners) and the fasteners block of a daily report.
 * The register filled here goes first; while it is empty the register is read from the drawings (src/fasteners-register.js).
 * Rights: those of the marks register.
 */
(()=>{
 const F=window.irFasteners;if(!F)return;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{if(v==null||String(v).trim()==="")return null;const n=Number(String(v).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:null};
 const fmt=(v,dp=0)=>v==null||!Number.isFinite(v)?"—":Number(v).toLocaleString("ru-RU",{minimumFractionDigits:dp,maximumFractionDigits:dp});
 const kg=v=>v==null?"—":fmt(v,v<10?3:v<1000?1:0);
 const g=v=>v==null?"—":v<1?fmt(v*1000,1)+" г":fmt(v,3)+" кг";
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("marks"):false;
 const sizeText=r=>(r.d?(r.item==="washer"?"":"М")+String(r.d).replace(".",",")+(r.item==="washer"?" мм":""):"")+(r.len?"×"+r.len:"");
 const itemText=r=>(F.ITEM_NAME[r.item]||r.item||"")+(r.high?" <small>высокопрочный</small>":"");
 const sumCard=(title,pcs,mass,cls="")=>`<div class="fst-card ${cls}"><small>${esc(title)}</small><b>${fmt(pcs)} шт.</b><span>${kg(mass)} кг</span></div>`;
 window.irFastenersPage=async oid=>{
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("fasteners"),object=await irProject.data.objects.get(oid);
  let view="active",query="",editing=null;
  const paint=async()=>{
   const data=await F.load(oid),shown=view==="auto"?{...data,rows:data.autoRows}:data,acc=F.account(shown),q=query.trim().toLowerCase();
   const rows=acc.rows.filter(r=>!q||[r.text,r.standard,F.marksText(r.marks)].join(" ").toLowerCase().includes(q));
   const manual=data.mode==="manual",editRows=manual&&view==="active"&&canEdit();
   const banner=manual?`<div class="fst-source manual"><b>Ведомость заполнена вручную — она в приоритете.</b> Данные чертежей не используются, пока здесь есть строки.${data.autoRows.length?` С чертежей прочитано ${data.autoRows.length} позиций — их можно открыть для сверки.`:""}</div>`:
    data.autoRows.length?`<div class="fst-source auto"><b>Ведомость взята с чертежей автоматически.</b> Ручной ведомости нет. Количество — из ведомостей метизов листов КМД/КМ и сборочных листов марок; масса 1 шт. — по ГОСТ.${canEdit()?" Чтобы поправить — «Заполнить вручную»: строки чертежа перейдут в ручную ведомость.":""}</div>`:
    `<div class="fst-source empty"><b>Метизов пока нет.</b> Заполните ведомость вручную или распознайте КМД/КМ в монтажной схеме («ИИ-распознавание») — метизы листов попадут сюда сами.</div>`;
   const tabs=manual&&data.autoRows.length?`<div class="fst-tabs"><button data-view="active" class="${view==="active"?"on":""}">Действующая (ручная)</button><button data-view="auto" class="${view==="auto"?"on":""}">С чертежей — для сверки</button></div>`:"";
   const body=rows.map(r=>`<tr><td><b>${esc(r.text||"—")}</b>${r.note?`<small>${esc(r.note)}</small>`:""}</td><td>${itemText(r)}</td><td>${esc(sizeText(r))}</td><td>${esc(r.cls||"")}</td><td class="n">${r.total?fmt(r.total):"—"}</td><td class="n" title="${esc(r.mass_src||"")}">${g(r.unit_kg)}<small>${esc(r.mass_src||"")}</small></td><td class="n">${kg(r.total_kg)}</td><td class="n done">${fmt(r.used)}<small>${kg(r.used_kg)} кг</small></td><td class="n left">${fmt(r.left)}<small>${kg(r.left_kg)} кг</small></td><td>${r.marks.length?esc(F.marksText(r.marks)):'<span class="muted">на весь объект</span>'}</td>${editRows?`<td class="act"><button data-edit="${esc(r.id)}" title="Изменить">✎</button><button data-del="${esc(r.id)}" title="Удалить">×</button></td>`:""}</tr>`).join("");
   const form=editing?formHtml(editing):"";
   app.innerHTML=`<div class="fasteners-page"><div class="marks-top"><button class="back" id="fastenersBack">← Назад</button><div><h1>Ведомость метизов</h1><p>${esc(object?.name||"")}</p></div></div>${banner}${tabs}
    <div class="fst-cards">${sumCard("Всего по ведомости",acc.totals.total,acc.totals.total_kg)}${sumCard("Смонтировано",acc.totals.used,acc.totals.used_kg,"done")}${sumCard("Осталось",acc.totals.left,acc.totals.left_kg,"left")}</div>
    ${acc.noMass?`<div class="fst-warn">У ${acc.noMass} поз. масса не найдена в ГОСТ — впишите массу 1 шт. вручную, иначе они не входят в килограммы.</div>`:""}
    <div class="marks-tools"><input id="fstSearch" value="${esc(query)}" placeholder="Поиск по обозначению, ГОСТ или марке…">${canEdit()&&view==="active"?`<button class="primary" id="fstAdd">＋ Добавить метиз</button>${!manual&&data.autoRows.length?'<button class="primary fst-secondary" id="fstCopy">Заполнить вручную из чертежей</button>':""}${manual?'<button id="fstClear" class="danger">Очистить ручную ведомость</button>':""}`:""}</div>${form}
    ${rows.length?`<div class="fst-table-wrap"><table class="fst-table"><thead><tr><th>Обозначение</th><th>Вид</th><th>Размер</th><th>Класс</th><th class="n">Кол-во, шт.</th><th class="n">Масса 1 шт.</th><th class="n">Всего, кг</th><th class="n">Смонтировано</th><th class="n">Осталось</th><th>Марки (шт. на 1 марку)</th>${editRows?"<th></th>":""}</tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4"><b>Итого</b></td><td class="n"><b>${fmt(acc.totals.total)}</b></td><td></td><td class="n"><b>${kg(acc.totals.total_kg)}</b></td><td class="n done"><b>${fmt(acc.totals.used)}</b><small>${kg(acc.totals.used_kg)} кг</small></td><td class="n left"><b>${fmt(acc.totals.left)}</b><small>${kg(acc.totals.left_kg)} кг</small></td><td colspan="${editRows?2:1}"></td></tr></tfoot></table></div>`:""}
    <p class="fst-help">Смонтировано считается само по ежедневным отчётам: метизы марки — по её смонтированным штукам (сколько на 1 марку), метизы на весь объект — по доле смонтированной стали (по массе марок). Масса 1 шт.: таблицы ГОСТ 7798, 22353, 22354, 5915, 11371, 6958, Р 52644–52646; где таблицы нет — расчёт по размерам стандарта (сверен с таблицей ГОСТ 7798-70 в пределах 2 %).</p></div>`;
   document.getElementById("fastenersBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   const search=document.getElementById("fstSearch");search.oninput=()=>{query=search.value;clearTimeout(search._t);search._t=setTimeout(async()=>{await paint();const s=document.getElementById("fstSearch");s.focus();s.setSelectionRange(s.value.length,s.value.length)},250)};
   app.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{view=b.dataset.view;paint()});
   document.getElementById("fstAdd")?.addEventListener("click",()=>{editing={};paint()});
   document.getElementById("fstCopy")?.addEventListener("click",async()=>{
    if(!confirm(`Перенести ${data.autoRows.length} позиций с чертежей в ручную ведомость? Дальше будет действовать ручная.`))return;
    for(const r of data.autoRows)await api.create({record_type:"fastener",title:r.text,data:rowData(r)});paint()});
   document.getElementById("fstClear")?.addEventListener("click",async()=>{
    if(!confirm("Удалить все строки ручной ведомости? Ведомость снова будет браться с чертежей."))return;
    for(const r of data.manual)await api.remove(r.id);paint()});
   app.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const r=data.manual.find(x=>String(x.id)===b.dataset.edit);editing={id:String(r.id),...(r.data||{})};paint()});
   app.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{const r=data.manual.find(x=>String(x.id)===b.dataset.del);if(!r||!confirm(`Удалить «${r.data?.text||r.title}»?`))return;await api.remove(r.id);paint()});
   bindForm();
  };
  const rowData=r=>({text:r.text,item:r.item,standard:r.standard,d_mm:r.d,length_mm:r.len,strength_class:r.cls,qty:r.qty!=null?r.qty:null,unit_mass_kg:null,marks:F.marksText(r.marks),note:r.sources?.length?"с чертежа: "+r.sources.join("; "):""});
  function formHtml(e){
   return`<div class="fst-form"><div class="fst-form-grid"><label class="wide">Обозначение (как на чертеже)<input name="text" value="${esc(e.text||"")}" placeholder="Болт М20-6gх60.58 ГОСТ 7798-70"></label><label>Количество всего, шт.<input name="qty" inputmode="decimal" value="${esc(e.qty??"")}" placeholder="пусто — по маркам"></label><label>Масса 1 шт., кг<input name="unit_mass_kg" inputmode="decimal" value="${esc(e.unit_mass_kg??"")}" placeholder="пусто — по ГОСТ"></label><label class="wide">Марки и количество на 1 марку<input name="marks" value="${esc(e.marks||"")}" placeholder="К-1:8; Б-2:4 — пусто, если метизы на весь объект"></label><label class="wide">Примечание<input name="note" value="${esc(e.note||"")}"></label></div><div class="fst-preview" id="fstPreview"></div><div class="fst-form-actions"><button class="primary" id="fstSave">Сохранить</button><button id="fstCancel">Отмена</button></div></div>`
  }
  function bindForm(){
   const box=app.querySelector(".fst-form");if(!box)return;
   const val=n=>box.querySelector(`[name="${n}"]`).value;
   const preview=()=>{const f=F.parse(val("text")),own=num(val("unit_mass_kg")),m=f?F.massOf(f):null,el=document.getElementById("fstPreview");
    el.innerHTML=!val("text").trim()?"":f?`${esc(F.ITEM_NAME[f.item]||f.item)}${f.d?", "+esc(sizeText(f)):""}${f.cls?", кл. "+esc(f.cls):""}${f.standard?", "+esc(f.standard):""} · масса 1 шт.: <b>${own!=null?g(own)+" (вручную)":m?.kg!=null?g(m.kg):"не найдена"}</b> <small>${esc(own!=null?"":m?.src||"")}</small>`:'<span class="fst-bad">Не похоже на метиз: укажите «Болт», «Гайка», «Шайба»… и ГОСТ</span>'};
   box.querySelectorAll("input").forEach(i=>i.addEventListener("input",preview));preview();
   document.getElementById("fstCancel").onclick=()=>{editing=null;paint()};
   document.getElementById("fstSave").onclick=async()=>{
    const text=val("text").trim();if(!text){alert("Укажите обозначение метиза.");return}
    const f=F.parse(text)||{},data={text,item:f.item||"",standard:f.standard||"",d_mm:f.d??null,length_mm:f.len??null,strength_class:f.cls||null,qty:num(val("qty")),unit_mass_kg:num(val("unit_mass_kg")),marks:val("marks").trim(),note:val("note").trim()};
    if(data.qty==null&&!F.parseMarks(data.marks).length){alert("Укажите количество всего или марки с количеством на 1 марку.");return}
    const payload={record_type:"fastener",title:text,data};
    if(editing.id)await api.update(editing.id,payload);else await api.create(payload);
    editing=null;paint()};
  }
  await paint();
  // (a page scrolled sideways before keeps the menu cut at the left)
  document.scrollingElement&&(document.scrollingElement.scrollLeft=0);
 };
 // The daily report: under the works, what the montage of the day used — before the day, on it, in all, left.
 async function reportBlock(oid,reportId){
  const card=document.getElementById("rvCard");if(!card||card.querySelector(".rv-fasteners-section"))return;
  const data=await F.load(oid);if(!data.rows.length)return;
  const report=data.reports.find(r=>String(r.id)===String(reportId));if(!report)return;
  const d=report.data||{},works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
  if(!works.some(w=>String(w?.mark_id||"").trim()&&w?.accounting_type!=="service"))return;
  const acc=F.account(data,report),rows=acc.rows.filter(r=>r.day>0);
  const line=r=>`<tr><td><b>${esc(r.text)}</b></td><td class="n">${fmt(r.total)}<small>${kg(r.total_kg)} кг</small></td><td class="n">${fmt(r.before)}<small>${kg(r.before_kg)} кг</small></td><td class="n done">${fmt(r.day)}<small>${kg(r.day_kg)} кг</small></td><td class="n">${fmt(r.used)}<small>${kg(r.used_kg)} кг</small></td><td class="n left">${fmt(r.left)}<small>${kg(r.left_kg)} кг</small></td></tr>`;
  const t=acc.totals,sec=document.createElement("section");sec.className="rv-section rv-fasteners-section";
  sec.innerHTML=`<div class="rv-section-title"><h2>Метизы</h2><span>${data.mode==="manual"?"по ручной ведомости":"по чертежам"}</span></div><div class="rv-totals"><div class="rv-total-card"><small>Было смонтировано до дня</small><b>${fmt(t.before)} шт. · ${kg(t.before_kg)} кг</b></div><div class="rv-total-card rv-accent-green"><small>За день</small><b>${fmt(t.day)} шт. · ${kg(t.day_kg)} кг</b></div><div class="rv-total-card"><small>Всего смонтировано</small><b>${fmt(t.used)} шт. · ${kg(t.used_kg)} кг</b></div><div class="rv-total-card rv-accent-amber"><small>Осталось</small><b>${fmt(t.left)} шт. · ${kg(t.left_kg)} кг</b></div></div>${rows.length?`<div class="rv-table-wrap"><table class="rv-work-table rv-fasteners-table"><thead><tr><th>Метиз</th><th>По ведомости</th><th>Было</th><th>За день</th><th>Всего</th><th>Осталось</th></tr></thead><tbody>${rows.map(line).join("")}</tbody></table></div>`:'<div class="rv-empty">Смонтированные за день марки метизов по ведомости не требуют</div>'}`;
  const works_=card.querySelector(".rv-works-section");if(works_)works_.after(sec);else card.append(sec)
 }
 const base=window.irReportsPage;
 if(typeof base==="function")window.irReportsPage=async(oid,opts={})=>{const out=await base(oid,opts);if(opts?.mode==="view"&&opts.reportId)try{await reportBlock(oid,opts.reportId)}catch(e){console.warn("fasteners report",e)}return out};
 window.irFastenersReportBlock=reportBlock;
 // The page loads after the runtime's first route: open the register when the tab starts on it.
 {const m=/^#\/objects\/object\/(\d+)\/fasteners$/.exec(location.hash);if(m)window.irFastenersPage(m[1])}
})();
