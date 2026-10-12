"use strict";
/* IR Project 1.7.101: non-blocking alerts in the tab shell and every iframe.
 * Native window.alert() freezes the Electron window and can leave text inputs
 * without focus after closing the native message.  Existing synchronous
 * confirmations are deliberately left unchanged.
 */
(()=>{
 if(window.__irAlertGuardInstalled)return;
 window.__irAlertGuardInstalled=true;
 const css=document.createElement("style");
 css.textContent=[
  ".ir-notice-stack{position:fixed!important;top:58px!important;right:18px!important;left:auto!important;z-index:2147483647!important;display:grid!important;gap:9px!important;width:min(420px,calc(100vw - 32px))!important;max-height:calc(100vh - 80px)!important;overflow:auto!important;pointer-events:none!important;box-sizing:border-box!important}",
  ".ir-notice{display:flex!important;align-items:flex-start!important;gap:12px!important;border:1px solid #f0c6bf!important;border-left:4px solid #c05248!important;border-radius:10px!important;background:#fffaf8!important;color:#623833!important;box-shadow:0 9px 28px #21364925!important;padding:12px!important;pointer-events:auto!important;box-sizing:border-box!important;font:12px/1.55 system-ui,'Segoe UI',sans-serif!important;white-space:normal!important}",
  ".ir-notice-content{display:grid!important;min-width:0!important;gap:5px!important;flex:1 1 auto!important}",
  ".ir-notice-content strong{font-weight:750!important;color:#99443f!important;font-size:12px!important}",
  ".ir-notice-content span{white-space:pre-wrap!important;overflow-wrap:anywhere!important;user-select:text!important}",
  ".ir-notice-close{flex:0 0 27px!important;display:grid!important;place-items:center!important;width:27px!important;height:27px!important;min-height:27px!important;padding:0!important;border:1px solid #efd2cb!important;border-radius:7px!important;background:#fff!important;color:#a45b53!important;cursor:pointer!important;font:20px/1 system-ui,sans-serif!important}",
  ".ir-notice-close:hover{background:#ffebea!important}",
  ".ir-notice-close:focus-visible{outline:2px solid #428bcd!important;outline-offset:2px!important}",
  "dialog[open]>.ir-notice-stack{top:12px!important;right:12px!important}"
 ].join("\n");
 document.head.append(css);
 const rootForNotice=()=>{
  const opened=[...document.querySelectorAll("dialog[open]")].filter(d=>d.isConnected);
  return opened.at(-1)||document.body||document.documentElement
 };
 function showMessage(message){
  const value=String(message??"");
  const focused=document.activeElement;
  // Reuse the same message area instead of creating an invisible modal.
  const root=rootForNotice();
  let stack=[...root.children].find(x=>x.classList?.contains("ir-notice-stack"));
  if(!stack){stack=document.createElement("div");stack.className="ir-notice-stack";root.append(stack)}
  const note=document.createElement("section");
  note.className="ir-notice";
  note.setAttribute("role","alert");
  const content=document.createElement("div");content.className="ir-notice-content";
  const title=document.createElement("strong");title.textContent="Сообщение IR Project";
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
  // Do not call focus() here: the user must retain focus in the edited field.
  return undefined
 }
 window.alert=showMessage;
 window.irProjectNotice=showMessage
})();
