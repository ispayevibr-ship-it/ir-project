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
  api.menu.innerHTML=[...select.options].map((o,i)=>`<button type="button" data-index="${i}" class="${o.selected?"selected":""}${o.dataset.exhausted==="1"?" exhausted":""}" ${o.disabled?"disabled":""}><span>${optionText(o)}</span>${o.selected?'<i>✓</i>':""}</button>`).join("");
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