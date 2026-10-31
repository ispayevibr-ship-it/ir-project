"use strict";
(()=>{
 const names={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"};
 const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 function sectionFromHash(){const m=location.hash.match(/^#\/objects\/object\/\d+\/([^/]+)$/);return m?m[1]:null}
 function editable(){const r=irAccess.role();if(r==="admin")return true;if(r==="guest")return false;const section=sectionFromHash();return section?irAccess.canEdit(section):false}
 function apply(){document.querySelectorAll("[data-access-lock]").forEach(x=>x.removeAttribute("data-access-lock"));const role=irAccess.role(),can=editable();document.querySelectorAll("#add,#photoButton,#bannerButton,[data-toggle]").forEach(el=>{if(role!=="admin"){el.disabled=true;el.setAttribute("data-access-lock","1")}});if(!can&&sectionFromHash())document.querySelectorAll("button").forEach(el=>{if(!el.classList.contains("back")&&!el.hasAttribute("data-view-control")&&!el.closest(".profile-panel")&&!el.closest(".login-dialog")){el.disabled=true;el.setAttribute("data-access-lock","1")}});const badge=document.getElementById("profileBadge");if(badge)badge.textContent=names[role];const settings=document.getElementById("engineerSettings");if(settings)settings.hidden=role!=="admin";const select=document.getElementById("roleSelect");if(select)select.value=role;}
 function passwordDialog(role){return new Promise(resolve=>{const d=document.createElement("dialog");d.className="login-dialog";d.innerHTML=`<form method="dialog" style="min-width:340px"><h2 style="margin-top:0">Вход: ${names[role]}</h2><p>Введите пароль для продолжения.</p><input id="rolePassword" type="password" autocomplete="current-password" placeholder="Пароль" style="box-sizing:border-box;width:100%;padding:10px 12px;margin:8px 0 6px"><div id="loginError" style="min-height:20px;color:#b42318;font-size:13px"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" id="loginCancel">Отмена</button><button type="submit" id="loginSubmit">Войти</button></div></form>`;document.body.appendChild(d);const input=d.querySelector("#rolePassword"),err=d.querySelector("#loginError"),cancel=d.querySelector("#loginCancel"),form=d.querySelector("form");let finished=false;const done=v=>{if(finished)return;finished=true;try{d.close()}catch{}d.remove();resolve(v)};cancel.onclick=()=>done(false);d.addEventListener("cancel",e=>{e.preventDefault();done(false)});form.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";let ok=false;try{ok=await irProject.access.login(role,input.value)}catch{err.textContent="Не удалось проверить пароль.";return}if(!ok){err.textContent="Неверный пароль.";input.select();return}done(true)});d.showModal();setTimeout(()=>input.focus(),0)})}
 async function switchRole(next){const current=irAccess.role();if(next===current)return true;if(next==="guest"){irAccess.logout?irAccess.logout():irAccess.setRole("guest");apply();return true}if(next!=="admin"&&next!=="engineer")return false;const ok=await passwordDialog(next);if(!ok){apply();return false}irAccess.setRole(next);apply();return true}
 // A single read-only "About" dialog for both standalone windows and the
 // tab host: the settings menu is moved into the host document when bridged.
 async function aboutDialog(settingsMenu){
  const doc=settingsMenu.ownerDocument;
  if(doc.querySelector(".ir-about-dialog"))return;
  const dialog=doc.createElement("dialog");
  dialog.className="ir-about-dialog";
  dialog.setAttribute("aria-labelledby","irAboutTitle");
  dialog.innerHTML='<div class="ir-about-head">'+
   '<span class="ir-about-icon" aria-hidden="true">i</span>'+
   '<div><h2 id="irAboutTitle">О программе</h2><p>IR Project</p></div>'+
   '<button type="button" class="ir-about-close" aria-label="Закрыть">×</button></div>'+
   '<div class="ir-about-info">'+
   '<div class="ir-about-line"><span>Авторское право</span>'+
   '<strong>© 2026 IR Project. Все права защищены.</strong></div>'+
   '<div class="ir-about-line"><span>Версия программы</span>'+
   '<strong class="ir-about-version">Определяется…</strong></div></div>'+
   '<div class="ir-about-footer"><button type="button" class="ir-about-done">Закрыть</button></div>';
  doc.body.appendChild(dialog);
  const close=()=>dialog.close();
  dialog.querySelector(".ir-about-close").onclick=close;
  dialog.querySelector(".ir-about-done").onclick=close;
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  dialog.showModal();
  try{
   const version=await irProject.updater.version();
   if(dialog.isConnected)
    dialog.querySelector(".ir-about-version").textContent=String(version||"Не определена")
  }catch(_error){
   if(dialog.isConnected)dialog.querySelector(".ir-about-version").textContent="Не определена"
  }
 }
 function panel(){
  const old=document.querySelector(".profile-panel");if(old)old.remove();
  const p=document.createElement("div");p.className="profile-panel";
  const gear='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2h4l.7 2.4a8 8 0 0 1 2.1 1.2l2.4-.6 2 3.5-1.7 1.8a8 8 0 0 1 0 2.4l1.7 1.8-2 3.5-2.4-.6a8 8 0 0 1-2.1 1.2L14 22h-4l-.7-2.4a8 8 0 0 1-2.1-1.2l-2.4.6-2-3.5 1.7-1.8a8 8 0 0 1 0-2.4L2.8 9.5l2-3.5 2.4.6a8 8 0 0 1 2.1-1.2L10 2Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const menuIcon=shape=>'<span class="program-settings-item-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+shape+'</svg></span>';
  const companyIcon=menuIcon('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M7 7V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3M3 12h18M10 12v2h4v-2"/>');
  const aboutIcon=menuIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>');
  const refreshIcon=menuIcon('<path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 20v-5h-5"/>');
  const backupIcon=menuIcon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v7c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12v7c0 1.66 4.03 3 9 3s9-1.34 9-3v-7"/>');
  // (the connections after the gear: Claude — its spark, GitHub — a branch of the repository)
  const linkIcon=shape=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+shape+'</svg>';
  const claudeMark=linkIcon('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>');
  const gitMark=linkIcon('<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>');
  const aiModelsIcon=menuIcon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h6v6H9zM12 1v3m0 16v3M1 12h3m16 0h3"/>');
  p.innerHTML='<button type="button" id="profileBadge" class="profile-badge">'+names[irAccess.role()]+'</button>'+
   '<button type="button" id="programSettingsButton" class="program-settings-button" title="Настройки программы" aria-label="Настройки программы" aria-expanded="false">'+gear+'</button>'+
   '<span id="programLinks" class="program-links" role="group" aria-label="Подключения">'+
   '<button type="button" class="program-link" data-link="claude" data-state="unknown" title="Claude: проверяем…" aria-label="Claude: проверяем…">'+claudeMark+'<i class="program-link-dot" aria-hidden="true"></i></button>'+
   '<button type="button" class="program-link" data-link="github" data-state="unknown" title="GitHub: проверяем…" aria-label="GitHub: проверяем…">'+gitMark+'<i class="program-link-dot" aria-hidden="true"></i></button></span>'+
   '<div id="programSettingsMenu" class="program-settings-menu" hidden role="group" aria-label="Настройки программы">'+
   '<div class="program-settings-menu-head"><div class="program-settings-menu-title">Настройки</div><small>IR Project</small></div>'+
   '<div class="program-settings-menu-items">'+
   '<button type="button" id="companyProfileSettings" class="program-settings-item">'+companyIcon+'<span class="program-settings-item-text"><strong>Профиль компании</strong><small>Реквизиты и логотип</small></span></button>'+
   '<button type="button" id="programAiModels" class="program-settings-item">'+aiModelsIcon+'<span class="program-settings-item-text"><strong>ИИ-помощник Claude</strong><small>API-ключ и проверка подключения</small></span></button>'+
   '<button type="button" id="programExportDatabase" class="program-settings-item" title="Выбрать папку для сохранения файла базы данных">'+backupIcon+'<span class="program-settings-item-text"><strong>Выгрузить базу данных</strong><small>Выбрать папку и сохранить .db</small></span></button>'+
   '<button type="button" id="programAboutButton" class="program-settings-item">'+aboutIcon+'<span class="program-settings-item-text"><strong>О программе</strong><small>Авторские права и версия</small></span></button>'+
   '<div class="program-settings-divider" role="separator"></div>'+
   '<button type="button" id="programCheckUpdates" class="program-settings-item program-settings-update">'+refreshIcon+'<span class="program-settings-item-text"><strong>Проверить обновления</strong><small>Найти новую версию</small></span></button>'+
   '</div></div>'+
   '<div id="profileMenu" class="profile-menu" hidden><label>Профиль<select id="roleSelect"><option value="guest">Гость</option><option value="admin">Администратор</option><option value="engineer">Инженер ПТО</option></select></label><button id="engineerSettings" hidden>Доступ инженера</button></div>';
  document.body.appendChild(p);
  const badge=p.querySelector("#profileBadge"),menu=p.querySelector("#profileMenu"),
   select=p.querySelector("#roleSelect"),settings=p.querySelector("#engineerSettings"),
   settingsButton=p.querySelector("#programSettingsButton"),settingsMenu=p.querySelector("#programSettingsMenu"),
   companyButton=p.querySelector("#companyProfileSettings"),modelButton=p.querySelector("#programAiModels"),
   aboutButton=p.querySelector("#programAboutButton"),
   backupButton=p.querySelector("#programExportDatabase"),updateButton=p.querySelector("#programCheckUpdates");
  // A moved profile panel lives in the tab host, while its page remains in
  // an iframe. Pointer events do not cross iframe boundaries, so observe both.
  const settingsDismissDocs=new Set();
  const closeSettings=()=>{
   settingsMenu.hidden=true;settingsButton.setAttribute("aria-expanded","false");
   settingsButton.classList.remove("is-open");
   for(const doc of settingsDismissDocs){
    doc.removeEventListener("pointerdown",onSettingsOutside,true);
    doc.removeEventListener("keydown",onSettingsEscape,true)
   }
   settingsDismissDocs.clear()
  };
  const onSettingsOutside=event=>{
   if(settingsMenu.hidden)return;
   if(settingsMenu.contains(event.target)||settingsButton.contains(event.target))return;
   closeSettings()
  };
  const onSettingsEscape=event=>{
   if(event.key==="Escape"&&!settingsMenu.hidden)closeSettings()
  };
  const watchSettingsDismiss=()=>{
   for(const doc of [document,settingsMenu.ownerDocument]){
    if(!doc||settingsDismissDocs.has(doc))continue;
    doc.addEventListener("pointerdown",onSettingsOutside,true);
    doc.addEventListener("keydown",onSettingsEscape,true);
    settingsDismissDocs.add(doc)
   }
  };
  // The tab bar clips absolute-positioned dropdowns. Position a fixed menu
  // against the real gear button using the owning document's viewport.
  const positionSettings=()=>{
   const doc=settingsMenu.ownerDocument;
   if(!settingsButton.closest(".tabs-profile-slot")){
    settingsMenu.style.left="";settingsMenu.style.top="";settingsMenu.style.right="";settingsMenu.style.bottom="";
    return
   }
   const rect=settingsButton.getBoundingClientRect();
   const viewport=doc.defaultView?.innerWidth||doc.documentElement.clientWidth;
   const width=286,gap=8;
   settingsMenu.style.left=Math.max(gap,Math.min(Math.round(rect.right-width),viewport-width-gap))+"px";
   settingsMenu.style.top=Math.round(rect.bottom+8)+"px";
   settingsMenu.style.right="auto";settingsMenu.style.bottom="auto"
  };
  select.value=irAccess.role();
  badge.onclick=()=>{closeSettings();menu.hidden=!menu.hidden};
  settingsButton.onclick=()=>{
   if(!settingsMenu.hidden){closeSettings();return}
   menu.hidden=true;settingsMenu.hidden=false;
   settingsButton.setAttribute("aria-expanded","true");
   settingsButton.classList.add("is-open");
   positionSettings();
   watchSettingsDismiss()
  };
  settingsMenu.ownerDocument.defaultView?.addEventListener("resize",()=>{
   if(!settingsMenu.hidden)positionSettings()
  });
  select.onchange=async()=>{const requested=select.value;select.value=irAccess.role();menu.hidden=true;await switchRole(requested);select.value=irAccess.role()};
  settings.onclick=()=>permissions();
  aboutButton.onclick=()=>{
   closeSettings();
   void aboutDialog(settingsMenu)
  };
  modelButton.onclick=()=>{
   closeSettings();
   const open=window.irAiModelSettings?.open;
   if(typeof open!=="function"){alert("Настройки ИИ недоступны в этой версии IR Project.");return}
   void open(settingsMenu)
  };
  // Use the existing native Save dialog: the user selects both destination
  // folder and .db filename. No database schema or updater code changes.
  let exportingDatabase=false;
  backupButton.onclick=async()=>{
   if(exportingDatabase)return;
   closeSettings();
   if(irAccess.role()!=="admin"){
    alert("Выгрузка базы данных доступна только администратору.");
    return
   }
   if(typeof irProject.backup?.create!=="function"){
    alert("Выгрузка базы данных недоступна. Перезапустите IR Project.");
    return
   }
   exportingDatabase=true;backupButton.disabled=true;
   try{
    const saved=await irProject.backup.create();
    if(saved===true){
     const message="База данных успешно выгружена в выбранную папку.";
     if(typeof irProjectNotice==="function")irProjectNotice(message,"success");
     else alert(message)
    }
    // false means the user cancelled the Save dialog; no message needed.
   }catch(error){
    alert("Не удалось выгрузить базу данных: "+String(error?.message||error))
   }finally{
    exportingDatabase=false;backupButton.disabled=false
   }
  };
  updateButton.onclick=()=>{
   closeSettings();
   try{
    const host=window.parent!==window?window.parent:window;
    if(typeof host.irTabUpdates?.open==="function"){host.irTabUpdates.open();return}
   }catch(error){console.warn("Settings update dialog:",error)}
   if(typeof showUpdate==="function"){showUpdate();return}
   alert("Проверка обновлений недоступна в этом окне IR Project.");
  };
  // Claude and GitHub as this computer sees them, by the icons after the gear (the engineer, 30.10.2026: «показывать
  // подключение клауд и гитхаб статус. просто иконками»): the dot green — connected, red — not, grey — not known yet;
  // the words in the hint. Checked at the start, every minute while the panel is shown and on a click; nothing is sent.
  const links=p.querySelector("#programLinks");
  const mark=(name,state,text)=>{const b=links.querySelector('[data-link="'+name+'"]');if(!b)return;b.dataset.state=state;b.title=text;b.setAttribute("aria-label",text)};
  const when=iso=>{const d=new Date(iso);return Number.isNaN(d.getTime())?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
  let checking=false;
  const checkLinks=async()=>{
   if(checking)return;checking=true;
   const ai=window.irProject?.ai;
   try{
    if(typeof ai?.invoke!=="function"){mark("claude","unknown","Claude: состояние не видно в этой версии");mark("github","unknown","GitHub: состояние не видно в этой версии");return}
    try{
     const s=await ai.invoke("ai-engine:status");
     const on=Boolean(s?.installed)&&s.state!=="missing"&&s.state!=="failed";
     mark("claude",on?"on":"off",on?"Claude: подключено"+(s.model?" · "+s.model:""):"Claude: не подключено"+(s?.reason?" — "+s.reason:""))
    }catch(e){mark("claude","off","Claude: не удалось проверить — "+String(e?.message||e))}
    try{
     const g=await ai.invoke("ai-settings:github-info"),error=g?.lastError||g?.data?.error||"";
     if(!g?.hasToken)mark("github","off","GitHub: не подключено — нет ключа доступа");
     else if(error)mark("github","off","GitHub: ошибка — "+error);
     else mark("github","on","GitHub: подключено"+(g.data?.pulled?.at?" · данные получены "+when(g.data.pulled.at):"")+(g.last?.at?" · отправлено "+when(g.last.at):"")+(g.pending?" · ждёт отправки: "+g.pending:""))
    }catch(e){mark("github","off","GitHub: не удалось проверить — "+String(e?.message||e))}
   }finally{checking=false}
  };
  links.onclick=()=>void checkLinks();
  void checkLinks();
  const linkTimer=setInterval(()=>{if(!p.isConnected){clearInterval(linkTimer);return}if(!p.hidden&&document.visibilityState!=="hidden")void checkLinks()},60000);
  companyButton.onclick=async()=>{
   closeSettings();
   if(irAccess.role()!=="admin"){alert("Профиль компании может изменять только администратор.");return}
   const open=window.irCompanyProfile?.open;
   if(typeof open!=="function"){alert("Редактор профиля компании временно недоступен.");return}
   await open();
  };
  apply()
 }
 function permissions(){if(irAccess.role()!=="admin"){alert("Настройки доступа изменяет только администратор.");return}const current=irAccess.engineer();const d=document.createElement("dialog");d.className="permissions-dialog";d.innerHTML=`<h2>Доступ инженера ПТО</h2><p>Отметьте разделы, которые инженер ПТО может изменять. Остальные доступны только для просмотра.</p><div class="permission-list">${irAccess.KEYS.map(k=>`<label><input type="checkbox" data-perm="${k}" ${current[k]?"checked":""}>${sectionNames[k]}</label>`).join("")}</div><div class="actions"><button id="permClose">Готово</button></div>`;document.body.appendChild(d);d.querySelectorAll("[data-perm]").forEach(x=>x.onchange=()=>irAccess.setEngineer(x.dataset.perm,x.checked));d.querySelector("#permClose").onclick=()=>{d.close();d.remove()};d.showModal()}
 const observer=new MutationObserver(()=>apply());observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(apply,0));panel();apply();
})();
