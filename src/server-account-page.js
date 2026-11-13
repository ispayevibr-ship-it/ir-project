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
.ir-acc-so[open]{display:flex;flex-direction:column;overflow:hidden;height:min(760px,92vh)}.ir-acc-so>*{flex:none}.ir-acc-so .ir-acc-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;align-content:start;grid-template-columns:minmax(0,1fr)}.ir-acc-so .ir-acc-body>*{min-width:0}
.ir-so-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ir-so-bar input[type=search]{flex:1 1 220px;min-width:0;height:36px;border:1px solid #cfdbe5;border-radius:8px;padding:0 12px;font:inherit;background:#fff;color:#1d3247}
.ir-so-bar input[type=search]:focus{outline:2px solid #176dc1;outline-offset:-1px;border-color:#176dc1}
.ir-so-tabs{display:flex;gap:4px;padding:3px;border-radius:10px;background:#e4ecf3;max-width:100%;overflow-x:auto;scrollbar-width:none}
.ir-so-tabs button{height:30px;padding:0 12px;border:0;border-radius:8px;background:none;color:#3c5568;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.ir-so-tabs button:hover{color:#123f63}
.ir-so-tabs button.on{background:#fff;color:#123f63;box-shadow:0 1px 3px rgba(8,28,48,.15)}
.ir-so-tabs button span{margin-left:5px;color:#7b8f9f;font-weight:500}
.ir-so-sum{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:#4d6a80}
.ir-so-sum b{color:#1d3247}.ir-so-sum .grow{flex:1}
.ir-so-list{display:grid;gap:6px}
.ir-so-obj{display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 14px;border:1px solid #d9e4ee;border-radius:11px;background:#fff;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
.ir-so-obj:hover{border-color:#a9c6df;box-shadow:0 2px 8px rgba(8,28,48,.06)}
.ir-so-obj.on{border-color:#7fb0dc;background:#f5f9fe}
.ir-so-obj input{width:18px;height:18px;margin:0;accent-color:#176dc1;cursor:pointer}
.ir-so-obj .t{min-width:0}
.ir-so-obj b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:650;font-size:13px;line-height:1.35;color:#1d3247}
.ir-so-obj small{display:block;margin-top:2px;color:#6a8396;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ir-so-tags{display:flex;gap:5px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.ir-so-tag{padding:2px 9px;border-radius:20px;background:#eef2f5;color:#5b6b78;font-size:11px;font-weight:650;white-space:nowrap}
.ir-so-tag.done{background:#eef2f5;color:#4f6272}.ir-so-tag.work{background:#e3eefb;color:#1d5c99}.ir-so-tag.prep{background:#fdf1dc;color:#8a5a0b}
.ir-so-tag.site{background:#e2f4ea;color:#1b7448}.ir-so-tag.site::before{content:"";display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:#22a35a;vertical-align:1px}
.ir-so-del{height:24px;padding:0 9px;border:1px solid #efc9c3;border-radius:20px;background:#fff;color:#b4321f;font:inherit;font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap}.ir-so-del:hover{background:#fdecea;border-color:#e59a8f}.ir-so-del:disabled{opacity:.5;cursor:default}
.ir-so-hero{height:24px;padding:0 9px;border:1px solid #cfdbe5;border-radius:20px;background:#fff;color:#2d4a63;font:inherit;font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap}.ir-so-hero:hover{background:#f1f6fb;border-color:#a9c6df}.ir-so-hero.on{background:#fff6e0;border-color:#e6c46a;color:#7a5506}
.ir-hero-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));grid-auto-rows:max-content;align-content:start;gap:12px;max-height:62vh;overflow:auto;padding:4px}
.ir-hero-ph{position:relative;display:flex;flex-direction:column;min-height:max-content;border:2px solid #d9e4ee;border-radius:12px;overflow:hidden;background:#fff;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.ir-hero-ph:hover{border-color:#a9c6df}
.ir-hero-ph.on{border-color:#d9a520;box-shadow:0 0 0 3px #f6e2a6}
.ir-hero-ph img,.ir-hero-no{flex:none;width:100%;aspect-ratio:4/3;height:auto;object-fit:cover;display:block;background:#eef2f5}
.ir-hero-no{display:grid;place-items:center;color:#8a9aa8;font-size:12px}
.ir-hero-mark{flex:none;display:flex;gap:8px;align-items:center;padding:8px 10px;font-size:12px;font-weight:600;color:#4d6a80;border-top:1px solid #e6edf3;white-space:nowrap}
.ir-hero-ph.on .ir-hero-mark{background:#fff6e0;color:#7a5506;border-top-color:#f0d98f}
.ir-hero-mark input{width:17px;height:17px;margin:0;flex:none;accent-color:#c7920f;cursor:pointer}
.ir-hero-ph.on::after{content:"✓";position:absolute;top:8px;right:8px;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#d9a520;color:#fff;font-size:15px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.ir-hero-cov{position:absolute;top:8px;left:8px;padding:2px 9px;border-radius:20px;background:#0f2233cc;color:#fff;font-size:10.5px;font-weight:650}
.ir-hero-ttx{display:none;margin:0 8px 8px;font:inherit;font-size:12.5px;line-height:1.35;padding:6px 9px;border:1px solid #e6c46a;border-radius:8px;resize:vertical;min-height:40px;color:#1d3247;background:#fff;cursor:text}.ir-hero-ph.on .ir-hero-ttx{display:block}.ir-hero-ph.on .ir-hero-ttx:focus{outline:none;border-color:#c7920f;box-shadow:0 0 0 3px #f6e2a6}.ir-hero-ph.on{background:#fff6e0}
.ir-hero-n{font-size:12.5px;color:#4d6a80}
.ir-so-empty{padding:22px;text-align:center;color:#7b8f9f;border:1px dashed #cfdbe5;border-radius:11px;background:#fff}
.ir-so-prog{display:grid;gap:6px;padding:12px 14px;border:1px solid #cfe0ef;border-radius:11px;background:#fff}
.ir-so-prog .row{display:flex;gap:10px;justify-content:space-between;font-size:12.5px;color:#3c5568}.ir-so-prog .row b{color:#1d3247}
.ir-so-prog .track{height:8px;border-radius:5px;background:#e2eaf1;overflow:hidden}
.ir-so-prog .track i{display:block;height:100%;width:0;border-radius:5px;background:linear-gradient(90deg,#176dc1,#3a8fe0);transition:width .4s}
.ir-so-prog.ok .track i{background:#22a35a}.ir-so-prog.err{border-color:#efc9c3}.ir-so-prog.err .track i{background:#d0452f}
.ir-acc-so .ir-acc-foot .ir-acc-btn.link{padding:0}
.ir-toast{position:fixed;z-index:10001;inset:auto 20px 20px auto;margin:0;overflow:visible;display:flex;gap:12px;align-items:flex-start;width:min(380px,calc(100vw - 40px));padding:14px 16px;border-radius:12px;background:#fff;border:1px solid #cfe0ef;border-left:4px solid #22a35a;box-shadow:0 16px 40px rgba(8,28,48,.25);font:13px/1.45 "Segoe UI",system-ui,Arial,sans-serif;color:#1d3247;animation:irToast .25s ease-out}
.ir-toast.err{border-left-color:#d0452f}
.ir-toast b{display:block;margin-bottom:2px}.ir-toast p{margin:0;color:#4d6a80}.ir-toast .grow{flex:1;min-width:0}
.ir-toast button{flex:none;border:0;background:none;color:#7b8f9f;font-size:16px;cursor:pointer;padding:0 2px}
.ir-toast .acts{margin-top:8px;display:flex;gap:8px}
@keyframes irToast{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@media (max-width:640px){.ir-so-obj{grid-template-columns:20px minmax(0,1fr)}.ir-so-tags{grid-column:2;justify-content:flex-start}}
@media (max-width:640px){.ir-acc-row{grid-template-columns:1fr}.ir-acc-person{grid-template-columns:1fr}.ir-acc-person .acts{justify-content:flex-start}}`;
 const ROLE_CSS=`.ir-roles{display:grid;grid-template-columns:210px 1fr;gap:16px;min-height:380px}
.ir-roles-list{display:flex;flex-direction:column;gap:6px;border-right:1px solid #e1e9ef;padding-right:14px}
.ir-roles-list button.r{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;padding:9px 11px;border:1px solid #d7e2ea;border-radius:9px;background:#fff;font:inherit;font-size:13px;color:#16324a;cursor:pointer}
.ir-roles-list button.r:hover{background:#f2f7fb}.ir-roles-list button.r.on{background:#1769e0;border-color:#1769e0;color:#fff}
.ir-roles-list button.r small{font-size:11px;opacity:.75}
.ir-roles-edit label.n{display:block;font-size:11.5px;font-weight:600;color:#3c5568;margin-bottom:10px}
.ir-roles-edit label.n input{display:block;width:100%;margin-top:4px}
.ir-roles-tbl{width:100%;border-collapse:collapse;font-size:13px}
.ir-roles-tbl th{text-align:left;font-size:11px;font-weight:650;color:#5c7285;text-transform:uppercase;letter-spacing:.03em;padding:6px 6px;border-bottom:1px solid #e1e9ef}
.ir-roles-tbl td{padding:5px 6px;border-bottom:1px solid #eef3f7}
.ir-seg{display:inline-flex;border:1px solid #d0dce6;border-radius:8px;overflow:hidden}
.ir-seg button{border:0;background:#fff;padding:5px 10px;font:inherit;font-size:12px;color:#33495c;cursor:pointer}
.ir-seg button+button{border-left:1px solid #d0dce6}
.ir-seg button.on[data-v=edit]{background:#e3f4e8;color:#17663a;font-weight:650}
.ir-seg button.on[data-v=view]{background:#e6f0fa;color:#1d4f75;font-weight:650}
.ir-seg button.on[data-v=none]{background:#f6e7e7;color:#8a2a2a;font-weight:650}
.ir-seg button:disabled{cursor:default;opacity:.7}
.ir-roles-acts{display:flex;flex-direction:column;gap:6px;margin:14px 0 4px}
.ir-roles-sub{font-size:11.5px;font-weight:600;color:#3c5568;margin:14px 0 6px}
@media (max-width:720px){.ir-roles{grid-template-columns:1fr}.ir-roles-list{border-right:0;padding-right:0;flex-direction:row;flex-wrap:wrap}}`;
 const style=doc=>{if(!doc.getElementById(STYLE_ID)){const s=doc.createElement("style");s.id=STYLE_ID;s.textContent=CSS+ROLE_CSS;doc.head.appendChild(s)}};
 const dialog=(doc,cls,html)=>{style(doc);const d=doc.createElement("dialog");d.className="ir-acc "+(cls||"");d.innerHTML=html;doc.body.appendChild(d);d.showModal();
  d.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>d.close());d.addEventListener("close",()=>d.remove(),{once:true});return d};
 const head=(title,text)=>`<div class="ir-acc-head"><div><small>IR PROJECT · СЕРВЕР КОМПАНИИ</small><h2>${esc(title)}</h2>${text?`<p>${esc(text)}</p>`:""}</div><button type="button" class="ir-acc-x" data-close aria-label="Закрыть">✕</button></div>`;

 // The role of the window follows the server; the profile badge shows the name.
 function apply(info){
  state=info||state;
  const u=state?.signedIn?state.user:null;
  if(u&&window.irAccess?.setRole){const want=LOCAL_ROLE[u.role]||"guest";if(irAccess.role()!==want)irAccess.setRole(want)}
  // права роли (Панель администратора → «Роли и права»): разделы и действия в окнах программы
  try{window.irAccess?.setPerms?.(u?u.perms||null:null)}catch{}
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
   `<div class="ir-acc-body"><div data-mail></div><div class="ir-acc-tools"><button type="button" class="ir-acc-btn main" data-add><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Дать доступ</span></button><button type="button" class="ir-acc-btn" data-roles title="Названия ролей и что каждая может: разделы, новые объекты, удаление, выгрузка"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg><span>Роли и права</span></button><button type="button" class="ir-acc-btn" data-site title="Какие объекты показывает сайт компании"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg><span>Сайт</span></button><span class="grow"></span><span class="ir-acc-count" data-count></span><button type="button" class="ir-acc-btn" data-reload><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M20 20v-5h-5"/></svg><span>Обновить</span></button></div>
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
  d.querySelector("[data-roles]").onclick=()=>rolesEditor(d).then(r=>{if(!r)return;info().then(()=>load()).then(()=>{st.className="ir-acc-st ok";st.textContent=r.note})});
  d.querySelector("[data-site]").onclick=()=>siteObjects(d);
  // after the letter — back in the panel, the result above the list
  d.querySelector("[data-add]").onclick=()=>editor(d,{objects}).then(r=>{if(!r)return;load().then(()=>{if(r.note){st.className="ir-acc-st ok";st.textContent=r.note}})});
  // who is in the program — renewed every minute while the panel is open
  const timer=setInterval(()=>{if(!d.open){clearInterval(timer);return}if(d.ownerDocument.querySelectorAll("dialog.ir-acc[open]").length===1)void load()},60e3);
  mailNote();load()
 }

 // «Роли и права» (просьба инженера 12.11.2026 «сделай систему прав настройки прямо в программе, чтобы администратор
 // решал кому какие права и название Администратор, Инженер и тд тоже мог менять»): роли слева, справа — название,
 // по каждому разделу «Изменяет / Просмотр / Скрыт» и действия. Хранится на сервере (server-account.js, roles_config).
 async function rolesEditor(parent){
  let data;try{data=await call("ai-settings:server-roles-get")}catch(e){alert(errText(e));return null}
  const LV=[["edit","Изменяет"],["view","Просмотр"],["none","Скрыт"]];
  const roles=data.roles.map(r=>JSON.parse(JSON.stringify(r)));
  let cur=roles.find(r=>r.id!=="admin")?.id||roles[0].id,seq=0;
  return new Promise(resolve=>{
   let result=null;
   const d=dialog(parent.ownerDocument,"wide ir-acc-scroll",head("Роли и права","Названия ролей и что каждая может. Объекты человеку по-прежнему отмечаются в «Доступ»; роль решает, что он делает в разделах.")+
    `<form data-rolesform><div class="ir-acc-body"><div class="ir-roles"><div class="ir-roles-list" data-list></div><div class="ir-roles-edit" data-edit></div></div><div class="ir-acc-st" data-st></div></div>
    <div class="ir-acc-foot"><button type="button" class="ir-acc-btn" data-letter title="Текст письма, которое человек получает с доступом или новым паролем"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><span>Шаблон письма</span></button><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="button" class="ir-acc-btn main" data-go>Сохранить</button></div></form>`);
   // «Шаблон письма» — здесь, в «Роли и права» (просьба инженера 12.11.2026 «Шаблон письма перенеси в роли и права»)
   d.querySelector("[data-letter]").onclick=()=>letterEditor(d);
   d.addEventListener("close",()=>resolve(result),{once:true});d.querySelector("[data-rolesform]").onsubmit=e=>e.preventDefault();
   const listEl=d.querySelector("[data-list]"),edit=d.querySelector("[data-edit]"),st=d.querySelector("[data-st]");
   const role=()=>roles.find(r=>r.id===cur);
   const paintList=()=>{listEl.innerHTML=roles.map(r=>`<button type="button" class="r ${r.id===cur?"on":""}" data-id="${esc(r.id)}"><span>${esc(r.name||"Без названия")}</span>${r.id==="admin"?"<small>все права</small>":r.builtin?"":"<small>своя</small>"}</button>`).join("")+
    `<button type="button" class="ir-acc-btn small" data-new style="margin-top:6px">＋ Новая роль</button>`;
    listEl.querySelectorAll("button.r").forEach(b=>b.onclick=()=>{cur=b.dataset.id;paint()});
    listEl.querySelector("[data-new]").onclick=()=>{const base=role()&&role().id!=="admin"?role():roles.find(r=>r.id==="foreman");
     const r={id:"new"+(++seq),name:"Новая роль",sections:{...base.sections},actions:{...base.actions}};roles.push(r);cur=r.id;paint();edit.querySelector("[data-name]").select()}};
   const paintEdit=()=>{const r=role(),admin=r.id==="admin";
    edit.innerHTML=`<label class="n">Название роли<input data-name maxlength="60" value="${esc(r.name)}"></label>
     ${admin?'<div class="ir-acc-help">У администратора все права: все объекты и разделы, люди и доступы, роли, сайт. Здесь меняется только название.</div>':`
     <table class="ir-roles-tbl"><thead><tr><th>Раздел объекта</th><th>Право</th></tr></thead><tbody>${data.sections.map(s=>`<tr><td>${esc(s.name)}</td><td><span class="ir-seg" data-sec="${esc(s.key)}">${LV.map(([v,t])=>`<button type="button" data-v="${v}" class="${r.sections[s.key]===v?"on":""}">${t}</button>`).join("")}</span></td></tr>`).join("")}</tbody></table>
     <div class="ir-roles-sub">Действия</div><div class="ir-roles-acts">${data.actions.map(a=>`<label class="ir-acc-check"><input type="checkbox" data-act="${esc(a.key)}" ${r.actions[a.key]?"checked":""}><span>${esc(a.name)}</span></label>`).join("")}</div>
     <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" class="ir-acc-btn small" data-all="edit">Всё изменяет</button><button type="button" class="ir-acc-btn small" data-all="view">Всё только просмотр</button>${r.builtin?"":'<span class="grow"></span><button type="button" class="ir-acc-btn small danger" data-del>Удалить роль</button>'}</div>`}`;
    const nm=edit.querySelector("[data-name]");nm.oninput=()=>{r.name=nm.value;const b=[...listEl.querySelectorAll("button.r")].find(x=>x.dataset.id===r.id)?.querySelector("span");if(b)b.textContent=nm.value||"Без названия"};
    edit.querySelectorAll(".ir-seg").forEach(seg=>seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{r.sections[seg.dataset.sec]=b.dataset.v;seg.querySelectorAll("button").forEach(x=>x.classList.toggle("on",x===b))}));
    edit.querySelectorAll("[data-act]").forEach(c=>c.onchange=()=>{r.actions[c.dataset.act]=c.checked});
    edit.querySelectorAll("[data-all]").forEach(b=>b.onclick=()=>{for(const s of data.sections)r.sections[s.key]=b.dataset.all;paintEdit()});
    edit.querySelector("[data-del]")?.addEventListener("click",()=>{if(!confirm("Удалить роль «"+r.name+"»?"))return;roles.splice(roles.indexOf(r),1);cur=roles.find(x=>x.id!=="admin").id;paint()})};
   const paint=()=>{paintList();paintEdit()};
   paint();
   d.querySelector("[data-go]").onclick=async()=>{
    const go=d.querySelector("[data-go]");go.disabled=true;st.className="ir-acc-st";st.textContent="Сохраняем…";
    try{const r=await call("ai-settings:server-roles-set",{roles:roles.map(r=>({...r,id:/^new\d+$/.test(r.id)?"":r.id}))});
     result={note:"Роли сохранены."+(r.changed?.length?" Права на сервере обновлены: "+r.changed.join(", ")+".":"")+" У других людей новые права — при следующей проверке входа (до 30 минут) или после перезапуска программы."};d.close()}
    catch(e){st.className="ir-acc-st err";st.textContent=errText(e)}finally{go.disabled=false}};
  })
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
 // ---- Объекты на сайте a-ts.kz (the engineer, 10.11.2026 «в панели администратора сделаем отправить на сайт объекты
 // (я выбираю какие), и на сайте вся информация автоматически обновляется (общий тоннаж смонтированный фирмой, общий
 // объем и тд)»). The object as the program shows it → main process (src/site-objects.js) → the server → the site.
 const sarr=v=>Array.isArray(v)?v:[];
 const snum=v=>{const n=Number(String(v??"").trim().replace(/\s/g,"").replace(",","."));return Number.isFinite(n)?n:0};
 const snorm=v=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
 // the same counts as the object's overview (object-overview-top-stats.js): mounted — by the daily reports, the plan —
 // by the marks list or the planned volume of the work type
 const markTotal=x=>{const d=x?.data||x||{},raw=d.total_value??d.total_volume;if(raw!==undefined&&raw!==null&&String(raw).trim()!=="")return snum(raw);return snum(d.qty??d.count)*snum(d.unit_volume??d.volume_one)};
 const reportVolume=w=>{const raw=w?.volume??w?.total_volume,q=snum(w?.qty??w?.count??w?.quantity),hasMark=Boolean(String(w?.mark_id||w?.mark||"").trim());if(raw!==undefined&&raw!==null&&String(raw).trim()!==""){const v=snum(raw);return v||(!hasMark?q:0)}const uv=snum(w?.unit_volume??w?.volume_one);return uv?q*uv:(!hasMark?q:0)};
 async function siteObjectData(o,sort){
  const sec=k=>irProject.data.forObject(o.id).section(k).list().catch(()=>[]);
  const [meta,photos,archive,workTypes,marks,reports]=await Promise.all(["object-meta","photos","archive","work-types","marks","reports"].map(sec));
  const pic=t=>{const d=photos.find(x=>x.record_type===t||x.data?.photo_type===t)?.data;return String(d?.file_path||d?.file||"")};
  const cover=pic("cover"),banner=pic("banner");
  // the years as the card shows them (year of start and of end — archive-objects.js), else the text of the years
  const yy=t=>(String(meta.find(r=>r.record_type===t)?.data?.value||"").match(/\d{4}/g)||[]);
  let [ys]=yy("object_year_start"),[ye]=yy("object_year_end");if(!ys&&!ye){const all=yy("object_years");ys=all[0];ye=all.length>1?all[all.length-1]:""}
  let years=ys&&ye&&ys!==ye?ys+"–"+ye:ys||ye||"",works=[],gallery=[];
  if(meta.some(r=>r.record_type==="object_kind"&&r.data?.value==="archive")){
   works=archive.filter(r=>r.record_type==="work").sort((a,b)=>(snum(a.data?.order)-snum(b.data?.order))||Number(a.id)-Number(b.id))
    .map(r=>{const d=r.data||{};return{name:d.name||r.title||"",unit:d.unit||"",volume:snum(d.volume),plan:snum(d.volume),note:d.note||""}});
   gallery=archive.filter(r=>r.record_type==="photo").sort((a,b)=>Number(a.id)-Number(b.id)).map(r=>String(r.data?.file_path||""))
  }else{
   const facts=new Map(),plans=new Map(),dates=[];
   for(const r of marks){const id=String(r.data?.work_type_id||"");if(id)plans.set(id,(plans.get(id)||0)+markTotal(r))}
   for(const raw of reports){const d=raw.data||{},date=String(d.date||d.report_date||"").slice(0,10);if(/^\d{4}/.test(date))dates.push(date);
    for(const w of sarr(d.items).length?d.items:sarr(d.works)){const id=String(w.work_type_id||"");if(!id||w.accounting_type==="service"||w.is_service===true||snorm(w.unit)==="услуга")continue;
     const v=reportVolume(w);if(v>0)facts.set(id,(facts.get(id)||0)+v)}}
   works=workTypes.map(r=>{const d=r.data||{},id=String(r.id);if(d.accounting_type==="service"||snorm(d.unit)==="услуга")return null;
    return{name:d.work_type||r.title||"",unit:d.unit||"",volume:facts.get(id)||0,plan:plans.get(id)||snum(d.planned_volume??d.plan_volume)}}).filter(w=>w&&w.name&&(w.volume>0||w.plan>0));
   dates.sort();if(!years&&dates.length){const a=dates[0].slice(0,4),b=dates[dates.length-1].slice(0,4);years=a===b?a:a+"–"+b}
   // the photos of the daily reports, the newest first
   const byDate=reports.map(r=>r.data||{}).sort((a,b)=>String(b.date||b.report_date||"").localeCompare(String(a.date||a.report_date||"")));
   for(const d of byDate)for(const p of sarr(d.photos))if(p)gallery.push(String(p))
  }
  return{rid:Number(o.id),name:o.name||"",customer:o.customer||"",general_contractor:o.general_contractor||"",address:o.address||"",
   summary:String(meta.find(r=>r.record_type==="object_summary")?.data?.value||""),status:o.status||"",years,works,cover:cover||banner,photos:[...new Set(gallery.filter(f=>f&&f!==cover&&f!==banner))],skip:[cover,banner].filter(Boolean),hero:heroOf(meta),hero_texts:heroTextsOf(meta),sort}
 }
 // Фото «в шапку сайта» (просьба инженера 12.11.2026 «на каждую фотку можно ставить метку Выводить в шапке сайта»):
 // запись object-meta «site_hero_photos», data.files — пути отмеченных фото. Уходит с объектом на сайт (site-objects.js).
 const HERO="site_hero_photos";
 const heroOf=meta=>sarr(meta.find(r=>r.record_type===HERO)?.data?.files).map(String).filter(Boolean);
 // Текст у каждого фото «в шапку» (просьба инженера 13.11.2026 «текст нужно для каждого фото, у которого галочка на шапку
 // сайта»): data.texts — {путь: текст}. Заполнен — сайт пишет на фото название объекта, текст и годы; пуст — только название.
 const heroTextsOf=meta=>{const t=meta.find(r=>r.record_type===HERO)?.data?.texts,out={};if(t&&typeof t==="object")for(const [k,v] of Object.entries(t)){const s=String(v||"").replace(/\s+/g," ").trim().slice(0,300);if(s)out[k]=s}return out};
 async function setHero(id,files,texts={}){
  const api=irProject.data.forObject(id).section("object-meta"),rows=await api.list().catch(()=>[]),r=rows.find(x=>x.record_type===HERO);
  const body={record_type:HERO,title:"Фото в шапку сайта",data:{entity_type:HERO,files,texts}};
  if(!files.length){if(r)await api.remove(r.id);return}
  if(!r)await api.create(body);else await api.update(r.id,body)
 }
 async function heroPicker(parent,o,done){
  const doc=parent.ownerDocument||document;
  const d=dialog(doc,"wide ir-acc-hero",head("Фото в шапку сайта",o.name||"Объект")+
   `<div class="ir-acc-body"><div class="ir-acc-help">Отметьте фото, которые сайт a-ts.kz показывает в шапке — большими фото первого экрана. Если ни у одного объекта нет отметок, сайт берёт случайные фото. У отмеченного фото — поле «Текст на сайте»: заполнено — на фото название объекта, этот текст и годы работ; пусто — только название. Отметки и тексты уходят на сайт кнопкой «Отправить на сайт».</div>
   <div class="ir-hero-grid" data-grid><div class="ir-so-empty">Загружаем фото…</div></div></div>
   <div class="ir-acc-foot"><span data-n class="ir-hero-n"></span><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="button" class="ir-acc-btn main" data-save>Сохранить</button></div>`);
  const grid=d.querySelector("[data-grid]"),cnt=d.querySelector("[data-n]");
  let data,marked;
  let texts={};
  try{data=await siteObjectData(o,0);marked=new Set(data.hero);texts={...data.hero_texts}}catch(e){grid.innerHTML=`<div class="ir-so-empty">${esc(errText(e))}</div>`;return}
  const files=[data.cover,...data.photos].filter(Boolean);
  const drawN=()=>{cnt.textContent=marked.size?"В шапке: "+marked.size+" из "+files.length:"Фото: "+files.length+", в шапку не отмечено"};
  d.querySelector("[data-save]").onclick=async()=>{try{const keep=files.filter(f=>marked.has(f)),tx={};for(const f of keep){const t=String(texts[f]||"").replace(/\s+/g," ").trim().slice(0,300);if(t)tx[f]=t}await setHero(o.id,keep,tx);done?.(marked.size);d.close()}catch(e){cnt.textContent=errText(e)}};
  if(!files.length){grid.innerHTML=`<div class="ir-so-empty">У объекта пока нет фото</div>`;drawN();return}
  const src=await Promise.all(files.map(f=>irProject.images?.read?irProject.images.read(f).catch(()=>""):Promise.resolve("")));
  grid.innerHTML=files.map((f,i)=>`<label class="ir-hero-ph${marked.has(f)?" on":""}" data-i="${i}">${src[i]?`<img src="${esc(src[i])}" alt="" loading="lazy">`:'<span class="ir-hero-no">нет файла</span>'}<span class="ir-hero-mark"><input type="checkbox" ${marked.has(f)?"checked":""}> В шапку сайта</span><textarea class="ir-hero-ttx" data-t rows="2" maxlength="300" placeholder="Текст на сайте (необязательно)">${esc(texts[f]||"")}</textarea>${f===data.cover?'<span class="ir-hero-cov">обложка</span>':""}</label>`).join("");
  grid.querySelectorAll(".ir-hero-ph").forEach(l=>{const i=l.querySelector("input"),f=files[Number(l.dataset.i)];i.onchange=()=>{if(i.checked)marked.add(f);else marked.delete(f);l.classList.toggle("on",i.checked);drawN();if(i.checked)l.querySelector("[data-t]").focus()};const t=l.querySelector("[data-t]");t.oninput=()=>{texts[f]=t.value}});
  drawN();
 }
 const STATUS_TAG=st=>/заверш/i.test(st)?"done":/подгот/i.test(st)?"prep":"work";
 const objWord=n=>n%10===1&&n%100!==11?"объект":n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?"объекта":"объектов";
 // The notification when the sending ends — one, not two on top of each other (the engineer, 11.11.2026 «их 2 друг на
 // друга накладываются»): the program in front — a card in its corner; the program behind other windows or rolled
 // down — the system notification of Windows only.
 function toast(doc,{title,text,error,site}){
  const front=(()=>{try{return doc.visibilityState!=="hidden"&&doc.hasFocus()}catch{return true}})();
  if(!front){try{if(typeof Notification!=="undefined"&&Notification.permission!=="denied"){const show=()=>new Notification("IR Project — "+title,{body:text,silent:false});
   if(Notification.permission==="granted")return void show();Notification.requestPermission().then(p=>{if(p==="granted")show()}).catch(()=>{});return}}catch{}}
  style(doc);doc.querySelectorAll(".ir-toast").forEach(t=>t.remove());
  const t=doc.createElement("div");t.className="ir-toast"+(error?" err":"");t.setAttribute("role","status");
  t.innerHTML=`<div class="grow"><b>${esc(title)}</b><p>${esc(text)}</p>${site?'<div class="acts"><button type="button" class="ir-acc-btn small" data-open>Открыть сайт</button></div>':""}</div><button type="button" aria-label="Закрыть" data-x>✕</button>`;
  // above an open window of the program: a popover is drawn over modal windows too
  t.setAttribute("popover","manual");doc.body.appendChild(t);
  try{t.showPopover()}catch{t.removeAttribute("popover");const top=[...doc.querySelectorAll("dialog[open]")].pop();if(top)top.appendChild(t)}
  const close=()=>t.remove();t.querySelector("[data-x]").onclick=close;
  t.querySelector("[data-open]")?.addEventListener("click",()=>{call("ai-settings:server-open-site",{}).catch(()=>{});close()});
  setTimeout(close,error?20000:12000);
 }
 let siteSending=false;
 async function siteObjects(parent){
  const doc=parent?.ownerDocument||document;
  const d=dialog(doc,"wide ir-acc-so",head("Сайт","Отметьте объекты, которые показывает сайт компании a-ts.kz. Итоги на сайте считаются сами по отправленным объектам.")+
   `<div class="ir-acc-body">
    <div class="ir-so-bar"><input type="search" data-q placeholder="Поиск по названию, заказчику, адресу"><div class="ir-so-tabs" data-tabs></div></div>
    <div class="ir-so-sum"><span data-onsite></span><span class="grow"></span><button type="button" class="ir-acc-btn small" data-all>Отметить показанные</button><button type="button" class="ir-acc-btn small" data-none>Снять все</button></div>
    <div class="ir-so-prog" data-prog hidden><div class="row"><b data-pt>Готовим отправку…</b><span data-pp>0%</span></div><div class="track"><i data-pb></i></div><div class="row"><span data-ps></span></div></div>
    <div class="ir-acc-st" data-st></div>
    <div class="ir-so-list" data-list><div class="ir-so-empty">Загружаем…</div></div>
    <div class="ir-acc-note">На сайт уходят: название, заказчик, генподрядчик, адрес, статус, годы, виды работ с объёмами (у объекта в работе — смонтировано по ежедневным отчётам), фото объекта и до 30 фотографий. Финансы, письма, акты, схемы и отчёты не уходят. Объект без отметки после отправки убирается с сайта.</div></div>
   <div class="ir-acc-foot"><button type="button" class="ir-acc-btn link" data-open>Открыть сайт a-ts.kz</button><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Закрыть</button><button type="button" class="ir-acc-btn main" data-go>Отправить на сайт</button></div>`);
  const $=q=>d.querySelector(q),st=$("[data-st]"),list=$("[data-list]"),go=$("[data-go]"),prog=$("[data-prog]");
  const bad=e=>{st.className="ir-acc-st err";st.textContent=errText(e)};
  let objects=[],onSite=new Set(),chosen=new Set(),tab="all",q="",heroN=new Map();
  const TABS=[["all","Все"],["done","Завершённые"],["work","В работе"],["prep","Подготовка"],["site","На сайте"]];
  const match=o=>(tab==="all"||(tab==="site"?onSite.has(Number(o.id)):STATUS_TAG(o.status||"")===tab))&&(!q||[o.name,o.customer,o.address].join(" ").toLowerCase().includes(q));
  const shown=()=>objects.filter(match);
  const drawTabs=()=>{$("[data-tabs]").innerHTML=TABS.map(([k,t])=>{const n=k==="all"?objects.length:k==="site"?onSite.size:objects.filter(o=>STATUS_TAG(o.status||"")===k).length;
    return n||k==="all"||k===tab?`<button type="button" class="${k===tab?"on":""}" data-tab="${k}">${t}<span>${n}</span></button>`:""}).join("")};
  const drawCount=()=>{const n=chosen.size;$("[data-onsite]").innerHTML=`Сейчас на сайте: <b>${onSite.size}</b> · Отмечено: <b>${n}</b> из ${objects.length}`;
   go.textContent=n?"Отправить на сайт ("+n+")":"Убрать все объекты с сайта"};
  const draw=()=>{
   drawTabs();drawCount();const rows=shown();
   list.innerHTML=rows.map(o=>{const id=Number(o.id),on=chosen.has(id),tag=STATUS_TAG(o.status||"");
    return`<label class="ir-so-obj${on?" on":""}" data-id="${id}" title="${esc(o.name)}"><input type="checkbox" ${on?"checked":""}><span class="t"><b>${esc(o.name)}</b><small>${esc([o.customer,o.address].filter(Boolean).join(" · ")||"—")}</small></span><span class="ir-so-tags"><button type="button" class="ir-so-hero${heroN.get(id)?" on":""}" data-hero title="Отметить фото этого объекта для шапки сайта">Фото в шапку${heroN.get(id)?" · "+heroN.get(id):""}</button>${onSite.has(id)?'<span class="ir-so-tag site">на сайте</span><button type="button" class="ir-so-del" data-del title="Убрать этот объект с сайта сейчас">Удалить с сайта</button>':""}<span class="ir-so-tag ${tag}">${esc(o.status||"—")}</span></span></label>`}).join("")||
    `<div class="ir-so-empty">${objects.length?"Ничего не найдено":"В программе пока нет объектов"}</div>`;
   list.querySelectorAll("[data-del]").forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();
    const l=b.closest(".ir-so-obj"),id=Number(l.dataset.id),o=objects.find(x=>Number(x.id)===id);
    if(siteSending)return;if(!confirm("Удалить с сайта «"+(o?.name||"объект")+"»? В программе объект остаётся."))return;
    b.disabled=true;b.textContent="Удаляем…";
    try{await call("ai-settings:server-site-remove",{rids:[id]});onSite.delete(id);chosen.delete(id);draw();
     toast(doc,{title:"Объект удалён с сайта",text:"«"+(o?.name||"")+"» больше не показывается на a-ts.kz, итоги сайта пересчитаны.",site:true})}
    catch(err){bad(err);b.disabled=false;b.textContent="Удалить с сайта"}});
   list.querySelectorAll("[data-hero]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();
    const id=Number(b.closest(".ir-so-obj").dataset.id),o=objects.find(x=>Number(x.id)===id);
    if(o)heroPicker(d,o,n=>{heroN.set(id,n);draw()})});
   list.querySelectorAll(".ir-so-obj").forEach(l=>{const i=l.querySelector("input");i.onchange=()=>{const id=Number(l.dataset.id);if(i.checked)chosen.add(id);else chosen.delete(id);l.classList.toggle("on",i.checked);drawCount()}})
  };
  try{
   const [site,all]=await Promise.all([call("ai-settings:server-site-objects"),irProject.data.objects.list()]);
   onSite=new Set(sarr(site?.objects).map(x=>Number(x.rid)));objects=sarr(all);
   chosen=new Set([...onSite].filter(id=>objects.some(o=>Number(o.id)===id)));draw();
   // сколько фото каждого объекта отмечено в шапку — на кнопке строки
   Promise.all(objects.map(async o=>{const m=await irProject.data.forObject(o.id).section("object-meta").list().catch(()=>[]);const n=heroOf(m).length;if(n)heroN.set(Number(o.id),n)})).then(()=>{if(d.isConnected)draw()})
  }catch(e){bad(e);go.disabled=true;list.innerHTML=""}
  $("[data-q]").oninput=e=>{q=e.target.value.trim().toLowerCase();draw()};
  $("[data-tabs]").onclick=e=>{const b=e.target.closest("[data-tab]");if(b){tab=b.dataset.tab;draw()}};
  $("[data-all]").onclick=()=>{shown().forEach(o=>chosen.add(Number(o.id)));draw()};
  $("[data-none]").onclick=()=>{chosen.clear();draw()};
  $("[data-open]").onclick=()=>call("ai-settings:server-open-site",{}).catch(bad);
  const setProg=(pct,title,sub,cls="")=>{prog.hidden=false;prog.className="ir-so-prog"+(cls?" "+cls:"");$("[data-pb]").style.width=Math.max(0,Math.min(100,pct)).toFixed(1)+"%";
   $("[data-pp]").textContent=Math.round(pct)+"%";$("[data-pt]").textContent=title;$("[data-ps]").textContent=sub||""};
  if(siteSending){go.disabled=true;setProg(0,"Идёт отправка на сайт…","Окно можно закрыть — по окончании будет уведомление.")}
  go.onclick=async()=>{
   const ids=objects.filter(o=>chosen.has(Number(o.id))).map(o=>o.id);
   if(!ids.length&&!confirm("Убрать с сайта все объекты?"))return;
   go.disabled=true;siteSending=true;st.textContent="";let timer=0;
   try{
    const data=[];
    for(const [i,id] of ids.entries()){const o=objects.find(x=>String(x.id)===String(id));setProg(ids.length?i/ids.length*10:0,"Собираем данные объектов…",(i+1)+" из "+ids.length+" — "+(o?.name||""));if(o)data.push(await siteObjectData(o,i+1))}
    setProg(10,"Отправляем на сайт…","Окно можно закрыть — по окончании будет уведомление.");
    timer=setInterval(async()=>{try{const s=await call("ai-settings:server-site-status");if(!s.running)return;
     const pct=10+90*(s.units?s.unitsDone/s.units:s.total?s.done/s.total:0);
     setProg(pct,"Отправляем на сайт: объект "+Math.min(s.done+1,s.total)+" из "+s.total,(s.name||"")+(s.photos?" · фото "+Math.min(s.photo,s.photos)+" из "+s.photos:""))}catch{}},500);
    const r=await call("ai-settings:server-site-publish",{objects:data});
    clearInterval(timer);
    onSite=new Set(data.map(o=>o.rid));
    const text="На сайте "+r.sent+" "+objWord(r.sent)+(r.removed?", убрано: "+r.removed:"")+(r.photos?", фото: "+r.photos:"")+". Сайт уже показывает их и пересчитал итоги.";
    setProg(100,"Готово",text,"ok");if(d.isConnected)draw();
    toast(doc,{title:"Объекты отправлены на сайт",text,site:true})
   }catch(e){clearInterval(timer);setProg(100,"Отправка не удалась",errText(e),"err");toast(doc,{title:"Отправка на сайт не удалась",text:errText(e),error:true})}
   siteSending=false;go.disabled=false;
  };
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
   const d=dialog(doc,"wide",head(person?"Доступ: "+(person.name||person.email):"Дать доступ",person?person.email:"Человек получит письмо: логин — почта, пароль — созданный программой (потом сменит сам).")+
    `<form><div class="ir-acc-body"><div class="ir-acc-row"><label>Почта${person?"":" (логин)"}<input name="email" type="email" value="${esc(person?.email||"")}" ${person?"disabled":"required"} placeholder="name@site.kz"></label>
    <label>Имя<input name="name" value="${esc(person?.name||"")}" placeholder="Фамилия Имя"></label></div>
    <label>Роль<select name="role">${Object.entries(roles).map(([k,v])=>`<option value="${k}" ${(person?.roleId||person?.role||"foreman")===k?"selected":""}>${esc(v)}</option>`).join("")}</select></label>
    <div class="ir-acc-help" data-rolehelp></div>
    <div data-objs><div style="font-size:11.5px;font-weight:600;color:#3c5568;margin-bottom:6px">Объекты, которые человек видит</div><div class="ir-acc-objs">${objects.map(objHtml).join("")||'<div class="ir-acc-help">В программе пока нет объектов.</div>'}</div></div>
    <div class="ir-acc-st" data-st></div></div>
    <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-close>Отмена</button><button type="submit" class="ir-acc-btn main" data-go>${person?"Сохранить":"Дать доступ и отправить письмо"}</button></div></form>`);
   d.addEventListener("close",()=>resolve(changed),{once:true});
   const f=d.querySelector("form"),st=d.querySelector("[data-st]"),go=d.querySelector("[data-go]");
   const roleHelp=()=>{const r=(state.roleList||[]).find(x=>x.id===f.role.value)?.level||f.role.value;d.querySelector("[data-rolehelp]").textContent=
    r==="admin"?"Администратор видит и меняет всё и раздаёт доступ другим.":
    r==="pto"?"Видит отмеченные объекты, может заводить новые (свои видит сразу); что меняет в разделах — по правам роли («Роли и права»).":
    r==="foreman"?"Видит отмеченные объекты и разделы; меняет — где отмечено «Может изменять» и где разрешает роль («Роли и права»).":
    "Только смотрит отмеченное, ничего не меняет.";
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
     <div class="ir-acc-line"><i data-sh></i><b>Обучение:</b><span data-sht></span></div>
     <label class="ir-acc-check" style="margin-top:2px"><input type="checkbox" data-share><span>Отправлять разработчику данные проверки чертежей — чтобы программа лучше распознавала (сами PDF не отправляются)</span></label>
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
      <li>Дайте доступ людям: профиль → <b>Панель администратора</b> → <b>«Дать доступ»</b> — почта, имя, роль, объекты и разделы («изменяет» или «просмотр»). Логин и пароль уйдут письмом (нужна почта в Настройках → «Почта»).</li>
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
      <li><b>Обучение</b> (галочка выше): то, что программа узнала при проверке чертежей — ответы ИИ по комплектам, поправки и уроки инженера, журнал, — уходит разработчику через сервер, чтобы распознавание становилось лучше у всех. Сами чертежи и база объектов не отправляются. Спрашивается при первом запуске; у вошедших в программу включено, выключить можно здесь.</li>
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
  async function share(){
   try{const h=await call("ai-settings:server-share-get");q("[data-share]").checked=h.on;q("[data-share]").disabled=h.viaKey;
    dot("[data-sh]",h.error?"err":h.on||h.viaKey?"ok":"");
    q("[data-sht]").textContent=h.viaKey?"уходит напрямую ключом GitHub этого компьютера":!h.on?"не отправляется":h.error?h.error:
     (h.last?"отправлено "+when(h.last.at)+(h.pending?", ждёт: "+h.pending:""):h.pending?"ждёт отправки: "+h.pending:"отправлять пока нечего")}
   catch(e){dot("[data-sh]");q("[data-sht]").textContent=errText(e)}
  }
  q("[data-share]").onchange=async e=>{try{await call("ai-settings:server-share-set",{on:e.target.checked});if(e.target.checked)await call("ai-settings:server-share-send").catch(()=>{})}catch(err){q("[data-sht]").textContent=errText(err)}void share()};
  q("[data-check]").onclick=()=>{void ping();void load();void share()};
  void ping();void load();void share();
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
 // The first start: the consent to send what the program learned (the engineer, 10.11.2026: «Спросить при запуске»).
 async function askShare(){
  let h;try{h=await call("ai-settings:server-share-get")}catch{return}
  if(!h?.ask)return;
  const d=dialog(host().document,"",head("Помочь улучшить распознавание","Один вопрос при первом запуске")+
   `<div class="ir-acc-body"><p style="margin:0">Отправлять разработчику программы данные проверки чертежей? Это то, что программа узнала при распознавании: ответы ИИ по комплектам, ваши поправки и уроки, журнал. По ним распознавание станет точнее у всех.</p>
   <div class="ir-acc-help">Сами PDF-чертежи, база объектов, отчёты и письма <b>не отправляются</b>. Изменить решение можно в Настройках → «Сайт и синхронизация».</div></div>
   <div class="ir-acc-foot"><span class="grow"></span><button type="button" class="ir-acc-btn" data-no>Нет</button><button type="button" class="ir-acc-btn main" data-yes>Да, отправлять</button></div>`);
  const pick=on=>{void call("ai-settings:server-share-set",{on}).catch(()=>{});d.close()};
  d.querySelector("[data-yes]").onclick=()=>pick(true);d.querySelector("[data-no]").onclick=()=>pick(false);
  // closed with ✕ or Esc — asked again next start
  return new Promise(r=>d.addEventListener("close",()=>r(),{once:true}))
 }
 async function start(){
  const s=await check();
  {const h=host();if(!h.__irShareAsked){h.__irShareAsked=true;await new Promise(r=>setTimeout(r,800)).then(askShare)}}
  if(s&&!s.signedIn){let asked=true;try{asked=sessionStorage.getItem("ir-login-asked");sessionStorage.setItem("ir-login-asked","1")}catch{}
   if(!asked)setTimeout(()=>login(host().document,{first:true}),800)}
  setInterval(()=>void check(),30*60e3);
  watchChanges()
 }
 window.irServerAccount={menu,panel,login,changePassword,syncDialog,siteDialog,siteObjects,info,state:()=>state};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>void start(),{once:true});else void start();
})();
