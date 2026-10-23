/*
 * IR Project: the engineer's chat with Claude in the program window (src/ai-chat.js in the main process). A round
 * button at the bottom right opens the panel: the conversation, the element selected on the montage scheme that goes
 * with the message, a screenshot of the window (taken with the panel hidden) and the text. The message goes straight to
 * Claude (the task «Чат IR Project» on claude.ai, by the key pasted once at the top of the panel). Claude's answers are
 * files on this computer and in the update, read every 8 seconds while the panel is open and every minute otherwise
 * (a badge counts the new ones).
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
 .irc-fab{position:fixed;right:18px;bottom:18px;z-index:9990;width:54px;height:54px;border-radius:50%;border:0;background:#1d4ed8;color:#fff;font:600 13px/1 system-ui,sans-serif;box-shadow:0 6px 18px rgba(15,35,80,.28);cursor:pointer}
 .irc-fab:hover{background:#1e40af}.irc-fab b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:#e8590c;color:#fff;font-size:11px;line-height:20px;padding:0 5px}
 .irc-panel{position:fixed;right:18px;bottom:84px;z-index:9991;width:min(420px,calc(100vw - 36px));height:min(640px,calc(100vh - 110px));display:flex;flex-direction:column;background:#fff;color:#1f2933;border:1px solid #d5dde6;border-radius:12px;box-shadow:0 14px 40px rgba(15,35,80,.25);font:14px/1.45 system-ui,"Segoe UI",sans-serif}
 .irc-panel[hidden]{display:none}
 .irc-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e3e8ee}.irc-head h3{margin:0;font-size:15px;flex:1}.irc-head small{display:block;color:#6b7785;font-weight:400;font-size:12px}
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
 .irc-shot{display:block;margin-top:6px;max-width:100%;border-radius:6px;border:1px solid #d5dde6;cursor:zoom-in}
 .irc-form{border-top:1px solid #e3e8ee;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
 .irc-ctx{display:flex;gap:6px;align-items:center;font-size:12.5px;background:#eef4ff;border-radius:6px;padding:4px 8px;color:#1f3a68}.irc-ctx[hidden]{display:none}
 .irc-ctx span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.irc-ctx button{border:0;background:none;cursor:pointer;color:#44515e}
 .irc-form textarea{resize:vertical;min-height:64px;max-height:220px;padding:8px;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
 .irc-row{display:flex;align-items:center;gap:8px}.irc-row label{flex:1;font-size:12.5px;color:#44515e;display:flex;gap:6px;align-items:center}
 .irc-row button{border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:7px 14px;font-weight:600;cursor:pointer}.irc-row button:disabled{opacity:.55;cursor:default}
 .irc-link{margin:8px 12px 0;padding:10px;border-radius:8px;background:#eef4ff;color:#1f3a68;font-size:12.5px;display:flex;flex-direction:column;gap:6px}.irc-link[hidden]{display:none}
 .irc-link ol{margin:0;padding-left:18px}.irc-link input{padding:6px 8px;border:1px solid #cfd8e3;border-radius:6px;font:12.5px monospace}
 .irc-link details small{display:block;margin:4px 0;color:#44515e}.irc-link summary{cursor:pointer;color:#1d4ed8}
 .irc-link div{display:flex;gap:6px;flex-wrap:wrap}.irc-link button{border:0;border-radius:6px;background:#1d4ed8;color:#fff;padding:6px 12px;font-weight:600;cursor:pointer}.irc-link button.alt{background:#fff;color:#1d4ed8;border:1px solid #9db7ef}
 .irc-head .irc-relink{font-size:11.5px;color:#1d4ed8;border:0;background:none;padding:0;cursor:pointer}
 .irc-zoom{position:fixed;inset:0;z-index:9995;background:rgba(10,20,35,.82);display:flex;align-items:center;justify-content:center;cursor:zoom-out}.irc-zoom img{max-width:94vw;max-height:92vh;border-radius:6px}
 .irc-fab[hidden]{display:none}.irc-hide .irc-fab,.irc-hide .irc-panel{visibility:hidden}
 @media print{.irc-fab,.irc-panel{display:none!important}}`;
 const style=document.createElement("style");style.textContent=css;document.head.appendChild(style);
 const fab=document.createElement("button");fab.type="button";fab.className="irc-fab";fab.title="Чат с Claude: замечания по монтажной схеме";fab.innerHTML="Чат<b hidden></b>";
 const panel=document.createElement("aside");panel.className="irc-panel";panel.hidden=true;
 panel.innerHTML=`<div class="irc-head"><h3>Чат с Claude<small>Сообщение сразу уходит Claude — ответ и отчёт придут сюда <button type="button" class="irc-relink" data-relink hidden>ключ claude.ai</button></small></h3><button type="button" data-close title="Закрыть">×</button></div>
 <div class="irc-link" hidden><b>Чат пока не может отправлять</b><span>Сообщения уходят Claude через GitHub программы. Администратор один раз вставляет ключ GitHub в настройках ИИ, раздел «Отправка обучения в репозиторий». После этого всё, что ждёт, уйдёт само.</span>
 <details><summary>Ключ задачи claude.ai (необязательно)</summary><small>Если у вас есть ключ задачи «Чат IR Project» (начинается с sk-ant-) и её адрес Fire URL — вставьте их, сообщения пойдут туда.</small>
 <input type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false" data-key>
 <input placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire" autocomplete="off" spellcheck="false" data-url><div><button type="button" data-link>Подключить</button></div></details></div>
 <div class="irc-note"></div><div class="irc-list"></div>
 <form class="irc-form"><div class="irc-ctx" hidden><span></span><button type="button" title="Не прикладывать элемент">×</button></div>
 <textarea placeholder="Что не так или что сделать? Например: «у колонны К7 нет базы»"></textarea>
 <div class="irc-row"><label><input type="checkbox" checked> Приложить снимок экрана</label><button type="submit">Отправить</button></div></form>`;
 document.body.append(fab,panel);
 const list=panel.querySelector(".irc-list"),note=panel.querySelector(".irc-note"),form=panel.querySelector("form"),area=form.querySelector("textarea"),withShot=form.querySelector("input"),sendBtn=form.querySelector("[type=submit]"),ctxBox=form.querySelector(".irc-ctx");
 let state={messages:[],unread:0,link:null},dropElement=false,busy=false,timer=null,relink=false;
 const linkBox=panel.querySelector(".irc-link"),keyInput=linkBox.querySelector("[data-key]"),urlInput=linkBox.querySelector("[data-url]");
 const shots=new Map();
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
   const e=m.context&&m.context.element;
   const meta=m.from==="user"?(m.answered?"<span>Есть ответ Claude</span>":m.state==="error"?'<span class="err">Не отправлено: '+esc(m.error||"")+'</span><button type="button" data-retry="'+esc(m.id)+'">Повторить</button>':
    m.state==="waiting"?"<span>Ждёт отправки — уйдёт само</span>":m.state==="sending"?"<span>Отправляется…</span>":"<span>"+(m.answered?"Отправлено · есть ответ":"Отправлено Claude")+"</span>"):
    "<span>Claude"+(m.version?" · обновление "+esc(m.version):"")+"</span>";
   return'<div class="irc-msg '+(m.from==="user"?"user":"claude")+'">'+(m.from==="user"?"<p>"+esc(m.text).replace(/\n/g,"<br>")+"</p>":md(m.text))+
    (e?'<div class="irc-ctxline">Элемент: '+esc([e.mark,e.name].filter(Boolean).join(" · "))+'</div>':"")+
    (m.shot?'<img class="irc-shot" data-shot="'+esc(m.shot)+'" alt="снимок экрана"'+(shots.get(m.shot)?' src="'+shots.get(m.shot)+'"':"")+'>':"")+
    '<div class="irc-meta">'+meta+"<span>"+time(m.at)+"</span></div></div>"
  }).join(""):'<div class="irc-empty">Напишите, что не так на схеме или в программе. К сообщению приложится снимок экрана и выбранный на схеме элемент; Claude исправит и пришлёт сюда отчёт.</div>';
  const stick=atEnd||busy;
  list.querySelectorAll("img[data-shot]").forEach(img=>{img.onload=()=>{if(stick)list.scrollTop=list.scrollHeight};if(img.src)return;const id=img.dataset.shot;invoke("ai-montage:chat-shot",{id}).then(u=>{if(u){shots.set(id,u);img.src=u}}).catch(()=>{})});
  if(stick)list.scrollTop=list.scrollHeight
 }
 const take=v=>{if(v&&Array.isArray(v.messages)){state=v;paint()}return v};
 async function sync(){
  try{const v=await invoke("ai-montage:chat-sync");take(v);if(!panel.hidden&&state.unread)take(await invoke("ai-montage:chat-seen"))}catch(e){state.error=String(e.message||e);paint()}
 }
 function schedule(){clearInterval(timer);timer=setInterval(sync,panel.hidden?60000:8000)}
 function open(show){
  panel.hidden=!show;schedule();paintContext();paint();
  if(show){area.focus();sync()}
 }
 fab.onclick=()=>open(panel.hidden);
 // The chat is for the montage scheme only (the engineer's wish): its button is there and nowhere else.
 const onScheme=()=>/^#\/objects\/object\/\d+\/scheme(?:$|[/?])/.test(location.hash);
 function place(){const on=onScheme();fab.hidden=!on;if(!on&&!panel.hidden)open(false)}
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
  const img=ev.target.closest("img[data-shot]");if(img&&img.src){const z=document.createElement("div");z.className="irc-zoom";z.innerHTML='<img alt="">';z.querySelector("img").src=img.src;z.onclick=()=>z.remove();document.body.appendChild(z)}
 });
 area.addEventListener("keydown",ev=>{if(ev.key==="Enter"&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();form.requestSubmit()}});
 const frames=n=>new Promise(r=>{const f=()=>--n<=0?setTimeout(r,60):requestAnimationFrame(f);requestAnimationFrame(f)});
 form.addEventListener("submit",async ev=>{
  ev.preventDefault();const text=area.value.trim();if(!text||busy)return;
  busy=true;sendBtn.disabled=true;
  try{
   const ctx=context();let shotId="";
   if(withShot.checked){document.documentElement.classList.add("irc-hide");await frames(2);
    try{shotId=(await invoke("ai-montage:chat-shot-take")).shotId||""}catch(_e){shotId=""}finally{document.documentElement.classList.remove("irc-hide")}}
   state.messages=state.messages.concat([{id:"local",from:"user",text,at:new Date().toISOString(),state:"sending",context:ctx}]);paint();area.value="";
   take(await invoke("ai-montage:chat-send",{text,context:ctx,shotId}));dropElement=false;paintContext()
  }catch(e){alert("Сообщение не отправлено: "+(e.message||e));area.value=area.value||text}
  finally{busy=false;sendBtn.disabled=false;paint()}
 });
 // The selected element follows the scheme while the panel is open.
 document.addEventListener("click",()=>{if(!panel.hidden)setTimeout(paintContext,50)},true);
 invoke("ai-montage:chat-list").then(take).catch(()=>{});schedule();setTimeout(sync,4000);
 window.irChatPanel={open:()=>open(true),sync};
})();
