"use strict";
(()=>{
 const list=document.getElementById("tabsList"),stage=document.getElementById("tabsContent"),addButton=document.getElementById("tabsAdd"),loader=document.getElementById("tabsLoading"),loadingText=document.getElementById("tabsLoadingText"),retryButton=document.getElementById("tabsLoadingRetry"),showButton=document.getElementById("tabsLoadingShow"),profileSlot=document.getElementById("tabsProfileSlot");
 if(!list||!stage)return;
 const openerBridge=()=>{try{return window.opener?.irProject||null}catch{return null}};
 const api=window.irProject||openerBridge();
 if(!api?.data?.objects){
  const error=document.createElement("div");error.style.cssText="padding:25px;color:#a94444;font:13px Segoe UI";error.textContent="Нет подключения к данным. Откройте страницу из главного окна IR Project.";stage.append(error);
  return
 }
 // Each iframe receives the existing (read-only IPC) bridge before the original app scripts run.
 if(!window.irProject)window.irProject=api;
 const params=new URLSearchParams(location.search),isDetached=params.has("detached");
 const storeKey=isDetached?"ir-project-tabs-detached-"+params.get("detached"):"ir-project-tabs-v1";
 const frames=new Map(),objectsCache=new Map(),MAX_TABS=12;
 let order=[],activeId="",serial=0,restoring=false;
 const sections={"reports":"Ежедневные отчёты","marks":"Ведомость марок","work-types":"Виды работ","schedule":"График работ","deliveries":"Поставки","scheme":"Монтажная схема","ai-recognition":"ИИ-распознавание","extra-works":"Доп. работы","acted-days":"Актированные дни","penalties":"Штрафы","finance":"Финансы","photos":"Фотографии объекта"};
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

 // Small section-specific line icons, consistently styled for the IR Project tab bar.
 const iconPaths={
  objects:'<rect x="3" y="7" width="7" height="14" rx="1"/><path d="M5 7V3h11v18M10 12h11v9M6 10h1m-1 4h1m-1 4h1m7-11h1m-1 4h1m-1 4h1m-1 4h1"/>',
  object:'<path d="M3 21V5l9-3 9 3v16H3Z"/><path d="M9 21v-5h6v5M7 8h2m6 0h2M7 12h2m6 0h2"/>',
  scheme:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><circle cx="9" cy="9" r="1.25"/><circle cx="15" cy="15" r="1.25"/>',
  "ai-recognition":'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 6v12M6 12h12M5 5l3 3m8 8 3 3"/>',
  reports:'<path d="M7 3h8l4 4v14H5V3h2z"/><path d="M15 3v5h4M9 12h6M9 16h6"/>',
  marks:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M14 12h4m-4 4h4M5 6h.01"/>',
  "work-types":'<path d="M7 3h12v18H5V5l2-2z"/><path d="M9 9h7m-7 4h7m-7 4h4M3 8h3"/>',
  deliveries:'<path d="m3 8 9-5 9 5v10l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v10M7.5 5.5l9 5"/>',
  schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m2 0h3m-8 4h3"/>',
  "extra-works":'<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><path d="M7 9h8M7 13h5M7 17h3M17 13v8m-4-4h8"/>',
  photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.4"/><path d="m4 18 5.5-5 4 3 3-3 4.5 5"/>',
  "acted-days":'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v3m8-3v3M4 9h16m-12 5 3 3 5-5"/>',
  penalties:'<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3v.2"/>',
  finance:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18m-14 6h4"/>'
 };
 function iconForRoute(route){
  const match=String(route||"").match(/^\/objects\/object\/\d+(?:\/([^/]+))?/);
  const key=route==="/objects"?"objects":match?(match[1]||"object"):"objects";
  return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(iconPaths[key]||iconPaths.object)+'</svg>'
 }
 const save=()=>{
  if(restoring)return;
  const state={active:activeId,tabs:order.map(id=>{const t=frames.get(id);return{id,route:t?.route||"/objects"}}).filter(x=>x.route)};
  try{localStorage.setItem(storeKey,JSON.stringify(state))}catch{}
 };
 function notify(text){/* Bottom status bar removed; preserve nonvisual status call sites. */}
 // Overflow count replaces horizontal scrolling; no iframe is destroyed or reordered.
 const overflowButton=document.createElement("button");
 overflowButton.type="button";
 overflowButton.className="tabs-overflow";
 overflowButton.setAttribute("aria-haspopup","menu");
 overflowButton.setAttribute("aria-expanded","false");
 overflowButton.title="Показать скрытые вкладки";
 const overflowMenu=document.createElement("div");
 overflowMenu.className="tabs-overflow-menu";
 overflowMenu.setAttribute("role","menu");
 overflowMenu.hidden=true;
 document.body.append(overflowMenu);
 let lastTabWidth=0;
 const closeOverflow=()=>{overflowMenu.hidden=true;overflowButton.setAttribute("aria-expanded","false")};
 const showOverflow=()=>{
  if(!overflowMenu.hidden){closeOverflow();return}
  const rect=overflowButton.getBoundingClientRect();
  overflowMenu.style.top=Math.min(window.innerHeight-55,rect.bottom+6)+"px";
  overflowMenu.style.left=Math.max(7,Math.min(rect.left,window.innerWidth-294))+"px";
  overflowMenu.hidden=false;
  overflowButton.setAttribute("aria-expanded","true");
 };
 overflowButton.onclick=e=>{e.stopPropagation();showOverflow()};
 document.addEventListener("pointerdown",e=>{
  if(!overflowMenu.hidden&&!overflowMenu.contains(e.target)&&!overflowButton.contains(e.target))closeOverflow()
 },true);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overflowMenu.hidden)closeOverflow()});
 function renderTabBar(){
  closeOverflow();
  // The old CSS allowed scrolling and caused tabs to be partially clipped.
  // The shell now measures its own actual width, reserves space for (N) and +,
  // and never renders more tabs than the bar can contain.
  list.style.overflowX="hidden";
  list.style.overflowY="hidden";
  list.style.scrollbarWidth="none";
  list.scrollLeft=0;
  list.replaceChildren();
  list.classList.remove("tabs-many","tabs-packed");
  const itemWidth=window.matchMedia("(max-width: 1000px)").matches?145:175;
  const gap=6,addWidth=29,overflowWidth=48,fitPadding=18;
  const available=Math.floor(list.getBoundingClientRect().width)||Math.max(160,window.innerWidth-500);
  const fullWidth=order.length*itemWidth+Math.max(0,order.length-1)*gap+addWidth+gap;
  const maxVisible=Math.max(1,Math.floor((available-addWidth-overflowWidth-fitPadding)/(itemWidth+gap)));
  const count=fullWidth<=available?order.length:Math.min(order.length-1,maxVisible);
  const activeIndex=order.indexOf(activeId);
  const start=activeIndex<count?0:Math.max(0,activeIndex-count+1);
  const visible=order.slice(start,start+count),visibleIds=new Set(visible);
  for(const id of visible){
   const tab=frames.get(id);if(!tab)continue;
   const button=document.createElement("div");
   button.className="tabs-item"+(id===activeId?" active":"")+(tab.dirty?" unsaved":"");
   button.dataset.tabId=id;button.role="tab";button.tabIndex=0;button.ariaSelected=id===activeId?"true":"false";
   button.style.setProperty("flex","0 0 "+itemWidth+"px","important");
   button.style.setProperty("min-width",itemWidth+"px","important");
   button.style.setProperty("max-width",itemWidth+"px","important");
   button.title=tab.title+(tab.dirty?" · Есть несохранённые изменения":"");
   const icon=document.createElement("span");icon.className="tabs-icon";icon.setAttribute("aria-hidden","true");icon.innerHTML=iconForRoute(tab.route);
   const name=document.createElement("span");name.className="tabs-title";name.textContent=tab.title;
   const close=document.createElement("button");close.type="button";close.className="tabs-close";close.textContent="×";close.title="Закрыть вкладку";
   close.onclick=e=>{e.stopPropagation();closeTab(id)};
   button.append(icon,name,close);button.onclick=()=>selectTab(id);
   button.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectTab(id)}};
   button.onauxclick=e=>{if(e.button===1){e.preventDefault();closeTab(id)}};
   button.oncontextmenu=e=>{e.preventDefault();tabMenu(id,e.clientX,e.clientY)};
   list.append(button)
  }
  const hidden=order.filter(id=>frames.has(id)&&!visibleIds.has(id));
  if(hidden.length){
   overflowButton.textContent="("+hidden.length+")";
   overflowButton.setAttribute("aria-label","Скрытые вкладки: "+hidden.length);
   overflowMenu.replaceChildren();
   for(const id of hidden){
    const tab=frames.get(id);
    const line=document.createElement("div");line.className="tabs-overflow-item";line.setAttribute("role","none");
    const open=document.createElement("button");open.type="button";open.className="tabs-overflow-open";
    open.setAttribute("role","menuitem");open.title=tab.title;
    const icon=document.createElement("span");icon.className="tabs-overflow-icon";icon.innerHTML=iconForRoute(tab.route);icon.setAttribute("aria-hidden","true");
    const label=document.createElement("span");label.textContent=tab.title+(tab.dirty?" •":"");
    open.append(icon,label);
    open.onclick=()=>{closeOverflow();selectTab(id)};
    const close=document.createElement("button");close.type="button";close.className="tabs-overflow-close";
    close.textContent="×";close.title="Закрыть вкладку";close.setAttribute("aria-label","Закрыть "+tab.title);
    close.onclick=e=>{e.stopPropagation();closeOverflow();closeTab(id)};
    line.append(open,close);overflowMenu.append(line)
   }
   list.append(overflowButton)
  }
  if(addButton)list.append(addButton);
  list.scrollLeft=0;
 }
 if(typeof ResizeObserver!=="undefined"){
  const observer=new ResizeObserver(()=>{
   const width=Math.round(list.getBoundingClientRect().width);
   if(width!==lastTabWidth){lastTabWidth=width;renderTabBar()}
  });
  observer.observe(list);
  // The profile/settings controls can appear after initial load and reduce the
  // available space without triggering a window resize.
  if(profileSlot)observer.observe(profileSlot)
 }
 window.addEventListener("resize",()=>{closeOverflow();renderTabBar()});
 async function resolveName(id,objectId){
  if(!objectId||objectsCache.has(objectId))return;
  try{
   const obj=await api.data.objects.get(objectId);
   if(obj?.name){const records=await api.data.forObject(objectId).section("object-meta").list().catch(()=>[]);
    const short=records.find(x=>x.record_type==="object_short_name"||x.data?.entity_type==="object_short_name");
    objectsCache.set(objectId,String(short?.data?.value||obj.name));
    for(const tab of frames.values())tab.title=routeLabel(tab.route);renderTabBar()
   }
  }catch{}
 }
 window.irTabRefreshObjectName=id=>{const key=String(id||"");if(!key)return;objectsCache.delete(key);resolveName("",key)};
 function setRoute(id,route){
  const tab=frames.get(id);if(!tab)return;
  const next=cleanRoute(route);
  if(tab.route===next)return;
  // The pages of this tab in the order they were opened: «Назад» returns along them.
  if(tab.goingBack)tab.goingBack=false;else{tab.trail.push(next);if(tab.trail.length>40)tab.trail.splice(0,tab.trail.length-40)}
  tab.route=next;tab.title=routeLabel(tab.route);
  const oid=tab.route.match(/^\/objects\/object\/(\d+)/)?.[1];
  if(oid)resolveName(id,oid);
  renderTabBar();save()
 }
 function showLoading(){
  const t=frames.get(activeId);if(!loader)return;
  loader.hidden=!t||t.ready;if(loader.hidden)return;
  loadingText.textContent=t.loadError?"Страница не завершила загрузку. Повторите обновление или покажите её содержимое.":"Открываем "+(t.title||"страницу")+"…";
  const spin=loader.querySelector(".tabs-loading-spinner");if(spin)spin.hidden=!!t.loadError;
  if(retryButton)retryButton.hidden=!t.loadError;
  if(showButton)showButton.hidden=!t.loadError
 }
 function clearTabWait(t){t.readyObserver?.disconnect();t.readyObserver=null;if(t.readyTimer)clearTimeout(t.readyTimer);t.readyTimer=null}
 function timeoutTab(t){if(frames.get(t.id)!==t||t.ready)return;t.loadError=true;if(activeId===t.id)showLoading()}
 function armTabTimeout(t){clearTabWait(t);t.loadError=false;t.readyTimer=setTimeout(()=>timeoutTab(t),15000)}
 function watchPageReady(t){
  clearTabWait(t);
  const done=()=>{if(frames.get(t.id)!==t)return;clearTabWait(t);t.ready=true;t.loadError=false;if(activeId===t.id)showLoading()};
  try{
   const app=t.frame.contentDocument?.getElementById("app");
   if(app?.childElementCount>0){done();return}
   if(app){t.readyObserver=new MutationObserver(()=>{if(app.childElementCount>0)done()});t.readyObserver.observe(app,{childList:true})}
  }catch(e){t.loadError=true}
  if(!t.loadError)t.readyTimer=setTimeout(()=>timeoutTab(t),12000);
  if(t.loadError&&activeId===t.id)showLoading()
 }
 const roleLabels={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"};
 function syncProfile(){
  const role=localStorage.getItem("ir-active-role")||"guest";
  for(const [id,t] of frames){
   const panel=t.profilePanel;if(!panel)continue;
   panel.hidden=id!==activeId;
   const badge=panel.querySelector("#profileBadge");if(badge)badge.textContent=roleLabels[role]||roleLabels.guest;
   const select=panel.querySelector("#roleSelect");if(select)select.value=role;
   if(id!==activeId){const menu=panel.querySelector("#profileMenu");if(menu)menu.hidden=true}
  }
 }
 function bridgeProfile(t){
  if(!profileSlot)return;
  try{
   const panel=t.frame.contentDocument?.querySelector(".profile-panel");
   if(!panel)return;
   if(t.profilePanel&&t.profilePanel!==panel)t.profilePanel.remove();
   t.profilePanel=panel;panel.classList.add("tabs-profile-bridge");
   profileSlot.appendChild(panel);syncProfile()
  }catch(e){console.warn("Профиль вкладки недоступен",e)}
 }
 function startTab(tab){
  if(!tab||tab.started)return;
  tab.started=true;
  armTabTimeout(tab);
  tab.frame.src="./index.html?tabContent=1#"+cleanRoute(tab.route)
 }
 function selectTab(id){
  if(!frames.has(id))return;
  const wasActive=activeId===id;
  activeId=id;
  for(const [key,tab] of frames){
   const selected=key===id;
   if(selected!==tab.active){
    tab.active=selected;
    tab.frame.classList.toggle("active",selected);
    tab.frame.setAttribute("aria-hidden",selected?"false":"true")
   }
  }
  startTab(frames.get(id));
  showLoading();syncProfile();
  if(!wasActive){
   renderTabBar();
   // CSS visibility alone does not activate the child keyboard context.
   const active=frames.get(id);
   if(active?.lastEditable?.isConnected&&active.frame.contentDocument?.activeElement===active.lastEditable)
    scheduleEditingFocus(active,active.lastEditable);
   else if(active?.ready&&document.hasFocus())
    active.frame.focus({preventScroll:true});
  }
  save();notify("Вкладка: "+frames.get(id).title)
 }
 function markDirty(id){const t=frames.get(id);if(t&&!t.dirty){t.dirty=true;renderTabBar()}}

 // Electron/Chromium iframe keyboard focus can drift from DOM input focus
 // after a modal, menu, tab switch or native window activation.
 // On the user's actual gesture, restore both browsing-context focus and
 // the intended editable element. Do not synthesize text or alter input values.
 function editableTarget(node){
  const element=node?.nodeType===1?node:node?.parentElement;
  const field=element?.closest?.("input,textarea,[contenteditable]");
  if(!field||field.disabled||field.readOnly)return null;
  if(field.hasAttribute("contenteditable")&&!field.isContentEditable)return null;
  if(field.matches('input[type="hidden"],input[type="checkbox"],input[type="radio"],input[type="button"],input[type="submit"],input[type="reset"],input[type="file"],input[type="range"],input[type="color"],input[type="date"],input[type="time"],input[type="datetime-local"]'))return null;
  return field;
 }
 function restoreEditingFocus(tab,field){
  if(!tab||!field?.isConnected||frames.get(tab.id)!==tab||!tab.active||activeId!==tab.id)return;
  try{
   const child=tab.frame.contentWindow,doc=child?.document;
   if(!doc?.contains(field)||doc.activeElement!==field||tab.recoveringEditorFocus)return;
   tab.recoveringEditorFocus=true;
   // Chromium may show a text caret while the host tab strip retains the
   // native keyboard recipient. Re-activate the iframe, then the field.
   if(document.activeElement!==tab.frame)tab.frame.focus({preventScroll:true});
   child.focus();
   field.focus({preventScroll:true});
  }catch(error){console.warn("IR Project: keyboard focus recovery failed",error)}
  finally{tab.recoveringEditorFocus=false}
 }
 function scheduleEditingFocus(tab,field){
  if(!tab?.active||!field)return;
  const sequence=tab.focusSequence=(tab.focusSequence||0)+1;
  try{
   tab.frame.contentWindow.requestAnimationFrame(()=>{
    if(sequence===tab.focusSequence)restoreEditingFocus(tab,field)
   });
  }catch(_error){}
 }
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
  // A real click inside an editor restores the native iframe keyboard target.
  // This also handles an input that visually has focus but accepts no keys.
  child.document.addEventListener("focusin",event=>{
   const field=editableTarget(event.target);
   if(!field)return;
   tab.lastEditable=field;
   if(document.activeElement!==tab.frame||!child.document.hasFocus())scheduleEditingFocus(tab,field);
  },true);
  child.document.addEventListener("pointerup",event=>{
   const field=editableTarget(event.target);
   if(field){tab.lastEditable=field;if(!document.hasFocus()){try{window.focus()}catch(_error){}}scheduleEditingFocus(tab,field)}
  },true);
  child.document.addEventListener("keydown",e=>shortcuts(e),true);
  // «← Назад» of a section returns to the page the engineer came from in this tab, not to the object's overview
  // (the engineer, 27.10.2026); with nothing before it the button does what it did. Buttons with their own logic
  // (a delivery or a report form with its draft) keep it.
  child.document.addEventListener("click",e=>{
   const b=e.button===0&&e.target?.closest?.("button.back");
   if(b&&HOME_BACK.has(b.id)&&goBack(tab)){e.preventDefault();e.stopPropagation()}
  },true);
  child.addEventListener("contextmenu",e=>pageMenu(tab,e));
  child.document.addEventListener("mousedown",e=>{if(e.button!==2)closeMenu()},true);
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
  frame.className="tabs-pane";frame.title=routeLabel(path);frame.name="ir-tab-"+id;frame.referrerPolicy="same-origin";
  frame.setAttribute("aria-hidden","true");
  const tab={id,frame,route:path,trail:[path],title:routeLabel(path),dirty:false,started:false,active:false,ready:false,readyObserver:null,readyTimer:null,loadError:false,profilePanel:null};
  frames.set(id,tab);order.push(id);
  frame.addEventListener("load",()=>{if(frames.get(id)!==tab||!tab.started)return;attachHandlers(tab);bridgeProfile(tab);watchPageReady(tab)});
  // Inactive/restored tabs keep their address, but do not run the full app until selected.
  stage.append(frame);
  if(activate)selectTab(id);else{renderTabBar();save()}
  const oid=path.match(/^\/objects\/object\/(\d+)/)?.[1];if(oid)resolveName(id,oid);
  return id
 }
 function closeTab(id){
  const tab=frames.get(id);if(!tab)return false;
  if(tab.dirty&&!confirm("Во вкладке есть несохранённые изменения. Закрыть её?"))return false;
  const index=order.indexOf(id),wasActive=activeId===id;
  clearTabWait(tab);tab.profilePanel?.remove();tab.frame.remove();frames.delete(id);order=order.filter(x=>x!==id);
  if(!order.length){activeId="";createTab("/objects");return true}
  if(wasActive)selectTab(order[Math.min(index,order.length-1)]);
  else{renderTabBar();save()}
  return true
 }
 function reloadCurrent(){
  const tab=frames.get(activeId);if(!tab)return false;
  if(tab.dirty&&!confirm("При обновлении вкладки несохранённые изменения пропадут. Продолжить?"))return false;
  try{
   const actual=tab.frame.contentWindow?.location.hash.slice(1);
   if(routeValid(actual))tab.route=actual
  }catch{}
  tab.dirty=false;tab.ready=false;armTabTimeout(tab);
  showLoading();
  tab.frame.src="./index.html?tabContent=1&reload="+Date.now()+"#"+cleanRoute(tab.route);
  renderTabBar();save();notify("Обновляем вкладку: "+tab.title);
  return true
 }
 const updateDialog=document.getElementById("tabsUpdateDialog"),
  updateTitle=document.getElementById("tabsUpdateTitle"),
  updateText=document.getElementById("tabsUpdateText"),
  updateSize=document.getElementById("tabsUpdateSize"),
  updateTransfer=document.getElementById("tabsUpdateTransfer"),
  updateProgress=document.getElementById("tabsUpdateProgress"),
  updateBar=document.getElementById("tabsUpdateProgressBar"),
  updatePercent=document.getElementById("tabsUpdateProgressLabel"),
  updateActions=document.getElementById("tabsUpdateActions"),
  updateClose=document.getElementById("tabsUpdateClose"),
  updateReady=document.getElementById("tabsUpdateReady");
 let updateBusy=false,updateTotalBytes=0,updateTransferredBytes=0,updateLatestVersion="",pendingRestartVersion="",autoUpdating=false;
 const bytesText=raw=>{
  const count=Number(raw);
  if(!Number.isFinite(count)||count<0)return "—";
  if(count===0)return "0 Б";
  if(count<1024)return Math.round(count).toLocaleString("ru-RU")+" Б";
  const unit=count>=1048576?"МБ":"КБ",denom=count>=1048576?1048576:1024;
  return (count/denom).toLocaleString("ru-RU",{maximumFractionDigits:2,minimumFractionDigits:count>=denom?1:0})+" "+unit
 };
 function showUpdateSize(){
  updateSize.hidden=!(updateTotalBytes>0);
  if(!updateSize.hidden)updateSize.textContent="Размер обновления: "+bytesText(updateTotalBytes)
 }
 function showTransfer(){
  updateTransfer.hidden=false;
  updateTransfer.textContent=updateTotalBytes>0?
   "Скачано: "+bytesText(updateTransferredBytes)+" из "+bytesText(updateTotalBytes)+" · Осталось: "+bytesText(Math.max(0,updateTotalBytes-updateTransferredBytes)):
   "Скачано: "+bytesText(updateTransferredBytes)+" · Общий размер уточняется"
 }
 const setUpdate=(title,message)=>{updateTitle.textContent=title;updateText.textContent=message};
 function showUpdateDialog(){
  if(!updateDialog.open)updateDialog.showModal();
 }
 function updateButtons(buttons){
  updateActions.replaceChildren();
  for(const [label,primary,callback] of buttons){
   const button=document.createElement("button");
   button.type="button";button.textContent=label;
   if(primary)button.className="primary";
   button.onclick=callback;updateActions.append(button)
  }
 }
 const closeUpdate=()=>{if(!updateBusy&&updateDialog.open)updateDialog.close()};
 updateClose.onclick=closeUpdate;
 updateDialog.addEventListener("cancel",event=>{if(updateBusy)event.preventDefault()});
 function updateError(error){
  updateBusy=false;updateProgress.hidden=true;updateTransfer.hidden=true;
  setUpdate("Ошибка обновления","Не удалось завершить обновление: "+String(error?.message||error));
  updateButtons([["Закрыть",false,closeUpdate],["Повторить",true,checkAppUpdate]])
 }
 // Check what actually runs in the active Electron iframe. The installed
 // version is a disk manifest and may be newer than a still-open tab.
 const runtimeTokenFromHtml=html=>String(html||"").match(/ir-runtime\.js\?v=([\w.-]+)/)?.[1]||"";
 const runtimeTokenInDoc=doc=>doc?.querySelector?.('script[src*="ir-runtime.js"]')?.getAttribute("src")?.match(/[?&]v=([\w.-]+)/)?.[1]||"";
 const staleSchemeButton=doc=>{
  const button=doc?.getElementById?.("irbStart");
  return Boolean(button&&(/разместить\s+марку/i.test(String(button.textContent||""))||button.dataset?.irLabel!=="add-element"))
 };
 async function detectOldTabCode(){
  const tab=frames.get(activeId);
  if(!tab?.started||!tab.ready)return "";
  try{
   const doc=tab.frame.contentDocument;
   if(!doc)return "";
   // The button is an independent proof that the 3D panel is still rendered
   // by an old code path, even if the script src looks up-to-date.
   if(staleSchemeButton(doc))return "показывает старую версию монтажной схемы";
   const loaded=runtimeTokenInDoc(doc);
   if(!loaded)return "";
   const response=await fetch("./index.html?verifyRuntime="+Date.now(),{cache:"no-store"});
   if(!response.ok)return "";
   const latest=runtimeTokenFromHtml(await response.text());
   return latest&&loaded!==latest?"загрузила устаревший JavaScript (сборка "+loaded+" вместо "+latest+")":""
  }catch(_error){return ""}
 }
 function updateCurrent(version,oldUi=""){
  if(pendingRestartVersion){updateDownloaded(pendingRestartVersion);return}
  updateProgress.hidden=true;updateTransfer.hidden=true;updateSize.hidden=true;
  if(oldUi){
   setUpdate("Код вкладки устарел","IR Project "+version+" установлен, но открытая вкладка "+oldUi+". Обновите вкладку, чтобы увидеть действующие кнопки и изменения.");
   updateButtons([["Позже",false,closeUpdate],
    ["Перезагрузить вкладку",true,()=>{if(reloadCurrent())closeUpdate()}],
    ["Перезапустить программу",false,installUpdate]]);
   return
  }
  setUpdate("Обновление не требуется","Установлена последняя версия IR Project "+version+". Активная вкладка использует актуальные файлы, если она уже была загружена.");
  updateButtons([["Закрыть",true,closeUpdate]])
 }
 function updateAvailable(version,current){
  updateLatestVersion=version||updateLatestVersion;
  updateProgress.hidden=true;updateTransfer.hidden=true;showUpdateSize();
  setUpdate("Доступно обновление","Доступна версия "+version+(current?" (сейчас "+current+")":"")+". Установить обновление IR Project?");
  updateButtons([["Не сейчас",false,closeUpdate],["Да, обновить",true,downloadUpdate]])
 }
 async function downloadUpdate(){
  if(updateBusy)return;
  updateBusy=true;updateTransferredBytes=0;
  setUpdate("Скачивание обновления","Загружаем файлы новой версии IR Project…");
  showUpdateSize();showTransfer();
  updateProgress.hidden=false;updateBar.style.width="0%";updatePercent.textContent="0%";updateButtons([]);
  try{await api.updater.download();updateDownloaded()}
  catch(e){updateError(e)}
  finally{updateBusy=false}
 }
 function updateDownloaded(version){
  pendingRestartVersion=version||pendingRestartVersion||updateLatestVersion;
  updateBusy=false;updateProgress.hidden=true;
  if(updateTotalBytes>0)updateTransferredBytes=updateTotalBytes;
  showUpdateSize();showTransfer();
  setUpdate("Обновление скачано","Версия "+(pendingRestartVersion||"IR Project")+" скачана и применится при следующем запуске IR Project. Открытые вкладки работают на прежней версии до перезапуска.");
  updateButtons([["Позже",false,closeUpdate],["Перезапустить сейчас",true,installUpdate]]);
  showUpdateReady()
 }
 async function installUpdate(){
  if(updateBusy)return;
  if([...frames.values()].some(tab=>tab.dirty)){
   updateText.textContent="Есть вкладки с несохранёнными изменениями. Сохраните отчёты и другие формы перед перезапуском, затем повторите установку.";
   return
  }
  updateBusy=true;setUpdate("Установка обновления","Перезапускаем IR Project…");updateButtons([]);
  try{await api.updater.install()}catch(e){updateError(e)}
 }
 function onUpdaterStatus(info){
  if(!info)return;
  if(info.type==="available"){
   // Updater emits manifest sizes while check() is in progress.
   updateTotalBytes=Math.max(0,Number(info.size)||0);
   updateLatestVersion=info.version||"";
   if(updateDialog.open&&!updateBusy&&!autoUpdating)updateAvailable(info.version,info.installedVersion);
  }else if(info.type==="current"&&updateDialog.open&&!updateBusy&&!autoUpdating)updateCurrent(info.version);
  else if(info.type==="progress"&&updateDialog.open){
   updateTransferredBytes=Math.max(0,Number(info.transferred)||0);
   // Native updater's "total" equals bytes downloaded so far; it is NOT the actual package size.
   const pct=updateTotalBytes>0?
    Math.min(100,Math.round(updateTransferredBytes/updateTotalBytes*100)):
    Math.max(0,Math.min(100,Number(info.percent)||0));
   updateProgress.hidden=false;updateBar.style.width=pct+"%";updatePercent.textContent=pct+"%";
   showUpdateSize();showTransfer();updateText.textContent="Скачиваем файлы обновления…";
  }else if(info.type==="downloaded"){
   pendingRestartVersion=info.version||updateLatestVersion;
   if(updateDialog.open)updateDownloaded(info.version);else showUpdateReady()
  }else if(info.type==="error"&&updateDialog.open)updateError(info.message||"Ошибка обновления")
 }
 api.updater?.onStatus?.(onUpdaterStatus);
 async function checkAppUpdate(){
  if(updateBusy)return;
  if(!api.updater){notify("Проверка обновлений недоступна.");return}
  showUpdateDialog();
  // The updater already reports the downloaded manifest as "installed" before
  // the Electron process restarts. Do not claim that open tabs use that code.
  if(pendingRestartVersion){updateDownloaded(pendingRestartVersion);return}
  if(autoUpdating){
   setUpdate("Скачивание обновления","Новая версия скачивается в фоне. Окно можно закрыть — работа не прервётся, а обновление применится при следующем запуске.");
   showUpdateSize();showTransfer();updateProgress.hidden=false;updateButtons([["Скрыть",true,closeUpdate]]);return
  }
  updateBusy=true;updateTotalBytes=0;updateTransferredBytes=0;updateLatestVersion="";
  updateProgress.hidden=true;updateSize.hidden=true;updateTransfer.hidden=true;
  setUpdate("Проверка обновлений","Проверяем доступную версию IR Project…");updateButtons([]);
  const button=null;
  try{
   const result=await api.updater.check();
   const current=await api.updater.version(),remote=result?.updateInfo?.version;
   if(!remote||String(remote)===String(current)){
    const stale=await detectOldTabCode();
    updateBusy=false;
    updateCurrent(current,stale)
   }else{
    updateBusy=false;
    updateAvailable(remote,current)
   }
  }catch(e){updateError(e)}
  finally{updateBusy=false;if(button)button.disabled=false}
 }
 // New versions come by themselves (the engineer, 28.10.2026: «а нельзя как-то сделать чтобы каждый раз обновление
 // не скачивать из-за таких моментов?»): the main window looks a minute after the start and then every hour and
 // downloads a newer version in the background, with no question; it is applied at the next start, or at once by the
 // small button in the tabs bar. A failed look stays silent and is tried again in an hour.
 function showUpdateReady(){
  if(!updateReady||!pendingRestartVersion)return;
  updateReady.hidden=false;
  updateReady.textContent="Обновление "+pendingRestartVersion+" · перезапустить";
  updateReady.title="Версия "+pendingRestartVersion+" скачана и применится при следующем запуске IR Project. Нажмите, чтобы перезапустить сейчас."
 }
 async function autoUpdate(){
  if(updateBusy||autoUpdating||pendingRestartVersion||!api.updater)return;
  autoUpdating=true;
  try{
   const result=await api.updater.check(),current=await api.updater.version(),remote=result?.updateInfo?.version;
   if(remote&&String(remote)!==String(current)){
    updateLatestVersion=String(remote);
    await api.updater.download();
    pendingRestartVersion=String(remote);showUpdateReady()
   }
  }catch(_error){}
  finally{autoUpdating=false}
 }
 if(updateReady)updateReady.onclick=()=>{showUpdateDialog();updateDownloaded(pendingRestartVersion)};
 if(!isDetached&&api.updater){setTimeout(autoUpdate,60000);setInterval(autoUpdate,3600000)}
 // Pages hosted in iframes delegate all update UI to this single host window.
 window.irTabUpdates={open:checkAppUpdate};
 // Back along the pages of a tab.
 const HOME_BACK=new Set(["back","actedBack","deliveriesBack","financeBack","marksBack","penaltiesBack","objectPhotosBack","reportsBack","scheduleBack","schemeBack","unifiedBack","wtBack"]);
 function goBack(tab){
  const trail=tab?.trail||[];if(trail.length<2)return false;
  try{const child=tab.frame.contentWindow;trail.pop();tab.goingBack=true;child.location.hash=trail[trail.length-1];return true}catch{tab.goingBack=false;return false}
 }
 function openWindow(route){
  const url="./tabs-shell.html?detached="+encodeURIComponent(newId())+"#"+cleanRoute(route);
  const popup=window.open(url,"_blank","width=1180,height=780");
  if(!popup)alert("Не удалось открыть отдельное окно IR Project. Разрешите открывать новые окна.");
  return Boolean(popup)
 }
 // The right-click menu (the engineer, 27.10.2026): on a menu item, an object or a section — open it here, in a new
 // tab, a background tab or a new window; anywhere on a page — back, duplicate, the page in a new window, reload; on a
 // tab — duplicate, a window, reload, close. Fields, the 3D view and selected text keep their own right click.
 const menu=document.createElement("div");menu.className="tabs-ctx";menu.hidden=true;menu.setAttribute("role","menu");document.body.append(menu);
 function closeMenu(){menu.hidden=true}
 function showMenu(x,y,items){
  menu.replaceChildren();
  for(const it of items){
   if(it==="-"){const sep=document.createElement("div");sep.className="tabs-ctx-sep";menu.append(sep);continue}
   const b=document.createElement("button");b.type="button";b.setAttribute("role","menuitem");b.disabled=Boolean(it.off);
   const label=document.createElement("span");label.textContent=it.label;b.append(label);
   if(it.key){const k=document.createElement("small");k.textContent=it.key;b.append(k)}
   b.onclick=()=>{closeMenu();it.run()};menu.append(b)
  }
  menu.hidden=false;menu.style.left="0px";menu.style.top="0px";
  const r=menu.getBoundingClientRect();
  menu.style.left=Math.max(4,Math.min(x,window.innerWidth-r.width-4))+"px";menu.style.top=Math.max(4,Math.min(y,window.innerHeight-r.height-4))+"px"
 }
 document.addEventListener("mousedown",e=>{if(!menu.contains(e.target))closeMenu()},true);
 window.addEventListener("blur",closeMenu);
 // The page an item of a page leads to: a link, an object card, a section of the overview, the object's left menu.
 function routeAt(node,tab){
  const a=node.closest("a[href^='#/objects']");if(a)return cleanRoute(a.getAttribute("href").slice(1));
  const own=node.closest("[data-route]");if(own&&routeValid(own.dataset.route))return own.dataset.route;
  const card=node.closest(".object-card[data-object]");if(card&&/^\d+$/.test(card.dataset.object))return"/objects/object/"+card.dataset.object;
  const oid=tab.route.match(/^\/objects\/object\/(\d+)/)?.[1];
  const sec=node.closest("button.section-link[data-section]:not(:disabled)");if(sec&&oid)return cleanRoute("/objects/object/"+oid+"/"+sec.dataset.section);
  const nav=node.closest(".ir-object-nav button[data-key]:not(:disabled)");
  if(nav&&oid)return nav.dataset.key==="overview"?"/objects/object/"+oid:cleanRoute("/objects/object/"+oid+"/"+nav.dataset.key);
  if(node.closest(".ir-object-all,.ir-object-brand"))return"/objects";
  return""
 }
 function pageMenu(tab,e){
  const node=e.target;
  if(e.defaultPrevented||!node?.closest||node.closest("input,textarea,select,[contenteditable='true'],[contenteditable=''],canvas,dialog[open] *"))return;
  let text="";try{text=String(tab.frame.contentWindow.getSelection()||"").trim()}catch{}
  if(text)return;
  e.preventDefault();
  const route=routeAt(node,tab),r=tab.frame.getBoundingClientRect(),items=[];
  if(route)items.push({label:"Открыть",run:()=>{try{tab.frame.contentWindow.location.hash=route}catch{}}},{label:"Открыть в новой вкладке",run:()=>createTab(route,true)},
   {label:"Открыть в фоновой вкладке",run:()=>createTab(route,false)},{label:"Открыть в новом окне",run:()=>openWindow(route)},"-");
  items.push({label:"Назад",key:"Alt+←",off:tab.trail.length<2,run:()=>goBack(tab)},{label:"Дублировать вкладку",run:()=>createTab(tab.route,true)},
   {label:"Эту страницу в новом окне",run:()=>openWindow(tab.route)},{label:"Обновить страницу",key:"Ctrl+R",run:()=>{selectTab(tab.id);reloadCurrent()}});
  showMenu(r.left+e.clientX,r.top+e.clientY,items)
 }
 function tabMenu(id,x,y){
  const tab=frames.get(id);if(!tab)return;
  const i=order.indexOf(id);
  showMenu(x,y,[{label:"Дублировать вкладку",run:()=>createTab(tab.route,true)},{label:"Открыть в новом окне",run:()=>openWindow(tab.route)},
   {label:"Обновить",key:"Ctrl+R",run:()=>{selectTab(id);reloadCurrent()}},"-",{label:"Закрыть вкладку",key:"Ctrl+W",run:()=>closeTab(id)},
   {label:"Закрыть другие вкладки",off:order.length<2,run:()=>order.filter(x=>x!==id).forEach(closeTab)},
   {label:"Закрыть вкладки справа",off:i<0||i===order.length-1,run:()=>order.slice(i+1).forEach(closeTab)}])
 }
 function shortcuts(event){
  const ctrl=event.ctrlKey||event.metaKey;
  if(event.key==="Escape"&&!menu.hidden){closeMenu();return}
  if(event.altKey&&!ctrl&&!event.shiftKey&&event.key==="ArrowLeft"){const t=frames.get(activeId);if(t&&goBack(t))event.preventDefault();return}
  if(!ctrl||event.altKey)return;
  const k=String(event.key).toLowerCase();
  if(k==="t"){event.preventDefault();createTab("/objects");return}
  if(k==="r"){event.preventDefault();reloadCurrent();return}
  if(k==="w"){event.preventDefault();closeTab(activeId);return}
  if(k==="tab"||k==="pagedown"||k==="pageup"){
   event.preventDefault();if(!order.length)return;
   const back=event.shiftKey||k==="pageup",step=back?-1:1,i=order.indexOf(activeId);
   selectTab(order[(i+step+order.length)%order.length])
  }
 }
 document.addEventListener("keydown",shortcuts,true);
 document.getElementById("tabsAdd").onclick=()=>createTab("/objects");
 document.getElementById("tabsReload").onclick=reloadCurrent;
 if(retryButton)retryButton.onclick=reloadCurrent;
 if(showButton)showButton.onclick=()=>{const t=frames.get(activeId);if(!t)return;clearTabWait(t);t.ready=true;t.loadError=false;showLoading()};
 window.addEventListener("storage",e=>{if(e.key==="ir-active-role"||e.key==="ir-access")syncProfile()});
 document.getElementById("tabsDuplicate").onclick=()=>{const selected=frames.get(activeId);if(selected)createTab(selected.route)};
 document.getElementById("tabsDetach").onclick=()=>{
  const selected=frames.get(activeId);if(!selected)return;
  if(selected.dirty&&!confirm("В новой оконной копии откроется сохранённая версия страницы. Несохранённые данные останутся в текущей вкладке. Продолжить?"))return;
  if(openWindow(selected.route))notify("Страница открыта в отдельном окне. Исходная вкладка сохранена.")
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
 window.addEventListener("focus",()=>{
  const active=frames.get(activeId);
  if(!active)return;
  notify("Вкладка: "+active.title);
  if(active.lastEditable?.isConnected&&active.frame.contentDocument?.activeElement===active.lastEditable)
   scheduleEditingFocus(active,active.lastEditable);
 });
})();
