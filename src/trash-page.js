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
 async function page(oid){
  const app=document.getElementById("app");if(!app)return;
  let object=null;try{object=await api().data.objects.get(oid)}catch{}
  let filter="";
  app.innerHTML=`<div class="ir-trash-page"><div class="marks-top"><button class="back" id="trashBack">← Назад</button><div><h1>Корзина</h1><p>${esc(object?.name||"")} · удалённое за последние 7 дней</p></div></div>${note}<div class="ir-trash-tools"><select id="trashFilter"><option value="">Все разделы</option></select></div><div class="ir-trash-list" id="trashList"><div class="ir-trash-empty">Загрузка…</div></div></div>`;
  document.getElementById("trashBack").onclick=()=>location.hash=`/objects/object/${oid}`;
  const box=document.getElementById("trashList"),sel=document.getElementById("trashFilter");
  const routeOk=()=>new RegExp(`^/objects/object/${oid}/trash$`).test(location.hash.slice(1));
  const refresh=async()=>{
   if(!routeOk())return;
   let rows=[];try{rows=await list({objectId:oid})}catch(e){box.innerHTML=`<div class="ir-trash-empty err">${esc(errText(e))}</div>`;return}
   const secs=[...new Map(rows.map(b=>[b.section,b.sectionName])).entries()];
   sel.innerHTML=`<option value="">Все разделы (${rows.length})</option>`+secs.map(([k,n])=>`<option value="${esc(k)}" ${k===filter?"selected":""}>${esc(n)} (${rows.filter(b=>b.section===k).length})</option>`).join("");
   const shown=rows.filter(b=>!filter||b.section===filter);
   box.innerHTML=shown.length?shown.map(b=>batchHtml(b)).join(""):`<div class="ir-trash-empty">За последние 7 дней в объекте ничего не удаляли.</div>`;
   bindRows(box,shown,refresh,()=>{try{window.dispatchEvent(new CustomEvent("ir-work-types-changed",{detail:{objectId:String(oid)}}))}catch{}})
  };
  sel.onchange=()=>{filter=sel.value;refresh()};
  refresh()
 }
 // Главная: «Удалённые объекты (N)», если за 7 дней удаляли объект.
 async function mountHome(){
  const head=document.querySelector(".objects-section .section-head");if(!head||head.querySelector(".ir-trash-home"))return;
  let rows=[];try{rows=await list({kind:"object"})}catch{return}
  if(!rows.length||!head.isConnected||head.querySelector(".ir-trash-home"))return;
  const b=document.createElement("button");b.type="button";b.className="ir-trash-home";b.textContent=`🗑 Удалённые объекты (${rows.length})`;
  b.title="Объекты, удалённые за последние 7 дней, — можно восстановить";
  b.onclick=()=>open({kind:"object",title:"Удалённые объекты",onRestored:()=>{location.reload()}});
  const add=head.querySelector("#add");if(add)add.before(b);else head.append(b)
 }
 window.irTrash={open,page,mountHome};
 // Страница грузится после первого перехода программы: вкладка, открытая сразу на корзине, — открыть её.
 {const m=/^#\/objects\/object\/(\d+)\/trash$/.exec(location.hash);if(m)page(m[1])}
 if(/^#?\/?(objects)?$/.test(location.hash.replace(/^#/,""))||location.hash==="#/objects")setTimeout(mountHome,300);
})();
