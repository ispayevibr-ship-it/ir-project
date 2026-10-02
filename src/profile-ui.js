"use strict";
(()=>{
 const names={admin:"Администратор",engineer:"Инженер",guest:"Гость"};
 const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 function sectionFromHash(){const m=location.hash.match(/^#\/objects\/object\/\d+\/([^/]+)$/);return m?m[1]:null}
 function editable(){const r=irAccess.role();if(r==="admin")return true;if(r==="guest")return false;const section=sectionFromHash();return section?irAccess.canEdit(section):false}
 function apply(){
  document.querySelectorAll("[data-access-lock]").forEach(x=>x.removeAttribute("data-access-lock"));
  const role=irAccess.role(),can=editable();
  document.querySelectorAll("#add,#photoButton,#bannerButton,[data-toggle]").forEach(el=>{if(role!=="admin"){el.disabled=true;el.setAttribute("data-access-lock","1")}});
  if(!can&&sectionFromHash())document.querySelectorAll("button").forEach(el=>{if(!el.classList.contains("back")&&!el.closest(".profile-panel")){el.disabled=true;el.setAttribute("data-access-lock","1")}});
  const badge=document.getElementById("profileBadge");if(badge)badge.textContent=names[role];
 }
 function panel(){
  const old=document.querySelector(".profile-panel");if(old)old.remove();
  const p=document.createElement("div");p.className="profile-panel";p.innerHTML=`<button id="profileBadge" class="profile-badge">${names[irAccess.role()]}</button><div id="profileMenu" class="profile-menu" hidden><label>Профиль<select id="roleSelect"><option value="admin">Администратор</option><option value="engineer">Инженер</option><option value="guest">Гость</option></select></label><button id="engineerSettings">Доступ инженера</button></div>`;document.body.appendChild(p);
  roleSelect.value=irAccess.role();profileBadge.onclick=()=>profileMenu.hidden=!profileMenu.hidden;roleSelect.onchange=()=>{irAccess.setRole(roleSelect.value);profileMenu.hidden=true;apply()};engineerSettings.onclick=()=>permissions();
 }
 function permissions(){if(irAccess.role()!=="admin"){alert("Настройки доступа изменяет только администратор.");return}const current=irAccess.engineer();const d=document.createElement("dialog");d.className="permissions-dialog";d.innerHTML=`<h2>Доступ инженера</h2><p>Отметьте разделы, которые инженер может изменять. Остальные доступны только для просмотра.</p><div class="permission-list">${irAccess.KEYS.map(k=>`<label><input type="checkbox" data-perm="${k}" ${current[k]?"checked":""}>${sectionNames[k]}</label>`).join("")}</div><div class="actions"><button id="permClose">Готово</button></div>`;document.body.appendChild(d);d.querySelectorAll("[data-perm]").forEach(x=>x.onchange=()=>irAccess.setEngineer(x.dataset.perm,x.checked));d.querySelector("#permClose").onclick=()=>{d.close();d.remove()};d.showModal()}
 const observer=new MutationObserver(()=>apply());observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(apply,0));panel();apply();
})();
