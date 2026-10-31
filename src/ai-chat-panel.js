/*
 * IR Project: the engineer's chat with Claude in the program window (src/ai-chat.js in the main process). A round
 * button with the sign of a chat (bottom right; the engineer drags it, and the panel by its title, anywhere in the
 * window, the places are remembered) opens the panel: the conversation, the element selected on the montage scheme that goes
 * with the message, a screenshot of the window (taken with the panel hidden), photos from the computer (button «Фото»,
 * pasted or dropped) and the text. The message goes to Claude through GitHub of the program (or the task «Чат IR
 * Project» on claude.ai by its key). Claude's answers are read every 8 seconds while the panel is open and every 30
 * seconds otherwise: a badge counts the new ones, a note over the button and a notification of Windows (when the
 * program is not in front) tell of each answer once.
 * The button and the panel stand over the montage scheme opened on the whole screen too (the engineer, 31.10.2026:
 * «когда на весь экран монтажная схема, чат также показывается»; its stage stands at z-index 2147483000).
 */
(function(){
 "use strict";
 if(window.irChatPanel)return;
 const ai=()=>window.irProject&&window.irProject.ai;
 const invoke=(ch,arg)=>ai()&&ai().invoke?ai().invoke(ch,arg):Promise.reject(Error("Чат появится после обновления программы"));
 const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 // Claude's answer: paragraphs, **bold**, `code`, lists; links shown as text (the window does not open pages).
 const md=t=>esc(t).replace(/`([^`\n]+)`/g,"<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/\[([^\]\n]+)\]\((https?:[^)\s]+)\)/g,'$1 <small>($2)</small>')
  .split(/\n{2,}/).map(p=>/^\s*[-*•] /m.test(p)?"<ul>"+p.split(/\n/).map(l=>"<li>"+l.replace(/^\s*[-*•] /,"")+"</li>").join("")+"</ul>":"<p>"+p.replace(/\n/g,"<br>")+"</p>").join("");
 const time=t=>{const d=new Date(t);return isNaN(d)?"":d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})};
 const css=`
 .irc-fab{position:fixed;right:18px;bottom:18px;z-index:2147483100;width:54px;height:54px;border-radius:50%;border:0;background:#1d4ed8;color:#fff;font:600 13px/1 system-ui,sans-serif;box-shadow:0 6px 18px rgba(15,35,80,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;touch-action:none}
 .irc-fab svg{width:27px;height:27px;pointer-events:none}.irc-fab.irc-moving{cursor:grabbing;box-shadow:0 10px 26px rgba(15,35,80,.38)}
 .irc-fab:hover{background:#1e40af}.irc-fab b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#e8590c;color:#fff;font-size:11px;line-height:20px;padding:0 5px}
 .irc-panel{position:fixed;right:18px;bottom:84px;z-index:2147483101;width:min(420px,calc(100vw - 36px));height:min(640px,calc(100vh - 110px));display:flex;flex-direction:column;background:#fff;color:#1f2933;border:1px solid #d5dde6;border-radius:12px;box-shadow:0 14px 40px rgba(15,35,80,.25);font:14px/1.45 system-ui,"Segoe UI",sans-serif}
 .irc-panel[hidden]{display:none}
 .irc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e3e8ee;cursor:grab;user-select:none;touch-action:none}.irc-panel.irc-moving .irc-head{cursor:grabbing}.irc-head h3{margin:0;font-size:15px;flex:1}.irc-head small{display:block;color:#6b7785;font-weight:400;font-size:12px}
 .irc-head button{border:0;background:none;font-size:20px;cursor:pointer;color:#6b7785}
 .irc-note{margin:8px 12px 0;padding:8px 10px;border-radius:8px;background:#fff4e5;color:#7a4b00;font-size:12.5px}.irc-note:empty{display:none}
 .irc-list{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:#f6f8fb}
 .irc-empty{color:#6b7785;font-size:13px;text-align:center;margin:auto 10px}
 .irc-msg{max-width:88%;padding:8px 10px;border-radius:10px;background:#fff;border:1px solid #e1e7ee;word-wrap:break-word}
 .irc-msg.user{align-self:flex-end;background:#e8f0fe;border-color:#c9daf8}
 .irc-msg p{margin:0 0 6px}.irc-msg p:last-child{margin:0}.irc-msg ul{margin:0 0 6px;padding-left:18px}.irc-msg code{background:#eef1f5;padding:0 3px;border-radius:3px}
 .irc-meta{font-size:11.5px;color:#6b7785;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap}.irc-meta .err{color:#b42318}
 .irc-meta button{border:0;background:none;color:#1d4ed8;cursor:pointer;padding:0;font-size:11.5px}
 .irc-ctxline{font-size:12px;color:#44515e;margin-top:4px}
 /* The question an answer is to, above the answer in another colour (the engineer, 27.10.2026); a click shows it in the list. */
 .irc-q{margin:0 0 8px;padding:6px 8px;border-left:3px solid #d97706;border-radius:6px;background:#fff7e6;color:#7a4b00;font-size:12.5px;cursor:pointer}
 .irc-q b{display:block;font-size:11px;letter-spacing:.03em;text-transform:uppercase;color:#b45309;margin-bottom:2px}.irc-q small{display:block;margin-top:2px;color:#92400e}
 .irc-msg.irc-flash{box-shadow:0 0 0 2px #f59e0b}
 /* A button of an answer (31.10.2026: «если его нет удали»): the program does it on the montage scheme when pressed. */
 .irc-acts{display:flex;flex-direction:column;gap:4px;margin-top:6px}
 .irc-acts button{align-self:flex-start;border:1px solid #b91c1c;background:#fff;color:#b91c1c;border-radius:6px;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer}
 .irc-acts button:disabled{opacity:.6;cursor:default}.irc-acts small{color:#44515e;font-size:12px}
 .irc-shot{display:block;margin-top:6px;max-width:100%;border-radius:6px;border:1px solid #d5dde6;cursor:zoom-in}
 .irc-form{border-top:1px solid #e3e8ee;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
 .irc-ctx{display:flex;gap:6px;align-items:center;font-size:12.5px;background:#eef4ff;border-radius:6px;padding:4px 8px;color:#1f3a68}.irc-ctx[hidden]{display:none}
 .irc-ctx span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.irc-ctx button{border:0;background:none;cursor:pointer;color:#44515e}
 .irc-form textarea{resize:vertical;min-height:64px;max-height:220px;padding:8px;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
 .irc-row{display:flex;align-items:center;gap:8px}.irc-row label{flex:1;font-size:12.5px;color:#44515e;display:flex;gap:7px;align-items:center;cursor:pointer;user-select:none;margin:0}
 /* The page styles every input as a field: the box of «Приложить снимок экрана» is a plain checkbox again. */
 .irc-row label input[type=checkbox]{appearance:auto!important;-webkit-appearance:checkbox!important;width:16px!important;height:16px!important;min-width:16px!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;flex:0 0 16px;accent-color:#1d4ed8;cursor:pointer}
 .irc-row button{border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:7px 14px;font-weight:600;cursor:pointer}.irc-row button:disabled{opacity:.55;cursor:default}
 .irc-row .irc-attach{background:#fff;color:#1d4ed8;border:1px solid #9db7ef;padding:6px 10px;font-weight:600;display:inline-flex;align-items:center;gap:6px}.irc-attach svg{width:17px;height:17px;flex:0 0 17px}.irc-row .irc-attach:hover{background:#eef4ff}
 .irc-photos{display:flex;gap:6px;flex-wrap:wrap}.irc-photos[hidden]{display:none}
 .irc-photos span{position:relative;width:56px;height:56px;border-radius:6px;overflow:hidden;border:1px solid #cfd8e3;background:#f6f8fb}
 .irc-photos img{width:100%;height:100%;object-fit:cover;display:block}
 .irc-photos button{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:9px;border:0;background:rgba(15,35,80,.7);color:#fff;font-size:12px;line-height:18px;padding:0;cursor:pointer}
 .irc-panel.irc-drop{outline:3px dashed #1d4ed8;outline-offset:-6px}
 .irc-toast{position:fixed;right:18px;bottom:84px;z-index:2147483102;width:min(340px,calc(100vw - 36px));background:#fff;border:1px solid #c9daf8;border-left:4px solid #1d4ed8;border-radius:10px;box-shadow:0 12px 32px rgba(15,35,80,.25);padding:10px 12px;font:13px/1.45 system-ui,"Segoe UI",sans-serif;color:#1f2933;display:flex;flex-direction:column;gap:6px}
 .irc-toast[hidden]{display:none}.irc-toast b{font-size:13.5px}.irc-toast span{color:#44515e;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
 .irc-toast div{display:flex;gap:8px;justify-content:flex-end}.irc-toast button{border:0;border-radius:7px;padding:5px 12px;font-weight:600;cursor:pointer;background:#1d4ed8;color:#fff}.irc-toast button.alt{background:#fff;color:#44515e;border:1px solid #cfd8e3}
 .irc-link{margin:8px 12px 0;padding:10px;border-radius:8px;background:#eef4ff;color:#1f3a68;font-size:12.5px;display:flex;flex-direction:column;gap:6px}.irc-link[hidden]{display:none}
 .irc-link ol{margin:0;padding-left:18px}.irc-link input{padding:6px 8px;border:1px solid #cfd8e3;border-radius:6px;font:12.5px monospace}
 .irc-link details small{display:block;margin:4px 0;color:#44515e}.irc-link summary{cursor:pointer;color:#1d4ed8}
 .irc-link div{display:flex;gap:6px;flex-wrap:wrap}.irc-link button{border:0;border-radius:6px;background:#1d4ed8;color:#fff;padding:6px 12px;font-weight:600;cursor:pointer}.irc-link button.alt{background:#fff;color:#1d4ed8;border:1px solid #9db7ef}
 .irc-head .irc-relink{font-size:11.5px;color:#1d4ed8;border:0;background:none;padding:0;cursor:pointer}
 .irc-zoom{position:fixed;inset:0;z-index:2147483105;background:rgba(10,20,35,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out}.irc-zoom img{max-width:94vw;max-height:92vh;border-radius:6px}
 .irc-fab[hidden]{display:none}.irc-hide .irc-fab,.irc-hide .irc-panel,.irc-hide .irc-toast{display:none!important}
 @media print{.irc-fab,.irc-panel,.irc-toast{display:none!important}}`;
 const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
 const fab=document.createElement("button");fab.type="button";fab.className="irc-fab";fab.title="Чат с Claude: замечания по монтажной схеме. Значок можно перетащить в любое место";fab.setAttribute("aria-label","Чат с Claude");
 fab.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M8.5 9h7M8.5 12.5h4.5"/></svg><b hidden></b>';
 const panel=document.createElement("aside");panel.className="irc-panel";panel.hidden=true;
 panel.innerHTML=`<div class="irc-head" title="Окно чата можно перетащить за заголовок; двойной щелчок — вернуть к значку"><h3>Чат с Claude<small>Сообщение сразу уходит Claude — ответ и отчёт придут сюда <button type="button" class="irc-relink" data-relink hidden>ключ claude.ai</button></small></h3><button type="button" data-close title="Закрыть">×</button></div>
 <div class="irc-link" hidden><b>Чат пока не может отправлять</b><span>Сообщения уходят Claude через GitHub программы. Администратор один раз вставляет ключ GitHub в настройках ИИ, раздел «Отправка обучения в репозиторий». После этого всё, что ждёт, уйдёт само.</span>
 <details><summary>Ключ задачи claude.ai (необязательно)</summary><small>Если у вас есть ключ задачи «Чат IR Project» (начинается с sk-ant-) и её адрес Fire URL — вставьте их, сообщения пойдут туда.</small>
 <input type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" data-key>
 <input placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" autocomplete="off" spellcheck="false" data-url><div><button type="button" data-link>Подключить</button></div></details></div>
 <div class="irc-note"></div><div class="irc-list"></div>
 <form class="irc-form"><div class="irc-ctx" hidden><span></span><button type="button" title="Не прикладывать элемент">×</button></div>
 <textarea placeholder="Что не так или что сделать? Например: «у колонны К7 нет базы». Фото можно вставить сюда (Ctrl+V) или перетащить."></textarea>
 <div class="irc-photos" hidden></div>
 <div class="irc-row"><label><input type="checkbox" checked> Приложить снимок экрана</label><button type="button" class="irc-attach" title="Приложить фото или картинку с компьютера (до 6)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.8" cy="10" r="1.7"/><path d="M21 15.5l-4.8-4.8L7.5 19.5"/></svg>Фото</button><input type="file" accept="image/*" multiple hidden><button type="submit">Отправить</button></div></form>`;
 const toast=document.createElement("div");toast.className="irc-toast";toast.hidden=true;toast.setAttribute("role","status");
 toast.innerHTML='<b>Claude ответил в чате</b><span></span><div><button type="button" class="alt" data-later>Позже</button><button type="button" data-open>Открыть чат</button></div>';
 document.body.append(fab,panel,toast);
 const list=panel.querySelector(".irc-list"),note=panel.querySelector(".irc-note"),form=panel.querySelector("form"),area=form.querySelector("textarea"),withShot=form.querySelector("input[type=checkbox]"),sendBtn=form.querySelector("[type=submit]"),ctxBox=form.querySelector(".irc-ctx");
 const photoBox=form.querySelector(".irc-photos"),photoInput=form.querySelector("input[type=file]");
 // Photos chosen for the next message: kept by the main process at once, shown here until sent.
 let photos=[];
 let state={messages:[],unread:0,link:null},dropElement=false,busy=false,timer=null,relink=false;
 const acted=new Map();
 const linkBox=panel.querySelector(".irc-link"),keyInput=linkBox.querySelector("[data-key]"),urlInput=linkBox.querySelector("[data-url]");
 const shots=new Map();
 // ---- The button and the panel go where the engineer drags them (the button by itself, the panel by its title), the
 // places kept in the window's storage (shared by the tabs). A panel never dragged, and the note of an answer, open by
 // the button; a double click on the title brings the panel back to it.
 const PLACE="irc-place";
 const spot=(()=>{try{const v=JSON.parse(localStorage.getItem(PLACE)||"{}");return v&&typeof v==="object"?v:{}}catch(_e){return{}}})();
 const keep=()=>{try{localStorage.setItem(PLACE,JSON.stringify(spot))}catch(_e){}};
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function put(box,x,y){
  if(!innerWidth||!innerHeight||!Number.isFinite(x)||!Number.isFinite(y))return;
  box.style.left=clamp(x,4,innerWidth-box.offsetWidth-4)+"px";box.style.top=clamp(y,4,innerHeight-box.offsetHeight-4)+"px";box.style.right=box.style.bottom="auto"
 }
 // Above the button, or below it, on the side of the window the button is on; beside it when neither has room.
 function byButton(box){
  if(fab.hidden){box.style.left=box.style.top=box.style.right=box.style.bottom="";return}
  const f=fab.getBoundingClientRect(),w=box.offsetWidth,h=box.offsetHeight,left=f.left+f.width/2<innerWidth/2;
  if(f.top-12-h>=4)put(box,left?f.left:f.right-w,f.top-12-h);
  else if(f.bottom+12+h<=innerHeight-4)put(box,left?f.left:f.right-w,f.bottom+12);
  else put(box,left?f.right+12:f.left-12-w,f.top+f.height/2-h/2)
 }
 function follow(){if(!panel.hidden&&!spot.panel)byButton(panel);if(!toast.hidden)byButton(toast)}
 function arrange(){
  if(spot.fab&&!fab.hidden)put(fab,spot.fab.x,spot.fab.y);
  if(spot.panel&&!panel.hidden)put(panel,spot.panel.x,spot.panel.y);
  follow()
 }
 let draggedAt=0;
 function drag(handle,box,name){
  handle.addEventListener("pointerdown",ev=>{
   if(ev.button!==0||handle!==box&&ev.target.closest("button,input,a"))return;
   const r=box.getBoundingClientRect(),dx=ev.clientX-r.left,dy=ev.clientY-r.top,x0=ev.clientX,y0=ev.clientY;let moved=false;
   const move=e=>{
    if(!moved&&Math.hypot(e.clientX-x0,e.clientY-y0)<6)return;
    moved=true;box.classList.add("irc-moving");put(box,e.clientX-dx,e.clientY-dy);if(box===fab)follow()
   };
   const up=()=>{
    handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",up);handle.removeEventListener("pointercancel",up);
    box.classList.remove("irc-moving");if(!moved)return;
    draggedAt=Date.now();spot[name]={x:parseFloat(box.style.left),y:parseFloat(box.style.top)};keep()
   };
   try{handle.setPointerCapture(ev.pointerId)}catch(_e){}
   handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",up);handle.addEventListener("pointercancel",up)
  })
 }
 drag(fab,fab,"fab");drag(panel.querySelector(".irc-head"),panel,"panel");
 panel.querySelector(".irc-head").addEventListener("dblclick",ev=>{if(ev.target.closest("button"))return;delete spot.panel;keep();follow()});
 window.addEventListener("resize",arrange);
 // What goes with the message: the page's own context (the montage scheme gives its selected element) and the window.
 function context(){
  let c=null;try{c=typeof window.irChatContext==="function"?window.irChatContext():null}catch(_e){c=null}
  c=c&&typeof c==="object"?{...c}:{};
  if(!c.page)c.page=(document.querySelector("h1,h2")?.textContent||document.title||"").trim().slice(0,120);
  c.route=location.hash||"";
  // Who writes: the profile of the program (Администратор, Инженер ПТО, Гость).
  try{const r=window.irAccess&&window.irAccess.role&&window.irAccess.role();if(r)c.user={admin:"Администратор",engineer:"Инженер ПТО",guest:"Гость"}[r]||r}catch(_e){}
  if(dropElement)delete c.element;
  return c
 }
 function paintContext(){
  const e=context().element;ctxBox.hidden=!e;
  if(e)ctxBox.querySelector("span").textContent="Элемент: "+[e.mark,e.name].filter(Boolean).join(" · ")
 }
 function warn(){
  const l=state.link;
  if(state.error)return state.error;
  return""
 }
 function paint(){
  note.textContent=warn();
  const l=state.link;linkBox.hidden=!(l&&(!l.connected||relink));if(relink)linkBox.querySelector("details").open=true;const rl=panel.querySelector("[data-relink]");rl.hidden=!l||relink;rl.textContent=l&&l.hasKey?"сменить ключ claude.ai":"ключ claude.ai";
  const b=fab.querySelector("b");b.hidden=!(state.unread>0)||!panel.hidden;b.textContent=state.unread>9?"9+":String(state.unread||"");
  if(panel.hidden)return;
  const atEnd=list.scrollHeight-list.scrollTop-list.clientHeight<40;
  list.innerHTML=state.messages.length?state.messages.map(m=>{
   const e=m.context&&m.context.element,asked=m.from!=="user"&&m.reply_to?state.messages.find(x=>x.from==="user"&&x.id===m.reply_to):null,ae=asked&&asked.context&&asked.context.element,said=asked?String(asked.text||"").replace(/\s+/g," ").trim():"";
   const meta=m.from==="user"?(m.answered?"<span>Есть ответ Claude</span>":m.state==="error"?'<span class="err">Не отправлено: '+esc(m.error||"")+'</span><button type="button" data-retry="'+esc(m.id)+'">Повторить</button>':
    m.state==="waiting"?"<span>Ждёт отправки — уйдёт само</span>":m.state==="sending"?"<span>Отправляется…</span>":"<span>"+(m.answered?"Отправлено · есть ответ":"Отправлено Claude")+"</span>"):
    "<span>Claude"+(m.version?" · обновление "+esc(m.version):"")+"</span>";
   return'<div class="irc-msg '+(m.from==="user"?"user":"claude")+'" data-mid="'+esc(m.id)+'">'+(asked?'<div class="irc-q" data-goto="'+esc(asked.id)+'" title="Показать вопрос в чате"><b>Вопрос</b>'+esc(said.length>280?said.slice(0,280)+"…":said)+(ae?"<small>Элемент: "+esc([ae.mark,ae.name].filter(Boolean).join(" · "))+"</small>":"")+"</div>":"")+(m.from==="user"?"<p>"+esc(m.text).replace(/\n/g,"<br>")+"</p>":md(m.text))+
    (e?'<div class="irc-ctxline">Элемент: '+esc([e.mark,e.name].filter(Boolean).join(" · "))+'</div>':"")+
    (m.from!=="user"&&Array.isArray(m.actions)&&m.actions.length?'<div class="irc-acts">'+m.actions.map((a,i)=>{const k=m.id+"|"+i,st=acted.get(k);
     return'<button type="button" data-act="'+esc(k)+'"'+(st&&st.busy?" disabled":"")+'>'+esc(a.label||"Удалить со схемы")+"</button>"+(st&&st.text?"<small>"+esc(st.text)+"</small>":"")}).join("")+"</div>":"")+
    [m.shot,...(m.photos||[])].filter(Boolean).map((id,i)=>'<img class="irc-shot" data-shot="'+esc(id)+'" alt="'+(i||!m.shot?"фото":"снимок экрана")+'"'+(shots.get(id)?' src="'+shots.get(id)+'"':"")+'>').join("")+
    '<div class="irc-meta">'+meta+"<span>"+time(m.at)+"</span></div></div>"
  }).join(""):'<div class="irc-empty">Напишите, что не так на схеме или в программе. К сообщению приложится снимок экрана и выбранный на схеме элемент; Claude исправит и пришлёт сюда отчёт.</div>';
  const stick=atEnd||busy;
  list.querySelectorAll("img[data-shot]").forEach(img=>{img.onload=()=>{if(stick)list.scrollTop=list.scrollHeight};if(img.src)return;const id=img.dataset.shot;invoke("ai-montage:chat-shot",{id}).then(u=>{if(u){shots.set(id,u);img.src=u}}).catch(()=>{})});
  if(stick)list.scrollTop=list.scrollHeight
 }
 const take=v=>{if(v&&Array.isArray(v.messages)){state=v;paint()}return v};
 // ---- A new answer of Claude: a note over the button and, with the program not in front, a notification of Windows.
 // Every tab runs this panel: only the tab on the screen tells, and each answer is told once (remembered in the
 // window's storage, shared by the tabs).
 const TOLD="irc-told";
 const onScreen=()=>{try{const f=window.frameElement;return!f||f.classList.contains("active")}catch(_e){return true}};
 const inFront=()=>{try{return window.top.document.hasFocus()}catch(_e){return document.hasFocus()}};
 const told=()=>{try{return new Set(JSON.parse(localStorage.getItem(TOLD)||"[]"))}catch(_e){return new Set()}};
 const plain=t=>String(t||"").replace(/\*\*|`/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/\s+/g," ").trim();
 let toldRoute="",toastTimer=null;
 function announce(){
  if(!state.unread||!onScreen()||!panel.hidden&&inFront())return;
  const done=told(),news=state.messages.filter(m=>m.from==="claude").slice(-state.unread).filter(m=>!done.has(m.id));
  if(!news.length)return;
  news.forEach(m=>done.add(m.id));try{localStorage.setItem(TOLD,JSON.stringify([...done].slice(-300)))}catch(_e){}
  const last=news[news.length-1],asked=state.messages.find(m=>m.id===last.reply_to),route=String(asked?.context?.route||"");
  toldRoute=/^#\/objects\/object\/\d+\/scheme/.test(route)?route:"";
  const body=plain(last.text).slice(0,220);
  toast.querySelector("b").textContent=news.length>1?"Claude ответил в чате ("+news.length+")":"Claude ответил в чате";
  toast.querySelector("span").textContent=body;toast.hidden=false;arrange();
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true},60000);
  if(!inFront())invoke("ai-montage:chat-notify",{title:toast.querySelector("b").textContent+" · IR Project",body,route:toldRoute}).catch(()=>{});
 }
 // The chat is on the montage scheme: from another page the answer opens the scheme of the message it answers.
 function showChat(route){
  toast.hidden=true;
  if(onScheme()){open(true);return}
  if(route){location.hash=route;setTimeout(()=>{if(onScheme())open(true)},500);return}
  alert("Чат открывается на странице «Монтажная схема» объекта.")
 }
 toast.querySelector("[data-open]").onclick=()=>showChat(toldRoute);
 toast.querySelector("[data-later]").onclick=()=>{toast.hidden=true};
 try{ai()?.on?.("ai-montage:chat-open",d=>{if(onScreen())showChat(String(d?.route||""))})}catch(_e){}
 async function sync(){
  try{const v=await invoke("ai-montage:chat-sync");take(v);announce();if(!panel.hidden&&state.unread)take(await invoke("ai-montage:chat-seen"))}catch(e){state.error=String(e.message||e);paint()}
 }
 function schedule(){clearInterval(timer);timer=setInterval(sync,panel.hidden?30000:8000)}
 function open(show){
  panel.hidden=!show;schedule();paintContext();paint();arrange();
  if(show){toast.hidden=true;area.focus();sync()}
 }
 // ---- Photos from the computer: any picture the window can read becomes a JPEG of at most 2000 px.
 function paintPhotos(){
  photoBox.hidden=!photos.length;
  photoBox.innerHTML=photos.map((p,i)=>'<span><img alt="фото '+(i+1)+'" src="'+p.url+'"><button type="button" data-unphoto="'+i+'" title="Убрать фото">×</button></span>').join("")
 }
 async function addPhotos(files){
  const images=[...files||[]].filter(f=>/^image\//.test(f.type));
  if(!images.length)return;
  if(photos.length+images.length>6)alert("К одному сообщению — до 6 фото.");
  for(const f of images.slice(0,Math.max(0,6-photos.length))){
   try{
    const bmp=await createImageBitmap(f),k=Math.min(1,2000/Math.max(bmp.width,bmp.height)),c=document.createElement("canvas");
    c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));
    const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);bmp.close?.();
    const blob=await new Promise((ok,no)=>c.toBlob(b=>b?ok(b):no(Error("не удалось сжать")),"image/jpeg",0.85));
    const r=await invoke("ai-montage:chat-photo",{data:new Uint8Array(await blob.arrayBuffer())});
    if(r?.photoId)photos.push({id:r.photoId,url:URL.createObjectURL(blob)})
   }catch(e){alert("Фото «"+f.name+"» не добавлено: "+(e.message||e))}
  }
  paintPhotos()
 }
 const dropPhotos=()=>{for(const p of photos)URL.revokeObjectURL(p.url);photos=[];paintPhotos()};
 form.querySelector(".irc-attach").onclick=()=>photoInput.click();
 photoInput.onchange=()=>{addPhotos(photoInput.files);photoInput.value=""};
 photoBox.addEventListener("click",ev=>{const b=ev.target.closest("[data-unphoto]");if(!b)return;const [p]=photos.splice(Number(b.dataset.unphoto),1);if(p)URL.revokeObjectURL(p.url);paintPhotos()});
 area.addEventListener("paste",ev=>{const files=[...(ev.clipboardData?.files||[])].filter(f=>/^image\//.test(f.type));if(files.length){ev.preventDefault();addPhotos(files)}});
 panel.addEventListener("dragover",ev=>{if([...(ev.dataTransfer?.types||[])].includes("Files")){ev.preventDefault();panel.classList.add("irc-drop")}});
 panel.addEventListener("dragleave",ev=>{if(!panel.contains(ev.relatedTarget))panel.classList.remove("irc-drop")});
 panel.addEventListener("drop",ev=>{panel.classList.remove("irc-drop");if(ev.dataTransfer?.files?.length){ev.preventDefault();addPhotos(ev.dataTransfer.files)}});
 fab.onclick=()=>{if(Date.now()-draggedAt>400)open(panel.hidden)};
 // The chat is for the montage scheme only (the engineer's wish): its button is there and nowhere else.
 const onScheme=()=>/^#\/objects\/object\/\d+\/scheme(?:$|[/?])/.test(location.hash);
 function place(){const on=onScheme();fab.hidden=!on;if(!on&&!panel.hidden)open(false);arrange()}
 window.addEventListener("hashchange",place);place();
 panel.querySelector("[data-close]").onclick=()=>open(false);
 ctxBox.querySelector("button").onclick=()=>{dropElement=true;paintContext()};
 panel.querySelector("[data-relink]").onclick=()=>{relink=true;paint();keyInput.focus()};
 
 linkBox.querySelector("[data-link]").onclick=async ev=>{
  const b=ev.currentTarget;b.disabled=true;
  try{take(await invoke("ai-montage:chat-link",{key:keyInput.value,url:urlInput.value}));keyInput.value="";urlInput.value="";relink=false;paint()}catch(e){alert("Чат не подключён: "+(e.message||e))}finally{b.disabled=false}
 };
 list.addEventListener("click",async ev=>{
  const r=ev.target.closest("[data-retry]");if(r){r.disabled=true;take(await invoke("ai-montage:chat-retry",{id:r.dataset.retry}).catch(e=>{alert(e.message);return null}));return}
  const q=ev.target.closest("[data-goto]");if(q){const t=[...list.querySelectorAll("[data-mid]")].find(x=>x.dataset.mid===q.dataset.goto);if(t){t.scrollIntoView({block:"center",behavior:"smooth"});t.classList.add("irc-flash");setTimeout(()=>t.classList.remove("irc-flash"),1600)}return}
  // A button of an answer: the page on the screen does it (the montage scheme of its object), else says where to go.
  const act=ev.target.closest("[data-act]");if(act){
   const k=act.dataset.act,cut=k.lastIndexOf("|"),m=state.messages.find(x=>x.id===k.slice(0,cut)),a=m&&m.actions&&m.actions[Number(k.slice(cut+1))];if(!a)return;
   acted.set(k,{busy:true,text:""});paint();let text=null;
   try{text=typeof window.irChatAction==="function"?await window.irChatAction(a):null}catch(e){text="Не удалось: "+String(e&&e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,"")}
   acted.set(k,{busy:false,text:text==null?"Откройте монтажную схему объекта "+(a.object?"«"+a.object+"»":"(id "+a.object_id+")")+" и нажмите кнопку там":String(text)});paint();return}
  const img=ev.target.closest("img[data-shot]");if(img&&img.src){const z=document.createElement("div");z.className="irc-zoom";z.innerHTML='<img alt="">';z.querySelector("img").src=img.src;z.onclick=()=>z.remove();document.body.appendChild(z)}
 });
 area.addEventListener("keydown",ev=>{if(ev.key==="Enter"&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();form.requestSubmit()}});
 const shotRect=()=>{
  const el=document.getElementById("schemePreviewStage")||document.querySelector(".ir-three-root");if(!el)return null;
  const b=el.getBoundingClientRect(),x=Math.max(0,b.left),y=Math.max(0,b.top),r=Math.min(window.innerWidth,b.right),d=Math.min(window.innerHeight,b.bottom);
  return r-x>=200&&d-y>=150?{x:Math.round(x),y:Math.round(y),width:Math.round(r-x),height:Math.round(d-y)}:null
 };
 const frames=n=>new Promise(r=>{const f=()=>--n<=0?setTimeout(r,120):requestAnimationFrame(f);requestAnimationFrame(f)});
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();const text=area.value.trim()||(photos.length?"Фото с компьютера":"");if(!text||busy)return;
  busy=true;sendBtn.disabled=true;
  try{
   const ctx=context();let shotId="";
   // The panel and the button leave the window for the screenshot (hidden by visibility, the button «Отправить» still
   // came out on it). Only the montage scheme is taken, not the whole program (the engineer, 25.10.2026): the stage of
   // the scheme with its picture and bar, within the window; without it on the page — the whole window.
   if(withShot.checked){document.documentElement.classList.add("irc-hide");await frames(3);
    try{shotId=(await invoke("ai-montage:chat-shot-take",{rect:shotRect()})).shotId||""}catch(_e){shotId=""}finally{document.documentElement.classList.remove("irc-hide")}}
   state.messages=state.messages.concat([{id:"local",from:"user",text,at:new Date().toISOString(),state:"sending",context:ctx}]);paint();area.value="";
   take(await invoke("ai-montage:chat-send",{text,context:ctx,shotId,photoIds:photos.map(p=>p.id)}));dropElement=false;dropPhotos();paintContext()
  }catch(e){alert("Сообщение не отправлено: "+(e.message||e));area.value=area.value||text}
  finally{busy=false;sendBtn.disabled=false;paint()}
 });
 // The selected element follows the scheme while the panel is open.
 document.addEventListener("click",()=>{if(!panel.hidden)setTimeout(paintContext,50)},true);
 invoke("ai-montage:chat-list").then(take).catch(()=>{});schedule();setTimeout(sync,4000);
 window.irChatPanel={open:()=>open(true),sync};
})();
