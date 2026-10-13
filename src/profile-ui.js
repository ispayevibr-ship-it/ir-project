"use strict";
(()=>{
 const names={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"};
 const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 function sectionFromHash(){const m=location.hash.match(/^#\/objects\/object\/\d+\/([^/]+)$/);return m?m[1]:null}
 function editable(){const r=irAccess.role();if(r==="admin")return true;if(r==="guest")return false;const section=sectionFromHash();return section?irAccess.canEdit(section):false}
 function apply(){document.querySelectorAll("[data-access-lock]").forEach(x=>x.removeAttribute("data-access-lock"));const role=irAccess.role(),can=editable();document.querySelectorAll("#add,#photoButton,#bannerButton,[data-toggle]").forEach(el=>{if(role!=="admin"){el.disabled=true;el.setAttribute("data-access-lock","1")}});if(!can&&sectionFromHash())document.querySelectorAll("button").forEach(el=>{if(!el.classList.contains("back")&&!el.closest(".profile-panel")&&!el.closest(".login-dialog")){el.disabled=true;el.setAttribute("data-access-lock","1")}});const badge=document.getElementById("profileBadge");if(badge)badge.textContent=names[role];const settings=document.getElementById("engineerSettings");if(settings)settings.hidden=role!=="admin";const select=document.getElementById("roleSelect");if(select)select.value=role;}
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
   '<strong>© 2026 ТОО «А-Темир Строй». Все права защищены.</strong></div>'+
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
  p.innerHTML='<button type="button" id="profileBadge" class="profile-badge">'+names[irAccess.role()]+'</button>'+
   '<button type="button" id="programSettingsButton" class="program-settings-button" title="Настройки программы" aria-label="Настройки программы" aria-expanded="false">'+gear+'</button>'+
   '<div id="programSettingsMenu" class="program-settings-menu" hidden><div class="program-settings-menu-title">Настройки программы</div>'+
   '<button type="button" id="companyProfileSettings">Профиль компании</button>'+
   '<button type="button" id="programAboutButton">О программе</button>'+
   '<button type="button" id="programCheckUpdates" style="margin-top:6px">↻ Проверить обновления</button></div>'+
   '<div id="profileMenu" class="profile-menu" hidden><label>Профиль<select id="roleSelect"><option value="guest">Гость</option><option value="admin">Администратор</option><option value="engineer">Инженер ПТО</option></select></label><button id="engineerSettings" hidden>Доступ инженера</button></div>';
  document.body.appendChild(p);
  const badge=p.querySelector("#profileBadge"),menu=p.querySelector("#profileMenu"),
   select=p.querySelector("#roleSelect"),settings=p.querySelector("#engineerSettings"),
   settingsButton=p.querySelector("#programSettingsButton"),settingsMenu=p.querySelector("#programSettingsMenu"),
   companyButton=p.querySelector("#companyProfileSettings"),aboutButton=p.querySelector("#programAboutButton"),
   updateButton=p.querySelector("#programCheckUpdates");
  const closeSettings=()=>{settingsMenu.hidden=true;settingsButton.setAttribute("aria-expanded","false")};
  select.value=irAccess.role();
  badge.onclick=()=>{closeSettings();menu.hidden=!menu.hidden};
  settingsButton.onclick=()=>{const open=settingsMenu.hidden;menu.hidden=true;settingsMenu.hidden=!open;settingsButton.setAttribute("aria-expanded",String(open))};
  select.onchange=async()=>{const requested=select.value;select.value=irAccess.role();menu.hidden=true;await switchRole(requested);select.value=irAccess.role()};
  settings.onclick=()=>permissions();
  aboutButton.onclick=()=>{
   closeSettings();
   void aboutDialog(settingsMenu)
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
