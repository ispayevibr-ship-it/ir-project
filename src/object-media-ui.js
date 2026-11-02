"use strict";
(()=>{
  const patchHints=()=>{
    const photo=document.querySelector("#photoPreview")?.closest("label")?.querySelector(".file-hint");
    const banner=document.querySelector("#bannerPreview")?.closest("label")?.querySelector(".file-hint");
    if(photo&&photo.textContent!=="Размер в программе: 900×400 px. После выбора откроется окно подгонки кадра.")photo.textContent="Размер в программе: 900×400 px. После выбора откроется окно подгонки кадра.";
    if(banner&&banner.textContent!=="Размер в программе: 1920×180 px. После выбора откроется окно подгонки кадра.")banner.textContent="Размер в программе: 1920×180 px. После выбора откроется окно подгонки кадра.";
  };
  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;patchHints()});
  };
  const app=document.getElementById("app");
  if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  window.addEventListener("hashchange",schedule);
  schedule();
})();
// Окно подгонки кадра фото (900×400) и баннера (1920×180) объекта: рамка с заданной пропорцией двигается мышью,
// угол рамки и колесо мыши меняют масштаб, ниже — предпросмотр точно так, как картинка встанет в программе.
// Обрезает главный процесс по исходнику (src/object-image-crop.js), исходник хранится для повторной подгонки.
(()=>{
  const SIZES={cover:{width:900,height:400,title:"Фото объекта"},banner:{width:1920,height:180,title:"Баннер объекта"}};
  const ai=()=>window.irProject&&window.irProject.ai;
  const invoke=(ch,arg)=>ai()&&ai().invoke?ai().invoke(ch,arg):Promise.reject(Error("Подгонка кадра появится после обновления программы"));
  const css=`.ir-crop{width:min(980px,94vw);max-width:none;padding:0;border:0;border-radius:14px;box-shadow:0 24px 60px rgba(15,23,42,.35);color:#1f2937;font-family:inherit}
.ir-crop::backdrop{background:rgba(15,23,42,.55)}
.ir-crop-head{display:flex;align-items:baseline;gap:12px;padding:16px 20px 6px}.ir-crop-head h3{margin:0;font-size:16px}.ir-crop-head span{color:#8b95a2;font-size:11px}
.ir-crop-help{padding:0 20px 10px;color:#596473;font-size:11px}
.ir-crop-stage{position:relative;margin:0 20px;height:min(440px,52vh);background:#1a2632;border-radius:10px;overflow:hidden;user-select:none;touch-action:none}
.ir-crop-stage img{position:absolute;pointer-events:none;max-width:none}
.ir-crop-frame{position:absolute;box-shadow:0 0 0 9999px rgba(10,17,27,.62);outline:2px solid #fff;cursor:move}
.ir-crop-frame:before,.ir-crop-frame:after{content:"";position:absolute;inset:0;pointer-events:none;border:1px dashed rgba(255,255,255,.35)}
.ir-crop-frame:before{left:33.33%;right:33.33%;border-top:0;border-bottom:0}.ir-crop-frame:after{top:33.33%;bottom:33.33%;border-left:0;border-right:0}
.ir-crop-handle{position:absolute;width:14px;height:14px;background:#fff;border:2px solid #2563eb;border-radius:3px;z-index:1}
.ir-crop-handle[data-h=nw]{left:-8px;top:-8px;cursor:nwse-resize}.ir-crop-handle[data-h=ne]{right:-8px;top:-8px;cursor:nesw-resize}
.ir-crop-handle[data-h=sw]{left:-8px;bottom:-8px;cursor:nesw-resize}.ir-crop-handle[data-h=se]{right:-8px;bottom:-8px;cursor:nwse-resize}
.ir-crop-tools{display:flex;align-items:center;gap:10px;padding:12px 20px 4px;font-size:12px;color:#596473}.ir-crop-tools input[type=range]{flex:1}
.ir-crop-tools button,.ir-crop-foot button{padding:7px 12px;border:1px solid #d4dbe3;border-radius:8px;background:#fff;font:inherit;font-size:12px;cursor:pointer}
.ir-crop-label{padding:10px 20px 4px;font-size:11px;font-weight:600;color:#596473}
.ir-crop-preview{display:block;margin:0 20px;width:calc(100% - 40px);border:1px solid #dce3ea;border-radius:8px;background:#f5f7f9}
.ir-crop-foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px 18px}.ir-crop-foot .ir-crop-ok{background:#1f2937;color:#fff;border-color:#1f2937}
.ir-crop-foot .ir-crop-msg{margin-right:auto;align-self:center;font-size:11px;color:#b42318}`;
  const style=()=>{if(document.getElementById("irCropStyle"))return;const s=document.createElement("style");s.id="irCropStyle";s.textContent=css;document.head.appendChild(s)};
  // Рамка по умолчанию: наибольшая по центру (так программа резала раньше).
  const fit=(W,H,ratio)=>{const w=Math.min(W,H*ratio),h=w/ratio;return {x:(W-w)/2,y:(H-h)/2,w,h}};
  function open({type,file,crop}={}){
    const size=SIZES[type==="banner"?"banner":"cover"],ratio=size.width/size.height;
    return invoke("ai-settings:image-open",{file}).then(src=>new Promise(resolve=>{
      style();
      const W=src.width,H=src.height,maxW=Math.min(W,H*ratio),minW=Math.min(maxW,Math.max(40,maxW*0.05));
      let r=crop&&crop.w>0&&crop.w<=W+1&&crop.h<=H+1?{x:+crop.x,y:+crop.y,w:+crop.w,h:+crop.w/ratio}:fit(W,H,ratio);
      const d=document.createElement("dialog");d.className="ir-crop";
      d.innerHTML=`<div class="ir-crop-head"><h3>${size.title}: подгонка кадра</h3><span>в программе ${size.width}×${size.height} px · исходник ${W}×${H} px</span></div>
<div class="ir-crop-help">Перетащите рамку на нужную часть картинки. Размер рамки — за угол, колесом мыши или ползунком. Что внутри рамки, то и будет в программе.</div>
<div class="ir-crop-stage"><img alt=""><div class="ir-crop-frame"><i class="ir-crop-handle" data-h="nw"></i><i class="ir-crop-handle" data-h="ne"></i><i class="ir-crop-handle" data-h="sw"></i><i class="ir-crop-handle" data-h="se"></i></div></div>
<div class="ir-crop-tools"><span>Масштаб</span><input type="range" min="0" max="1000" step="1"><button type="button" data-a="fit">Во всю картинку</button><button type="button" data-a="center">По центру</button></div>
<div class="ir-crop-label">Как будет в программе</div><canvas class="ir-crop-preview"></canvas>
<div class="ir-crop-foot"><span class="ir-crop-msg"></span><button type="button" data-a="cancel">Отмена</button><button type="button" class="ir-crop-ok" data-a="ok">Применить</button></div>`;
      document.body.appendChild(d);
      const stage=d.querySelector(".ir-crop-stage"),img=d.querySelector("img"),frame=d.querySelector(".ir-crop-frame"),range=d.querySelector("input[type=range]"),canvas=d.querySelector("canvas"),msg=d.querySelector(".ir-crop-msg");
      let view={k:1,ox:0,oy:0},done=false;
      const clamp=()=>{r.w=Math.max(minW,Math.min(maxW,r.w));r.h=r.w/ratio;r.x=Math.max(0,Math.min(W-r.w,r.x));r.y=Math.max(0,Math.min(H-r.h,r.y))};
      const layout=()=>{const sw=stage.clientWidth,sh=stage.clientHeight,k=Math.min(sw/W,sh/H);view={k,ox:(sw-W*k)/2,oy:(sh-H*k)/2};Object.assign(img.style,{left:view.ox+"px",top:view.oy+"px",width:W*k+"px",height:H*k+"px"});draw()};
      const draw=()=>{clamp();const k=view.k;Object.assign(frame.style,{left:view.ox+r.x*k+"px",top:view.oy+r.y*k+"px",width:r.w*k+"px",height:r.h*k+"px"});
        range.value=String(Math.round(maxW===minW?1000:(maxW-r.w)/(maxW-minW)*1000));
        const cw=Math.max(1,canvas.clientWidth||900),ch=Math.round(cw/ratio),dpr=window.devicePixelRatio||1;
        if(canvas.width!==Math.round(cw*dpr)){canvas.width=Math.round(cw*dpr);canvas.height=Math.round(ch*dpr)}canvas.style.height=ch+"px";
        const s=img.naturalWidth/W,g=canvas.getContext("2d");g.imageSmoothingQuality="high";
        if(img.complete&&img.naturalWidth)g.drawImage(img,r.x*s,r.y*s,r.w*s,r.h*s,0,0,canvas.width,canvas.height)};
      // Масштаб вокруг точки (центр рамки или курсор), чтобы картинка не «уезжала».
      const zoomTo=(w,cx=r.x+r.w/2,cy=r.y+r.h/2)=>{const fx=(cx-r.x)/r.w,fy=(cy-r.y)/r.h;w=Math.max(minW,Math.min(maxW,w));const h=w/ratio;r={x:cx-fx*w,y:cy-fy*h,w,h};draw()};
      let drag=null;
      stage.addEventListener("pointerdown",e=>{const h=e.target.dataset&&e.target.dataset.h;
        const sx=(e.clientX-stage.getBoundingClientRect().left-view.ox)/view.k,sy=(e.clientY-stage.getBoundingClientRect().top-view.oy)/view.k;
        if(h){const ax=h.includes("w")?r.x+r.w:r.x,ay=h.includes("n")?r.y+r.h:r.y;drag={mode:"size",h,ax,ay}}
        else if(e.target===frame)drag={mode:"move",dx:sx-r.x,dy:sy-r.y};
        else{r.x=sx-r.w/2;r.y=sy-r.h/2;draw();drag={mode:"move",dx:r.w/2,dy:r.h/2}}
        stage.setPointerCapture(e.pointerId);e.preventDefault()});
      stage.addEventListener("pointermove",e=>{if(!drag)return;const b=stage.getBoundingClientRect(),sx=(e.clientX-b.left-view.ox)/view.k,sy=(e.clientY-b.top-view.oy)/view.k;
        if(drag.mode==="move"){r.x=sx-drag.dx;r.y=sy-drag.dy;draw();return}
        // Угол: противоположный угол рамки стоит на месте, пропорция сохраняется.
        const left=drag.h.includes("w"),top=drag.h.includes("n");
        let w=Math.max(Math.abs(sx-drag.ax),Math.abs(sy-drag.ay)*ratio);
        w=Math.min(w,maxW,left?drag.ax:W-drag.ax,(top?drag.ay:H-drag.ay)*ratio);w=Math.max(minW,w);const h=w/ratio;
        r={x:left?drag.ax-w:drag.ax,y:top?drag.ay-h:drag.ay,w,h};draw()});
      const stop=()=>{drag=null};stage.addEventListener("pointerup",stop);stage.addEventListener("pointercancel",stop);
      stage.addEventListener("wheel",e=>{e.preventDefault();const b=stage.getBoundingClientRect(),sx=(e.clientX-b.left-view.ox)/view.k,sy=(e.clientY-b.top-view.oy)/view.k;
        const inFrame=sx>=r.x&&sx<=r.x+r.w&&sy>=r.y&&sy<=r.y+r.h;zoomTo(r.w*(e.deltaY>0?1.08:1/1.08),inFrame?sx:undefined,inFrame?sy:undefined)},{passive:false});
      range.addEventListener("input",()=>zoomTo(maxW-(maxW-minW)*Number(range.value)/1000));
      const finish=v=>{if(done)return;done=true;window.removeEventListener("resize",layout);d.close();d.remove();resolve(v)};
      d.addEventListener("cancel",e=>{e.preventDefault();finish(null)});
      d.addEventListener("click",async e=>{const a=e.target.dataset&&e.target.dataset.a;if(!a)return;
        if(a==="fit"){r=fit(W,H,ratio);draw()}else if(a==="center"){r.x=(W-r.w)/2;r.y=(H-r.h)/2;draw()}else if(a==="cancel")finish(null);
        else if(a==="ok"){e.target.disabled=true;msg.textContent="";try{clamp();finish(await invoke("ai-settings:image-crop",{source:file,type,rect:{x:r.x,y:r.y,w:r.w,h:r.h}}))}catch(err){msg.textContent="Не удалось сохранить: "+(err.message||err);e.target.disabled=false}}});
      window.addEventListener("resize",layout);
      img.onload=layout;img.src=src.url;d.showModal();requestAnimationFrame(layout);
    }));
  }
  async function pick(type){const src=await invoke("ai-settings:image-pick");if(!src)return null;return open({type,file:src.file})}
  window.irImageCrop={available:()=>!!(ai()&&ai().invoke),pick,open,forget:file=>file?invoke("ai-settings:image-forget",{file}).catch(()=>false):Promise.resolve(false)};
})();
