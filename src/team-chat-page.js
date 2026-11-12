"use strict";
/*
 * IR Project: the window of the shared chat of the company (the engineer, 12.11.2026: «давай сделаем чат общий, в чате
 * возможность писать какому-то определенному сотруднику или всем»; «не хранить сообщения чата больше 3-х месяцев»).
 * The icon of a speech bubble by the profile (src/profile-ui.js) with the count of the unread, the window: on the left
 * «Все сотрудники» and every person, on the right the conversation, below the field, photos and files (a photo is made
 * smaller here before it goes: the long side 1920 px, JPEG). The work is in the main process (src/server-team-chat.js,
 * channels ai-settings:server-chat-*), the server gives each person only what they may see.
 */
(()=>{
 if(window.irTeamChat)return;
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const call=(channel,payload)=>window.irProject?.ai?.invoke?irProject.ai.invoke(channel,payload):Promise.reject(Error("Нет связи с программой"));
 const errText=e=>{const m=String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"");
  return/No handler|не зарегистр/i.test(m)?"Чат заработает после перезапуска программы (обновление уже установлено): закройте IR Project и откройте снова.":m};
 const host=()=>{try{return window.top.document?window.top:window}catch{return window}};
 const FILE_MAX=20*1048576,FILES_MAX=5;
 const ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>';
 const CLIP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';
 const SEND='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
 const ALL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>';
 const TICK='<svg viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6.5 5 10l6.5-8"/></svg>';
 const TICKS='<svg viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6.5 5 10l6.5-8"/><path d="m9 9.2.8.8 6.5-8"/></svg>';
 const TRASH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
 const CSS=`.program-link-count{position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#d93025;color:#fff;font:700 10.5px/17px "Segoe UI",system-ui,sans-serif;text-align:center;box-sizing:border-box;pointer-events:none}
.program-link-count[hidden]{display:none}
.ir-tc{inset:0;margin:auto;box-sizing:border-box;width:min(1040px,97vw);height:min(760px,92vh);padding:0;border:0;border-radius:16px;background:#f3f6fa;color:#1d3247;box-shadow:0 30px 90px rgba(8,28,48,.45);font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;overflow:hidden}
.ir-tc[open]{display:flex;flex-direction:column}
.ir-tc *{box-sizing:border-box}.ir-tc [hidden]{display:none!important}
.ir-tc::backdrop{background:rgba(6,24,42,.62)}
.ir-tc-head{flex:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 20px;background:linear-gradient(115deg,#0f3553,#17628b);color:#fff}
.ir-tc-head small{display:block;font-size:10.5px;letter-spacing:.12em;font-weight:700;color:#9fd0ee}
.ir-tc-head h2{margin:2px 0 0;font-size:19px;color:#fff}
.ir-tc-x{flex:none;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.ir-tc-x:hover{background:rgba(255,255,255,.22)}
.ir-tc-main{flex:1;min-height:0;display:grid;grid-template-columns:250px 1fr}
.ir-tc-side{min-height:0;overflow:auto;border-right:1px solid #dbe5ee;background:#fff;padding:8px}
.ir-tc-side input{width:100%;height:32px;margin-bottom:6px;border:1px solid #cfdbe5;border-radius:8px;padding:0 10px;font:inherit}
.ir-tc-p{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border:0;border-radius:9px;background:none;color:#1d3247;font:inherit;text-align:left;cursor:pointer}
.ir-tc-p:hover{background:#eef5fb}.ir-tc-p.on{background:#dcebf8}
.ir-tc-av{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#e1ecf5;color:#1d4f75;font-weight:700;font-size:12px}
.ir-tc-av svg{width:17px;height:17px}.ir-tc-p.all .ir-tc-av{background:#176dc1;color:#fff}
.ir-tc-pn{flex:1;min-width:0}.ir-tc-pn b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ir-tc-pn small{display:block;color:#6b8294;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ir-tc-n{flex:none;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#d93025;color:#fff;font-size:11px;font-weight:700;line-height:19px;text-align:center}
.ir-tc-conv{min-height:0;display:flex;flex-direction:column}
.ir-tc-ch{flex:none;padding:10px 18px;border-bottom:1px solid #dbe5ee;background:#fff;font-weight:650}.ir-tc-ch small{font-weight:400;color:#6b8294;margin-left:8px}
.ir-tc-list{flex:1;min-height:0;overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:6px}
.ir-tc-day{align-self:center;margin:8px 0 2px;padding:2px 10px;border-radius:10px;background:#e3ebf2;color:#55707f;font-size:11px}
.ir-tc-m{max-width:72%;align-self:flex-start;padding:7px 11px 6px;border-radius:12px 12px 12px 4px;background:#fff;border:1px solid #dfe8ef;white-space:pre-wrap;word-wrap:break-word;position:relative}
.ir-tc-m.mine{align-self:flex-end;border-radius:12px 12px 4px 12px;background:#d9ecfd;border-color:#c3def6}
.ir-tc-m .who{display:block;font-size:11.5px;font-weight:700;color:#176dc1;margin-bottom:1px}
.ir-tc-m .at{display:flex;justify-content:flex-end;align-items:center;gap:5px;font-size:10.5px;color:#7d93a3;margin-top:2px;white-space:nowrap}
.ir-tc-m .st{display:inline-flex;color:#8aa0b0}.ir-tc-m .st svg{height:11px;width:auto}.ir-tc-m .st.read{color:#1f8ff0}
.ir-tc-m .del{display:inline-grid;place-items:center;width:20px;height:20px;margin-right:auto;padding:0;border:0;border-radius:5px;background:none;color:#9aabb8;cursor:pointer;opacity:.45}.ir-tc-m .del svg{width:13px;height:13px}
.ir-tc-m:hover .del{opacity:1}.ir-tc-m .del:hover{color:#b4321f;background:rgba(180,50,31,.08)}
.ir-tc-img{display:block;max-width:280px;max-height:220px;min-width:80px;min-height:60px;margin:4px 0;border-radius:8px;background:#eef3f7;cursor:zoom-in;object-fit:cover}
.ir-tc-file{display:inline-flex;align-items:center;gap:6px;margin:4px 6px 0 0;padding:5px 10px;border:1px solid #c9d8e4;border-radius:8px;background:#fff;color:#1d4f75;font:inherit;font-size:12px;cursor:pointer}.ir-tc-file:hover{background:#e8f1fa}
.ir-tc-empty{margin:auto;color:#6b8294;text-align:center}
.ir-tc-foot{flex:none;padding:10px 14px;border-top:1px solid #dbe5ee;background:#fff}
.ir-tc-att{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.ir-tc-att span{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:#eef5fb;font-size:12px}.ir-tc-att button{border:0;background:none;cursor:pointer;color:#7d93a3}
.ir-tc-row{display:flex;gap:8px;align-items:flex-end}
.ir-tc-row textarea{flex:1;min-height:38px;max-height:160px;resize:none;border:1px solid #cfdbe5;border-radius:10px;padding:8px 11px;font:inherit;color:#1d3247}
.ir-tc-btn{flex:none;display:grid;place-items:center;width:38px;height:38px;border:1px solid #c9d8e4;border-radius:10px;background:#fff;color:#1d4f75;cursor:pointer}.ir-tc-btn svg{width:18px;height:18px}.ir-tc-btn:hover{background:#e8f1fa}
.ir-tc-btn.main{background:#176dc1;border-color:#176dc1;color:#fff}.ir-tc-btn.main:hover{background:#0f5aa3}.ir-tc-btn:disabled{opacity:.5;cursor:default}
.ir-tc-note{margin-top:5px;font-size:11px;color:#7d93a3}.ir-tc-note.err{color:#b4321f}
.ir-tc-zoom{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(6,20,34,.85);cursor:zoom-out}.ir-tc-zoom img{max-width:94vw;max-height:94vh;border-radius:6px}
.ir-tc-drop{outline:3px dashed #176dc1;outline-offset:-8px}`;
 const style=doc=>{if(doc.getElementById("ir-team-chat-style"))return;const s=doc.createElement("style");s.id="ir-team-chat-style";s.textContent=CSS;doc.head.appendChild(s)};
 style(document);

 const initials=n=>String(n||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase()||"?";
 const time=a=>{const d=new Date(a);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})};
 const day=a=>{const d=new Date(a);if(Number.isNaN(d.getTime()))return"";const t=new Date();const y=new Date(t);y.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString())return"Сегодня";if(d.toDateString()===y.toDateString())return"Вчера";
  return d.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:d.getFullYear()===t.getFullYear()?undefined:"numeric"})};
 const plain=n=>String(n).replace(/_[a-z0-9]{10}(\.[^.]+)?$/i,"$1");
 const isImg=n=>/\.(jpe?g|png|webp|gif|bmp)$/i.test(n);
 const convOf=(m,uid)=>!m.to?"all":m.author===uid?m.to:m.author;

 // A photo smaller before it goes (the engineer about the place on the server): the long side 1920 px, JPEG 0.82;
 // if it does not get smaller — as it is.
 async function shrink(file){
  if(!/^image\/(jpeg|png|webp|bmp)$/i.test(file.type))return{name:file.name,type:file.type||"application/octet-stream",data:new Uint8Array(await file.arrayBuffer())};
  try{
   const bmp=await createImageBitmap(file),k=Math.min(1,1920/Math.max(bmp.width,bmp.height));
   const c=document.createElement("canvas");c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);
   const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);
   const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.82));
   if(blob&&blob.size<file.size)return{name:file.name.replace(/\.[^.]+$/,"")+".jpg",type:"image/jpeg",data:new Uint8Array(await blob.arrayBuffer())}
  }catch{}
  return{name:file.name,type:file.type,data:new Uint8Array(await file.arrayBuffer())}
 }

 const urls=new Map();
 async function imageUrl(id,name){
  const k=id+"/"+name;if(urls.has(k))return urls.get(k);
  const p=call("ai-settings:server-chat-file",{id,name}).then(b=>{const ext=(name.match(/\.(\w+)$/)||[])[1]||"jpeg";
   return URL.createObjectURL(new Blob([b],{type:"image/"+(ext.toLowerCase()==="jpg"?"jpeg":ext.toLowerCase())}))});
  urls.set(k,p);p.catch(()=>urls.delete(k));return p
 }

 // one window of the chat for all the tabs: it lives in the tab host's document
 // A window left from a tab that was closed or reloaded (its code is gone: the window cannot be closed or updated, and
 // the icon then did nothing — the engineer, 12.11.2026: «нажимаю на иконку чата и ничего») is taken away and opened anew.
 const TOKEN=Math.random();try{window.__irTeamChatToken=TOKEN}catch{}
 const shown=()=>{try{const h=host(),d=h.__irTeamChatDialog;if(!d)return null;
  let alive=false;try{alive=!!d._owner&&d._owner.__irTeamChatToken===d._token}catch{}
  if(d.isConnected&&d.open&&alive)return d;
  try{if(d.open)d.close()}catch{}try{d.remove()}catch{}h.__irTeamChatDialog=null;return null}catch{return null}};
 function open(doc,{conv}={}){
  doc=doc||host().document;
  const openDialog=shown();if(openDialog){if(conv)openDialog._pick?.(conv);return openDialog}
  style(doc);
  const d=doc.createElement("dialog");d.className="ir-tc";d._owner=window;d._token=TOKEN;
  d.innerHTML=`<div class="ir-tc-head"><div><small>IR PROJECT · СЕРВЕР КОМПАНИИ</small><h2 data-head>Чат компании</h2></div><button type="button" class="ir-tc-x" data-close aria-label="Закрыть">✕</button></div>
   <div class="ir-tc-main"><div class="ir-tc-side"><input type="search" data-find placeholder="Поиск сотрудника"><div data-people></div></div>
   <div class="ir-tc-conv"><div class="ir-tc-ch" data-title></div><div class="ir-tc-list" data-list><div class="ir-tc-empty">Загрузка…</div></div>
   <div class="ir-tc-foot"><div class="ir-tc-att" data-att hidden></div><div class="ir-tc-row">
    <button type="button" class="ir-tc-btn" data-clip title="Фото или файл (до 20 МБ, до 5 в сообщении)">${CLIP}</button>
    <textarea data-text rows="1" placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"></textarea>
    <button type="button" class="ir-tc-btn main" data-send title="Отправить">${SEND}</button>
    <input type="file" data-file multiple hidden></div>
    <div class="ir-tc-note" data-note>Сообщения хранятся 3 месяца. Личное сообщение видят только двое.</div></div></div></div>`;
  doc.body.appendChild(d);d.showModal();try{host().__irTeamChatDialog=d}catch{}
  d.addEventListener("close",()=>{try{d.remove()}catch{}try{if(host().__irTeamChatDialog===d)host().__irTeamChatDialog=null}catch{}},{once:true});
  const $=s=>d.querySelector(s);
  // «Чат — <название компании>» (просьба инженера 12.11.2026), название — из профиля компании
  const head=async()=>{try{const n=String((await irProject.company.get())?.name||"").trim();d.querySelector("[data-head]").textContent=n?`Чат — ${n}`:"Чат компании"}catch{}};
  void head();const onCo=()=>void head();
  try{doc.defaultView.addEventListener("ir-company-profile-updated",onCo);d.addEventListener("close",()=>doc.defaultView.removeEventListener("ir-company-profile-updated",onCo))}catch{}
  const list=$("[data-list]"),peopleBox=$("[data-people]"),title=$("[data-title]"),text=$("[data-text]"),note=$("[data-note]"),att=$("[data-att]"),fileIn=$("[data-file]"),send=$("[data-send]"),find=$("[data-find]");
  let v=null,cur=conv||"all",files=[],timer=0,drawn="";
  const say=(t,err)=>{note.textContent=t;note.className="ir-tc-note"+(err?" err":"")};
  const base="Сообщения хранятся 3 месяца. Личное сообщение видят только двое.";
  const nameOf=id=>id==="all"?"Все сотрудники":(v?.people||[]).find(p=>p.id===id)?.name||"Сотрудник";
  const last=k=>{let m=null;for(const x of v.messages)if(convOf(x,v.me.id)===k)m=x;return m};
  function drawPeople(){
   if(!v?.signedIn)return;
   const f=find.value.trim().toLowerCase();
   const keys=["all",...v.people.map(p=>p.id)].filter(k=>k==="all"||!f||nameOf(k).toLowerCase().includes(f));
   const order=keys.slice(1).sort((a,b)=>{const x=last(a)?.at||"",y=last(b)?.at||"";return x===y?nameOf(a).localeCompare(nameOf(b),"ru"):x<y?1:-1});
   peopleBox.innerHTML=[...(keys[0]==="all"?["all"]:[]),...order].map(k=>{const m=last(k),n=v.unread[k]||0;
    const sub=m?(m.author===v.me.id?"Вы: ":k==="all"?(m.name||"")+": ":"")+(m.text||(m.files.length?"📎 файл":"")):k==="all"?"Сообщение увидят все":"";
    return`<button type="button" class="ir-tc-p${k==="all"?" all":""}${k===cur?" on":""}" data-k="${esc(k)}"><span class="ir-tc-av">${k==="all"?ALL:esc(initials(nameOf(k)))}</span>
     <span class="ir-tc-pn"><b>${esc(nameOf(k))}</b>${sub?`<small>${esc(sub.slice(0,80))}</small>`:""}</span>${n?`<span class="ir-tc-n">${n>99?"99+":n}</span>`:""}</button>`}).join("")||'<div class="ir-tc-empty">Никого не найдено</div>'
  }
  // ✓ — доставлено (сообщение на сервере), ✓✓ синие — прочитано: в личной переписке — получателем, в общей — хотя бы
  // одним сотрудником (в подсказке — кто прочитал)
  function status(m){
   const reads=v.reads||[];
   if(m.to){const r=reads.some(x=>x.user===m.to&&x.conv===v.me.id&&x.at>=m.at);
    return r?`<span class="st read" title="Прочитано">${TICKS}</span>`:`<span class="st" title="Доставлено">${TICK}</span>`}
   const who=reads.filter(x=>x.conv==="all"&&x.user!==v.me.id&&x.at>=m.at).map(x=>nameOf(x.user));
   return who.length?`<span class="st read" title="Прочитали: ${esc(who.join(", "))}">${TICKS}</span>`:`<span class="st" title="Доставлено, ещё никто не прочитал">${TICK}</span>`
  }
  function drawList(force){
   if(!v?.signedIn)return;
   const msgs=v.messages.filter(m=>convOf(m,v.me.id)===cur);
   const sig=cur+"|"+msgs.length+"|"+(msgs[msgs.length-1]?.id||"")+"|"+(v.reads||[]).map(x=>x.user+x.conv+x.at).join(",");
   title.innerHTML=esc(nameOf(cur))+`<small>${cur==="all"?"сообщения видят все сотрудники":"личная переписка"}</small>`;
   text.placeholder=cur==="all"?"Сообщение всем… (Enter — отправить, Shift+Enter — новая строка)":"Сообщение для «"+nameOf(cur)+"»… (Enter — отправить)";
   if(sig===drawn&&!force)return;drawn=sig;
   const atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<60||force;
   let lastDay="";
   list.innerHTML=msgs.length?msgs.map(m=>{const dd=day(m.at),mine=m.author===v.me.id;
    const head=dd!==lastDay?`<div class="ir-tc-day">${esc(dd)}</div>`:"";lastDay=dd;
    const fl=m.files.map(n=>isImg(n)?`<img class="ir-tc-img" data-img="${esc(m.id)}" data-name="${esc(n)}" alt="${esc(plain(n))}">`:`<button type="button" class="ir-tc-file" data-fid="${esc(m.id)}" data-name="${esc(n)}" title="Открыть (с Ctrl — сохранить)">📎 ${esc(plain(n))}</button>`).join("");
    const del=(mine||v.admin)?`<button type="button" class="del" data-del="${esc(m.id)}" title="Удалить сообщение у всех" aria-label="Удалить">${TRASH}</button>`:"";
    return head+`<div class="ir-tc-m${mine?" mine":""}">${!mine&&cur==="all"?`<span class="who">${esc(m.name||"сотрудник")}</span>`:""}${esc(m.text)}${fl?`<div>${fl}</div>`:""}<span class="at">${del}${esc(time(m.at))}${mine?status(m):""}</span></div>`}).join("")
    :`<div class="ir-tc-empty">${cur==="all"?"Здесь пока пусто. Напишите первое сообщение всем.":"Переписки с этим сотрудником пока нет."}</div>`;
   for(const img of list.querySelectorAll("img[data-img]"))imageUrl(img.dataset.img,img.dataset.name).then(u=>{img.src=u}).catch(()=>{img.alt="Фото не загрузилось"});
   if(atEnd)list.scrollTop=list.scrollHeight;
   if(v.unread[cur]){void call("ai-settings:server-chat-seen",{conv:cur}).then(()=>{if(v)v.unread[cur]=0;drawPeople();badges()}).catch(()=>{})}
  }
  async function load(force){
   try{
    const r=await call("ai-settings:server-chat-view",force||!v?{}:{rev:v.rev});
    if(r?.same){if(r.error)say("Нет связи с сервером: "+r.error,true);else if(note.classList.contains("err"))say(base);return}
    if(!r?.signedIn){list.innerHTML='<div class="ir-tc-empty">Войдите в программу (значок профиля → «Войти»), чтобы писать в чат компании.</div>';peopleBox.innerHTML="";send.disabled=true;return}
    v=r;send.disabled=false;if(r.error)say("Нет связи с сервером: "+r.error,true);else if(note.classList.contains("err"))say(base);
    if(cur!=="all"&&!v.people.some(p=>p.id===cur))cur="all";
    drawPeople();drawList()
   }catch(e){say(errText(e),true);if(!v)list.innerHTML=`<div class="ir-tc-empty">${esc(errText(e))}</div>`}
  }
  const pick=k=>{cur=k;drawn="";drawPeople();drawList(true);text.focus()};d._pick=pick;
  peopleBox.onclick=e=>{const b=e.target.closest("[data-k]");if(b)pick(b.dataset.k)};
  find.oninput=drawPeople;
  const drawAtt=()=>{att.hidden=!files.length;att.innerHTML=files.map((f,i)=>`<span>📎 ${esc(f.name)}<button type="button" data-rm="${i}" title="Убрать">✕</button></span>`).join("")};
  att.onclick=e=>{const b=e.target.closest("[data-rm]");if(b){files.splice(Number(b.dataset.rm),1);drawAtt()}};
  const add=list=>{for(const f of list){if(files.length>=FILES_MAX){say(`В одном сообщении — до ${FILES_MAX} файлов`,true);break}
   if(f.size>FILE_MAX&&!/^image\//.test(f.type)){say(`Файл «${f.name}» больше 20 МБ`,true);continue}files.push(f)}drawAtt()};
  $("[data-clip]").onclick=()=>fileIn.click();
  fileIn.onchange=()=>{add([...fileIn.files]);fileIn.value=""};
  text.addEventListener("paste",e=>{const fs=[...(e.clipboardData?.files||[])];if(fs.length){e.preventDefault();add(fs)}});
  d.addEventListener("dragover",e=>{e.preventDefault();d.classList.add("ir-tc-drop")});
  d.addEventListener("dragleave",e=>{if(e.target===d)d.classList.remove("ir-tc-drop")});
  d.addEventListener("drop",e=>{e.preventDefault();d.classList.remove("ir-tc-drop");add([...(e.dataTransfer?.files||[])])});
  const grow=()=>{text.style.height="auto";text.style.height=Math.min(160,text.scrollHeight)+"px"};
  text.addEventListener("input",grow);
  async function go(){
   const t=text.value.trim();if(!t&&!files.length)return;
   send.disabled=true;say("Отправка…");
   try{
    const out=[];for(const f of files){const x=await shrink(f);if(x.data.byteLength>FILE_MAX)throw Error(`Файл «${f.name}» больше 20 МБ`);out.push(x)}
    const r=await call("ai-settings:server-chat-send",{to:cur==="all"?"":cur,text:t,files:out});
    text.value="";files=[];drawAtt();grow();say(base);
    if(r?.signedIn){v=r;drawPeople();drawList(true)}
   }catch(e){say(errText(e),true)}finally{send.disabled=false;text.focus()}
  }
  send.onclick=go;
  text.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();void go()}});
  list.onclick=async e=>{
   const img=e.target.closest("img[data-img]");
   if(img&&img.src){const z=doc.createElement("div");z.className="ir-tc-zoom";z.innerHTML=`<img src="${img.src}" alt="">`;z.onclick=()=>z.remove();d.appendChild(z);return}
   const f=e.target.closest("[data-fid]");
   if(f){try{if(e.ctrlKey){const r=await call("ai-settings:server-chat-save",{id:f.dataset.fid,name:f.dataset.name});if(r?.saved)say("Сохранено: "+r.path)}
    else{say("Открываю файл…");await call("ai-settings:server-chat-open-file",{id:f.dataset.fid,name:f.dataset.name});say(base)}}catch(err){say(errText(err),true)}return}
   const del=e.target.closest("[data-del]");
   if(del){if(!confirm("Удалить сообщение у всех?"))return;try{const r=await call("ai-settings:server-chat-remove",{id:del.dataset.del});if(r?.signedIn){v=r;drawn="";drawPeople();drawList()}}catch(err){say(errText(err),true)}}
  };
  const close=()=>{if(d.open)d.close()};
  $("[data-close]").onclick=close;
  d.addEventListener("close",()=>{clearInterval(timer);d.remove();try{if(host().__irTeamChatDialog===d)host().__irTeamChatDialog=null}catch{}badges()},{once:true});
  timer=setInterval(()=>{if(doc.visibilityState!=="hidden")void load()},3000);
  void load(true);text.focus();
  return d
 }

 // The count on the icons of all the open tabs (each tab is a frame with its own profile panel).
 function paint(win,n){
  try{for(const b of win.document.querySelectorAll('[data-link="chat"]')){let c=b.querySelector(".program-link-count");
   if(!c){c=win.document.createElement("b");c.className="program-link-count";b.appendChild(c)}
   c.hidden=!n;c.textContent=n>99?"99+":String(n);b.dataset.state=n?"busy":"on";
   const t=n?`Чат компании: непрочитанных ${n}`:"Чат компании";b.title=t;b.setAttribute("aria-label",t)}}catch{}
  try{for(const f of win.frames)paint(f,n)}catch{}
 }
 let lastCount=0;
 async function badges(){
  try{const r=await call("ai-settings:server-chat-unread",{});lastCount=r?.signedIn?Number(r.count||0):0}catch{return}
  try{host().__irTeamChatCount=lastCount}catch{}
  paint(host(),lastCount)
 }
 window.irTeamChat={open,badges,count:()=>lastCount,icon:ICON};
 // One tab keeps the timer of the count and answers the click on the notification of Windows: the first one open; when
 // it is closed, the next one takes it over.
 const owner=()=>{const h=host();let alive=false;try{const o=h.__irTeamChatOwner;alive=Boolean(o&&o!==window&&!o.closed&&o.document&&(!o.frameElement||o.frameElement.isConnected))}catch{}
  if(!alive)h.__irTeamChatOwner=window;return h.__irTeamChatOwner===window};
 const ai=window.irProject?.ai;
 try{ai?.on?.("ai-settings:server-chat-open",x=>{if(owner())open(host().document,{conv:String(x?.conv||"all")})})}catch{}
 try{ai?.on?.("ai-settings:server-chat-new",()=>{if(owner())void badges()})}catch{}
 setTimeout(()=>{if(owner())void badges();else paint(window,lastCount=Number(host().__irTeamChatCount||0))},3000);
 setInterval(()=>{if(owner()&&document.visibilityState!=="hidden")void badges()},20000);
})();
