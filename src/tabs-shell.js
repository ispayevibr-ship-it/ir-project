"use strict";
(()=>{
 const list=document.getElementById("tabsList"),stage=document.getElementById("tabsContent"),status=document.getElementById("tabsStatus");
 if(!list||!stage)return;
 const openerBridge=()=>{try{return window.opener?.irProject||null}catch{return null}};
 const api=window.irProject||openerBridge();
 if(!api?.data?.objects){
  status.textContent="Нет подключения к данным. Откройте эту вкладку из главного окна IR Project.";
  return
 }
 // Each iframe receives the existing (read-only IPC) bridge before the original app scripts run.
 if(!window.irProject)window.irProject=api;
 const params=new URLSearchParams(location.search),isDetached=params.has("detached");
 const storeKey=isDetached?"ir-project-tabs-detached-"+params.get("detached"):"ir-project-tabs-v1";
 const frames=new Map(),objectsCache=new Map(),MAX_TABS=12;
 let order=[],activeId="",serial=0,restoring=false;
 const sections={"reports":"Ежедневные отчёты","marks":"Ведомость марок","work-types":"Виды работ","schedule":"График работ","deliveries":"Поставки","scheme":"Монтажная схема","extra-works":"Доп. работы","acted-days":"Актированные дни","penalties":"Штрафы","finance":"Финансы","photos":"Фотографии объекта"};
 const routeValid=route=>typeof route==="string"&&route.length<350&&/^\/objects(?:\/object\/\d+(?:\/[a-z0-9_-]+)*)?$/i.test(route);
 const cleanRoute=route=>routeValid(route)?route:"/objects";
 const newId=()=>String(Date.now().toString(36))+"-"+(++serial).toString(36);
 const routeLabel=route=>{
  if(route==="/objects")return"Все объекты";
  const match=route.match(/^\/objects\/object\/(\d+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if(!match)return"IR Project";
  const [,oid,section,entry,action]=match,object=objectsCache.get(oid)||"Объект "+oid;
  if(!section)return object;
  const sectionName=sections[section]||section;
  if(section==="reports"&&entry==="new")return"Новый отчёт · "+object;
  if(section==="reports"&&entry&&/^\d+$/.test(entry))return(action==="edit"?"Редактирование отчёта #":"Отчёт #")+entry+" · "+object;
  if(section==="extra-works"&&entry)return"Доп. работа "+entry+" · "+object;
  return sectionName+" · "+object
 };
 const save=()=>{
  if(restoring)return;
  const state={active:activeId,tabs:order.map(id=>{const t=frames.get(id);return{id,route:t?.route||"/objects"}}).filter(x=>x.route)};
  try{localStorage.setItem(storeKey,JSON.stringify(state))}catch{}
 };
 function notify(text){if(status)status.textContent=String(text||"Готово")}
 function renderTabBar(){
  list.replaceChildren();
  for(const id of order){
   const tab=frames.get(id);if(!tab)continue;
   const button=document.createElement("div");
   button.className="tabs-item"+(id===activeId?" active":"")+(tab.dirty?" unsaved":"");
   button.dataset.tabId=id;button.role="tab";button.tabIndex=0;button.ariaSelected=id===activeId?"true":"false";
   button.title=tab.title+(tab.dirty?" · Есть несохранённые изменения":"");
   const icon=document.createElement("span");icon.className="tabs-icon";icon.textContent="▣";
   const name=document.createElement("span");name.className="tabs-title";name.textContent=tab.title;
   const close=document.createElement("button");close.type="button";close.className="tabs-close";close.textContent="×";close.title="Закрыть вкладку";
   close.onclick=e=>{e.stopPropagation();closeTab(id)};
   button.append(icon,name,close);button.onclick=()=>selectTab(id);
   button.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectTab(id)}};
   button.onauxclick=e=>{if(e.button===1){e.preventDefault();closeTab(id)}};
   list.append(button)
  }
  const activeElement=list.querySelector(".tabs-item.active");
  if(activeElement)activeElement.scrollIntoView({block:"nearest",inline:"nearest"})
 }
 async function resolveName(id,objectId){
  if(!objectId||objectsCache.has(objectId))return;
  try{
   const obj=await api.data.objects.get(objectId);
   if(obj?.name){objectsCache.set(objectId,String(obj.name));for(const tab of frames.values())tab.title=routeLabel(tab.route);renderTabBar()}
  }catch{}
 }
 function setRoute(id,route){
  const tab=frames.get(id);if(!tab)return;
  tab.route=cleanRoute(route);tab.title=routeLabel(tab.route);
  const oid=tab.route.match(/^\/objects\/object\/(\d+)/)?.[1];
  if(oid)resolveName(id,oid);
  renderTabBar();save()
 }
 function selectTab(id){
  if(!frames.has(id))return;
  activeId=id;
  for(const [key,tab] of frames){const selected=key===id;tab.frame.classList.toggle("active",selected);tab.frame.hidden=false;tab.frame.setAttribute("aria-hidden",selected?"false":"true")}
  renderTabBar();save();notify("Вкладка: "+frames.get(id).title)
 }
 function markDirty(id){const t=frames.get(id);if(t&&!t.dirty){t.dirty=true;renderTabBar()}}
 function attachHandlers(tab){
  const frame=tab.frame;
  let child;
  try{child=frame.contentWindow;if(!child)return;void child.location.hash}catch{notify("Ошибка доступа к вкладке — проверьте обновление.");return}
  // A route change follows successful saves. Before leaving a page, retain its draft warning.
  const onHash=()=>{try{tab.dirty=false;setRoute(tab.id,child.location.hash.slice(1)||"/objects")}catch{}};
  child.addEventListener("hashchange",onHash);
  child.document.addEventListener("input",e=>{
   const target=e.target;
   if(!target?.closest)return;
   if(target.closest('form')&&!target.matches('input[type="search"],input[type="hidden"]'))markDirty(tab.id);
  },true);
  child.document.addEventListener("change",e=>{
   const target=e.target;
   if(target?.closest?.("form")&&!target.matches('input[type="search"]'))markDirty(tab.id)
  },true);
  child.document.addEventListener("keydown",e=>shortcuts(e),true);
  child.document.addEventListener("auxclick",e=>{
   const link=e.target?.closest?.("a[href^='#/objects']");
   if(link&&e.button===1){e.preventDefault();createTab(link.getAttribute("href").slice(1),true)}
  },true);
  onHash();
 }
 function createTab(route="/objects",activate=true,savedId=null){
  if(order.length>=MAX_TABS){alert("Одновременно можно открыть до "+MAX_TABS+" вкладок.");return null}
  const id=savedId||newId(),path=cleanRoute(route);
  if(frames.has(id))return id;
  const frame=document.createElement("iframe");
  frame.className="tabs-pane";frame.title=routeLabel(path);frame.referrerPolicy="same-origin";
  frame.setAttribute("aria-hidden","true");
  const tab={id,frame,route:path,title:routeLabel(path),dirty:false};
  frames.set(id,tab);order.push(id);
  frame.addEventListener("load",()=>{if(frames.get(id)!==tab)return;attachHandlers(tab)});
  frame.src="./index.html?tabContent=1#"+path;
  stage.append(frame);
  if(activate)selectTab(id);else{renderTabBar();save()}
  const oid=path.match(/^\/objects\/object\/(\d+)/)?.[1];if(oid)resolveName(id,oid);
  return id
 }
 function closeTab(id){
  const tab=frames.get(id);if(!tab)return false;
  if(tab.dirty&&!confirm("Во вкладке есть несохранённые изменения. Закрыть её?"))return false;
  const index=order.indexOf(id),wasActive=activeId===id;
  tab.frame.remove();frames.delete(id);order=order.filter(x=>x!==id);
  if(!order.length){activeId="";createTab("/objects");return true}
  if(wasActive)selectTab(order[Math.min(index,order.length-1)]);
  else{renderTabBar();save()}
  return true
 }
 function shortcuts(event){
  const ctrl=event.ctrlKey||event.metaKey;
  if(!ctrl||event.altKey)return;
  const k=String(event.key).toLowerCase();
  if(k==="t"){event.preventDefault();createTab("/objects");return}
  if(k==="w"){event.preventDefault();closeTab(activeId);return}
  if(k==="tab"||k==="pagedown"||k==="pageup"){
   event.preventDefault();if(!order.length)return;
   const back=event.shiftKey||k==="pageup",step=back?-1:1,i=order.indexOf(activeId);
   selectTab(order[(i+step+order.length)%order.length])
  }
 }
 document.addEventListener("keydown",shortcuts,true);
 document.getElementById("tabsAdd").onclick=()=>createTab("/objects");
 document.getElementById("tabsDuplicate").onclick=()=>{const selected=frames.get(activeId);if(selected)createTab(selected.route)};
 document.getElementById("tabsDetach").onclick=()=>{
  const selected=frames.get(activeId);if(!selected)return;
  if(selected.dirty&&!confirm("В новой оконной копии откроется сохранённая версия страницы. Несохранённые данные останутся в текущей вкладке. Продолжить?"))return;
  const id=newId();
  const url="./tabs-shell.html?detached="+encodeURIComponent(id)+"#"+selected.route;
  const popup=window.open(url,"_blank","width=1180,height=780");
  if(!popup)notify("Открытие окна заблокировано. Разрешите открывать новые окна IR Project.");
  else notify("Страница открыта в отдельном окне. Исходная вкладка сохранена.")
 };
 const initialHash=location.hash.slice(1);
 let previous=null;try{previous=JSON.parse(localStorage.getItem(storeKey)||"null")}catch{}
 restoring=true;
 if(routeValid(initialHash))createTab(initialHash,true);
 else if(!isDetached&&Array.isArray(previous?.tabs)&&previous.tabs.length){
  for(const item of previous.tabs.slice(0,MAX_TABS))createTab(item.route,false,item.id&&/^[a-z0-9-]{1,80}$/i.test(item.id)?item.id:null);
  if(order.length)selectTab(frames.has(previous.active)?previous.active:order[0])
 }
 if(!order.length)createTab("/objects");
 restoring=false;save();
 window.addEventListener("beforeunload",event=>{
  if([...frames.values()].some(t=>t.dirty)){event.preventDefault();event.returnValue=""}
 });
 // Keep route storage current, without reloading hidden iframe documents.
 window.addEventListener("focus",()=>{const active=frames.get(activeId);if(active)notify("Вкладка: "+active.title)});
})();
