"use strict";
/*
 * Ранее завершённые объекты (просьба инженера 10.11.2026: «добавить ранее закрытые объекты — законченные, указать виды
 * работ, объёмы, фото и всё, чтобы больше ничего не выводилось»; оставить заказчика, генподрядчика, адрес, фото объекта и
 * фотографии объекта).
 * Объект как обычный (таблица objects, статус «Завершен», все разделы отключены) с пометкой в записях раздела
 * «object-meta»: record_type «object_kind», data.value «archive». У такого объекта одна страница — карточка: шапка с
 * фото/баннером, заказчик, генподрядчик, адрес, таблица «вид работ — ед. — объём» и фотографии объекта. Левое меню —
 * только эта карточка (object-shell.js), переход на любой другой раздел возвращает на карточку.
 * Данные карточки — записи раздела «archive»: record_type «work» {name, unit, volume}, «photo» {file_path, caption}.
 * Записи синхронизируются с сервером, как все записи объектов (server-sync.js).
 */
(()=>{
 const KIND="object_kind",SECTION="archive";
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const api=(id,key)=>irProject.data.forObject(id).section(key);
 const canEdit=()=>window.irAccess?window.irAccess.canEdit("photos"):false;
 const known=new Map();// id → true/false (последний ответ базы)
 async function kindRecord(id){const rows=await api(id,"object-meta").list().catch(()=>[]);return rows.find(r=>r.record_type===KIND)||null}
 async function isArchive(id){if(!id)return false;const r=await kindRecord(id);const yes=r?.data?.value==="archive";known.set(String(id),yes);return yes}
 async function setArchive(id,on){
  const r=await kindRecord(id);
  if(on&&!r)await api(id,"object-meta").create({record_type:KIND,title:"Вид объекта",data:{entity_type:KIND,value:"archive"}});
  else if(on&&r&&r.data?.value!=="archive")await api(id,"object-meta").update(r.id,{record_type:KIND,title:"Вид объекта",data:{entity_type:KIND,value:"archive"}});
  else if(!on&&r)await api(id,"object-meta").remove(r.id);
  known.set(String(id),!!on);
 }
 // Годы начала и завершения (просьба инженера 10.11.2026): записи object-meta «object_year_start», «object_year_end»;
 // «object_years» («2019–2021») — для показа и для объектов, загруженных раньше с одной строкой лет. Один и тот же год
 // начала и завершения — один год, «2024», а не «2024 — 2024» (просьба инженера 11.11.2026).
 const YEARS={start:"object_year_start",end:"object_year_end",both:"object_years"};
 const year=v=>{const m=String(v??"").match(/\d{4}/);return m?m[0]:""};
 function yearsOf(rows){
  const get=t=>String(rows.find(r=>r.record_type===t)?.data?.value||"");
  let start=year(get(YEARS.start)),end=year(get(YEARS.end));
  if(!start&&!end){const all=get(YEARS.both).match(/\d{4}/g)||[];start=all[0]||"";end=all.length>1?all[all.length-1]:""}
  return{start,end,text:start&&end&&start!==end?start+"–"+end:start||end}
 }
 async function getYears(id){return yearsOf(await api(id,"object-meta").list().catch(()=>[]))}
 async function setYears(id,start,end){
  start=year(start);end=year(end);if(start&&end&&Number(end)<Number(start))[start,end]=[end,start];
  const rows=await api(id,"object-meta").list().catch(()=>[]);
  const put=async(type,title,value)=>{const r=rows.find(x=>x.record_type===type);const body={record_type:type,title,data:{entity_type:type,value}};
   if(!value){if(r)await api(id,"object-meta").remove(r.id);return}
   if(!r)await api(id,"object-meta").create(body);else if(String(r.data?.value||"")!==value)await api(id,"object-meta").update(r.id,body)};
  await put(YEARS.start,"Год начала",start);await put(YEARS.end,"Год завершения",end);
  await put(YEARS.both,"Годы работ",start&&end&&start!==end?start+"–"+end:start||end);
 }
 // Краткая характеристика объекта (просьба инженера 11.11.2026 «добавь к завершённому объекту краткую характеристику
 // объекта. Текстовое поле»): запись object-meta «object_summary», data.value — текст до 2000 знаков.
 const SUMMARY="object_summary",SUMMARY_MAX=2000;
 const summaryOf=rows=>String(rows.find(r=>r.record_type===SUMMARY)?.data?.value||"");
 async function getSummary(id){return summaryOf(await api(id,"object-meta").list().catch(()=>[]))}
 async function setSummary(id,text){
  const value=String(text??"").replace(/\r\n?/g,"\n").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim().slice(0,SUMMARY_MAX);
  const rows=await api(id,"object-meta").list().catch(()=>[]),r=rows.find(x=>x.record_type===SUMMARY);
  const body={record_type:SUMMARY,title:"Краткая характеристика",data:{entity_type:SUMMARY,value}};
  if(!value){if(r)await api(id,"object-meta").remove(r.id);return value}
  if(!r)await api(id,"object-meta").create(body);else if(String(r.data?.value||"")!==value)await api(id,"object-meta").update(r.id,body);
  return value
 }
 const ru=(n,one,few,many)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many};
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:NaN};
 const fmt=v=>{const n=num(v);return Number.isFinite(n)?n.toLocaleString("ru-RU",{maximumFractionDigits:3}):String(v??"")};
 const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
 const I={edit:svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'),pin:svg('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),check:svg('<path d="m5 12 4 4L19 6"/>'),trash:svg('<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>'),plus:svg('<path d="M12 5v14M5 12h14"/>'),org:svg('<path d="M4 21V5l8-3v19M12 9h8v12M4 21h17M7.5 8h1M7.5 12h1M7.5 16h1M15.5 13h1M15.5 17h1"/>'),helmet:svg('<path d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M10 8V5h4v3"/>'),cal:svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')};

 // Единица измерения словом — по числу (просьба инженера 11.11.2026 «делай склонения: 1 услуга, 2 услуги, 5 услуг»);
 // сокращения (т, м², шт, компл.) остаются как есть.
 const UNIT_WORDS=[["услуга","услуги","услуг"],["штука","штуки","штук"],["комплект","комплекта","комплектов"],["объект","объекта","объектов"],
  ["единица","единицы","единиц"],["рейс","рейса","рейсов"],["машина","машины","машин"],["смена","смены","смен"],["час","часа","часов"],
  ["день","дня","дней"],["сутки","суток","суток"],["позиция","позиции","позиций"],["узел","узла","узлов"],["место","места","мест"],["этаж","этажа","этажей"],
  ["марка","марки","марок"],["элемент","элемента","элементов"],["лист","листа","листов"],["секция","секции","секций"],["панель","панели","панелей"],
  ["окно","окна","окон"],["дверь","двери","дверей"],["блок","блока","блоков"],["конструкция","конструкции","конструкций"],["тонна","тонны","тонн"],
  ["метр","метра","метров"],["человек","человека","человек"],["точка","точки","точек"],["опора","опоры","опор"],["колонна","колонны","колонн"],
  ["балка","балки","балок"],["ферма","фермы","ферм"],["резервуар","резервуара","резервуаров"],["здание","здания","зданий"],["пролёт","пролёта","пролётов"],
  ["пролет","пролета","пролетов"],["кран","крана","кранов"],["агрегат","агрегата","агрегатов"],["аппарат","аппарата","аппаратов"],["емкость","емкости","емкостей"],
  ["ёмкость","ёмкости","ёмкостей"],["рулон","рулона","рулонов"],["пакет","пакета","пакетов"],["установка","установки","установок"]];
 const UNIT_FORMS=new Map();for(const f of UNIT_WORDS)for(const w of f)if(!UNIT_FORMS.has(w))UNIT_FORMS.set(w,f);
 UNIT_FORMS.set("услуг",UNIT_WORDS[0]);UNIT_FORMS.set("усл",UNIT_WORDS[0]);UNIT_FORMS.set("усл.",UNIT_WORDS[0]);
 function unitWord(n,unit){
  const u=String(unit??"").trim(),f=UNIT_FORMS.get(u.toLowerCase());if(!f)return u;
  const v=Math.abs(Number(n));let w;
  if(!Number.isFinite(v))w=f[2];else if(!Number.isInteger(v))w=f[1];
  else{const a=v%100,b=v%10;w=a>10&&a<20?f[2]:b===1?f[0]:b>=2&&b<=4?f[1]:f[2]}
  return u[0]&&u[0]!==u[0].toLowerCase()?w[0].toUpperCase()+w.slice(1):w
 }
 // Оформление краткой характеристики (просьба инженера 12.11.2026 «добавь редактор … жирным и как-нибудь делать,
 // заголовок, списки, остальное не надо»): хранится коротким текстом с разметкой — «## » заголовок, «- » список,
 // «1. » нумерованный, **жирный**, *курсив*; старый простой текст читается как есть. Та же разметка — на сайте a-ts.kz.
 const mdInline=t=>t.replace(/\*\*([^*\n]+?)\*\*/g,"<b>$1</b>").replace(/\*([^*\n]+?)\*/g,"<i>$1</i>");
 function summaryHtml(md){
  let out="",list="";const close=()=>{if(list){out+="</"+list+">";list=""}};
  for(const raw of String(md??"").split("\n")){const l=raw.trimEnd();let m;
   if((m=l.match(/^#{1,3}\s+(.*)$/))){close();out+="<h3>"+mdInline(esc(m[1]))+"</h3>"}
   else if((m=l.match(/^\s*[-•]\s+(.*)$/))){if(list!=="ul"){close();out+="<ul>";list="ul"}out+="<li>"+mdInline(esc(m[1]))+"</li>"}
   else if((m=l.match(/^\s*\d+[.)]\s+(.*)$/))){if(list!=="ol"){close();out+="<ol>";list="ol"}out+="<li>"+mdInline(esc(m[1]))+"</li>"}
   else if(!l.trim())close();
   else{close();out+="<p>"+mdInline(esc(l))+"</p>"}
  }
  close();return out
 }
 // Поле редактора → та же разметка: блоки — строки, жирный и курсив — звёздочки (пробелы по краям — снаружи).
 function editorToMd(root){
  const wrap=(x,m)=>{const core=x.trim();if(!core)return x;return x.match(/^\s*/)[0]+m+core+m+x.match(/\s*$/)[0]};
  const bold=c=>c.tagName==="B"||c.tagName==="STRONG"||/^(bold|[6-9]00)$/.test(c.style?.fontWeight||"");
  const ital=c=>c.tagName==="I"||c.tagName==="EM"||c.style?.fontStyle==="italic";
  const inl=n=>{let t="";n.childNodes.forEach(c=>{if(c.nodeType===3)t+=c.nodeValue.replace(/\s+/g," ");else if(c.nodeType===1){
   if(c.tagName==="BR")t+="\n";else if(/^(UL|OL|P|DIV|H[1-6]|LI)$/.test(c.tagName))t+="\n"+inl(c)+"\n";
   else{let x=inl(c);if(bold(c))x=wrap(x,"**");if(ital(c))x=wrap(x,"*");t+=x}}});return t};
  const out=[];let cur="";const flush=()=>{cur.split("\n").forEach(x=>{x=x.trim();if(x)out.push(x)});cur=""};
  const walk=n=>n.childNodes.forEach(c=>{
   if(c.nodeType===3){cur+=c.nodeValue.replace(/\s+/g," ");return}if(c.nodeType!==1)return;const t=c.tagName;
   if(t==="BR"){flush();return}
   if(/^H[1-6]$/.test(t)){flush();const x=inl(c).replace(/\n+/g," ").trim().replace(/^\*\*(.*)\*\*$/,"$1");if(x)out.push("## "+x);return}
   if(t==="UL"||t==="OL"){flush();let i=0;c.querySelectorAll("li").forEach(li=>{const x=inl(li).replace(/\n+/g," ").trim();if(x)out.push((t==="OL"?(++i)+". ":"- ")+x)});out.push("");return}
   if(t==="DIV"||t==="P"){flush();walk(c);flush();return}
   let x=inl(c);if(bold(c))x=wrap(x,"**");if(ital(c))x=wrap(x,"*");cur+=x});
  walk(root);flush();
  return out.join("\n").replace(/\n{3,}/g,"\n\n").trim()
 }
 const I_FMT={bold:'<b>Ж</b>',italic:'<i>К</i>',h:'<span>Заголовок</span>',ul:'<span>• Список</span>',ol:'<span>1. Список</span>'};
 const totalLabel=u=>UNIT_FORMS.has(String(u).trim().toLowerCase())?"Всего "+unitWord(5,u).toLowerCase():"Всего, "+u;
 // Объёмы одной единицы складываются в итог («465 т», «14 900 м²»).
 function totals(works){const m=new Map();for(const w of works){const u=String(w.unit||"").trim(),n=num(w.volume);if(!u||!Number.isFinite(n))continue;m.set(u,(m.get(u)||0)+n)}return[...m].map(([u,n])=>({unit:u,value:n}))}

 // Карточка открывается для просмотра; поля появляются по «Редактировать» (просьба инженера 12.11.2026: «информацию
 // покажи без редактирования с кнопкой редактирования и удаления»). keep — перерисовка в том же режиме.
 const editing=new Set();
 async function page(id,keep){
  const app=document.getElementById("app");
  if(!keep)editing.delete(String(id));
  const o=await irProject.data.objects.get(id);if(!o){location.hash="/objects";return}
  // Без левого меню и баннера: меню объекта полосой сверху, как на монтажной схеме (просьба инженера 12.11.2026).
  document.body.classList.remove("ir-object-overview");document.body.classList.add("ir-archive-object","ir-object-topnav");
  const [rows,metaRows]=await Promise.all([api(id,SECTION).list().catch(()=>[]),api(id,"object-meta").list().catch(()=>[])]);
  const yrs=yearsOf(metaRows),years=yrs.text,summary=summaryOf(metaRows);
  const works=rows.filter(r=>r.record_type==="work").sort((a,b)=>(Number(a.data?.order)||0)-(Number(b.data?.order)||0)||Number(a.id)-Number(b.id));
  const photos=rows.filter(r=>r.record_type==="photo").sort((a,b)=>Number(a.id)-Number(b.id));
  const photoSrc=await Promise.all(photos.map(p=>irProject.images.read(p.data?.file_path||"").catch(()=>"")));
  const may=canEdit(),edit=may&&editing.has(String(id)),sums=totals(works.map(w=>w.data||{}));
  const workRows=works.length?works.map((w,i)=>{const d=w.data||{};return `<tr data-work="${esc(w.id)}"><td class="arch-n">${i+1}</td><td>${edit?`<input data-f="name" value="${esc(d.name||w.title||"")}" placeholder="Вид работ"><input data-f="note" class="arch-note-input" value="${esc(d.note||"")}" placeholder="Состав работ (необязательно)">`:`<b>${esc(d.name||w.title||"")}</b>${d.note?`<small>${esc(d.note)}</small>`:""}`}</td><td class="arch-unit">${edit?`<input data-f="unit" value="${esc(d.unit||"")}" placeholder="т, м², шт">`:esc(d.unit||"")}</td><td class="arch-vol">${edit?`<input data-f="volume" value="${esc(d.volume??"")}" inputmode="decimal" placeholder="0">`:esc(fmt(d.volume))}</td>${edit?`<td class="arch-del"><button type="button" data-del-work="${esc(w.id)}" title="Удалить строку" aria-label="Удалить строку">${I.trash}</button></td>`:""}</tr>`}).join(""):`<tr class="arch-empty-row"><td colspan="${edit?5:4}">Виды работ ещё не указаны${edit?" — нажмите «Добавить вид работ»":""}.</td></tr>`;
  const gallery=photos.length?photos.map((p,i)=>photoSrc[i]?`<div class="arch-photo"><button type="button" class="object-photo-tile" data-photo-src="${esc(photoSrc[i])}" data-photo-number="${i+1}"><img src="${esc(photoSrc[i])}" alt="Фото ${i+1}" loading="lazy"><span>Фото ${i+1}</span></button>${edit?`<button type="button" class="arch-photo-del" data-del-photo="${esc(p.id)}" title="Удалить фото" aria-label="Удалить фото">${I.trash}</button>`:""}</div>`:"").join(""):`<div class="object-photos-empty"><b>Фотографий пока нет</b>${edit?"<span>Нажмите «Добавить фото».</span>":""}</div>`;
  app.innerHTML=`<div class="arch-page">
<section class="arch-card arch-hero arch-head" data-object-id="${esc(id)}"><div class="arch-head-top"><div class="arch-head-title"><h1>${esc(o.name)}</h1><span class="arch-status">${I.check}<span>Завершён</span></span></div>${may?`<div class="arch-head-actions">${edit?`<button type="button" class="arch-btn" data-arch-form>${I.edit}<span>Данные объекта</span></button><button type="button" class="arch-btn primary" data-arch-done>${I.check}<span>Готово</span></button>`:`<button type="button" class="arch-btn" data-arch-edit>${I.edit}<span>Редактировать</span></button>`}<button type="button" class="arch-btn danger" data-arch-delete>${I.trash}<span>Удалить</span></button></div>`:""}</div><dl class="arch-facts"><div>${I.org}<span><dt>Заказчик</dt><dd>${esc(o.customer||"—")}</dd></span></div>${String(o.general_contractor||"").trim()?`<div>${I.helmet}<span><dt>Генподрядчик</dt><dd>${esc(o.general_contractor)}</dd></span></div>`:""}<div>${I.cal}<span><dt>${yrs.start&&yrs.end&&yrs.start!==yrs.end||!(yrs.start||yrs.end)?"Годы работ":"Год работ"}</dt><dd>${yrs.start&&yrs.end&&yrs.start!==yrs.end?`${esc(yrs.start)} — ${esc(yrs.end)}`:esc(yrs.start||yrs.end||"Не указаны")}</dd></span></div><div>${I.pin}<span><dt>Адрес</dt><dd>${esc(o.address||"Не указан")}</dd></span></div></dl>${edit?'<p class="arch-hint arch-edit-note">Редактирование: поля ниже сохраняются сами. «Данные объекта» — название, заказчик, адрес, годы, обложка.</p>':""}</section>
${sums.length?`<div class="arch-totals">${sums.map(s=>`<div><b>${esc(fmt(s.value))} ${esc(unitWord(s.value,s.unit))}</b><span>${esc(totalLabel(s.unit))}</span></div>`).join("")}</div>`:""}
<section class="arch-card"><div class="arch-card-head"><div><h2>Виды работ и объёмы</h2><p>${works.length} ${ru(works.length,"вид","вида","видов")} работ</p></div>${edit?`<button type="button" class="arch-add" data-add-work>${I.plus}<span>Добавить вид работ</span></button>`:""}</div><div class="arch-table-wrap"><table class="arch-table"><thead><tr><th>№</th><th>Вид работ</th><th>Ед.</th><th>Объём</th>${edit?"<th></th>":""}</tr></thead><tbody>${workRows}</tbody></table></div>${edit&&works.length?'<p class="arch-hint">Изменения сохраняются сами, когда вы выходите из поля.</p>':""}</section>
${edit||summary?`<section class="arch-card arch-summary"><div class="arch-card-head"><div><h2>Краткая характеристика объекта</h2><p>${edit?"Что это за объект: назначение, размеры, конструкции, особенности":"Об объекте"}</p></div></div>${edit?`<div class="arch-rte"><div class="arch-rte-bar" role="toolbar" aria-label="Оформление текста"><button type="button" data-fmt="bold" title="Жирный (Ctrl+B)">${I_FMT.bold}</button><button type="button" data-fmt="italic" title="Курсив (Ctrl+I)">${I_FMT.italic}</button><span class="arch-rte-sep"></span><button type="button" data-fmt="h" title="Заголовок">${I_FMT.h}</button><button type="button" data-fmt="ul" title="Маркированный список">${I_FMT.ul}</button><button type="button" data-fmt="ol" title="Нумерованный список">${I_FMT.ol}</button></div><div class="arch-rte-text arch-summary-text" data-summary contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Например: производственный цех 72×24 м, каркас из стальных колонн и ферм, кровля и стены из сэндвич-панелей, мостовой кран 10 т.">${summaryHtml(summary)}</div></div><p class="arch-hint">Сохраняется само, когда вы выходите из поля. До ${SUMMARY_MAX} знаков.</p>`:`<div class="arch-summary-text">${summaryHtml(summary)}</div>`}</section>`:""}
<section class="arch-card"><div class="arch-card-head"><div><h2>Фотографии объекта</h2><p>${photos.length} фото</p></div>${edit?`<button type="button" class="arch-add" data-add-photo>${I.plus}<span>Добавить фото</span></button>`:""}</div><div class="arch-gallery">${gallery}</div></section>
</div><div class="object-photo-lightbox" id="archLightbox" hidden><button type="button" class="object-photo-lightbox-close" id="archLightboxClose">×</button><div class="object-photo-lightbox-meta" id="archLightboxMeta"></div><img id="archLightboxImg" alt="Фото объекта"></div>${typeof formHtml==="function"?formHtml():""}`;
  try{if(typeof refreshVersion==="function")refreshVersion()}catch{}
  try{if(typeof setupObjectForm==="function")setupObjectForm()}catch(e){console.error("archive form",e)}
  const q=s=>app.querySelector(s),qa=s=>[...app.querySelectorAll(s)];
  const again=()=>page(id,true);
  const fd=document.getElementById("formDialog");
  q("[data-arch-edit]")?.addEventListener("click",()=>{editing.add(String(id));page(id,true)});
  q("[data-arch-done]")?.addEventListener("click",()=>{editing.delete(String(id));page(id,true)});
  q("[data-arch-form]")?.addEventListener("click",async()=>{if(typeof window.openObjectForm==="function"){await window.openObjectForm(id);fd?.addEventListener("close",()=>setTimeout(()=>{if(location.hash.replace(/^#/,"")===`/objects/object/${id}`)page(id,true)},50),{once:true})}});
  // Удаление — как у объекта в списке: в «Удалённые объекты», восстановить можно 7 дней.
  q("[data-arch-delete]")?.addEventListener("click",async()=>{
   if(!confirm(`Удалить объект «${o.name}»?\n\nОн попадёт в «Удалённые объекты» на странице объектов — восстановить можно в течение 7 дней.`))return;
   await irProject.data.objects.remove(id);editing.delete(String(id));known.delete(String(id));location.hash="/objects"});
  const rte=q("[data-summary]");
  if(rte){
   const sync=()=>{const v=document.queryCommandValue("formatBlock");qa("[data-fmt]").forEach(b=>{const f=b.dataset.fmt;let on=false;try{on=f==="h"?/^h\d$/i.test(v):f==="ul"?document.queryCommandState("insertUnorderedList"):f==="ol"?document.queryCommandState("insertOrderedList"):document.queryCommandState(f)}catch{}b.classList.toggle("on",on)})};
   const empty=()=>rte.classList.toggle("empty",!rte.textContent.trim());empty();
   try{document.execCommand("defaultParagraphSeparator",false,"p")}catch{}
   qa("[data-fmt]").forEach(b=>{b.addEventListener("mousedown",e=>e.preventDefault());b.addEventListener("click",()=>{rte.focus();const f=b.dataset.fmt;
    if(f==="h"){const n=getSelection().anchorNode,el=n&&(n.nodeType===1?n:n.parentElement),hd=el&&el.closest("h1,h2,h3,h4,h5,h6");document.execCommand("formatBlock",false,hd&&rte.contains(hd)?"p":"h3")}
    else if(f==="ul")document.execCommand("insertUnorderedList");else if(f==="ol")document.execCommand("insertOrderedList");else document.execCommand(f);
    sync();empty()})});
   rte.addEventListener("keyup",sync);rte.addEventListener("mouseup",sync);rte.addEventListener("input",empty);
   // вставка — только текст: чужое оформление (шрифты, цвета, таблицы) не приносится
   rte.addEventListener("paste",e=>{e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain"))});
   let last=summary;
   rte.addEventListener("blur",async()=>{const md=editorToMd(rte);if(md===last)return;try{last=await setSummary(id,md);if(last!==md)rte.innerHTML=summaryHtml(last);empty()}catch(err){console.error("summary",err)}});
  }
  q("[data-add-work]")?.addEventListener("click",async()=>{await api(id,SECTION).create({record_type:"work",title:"",data:{name:"",unit:"",volume:"",order:works.length+1}});await again();const inputs=qa('tr[data-work] input[data-f="name"]');inputs[inputs.length-1]?.focus()});
  qa("tr[data-work]").forEach(tr=>{
   const w=works.find(x=>String(x.id)===tr.dataset.work);if(!w)return;
   tr.querySelectorAll("input[data-f]").forEach(inp=>inp.addEventListener("change",async()=>{
    const d={...(w.data||{})};d[inp.dataset.f]=inp.value.trim();w.data=d;
    await api(id,SECTION).update(w.id,{record_type:"work",title:d.name||"",data:d});
    if(inp.dataset.f!=="name"){const box=q(".arch-totals"),s=totals(works.map(x=>x.data||{}));const html=s.map(t=>`<div><b>${esc(fmt(t.value))} ${esc(unitWord(t.value,t.unit))}</b><span>${esc(totalLabel(t.unit))}</span></div>`).join("");if(box)box.innerHTML=html;else if(html)q(".arch-hero").insertAdjacentHTML("afterend",`<div class="arch-totals">${html}</div>`)}
   }));
  });
  qa("[data-del-work]").forEach(b=>b.onclick=async()=>{const w=works.find(x=>String(x.id)===b.dataset.delWork);const name=w?.data?.name||"";if(name&&!confirm(`Удалить вид работ «${name}»?`))return;await api(id,SECTION).remove(b.dataset.delWork);again()});
  q("[data-add-photo]")?.addEventListener("click",async()=>{const file=await(irProject.reportPhotos?.selectImage?.()||Promise.resolve(""));if(!file)return;await api(id,SECTION).create({record_type:"photo",title:"Фото объекта",data:{file_path:file}});again()});
  qa("[data-del-photo]").forEach(b=>b.onclick=async()=>{if(!confirm("Удалить это фото?"))return;const p=photos.find(x=>String(x.id)===b.dataset.delPhoto);await api(id,SECTION).remove(b.dataset.delPhoto);if(p?.data?.file_path)await irProject.images.remove(p.data.file_path).catch(()=>{});again()});
  const lb=document.getElementById("archLightbox"),img=document.getElementById("archLightboxImg"),meta=document.getElementById("archLightboxMeta");
  qa(".arch-gallery .object-photo-tile").forEach(t=>t.onclick=()=>{img.src=t.dataset.photoSrc||"";meta.textContent=`${o.name} · Фото ${t.dataset.photoNumber||""}`;lb.hidden=false});
  const close=()=>{lb.hidden=true;img.src=""};document.getElementById("archLightboxClose").onclick=close;lb.onclick=e=>{if(e.target===lb)close()};
 }

 // Обзор объекта: у завершённого — карточка вместо панели с графиком и отчётами (вызов из directObjectPageV3,
 // object-overview-direct-v3.js; этот файл грузится раньше ir-runtime.js).
 // Другие разделы завершённого объекта не открываются: возврат на карточку.
 async function guard(){
  const m=(location.hash.slice(1)||"").match(/^\/objects\/object\/(\d+)\/[^/]/);
  if(!m){if(!/^\/objects\/object\/\d+$/.test(location.hash.slice(1)))document.body.classList.remove("ir-archive-object");return}
  if(await isArchive(m[1]))location.replace(`#/objects/object/${m[1]}`);
 }
 window.addEventListener("hashchange",guard);
 window.irArchive={unitWord,summaryHtml,editorToMd,isArchive,setArchive,getYears,setYears,getSummary,setSummary,page,known,SECTION,KIND};
 if(window.irProject)guard();
})();
