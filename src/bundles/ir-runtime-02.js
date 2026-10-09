/* #11: src/report-secondary-code.js */
"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 async function addSecondaryCode(oid,reportId){
  const table=document.querySelector(".rv-work-table tbody");if(!table)return;
  const root=irProject.data.forObject(oid),[reports,workTypes]=await Promise.all([root.section("reports").list().catch(()=>[]),root.section("work-types").list().catch(()=>[])]);
  const record=reports.find(r=>String(r.id)===String(reportId));if(!record)return;
  const works=Array.isArray(record.data?.items)?record.data.items:Array.isArray(record.data?.works)?record.data.works:[];
  const wtMap=new Map(workTypes.map(r=>[String(r.id),r.data||{}]));
  [...table.querySelectorAll("tr")].forEach((tr,i)=>{
   const w=works[i];if(!w)return;
   const secondary=String(w.project_code_2||wtMap.get(String(w.work_type_id||""))?.project_code_2||"").trim();if(!secondary)return;
   const cell=tr.children[1];if(!cell||cell.querySelector(".rv-project-code-2"))return;
   const small=document.createElement("small");small.className="rv-project-code-2";small.textContent=`Доп. шифр: ${secondary}`;cell.appendChild(small);
  });
 }
 window.irReportsPage=async(oid,route={})=>{await base(oid,route);if(route?.mode==="view"&&route.reportId)await addSecondaryCode(oid,String(route.reportId))};
})();

;

/* #12: src/report-temperature.js */
"use strict";
(()=>{
 const base=window.irReportsPage;if(typeof base!=="function")return;
 const pendingKey=oid=>`ir-report-temperature-pending-${oid}`;
 const numText=v=>String(v??"").replace(",",".");
 const clearPending=oid=>sessionStorage.removeItem(pendingKey(oid));
 async function applyPending(oid,route){
  if(route?.mode!=="view"||!route.reportId)return;
  const raw=sessionStorage.getItem(pendingKey(oid));if(!raw)return;
  let p;try{p=JSON.parse(raw)}catch{clearPending(oid);return}
  const age=Date.now()-Number(p.at||0),validAge=age>=0&&age<60000,validTarget=p.mode==="new"||String(p.reportId||"")===String(route.reportId);
  if(!validAge||!validTarget){clearPending(oid);return}
  clearPending(oid);
  const api=irProject.data.forObject(oid).section("reports"),rec=await api.get(route.reportId).catch(()=>null);if(!rec)return;
  const data={...(rec.data||{}),temperature:p.value===""?"":Number(numText(p.value))};
  await api.update(route.reportId,{record_type:rec.record_type||"item",title:rec.title||"",data}).catch(()=>{});
 }
 async function enhanceForm(oid,route){
  if(!["new","edit"].includes(route?.mode))return;
  const form=document.getElementById("dailyReportForm"),grid=form?.querySelector(".report-grid-3");if(!form||!grid||form.querySelector('[name="temperature"]'))return;
  let initial="";if(route.mode==="edit"&&route.reportId){const rec=await irProject.data.forObject(oid).section("reports").get(route.reportId).catch(()=>null),d=rec?.data||{};initial=d.temperature??d.temp??""}
  const label=document.createElement("label");label.className="report-temperature-field";label.innerHTML=`Температура, °C<input type="number" step="0.1" name="temperature" value="${String(initial).replace(/"/g,"&quot;")}" placeholder="Например: 12">`;
  const wind=grid.querySelector('[name="wind"]')?.closest('label');grid.insertBefore(label,wind||null);grid.classList.add("report-grid-weather");
  const old=form.onsubmit;form.onsubmit=async e=>{sessionStorage.setItem(pendingKey(oid),JSON.stringify({value:String(form.querySelector('[name="temperature"]')?.value||""),mode:route.mode,reportId:route.reportId||"",at:Date.now()}));return old?.call(form,e)};
  document.getElementById("reportCancel")?.addEventListener("click",()=>clearPending(oid),{once:true});
 }
 window.irReportsPage=async(oid,route={})=>{
  if(!["new","edit","view"].includes(route?.mode))clearPending(oid);
  await applyPending(oid,route);
  const out=await base(oid,route);
  await enhanceForm(oid,route);
  return out;
 };
})();
;

/* #13: src/report-extra-sections.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],arr=v=>Array.isArray(v)?v:[],esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const route=()=>{const h=location.hash;let m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/new$/);if(m)return{oid:m[1],mode:"new",rid:""};m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)\/edit$/);if(m)return{oid:m[1],mode:"edit",rid:m[2]};m=h.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)$/);if(m)return{oid:m[1],mode:"view",rid:m[2]};return null};
 const tabScope=()=>window.name?.startsWith("ir-tab-")?window.name+"-":"";
 const pendingKey=oid=>`ir-report-extra-pending-${tabScope()}${oid}`,api=oid=>irProject.data.forObject(oid).section("reports");
 const summaryText=x=>{if(typeof x==="string")return x;if(x?.text)return String(x.text);const parts=[];if(x?.name||x?.point)parts.push(String(x.name||x.point));if(x?.work||x?.stage)parts.push(String(x.work||x.stage));if(x?.percent!==""&&x?.percent!=null)parts.push(`${x.percent}% завершено`);else if(x?.progress!==""&&x?.progress!=null)parts.push(`${x.progress}% завершено`);return parts.join(" — ")};
 const summaryRow=x=>`<div class="dynamic-row daily-summary-row"><label>Сводка<textarea name="summary_text" rows="2" placeholder="Например: Конвейер 1 — укрупнительная сборка завершена на 75%">${esc(summaryText(x))}</textarea></label><button type="button" class="row-remove" title="Удалить">×</button></div>`;
 const newExtraId=()=>["EW",Date.now().toString(36),Math.random().toString(36).slice(2,10)].join("-");
 const extraId=(entry,rid,index)=>String(entry?.id||entry?.work_id||((rid&&index>=0)?"EW-"+rid+"-"+(index+1):newExtraId()));
 const extraAct=x=>x?.signed_act?.path?x.signed_act:null;
 const extraRow=(x={},reportId="",index=-1)=>`<div class="dynamic-row additional-work-row" data-extra-id="${esc(extraId(x,reportId,index))}" data-extra-act="${esc(JSON.stringify(extraAct(x)))}"><label>Наименование<input name="additional_name" value="${esc(x?.name||"")}" placeholder="Наименование работы"></label><label>Количество<input name="additional_qty" inputmode="decimal" value="${esc(x?.qty??x?.count??"")}" placeholder="0"></label><label>Ед. измерения<input name="additional_unit" list="irAdditionalUnits" value="${esc(x?.unit||"")}" placeholder="тн, м2, м3, шт..."></label><label>Объём<input name="additional_volume" inputmode="decimal" value="${esc(x?.volume??"")}" placeholder="0"></label><button type="button" class="row-remove" title="Удалить">×</button></div>`;
 function copyData(oid){try{const x=JSON.parse(sessionStorage.getItem(`ir-report-copy-${tabScope()}${oid}`)||"null");return x?.data||x||{}}catch{return{}}}
 async function initial(r){if(r.mode==="edit"){const rec=await api(r.oid).get(r.rid).catch(()=>null);return rec?.data||{}}return r.mode==="new"?copyData(r.oid):{}}
 function renumber(form){qa('.report-form-section .rfs-head>span',form).forEach((n,i)=>n.textContent=String(i+1).padStart(2,'0'))}
 function collect(form){return{daily_summary:qa('.daily-summary-row',form).map(row=>({text:q('[name="summary_text"]',row)?.value.trim()||""})).filter(x=>x.text),additional_works:qa('.additional-work-row',form).map(row=>({id:row.dataset.extraId||newExtraId(),signed_act:(()=>{try{return JSON.parse(row.dataset.extraAct||"null")}catch{return null}})(),name:q('[name="additional_name"]',row)?.value.trim()||"",qty:q('[name="additional_qty"]',row)?.value.trim()||"",unit:q('[name="additional_unit"]',row)?.value.trim()||"",volume:q('[name="additional_volume"]',row)?.value.trim()||""})).filter(x=>x.name||x.qty||x.unit||x.volume)}}
 function wireRows(section,type){if(section.dataset.rowsWired==="1")return;section.dataset.rowsWired="1";section.addEventListener('click',e=>{const add=e.target.closest('[data-extra-add]');if(add&&section.contains(add)){e.preventDefault();e.stopPropagation();const list=q('.dynamic-list',section);if(list)list.insertAdjacentHTML('beforeend',type==='summary'?summaryRow({}):extraRow({id:newExtraId()}));return}const remove=e.target.closest('.row-remove');if(remove&&section.contains(remove)){e.preventDefault();e.stopPropagation();remove.closest('.dynamic-row')?.remove()}})}
 function paintAct(section,act){const name=q('.report-act-name',section),open=q('.report-act-open',section),remove=q('.report-act-remove',section);section.dataset.actPath=act?.path||"";section.dataset.actName=act?.name||"";if(name)name.textContent=act?.name||"Акт не загружен";if(open)open.hidden=!act?.path;if(remove)remove.hidden=!act?.path}
 function wireAct(section,initialAct){section.dataset.originalActPath=initialAct?.path||"";paintAct(section,initialAct);q('.report-act-select',section).onclick=async()=>{const file=await irProject.reportDocuments?.selectAct?.();if(!file)return;const current=section.dataset.actPath;if(current&&current!==section.dataset.originalActPath)await irProject.reportDocuments.remove(current).catch(()=>{});paintAct(section,file)};q('.report-act-open',section).onclick=()=>irProject.reportDocuments?.open?.(section.dataset.actPath);q('.report-act-remove',section).onclick=()=>paintAct(section,null)}
 async function enhanceForm(){const r=route(),form=q('#dailyReportForm');if(!r||!["new","edit"].includes(r.mode)||!form||form.dataset.extraSections==='1')return;const sections=qa('.report-form-section',form),info=sections.find(s=>/Дополнительная информация/i.test(q('h2',s)?.textContent||""));if(!info)return;form.dataset.extraSections='1';if(!q('#irAdditionalUnits'))document.body.insertAdjacentHTML('beforeend','<datalist id="irAdditionalUnits"><option value="тн"><option value="кг"><option value="м2"><option value="м3"><option value="м"><option value="шт"><option value="ед."></datalist>');const data=await initial(r);
  const extra=document.createElement('section');extra.className='report-form-section report-additional-works-section';extra.innerHTML=`<div class="rfs-head"><span></span><div><h2>Дополнительные работы</h2><p>Работы вне основной ведомости марок</p></div><button type="button" class="rfs-add" data-extra-add>＋ Добавить работу</button></div><div class="rfs-body dynamic-list">${(arr(data.additional_works).length?arr(data.additional_works):[{}]).map((w,i)=>extraRow(r.mode==='new'?{...w,id:newExtraId(),signed_act:null}:w,r.rid,i)).join('')}</div><div class="report-act-box"><div><strong>Акт, подписанный ответственными лицами</strong><span class="report-act-name">Акт не загружен</span></div><div class="report-act-actions"><button type="button" class="report-act-select">Загрузить акт</button><button type="button" class="report-act-open" hidden>Открыть</button><button type="button" class="report-act-remove" hidden>Удалить</button></div></div>`;
  const summary=document.createElement('section');summary.className='report-form-section report-daily-summary-section';summary.innerHTML=`<div class="rfs-head"><span></span><div><h2>Сводка за день</h2><p>Краткие текстовые пункты за рабочий день</p></div><button type="button" class="rfs-add" data-extra-add>＋ Добавить пункт</button></div><div class="rfs-body dynamic-list">${(arr(data.daily_summary).length?arr(data.daily_summary):[{}]).map(summaryRow).join('')}</div>`;
  info.parentNode.insertBefore(extra,info);info.parentNode.insertBefore(summary,info);wireRows(extra,'extra');wireRows(summary,'summary');wireAct(extra,r.mode==='new'?null:data.signed_act||null);renumber(form);
  form.addEventListener('submit',()=>{if(!form.checkValidity())return;const c=collect(form),act=extra.dataset.actPath?{path:extra.dataset.actPath,name:extra.dataset.actName}:null,old=extra.dataset.originalActPath||"";sessionStorage.setItem(pendingKey(r.oid),JSON.stringify({...c,signed_act:act,delete_act:old&&old!==(act?.path||"")?old:"",targetId:r.rid||"",date:q('[name="date"]',form)?.value||""}))},true)
 }
 async function applyPending(){const r=route();if(!r||r.mode!=="view")return;const raw=sessionStorage.getItem(pendingKey(r.oid));if(!raw)return;let p;try{p=JSON.parse(raw)}catch{return sessionStorage.removeItem(pendingKey(r.oid))}const rec=await api(r.oid).get(r.rid).catch(()=>null);if(!rec)return;const d=rec.data||{};if(p.targetId&&String(p.targetId)!==String(r.rid))return;if(!p.targetId&&p.date&&String(d.date||d.report_date||"")!==String(p.date))return;await api(r.oid).update(r.rid,{record_type:rec.record_type||"item",title:rec.title||"",data:{...d,daily_summary:arr(p.daily_summary),additional_works:arr(p.additional_works),signed_act:p.signed_act||null}});if(p.delete_act)await irProject.reportDocuments?.remove?.(p.delete_act).catch(()=>{});sessionStorage.removeItem(pendingKey(r.oid))}
 function summaryHtml(items){const texts=arr(items).map(summaryText).map(x=>x.trim()).filter(Boolean);if(!texts.length)return"";return `<section class="rv-section rv-daily-summary-section"><div class="rv-section-title"><h2>Сводка за день</h2><span>${texts.length} пункт.</span></div><div class="rv-summary-text-list">${texts.map((text,i)=>`<div class="rv-summary-text-item"><span>${i+1}</span><p>${esc(text)}</p></div>`).join('')}</div></section>`}
 function extraHtml(items,act,oid,reportId){if(!items.length&&!act?.path)return"";return`<section class="rv-section rv-additional-works-section"><div class="rv-section-title"><h2>Дополнительные работы</h2><span>${items.length} поз.</span></div>${items.length?`<div class="rv-table-wrap"><table class="rv-work-table"><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед. измерения</th><th>Объём</th><th>Карточка</th></tr></thead><tbody>${items.map((x,i)=>`<tr><td><b>${esc(x.name||"—")}</b></td><td>${esc(x.qty||"—")}</td><td>${esc(x.unit||"—")}</td><td><b>${esc(x.volume||"—")}${x.unit?` ${esc(x.unit)}`:""}</b></td><td><a class="rv-extra-open" href="#/objects/object/${encodeURIComponent(oid)}/extra-works/${encodeURIComponent(extraId(x,reportId,i))}">Открыть →</a></td></tr>`).join('')}</tbody></table></div>`:""}${act?.path?`<div class="rv-act"><div><small>Подписанный акт</small><b>${esc(act.name||"Акт")}</b></div><button type="button" data-report-act-open="${esc(act.path)}">Открыть акт</button></div>`:""}</section>`}
 async function enhanceView(){const r=route(),card=q('#rvCard');if(!r||r.mode!=="view"||!card||card.dataset.extraSections==='1')return;await applyPending();const rec=await api(r.oid).get(r.rid).catch(()=>null),d=rec?.data||{};card.dataset.extraSections='1';const works=q('.rv-works-section',card),note=q('.rv-note-section',card),photo=q('.rv-photo-section',card);const eh=extraHtml(arr(d.additional_works),d.signed_act,r.oid,r.rid),sh=summaryHtml(arr(d.daily_summary));if(eh&&works)works.insertAdjacentHTML('afterend',eh);if(sh)(note||photo)?.insertAdjacentHTML('beforebegin',sh);qa('[data-report-act-open]',card).forEach(b=>b.onclick=()=>irProject.reportDocuments?.open?.(b.dataset.reportActOpen))}
 let busy=false;async function run(){if(busy)return;busy=true;try{await enhanceForm();await enhanceView()}finally{busy=false}}
 let timer=0;new MutationObserver(()=>{if(!route())return;clearTimeout(timer);timer=setTimeout(run,75)}).observe(q('#app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',()=>{clearTimeout(timer);if(route())timer=setTimeout(run,40)});run();
})();
;

/* #14: src/reports-list-layout.js */
"use strict";
(()=>{
 let running=false,lastKey="";
 const arr=v=>Array.isArray(v)?v:[];
 const num=v=>Number(String(v??0).replace(",","."))||0;
 const fmt=v=>{const n=num(v);return Number.isInteger(n)?String(n):String(Number(n.toFixed(4))).replace(".",",")};
 const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const norm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 const serviceDone=w=>w?.completed===true||w?.service_completed===true||["done","выполнено"].includes(norm(w?.status));
 const date=v=>{if(!v)return"—";const p=String(v).slice(0,10).split("-");return p.length===3?`${p[2]}.${p[1]}.${p[0]}`:v};
 const windText=v=>{const s=String(v??"").trim();if(!s)return"";return /(?:м\s*\/\s*с|m\s*\/\s*s)$/i.test(s)?s:`${s} м/с`};
 const peopleTotal=r=>{const workers=arr(r.workers).length?arr(r.workers):arr(r.people),responsible=arr(r.responsible).length?arr(r.responsible):arr(r.responsibles),workersCount=workers.reduce((s,x)=>s+num(x.count??x.qty),0),responsibleCount=responsible.reduce((s,x)=>{const explicit=num(x.count??x.qty);return s+(explicit>0?explicit:(String(x.name||x.role||"").trim()?1:0))},0);return workersCount+responsibleCount};
 const oid=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"";
 const icon=name=>{
  if(name==="equipment")return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="13" cy="51" r="6"/><circle cx="31" cy="51" r="6"/><circle cx="51" cy="51" r="6"/><path d="M5 45h48v6H5zM28 44V29l19-17 4 4-17 18v10M47 16h7v22M54 38v5"/><path d="M50 45a4 4 0 0 0 8 0M35 33h12l7 12H35zM38 36h6l4 7H38zM10 45V35h16v10"/></svg>';
  const icons={calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 14l2 2 5-5"/>',user:'<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>',image:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',copy:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',edit:'<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',cloud:'<path d="M6 18h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 6 18z"/>',rain:'<path d="M6 15h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 6.1 4.5 4.5 0 0 0 6 15zM8 18l-1 3M13 18l-1 3M18 18l-1 3"/>',snow:'<path d="M6 14h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM8 18h.01M13 19h.01M18 18h.01"/>',storm:'<path d="M6 14h11a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.2 5.1 4.5 4.5 0 0 0 6 14zM13 15l-3 5h3l-1 3 4-6h-3z"/>',fog:'<path d="M4 8h16M2 12h20M5 16h14"/>'};
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.cloud}</svg>`;
 };
 const weatherType=w=>({"Ясно":"sun","Облачно":"cloud","Дождь":"rain","Снег":"snow","Гроза":"storm","Туман":"fog"})[w]||"cloud";
 const reportData=r=>({id:String(r.id),...(r.data||{})});
 const groups=d=>{const types=new Map();for(const w of arr(d.items||d.works)){const type=w.work_type||"Работа",service=w.accounting_type==="service"||w.is_service===true||norm(w.unit)==="услуга",plain=!service&&!String(w.mark_id||w.mark||"").trim();if(!types.has(type))types.set(type,new Map());const byCode=types.get(type);if(service){const key="__service__";if(!byCode.has(key))byCode.set(key,{service:true,completed:false});byCode.get(key).completed=byCode.get(key).completed||serviceDone(w);continue}if(plain){const unit=w.unit||"",key="__plain__|"+unit,value=num(w.volume)||num(w.qty)*num(w.unit_volume)||num(w.qty);if(!byCode.has(key))byCode.set(key,{plain:true,service:false,unit,volume:0});byCode.get(key).volume+=value;continue}const code=w.project_code||"Без шифра",unit=w.unit||"",key=code+"|"+unit;if(!byCode.has(key))byCode.set(key,{project_code:code,unit,volume:0,service:false,plain:false});byCode.get(key).volume+=num(w.volume)||num(w.qty)*num(w.unit_volume)}return [...types.entries()].map(([work_type,codes])=>({work_type,codes:[...codes.values()]}))};
 async function enhance(){if(running)return;const id=oid(),list=document.querySelector(".reports-list");if(!id||!list||!document.querySelector(".reports-page"))return;const key=id+":"+[...list.querySelectorAll(".report-row")].map(x=>x.dataset.reportId).join(",");if(key===lastKey&&[...list.querySelectorAll(".report-row")].every(x=>x.dataset.referenceLayout==="1"))return;running=true;try{const api=irProject.data.forObject(id).section("reports"),raw=await api.list().catch(()=>[]),map=new Map(raw.map(r=>[String(r.id),reportData(r)])),reportNo=new Map([...raw].sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0)).map((r,i)=>[String(r.id),i+1]));for(const row of list.querySelectorAll(".report-row[data-report-id]")){const r=map.get(String(row.dataset.reportId));if(!r)continue;const people=peopleTotal(r),equipment=arr(r.equipment).reduce((s,x)=>s+num(x.count),0),photos=arr(r.photos||r.reportPhotos).length,w=typeof r.weather==="string"?r.weather:(r.weather?.text||r.weather_text||"Не указана"),wind=windText(r.wind),workGroups=groups(r),workHtml=workGroups.length?workGroups.map(g=>{const details=g.codes.map(c=>c.service?`<span>Услуга — ${c.completed?"✓ Выполнено":"Не выполнено"}</span>`:c.plain?(c.volume>0?`<span>${fmt(c.volume)} ${esc(c.unit)}</span>`:""):`<span>${esc(c.project_code)} — ${fmt(c.volume)} ${esc(c.unit)}</span>`).join(""),plainOnly=!details;return `<div class="reference-work-group ${plainOnly?"reference-work-group-plain":""}"><strong>${esc(g.work_type)}</strong>${details?`<div class="reference-work-codes">${details}</div>`:""}</div>`}).join('<div class="reference-work-separator" aria-hidden="true"></div>'):`<div class="reference-work-group"><strong>${esc(r.note||"Работы не указаны")}</strong></div>`,wt=weatherType(w),no=reportNo.get(String(r.id))||1;row.classList.add("ir-reference-row");row.dataset.referenceLayout="1";row.innerHTML=`<div class="report-cell report-cell-date"><span class="report-list-icon">${icon("calendar")}</span><div><b>${date(r.date||r.report_date)}</b><small>Отчёт №${no}</small></div></div><div class="report-cell report-cell-people"><span class="report-list-icon">${icon("user")}</span><div><b>${fmt(people)}</b><small>чел.</small></div></div><div class="report-cell report-cell-equipment"><span class="report-list-icon">${icon("equipment")}</span><div><b>${fmt(equipment)}</b><small>ед. техники</small></div></div><div class="report-cell report-cell-photo"><span class="report-list-icon">${icon("image")}</span><div><b>${fmt(photos)}</b><small>фото</small></div></div><div class="report-cell report-cell-weather weather-${wt}"><span class="report-list-icon">${icon(wt)}</span><div><b>${esc(w)}</b>${wind?`<small>≈ ${esc(wind)}</small>`:"<small>—</small>"}</div></div><div class="report-cell report-cell-work">${workHtml}</div><div class="report-cell report-cell-actions">${window.irAccess&&window.irAccess.canEdit("reports")?`<div class="report-actions"><button type="button" data-ref-copy="${r.id}" title="Копировать">${icon("copy")}</button><button type="button" data-ref-edit="${r.id}" title="Редактировать">${icon("edit")}</button><button type="button" data-ref-delete="${r.id}" class="report-delete" title="Удалить">${icon("trash")}</button></div>`:""}</div>`;row.querySelector('[data-ref-edit]')?.addEventListener("click",e=>{e.stopPropagation();location.hash=`/objects/object/${id}/reports/${r.id}/edit`});row.querySelector('[data-ref-copy]')?.addEventListener("click",e=>{e.stopPropagation();sessionStorage.setItem(`ir-report-copy-${id}`,JSON.stringify(r));location.hash=`/objects/object/${id}/reports/new`});row.querySelector('[data-ref-delete]')?.addEventListener("click",async e=>{e.stopPropagation();if(!confirm(`Удалить ежедневный отчёт №${no}?`))return;await api.remove(r.id);if(window.irSyncMountedFromReports)await window.irSyncMountedFromReports(id);await window.irReportsPage(id)})}lastKey=key}catch(e){console.error("reports reference layout",e)}finally{running=false}}
 const mo=new MutationObserver(()=>setTimeout(enhance,0));mo.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener("hashchange",()=>{lastKey="";setTimeout(enhance,0)});setTimeout(enhance,0);
})();
;

/* #15: src/reports-no-flicker.js */
"use strict";
(()=>{
 const app=document.getElementById("app");if(!app)return;
 function sync(){
  document.querySelectorAll(".reports-page .reports-list").forEach(list=>{
   const rows=[...list.querySelectorAll(":scope > .report-row")];
   const ready=!rows.length||rows.every(r=>r.dataset.referenceLayout==="1"||r.classList.contains("ir-reference-row"));
   list.classList.toggle("reports-final-ready",ready);
  });
 }
 const mo=new MutationObserver(sync);
 mo.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:["class","data-reference-layout"]});
 window.addEventListener("hashchange",()=>requestAnimationFrame(sync));
 sync();
})();

;

/* #16: src/reports-pagination.js */
"use strict";
(()=>{
 const PAGE_SIZE=15;
 const pages=new Map();
 let timer=0;
 const objectKey=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"reports";
 const schedule=(delay=20)=>{clearTimeout(timer);timer=setTimeout(apply,delay)};
 function controls(list,total,page,totalPages){
  let bar=list.parentElement.querySelector(':scope > .reports-pagination');
  if(totalPages<=1){bar?.remove();return}
  if(!bar){bar=document.createElement('div');bar.className='reports-pagination';list.insertAdjacentElement('afterend',bar)}
  const start=(page-1)*PAGE_SIZE+1,end=Math.min(page*PAGE_SIZE,total),sig=`${total}:${page}:${totalPages}`;
  if(bar.dataset.sig===sig)return;
  bar.dataset.sig=sig;
  const nums=[];for(let p=1;p<=totalPages;p++){if(totalPages<=7||p===1||p===totalPages||Math.abs(p-page)<=1)nums.push(p);else if(nums[nums.length-1]!==0)nums.push(0)}
  bar.innerHTML=`<div class="reports-pagination-info">Показано ${start}–${end} из ${total}</div><div class="reports-pagination-buttons"><button type="button" data-page="prev" ${page===1?'disabled':''} aria-label="Предыдущая страница">←</button>${nums.map(p=>p===0?'<span class="reports-pagination-dots">…</span>':`<button type="button" data-page="${p}" class="${p===page?'active':''}">${p}</button>`).join('')}<button type="button" data-page="next" ${page===totalPages?'disabled':''} aria-label="Следующая страница">→</button></div>`;
  bar.querySelectorAll('button[data-page]').forEach(btn=>btn.onclick=()=>{const key=objectKey(),cur=pages.get(key)||1,v=btn.dataset.page;const next=v==='prev'?cur-1:v==='next'?cur+1:Number(v);pages.set(key,Math.max(1,Math.min(totalPages,next)));apply(true)});
 }
 function apply(fromClick=false){
  const list=document.querySelector('.reports-page .reports-list');if(!list)return;
  const rows=[...list.querySelectorAll(':scope > .report-row')],total=rows.length,key=objectKey();
  if(!total){list.parentElement.querySelector(':scope > .reports-pagination')?.remove();return}
  const totalPages=Math.ceil(total/PAGE_SIZE);let page=pages.get(key)||1;if(page>totalPages)page=totalPages;if(page<1)page=1;pages.set(key,page);
  rows.forEach((row,i)=>{const visible=totalPages<=1||Math.floor(i/PAGE_SIZE)+1===page;if(visible)row.style.removeProperty('display');else row.style.setProperty('display','none','important')});
  controls(list,total,page,totalPages);
  if(fromClick){document.querySelector('.reports-toolbar')?.scrollIntoView({block:'nearest'})}
 }
 document.addEventListener('input',e=>{if(e.target?.id==='reportsSearch'){pages.set(objectKey(),1);schedule(30)}},true);
 window.addEventListener('hashchange',()=>schedule(30));
 new MutationObserver(()=>schedule()).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});
 schedule(50);
})();
;

/* #17: src/report-form-tools.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 function closeMarks(except){qa(".mark-results").forEach(x=>{if(x!==except)x.hidden=true})}
 function syncMarkGate(row){const wt=q('[name="work_type_id"]',row),code=q('[name="project_code"]',row),search=q('[name="mark_search"]',row),box=q('.mark-results',row);if(!wt||!code||!search)return;const ready=Boolean(wt.value&&String(code.value||"").trim());search.disabled=!ready;search.placeholder=ready?"Поиск по марке или наименованию…":"Сначала выберите вид работы и шифр проекта";if(!ready){if(box)box.hidden=true;search.value="";const mid=q('[name="mark_id"]',row);if(mid)mid.value=""}}
 function workOptionLabels(row){const wt=q('[name="work_type_id"]',row);if(!wt)return;qa('option',wt).forEach(opt=>{if(!opt.value)return;const parts=String(opt.textContent||"").split(' · ');if(parts.length<3)return;const unit=parts.pop(),code=parts.pop(),name=parts.join(' · ').trim();opt.textContent=code?`${name} · ${code}`:name})}
 function volumeLabel(unit){const u=String(unit||"").trim(),kind=window.irMeasure?.meta?.(u)?.kind||"other",base=kind==="mass"?"Вес":kind==="area"?"Общая площадь":kind==="volume"?"Общий объём":kind==="length"?"Общая длина":kind==="count"?"Количество":"Объём";return u?`${base}, ${u}`:base}
 function syncVolumeLabel(row){const label=q('.rw-volume',row),unit=q('[name="unit"]',row)?.value||"";if(!label)return;const text=[...label.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue=volumeLabel(unit)}
 function lockCompletedMarks(row){const box=q('.mark-results',row);if(!box)return;qa('button[data-mid]',box).forEach(btn=>{const info=q('i',btn)?.textContent||"",m=info.match(/Ост\.\s*([-+]?\d+(?:[.,]\d+)?)/i);if(!m)return;const left=Number(m[1].replace(',','.'));if(Number.isFinite(left)&&left<=0){btn.disabled=true;btn.dataset.irComplete="1";btn.classList.remove('mark-result-left','mark-result-partial');btn.classList.add('mark-result-done');btn.title='Марка смонтирована на 100% и больше недоступна для выбора'}})}
 function polishRow(row){workOptionLabels(row);syncVolumeLabel(row);lockCompletedMarks(row)}
 async function copyWorkRow(src){const add=q('[data-add="works"]');if(!add)return;const wt=q('[name="work_type_id"]',src)?.value||"",mid=q('[name="mark_id"]',src)?.value||"",qty=q('[name="qty"]',src)?.value||"",serviceCompleted=q('[name="service_completed"]',src)?.value||"1";add.click();await sleep(0);const rows=qa('.work-row'),dst=rows[rows.length-1];if(!dst||dst===src)return;const dwt=q('[name="work_type_id"]',dst);if(dwt){dwt.value=wt;dwt.dispatchEvent(new Event("change",{bubbles:true}))}await sleep(0);syncMarkGate(dst);polishRow(dst);if(mid){const search=q('[name="mark_search"]',dst),box=q('.mark-results',dst);if(search&&!search.disabled){search.focus();await sleep(0);lockCompletedMarks(dst);const btn=box?.querySelector(`[data-mid="${CSS.escape(mid)}"]`);if(btn&&!btn.disabled)btn.click()}}const dqty=q('[name="qty"]',dst);if(dqty){dqty.value=qty;dqty.dispatchEvent(new Event("input",{bubbles:true}))}const dservice=q('[name="service_completed"]',dst);if(dservice)dservice.value=serviceCompleted}
 function normalizeWind(form){const input=q('[name="wind"]',form);if(!input||input.dataset.windReady)return;input.dataset.windReady="1";input.value=String(input.value||"").replace(/\s*(?:м\s*\/\s*с|m\s*\/\s*s)\s*$/i,"").trim();input.placeholder="Например: 5";input.inputMode="decimal";const label=input.closest('label'),text=label&&[...label.childNodes].find(n=>n.nodeType===3);if(text)text.nodeValue="Ветер, м/с"}
 function enhance(form){normalizeWind(form);const worksSection=qa('.report-form-section',form).find(s=>q('h2',s)?.textContent.trim()==='Выполненные работы'),hint=worksSection&&q('.rfs-head p',worksSection);if(hint)hint.textContent='Монтаж и изготовление — по маркам; другие работы — по объёму; услуги — выполнено / не выполнено';qa('.work-row',form).forEach(row=>{polishRow(row);if(row.dataset.irTools)return;row.dataset.irTools="1";syncMarkGate(row);const wt=q('[name="work_type_id"]',row),search=q('[name="mark_search"]',row),box=q('.mark-results',row);wt?.addEventListener("change",()=>setTimeout(()=>{syncMarkGate(row);polishRow(row)},0));if(search&&box){search.addEventListener("pointerdown",()=>{search.dataset.wasOpen=box.hidden?"0":"1"});search.addEventListener("click",e=>{if(search.disabled)return;if(search.dataset.wasOpen==="1"){box.hidden=true;e.stopPropagation()}})}const remove=q('.row-remove',row);if(remove&&!q('.work-copy',row)){const b=document.createElement('button');b.type='button';b.className='work-copy';b.title='Копировать выполненную работу';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';b.onclick=()=>copyWorkRow(row);remove.insertAdjacentElement('beforebegin',b)}})}
 function run(){const form=q('#dailyReportForm');if(form)enhance(form)}
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.mark-picker'))closeMarks()},true);document.addEventListener('click',e=>{if(e.target.closest('.mark-result-done[disabled],[data-ir-complete="1"]')){e.preventDefault();e.stopImmediatePropagation()}},true);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMarks()});
 let t=0;new MutationObserver(()=>{clearTimeout(t);t=setTimeout(run,0)}).observe(document.getElementById('app')||document.body,{subtree:true,childList:true});window.addEventListener('hashchange',()=>setTimeout(run,0));run();
})();
;

/* #18: src/report-photo-manager.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
 const oid=()=>location.hash.match(/^#?\/objects\/object\/(\d+)\/reports/)?.[1]||"";
 const pendingDeleteKey=id=>`ir-report-photo-delete-${id}`;
 const added=new Set(),deleted=new Set();
 const trashIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
 async function paint(slot,path,index){slot.dataset.photoPath=path||"";slot.innerHTML="";if(!path){slot.classList.remove("has-photo");slot.innerHTML=`<b>＋</b><span>Фото ${index+1}</span>`;return}const src=await irProject.images.read(path).catch(()=>"");if(!src){slot.classList.remove("has-photo");slot.innerHTML=`<b>＋</b><span>Фото ${index+1}</span>`;slot.dataset.photoPath="";return}slot.classList.add("has-photo");slot.innerHTML=`<img src="${src}" alt="Фото ${index+1}"><span>Фото ${index+1}</span><button type="button" class="report-photo-remove" title="Удалить фото" aria-label="Удалить фото">${trashIcon}</button>`;slot.querySelector(".report-photo-remove").onclick=async e=>{e.stopPropagation();const old=slot.dataset.photoPath||"";if(!old)return;if(added.has(old)){added.delete(old);await irProject.reportPhotos?.remove?.(old).catch(()=>{})}else deleted.add(old);await paint(slot,"",index)}}
 async function choose(slot,index){if(slot.dataset.photoPath)return;const path=await (irProject.reportPhotos?.selectImage?.()||irProject.objects.selectImage());if(!path)return;added.add(path);await paint(slot,path,index)}
 async function wireSlots(){const form=q("#dailyReportForm"),grid=q(".report-photo-grid",form||document);if(!form||!grid)return;const slots=qa(".report-photo-slot",grid);if(!slots.length)return;for(let i=0;i<slots.length;i++){const slot=slots[i],path=slot.dataset.photoPath||"";if(path&&!slot.querySelector(".report-photo-remove"))await paint(slot,path,i);slot.onclick=e=>{if(e.target.closest(".report-photo-remove"))return;choose(slot,i)}}if(form.dataset.photoManagerSubmit!=="1"){form.dataset.photoManagerSubmit="1";form.addEventListener("submit",()=>{const id=oid();if(id&&deleted.size)sessionStorage.setItem(pendingDeleteKey(id),JSON.stringify([...deleted]))},true)}}
 async function commitDeletes(){const m=location.hash.match(/^#?\/objects\/object\/(\d+)\/reports\/(\d+)$/);if(!m)return;const key=pendingDeleteKey(m[1]),raw=sessionStorage.getItem(key);if(!raw)return;sessionStorage.removeItem(key);let files=[];try{files=JSON.parse(raw)||[]}catch{}for(const file of files)await irProject.reportPhotos?.remove?.(file).catch(()=>{});deleted.clear();added.clear()}
 let timer=0;function schedule(){clearTimeout(timer);timer=setTimeout(()=>{wireSlots();commitDeletes()},220);setTimeout(wireSlots,700);setTimeout(wireSlots,1200)}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule);else schedule();new MutationObserver(schedule).observe(document.getElementById("app")||document.body,{subtree:true,childList:true});window.addEventListener("hashchange",schedule);
})();
;

/* #19: src/report-mounted-sync.js */
"use strict";
(()=>{
 const num=v=>{const n=Number(String(v??0).replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 async function syncMounted(oid){
  oid=String(oid||"");if(!oid)throw Error("Не указан объект для сверки ведомости.");
  const root=irProject.data.forObject(oid),reportsApi=root.section("reports"),marksApi=root.section("marks");
  // Ошибка чтения не должна превращаться в пустой список: иначе можно обнулить монтаж.
  const [reports,marks]=await Promise.all([reportsApi.list(),marksApi.list()]);
  if(!Array.isArray(reports)||!Array.isArray(marks))throw Error("Не удалось получить отчёты или ведомость марок.");
  const mounted=Object.create(null),ids=new Set(marks.map(m=>String(m.id)));
  let workLines=0,linkedLines=0,withoutMarkId=0;
  for(const report of reports){
   const d=report.data||report,works=Array.isArray(d.items)?d.items:Array.isArray(d.works)?d.works:[];
   for(const w of works){
    workLines++;
    if(w?.accounting_type==="service"||w?.is_service===true)continue;
    const id=String(w?.mark_id??w?.markId??"").trim();
    if(!id){if(w?.mark||w?.mark_name||w?.markName)withoutMarkId++;continue}
    const qty=Math.max(0,num(w.qty??w.count??w.quantity));
    mounted[id]=(mounted[id]||0)+qty;linkedLines++
   }
  }
  const updates=[];
  for(const m of marks){
   const d=m.data||{},total=Math.max(0,num(d.qty??d.count)),next=Math.max(0,Math.min(total,mounted[String(m.id)]||0)),current=num(d.mounted??d.done);
   if(Math.abs(next-current)<1e-9)continue;
   updates.push({m,data:d,next,before:current})
  }
  const changedMarks=[];
  for(const item of updates){
   const {m,data,next,before}=item;
   await marksApi.update(m.id,{record_type:m.record_type||"item",title:m.title||data.mark||"",data:{...data,mounted:next}});
   changedMarks.push({id:String(m.id),mark:String(data.mark||m.title||m.id),before,after:next})
  }
  const unrecognizedIds=Object.keys(mounted).filter(id=>!ids.has(id));
  return{reportsChecked:reports.length,workLines,linkedLines,withoutMarkId,unrecognizedIds,marksChecked:marks.length,updated:changedMarks.length,changedMarks}
 }
 window.irSyncMountedFromReports=syncMounted;
 const original=window.irMarksPage;
 if(typeof original==="function")window.irMarksPage=async oid=>{await syncMounted(oid);return original(oid)};
})();

;

/* #20: src/measurement-ui.js */
"use strict";
(()=>{
 const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],meta=u=>window.irMeasure?.meta?.(u)||{totalLabel:"Общий объём",itemLabel:"Объём 1 ед."};
 function unitFromActiveMarks(){const card=q('.marks-work-card.on');if(!card)return"";if(card.dataset.work==="all"){const units=qa('.marks-work-card:not([data-work="all"]) .mwc-meta').map(x=>(x.textContent.split('·').pop()||'').trim()).filter(Boolean);const uniq=[...new Set(units)];return uniq.length===1?uniq[0]:""}return(card.querySelector('.mwc-meta')?.textContent.split('·').pop()||'').trim()}
 function directText(label){return[...label.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim()}
 function textBeforeInput(label,text){if(!label||directText(label)===text)return false;for(const n of [...label.childNodes])if(n.nodeType===3)n.remove();label.insertBefore(document.createTextNode(text),label.firstChild);return true}
 function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
 function apply(){
  const marks=q('.marks-page');if(marks){const unit=unitFromActiveMarks(),m=meta(unit),heads=qa('.marks-head>span',marks);setText(heads[3],unit?m.itemLabel:'Объём / вес 1 ед.');setText(heads[4],unit?m.totalLabel:'Общий объём / вес');const ed=q('#markEditForm',marks),active=q('.marks-work-card.on',marks);if(ed&&active&&unit)textBeforeInput(ed.querySelector('label:nth-of-type(4)'),m.itemLabel)}
  qa('.work-row').forEach(row=>{const unit=q('[name="unit"]',row)?.value||'',label=q('.rw-volume',row);if(label&&unit)textBeforeInput(label,meta(unit).totalLabel.replace('Общий ','')||'Объём')});
 }
 let t=0;const schedule=()=>{clearTimeout(t);t=setTimeout(apply,30)};new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});document.addEventListener('change',schedule,true);window.addEventListener('hashchange',schedule);schedule();
})();

;
