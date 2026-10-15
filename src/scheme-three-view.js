"use strict";
/* IR Project experimental Three.js viewer. Read-only: never writes to project data.
   Rendering uses persisted scheme element coordinates, not demonstration members. */
window.irThreeSchemeView=(function(){
 var token=0,active=null,loadPromise=null;
 var sources=[
  ["https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js",
   "https://unpkg.com/three@0.147.0/build/three.min.js"],
  ["https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js",
   "https://unpkg.com/three@0.147.0/examples/js/controls/OrbitControls.js"]
 ];
 function include(urls,index){
  index=index||0;
  return new Promise(function(resolve,reject){
   var node=document.createElement("script");node.src=urls[index];node.async=true;
   node.onload=function(){resolve()};
   node.onerror=function(){
    node.remove();
    if(index+1<urls.length)include(urls,index+1).then(resolve,reject);
    else reject(new Error("Не удалось загрузить Three.js. Проверьте подключение к интернету."))
   };
   document.head.appendChild(node)
  })
 }
 function ensure(){
  if(window.THREE&&window.THREE.OrbitControls)return Promise.resolve();
  if(!loadPromise)loadPromise=Promise.resolve().then(function(){
   return window.THREE?null:include(sources[0])
  }).then(function(){
   return window.THREE&&window.THREE.OrbitControls?null:include(sources[1])
  }).then(function(){
   if(!window.THREE||!window.THREE.OrbitControls)throw new Error("Three.js или управление камерой недоступны.")
  }).catch(function(e){loadPromise=null;throw e});
  return loadPromise
 }
 function escapeHtml(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
   return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]
  })
 }
 function labelStatus(status){
  return status==="mounted"?"Смонтировано":status==="partial"?"Частично смонтировано":"Не смонтировано"
 }
 var groups={
  columns:["Колонны",0x4c81ca],fahwerk:["Фахверки",0x9564ba],girders:["Ригели",0xdb8d47],
  beams:["Балки",0x258f82],purlins:["Прогоны",0x26a0b4],ties:["Связи",0xc58e4e],
  spacers:["Распорки",0xc88456],posts:["Стойки",0xa39c44],trusses:["Фермы",0x9d71b7],
  stairs:["Лестницы",0x8896b2],other:["Прочее",0x8496a8]
 };
 function kind(member){
  var key=String(member.scheme_group||member.schemeGroup||"").toLowerCase();
  return groups[key]?key:(member.geometryType==="column"?"columns":member.geometryType==="brace"?"ties":"beams")
 }
 function number(v){var n=Number(v);return Number.isFinite(n)?n:0}
 function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
 function fromMm(x,z,y,T){return new T.Vector3(number(x)/1000,number(z)/1000,number(y)/1000)}
 function memberPoints(member,T){
  var start=fromMm(member.x,member.z0,member.y,T);
  var end=member.geometryType==="column"?fromMm(member.x,member.z2,member.y,T):
   fromMm(member.x2,member.z2,member.y2,T);
  return member.geometryType==="bent"?
   [start,fromMm(member.mx,member.mz,member.my,T),end]:[start,end]
 }
 function materialProfile(member){
  var source=String(member.profile_name||member.profileName||""),
   match=source.match(/(\d{2,3})\s*[КБKБ]/i);
  var h=match?Math.max(.18,Math.min(.7,number(match[1])/100)):.32;
  var category=kind(member);
  if(category==="columns")h=Math.max(h,.36);
  if(category==="purlins")h=Math.min(h,.20);
  return [h,h*(category==="columns"?.62:.48),Math.max(.009,h*.037),Math.max(.013,h*.07)]
 }
 function addGeometry(T,cache,member){
  var section=String(member.section_type||"").toLowerCase(),category=kind(member);
  var style=section==="round"||category==="ties"&&String(member.profile_name||"").match(/труб|ø|Ø/i)?"round":
   section==="square"||section==="box"?"box":"ibeam";
  var dimensions=materialProfile(member),key=style+":"+category+":"+dimensions[0].toFixed(2);
  if(cache.has(key))return cache.get(key);
  var geo;
  if(style==="round"){
   geo=new T.CylinderGeometry(Math.max(.025,dimensions[0]/6),Math.max(.025,dimensions[0]/6),1,10);
   geo.rotateX(Math.PI/2);geo.translate(0,0,.5)
  }else if(style==="box"){
   geo=new T.BoxGeometry(dimensions[1],dimensions[0],1);geo.translate(0,0,.5)
  }else{
   var h=dimensions[0]/2,b=dimensions[1]/2,w=dimensions[2]/2,fl=dimensions[3],
    shape=new T.Shape();
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);
   shape.lineTo(w,-h+fl);shape.lineTo(w,h-fl);shape.lineTo(b,h-fl);
   shape.lineTo(b,h);shape.lineTo(-b,h);shape.lineTo(-b,h-fl);
   shape.lineTo(-w,h-fl);shape.lineTo(-w,-h+fl);shape.lineTo(-b,-h+fl);shape.closePath();
   geo=new T.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:1})
  }
  geo.computeVertexNormals();cache.set(key,geo);return geo
 }
 function dispose(){
  token++;
  if(active){active.dispose();active=null}
 }
 function render(host,props){
  dispose();
  var myToken=token;
  host.innerHTML='<div class="ir-three-loading" role="status"><strong>Подготавливаем Three.js 3D…</strong><span>Загружаем отдельную модель без изменения монтажной схемы</span></div>';
  ensure().then(function(){
   if(myToken!==token||!host.isConnected)return;
   active=createViewer(host,props);
   if(myToken!==token){active.dispose();active=null}
  }).catch(function(error){
   if(myToken!==token||!host.isConnected)return;
   host.innerHTML='<div class="ir-three-loading ir-three-error" role="alert"><strong>Three.js не загрузился</strong><span>'+
    escapeHtml(error.message||error)+'</span><small>«План» и «Общий 3D» продолжают работать без изменений.</small></div>';
   props.onFirstPaint&&props.onFirstPaint()
  })
 }
 function createViewer(host,props){
  var T=window.THREE,elems=Array.isArray(props.elements)?props.elements:[],X=number(props.spanX)/1000,Y=number(props.spanY)/1000;
  var axesX=props.axesX||[],axesY=props.axesY||[],gridX=props.gridX||{},gridY=props.gridY||{};
  var selected=String(props.selected||""),colorMode=["status","type","mark"].includes(props.colorMode)?props.colorMode:"type",statusMode="all",layerEnabled={},
   showAxes=true,showGrid=true,hover="",alive=true,raf=0,clicked=null,firstPaint=false;
  host.innerHTML='<div class="ir-three-root">'+
   '<div class="ir-three-toolbar"><strong>Three.js · тестовая схема</strong>'+
   '<div class="ir-three-views">'+
   '<button data-three-view="iso" class="active">3D</button><button data-three-view="top">Сверху</button>'+
   '<button data-three-view="front">Фасад</button><button data-three-view="side">Сбоку</button></div>'+
   '<select id="irThreeColors" aria-label="Раскраска конструкции">'+
   '<option value="type">Цвет: виды</option><option value="status">Цвет: монтаж</option><option value="mark">Цвет: марки</option></select>'+
   '<button id="irThreeReset">Сбросить ракурс</button></div>'+
   '<div class="ir-three-viewport" id="irThreeViewport" role="img" aria-label="Интерактивная Three.js модель металлического каркаса"></div>'+
   '<div class="ir-three-axis-layer" id="irThreeAxisLayer" aria-hidden="true"></div>'+
   '<aside class="ir-three-left"><div class="ir-three-side-title">Конструкции <small id="irThreeCount"></small></div>'+
   '<div class="ir-three-layer-actions"><button id="irThreeAll">Все</button><button id="irThreeNone">Скрыть</button></div>'+
   '<div id="irThreeLayers" class="ir-three-layers"></div>'+
   '<label class="ir-three-small-field">Монтаж <select id="irThreeStatus"><option value="all">Все статусы</option>'+
   '<option value="mounted">Смонтировано</option><option value="planned">Не смонтировано</option>'+
   '<option value="partial">Частично</option></select></label>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeGrid" checked> Сетка осей</label>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeAxes" checked> Подписи осей</label>'+
   '<p class="ir-three-hint">Левая кнопка — вращение, правая — сдвиг, колесо — масштаб. Нажмите на конструкцию для просмотра марки.</p>'+
   '</aside><aside class="ir-three-right" id="irThreeDetails"></aside>'+
   '<div class="ir-three-footer">Просмотр по данным IR Project · геометрия профилей схематичная · редактирование выполняется в Плане или Общем 3D</div></div>';
  var root=host.querySelector(".ir-three-root"),viewport=root.querySelector("#irThreeViewport"),
   details=root.querySelector("#irThreeDetails"),axisLayer=root.querySelector("#irThreeAxisLayer");
  var scene=new T.Scene();scene.background=new T.Color(0xf0f5fa);
  var camera=new T.PerspectiveCamera(42,1,.08,3000);
  var renderer=new T.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
  viewport.appendChild(renderer.domElement);
  scene.add(new T.HemisphereLight(0xe8f4ff,0x839bb5,1.9));
  var sun=new T.DirectionalLight(0xffffff,2.1);sun.position.set(-35,72,48);scene.add(sun);
  var ambient=new T.DirectionalLight(0xc8dfff,.7);ambient.position.set(45,26,-38);scene.add(ambient);
  var steel=new T.Group();scene.add(steel);
  var ground=new T.Group();scene.add(ground);
  var floor=new T.Mesh(new T.PlaneGeometry(Math.max(X+16,24),Math.max(Y+16,24)),
   new T.MeshStandardMaterial({color:0xe8f0f7,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.set(X/2,-.26,Y/2);ground.add(floor);
  var grid=new T.GridHelper(Math.max(X,Y)+12,Math.min(80,Math.max(8,Math.ceil(Math.max(X,Y)/2))),0x8da9bd,0xc8d9e5);
  grid.position.set(X/2,-.23,Y/2);ground.add(grid);
  var axisNames=[],axisMaterial=new T.LineDashedMaterial({color:0x94aec0,dashSize:.6,gapSize:.35});
  function gridLine(a,b){var geo=new T.BufferGeometry().setFromPoints([a,b]);var line=new T.Line(geo,axisMaterial);line.computeLineDistances();ground.add(line)}
  axesX.forEach(function(name){
   var x=number(gridX[name])/1000;
   gridLine(new T.Vector3(x,-.19,0),new T.Vector3(x,-.19,Y));
   axisNames.push({name:name,pos:new T.Vector3(x,.15,-2.4)})
  });
  axesY.forEach(function(name){
   var z=number(gridY[name])/1000;
   gridLine(new T.Vector3(0,-.19,z),new T.Vector3(X,-.19,z));
   axisNames.push({name:name,pos:new T.Vector3(-2.4,.15,z)})
  });
  axisNames.forEach(function(a){var el=document.createElement("span");el.className="ir-three-axis-label";el.textContent=a.name;axisLayer.appendChild(el);a.el=el});
  var meshGeo=new Map(),mats=new Map(),allMeshes=[],rayTargets=[],dataById=new Map(),meshesById=new Map();
  var selectedMat=new T.MeshStandardMaterial({color:0x217cdb,emissive:0x07396d,emissiveIntensity:.26,metalness:.25,roughness:.42});
  var hoverMat=new T.MeshStandardMaterial({color:0xe6a736,emissive:0x59410e,emissiveIntensity:.12,metalness:.22,roughness:.45});
  var zAxis=new T.Vector3(0,0,1);
  var failures=0;
  function hsvMark(key){
   var h=2166136261;for(var ch of String(key)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}
   return new T.Color().setHSL(((h>>>0)*.6180339887)%1,.6,.5).getHex()
  }
  function baseColor(c){
   if(colorMode==="status")return c.status==="mounted"?0x189970:c.status==="partial"?0xd4a03f:0xd85d64;
   if(colorMode==="mark")return hsvMark(c.mark||c.mark_name||c.id);
   return (groups[kind(c)]||groups.other)[1]
  }
  function baseMaterial(c){
   var color=baseColor(c);
   if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color:color,metalness:.29,roughness:.41,side:T.DoubleSide}));
   return mats.get(color)
  }
  function memberSegments(c){
   var p=memberPoints(c,T),segments=[];
   for(var i=0;i<p.length-1;i++)if(dist(p[i],p[i+1])>.005)segments.push([p[i],p[i+1]]);
   return segments
  }
  elems.forEach(function(c){
   var id=String(c.id||"");if(!id)return;
   dataById.set(id,c);
   if(!(kind(c) in layerEnabled))layerEnabled[kind(c)]=true;
   var segments=memberSegments(c);
   if(!segments.length){failures++;return}
   segments.forEach(function(points){
    var length=dist(points[0],points[1]),mesh=new T.Mesh(addGeometry(T,meshGeo,c),baseMaterial(c));
    mesh.position.copy(points[0]);mesh.scale.z=length;
    mesh.quaternion.setFromUnitVectors(zAxis,points[1].clone().sub(points[0]).normalize());
    mesh.userData.memberId=id;mesh.userData.baseMaterial=mesh.material;
    steel.add(mesh);allMeshes.push(mesh);
    if(!meshesById.has(id))meshesById.set(id,[]);
    meshesById.get(id).push(mesh)
   })
  });
  var keys=Object.keys(layerEnabled);
  keys.sort(function(a,b){return (groups[a]||groups.other)[0].localeCompare((groups[b]||groups.other)[0],"ru")});
  var layersEl=root.querySelector("#irThreeLayers");
  layersEl.innerHTML=keys.map(function(key){
   return '<label class="ir-three-layer"><input type="checkbox" data-three-layer="'+escapeHtml(key)+'" checked><i style="background:#'+
    ((groups[key]||groups.other)[1]).toString(16).padStart(6,"0")+'"></i><span>'+escapeHtml((groups[key]||groups.other)[0])+'</span>'+
    '<small>'+elems.filter(function(c){return kind(c)===key}).length+'</small></label>'
  }).join("");
  var center=new T.Vector3(X/2,Math.max(4,Math.min(15,number(props.maxZ||10000)/1900)),Y/2);
  var radius=Math.max(32,Math.hypot(X,Y)*1.35),controls=new T.OrbitControls(camera,renderer.domElement);
  controls.target.copy(center);controls.enableDamping=true;controls.dampingFactor=.075;
  controls.screenSpacePanning=true;controls.minDistance=2;controls.maxDistance=radius*5;
  var raycaster=new T.Raycaster(),pointer=new T.Vector2(),currentView="iso";
  function setView(name){
   currentView=name;root.querySelectorAll("[data-three-view]").forEach(function(b){b.classList.toggle("active",b.dataset.threeView===name)});
   controls.target.copy(center);camera.up.set(0,1,0);
   if(name==="top"){camera.position.set(center.x,Math.max(45,radius),center.z+.001);camera.up.set(0,0,-1)}
   else if(name==="front")camera.position.set(center.x,center.y+6,center.z+radius);
   else if(name==="side")camera.position.set(center.x+radius,center.y+6,center.z);
   else camera.position.set(center.x+radius*.78,center.y+radius*.5,center.z+radius*.92);
   camera.lookAt(center);controls.update()
  }
  function markupDetails(){
   var c=dataById.get(selected);
   if(!c){
    details.innerHTML='<div class="ir-three-detail-title">Свойства конструкции</div>'+
     '<div class="ir-three-empty">Выберите колонну, балку или связь в модели. Здесь появятся марка, координаты и отметки.</div>'+
     '<div class="ir-three-readonly">Отдельный режим просмотра. Данные не изменяются.</div>';
    return
   }
   var points=memberPoints(c,T),end=points[points.length-1],length=0;
   for(var i=1;i<points.length;i++)length+=dist(points[i-1],points[i]);
   function item(label,value){return '<div><span>'+label+'</span><strong>'+escapeHtml(value)+'</strong></div>'}
   details.innerHTML='<div class="ir-three-detail-title">Выбранная марка <button id="irThreeDeselect" title="Снять выбор">×</button></div>'+
    '<div class="ir-three-mark">'+escapeHtml(c.mark||c.title||"Без марки")+'</div>'+
    '<div class="ir-three-kind">'+escapeHtml((groups[kind(c)]||groups.other)[0])+'</div>'+
    '<div class="ir-three-status '+escapeHtml(c.status||"planned")+'">'+labelStatus(c.status)+'</div>'+
    '<div class="ir-three-properties">'+
     item("Профиль",c.profile_name||"Не указан")+
     item("Сечение",c.section_type||"—")+
     item("Длина",Math.round(length*1000).toLocaleString("ru-RU")+" мм")+
     item("Низ Z",Math.round(number(c.z0)).toLocaleString("ru-RU")+" мм")+
     item("Верх / конец Z",Math.round(number(c.z2)).toLocaleString("ru-RU")+" мм")+
     item("Начало X / Y",Math.round(number(c.x))+" / "+Math.round(number(c.y))+" мм")+
     item("Конец X / Y",Math.round(end.x*1000)+" / "+Math.round(end.z*1000)+" мм")+'</div>'+
    '<div class="ir-three-readonly">Данные из монтажной схемы IR Project. Для редактирования используйте существующий режим.</div>';
   details.querySelector("#irThreeDeselect").onclick=function(){choose("")}
  }
  function choose(id){
   selected=String(id||"");props.onSelect&&props.onSelect(selected);
   refreshMaterials();markupDetails()
  }
  function refreshMaterials(){
   allMeshes.forEach(function(mesh){
    var c=dataById.get(mesh.userData.memberId),k=kind(c),visible=layerEnabled[k]!==false;
    if(statusMode!=="all"&&c.status!==statusMode)visible=false;
    mesh.visible=visible;
    mesh.userData.baseMaterial=baseMaterial(c);
    mesh.material=mesh.userData.memberId===selected?selectedMat:mesh.userData.memberId===hover?hoverMat:mesh.userData.baseMaterial
   });
   rayTargets=allMeshes.filter(function(m){return m.visible});
   var count=rayTargets.length;
   root.querySelector("#irThreeCount").textContent=count+" / "+elems.length+(failures?" · без геометрии: "+failures:"")
  }
  function screenPointer(e){
   var rect=renderer.domElement.getBoundingClientRect();
   pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
   raycaster.setFromCamera(pointer,camera);
   var hits=raycaster.intersectObjects(rayTargets,false);
   return hits[0]?.object?.userData?.memberId||""
  }
  var pointerDown=null;
  function down(e){if(e.button===0)pointerDown=[e.clientX,e.clientY]}
  function up(e){
   if(!pointerDown||e.button!==0)return;
   var moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);pointerDown=null;
   if(moved<5)choose(screenPointer(e))
  }
  function move(e){
   if(pointerDown)return;
   var next=screenPointer(e);
   if(next!==hover){hover=next;refreshMaterials()}
  }
  renderer.domElement.addEventListener("pointerdown",down);
  renderer.domElement.addEventListener("pointerup",up);
  renderer.domElement.addEventListener("pointermove",move);
  root.querySelectorAll("[data-three-view]").forEach(function(button){button.onclick=function(){setView(button.dataset.threeView)}});
  root.querySelector("#irThreeReset").onclick=function(){setView("iso")};
  root.querySelector("#irThreeColors").value=colorMode;
  root.querySelector("#irThreeColors").onchange=function(e){colorMode=e.target.value;props.onColorModeChange&&props.onColorModeChange(colorMode);refreshMaterials()};
  root.querySelector("#irThreeStatus").onchange=function(e){statusMode=e.target.value;refreshMaterials()};
  root.querySelector("#irThreeGrid").onchange=function(e){showGrid=e.target.checked;ground.visible=showGrid};
  root.querySelector("#irThreeAxes").onchange=function(e){showAxes=e.target.checked};
  root.querySelectorAll("[data-three-layer]").forEach(function(input){input.onchange=function(){layerEnabled[input.dataset.threeLayer]=input.checked;refreshMaterials()}});
  root.querySelector("#irThreeAll").onclick=function(){keys.forEach(function(key){layerEnabled[key]=true});root.querySelectorAll("[data-three-layer]").forEach(function(c){c.checked=true});refreshMaterials()};
  root.querySelector("#irThreeNone").onclick=function(){keys.forEach(function(key){layerEnabled[key]=false});root.querySelectorAll("[data-three-layer]").forEach(function(c){c.checked=false});refreshMaterials()};
  function resize(){
   var w=Math.max(250,viewport.clientWidth),h=Math.max(300,viewport.clientHeight);
   renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()
  }
  var observer=window.ResizeObserver?new ResizeObserver(resize):null;
  if(observer)observer.observe(viewport);
  window.addEventListener("resize",resize);resize();
  function frame(){
   if(!alive)return;
   raf=requestAnimationFrame(frame);controls.update();
   axisNames.forEach(function(axis){
    if(!showAxes||!showGrid){axis.el.hidden=true;return}
    var p=axis.pos.clone().project(camera),w=viewport.clientWidth,h=viewport.clientHeight;
    var x=(p.x*.5+.5)*w,y=(-p.y*.5+.5)*h;
    axis.el.hidden=p.z>1||p.z< -1||x<18||x>w-18||y<40||y>h-18;
    axis.el.style.left=x+"px";axis.el.style.top=y+"px"
   });
   renderer.render(scene,camera);
   if(!firstPaint){firstPaint=true;props.onFirstPaint&&props.onFirstPaint()}
  }
  refreshMaterials();markupDetails();setView("iso");frame();
  return{dispose:function(){
   alive=false;if(raf)cancelAnimationFrame(raf);
   observer&&observer.disconnect();window.removeEventListener("resize",resize);
   renderer.domElement.removeEventListener("pointerdown",down);
   renderer.domElement.removeEventListener("pointerup",up);
   renderer.domElement.removeEventListener("pointermove",move);
   controls.dispose();
   meshGeo.forEach(function(g){g.dispose()});mats.forEach(function(m){m.dispose()});
   selectedMat.dispose();hoverMat.dispose();axisMaterial.dispose();
   scene.traverse(function(obj){if(obj.isGeometry&&obj.dispose)obj.dispose()});
   renderer.dispose();renderer.forceContextLoss?.();
   renderer.domElement.remove()
  }}
 }
 return{render:render,dispose:dispose}
})();
