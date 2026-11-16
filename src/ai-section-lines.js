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
  // (a label may stand outside the view, under its row of axes — the openings ОВ 500×500, 700×1000, ВК 200×200 of the
  // facade 01-010 on АР ч.1 л.15 ИР-71535 —: it is the view's when its leader ends inside it, checked below)
  .filter(t=>t.str&&t.ang<5&&t.x1>box.x0-250&&t.x0<box.x1+250&&t.y>box.y0-250&&t.y<box.y1+250);
 const H=segments.filter(s=>Math.abs(s.a.y-s.b.y)<.3&&Math.abs(s.a.x-s.b.x)>=4);
 const inside=(p,b)=>p.x>=b.x0&&p.x<=b.x1&&p.y>=b.y0&&p.y<=b.y1,near=(p,q,d=1.6)=>Math.hypot(p.x-q.x,p.y-q.y)<=d;
 const shelfOf=t=>H.find(s=>{const y=s.a.y,x0=Math.min(s.a.x,s.b.x),x1=Math.max(s.a.x,s.b.x);return y>t.y-.5&&y<t.y+t.h*.7&&Math.min(x1,t.x1)-Math.max(x0,t.x0)>=(t.x1-t.x0)*.5});
 const shelfEnds=[];for(const t of T){if(!/[А-Яа-яЁё]{3,}/u.test(t.str))continue;const sh=shelfOf(t);if(sh)shelfEnds.push({s:sh,p:sh.a},{s:sh,p:sh.b})}
 const out=[],taken=new Set();
 for(const t of T){
  if(taken.has(t)||!/[А-Яа-яЁё]{3,}/u.test(t.str))continue;
  // (the shelf: under the label within its height, under most of it)
  const shelf=shelfOf(t);
  if(!shelf)continue;
  // (every leader from the ends of the shelf: one label for two openings — «Отверстие ОВ 900 х 900(h). отм.низа +17,300»
  // of the facade 010-01 on АР ч.1 л.17 ИР-71535 with two leaders, to the openings at О5–О6 and at О6/1)
  const leaders=[];
  // (a leader at the end of the shelf of another label beside is that label's — the shelves of «Отверстие ВК 200 х 200(h).»
  // and «Отверстие ОВ 700 х 1000(h).» at О5 on л.17 meet end to end: each takes the leader nearest its own end)
  for(const e of [shelf.a,shelf.b])for(const s of segments)if(s!==shelf&&Math.abs(s.a.y-s.b.y)>=.5&&len(s)>=4&&(near(s.a,e)||near(s.b,e))){
   const from=near(s.a,e)?s.a:s.b,d=Math.hypot(from.x-e.x,from.y-e.y);
   if(shelfEnds.some(f=>f.s!==shelf&&Math.hypot(from.x-f.p.x,from.y-f.p.y)<d-.05))continue;
   leaders.push({leader:s,from})}
  if(!leaders.length)continue;
  // (the second line of the label under the shelf — «см. лист КМ 3-44»;
  // it starts under the label and is no label of its own on its own shelf — «Отверстие ОВ 700 х 1000(h).» beside
  // «Отверстие ВК 200 х 200(h).» at О4/2 of the facade 010-01 on АР ч.1 л.17 ИР-71535 is the next callout, not its line)
  const below=T.filter(o=>o!==t&&o.y>shelf.a.y&&o.y<shelf.a.y+o.h*1.8&&o.x0<t.x1-2&&Math.min(o.x1,t.x1+20)-Math.max(o.x0,t.x0-20)>0&&!(KINDS.some(([,re])=>re.test(o.str))&&shelfOf(o))).sort((p,q)=>p.y-q.y);
  const lines=[t.str];for(const o of below.slice(0,2)){lines.push(o.str);taken.add(o)}taken.add(t);
  const text=lines.join(" "),ref=(/см\s*\.?\s*\S.*$/iu.exec(text)||[])[0];
  const kind=(KINDS.find(([,re])=>re.test(t.str))||KINDS.find(([,re])=>re.test(text))||["note"])[0];
  const seen=[];
  for(const {leader,from} of leaders){
  // (the leader to its end: pieces going on in one line)
  let cur=near(leader.a,from)?leader.b:leader.a,dir={x:cur.x-from.x,y:cur.y-from.y};
  for(let k=0;k<6;k++){const L=Math.hypot(dir.x,dir.y)||1;const nx=segments.find(q=>{if(!(near(q.a,cur,.8)||near(q.b,cur,.8)))return false;const o=near(q.a,cur,.8)?q.b:q.a,v={x:o.x-cur.x,y:o.y-cur.y},l=Math.hypot(v.x,v.y);return l>1&&(v.x*dir.x+v.y*dir.y)/(l*L)>.995});
   if(!nx)break;const o=near(nx.a,cur,.8)?nx.b:nx.a;dir={x:o.x-cur.x,y:o.y-cur.y};cur=o}
  if(!inside(cur,box)||seen.some(p=>near(p,cur,3)))continue;seen.push(cur);
  const c={kind,text:text.slice(0,200),...(ref?{ref:ref.replace(/\s+/gu," ").trim()}:{}),u_mm:along(cur.x),z_mm:zAt(cur.y),pt:{x:Math.round(cur.x),y:Math.round(cur.y)}};
  if(kind==="opening"){const m=/(\d{2,4})\s*[хxX×]\s*(\d{2,4})/u.exec(text),lv=/низа\s*([+\-−]?\d{1,2}[,.]\d{3})/iu.exec(text);if(m){c.w_mm=Number(m[1]);c.h_mm=Number(m[2])}if(lv)c.bottom_mm=Math.round(Number(lv[1].replace(/[−]/u,"-").replace(",","."))*1000)}
  const nd=/(?:узел|узлу|узла|узлы)\s*(\d{1,3})/iu.exec(t.str);if(kind==="node"&&nd)c.node=nd[1];
  if(leaders.length>1)c.leaders=leaders.length;
  out.push(c)}}
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
function seenPanels(segments,box,scale,along,zAt,zr=[-Infinity,Infinity],facade=false,ur=[-Infinity,Infinity]){
 const V=segments.filter(s=>Math.abs(s.a.x-s.b.x)<.3&&len(s)>=15&&s.a.x>box.x0&&s.a.x<box.x1).map(s=>({x:s.a.x,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)}));
 // (uprights of one height in a row: same top and bottom ±1 pt, at least 4, the pitch even ±8 %)
 const groups=new Map();for(const v of V){const k=Math.round(v.y0)+":"+Math.round(v.y1);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v)}
 const out=[];
 for(const g of groups.values()){if(g.length<4)continue;g.sort((a,b)=>a.x-b.x);const xs=[...new Set(g.map(v=>Math.round(v.x*2)/2))];if(xs.length<4)continue;
  const steps=xs.slice(1).map((x,i)=>x-xs[i]),med=[...steps].sort((a,b)=>a-b)[steps.length>>1];
  const even=steps.filter(s=>Math.abs(s-med)<=med*.08).length;if(even<3||even<steps.length*.6||med*scale<300||med*scale>1600)continue;
  // (two uprights 20 mm apart are a post of a railing or a porch, not a joint of panels — porch at О9–О10 on the facade л.15)
  if(steps.some(s=>s*scale<100))continue;
  const y0=g[0].y0,y1=g[0].y1;
  // (higher than 1,5 m, within the levels of the section: the posts of a railing (1 m) and the drawings beside are not)
  if((y1-y0)*scale<1500||zAt(y1)<zr[0]-500||zAt(y0)>zr[1]+500)continue;
  out.push({kind:"seen_panels",u0_mm:along(xs[0]),u1_mm:along(xs[xs.length-1]),z0_mm:zAt(y1),z1_mm:zAt(y0),pitch_mm:r10(med*scale),joints_u_mm:xs.map(along)});
  for(const v of g)v.used=true}
 // (joints of one foot or one head and tops of their own: a gable under the slopes of a roof — each joint up to the slope;
 //  a tier broken by windows and gates — АР ч.1 л.16 ИР-71535, фасад А–Н: the wall Ж–Л over +7,100, the annexes А–Б, Л–Н)
 //  (only on a facade: in a section such uprights are frames of windows and walls beside — АР ч.1 л.12 разрез 1-1)
 for(const end of facade?["y1","y0"]:[]){
  const left=V.filter(v=>!v.used&&(v.y1-v.y0)*scale>=1000&&zAt(v.y1)>=zr[0]-500&&zAt(v.y0)<=zr[1]+500),by=new Map();
  for(const v of left){const k=Math.round(v[end]);if(!by.has(k))by.set(k,[]);by.get(k).push(v)}
  for(const g0 of by.values()){
   const g=g0.filter(v=>!v.used).sort((a,b)=>a.x-b.x),xs=[],top=new Map();
   for(const v of g){const x=Math.round(v.x*2)/2;if(!xs.length||x-xs[xs.length-1]>.4){xs.push(x);top.set(x,v)}else if(v.y1-v.y0>top.get(xs[xs.length-1]).y1-top.get(xs[xs.length-1]).y0)top.set(xs[xs.length-1],v)}
   if(xs.length<4)continue;
   // (runs of an even pitch of a panel, 300…1600 mm: another step — a window, a gate, a frame — closes a run)
   let run=[xs[0]],med=0;const flush=()=>{if(run.length>=4){const vs=run.map(x=>top.get(x)),z0=Math.min(...vs.map(v=>zAt(v.y1))),tops=vs.map(v=>zAt(v.y0));
     out.push({kind:"seen_panels",u0_mm:along(run[0]),u1_mm:along(run[run.length-1]),z0_mm:z0,z1_mm:Math.max(...tops),pitch_mm:r10(med*scale),joints_u_mm:run.map(along),
      ...(Math.max(...tops)-Math.min(...tops)>100?{tops_mm:tops}:{}),...(end==="y0"?{by:"top"}:{})});for(const v of vs)v.used=true}run=[]};
   for(let i=1;i<xs.length;i++){const st=xs[i]-xs[i-1];
    if(run.length===1&&st*scale>=300&&st*scale<=1600){med=st;run.push(xs[i])}else if(run.length>1&&Math.abs(st-med)<=med*.08)run.push(xs[i]);else{flush();run=[xs[i]];med=0}}
   flush()}
 }
 // (joints between two slopes — both ends on a straight line each, the foot on a lower roof and the head under a higher
 //  one: the wall of the annex О8–О10 between its roofs +8,1 and +15,4 on АР ч.1 л.17 ИР-71535, фасад 010-01)
 if(facade){
  // (at least 2 m — mullions of windows are shorter; within the own axes — the existing building beside is not ours; at the
  //  pitch of the panels found above ±8 %)
  const pit=out.map(o=>o.pitch_mm).sort((a,b)=>a-b),P=pit.length?pit[pit.length>>1]:0;
  const left=V.filter(v=>!v.used&&(v.y1-v.y0)*scale>=2000&&zAt(v.y1)>=zr[0]-500&&zAt(v.y0)<=zr[1]+500&&along(v.x)>=Math.min(ur[0],ur[1])&&along(v.x)<=Math.max(ur[0],ur[1])).sort((a,b)=>a.x-b.x),xs=[];
  for(const v of left){const x=Math.round(v.x*2)/2;if(!xs.length||x-xs[xs.length-1].x>.4)xs.push({x,v});else if(v.y1-v.y0>xs[xs.length-1].v.y1-xs[xs.length-1].v.y0)xs[xs.length-1]={x,v}}
  // (a chain of one pitch, the uprights of something else between its joints skipped — the bottom joint of the lower wall
  //  and the stile of the ladder П1 between the joints of the annex wall on л.17)
  let run=[],med=0;
  // (each end within 200 mm of the straight line fitted through the run: a joint ends at a gutter or a node mark a bit off)
  const line=(k)=>{const n=run.length,mx=run.reduce((a,r)=>a+r.x,0)/n,my=run.reduce((a,r)=>a+r.v[k],0)/n,sxx=run.reduce((a,r)=>a+(r.x-mx)**2,0)||1,b=run.reduce((a,r)=>a+(r.x-mx)*(r.v[k]-my),0)/sxx;
   return run.every(r=>Math.abs(my+b*(r.x-mx)-r.v[k])*scale<=200)};
  const done=new Set();
  for(let i=0;i<xs.length;i++){if(done.has(xs[i]))continue;
   for(let j=i+1;j<xs.length&&(xs[j].x-xs[i].x)*scale<=1600;j++){if(done.has(xs[j]))continue;med=xs[j].x-xs[i].x;if(med*scale<300||P&&Math.abs(med*scale-P)>P*.08)continue;
    run=[xs[i],xs[j]];
    for(let k=j+1;k<xs.length&&xs[k].x-run[run.length-1].x<=med*1.08;k++){const st=xs[k].x-run[run.length-1].x;if(!done.has(xs[k])&&Math.abs(st-med)<=med*.08){run.push(xs[k]);if(run.length>=4&&!(line("y0")&&line("y1"))){run.pop();break}}}
    // (few others between: a hatch of masonry is dense uprights — the annex 01–01/1 on the facade л.15 is no wall of panels)
    const between=xs.filter(r=>r.x>run[0].x&&r.x<run[run.length-1].x&&!run.includes(r)).length;
    if(run.length>=4&&between<=Math.max(1,run.length*.3)&&line("y0")&&line("y1")){const vs=run.map(r=>r.v),bots=vs.map(v=>zAt(v.y1)),tops=vs.map(v=>zAt(v.y0));
     out.push({kind:"seen_panels",u0_mm:along(run[0].x),u1_mm:along(run[run.length-1].x),z0_mm:Math.min(...bots),z1_mm:Math.max(...tops),pitch_mm:r10(med*scale),joints_u_mm:run.map(r=>along(r.x)),
      tops_mm:tops,bottoms_mm:bots,by:"slopes"});for(const r of run){r.v.used=true;done.add(r)}break}}}
  // (the strip at the edge of a facade from the last joint to the outline of the wall — a part of a panel, no joint of its
  //  own: the wall of the main building at О8 between the annex roof +8,1 and +21,750 by the ladder П1 and the bottom of the
  //  annex at О10 by the downpipe on АР ч.1 л.17 ИР-71535; the ends of the tiers on л.16. The outline: an upright at least
  //  2 m along the band, 0,3 of its height (below), farther than a quarter and not over 2,2 pitches from the end joint, within
  //  the own axes; no joint of another band between. A joint of the next band is an outline too: the strip 280 mm between
  //  the annex and the main wall at О8 on л.17)
  //  (an outline drawn in pieces — the frame of the gate В-3 at И on л.16 from 0 to +2,060 and on to +3,980 — is one upright;
  //  pieces of the dashed lines of
  //  the axes under the ground are not; over 2 m and 0,3 of the band: beside a door or a gate the strip is lower than the band — Д-3 at Е–Ж on л.16; a band over
  //  an opening, under 3 m, takes the outline down to its foot — the pier at Н right of the gate В-2 on л.16)
  const foot=Math.min(...out.map(o=>o.z0_mm)),VO=[];for(const v of [...V].filter(v=>zAt(v.y0)>foot+10).sort((a,b)=>a.x-b.x||a.y0-b.y0)){const o=VO.find(o=>Math.abs(o.x-v.x)<.3&&v.y0<=o.y1+50/scale&&v.y1>=o.y0-50/scale);
   if(o){o.y0=Math.min(o.y0,v.y0);o.y1=Math.max(o.y1,v.y1)}else VO.push({...v})}
  const bands=out.filter(o=>o.joints_u_mm.length>=4),allJ=out.flatMap(o=>o.joints_u_mm),edges=[];
  for(const b of bands){const P=b.pitch_mm,js=b.joints_u_mm,lo=Math.min(...js),hi=Math.max(...js),zb0=b.z0_mm,zb1=b.z1_mm;
   for(const [end,dir] of [[lo,-1],[hi,1]]){let best=null;
    for(const v of VO.concat(V)){const u=along(v.x),d=(u-end)*dir;if(d<Math.max(100,P*.1)||d>P*2.2||u<Math.min(ur[0],ur[1])||u>Math.max(ur[0],ur[1]))continue;
     // (the outline lies within the height of the band: a downpipe from the roof above or a ladder going higher is not it)
     const va=zAt(v.y1),vb=zAt(v.y0),nb=out.some(o=>o!==b&&Math.min(zb1,o.z1_mm)-Math.max(zb0,o.z0_mm)>500&&o.joints_u_mm.some(j=>Math.abs(j-u)<30));const low=zb1-zb0<3000&&va<zb0-300;
     // (an outline going on above the band as a joint of the band over it ends at the band — the pier at Н on л.16)
     const vb2=vb>zb1+300&&out.some(o=>o!==b&&Math.abs(o.z0_mm-zb1)<=300&&o.joints_u_mm.some(j=>Math.abs(j-u)<30))?zb1:vb;
     if(!nb&&((va<zb0-300&&!low)||vb2>zb1+300))continue;
     const z0=low?va:Math.max(zb0,va),z1=Math.min(zb1,vb2);if(z1-z0<2000||z1-z0<(zb1-zb0)*.3)continue;
     if(out.some(o=>o!==b&&Math.min(z1,o.z1_mm)-Math.max(z0,o.z0_mm)>500&&o.joints_u_mm.some(j=>(j-end)*dir>50&&(u-j)*dir>50)))continue;
     const c={u,d,z0,z1};(best=best||[]).push(c)}
    // (the farthest outline over 0,6 of the band, else the farthest at all: the ladder П1 beyond the wall at О8 on л.17 is
    //  lower than the wall; the annex А–Б on л.16 is low by itself)
    if(!best)continue;best.sort((a,b)=>a.d-b.d);const tall=best.filter(c=>c.z1-c.z0>=(zb1-zb0)*.6),far=(tall.length?tall:best).at(-1),js2=[end];best=best.filter(c=>c.d<=far.d);
    // (the uprights of the same kind before the outline are joints of the strip — two panels at the edge of the annex at О10)
    for(const c of best)if(c.d-(js2.length>1?(js2[js2.length-1]-end)*dir:0)>=P*.25||c===far){if(c===far&&js2.length>1&&(c.u-js2[js2.length-1])*dir<P*.25)js2.pop();js2.push(c.u)}
    if(!edges.some(e=>Math.abs(e.u-far.u)<50&&Math.abs(e.end-end)<50)){edges.push({...far,end,P,js:[...new Set(js2)]})}}}
  for(const e of edges)out.push({kind:"seen_panels",u0_mm:e.end,u1_mm:e.u,z0_mm:e.z0,z1_mm:e.z1,pitch_mm:e.P,joints_u_mm:e.js,by:"edge"});
  // (the piers between the windows of a band of windows: a band under it and a band over it, the gap between them up to 3 m;
  //  the outer frames — uprights from the top of the lower band to the foot of the upper one; between two frames with
  //  nothing inside — a pier of wall, with the inner lines of the frame — a window: ОК-4 at +7,100…+8,300 on АР ч.1 л.16)
  //  (and no horizontal line inside beyond 60 mm from its ends — a flashing at the foot of a pier is; the sash of a ribbon of windows with mullions at every panel, О8–О10 on л.15)
  const H=segments.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.abs(q.a.x-q.b.x)>2&&q.a.x>box.x0-5&&q.a.x<box.x1+5).map(q=>{const l=Math.min(along(q.a.x),along(q.b.x))===along(q.a.x);return {y:q.a.y,x0:l?q.a.x:q.b.x,x1:l?q.b.x:q.a.x}}).map(h=>along(h.x0)<=along(h.x1)?h:{y:h.y,x0:h.x1,x1:h.x0});
  for(const L of bands)for(const U of bands){if(U===L)continue;const a=L.z1_mm,b2=U.z0_mm;if(b2-a<300||b2-a>3000)continue;
   const u0=Math.max(Math.min(...L.joints_u_mm),Math.min(...U.joints_u_mm)),u1=Math.min(Math.max(...L.joints_u_mm),Math.max(...U.joints_u_mm));if(u1-u0<1000)continue;
   const F=[];for(const v of VO){const u=along(v.x);if(u<u0-50||u>u1+50||Math.abs(zAt(v.y1)-a)>30||Math.abs(zAt(v.y0)-b2)>30)continue;if(!F.some(f=>Math.abs(f-u)<50))F.push(u)}
   F.sort((x,y)=>x-y);
   for(let i=0;i+1<F.length;i++){const p0=F[i],p1=F[i+1];if(p1-p0<200)continue;
    const inside=V.some(v=>{const u=along(v.x);return u>p0+50&&u<p1-50&&zAt(v.y1)>a-30&&zAt(v.y0)<b2+30})||
     H.some(h=>{const z=zAt(h.y);return z>a+60&&z<b2-60&&along(h.x0)<p1-50&&along(h.x1)>p0+50});
    if(!inside&&!out.some(o=>o.by==="pier"&&Math.abs(o.u0_mm-p0)<50&&Math.abs(o.z0_mm-a)<50)){const mid=[...new Set(VO.filter(v=>{const u=along(v.x);return u>p0+50&&u<p1-50&&zAt(v.y1)<=a+30&&zAt(v.y0)>=b2-30}).map(v=>r10(along(v.x))))].sort((x,y)=>x-y);
     out.push({kind:"seen_panels",u0_mm:p0,u1_mm:p1,z0_mm:a,z1_mm:b2,pitch_mm:L.pitch_mm,joints_u_mm:[p0,...mid,p1],by:"pier"})}}}
  // (one panel without a joint of its own between the ends of two strips of the same height — 0,5…1,2 pitch apart, nothing
  //  else there: under the upper ОК-4 left of the ladder П1 at +15,4…+17,3, right of it from +18,5 to the roof, by the door
  //  Д-3 at Б up to +7,1 — АР ч.1 л.16)
  const strips=out.slice(),gaps=[];
  for(const A of strips)for(const B of strips){if(A===B)continue;const aj=A.joints_u_mm,bj=B.joints_u_mm,g0=Math.max(...aj),g1=Math.min(...bj),P=A.pitch_mm;
   if(g1-g0<P*.5||g1-g0>P*2.2)continue;const z0=Math.max(A.z0_mm,B.z0_mm),z1=Math.min(A.z1_mm,B.z1_mm);if(z1-z0<1000)continue;
   // (two panels — a joint between them of the gap's height: right of П1 under the upper ОК-4 at +15,4…+17,3 on л.16)
   const mid=g1-g0>P*1.2?[...new Set(VO.filter(v=>{const u=along(v.x),va=zAt(v.y1),vb=zAt(v.y0);return u>g0+P*.4&&u<g1-P*.4&&Math.min(z1,vb)-Math.max(z0,va)>=(z1-z0)*.6}).map(v=>r10(along(v.x))))]:[];
   if(g1-g0>P*1.2&&!mid.length)continue;
   if(strips.some(o=>Math.min(z1,o.z1_mm)-Math.max(z0,o.z0_mm)>500&&Math.min(g1,Math.max(...o.joints_u_mm))-Math.max(g0,Math.min(...o.joints_u_mm))>100))continue;
   if(!gaps.some(o=>Math.abs(o.u0_mm-g0)<50&&Math.min(z1,o.z1_mm)-Math.max(z0,o.z0_mm)>500))gaps.push({kind:"seen_panels",u0_mm:g0,u1_mm:g1,z0_mm:z0,z1_mm:z1,pitch_mm:P,joints_u_mm:[g0,...mid.sort((x,y)=>x-y),g1],by:"gap"})}
  out.push(...gaps)}
 return out
}

// The roof outline of a facade (АР ч.1 л.16 ИР-71535, фасад А–Н): its slopes — thick lines 1…60 %, at least 2 m along;
// the ridge where two slopes meet at their high ends; the railing — thin lines along a slope 200…1200 mm over it, its
// posts up to it; the eave — a short level line at the low end of a slope (the gutter under the overhang, +21,750).
function roofOutline(segments,box,scale,along,zAt){
 const inBox=q=>q.x>=box.x0-5&&q.x<=box.x1+5&&q.y>=box.y0-5&&q.y<=box.y1+5;
 const sl=segments.filter(s=>inBox(s.a)&&inBox(s.b)&&(s.w||0)>=1.2).map(s=>{const [p,q]=s.a.y>s.b.y?[s.a,s.b]:[s.b,s.a];return{lo:p,hi:q,dx:Math.abs(q.x-p.x),dy:p.y-q.y}})
  .filter(s=>s.dx*scale>=2000&&s.dy>.3&&s.dy/s.dx>=.01&&s.dy/s.dx<=.6);
 const out=[],slopes=[];
 for(const s of sl){const u0=along(s.lo.x),u1=along(s.hi.x);if(slopes.some(o=>Math.abs(o.u0_mm-u0)<100&&Math.abs(o.u1_mm-u1)<100))continue;
  slopes.push({kind:"roof_slope",u0_mm:u0,z0_mm:zAt(s.lo.y),u1_mm:u1,z1_mm:zAt(s.hi.y),slope_pct:Math.round(s.dy/s.dx*1000)/10,s})}
 for(const o of slopes){const {s,...r}=o;out.push(r)}
 for(let i=0;i<slopes.length;i++)for(let j=i+1;j<slopes.length;j++){const a=slopes[i],b=slopes[j];
  if(Math.sign(a.u1_mm-a.u0_mm)===Math.sign(b.u1_mm-b.u0_mm))continue;
  if(Math.abs(a.u1_mm-b.u1_mm)<=1500&&Math.abs(a.z1_mm-b.z1_mm)<=300)out.push({kind:"ridge",u_mm:r10((a.u1_mm+b.u1_mm)/2),z_mm:Math.max(a.z1_mm,b.z1_mm)})}
 const lineZ=(o,x)=>{const t=(x-o.s.lo.x)/(o.s.hi.x-o.s.lo.x);return o.s.lo.y+(o.s.hi.y-o.s.lo.y)*t};
 for(const o of slopes){const k=(o.s.hi.y-o.s.lo.y)/(o.s.hi.x-o.s.lo.x),xa=Math.min(o.s.lo.x,o.s.hi.x),xb=Math.max(o.s.lo.x,o.s.hi.x);
  const rails=segments.filter(q=>(q.w||0)<1.2&&Math.abs(q.b.x-q.a.x)>=(xb-xa)*.4&&Math.abs((q.b.y-q.a.y)/(q.b.x-q.a.x)-k)<=.01).map(q=>{const xm=(q.a.x+q.b.x)/2,ym=(q.a.y+q.b.y)/2;return{q,h:(lineZ(o,xm)-ym)*scale}}).filter(r=>r.h>=200&&r.h<=1200);
  if(!rails.length)continue;const top=Math.max(...rails.map(r=>r.h));
  const posts=segments.filter(q=>Math.abs(q.a.x-q.b.x)<.3&&q.a.x>=xa-2&&q.a.x<=xb+2&&Math.abs(Math.max(q.a.y,q.b.y)-lineZ(o,q.a.x))*scale<=150&&Math.abs(Math.abs(q.a.y-q.b.y)*scale-top)<=150).length;
  out.push({kind:"railing",u0_mm:o.u0_mm,u1_mm:o.u1_mm,h_mm:r10(top),rails:rails.length,...(posts?{posts}:{})})}
 for(const o of slopes){const lo=o.s.lo;
  const e=segments.find(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.abs(q.a.x-q.b.x)*scale>=200&&Math.abs(q.a.x-q.b.x)*scale<=2000&&Math.abs(q.a.y-lo.y)*scale<=250&&
   [q.a,q.b].some(p=>Math.abs(p.x-lo.x)*scale<=150));
  if(e)out.push({kind:"eave",u0_mm:Math.min(along(e.a.x),along(e.b.x)),u1_mm:Math.max(along(e.a.x),along(e.b.x)),z_mm:zAt(e.a.y)})}
 return out
}

// Seen strips cut to the wall outline (инженер 16.11.2026, АР ч.1 л.16, 17): a strip whose top stands above a roof slope over it
// ends at the slope — the wall stops under the roof (пристройка А–Б at Б: the wall ends at its roof +4,7…+5,3; strips under the
// main slopes; the annex at О10 under its upper roof 14,39→15,37). Not when panel joints go on above the slope up to the strip
// top (a wall behind a lower roof). Past the slope's end the top holds the slope's end level, unless a wall line rises there
// (the high end of a lean-to against a taller wall) — then the top stays. Result: top_mm [[u,z]…] along the strip.
function clipSeenToRoof(seen,roof,segments,along,zAt,scale){
 const S=roof.filter(r=>r.kind==="roof_slope").map(r=>({a:Math.min(r.u0_mm,r.u1_mm),b:Math.max(r.u0_mm,r.u1_mm),z:u=>r.z0_mm+(r.z1_mm-r.z0_mm)*(u-r.u0_mm)/(r.u1_mm-r.u0_mm),hiU:r.u1_mm,loU:r.u0_mm}));
 // the ridge between the high ends of two slopes is roof too: level at the ridge
 for(const g of roof.filter(r=>r.kind==="ridge")){const hs=S.filter(o=>Math.abs(o.hiU-g.u_mm)<=1500);if(hs.length<2)continue;
  const a=Math.min(...hs.map(o=>o.hiU)),b=Math.max(...hs.map(o=>o.hiU));if(b-a>1)S.push({a,b,z:()=>g.z_mm,hiU:b,loU:a,ridge:true})}
 if(!S.length)return;
 const V=segments.filter(q=>Math.abs(q.a.x-q.b.x)<.3&&Math.abs(q.a.y-q.b.y)*scale>=500).map(q=>({u:along(q.a.x),lo:zAt(Math.max(q.a.y,q.b.y)),hi:zAt(Math.min(q.a.y,q.b.y))}));
 const H=segments.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.abs(q.a.x-q.b.x)*scale>=300).map(q=>({z:zAt(q.a.y),u0:Math.min(along(q.a.x),along(q.b.x)),u1:Math.max(along(q.a.x),along(q.b.x))}));
 for(const s of seen){const js=s.joints_u_mm,ua=Math.min(...js),ub=Math.max(...js);let cut=[];
  for(const r of S){if(r.ridge)continue;const a=Math.max(ua,r.a),b=Math.min(ub,r.b);if(b-a<300)continue;
   const za=r.z(a),zb=r.z(b);if(Math.min(za,zb)<s.z0_mm+300)continue;
   if(Math.min(za,zb)>s.z1_mm-100){// the strip top stands under the slope: the joints go on up to the roof — the strip follows it
    if(Math.min(za,zb)-s.z1_mm>1500)continue;
    if(H.some(h=>h.z>s.z1_mm+100&&h.z<Math.min(r.z(Math.max(a,Math.min(b,h.u0))),r.z(Math.max(a,Math.min(b,h.u1))))-100&&Math.min(b,h.u1)-Math.max(a,h.u0)>=(b-a)*.5))continue;
    if(!V.some(v=>v.u>=a-50&&v.u<=b+50&&v.hi>=r.z(v.u)-250&&v.lo<=s.z1_mm+100))continue;
    cut.push({r,a,b,up:true});continue}
   if(V.some(v=>v.u>a+150&&v.u<b-150&&Math.abs(v.hi-s.z1_mm)<=200&&v.lo>r.z(v.u)+150))continue;
   // the slope crosses the strip top: where it stands above, joints up to it mean the strip follows the slope all along
   const up=V.some(v=>v.u>=a-50&&v.u<=b+50&&r.z(v.u)>s.z1_mm+100&&v.hi>=r.z(v.u)-250&&v.lo<=s.z1_mm+100);
   cut.push({r,a,b,...(up?{up:true}:{})})}
  if(!cut.length)continue;
  for(const r of S.filter(o=>o.ridge)){const a=Math.max(ua,r.a),b=Math.min(ub,r.b);if(b-a<1)continue;
   if(cut.filter(c=>Math.abs(c.r.hiU-r.a)<=1||Math.abs(c.r.hiU-r.b)<=1).length)cut.push({r,a,b,ridge:true})}
  const pts=new Set([ua,ub]);for(const c of cut){pts.add(c.a);pts.add(c.b);if(c.up)continue;const {r}=c,k=(r.z(c.b)-r.z(c.a))/(c.b-c.a);
   if(Math.abs(k)>1e-9){const u=c.a+(s.z1_mm-r.z(c.a))/k;if(u>c.a&&u<c.b)pts.add(u)}}
  const us=[...pts].sort((x,y)=>x-y);
  const zOf=u=>{const rg=cut.find(c=>c.ridge&&u>=c.a&&u<=c.b);if(rg)return rg.r.z(u);let z=s.z1_mm;for(const c of cut){const {r}=c;if(c.ridge)continue;
    if(u>=c.a&&u<=c.b){if(c.up)return Math.max(s.z0_mm,r.z(u));z=Math.min(z,r.z(u))}
    else{const end=u<c.a?r.a:r.b;if(Math.abs((u<c.a?c.a:c.b)-end)>1)continue;// the strip goes on past the slope's end
     const zEnd=r.z(end),rises=V.some(v=>Math.abs(v.u-end)<=150&&v.lo<=zEnd+200&&v.hi>=zEnd+1000);
     if(!rises)z=c.up?zEnd:Math.min(z,zEnd)}}
   return Math.max(s.z0_mm,z)};
  // each piece between break points is straight; a wall rising past a slope's end leaves a step there
  const out=[];for(let i=0;i+1<us.length;i++){const p=us[i],q=us[i+1];out.push([r10(p),r10(zOf(p+.5))],[r10(q),r10(zOf(q-.5))])}
  s.top_mm=out.filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);s.z1_mm=Math.max(...s.top_mm.map(p=>p[1]));s.cut_by="roof";
  const at=u=>{let z=null;for(let i=0;i+1<s.top_mm.length;i++){const [p,zp]=s.top_mm[i],[q,zq]=s.top_mm[i+1];if(u<p-1||u>q+1)continue;const v=q-p>1?zp+(zq-zp)*(u-p)/(q-p):Math.max(zp,zq);z=z===null?v:Math.max(z,v)}return r10(z===null?s.z1_mm:z)};
  s.tops_mm=js.map(at)}
}

// A gap between a strip and the strip above it (инженер 16.11.2026, АР ч.1 л.17 у О2–О3 у перелива, +20,42…+21,76): when neither
// strip's edge is drawn along the gap and no level line crosses it, the wall goes on — one strip between them.
function fillStripGapsUp(seen,segments,along,zAt,scale){
 const H=segments.filter(q=>Math.abs(q.a.y-q.b.y)<.3&&Math.abs(q.a.x-q.b.x)*scale>=300).map(q=>({z:zAt(q.a.y),u0:Math.min(along(q.a.x),along(q.b.x)),u1:Math.max(along(q.a.x),along(q.b.x))}));
 const span=s=>[Math.min(...s.joints_u_mm),Math.max(...s.joints_u_mm)],add=[];
 const drawn=(z,a,b,tol)=>{let cov=0;for(const h of H)if(Math.abs(h.z-z)<=tol)cov+=Math.max(0,Math.min(b,h.u1)-Math.max(a,h.u0));return cov>=(b-a)*.5};
 for(const A of seen)for(const B of seen){if(A===B)continue;const g=B.z0_mm-A.z1_mm;if(g<300||g>2500)continue;
  const [a0,a1]=span(A),[b0,b1]=span(B),u0=Math.max(a0,b0),u1=Math.min(a1,b1);if(u1-u0<500)continue;
  if(A.top_mm||B.top_mm)continue;
  if(seen.concat(add).some(o=>{const [o0,o1]=span(o);return o!==A&&o!==B&&o0<u1-100&&o1>u0+100&&o.z0_mm<B.z0_mm-100&&o.z1_mm>A.z1_mm+100}))continue;
  if(drawn(A.z1_mm,u0,u1,60)||drawn(B.z0_mm,u0,u1,60))continue;
  if(H.some(h=>h.z>A.z1_mm+100&&h.z<B.z0_mm-100&&Math.min(u1,h.u1)-Math.max(u0,h.u0)>=(u1-u0)*.5))continue;
  const js=[...new Set([u0,...A.joints_u_mm].filter(u=>u>=u0&&u<=u1).concat([u1]))].sort((x,y)=>x-y);
  add.push({kind:"seen_panels",u0_mm:u0,u1_mm:u1,z0_mm:A.z1_mm,z1_mm:B.z0_mm,pitch_mm:A.pitch_mm||B.pitch_mm,joints_u_mm:js,by:"gap"})}
 seen.push(...add)
}

// Fire stairs on a facade (инженер 16.11.2026, для сверки с КМ3): the callout «пожарная лестница тип П1 см. лист КМ3-13» points at
// the ladder; its rails and cage — thin upright lines within 1,2 m of the point that reach its level — give where it stands,
// its bottom and its top. Thick lines (wall outlines) and downpipes are not the ladder.
function stairsOf(callouts,segments,pipes,seen,along,zAt,scale){
 const V=segments.filter(q=>Math.abs(q.a.x-q.b.x)<.3&&(q.w||0)<1.2&&Math.abs(q.a.y-q.b.y)*scale>=300).map(q=>({u:along(q.a.x),lo:zAt(Math.max(q.a.y,q.b.y)),hi:zAt(Math.min(q.a.y,q.b.y))}));
 // a joint of panels the facade reads is wall, not ladder
 const joint=v=>seen.some(t=>v.lo>=Math.min(t.z0_mm,t.z1_mm)-200&&v.hi<=Math.max(t.z1_mm,...(t.tops_mm||[]))+200&&t.joints_u_mm.some(j=>Math.abs(j-v.u)<=40));
 const out=[];
 for(const c of callouts.filter(c=>c.kind==="stair")){
  const m=/тип\s*П\s*(\d)/i.exec(c.text),ref=(c.ref||"").replace(/\s+/g,"").replace(/^см\.?лист/i,"");
  let R=V.filter(v=>v.hi-v.lo>=1000&&Math.abs(v.u-c.u_mm)<=1200&&v.lo<=c.z_mm+300&&v.hi>=c.z_mm-300&&!pipes.some(p=>Math.abs(p.u_mm-v.u)<=(p.d_mm||150)&&v.lo>=p.z0_mm-300&&v.hi<=p.z1_mm+300)&&!joint(v));
  if(!R.length)continue;
  // the lines running on from those found, end to end and side by side (the rails below the cage)
  const lo0=Math.min(...R.map(v=>v.lo)),u0=Math.min(...R.map(v=>v.u)),u1=Math.max(...R.map(v=>v.u));let lo=lo0,hi=Math.max(...R.map(v=>v.hi)),grew=true;
  while(grew){grew=false;for(const v of V)if(R.some(r=>Math.abs(r.u-v.u)<=10)&&!joint(v)&&v.hi>=lo-100&&v.lo<lo-1&&v.hi<=hi+100){lo=v.lo;grew=true}}
  out.push({kind:"fire_stair",...(m?{type:"П"+m[1]}:{}),...(ref?{ref}:{}),u0_mm:r10(u0),u1_mm:r10(u1),z0_mm:r10(lo),z1_mm:r10(hi),text:c.text})}
 return out
}

function sectionLines({segments=[],texts=[]},{box,scale,along,zAt,zRange,facade=false,uRange}){
 if(!box||!(scale>0))return{};
 const panels=panelBands(segments,box,scale,along,zAt),callouts=calloutsOf(texts,segments,box,along,zAt),pipes=pipesOf(segments,callouts,scale,along,zAt),seen=seenPanels(segments,box,scale,along,zAt,zRange,facade,uRange);
 const nodes=callouts.filter(c=>c.kind==="node"&&c.node).map(c=>({node:c.node,...(c.ref?{ref:c.ref}:{}),u_mm:c.u_mm,z_mm:c.z_mm}));
 const openings=callouts.filter(c=>c.kind==="opening").map(c=>({u_mm:c.u_mm,z_mm:c.z_mm,...(c.w_mm?{w_mm:c.w_mm,h_mm:c.h_mm}:{}),...(c.bottom_mm!==undefined?{bottom_mm:c.bottom_mm}:{}),text:c.text}));
 const roof=facade?roofOutline(segments,box,scale,along,zAt):[];
 if(facade&&roof.length)clipSeenToRoof(seen,roof,segments,along,zAt,scale);
 if(facade)fillStripGapsUp(seen,segments,along,zAt,scale);
 const stairs=facade?stairsOf(callouts,segments,pipes,seen,along,zAt,scale):[];
 return{panels,seen,pipes,openings,nodes,callouts,...(roof.length?{roof}:{}),...(stairs.length?{stairs}:{})}
}

module.exports={sectionLines,panelBands,calloutsOf,pipesOf,seenPanels,roofOutline,stairsOf};
