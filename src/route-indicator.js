"use strict";
(()=>{
 function routeLabel(){
  const route=(location.hash.slice(1)||"/objects").replace(/^\//,"");
  return route.replace(/\/object\/(\d+)/,"/id$1");
 }
 function update(){let el=document.getElementById("routeIndicator");if(!el){el=document.createElement("div");el.id="routeIndicator";el.className="route-indicator";document.body.appendChild(el)}el.textContent=routeLabel()}
 window.addEventListener("hashchange",update);setInterval(update,500);update();
})();
