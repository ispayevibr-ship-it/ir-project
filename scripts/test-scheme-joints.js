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
assert.ok(view.includes("plated=!brace&&(dia>0||endCuts(c).some(function(q){return q.end===k}))"),"a bolted or plated end stops at the face");
// Braces: the plane of the gussets from the braces it crosses or meets (a bracing in a roof slope lies in the slope),
// the angles beside the gusset (a pair either side of it), the halves of a crossing clear of each other's edges.
assert.match(view,/function bracePlanes\(list\)\{/);assert.match(view,/function braceAngle\(c,u\)\{/);
assert.ok(view.includes("seatOnTops(elems);hangTies(elems);wallCuts(elems);deckCuts(elems);panelCorners(elems);bracePlanes(elems);"),"planes known before the members are drawn");
assert.ok(view.includes("function planeWidth(c){")&&view.includes("+(cut?planeWidth(cut)*cs/sin:0)+.03"),"the halves of a crossing clear of each other");
// Beams crossing in the middle: the lower one is cut round the one running through (no node gusset for those).
assert.ok(view.includes("crossCut.get(cut.id).push({at:P,n:cut.U.clone().cross(thr.U).normalize(),g:g,through:thr.c,plain:true})"),"a plain crossing splits the lower");
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
const pc=new Function("number",view.match(/var panelExt=new Map\(\);\n  function panelCorners\(list\)\{[\s\S]*?\n  \}\n/)[0]+";return {panelCorners,panelExt}")(number);
const wall=(id,x,y,x2,y2)=>({id,ft:"panel",x,y,x2,y2,z0:0,fd:3000,lay:{panel:"wall",thickness_mm:150}});
pc.panelCorners([wall("A",0,0,6000,0),wall("1",0,0,0,6000),wall("T",3000,0,3000,6000)]);
assert.deepEqual(pc.panelExt.get("A"),[.075,0],"along X: on to the outer face");
assert.deepEqual(pc.panelExt.get("1"),[-.075,0],"across: stops at the inner face");
assert.deepEqual(pc.panelExt.get("T"),[-.075,0],"at the side of another: stops at its face");
pc.panelCorners([wall("A",0,0,6000,0),wall("far",0,800,0,6000)]);
assert.equal(pc.panelExt.size,0,"a wall 800 mm off is no corner");
console.log("Nodes: ends at the faces of the bodies by rank, plain crossings split, braces beside their gussets in their plane, gusset outlines, decks round columns, panel corners, end plates across PASS");
