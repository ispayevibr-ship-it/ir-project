"use strict";
/*
 * Корзина удалённого (главный процесс — src/trash.js). Удалённое хранится 7 дней и возвращается кнопкой «Восстановить».
 *  - window.irTrash.open({objectId,section,title,onRestored}) — окно поверх страницы (монтажная схема: «🗑 Удалённые»);
 *  - страница объекта #/objects/object/<id>/trash — всё удалённое в объекте (пункт меню «Корзина»);
 *  - на главной — «Удалённые объекты», если за 7 дней удаляли объект целиком.
 * Восстановить может тот, кто может менять этот раздел (как удалить).
 */
(()=>{
 if(window.irTrash)return;
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const api=()=>window.irProjectFast||window.irProject;
 const call=(channel,payload)=>api()?.ai?.invoke?api().ai.invoke(channel,payload):Promise.reject(Error("Нет связи с программой"));
 const errText=e=>/No handler|не зарегистр/i.test(String(e?.message||e))?"Корзина заработает после перезапуска программы (обновление уже установлено): закройте IR Project и откройте снова.":String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
 const when=iso=>{const d=new Date(iso);return isNaN(d)?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})};
 const left=iso=>{const ms=Date.parse(iso)-Date.now();if(!(ms>0))return"сегодня стирается";const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5);return d?`ещё ${d} дн.`:`ещё ${h} ч`};
 // Право «менять раздел» — как у страницы раздела (письма и доп. работы — как отчёты, метизы — как марки).
 const RIGHTS={"ai-documents":"scheme",letters:"reports","extra-works":"reports","executive-docs":"reports",fasteners:"marks","":"marks"};
 const canEdit=section=>{try{return window.irAccess?window.irAccess.canEdit(RIGHTS[section||""]||section)!==false:true}catch{return true}};
 const list=(payload)=>call("ai-settings:trash-list",payload).then(r=>Array.isArray(r)?r:[]);
 function batchHtml(b,{showSection=true}={}){
  const names=[...new Set(b.items.map(i=>i.name))],shown=names.slice(0,8).join(", ")+(names.length>8||b.count>b.items.length?" …":"");
  const what=b.title||"";
  return`<div class="ir-trash-row" data-batch="${b.id}">
   <div class="ir-trash-main"><div class="ir-trash-what">${showSection?`<span class="ir-trash-sec">${esc(b.kind==="object"?"Объект":b.sectionName)}</span>`:""}<b>${esc(b.kind==="object"?b.objectName:shown||"—")}</b>${b.count>1?`<em>${b.count} шт.</em>`:""}</div>
    <small>${esc(what&&b.kind!=="object"?what+" · ":"")}${b.kind==="object"?`с данными: ${b.count} записей · `:""}удалено ${esc(when(b.deletedAt))} · хранится ${esc(left(b.expiresAt))}</small></div>
   ${canEdit(b.section)?`<button type="button" class="ir-trash-restore" data-restore="${b.id}">↺ Восстановить</button>`:""}
  </div>`
 }
 async function restore(b,after){
  const name=b.kind==="object"?`объект «${b.objectName}» со всеми данными`:(b.count>1?`${b.count} записей`:"запись")+(b.items[0]?` «${b.items[0].name}»`:"");
  if(!confirm(`Восстановить ${name}?`))return false;
  try{const r=await call("ai-montage:trash-restore",{id:b.id});try{api()?.dataCache?.forget?.()}catch{}await after?.(r);return r}
  catch(e){alert("Не удалось восстановить: "+errText(e));return false}
 }
 function bindRows(host,rows,refresh,after){
  host.querySelectorAll("[data-restore]").forEach(btn=>btn.onclick=async()=>{
   const b=rows.find(x=>String(x.id)===btn.dataset.restore);if(!b)return;btn.disabled=true;
   const r=await restore(b,after);btn.disabled=false;if(r)refresh()})
 }
 const note=`<p class="ir-trash-note">Удалённое хранится 7 дней, потом стирается само. Восстановленное возвращается на своё место с прежними номерами (связи с отчётами, ведомостью и схемой сохраняются).</p>`;
 // Окно поверх страницы.
 function open({objectId=null,section="",kind="",title="Удалённое",onRestored=null}={}){
  document.querySelector(".ir-trash-overlay")?.remove();
  const o=document.createElement("div");o.className="ir-trash-overlay";
  o.innerHTML=`<div class="ir-trash-dialog" role="dialog" aria-label="${esc(title)}"><div class="ir-trash-head"><h2>🗑 ${esc(title)}</h2><button type="button" class="ir-trash-x" title="Закрыть">×</button></div>${note}<div class="ir-trash-list"><div class="ir-trash-empty">Загрузка…</div></div></div>`;
  const key=e=>{if(e.key==="Escape"){e.stopPropagation();close()}};
  const close=()=>{o.remove();document.removeEventListener("keydown",key,true)};
  o.addEventListener("click",e=>{if(e.target===o)close()});o.querySelector(".ir-trash-x").onclick=close;
  document.addEventListener("keydown",key,true);document.body.appendChild(o);
  const box=o.querySelector(".ir-trash-list");
  const refresh=async()=>{
   let rows=[];try{rows=await list({objectId,section,kind})}catch(e){box.innerHTML=`<div class="ir-trash-empty err">${esc(errText(e))}</div>`;return}
   box.innerHTML=rows.length?rows.map(b=>batchHtml(b,{showSection:!section})).join(""):`<div class="ir-trash-empty">За последние 7 дней ничего не удаляли.</div>`;
   bindRows(box,rows,refresh,onRestored)
  };
  refresh();return{close,refresh}
 }
 // Страница объекта «Корзина».
 // Страница объекта «Корзина» — в виде остальных разделов объекта (как «Ведомость метизов»): шапка с «Назад»,
 // карточки итогов, строка поиска с вкладками разделов, таблица.
 const short=iso=>{const d=new Date(iso);return isNaN(d)?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
 function rowHtml(b){
  const names=[...new Set(b.items.map(i=>i.name))],what=names.slice(0,6).join(", ")+(names.length>6||b.count>b.items.length?" …":"");
  const soon=Date.parse(b.expiresAt)-Date.now()<864e5;
  return`<tr><td><span class="ir-trash-sec">${esc(b.sectionName)}</span></td><td><b>${esc(what||"—")}</b>${b.title?`<small>${esc(b.title)}</small>`:""}</td>
   <td class="n">${b.count}</td><td class="nw">${esc(short(b.deletedAt))}</td><td class="nw ${soon?"ir-trash-soon":""}">${esc(left(b.expiresAt))}</td>
   <td class="act">${canEdit(b.section)?`<button type="button" class="ir-trash-restore" data-restore="${b.id}">↺ Восстановить</button>`:""}</td></tr>`
 }
 async function page(oid){
  const app=document.getElementById("app");if(!app)return;
  let object=null;try{object=await api().data.objects.get(oid)}catch{}
  let filter="",query="",rows=[],error="";
  const routeOk=()=>new RegExp(`^/objects/object/${oid}/trash$`).test(location.hash.slice(1));
  const paint=()=>{
   if(!routeOk())return;
   const q=query.trim().toLowerCase(),secs=[...new Map(rows.map(b=>[b.section,b.sectionName])).entries()];
   const shown=rows.filter(b=>(!filter||b.section===filter)&&(!q||[b.sectionName,b.title,...b.items.map(i=>i.name)].join(" ").toLowerCase().includes(q)));
   const total=rows.reduce((n,b)=>n+(Number(b.count)||0),0),soon=rows.filter(b=>Date.parse(b.expiresAt)-Date.now()<864e5);
   const tab=(k,n,c)=>`<button type="button" data-sec="${esc(k)}" class="${filter===k?"on":""}">${esc(n)} <i>${c}</i></button>`;
   app.innerHTML=`<div class="ir-trash-page"><div class="marks-top"><button class="back" id="trashBack">← Назад</button><div><h1>Корзина</h1><p>${esc(object?.name||"")}</p></div></div>
    <div class="ir-trash-source">Здесь всё, что удалили в объекте за последние <b>7 дней</b>: элементы схемы, марки, отчёты, поставки, письма, чертежи. Через 7 дней удалённое стирается само. Восстановленное возвращается на своё место с прежними номерами — связи с отчётами, ведомостью и схемой сохраняются.</div>
    <div class="ir-trash-cards"><div class="ir-trash-card"><small>В корзине</small><b>${total} шт.</b><span>удалений: ${rows.length}</span></div>
     <div class="ir-trash-card"><small>Стирается в ближайшие сутки</small><b class="${soon.length?"warn":""}">${soon.reduce((n,b)=>n+(Number(b.count)||0),0)} шт.</b><span>удалений: ${soon.length}</span></div>
     <div class="ir-trash-card"><small>Срок хранения</small><b>7 дней</b><span>от момента удаления</span></div></div>
    <div class="marks-tools ir-trash-tools"><input id="trashSearch" value="${esc(query)}" placeholder="Поиск по марке, номеру, названию…"><div class="ir-trash-tabs">${tab("","Все",rows.length)}${secs.map(([k,n])=>tab(k,n,rows.filter(b=>b.section===k).length)).join("")}</div></div>
    ${error?`<div class="ir-trash-empty err">${esc(error)}</div>`:shown.length?`<div class="ir-trash-table-wrap"><table class="ir-trash-table"><thead><tr><th>Раздел</th><th>Что удалено</th><th class="n">Кол-во</th><th>Удалено</th><th>Хранится</th><th></th></tr></thead><tbody>${shown.map(rowHtml).join("")}</tbody></table></div>`
     :`<div class="ir-trash-empty">${rows.length?"Ничего не найдено":"За последние 7 дней в объекте ничего не удаляли."}</div>`}</div>`;
   document.getElementById("trashBack").onclick=()=>location.hash=`/objects/object/${oid}`;
   const sIn=document.getElementById("trashSearch");sIn.oninput=()=>{query=sIn.value;const pos=sIn.selectionStart;paint();const n=document.getElementById("trashSearch");n.focus();n.setSelectionRange(pos,pos)};
   app.querySelectorAll("[data-sec]").forEach(b=>b.onclick=()=>{filter=b.dataset.sec;paint()});
   bindRows(app,shown,refresh,()=>{try{window.dispatchEvent(new CustomEvent("ir-work-types-changed",{detail:{objectId:String(oid)}}))}catch{}})
  };
  const refresh=async()=>{
   if(!routeOk())return;
   try{rows=await list({objectId:oid});error=""}catch(e){rows=[];error=errText(e)}
   if(filter&&!rows.some(b=>b.section===filter))filter="";
   paint()
  };
  app.innerHTML=`<div class="ir-trash-page"><div class="marks-top"><button class="back" id="trashBack">← Назад</button><div><h1>Корзина</h1><p>${esc(object?.name||"")}</p></div></div><div class="ir-trash-empty">Загрузка…</div></div>`;
  document.getElementById("trashBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  refresh()
 }
 // Главная: «Удалённые объекты (N)», если за 7 дней удаляли объект.
 async function mountHome(){
  const head=document.querySelector(".objects-section .section-head");if(!head||head.querySelector(".ir-trash-home"))return;
  let rows=[];try{rows=await list({kind:"object"})}catch{return}
  if(!rows.length||!head.isConnected||head.querySelector(".ir-trash-home"))return;
  const b=document.createElement("button");b.type="button";b.className="ir-trash-home";b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg><span>Удалённые объекты (${rows.length})</span>`;
  b.title="Объекты, удалённые за последние 7 дней, — можно восстановить";
  b.onclick=()=>open({kind:"object",title:"Удалённые объекты",onRestored:()=>{location.reload()}});
  const add=head.querySelector("#add");if(add)add.before(b);else head.append(b)
 }
 window.irTrash={open,page,mountHome};
 // Страница грузится после первого перехода программы: вкладка, открытая сразу на корзине, — открыть её.
 {const m=/^#\/objects\/object\/(\d+)\/trash$/.exec(location.hash);if(m)page(m[1])}
 if(/^#?\/?(objects)?$/.test(location.hash.replace(/^#/,""))||location.hash==="#/objects")setTimeout(mountHome,300);
})();
