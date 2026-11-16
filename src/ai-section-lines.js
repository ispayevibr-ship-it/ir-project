"use strict";
// The drawing of a section, not only its axes and levels (просьба инженера 16.11.2026 по АР ч.1 л.13: «Почему не все
// линии, сэндвич пропускает, на здание труба и желоб, много чего, весь лист пусть читает»):
// - bands of hatching cut by the section — sandwich panels of walls and roofs (cross hatching of the wool between two
//   lines), with their top, bottom, thickness and the joints of the panels (a break of the hatching, a line across);
// - the callouts — a label on a shelf with a leader to the drawing: what the leader points at, at which axis and height
//   (stairs, platforms, the crane, the railing of the roof, porches, a ramp, the downpipe, openings of ОВ with their size
//   and bottom, the circles of nodes and the sheets they are drawn on);
// - the downpipe on the building: the two lines of the pipe at the leader of «водосток», its top and bottom, the bend.
// Units: along — `along(xpt)` mm by the axes, up — `zAt(ypt)` mm by the levels; both given by extractSectionViews.

const len=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
const r10=v=>Math.round(v/10)*10;

// Bands of hatching between two parallel lines (the faces of a panel): a stroke whose two ends lie on two long lines —
// the band is those two lines, from 40 to 320 mm apart; strokes both ways — the wool of a sandwich panel. Along a band the
// strokes stand at one pitch; a gap of more than two pitches, or a line across from face to face, is a joint.
function panelBands(segments,box,scale,along,zAt){
 const inBox=p=>p.x>=box.x0&&p.x<=box.x1&&p.y>=box.y0&&p.y<=box.y1;
 const longs=segments.filter(s=>len(s)>=8&&(inBox(s.a)||inBox(s.b))),C=6,grid=new Map();
 longs.forEach((s,i)=>{const x0=Math.floor(Math.min(s.a.x,s.b.x)/C),x1=Math.floor(Math.max(s.a.x,s.b.x)/C),y0=Math.floor(Math.min(s.a.y,s.b.y)/C),y1=Math.floor(Math.max(s.a.y,s.b.y)/C);
  if((x1-x0+1)*(y1-y0+1)>4000)return;for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x+","+y;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}});
 const onLine=p=>{const o=grid.get(Math.floor(p.x/C)+","+Math.floor(p.y/C))||[];let best=null,bd=.35;
  for(const i of o){const s=longs[i],L=len(s),t=((p.x-s.a.x)*(s.b.x-s.a.x)+(p.y-s.a.y)*(s.b.y-s.a.y))/(L*L);if(t<-.01||t>1.01)continue;
   const d=Math.abs((p.x-s.a.x)*(s.b.y-s.a.y)-(p.y-s.a.y)*(s.b.x-s.a.x))/L;if(d<bd){bd=d;best=s}}return best};
 // (a carrier: the line's direction and offset, so the pieces of one face are one)
 const carrier=s=>{let ang=Math.atan2(s.b.y-s.a.y,s.b.x-s.a.x);if(ang<0)ang+=Math.PI;if(ang>=Math.PI-1e-6)ang=0;const nx=-Math.sin(ang),ny=Math.cos(ang),off=s.a.x*nx+s.a.y*ny;return{ang,off,nx,ny,ux:Math.cos(ang),uy:Math.sin(ang)}};
 const strokes=segments.filter(s=>{const L=len(s);if(L<1.2||L>16||Number(s.w)>=1)return false;const m={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2};return inBox(m)});
 const groups=new Map();
 for(const st of strokes){const A=onLine(st.a),B=onLine(st.b);if(!A||!B||A===B)continue;const ca=carrier(A),cb=carrier(B);
  if(Math.abs(ca.ang-cb.ang)>.02&&Math.abs(Math.abs(ca.ang-cb.ang)-Math.PI)>.02)continue;const gap=Math.abs(ca.off-cb.off);if(gap<.8)continue;
  // (the stroke slants to the faces — not a line across, which is a joint)
  const sx=st.b.x-st.a.x,sy=st.b.y-st.a.y,along_=Math.abs(sx*ca.ux+sy*ca.uy)/len(st);if(along_<.25)continue;
  const lo=Math.min(ca.off,cb.off),key=Math.round(ca.ang*100)+":"+Math.round(lo*2)+":"+Math.round(gap*4);
  if(!groups.has(key))groups.set(key,{c:ca,lo,gap,st:[]});groups.get(key).st.push(st)}
 const out=[];
 for(const g of groups.values()){if(g.st.length<4||g.gap*scale<40||g.gap*scale>320)continue;
  const pos=g.st.filter(s=>((s.b.x-s.a.x)*g.c.ux+(s.b.y-s.a.y)*g.c.uy)*((s.b.x-s.a.x)*g.c.nx+(s.b.y-s.a.y)*g.c.ny)>0).length,cross=Math.min(pos,g.st.length-pos)>=g.st.length*.2;
  const t=p=>p.x*g.c.ux+p.y*g.c.uy,iv=g.st.map(s=>[Math.min(t(s.a),t(s.b)),Math.max(t(s.a),t(s.b))]).sort((a,b)=>a[0]-b[0]);
  const mids=iv.map(v=>(v[0]+v[1])/2),steps=mids.slice(1).map((m,i)=>m-mids[i]).filter(d=>d>.05).sort((a,b)=>a-b),pitch=steps.length?steps[steps.length>>1]:1;
  // (pieces: runs of strokes with gaps up to two pitches and 3 pt)
  const runs=[];for(const v of iv){const r=runs[runs.length-1];if(r&&v[0]<=r[1]+Math.max(3,pitch*2.2))r[1]=Math.max(r[1],v[1]);else runs.push([v[0],v[1]])}
  const total=runs.reduce((a,r)=>a+r[1]-r[0],0);if(total<g.gap*3)continue;
  const at=(tt,off)=>({x:g.c.ux*tt+g.c.nx*off,y:g.c.uy*tt+g.c.ny*off}),mid=g.lo+g.gap/2;
  const p0=at(runs[0][0],mid),p1=at(runs[runs.length-1][1],mid),joints=runs.slice(1).map((r,i)=>at((runs[i][1]+r[0])/2,mid));
  const vert=Math.abs(g.c.uy)>.94,flat=Math.abs(g.c.uy)<.06,thick=r10(g.gap*scale);
  // (a panel shorter than 1,5 m — the hatch of a joint of the base, of a corner — is not a wall or a roof)
  if(Math.hypot(p1.x-p0.x,p1.y-p0.y)*scale<1500)continue;
  if(vert){const top=p0.y<p1.y?p0:p1,bot=p0.y<p1.y?p1:p0;
   out.push({kind:cross?"wall_panel":"wall_band",u_mm:along(top.x),thick_mm:thick,z0_mm:zAt(bot.y),z1_mm:zAt(top.y),joints_z_mm:joints.map(j=>zAt(j.y)).sort((a,b)=>a-b),pt:{x:Math.round(top.x),y0:Math.round(top.y),y1:Math.round(bot.y)}})}
  else{const l=p0.x<p1.x?p0:p1,r=p0.x<p1.x?p1:p0,z0=zAt(l.y),z1=zAt(r.y),u0=along(l.x),u1=along(r.x);
   out.push({kind:cross?(flat?"slab_panel":"roof_panel"):"band",u0_mm:u0,z0_mm:z0,u1_mm:u1,z1_mm:z1,thick_mm:thick,...(flat?{}:{slope_pct:u1!==u0?Math.round(Math.abs(z1-z0)/Math.abs(u1-u0)*1000)/10:null}),
    joints_u_mm:joints.map(j=>along(j.x)).sort((a,b)=>a-b),pt:{x0:Math.round(l.x),y0:Math.round(l.y),x1:Math.round(r.x),y1:Math.round(r.y)}})}}
 return out
}

// Callouts: the label on a shelf (a line under it), the leader from an end of the shelf to the drawing.
const KINDS=[["opening",/отверсти|проём|проем|\bотв\b\.?/iu],["drain",/водосток|водосточн|желоб|жёлоб|воронк/iu],["stair",/лестниц|марш/iu],["platform",/площадк/iu],
 ["crane",/кран/iu],["railing",/ограждени/iu],["porch",/крыльц/iu],["ramp",/пандус/iu],["frame",/рама|ворот/iu],["floor",/пол[аов]?\b|экспликац|состав\s+пол|канал/iu],
 ["foundation",/плита\s+основан|фундамент/iu],["node",/^(?:по\s+)?(?:узел|узлу|узла)\s*\d/iu]];
function calloutsOf(texts,segments,box,along,zAt){
 const T=texts.map(t=>({str:String(t.str||"").replace(/\s+/gu," ").trim(),x0:t.x,x1:t.x+(t.width||0),y:t.y,h:Number(t.size)||8,ang:Math.abs(t.angle||0)}))
  .filter(t=>t.str&&t.ang<5&&t.x1>box.x0&&t.x0<box.x1&&t.y>box.y0&&t.y<box.y1);
 const H=segments.filter(s=>Math.abs(s.a.y-s.b.y)<.3&&Math.abs(s.a.x-s.b.x)>=4);
 const inside=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1,near=(p,q,d=1.6)=>Math.hypot(p.x-q.x,p.y-q.y)<=d;
 const out=[],taken=new Set();
 for(const t of T){
  if(taken.has(t)||!/[А-Яа-яЁё]{3,}/u.test(t.str))continue;
  // (the shelf: under the label within its height, under most of it)
  const shelf=H.find(s=>{const y=s.a.y,x0=Math.min(s.a.x,s.b.x),x1=Math.max(s.a.x,s.b.x);return y>t.y-.5&&y<t.y+t.h*.7&&Math.min(x1,t.x1)-Math.max(x0,t.x0)>=(t.x1-t.x0)*.5});
  if(!shelf)continue;
  const ends=[shelf.a,shelf.b];let leader=null,from=null;
  for(const e of ends){const s=segments.find(q=>q!==shelf&&Math.abs(q.a.y-q.b.y)>=.5&&len(q)>=4&&(near(q.a,e)||near(q.b,e)));if(s){leader=s;from=near(s.a,e)?s.a:s.b;break}}
  if(!leader)continue;
  // (the leader to its end: pieces going on in one line)
  let cur=near(leader.a,from)?leader.b:leader.a,dir={x:cur.x-from.x,y:cur.y-from.y};
  for(let k=0;k<6;k++){const L=Math.hypot(dir.x,dir.y)||1;const nx=segments.find(q=>{if(!(near(q.a,cur,.8)||near(q.b,cur,.8)))return false;const o=near(q.a,cur,.8)?q.b:q.a,v={x:o.x-cur.x,y:o.y-cur.y},l=Math.hypot(v.x,v.y);return l>1&&(v.x*dir.x+v.y*dir.y)/(l*L)>.995});
   if(!nx)break;const o=near(nx.a,cur,.8)?nx.b:nx.a;dir={x:o.x-cur.x,y:o.y-cur.y};cur=o}
  // (the second line of the label under the shelf — «см. лист КМ 3-44»)
  const below=T.filter(o=>o!==t&&o.y>shelf.a.y&&o.y<shelf.a.y+o.h*1.8&&Math.min(o.x1,t.x1+20)-Math.max(o.x0,t.x0-20)>0).sort((p,q)=>p.y-q.y);
  const lines=[t.str];for(const o of below.slice(0,2)){lines.push(o.str);taken.add(o)}taken.add(t);
  const text=lines.join(" "),ref=(/см\s*\.?\s*\S.*$/iu.exec(text)||[])[0];
  const kind=(KINDS.find(([,re])=>re.test(t.str))||KINDS.find(([,re])=>re.test(text))||["note"])[0];
  if(!inside(cur,box))continue;
  const c={kind,text:text.slice(0,200),...(ref?{ref:ref.replace(/\s+/gu," ").trim()}:{}),u_mm:along(cur.x),z_mm:zAt(cur.y),pt:{x:Math.round(cur.x),y:Math.round(cur.y)}};
  if(kind==="opening"){const m=/(\d{2,4})\s*[хxX×]\s*(\d{2,4})/u.exec(text),lv=/низа\s*([+\-−]?\d{1,2}[,.]\d{3})/iu.exec(text);if(m){c.w_mm=Number(m[1]);c.h_mm=Number(m[2])}if(lv)c.bottom_mm=Math.round(Number(lv[1].replace(/[−]/u,"-").replace(",","."))*1000)}
  const nd=/(?:узел|узлу|узла|узлы)\s*(\d{1,3})/iu.exec(t.str);if(kind==="node"&&nd)c.node=nd[1];
  out.push(c)}
 return out
}

// The downpipe at a «водосток» leader: the two vertical lines of the pipe nearest the leader's end, followed up and down
// through its pieces (gaps up to 4 pt); a bend at the foot — a slant line from its lower end.
function pipesOf(segments,callouts,scale,along,zAt,ptOf){
 const V=segments.filter(s=>Math.abs(s.a.x-s.b.x)<.3&&len(s)>=2);
 const out=[];
 for(const c of callouts.filter(c=>c.kind==="drain")){const p=c.pt;
  const near=V.filter(s=>Math.abs(s.a.x-p.x)<8&&Math.min(s.a.y,s.b.y)-4<=p.y&&Math.max(s.a.y,s.b.y)+4>=p.y).sort((a,b)=>Math.abs(a.a.x-p.x)-Math.abs(b.a.x-p.x));
  if(!near.length)continue;
  const lineAt=x=>{const ss=V.filter(s=>Math.abs(s.a.x-x)<.4).map(s=>[Math.min(s.a.y,s.b.y),Math.max(s.a.y,s.b.y)]).sort((a,b)=>a[0]-b[0]);
   let lo=p.y,hi=p.y,grew=true;while(grew){grew=false;for(const [a,b] of ss)if(a<=hi+4&&b>=lo-4&&(a<lo||b>hi)){lo=Math.min(lo,a);hi=Math.max(hi,b);grew=true}}return{lo,hi}};
  const x1=near[0].a.x,mate=near.filter(s=>Math.abs(s.a.x-x1)>=1.5&&Math.abs(s.a.x-x1)*scale<=300).sort((a,b)=>Math.abs(a.a.x-p.x)-Math.abs(b.a.x-p.x))[0];
  const L1=lineAt(x1),L2=mate?lineAt(mate.a.x):L1,lo=Math.max(L1.lo,L2.lo),hi=Math.min(L1.hi,L2.hi);if((hi-lo)*scale<500)continue;
  const xs=mate?[x1,mate.a.x]:[x1],xm=xs.reduce((a,b)=>a+b,0)/xs.length;
  const bend=segments.some(s=>Math.abs(s.a.x-s.b.x)>=.8&&Math.abs(s.a.y-s.b.y)>=.8&&xs.some(x=>[s.a,s.b].some(q=>Math.abs(q.x-x)<1&&Math.abs(q.y-hi)<2)));
  out.push({kind:"downpipe",u_mm:along(xm),...(mate?{d_mm:r10(Math.abs(mate.a.x-x1)*scale)}:{}),z0_mm:zAt(hi),z1_mm:zAt(lo),...(bend?{bend:true}:{}),text:c.text})}
 return out
}

// Faces of panels seen beyond the cut (not hatched): a frame of two horizontal lines and parallel uprights between them
// at one pitch — the panels' joints; ИР-71535 АР ч.1 л.13 разрез 2-2 — the annex at Н–Л up to +8,740.
function seenPanels(segments,box,scale,along,zAt,zr=[-Infinity,Infinity]){
 const V=segments.filter(s=>Math.abs(s.a.x-s.b.x)<.3&&len(s)>=15&&s.a.x>box.x0&&s.a.x<box.x1).map(s=>({x:s.a.x,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)}));
 // (uprights of one height in a row: same top and bottom ±1 pt, at least 4, the pitch even ±8 %)
 const groups=new Map();for(const v of V){const k=Math.round(v.y0)+":"+Math.round(v.y1);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v)}
 const out=[];
 for(const g of groups.values()){if(g.length<4)continue;g.sort((a,b)=>a.x-b.x);const xs=[...new Set(g.map(v=>Math.round(v.x*2)/2))];if(xs.length<4)continue;
  const steps=xs.slice(1).map((x,i)=>x-xs[i]),med=[...steps].sort((a,b)=>a-b)[steps.length>>1];
  const even=steps.filter(s=>Math.abs(s-med)<=med*.08).length;if(even<3||even<steps.length*.6||med*scale<300||med*scale>1600)continue;
  const y0=g[0].y0,y1=g[0].y1;
  // (higher than 1,5 m, within the levels of the section: the posts of a railing (1 m) and the drawings beside are not)
  if((y1-y0)*scale<1500||zAt(y1)<zr[0]-500||zAt(y0)>zr[1]+500)continue;
  out.push({kind:"seen_panels",u0_mm:along(xs[0]),u1_mm:along(xs[xs.length-1]),z0_mm:zAt(y1),z1_mm:zAt(y0),pitch_mm:r10(med*scale),joints_u_mm:xs.map(along)})}
 return out
}

function sectionLines({segments=[],texts=[]},{box,scale,along,zAt,zRange}){
 if(!box||!(scale>0))return{};
 const panels=panelBands(segments,box,scale,along,zAt),callouts=calloutsOf(texts,segments,box,along,zAt),pipes=pipesOf(segments,callouts,scale,along,zAt),seen=seenPanels(segments,box,scale,along,zAt,zRange);
 const nodes=callouts.filter(c=>c.kind==="node"&&c.node).map(c=>({node:c.node,...(c.ref?{ref:c.ref}:{}),u_mm:c.u_mm,z_mm:c.z_mm}));
 const openings=callouts.filter(c=>c.kind==="opening").map(c=>({u_mm:c.u_mm,z_mm:c.z_mm,...(c.w_mm?{w_mm:c.w_mm,h_mm:c.h_mm}:{}),...(c.bottom_mm!==undefined?{bottom_mm:c.bottom_mm}:{}),text:c.text}));
 return{panels,seen,pipes,openings,nodes,callouts}
}

module.exports={sectionLines,panelBands,calloutsOf,pipesOf,seenPanels};
