"use strict";
(()=>{
 const base=window.irDeliveriesPage;if(typeof base!=="function")return;
 const PAGE_SIZE=15;
 const arr=v=>Array.isArray(v)?v:[];
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const num=v=>{const n=Number(String(v??0).trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const record=r=>({id:String(r.id),record_type:r.record_type||"delivery",title:r.title||"",...(r.data||{})});
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const normUnit=u=>{const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s/g,"");if(["т","тн","tn","ton","tons"].includes(s))return"тн";if(["м2","m2"].includes(s))return"м2";if(["м3","m3"].includes(s))return"м3";return s||"ед."};
 const serviceIdsFromRows=rows=>new Set(arr(rows).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга").map(r=>String(r.id)));
 const isServiceItem=(x,ids)=>x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||ids?.has(String(x?.work_type_id||""));
 const visibleItems=(r,ids)=>itemsOf(r).filter(x=>!isServiceItem(x,ids));
 const baseHash=oid=>`/objects/object/${oid}/deliveries`;
 const detailHash=(oid,id)=>`${baseHash(oid)}?id=${encodeURIComponent(id)}`;
 const newHash=oid=>`${baseHash(oid)}?mode=new`;
 const editHash=(oid,id)=>`${baseHash(oid)}?mode=edit&id=${encodeURIComponent(id)}`;
 const pageHash=(oid,page)=>page>1?`${baseHash(oid)}?page=${page}`:baseHash(oid);
 const copyIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"></path></svg>`;
 function syncBodyClass(){document.body.classList.toggle("ir-delivery-form-route",/^#?\/objects\/object\/\d+\/deliveries\?(?=[^#]*mode=(?:new|edit))/.test(location.hash))}
 window.addEventListener("hashchange",syncBodyClass);syncBodyClass();
 function replaceButton(el,handler){if(!el)return null;const clone=el.cloneNode(true);el.replaceWith(clone);clone.onclick=e=>{e.preventDefault();e.stopPropagation();handler(e)};return clone}
 function workGroups(r,serviceIds){const map=new Map();for(const x of visibleItems(r,serviceIds)){const key=`${x.work_type_id||x.work_type||""}|${x.project_code||""}`;if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}return[...map.values()]}
 function volumeTotals(r,serviceIds){const totals={};for(const x of visibleItems(r,serviceIds)){const u=normUnit(x.unit),v=num(x.volume??x.total_volume??(num(x.qty??x.count)*num(x.unit_volume??x.volume_one)));totals[u]=(totals[u]||0)+v}if(!Object.keys(totals).length&&!itemsOf(r).length&&r?.totals_by_unit&&typeof r.totals_by_unit==="object")for(const [u,v] of Object.entries(r.totals_by_unit))totals[normUnit(u)]=(totals[normUnit(u)]||0)+num(v);return totals}
 function totalsText(totals){const parts=Object.entries(totals).filter(([,v])=>Math.abs(num(v))>1e-9).map(([u,v])=>`${fmt(v)} ${u}`);return parts.length?parts.join(" · "):"0"}
 function patchList(oid,records,serviceIds){
  const byId=new Map(records.map(r=>[String(r.id),r]));
  const head=document.querySelector(".delivery-table-head span:nth-child(3)");if(head)head.textContent="Наименование работы · Шифр · Позиций";
  const volumeHead=document.querySelector(".delivery-table-head span:nth-child(6)");if(volumeHead)volumeHead.textContent="Объём";
  document.querySelectorAll(".delivery-row[data-delivery-id]").forEach(row=>{
   const r=byId.get(String(row.dataset.deliveryId));if(!r)return;
   const cell=row.querySelector(".delivery-row-composition");if(cell){const groups=workGroups(r,serviceIds);cell.innerHTML=`<span>Наименование работы · Шифр · Позиций</span>${groups.length?`<div class="delivery-composition">${groups.map(g=>`<div><b>${esc(g.name)}</b><span>${esc(g.code||"Шифр не указан")} · ${g.count} поз.</span></div>`).join("")}</div>`:'<span class="delivery-composition-empty">Позиции не указаны</span>'}`}
   const total=row.querySelector(".delivery-tonnage b");if(total)total.textContent=totalsText(volumeTotals(r,serviceIds));
  });
  replaceButton(document.getElementById("deliveryAdd"),()=>location.hash=newHash(oid));
  document.querySelectorAll("[data-delivery-edit]").forEach(btn=>replaceButton(btn,()=>location.hash=editHash(oid,btn.dataset.deliveryEdit)));
 }
 function wireDetail(oid,id,r,serviceIds){
  const back=document.getElementById("deliveryDetailBack");if(back)back.onclick=()=>location.hash=baseHash(oid);
  replaceButton(document.getElementById("deliveryDetailEdit"),()=>location.hash=editHash(oid,id));
  const grid=document.querySelector(".delivery-detail-grid");if(grid){const accent=grid.querySelector(".accent");if(accent){const s=accent.querySelector("span"),b=accent.querySelector("b");if(s)s.textContent="Общий объём";if(b)b.textContent=totalsText(volumeTotals(r,serviceIds))}}
 }
 function paginate(oid,page){
  const list=document.querySelector(".delivery-list");if(!list)return;
  const rows=[...list.querySelectorAll(".delivery-row")];if(!rows.length)return;
  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.max(1,Math.min(totalPages,Number(page)||1));
  rows.forEach((row,i)=>{row.hidden=i<(current-1)*PAGE_SIZE||i>=current*PAGE_SIZE;row.addEventListener("click",e=>{if(e.target.closest(".delivery-actions"))return;e.preventDefault();e.stopImmediatePropagation();location.hash=detailHash(oid,row.dataset.deliveryId)},true)});
  document.querySelector(".delivery-pagination")?.remove();if(totalPages<=1)return;
  const wrap=document.createElement("div");wrap.className="delivery-pagination";const nums=Array.from({length:totalPages},(_,i)=>i+1);
  wrap.innerHTML=`<div class="delivery-pagination-info">Показано ${Math.min((current-1)*PAGE_SIZE+1,rows.length)}–${Math.min(current*PAGE_SIZE,rows.length)} из ${rows.length}</div><div class="delivery-pagination-buttons"><button type="button" data-page="${current-1}" ${current<=1?"disabled":""}>‹</button>${nums.map(n=>`<button type="button" data-page="${n}" class="${n===current?"active":""}">${n}</button>`).join("")}<button type="button" data-page="${current+1}" ${current>=totalPages?"disabled":""}>›</button></div>`;
  document.querySelector(".delivery-card")?.insertAdjacentElement("afterend",wrap);wrap.querySelectorAll("button[data-page]").forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=totalPages)location.hash=pageHash(oid,p)})
 }
 async function renderForm(oid,route){
  document.body.classList.add("ir-delivery-form-route");
  const app=document.getElementById("app"),root=irProject.data.forObject(oid),api=root.section("deliveries"),wtApi=root.section("work-types"),marksApi=root.section("marks"),object=await irProject.data.objects.get(oid);if(!object){location.hash="/objects";return}
  const [raw,workRows,markRows]=await Promise.all([api.list().catch(()=>[]),wtApi.list().catch(()=>[]),marksApi.list().catch(()=>[])]),records=raw.map(record),editing=route.mode==="edit",editId=editing?String(route.deliveryId||""):"",current=editing?records.find(x=>String(x.id)===editId):null;
  if(editing&&!current){location.hash=baseHash(oid);return}
  const canEdit=()=>window.irAccess?window.irAccess.canEdit("deliveries"):false;if(!canEdit()){location.hash=editing?detailHash(oid,editId):baseHash(oid);return}
  const serviceWorkIds=serviceIdsFromRows(workRows);
  const workTypes=()=>arr(workRows).filter(r=>{const d=r.data||{},service=(d.accounting_type||"")==="service"||norm(d.unit)==="услуга";if(service||d.has_marks===false||d.work_category==="other")return false;if(d.has_marks===true||["installation","fabrication"].includes(d.work_category))return true;const id=String(r.id),name=norm(d.work_type||r.title||"");return name.includes("монтаж")||name.includes("изготов")||arr(markRows).some(m=>String(m.data?.work_type_id||"")===id)}).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:normUnit(d.unit||"")}});
  const marks=()=>arr(markRows).map(r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})}));
  const deliveredMap=excludeId=>{const map={};for(const r of records){if(excludeId&&String(r.id)===String(excludeId))continue;for(const x of visibleItems(r,serviceWorkIds)){const mid=String(x.mark_id||"");if(mid)map[mid]=(map[mid]||0)+num(x.qty??x.count??x.quantity)}}return map};
  const delivered=deliveredMap(editId);
  const baseState=m=>{const total=num(m.qty??m.count),done=Math.min(total,delivered[String(m.id)]||0),uv=num(m.unit_volume??m.volume_one);return{total,done,left:Math.max(0,total-done),uv}};
  const wtOptions=selected=>`<option value="">Выберите вид работы</option>${workTypes().map(w=>`<option value="${w.id}" ${String(selected||"")===w.id?"selected":""}>${esc(w.name)}${w.code?` · ${esc(w.code)}`:""}</option>`).join("")}`;
  const positionRow=x=>`<div class="delivery-form-position"><label class="dfp-work">Вид работы<select name="work_type_id">${wtOptions(x?.work_type_id)}</select></label><label class="dfp-code">Шифр<input name="project_code" readonly value="${esc(x?.project_code||"")}" placeholder="—"></label><label class="dfp-mark">Марка из ведомости<div class="mark-picker"><input name="mark_search" autocomplete="off" value="${esc(x?.mark?`${x.mark}${x.name?" — "+x.name:""}`:"")}" placeholder="Поиск по марке или наименованию…"><input type="hidden" name="mark_id" value="${esc(x?.mark_id||"")}"><div class="mark-results" hidden></div></div><div class="selected-mark-balance" hidden></div></label><label class="dfp-qty">Количество<input name="qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label class="dfp-volume">Объём<input name="volume" readonly value="${esc(x?.volume??x?.total_volume??"")}" placeholder="0"></label><label class="dfp-unit">Ед.<input name="unit" readonly value="${esc(normUnit(x?.unit||""))}" placeholder="—"></label><button type="button" class="delivery-form-copy" title="Копировать позицию">${copyIcon}</button><button type="button" class="row-remove delivery-form-remove" title="Удалить позицию">×</button></div>`;
  const initial=editing?visibleItems(current,serviceWorkIds):[];
  app.innerHTML=`<div class="delivery-form-page"><div class="delivery-form-page-head"><button class="back" id="deliveryFormBack">← К накладным</button><div><h1>${editing?`Редактирование накладной №${esc(current.number||current.delivery_number||current.id)}`:"Новая накладная"}</h1><p>${esc(object.name||"")}</p></div><button class="delivery-form-save-top" form="deliveryStandaloneForm">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div><form id="deliveryStandaloneForm" class="delivery-standalone-form"><section class="delivery-form-section"><div class="delivery-form-section-head"><span>01</span><div><h2>Данные накладной</h2><p>Номер, дата и транспорт</p></div></div><div class="delivery-form-section-body delivery-form-main-grid"><label>Номер накладной<input name="number" required value="${esc(current?.number||current?.delivery_number||"")}" placeholder="Например: 154"></label><label>Дата<input type="date" name="date" required value="${esc(String(current?.date||current?.delivery_date||"").slice(0,10))}"></label><label>Машина №<input name="vehicle_number" value="${esc(current?.vehicle_number||"")}" placeholder="Например: 777 ABC 09"></label><label>ФИО водителя<input name="driver_name" value="${esc(current?.driver_name||"")}" placeholder="ФИО водителя"></label><label>Общий объём<input id="deliveryAutoTotal" readonly value=""><small>Рассчитывается автоматически по выбранным маркам</small></label></div></section><section class="delivery-form-section"><div class="delivery-form-section-head"><span>02</span><div><h2>Марки по накладной</h2><p>Вид работы → шифр → марка → количество</p></div><button type="button" class="delivery-form-add-position" id="deliveryFormAddPosition">＋ Добавить марку</button></div><div class="delivery-form-section-body"><div id="deliveryFormPositions" class="delivery-form-positions">${(initial.length?initial:[{}]).map(positionRow).join("")}</div></div></section><div class="delivery-form-bottom"><button type="button" id="deliveryFormCancel">Отмена</button><button type="submit" class="delivery-form-save">${editing?"Сохранить изменения":"Сохранить накладную"}</button></div></form></div>`;
  const list=document.getElementById("deliveryFormPositions"),form=document.getElementById("deliveryStandaloneForm"),totalField=document.getElementById("deliveryAutoTotal");
  const rowQtyForMark=(mid,except)=>[...list.querySelectorAll(".delivery-form-position")].reduce((s,r)=>r===except||String(r.querySelector('[name="mark_id"]')?.value||"")!==String(mid)?s:s+num(r.querySelector('[name="qty"]')?.value),0);
  const stateFor=(m,row)=>{const s=baseState(m);return{...s,left:Math.max(0,s.left-rowQtyForMark(m.id,row))}};
  const currentTotals=()=>{const totals={};for(const row of list.querySelectorAll(".delivery-form-position")){const u=normUnit(row.querySelector('[name="unit"]')?.value),v=num(row.querySelector('[name="volume"]')?.value);if(v>0)totals[u]=(totals[u]||0)+v}return totals};
  const updateTotal=()=>{totalField.value=totalsText(currentTotals())};
  const rowData=row=>({work_type_id:row.querySelector('[name="work_type_id"]')?.value||"",project_code:row.querySelector('[name="project_code"]')?.value||"",mark_id:row.querySelector('[name="mark_id"]')?.value||"",mark:(()=>{const mid=row.querySelector('[name="mark_id"]')?.value,m=marks().find(x=>String(x.id)===String(mid));return m?.mark||m?.title||""})(),name:(()=>{const mid=row.querySelector('[name="mark_id"]')?.value,m=marks().find(x=>String(x.id)===String(mid));return m?.name||""})(),qty:row.querySelector('[name="qty"]')?.value||"",volume:row.querySelector('[name="volume"]')?.value||"",unit:row.querySelector('[name="unit"]')?.value||""});
  const appendRow=data=>{const host=document.createElement("div");host.innerHTML=positionRow(data||{});const row=host.firstElementChild;list.appendChild(row);setupRow(row);updateTotal();return row};
  const setupRow=row=>{
   const wt=row.querySelector('[name="work_type_id"]'),code=row.querySelector('[name="project_code"]'),unit=row.querySelector('[name="unit"]'),search=row.querySelector('[name="mark_search"]'),mid=row.querySelector('[name="mark_id"]'),qty=row.querySelector('[name="qty"]'),volume=row.querySelector('[name="volume"]'),box=row.querySelector('.mark-results'),balance=row.querySelector('.selected-mark-balance');let selected=marks().find(m=>String(m.id)===String(mid.value));
   const showBalance=()=>{if(!selected){balance.hidden=true;return}const s=stateFor(selected,row);balance.innerHTML=`<span>Всего: <b>${fmt(s.total)}</b></span><span class="mounted">Завезено: <b>${fmt(s.done)}</b></span><span class="left">Доступно: <b>${fmt(s.left)}</b></span>`;balance.hidden=false};
   const calc=()=>{if(!selected){volume.value="0";updateTotal();return}const s=stateFor(selected,row);let q=Math.max(0,num(qty.value));if(q>s.left){q=s.left;qty.value=fmt(q)}volume.value=fmt(q*s.uv);showBalance();updateTotal()};
   const renderMarks=()=>{const wid=String(wt.value),q=search.value.trim().toLowerCase();if(!wid){box.innerHTML='<div class="mark-result-empty">Сначала выберите вид работы</div>';box.hidden=false;return}const found=marks().filter(m=>String(m.work_type_id||"")===wid&&(!q||`${m.mark||m.title||""} ${m.name||""}`.toLowerCase().includes(q))).sort((a,b)=>String(a.mark||a.title||"").localeCompare(String(b.mark||b.title||""),"ru",{numeric:true}));box.innerHTML=found.length?found.map(m=>{const s=stateFor(m,row),done=s.left<=0;return `<button type="button" data-mid="${esc(m.id)}" class="${done?"mark-result-done":s.done>0?"mark-result-partial":"mark-result-left"}" ${done?'disabled title="Марка завезена полностью"':""}><b>${esc(m.mark||m.title||"—")}</b><span>${esc(m.name||"")}</span><i>Всего ${fmt(s.total)} · Завезено ${fmt(s.done)} · Доступно ${fmt(s.left)} · ${fmt(s.uv)} ${esc(normUnit(m.unit||unit.value||""))}</i></button>`}).join(""):'<div class="mark-result-empty">Марки не найдены</div>';box.hidden=false;box.querySelectorAll("button:not(:disabled)[data-mid]").forEach(b=>b.onclick=()=>{selected=marks().find(m=>String(m.id)===String(b.dataset.mid));mid.value=selected?.id||"";search.value=selected?`${selected.mark||selected.title||""}${selected.name?" — "+selected.name:""}`:"";const w=workTypes().find(x=>x.id===String(wt.value));unit.value=normUnit(selected?.unit||w?.unit||"");box.hidden=true;showBalance();calc()})};
   wt.onchange=()=>{const w=workTypes().find(x=>x.id===String(wt.value));code.value=w?.code||"";unit.value=w?.unit||"";selected=null;mid.value="";search.value="";qty.value="";volume.value="";balance.hidden=true;box.hidden=true;updateTotal()};
   search.onfocus=renderMarks;search.oninput=()=>{selected=null;mid.value="";balance.hidden=true;renderMarks();updateTotal()};qty.oninput=calc;
   row.querySelector(".delivery-form-copy").onclick=()=>appendRow(rowData(row));
   row.querySelector(".delivery-form-remove").onclick=()=>{if(list.children.length===1){wt.value="";wt.onchange();return}row.remove();[...list.children].forEach(r=>{const q=r.querySelector('[name="qty"]');if(q)q.dispatchEvent(new Event("input"))});updateTotal()};
   showBalance();calc();
  };
  [...list.children].forEach(setupRow);updateTotal();
  document.getElementById("deliveryFormAddPosition").onclick=()=>appendRow({});
  const back=()=>location.hash=editing?detailHash(oid,editId):baseHash(oid);document.getElementById("deliveryFormBack").onclick=back;document.getElementById("deliveryFormCancel").onclick=back;
  form.onsubmit=async e=>{
   e.preventDefault();const fd=new FormData(form),number=String(fd.get("number")||"").trim(),date=String(fd.get("date")||""),vehicle=String(fd.get("vehicle_number")||"").trim(),driver=String(fd.get("driver_name")||"").trim();if(!number||!date)return;
   const duplicate=records.find(x=>String(x.id)!==editId&&String(x.number||x.delivery_number||"").trim().toLowerCase()===number.toLowerCase());if(duplicate&&!confirm(`Накладная №${number} уже существует. Всё равно сохранить?`))return;
   const items=[...list.querySelectorAll(".delivery-form-position")].map(row=>{const wid=String(row.querySelector('[name="work_type_id"]').value),w=workTypes().find(x=>x.id===wid),mid=String(row.querySelector('[name="mark_id"]').value),m=marks().find(x=>String(x.id)===mid),q=num(row.querySelector('[name="qty"]').value),uv=num(m?.unit_volume??m?.volume_one),unit=normUnit(m?.unit||w?.unit||row.querySelector('[name="unit"]').value);return{work_type_id:wid,work_type:w?.name||"",project_code:w?.code||"",unit,mark_id:mid,mark:m?.mark||m?.title||"",name:m?.name||"",qty:q,unit_volume:uv,volume:q*uv}}).filter(x=>x.work_type_id&&x.mark_id&&x.qty>0);
   if(!items.length)return alert("Добавьте хотя бы одну марку в накладную.");
   const byMark={};for(const x of items)byMark[x.mark_id]=(byMark[x.mark_id]||0)+num(x.qty);for(const [mid,q] of Object.entries(byMark)){const m=marks().find(x=>String(x.id)===String(mid));if(m&&q>baseState(m).left+1e-9)return alert(`Количество по марке ${m.mark||m.title||mid} превышает доступный остаток.`)}
   const totals={};for(const x of items)totals[x.unit]=(totals[x.unit]||0)+num(x.volume);const keys=Object.keys(totals),payload={record_type:"delivery",title:`Накладная №${number}`,data:{number,date,vehicle_number:vehicle,driver_name:driver,items,totals_by_unit:totals,total_tonnage:num(totals["тн"]),total_volume:keys.length===1?num(totals[keys[0]]):0,total_unit:keys.length===1?keys[0]:""}};
   let saved;if(editing){saved=await api.update(editId,payload);location.hash=detailHash(oid,editId)}else{saved=await api.create(payload);location.hash=detailHash(oid,saved?.id||"")}
  };
 }
 window.irDeliveriesPage=async(oid,route={})=>{
  if(route.mode==="new"||route.mode==="edit")return renderForm(oid,route);
  document.body.classList.remove("ir-delivery-form-route");
  const root=irProject.data.forObject(oid),api=root.section("deliveries"),[deliveryRows,workRows]=await Promise.all([api.list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]),records=deliveryRows.map(record),serviceIds=serviceIdsFromRows(workRows);
  await base(oid);
  const id=String(route.deliveryId||"");if(id){const row=[...document.querySelectorAll(".delivery-row[data-delivery-id]")].find(x=>String(x.dataset.deliveryId)===id);if(!row){location.hash=baseHash(oid);return}row.click();wireDetail(oid,id,records.find(r=>String(r.id)===id),serviceIds);return}
  patchList(oid,records,serviceIds);paginate(oid,route.page||1);
 };
})();
