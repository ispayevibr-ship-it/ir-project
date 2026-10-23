"use strict";
/*
 * IR Project AI: the nodes of the drawings (узлы КМ/КМД) for the members of a checked set. The set keeps each node
 * once — its sheet, kind and sizes (verified.nodes) — and the rules naming the member ends it belongs to
 * (verified.node_rules). Here every element gets its own copy: e.nodes = {a, b} for the start and the end of a member,
 * {base, top} for a column. The 3D (scheme-three-view.js) draws the node from it instead of a conventional one.
 *
 * A rule: {node, mark, end, host, name, block, x, y, z, mirror}
 *  - end: "a" | "b" | "low" | "high" | "any" for a member (the lower or upper end of a sloped one), "base" | "top" for
 *    a column;
 *  - host: the mark of the column at that end («К1|К2»), nohost: true — an end not at a column (a cross of braces);
 *  - name, block: parts of the element's name and block; x, y, z: [from, to] mm of that end;
 *  - mirror: "x" | "y" — the node drawn mirrored («Зеркально» on the sheet).
 * Kinds: base (plate, grout, anchors, washer plates, traverses and ribs), gusset (a plate at a face or a node, bolts
 * along the member), cleat (plates both sides of a web), endplate (a flange plate bolted to the face), weld.
 */
const HOST_TOL=900;
function attachNodes(elements,nodes,rules){
 if(!nodes||typeof nodes!=="object"||!Array.isArray(rules)||!rules.length)return 0;
 const C=3000,cells=new Map(),cell=(x,y)=>Math.floor(x/C)+","+Math.floor(y/C);
 for(const c of elements)if(c.geometry_type==="column"){const k=cell(+c.x_mm||0,+c.y_mm||0);(cells.get(k)||cells.set(k,[]).get(k)).push(c)}
 const hostAt=(x,y,z)=>{
  let best=null;
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const c of cells.get((Math.floor(x/C)+i)+","+(Math.floor(y/C)+j))||[]){
   const d=Math.hypot((+c.x_mm||0)-x,(+c.y_mm||0)-y);
   if(d<=HOST_TOL&&z>=(+c.z0_mm||0)-300&&z<=(+c.z1_mm||0)+300&&(!best||d<best.d))best={d,c}
  }
  return best?best.c:null
 };
 const within=(r,k,v)=>!Array.isArray(r[k])||v>=Number(r[k][0])&&v<=Number(r[k][1]);
 const spec=r=>({id:r.node,...nodes[r.node],...(r.mirror?{mirror:r.mirror}:{})});
 const byMark=new Map();for(const r of rules)if(r&&r.node&&nodes[r.node]){(byMark.get(r.mark)||byMark.set(r.mark,[]).get(r.mark)).push(r)}
 let n=0;
 for(const e of elements){
  const rs=(byMark.get(e.mark)||[]).filter(r=>(!r.name||String(e.name||"").includes(r.name))&&(!r.block||String(e.block||"").includes(r.block)));
  if(!rs.length)continue;
  const out={};
  if(e.geometry_type==="column"){
   for(const end of["base","top"]){
    const z=end==="base"?+e.z0_mm:+e.z1_mm,r=rs.find(r=>(r.end||"base")===end&&within(r,"z",z)&&within(r,"x",+e.x_mm)&&within(r,"y",+e.y_mm));
    if(r)out[end]=spec(r)
   }
  }else{
   const a={x:+e.x_mm,y:+e.y_mm,z:+e.z0_mm},b={x:+(e.x2_mm??e.x_mm),y:+(e.y2_mm??e.y_mm),z:+(e.z1_mm??e.z0_mm)},level=Math.abs(a.z-b.z)<=50;
   for(const [k,p,q] of[["a",a,b],["b",b,a]]){
    const tags=new Set(["any",k]);if(!level)tags.add(p.z<q.z?"low":"high");
    const h=hostAt(p.x,p.y,p.z);
    const r=rs.find(r=>tags.has(r.end||"any")&&(!r.host||h&&String(r.host).split("|").includes(h.mark))&&(!r.nohost||!h)&&within(r,"x",p.x)&&within(r,"y",p.y)&&within(r,"z",p.z));
    if(r)out[k]=spec(r)
   }
  }
  if(Object.keys(out).length){e.nodes=out;n++}
 }
 return n
}
module.exports={attachNodes};
