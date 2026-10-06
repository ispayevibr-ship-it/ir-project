"use strict";
(()=>{
 const arr=v=>Array.isArray(v)?v:[];
 const norm=v=>String(v??"").trim().toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ");
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const rec=r=>({id:String(r.id),title:r.title||"",...(r.data||{})});
 const states=window.irDeliveryFiltersState||(window.irDeliveryFiltersState=new Map());
 let token=0;
 function route(){
  const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/deliveries(?:\?([^#]*))?$/);if(!m)return null;
  const p=new URLSearchParams(m[2]||"");if(p.get("mode")||p.get("id"))return null;
  return{oid:m[1]};
 }
 function resolveItem(item,typesById){
  const wt=typesById.get(String(item.work_type_id||""));
  return{
   work:item.work_type||item.type||wt?.name||"",
   code:item.project_code||item.code||wt?.code||"",
   mark:item.mark||item.title||"",
   name:item.name||item.mark_name||item.item_name||""
  };
 }
 async function build(){
  const r=route();if(!r)return true;
  const card=document.querySelector(".delivery-card"),summary=document.querySelector(".delivery-summary");
  if(!card||!summary)return false;
  document.querySelector(".delivery-filters")?.remove();
  document.querySelector(".delivery-filter-empty")?.remove();
  const root=irProject.data.forObject(r.oid);
  const [rawDeliveries,rawTypes]=await Promise.all([
   root.section("deliveries").list().catch(()=>[]),
   root.section("work-types").list().catch(()=>[])
  ]);
  if(!route()||route().oid!==r.oid)return true;
  const deliveries=rawDeliveries.map(rec);
  const types=rawTypes.map(x=>({id:String(x.id),name:x.data?.work_type||x.title||"",code:x.data?.project_code||""}));
  const byTypeId=new Map(types.map(x=>[x.id,x]));
  const byDeliveryId=new Map(deliveries.map(x=>[x.id,x]));
  const worksMap=new Map(),codesByWork=new Map(),allCodes=new Map();
  for(const d of deliveries)for(const raw of itemsOf(d)){
   const x=resolveItem(raw,byTypeId),wk=norm(x.work),ck=norm(x.code);
   if(wk&&!worksMap.has(wk))worksMap.set(wk,x.work);
   if(ck&&!allCodes.has(ck))allCodes.set(ck,x.code);
   if(wk&&ck){if(!codesByWork.has(wk))codesByWork.set(wk,new Map());if(!codesByWork.get(wk).has(ck))codesByWork.get(wk).set(ck,x.code)}
  }
  let state=states.get(String(r.oid));if(!state){state={q:"",work:"",code:""};states.set(String(r.oid),state)}
  const workOptions=[...worksMap.entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru",{numeric:true}));
  const toolbar=document.createElement("div");toolbar.className="delivery-filters";
  toolbar.innerHTML=`<div class="delivery-filter-search"><span class="delivery-filter-search-icon">⌕</span><input type="search" id="deliveryFilterQuery" placeholder="Поиск: № накладной, марка или наименование марки" value="${esc(state.q)}"></div><select id="deliveryFilterWork"><option value="">Все виды работ</option>${workOptions.map(([v,t])=>`<option value="${esc(v)}" ${state.work===v?"selected":""}>${esc(t)}</option>`).join("")}</select><select id="deliveryFilterCode"><option value="">Все шифры</option></select><button type="button" id="deliveryFilterReset">Сбросить</button><div class="delivery-filter-count" id="deliveryFilterCount"></div>`;
  summary.insertAdjacentElement("afterend",toolbar);
  const qEl=toolbar.querySelector("#deliveryFilterQuery"),workEl=toolbar.querySelector("#deliveryFilterWork"),codeEl=toolbar.querySelector("#deliveryFilterCode"),resetEl=toolbar.querySelector("#deliveryFilterReset"),countEl=toolbar.querySelector("#deliveryFilterCount");
  function fillCodes(){
   const source=state.work?(codesByWork.get(state.work)||new Map()):allCodes;
   const opts=[...source.entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru",{numeric:true}));
   if(state.code&&!source.has(state.code))state.code="";
   codeEl.innerHTML=`<option value="">Все шифры</option>${opts.map(([v,t])=>`<option value="${esc(v)}" ${state.code===v?"selected":""}>${esc(t)}</option>`).join("")}`;
  }
  function matches(d){
   const q=norm(state.q),number=norm(d.number||d.delivery_number||d.title||d.id),items=itemsOf(d).map(x=>resolveItem(x,byTypeId));
   const searchOk=!q||number.includes(q)||items.some(x=>norm(x.mark).includes(q)||norm(x.name).includes(q));
   if(!searchOk)return false;
   if(!state.work&&!state.code)return true;
   return items.some(x=>(!state.work||norm(x.work)===state.work)&&(!state.code||norm(x.code)===state.code));
  }
  function apply(resetPage=false){
   let found=0;const rows=[...document.querySelectorAll(".delivery-list .delivery-row[data-delivery-id]")];
   for(const row of rows){const d=byDeliveryId.get(String(row.dataset.deliveryId)),ok=!!d&&matches(d);row.dataset.filterMatch=ok?"1":"0";if(ok)found++}
   countEl.textContent=`Найдено: ${found} из ${deliveries.length}`;
   document.querySelector(".delivery-filter-empty")?.remove();
   if(!found){const empty=document.createElement("div");empty.className="delivery-filter-empty";empty.textContent="По заданным условиям накладные не найдены";card.insertAdjacentElement("afterend",empty)}
   if(resetPage){const base=`/objects/object/${r.oid}/deliveries`;if(location.hash.replace(/^#/,"")!==base)history.replaceState(null,"",`#${base}`)}
   window.dispatchEvent(new CustomEvent("deliveries-filter-change",{detail:{oid:r.oid,found}}));
  }
  let timer=0;qEl.addEventListener("input",()=>{state.q=qEl.value;clearTimeout(timer);timer=setTimeout(()=>apply(true),120)});
  workEl.addEventListener("change",()=>{state.work=workEl.value;state.code="";fillCodes();apply(true)});
  codeEl.addEventListener("change",()=>{state.code=codeEl.value;apply(true)});
  resetEl.addEventListener("click",()=>{state.q="";state.work="";state.code="";qEl.value="";workEl.value="";fillCodes();apply(true);qEl.focus()});
  fillCodes();apply(false);return true;
 }
 function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{if(await build())return}catch(e){console.error("deliveries filters",e)}if(++tries<40)setTimeout(run,100)};setTimeout(run,30)}
 window.addEventListener("hashchange",schedule);
 setInterval(()=>{if(route()&&!document.querySelector(".delivery-filters")&&document.querySelector(".delivery-card"))schedule()},350);
 schedule();
})();
