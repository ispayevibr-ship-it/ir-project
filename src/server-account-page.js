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
@media (max-width:640px){.ir-acc-row{grid-template-columns:1fr}.ir-acc-person{grid-template-columns:1fr}.ir-acc-person .acts{justify-content:flex-start}}`;
 const style=doc=>{if(!doc.getElementById(STYLE_ID)){const s=doc.createElement("style");s.id=STYLE_ID;s.textContent=CSS;doc.head.appendChild(s)}};
 const dialog=(doc,cls,html)=>{style(doc);const d=doc.createElement("dialog");d.className="ir-acc "+(cls||"");d.innerHTML=html;doc.body.appendChild(d);d.showModal();
  d.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>d.close());d.addEventListener("close",()=>d.remove(),{once:true});return d};
 const head=(title,text)=>`<div class="ir-acc-head"><div><small>IR PROJECT · СЕРВЕР A-TS.KZ</small><h2>${esc(title)}</h2>${text?`<p>${esc(text)}</p>`:""}</div><button type="button" class="ir-acc-x" data-close aria-label="Закрыть">✕</button></div>`;

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

 // ---- the administrator's panel ----
 const grantText=(grants,objects,sections)=>{
  if(!grants?.length)return"Нет доступа ни к одному объекту";
  return grants.map(g=>{const o=objects.find(x=>Number(x.id)===Number(g.objectId));
   const what=g.whole?"весь объект":g.sections.map(k=>sections.find(s=>s.key===k)?.name||k).join(", ");
   return(o?o.name:"объект №"+g.objectId)+" — "+what+(g.canEdit?" · изменяет":" · просмотр")}).join("; ")
 };
 async function panel(anchorDoc){
  const doc=anchorDoc||document;
  const st0=await info();
  if(!st0?.signedIn){if(await login(doc))return panel(doc);return}
  if(st0.user.role!=="admin"){alert("Панель администратора — только для администратора.");return}
  const d=dialog(doc,"wide",head("Панель администратора","Кто входит в программу и что видит. Сервер проверяет права сам: человек получает только свои объекты и разделы.")+
   `<div class="ir-acc-body"><div data-mail></div><div class="ir-acc-tools"><button type="button" class="ir-acc-btn main" data-add><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Дать доступ инженеру</span></button><span class="grow"></span><button type="button" class="ir-acc-btn" data-reload>Обновить</button></div>
   <div class="ir-acc-st" data-st>Загружаем…</div><div class="ir-acc-people" data-list></div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Закрыть</button></div>`);
  const st=d.querySelector("[data-st]"),list=d.querySelector("[data-list]");
  let objects=[];
  const mailNote=()=>{const box=d.querySelector("[data-mail]");
   box.innerHTML=state.mailReady?"":`<div class="ir-acc-help warn">Почта программы не настроена — письмо с паролем не уйдёт, пароль будет показан здесь, передайте его сами. <button type="button" class="ir-acc-btn small" data-mailset>Настроить почту</button></div>`;
   box.querySelector("[data-mailset]")?.addEventListener("click",async()=>{if(window.irMailSettings?.open)await irMailSettings.open(d);await info();mailNote()})};
  const load=async()=>{
   st.className="ir-acc-st";st.textContent="Загружаем…";
   try{const [people,objs]=await Promise.all([call("ai-settings:server-people"),call("ai-settings:server-objects")]);objects=objs||[];
    st.textContent="";
    list.innerHTML=people.map(p=>`<div class="ir-acc-person" data-id="${esc(p.id)}"><div class="who"><strong>${esc(p.name||p.email)}</strong><span class="ir-acc-role ${p.role==="admin"?"admin":""}">${esc(p.roleName)}</span><small>${esc(p.email)}</small></div>
     <div class="acts">${p.id===state.user.id?'<button type="button" class="ir-acc-btn small" data-pw>Сменить свой пароль</button>':`<button type="button" class="ir-acc-btn small" data-edit>Доступ</button><button type="button" class="ir-acc-btn small" data-reset>Новый пароль</button><button type="button" class="ir-acc-btn small danger" data-del>Убрать</button>`}</div>
     <div class="grants">${p.role==="admin"?"Все объекты и разделы":esc(grantText(p.grants,objects,state.sections))}</div></div>`).join("")||'<div class="ir-acc-help">Пока никого нет.</div>';
    list.querySelectorAll(".ir-acc-person").forEach(row=>{const p=people.find(x=>x.id===row.dataset.id);
     row.querySelector("[data-pw]")?.addEventListener("click",()=>changePassword(d));
     row.querySelector("[data-edit]")?.addEventListener("click",()=>editor(d,{person:p,objects}).then(ch=>ch&&load()));
     row.querySelector("[data-reset]")?.addEventListener("click",async()=>{if(!confirm("Выдать "+(p.name||p.email)+" новый пароль? Старый перестанет работать, новый уйдёт письмом на "+p.email+"."))return;
      st.className="ir-acc-st";st.textContent="Выдаём новый пароль…";
      try{const r=await call("ai-settings:server-reset",{id:p.id});st.className="ir-acc-st ok";st.textContent="";if(r.mailed)st.textContent="Новый пароль отправлен на "+p.email+".";else shown(d,p.email,r.password,r.mailError)}
      catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}});
     row.querySelector("[data-del]")?.addEventListener("click",async()=>{if(!confirm("Убрать "+(p.name||p.email)+"? Человек больше не сможет войти в программу."))return;
      try{await call("ai-settings:server-remove",{id:p.id});load()}catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}})})}
   catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}
  };
  d.querySelector("[data-reload]").onclick=load;
  d.querySelector("[data-add]").onclick=()=>editor(d,{objects}).then(ch=>ch&&load());
  mailNote();load()
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
   let changed=false;
   const d=dialog(doc,"wide",head(person?"Доступ: "+(person.name||person.email):"Дать доступ инженеру",person?person.email:"Человек получит письмо: логин — почта, пароль — созданный программой (потом сменит сам).")+
    `<form><div class="ir-acc-body"><div class="ir-acc-row"><label>Почта${person?"":" (логин)"}<input name="email" type="email" value="${esc(person?.email||"")}" ${person?"disabled":"required"} placeholder="engineer@a-ts.kz"></label>
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
     if(person){await call("ai-settings:server-update",{id:person.id,name:f.name.value,role:f.role.value,grants:g});changed=true;d.close();return}
     const r=await call("ai-settings:server-invite",{email:f.email.value,name:f.name.value,role:f.role.value,grants:g});changed=true;
     if(r.mailed){st.className="ir-acc-st ok";st.textContent="Готово: письмо с логином и паролем отправлено на "+r.person.email+".";go.hidden=true;d.querySelector("[data-close]").textContent="Закрыть"}
     else{d.close();shown(parent,r.person.email,r.password,r.mailError)}
    }catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}finally{go.disabled=false}}
  })
 }

 // The menu of the profile badge: who is signed in, the panel, the password, sign out.
 function menu(anchor){
  const doc=anchor?.ownerDocument||document;style(doc);
  doc.querySelectorAll(".ir-acc-menu").forEach(m=>m.remove());
  const u=state?.signedIn?state.user:null;
  if(!u){void login(doc);return}
  const m=doc.createElement("div");m.className="ir-acc-menu";
  m.innerHTML=`<div class="me"><strong>${esc(u.name||u.email)}</strong><small>${esc(u.email)}</small><small>${esc(u.roleName)}</small></div>
   ${u.role==="admin"?'<button type="button" data-panel>Панель администратора</button>':""}<button type="button" data-name>Изменить имя</button><button type="button" data-pw>Сменить пароль</button><button type="button" class="danger" data-out>Выйти</button>`;
  doc.body.appendChild(m);
  const r=anchor.getBoundingClientRect(),vw=doc.defaultView.innerWidth;
  m.style.top=Math.round(r.bottom+6)+"px";m.style.left=Math.max(8,Math.min(Math.round(r.right-m.offsetWidth),vw-m.offsetWidth-8))+"px";
  const close=()=>{m.remove();doc.removeEventListener("pointerdown",out,true)};
  const out=e=>{if(!m.contains(e.target)&&e.target!==anchor)close()};
  setTimeout(()=>doc.addEventListener("pointerdown",out,true));
  m.querySelector("[data-panel]")?.addEventListener("click",()=>{close();panel(doc)});
  m.querySelector("[data-pw]").onclick=()=>{close();changePassword(doc)};
  m.querySelector("[data-name]").onclick=async()=>{close();const n=prompt("Ваше имя (видно в письмах и в истории изменений):",u.name||"");if(n===null)return;
   try{apply(await call("ai-settings:server-name",{name:n}))}catch(e){alert(errText(e))}};
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
  setInterval(()=>void check(),30*60e3)
 }
 window.irServerAccount={menu,panel,login,changePassword,info,state:()=>state};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void start(),{once:true});else void start();
})();
