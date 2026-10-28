"use strict";
// Members meeting at a node do not go through each other, the node is drawn; a gusset of a node does not come out
// through the steel (the engineer, 27.10.2026: «если у металлоконструкций есть узел, то они не должны проходить сквозь
// друг друга, а должен показываться узел… всех чертежей касается»). The end of a member stops at the face of the body
// it comes to (a column before a beam, a main beam before a secondary one, these before a brace), a beam through a beam
// of lower rank splits it, an angle brace lies beside its gusset, a node gusset is the outline of the members on it, a
// deck is cut round a column, walls of panels meet at a corner, an end plate lies across its member.
const assert=require("node:assert/strict"),fs=require("node:fs");
const view=fs.readFileSync(__dirname+"/../src/scheme-three-view.js","utf8");
// Rank: a column, a main beam, a secondary member, a tie, a railing; of two alike the deeper, then the longer.
assert.match(view,/function jointRank\(c\)\{/);
assert.ok(view.includes('var r=g==="guards"||slight(c)?0:g==="ties"?1:c.geometryType==="column"||g==="columns"?4:/^(beams|girders|roof|crane|trusses)$/.test(g)||c.truss?3:2;'),"the order of the members at a node");
// The bodies: every member as a box of its section along its axis (an angle on its gusset by its legs); an end inside a
// body of a higher rank stops at its face (the slab test along the axis), a truss and a lattice are bodies by their parts.
assert.match(view,/function pieceBox\(c,a,b\)\{/);assert.match(view,/function jointHosts\(list\)\{/);
assert.ok(view.includes("host.parts(c,meshesById.get(id))"),"trusses and lattices are bodies too");
assert.ok(view.includes("var face=Math.min(hit.t,L*.4),cut=Math.min(face+(brace?.1:0),L*.45);"),"an end bears on the face it comes to");
// Braces: the plane of the gussets from the braces it crosses or meets (a bracing in a roof slope lies in the slope),
// the angles beside the gusset (a pair either side of it), the halves of a crossing clear of each other's edges.
assert.match(view,/function bracePlanes\(list\)\{/);assert.match(view,/function braceAngle\(c,u\)\{/);
assert.ok(view.includes("seatOnTops(elems);hangTies(elems);seatLevels(elems);wallLines(elems);wallCuts(elems);deckCuts(elems);panelCorners(elems);bracePlanes(elems);"),"planes known before the members are drawn");
assert.ok(view.includes("function planeWidth(c){")&&view.includes("+(cut?planeWidth(cut)*cs/sin:0)+.03"),"the halves of a crossing clear of each other");
// Beams crossing in the middle: the lower one is cut round the one running through (no node gusset for those).
assert.ok(view.includes("crossCut.get(cut.id).push({at:P,n:cut.U.clone().cross(thr.U).normalize(),g:g,through:thr.c,plain:true,body:thr,host:host})"),"a plain crossing splits the lower");
assert.ok(view.includes(".plain){cr.done=true;"),"no crossing gusset at a plain crossing");
// A node gusset: the outline (convex hull) of the members on it, each as far as its bolts and a bit more.
assert.ok(view.includes("var backOf=function(me){var b=.12;"),"the members on a gusset stand back to clear each other");
const hull2=new Function(view.match(/function hull2\(pts\)\{[\s\S]*?\n  \}\n/)[0]+";return hull2")();
assert.deepEqual(hull2([[0,0],[2,0],[1,1],[2,2],[0,2],[1,.5]]).map(String).sort(),["0,0","0,2","2,0","2,2"],"the outline goes round the corners only");
assert.deepEqual(hull2([[0,0],[1,1]]),[],"no outline of two points");
// The end plate across its member (the basis was left-handed: the plate stood edge-on, along the member).
assert.ok(view.includes("side0=Math.abs(d0.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0).cross(d0).normalize(),up0=d0.clone().cross(side0).normalize()"),"the end plate across");
assert.ok(view.includes("sub(out.clone().multiplyScalar(t/2))"),"the end plate within the member's length");
// A deck: cut round the columns through it, its bottom on the tops of the beams.
assert.match(view,/function deckCuts\(list\)\{/);assert.ok(view.includes("deckHoles.get(")&&view.includes("y+=.02"),"deck holes, on the beams");
// Walls of panels at a corner: the one more along X runs on to the outer face of the other, the other stops at its inner
// face; a wall ending at the side of another stops at its face.
const number=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
// (the ends of a wall as memberPoints gives them — a wall moved onto the outer face of the frame with them; plan mm here)
const pc=new Function("number","memberPoints","fromWorld",view.match(/var panelExt=new Map\(\);\n  function panelCorners\(list\)\{[\s\S]*?\n  \}\n/)[0]+";return {panelCorners,panelExt}")(number,c=>[{x:c.x,y:c.y,z:0},{x:c.x2,y:c.y2,z:0}],v=>v);
const wall=(id,x,y,x2,y2)=>({id,ft:"panel",x,y,x2,y2,z0:0,fd:3000,lay:{panel:"wall",thickness_mm:150}});
pc.panelCorners([wall("A",0,0,6000,0),wall("1",0,0,0,6000),wall("T",3000,0,3000,6000)]);
assert.deepEqual(pc.panelExt.get("A"),[.075,0],"along X: on to the outer face");
assert.deepEqual(pc.panelExt.get("1"),[-.075,0],"across: stops at the inner face");
assert.deepEqual(pc.panelExt.get("T"),[-.075,0],"at the side of another: stops at its face");
pc.panelCorners([wall("A",0,0,6000,0),wall("far",0,800,0,6000)]);
assert.equal(pc.panelExt.size,0,"a wall 800 mm off is no corner");
// No breaks (the engineer, 27.10.2026, after the report of 21.10: «там все конструкции четко примыкают к друг другу»,
// «обрывов нет»): an end short of the body ahead of it (up to 250 mm) reaches it, not through another member nor where
// members meet at its point; a member coming to an I or a channel from its open side goes on to its web, 10 mm short —
// whole when it has room between the flanges, else its flanges cut back and its web on —, a plate on the web with its
// bolts; so too the halves of a plain crossing. Drawn only: the scheme keeps its coordinates.
assert.ok(view.includes("for(var r=.03;r<=.25&&!hit;r+=.03){var P=e[0].clone().sub(e[1].clone().multiplyScalar(r)),got=host(id,P,e[1]);if(got&&!blocked(P,got.body)){hit=got;E0=P;break}if(blocked(P))break}"),"an end reaches the body ahead");
assert.ok(view.includes("if(!hit&&!host.node(e[0]))"),"not where members meet at a point");
assert.match(view,/function webJoint\(c,E,d,u,hit,parts\)\{/);assert.match(view,/function roomAt\(c,E,u,hit\)\{/);
assert.ok(view.includes("var w=free?webJoint(c,cr.at,d,u,x,parts||[]):null,g=w!==null?w:x.t;"),"the halves of a plain crossing to the web");
assert.ok(view.includes("var whole=segments.length===1||c.cross,t=trimSegment(c,id,sg[0],sg[1],host,extra,[whole||i===0,whole||i===segments.length-1]);"),"a bent member's middle point is no end");
// webOf / exitOf on an I 300 wide (web 10) along X, its line along Z: a member along X from the axis leaves it at the edge
// of the flange (150) and goes on to the web (5); along Y (through the flange) it has no web to go to.
function V(x,y,z){this.x=x;this.y=y;this.z=z}
V.prototype={clone(){return new V(this.x,this.y,this.z)},sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this},add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this},
 dot(v){return this.x*v.x+this.y*v.y+this.z*v.z},multiplyScalar(k){this.x*=k;this.y*=k;this.z*=k;return this}};
const fx=new Function(view.match(/function webOf\(h,x,dx,t\)\{[\s\S]*?\n  \}\n/)[0]+view.match(/function exitOf\(h,E,d\)\{[\s\S]*?\n  \}\n/)[0]+";return{webOf,exitOf}")();
const I={o:new V(0,0,0),X:new V(1,0,0),Y:new V(0,1,0),U:new V(0,0,1),x0:-.15,x1:.15,y0:-.15,y1:.15,s0:0,s1:6,tf:.015,web:[-.005,.005]};
const ex=fx.exitOf(I,new V(0,0,3),new V(1,0,0));
assert.equal(+ex.t.toFixed(3),.15,"out at the edge of the flange");assert.equal(+ex.web.toFixed(3),.005,"on to the web");assert.equal(+ex.lo.toFixed(3),-.135);assert.equal(+ex.hi.toFixed(3),.135);
assert.equal(fx.exitOf(I,new V(0,0,3),new V(0,1,0)).web,undefined,"through a flange: no web");
assert.equal(fx.exitOf(I,new V(.4,0,3),new V(1,0,0)),null,"a line clear of it");
// 27.10.2026 (the engineer: «есть еще моменты которые не учли?»): a branch of a lattice column stands with its
// flanges along the line to the other branch (КМ «сечение 1-1»): drawn as a column of the frame it took the wall girders
// lying on its outer flange edges 70 mm into it. Its turn about its line goes to every use of its section (the body, the
// boxes of the nodes, plates, holes, the base plate, the plan of decks and seats).
assert.match(view,/function branchTurns\(list\)\{/);assert.match(view,/function bodyQuat\(c,u\)\{/);assert.match(view,/function planHalf\(c\)\{/);
assert.ok(view.includes("branchTurns(elems);seatOnTops(elems);"),"branches turned before the nodes are found");
assert.ok(!/setFromUnitVectors\(zAxis,(u|d|v)\),(sec|X|hs0)/.test(view)&&!view.includes("var q=new T.Quaternion().setFromUnitVectors(zAxis,d),X="),"every section basis by bodyQuat");
assert.ok(view.includes("mesh.quaternion.copy(bodyQuat(c,points[1].clone().sub(points[0]).normalize()))")&&view.includes("plate.quaternion.copy(turn)"),"the body and its base plate turned");
function W(x,y,z){this.x=x;this.y=y;this.z=z}W.prototype.sub=function(v){return new W(this.x-v.x,this.y-v.y,this.z-v.z)};
const bt=new Function("number","toWorld",view.match(/var branchTurn=new Map\(\);\n  function branchTurns\(list\)\{[\s\S]*?\n  \}\n/)[0]+";return{branchTurns,branchTurn}")(number,(x,y,z)=>new W(number(x)/1000,number(z)/1000,(63200-number(y))/1000));
const br=(id,y,name)=>({id,mark:"К1",geometryType:"column",x:14150,y,z0:-600,z2:13240,mark_name:name});
bt.branchTurns([br(2,5850,"Колонна К1 — наружная ветвь, О4/Б"),br(3,7100,"Колонна К1 — подкрановая ветвь, О4/Б"),br(4,5950,"Колонна К1 — надкрановая часть I50Ш3, О4/Б")]);
assert.deepEqual([...bt.branchTurn].map(([k,v])=>[k,+v.toFixed(4)]),[["2",1.5708],["3",-1.5708]],"the two branches turned to each other, the upper part not");
// A channel's plate on the web goes inside its flanges when its back stands against the other's flange (the struts [30П
// between the flanges of a branch went 10 mm into it); a rail ends at the crane stop across it; a railing post at the level
// of a deck stands on it; the end plate of a beam is flush with its top (a deck lies on it).
assert.ok(view.includes("if(side<0&&Math.abs(dx)>.7&&(yb<hit.lo||yb>hit.hi))side=1;"),"the plate inside the channel");
assert.match(view,/function stopTrim\(c,a,b\)\{/);assert.ok(view.includes('segments.length===1&&runwayKind(c)==="rail")segments=[stopTrim('),"rails end at the stops");
assert.ok(view.includes("guardLift.set(k.id,Math.max(guardLift.get(k.id)||0,y+.04-k.y))")&&view.includes("if(guardLift.has(id)){"),"posts on the deck");
assert.ok(view.includes("ep.position.copy(at0).sub(up0.clone().multiplyScalar(.02))"),"the end plate flush with the top");
console.log("Nodes: ends at the faces of the bodies by rank, plain crossings split, braces beside their gussets in their plane, gusset outlines, decks round columns, panel corners, end plates across; ends reach their supports, to the web of an I with a plate; branches of lattice columns turned, rails to the stops, posts on decks PASS");
