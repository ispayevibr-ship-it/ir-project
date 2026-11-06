/*
 * IR Project: the 3D of the montage scheme (~1,1 MB) and the HTML report of the object (~0,3 MB) are loaded when they are
 * needed — the scheme opened, «Выгрузить» pressed — not in every tab of the program (the engineer, 06.11.2026 «Я думал
 * так и есть с самого начала» — «Делай»). Their files stay listed in index.html (the versions there are what the pack of
 * schemes changes), as <script type="text/x-ir-lazy" data-lazy="…">: the browser neither loads nor runs them until
 * irLazy(group) puts them on the page, one after another in the order of index.html.
 */
(function(){
 "use strict";
 if(window.irLazy)return;
 var groups={};
 function tag(t){
  if(!t._ir)t._ir=new Promise(function(resolve,reject){
   var s=document.createElement("script");s.src=t.getAttribute("src");s.async=false;
   s.onload=function(){resolve()};
   s.onerror=function(){t._ir=null;s.remove();reject(new Error("Не загрузился модуль "+t.getAttribute("src")))};
   document.head.appendChild(s)
  });
  return t._ir
 }
 function load(group){
  if(groups[group])return groups[group];
  var list=[].slice.call(document.querySelectorAll('script[type="text/x-ir-lazy"]')).filter(function(t){return (" "+(t.getAttribute("data-lazy")||"")+" ").indexOf(" "+group+" ")>=0});
  var p=list.reduce(function(chain,t){return chain.then(function(){return tag(t)})},Promise.resolve());
  groups[group]=p;p.catch(function(){if(groups[group]===p)delete groups[group]});
  return p
 }
 window.irLazy=load;
 // «Выгрузить HTML» of the object: the module comes, then does what it always did (it puts its own irObjectHtmlExport)
 if(!window.irObjectHtmlExport)window.irObjectHtmlExport={lazy:true,save:function(id){
  return load("export").then(function(){
   var x=window.irObjectHtmlExport;if(!x||x.lazy)throw new Error("модуль выгрузки не загрузился");return x.save(id)
  }).catch(function(e){
   var text="Не удалось выгрузить объект: "+String(e&&e.message||e);
   if(typeof window.irProjectNotice==="function")window.irProjectNotice(text,"error");else alert(text);return false
  })
 }};
})();
