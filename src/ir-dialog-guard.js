"use strict";
/* IR Project 1.7.101: non-blocking alerts in the tab shell and every iframe; 1.9.71: the keyboard back after a native
 * window.
 * Native window.alert() freezes the Electron window and can leave text inputs
 * without focus after closing the native message.  Existing synchronous
 * confirmations are deliberately left unchanged.
 */
(()=>{
 if(window.__irAlertGuardInstalled)return;
 window.__irAlertGuardInstalled=true;
 const css=document.createElement("style");
 css.textContent=[
  ".ir-notice-stack{position:fixed!important;top:58px!important;right:18px!important;left:auto!important;z-index:2147483647!important;display:grid!important;gap:9px!important;width:min(360px,calc(100vw - 24px))!important;max-height:calc(100vh - 80px)!important;overflow:auto!important;pointer-events:none!important;box-sizing:border-box!important}",
  ".ir-notice{display:flex!important;align-items:flex-start!important;gap:10px!important;border:1px solid #f0c6bf!important;border-left:4px solid #c05248!important;border-radius:10px!important;background:#fffaf8!important;color:#623833!important;box-shadow:0 9px 28px #21364925!important;padding:10px 12px!important;pointer-events:auto!important;box-sizing:border-box!important;font:12px/1.55 system-ui,'Segoe UI',sans-serif!important;white-space:normal!important}",
  ".ir-notice-content{display:grid!important;min-width:0!important;gap:5px!important;flex:1 1 auto!important}",
  ".ir-notice-content strong{font-weight:750!important;color:#99443f!important;font-size:12px!important}",
  ".ir-notice-content span{white-space:pre-wrap!important;overflow-wrap:anywhere!important;user-select:text!important}",
  ".ir-notice-close{flex:0 0 27px!important;display:grid!important;place-items:center!important;width:27px!important;height:27px!important;min-height:27px!important;padding:0!important;border:1px solid #efd2cb!important;border-radius:7px!important;background:#fff!important;color:#a45b53!important;cursor:pointer!important;font:20px/1 system-ui,sans-serif!important}",
  ".ir-notice-close:hover{background:#ffebea!important}",
  ".ir-notice-close:focus-visible{outline:2px solid #428bcd!important;outline-offset:2px!important}",
  ".ir-notice--success{background:#effbf3!important;border-color:#bae7cc!important;border-left-color:#27a96a!important;color:#176b42!important}",
  ".ir-notice--success .ir-notice-content strong{color:#087844!important}",
  ".ir-notice--success .ir-notice-close{border-color:#b7e3c8!important;color:#15844d!important}",
  ".ir-notice--success .ir-notice-close:hover{background:#dff5e7!important}",
  "dialog[open]>.ir-notice-stack{top:12px!important;right:12px!important}"
 ].join("\n");
 document.head.append(css);
 const rootForNotice=()=>{
  const opened=[...document.querySelectorAll("dialog[open]")].filter(d=>d.isConnected);
  return opened.at(-1)||document.body||document.documentElement
 };
 function showMessage(message,type="error"){
  const tone=["success","error","warning","info"].includes(type)?type:"error";
  const value=String(message??"");
  const focused=document.activeElement;
  // Reuse the same message area instead of creating an invisible modal.
  const root=rootForNotice();
  let stack=[...root.children].find(x=>x.classList?.contains("ir-notice-stack"));
  if(!stack){stack=document.createElement("div");stack.className="ir-notice-stack";root.append(stack)}
  const note=document.createElement("section");
  note.className="ir-notice ir-notice--"+tone;
  note.setAttribute("role",tone==="error"?"alert":"status");
  const content=document.createElement("div");content.className="ir-notice-content";
  const title=document.createElement("strong");title.textContent=tone==="success"?"✓ Успешно":tone==="warning"?"Внимание":"Сообщение IR Project";
  const text=document.createElement("span");text.textContent=value;
  const close=document.createElement("button");close.type="button";close.className="ir-notice-close";
  close.textContent="×";close.setAttribute("aria-label","Закрыть сообщение");close.title="Закрыть";
  const dismiss=()=>{
   note.remove();
   if(!stack.childElementCount)stack.remove();
   if(focused?.isConnected&&typeof focused.focus==="function"&&document.activeElement===close){
    try{focused.focus({preventScroll:true})}catch{}
   }
  };
  close.addEventListener("click",dismiss);
  content.append(title,text);note.append(content,close);stack.append(note);
  while(stack.childElementCount>3)stack.firstElementChild?.remove();
  if(tone==="success")window.setTimeout(dismiss,6500);
  // Do not call focus() here: the user must retain focus in the edited field.
  return undefined
 }
 // 1.11.72: every message that reports a done action (saved, exported, sent, deleted…) came through alert() and was
 // shown red as an error. alert() now picks the colour by the text: a success without any failure words is green.
 const FAIL=/не\s+удал|не\s+(сохран|загруж|выгруж|отправ|добав|найд|подтвержд|открыл|подключ|создан|принят|скопир)|ошиб|сбой|нельзя|невозможн|недоступн|запрещ|отклон|прерван|превыш|заблокирован|неверн|нечего/i;
 const DONE=/(сохранен|сохранён|выгружен|загружен|отправлен|добавлен|удален|удалён|создан|скопирован|обновлен|обновлён|подтвержден|подтверждён|импортирован|принят)(а|о|ы)?(?![а-яё])|заверш[её]н|успешно|готово|установлена последняя/i;
 function alertTone(message){
  const text=String(message??"").replace(/ошибок:\s*0(?![0-9])/gi,"");
  return !FAIL.test(text)&&DONE.test(text)?"success":"error"
 }
 window.alert=message=>showMessage(message,alertTone(message));
 window.irProjectAlertTone=alertTone;
 window.irProjectNotice=showMessage
 // Windows: after a native window (a question of confirm(), a file dialog, an error) the program took no keys until it
 // was minimized and opened again. The main process gives the window its keyboard back (ai-settings:refocus in
 // src/ai-ipc.js): after every confirm(), and on a click while the page has no focus; then the field gets it again.
 const program=()=>{try{return window.irProject||window.parent?.irProject||window.opener?.irProject||null}catch{return null}};
 const topFocused=()=>{try{return window.top.document.hasFocus()}catch{return document.hasFocus()}};
 let asked=0;
 function refocus(field,force){
  const now=Date.now();if(!force&&now-asked<500)return;asked=now;
  const invoke=program()?.ai?.invoke;if(typeof invoke!=="function")return;
  Promise.resolve(invoke("ai-settings:refocus",{force:force===true})).then(()=>{
   if(field?.isConnected&&typeof field.focus==="function")try{field.focus({preventScroll:true})}catch{}
  },()=>{})
 }
 const nativeConfirm=window.confirm;
 if(typeof nativeConfirm==="function")window.confirm=function(message){
  const field=document.activeElement,answer=nativeConfirm.call(window,message);
  refocus(field,true);
  return answer
 };
 // A click past an open window closes it (the engineer, 09.11.2026 «все выпадающие окна и открывающиеся окна
 // закрывались после нажатия в другое место»). A window: the click on its dark background outside the frame — it closes
 // as by Esc (the page's own «cancel» runs first); with typed fields it asks first. A window marked data-keep-open stays.
 // A dropdown in the tab bar: a click inside a tab is told to the tab bar as «ir-outside-click» (clicks do not cross frames).
 const typed=new WeakSet();
 document.addEventListener?.("input",e=>{const d=e.target?.closest?.("dialog[open]");if(d)typed.add(d)},true);
 document.addEventListener?.("close",e=>{if(e.target?.tagName==="DIALOG")typed.delete(e.target)},true);
 document.addEventListener?.("pointerdown",event=>{
  const d=event.target;
  if(d?.tagName==="DIALOG"&&d.open&&!d.hasAttribute("data-keep-open")&&event.button===0){
   const r=d.getBoundingClientRect();
   const out=event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;
   if(out){
    event.preventDefault();
    if(typed.has(d)&&!window.confirm("Закрыть окно? Введённое не сохранится."))return;
    const cancel=new Event("cancel",{cancelable:true});d.dispatchEvent(cancel);
    if(!cancel.defaultPrevented&&d.open)d.close();
    return
   }
  }
  try{if(window.parent!==window)window.parent.document.dispatchEvent(new CustomEvent("ir-outside-click"))}catch{}
 },true);
 document.addEventListener?.("pointerdown",event=>{
  if(topFocused())return;
  refocus(event.target?.closest?.("input,textarea,select,[contenteditable]")||null,false)
 },true);
 // The buttons of the window (minimize, maximize, close) are drawn by Windows over the page and are not darkened by
 // the shade of an open window of the program — they looked apart from the program (the engineer, 12.11.2026: «почему
 // скрыть на все закрыть перекрывает так? как будто отдельно от всей программы идут»). While a window with a shade is
 // open in the tab host, the strip under those buttons takes the colour of the shade (ai-settings:window-overlay).
 if(window.top===window&&document.documentElement){
  const BASE=[247,247,247];let last="";
  const shade=()=>{
   let col=null;
   for(const d of document.querySelectorAll("dialog[open]")){
    try{if(!d.matches(":modal"))continue}catch{continue}
    const m=String(getComputedStyle(d,"::backdrop").backgroundColor||"").match(/rgba?\(([^)]+)\)/);if(!m)continue;
    const [r,g,b,a=1]=m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);if(!(a>0))continue;
    col=(col||BASE).map((v,i)=>Math.round([r,g,b][i]*a+v*(1-a)))
   }
   const key=col?col.join(","):"";if(key===last)return;last=key;
   const hex=c=>"#"+c.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,"0")).join("");
   const light=col?(.299*col[0]+.587*col[1]+.114*col[2])>140:true;
   try{const p=window.irProject?.ai?.invoke?.("ai-settings:window-overlay",col?{color:hex(col),symbolColor:light?"#1f2937":"#eef2f6"}:{reset:true});p?.catch?.(()=>{})}catch{}
  };
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;shade()},0)})
   .observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["open"]});
 }
})();
