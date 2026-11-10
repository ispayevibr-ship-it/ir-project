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
 const ru=(n,one,few,many)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many};
 const num=v=>{const n=Number(String(v??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:NaN};
 const fmt=v=>{const n=num(v);return Number.isFinite(n)?n.toLocaleString("ru-RU",{maximumFractionDigits:3}):String(v??"")};
 const svg=p=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
 const I={edit:svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>'),pin:svg('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),check:svg('<path d="m5 12 4 4L19 6"/>'),trash:svg('<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>'),plus:svg('<path d="M12 5v14M5 12h14"/>')};

 // Объёмы одной единицы складываются в итог («465 т», «14 900 м²»).
 function totals(works){const m=new Map();for(const w of works){const u=String(w.unit||"").trim(),n=num(w.volume);if(!u||!Number.isFinite(n))continue;m.set(u,(m.get(u)||0)+n)}return[...m].map(([u,n])=>({unit:u,value:n}))}

 async function page(id){
  const app=document.getElementById("app");
  const o=await irProject.data.objects.get(id);if(!o){location.hash="/objects";return}
  document.body.classList.remove("ir-object-overview");document.body.classList.add("ir-archive-object");
  const [rows,metaRows]=await Promise.all([api(id,SECTION).list().catch(()=>[]),api(id,"object-meta").list().catch(()=>[])]);
  const years=String(metaRows.find(r=>r.record_type==="object_years")?.data?.value||"");
  const works=rows.filter(r=>r.record_type==="work").sort((a,b)=>(Number(a.data?.order)||0)-(Number(b.data?.order)||0)||Number(a.id)-Number(b.id));
  const photos=rows.filter(r=>r.record_type==="photo").sort((a,b)=>Number(a.id)-Number(b.id));
  let bannerUrl="",coverUrl="";
  try{const map=typeof objectPhotoMap==="function"?await objectPhotoMap(id):{};if(map.banner?.data?.file_path)bannerUrl=await irProject.images.read(map.banner.data.file_path).catch(()=>"");if(map.cover?.data?.file_path)coverUrl=await irProject.images.read(map.cover.data.file_path).catch(()=>"")}catch{}
  const photoSrc=await Promise.all(photos.map(p=>irProject.images.read(p.data?.file_path||"").catch(()=>"")));
  const edit=canEdit(),sums=totals(works.map(w=>w.data||{}));
  const bg=bannerUrl||coverUrl;
  const workRows=works.length?works.map((w,i)=>{const d=w.data||{};return `<tr data-work="${esc(w.id)}"><td class="arch-n">${i+1}</td><td>${edit?`<input data-f="name" value="${esc(d.name||w.title||"")}" placeholder="Вид работ"><input data-f="note" class="arch-note-input" value="${esc(d.note||"")}" placeholder="Состав работ (необязательно)">`:`<b>${esc(d.name||w.title||"")}</b>${d.note?`<small>${esc(d.note)}</small>`:""}`}</td><td class="arch-unit">${edit?`<input data-f="unit" value="${esc(d.unit||"")}" placeholder="т, м², шт">`:esc(d.unit||"")}</td><td class="arch-vol">${edit?`<input data-f="volume" value="${esc(d.volume??"")}" inputmode="decimal" placeholder="0">`:esc(fmt(d.volume))}</td>${edit?`<td class="arch-del"><button type="button" data-del-work="${esc(w.id)}" title="Удалить строку" aria-label="Удалить строку">${I.trash}</button></td>`:""}</tr>`}).join(""):`<tr class="arch-empty-row"><td colspan="${edit?5:4}">Виды работ ещё не указаны${edit?" — нажмите «Добавить вид работ»":""}.</td></tr>`;
  const gallery=photos.length?photos.map((p,i)=>photoSrc[i]?`<div class="arch-photo"><button type="button" class="object-photo-tile" data-photo-src="${esc(photoSrc[i])}" data-photo-number="${i+1}"><img src="${esc(photoSrc[i])}" alt="Фото ${i+1}" loading="lazy"><span>Фото ${i+1}</span></button>${edit?`<button type="button" class="arch-photo-del" data-del-photo="${esc(p.id)}" title="Удалить фото" aria-label="Удалить фото">${I.trash}</button>`:""}</div>`:"").join(""):`<div class="object-photos-empty"><b>Фотографий пока нет</b>${edit?"<span>Нажмите «Добавить фото».</span>":""}</div>`;
  app.innerHTML=`<div class="arch-page">
<section class="object-overview-hero arch-hero" data-object-id="${esc(id)}">${bg?`<div class="object-overview-hero-bg" style="background-image:linear-gradient(180deg,rgba(10,17,27,.05),rgba(10,17,27,.35)),url(&quot;${bg}&quot;)"></div>`:""}<div class="object-hero-shade"></div><div class="object-hero-content"><div class="object-hero-top"><div class="object-hero-copy"><div class="object-hero-breadcrumbs"><button type="button" data-arch-objects>Объекты</button><span>›</span><span>${esc(o.name)}</span></div><h1>${esc(o.name)}</h1><div class="object-hero-contract"><span><b>Заказчик:</b> ${esc(o.customer||"—")}</span><span><b>Генподрядчик:</b> ${esc(o.general_contractor||"—")}</span></div></div><div class="object-hero-actions">${edit?`<button type="button" class="object-hero-action" data-arch-edit>${I.edit}<span>Редактировать</span></button>`:""}</div></div><div class="object-hero-info"><div class="object-hero-status done">${I.check}<span>Завершён${years?" · "+esc(years):""}</span></div><div class="object-hero-info-item location">${I.pin}<div><b>${esc(o.address||"Адрес не указан")}</b><span>Расположение объекта</span></div></div></div></div></section>
${sums.length?`<div class="arch-totals">${sums.map(s=>`<div><b>${esc(fmt(s.value))} ${esc(s.unit)}</b><span>Всего, ${esc(s.unit)}</span></div>`).join("")}</div>`:""}
<section class="arch-card"><div class="arch-card-head"><div><h2>Виды работ и объёмы</h2><p>${works.length} ${ru(works.length,"вид","вида","видов")} работ</p></div>${edit?`<button type="button" class="arch-add" data-add-work>${I.plus}<span>Добавить вид работ</span></button>`:""}</div><div class="arch-table-wrap"><table class="arch-table"><thead><tr><th>№</th><th>Вид работ</th><th>Ед.</th><th>Объём</th>${edit?"<th></th>":""}</tr></thead><tbody>${workRows}</tbody></table></div>${edit&&works.length?'<p class="arch-hint">Изменения сохраняются сами, когда вы выходите из поля.</p>':""}</section>
<section class="arch-card"><div class="arch-card-head"><div><h2>Фотографии объекта</h2><p>${photos.length} фото</p></div>${edit?`<button type="button" class="arch-add" data-add-photo>${I.plus}<span>Добавить фото</span></button>`:""}</div><div class="arch-gallery">${gallery}</div></section>
</div><div class="object-photo-lightbox" id="archLightbox" hidden><button type="button" class="object-photo-lightbox-close" id="archLightboxClose">×</button><div class="object-photo-lightbox-meta" id="archLightboxMeta"></div><img id="archLightboxImg" alt="Фото объекта"></div>${typeof formHtml==="function"?formHtml():""}`;
  try{if(typeof refreshVersion==="function")refreshVersion()}catch{}
  try{if(typeof setupObjectForm==="function")setupObjectForm()}catch(e){console.error("archive form",e)}
  const q=s=>app.querySelector(s),qa=s=>[...app.querySelectorAll(s)];
  const again=()=>page(id);
  q("[data-arch-objects]").onclick=()=>location.hash="/objects";
  const fd=document.getElementById("formDialog");
  q("[data-arch-edit]")?.addEventListener("click",async()=>{if(typeof window.openObjectForm==="function"){await window.openObjectForm(id);fd?.addEventListener("close",()=>setTimeout(()=>{if(location.hash.replace(/^#/,"")===`/objects/object/${id}`)(typeof objectPage==="function"?objectPage:page)(id)},50),{once:true})}});
  q("[data-add-work]")?.addEventListener("click",async()=>{await api(id,SECTION).create({record_type:"work",title:"",data:{name:"",unit:"",volume:"",order:works.length+1}});await again();const inputs=qa('tr[data-work] input[data-f="name"]');inputs[inputs.length-1]?.focus()});
  qa("tr[data-work]").forEach(tr=>{
   const w=works.find(x=>String(x.id)===tr.dataset.work);if(!w)return;
   tr.querySelectorAll("input[data-f]").forEach(inp=>inp.addEventListener("change",async()=>{
    const d={...(w.data||{})};d[inp.dataset.f]=inp.value.trim();w.data=d;
    await api(id,SECTION).update(w.id,{record_type:"work",title:d.name||"",data:d});
    if(inp.dataset.f!=="name"){const box=q(".arch-totals"),s=totals(works.map(x=>x.data||{}));const html=s.map(t=>`<div><b>${esc(fmt(t.value))} ${esc(t.unit)}</b><span>Всего, ${esc(t.unit)}</span></div>`).join("");if(box)box.innerHTML=html;else if(html)q(".arch-hero").insertAdjacentHTML("afterend",`<div class="arch-totals">${html}</div>`)}
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
 // Объекты портфолио компании (archive-import.js): кнопка у администратора на списке объектов, пока не все загружены.
 const call=(ch,v)=>irProject.ai?.invoke?irProject.ai.invoke("ai-settings:archive-portfolio-"+ch,v):Promise.reject(Error("Недоступно"));
 let portfolioState=null,portfolioAsked=0;
 async function portfolioButton(){
  const box=document.querySelector(".objects-add-buttons");if(!box||box.querySelector("[data-portfolio]"))return;
  if(window.irAccess?.role?.()!=="admin")return;
  if(!portfolioState||Date.now()-portfolioAsked>60000){portfolioAsked=Date.now();try{portfolioState=await call("status")}catch{portfolioState=null}}
  const st=portfolioState;if(!st?.ready||!(st.total>st.imported)||box.querySelector("[data-portfolio]"))return;
  const b=document.createElement("button");b.type="button";b.className="ghost-btn";b.dataset.portfolio="1";
  const left=st.total-st.imported;b.textContent=`⤓ Объекты портфолио (${left})`;b.title="Завершённые объекты компании с сайта: виды работ, объёмы и фото";
  b.onclick=async()=>{
   if(!confirm(`Загрузить в программу ${left} завершённых объектов портфолио компании (виды работ, объёмы, фото)?\n\nОни появятся у вас и, через синхронизацию, у тех, кому вы дадите доступ.`))return;
   b.disabled=true;const timer=setInterval(async()=>{try{const p=await call("progress");if(p)b.textContent=`Загрузка… ${p.done} из ${p.total}`}catch{}},1500);
   try{const r=await call("import");portfolioState=null;alert(`Загружено объектов: ${r.imported}, фото: ${r.photos}.`)}
   catch(e){alert("Объекты не загружены: "+(e.message||e));b.disabled=false}
   finally{clearInterval(timer)}
   if(location.hash.replace(/^#/,"")==="/objects"||!location.hash)try{objectsPage()}catch{location.reload()}
  };
  box.prepend(b)
 }
 const appRoot=document.getElementById("app");
 if(appRoot)new MutationObserver(()=>{if(document.querySelector(".objects-add-buttons:not([data-portfolio-seen])")){document.querySelector(".objects-add-buttons").dataset.portfolioSeen="1";portfolioButton()}}).observe(appRoot,{childList:true,subtree:true});
 window.addEventListener("hashchange",guard);
 window.irArchive={isArchive,setArchive,page,known,SECTION,KIND};
 if(window.irProject)guard();
})();
