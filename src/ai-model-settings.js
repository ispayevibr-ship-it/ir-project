"use strict";
/*
 * Settings → «ИИ-помощник Claude»: how Claude is reached (Claude Code with the subscription or an API key), the
 * model, and the knowledge base on GitHub (src/ai-github-sync.js). Keys are sent once to the main process, stored
 * encrypted there and never read back. Changing them needs the administrator's password.
 * The dialog may open in another document (the window shell): its styles are put into that document by itself.
 */
(function(){
 function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 const STYLE_ID="ir-ais-style-2";
 const CSS=`
.ir-ais{inset:0;margin:auto;box-sizing:border-box;width:min(920px,96vw);max-width:96vw;max-height:92vh;padding:0;border:0;border-radius:16px;background:#f3f6fa;color:#1d3247;box-shadow:0 30px 90px rgba(8,28,48,.45);font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;overflow:hidden}
.ir-ais *,.ir-ais-pw *{box-sizing:border-box}
.ir-ais::backdrop,.ir-ais-pw::backdrop{background:rgba(6,24,42,.62)}
.ir-ais-wrap{display:flex;flex-direction:column;max-height:92vh}
.ir-ais-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;padding:22px 26px 20px;background:linear-gradient(115deg,#0f3553,#17628b);color:#fff}
.ir-ais-head small{display:block;font-size:10.5px;letter-spacing:.12em;font-weight:700;color:#9fd0ee}
.ir-ais-head h2{margin:4px 0 4px;font-size:22px;font-weight:700;color:#fff}
.ir-ais-head p{margin:0;font-size:12px;color:#cfe5f3;max-width:640px}
.ir-ais-x{flex:none;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-size:15px;cursor:pointer}
.ir-ais-x:hover{background:rgba(255,255,255,.18)}
.ir-ais-body{overflow:auto;padding:18px 22px 6px;display:flex;flex-direction:column;gap:14px}
.ir-ais-note{padding:10px 14px;border-radius:10px;border:1px solid #b9e2c9;background:#effaf3;color:#1f6b42}
.ir-ais-note.err{border-color:#f1c4c4;background:#fff2f2;color:#a43030}
.ir-ais-note.warn{border-color:#f0d690;background:#fff8e6;color:#7a5a0e}
.ir-ais-card{background:#fff;border:1px solid #dbe5ee;border-radius:14px;padding:18px 20px;box-shadow:0 1px 3px rgba(20,50,80,.05)}
.ir-ais-card>header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:12px}
.ir-ais-kicker{font-size:10.5px;letter-spacing:.1em;font-weight:700;color:#5d86a6}
.ir-ais-card h3{margin:3px 0 2px;font-size:17px;color:#123754}
.ir-ais-card header p{margin:0;color:#6b8296;font-size:12px}
.ir-ais-chip{flex:none;font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:999px;background:#eef2f6;color:#6f8597;white-space:nowrap}
.ir-ais-chip.ok{background:#e4f5ea;color:#22764a}.ir-ais-chip.bad{background:#fdecec;color:#b13a3a}
.ir-ais-ways{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.ir-ais-way{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1.5px solid #dbe5ee;border-radius:12px;cursor:pointer;background:#fafcfe}
.ir-ais-way:hover{border-color:#9cc2e0}
.ir-ais-way.on{border-color:#1f6fb8;background:#eef6fd;box-shadow:0 0 0 3px rgba(31,111,184,.12)}
.ir-ais-way input{margin-top:3px}
.ir-ais-way b{display:block;color:#173f5f}.ir-ais-way span{display:block;font-size:12px;color:#6b8296}
.ir-ais-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:4px 0 12px}
.ir-ais-fields .wide{grid-column:1/-1}
.ir-ais-fields label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#5c7489}
.ir-ais input[type=text],.ir-ais input[type=password],.ir-ais select{width:100%;font:inherit;font-size:13px;padding:8px 10px;border:1px solid #cdd9e4;border-radius:9px;background:#fff;color:#1d3247}
.ir-ais input:focus,.ir-ais select:focus{outline:none;border-color:#1f6fb8;box-shadow:0 0 0 3px rgba(31,111,184,.15)}
.ir-ais-check{display:flex;gap:9px;align-items:center;margin:2px 0 12px;color:#25455f;cursor:pointer}
.ir-ais-stats{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 12px;color:#5c7489;font-size:12px}.ir-ais-stats b{display:block;color:#173f5f;font-size:14px}
.ir-ais-actions{display:flex;flex-wrap:wrap;gap:8px}
.ir-ais-btn{font:inherit;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:9px;border:1px solid #c8d8e6;background:#fff;color:#1d5f92;cursor:pointer}
.ir-ais-btn:hover:not(:disabled){background:#f1f7fc}
.ir-ais-btn.main{background:#1f6fb8;border-color:#1f6fb8;color:#fff}.ir-ais-btn.main:hover:not(:disabled){background:#185d9c}
.ir-ais-btn.danger{color:#b13a3a;border-color:#efc9c9}
.ir-ais-btn:disabled{opacity:.45;cursor:not-allowed}
.ir-ais-help{margin-top:14px;border:1px solid #dce8f2;border-radius:11px;background:#f6fafd}
.ir-ais-help summary{cursor:pointer;list-style:none;padding:10px 14px;font-weight:600;color:#1d5f92;display:flex;align-items:center;gap:8px}
.ir-ais-help summary::-webkit-details-marker{display:none}
.ir-ais-help summary::before{content:"▸";transition:transform .15s}.ir-ais-help[open] summary::before{transform:rotate(90deg)}
.ir-ais-help ol{margin:0;padding:2px 16px 12px 36px;color:#2e4a61}.ir-ais-help li{margin:6px 0}
.ir-ais-help code{font-family:Consolas,monospace;font-size:12px;background:#e8f0f7;padding:1px 6px;border-radius:5px;color:#123754;user-select:all}
.ir-ais-help .tip{margin:0 14px 12px;padding:8px 12px;border-radius:8px;background:#fff8e6;color:#6e520c;font-size:12px}
.ir-ais-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 22px;border-top:1px solid #dbe5ee;background:#fff;font-size:11.5px;color:#7a8fa1}
.ir-ais-pw{border:0;border-radius:14px;width:min(400px,94vw);padding:22px 24px;background:#fff;color:#1d3247;font:13px/1.5 "Segoe UI",system-ui,Arial,sans-serif;box-shadow:0 24px 70px rgba(8,28,48,.4)}
.ir-ais-pw h3{margin:0 0 6px;font-size:17px}.ir-ais-pw p{margin:0 0 12px;color:#5c7489}
.ir-ais-pw input{width:100%;font:inherit;padding:9px 11px;border:1px solid #cdd9e4;border-radius:9px}
.ir-ais-pw div{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
@media(max-width:640px){.ir-ais-ways,.ir-ais-fields{grid-template-columns:1fr}.ir-ais-head{padding:18px}.ir-ais-body{padding:14px}}
`;
 function ensureStyle(doc){if(doc.getElementById(STYLE_ID))return;const s=doc.createElement("style");s.id=STYLE_ID;s.textContent=CSS;(doc.head||doc.documentElement).appendChild(s)}
 const when=v=>v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"";
 const help=(title,steps,tip)=>'<details class="ir-ais-help"><summary>'+title+'</summary><ol>'+steps.map(s=>'<li>'+s+'</li>').join("")+'</ol>'+(tip?'<p class="tip">'+tip+'</p>':'')+'</details>';
 const HELP_CODE=help("Как подключить Claude Code — пошагово",[
  "Откройте <b>PowerShell</b>: Пуск → введите «PowerShell» → Enter.",
  "Вставьте команду установки и нажмите Enter: <code>irm https://claude.ai/install.ps1 | iex</code>. Дождитесь сообщения об успешной установке.",
  "Закройте PowerShell, откройте заново и введите <code>claude</code>. В открывшемся браузере войдите в свой аккаунт Claude (подписка Pro или Max). Если вход не предложен — введите в Claude Code <code>/login</code>.",
  "Здесь выберите «Claude Code на этом ПК» и нажмите <b>«Проверить Claude Code»</b> — должно появиться «Найден» с номером версии.",
  "Если пишет «не найден»: Пуск → «Изменение системных переменных среды» → «Переменные среды» → в «Переменные пользователя» выберите <b>Path</b> → «Изменить» → «Создать» → <code>%USERPROFILE%\\.local\\bin</code> → OK. Затем полностью закройте и откройте IR Project."
 ],"Claude Code тратит лимит вашей подписки — тот же, что и при работе в Claude. Подходит для одного компьютера.");
 const HELP_KEY=help("Как получить API-ключ — пошагово",[
  "Откройте <b>console.anthropic.com</b> и войдите (или зарегистрируйтесь).",
  "Раздел <b>Billing</b> → пополните баланс (оплата за объём: один лист чертежа — обычно несколько центов).",
  "Раздел <b>API Keys</b> → <b>Create Key</b> → имя, например «IR Project» → скопируйте ключ (начинается с <code>sk-ant-</code>). Ключ показывается один раз.",
  "Здесь выберите «API-ключ Anthropic», вставьте ключ, нажмите <b>«Сохранить ключ»</b> и введите пароль администратора IR Project.",
  "Нажмите <b>«Проверить подключение»</b> — должно появиться «Подключение работает»."
 ]);
 const helpGit=repo=>help("Как получить ключ GitHub — пошагово",[
  "Войдите на <b>github.com</b> под аккаунтом, у которого есть доступ к репозиторию <b>"+esc(repo)+"</b>.",
  "Нажмите на свой аватар справа вверху → <b>Settings</b> → в самом низу меню слева <b>Developer settings</b>.",
  "<b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.",
  "Token name: «IR Project — этот компьютер». Expiration: 1 год (по окончании выпустите новый и вставьте сюда).",
  "Resource owner: владелец репозитория — <b>"+esc(String(repo).split("/")[0])+"</b>.",
  "Repository access: <b>Only select repositories</b> → выберите <b>"+esc(repo)+"</b>.",
  "Permissions → в блоке <b>Repository permissions</b> нажмите <b>Add permissions</b>. В окне поиска напишите <b>Contents</b> (не «repo» — по нему этот пункт не находится), поставьте галочку и закройте окно.",
  "Справа от строки <b>Contents</b> смените «Read-only» на <b>Read and write</b>. Metadata добавится сама.",
  "Внизу <b>Generate token</b> → скопируйте ключ (начинается с <code>github_pat_</code>). Он показывается один раз.",
  "Здесь вставьте ключ в поле «Ключ доступа GitHub» → <b>«Сохранить и проверить»</b> → пароль администратора.",
  "Включите «Отправлять автоматически» — или нажимайте «Отправить сейчас», когда нужно."
 ],"Ключ даёт доступ только к этому репозиторию и только к файлам. Хранится на этом компьютере в зашифрованном виде и никуда не передаётся, кроме GitHub. Сами PDF не отправляются — только распознанные данные и ваши указания.");

 async function open(menu){
  const doc=menu?.ownerDocument||document,api=window.irProject?.aiSettings;
  ensureStyle(doc);
  const found=doc.querySelector(".ir-ais");if(found){found.showModal?.();return}
  const aiInvoke=(ch,v)=>window.irProject?.ai?.invoke?window.irProject.ai.invoke(String(ch).replace(/^ai-(knowledge|github|diag):/,"ai-settings:$1-"),v):Promise.reject(Error("Обновите программу"));
  const dlg=doc.createElement("dialog");dlg.className="ir-ais";
  let data=null,git=null,diag=null,notice="",kind="",busy=false;
  dlg.innerHTML='<div class="ir-ais-wrap"><div class="ir-ais-head"><div><small>IR PROJECT · НАСТРОЙКИ</small><h2>ИИ-помощник Claude</h2>'+
   '<p>Claude читает листы чертежей и помогает собрать монтажную схему. Здесь — как он подключён и куда программа отправляет то, чему научилась.</p></div>'+
   '<button type="button" class="ir-ais-x" data-close aria-label="Закрыть">✕</button></div>'+
   '<div class="ir-ais-body" data-body>Читаем настройки…</div>'+
   '<div class="ir-ais-foot"><span data-diag>Изменение ключей — только с паролем администратора</span><button type="button" class="ir-ais-btn main" data-close>Закрыть</button></div></div>';
  dlg.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{if(!busy)dlg.close()});
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  dlg.addEventListener("cancel",e=>{if(busy)e.preventDefault()});
  doc.body.appendChild(dlg);dlg.showModal();
  const status=(text,k="")=>{notice=String(text||"");kind=k};
  const isAdmin=()=>window.irAccess?.role?.()==="admin";
  async function authorize(){
   if(!isAdmin()){status("Изменять подключение и ключи может только администратор.","err");render();return false}
   let pw=await new Promise(resolve=>{
    const prompt=doc.createElement("dialog");prompt.className="ir-ais-pw";
    prompt.innerHTML='<form method="dialog"><h3>Подтверждение администратора</h3><p>Введите пароль администратора IR Project.</p>'+
     '<input type="password" autocomplete="off" required placeholder="Пароль администратора" aria-label="Пароль администратора">'+
     '<div><button type="button" class="ir-ais-btn" data-cancel>Отмена</button><button type="submit" class="ir-ais-btn main">Подтвердить</button></div></form>';
    const field=prompt.querySelector("input");let done=false;
    const finish=v=>{if(done)return;done=true;try{prompt.close()}catch{}prompt.remove();resolve(v)};
    prompt.querySelector("form").onsubmit=e=>{e.preventDefault();finish(field.value)};
    prompt.querySelector("[data-cancel]").onclick=()=>finish("");
    prompt.oncancel=e=>{e.preventDefault();finish("")};
    doc.body.appendChild(prompt);prompt.showModal();field.focus()
   });
   if(!pw)return false;
   try{const ok=await api.authorize(pw);pw="";if(!ok){status("Неверный пароль администратора.","err");render();return false}return true}
   catch(e){status("Ошибка авторизации: "+String(e.message||e),"err");render();return false}
  }
  async function action(job){
   if(busy)return;busy=true;render();
   try{await job()}catch(e){status(String(e.message||e),"err")}
   finally{busy=false;render()}
  }
  const dis=c=>busy||c?" disabled":"";
  function claudeCard(){
   const code=data.provider==="claude-code",cc=data.claudeCode;
   const models=(data.models||[]).map(m=>'<option value="'+esc(m.id)+'"'+(m.id===data.model?" selected":"")+'>'+esc(m.name)+'</option>').join("");
   const chip=code?(cc?(cc.available?'<span class="ir-ais-chip ok">Claude Code найден'+(cc.version?" · "+esc(cc.version):"")+'</span>':'<span class="ir-ais-chip bad">Claude Code не найден</span>'):'<span class="ir-ais-chip">Не проверен</span>')
    :(data.hasKey?'<span class="ir-ais-chip ok">Ключ сохранён</span>':'<span class="ir-ais-chip bad">Ключ не указан</span>');
   return'<section class="ir-ais-card"><header><div><div class="ir-ais-kicker">ПОДКЛЮЧЕНИЕ</div><h3>Как программа обращается к Claude</h3>'+
    '<p>Изображения листов отправляются в Anthropic в обоих случаях.</p></div>'+chip+'</header>'+
    '<div class="ir-ais-ways"><label class="ir-ais-way'+(code?" on":"")+'"><input type="radio" name="ir-ais-way" value="claude-code"'+(code?" checked":"")+dis()+'><div><b>Claude Code на этом ПК</b><span>Через вашу подписку Pro/Max, API-ключ не нужен</span></div></label>'+
    '<label class="ir-ais-way'+(code?"":" on")+'"><input type="radio" name="ir-ais-way" value="api"'+(code?"":" checked")+dis()+'><div><b>API-ключ Anthropic</b><span>Оплата за объём обработанных листов</span></div></label></div>'+
    '<div class="ir-ais-fields"><label>Модель<select data-model'+dis()+'>'+models+'</select></label>'+
    (code?'':'<label>API-ключ (sk-ant-…)<input type="password" data-key autocomplete="off" spellcheck="false" placeholder="'+(data.hasKey?"Сохранён — введите новый, чтобы заменить":"sk-ant-…")+'"></label>')+'</div>'+
    (code&&cc&&!cc.available&&cc.reason?'<div class="ir-ais-note err">'+esc(cc.reason)+'</div>':'')+
    '<div class="ir-ais-actions">'+(code?'<button type="button" class="ir-ais-btn main" data-test'+dis()+'>Проверить Claude Code</button>'
     :'<button type="button" class="ir-ais-btn main" data-save-key'+dis()+'>Сохранить ключ</button><button type="button" class="ir-ais-btn" data-test'+dis(!data.hasKey)+'>Проверить подключение</button><button type="button" class="ir-ais-btn danger" data-clear-key'+dis(!data.hasKey)+'>Удалить ключ</button>')+'</div>'+
    (code?HELP_CODE:HELP_KEY)+'</section>'
  }
  function gitCard(){
   if(!git)return"";
   if(git.unavailable)return'<section class="ir-ais-card"><header><div><div class="ir-ais-kicker">БАЗА ЗНАНИЙ НА GITHUB</div><h3>Отправка обучения в репозиторий</h3></div><span class="ir-ais-chip bad">Недоступно</span></header>'+
    '<div class="ir-ais-note warn">'+esc(git.reason)+'</div></section>';
   return'<section class="ir-ais-card"><header><div><div class="ir-ais-kicker">БАЗА ЗНАНИЙ НА GITHUB</div><h3>Отправка обучения в репозиторий</h3>'+
    '<p>Ответы Claude по комплектам, ваши указания и новые виды конструкций уходят в <b>'+esc(git.folder)+'</b>. После проверки они приходят на все компьютеры с обновлением.</p></div>'+
    (git.hasToken?'<span class="ir-ais-chip ok">Подключено</span>':'<span class="ir-ais-chip">Ключ не указан</span>')+'</header>'+
    '<div class="ir-ais-fields"><label>Репозиторий (владелец/имя)<input type="text" data-gh-repo value="'+esc(git.repo)+'" spellcheck="false"></label>'+
    '<label>Ветка<input type="text" data-gh-branch value="'+esc(git.branch)+'" spellcheck="false"></label>'+
    '<label class="wide">Ключ доступа GitHub (github_pat_…)<input type="password" data-gh-token autocomplete="off" spellcheck="false" placeholder="'+(git.hasToken?"Сохранён — введите новый, чтобы заменить":"github_pat_…")+'"></label></div>'+
    '<label class="ir-ais-check"><input type="checkbox" data-gh-auto'+(git.auto?" checked":"")+dis()+'> Отправлять автоматически после обработки Claude и обучения</label>'+
    '<div class="ir-ais-stats"><div>Ждут отправки<b>'+git.pending+' из '+git.total+' файлов</b></div><div>Последняя отправка<b>'+(git.last?.at?esc(when(git.last.at))+" · "+git.last.files+" файл(ов)":"ещё не было")+'</b></div></div>'+
    (git.lastError?'<div class="ir-ais-note err">Ошибка отправки: '+esc(git.lastError)+'</div>':'')+
    // The closed repository of the data: where everything goes and where the data of the drawings come from.
    (git.data?'<div class="ir-ais-note">Данные чертежей, обучение и чат — в '+(git.data.private?'закрытом':'')+' хранилище <b>'+esc(git.data.repo||"…")+'</b>'+
     (git.data.pulled?.at?'. Данные чертежей получены '+esc(when(git.data.pulled.at))+' · файлов '+git.data.pulled.files:'')+'</div>'+
     (git.data.error?'<div class="ir-ais-note err">Данные чертежей не получены: '+esc(git.data.error)+'</div>':''):'')+
    '<div class="ir-ais-actions"><button type="button" class="ir-ais-btn main" data-gh-save'+dis()+'>Сохранить и проверить</button>'+
    '<button type="button" class="ir-ais-btn" data-gh-push'+dis(!git.hasToken)+'>Отправить сейчас</button>'+
    '<button type="button" class="ir-ais-btn danger" data-gh-clear'+dis(!git.hasToken)+'>Удалить ключ</button></div>'+helpGit(git.repo)+'</section>'
  }
  function render(){
   if(!dlg.isConnected)return;
   const body=dlg.querySelector("[data-body]");
   if(!api){body.innerHTML='<div class="ir-ais-note err">Эта установка IR Project не содержит подключения к Claude. Установите новую версию программы.</div>';return}
   if(!data){body.textContent=notice||"Читаем настройки…";return}
   // Keep open instructions open across re-renders.
   const opened=[...body.querySelectorAll("details[open] summary")].map(s=>s.textContent);
   body.innerHTML=(notice?'<div class="ir-ais-note '+kind+'" role="status">'+esc(notice)+'</div>':'')+claudeCard()+gitCard();
   body.querySelectorAll("details summary").forEach(s=>{if(opened.includes(s.textContent))s.parentElement.open=true});
   if(diag)dlg.querySelector("[data-diag]").textContent="Модули ИИ: "+diag+" · изменение ключей — с паролем администратора";
   bind(body)
  }
  function bind(b){
   const q=s=>b.querySelector(s);
   b.querySelectorAll('input[name="ir-ais-way"]').forEach(r=>r.onchange=()=>{const provider=r.value;action(async()=>{
    if(!await authorize())return;data=await aiInvoke("ai-settings:set-provider",provider);
    status(provider==="claude-code"?(data.claudeCode?.available?"Подключено через Claude Code ("+data.claudeCode.version+").":"Claude Code не найден — откройте инструкцию ниже."):"Подключение через API-ключ.",provider==="claude-code"&&!data.claudeCode?.available?"err":"")})});
   q("[data-model]")&&(q("[data-model]").onchange=e=>{const model=e.target.value;action(async()=>{
    if(data.provider!=="claude-code"&&!data.hasKey){data={...data,model};return}
    if(!await authorize())return;data=await api.setModel(model);status("Модель изменена.")})});
   q("[data-test]")&&(q("[data-test]").onclick=()=>action(async()=>{const c=await api.test();
    status(c.reason?c.reason:(data.provider==="claude-code"?"Claude Code готов: ":"Подключение работает: ")+(c.modelVersion||c.model||""),c.reason?"err":"");data=await api.info()}));
   q("[data-save-key]")&&(q("[data-save-key]").onclick=()=>{const key=q("[data-key]").value.trim(),model=q("[data-model]")?.value;action(async()=>{
    if(!key)throw Error("Вставьте API-ключ");if(!await authorize())return;data=await api.setKey(key,model);const c=await api.test();
    status(c.reason?"Ключ сохранён, но проверка не прошла: "+c.reason:"Ключ сохранён и проверен. Claude готов к работе.",c.reason?"err":"")})});
   q("[data-clear-key]")&&(q("[data-clear-key]").onclick=()=>action(async()=>{if(!await authorize())return;data=await api.clearKey();status("API-ключ удалён с этого компьютера.")}));
   q("[data-gh-save]")&&(q("[data-gh-save]").onclick=()=>{const v={repo:q("[data-gh-repo]").value,branch:q("[data-gh-branch]").value,auto:q("[data-gh-auto]").checked},tk=q("[data-gh-token]").value.trim();if(tk)v.token=tk;
    action(async()=>{if(!await authorize())return;git=await aiInvoke("ai-github:set",v);
     if(git.hasToken){const t=await aiInvoke("ai-github:test");status("Доступ к "+(t?.repo||git.repo)+" ("+(t?.branch||git.branch)+") проверен. "+(git.pending?"Можно отправить: "+git.pending+" файл(ов).":"Отправлять пока нечего."))}
     else status("Настройки сохранены. Вставьте ключ доступа GitHub — инструкция ниже.","warn")})});
   q("[data-gh-auto]")&&(q("[data-gh-auto]").onchange=e=>{const auto=e.target.checked;action(async()=>{if(!await authorize()){git=await aiInvoke("ai-github:info");return}
    git=await aiInvoke("ai-github:set",{auto});status(auto?"Обучение будет отправляться само.":"Автоматическая отправка выключена.")})});
   q("[data-gh-push]")&&(q("[data-gh-push]").onclick=()=>action(async()=>{const r=await aiInvoke("ai-github:push");git=r.info;status(r.sent?"Отправлено на GitHub: "+r.sent+" файл(ов).":"Всё уже отправлено — новых данных нет.")}));
   q("[data-gh-clear]")&&(q("[data-gh-clear]").onclick=()=>action(async()=>{if(!await authorize())return;git=await aiInvoke("ai-github:clear-token");status("Ключ GitHub удалён с этого компьютера.")}));
  }
  render();
  if(api){
   try{data=await api.info()}catch(e){status("Не удалось прочитать настройки: "+String(e.message||e),"err");data={models:[],hasKey:false}}
   // Which AI modules the main process runs: those of the update, or the installed ones when the update failed to start.
   let d=null;try{d=await aiInvoke("ai-diag:info")}catch(_e){}
   diag=d?("обновление "+(d.version||"?")+", запущены "+when(d.startedAt)):"установленные (обновление ИИ не запущено)";
   try{git=await aiInvoke("ai-github:info")}catch(e){
    git={unavailable:true,reason:d?"Главный процесс запущен со старыми модулями. Полностью закройте IR Project (проверьте, что его нет в Диспетчере задач) и откройте снова.":
     "Модули ИИ из обновления не запустились — программа работает на установленных. Пришлите снимок этого окна разработчику; поможет установка новой версии программы."}}
   render()
  }
 }
 window.irAiModelSettings={open};
})();
