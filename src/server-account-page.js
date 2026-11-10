"use strict";
/*
 * IR Project: the sign-in by e-mail and password and the administrator's panel (the engineer, 09.11.2026: «в программе
 * создай панель администратора и вход … Дать доступ инженеру, прописываю почту, он получает уведомление на почту»).
 * The work is done by the main process (src/server-account.js, channels ai-settings:server-*), the server checks the
 * rights. Here: the dialogs. The role of the window (window.irAccess) follows the role given by the server:
 * admin — администратор, pto/foreman — инженер, guest — гость.
 */
(()=>{
 const STYLE_ID="ir-account-style";
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const call=(channel,payload)=>window.irProject?.ai?.invoke?irProject.ai.invoke(channel,payload):Promise.reject(Error("Нет связи с программой"));
 const errText=e=>{const m=String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
  return/No handler|не зарегистр/i.test(m)?"Вход заработает после перезапуска программы (обновление уже установлено): закройте IR Project и откройте снова.":m};
 const LOCAL_ROLE={admin:"admin",pto:"engineer",foreman:"engineer",guest:"guest"};
 let state=null;
 const CSS=`.ir-acc{inset:0;margin:auto;box-sizing:border-box;width:min(560px,96vw);max-height:92vh;padding:0;border:0;border-radius:16px;background:#f3f6fa;color:#1d3247;box-shadow:0 30px 90px rgba(8,28,48,.45);font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;overflow:auto}
.ir-acc.wide{width:min(980px,97vw)}
.ir-acc *{box-sizing:border-box}
.ir-acc [hidden]{display:none!important}
.ir-acc::backdrop{background:rgba(6,24,42,.62)}
.ir-acc-head{display:flex;justify-content:space-between;gap:16px;padding:20px 24px;background:linear-gradient(115deg,#0f3553,#17628b);color:#fff}
.ir-acc-head small{display:block;font-size:10.5px;letter-spacing:.12em;font-weight:700;color:#9fd0ee}
.ir-acc-head h2{margin:4px 0;font-size:21px;color:#fff}
.ir-acc-head p{margin:0;font-size:12px;color:#cfe5f3}
.ir-acc-x{flex:none;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
.ir-acc-body{padding:18px 24px;display:grid;gap:12px}
.ir-acc-body label{display:grid;gap:4px;font-size:11.5px;font-weight:600;color:#3c5568}
.ir-acc-body input:not([type=checkbox]):not([type=radio]),.ir-acc-body select{height:36px;border:1px solid #cfdbe5;border-radius:8px;padding:0 10px;font:inherit;background:#fff;color:#1d3247}
.ir-acc-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ir-acc-help{padding:10px 12px;border-radius:9px;background:#eaf3fb;border:1px solid #d3e4f2;color:#2f5876;font-size:11.5px}
.ir-acc-help.warn{background:#fff6e5;border-color:#f0dcb0;color:#7a5410}
.ir-acc-st{min-height:18px;font-size:12px;white-space:pre-line}
.ir-acc-st.ok{color:#1f7a4c}
.ir-acc-st.err{color:#b4321f}
.ir-acc-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:14px 24px;border-top:1px solid #dbe5ee;background:#fff}
.ir-acc-foot .grow{flex:1}
.ir-acc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;border:1px solid #c9d8e4;border-radius:8px;background:#fff;color:#1d4f75;font:inherit;font-weight:650;line-height:1;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,color .15s,box-shadow .15s}
.ir-acc-btn svg{flex:none;width:16px;height:16px}
.ir-acc-btn:not(:disabled):hover{background:#e8f1fa;border-color:#8fb8dc;color:#123f63}
.ir-acc-btn:not(:disabled):active{background:#d7e7f6}
.ir-acc-btn:focus-visible{outline:2px solid #176dc1;outline-offset:2px}
.ir-acc-btn.main{background:#176dc1;border-color:#176dc1;color:#fff}
.ir-acc-btn.main:not(:disabled):hover{background:#0f5aa3;border-color:#0f5aa3;color:#fff;box-shadow:0 4px 12px rgba(23,109,193,.3)}
.ir-acc-btn.main:not(:disabled):active{background:#0b4a87}
.ir-acc-btn.small{height:30px;padding:0 10px;font-size:12px}
.ir-acc-btn.link{border:0;background:none;color:#5b7a92;font-weight:500;text-decoration:underline;padding:0 4px}
.ir-acc-btn:disabled{opacity:.5;cursor:default}
.ir-acc-btn.danger{color:#b4321f;border-color:#efc9c3}
.ir-acc-btn.danger:not(:disabled):hover{background:#fdecea;border-color:#e59a8f;color:#9a2615}
.ir-acc-btn.link:not(:disabled):hover{background:none;color:#176dc1}
.ir-acc-x{transition:background .15s;outline:none}.ir-acc-x:focus-visible{box-shadow:0 0 0 2px #fff}.ir-acc-x:hover{background:rgba(255,255,255,.22)}
.ir-acc-tools{display:flex;gap:8px;align-items:center}.ir-acc-tools .grow{flex:1}
.ir-acc-st:empty{display:none}
.ir-acc-bar-p{height:8px;border-radius:5px;background:#dfe8f0;overflow:hidden}.ir-acc-bar-p i{display:block;height:100%;width:0;background:#176dc1;border-radius:5px;transition:width .4s}
.ir-acc-site[open],.ir-acc-scroll[open]{display:flex;flex-direction:column;overflow:hidden}.ir-acc-site>*,.ir-acc-scroll>*{flex:none}.ir-acc-site .ir-acc-body{flex:1 1 auto;min-height:0;overflow:auto}
.ir-acc-scroll>form{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}.ir-acc-scroll form>.ir-acc-body{flex:1 1 auto;min-height:0;overflow:auto}.ir-acc-scroll form>.ir-acc-foot{flex:none}
.ir-acc-card{display:grid;gap:6px;padding:12px 14px;border:1px solid #dbe5ee;border-radius:10px;background:#fff}
.ir-acc-line{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:19px}.ir-acc-line b{flex:none;min-width:122px}
.ir-acc-line i{flex:none;width:9px;height:9px;margin-top:5px;border-radius:50%;background:#aab8c4}
.ir-acc-line i.ok{background:#27a96a}.ir-acc-line i.err{background:#d0452f}
.ir-acc-line span{color:#5b7a92}
.ir-acc-acts{display:flex;gap:8px;flex-wrap:wrap}
.ir-acc-guide h3{margin:4px 0 2px;font-size:13.5px;color:#0f3553}
.ir-acc-guide ol,.ir-acc-guide ul{margin:0;padding-left:20px;display:grid;gap:4px;font-size:12.5px}
.ir-acc-guide b{color:#1d3247}
.ir-acc-person .grants{display:grid;gap:5px;padding-top:8px;border-top:1px solid #edf2f6}
.ir-acc-g{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;align-items:baseline}
.ir-acc-g b{font-weight:650;color:#1d3247;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ir-acc-g .what{grid-column:2;color:#5b7a92;font-size:11.5px}
.ir-acc-g.none{display:block;color:#7b8f9f}
.ir-acc-tag{grid-row:span 2;align-self:start;min-width:86px;text-align:center;padding:1px 8px;border-radius:20px;background:#eef2f5;color:#5b6b78;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.ir-acc-tag.edit{background:#e3f4ea;color:#1f7a4c}
.ir-acc-on,.ir-acc-off{display:inline-flex;align-items:center;gap:5px;margin-left:8px;font-size:11.5px;font-weight:600}
.ir-acc-on{color:#1f7a4c}.ir-acc-on::before{content:"";width:8px;height:8px;border-radius:50%;background:#22a35a;box-shadow:0 0 0 3px rgba(34,163,90,.18)}
.ir-acc-off{color:#7b8f9f;font-weight:500}.ir-acc-off::before{content:"";width:8px;height:8px;border-radius:50%;background:#b8c6d1}
.ir-acc-count{font-size:12px;color:#3c5568;margin-right:4px}
.ir-acc-people{display:grid;gap:8px}
.ir-acc-person{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:12px 14px;border:1px solid #d9e4ee;border-radius:11px;background:#fff}
.ir-acc-person strong{font-size:13.5px}
.ir-acc-person .who small{display:block;color:#5b7a92}
.ir-acc-person .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.ir-acc-person .grants{grid-column:1/-1;color:#3c5568;font-size:12px}
.ir-acc-role{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:20px;background:#e3eef8;color:#1d4f75;font-size:11px;font-weight:650}
.ir-acc-role.admin{background:#1d4f75;color:#fff}
.ir-acc-objs{display:grid;gap:8px;max-height:46vh;overflow:auto;padding-right:4px}
.ir-acc-obj{border:1px solid #d9e4ee;border-radius:10px;background:#fff;padding:10px 12px}
.ir-acc-obj.on{border-color:#8fb8dc;background:#f7fbff}
.ir-acc-body .ir-acc-check{display:flex;align-items:center;gap:8px;font-weight:500;color:#1d3247;font-size:12.5px}
.ir-acc-check input{flex:none;width:16px;height:16px;margin:0}
.ir-acc-obj-more{display:grid;gap:8px;margin:8px 0 0 24px}
.ir-acc-obj-more .modes{display:flex;gap:16px;flex-wrap:wrap}
.ir-acc-secs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 12px}
.ir-acc-pass{font:600 18px/1.4 Consolas,monospace;letter-spacing:.06em;padding:8px 12px;border-radius:8px;background:#fff;border:1px dashed #9bb8cf;user-select:all}
.ir-acc-menu{position:fixed;z-index:10000;min-width:250px;padding:6px;border-radius:12px;background:#fff;border:1px solid #d6e2ec;box-shadow:0 16px 40px rgba(8,28,48,.25);font:13px/1.4 "Segoe UI",system-ui,Arial,sans-serif;color:#1d3247}
.ir-acc-menu .me{padding:8px 10px 10px;border-bottom:1px solid #e6edf3;margin-bottom:4px}
.ir-acc-menu .me small{display:block;color:#5b7a92}
.ir-acc-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:8px;background:none;font:inherit;color:inherit;cursor:pointer}
.ir-acc-menu button:hover{background:#eef4fa}
.ir-acc-menu button.danger{color:#b4321f}
.ir-acc-note{font-size:12.5px;color:#4d6a80;line-height:1.45}
.ir-acc-bar{position:fixed;z-index:9999;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:10px 12px 10px 16px;border-radius:12px;background:#fff;border:1px solid #c9d8e4;box-shadow:0 12px 32px rgba(8,28,48,.22);font:13px/1.4 "Segoe UI",system-ui,Arial,sans-serif;color:#1d3247}
.ir-acc-tabs{display:flex;gap:6px;flex-wrap:wrap}
.ir-acc-letter textarea{box-sizing:border-box;width:100%;min-height:160px;padding:9px 11px;border:1px solid #c9d8e4;border-radius:8px;background:#fff;color:#1d3247;font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;resize:vertical}
.ir-acc-fields{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px;color:#4d6a80}
.ir-acc-chip{height:26px;padding:0 9px;border:1px solid #c9d8e4;border-radius:13px;background:#fff;color:#1d4f75;font:12px/1 "Segoe UI",system-ui,Arial,sans-serif;cursor:pointer}
.ir-acc-chip:hover{background:#e8f1fa;border-color:#8fb8dc}
.ir-acc-prev{border:1px solid #d9e4ee;border-radius:10px;background:#fff;padding:8px 12px}
.ir-acc-prev summary{cursor:pointer;font-weight:650;color:#1d4f75}
.ir-acc-prev-s{margin-top:8px;font-weight:650}
.ir-acc-prev pre{margin:6px 0 0;white-space:pre-wrap;font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;color:#1d3247}
@media (max-width:640px){.ir-acc-row{grid-template-columns:1fr}.ir-acc-person{grid-template-columns:1fr}.ir-acc-person .acts{justify-content:flex-start}}`;
 const style=doc=>{if(!doc.getElementById(STYLE_ID)){const s=doc.createElement("style");s.id=STYLE_ID;s.textContent=CSS;doc.head.appendChild(s)}};
 const dialog=(doc,cls,html)=>{style(doc);const d=doc.createElement("dialog");d.className="ir-acc "+(cls||"");d.innerHTML=html;doc.body.appendChild(d);d.showModal();
  d.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>d.close());d.addEventListener("close",()=>d.remove(),{once:true});return d};
 const head=(title,text)=>`<div class="ir-acc-head"><div><small>IR PROJECT · СЕРВЕР КОМПАНИИ</small><h2>${esc(title)}</h2>${text?`<p>${esc(text)}</p>`:""}</div><button type="button" class="ir-acc-x" data-close aria-label="Закрыть">✕</button></div>`;

 // The role of the window follows the server; the profile badge shows the name.
 function apply(info){
  state=info||state;
  const u=state?.signedIn?state.user:null;
  if(u&&window.irAccess?.setRole){const want=LOCAL_ROLE[u.role]||"guest";if(irAccess.role()!==want)irAccess.setRole(want)}
  const label=u?(u.name||u.email.split("@")[0])+" · "+u.roleName.replace(/ \(.*\)$/,""):"Войти";
  try{localStorage.setItem("ir-account-label",label)}catch{}
  for(const doc of docs()){
   doc.querySelectorAll("#profileBadge").forEach(b=>{b.textContent=label;b.title=u?u.email+" — "+u.roleName:"Войти в программу: почта и пароль"})
  }
  try{window.dispatchEvent(new CustomEvent("ir-account",{detail:state}))}catch{}
  return state
 }
 const docs=()=>{const out=[document];try{if(window.parent!==window&&window.parent.document)out.push(window.parent.document)}catch{}return out};

 async function info(){try{return apply(await call("ai-settings:server-info"))}catch(e){return null}}

 function login(anchorDoc,{first}={}){
  const doc=anchorDoc||document;
  return new Promise(resolve=>{
   const d=dialog(doc,"",head("Вход в программу","Логин — ваша почта. Пароль пришёл в письме, его можно сменить после входа.")+
    `<form><div class="ir-acc-body"><label>Почта<input name="email" type="email" autocomplete="username" value="${esc(state?.lastEmail||"")}" required></label>
    <label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>
    <div class="ir-acc-st" data-st></div></div>
    <div class="ir-acc-foot"><button type="button" class="ir-acc-btn link" data-old title="Старый вход по паролю роли — без сервера">Вход без сервера</button><span class="grow"></span>
    <button type="button" class="ir-acc-btn" data-close>${first?"Позже":"Отмена"}</button><button type="submit" class="ir-acc-btn main" data-go>Войти</button></div></form>`);
   const f=d.querySelector("form"),st=d.querySelector("[data-st]"),go=d.querySelector("[data-go]");
   let ok=false;
   d.addEventListener("close",()=>resolve(ok),{once:true});
   (f.email.value?f.password:f.email).focus();
   d.querySelector("[data-old]").onclick=()=>{d.close();window.irProfileRoles?.open?.()};
   f.onsubmit=async ev=>{ev.preventDefault();go.disabled=true;st.className="ir-acc-st";st.textContent="Входим…";
    try{apply(await call("ai-settings:server-login",{email:f.email.value,password:f.password.value}));ok=true;d.close();
     if(state.user.role==="admin"&&!first)panel(doc)}
    catch(e){st.className="ir-acc-st err";st.textContent=errText(e);f.password.select()}finally{go.disabled=false}}
  })
 }

 function changePassword(doc){
  const d=dialog(doc,"",head("Сменить пароль",state?.user?.email||"")+
   `<form><div class="ir-acc-body"><label>Старый пароль<input name="old" type="password" autocomplete="current-password" required></label>
   <label>Новый пароль (не короче 8 знаков)<input name="pw" type="password" autocomplete="new-password" minlength="8" required></label>
   <label>Новый пароль ещё раз<input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
   <div class="ir-acc-st" data-st></div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="submit" class="ir-acc-btn main" data-go>Сменить</button></div></form>`);
  const f=d.querySelector("form"),st=d.querySelector("[data-st]"),go=d.querySelector("[data-go]");f.old.focus();
  f.onsubmit=async ev=>{ev.preventDefault();st.className="ir-acc-st err";
   if(f.pw.value!==f.pw2.value){st.textContent="Новые пароли не совпадают";return}
   go.disabled=true;st.className="ir-acc-st";st.textContent="Меняем…";
   try{apply(await call("ai-settings:server-password",{oldPassword:f.old.value,password:f.pw.value}));st.className="ir-acc-st ok";st.textContent="Пароль сменён.";
    f.querySelectorAll("input").forEach(i=>i.value="");setTimeout(()=>d.open&&d.close(),1200)}
   catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}finally{go.disabled=false}}
 }

 // The name of the person signed in (the browser question box does not work in the program's window — an own dialog).
 function rename(doc){
  const d=dialog(doc,"",head("Изменить имя",state?.user?.email||"")+
   `<form><div class="ir-acc-body"><label>Имя (видно в письмах и в истории изменений)<input name="name" value="${esc(state?.user?.name||"")}" maxlength="200" placeholder="Фамилия Имя"></label>
   <div class="ir-acc-st" data-st></div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="submit" class="ir-acc-btn main" data-go>Сохранить</button></div></form>`);
  const f=d.querySelector("form"),st=d.querySelector("[data-st]"),go=d.querySelector("[data-go]");f.name.focus();f.name.select();
  f.onsubmit=async ev=>{ev.preventDefault();go.disabled=true;
   try{apply(await call("ai-settings:server-name",{name:f.name.value}));d.close()}
   catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}finally{go.disabled=false}}
  return new Promise(resolve=>d.addEventListener("close",()=>resolve(),{once:true}))
 }
 const ago=iso=>{const t=Date.parse(iso);if(!t)return"";const m=Math.round((Date.now()-t)/60e3);
  if(m<60)return m+" мин назад";if(m<24*60&&new Date(t).toDateString()===new Date().toDateString())return"сегодня в "+new Date(t).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  return new Date(t).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
 const presence=p=>p.online?`<span class="ir-acc-on" title="${esc(p.onlineOn.join(", "))}">в программе</span>`:
  `<span class="ir-acc-off">${p.lastSeen?"был(а) "+esc(ago(p.lastSeen)):"ещё не входил(а)"}</span>`;

 // ---- the administrator's panel ----
 // What a person sees: a line per object — the name, «изменяет» / «просмотр», the sections short (the engineer, 09.11.2026
 // «каша» about one long line): all — «все разделы», almost all — «все, кроме: …», otherwise the list in the menu's order.
 const grantHtml=(grants,objects,sections)=>{
  if(!grants?.length)return'<div class="ir-acc-g none">Нет доступа ни к одному объекту</div>';
  return grants.map(g=>{const o=objects.find(x=>Number(x.id)===Number(g.objectId));
   const have=sections.filter(x=>g.sections.includes(x.key)),miss=sections.filter(x=>!g.sections.includes(x.key));
   const what=g.whole||!miss.length?"все разделы":miss.length<=3?"все разделы, кроме: "+miss.map(x=>x.name).join(", "):have.map(x=>x.name).join(", ");
   return`<div class="ir-acc-g"><span class="ir-acc-tag ${g.canEdit?"edit":""}">${g.canEdit?"изменяет":"просмотр"}</span><b>${esc(o?o.name:"объект №"+g.objectId)}</b><span class="what">${esc(what)}</span></div>`}).join("")
 };
 async function panel(anchorDoc){
  const doc=anchorDoc||document;
  const st0=await info();
  if(!st0?.signedIn){if(await login(doc))return panel(doc);return}
  if(st0.user.role!=="admin"){alert("Панель администратора — только для администратора.");return}
  const d=dialog(doc,"wide",head("Панель администратора","Кто входит в программу и что видит. Сервер проверяет права сам: человек получает только свои объекты и разделы.")+
   `<div class="ir-acc-body"><div data-mail></div><div class="ir-acc-tools"><button type="button" class="ir-acc-btn main" data-add><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Дать доступ инженеру</span></button><button type="button" class="ir-acc-btn" data-letter title="Текст письма, которое получает человек">Шаблон письма</button><span class="grow"></span><span class="ir-acc-count" data-count></span><button type="button" class="ir-acc-btn" data-reload>Обновить</button></div>
   <div class="ir-acc-st" data-st>Загружаем…</div><div class="ir-acc-people" data-list></div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Закрыть</button></div>`);
  const st=d.querySelector("[data-st]"),list=d.querySelector("[data-list]");
  let objects=[];
  const mailNote=()=>{const box=d.querySelector("[data-mail]");
   box.innerHTML=state.mailReady?"":`<div class="ir-acc-help warn">Почта программы не настроена — письмо с паролем не уйдёт, пароль будет показан здесь, передайте его сами. <button type="button" class="ir-acc-btn small" data-mailset>Настроить почту</button></div>`;
   box.querySelector("[data-mailset]")?.addEventListener("click",async()=>{if(window.irMailSettings?.open)await irMailSettings.open(d);await info();mailNote()})};
  const load=async()=>{
   if(!list.childElementCount){st.className="ir-acc-st";st.textContent="Загружаем…"}
   try{const [people,objs]=await Promise.all([call("ai-settings:server-people"),call("ai-settings:server-objects")]);objects=objs||[];
    const on=people.filter(p=>p.online).length;
    st.textContent="";d.querySelector("[data-count]").textContent="Сейчас в программе: "+on+" из "+people.length;
    list.innerHTML=people.map(p=>`<div class="ir-acc-person" data-id="${esc(p.id)}"><div class="who"><strong>${esc(p.name||p.email)}</strong><span class="ir-acc-role ${p.role==="admin"?"admin":""}">${esc(p.roleName)}</span>${presence(p)}<small>${esc(p.email)}</small></div>
     <div class="acts">${p.id===state.user.id?'<button type="button" class="ir-acc-btn small" data-rename>Изменить имя</button><button type="button" class="ir-acc-btn small" data-pw>Сменить свой пароль</button>':`<button type="button" class="ir-acc-btn small" data-edit>Доступ</button><button type="button" class="ir-acc-btn small" data-reset>Новый пароль</button><button type="button" class="ir-acc-btn small danger" data-del>Убрать</button>`}</div>
     <div class="grants">${p.role==="admin"?'<div class="ir-acc-g"><span class="ir-acc-tag edit">изменяет</span><b>Все объекты</b><span class="what">все разделы</span></div>':grantHtml(p.grants,objects,state.sections)}</div></div>`).join("")||'<div class="ir-acc-help">Пока никого нет.</div>';
    list.querySelectorAll(".ir-acc-person").forEach(row=>{const p=people.find(x=>x.id===row.dataset.id);
     row.querySelector("[data-pw]")?.addEventListener("click",()=>changePassword(d));
     row.querySelector("[data-rename]")?.addEventListener("click",()=>rename(d.ownerDocument).then(load));
     row.querySelector("[data-edit]")?.addEventListener("click",()=>editor(d,{person:p,objects}).then(r=>{if(!r)return;load().then(()=>{if(r.note){st.className="ir-acc-st ok";st.textContent=r.note}})}));
     row.querySelector("[data-reset]")?.addEventListener("click",async()=>{if(!confirm("Выдать "+(p.name||p.email)+" новый пароль? Старый перестанет работать, новый уйдёт письмом на "+p.email+"."))return;
      st.className="ir-acc-st";st.textContent="Выдаём новый пароль…";
      try{const r=await call("ai-settings:server-reset",{id:p.id});st.className="ir-acc-st ok";st.textContent="";if(r.mailed)st.textContent="Новый пароль отправлен на "+p.email+".";else shown(d,p.email,r.password,r.mailError)}
      catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}});
     row.querySelector("[data-del]")?.addEventListener("click",async()=>{if(!confirm("Убрать "+(p.name||p.email)+"? Человек больше не сможет войти в программу."))return;
      try{await call("ai-settings:server-remove",{id:p.id});load()}catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}})})}
   catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}
  };
  d.querySelector("[data-reload]").onclick=load;
  d.querySelector("[data-letter]").onclick=()=>letterEditor(d);
  // after the letter — back in the panel, the result above the list
  d.querySelector("[data-add]").onclick=()=>editor(d,{objects}).then(r=>{if(!r)return;load().then(()=>{if(r.note){st.className="ir-acc-st ok";st.textContent=r.note}})});
  // who is in the program — renewed every minute while the panel is open
  const timer=setInterval(()=>{if(!d.open){clearInterval(timer);return}if(d.ownerDocument.querySelectorAll("dialog.ir-acc[open]").length===1)void load()},60e3);
  mailNote();load()
 }

 // The letter's template (the engineer, 10.11.2026 «письмо инженеру шаблон где поменять? сделай возможность
 // редактирования»): two letters — access given and a new password; fields in braces, preview, test to oneself, default.
 async function letterEditor(parent){
  let data;try{data=await call("ai-settings:server-letter-get")}catch(e){alert(errText(e));return}
  const NAMES={invite:"Доступ в программу",again:"Новый пароль"};
  const d=dialog(parent.ownerDocument,"wide ir-acc-scroll",head("Шаблон письма","Письмо, которое человек получает, когда вы даёте доступ или новый пароль. Слова в фигурных скобках программа заменит сама.")+
   `<form><div class="ir-acc-body ir-acc-letter">
    <div class="ir-acc-tabs">${Object.keys(NAMES).map((k,i)=>`<button type="button" class="ir-acc-btn small${i?"":" main"}" data-kind="${k}">${NAMES[k]}</button>`).join("")}</div>
    <label>Тема<input name="subject" maxlength="300"></label>
    <label>Текст<textarea name="text" rows="10" spellcheck="true"></textarea></label>
    <div class="ir-acc-fields">Вставить: ${data.fields.map(([k,t])=>`<button type="button" class="ir-acc-chip" data-field="${esc(k)}" title="${esc(t)}">{${esc(k)}}</button>`).join("")}</div>
    <div class="ir-acc-note">{пароль} и {почта} обязательны. Пустое поле убирается вместе со своей фразой: без имени — «Здравствуйте!».</div>
    <details class="ir-acc-prev" open><summary>Предпросмотр</summary><div class="ir-acc-prev-s" data-ps></div><pre data-pt></pre></details>
    <div class="ir-acc-st" data-st></div></div>
   <div class="ir-acc-foot"><button type="button" class="ir-acc-btn link" data-def>Сбросить по умолчанию</button><span class="grow"></span><button type="button" class="ir-acc-btn" data-test>Отправить тест себе</button><button type="button" class="ir-acc-btn" data-close>Закрыть</button><button type="submit" class="ir-acc-btn main" data-go>Сохранить</button></div></form>`);
  const f=d.querySelector("form"),st=d.querySelector("[data-st]");let kind="invite";
  const draft={};
  const show=()=>{const t=draft[kind]||data.templates[kind];f.subject.value=t.subject;f.text.value=t.text;
   d.querySelectorAll("[data-kind]").forEach(b=>b.classList.toggle("main",b.dataset.kind===kind));preview()};
  const keep=()=>{draft[kind]={subject:f.subject.value,text:f.text.value}};
  let pt=0;const preview=()=>{clearTimeout(pt);pt=setTimeout(async()=>{try{const p=await call("ai-settings:server-letter-preview",{kind,subject:f.subject.value,text:f.text.value});
   d.querySelector("[data-ps]").textContent="Тема: "+p.subject;d.querySelector("[data-pt]").textContent=p.text}catch{}},250)};
  f.subject.oninput=f.text.oninput=()=>{keep();preview()};
  d.querySelectorAll("[data-kind]").forEach(b=>b.onclick=()=>{keep();kind=b.dataset.kind;st.textContent="";show()});
  d.querySelectorAll("[data-field]").forEach(b=>b.onclick=()=>{const ta=f.text,v="{"+b.dataset.field+"}",a=ta.selectionStart??ta.value.length,z=ta.selectionEnd??a;
   ta.value=ta.value.slice(0,a)+v+ta.value.slice(z);ta.focus();ta.selectionStart=ta.selectionEnd=a+v.length;keep();preview()});
  const ok=t=>{st.className="ir-acc-st ok";st.textContent=t},bad=e=>{st.className="ir-acc-st err";st.textContent=errText(e)};
  f.onsubmit=async ev=>{ev.preventDefault();try{data=await call("ai-settings:server-letter-set",{kind,subject:f.subject.value,text:f.text.value});delete draft[kind];show();ok("Сохранено. Следующие письма «"+NAMES[kind]+"» уйдут с этим текстом.")}catch(e){bad(e)}};
  d.querySelector("[data-def]").onclick=async()=>{if(!confirm("Вернуть стандартный текст письма «"+NAMES[kind]+"»?"))return;
   try{data=await call("ai-settings:server-letter-set",{kind,reset:true});delete draft[kind];show();ok("Вернули стандартный текст.")}catch(e){bad(e)}};
  d.querySelector("[data-test]").onclick=async()=>{st.className="ir-acc-st";st.textContent="Отправляем…";
   try{const r=await call("ai-settings:server-letter-test",{kind,subject:f.subject.value,text:f.text.value});ok("Проверочное письмо отправлено на "+r.to+" (с примером вместо настоящих данных).")}catch(e){bad(e)}};
  show();f.text.focus()
 }
 // The password is shown only when the letter could not go — once, to be passed on by the administrator himself.
 function shown(parent,email,password,why){
  const d=dialog(parent.ownerDocument,"",head("Пароль не отправлен",email)+
   `<div class="ir-acc-body"><div class="ir-acc-help warn">Письмо не ушло${why?": "+esc(why):""}. Передайте пароль сами (лично или по телефону) — после закрытия окна он больше нигде не показывается.</div>
   <div>Логин: <strong>${esc(email)}</strong></div><div class="ir-acc-pass">${esc(password)}</div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-copy>Копировать</button><button type="button" class="ir-acc-btn main" data-close>Готово</button></div>`);
  d.querySelector("[data-copy]").onclick=()=>{try{navigator.clipboard.writeText("Логин: "+email+"\nПароль: "+password)}catch{}};
 }
 function editor(parent,{person,objects}){
  const doc=parent.ownerDocument,sections=state.sections||[],roles=state.roles||{};
  const g0=Object.fromEntries((person?.grants||[]).map(g=>[g.objectId,g]));
  const objHtml=o=>{const g=g0[o.id];const whole=!g||g.whole;
   return`<div class="ir-acc-obj ${g?"on":""}" data-obj="${o.id}"><label class="ir-acc-check"><input type="checkbox" data-on ${g?"checked":""}><span><strong>${esc(o.name)}</strong>${o.status&&o.status!=="В работе"?" · "+esc(o.status):""}</span></label>
    <div class="ir-acc-obj-more" ${g?"":"hidden"}><div class="modes"><label class="ir-acc-check"><input type="radio" name="m${o.id}" value="whole" ${whole?"checked":""}><span>Весь объект</span></label><label class="ir-acc-check"><input type="radio" name="m${o.id}" value="some" ${whole?"":"checked"}><span>Только разделы</span></label>
    <label class="ir-acc-check"><input type="checkbox" data-edit ${g?.canEdit!==false?"checked":""}><span>Может изменять</span></label></div>
    <div class="ir-acc-secs" ${whole?"hidden":""}>${sections.map(s=>`<label class="ir-acc-check"><input type="checkbox" value="${esc(s.key)}" ${g&&!g.whole&&g.sections.includes(s.key)?"checked":""}><span>${esc(s.name)}</span></label>`).join("")}</div></div></div>`};
  return new Promise(resolve=>{
   let changed=null;
   const d=dialog(doc,"wide",head(person?"Доступ: "+(person.name||person.email):"Дать доступ инженеру",person?person.email:"Человек получит письмо: логин — почта, пароль — созданный программой (потом сменит сам).")+
    `<form><div class="ir-acc-body"><div class="ir-acc-row"><label>Почта${person?"":" (логин)"}<input name="email" type="email" value="${esc(person?.email||"")}" ${person?"disabled":"required"} placeholder="name@site.kz"></label>
    <label>Имя<input name="name" value="${esc(person?.name||"")}" placeholder="Фамилия Имя"></label></div>
    <label>Роль<select name="role">${Object.entries(roles).map(([k,v])=>`<option value="${k}" ${(person?.role||"foreman")===k?"selected":""}>${esc(v)}</option>`).join("")}</select></label>
    <div class="ir-acc-help" data-rolehelp></div>
    <div data-objs><div style="font-size:11.5px;font-weight:600;color:#3c5568;margin-bottom:6px">Объекты, которые человек видит</div><div class="ir-acc-objs">${objects.map(objHtml).join("")||'<div class="ir-acc-help">В программе пока нет объектов.</div>'}</div></div>
    <div class="ir-acc-st" data-st></div></div>
    <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="submit" class="ir-acc-btn main" data-go>${person?"Сохранить":"Дать доступ и отправить письмо"}</button></div></form>`);
   d.addEventListener("close",()=>resolve(changed),{once:true});
   const f=d.querySelector("form"),st=d.querySelector("[data-st]"),go=d.querySelector("[data-go]");
   const roleHelp=()=>{const r=f.role.value;d.querySelector("[data-rolehelp]").textContent=
    r==="admin"?"Администратор видит и меняет всё и раздаёт доступ другим.":
    r==="pto"?"Инженер ПТО: видит и меняет отмеченные объекты, может заводить новые объекты (свои видит сразу).":
    r==="foreman"?"Прораб: видит отмеченные объекты и разделы; менять — где отмечено «Может изменять».":
    "Гость: только смотрит отмеченное, ничего не меняет.";
    d.querySelector("[data-objs]").hidden=r==="admin";d.querySelectorAll("[data-edit]").forEach(x=>{x.disabled=r==="guest";if(r==="guest")x.checked=false})};
   f.role.onchange=roleHelp;roleHelp();
   d.querySelectorAll(".ir-acc-obj").forEach(box=>{
    const more=box.querySelector(".ir-acc-obj-more"),secs=box.querySelector(".ir-acc-secs");
    box.querySelector("[data-on]").onchange=e=>{more.hidden=!e.target.checked;box.classList.toggle("on",e.target.checked)};
    box.querySelectorAll('input[type=radio]').forEach(r=>r.onchange=()=>{secs.hidden=box.querySelector('input[type=radio]:checked').value==="whole"})});
   const grants=()=>[...d.querySelectorAll(".ir-acc-obj")].filter(b=>b.querySelector("[data-on]").checked).map(b=>{
    const whole=b.querySelector('input[type=radio]:checked').value==="whole";
    return{objectId:Number(b.dataset.obj),whole,sections:whole?[]:[...b.querySelectorAll(".ir-acc-secs input:checked")].map(x=>x.value),canEdit:b.querySelector("[data-edit]").checked}});
   (person?f.name:f.email).focus();
   f.onsubmit=async ev=>{ev.preventDefault();
    const g=grants(),bad=g.find(x=>!x.whole&&!x.sections.length);
    if(bad){st.className="ir-acc-st err";st.textContent="Отметьте хотя бы один раздел у «"+(objects.find(o=>o.id===bad.objectId)?.name||"объекта")+"» или выберите «Весь объект».";return}
    if(f.role.value!=="admin"&&!g.length&&!confirm("Не отмечен ни один объект — человек войдёт, но ничего не увидит. Продолжить?"))return;
    go.disabled=true;st.className="ir-acc-st";st.textContent=person?"Сохраняем…":"Создаём вход и отправляем письмо…";
    try{
     if(person){await call("ai-settings:server-update",{id:person.id,name:f.name.value,role:f.role.value,grants:g});changed={note:"Сохранено: "+(f.name.value||person.email)+"."};d.close();return}
     const r=await call("ai-settings:server-invite",{email:f.email.value,name:f.name.value,role:f.role.value,grants:g});changed=true;
     if(r.mailed)changed={note:"Готово: "+(r.person.name||r.person.email)+" — письмо с логином и паролем отправлено на "+r.person.email+"."};
     else{changed={note:"Вход для "+r.person.email+" создан, письмо не ушло — пароль показан отдельно."};shown(parent,r.person.email,r.password,r.mailError)}
     d.close()
    }catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}finally{go.disabled=false}}
  })
 }

 // Синхронизация базы через сервер (src/server-sync.js): включить, выключить, обменяться сейчас; администратору —
 // первая отправка всей базы (просьба инженера: «база у меня на ПК — главная»).
 const when=iso=>{if(!iso)return"";const d=new Date(iso);return isNaN(d)?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"})};
 // how much of the sending is done: the count of the first sending, or the largest queue seen on this computer
 // (kept between windows and restarts — «проценты введи», инженер 09.11.2026)
 function sent(s){
  let max=0;try{max=Number(localStorage.getItem("ir-sync-max"))||0}catch{}
  const left=s.progress?Math.max(0,s.progress.total-s.progress.done):Number(s.pending)||0;
  if(!left){try{localStorage.removeItem("ir-sync-max")}catch{}return null}
  const total=Math.max(s.progress?.total||0,max,left);
  if(total!==max)try{localStorage.setItem("ir-sync-max",String(total))}catch{}
  const done=total-left;return{done,total,left,pct:Math.min(99,Math.floor(done*100/total))}
 }
 const num=n=>Number(n).toLocaleString("ru-RU");
 function syncText(s){
  if(!s.enabled)return["","Выключена. Данные этого компьютера никуда не уходят."];
  const p=sent(s);
  const part=p?`${p.pct}% — отправлено ${num(p.done)} из ${num(p.total)}`:"";
  if(s.state==="offline")return["err",`Нет связи с сервером. Изменения ждут на этом компьютере${s.pending?" ("+num(s.pending)+")":""} и уйдут сами.`];
  if(s.state==="error")return["err","Сервер не принял: "+(s.error||"ошибка")+(part?"\n"+part:"")];
  if(s.state==="signed-out")return["err","Войдите в программу — без входа обмен остановлен."];
  if(p)return["",(s.progress?"Отправляется база: ":"Отправляются изменения: ")+part];
  return["ok","Включена. Всё отправлено"+(s.lastAt?", последний обмен "+when(s.lastAt):"")+"."];
 }
 function syncDialog(doc){
  const admin=state?.user?.role==="admin";
  const d=dialog(doc,"",head("Синхронизация","Изменения в объектах уходят на сервер компании и приходят на компьютеры тех, кому вы дали доступ — сами, раз в несколько секунд.")+
   `<div class="ir-acc-body"><div class="ir-acc-st" data-st>Проверяем…</div><div class="ir-acc-bar-p" data-bar hidden><i></i></div><div class="ir-acc-note" data-why hidden></div>
   <div class="ir-acc-note">Не передаются (тяжёлые, делаются на каждом компьютере): анализы ИИ-распознавания, снимки схемы, документы распознавания.</div>
   ${admin?`<div class="ir-acc-note" data-first hidden>Первый раз: отправьте на сервер всю базу этого компьютера — она станет общей. Перед отправкой рядом с базой сохранится копия <b>ir-project-before-sync.db</b>.<br><button type="button" class="ir-acc-btn" data-up hidden style="margin-top:8px">Отправить мою базу на сервер</button></div>`:""}</div>
   <div class="ir-acc-foot"><span class="grow"></span>
   <button type="button" class="ir-acc-btn" data-now>Обменяться сейчас</button><button type="button" class="ir-acc-btn main" data-on></button></div>`);
  const st=d.querySelector("[data-st]"),why=d.querySelector("[data-why]"),on=d.querySelector("[data-on]"),now=d.querySelector("[data-now]"),up=d.querySelector("[data-up]"),first=d.querySelector("[data-first]");
  let s=null;
  const show=v=>{s=v||s;if(!s)return;const [k,t]=syncText(s);st.className="ir-acc-st "+k;st.textContent=t;const p=s.enabled?sent(s):null,bar=d.querySelector("[data-bar]");bar.hidden=!p;if(p)bar.firstChild.style.width=p.pct+"%";
   why.hidden=!s.rejected;why.textContent=s.rejected?`Не принято сервером: ${s.rejected}. ${s.rejectedWhy||""}`:"";
   on.textContent=s.enabled?"Выключить":"Включить";now.disabled=!s.enabled;
   if(up){first.hidden=Boolean(s.uploaded)||Boolean(s.progress);up.hidden=first.hidden}};
  const fail=e=>{st.className="ir-acc-st err";st.textContent=errText(e)};
  const load=async()=>{try{show(await call("ai-settings:server-sync-info"))}catch(e){fail(e)}};
  const t=setInterval(load,2000);d.addEventListener("close",()=>clearInterval(t),{once:true});
  on.onclick=async()=>{on.disabled=true;try{show(await call(s?.enabled?"ai-settings:server-sync-disable":"ai-settings:server-sync-enable"))}catch(e){fail(e)}finally{on.disabled=false}};
  now.onclick=async()=>{now.disabled=true;st.className="ir-acc-st";st.textContent="Обмен…";try{show(await call("ai-settings:server-sync-now"))}catch(e){fail(e)}finally{now.disabled=!s?.enabled}};
  if(up)up.onclick=async()=>{if(!confirm("Отправить всю базу этого компьютера на сервер? Она станет общей для всех, кому вы дали доступ. Копия базы сохранится рядом."))return;
   up.disabled=true;try{show(await call("ai-settings:server-sync-upload"))}catch(e){fail(e)}finally{up.disabled=false}};
  void load();
 }

 // Settings → «Сайт и синхронизация» (просьба инженера 09.11.2026): the site a-ts.kz, the connection, who is signed in,
 // the sync — and the instruction how to start the sync for the administrator and for an engineer.
 const SITE_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
 function siteDialog(doc){
  doc=doc||document;
  const d=dialog(doc,"ir-acc-site",head("Сайт и синхронизация","Сервер компании: вход в программу, общие объекты для всех, кому дан доступ, скачивание программы.")+
   `<div class="ir-acc-body">
    <div class="ir-acc-card">
     <div class="ir-acc-line"><i data-net></i><b>Связь с сервером:</b><span data-nett>проверяем…</span></div>
     <div class="ir-acc-line"><i data-me></i><b>Вход:</b><span data-met></span></div>
     <div class="ir-acc-line"><i data-sy></i><b>Синхронизация:</b><span data-syt></span></div>
     <div class="ir-acc-acts" style="margin-top:6px">
      <button type="button" class="ir-acc-btn" data-site>${SITE_ICON}Открыть сайт компании</button>
      <button type="button" class="ir-acc-btn" data-db hidden>${SITE_ICON}База данных (администратор)</button>
      <button type="button" class="ir-acc-btn main" data-login hidden>Войти</button>
      <button type="button" class="ir-acc-btn" data-sync hidden>Синхронизация…</button>
      <button type="button" class="ir-acc-btn" data-panel hidden>Панель администратора…</button>
     </div>
    </div>
    <div class="ir-acc-card ir-acc-guide">
     <h3>Администратор — один раз</h3>
     <ol>
      <li>Войдите: значок профиля вверху справа → почта и пароль.</li>
      <li>Дайте доступ людям: профиль → <b>Панель администратора</b> → <b>«Дать доступ инженеру»</b> — почта, имя, роль, объекты и разделы («изменяет» или «просмотр»). Логин и пароль уйдут письмом (нужна почта в Настройках → «Почта»).</li>
      <li>Отправьте свою базу на сервер: профиль → <b>Синхронизация</b> → <b>«Отправить мою базу на сервер»</b>. Перед отправкой рядом с базой сохранится копия. Это делается один раз, с главного компьютера.</li>
     </ol>
     <h3>Инженер — на своём компьютере</h3>
     <ol>
      <li>Откройте сайт компании (адрес вида <b>site.kz</b>) → «Войти» → почта и пароль из письма → <b>«Скачать программу»</b>. Установите её.</li>
      <li>Откройте программу и войдите той же почтой и паролем.</li>
      <li>Профиль → <b>Синхронизация</b> → <b>«Включить»</b>. Объекты и разделы, к которым дан доступ, придут сами.</li>
     </ol>
     <h3>Как работает</h3>
     <ul>
      <li>Изменения уходят на сервер сами, через несколько секунд; чужие приходят раз в 15 секунд — сверху появится «Пришли изменения с сервера. <b>Обновить</b>».</li>
      <li>Без интернета работать можно: изменения уйдут, когда связь вернётся.</li>
      <li>Нет прав на раздел — изменение остаётся только на этом компьютере (в окне синхронизации — «Не принято сервером»).</li>
      <li>Не передаются (тяжёлые, делаются на каждом компьютере): анализы ИИ-распознавания, снимки схемы, документы распознавания. Файлы и фотографии пока остаются на своём компьютере.</li>
      <li>Сервер каждую ночь сохраняет копию базы.</li>
     </ul>
     <h3>Если что-то не так</h3>
     <ul>
      <li><b>«Нет связи с сервером»</b> — откройте сайт компании в браузере. Не открывается — проверьте интернет; если адрес сервера недавно менялся, подождите полчаса или выключите роутер на 10 секунд.</li>
      <li><b>Сменить пароль</b> — профиль → «Сменить пароль». Забыли пароль — администратор выдаст новый в панели, он придёт письмом.</li>
      <li><b>Нет нужного объекта</b> — попросите администратора дать доступ к нему.</li>
     </ul>
    </div>
   </div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-check>Проверить связь</button><button type="button" class="ir-acc-btn main" data-close>Закрыть</button></div>`);
  const q=k=>d.querySelector(k),dot=(k,c)=>{q(k).className=c||""};
  const open=async path=>{try{await call("ai-settings:server-open-site",{path})}catch(e){q("[data-nett]").textContent=errText(e)}};
  q("[data-site]").onclick=()=>open("/");q("[data-db]").onclick=()=>open("/_/");
  q("[data-login]").onclick=()=>login(doc).then(load);
  q("[data-sync]").onclick=()=>syncDialog(doc);q("[data-panel]").onclick=()=>panel(doc);
  async function ping(){
   dot("[data-net]");q("[data-nett]").textContent="проверяем…";
   try{const r=await call("ai-settings:server-ping");dot("[data-net]","ok");q("[data-nett]").textContent="есть ("+r.ms+" мс)"}
   catch(e){dot("[data-net]","err");q("[data-nett]").textContent=errText(e)}
  }
  async function load(){
   const s=await info(),u=s?.signedIn?s.user:null;
   dot("[data-me]",u?"ok":"");q("[data-met]").textContent=u?(u.name||u.email)+" · "+u.roleName:"не выполнен — нажмите «Войти»";
   q("[data-login]").hidden=Boolean(u);q("[data-sync]").hidden=!u;q("[data-panel]").hidden=u?.role!=="admin";q("[data-db]").hidden=u?.role!=="admin";
   try{const y=await call("ai-settings:server-sync-info");const [k,t]=syncText(y);dot("[data-sy]",y.enabled?k||"ok":"");q("[data-syt]").textContent=y.enabled?t:"выключена"+(u?" — профиль → «Синхронизация» → «Включить»":"")}
   catch(e){dot("[data-sy]");q("[data-syt]").textContent=errText(e)}
  }
  q("[data-check]").onclick=()=>{void ping();void load()};
  void ping();void load();
  return d;
 }
 // Пришли изменения с сервера — полоса «Обновить» над вкладками (один раз на всё окно программы).
 function watchChanges(){
  const h=host();if(h.__irSyncWatch)return;h.__irSyncWatch=true;
  let seen=0;
  setInterval(async()=>{
   let s;try{s=await call("ai-settings:server-sync-info")}catch{return}
   if(!s?.enabled||!s.changedAt)return;
   if(!seen){seen=s.changedAt;return}
   if(s.changedAt===seen)return;seen=s.changedAt;
   const doc=h.document;style(doc);if(doc.querySelector(".ir-acc-bar"))return;
   const bar=doc.createElement("div");bar.className="ir-acc-bar";
   bar.innerHTML='<span>Пришли изменения с сервера.</span><button type="button" class="ir-acc-btn main" data-r>Обновить</button><button type="button" class="ir-acc-btn" data-x>Позже</button>';
   doc.body.appendChild(bar);
   bar.querySelector("[data-r]").onclick=()=>{try{h.location.reload()}catch{location.reload()}};
   bar.querySelector("[data-x]").onclick=()=>bar.remove();
  },15000);
 }

 // The menu of the profile badge: who is signed in, the panel, the password, sign out.
 function menu(anchor){
  const doc=anchor?.ownerDocument||document;style(doc);
  const open=doc.querySelector(".ir-acc-menu");if(open){(open._close||(()=>open.remove()))();return}
  const u=state?.signedIn?state.user:null;
  if(!u){void login(doc);return}
  const m=doc.createElement("div");m.className="ir-acc-menu";
  m.innerHTML=`<div class="me"><strong>${esc(u.name||u.email)}</strong><small>${esc(u.email)}</small><small>${esc(u.roleName)}</small></div>
   ${u.role==="admin"?'<button type="button" data-panel>Панель администратора</button>':""}<button type="button" data-sync>Синхронизация</button><button type="button" data-name>Изменить имя</button><button type="button" data-pw>Сменить пароль</button><button type="button" class="danger" data-out>Выйти</button>`;
  doc.body.appendChild(m);
  const r=anchor.getBoundingClientRect(),vw=doc.defaultView.innerWidth;
  m.style.top=Math.round(r.bottom+6)+"px";m.style.left=Math.max(8,Math.min(Math.round(r.right-m.offsetWidth),vw-m.offsetWidth-8))+"px";
  // closes on a click anywhere else: in the tab bar, inside a tab (the frame tells it — src/ir-dialog-guard.js), on Esc
  const win=doc.defaultView;
  // the window's blur closes it only when the program itself lost focus: the tab host gives the keyboard back to the field
  // of the open tab (the mark search on the montage scheme) right after the click, which is a blur too (engineer 09.11.2026)
  const blur=()=>setTimeout(()=>{try{if(!doc.hasFocus())close()}catch{close()}},50);
  const close=()=>{m.remove();doc.removeEventListener("pointerdown",out,true);doc.removeEventListener("ir-outside-click",close);doc.removeEventListener("keydown",onKey,true);win?.removeEventListener("blur",blur)};
  const out=e=>{if(!m.contains(e.target)&&!anchor.contains(e.target))close()};
  const onKey=e=>{if(e.key==="Escape")close()};
  m._close=close;
  setTimeout(()=>{doc.addEventListener("pointerdown",out,true);doc.addEventListener("ir-outside-click",close);doc.addEventListener("keydown",onKey,true);win?.addEventListener("blur",blur)});
  m.querySelector("[data-panel]")?.addEventListener("click",()=>{close();panel(doc)});
  m.querySelector("[data-pw]").onclick=()=>{close();changePassword(doc)};
  m.querySelector("[data-sync]").onclick=()=>{close();syncDialog(doc)};
  m.querySelector("[data-name]").onclick=()=>{close();rename(doc)};
  m.querySelector("[data-out]").onclick=async()=>{close();if(!confirm("Выйти из программы на этом компьютере?"))return;
   try{apply(await call("ai-settings:server-logout"))}catch{}if(window.irAccess?.logout)irAccess.logout();apply();location.reload()};
 }

 // At the start: the sign-in is checked with the server (the role may have changed); not signed in — the sign-in once.
 // Every tab is a frame of the tab host (src/tabs-shell.html): the check — once for all of them (the mark on the host),
 // the dialogs — in the host's window, over all the tabs.
 const host=()=>{try{return window.top.document?window.top:window}catch{return window}};
 async function check(){
  const h=host();if(Date.now()-(h.__irAccountAt||0)<25*60e3){await info();return null}
  h.__irAccountAt=Date.now();
  try{return apply(await call("ai-settings:server-refresh"))}catch{h.__irAccountAt=0;return null}
 }
 async function start(){
  const s=await check();
  if(s&&!s.signedIn){let asked=true;try{asked=sessionStorage.getItem("ir-login-asked");sessionStorage.setItem("ir-login-asked","1")}catch{}
   if(!asked)setTimeout(()=>login(host().document,{first:true}),800)}
  setInterval(()=>void check(),30*60e3);
  watchChanges()
 }
 window.irServerAccount={menu,panel,login,changePassword,syncDialog,siteDialog,info,state:()=>state};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void start(),{once:true});else void start();
})();
