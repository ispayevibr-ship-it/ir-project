"use strict";
/* The montage scheme has one view, 3D (Three.js). The page keeps data, filters, cuts and the details panel. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const page=fs.readFileSync("src/scheme-page.js","utf8");
const view=fs.readFileSync("src/scheme-three-view.js","utf8");
const css=fs.readFileSync("src/scheme-page.css","utf8");
const built=fs.readFileSync("src/ir-styles.css","utf8");
const runtime=fs.readFileSync("src/ir-runtime.js","utf8");
const html=fs.readFileSync("src/index.html","utf8");
// Only 3D: no mode switches, no plan or building renderer.
assert(!/data-mode=|Общий 3D|scheme-view-switch|scheme-preview-mode-switch/.test(page),"mode switches removed");
assert(!/renderUnifiedBuilding|irBuildingView|planSvg|bindScenePanZoom|schemePlanColor/.test(page),"plan and building renderers removed");
assert(!fs.existsSync("src/scheme-building-view.js")&&!html.includes("steel-geometry.js")&&!runtime.includes("irBuildingView.render"),"old 3D module removed");
assert(page.includes("window.irThreeSchemeView.render(box,{"),"3D is the scheme view");
// Functions moved from the plan and the old 3D view.
for(const prop of ["showLabels:labelsVisible","showDimensions:dimensionsVisible","background:currentBackground()","gridDirX,gridDirY",
 "marks:activeMarks().map(","onQuickPlace:frameMode?createFrameMember:null","onPlacement:placement=>openEditor(null,false,placement)",
 "onCopyPlacement:(id,target)=>copySchemeMember(id,target)","onColorModeChange:next=>changeColorMode(next)","elements:members.map(c=>({...c,scheme_group:recordMarkGroup(c).key}))"])
 assert(page.includes(prop),"3D gets "+prop);
assert(page.includes('<aside class="scheme-details" id="schemeDetails"></aside>'),"details panel with element search is shown next to 3D");
assert(page.includes('<details class="scheme-plan-cuts">')&&page.includes("const members=columns().filter(planCutVisible)"),"cuts work in 3D");
assert(page.includes("window.irThreeSchemeView?.startCopy?.(String(c.id))"),"copy placement picks the place in 3D");
assert(page.includes("window.irThreeSchemeView?.focus?.(String(entry.id))"),"choosing an element in the list flies the camera to it");
assert(page.includes('irProject.ai.invoke("ai-montage:clear-scheme"')&&page.includes('irProject.ai.invoke("ai-montage:restore-scheme"'),"clear and restore the scheme");
// Viewer features.
assert(view.includes("function paintLabels(")&&view.includes("shown>=160"),"member labels without overlap");
assert(view.includes("function dimensionChain(")&&view.includes('"dims"'),"grid bay dimensions");
assert(view.includes("function paintLegend(")&&view.includes("function applyBackground("),"colour legend and page background");
// Cranes: a runway is known by the member's own name (mark_name; the title of a record is its position «PDF-…»), they
// have their own colour, the legend counts them and a click there shows them one by one.
assert(/function runwayKind\(c\)\{\s*var n=String\(c\.mark_name\|\|c\.title\|\|""\)/.test(view)&&view.includes('function slight(c){var t=String(c.mark_name||c.title||"")'),"cranes and railings by the member's name");
assert(view.includes("color:0xff6a00")&&view.includes("Краны (условно)")&&view.includes("legend.onclick=function(e){")&&view.includes("cranes.push(Object.assign(info,{at:mid.clone().setY(gTop)"),"cranes in the legend, a click flies to them");
// «Это что за квадрат?» (25.10.2026): the cabin was a plain grey box under the bridge. It is a cab now (hangers, frame,
// panels below, glass above); every part of a crane knows its crane and name, the pointer over it says what it is, a click
// opens the crane's card (conventional, not in the КМ, its runways) and does not choose the member behind it.
assert(view.includes("var cabin=function(top,X,Z){")&&view.includes('partName="кабина крановщика"')&&view.includes("glassMat")&&!view.includes("box(1.5,1.7,1.5,hoistMat"),"the crane's cab drawn as a cab");
assert(view.includes("m.userData.crane=craneNo;m.userData.part=partName;")&&view.includes("function hitCrane(")&&view.includes("function showCrane(hit)"),"crane parts named");
assert(view.includes("var hit=hitMember(),cr=hitCrane();if(cr&&(!hit||cr.d<hit.d)){showCrane(cr);return}"),"a click on a crane opens its card, not the member behind");
assert(view.includes("Крана в чертежах КМ нет — это оборудование.")&&view.includes('" (условно, в КМ его нет): "+cr.part'),"the card and the pointer say what it is");
// Разбор узла (the engineer's choice from the report of 21.10.2026): a slider in the node's card; the carrying member stays,
// the others move off it along their bolts (or their axis), a column at its base goes up off the anchors; the bolts
// hang in the gap; every member is cut to a box about the node; the rest pale and given back after; the scheme itself
// does not change; cleared with the node, the crane card, a rebuild, the pictures for the file and the closing.
assert(view.includes('data-node="explode"')&&view.includes("function setExplode(n,s)")&&view.includes("function buildExplode(n)")&&view.includes("function clearExplode()"),"the slider takes the node apart");
assert(view.includes('m.role==="опора"||m.role==="примыкание"||n.kind==="top"&&m.c.geometryType==="column"')&&view.includes('n.kind==="base"&&c.geometryType==="column"?up.clone()'),"the carrying member stays, a column goes up off its base");
assert(view.includes('rod.userData.anchor="rod"')&&view.includes('nut.userData.anchor="nut"')&&view.includes("v.clone().multiplyScalar(.6)"),"anchors stay, bolts in the gap");
assert(view.includes("renderer.localClippingEnabled=true")&&view.includes("c.clippingPlanes=clip.planes"),"members cut about the node");
assert(view.includes("function ghost(on)")&&view.includes("Math.min(m.opacity,.08)")&&/ghosted\.forEach\(function\(v,m\)\{m\.transparent=v\.t;m\.opacity=v\.o;m\.depthWrite=v\.d/.test(view),"the rest pale, colours given back");
assert(view.includes("if(explode&&explode.node!==n)clearExplode()")&&view.includes("selectedNode=null;clearExplode();")&&/function clearNodes\(\)\{\s*clearExplode\(\)/.test(view)&&view.includes("alive=false;clearExplode();")&&view.includes("setExplode(null,0);"),"put together again when the node goes");
assert(!/explode[^\n]*(irProject|invoke|onSave|onUpdate)/.test(view),"only the picture moves");
assert(css.includes(".ir-three-node-explode{")&&built.includes(".ir-three-node-explode{")&&css.includes("background:#9aa3ad;white-space:nowrap}"),"the slider styled, the status badge on one line");
// Braces crossing in their plane (the engineer, 25.10.2026: «почему сквозь друг друга проходят?» — an X of Свк3): one runs
// through, the other is cut at the crossing with a gap round the first, a gusset in their plane welded to the one running
// through, the bolts on both halves; the bolts and the gusset as the drawing gives them for the crossing.
assert(view.includes("function findCrossings(list)")&&view.includes("var host=jointHosts(elems);findCrossings(elems);"),"crossings looked for before the members are drawn");
assert(view.includes("if(den<.06)continue;")&&view.includes("if(s<A.L*.12||s>A.L*.88||t<B.L*.12||t>B.L*.88)continue;")&&view.includes("if(P.distanceTo(Q)>.05)continue;"),"only braces crossing inside their lengths, in one plane");
assert(view.includes("g:Math.max(h.h,h.b)/sin+.03")&&view.includes("function cutAtCrossings(c,segments,cuts)"),"the cut halves clear of the one running through");
assert(view.includes("c.joint.crossing")&&view.includes("crossPlates.push({id:String(cr.through.id),mesh:plate})")&&view.includes("[-1,1].forEach(function(sg){row.forEach(function(s){addBolt(bc,"),"a gusset of the one running through, bolts on both halves");
assert(view.includes("cx.only=1;cuts=[cx]"),"a cross of one record: its second diagonal cut");
// The separate export for the iPhone (USDZ) removed at the engineer's request (25.10.2026): one export, the HTML.
for(const f of ["src/scheme-page.js","src/ir-runtime.js","src/index.html","src/ai-ipc.js","src/scheme-three-view.js"])assert(!/schemeExportUsdz|irSchemeUsdz|export-usdz|scheme-export-usdz/.test(fs.readFileSync(f,"utf8")),f+": no iPhone export");
assert(!fs.existsSync("src/scheme-export-usdz.js")&&!fs.readFileSync("hot/latest.json","utf8").includes("usdz"),"the USDZ module gone");
assert(view.includes('dirX==="rtl"?spanX-number(x)')&&view.includes('dirY==="btt"?spanY-number(y)'),"grid direction honoured");
assert(view.includes("function startPlacement(")&&view.includes("function snapMember(")&&view.includes("function snapGround("),"placement by clicks with snapping");
assert(view.includes('"верх "+(c.mark||"колонны")'),"beams rest on column tops");
// A landing in the guard ring of a shaft stair (РВС-700, «площадка узкая слишком» 27.10.2026): out from the frame to the
// arc of the ring round the axis of the shaft, not a rectangle inside the frame.
assert(view.includes("arcR=c.lay&&number(c.lay.arc_r_mm)>0")&&view.includes("ds.lineTo(dx,Math.max(0,Math.sqrt(arcR*arcR-dx*dx)-back))"),"a shaft landing out to the arc of its ring");
assert(view.includes("P.onQuickPlace(data)")&&view.includes("P.onQuickPlaced&&P.onQuickPlaced(result)"),"placement saved through the page checks");
assert(view.includes("active.host===host&&active.key===key")&&view.includes("cameraMemory[memoryKey]"),"updates keep WebGL and the camera");
assert(view.includes('"./vendor/three/three.min.js"')&&fs.existsSync("src/vendor/three/three.min.js")&&fs.existsSync("src/vendor/three/OrbitControls.js"),"Three.js works offline");
assert(!view.includes("schemeApi."),"viewer never writes data itself");
assert(view.includes("renderer.dispose();renderer.forceContextLoss?.();"),"GPU cleanup");
assert(css.includes(".ir-three-place{")&&built.includes(".ir-three-member-label{"),"styles compiled");
assert(html.indexOf("scheme-three-view.js?v=")<html.indexOf("ir-runtime.js?v="),"script order");
const scope={window:{},Promise,Map,Set,Math,Number,Array,String,Error,JSON,document:{}};
vm.runInNewContext(view,scope);
// The central ring of a shield roof is drawn as the sheet shows it (27.10.2026, «там просто отверстие в центре?»): the box on
// its bottom plate, the ribs with the bolts of the shields, the central shield cone over it — not a flat ring with a hole.
assert(/if\(c\.lay&&c\.lay\.kind==="central_ring"&&number\(c\.r\)>0&&centralRing\(c,id,p\[0\]\)\)return;/.test(view),"the ring before the flat plate");
const ring=view.slice(view.indexOf("function centralRing("),view.indexOf("function buildMembers("));
// An oval manhole (РВС-700 КМ-14, 27.10.2026: «почему люк показывается как круглый? если он овальный»): the shell, the flange
// and the cover of a rounded shape along the wall, the sizes of the sheet.
assert(/else if\(\(type==="manhole"\|\|type==="hatch"\)&&c\.lay&&Array\.isArray\(c\.lay\.oval_mm\)/.test(view)&&view.includes("mm(c.lay.shell_mm,")&&view.includes("mm(c.lay.flange_mm,")&&view.includes("p.absarc(hx,0,rr,"),"an oval manhole");
assert(/annulus\(sr,pr,t,0\);annulus\(wr-t\/2,wr\+t\/2,H,t\);annulus\(sr,sr\+\.006,H,t\);annulus\(sr,wr\+/.test(ring),"bottom plate, wall, inner shell, top flange");
assert(/for\(var k=0;k<n;k\+\+\)/.test(ring)&&/addBolt\(\{id:id,joint:\{\}\}/.test(ring),"a rib and a bolt at every joint of the shields");
assert(/CylinderGeometry\(\.002,cr,/.test(ring)&&/roofMaterial\(c\)/.test(ring),"the central shield cone");
// A tank (27.10.2026: «если это резервуар показывай высоту на монтажной схеме и диаметр»): Ø on the floor in front of it and
// the height of the wall at a front corner, always shown — in the program and in the exported page, its pictures too.
const tank=view.slice(view.indexOf("function buildTankDims("),view.indexOf("var meshGeo=new Map()"));
assert(/String\(c\.type_key\|\|""\)!=="tank_wall"&&String\(c\.scheme_group/.test(tank)&&tank.includes("k.r=Math.max(k.r,number(c.r));k.z0=Math.min(k.z0,number(c.z0));k.z1=Math.max(k.z1,number(c.z2))"),"the wall: the courses of one centre");
assert(tank.includes('"Ø "+fmt(2*k.r)+" мм"')&&tank.includes('"Высота стенки "+fmt(H)+" мм"'),"diameter and wall height labels");
assert(/var on=t\.group==="tank"\?true:/.test(view),"tank sizes do not wait for the dimensions toggle");
assert.equal(view.split("buildCranes();buildTankDims();").length-1,2,"rebuilt with the members and at the start");
assert(/if\(t\.group!=="tank"\)return;var q=project\(t\.pos,W,H\)/.test(view),"drawn into the pictures of the exported page");
assert(/'Выгружено '\+esc\(d\.date\)\+'<small class="made">Сделано в IR Project<\/small>/.test(fs.readFileSync("src/scheme-export-html.js","utf8")),"the exported page: «Сделано в IR Project» in small letters");
for(const fn of ["render","dispose","focus","startCopy","startPlacement"])assert.equal(typeof scope.window.irThreeSchemeView[fn],"function",fn);
assert.equal(scope.window.irThreeSchemeView.focus("1"),undefined,"API calls are safe without a model");
const manifest=JSON.parse(fs.readFileSync("hot/latest.json","utf8")).files.map(f=>f.target);
assert(manifest.includes("src/vendor/three/three.min.js")&&manifest.includes("src/scheme-three-view.js"),"3D files come with the hot update");
console.log("Montage scheme: single 3D view with labels, dimensions, cuts, placement, copy, clear/restore PASS");
