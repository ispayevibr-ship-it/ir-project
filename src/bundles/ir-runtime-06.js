/* #51: src/object-card-actions.js */
"use strict";
(()=>{
  function enhance(){
    document.querySelectorAll(".object-card[data-object]").forEach(card=>{
      if(card.querySelector(".object-card-actions"))return;
      const id=card.dataset.object;
      const info=card.querySelector(".object-info");
      if(!info)return;
      const actions=document.createElement("div");
      actions.className="object-card-actions";
      actions.innerHTML='<button type="button" class="object-card-edit">✎ Редактировать</button><button type="button" class="object-card-delete">Удалить</button>';
      actions.addEventListener("click",e=>e.stopPropagation());
      actions.querySelector(".object-card-edit").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        if(typeof window.openObjectForm==="function")await window.openObjectForm(id);
      };
      actions.querySelector(".object-card-delete").onclick=async e=>{
        e.preventDefault();e.stopPropagation();
        const api=window.irProject?.data?.objects||window.irProject?.objects;
        if(!api)return;
        const object=await api.get(id);
        if(!object)return;
        if(!confirm(`Удалить объект «${object.name}»?\n\nВсе данные этого объекта будут удалены.`))return;
        await api.remove(id);
        card.remove();
        location.reload();
      };
      card.appendChild(actions);
    });
  }
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  enhance();
})();

;

/* #52: src/profile-ui.js */
"use strict";
(()=>{
 const names={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"};
 const sectionNames={reports:"Ежедневные отчеты","work-types":"Виды работ",marks:"Ведомость марок",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
 function sectionFromHash(){const m=location.hash.match(/^#\/objects\/object\/\d+\/([^/]+)$/);return m?m[1]:null}
 function editable(){const r=irAccess.role();if(r==="admin")return true;if(r==="guest")return false;const section=sectionFromHash();return section?irAccess.canEdit(section):false}
 function apply(){document.querySelectorAll("[data-access-lock]").forEach(x=>x.removeAttribute("data-access-lock"));const role=irAccess.role(),can=editable();document.querySelectorAll("#add,#photoButton,#bannerButton,[data-toggle]").forEach(el=>{if(role!=="admin"){el.disabled=true;el.setAttribute("data-access-lock","1")}});if(!can&&sectionFromHash())document.querySelectorAll("button").forEach(el=>{if(!el.classList.contains("back")&&!el.closest(".profile-panel")&&!el.closest(".login-dialog")){el.disabled=true;el.setAttribute("data-access-lock","1")}});const badge=document.getElementById("profileBadge");if(badge)badge.textContent=names[role];const settings=document.getElementById("engineerSettings");if(settings)settings.hidden=role!=="admin";const select=document.getElementById("roleSelect");if(select)select.value=role;}
 function passwordDialog(role){return new Promise(resolve=>{const d=document.createElement("dialog");d.className="login-dialog";d.innerHTML=`<form method="dialog" style="min-width:340px"><h2 style="margin-top:0">Вход: ${names[role]}</h2><p>Введите пароль для продолжения.</p><input id="rolePassword" type="password" autocomplete="current-password" placeholder="Пароль" style="box-sizing:border-box;width:100%;padding:10px 12px;margin:8px 0 6px"><div id="loginError" style="min-height:20px;color:#b42318;font-size:13px"></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" id="loginCancel">Отмена</button><button type="submit" id="loginSubmit">Войти</button></div></form>`;document.body.appendChild(d);const input=d.querySelector("#rolePassword"),err=d.querySelector("#loginError"),cancel=d.querySelector("#loginCancel"),form=d.querySelector("form");let finished=false;const done=v=>{if(finished)return;finished=true;try{d.close()}catch{}d.remove();resolve(v)};cancel.onclick=()=>done(false);d.addEventListener("cancel",e=>{e.preventDefault();done(false)});form.addEventListener("submit",async e=>{e.preventDefault();err.textContent="";let ok=false;try{ok=await irProject.access.login(role,input.value)}catch{err.textContent="Не удалось проверить пароль.";return}if(!ok){err.textContent="Неверный пароль.";input.select();return}done(true)});d.showModal();setTimeout(()=>input.focus(),0)})}
 async function switchRole(next){const current=irAccess.role();if(next===current)return true;if(next==="guest"){irAccess.logout?irAccess.logout():irAccess.setRole("guest");apply();return true}if(next!=="admin"&&next!=="engineer")return false;const ok=await passwordDialog(next);if(!ok){apply();return false}irAccess.setRole(next);apply();return true}
 function panel(){const old=document.querySelector(".profile-panel");if(old)old.remove();const p=document.createElement("div");p.className="profile-panel";p.innerHTML=`<button id="profileBadge" class="profile-badge">${names[irAccess.role()]}</button><div id="profileMenu" class="profile-menu" hidden><label>Профиль<select id="roleSelect"><option value="guest">Гость</option><option value="admin">Администратор</option><option value="engineer">Инженер ПТО</option></select></label><button id="engineerSettings" hidden>Доступ инженера</button></div>`;document.body.appendChild(p);const badge=p.querySelector("#profileBadge"),menu=p.querySelector("#profileMenu"),select=p.querySelector("#roleSelect"),settings=p.querySelector("#engineerSettings");select.value=irAccess.role();badge.onclick=()=>menu.hidden=!menu.hidden;select.onchange=async()=>{const requested=select.value;select.value=irAccess.role();menu.hidden=true;await switchRole(requested);select.value=irAccess.role()};settings.onclick=()=>permissions();apply()}
 function permissions(){if(irAccess.role()!=="admin"){alert("Настройки доступа изменяет только администратор.");return}const current=irAccess.engineer();const d=document.createElement("dialog");d.className="permissions-dialog";d.innerHTML=`<h2>Доступ инженера ПТО</h2><p>Отметьте разделы, которые инженер ПТО может изменять. Остальные доступны только для просмотра.</p><div class="permission-list">${irAccess.KEYS.map(k=>`<label><input type="checkbox" data-perm="${k}" ${current[k]?"checked":""}>${sectionNames[k]}</label>`).join("")}</div><div class="actions"><button id="permClose">Готово</button></div>`;document.body.appendChild(d);d.querySelectorAll("[data-perm]").forEach(x=>x.onchange=()=>irAccess.setEngineer(x.dataset.perm,x.checked));d.querySelector("#permClose").onclick=()=>{d.close();d.remove()};d.showModal()}
 const observer=new MutationObserver(()=>apply());observer.observe(document.getElementById("app"),{childList:true,subtree:true});window.addEventListener("hashchange",()=>setTimeout(apply,0));panel();apply();
})();

;

/* #53: src/company-profile.js */
"use strict";
(()=>{
let profile={name:"",logo:""},profileLoaded=false;
const esc=v=>String(v||"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function load(){try{profile=await irProject.company.get()||profile;if(profile.logo&&irProject.images?.optimize){const old=profile.logo,optimized=await irProject.images.optimize(old,"logo");if(optimized&&optimized!==old){profile=await irProject.company.save({...profile,logo:optimized});if(irProject.images.remove)await irProject.images.remove(old)}}}catch(e){console.warn("Company profile:",e)}finally{profileLoaded=true;await paintBrand(true)}}
async function paintBrand(force=false){if(!profileLoaded)return;const brand=document.querySelector(".brand");if(!brand||(!force&&brand.dataset.companyReady==="1"))return;brand.dataset.companyReady="1";let logo="";if(profile.logo)try{logo=await irProject.images.read(profile.logo)}catch{};if(logo){brand.classList.add("brand-logo-only");brand.innerHTML=`<div class="brand-mark company-logo"><img src="${logo}" alt="${esc(profile.name||"Логотип компании")}"></div>`}else{brand.classList.remove("brand-logo-only");brand.innerHTML=`<div class="brand-mark company-logo">IR</div><div><strong>${esc(profile.name||"IR Project")}</strong><span>Управление строительными объектами</span></div>`}brand.style.cursor="pointer";brand.title="Профиль компании";brand.onclick=open}
async function open(){let d=document.getElementById("companyDialog");if(!d){d=document.createElement("dialog");d.id="companyDialog";d.className="company-dialog";document.body.appendChild(d)}const originalLogo=profile.logo||"";let pendingLogo=originalLogo,pendingOwned="",logoUrl="";if(pendingLogo)try{logoUrl=await irProject.images.read(pendingLogo)}catch{};const discard=async()=>{if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=""};const draw=()=>{d.innerHTML=`<form id="companyForm"><div class="form-heading"><div><h2>Профиль компании</h2><p class="form-subtitle">Фирменные данные для IR Project и документов</p></div><button type="button" class="dialog-x" id="companyClose">×</button></div><div class="company-profile-body"><div class="company-logo-editor" id="companyLogoPreview">${logoUrl?`<img src="${logoUrl}" alt="Логотип">`:`<span>Логотип не выбран</span>`}</div><div class="company-fields"><label>Название компании<input id="companyName" value="${esc(profile.name)}" placeholder="Например, ТОО «А-Темир Строй»" required></label><div><button type="button" class="ghost-btn" id="companyLogoButton">${logoUrl?"Заменить логотип":"Выбрать логотип"}</button><p class="company-hint"><strong>Рекомендуемый размер: 360×120 px.</strong><br>PNG, JPG или WEBP. В IR Project сохраняется только оптимизированная версия логотипа.</p></div></div></div><div class="actions"><button type="button" id="companyCancel">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form>`;const close=async()=>{await discard();d.close()};d.querySelector("#companyClose").onclick=d.querySelector("#companyCancel").onclick=close;d.querySelector("#companyLogoButton").onclick=async()=>{const x=await irProject.company.selectLogo();if(!x)return;if(pendingOwned)try{await irProject.images.remove(pendingOwned)}catch{}pendingOwned=x;pendingLogo=x;logoUrl=await irProject.images.read(x);draw()};d.querySelector("#companyForm").onsubmit=async e=>{e.preventDefault();profile=await irProject.company.save({name:d.querySelector("#companyName").value,logo:pendingLogo});if(originalLogo&&originalLogo!==pendingLogo)try{await irProject.images.remove(originalLogo)}catch{}pendingOwned="";d.close();paintBrand(true)}};draw();d.showModal()}
const root=document.getElementById("app");if(root)new MutationObserver(()=>paintBrand()).observe(root,{childList:true,subtree:true});load();
})();
;

/* #54: src/object-filters.js */
"use strict";
(()=>{
  let lastSignature="";
  async function enhance(){
    const section=document.querySelector(".objects-section"),grid=section?.querySelector(".objects"),head=section?.querySelector(".section-head");
    if(!section||!grid||!head||head.dataset.filtersReady)return;
    head.dataset.filtersReady="1";
    const addButton=head.querySelector("#add");
    if(addButton&&window.irAccess?.role?.()==="guest")addButton.remove();
    const cards=[...grid.querySelectorAll(".object-card")];
    const meta=cards.map(card=>({card,id:card.dataset.object,status:card.querySelector(".status")?.textContent.trim()||"В работе"}));
    const left=head.querySelector("div");
    if(left){left.innerHTML='<div class="object-filter-tabs"><button class="object-filter active" data-filter="all">Все</button><button class="object-filter" data-filter="active">В работе</button><button class="object-filter" data-filter="done">Завершен</button></div><p class="object-count"></p>'}
    const apply=filter=>{
      let shown=0;
      meta.forEach(x=>{const visible=filter==="all"||(filter==="active"&&x.status!=="Завершен")||(filter==="done"&&x.status==="Завершен");x.card.hidden=!visible;if(visible)shown++});
      head.querySelectorAll(".object-filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
      const count=head.querySelector(".object-count");if(count)count.textContent=`Показано объектов: ${shown}`;
    };
    head.querySelectorAll(".object-filter").forEach(b=>b.onclick=()=>apply(b.dataset.filter));
    apply("all");
  }
  setInterval(()=>{const sig=location.hash+":"+(document.querySelector(".objects")?.childElementCount||0)+":"+(window.irAccess?.role?.()||"");if(sig!==lastSignature){lastSignature=sig;enhance().catch(console.error)}},300);
})();

;

/* #55: src/route-indicator.js */
"use strict";
(()=>{
 function routeLabel(){
  const route=(location.hash.slice(1)||"/objects").replace(/^\//,"");
  return route.replace(/\/object\/(\d+)/,"/id$1");
 }
 function update(){let el=document.getElementById("routeIndicator");if(!el){el=document.createElement("div");el.id="routeIndicator";el.className="route-indicator";document.body.appendChild(el)}el.textContent=routeLabel()}
 window.addEventListener("hashchange",update);update();
})();

;

/* #56: src/titlebar.js */
"use strict";
(async()=>{try{const v=await irProject.updater.version(),el=document.getElementById("titlebarVersion");if(el)el.textContent="("+v+")"}catch{}})();
const updateBtn=document.getElementById("titlebarUpdate");if(updateBtn)updateBtn.onclick=async()=>{
 const b=document.getElementById("checkUpdate");if(b){b.click();return}
 const dialog=document.getElementById("updateDialog");if(dialog&&typeof showUpdate==="function"){showUpdate();return}
 updateBtn.disabled=true;
 try{
  const r=await irProject.updater.check(),remote=r&&r.updateInfo&&r.updateInfo.version,current=await irProject.updater.version();
  if(!remote||remote===current){alert("У вас установлена последняя версия IR Project "+current+".");return}
  if(!confirm("Доступна версия "+remote+". Обновить IR Project?"))return;
  await irProject.updater.download();await irProject.updater.install();
 }catch(e){alert("Не удалось проверить обновление: "+(e&&e.message?e.message:e))}
 finally{updateBtn.disabled=false}
};
;

/* #57: src/object-shell.js */
"use strict";
(()=>{
const root=document.getElementById("app");if(!root)return;
const names={reports:"Ежедневные отчёты","extra-works":"Доп. работы","work-types":"Виды работ",marks:"Ведомость марок",deliveries:"Поставки",schedule:"График работ",photos:"Фотографии объекта",scheme:"Монтажная схема","acted-days":"Актированные дни",penalties:"Штрафы",finance:"Финансы"};
const iconPaths={
overview:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
reports:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4"/><path d="M9 11h6M9 15h6M9 19h4"/>',
"extra-works":'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h4m-4 4h8m-5-4 1.5 1.5L17 9"/>',
"work-types":'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="10" cy="18" r="1.5"/>',
marks:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
deliveries:'<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
schedule:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3"/>',
photos:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
scheme:'<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/>',
"acted-days":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="m8 15 2.5 2.5L16 12"/>',
penalties:'<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
finance:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M16 14h2"/>'};
const svg=(key,cls="")=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[key]||'<circle cx="12" cy="12" r="7"/>'}</svg>`;
const simpleSvg=(kind,cls="")=>kind==="back"?`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`:`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>`;
let sidebar=null,currentObjectId="",navSerial=0;
const routeInfo=()=>{const r=location.hash.slice(1)||"/objects";const m=r.match(/^\/objects\/object\/(\d+)(?:\/([^/]+))?/);return m?{id:m[1],key:m[2]||"overview"}:null};
function cleanupLegacyShell(){const shell=root.querySelector(":scope > .ir-object-shell");if(!shell)return;const main=shell.querySelector(":scope > .ir-object-main");const nodes=main?[...main.childNodes]:[];root.replaceChildren(...nodes)}
function makeButton(label,key,disabled,onClick){const b=document.createElement("button");b.type="button";b.dataset.key=key;b.disabled=!!disabled;const i=document.createElement("span");i.className="nav-icon";i.innerHTML=svg(key);const t=document.createElement("span");t.className="nav-label";t.textContent=label;b.append(i,t);if(!disabled)b.onclick=onClick;return b}
function ensureSidebar(){if(sidebar&&document.body.contains(sidebar))return sidebar;sidebar=document.createElement("aside");sidebar.className="ir-object-sidebar-fixed";sidebar.innerHTML=`<div class="ir-object-brand"><span>IR Project</span></div><button class="ir-object-all" type="button"><span class="menu-icon">${simpleSvg("back")}</span><b>Все объекты</b></button><nav class="ir-object-nav"></nav><button class="ir-object-top" type="button"><span class="menu-icon round">${simpleSvg("up")}</span><b>Наверх</b></button>`;sidebar.querySelector(".ir-object-all").onclick=()=>location.hash="/objects";sidebar.querySelector(".ir-object-top").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});document.body.appendChild(sidebar);paintBrand();return sidebar}
async function paintBrand(){const aside=sidebar;if(!aside)return;const host=aside.querySelector(".ir-object-brand");if(!host)return;try{const p=await irProject.company.get()||{};if(aside!==sidebar)return;if(p.logo){const u=await irProject.images.read(p.logo);if(u){const im=document.createElement("img");im.src=u;im.alt=p.name||"Логотип компании";host.replaceChildren(im);return}}const s=document.createElement("span");s.textContent=p.name||"IR Project";host.replaceChildren(s)}catch{if(aside!==sidebar)return;const s=document.createElement("span");s.textContent="IR Project";host.replaceChildren(s)}}
function setActive(key){if(!sidebar)return;sidebar.querySelectorAll(".ir-object-nav button").forEach(b=>b.classList.toggle("active",b.dataset.key===key))}
async function buildNav(info){const aside=ensureSidebar(),nav=aside.querySelector(".ir-object-nav"),token=++navSerial;nav.replaceChildren();nav.append(makeButton("Обзор","overview",false,()=>location.hash=`/objects/object/${info.id}`));let sections=[],schemeVisible=false;try{sections=await irProject.data.sections.get(info.id)||[]}catch{}try{const wt=await irProject.data.forObject(info.id).section("work-types").list();schemeVisible=Array.isArray(wt)&&wt.some(r=>r?.data?.scheme_enabled===true)}catch{}if(token!==navSerial||aside!==sidebar||currentObjectId!==info.id)return;for(const s of sections){const key=s.section_key;if(key==="scheme"&&!schemeVisible)continue;const label=names[key]||s.title||key;nav.append(makeButton(label,key,!s.enabled,()=>location.hash=`/objects/object/${info.id}/${encodeURIComponent(key)}`));if(key==="reports")nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`))}if(!sections.some(s=>s.section_key==="reports"))nav.append(makeButton("Доп. работы","extra-works",false,()=>location.hash=`/objects/object/${info.id}/extra-works`));setActive(info.key)}
function routeClasses(info){document.body.classList.toggle("ir-object-route",!!info);document.body.classList.toggle("ir-object-overview",!!info&&info.key==="overview")}
function leaveObject(){routeClasses(null);currentObjectId="";navSerial++;if(sidebar){sidebar.remove();sidebar=null}}
function apply(){cleanupLegacyShell();const info=routeInfo();if(!info){leaveObject();return}routeClasses(info);ensureSidebar();if(currentObjectId!==info.id){currentObjectId=info.id;buildNav(info)}else setActive(info.key)}
window.addEventListener("hashchange",apply);window.addEventListener("ir-work-types-changed",e=>{const id=String(e?.detail?.objectId||"");if(id&&id===currentObjectId){const info=routeInfo();if(info)buildNav(info)}});apply();
})();

;

/* #58: src/select-ui.js */
"use strict";
window.irSelectUI=(()=>{
 const openState={api:null};
 const isSelect=x=>x&&x.tagName==="SELECT"&&!x.multiple;
 const optionText=o=>String(o?.textContent||"").trim();
 const close=api=>{
  if(!api)return;
  api.menu.hidden=true;
  api.wrap.classList.remove("open");
  api.trigger.setAttribute("aria-expanded","false");
  if(openState.api===api)openState.api=null;
 };
 const closeOpen=()=>close(openState.api);
 const place=api=>{
  if(!api||api.menu.hidden||!api.trigger.isConnected)return;
  const r=api.trigger.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,gap=6,pad=8;
  const width=Math.max(180,r.width),below=vh-r.bottom-gap-pad,above=r.top-gap-pad;
  const want=Math.min(280,Math.max(120,api.menu.scrollHeight||180));
  const up=below<want&&above>below;
  const maxH=Math.max(90,Math.min(280,up?above:below));
  const left=Math.max(pad,Math.min(r.left,vw-width-pad));
  api.menu.style.width=width+"px";
  api.menu.style.maxHeight=maxH+"px";
  api.menu.style.left=left+"px";
  api.menu.style.top=up?Math.max(pad,r.top-gap-maxH)+"px":Math.min(vh-pad,r.bottom+gap)+"px";
  api.menu.classList.toggle("open-up",up);
 };
 const renderMenu=api=>{
  const select=api.select;
  api.menu.innerHTML=[...select.options].map((o,i)=>`<button type="button" data-index="${i}" class="${o.selected?"selected":""}" ${o.disabled?"disabled":""}><span>${optionText(o)}</span>${o.selected?'<i>✓</i>':""}</button>`).join("");
 };
 const refresh=api=>{
  const s=api.select,o=s.options[s.selectedIndex];
  api.trigger.querySelector("span").textContent=optionText(o)||"Выберите";
  api.trigger.disabled=Boolean(s.disabled);
  api.wrap.classList.toggle("disabled",Boolean(s.disabled));
  if(!api.menu.hidden){renderMenu(api);requestAnimationFrame(()=>place(api))}
 };
 const open=api=>{
  if(api.select.disabled)return;
  if(openState.api&&openState.api!==api)close(openState.api);
  renderMenu(api);
  api.menu.hidden=false;
  api.wrap.classList.add("open");
  api.trigger.setAttribute("aria-expanded","true");
  openState.api=api;
  requestAnimationFrame(()=>place(api));
 };
 const enhance=select=>{
  if(!isSelect(select)||select.classList.contains("ir-global-native")||select.classList.contains("ir-pretty-native")||select.dataset.nativeSelect==="1")return;
  select.classList.add("ir-global-native");
  const wrap=document.createElement("div");wrap.className="ir-global-select";
  const trigger=document.createElement("button");trigger.type="button";trigger.className="ir-global-select-trigger";trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");trigger.innerHTML="<span></span><i></i>";
  wrap.appendChild(trigger);select.insertAdjacentElement("afterend",wrap);
  const host=select.closest("dialog")||document.body,menu=document.createElement("div");menu.className="ir-global-select-menu";menu.setAttribute("role","listbox");menu.hidden=true;host.appendChild(menu);
  const api={select,wrap,trigger,menu,refresh:null,close:null};api.refresh=()=>refresh(api);api.close=()=>close(api);select._irSelectUI=api;
  trigger.onclick=e=>{e.preventDefault();e.stopPropagation();menu.hidden?open(api):close(api)};
  trigger.onkeydown=e=>{
   if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){e.preventDefault();if(menu.hidden)open(api);const enabled=[...menu.querySelectorAll("button:not(:disabled)")];if(!enabled.length)return;const active=document.activeElement,at=enabled.indexOf(active),next=e.key==="ArrowUp"?Math.max(0,at<=0?enabled.length-1:at-1):Math.min(enabled.length-1,at<0?0:at+1);enabled[next]?.focus()}
   if(e.key==="Escape"){e.preventDefault();close(api);trigger.focus()}
  };
  menu.onclick=e=>{
   const b=e.target.closest("button[data-index]");if(!b||b.disabled)return;
   e.preventDefault();e.stopPropagation();
   const idx=Number(b.dataset.index),opt=select.options[idx];if(!opt)return;
   select.selectedIndex=idx;
   select.dispatchEvent(new Event("input",{bubbles:true}));
   select.dispatchEvent(new Event("change",{bubbles:true}));
   refresh(api);close(api);trigger.focus();
  };
  menu.onkeydown=e=>{
   const enabled=[...menu.querySelectorAll("button:not(:disabled)")],at=enabled.indexOf(document.activeElement);
   if(e.key==="ArrowDown"){e.preventDefault();enabled[Math.min(enabled.length-1,at+1)]?.focus()}
   if(e.key==="ArrowUp"){e.preventDefault();enabled[Math.max(0,at-1)]?.focus()}
   if(e.key==="Escape"){e.preventDefault();close(api);trigger.focus()}
   if(e.key==="Enter"||e.key===" "){const b=document.activeElement;if(b?.matches?.("button[data-index]")){e.preventDefault();b.click()}}
  };
  select.addEventListener("change",()=>refresh(api));
  select.addEventListener("invalid",()=>{wrap.classList.add("invalid");setTimeout(()=>wrap.classList.remove("invalid"),1400)});
  const mo=new MutationObserver(()=>refresh(api));mo.observe(select,{attributes:true,childList:true,subtree:true,characterData:true});
  refresh(api);
 };
 const scan=root=>{
  if(!root)return;
  if(isSelect(root))enhance(root);
  root.querySelectorAll?.("select").forEach(enhance);
 };
 const refreshAll=root=>(root||document).querySelectorAll?.("select.ir-global-native").forEach(s=>s._irSelectUI?.refresh());
 document.addEventListener("mousedown",e=>{const api=openState.api;if(api&&!api.wrap.contains(e.target)&&!api.menu.contains(e.target))close(api)},true);
 document.addEventListener("change",e=>{if(isSelect(e.target))e.target._irSelectUI?.refresh()},true);
 window.addEventListener("resize",()=>place(openState.api));
 window.addEventListener("scroll",()=>place(openState.api),true);
 const observer=new MutationObserver(muts=>{
  for(const m of muts){
   if(m.type==="childList")m.addedNodes.forEach(n=>n.nodeType===1&&scan(n));
   if(m.type==="attributes"&&m.target.tagName==="DIALOG"&&m.target.hasAttribute("open"))requestAnimationFrame(()=>refreshAll(m.target));
  }
 });
 const start=()=>{scan(document);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]})};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
 return{scan,refreshAll,closeOpen};
})();
;
