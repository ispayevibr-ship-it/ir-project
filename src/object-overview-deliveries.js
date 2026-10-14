"use strict";
(()=>{
 const workLabel=(v,context="base")=>window.irWorkNames?.format?.(v,context)||String(v??"");
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const iso=v=>String(v||"").slice(0,10);
 const fmtDate=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:String(v||"—")};
 const fmtShort=v=>{const p=iso(v).split("-");return p.length===3?`${p[2]}.${p[1]}`:String(v||"")};
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(3))).replace(".",",")};
 const normUnit=u=>{const s=String(u||"").trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s/g,"");if(["т","тн","tn","ton","tons"].includes(s))return"тн";if(["м2","m2"].includes(s))return"м2";if(["м3","m3"].includes(s))return"м3";return s||"ед."};
 const itemsOf=r=>{for(const k of ["items","marks","positions","rows"]){if(Array.isArray(r?.[k]))return r[k]}return[]};
 const record=r=>({id:String(r.id),record_type:r.record_type||"item",title:r.title||"",...(r.data||{})});
 const objectId=()=>location.hash.match(/^#\/objects\/object\/(\d+)\/?$/)?.[1]||"";
 const selected=new Map();
 function valueOf(x){const raw=x?.volume??x?.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return num(raw);return num(x?.qty??x?.count??x?.quantity)*num(x?.unit_volume??x?.volume_one)}
 function isServiceItem(x,serviceIds){return x?.accounting_type==="service"||x?.is_service===true||norm(x?.unit)==="услуга"||serviceIds?.has(String(x?.work_type_id||""))}
 function workGroups(r,serviceIds){const map=new Map();for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const key=[x.work_type_id||x.work_type||"",x.project_code||""].join("|");if(!map.has(key))map.set(key,{name:x.work_type||"Работа",code:x.project_code||"",count:0});map.get(key).count++}return[...map.values()]}
 function totalsByUnit(r,serviceIds){const out={};for(const x of itemsOf(r).filter(x=>!isServiceItem(x,serviceIds))){const u=normUnit(x.unit),v=valueOf(x);out[u]=(out[u]||0)+v}if(!Object.keys(out).length&&!itemsOf(r).length&&r?.totals_by_unit&&typeof r.totals_by_unit==="object")for(const [u,v] of Object.entries(r.totals_by_unit))out[normUnit(u)]=(out[normUnit(u)]||0)+num(v);return out}
 function totalsText(r,serviceIds){const p=Object.entries(totalsByUnit(r,serviceIds)).filter(([,v])=>Math.abs(v)>1e-9).map(([u,v])=>`${fmt(v)} ${u}`);return p.length?p.join(" · "):"0"}
 function buildCatalog(rows){return arr(rows).map(r=>{const d=r.data||{};return{id:String(r.id),name:d.work_type||r.title||"Без названия",code:d.project_code||"",unit:normUnit(d.unit||"")}})}
 function resolver(catalog){const byId=new Map(catalog.map(x=>[x.id,x]));return x=>{const rawId=String(x?.work_type_id||""),name=x?.work_type||x?.type||"",code=x?.project_code||x?.code||"",unit=normUnit(x?.unit||"");const direct=rawId?byId.get(rawId):null;if(direct){const nameOk=!name||norm(direct.name)===norm(name),codeOk=!code||!direct.code||norm(direct.code)===norm(code);if(nameOk&&codeOk)return direct}let hit=catalog.find(w=>norm(w.name)===norm(name)&&norm(w.code)===norm(code));if(!hit&&code){const m=catalog.filter(w=>norm(w.code)===norm(code));if(m.length===1)hit=m[0]}if(!hit&&name){const m=catalog.filter(w=>norm(w.name)===norm(name));if(m.length===1)hit=m[0]}return hit||{id:`legacy:${norm(name)}|${norm(code)}|${unit}`,name:name||"Без названия",code,unit}}}
 function summarizeTypes(deliveries,reports,catalog,serviceIds){const resolve=resolver(catalog),used=new Map(),del=new Map(),mnt=new Map();
  const add=(map,type,date,value)=>{if(!date||value<=0)return;used.set(type.id,type);if(!map.has(type.id))map.set(type.id,new Map());const d=map.get(type.id);d.set(date,(d.get(date)||0)+value)};
  for(const r of deliveries){const date=iso(r.date||r.delivery_date);for(const x of itemsOf(r)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(del,t,date,valueOf(x))}}
  for(const r of reports){const date=iso(r.date||r.report_date);for(const x of arr(r.items||r.works)){if(isServiceItem(x,serviceIds))continue;const t=resolve(x);add(mnt,t,date,valueOf(x))}}
  return{types:[...used.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru")||a.code.localeCompare(b.code,"ru")),del,mnt};
 }
 const irSupplyChartFactory=function SupplyEngine(){
 const arr=x=>Array.isArray(x)?x:[],str=x=>String(x??"").trim(),norm=x=>str(x).toLowerCase().replace(/ё/g,"е").replace(/\s+/g," "),num=x=>{const n=Number(str(x).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0},esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const unit=x=>{const u=norm(x).replace(/[²³]/g,c=>c==="²"?"2":"3").replace(/\s/g,"");return["т","тн","тонна","тонн","тонны"].includes(u)?"тн":["м2","m2"].includes(u)?"м2":["м3","m3"].includes(u)?"м3":u||"ед."};
 const date=x=>{const v=str(x),m=v.match(/^(\d{2})\.(\d{2})\.(\d{4})/);return /^\d{4}-\d{2}-\d{2}/.test(v)?v.slice(0,10):m?`${m[3]}-${m[2]}-${m[1]}`:""};
 const fmt=v=>num(v).toLocaleString("ru-RU",{maximumFractionDigits:3}),short=x=>x?x.slice(8,10)+"."+x.slice(5,7):"",long=x=>x?short(x)+"."+x.slice(0,4):"";
 const vol=(x,marks)=>{
  const v=x.volume??x.total_volume;if(v!==undefined&&v!==null&&str(v)!=="")return num(v);
  const q=num(x.qty??x.count??x.quantity),uv=x.unit_volume??x.volume_one??marks.get(str(x.mark_id))?.unit_volume;
  return uv!==undefined&&uv!==null&&str(uv)!==""?q*num(uv):x.mark_id?0:q
 };
 function prepare(workRows,deliveries,reports,markRows=[]){
  const types=arr(workRows).map(r=>{const d=r.data||r;return{id:str(r.id),name:str(d.work_type||r.title||"Вид работ"),code:str(d.project_code||d.code),unit:unit(d.unit),service:d.accounting_type==="service"||norm(d.unit)==="услуга",codes:[]}});
  const marks=new Map(arr(markRows).map(r=>[str(r.id),r.data||r])),byId=new Map(types.map(t=>[t.id,t])),events=[];
  const resolve=x=>{const t=byId.get(str(x.work_type_id));if(t)return t;const n=norm(x.work_type||x.type),c=norm(x.project_code||x.code);let hits=types.filter(t=>norm(t.name)===n&&norm(t.code)===c);if(!hits.length&&c)hits=types.filter(t=>norm(t.code)===c);if(!hits.length&&n)hits=types.filter(t=>norm(t.name)===n);return hits.length===1?hits[0]:null};
  for(const [records,kind] of [[deliveries,"delivered"],[reports,"mounted"]])for(const r of arr(records)){
   const d=r.data||r,dt=date(d.date||d.delivery_date||d.report_date);if(!dt)continue;
   const items=arr(d.items).length?d.items:kind==="delivered"?(d.marks||d.positions||[]):(d.works||[]);
   for(const x of arr(items)){
    const t=resolve(x);if(!t||t.service||x.accounting_type==="service"||x.is_service===true||norm(x.unit)==="услуга")continue;
    const u=unit(x.unit||marks.get(str(x.mark_id))?.unit||t.unit),value=vol(x,marks);
    if(!(value>0))continue;
    if(t.unit!=="ед."&&u!==t.unit)continue;
    const code=str(x.project_code||x.code||t.code);if(code&&!t.codes.includes(code))t.codes.push(code);
    events.push({typeId:t.id,code,unit:u,date:dt,kind,value})
   }
  }
  for(const t of types){if(t.code&&!t.codes.includes(t.code))t.codes.push(t.code);if(t.unit==="ед.")t.unit=events.find(e=>e.typeId===t.id)?.unit||"ед."}
  // Merge duplicate work types across codes, but never across measurement units.
  const displayName=value=>{
   const name=str(value).replace(/^(?:монтаж|поставка)\s+/i,"");
   const n=norm(name),pos=name.indexOf(" "),suffix=pos<0?"":name.slice(pos);
   if(/^металлоконструкц/.test(n))return"Монтаж металлоконструкций"+suffix;
   if(/^сэндвич-панел/.test(n))return"Монтаж сэндвич-панелей"+suffix;
   if(/^профнастил/.test(n))return"Монтаж профнастила"+suffix;
   return /^(?:монтаж|поставка)\s/i.test(str(value))?str(value):name
  };
  const groups=new Map();
  for(const t of types){
   const name=displayName(t.name),key=norm(name)+"|"+t.unit;
   if(!groups.has(key))groups.set(key,{...t,name,members:[],codes:[]});
   const group=groups.get(key);group.members.push(t.id);
   for(const code of [t.code,...t.codes])if(code&&!group.codes.includes(code))group.codes.push(code)
  }
  for(const group of groups.values()){
   group.codes.sort((a,b)=>a.localeCompare(b,"ru",{numeric:true}));
   const activities=events.filter(e=>group.members.includes(e.typeId)&&e.unit===group.unit);
   group.activeDays=new Set(activities.map(e=>e.date)).size;
   group.activities=activities.length
  }
  const ranked=[...groups.values()].sort((a,b)=>b.activeDays-a.activeDays||b.activities-a.activities||a.name.localeCompare(b.name,"ru",{numeric:true})||a.unit.localeCompare(b.unit,"ru"));
  return{types:ranked,events}
 }
 function calc(model,id,code="",mode="daily"){
  const type=arr(model.types).find(t=>t.id===id)||arr(model.types)[0];
  if(!type)return{type:null,points:[],delivered:0,mounted:0,remaining:0,unit:""};
  const members=new Set(type.members||[type.id]);
  const data=arr(model.events).filter(e=>members.has(e.typeId)&&e.unit===type.unit&&(!code||code===e.code));
  const delivered=data.filter(e=>e.kind==="delivered").reduce((sum,e)=>sum+e.value,0),mounted=data.filter(e=>e.kind==="mounted").reduce((sum,e)=>sum+e.value,0);
  const grouped=new Map();
  for(const e of data){if(!grouped.has(e.date))grouped.set(e.date,{date:e.date,delivered:0,mounted:0});grouped.get(e.date)[e.kind]+=e.value}
  const points=[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(mode==="cumulative"){let a=0,b=0;for(const p of points){a+=p.delivered;b+=p.mounted;p.delivered=a;p.mounted=b}}
  return{type,points,delivered,mounted,remaining:delivered-mounted,unit:type.unit}
 }
 function graph(s,mode){
  if(!s.points.length)return'<div class="supply-empty">Нет данных за выбранный период</div>';
  const pts=s.points,n=pts.length,W=Math.max(660,n*(mode==="daily"?86:76)),H=328,L=55,R=20,T=20,B=50,IW=W-L-R,IH=H-T-B,top=Math.max(1,...pts.flatMap(p=>[p.delivered,p.mounted]))*1.15,y=x=>T+IH-(x/top)*IH,x=i=>L+IW*(i+.5)/n;
  const grid=[0,.25,.5,.75,1].map(z=>`<line class="sup-grid" x1="${L}" x2="${W-R}" y1="${y(top*z)}" y2="${y(top*z)}"/><text class="sup-axis" x="${L-7}" y="${y(top*z)+4}" text-anchor="end">${esc(fmt(top*z))}</text>`).join("");
  const labels=pts.map((p,i)=>`<text class="sup-axis" text-anchor="middle" x="${x(i)}" y="${H-17}">${short(p.date)}</text>`).join("");
  let shapes="";
  if(mode==="daily"){shapes=pts.map((p,i)=>[["delivered","#3B82F6",-1],["mounted","#16A34A",1]].map(([key,color,side])=>{const bw=Math.min(28,IW/n*.3),h=p[key]/top*IH,xx=x(i)+(side===-1?-bw-2:2);return`<rect fill="${color}" x="${xx}" y="${y(p[key])}" width="${bw}" height="${h}" rx="3"><title>${long(p.date)}\nПоставлено: ${fmt(p.delivered)} ${s.unit}\nСмонтировано: ${fmt(p.mounted)} ${s.unit}</title></rect>`}).join("")).join("")}
  else{const path=k=>pts.map((p,i)=>`${i?"L":"M"}${x(i)},${y(p[k])}`).join(" ");shapes=`<path stroke="#3B82F6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none" d="${path("delivered")}"/><path stroke="#16A34A" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" fill="none" d="${path("mounted")}"/>`+pts.map((p,i)=>["delivered","mounted"].map(k=>`<circle fill="${k==="delivered"?"#3B82F6":"#16A34A"}" stroke="white" stroke-width="1.5" cx="${x(i)}" cy="${y(p[k])}" r="4"><title>${long(p.date)}: ${k==="delivered"?"Поставлено":"Смонтировано"} ${fmt(p[k])} ${s.unit}</title></circle>`).join("")).join("")}
  return`<div class="supply-scroll" tabindex="0"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Поставки и монтаж, ${esc(s.unit)}">${grid}${shapes}${labels}</svg></div>`
 }
 function render(model,state={}){
  const types=arr(model.types),type=types.find(t=>t.id===state.typeId)||types[0],id=type?.id,code=type?.codes.includes(state.code)?state.code:"",mode=state.mode==="cumulative"?"cumulative":"daily",s=calc(model,id,code,mode);
  const opt=types.map(t=>`<option value="${esc(t.id)}"${t.id===id?" selected":""}>${esc(t.name)}</option>`).join("");
  return`<section class="ood-card ood-comparison ir-supply-chart" data-supply-chart><div class="supply-title"><h2>Поставки и монтаж</h2><p>Поставки из накладных · монтаж из ежедневных отчётов</p></div><div class="supply-filters"><label class="supply-work">Вид работ<select data-supply-work aria-label="Вид работ">${opt}</select></label><label>Шифр<select data-supply-code aria-label="Шифр"><option value="">Все шифры</option>${(type?.codes||[]).map(c=>`<option value="${esc(c)}"${c===code?" selected":""}>${esc(c)}</option>`).join("")}</select></label><div class="supply-modes"><button type="button" data-supply-mode="daily" class="${mode==="daily"?"active":""}" aria-pressed="${mode==="daily"}">По дням</button><button type="button" data-supply-mode="cumulative" class="${mode==="cumulative"?"active":""}" aria-pressed="${mode==="cumulative"}">Накопительно</button></div></div><div class="supply-metrics"><div><span>Поставлено</span><b>${fmt(s.delivered)} <small>${esc(s.unit)}</small></b></div><div><span>Смонтировано</span><b>${fmt(s.mounted)} <small>${esc(s.unit)}</small></b></div><div class="${s.remaining<0?"negative":""}"><span>Остаток</span><b>${fmt(s.remaining)} <small>${esc(s.unit)}</small></b></div></div><div class="supply-legend"><span><i class="delivered"></i>Поставки</span><span><i class="mounted"></i>Монтаж</span></div>${graph(s,mode)}</section>`
 }
 function bind(card,model,state={},onChange){
  if(!card)return;const curr={...state};
  const next=()=>{onChange?.(curr);const temp=document.createElement("div");temp.innerHTML=render(model,curr);const fresh=temp.firstElementChild;card.replaceWith(fresh);bind(fresh,model,curr,onChange)};
  card.addEventListener("change",e=>{if(e.target.matches("[data-supply-work]")){curr.typeId=e.target.value;curr.code="";next()}else if(e.target.matches("[data-supply-code]")){curr.code=e.target.value;next()}});
  card.addEventListener("click",e=>{const b=e.target.closest("[data-supply-mode]");if(b){curr.mode=b.dataset.supplyMode;next()}});
 }
 function initOffline(){const e=document.getElementById("ir-supply-chart-data");if(!e)return;try{const model=JSON.parse(e.textContent);for(const c of document.querySelectorAll("[data-supply-chart]"))bind(c,model)}catch{}}
 const css=`
 .ir-supply-chart{box-sizing:border-box;max-width:100%;min-width:0;width:100%;overflow:hidden;background:white;font-family:'Segoe UI',Arial,sans-serif}.ir-supply-chart *{box-sizing:border-box}
 .ir-supply-chart .supply-title{padding:17px 18px 5px}.ir-supply-chart .supply-title h2{color:#214b66;font-size:16px;font-weight:850;margin:0 0 4px}.ir-supply-chart .supply-title p{color:#859cad;font-size:11px;margin:0}
 .ir-supply-chart .supply-filters{display:grid;grid-template-columns:minmax(0,2fr) minmax(125px,1fr) auto;align-items:end;gap:10px;padding:14px 18px}
 .ir-supply-chart .supply-filters label{display:grid;gap:5px;min-width:0;color:#56778b;font-size:11px;font-weight:700}
 .ir-supply-chart input,.ir-supply-chart select{box-sizing:border-box;width:100%;min-width:0;height:36px;padding:0 10px;background:#f9fbfe;border:1px solid #d5e3ed;border-radius:8px;color:#35546c;font:600 12px 'Segoe UI',Arial,sans-serif}
.ir-supply-chart .supply-modes{display:flex;gap:3px;padding:3px;background:#f0f5fa;border:1px solid #dae6ef;border-radius:8px}
 .ir-supply-chart .supply-modes button{padding:9px 11px;border:0;border-radius:7px;background:transparent;color:#59788b;cursor:pointer;white-space:nowrap;font:700 11px 'Segoe UI',Arial,sans-serif}
 .ir-supply-chart .supply-modes button.active{background:#246da7;color:white}
 .ir-supply-chart .supply-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:0 18px 13px}
 .ir-supply-chart .supply-metrics>div{padding:12px;border:1px solid #e0e9f0;border-radius:10px;background:#f8fbfe;min-width:0}
 .ir-supply-chart .supply-metrics span{font-size:10px;color:#8498a8}.ir-supply-chart .supply-metrics b{display:block;margin-top:5px;color:#3B82F6;font-size:19px;overflow-wrap:anywhere}
 .ir-supply-chart .supply-metrics>div:nth-child(2) b{color:#16A34A}.ir-supply-chart .supply-metrics>div:nth-child(3) b{color:#244c69}.ir-supply-chart .supply-metrics .negative b{color:#c24b4b}.ir-supply-chart .supply-metrics small{font-size:10px}
 .ir-supply-chart .supply-legend{display:flex;justify-content:flex-end;gap:17px;padding:1px 18px 9px;color:#698397;font-size:11px}.ir-supply-chart .supply-legend span{display:flex;align-items:center;gap:5px}
 .ir-supply-chart .supply-legend i{width:16px;height:5px;border-radius:6px;background:#3B82F6}.ir-supply-chart .supply-legend i.mounted{background:#16A34A}
 .ir-supply-chart .supply-scroll{max-width:100%;overflow-x:auto;overflow-y:hidden;margin:0 16px 16px;border:1px solid #e0e8ee;border-radius:9px}
 .ir-supply-chart .supply-scroll svg{display:block;height:328px;max-width:none}.ir-supply-chart .sup-axis{fill:#8096a6;font-size:10px;font-family:Arial,sans-serif}.ir-supply-chart .sup-grid{stroke:#e7eef4;stroke-width:1}
 .ir-supply-chart .supply-empty{height:328px;display:flex;align-items:center;justify-content:center;text-align:center;margin:0 16px 16px;border:1px dashed #d6e1e9;border-radius:9px;color:#8fa4b2;font-size:12px}
 @media(max-width:850px){.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,1fr) minmax(120px,1fr)}.ir-supply-chart .supply-modes{grid-column:1/-1;width:max-content}}
 @media(max-width:550px){.ir-supply-chart .supply-title{padding:15px 11px 5px}.ir-supply-chart .supply-filters{grid-template-columns:minmax(0,1fr);padding:11px}.ir-supply-chart .supply-modes{grid-column:auto;width:100%}.ir-supply-chart .supply-modes button{flex:1}.ir-supply-chart .supply-metrics{gap:5px;padding:0 8px 11px}.ir-supply-chart .supply-metrics>div{padding:8px 5px;text-align:center}.ir-supply-chart .supply-metrics b{font-size:14px}.ir-supply-chart .supply-scroll{margin:0 8px 12px}.ir-supply-chart .supply-empty{margin:0 8px 12px}}
 `;
 return {prepare,calc,render,bind,initOffline,css}
};
 window.irSupplyChartFactory=irSupplyChartFactory;
 window.irSupplyChart=irSupplyChartFactory();
 if(!document.getElementById("ir-supply-styles")){const style=document.createElement("style");style.id="ir-supply-styles";style.textContent=window.irSupplyChart.css;document.head.appendChild(style)}
 const chartStates=new Map();
 function comparisonHtml(oid,model){return window.irSupplyChart.render(model,chartStates.get(String(oid))||{})}
 function deliveriesHtml(oid,deliveries,serviceIds){const ordered=[...deliveries].sort((a,b)=>String(b.date||b.delivery_date||"").localeCompare(String(a.date||a.delivery_date||""))||Number(b.id)-Number(a.id)).slice(0,5);const head=`<div class="ood-head"><div><h2>Последние накладные</h2><p>Последние 5 поставок по объекту</p></div><button type="button" data-ood-all>Все накладные</button></div>`;if(!ordered.length)return `<section class="ood-card ood-deliveries">${head}<div class="ood-empty">Раздел Поставки пуст</div></section>`;
  const rows=ordered.map(r=>{const groups=workGroups(r,serviceIds);return `<article class="ood-delivery-row" data-ood-delivery="${esc(r.id)}"><div><small>Накладная</small><b>№${esc(r.number||r.delivery_number||r.id)}</b><span>${fmtDate(r.date||r.delivery_date)}</span></div><div><small>Транспорт</small><b>${esc(r.vehicle_number||"—")}</b><span>${esc(r.driver_name||"Водитель не указан")}</span></div><div class="ood-delivery-works"><small>Работы</small>${groups.length?groups.slice(0,3).map(g=>`<span><b>${esc(workLabel(g.name,"delivery"))}</b> · ${esc(g.code||"Без шифра")} · ${g.count} поз.</span>`).join(""):'<span>Позиции не указаны</span>'}${groups.length>3?`<em>+ ещё ${groups.length-3}</em>`:""}</div><div class="ood-delivery-total"><small>Общий объём</small><b>${esc(totalsText(r,serviceIds))}</b></div><span class="ood-open">›</span></article>`}).join("");return `<section class="ood-card ood-deliveries">${head}<div class="ood-delivery-list">${rows}</div></section>`;
 }
 async function renderOnce(){const oid=objectId();if(!oid)return true;const app=document.getElementById("app"),anchor=app?.querySelector(".object-overview-reports")||app?.querySelector(".object-overview-dashboard");if(!app||!anchor)return false;app.querySelector(".object-overview-deliveries-wrap")?.remove();const root=irProject.data.forObject(oid),[rawDeliveries,rawReports,rawTypes]=await Promise.all([root.section("deliveries").list().catch(()=>[]),root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);if(objectId()!==String(oid))return true;const deliveries=rawDeliveries.map(record),reports=rawReports.map(record),serviceIds=new Set(arr(rawTypes).filter(r=>(r.data?.accounting_type||"")==="service"||norm(r.data?.unit)==="услуга"||r.data?.has_marks===false||r.data?.work_category==="other").map(r=>String(r.id))),model=window.irSupplyChart.prepare(rawTypes,rawDeliveries,rawReports),wrap=document.createElement("div");wrap.className="object-overview-deliveries-wrap";wrap.innerHTML=`${comparisonHtml(oid,model)}${deliveriesHtml(oid,deliveries,serviceIds)}`;anchor.insertAdjacentElement("afterend",wrap);window.irSupplyChart.bind(wrap.querySelector("[data-supply-chart]"),model,chartStates.get(String(oid))||{},s=>chartStates.set(String(oid),{...s}));wrap.querySelector("[data-ood-all]")?.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries`);wrap.querySelectorAll("[data-ood-delivery]").forEach(row=>row.addEventListener("click",()=>location.hash=`/objects/object/${oid}/deliveries?id=${encodeURIComponent(row.dataset.oodDelivery)}`));return true}
 let token=0;function schedule(){const mine=++token;let tries=0;const run=async()=>{if(mine!==token)return;try{const done=await renderOnce();if(done)return}catch(e){console.error("object overview deliveries",e)}if(++tries<30)setTimeout(run,150)};setTimeout(run,60)}window.addEventListener("hashchange",schedule);schedule();
})();
