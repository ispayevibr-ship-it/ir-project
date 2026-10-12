"use strict";
/*
 * Unified building 3D viewer for IR Project.
 * All construction members are derived exclusively from existing scheme records.
 * The faint roof and outline are visual guides, never persisted as building marks.
 * 2D canvas projection: offline, no dependencies or database access.
 */
window.irBuildingView=(()=>{
 const state={yaw:-.75,pitch:.60,zoom:1,panX:0,panY:0,preset:"iso",grid:true,roof:false,placing:false,mark:"",start:null,end:null,hover:"",selected:"",layersOpen:false,markSearch:"",zigzag:false,chainNext:null,hoverAnchor:null,continuing:false,topZ:"",error:"",busy:false,repeat:false,directColumns:true,bent:false,middle:null,colorMode:"status",hiddenSections:[],sectionKey:"",sectionsOpen:false,findQuery:""};
 let observer=null,paint=null,webgl=null,panelsInitialized=false,animationFrame=0,drawFrame=null;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const html=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const pt=(x,y,z)=>({x:Number(x)||0,y:Number(y)||0,z:Number(z)||0});
 const num=v=>Number(v)||0;
 const fmt=n=>Math.round(n).toLocaleString("ru-RU");
 const memberLength=c=>{
  const first=Math.hypot(num(c.geometryType==="bent"?c.mx:c.x2??c.x)-num(c.x),
   num(c.geometryType==="bent"?c.my:c.y2??c.y)-num(c.y),
   num(c.geometryType==="bent"?c.mz:c.z2)-num(c.z0));
  return c.geometryType==="bent"?first+Math.hypot(num(c.x2)-num(c.mx),num(c.y2)-num(c.my),num(c.z2)-num(c.mz)):first;
 };
 // Every distinct mark gets a stable deterministic colour, unaffected by layer
 // filters and placement order. All copies of a mark share one colour.
 const markName=c=>String(c?.mark||c?.mark_name||c?.title||c?.id||"Без марки").trim().toLocaleUpperCase("ru");
 const markColorCache=new Map();
 const markRgb=c=>{
  const key=markName(c),cached=markColorCache.get(key);
  if(cached)return cached;
  let hash=2166136261;
  for(const char of key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619)}
  // Large spread across the spectrum; varied lightness reduces adjacent confusion.
  const hue=((hash>>>0)*.6180339887498949%1)*360,
   saturation=.66+((hash>>>9)%3)*.045,
   lightness=.39+((hash>>>13)%4)*.033;
  const k=n=>(n+hue/30)%12,
   a=saturation*Math.min(lightness,1-lightness),
   channel=n=>lightness-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
  const rgb=[channel(0),channel(8),channel(4)];markColorCache.set(key,rgb);return rgb;
 };
 const markCss=c=>"rgb("+markRgb(c).map(x=>Math.round(x*255)).join(",")+")";
 const dist=(q,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((q.x-a.x)*dx+(q.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(q.x-(a.x+dx*t),q.y-(a.y+dy*t))};

 // Offline WebGL renderer; real 3D prisms, depth testing and per-face lighting.
 // The 2D canvas above it remains a precise picking/placement/annotation layer.
 function makeWebGL(surface){
  const gl=surface.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false,depth:true});
  if(!gl)return null;
  const shader=(type,source)=>{
   const item=gl.createShader(type);gl.shaderSource(item,source);gl.compileShader(item);
   if(!gl.getShaderParameter(item,gl.COMPILE_STATUS)){gl.deleteShader(item);return null}
   return item;
  };
  const vertex=shader(gl.VERTEX_SHADER,
   "attribute vec3 aPosition;attribute vec3 aColor;varying vec3 vColor;void main(){gl_Position=vec4(aPosition,1.0);vColor=aColor;}");
  const fragment=shader(gl.FRAGMENT_SHADER,
   "precision mediump float;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,1.0);}");
  if(!vertex||!fragment)return null;
  const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
  gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);return null}
  const buffer=gl.createBuffer(),position=gl.getAttribLocation(program,"aPosition"),color=gl.getAttribLocation(program,"aColor");
  // Cuboid corners are constant until a scheme record changes. Keep them
  // across camera frames instead of recalculating six faces on every drag.
  const boxCache=new WeakMap();
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d)};
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(v,s)=>v.map(x=>x*s);
  const palette={
   mounted:[.13,.62,.47],partial:[.82,.60,.28],planned:[.78,.42,.47],
   selected:[.12,.45,.95],hover:[.12,.68,.93]
  };
  function render(segments,projection,viewWidth,viewHeight,dpr){
   const width=Math.max(1,Math.round(viewWidth*dpr)),height=Math.max(1,Math.round(viewHeight*dpr));
   if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height}
   gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const data=[],extent=Math.max(40,...segments.map(s=>Math.abs(projection.raw(s.start).depth)),...segments.map(s=>Math.abs(projection.raw(s.end).depth)))*1.65;
   const push=(v,rgb)=>{const p=projection.project(pt(...v));data.push(2*p.x/viewWidth-1,1-2*p.y/viewHeight,-clamp(p.depth/extent,-.95,.95),...rgb)};
   const quad=(corners,rgb,factor)=>{
    const shade=rgb.map((v,i)=>clamp(v*factor+(i===2?.014:0),0,1));
    for(const i of [0,1,2,0,2,3])push(corners[i],shade);
   };
   for(const part of segments){
    const c=part.c,side=part.part||0;
    let cached=boxCache.get(c);
    if(!cached){cached=[];boxCache.set(c,cached)}
    let faces=cached[side];
    if(!faces){
     const a=[part.start.x,part.start.y,part.start.z],b=[part.end.x,part.end.y,part.end.z],
      vector=sub(b,a),len=Math.hypot(...vector);if(len<.5)continue;
     const direction=unit(vector),ref=Math.abs(direction[2])>.78?[0,1,0]:[0,0,1],
      right=unit(cross(direction,ref)),up=unit(cross(direction,right)),
      widthMm=c.geometryType==="column"?180:c.geometryType==="brace"?78:c.geometryType==="truss"?145:115,
      breadth=widthMm*.73,
      outset=[add(mul(right,widthMm),mul(up,breadth)),add(mul(right,-widthMm),mul(up,breadth)),
        add(mul(right,-widthMm),mul(up,-breadth)),add(mul(right,widthMm),mul(up,-breadth))];
     faces=[outset.map(v=>add(a,v)),outset.map(v=>add(b,v))];
     cached[side]=faces;
    }
    const [cornersA,cornersB]=faces,
     rgb=String(c.id)===String(state.selected)?palette.selected:
       String(c.id)===String(state.hover)?palette.hover:
       state.colorMode==="mark"?markRgb(c):palette[c.status]||palette.planned;
    quad([cornersA[0],cornersB[0],cornersB[1],cornersA[1]],rgb,1.17);
    quad([cornersA[1],cornersB[1],cornersB[2],cornersA[2]],rgb,.88);
    quad([cornersA[2],cornersB[2],cornersB[3],cornersA[3]],rgb,.72);
    quad([cornersA[3],cornersB[3],cornersB[0],cornersA[0]],rgb,1.0);
    quad([cornersA[0],cornersA[1],cornersA[2],cornersA[3]],rgb,.81);
    quad([cornersB[3],cornersB[2],cornersB[1],cornersB[0]],rgb,1.28);
   }
   if(!data.length)return;
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
   gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(color);
   gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);
   gl.vertexAttribPointer(color,3,gl.FLOAT,false,24,12);
   gl.drawArrays(gl.TRIANGLES,0,data.length/6);
  }
  return{render,dispose(){
   gl.deleteBuffer(buffer);gl.deleteProgram(program);
   // A new route creates a new surface; release its old GPU context.
   gl.getExtension("WEBGL_lose_context")?.loseContext();
  }};
 }

 function render(host,props){
  if(!panelsInitialized){
   state.layersOpen=window.innerWidth>=1000;
   try{state.colorMode=localStorage.getItem("ir-project-3d-colors")==="mark"?"mark":"status"}catch(_error){}
   panelsInitialized=true
  }
  if(observer){observer.disconnect();observer=null}
  if(animationFrame){window.cancelAnimationFrame(animationFrame);animationFrame=0}
  drawFrame=null;
  if(webgl){webgl.dispose();webgl=null}
  const axesX=props.axesX,axesY=props.axesY,spanX=props.spanX,spanY=props.spanY,
   gridX=props.gridX,gridY=props.gridY,cols=props.elements,marks=props.marks,groups=props.groups;
  const sectionKey="ir-project-3d-sections."+String(props.objectId||"default");
  const sections=[
   ...axesX.slice(0,-1).map((axis,i)=>({
    id:"x:"+axis+":"+axesX[i+1],axis:"X",label:axis+"–"+axesX[i+1],
    center:(num(gridX[axis])+num(gridX[axesX[i+1]]))/2,index:i
   })),
   ...axesY.slice(0,-1).map((axis,i)=>({
    id:"y:"+axis+":"+axesY[i+1],axis:"Y",label:axis+"–"+axesY[i+1],
    center:(num(gridY[axis])+num(gridY[axesY[i+1]]))/2,index:i
   }))
  ];
  if(state.sectionKey!==sectionKey){
   state.sectionKey=sectionKey;state.hiddenSections=[];state.sectionsOpen=false;state.findQuery="";
   try{
    const stored=JSON.parse(localStorage.getItem(sectionKey)||"[]");
    if(Array.isArray(stored))state.hiddenSections=stored.filter(id=>sections.some(a=>a.id===id))
   }catch(_error){}
  }else state.hiddenSections=state.hiddenSections.filter(id=>sections.some(a=>a.id===id));
  const sectionFor=(c,axis)=>{
   const choices=sections.filter(a=>a.axis===axis);
   if(!choices.length)return null;
   const position=axis==="X"?
    c.geometryType==="column"?num(c.x):c.geometryType==="bent"?(num(c.x)+num(c.mx)+num(c.x2))/3:(num(c.x)+num(c.x2))/2:
    c.geometryType==="column"?num(c.y):c.geometryType==="bent"?(num(c.y)+num(c.my)+num(c.y2))/3:(num(c.y)+num(c.y2))/2;
   const coords=axis==="X"?axesX.map(a=>num(gridX[a])):axesY.map(a=>num(gridY[a]));
   // A member on a shared boundary is consistently assigned to one bay.
   const first=choices.find(row=>{
    const lo=Math.min(coords[row.index],coords[row.index+1]),
     hi=Math.max(coords[row.index],coords[row.index+1]);
    return position>=lo-.1&&position<=hi+.1
   });
   return first||choices.reduce((best,row)=>Math.abs(row.center-position)<Math.abs(best.center-position)?row:best,choices[0])
  };
  const visibleMember=c=>!["X","Y"].some(axis=>{
   const band=sectionFor(c,axis);
   return band&&state.hiddenSections.includes(band.id)
  });
  // Bay visibility is stable until a section checkbox changes.
  let visibleKey=null,visibleMembers=null;
  const visibleCols=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(key!==visibleKey||!visibleMembers){visibleKey=key;visibleMembers=cols.filter(visibleMember)}
   return visibleMembers
  };
  const saveSections=()=>{
   try{localStorage.setItem(sectionKey,JSON.stringify(state.hiddenSections))}catch(_error){}
  };
  const markById=id=>marks.find(m=>String(m.id)===String(id));
  const selectedMark=()=>markById(state.mark);
  const leftMark=()=>marks.filter(m=>m.left>0);
  if(!markById(state.mark)||selectedMark()?.left<=0){
   // Keep the chain endpoint when the previous mark is exhausted.
   const next=state.continuing?leftMark().find(m=>m.geometry!=="column"):leftMark()[0];
   if(!next){state.placing=false;state.zigzag=false;state.start=null;state.end=null;state.continuing=false}
   state.mark=next?.id||"";
  }
  const sectionsMarkup=()=>{
   const rows=axis=>'<div class="irb-cut-axis"><b>'+(axis==="X"?"Между цифровыми осями":"Между буквенными осями")+'</b>'+
    sections.filter(s=>s.axis===axis).map(row=>'<label class="irb-cut-row"><input type="checkbox" data-irb-cut="'+html(row.id)+'" '+
     (state.hiddenSections.includes(row.id)?"":"checked")+'><span>'+html(row.label)+'</span></label>').join("")+'</div>';
   return '<details class="irb-cuts" id="irbCuts" '+(state.sectionsOpen?"open":"")+'>'+
    '<summary>Разрезы / участки <small id="irbHiddenCount"></small></summary>'+
    '<p>Снимите галочку, чтобы скрыть конструкции участка между осями. Марки не удаляются.</p>'+
    '<div class="irb-cuts-list">'+rows("X")+rows("Y")+'</div>'+
    '<button type="button" id="irbCutsReset">Показать все участки</button>'+
    '<div class="irb-cuts-result" id="irbCutsResult"></div></details>'
  };
  const header='<div class="irb-panel-head"><b>Слои модели</b></div>';
  host.innerHTML='<div class="irb-wrap"><aside class="irb-layers">'+header+
   '<div class="irb-layer-list">'+groups.map(g=>'<button type="button" class="irb-layer '+(g.visible?'active':'')+'" data-irb-layer="'+html(g.key)+'"><i>'+(g.visible?'✓':'')+'</i><b>'+html(g.label)+'</b><small>'+g.count+'</small></button>').join("")+'</div>'+
   sectionsMarkup()+
   '<section class="irb-find" role="search" aria-label="Поиск конструкций в 3D">'+
    '<label class="irb-find-label" for="irbFindMark">Найти конструкцию</label>'+
    '<div class="irb-find-input-wrap">'+
     '<span class="irb-find-icon" aria-hidden="true">⌕</span>'+
     '<input id="irbFindMark" type="search" autocomplete="off" spellcheck="false" placeholder="Марка, например К41" aria-label="Найти конструкцию по марке" value="'+html(state.findQuery)+'">'+
     '<button id="irbFindClear" class="irb-find-clear" type="button" title="Очистить поиск" aria-label="Очистить поиск">×</button>'+
    '</div>'+
    '<div class="irb-find-actions">'+
     '<span id="irbFindCount" class="irb-find-count" role="status" aria-live="polite">Введите марку</span>'+
     '<div class="irb-find-pager">'+
      '<button id="irbFindPrev" type="button" title="Предыдущая конструкция (Shift+Enter)" aria-label="Предыдущая найденная конструкция">‹</button>'+
      '<button id="irbFindNext" type="button" title="Следующая конструкция (Enter)" aria-label="Следующая найденная конструкция">›</button>'+
     '</div>'+
    '</div>'+
    '<small class="irb-find-hint">Enter — далее · Shift+Enter — назад</small>'+
   '</section>'+
   '<div class="irb-panel-head"><b>Цвет конструкций</b></div>'+
   '<div class="irb-color-modes" role="group" aria-label="Раскраска 3D-модели">'+
    '<button type="button" id="irbColorStatus" aria-pressed="true">По статусу</button>'+
    '<button type="button" id="irbColorMarks" aria-pressed="false">По маркам</button>'+
   '</div>'+
   '<div class="irb-color-caption" id="irbColorCaption">Зелёный — смонтировано, красный — не смонтировано, жёлтый — частично.</div>'+
   '<div class="irb-color-legend" id="irbColorLegend" hidden></div>'+
   '<div class="irb-panel-head"><b>Отображение</b></div>'+
   '<label class="irb-switch"><input type="checkbox" id="irbGrid" '+(state.grid?'checked':'')+'><span>Сетка осей</span></label>'+
   '<label class="irb-switch"><input type="checkbox" id="irbRoof" '+(state.roof?'checked':'')+'><span>Контур кровли (эскиз)</span></label>'+
   '<div class="irb-info"><b>Управление каркасом</b><span>ЛКМ / один палец — вращение. ПКМ / два пальца — перемещение. Колесо / разведение пальцев — масштаб. Щелчок — выбор марки.</span></div>'+
   '<div class="irb-count"><span>'+html(props.scopeLabel||"На схеме")+'</span><strong id="irbVisibleCount">'+visibleCols().length+'</strong><small>Показано из '+cols.length+' размещённых элементов</small></div>'+
   (props.canEdit?'<button type="button" class="irb-add" id="irbStart">＋ Разместить марку</button>':'')+
   '</aside><div class="irb-viewport">'+
   '<canvas id="irbSolid" aria-hidden="true"></canvas><canvas id="irbCanvas" aria-label="Интерактивный 3D-каркас здания"></canvas>'+
   '<div class="irb-view-title"><b>3D-каркас</b><small>Живая модель монтажной схемы · WebGL</small></div>'+
   '<div class="irb-view-modes" id="irbCameraButtons"><button data-irb-camera="iso" type="button">3D</button><button data-irb-camera="top" type="button">Сверху</button><button data-irb-camera="front" type="button">Фасад</button><button data-irb-camera="side" type="button">Сбоку</button></div>'+
   '<div class="irb-tags"><span>● Общая модель здания</span><span>'+fmt(spanX/1000)+' × '+fmt(spanY/1000)+' м · '+axesX.length+' × '+axesY.length+' осей</span></div>'+
   '<label class="irb-camera">Вид <select id="irbView"><option value="iso">Изометрия</option><option value="top">Сверху</option><option value="front">Фасад</option><option value="side">Сбоку</option><option value="free" disabled>Свободный ракурс</option></select></label>'+
   '<div class="irb-hint" id="irbHint"></div>'+
   '<div class="irb-bottom"><div class="irb-legend" id="irbLegend"><i class="green"></i> Смонтировано <i class="red"></i> Не смонтировано <i class="orange"></i> Частично <i class="blue"></i> Выбрано</div>'+
   '<div class="irb-controls"><button type="button" id="irbMinus">−</button><button type="button" id="irbPlus">＋</button><button type="button" id="irbFit">⛶</button></div></div>'+
   '</div><aside class="irb-properties" id="irbProperties"></aside></div>';
  // The panels float over one full-size viewport rather than defining its dimensions.
  const shell=host.querySelector(".irb-wrap"),viewport=host.querySelector(".irb-viewport"),
   layerPanel=host.querySelector(".irb-layers"),detailPanel=host.querySelector(".irb-properties");
  shell.classList.add("irb-immersive");
  viewport.prepend(layerPanel,detailPanel);
  const topControls=document.createElement("div");
  topControls.className="irb-top-actions";
  topControls.innerHTML='<button type="button" id="irbLayerToggle" aria-expanded="'+(state.layersOpen?'true':'false')+'">☷ Слои</button>'+
   '<button type="button" id="irbCutsToggle" title="Скрыть или показать участки каркаса по осям">▤ Разрезы</button>'+
   '<button type="button" id="irbColorToggle" title="Переключить цветовой режим" aria-label="Переключить цветовой режим">◉ Цвет: статус</button>'+
   (props.canEdit?'<button type="button" id="irbQuickAdd" class="irb-top-add">＋ Добавить марку</button>':'');
  viewport.appendChild(topControls);
  const layerClose=document.createElement("button");layerClose.type="button";
  layerClose.className="irb-pane-close";layerClose.textContent="×";layerClose.title="Скрыть слои";
  layerClose.setAttribute("aria-label","Закрыть панель слоёв");
  layerPanel.prepend(layerClose);
  const updateLayers=()=>{
   layerPanel.hidden=!state.layersOpen;
   topControls.querySelector("#irbLayerToggle")?.setAttribute("aria-expanded",state.layersOpen?"true":"false");
  };
  layerClose.onclick=()=>{state.layersOpen=false;updateLayers();paint()};
  topControls.querySelector("#irbLayerToggle").onclick=()=>{state.layersOpen=!state.layersOpen;updateLayers();paint()};
  updateLayers();detailPanel.hidden=true;
  const el=id=>host.querySelector("#"+id),canvas=el("irbCanvas"),ctx=canvas.getContext("2d");
  const colorSummary=()=>{
   const summary=new Map();
   for(const member of visibleCols()){
    const key=markName(member),row=summary.get(key);
    if(row)row.count++;
    else summary.set(key,{key,count:1,rgb:markCss(member)})
   }
   return [...summary.values()].sort((a,b)=>a.key.localeCompare(b.key,"ru",{numeric:true}));
  };
  const showColorMode=()=>{
   const byMark=state.colorMode==="mark",status=el("irbColorStatus"),marksButton=el("irbColorMarks"),
    top=el("irbColorToggle"),caption=el("irbColorCaption"),list=el("irbColorLegend"),footer=el("irbLegend");
   for(const [button,active] of [[status,!byMark],[marksButton,byMark]]){
    if(!button)continue;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))
   }
   if(top){top.textContent=byMark?"◉ Цвет: марки":"◉ Цвет: статус";top.setAttribute("aria-label",byMark?"Сейчас цвета по маркам. Переключить на статус монтажа":"Сейчас цвета по статусу монтажа. Переключить на марки")}
   if(caption)caption.textContent=byMark?"Каждая марка получает свой цвет; повторяющиеся марки одинаковые. Статус монтажа остаётся в свойствах.":"Зелёный — смонтировано, красный — не смонтировано, жёлтый — частично.";
   if(list){
    list.hidden=!byMark;
    if(byMark)list.innerHTML='<div class="irb-color-legend-title">Марки на экране · '+colorSummary().length+'</div>'+
     colorSummary().map(row=>'<div class="irb-color-entry"><i style="background:'+row.rgb+'"></i><span title="'+html(row.key)+'">'+html(row.key)+'</span><small>'+row.count+' шт.</small></div>').join("");
   }
   if(footer)footer.innerHTML=byMark?'<i class="blue"></i> Выбрано <span>· Разные цвета — разные марки</span>':
    '<i class="green"></i> Смонтировано <i class="red"></i> Не смонтировано <i class="orange"></i> Частично <i class="blue"></i> Выбрано';
  };
  const setColorMode=mode=>{
   const next=mode==="mark"?"mark":"status";
   if(state.colorMode===next)return;
   state.colorMode=next;
   try{localStorage.setItem("ir-project-3d-colors",next)}catch(_error){}
   showColorMode();paint();
  };
  el("irbColorStatus").onclick=()=>setColorMode("status");
  el("irbColorMarks").onclick=()=>setColorMode("mark");
  el("irbColorToggle").onclick=()=>setColorMode(state.colorMode==="mark"?"status":"mark");
  showColorMode();
  if(!ctx){el("irbProperties").textContent="3D Canvas недоступен";return}
  webgl=makeWebGL(el("irbSolid"));
  viewport.classList.toggle("irb-webgl",!!webgl);
  if(!webgl){el("irbSolid").hidden=true}
  
  const maxZ=Math.max(7000,8400,...cols.map(c=>Math.max(num(c.z0),num(c.z2),c.geometryType==="bent"?num(c.mz):0)),1);
  const projectFactory=()=>{
   const rect=canvas.getBoundingClientRect(),w=Math.max(260,rect.width),h=Math.max(320,rect.height);
    const smallScreen=window.innerWidth<=820,
    insetL=!smallScreen&&state.layersOpen?Math.min(257,w*.25):0,
    insetR=!smallScreen&&(state.selected||state.placing)?Math.min(305,w*.28):0;
    const safeW=Math.max(200,w-insetL-insetR),centerX=insetL+safeW/2;
   const raw=point=>{
    const x=(point.x-spanX/2)/1000,y=(point.y-spanY/2)/1000,z=(point.z-maxZ/2)/1000;
    const co=Math.cos(state.yaw),si=Math.sin(state.yaw),sp=Math.sin(state.pitch),cp=Math.cos(state.pitch),r=x*si+y*co;
    return {x:x*co-y*si,y:r*sp-z*cp,depth:r*cp+z*sp};
   };
   const vertices=[];for(const x of [0,spanX])for(const y of [0,spanY])for(const z of [0,maxZ*1.23])vertices.push(raw(pt(x,y,z)));
   const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),
    minY=Math.min(...vertices.map(p=>p.y)),maxY=Math.max(...vertices.map(p=>p.y));
   const scale=Math.min((safeW-100)/Math.max(1,maxX-minX),(h-118)/Math.max(1,maxY-minY))*state.zoom;
   const project=point=>{const v=raw(point);return{x:centerX+state.panX+(v.x-(minX+maxX)/2)*scale,y:h/2+state.panY+(v.y-(minY+maxY)/2)*scale,depth:v.depth}};
   return {w,h,raw,project,centerX};
  };
  const pickGeometry=()=>selectedMark()?.geometry==="beam"&&state.bent?"bent":selectedMark()?.geometry||"column";
  const anchorZ=()=>pickGeometry()==="column"?0:maxZ*.94;
  const originAxis=(m,a)=>num(m[a]);
  const anchorPoint=(a,z=a?.z??anchorZ())=>pt(
   Number.isFinite(Number(a?.worldX))?Number(a.worldX):originAxis(gridX,a.x),
   Number.isFinite(Number(a?.worldY))?Number(a.worldY):originAxis(gridY,a.y),z);
  // Independent column-head anchors retain exact X, Y and elevation, even
  // for columns located between grid axes or having different heights.
  let gridAnchorKey=null,gridAnchorCache=null;
  const gridAnchors=()=>{
   const key=pickGeometry();
   if(gridAnchorCache&&gridAnchorKey===key)return gridAnchorCache;
   gridAnchorKey=key;
   gridAnchorCache=axesX.flatMap(x=>axesY.map(y=>({
    kind:"grid",x,y,worldX:originAxis(gridX,x),worldY:originAxis(gridY,y),z:anchorZ(),zConfirmed:key==="column"
   })));
   return gridAnchorCache
  };
  const closest=(axes,map,value)=>axes.reduce((best,a)=>
   Math.abs(originAxis(map,a)-value)<Math.abs(originAxis(map,best)-value)?a:best,axes[0]);
  // Invert the orthographic projection on Z=0: this also allows placing
  // columns between axes, instead of restricting users to grid intersections.
  const groundAt=(x,y,z=0)=>{
   if(Math.abs(Math.sin(state.pitch))<.18)return null; // front/side views are edge-on
   const project=projectFactory().project,o=project(pt(0,0,z)),
    xp=project(pt(1000,0,z)),yp=project(pt(0,1000,z)),
    xx=xp.x-o.x,xy=xp.y-o.y,yx=yp.x-o.x,yy=yp.y-o.y,
    det=xx*yy-yx*xy;
   if(Math.abs(det)<.01)return null;
   const dx=x-o.x,dy=y-o.y,
    worldX=Math.round(1000*(dx*yy-dy*yx)/det),
    worldY=Math.round(1000*(xx*dy-xy*dx)/det);
   if(worldX<0||worldX>spanX||worldY<0||worldY>spanY)return null;
   return{kind:"ground",x:closest(axesX,gridX,worldX),y:closest(axesY,gridY,worldY),
    worldX,worldY,z,zConfirmed:pickGeometry()==="column"};
  };
  const columnOccupied=a=>!!a&&cols.some(c=>c.geometryType==="column"&&
   Math.hypot(num(c.x)-num(a.worldX),num(c.y)-num(a.worldY))<25&&Math.abs(num(c.z0)-num(a.z))<25);
  let memberAnchorKey=null,memberAnchorCache=null,columnAnchorCache=null;
  const updateAttachmentAnchors=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(memberAnchorKey===key&&memberAnchorCache&&columnAnchorCache)return;
   memberAnchorKey=key;
   const visible=visibleCols();
   columnAnchorCache=visible.filter(c=>c.geometryType==="column").map(c=>{
    const x=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x));
    const y=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
    return {kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
     x,y,worldX:num(c.x),worldY:num(c.y),z:num(c.z2),zConfirmed:true,minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
   });
   memberAnchorCache=visible.filter(c=>c.geometryType!=="column").flatMap(c=>
    [{worldX:num(c.x),worldY:num(c.y),z:num(c.z0)},...(c.geometryType==="bent"?[{worldX:num(c.mx),worldY:num(c.my),z:num(c.mz)}]:[]),{worldX:num(c.x2),worldY:num(c.y2),z:num(c.z2)}].map(v=>({
     kind:"member",memberId:String(c.id),label:String(c.mark||"Элемент"),
     x:closest(axesX,gridX,v.worldX),y:closest(axesY,gridY,v.worldY),...v,zConfirmed:true
    }))
   );
  };
  const columnAnchors=()=>{updateAttachmentAnchors();return columnAnchorCache};
  const memberAnchors=()=>{updateAttachmentAnchors();return memberAnchorCache};
  const memberSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=11,hit=null;
   for(const s of memberSegments()){
    if(s.c.geometryType==="column")continue;
    const a=project(s.start),b=project(s.end),dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    if(den<20)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/den,0,1),distance=Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
    if(distance>best)continue;
    const px=s.start.x+(s.end.x-s.start.x)*t,py=s.start.y+(s.end.y-s.start.y)*t;
    best=distance;hit={kind:"member",memberId:String(s.c.id),memberPart:s.part,label:String(s.c.mark||"Элемент"),
     x:closest(axesX,gridX,px),y:closest(axesY,gridY,py),worldX:Math.round(px),worldY:Math.round(py),
     z:Math.round(s.start.z+(s.end.z-s.start.z)*t),zConfirmed:true};
   }
   return hit;
  };
  const availableAnchors=()=>pickGeometry()==="column"?gridAnchors():[...gridAnchors(),...columnAnchors(),...memberAnchors()];
  const columnSegmentHit=(x,y)=>{
   if(pickGeometry()==="column")return null;
   const project=projectFactory().project;let best=12,hit=null;
   for(const c of visibleCols()){
    if(c.geometryType!=="column")continue;
    const a=project(pt(c.x,c.y,c.z0)),b=project(pt(c.x,c.y,c.z2)),
     dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy;
    if(length2<25)continue;
    const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/length2,0,1),
     distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(distance>best)continue;
    const xAxis=axesX.includes(String(c.axisX))?String(c.axisX):closest(axesX,gridX,num(c.x)),
     yAxis=axesY.includes(String(c.axisY))?String(c.axisY):closest(axesY,gridY,num(c.y));
    best=distance;
    hit={kind:"column",columnId:String(c.id),label:String(c.mark||"Колонна"),
     x:xAxis,y:yAxis,worldX:num(c.x),worldY:num(c.y),
     z:Math.round(num(c.z0)+(num(c.z2)-num(c.z0))*t),zConfirmed:true,
     minZ:Math.min(num(c.z0),num(c.z2)),maxZ:Math.max(num(c.z0),num(c.z2))}
   }
   return hit;
  };
  // Choose the closest projected member instead of always prioritising a column.
  const segmentHit=(x,y)=>{
   const hits=[columnSegmentHit(x,y),memberSegmentHit(x,y)].filter(Boolean);
   if(hits.length<2)return hits[0]||null;
   const project=projectFactory().project;
   const d=a=>{const p=project(anchorPoint(a));return Math.hypot(p.x-x,p.y-y)};
   return d(hits[0])<=d(hits[1])?hits[0]:hits[1];
  };
  const sameAnchor=(a,b)=>Boolean(a&&b&&Math.hypot(num(a.worldX)-num(b.worldX),num(a.worldY)-num(b.worldY),num(a.z)-num(b.z))<1);
  let segmentsKey=null,segmentsCache=null;
  const memberSegments=()=>{
   const key=state.hiddenSections.join("\u001f");
   if(segmentsCache&&segmentsKey===key)return segmentsCache;
   segmentsKey=key;
   segmentsCache=visibleCols().flatMap(c=>{
    const start=pt(c.x,c.y,c.z0),end=pt(c.geometryType==="column"?c.x:c.x2,c.geometryType==="column"?c.y:c.y2,c.z2);
    if(c.geometryType==="bent"){const mid=pt(c.mx,c.my,c.mz);return[{c,start,end:mid,part:0},{c,start:mid,end,part:1}]}
    return[{c,start,end,part:0}];
   });
   return segmentsCache
  };
  const paintLabel=(p,label,border)=>{ctx.font="700 10px Segoe UI,Arial";const w=Math.max(24,ctx.measureText(label).width+15);ctx.fillStyle="#fff";ctx.strokeStyle=border;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(p.x-w/2,p.y-25,w,20,5);ctx.fill();ctx.stroke();ctx.fillStyle="#24649a";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,p.x,p.y-15)};
  const line=(a,b,color,width=1,dash=[])=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([])};
  const circle=(p,r,color)=>{ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()};
  const outline=(m)=>{
   const p=m.project;
   const floor=[p(pt(0,0,0)),p(pt(spanX,0,0)),p(pt(spanX,spanY,0)),p(pt(0,spanY,0))];
   if(state.grid){
    ctx.fillStyle="rgba(217,233,249,.27)";ctx.strokeStyle="rgba(146,182,215,.52)";ctx.lineWidth=1;ctx.beginPath();floor.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fill();ctx.stroke();
    for(const ax of axesX){const x=originAxis(gridX,ax);line(p(pt(x,0,0)),p(pt(x,spanY,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(x,-Math.max(1000,spanY*.03),0)),ax,"#c8d8e8")}
    for(const ay of axesY){const y=originAxis(gridY,ay);line(p(pt(0,y,0)),p(pt(spanX,y,0)),"#d1e0ed",.8,[3,4]);paintLabel(p(pt(-Math.max(1000,spanX*.03),y,0)),ay,"#c8d8e8")}
   }
   if(state.roof){
    const roof=y=>maxZ*.94+Math.min(2200,maxZ*.17)*(1-Math.abs(y-spanY/2)/Math.max(1,spanY/2));
    const rf=(x,y)=>p(pt(x,y,roof(y)));
    for(const y of [0,spanY/2,spanY])line(rf(0,y),rf(spanX,y),"rgba(92,154,203,.48)",1.15,[5,5]);
    for(const ax of axesX){const x=originAxis(gridX,ax);line(rf(x,0),rf(x,spanY/2),"rgba(107,156,200,.37)",1,[4,6]);line(rf(x,spanY/2),rf(x,spanY),"rgba(107,156,200,.37)",1,[4,6])}
    for(const x of [0,spanX])for(const y of [0,spanY])line(p(pt(x,y,0)),rf(x,y),"rgba(104,155,200,.28)",1,[5,6]);
   }
  };
  let projectedSegments=[];
  paint=()=>{
   const rect=canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return;
   const dpr=Math.min(1.5,window.devicePixelRatio||1),w=Math.floor(rect.width*dpr),h=Math.floor(rect.height*dpr);
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.lineJoin="round";ctx.lineCap="round";
   const m=projectFactory();outline(m);
   const segments=memberSegments().map(s=>({...s,a:m.project(s.start),b:m.project(s.end),depth:(m.raw(s.start).depth+m.raw(s.end).depth)/2}));
   if(!webgl)segments.sort((a,b)=>a.depth-b.depth);
   projectedSegments=segments;
   if(webgl)webgl.render(segments,m,rect.width,rect.height,dpr);
   for(const s of segments){
    const chosen=String(s.c.id)===String(state.selected),hover=String(s.c.id)===String(state.hover),
     color=chosen?"#2879df":hover?"#168fca":state.colorMode==="mark"?markCss(s.c):
      s.c.status==="mounted"?"#2e9b7b":s.c.status==="partial"?"#c4a051":"#c16670";
    const width=s.c.geometryType==="column"?7:s.c.geometryType==="truss"?6:s.c.geometryType==="brace"?3.7:4.8;
    if(!webgl){
     line(s.a,s.b,"rgba(35,63,87,.25)",width+2);line(s.a,s.b,color,width);
     line({x:s.a.x-1.15,y:s.a.y-1.15},{x:s.b.x-1.15,y:s.b.y-1.15},"rgba(255,255,255,.5)",Math.max(1,width*.25));
    }
    if(!webgl&&s.c.geometryType==="truss"){
     const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,len=Math.max(1,Math.hypot(dx,dy)),ox=-dy/len*6,oy=dx/len*6;
     line({x:s.a.x+ox,y:s.a.y+oy},{x:s.b.x+ox,y:s.b.y+oy},color,2.5);
     const steps=Math.max(2,Math.min(9,Math.round(len/35)));
     for(let i=0;i<steps;i++)line({x:s.a.x+dx*i/steps,y:s.a.y+dy*i/steps},{x:s.a.x+dx*(i+1)/steps+ox*(i%2),y:s.a.y+dy*(i+1)/steps+oy*(i%2)},color,1.2);
    }
    if(s.part===0&&(chosen||props.showLabels&&segments.length<120))paintLabel({x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2},String(s.c.mark||"?"),chosen?"#2c85e9":"#c7d9e9");
   }
   if(state.placing){
    // Free grid nodes are small; real column heads are prominent blue points.
    for(const a of gridAnchors()){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.middle)||sameAnchor(a,state.end);
     circle(q,selected?5.8:2.7,selected?"#ed9a2b":"rgba(88,143,194,.62)");
    }
    if(pickGeometry()!=="column")for(const a of [...columnAnchors(),...memberAnchors()]){
     const q=m.project(anchorPoint(a)),selected=sameAnchor(a,state.start)||sameAnchor(a,state.middle)||sameAnchor(a,state.end);
     circle(q,selected?8.5:6.2,"#fff");
     circle(q,selected?6.2:4.5,selected?"#ee9a25":"#217ce7");
    }
    if(state.hoverAnchor&&!sameAnchor(state.hoverAnchor,state.start)&&!sameAnchor(state.hoverAnchor,state.middle)&&!sameAnchor(state.hoverAnchor,state.end)){
     const hover=m.project(anchorPoint(state.hoverAnchor));
     circle(hover,7,"#fff");circle(hover,5,"#e89927")
    }
    if(pickGeometry()==="column"&&state.directColumns){
     const anchor=state.hoverAnchor||state.start;
     if(anchor){
      const height=Number(state.topZ),valid=state.topZ!==""&&Number.isFinite(height)&&height>num(anchor.z),
       previewZ=valid?height:maxZ*.94,occupied=columnOccupied(anchor);
      const a=m.project(anchorPoint(anchor)),b=m.project(anchorPoint(anchor,previewZ)),
       color=occupied?"#c94c4c":valid?"#168ee0":"#b68e45";
      line(a,b,"rgba(255,255,255,.88)",10);
      line(a,b,color,6,[9,5]);circle(a,8,"#fff");circle(a,5.5,color);
      ctx.font="800 11px Segoe UI,Arial";ctx.textAlign="left";ctx.textBaseline="middle";
      const text=occupied?"Место занято":valid?String(selectedMark()?.mark||selectedMark()?.title||"Колонна"):"Задайте верх Z";
      const tw=Math.min(180,ctx.measureText(text).width+16),tx=Math.min(m.w-tw-6,Math.max(5,b.x+12)),ty=Math.max(6,Math.min(m.h-26,b.y-12));
      ctx.fillStyle="rgba(255,255,255,.95)";ctx.fillRect(tx,ty,tw,23);
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(tx,ty,tw,23);
      ctx.fillStyle=color;ctx.fillText(text,tx+8,ty+12,tw-12);
     }
    }else if(state.start){
     const a=m.project(anchorPoint(state.start));
     if(pickGeometry()==="bent"){
      const middle=state.middle?m.project(anchorPoint(state.middle)):state.hoverAnchor?m.project(anchorPoint(state.hoverAnchor)):null,
       end=state.end?m.project(anchorPoint(state.end)):state.middle&&state.hoverAnchor?m.project(anchorPoint(state.hoverAnchor)):null;
      if(middle){line(a,middle,"#e5982e",4,[7,4]);circle(middle,5.8,"#e5982e")}
      if(middle&&end){line(middle,end,"#e5982e",4,[7,4]);circle(end,5.8,"#e5982e")}
     }else{
      const b=m.project(pickGeometry()==="column"?anchorPoint(state.start,maxZ*.94):state.end?anchorPoint(state.end):anchorPoint(state.start));
      line(a,b,"#e5982e",4,[7,4]);if(state.end)circle(b,5.8,"#e5982e");
     }
     circle(a,5.8,"#e5982e");
    }
   };
  };
  // Batch pointer/zoom/resize requests into a single draw per display frame.
  drawFrame=paint;
  paint=()=>{
   if(animationFrame)return;
   const current=drawFrame;
   animationFrame=window.requestAnimationFrame(()=>{
    animationFrame=0;
    if(drawFrame===current)current()
   });
  };
  // Fast hover picking uses the projected segments from the last frame.
  const nearestMember=(x,y)=>{
   const point={x,y};let best=null,distance=14;
   for(const s of projectedSegments){const d=dist(point,s.a,s.b);if(d<distance){distance=d;best=s.c}}
   return best;
  };
  const nearestAxis=(x,y)=>{
   const m=projectFactory();let best=null,minScore=18;
   for(const a of availableAnchors()){
    const q=m.project(anchorPoint(a)),d=Math.hypot(q.x-x,q.y-y);
    if(d>19)continue;
    const score=d-(a.kind==="column"?3:0);
    if(score<minScore){minScore=score;best=a}
   }
   const segment=segmentHit(x,y);
   if(pickGeometry()==="column")return best||groundAt(x,y);
   const snap=segment&&(!best||minScore>5)?segment:best;
   return snap||(pickGeometry()==="bent"?groundAt(x,y,anchorZ()):null)
  };
  const position=a=>a?html((a.kind==="column"||a.kind==="member"?a.label+" · крепление · ":a.kind==="ground"?"Между осями · ":"Ось ")+a.x+" / "+a.y+
   " · X "+fmt(a.worldX)+" · Y "+fmt(a.worldY)+" · Z "+(a.zConfirmed===false?"нужно указать":fmt(a.z)+" мм")+
   (a.kind==="ground"?" · смещение X "+fmt(num(a.worldX)-originAxis(gridX,a.x))+" / Y "+fmt(num(a.worldY)-originAxis(gridY,a.y))+" мм":a.kind==="grid"?" (сетка)":"")):"Выберите точку на модели";
  const searchMatches=m=>!state.markSearch.trim()||String(m.title+" "+(m.mark||"")).toLocaleLowerCase("ru").includes(state.markSearch.trim().toLocaleLowerCase("ru"));
  const markOptions=()=>'<option value="">Выберите марку</option>'+
   marks.filter(searchMatches).map(a=>'<option value="'+html(a.id)+'" '+(a.left>0?"":"disabled")+
   ' '+(a.id===state.mark?"selected":"")+'>'+html(a.title)+' · остаток '+a.left+
   (a.left?"":" · НЕТ ОСТАТКА")+'</option>').join("");
  const matchedCount=()=>marks.filter(searchMatches).length;
  const zEditor=(a,index)=>a?
   '<label class="irb-level">Отметка Z, мм<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-irb-level="'+index+
   '" value="'+(a.zConfirmed===false?"":Math.round(num(a.z)))+'" placeholder="Отметка по КМД" aria-label="Отметка Z в миллиметрах">'+
   '<small class="irb-level-feedback" hidden></small></label>':"";
  let commitQuickPlacement=()=>{};
  const updateHoverInfo=()=>{
   const field=el("irbHoverPosition");if(!field)return;
   field.textContent=state.hoverAnchor?position(state.hoverAnchor):"Наведите курсор на точку установки на каркасе";
   field.classList.toggle("occupied",columnOccupied(state.hoverAnchor));
  };
  const updateHint=()=>{
   const column=selectedMark()?.geometry==="column";
   const hasHeight=state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>0;
   el("irbHint").textContent=!state.placing?"ЛКМ — вращение · колесо — масштаб · нажатие на элемент — свойства":
    column&&state.directColumns?(!hasHeight?"Сначала задайте «Верх Z, мм» · затем щёлкните по месту колонны":
     "Наведите курсор — появится колонна · щелчок — установить · перетаскивание — вращать"):
    pickGeometry()==="bent"?(!state.start?"1. Выберите начало балки":!state.middle?"2. Выберите конёк / излом":!state.end?"3. Выберите конец балки":"Проверьте три отметки Z и сохраните одну марку"):
    !state.start?"1. Выберите начальную точку":column||state.end?"Проверьте отметки и нажмите «Сохранить на схеме»":"2. Выберите конечную точку";
  };
  function refreshPanel(){
   const m=selectedMark(),left=num(m?.left),column=m?.geometry==="column",available=left>0;
   updateHint();
   const pane=el("irbProperties"),previousScroll=pane.scrollTop,previousMode=pane.dataset.irbPanelMode;
    const readyToSave=()=>!!(state.start&&selectedMark()?.left>0&&(column||state.end)&&state.start.zConfirmed!==false&&
     (column?state.topZ!==""&&Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(state.start.z):
      state.end?.zConfirmed!==false&&(pickGeometry()!=="bent"||state.middle&&state.middle.zConfirmed!==false)));
   const ready=readyToSave();
   const current=cols.find(c=>String(c.id)===String(state.selected));
   pane.hidden=!state.placing&&!current;
   if(state.placing){
    pane.innerHTML='<div class="irb-panel-head"><b>Размещение элемента</b><small>НОВАЯ МАРКА</small></div>'+
    '<label class="irb-field">Поиск марки<input type="search" id="irbMarkSearch" autocomplete="off" spellcheck="false" placeholder="Марка или наименование…" aria-label="Поиск марки для размещения" value="'+html(state.markSearch)+'"></label>'+
    '<label class="irb-field">Марка из ведомости<select id="irbMark">'+markOptions()+'</select><small>Найдено: '+matchedCount()+' из '+marks.length+'</small></label>'+
    '<div class="irb-placement-type"><span>Тип выбранной марки</span><b>'+html(column?"Колонна / стойка":m?.geometry==="brace"?"Связь / раскос":m?.geometry==="truss"?"Ферма":"Балка / ригель / прогон")+'</b>'+
     (!column?'<small>Для установки колонн щелчком выберите марку из категории «Колонны», «Фахверки» или «Стойки».</small>':"")+'</div>'+
    (m?.geometry==="beam"?'<label class="irb-zigzag"><input id="irbBentMode" type="checkbox" '+(state.bent?"checked":"")+'><span><b>Ломаная балка (3 точки)</b><small>Начало → конёк → конец. Два ската считаются одной отправочной маркой.</small></span></label>':"")+
    '<div class="irb-quota">По ведомости: '+num(m?.total)+' шт.<br>На схеме: '+num(m?.placed)+' шт.<br><b>Осталось: '+left+' шт.</b></div>'+
    (column?'<div class="irb-direct-info"><b>Установка колонн на каркасе</b><span>Укажите верх Z по КМД. Затем наведите мышь на модель: появится контур колонны. Один щелчок размещает её на выбранной точке, в том числе между осями.</span></div>'+
    '<label class="irb-click-toggle"><input type="checkbox" id="irbClickPlace" '+(state.directColumns?"checked":"")+'><span>Устанавливать колонны щелчком</span></label>'+
    '<div class="irb-hover-position" id="irbHoverPosition"></div>':"")+
    '<div class="irb-anchor"><b>1. Начало</b><span>'+position(state.start)+'</span>'+zEditor(state.start,"start")+'</div>'+
    (pickGeometry()==="bent"?'<div class="irb-anchor"><b>2. Конёк / излом</b><span>'+position(state.middle)+'</span>'+zEditor(state.middle,"middle")+'</div>':"")+
    '<div class="irb-anchor"><b>'+(pickGeometry()==="bent"?"3. Конец":column?"2. Верх колонны":"2. Конец")+'</b><span>'+(column?"Укажите проектную отметку":position(state.end))+'</span>'+(column?'<label class="irb-level">Верх Z, мм<input type="number" step="1" id="irbTopZ" placeholder="По КМД" value="'+html(state.topZ)+'"></label>':zEditor(state.end,"end"))+'</div>'+
    (typeof props.onQuickPlace==="function"?'<label class="irb-zigzag"><input id="irbRepeat" type="checkbox" '+(state.repeat?"checked":"")+'><span><b>Серия одной марки</b><small>После сохранения выбирайте следующие точки без повторного поиска марки (пока есть остаток).</small></span></label>':"")+
     (!column&&pickGeometry()!=="bent"?'<label class="irb-zigzag"><input id="irbZigzag" type="checkbox" '+(state.zigzag?"checked":"")+'><span><b>Зигзаг / цепочка</b><small>После сохранения следующая связь начнётся от конца предыдущей. Каждому отрезку соответствует своя марка из ведомости.</small></span></label>':"")+
    '<p class="irb-help">'+(column?"Точная привязка к сетке либо свободная точка между осями. В виде «Фасад» и «Сбоку» для установки используйте изометрию или вид сверху.":"Привязка к колоннам, балкам и ригелям. Для точек сетки требуется проектная отметка Z по КМД.")+'</p>'+
     '<div class="irb-form-error" id="irbQuickError" role="alert" '+(state.error?'':'hidden')+'>'+html(state.error)+'</div>'+
     (typeof props.onQuickPlace==="function"?'<button type="button" class="irb-save irb-quick-save" id="irbQuickSave" '+(!ready||state.busy?'disabled':'')+'>✓ Сохранить на схеме</button>':'')+
    '<button class="irb-save" id="irbContinue" '+(!(state.start&&(column||state.end)&&(pickGeometry()!=="bent"||state.middle)&&available)?'disabled':'')+'>Продолжить в редакторе →</button>'+
    '<button class="irb-secondary" id="irbClear">Сбросить точки</button><button class="irb-secondary" id="irbCancel">Отмена</button>';
    el("irbMark").onchange=e=>{
     const next=markById(e.target.value),keep=state.continuing&&next?.geometry!=="column";
     state.mark=e.target.value;state.topZ="";state.error="";state.bent=false;state.middle=null;if(!keep){state.start=null;state.continuing=false}
     if(next?.geometry==="column")state.zigzag=false;
     state.repeat=next?.geometry==="column";
     state.hoverAnchor=null;state.end=null;refreshPanel();paint()
    };
    const markSearchInput=el("irbMarkSearch"),markSelect=el("irbMark"),
     markCount=markSelect.closest(".irb-field")?.querySelector("small");
    const updateMarkSearch=()=>{
     // Never recreate the active search input on every keystroke: replacing
     // pane.innerHTML cancels focus, IME composition and typed characters.
     const matched=marks.filter(searchMatches),available=matched.filter(a=>a.left>0);
     const keepSelection=available.some(a=>String(a.id)===String(state.mark));
     markSelect.innerHTML=markOptions();
     markSelect.value=keepSelection?String(state.mark):"";
     if(markCount)markCount.textContent="Найдено: "+matched.length+" из "+marks.length+
      (matched.length&&!available.length?" · нет остатка":"");
     markSelect._irSelectUI?.refresh?.();
    };
    markSearchInput.addEventListener("input",()=>{
     state.markSearch=markSearchInput.value;
     updateMarkSearch();
    });
    markSearchInput.addEventListener("search",()=>{
     // Handles the native clear (×) control in Chromium/Electron.
     state.markSearch=markSearchInput.value;
     updateMarkSearch();
    });
    markSearchInput.addEventListener("keydown",e=>{
     if(e.key!=="Enter"||e.isComposing||e.keyCode===229)return;
     e.preventDefault();
     const matched=marks.filter(a=>a.left>0&&searchMatches(a));
     if(!matched.length)return;
     // Pressing Enter confirms the first match without interfering with typing.
     const choice=matched.find(a=>String(a.id)===String(state.mark))||matched[0];
     markSelect.value=String(choice.id);
     markSelect.dispatchEvent(new Event("change",{bubbles:true}));
    });
    if(el("irbBentMode"))el("irbBentMode").onchange=e=>{
     state.bent=e.target.checked;state.start=null;state.middle=null;state.end=null;state.error="";state.zigzag=false;state.repeat=false;refreshPanel();paint()
    };
    if(el("irbRepeat"))el("irbRepeat").onchange=e=>{state.repeat=e.target.checked};
    if(el("irbClickPlace"))el("irbClickPlace").onchange=e=>{state.directColumns=e.target.checked;updateHint();paint()};
    updateHoverInfo();
     if(el("irbZigzag"))el("irbZigzag").onchange=e=>{state.zigzag=e.target.checked};
    if(el("irbTopZ"))el("irbTopZ").oninput=e=>{
      state.topZ=e.target.value;const save=el("irbQuickSave");
      if(save)save.disabled=state.busy||!readyToSave();
      updateHint();paint();
     };
    const applyLevel=(input,finalize=false)=>{
     const part=input.dataset.irbLevel,
      a=part==="start"?state.start:part==="middle"?state.middle:state.end;
     if(!a)return;
     const raw=input.value.trim().replace(/\s/g,"").replace(",","."),
      numeric=/^[+-]?\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN,
      minimum=a.kind==="column"?num(a.minZ):-20000,
      maximum=a.kind==="column"?num(a.maxZ):200000;
     let message="";
     if(!raw||!Number.isFinite(numeric))message="Укажите отметку Z числом в миллиметрах.";
     else if(numeric<minimum||numeric>maximum)message=a.kind==="column"?
      "Точка на колонне допускает Z от "+fmt(minimum)+" до "+fmt(maximum)+" мм.":
      "Допустимая отметка Z: от "+fmt(minimum)+" до "+fmt(maximum)+" мм.";
     let nextXY=null;
     // An attachment to a sloping member must move along its real centreline;
     // changing only its Z would detach it from the supporting member.
     if(!message&&a.kind==="member"&&a.memberId){
      const ref=cols.find(c=>String(c.id)===String(a.memberId));
      if(ref){
       const joints=ref.geometryType==="bent"?[
        [pt(ref.x,ref.y,ref.z0),pt(ref.mx,ref.my,ref.mz)],
        [pt(ref.mx,ref.my,ref.mz),pt(ref.x2,ref.y2,ref.z2)]]:
        [[pt(ref.x,ref.y,ref.z0),pt(ref.x2,ref.y2,ref.z2)]];
       const closeSegment=([start,end])=>{
        const v=pt(end.x-start.x,end.y-start.y,end.z-start.z),
         t=clamp(((num(a.worldX)-start.x)*v.x+(num(a.worldY)-start.y)*v.y+(num(a.z)-start.z)*v.z)/(v.x*v.x+v.y*v.y+v.z*v.z||1),0,1);
        return Math.hypot(num(a.worldX)-start.x-v.x*t,num(a.worldY)-start.y-v.y*t,num(a.z)-start.z-v.z*t)
       };
       const segment=a.memberPart!==undefined?joints[a.memberPart]:joints.slice().sort((q,t)=>closeSegment(q)-closeSegment(t))[0];
       if(!segment)message="Не удалось определить участок крепления к балке.";
       else{
        const [first,last]=segment,dz=last.z-first.z;
        if(Math.abs(dz)<1){
         if(Math.abs(numeric-first.z)>.5)message="У этой балки фиксированная отметка Z "+fmt(first.z)+" мм. Для изменения высоты откройте редактор.";
        }else{
         const t=(numeric-first.z)/dz;
         if(t<0||t>1)message="Отметка Z выходит за пределы выбранного участка балки: "+fmt(Math.min(first.z,last.z))+"–"+fmt(Math.max(first.z,last.z))+" мм.";
         else nextXY={x:Math.round(first.x+(last.x-first.x)*t),y:Math.round(first.y+(last.y-first.y)*t)};
        }
       }
      }
     }
     const feedback=input.parentElement.querySelector(".irb-level-feedback");
     input.classList.toggle("irb-level-invalid",!!message&&finalize);
     input.setAttribute("aria-invalid",String(!!message&&finalize));
     if(feedback){feedback.hidden=!message||!finalize;if(message&&finalize)feedback.textContent=message}
     if(message){
      a.zConfirmed=false;
      if(finalize)state.error=message;
     }else{
      if(nextXY){
       a.worldX=nextXY.x;a.worldY=nextXY.y;
       a.x=closest(axesX,gridX,a.worldX);a.y=closest(axesY,gridY,a.worldY);
      }
      a.z=Math.round(numeric);a.zConfirmed=true;state.error="";
      if(finalize)input.value=String(a.z);
     }
     const row=input.closest(".irb-anchor"),label=row?.querySelector("span");
     if(label)label.innerHTML=position(a);
     const save=el("irbQuickSave");if(save)save.disabled=state.busy||!readyToSave();
     const cont=el("irbContinue");
     if(cont)cont.disabled=!(state.start&&(column||state.end)&&(pickGeometry()!=="bent"||state.middle)&&available);
     const error=el("irbQuickError");
     if(error){error.textContent=state.error;error.hidden=!state.error}
     // IMPORTANT: Never call refreshPanel here. Replacing pane.innerHTML
     // while a Z input is active used to destroy focus and cancel Save clicks.
     updateHint();paint();
    };
    pane.querySelectorAll("[data-irb-level]").forEach(input=>{
     input.addEventListener("input",()=>applyLevel(input,false));
     input.addEventListener("change",()=>applyLevel(input,true));
     input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();input.blur()}});
    });
    el("irbClear").onclick=()=>{state.start=null;state.middle=null;state.end=null;state.error="";state.continuing=false;refreshPanel();paint()};
    el("irbCancel").onclick=()=>{state.placing=false;state.start=null;state.end=null;state.chainNext=null;state.continuing=false;refreshPanel();paint()};
         const quickSave=el("irbQuickSave");
     commitQuickPlacement=async()=>{
      if(!readyToSave()||state.busy)return;
      if(m.geometry==="column"&&columnOccupied(state.start)){
       state.error="В этой точке уже установлена колонна. Выберите другое место.";
       const err=el("irbQuickError");if(err){err.textContent=state.error;err.hidden=false}
       return
      }
      const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),memberId:a.memberId||a.columnId||""}:null;
      const data={markId:state.mark,start:pack(state.start),middle:pickGeometry()==="bent"?pack(state.middle):null,end:column?null:pack(state.end),topZ:column?Number(state.topZ):undefined,geometry:pickGeometry(),zigzag:state.zigzag&&!state.bent};
      state.busy=true;quickSave.disabled=true;state.error="";
      try{
       const result=await props.onQuickPlace(data);
       if(state.zigzag&&!column&&state.end){
        state.start={...state.end,zConfirmed:true,worldX:num(result.savedEnd.x),worldY:num(result.savedEnd.y),z:num(result.savedEnd.z)};
        state.end=null;state.placing=true;state.continuing=true;
       }else if(state.repeat&&num(m.left)>1){
        state.start=null;state.middle=null;state.end=null;state.placing=true;state.continuing=false;
       }else{state.start=null;state.middle=null;state.end=null;state.placing=false;state.continuing=false}
       if(!(column&&state.placing&&state.repeat))state.topZ="";
       state.error="";state.busy=false;state.hoverAnchor=null;
       props.onQuickPlaced?.(result);
      }catch(e){state.error=String(e?.message||e);state.busy=false;refreshPanel();paint()}
     };
     if(quickSave)quickSave.onclick=commitQuickPlacement;
     el("irbContinue").onclick=()=>{
     if(!state.start||!selectedMark()||left<=0||!column&&!state.end||pickGeometry()==="bent"&&!state.middle)return;
     const pack=a=>a?{ax:a.x,ay:a.y,dx:num(a.worldX)-originAxis(gridX,a.x),dy:num(a.worldY)-originAxis(gridY,a.y),z:num(a.z),source:a.kind,columnId:a.columnId||""}:null;
     const data={markId:state.mark,start:pack(state.start),middle:pickGeometry()==="bent"?pack(state.middle):null,end:pack(state.end),geometry:pickGeometry(),height:maxZ,zigzag:state.zigzag&&!state.bent};
     state.chainNext=state.zigzag&&state.end?{...state.end}:null;
     state.placing=false;state.continuing=false;refreshPanel();paint();props.onPlacement(data);
    };
   }else{
    const c=cols.find(c=>String(c.id)===String(state.selected));
    pane.innerHTML='<div class="irb-panel-head"><b>Свойства конструкции</b></div>'+
      (c?'<div class="irb-selected"><small>Выбранная марка</small><strong>'+html(c.mark||"—")+'</strong><span>'+html(c.mark_name||c.title||"")+'</span><em>'+html(c.status==="mounted"?"Смонтировано":c.status==="partial"?"Частично":"Не смонтировано")+'</em></div>'+
      '<div class="irb-row"><span>Начальная ось</span><b>'+html(c.axisX+" / "+c.axisY)+'</b></div>'+
      '<div class="irb-row"><span>Начало, мм</span><b>X '+fmt(c.x)+' · Y '+fmt(c.y)+' · Z '+fmt(c.z0)+'</b></div>'+
       (c.geometryType==="bent"?'<div class="irb-row"><span>Конёк / излом, мм</span><b>X '+fmt(c.mx)+' · Y '+fmt(c.my)+' · Z '+fmt(c.mz)+'</b></div>':"")+
       '<div class="irb-row"><span>Конец, мм</span><b>X '+fmt(c.x2??c.x)+' · Y '+fmt(c.y2??c.y)+' · Z '+fmt(c.z2)+'</b></div>'+
       '<div class="irb-row irb-length"><span>Длина элемента по осям</span><b>'+fmt(memberLength(c))+' мм · '+(memberLength(c)/1000).toLocaleString("ru-RU",{minimumFractionDigits:3,maximumFractionDigits:3})+' м</b></div>'+
      '<div class="irb-row"><span>Отметка низа, мм</span><b>'+fmt(c.z0)+'</b></div>'+
      '<div class="irb-row"><span>Отметка конца, мм</span><b>'+fmt(c.z2)+'</b></div>'+
      (props.canEdit?'<div class="irb-action-row">'+
       '<button type="button" class="irb-secondary" id="irbSelectDetails">Подробнее и редактирование →</button>'+
       '<button type="button" class="irb-icon-delete" id="irbDeleteSelected" title="Удалить элемент со схемы" aria-label="Удалить выбранный элемент со схемы">'+
        '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
         '<path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6m4-6v6"/>'+
        '</svg></button></div>':''):
      '<div class="irb-empty">Выберите конструкцию на общей модели, чтобы посмотреть её марку и положение. Все реальные элементы берутся из вашей монтажной схемы.</div>')+
      (props.canEdit?'<button class="irb-save" id="irbStartRight">＋ Добавить марку</button>':'');
    const btn=el("irbStartRight");if(btn)btn.onclick=startPlacement;
    const detail=el("irbSelectDetails");if(detail)detail.onclick=()=>{
     if(props.canEdit&&typeof props.onEdit==="function")props.onEdit(String(c.id));
    };
    const deleteButton=el("irbDeleteSelected");if(deleteButton)deleteButton.onclick=()=>{
     if(props.canEdit&&typeof props.onDelete==="function")props.onDelete(String(c.id));
    };
   }
   const nextMode=state.placing?"placing":"details";
   pane.dataset.irbPanelMode=nextMode;
   if(previousMode===nextMode)pane.scrollTop=previousScroll;
   if(!pane.hidden){
    const dismiss=document.createElement("button");dismiss.type="button";
    dismiss.className="irb-pane-close";dismiss.textContent="×";dismiss.title="Скрыть свойства";
    dismiss.setAttribute("aria-label","Закрыть свойства");
    dismiss.onclick=()=>{state.placing=false;state.continuing=false;state.chainNext=null;state.start=null;state.end=null;state.selected="";props.onSelect("");refreshPanel();paint()};
    pane.prepend(dismiss);
   }
  }
  function startPlacement(){
   if(!props.canEdit||!marks.some(m=>m.left>0))return;
   state.placing=true;state.start=null;state.middle=null;state.end=null;state.chainNext=null;state.continuing=false;state.topZ="";state.error="";state.markSearch="";state.hoverAnchor=null;state.directColumns=true;state.bent=false;state.mark=leftMark().find(m=>m.id===state.mark)?.id||leftMark()[0]?.id||"";state.repeat=selectedMark()?.geometry==="column";
   refreshPanel();paint();
   // Opening placement after deleting a member should immediately make the
   // search usable, rather than leaving keyboard focus on the removed button.
   el("irbMarkSearch")?.focus({preventScroll:true});
  }
  const setCamera=mode=>{
   state.preset=mode;state.zoom=1;state.panX=0;state.panY=0;
   if(mode==="top"){state.yaw=0;state.pitch=Math.PI/2}else if(mode==="front"){state.yaw=0;state.pitch=.03}
   else if(mode==="side"){state.yaw=Math.PI/2;state.pitch=.03}else{state.yaw=-.75;state.pitch=.60}
   syncCameraButtons();paint();
  };
  const syncCameraButtons=()=>{
   host.querySelectorAll("[data-irb-camera]").forEach(b=>b.classList.toggle("active",b.dataset.irbCamera===state.preset))
  };
  const setZoom=v=>{state.zoom=clamp(v,.45,4);paint()};
  const cutDetails=el("irbCuts");
  const updateCutControls=()=>{
   const n=state.hiddenSections.length,visible=visibleCols().length;
   const count=el("irbHiddenCount");if(count)count.textContent=n?"Скрыто: "+n:"Все видны";
   const text=el("irbCutsResult");if(text)text.textContent="Показано "+visible+" из "+cols.length+" конструкций";
   const title=el("irbVisibleCount");if(title)title.textContent=String(visible);
   const toggle=el("irbCutsToggle");
   if(toggle){toggle.textContent=n?"▤ Разрезы ("+n+")":"▤ Разрезы";toggle.classList.toggle("has-hidden",n>0)}
  };
  const cutsChanged=()=>{
   state.hiddenSections=[...new Set(state.hiddenSections)].filter(id=>sections.some(a=>a.id===id));
   saveSections();updateCutControls();
   refreshFindControls();
   // A hidden member cannot remain selected or intercept picking.
   if(state.selected&&!visibleCols().some(c=>String(c.id)===String(state.selected))){
    state.selected="";state.hover="";props.onSelect("");refreshPanel()
   }
   if(state.colorMode==="mark")showColorMode();
   paint();
  };
  if(cutDetails)cutDetails.addEventListener("toggle",()=>{state.sectionsOpen=cutDetails.open});
  host.querySelectorAll("[data-irb-cut]").forEach(input=>input.onchange=()=>{
   const id=input.dataset.irbCut;
   state.hiddenSections=input.checked?state.hiddenSections.filter(x=>x!==id):[...state.hiddenSections,id];
   cutsChanged()
  });
  el("irbCutsReset").onclick=()=>{
   state.hiddenSections=[];
   host.querySelectorAll("[data-irb-cut]").forEach(input=>input.checked=true);
   cutsChanged()
  };
  el("irbCutsToggle").onclick=()=>{
   state.layersOpen=true;updateLayers();
   state.sectionsOpen=true;cutDetails.open=true;
   layerPanel.scrollTop=Math.max(0,cutDetails.offsetTop-layerPanel.offsetTop-12)
  };
  updateCutControls();
  host.querySelectorAll("[data-irb-layer]").forEach(b=>b.onclick=()=>props.onLayer(b.dataset.irbLayer));
  const findInput=el("irbFindMark");
  const findVisibleMatches=()=>{
   const query=state.findQuery.trim().toLocaleLowerCase("ru");
   if(!query)return[];
   const members=visibleCols();
   const exact=members.filter(c=>markName(c).toLocaleLowerCase("ru")===query);
   const selected=exact.length?exact:members.filter(c=>
    markName(c).toLocaleLowerCase("ru").includes(query)||
    String(c.mark_name||c.title||"").toLocaleLowerCase("ru").includes(query));
   // Stable order between repeated finds, even after camera rotation.
   return selected.slice().sort((a,b)=>
    num(a.x)-num(b.x)||num(a.y)-num(b.y)||num(a.z0)-num(b.z0)||
    String(a.id).localeCompare(String(b.id),"ru",{numeric:true}));
  };
  const refreshFindControls=()=>{
   const matches=findVisibleMatches(),total=matches.length,
    idx=matches.findIndex(c=>String(c.id)===String(state.selected)),
    current=idx<0?0:idx+1,
    message=el("irbFindCount");
   if(message){
    message.textContent=!state.findQuery.trim()?"Введите марку":
     !total?"Ничего не найдено":current+" из "+total+" найдено";
    message.classList.toggle("irb-find-empty",Boolean(state.findQuery.trim()&&!total))
   }
   for(const id of ["irbFindPrev","irbFindNext"]){const button=el(id);if(button)button.disabled=!total}
   const clear=el("irbFindClear");if(clear)clear.hidden=!findInput.value;
  };
  const focusFound=c=>{
   state.placing=false;state.selected=String(c.id);state.hover="";
   props.onSelect(state.selected);refreshPanel();
   const focusPoint=c.geometryType==="bent"?pt(c.mx,c.my,c.mz):
    c.geometryType==="column"?pt(c.x,c.y,(num(c.z0)+num(c.z2))/2):
    pt((num(c.x)+num(c.x2))/2,(num(c.y)+num(c.y2))/2,(num(c.z0)+num(c.z2))/2);
   const projection=projectFactory(),screen=projection.project(focusPoint);
   state.panX+=projection.centerX-screen.x;
   state.panY+=projection.h/2-screen.y;
   refreshFindControls();paint()
  };
  const moveFound=direction=>{
   const matches=findVisibleMatches();if(!matches.length){refreshFindControls();return}
   const index=matches.findIndex(c=>String(c.id)===String(state.selected));
   const next=index<0?(direction<0?matches.length-1:0):(index+direction+matches.length)%matches.length;
   focusFound(matches[next]);
  };
  findInput.oninput=()=>{
   state.findQuery=findInput.value;
   refreshFindControls()
  };
  findInput.onkeydown=e=>{
   if(e.key==="Enter"){e.preventDefault();moveFound(e.shiftKey?-1:1)}
   else if(e.key==="Escape"&&findInput.value){
    e.preventDefault();findInput.value="";state.findQuery="";refreshFindControls()
   }
  };
  el("irbFindPrev").onclick=()=>moveFound(-1);
  el("irbFindNext").onclick=()=>moveFound(1);
  el("irbFindClear").onclick=()=>{
   findInput.value="";state.findQuery="";refreshFindControls();findInput.focus()
  };
  refreshFindControls();
  el("irbGrid").onchange=e=>{state.grid=e.target.checked;paint()};
  el("irbRoof").onchange=e=>{state.roof=e.target.checked;paint()};
  if(el("irbStart"))el("irbStart").onclick=startPlacement;
  if(el("irbQuickAdd"))el("irbQuickAdd").onclick=startPlacement;
  el("irbView").value=state.preset;
  el("irbView").onchange=e=>setCamera(e.target.value);
  host.querySelectorAll("[data-irb-camera]").forEach(b=>b.onclick=()=>{el("irbView").value=b.dataset.irbCamera;setCamera(b.dataset.irbCamera)});
  syncCameraButtons();
  el("irbMinus").onclick=()=>setZoom(state.zoom/1.18);
  el("irbPlus").onclick=()=>setZoom(state.zoom*1.18);
  el("irbFit").onclick=()=>setCamera("iso");
  let drag=null,twoFinger=null,multiTouch=false;
  const pointers=new Map();
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  const pair=()=>{
   const [a,b]=[...pointers.values()];
   return{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))}
  };
  canvas.oncontextmenu=e=>e.preventDefault();
  canvas.onpointerdown=e=>{
   if(e.button!==0&&e.button!==2)return;
   const p=point(e);
   if(e.pointerType==="touch"){
    pointers.set(e.pointerId,p);
    if(pointers.size===2){const t=pair();twoFinger={...t,panX:state.panX,panY:state.panY,zoom:state.zoom};multiTouch=true;drag=null}
   }
   if(!twoFinger)drag={...p,lastX:p.x,lastY:p.y,moved:false,mode:e.button===2?"pan":"orbit"};
   try{canvas.setPointerCapture(e.pointerId)}catch(_e){}
  };
  canvas.onpointermove=e=>{
   const p=point(e);
   if(e.pointerType==="touch"&&pointers.has(e.pointerId)){
    pointers.set(e.pointerId,p);
    if(twoFinger&&pointers.size>=2){
     const t=pair();
     state.panX=twoFinger.panX+t.cx-twoFinger.cx;
     state.panY=twoFinger.panY+t.cy-twoFinger.cy;
     state.zoom=clamp(twoFinger.zoom*t.distance/twoFinger.distance,.45,4);
     paint();return
    }
   }
   if(drag){
    if(Math.hypot(p.x-drag.x,p.y-drag.y)>4)drag.moved=true;
    if(drag.moved){
     if(drag.mode==="pan"){state.panX+=p.x-drag.lastX;state.panY+=p.y-drag.lastY}
     else{state.yaw+=(p.x-drag.lastX)*.008;state.pitch=clamp(state.pitch+(p.y-drag.lastY)*.006,.02,Math.PI/2);state.preset="free";el("irbView").value="free";syncCameraButtons()}
     paint()
    }
    drag.lastX=p.x;drag.lastY=p.y;return;
   }
   if(!state.placing){const id=nearestMember(p.x,p.y)?.id||"";if(state.hover!==id){state.hover=id;paint()}canvas.style.cursor=id?"pointer":"grab"}
   else{
    const anchor=nearestAxis(p.x,p.y);
    const previous=state.hoverAnchor;
    const changed=!!anchor!==!!previous||anchor&&previous&&
     (Math.hypot(num(anchor.worldX)-num(previous.worldX),num(anchor.worldY)-num(previous.worldY))>15||
      Math.abs(num(anchor.z)-num(previous.z))>50||anchor.kind!==previous.kind);
    if(changed){state.hoverAnchor=anchor;updateHoverInfo();paint()}
    canvas.style.cursor=pickGeometry()==="column"&&columnOccupied(anchor)?"not-allowed":"crosshair"
   }
  };
  canvas.onpointerup=e=>{
   if(e.pointerType==="touch"){
    pointers.delete(e.pointerId);
    if(twoFinger||multiTouch){twoFinger=null;drag=null;if(!pointers.size)multiTouch=false;return}
   }
   if(!drag)return;const moved=drag.moved,mode=drag.mode;drag=null;if(moved||mode==="pan")return;
   const p=point(e);
   if(state.placing){
    if(state.busy||!selectedMark())return;
    const a=nearestAxis(p.x,p.y);if(!a)return;
    const column=pickGeometry()==="column";
    if(column&&columnOccupied(a)){
     state.error="В выбранной точке уже есть колонна. Выберите свободное место.";
     refreshPanel();paint();return
    }
    if(!state.start||state.end||column){state.start=a;state.middle=null;state.end=null;if(!column)state.topZ="";}
    else if(pickGeometry()==="bent"){
     if(!state.middle){if(!sameAnchor(a,state.start))state.middle=a}
     else if(!sameAnchor(a,state.middle)&&!sameAnchor(a,state.start))state.end=a;
    }else if(!sameAnchor(a,state.start))state.end=a;
    state.error="";refreshPanel();paint();
    if(column&&state.directColumns&&state.topZ!==""&&
     Number.isFinite(Number(state.topZ))&&Number(state.topZ)>num(a.z)){
     // Use exactly the same validated save path as the sidebar button.
     void commitQuickPlacement()
    }
   }else{state.selected=String(nearestMember(p.x,p.y)?.id||"");props.onSelect(state.selected);refreshPanel();refreshFindControls();paint()}
  };
  canvas.onpointerleave=()=>{if(!drag&&state.hoverAnchor){state.hoverAnchor=null;updateHoverInfo();paint()}};
  canvas.onpointercancel=e=>{pointers.delete(e.pointerId);drag=null;twoFinger=null;if(!pointers.size)multiTouch=false};
  canvas.onwheel=e=>{e.preventDefault();setZoom(state.zoom*(e.deltaY>0?.9:1.1))};
  if(window.ResizeObserver){observer=new ResizeObserver(()=>paint());observer.observe(canvas)}
  state.selected=String(props.selected||"");
  if(!visibleCols().some(c=>String(c.id)===state.selected))state.selected="";
  refreshPanel();refreshFindControls();paint();
 }
 return {render,start:()=>{const b=document.getElementById("irbStart");if(b)b.click()},
  placementSaved:placement=>{
   if(!placement?.zigzag||!state.chainNext)return;
   const previous=state.chainNext,saved=placement.savedEnd;
   // Continue from the actual endpoint persisted in the standard editor.
   const sameColumn=saved&&previous.kind==="column"&&
    Math.hypot(num(saved.x)-num(previous.worldX),num(saved.y)-num(previous.worldY))<1&&
    num(saved.z)>=num(previous.minZ)&&num(saved.z)<=num(previous.maxZ);
   state.start=!saved?{...previous}:sameColumn?{...previous,z:num(saved.z)}:{
    kind:"grid",x:String(saved.ax),y:String(saved.ay),
    worldX:num(saved.x),worldY:num(saved.y),z:num(saved.z)
   };
   state.end=null;state.placing=true;state.continuing=true;
   state.markSearch="";state.hoverAnchor=null;state.chainNext=null
  },
  placementCancelled:()=>{state.chainNext=null;state.continuing=false;state.placing=false;state.start=null;state.middle=null;state.end=null;state.hoverAnchor=null},
  dispose:()=>{
   observer?.disconnect();observer=null;
   if(animationFrame){window.cancelAnimationFrame(animationFrame);animationFrame=0}
   drawFrame=null;webgl?.dispose();webgl=null;paint=null
  }};
})();