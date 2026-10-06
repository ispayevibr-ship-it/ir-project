"use strict";
(()=>{
 const base=window.irDeliveriesPage;if(typeof base!=="function")return;
 const PAGE_SIZE=15;
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??0).trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const record=r=>({id:String(r.id),record_type:r.record_type||"delivery",title:r.title||"",...(r.data||{})});
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const baseHash=oid=>`/objects/object/${oid}/deliveries`;
 const detailHash=(oid,id)=>`${baseHash(oid)}?id=${encodeURIComponent(id)}`;
 const newHash=oid=>`${baseHash(oid)}?mode=new`;
 const editHash=(oid,id)=>`${baseHash(oid)}?mode=edit&id=${encodeURIComponent(id)}`;
 const pageHash=(oid,page)=>page>1?`${baseHash(oid)}?page=${page}`:baseHash(oid);
 function replaceButton(el,handler){if(!el)return null;const clone=el.cloneNode(true);el.replaceWith(clone);clone.onclick=e=>{e.preventDefault();e.stopPropagation();handler(e)};return clone}
 function wireListActions(oid){
  replaceButton(document.getElementById("deliveryAdd"),()=>location.hash=newHash(oid));
  document.querySelectorAll("[data-delivery-edit]").forEach(btn=>replaceButton(btn,()=>location.hash=editHash(oid,btn.dataset.deliveryEdit)));
 }
 function wireDetail(oid,id){
  const back=document.getElementById("deliveryDetailBack");if(back)back.onclick=()=>location.hash=baseHash(oid);
  replaceButton(document.getElementById("deliveryDetailEdit"),()=>location.hash=editHash(oid,id));
  const title=document.querySelector(".deliveries-head h1");if(title)title.dataset.deliveryId=String(id);
 }
 function paginate(oid,page){
  const list=document.querySelector(".delivery-list");if(!list)return;
  const rows=[...list.querySelectorAll(".delivery-row")];
  if(!rows.length)return;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.max(1,Math.min(totalPages,Number(page)||1));
  rows.forEach((row,i)=>{
   row.hidden=i<(current-1)*PAGE_SIZE||i>=current*PAGE_SIZE;
   row.addEventListener("click",e=>{
    if(e.target.closest(".delivery-actions"))return;
    e.preventDefault();e.stopImmediatePropagation();location.hash=detailHash(oid,row.dataset.deliveryId);
   },true);
  });
  document.querySelector(".delivery-pagination")?.remove();
  if(totalPages<=1)return;
  const wrap=document.createElement("div");wrap.className="delivery-pagination";
  const nums=Array.from({length:totalPages},(_,i)=>i+1);
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${Math.min((current-1)*PAGE_SIZE+1,rows.length)}–${Math.min(current*PAGE_SIZE,rows.length)} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-page="${current-1}" ${current<=1?"disabled":""}>‹</button>${nums.map(n=>`<button type="button" data-page="${n}" class="${n===current?"active":""}">${n}</button>`).join("")}<button type="button" data-page="${current+1}" ${current>=totalPages?"disabled":""}>›</button></div>`;
  document.querySelector(".delivery-card")?.insertAdjacentElement("afterend",wrap);
  wrap.querySelectorAll("button[data-page]").forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=totalPages)location.hash=pageHash(oid,p)});
 }
 async function renderForm(oid,route){
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("deliveries"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);if(!object){location.hash="/objects";return}
  const [raw,workRows,markRows]=await Promise.all([api.list().catch(()=>[]),wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]),rows=raw.map(record),editing=route.mode==="edit",editId=editing?String(route.deliveryId||""):"",current=editing?rows.find(x=>String(x.id)===editId):null;
  if(editing&&!current){location.hash=baseHash(oid);return}
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("deliveries"):false;if(!canEdit()){location.hash=editing?detailHash(oid,editId):baseHash(oid);return}
  const workTypes=()=>arr(workRows).map(r=>({id:String(r.id),name:r.data?.work_type||r.title||"Без названия",code:r.data?.project_code||"",unit:r.data?.unit||""}));
  const marks=()=>arr(markRows).map(r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})}));
  const deliveredMap=excludeId=>{const map={};for(const r of rows){if(excludeId&&String(r.id)===String(excludeId))continue;for(const x of itemsOf(r)){const id=String(x.mark_id||"");if(id)map[id]=(map[id]||0)+num(x.qty??x.count??x.quantity)}}return map};
  const delivered=deliveredMap(editId);
  const markState=m=>{const total=num(m.qty??m.count),done=Math.min(total,delivered[String(m.id)]||0),left=Math.max(0,total-done),uv=num(m.unit_volume??m.volume_one);return{total,done,left,uv}};
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(w.name)}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
  const positionRow=x=>`<div class="delivery-form-position"><label class="dfp-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="dfp-code">Шифр<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="dfp-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="dfp-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label class="dfp-volume">Объём<input name="volume" readonly value="${esc(x?.volume??x?.total_volume??"")}" placeholder="0"></label><label class="dfp-unit">Ед.<input name="unit" readonly value="${esc(x?.unit||"")}" placeholder="—"></label><button type="button" class="row-remove delivery-form-remove" title="Удалить позицию">×</button></div>`;
  const initial=editing?itemsOf(current):[];
  app.innerHTML=`<div class="delivery-form-page"><div class="delivery-form-page-head"><button class="back" id="deliveryFormBack">← К накладным</button><div><h1>${editing?`Редактирование накладной №${esc(current.number||current.delivery_number||current.id)}`:"Новая накладная"}</h1><p>${esc(object.name||"")}</p></div><button class="delivery-form-save-top" form="deliveryStandaloneForm">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div><form id="deliveryStandaloneForm" class="delivery-standalone-form"><section class="delivery-form-section"><div class="delivery-form-section-head"><span>01</span><div><h2>Данные накладной</h2><p>Номер, дата и транспорт</p></div></div><div class="delivery-form-section-body delivery-form-main-grid"><label>Номер накладной<input name="number" required value="${esc(current?.number||current?.delivery_number||"")}" placeholder="Например: 154"></label><label>Дата<input type="date" name="date" required value="${esc(String(current?.date||current?.delivery_date||"").slice(0,10))}"></label><label>Машина №<input name="vehicle_number" value="${esc(current?.vehicle_number||"")}" placeholder="Например: 777 ABC 09"></label><label>ФИО водителя<input name="driver_name" value="${esc(current?.driver_name||"")}" placeholder="ФИО водителя"></label><label>Общий тоннаж<input name="total_tonnage" inputmode="decimal" required value="${editing?esc(fmt(current?.total_tonnage??current?.tonnage)):""}" placeholder="0,000"><small>Общий вес по накладной, тн</small></label></div></section><section class="delivery-form-section"><div class="delivery-form-section-head"><span>02</span><div><h2>Марки по накладной</h2><p>Вид работы → шифр → марка → количество</p></div><button type="button" class="delivery-form-add-position" id="deliveryFormAddPosition">＋ Добавить марку</button></div><div class="delivery-form-section-body"><div id="deliveryFormPositions" class="delivery-form-positions">${(initial.length?initial:[{}]).map(positionRow).join("")}</div></div></section><div class="delivery-form-bottom"><button type="button" id="deliveryFormCancel">Отмена</button><button type="submit" class="delivery-form-save">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div></form></div>`;
  const list=document.getElementById("deliveryFormPositions"),form=document.getElementById("deliveryStandaloneForm");
  const setupRow=row=>{
   const wt=row.querySelector('[name="work_type_id"]'),code=row.querySelector('[name="project_code"]'),unit=row.querySelector('[name="unit"]'),search=row.querySelector('[name="mark_search"]'),mid=row.querySelector('[name="mark_id"]'),qty=row.querySelector('[name="qty"]'),volume=row.querySelector('[name="volume"]'),box=row.querySelector('.mark-results'),balance=row.querySelector('.selected-mark-balance');let selected=marks().find(m=>String(m.id)===String(mid.value));
   const showBalance=()=>{if(!selected){balance.hidden=true;return}const s=markState(selected);balance.innerHTML=`<span>Всего: <b>${fmt(s.total)}</b></span><span class="mounted">Завезено: <b>${fmt(s.done)}</b></span><span class="left">Осталось: <b>${fmt(s.left)}</b></span>`;balance.hidden=false};
   const calc=()=>{if(!selected){volume.value="0";return}const s=markState(selected),q=Math.max(0,num(qty.value));volume.value=fmt(q*s.uv)};
   const renderMarks=()=>{const wid=String(wt.value),q=search.value.trim().toLowerCase();if(!wid){box.innerHTML='<div class="mark-result-empty">Сначала выберите вид работы</div>';box.hidden=false;return}const found=marks().filter(m=>String(m.work_type_id||"")===wid&&(!q||`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q))).sort((a,b)=>String(a.mark||a.title||"").localeCompare(String(b.mark||b.title||""),"ru",{numeric:true}));box.innerHTML=found.length?found.map(m=>{const s=markState(m),done=s.left<=0;return `<button type="button" data-mid="${esc(m.id)}" class="${done?"mark-result-done":s.done>0?"mark-result-partial":"mark-result-left"}" ${done?'disabled title="Марка завезена полностью"':""}><b>${esc(m.mark||m.title||"—")}</b><span>${esc(m.name||"")}</span><i>Всего ${fmt(s.total)} · Завезено ${fmt(s.done)} · Осталось ${fmt(s.left)} · ${fmt(s.uv)} ${esc(m.unit||unit.value||"")}</i></button>`}).join(""):'<div class="mark-result-empty">Марки не найдены</div>';box.hidden=false;box.querySelectorAll("button:not(:disabled)[data-mid]").forEach(b=>b.onclick=()=>{selected=marks().find(m=>String(m.id)===String(b.dataset.mid));mid.value=selected?.id||"";search.value=selected?`${selected.mark||selected.title||""}${selected.name?" — "+selected.name:""}`:"";box.hidden=true;showBalance();calc()})};
   wt.onchange=()=>{const w=workTypes().find(x=>x.id===String(wt.value));code.value=w?.code||"";unit.value=w?.unit||"";selected=null;mid.value="";search.value="";qty.value="";volume.value="";balance.hidden=true;box.hidden=true};search.onfocus=renderMarks;search.oninput=()=>{selected=null;mid.value="";balance.hidden=true;renderMarks()};qty.oninput=calc;row.querySelector(".delivery-form-remove").onclick=()=>{if(list.children.length===1){wt.value="";wt.onchange();return}row.remove()};showBalance();calc();
  };
  [...list.children].forEach(setupRow);
  document.getElementById("deliveryFormAddPosition").onclick=()=>{const host=document.createElement("div");host.innerHTML=positionRow({});const row=host.firstElementChild;list.appendChild(row);setupRow(row)};
  const back=()=>location.hash=editing?detailHash(oid,editId):baseHash(oid);document.getElementById("deliveryFormBack").onclick=back;document.getElementById("deliveryFormCancel").onclick=back;
  form.onsubmit=async e=>{
   e.preventDefault();const fd=new FormData(form),number=String(fd.get("number")||"").trim(),date=String(fd.get("date")||""),vehicle=String(fd.get("vehicle_number")||"").trim(),driver=String(fd.get("driver_name")||"").trim(),tonnage=num(fd.get("total_tonnage"));if(!number||!date)return;if(tonnage<0)return alert("Общий тоннаж не может быть отрицательным.");
   const duplicate=rows.find(x=>String(x.id)!==editId&&String(x.number||x.delivery_number||"").trim().toLowerCase()===number.toLowerCase());if(duplicate&&!confirm(`Накладная №${number} уже существует. Всё равно сохранить?`))return;
   const items=[...list.querySelectorAll(".delivery-form-position")].map(row=>{const wid=String(row.querySelector('[name="work_type_id"]').value),w=workTypes().find(x=>x.id===wid),mid=String(row.querySelector('[name="mark_id"]').value),m=marks().find(x=>String(x.id)===mid),q=num(row.querySelector('[name="qty"]').value),uv=num(m?.unit_volume??m?.volume_one);return{work_type_id:wid,work_type:w?.name||"",project_code:w?.code||"",unit:w?.unit||m?.unit||"",mark_id:mid,mark:m?.mark||m?.title||"",name:m?.name||"",qty:q,unit_volume:uv,volume:q*uv}}).filter(x=>x.work_type_id&&x.mark_id&&x.qty>0);
   if(!items.length)return alert("Добавьте хотя бы одну марку в накладную.");
   const byMark={};for(const x of items)byMark[x.mark_id]=(byMark[x.mark_id]||0)+num(x.qty);for(const [mid,q] of Object.entries(byMark)){const m=marks().find(x=>String(x.id)===mid),s=m?markState(m):null;if(s&&q>s.left+1e-9)return alert(`По марке ${m.mark||m.title||""} осталось ${fmt(s.left)}, а в накладной указано ${fmt(q)}.`)}
   const payload={record_type:"delivery",title:`Накладная №${number}`,data:{number,date,vehicle_number:vehicle,driver_name:driver,total_tonnage:tonnage,items}};let saved;if(editing){await api.update(editId,payload);saved={id:editId}}else saved=await api.create(payload);location.hash=detailHash(oid,saved.id);
  };
 }
 window.irDeliveriesPage=async(oid,route={})=>{
  if(route.mode==="new"||route.mode==="edit")return renderForm(oid,route);
  await base(oid);
  const id=String(route.deliveryId||"");
  if(id){
   const row=[...document.querySelectorAll(".delivery-row[data-delivery-id]")].find(x=>String(x.dataset.deliveryId)===id);
   if(!row){location.hash=baseHash(oid);return}
   row.click();wireDetail(oid,id);return;
  }
  wireListActions(oid);paginate(oid,route.page||1);
 };
})();
