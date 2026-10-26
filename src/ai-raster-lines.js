"use strict";
/*
 * IR Project AI: the lines of a sheet that is one picture (a CAD sheet saved as an image, ГПЭС М1.9) — without them the
 * reading of a scheme finds no axes, no members, no sizes, only words. The sheet is rendered and its dark pixels are
 * turned back into what a drawing in lines gives: segments in the sheet's top-down points.
 * - Level and upright lines: runs of dark pixels along a row (a column) at least MIN_RUN_PT long, the rows of one line
 *   joined while the run of the next row overlaps it (a line several pixels thick, or a little off level); a run with ink along a
 *   third of it just above or below is the flat of a curve (the top of an axis bubble) or lettering, not a line. Dashes of a dash-dot axis stay dashes: the reading of
 *   axes tells an axis from a solid line by them.
 * - Circles (axis bubbles): a ring of ink left over, its pixels all at one distance from its centre, round every side —
 *   given as a polygon of short chords, as a CAD export draws it.
 * - Slanted lines (braces, leaders): in what is left, the strongest straight line of each blot (a Hough vote), the
 *   longest unbroken stretch of pixels on it, again and again; pieces of one line cut by a level or upright line are
 *   joined back.
 */
const SCALE=2.5,MAX_PIXELS=40e6,DARK=160,MIN_RUN_PT=5,MAX_THICK_PT=2.4,MIN_SLANT_PT=8,RING_PT=[7,44],GLYPH_PT=30,TICK_PT=6;
function darkPixels(data,w,h,level=DARK){
 const dark=new Uint8Array(w*h);
 for(let i=0;i<w*h;i++)dark[i]=data[4*i]+data[4*i+1]+data[4*i+2]<level*3?1:0;
 return dark
}
// Level (horizontal=true) or upright lines: [{c, lo, hi, first, last}] in pixels (c the middle of the rows, lo…hi the run).
function straightRuns(dark,w,h,horizontal,minRun,maxThick,scalePx=2.5){
 const rows=horizontal?h:w,len=horizontal?w:h,at=horizontal?(r,k)=>dark[r*w+k]:(r,k)=>dark[k*w+r];
 const out=[];let open=[];
 const close=s=>{
  if(s.last-s.first+1>maxThick)return;
  // Ink along a third of the run just above or below: the flat of a curve, lettering — not a line.
  let above=0,below=0;
  for(let k=s.lo;k<=s.hi;k++){if(s.first>0&&at(s.first-1,k))above++;if(s.last+1<rows&&at(s.last+1,k))below++}
  const n=s.hi-s.lo+1;if(above>n*0.35||below>n*0.35)return;
  // The flat of a thin ring: two rows off the run, on one side, the ink goes on past both its ends (a corner of
  // a box goes on at the end itself, a line ending on another line goes on to both sides).
  const past=(row,end,dir)=>{if(row<0||row>=rows)return false;for(let d=2;d<=6;d++){const k=end+dir*d;if(k>=0&&k<len&&at(row,k))return true}return false};
  const side=(r1,r2)=>(past(r1,s.lo,-1)||past(r2,s.lo,-1))&&(past(r1,s.hi,1)||past(r2,s.hi,1));
  const near=(row,end)=>{if(row<0||row>=rows)return false;for(let k=end-2;k<=end+2;k++)if(k>=0&&k<len&&at(row,k))return true;return false};
  const across=(r1,r2)=>near(r1,s.lo)||near(r2,s.lo)||near(r1,s.hi)||near(r2,s.hi);
  if(n<=16*scalePx&&(side(s.last+2,s.last+3)&&!across(s.first-2,s.first-3)||side(s.first-2,s.first-3)&&!across(s.last+2,s.last+3)))return;
  out.push({c:(s.first+s.last+1)/2,lo:s.lo,hi:s.hi+1,first:s.first,last:s.last})
 };
 for(let r=0;r<rows;r++){
  const next=[];
  for(let k=0;k<len;){
   if(!at(r,k)){k++;continue}
   let e=k;while(e+1<len&&at(r,e+1))e++;
   if(e-k+1>=minRun){
    // Rows of one line overlap over most of the shorter run (a line a little off level steps from row to row).
    const s=open.find(s=>!s.taken&&Math.min(s.hi0,e)-Math.max(s.lo0,k)+1>=0.5*Math.min(s.hi0-s.lo0+1,e-k+1));
    if(s){s.taken=true;s.last=r;s.lo=Math.min(s.lo,k);s.hi=Math.max(s.hi,e);s.lo0=k;s.hi0=e;next.push(s)}
    else next.push({first:r,last:r,lo:k,hi:e,lo0:k,hi0:e,taken:true})
   }
   k=e+1
  }
  for(const s of open)if(!next.includes(s))close(s);
  for(const s of next)s.taken=false;
  open=next
 }
 for(const s of open)close(s);
 return out
}
// Blots of the ink left over: pixels up to two apart are of one blot (a thin ring drawn in grey, a pixel of it lighter
// than the rest, stays whole). Lists of pixel indices.
function blots(rest,w,h,minSide){
 const seen=new Uint8Array(w*h),out=[],stack=[];
 for(let i=0;i<w*h;i++){
  if(!rest[i]||seen[i])continue;
  const px=[];seen[i]=1;stack.push(i);let x0=w,x1=0,y0=h,y1=0;
  while(stack.length){
   const j=stack.pop(),x=j%w,y=(j-x)/w;px.push(j);
   if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
    const k=yy*w+xx;if(rest[k]&&!seen[k]){seen[k]=1;stack.push(k)}
   }
  }
  if(Math.max(x1-x0,y1-y0)+1>=minSide)out.push({px,x0,x1,y0,y1})
 }
 return out
}
// A ring: square box, every pixel at one distance from the middle, ink on all eight sides.
function ringOf(b,w,scale){
 const bw=b.x1-b.x0+1,bh=b.y1-b.y0+1;
 if(bw<RING_PT[0]*scale||bw>RING_PT[1]*scale||Math.abs(bw-bh)>Math.max(3,0.12*bw))return null;
 const cx=(b.x0+b.x1+1)/2,cy=(b.y0+b.y1+1)/2,ds=[],oct=new Set();
 for(const j of b.px){const x=j%w+0.5,y=(j-j%w)/w+0.5;ds.push(Math.hypot(x-cx,y-cy));oct.add(Math.floor((Math.atan2(y-cy,x-cx)+Math.PI)/(2*Math.PI)*8)%8)}
 const r=ds.reduce((a,d)=>a+d,0)/ds.length;
 if(oct.size<8||ds.some(d=>Math.abs(d-r)>Math.max(2.5,0.14*r)))return null;
 return{x:cx/scale,y:cy/scale,r:r/scale}
}
function ringSegments(g,n=32){
 const p=k=>({x:g.x+g.r*Math.cos(2*Math.PI*k/n),y:g.y+g.r*Math.sin(2*Math.PI*k/n)});
 return Array.from({length:n},(_,k)=>({a:p(k),b:p(k+1)}))
}
// Straight lines of one blot: the strongest line of a Hough vote, the longest stretch of its pixels with no gap over
// two pixels, while one at least minLen long is found.
function blotLines(b,w,minLen){
 let pts=b.px.map(j=>[j%w+0.5,(j-j%w)/w+0.5]);
 const out=[],T=180,cos=[],sin=[];
 for(let t=0;t<T;t++){cos.push(Math.cos(t*Math.PI/T));sin.push(Math.sin(t*Math.PI/T))}
 for(let round=0;round<24&&pts.length>=minLen;round++){
  const R=Math.ceil(Math.hypot(b.x1-b.x0+2,b.y1-b.y0+2))+2,acc=new Uint16Array(T*(2*R+1));
  let best=0,bt=0,br=0;
  for(const [x,y] of pts){const u=x-b.x0,v=y-b.y0;for(let t=0;t<T;t++){const k=t*(2*R+1)+Math.round(u*cos[t]+v*sin[t])+R;const n=++acc[k];if(n>best){best=n;bt=t;br=Math.round(u*cos[t]+v*sin[t])}}}
  if(best<minLen*0.8)break;
  const on=pts.filter(([x,y])=>Math.abs((x-b.x0)*cos[bt]+(y-b.y0)*sin[bt]-br)<=1.5);
  // Along the line: t = position along its direction (−sin, cos).
  const along=on.map(p=>({p,t:-(p[0]-b.x0)*sin[bt]+(p[1]-b.y0)*cos[bt]})).sort((a,c)=>a.t-c.t);
  let s=0,bs=0,be=0;
  for(let i=1;i<=along.length;i++)if(i===along.length||along[i].t-along[i-1].t>2){if(along[i-1].t-along[s].t>along[be].t-along[bs].t){bs=s;be=i-1}s=i}
  const run=along.slice(bs,be+1),length=run.length?run[run.length-1].t-run[0].t:0;
  const drop=new Set((length>=minLen?run:along).map(r=>r.p));
  pts=pts.filter(p=>!drop.has(p));
  if(length<minLen)continue;
  // The line through the stretch by least squares: its ends are the stretch's ends projected on it.
  const mx=run.reduce((a,r)=>a+r.p[0],0)/run.length,my=run.reduce((a,r)=>a+r.p[1],0)/run.length;
  let sxx=0,syy=0,sxy=0;for(const {p} of run){sxx+=(p[0]-mx)**2;syy+=(p[1]-my)**2;sxy+=(p[0]-mx)*(p[1]-my)}
  const ang=0.5*Math.atan2(2*sxy,sxx-syy),dx=Math.cos(ang),dy=Math.sin(ang);
  const ts=run.map(r=>(r.p[0]-mx)*dx+(r.p[1]-my)*dy),t0=Math.min(...ts),t1=Math.max(...ts);
  out.push({a:{x:mx+dx*t0,y:my+dy*t0},b:{x:mx+dx*t1,y:my+dy*t1}})
 }
 return out
}
// Nearly level or upright: put exactly so (the reading of a scheme takes level lines within 0.3 pt).
function square(p){
 if(Math.abs(p.a.y-p.b.y)<=Math.abs(p.a.x-p.b.x)*0.01){const y=(p.a.y+p.b.y)/2;p.a.y=p.b.y=y}
 else if(Math.abs(p.a.x-p.b.x)<=Math.abs(p.a.y-p.b.y)*0.01){const x=(p.a.x+p.b.x)/2;p.a.x=p.b.x=x}
 return p
}
// Pieces of one slanted line cut apart by a level or upright line crossing it are one line again: a gap up to `gap`, or
// up to WIDE_GAP_PT when lines cross it (a brace across a member drawn in two lines and a post beside it, ГПЭС М1.9).
const WIDE_GAP_PT=14;
function joinPieces(list,gap,straight=[]){
 const dir=s=>{const l=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);return{x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l}};
 // A level or upright line crossing the stretch between two points.
 const crossed=(p,q)=>straight.some(s=>{
  if(Math.abs(s.a.y-s.b.y)<0.01){const y=s.a.y;if((p.y-y)*(q.y-y)>0)return false;const x=p.x+(q.x-p.x)*(y-p.y)/((q.y-p.y)||1e-9);return x>=Math.min(s.a.x,s.b.x)-0.5&&x<=Math.max(s.a.x,s.b.x)+0.5}
  const x=s.a.x;if((p.x-x)*(q.x-x)>0)return false;const y=p.y+(q.y-p.y)*(x-p.x)/((q.x-p.x)||1e-9);return y>=Math.min(s.a.y,s.b.y)-0.5&&y<=Math.max(s.a.y,s.b.y)+0.5});
 let joined=true;
 while(joined){
  joined=false;
  for(let i=0;i<list.length&&!joined;i++)for(let j=i+1;j<list.length&&!joined;j++){
   const p=list[i],q=list[j],u=dir(p),v=dir(q);
   if(Math.abs(u.x*v.y-u.y*v.x)>0.02)continue;
   const off=Math.abs((q.a.x-p.a.x)*u.y-(q.a.y-p.a.y)*u.x);if(off>1.2)continue;
   const t=pt=>(pt.x-p.a.x)*u.x+(pt.y-p.a.y)*u.y,ps=[p.a,p.b,q.a,q.b].sort((m,n)=>t(m)-t(n));
   const [pa,pb]=[t(p.a),t(p.b)].sort((m,n)=>m-n),[qa,qb]=[t(q.a),t(q.b)].sort((m,n)=>m-n);
   const g=Math.max(pa,qa)-Math.min(pb,qb);
   if(g>gap&&!(g<=WIDE_GAP_PT&&crossed(ps[1],ps[2])))continue;
   list[i]=square({a:ps[0],b:ps[3]});list.splice(j,1);joined=true
  }
 }
 return list
}
// One straight thin stroke (a short leader, the tick of a size, a stroke of a letter): the blot's pixels all lie within a
// pixel of its middle line. Its ends, or null.
function strokeOf(b,w){
 const n=b.px.length;if(n<3)return null;
 let mx=0,my=0;for(const j of b.px){mx+=j%w;my+=(j-j%w)/w}mx/=n;my/=n;
 let sxx=0,syy=0,sxy=0;for(const j of b.px){const x=j%w-mx,y=(j-j%w)/w-my;sxx+=x*x;syy+=y*y;sxy+=x*y}
 const ang=0.5*Math.atan2(2*sxy,sxx-syy),dx=Math.cos(ang),dy=Math.sin(ang);
 let t0=Infinity,t1=-Infinity,off=0;
 for(const j of b.px){const x=j%w-mx,y=(j-j%w)/w-my,t=x*dx+y*dy;if(t<t0)t0=t;if(t>t1)t1=t;off=Math.max(off,Math.abs(-x*dy+y*dx))}
 return off<=1.6?{a:{x:mx+0.5+dx*t0,y:my+0.5+dy*t0},b:{x:mx+0.5+dx*t1,y:my+0.5+dy*t1},len:t1-t0}:null
}
const boxGap=(a,b)=>Math.max(b.x0-a.x1,a.x0-b.x1,b.y0-a.y1,a.y0-b.y1);
// Lines of a picture given as dark pixels (scale: pixels a point). Returns segments in points, the rings found and the
// blots of lettering (glyphs: box in points and pixels), what is left when lines and rings are taken.
function linesOfPixels(dark,w,h,scale){
 const used=new Uint8Array(w*h),segments=[],minRun=Math.round(MIN_RUN_PT*scale),thick=Math.max(3,Math.round(MAX_THICK_PT*scale));
 for(const horizontal of [true,false])for(const s of straightRuns(dark,w,h,horizontal,minRun,thick,scale)){
  const c=s.c/scale,lo=s.lo/scale,hi=s.hi/scale;
  segments.push(horizontal?{a:{x:lo,y:c},b:{x:hi,y:c}}:{a:{x:c,y:lo},b:{x:c,y:hi}});
  for(let r=s.first;r<=s.last;r++)for(let k=s.lo;k<s.hi;k++){const i=horizontal?r*w+k:k*w+r;if(dark[i])used[i]=1}
 }
 const rest=new Uint8Array(w*h);for(let i=0;i<w*h;i++)rest[i]=dark[i]&&!used[i]?1:0;
 const rings=[],slanted=[],glyphs=[],strokes=[],minSlant=MIN_SLANT_PT*scale,glyph=GLYPH_PT*scale;
 const touches=b=>b.px.some(j=>{const x=j%w;return used[j-1]&&x>0||used[j+1]&&x<w-1||used[j-w]||used[j+w]});
 const pt=p=>({x:p.x/scale,y:p.y/scale});
 for(const b of blots(rest,w,h,1)){
  const side=Math.max(b.x1-b.x0,b.y1-b.y0)+1;
  if(b.px.length<3)continue;
  const g=side>=RING_PT[0]*scale?ringOf(b,w,scale):null;
  if(g){rings.push(g);segments.push(...ringSegments(g));continue}
  if(side<glyph){
   // A short thin stroke on a line is a size's tick; one the length of a line is a line (a leader) unless it stands
   // in a word (the «1» of «1125», below); the rest is lettering.
   const st=strokeOf(b,w),box={x0:b.x0/scale,y0:b.y0/scale,x1:(b.x1+1)/scale,y1:(b.y1+1)/scale,px:b.px};
   if(st&&st.len<=TICK_PT*scale&&touches(b))continue;
   if(st&&st.len>=minSlant){strokes.push({...box,line:square({a:pt(st.a),b:pt(st.b)})});continue}
   glyphs.push(box);continue
  }
  if(b.px.length>60000)continue;
  for(const s of blotLines(b,w,minSlant))slanted.push(square({a:pt(s.a),b:pt(s.b)}))
 }
 // A straight stroke beside a letter of its size is a letter («1», «I»); alone it is a line.
 let left=strokes,moved=true;
 while(moved){
  moved=false;
  left=left.filter(st=>{
   const side=Math.max(st.x1-st.x0,st.y1-st.y0);
   if(!glyphs.some(g=>{const o=Math.max(g.x1-g.x0,g.y1-g.y0);return o>=side*0.4&&o<=side*2.5&&boxGap(g,st)<=Math.min(o,side)*0.4+0.6}))return true;
   glyphs.push(st);moved=true;return false
  })
 }
 for(const st of left)slanted.push(st.line);
 segments.push(...joinPieces(slanted,Math.max(3,MAX_THICK_PT*1.5),segments.filter(q=>Math.abs(q.a.x-q.b.x)<0.01||Math.abs(q.a.y-q.b.y)<0.01)));
 return{segments,rings,glyphs}
}
// A sheet that is a picture: rendered whole (turned by rotation degrees clockwise, as the sheet is read) and its lines
// read. Returns segments in the (turned) sheet's top-down points, the rings, the blots of lettering and the image (for
// readGlyphWords).
async function rasterLines(page,{canvas,rotation=0}){
 const rot=((page.rotate||0)+rotation)%360,v=page.getViewport({scale:1,rotation:rot});
 const scale=Math.min(SCALE,Math.sqrt(MAX_PIXELS/(v.width*v.height)));
 const vp=page.getViewport({scale,rotation:rot}),W=Math.ceil(vp.width),H=Math.ceil(vp.height);
 const img=canvas.createCanvas(W,H),ctx=img.getContext("2d");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
 await page.render({canvasContext:ctx,viewport:vp,canvas:img}).promise;
 const data=ctx.getImageData(0,0,W,H).data,dark=darkPixels(data,W,H);
 return{...linesOfPixels(dark,W,H,scale),image:{data,w:W,h:H,scale}}
}
// Blots of lettering grouped into words: blots up to 0.4 of the smaller one's size apart (letters of a word; the dot of
// «37.1» a point off); a blot inside an axis bubble is the bubble's (read with it).
function wordsOf(glyphs,rings=[]){
 const list=glyphs.filter(g=>!rings.some(r=>Math.hypot((g.x0+g.x1)/2-r.x,(g.y0+g.y1)/2-r.y)<r.r*0.85));
 const side=g=>Math.max(g.x1-g.x0,g.y1-g.y0),parent=list.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
 const cell=12,grid=new Map(),key=(x,y)=>Math.floor(x/cell)+":"+Math.floor(y/cell);
 list.forEach((g,i)=>{for(let x=Math.floor(g.x0/cell);x<=Math.floor(g.x1/cell);x++)for(let y=Math.floor(g.y0/cell);y<=Math.floor(g.y1/cell);y++){const k=x+":"+y;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i)}});
 list.forEach((g,i)=>{
  const reach=side(g)*0.4+0.6;
  for(let x=Math.floor((g.x0-reach)/cell);x<=Math.floor((g.x1+reach)/cell);x++)for(let y=Math.floor((g.y0-reach)/cell);y<=Math.floor((g.y1+reach)/cell);y++)for(const j of grid.get(x+":"+y)||[]){
   if(j<=i)continue;const o=list[j],gap=Math.max(o.x0-g.x1,g.x0-o.x1,o.y0-g.y1,g.y0-o.y1);
   if(gap<=Math.min(side(g),side(o))*0.4+0.6)parent[find(i)]=find(j)
  }
 });
 const groups=new Map();list.forEach((g,i)=>{const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g)});
 return[...groups.values()]
}
// Reading directions to try for a word (degrees anticlockwise, as text items carry them): along the line through its
// letters; a word of one blot — level, then upward.
function directionsOf(word){
 const cs=word.map(g=>({x:(g.x0+g.x1)/2,y:(g.y0+g.y1)/2})),size=Math.max(...word.map(g=>Math.max(g.x1-g.x0,g.y1-g.y0)));
 const span=Math.max(...cs.map(c=>Math.hypot(c.x-cs[0].x,c.y-cs[0].y)));
 if(cs.length<2||span<size*0.6)return[0,90,-90];
 const mx=cs.reduce((a,c)=>a+c.x,0)/cs.length,my=cs.reduce((a,c)=>a+c.y,0)/cs.length;
 let sxx=0,syy=0,sxy=0;for(const c of cs){sxx+=(c.x-mx)**2;syy+=(c.y-my)**2;sxy+=(c.x-mx)*(c.y-my)}
 let deg=-0.5*Math.atan2(2*sxy,sxx-syy)*180/Math.PI;
 if(Math.abs(deg)>=75)return[90,-90];
 if(Math.abs(deg)<=15)deg=0;
 return[Math.round(deg)]
}
// What a word may hold: a mark («В154», «К12», «Ф1.2»), a size, a word of letters.
const STEEP=Math.tan(18*Math.PI/180);
const WORD_MARK=/^[А-ЯЁA-Z][А-ЯЁа-яё]{0,2}\d{1,4}(?:[-.]\d{1,3})?[а-я]?$/u,WORD_NUMBER=/^\d{1,6}(?:[.,]\d{1,3})?$/u,WORD_TEXT=/^[А-ЯЁа-яё]{3,}[.,]?$/u,WORD_LINE=/^[А-ЯЁа-яё]{3,}(?:\s+\S+)+$/u;
const {clean}=require("./ai-ocr");
// Mark letters of the catalog: no mark has an «А» after its first letter (but «АБ» starts with one).
const MARK_LETTERS=new Set(require("./ai-structure-types").TYPES.flatMap(t=>t.marks).map(m=>m.toUpperCase()));
// The left side of a sign (a box of the reading image): the leftmost ink of each row of its middle. A straight stem
// (В, Б, Р) keeps it within a fifth of the sign's width; the bellies of 8 and 6 do not.
function stemOf(data,W,b){
 const w=b.x1-b.x0,h=b.y1-b.y0;if(w<4||h<8)return false;
 const xs=[];
 for(let y=Math.round(b.y0+h*0.12);y<=b.y1-h*0.12;y++){let x=-1;for(let k=Math.round(b.x0);k<=b.x0+w*0.7;k++)if(data[4*(y*W+k)]<140){x=k;break}if(x>=0)xs.push(x)}
 if(xs.length<h*0.5)return false;
 xs.sort((p,q)=>p-q);
 return(xs[Math.floor(xs.length*0.9)]-xs[Math.floor(xs.length*0.1)])/w<=0.19
}
/*
 * Words of a picture sheet read one by one (ГПЭС М1.9: the reading of the whole sheet gave «81» for В1, «827» for В27,
 * nothing for the marks along the braces): each word is cut out of the image with only its own blots (no line through
 * it, no neighbour), turned to its reading direction, its italic slant straightened, at about 40 px a letter, read as
 * one line. Returns text items in sheet points (the start of the baseline, the angle anticlockwise) with the box read.
 */
async function readGlyphWords(picture,{canvas,worker,shear=Math.tan(12*Math.PI/180),onArea=()=>{}}){
 const {image:{data,w,scale},glyphs=[],rings=[]}=picture,out=[];
 const words=wordsOf(glyphs,rings).filter(word=>word.reduce((n,g)=>n+g.px.length,0)>=12).slice(0,3000);
 // One reading of a word: turned by deg, sheared by k.
 const readWay=async(px,deg,k)=>{
  const a=deg*Math.PI/180,dir={x:Math.cos(a),y:-Math.sin(a)},up={x:dir.y,y:-dir.x};
  let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
  for(const j of px){const x=j%w+0.5,y=(j-j%w)/w+0.5,u=dir.x*x+dir.y*y,v=-(up.x*x+up.y*y);if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v}
  const height=v1-v0+1;if(height<3)return null;
  const f=Math.max(1,Math.min(5,40/height)),pad=20,W=Math.ceil(f*(u1-u0+1)+k*f*height+2*pad),H=Math.ceil(f*height+2*pad);
  if(W*H>4e6)return null;
  // Only the word's own pixels (with a pixel round them, for their grey edges), on white.
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const j of px){const x=j%w,y=(j-x)/w;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  const cw=x1-x0+3,ch=y1-y0+3,crop=canvas.createCanvas(cw,ch),cc=crop.getContext("2d"),im=cc.createImageData(cw,ch);im.data.fill(255);
  for(const j of px){const x=j%w,y=(j-x)/w;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,s=4*(yy*w+xx),t=4*((yy-y0+1)*cw+(xx-x0+1));if(xx<0||yy<0||xx>=w||s>=data.length)continue;im.data[t]=data[s];im.data[t+1]=data[s+1];im.data[t+2]=data[s+2]}}
  cc.putImageData(im,0,0);
  const page=canvas.createCanvas(W,H),pc=page.getContext("2d");pc.fillStyle="#fff";pc.fillRect(0,0,W,H);
  pc.setTransform(f*(dir.x-k*up.x),-f*up.x,f*(dir.y-k*up.y),-f*up.y,pad-f*u0-k*f*v0,pad-f*v0);
  pc.drawImage(crop,x0-1,y0-1);
  const r=await worker.recognize(page.toBuffer("image/png"),{},{blocks:true});
  const ws=(r.data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)));
  let str=clean(ws.map(x=>x.text).join(" ").replace(/^[|\\/()[\]{}'"“”‘’«»,;:_~-]+|[|\\/()[\]{}'"“”‘’«»,;:_~-]+$/gu,"").trim()).replace(/^([А-ЯЁ]{1,3})б(\d{0,3})$/u,"$16$2");
  if(!str||!ws.length)return null;
  // «В» of the drafting font read as «8» or «6»: the letter has a straight stem on the left.
  const first=ws[0].symbols?.[0];
  if(/^[86]\d{1,3}[а-я]?$/u.test(str)&&first&&/^[86]$/.test(first.text)&&stemOf(pc.getImageData(0,0,W,H).data,W,first.bbox))str="В"+str.slice(1);
  // The letter after the number of a mark («В29а») read as a nought: it is lower than the digits.
  const signs=ws.flatMap(x=>x.symbols||[]),last=signs[signs.length-1],digits=signs.slice(0,-1).filter(c=>/^\d$/.test(c.text)).map(c=>c.bbox.y1-c.bbox.y0).sort((p,q)=>p-q);
  if(/^[А-ЯЁ]{1,3}\d{1,3}[0оО]$/u.test(str)&&last&&/^[0оО]$/u.test(last.text)&&digits.length&&last.bbox.y1-last.bbox.y0<=digits[digits.length>>1]*0.8)str=str.slice(0,-1)+"а";
  str=openFour(str);
  const conf=Math.min(...ws.map(x=>x.confidence)),valid=WORD_MARK.test(str)||WORD_NUMBER.test(str)||WORD_TEXT.test(str)||WORD_LINE.test(str);
  // Start of the baseline: the word's lowest point across, its first along.
  const sx=dir.x*u0-up.x*v1,sy=dir.y*u0-up.y*v1;
  return{score:(valid?100:0)+conf,item:{str,x:sx/scale,y:sy/scale,width:(u1-u0+1)/scale,size:height/scale/0.75,angle:deg,ocr:true,glyphs:true,confidence:Math.round(conf),valid}}
 };
 await worker.setParameters({tessedit_pageseg_mode:"7"});
 try{
  for(const [n,word] of words.entries()){
   if(n&&n%100===0)onArea();
   const px=word.flatMap(g=>g.px);
   let best=null;
   // A slanted word read poorly is tried turned 2° either way too (ГПЭС М1.9: «В44» along a brace read «В4» at its
   // centre line's 57°, «ВАА» at 59°).
   const dirs=directionsOf(word),slant=dirs.length===1&&dirs[0]%90!==0;
   for(const deg of slant?[dirs[0],dirs[0]-2,dirs[0]+2]:dirs){
    if(deg!==dirs[0]&&best?.item.valid&&best.item.confidence>=30)break;
    // Upward lettering is the rule; downward only when upward reads nothing that a sheet holds.
    if(deg===-90&&best?.item.valid)break;
    // A steeper slant (the lettering of titles leans more) when the usual one reads poorly.
    for(const k of [shear,STEEP]){
     const got=await readWay(px,deg,k);
     if(got&&(!best||got.score>best.score))best=got;
     if(best?.item.valid&&best.item.confidence>=70)break
    }
    if(best?.item.valid&&best.item.confidence>=80)break
   }
   if(best){if(/[А-ЯЁа-яё]{3}/u.test(best.item.str)&&!WORD_MARK.test(best.item.str))best.item.str=fixTitleWords(best.item.str);
    // The word lies along its centre line whichever turn read it (its member is parallel to that).
    out.push(slant?{...best.item,angle:dirs[0]}:best.item)}
  }
 }finally{await worker.setParameters({tessedit_pageseg_mode:"11"})}
 return joinLine(dropBlots(out))
}
// The open «4» of the drafting font read as «А» or «+» (ГПЭС М1.9: «В43» as «ВА3», «В4» as «ВА», «В45» on a brace as
// «В+5»).
function openFour(str){
 return str.replace(/^([А-ЯЁ])([АA+][АA+\d]{0,3}|\+?)([а-я]?)$/u,(all,l,num,tail)=>!num||MARK_LETTERS.has(l+"А")&&/^[АA]/u.test(num)?all:l+num.replace(/[АA+]/gu,"4")+tail)
  .replace(/^([А-ЯЁ]{2})\+(\d{0,3}[а-я]?)$/u,"$14$2")
}
// The marks of a sheet are written in one size: a "mark" read poorly from a blot three times their size (ГПЭС М1.9:
// «Р0» from two sizes with their shelves, 41 pt against 14) is no mark.
function dropBlots(items){
 const sizes=items.filter(t=>t.valid&&WORD_MARK.test(t.str)).map(t=>t.size).sort((a,b)=>a-b);if(sizes.length<5)return items;
 const mid=sizes[sizes.length>>1];
 return items.map(t=>t.valid&&WORD_MARK.test(t.str)&&t.confidence<50&&t.size>mid*2?{...t,valid:false}:t)
}
// Words of the titles of drawings: a word read a letter or two off («уробне», «илРМеНтов», «хема» — the italic С read as a
// bracket) is put right when it stands that close to one of them and to no other; a word read in two («ра: положения»)
// is tried joined.
const TITLE_WORDS=["Схема","расположения","элементов","покрытия","перекрытия","прогонов","балок","колонн","связей","ферм","фахверка",
 "площадок","лестниц","ригелей","стоек","кровли","стен","стенового","торцевого","продольного","вертикальных","горизонтальных","монтажная",
 "уровне","верха","низа","отметке","осях","оси","ряду","плана","план","разрез","узел","сечение","фундаментов","опорных","конструкций",
 "металлических","металлоконструкций","настила","подкрановых","путей","площадки","лестницы","ограждения","элементы","прогоны","связи","балки","колонны"];
// Letters of the italic drafting font read one for another cost half («берхо» is «верха»).
const LOOKALIKE=new Set(["бв","вб","оа","ао"]);
function editDistance(a,b){
 let row=Array.from({length:b.length+1},(_,j)=>j);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next.push(Math.min(row[j]+1,next[j-1]+1,row[j-1]+(a[i-1]===b[j-1]?0:LOOKALIKE.has(a[i-1]+b[j-1])?0.5:1)));row=next}
 return row[b.length]
}
function titleWord(core){
 const lc=core.toLowerCase().replace(/[^а-яё]/gu,"");if(lc.length<4)return null;
 const most=lc.length>=8?2:1,near=TITLE_WORDS.map(s=>({s,d:editDistance(lc,s.toLowerCase())})).filter(x=>x.d<=most).sort((a,b)=>a.d-b.d);
 if(!near.length||near.length>1&&near[1].d===near[0].d)return null;
 return near[0].d?near[0]:{s:near[0].s,d:0}
}
function fixTitleWords(str){
 const parts=str.split(/\s+/u),out=[];
 for(let i=0;i<parts.length;i++){
  const one=titleWord(parts[i]),two=i+1<parts.length&&/[А-ЯЁа-яё]/u.test(parts[i])&&/[А-ЯЁа-яё]/u.test(parts[i+1])?titleWord(parts[i]+parts[i+1]):null;
  if(two&&(!one||two.d<one.d)){out.push(two.s);i++;continue}
  out.push(one?(one.d?one.s:parts[i]):parts[i])
 }
 return out.join(" ")
}
// Words of one line of lettering (a title, a note) are one text, as a sheet in text gives them: same direction, the
// next starting within a letter's height of the last, on its baseline. Sizes and marks stay apart.
function joinLine(items){
 const lone=t=>WORD_NUMBER.test(t.str)||WORD_MARK.test(t.str);
 const along=t=>{const a=t.angle*Math.PI/180;return t.x*Math.cos(a)-t.y*Math.sin(a)};
 const order=[...items].sort((a,b)=>a.angle-b.angle||along(a)-along(b));
 const used=new Set(),out=[];
 for(const a of order){
  if(used.has(a))continue;
  let cur={...a};used.add(a);
  for(;;){
   const ad=cur.angle*Math.PI/180,dir={x:Math.cos(ad),y:-Math.sin(ad)},h=cur.size*0.75;
   const end={x:cur.x+dir.x*cur.width,y:cur.y+dir.y*cur.width};
   const next=order.find(b=>{if(used.has(b)||b.angle!==cur.angle||lone(b)&&lone(cur))return false;
    const dx=b.x-end.x,dy=b.y-end.y,along=dx*dir.x+dy*dir.y,across=Math.abs(-dx*dir.y+dy*dir.x);
    return along>=-h*0.3&&along<=h*1.2&&across<=h*0.35&&Math.abs(b.size-cur.size)<=Math.max(b.size,cur.size)*0.5});
   if(!next)break;
   used.add(next);
   const nd=next.x-cur.x,ne=next.y-cur.y;
   cur={...cur,str:cur.str+" "+next.str,width:nd*dir.x+ne*dir.y+next.width,confidence:Math.min(cur.confidence,next.confidence),words:(cur.words||1)+1,good:(cur.good??(a.valid?1:0))+(next.valid?1:0)}
  }
  // A line holds when its first word and at least half of its words read as words (ГПЭС М1.9: the title, its axes read
  // poorly at its end); its words are put right once more together («ОГ ЯХ» is «осях»).
  if(cur.words){const {words,good,...line}=cur;cur={...line,valid:Boolean(a.valid)&&good*2>=words,str:/[А-ЯЁа-яё]{3}/u.test(line.str)?fixTitleWords(line.str):line.str}}
  out.push(cur)
 }
 return out
}
module.exports={openFour,dropBlots,rasterLines,linesOfPixels,darkPixels,straightRuns,wordsOf,directionsOf,readGlyphWords,joinLine,stemOf,fixTitleWords};
