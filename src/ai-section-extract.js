"use strict";
/*
 * IR Project: levels of shipping marks read from the drawing itself, without AI.
 * - sections ("1-1", "Разрез 2-2"): level marks (+4,500, 0,000) give the vertical scale of the
 *   view; a horizontal member's level is the line under its label, a post spans the vertical
 *   line next to its label. Results snap to the written levels when they are close;
 * - notes inside a scheme: "низ на отм. +0,050", "верх +4,100", "отм. верха +4,506".
 */
const {textBox,textFrame,memberLine,buildLineIndex,buildIndex,leaderTarget,notMark,aMarksOn}=require("./ai-scheme-extract");
const {levelMm}=require("./ai-sheet-extract");
const MARK=/^([А-ЯЁA-Z]{1,3}|[А-ЯЁ][а-яё]{1,2})(\d{1,4})(?:[-.]\d{1,3})?[а-я]?$/u;
const NOT_MARK=/^(?:М\d|Л\d|ПК|[СC]\d{3}|КМД?\d|КЖ\d|АР\d|Ст\d)/u;
const skipMark=(mark,aMarks)=>NOT_MARK.test(mark)||notMark(mark,aMarks)&&/^А\d/u.test(mark);
// "1-1", "Разрез 2-2", "4 - 4 (М1.15)": the sheet reference in brackets is allowed.
const SECTION=/^(?:Разрез\s+)?(\d{1,2}(?:\.\d)?|[А-ЯЁA-Zа-яёa-z])\s*[-–—]\s*(\d{1,2}(?:\.\d)?|[А-ЯЁA-Zа-яёa-z])(?:\s*\([^)]{1,20}\))?$/u;
// A level mark may carry a note: "+4,875 ось", "-0,400 низ оп.пл.", "+9,595 низ прогона".
const LEVEL_MARK=/^([+\-−±]?\d{1,2}[,.]\d{3})(?:\s*[а-яё][а-яё.\s]{0,30})?$/iu;
const levelOf=str=>{const m=LEVEL_MARK.exec(String(str).trim());return m?levelMm(m[1].replace("−","-").replace("±","")):null};
const LEVEL_IN=/([+\-−]?\d{1,2}[,.]\d{3})/u;
const SNAP=150,ROUND=10;

// Least squares mm = a + b·y over the level marks of one view.
function lsq(points){
 const n=points.length,my=points.reduce((s,p)=>s+p.y,0)/n,mv=points.reduce((s,p)=>s+p.mm,0)/n;
 let sxy=0,sxx=0;for(const p of points){sxy+=(p.y-my)*(p.mm-mv);sxx+=(p.y-my)**2}
 if(!sxx)return null;
 const b=sxy/sxx,a=mv-b*my;
 return{a,b,residual:Math.max(...points.map(p=>Math.abs(a+b*p.y-p.mm)))}
}
// Some level marks are notes on a leader, not at their height: keep the largest consistent set.
// With only two marks agreeing either way, the vertical scale of the other views decides.
function candidates(points){
 const out=[];
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  const p=points[i],q=points[j];if(p.mm===q.mm||Math.abs(p.y-q.y)<5)continue;
  const b=(q.mm-p.mm)/(q.y-p.y),a=p.mm-b*p.y;if(b>=0)continue;
  const inliers=points.filter(r=>Math.abs(a+b*r.y-r.mm)<=120);
  if(new Set(inliers.map(r=>r.mm)).size>=2)out.push({b,inliers})
 }
 return out
}
function fit(points,scale){
 const list=candidates(points);if(!list.length)return null;
 const most=Math.max(...list.map(c=>c.inliers.length));
 const top=list.filter(c=>c.inliers.length===most);
 // Without another view to compare with, the lowest and highest marks are the ones drawn at their height.
 const lo=Math.min(...points.map(p=>p.mm)),hi=Math.max(...points.map(p=>p.mm));
 const extremes=top.filter(c=>c.inliers.some(p=>p.mm===lo)&&c.inliers.some(p=>p.mm===hi));
 // Many pairs of one consistent set give slopes a little apart (-27.9 … -28.7): still one answer (ГПЭС М1.19, ряд Л).
 const same=top.every(c=>c.inliers.length===top[0].inliers.length&&c.inliers.every(p=>top[0].inliers.includes(p)));
 const pick=scale?top.sort((x,y)=>Math.abs(x.b-scale)-Math.abs(y.b-scale))[0]:top.length===1||same||new Set(top.map(c=>Math.round(c.b))).size===1?top[0]:extremes.length===1?extremes[0]:null;
 return pick?lsq(pick.inliers):null
}
// The level mark's arrow lies a fixed distance under its text; the most common long line there tells it.
function levelOffset(levels,horiz){
 const votes=new Map();
 for(const l of levels){
  const seen=new Set();
  for(const h of horiz){const d=Math.round((h.y-l.y)*2)/2;if(d<8||d>25||h.x1<l.x-5||h.x0>l.x+l.w+5)continue;seen.add(d)}
  for(const d of seen)votes.set(d,(votes.get(d)||0)+1)
 }
 let best=0,count=0;for(const [d,n] of votes)if(n>count){best=d;count=n}
 return count>=2?best:0
}

// The mark's own arrow (ГОСТ 21.101): a stem from the shelf beside the text to a point between two short slants. That
// point is the height, whichever way the mark looks: «+3,800» written under its shelf points up to its member (ГПЭС
// М1.19, ряд Л), and the offset common to the sheet would put it 30 cm too low. Marks without such an arrow keep the
// common offset.
function placeLevels(levels,horiz,segments=[]){
 const offset=levelOffset(levels,horiz);
 const slants=segments.filter(s=>{const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y),n=Math.hypot(dx,dy);return n>=2.5&&n<=15&&dx>=n*.4&&dy>=n*.4});
 const stems=segments.filter(s=>Math.abs(s.a.x-s.b.x)<=.3&&Math.abs(s.a.y-s.b.y)>=4);
 const near=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y)<=.8;
 for(const l of levels){
  // The shelf may run on past the text: its stem a size and a half beyond it (ГПЭС М1.25: «+4,500»).
  const size=l.s||12,reach=Math.max(15,size*1.5);let best=null;
  for(const s of stems){
   if(s.a.x<l.x-reach||s.a.x>l.x+l.w+reach)continue;
   for(const [e,tip] of [[s.a,s.b],[s.b,s.a]]){
    if(e.y<l.y-size-4||e.y>l.y+6||Math.abs(tip.y-l.y)>45)continue;
    const arms=slants.map(q=>near(q.a,tip)?q.b:near(q.b,tip)?q.a:null).filter(o=>o&&(o.y-tip.y)*(e.y-tip.y)>0);
    if(!arms.some(o=>o.x<tip.x-1)||!arms.some(o=>o.x>tip.x+1))continue;
    const d=Math.min(Math.abs(s.a.x-l.x),Math.abs(s.a.x-l.x-l.w));
    if(!best||d<best.d)best={d,y:tip.y}
   }
  }
  if(best){l.y=best.y;l.tip=true}else l.y+=offset
 }
 return levels
}

function sectionsOf(texts){
 return texts.filter(t=>Math.abs(t.angle||0)<10).map(t=>({t,m:SECTION.exec(String(t.str).trim())}))
  .filter(x=>x.m&&x.m[1].toLowerCase()===x.m[2].toLowerCase()).map(x=>({name:x.m[1]+"-"+x.m[2],x:x.t.x+x.t.width/2,y:x.t.y}))
}
// The view a text belongs to: the closest title above it, the nearer one on a shared row.
function ownerOf(titles,x,y){
 let best=null;
 for(const s of titles){
  if(s.y>=y||Math.abs(s.x-x)>900)continue;
  if(!best||s.y>best.y+30||Math.abs(s.y-best.y)<=30&&Math.abs(s.x-x)<Math.abs(best.x-x))best=s
 }
 return best
}

// Without readable titles (drawn as lines) a section is the area above its row of axis bubbles.
const LOOK_AXIS={A:"А",B:"В",C:"С",E:"Е",H:"Н",K:"К",M:"М",O:"О",P:"Р",T:"Т",X:"Х"};
// «08», «O8» and «О8» are one axis (the plans read them so too).
const cyrAxis=str=>String(str).trim().replace(/\s+/g,"").replace(/[ABCEHKMOPTX]/g,c=>LOOK_AXIS[c]).replace(/^[О0](?=\d)/u,"О");
function bubbleRows(texts,segments){
 // Only labels drawn in a circle are axis bubbles; dimension numbers nearby are not.
 const short=segments.filter(s=>Math.hypot(s.a.x-s.b.x,s.a.y-s.b.y)<=9);
 // The ring round the label: its centre and radius (from its strokes' ends), or null. A bubble's ring holds its label
 // (its radius 0.6–1.0 of the label's size on КМД and АР sheets); a smaller one, 0.40–0.46, is a letter «О» of the title
 // block written nearby (ГПЭС М1.27).
 const ringed=t=>{
  const c={x:t.x+(t.width||0)/2,y:t.y-(t.size||8)*.36},ends=[];
  for(const s of short){
   const d1=Math.hypot(s.a.x-c.x,s.a.y-c.y),d2=Math.hypot(s.b.x-c.x,s.b.y-c.y);
   if(d1>4&&d1<22&&d2>4&&d2<22&&Math.abs(d1-d2)<2.5)ends.push(s.a,s.b)
  }
  if(ends.length<16)return null;
  const x=ends.reduce((v,p)=>v+p.x,0)/ends.length,y=ends.reduce((v,p)=>v+p.y,0)/ends.length,r=ends.reduce((v,p)=>v+Math.hypot(p.x-x,p.y-y),0)/ends.length;
  return r>=(t.size||8)*.48?{x,y,r}:null
 };
 const rows=[];
 for(let t of texts){
  const ring=Math.abs(t.angle||0)<10&&/^(?:[А-ЯЁ]?\s*\d{1,2}(?:\s*\/\s*\d{1,2})?|[А-ЯЁ])$/u.test(cyrAxis(t.str))?ringed(t):null;if(!ring)continue;
  // Latin lookalikes in CAD exports («O3» for «О3») name the same axis as on the plans.
  t={...t,str:cyrAxis(t.str)};
  t={...t,ring};
  const row=rows.find(r=>Math.abs(r.y-t.y)<=4);
  // One ring, one label: digits stacked in one place (a date of the title block, ГПЭС М1.5) are no row of axes.
  if(row?.items.some(u=>Math.hypot(u.ring.x-ring.x,u.ring.y-ring.y)<Math.min(u.ring.r,ring.r)))continue;
  if(row){row.items.push(t);row.x0=Math.min(row.x0,t.x);row.x1=Math.max(row.x1,t.x)}else rows.push({y:t.y,x0:t.x,x1:t.x,items:[t]})
 }
 // A bubble drawn a little off the line of its row, in the row's order where it stands, is the row's (ГПЭС М1.19:
 // «6» 5 pt under «1»…«5»; М1.5: «5», «3» between «6», «4», «2», «1»): while their circles overlap mostly.
 for(const r of rows){
  if(r.items.length<3||new Set(r.items.map(t=>t.str)).size<r.items.length)continue;
  for(const o of rows){
   if(o===r||o.items.length>=3)continue;
   for(const t of [...o.items]){
    if(Math.abs(t.y-r.y)>Math.max(4,t.ring.r*.5)||r.items.some(u=>u.str===t.str))continue;
    // In its place by x the order goes on through it, a step of one or two (letters skip З, Й, О…).
    const list=[...r.items,t].sort((a,b)=>a.x-b.x),rk=a=>axisRank(a.str),k=list.indexOf(t),way=Math.sign(rk(list.at(-1))-rk(list[0]));
    const fits=(a,b)=>{const d=(rk(b)-rk(a))*way;return d>=1&&d<=2};
    if(!way||k>0&&!fits(list[k-1],t)||k<list.length-1&&!fits(t,list[k+1]))continue;
    r.items.push(t);r.x0=Math.min(r.x0,t.x);r.x1=Math.max(r.x1,t.x);o.items.splice(o.items.indexOf(t),1)
   }
  }
 }
 return rows.filter(r=>r.items.length>=3).map((r,i)=>({name:"по осям "+r.items.sort((a,b)=>a.x-b.x).map(t=>t.str).slice(0,1)+"–"+r.items.at(-1).str+" №"+(i+1),
  x:(r.x0+r.x1)/2,y:r.y,x0:r.x0,x1:r.x1,items:r.items,below:true}))
}
function ownerBelow(rows,x,y){
 let best=null;
 for(const r of rows)if(r.y>y&&r.y-y<1300&&x>=r.x0-260&&x<=r.x1+260&&(!best||r.y<best.y))best=r;
 return best
}
function extractSections({segments=[],texts=[]}={}){
 const aMarks=aMarksOn(texts);
 const titles=sectionsOf(texts),rows=bubbleRows(texts,segments);
 if(!titles.length&&!rows.length)return[];
 // A row of bubbles belongs to the title just above it; rows without a readable title are views of their own.
 for(const r of rows){
  const above=titles.filter(t=>t.y<r.y&&r.y-t.y<900&&t.x>=r.x0&&t.x<=r.x1&&!rows.some(o=>o!==r&&o.y>t.y&&o.y<r.y&&o.x0<=t.x+200&&o.x1>=t.x-200));
  r.view=above.sort((a,b)=>b.y-a.y)[0]||r
 }
 const keys=[...titles,...rows.filter(r=>r.view===r)];
 const views=new Map(keys.map(s=>[s,{levels:[],marks:[]}]));
 for(const t of texts){
  const str=String(t.str).trim(),box=textBox(t);
  const row=ownerBelow(rows,box.cx,box.cy),owner=row?row.view:ownerOf(titles,box.cx,box.cy);if(!owner)continue;
  const mm=Math.abs(t.angle||0)<10?levelOf(str):null;
  if(mm!==null)views.get(owner).levels.push({mm,y:t.y,x:t.x,w:t.width||0,s:t.size});
  else if(MARK.test(str)&&!skipMark(str,aMarks))views.get(owner).marks.push({mark:str,t,box})
 }
 const horiz=[],vert=[],all=[],slope=[];
 for(const s of segments){
  const dx=Math.abs(s.a.x-s.b.x),dy=Math.abs(s.a.y-s.b.y);
  if(dy>0.3&&dx>=15&&dy/dx<0.3){const [p,q]=s.a.x<s.b.x?[s.a,s.b]:[s.b,s.a];slope.push({p,q})}
  if(dy<=0.3&&dx>=3)all.push({y:s.a.y,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  if(dy<=0.3&&dx>=20)horiz.push({y:s.a.y,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)});
  else if(dx<=0.3&&dy>=8)vert.push({x:s.a.x,y0:Math.min(s.a.y,s.b.y),y1:Math.max(s.a.y,s.b.y)})
 }
 // Dimension lines: a horizontal line with a size written just over it. Their extension lines run down from them to
 // the members (the chain «2250 2250 …» over the purlins of a roof): such a line beside a label is not a post.
 const sizes=texts.filter(t=>Math.abs(t.angle||0)<10&&/^\d{2,6}$/.test(String(t.str).trim())).map(textBox);
 const dimLines=horiz.filter(h=>sizes.some(z=>z.cx>=h.x0-2&&z.cx<=h.x1+2&&h.y-z.y1>=-0.5&&h.y-z.y1<=5));
 const extension=v=>dimLines.some(h=>v.y0>=h.y-8&&v.y0<=h.y+2&&v.x>=h.x0-6&&v.x<=h.x1+6);
 placeLevels([...views.values()].flatMap(v=>v.levels),all,segments);const out=[];
 // Vertical scale of the sheet from views whose level marks agree unambiguously.
 const sure=[...views.values()].map(v=>fit(v.levels)).filter(f=>f).map(f=>f.b).sort((x,y)=>x-y);
 const scale=sure.length?sure[sure.length>>1]:null;
 for(const [title,view] of views){
  const values=[...new Set(view.levels.map(l=>l.mm))];
  if(values.length<2)continue;
  const f=fit(view.levels,scale);
  if(!f)continue;
  const ys=view.levels.map(l=>l.y),top=Math.min(...ys)-100,bottom=Math.max(...ys)+60;
  const left=Math.min(...view.levels.map(l=>l.x))-60;
  const lo=Math.min(...values)-1000,hi=Math.max(...values)+1500;
  const toMm=y=>{const v=f.a+f.b*y,near=values.reduce((p,c)=>Math.abs(c-v)<Math.abs(p-v)?c:p);
   return Math.abs(near-v)<=SNAP?near:Math.round(v/ROUND)*ROUND};
  for(const m of view.marks){
   const b=m.box;if(b.cy<top||b.cy>bottom||b.cx<left)continue;
   // Horizontal member: the nearest long line just under the label, or just over it.
   let beam=null;
   for(const h of horiz){
    if(h.x1<b.x0-10||h.x0>b.x1+10)continue;
    const below=h.y-b.y1,above=b.y0-h.y;
    const d=below>=-1&&below<=14?Math.max(below,0):above>=-1&&above<=8?Math.max(above,0)+0.5:null;
    if(d!==null&&(!beam||d<beam.d))beam={d,y:h.y,h}
   }
   // The line under the label is the shelf of its leader (as long as the label): the member is where the leader
   // from the shelf's end goes up to.
   if(beam&&beam.h.x1-beam.h.x0<=b.x1-b.x0+16&&beam.h.x0>=b.x0-6){
    const ends=[{x:beam.h.x0,y:beam.h.y},{x:beam.h.x1,y:beam.h.y}];
    let up=null,down=null;
    for(const sg of segments)for(const [p,q] of [[sg.a,sg.b],[sg.b,sg.a]]){
     if(!ends.some(e=>Math.hypot(e.x-p.x,e.y-p.y)<=3))continue;
     // A label over its member (the purlins of a roof section, «К46» on a shelf above the rafter): the leader goes down
     // from the shelf to the member's symbol, whose top is the member's level.
     if(q.y>p.y+5&&Math.abs(q.x-p.x)<=(q.y-p.y)*1.5&&!extension({x:q.x,y0:p.y})&&(!down||q.y<down.y))down=q;
     if(q.y>p.y-5)continue;
     // A leader may break once at the shelf end: follow one more piece going on up.
     let far=q;
     for(const sg2 of segments)for(const [p2,q2] of [[sg2.a,sg2.b],[sg2.b,sg2.a]])if(sg2!==sg&&Math.hypot(p2.x-far.x,p2.y-far.y)<=1&&q2.y<far.y-3&&Math.abs(q2.y-p2.y)>Math.abs(q2.x-p2.x)*0.3)far=q2;
     if(!up||far.y<up.y)up=far
    }
    if(up){const on=horiz.find(h=>Math.abs(h.y-up.y)<=4&&h.x0<=up.x+3&&h.x1>=up.x-3);beam={d:0,y:on?on.y:up.y}}
    else if(down)beam={d:0,y:down.y}
   }
   // A pitched member (a beam broken at the ridge): sloped lines just over or under the label, nearer than a level one.
   const yAt=(l,x)=>l.p.y+(l.q.y-l.p.y)*(x-l.p.x)/(l.q.x-l.p.x);
   let pitched=null;
   for(const l of slope){
    if(l.q.x<b.x0||l.p.x>b.x1)continue;
    const x=Math.max(l.p.x,Math.min(l.q.x,b.cx)),y=yAt(l,x),below=y-b.y1,above=b.y0-y;
    const d=below>=-1&&below<=14?Math.max(below,0):above>=-1&&above<=8?Math.max(above,0)+0.5:null;
    if(d!==null&&(!pitched||d<pitched.d))pitched={d,l}
   }
   if(pitched&&(!beam||pitched.d<beam.d)){
    // Follow the line both ways through joints (gaps at columns); the ridge is where the slope changes sign.
    const chain=[pitched.l],sign=l=>Math.sign(l.q.y-l.p.y);
    for(let grown=true;grown;){grown=false;
     const first=chain[0],last=chain[chain.length-1];
     const left=slope.find(l=>!chain.includes(l)&&Math.abs(l.q.x-first.p.x)<=6&&Math.abs(l.q.y-first.p.y)<=1.2&&l.q.x<=first.p.x+0.5);
     if(left){chain.unshift(left);grown=true}
     const right=slope.find(l=>!chain.includes(l)&&Math.abs(l.p.x-last.q.x)<=6&&Math.abs(l.p.y-last.q.y)<=1.2&&l.p.x>=last.q.x-0.5);
     if(right){chain.push(right);grown=true}
    }
    const pts=[chain[0].p,...chain.map(l=>l.q)],top=pts.reduce((a,c)=>c.y<a.y?c:a),a=pts[0],z=pts[pts.length-1];
    const rises=chain.some(l=>sign(l)<0&&l.q.x<=top.x+0.5),falls=chain.some(l=>sign(l)>0&&l.p.x>=top.x-0.5);
    if(rises&&falls&&top.x>a.x+20&&top.x<z.x-20){
     const end=toMm((a.y+z.y)/2),drawn=Math.round((end+f.b*(top.y-(a.y+z.y)/2))/ROUND)*ROUND;
     // The level written at the ridge wins over the measured rise ("+10,000" over a ridge drawn 120 mm up).
     const mark=view.levels.filter(l=>Math.abs(l.x+l.w/2-top.x)<=70&&l.mm>end&&l.mm<=end+1000).sort((p,q)=>Math.abs(p.x+p.w/2-top.x)-Math.abs(q.x+q.w/2-top.x))[0];
     const ridge=mark?mark.mm:drawn;
     if(end>=lo&&end<=hi&&ridge>end){beam=null;Object.assign(m,{ridge:{end,ridge,t:Math.round((top.x-a.x)/(z.x-a.x)*100)/100,len:Math.round(Math.abs(f.b)*(z.x-a.x)/10)*10}})}
    }
   }
   // Post: the vertical line next to the label, followed up and down through joints.
   let post=null;
   for(const v of vert){
    const d=Math.min(Math.abs(v.x-b.x0),Math.abs(v.x-b.x1));
    if(d>16||v.y1<b.y0||v.y0>b.y1||extension(v))continue;
    if(!post||d<post.d||d===post.d&&v.y1-v.y0>post.y1-post.y0)post={d,x:v.x,y0:v.y0,y1:v.y1}
   }
   // A column label written under the column's foot, its leader slanting down to it: the longest line ending just
   // above the label, beside it.
   if(!post)for(const v of vert){
    if(v.y1>b.y0+2||v.y1<b.y0-30||v.x<b.x0-26||v.x>b.x1+26||v.y1-v.y0<60)continue;
    if(!post||v.y1-v.y0>post.y1-post.y0)post={d:0,x:v.x,y0:v.y0,y1:v.y1}
   }
   if(post){
    let grown=true;
    while(grown){grown=false;
     for(const v of vert)if(Math.abs(v.x-post.x)<=0.5&&v.y0<=post.y1+4&&v.y1>=post.y0-4&&(v.y0<post.y0||v.y1>post.y1)){post.y0=Math.min(post.y0,v.y0);post.y1=Math.max(post.y1,v.y1);grown=true}}
   }
   const rec={mark:m.mark,section:title.name};
   if(beam){const z=toMm(beam.y);if(z>=lo&&z<=hi)rec.beam_mm=z}
   if(m.ridge){rec.beam_mm=m.ridge.end;rec.ridge_mm=m.ridge.ridge;rec.ridge_t=m.ridge.t;rec.ridge_len_mm=m.ridge.len;delete m.ridge}
   if(post){
    const z1=toMm(post.y0),z0=toMm(post.y1);
    // A post outline that runs on into the foundation gets the bottom of the other posts.
    if(z1<=hi&&z1-z0>=500){rec.z0_mm=z0>=lo?z0:null;rec.z1_mm=z1}
   }
   // The lowest and highest levels of the view: a ladder drawn in it stands between them (ГПЭС М1.27 «4-4»: +0,210 …
   // +7,890).
   if(rec.beam_mm!==undefined||rec.z1_mm!==undefined)out.push({...rec,span_mm:[Math.min(...values),Math.max(...values)]})
  }
 }
 const bottoms=new Map();
 for(const r of out)if(r.z0_mm!==null&&r.z0_mm!==undefined)bottoms.set(r.z0_mm,(bottoms.get(r.z0_mm)||0)+1);
 const common=[...bottoms].sort((a,b)=>b[1]-a[1])[0]?.[0];
 for(const r of out)if(r.z0_mm===null){if(common!==undefined&&common<r.z1_mm-500){r.z0_mm=common;r.bottom_guess=true}else{delete r.z0_mm;delete r.z1_mm}}
 return out.filter(r=>r.beam_mm!==undefined||r.z1_mm!==undefined)
}

// "низ на отм. +0,050" / "верх +4,100" near the elements of one scheme, paired when written together.
function schemeNotes(texts,bbox,title=""){
 const pad=90,notes=[];
 const read=(str,x,y)=>{
  const s=String(str);const low=/низ/iu.exec(s),up=/верх/iu.exec(s);if(!low&&!up)return;
  const value=LEVEL_IN.exec(s);if(!value)return;
  const mm=levelMm(value[1].replace("−","-"));if(mm===null)return;
  notes.push({kind:up&&(!low||up.index<low.index)?"top":"bottom",mm,x,y})
 };
 for(const t of texts){
  const b=textBox(t);
  if(b.cx<bbox.x0-pad||b.cx>bbox.x1+pad||b.cy<bbox.y0-pad||b.cy>bbox.y1+pad)continue;
  read(t.str,b.cx,b.cy)
 }
 // "(верх балок на отм. +4,500)" in the title is valid for the whole scheme.
 const whole=[];
 for(const m of String(title).matchAll(/(низ|верх)[^+\-−\d]{0,30}([+\-−]?\d{1,2}[,.]\d{3})/giu)){
  const mm=levelMm(m[2].replace("−","-"));if(mm!==null)whole.push({kind:/верх/iu.test(m[1])?"top":"bottom",mm})
 }
 // «Схема расположения элементов покрытия на отм. +13,150»: the level of the members of that plan.
 if(!whole.length){const m=/на\s+отм\s*\.?\s*([+\-−]?\d{1,2}[,.]\d{3})/iu.exec(String(title));if(m){const mm=levelMm(m[1].replace("−","-"));if(mm!==null)whole.push({kind:"top",mm})}}
 const pairs=[],used=new Set();
 for(const n of notes){
  if(used.has(n))continue;used.add(n);
  const other=notes.find(o=>!used.has(o)&&o.kind!==n.kind&&Math.abs(o.y-n.y)<=40&&Math.abs(o.x-n.x)<=200);
  if(other)used.add(other);
  const low=n.kind==="bottom"?n:other,up=n.kind==="top"?n:other;
  pairs.push({x:n.x,y:n.y,z0_mm:low?.mm??null,z1_mm:up?.mm??null})
 }
 const t0=whole.find(w=>w.kind==="bottom")?.mm??null,t1=whole.find(w=>w.kind==="top")?.mm??null;
 return{notes:pairs,z0_mm:t0,z1_mm:t1}
}

// Elevations "Схема расположения элементов фахверка по оси "1"" / "по ряду А": a vertical plane on one grid line.
// Positions along the plane come from the axis bubbles and the spans between them, heights from the level marks,
// members from the lines next to their marks. Returned in the scheme format with the members' own heights.
const LETTERS="АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЩЭЮЯ";
// Numbered axes may carry a letter prefix or a fraction: «О3», «04/1» are numbered, «Б» is lettered.
const numbered=n=>/\d/.test(String(n));
const axisRank=n=>{const m=/(\d+)(?:\/(\d+))?/.exec(String(n));return m?Number(m[1])+(m[2]?Number(m[2])/100:0):1000+LETTERS.indexOf(String(n).toUpperCase())};
function elevationTitles(texts){
 const out=[];
 for(const t of texts){
  let m=/по\s+(оси|ряду)\s*"?([0-9А-ЯЁ]{0,3})"?\s*$/iu.exec(String(t.str).trim());
  // «… в осях Б / О3-О8», «… в осях О3/Л-К, О3/В-Б»: one axis, then the range along it.
  const across=!m&&/в\s+осях\s+([А-ЯЁ]\s*\d{0,2}(?:\s*\/\s*\d)?|\d{1,3})\s*\/\s*[0-9А-ЯЁ]/iu.exec(String(t.str).trim());
  if(across&&!/[-–]/.test(across[1]))m=[across[0],"",across[1].replace(/\s+/g,"")];
  if(!m||Math.abs(t.angle||0)>=10)continue;
  let name=m[2];
  if(!name){
   const next=texts.find(o=>o!==t&&Math.abs(o.y-t.y)<=2&&o.x>=t.x+t.width*.6&&o.x<=t.x+t.width+60&&/^["«]?[0-9А-ЯЁ]{1,3}["»]?$/u.test(String(o.str).trim()));
   if(next)name=String(next.str).replace(/["«»]/g,"").trim()
  }
  if(name)out.push({str:String(t.str).trim()+" «"+name+"»",name:cyrAxis(name.toUpperCase()),x:t.x+t.width/2,y:t.y})
 }
 return out
}
// Members named by the leaders of one label that make one frame — two rails and the posts standing from one to the other
// (a window frame): the whole frame, with the posts no leader names. Returned along the elevation (u, mm) with its
// members from its start and bottom; null when the members stand apart (one mark on two separate posts or girts).
// A line with another parallel to it 1.2-8 pt off along at least half of it: one edge of a member drawn in two lines.
function edgeOf(i,segments,lines){
 const s=segments[i];if(!s)return false;
 const l=Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);if(!l)return false;
 const u={x:(s.b.x-s.a.x)/l,y:(s.b.y-s.a.y)/l},mid={x:(s.a.x+s.b.x)/2,y:(s.a.y+s.b.y)/2};
 return lines.near(mid,l/2+8).some(j=>{
  if(j===i)return false;const q=segments[j],m=Math.hypot(q.b.x-q.a.x,q.b.y-q.a.y);if(m<l*.3)return false;
  if(Math.abs(u.x*(q.b.y-q.a.y)/m-u.y*(q.b.x-q.a.x)/m)>.02)return false;
  const off=Math.abs(u.x*(q.a.y-s.a.y)-u.y*(q.a.x-s.a.x));if(off<1.2||off>8)return false;
  const t1=(q.a.x-s.a.x)*u.x+(q.a.y-s.a.y)*u.y,t2=(q.b.x-s.a.x)*u.x+(q.b.y-s.a.y)*u.y;
  return Math.min(l,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2))>=l*.5
 })
}
function frameOf(found,segments,along,toZ){
 // along: the place on the elevation of a point, mm, not drawn to the axes (a post 200 mm off an axis stays there).
 const rails=found.filter(f=>f.flat);if(rails.length<2||found.some(f=>!f.flat&&!f.vertical))return null;
 const y0=Math.min(...rails.map(f=>f.line.a.y)),y1=Math.max(...rails.map(f=>f.line.a.y));if(y1-y0<3)return null;
 const span=f=>[Math.min(f.line.a.x,f.line.b.x),Math.max(f.line.a.x,f.line.b.x)];
 const xa=Math.max(...rails.map(f=>span(f)[0])),xb=Math.min(...rails.map(f=>span(f)[1]));if(xb-xa<3)return null;
 // A rail drawn in two lines meets its posts at its inner edge, a few points off the edge the leader found.
 const ends=(lo,hi)=>lo>=y0-8&&lo<=y0+8&&hi>=y1-8&&hi<=y1+8;
 const posts=[];
 // A post a leader names spans from rail to rail; its line may run on a little past one (joined to a stroke beyond).
 for(const f of found)if(f.vertical){const lo=Math.min(f.line.a.y,f.line.b.y),hi=Math.max(f.line.a.y,f.line.b.y);
  if(lo>y0+8||hi<y1-8||lo<y0-30||hi>y1+30||f.line.a.x<xa-8||f.line.a.x>xb+8)return null;posts.push(f.line.a.x)}
 // Rails between the top and the bottom one meet the posts too.
 if(!posts.length&&!segments.some(q=>Math.abs(q.a.x-q.b.x)<=.3&&q.a.x>=xa-1&&q.a.x<=xb+1&&ends(Math.min(q.a.y,q.b.y),Math.max(q.a.y,q.b.y))))return null;
 const u0=Math.min(...found.flatMap(f=>[f.a.u,f.b.u])),u1=Math.max(...found.flatMap(f=>[f.a.u,f.b.u])),zb=toZ(y1),zt=toZ(y0);
 // Posts between the rails within the frame's bay: a vertical line from one to the other, a post drawn in two lines
 // taken once. A column running on past the rails (the wall's post the frame is fixed to) is no part of it.
 const vert=segments.filter(q=>Math.abs(q.a.x-q.b.x)<=.3);
 const beyond=q=>vert.some(o=>{if(Math.abs(o.a.x-q.a.x)>.3||(Number(o.w)||1)<(Number(q.w)||1)*.8)return false;
  const lo=Math.min(o.a.y,o.b.y),hi=Math.max(o.a.y,o.b.y);return lo<y0-10&&hi>=y0-10||hi>y1+10&&lo<=y1+10});
 // A post is drawn as heavily as the rails (a thinner line there is an end plate, a gusset, a column of another set).
 const heavy=Math.min(...rails.map(f=>Number(segments.find(q=>Math.abs(q.a.y-f.line.a.y)<.3&&Math.abs(q.a.y-q.b.y)<.3&&Math.min(q.a.x,q.b.x)<=Math.max(f.line.a.x,f.line.b.x)&&Math.max(q.a.x,q.b.x)>=Math.min(f.line.a.x,f.line.b.x))?.w)||0));
 for(const q of vert){
  if(posts.some(x=>Math.abs(x-q.a.x)<.3)||heavy>0&&(Number(q.w)||heavy)<heavy*.8)continue;
  const u=along(q.a.x);if(u<u0-50||u>u1+50)continue;
  if(ends(Math.min(q.a.y,q.b.y),Math.max(q.a.y,q.b.y))&&!beyond(q))posts.push(q.a.x)
 }
 // The two lines of one post (its edges, a profile's width apart) are one post at their middle.
 posts.sort((p,q)=>p-q);
 for(let i=posts.length-1;i>0;i--)if(Math.abs(along(posts[i])-along(posts[i-1]))<=250){posts[i-1]=(posts[i-1]+posts[i])/2;posts.splice(i,1)}
 if(!posts.length||rails.some(f=>f.line.a.y>y0+1&&f.line.a.y<y1-1&&!posts.some(x=>x>=span(f)[0]-8&&x<=span(f)[1]+8)))return null;
 const r=v=>Math.round(v);
 const members=[...rails.map(f=>[r(Math.min(f.a.u,f.b.u)-u0),r(f.a.z-zb),r(Math.max(f.a.u,f.b.u)-u0),r(f.b.z-zb),f.line.a.y<=y0+1?"top":f.line.a.y>=y1-1?"bottom":"mid",""]),
  ...posts.map(x=>{const u=Math.max(0,Math.min(u1-u0,along(x)-u0));return[r(u),0,r(u),r(zt-zb),"post",""]})];
 return{u0,u1,z0:zb,z1:zt,members}
}
// Wall girts and the like are often marked without a number («Рр», «Рн», «Рст»): such a word repeated on the sheet
// (three times or more) is a mark of the elevation; ordinary short words are not.
const NOT_WORD_MARK=/^(?:Поз|Вид|Ось|Оси|Узел|Лист|См|Гр|Кол|Отм|Шаг|Изм|Нет|Тип|Ряд|Для|Под|Над|Низ|Верх|Все|При|Или|Шт|Мм|Кг|Сеч|Ст)$/u;
function extractElevations({segments=[],texts=[]}={},page=1){
 const aMarks=aMarksOn(texts);
 const counts=new Map();for(const t of texts){const s=String(t.str).trim();if(/^[А-ЯЁ][а-яё]{1,2}$/u.test(s)&&!NOT_WORD_MARK.test(s))counts.set(s,(counts.get(s)||0)+1)}
 const wordMarks=new Set([...counts].filter(([,n])=>n>=3).map(([s])=>s));
 const titles=elevationTitles(texts);if(!titles.length)return[];
 const rows=bubbleRows(texts,segments);if(!rows.length)return[];
 const lines=buildLineIndex(segments),schemes=[];
 const horiz=segments.filter(s=>Math.abs(s.a.y-s.b.y)<=.3&&Math.abs(s.a.x-s.b.x)>=3).map(s=>({y:s.a.y,x0:Math.min(s.a.x,s.b.x),x1:Math.max(s.a.x,s.b.x)}));
 for(const title of titles){
  const row=rows.filter(r=>r.y>title.y&&r.y-title.y<1300&&title.x>=r.x0-300&&title.x<=r.x1+300).sort((a,b)=>a.y-b.y)[0];
  if(!row)continue;
  const region=texts.filter(t=>{const b=textBox(t);return ownerBelow(rows,b.cx,b.cy)===row&&b.cy>title.y});
  const levels=region.filter(t=>Math.abs(t.angle||0)<10).map(t=>({mm:levelOf(t.str),y:t.y,x:t.x,w:t.width||0,s:t.size})).filter(l=>l.mm!==null);
  placeLevels(levels,horiz,segments);
  const f=fit(levels);if(!f)continue;
  const scale=Math.abs(f.b),values=[...new Set(levels.map(l=>l.mm))];
  const toZ=y=>{const v=f.a+f.b*y,near=values.reduce((p,c)=>Math.abs(c-v)<Math.abs(p-v)?c:p);return Math.abs(near-v)<=SNAP?near:Math.round(v/ROUND)*ROUND};
  // Axis positions: bubble centres, spans corrected to the dimensions written under them.
  const bubbles=row.items.map(t=>({name:String(t.str).trim().toUpperCase(),pt:t.x+(t.width||0)/2})).sort((a,b)=>a.pt-b.pt);
  if(bubbles.length<2||new Set(bubbles.map(b=>b.name)).size!==bubbles.length)continue;
  // Along a lettered row the axes are numbered, and the other way round: a row of mixed or same-kind bubbles is a
  // detail view («… фонтанчику в осях Б / О4»), not the elevation of that row.
  if(bubbles.some(b=>numbered(b.name)===numbered(title.name)))continue;
  const dims=region.filter(t=>Math.abs(t.angle||0)<10&&/^\d{3,5}$/.test(String(t.str).trim())).map(t=>Number(t.str));
  const left=[0];
  for(let i=1;i<bubbles.length;i++){
   const raw=(bubbles[i].pt-bubbles[i-1].pt)*scale,near=dims.filter(d=>Math.abs(d-raw)<=raw*.06).sort((a,b)=>Math.abs(a-raw)-Math.abs(b-raw))[0];
   left.push(left[i-1]+(near||Math.round(raw/50)*50))
  }
  const total=left[left.length-1],reversed=axisRank(bubbles[0].name)>axisRank(bubbles[bubbles.length-1].name);
  const canon=m=>reversed?total-m:m;
  const axes=bubbles.map((b,i)=>({name:b.name,mm:canon(left[i])})).sort((a,b)=>a.mm-b.mm);
  const raw=xpt=>{let k=0;for(let i=1;i<bubbles.length;i++)if(Math.abs(bubbles[i].pt-xpt)<Math.abs(bubbles[k].pt-xpt))k=i;return canon(left[k]+(xpt-bubbles[k].pt)*scale)};
  const along=xpt=>{
   const c=raw(xpt),near=axes.reduce((p,a)=>Math.abs(a.mm-c)<Math.abs(p.mm-c)?a:p);
   return Math.abs(near.mm-c)<=300?near.mm:Math.round(c/10)*10
  };
  const axisNames=new Set(bubbles.map(b=>b.name));
  // Grid lines through the bubbles are not members. The axis is the line that runs down into its bubble: a digit is not
  // always centred in it, and a post standing on the axis has its edges a few points off (ГПЭС М1.19, ряд Л: «В210»
  // on axis 6, its axis taken for it).
  const skip=new Set(),vertical=segments.map((s,i)=>[s,i]).filter(([s])=>Math.abs(s.a.x-s.b.x)<=.3);
  for(const b of bubbles){
   const size=row.items.find(t=>String(t.str).trim().toUpperCase()===b.name)?.size||12;
   const axis=vertical.filter(([s])=>Math.abs(s.a.x-b.pt)<=3&&Math.max(s.a.y,s.b.y)>=row.y-size*2.5&&Math.max(s.a.y,s.b.y)<=row.y+2).sort(([p],[q])=>Math.abs(p.a.x-b.pt)-Math.abs(q.a.x-b.pt))[0];
   for(const [s,i] of vertical)if(axis?Math.abs(s.a.x-axis[0].a.x)<=.3:Math.abs(b.pt-s.a.x)<1.2)skip.add(i)
  }
  const lo=Math.min(...values)-1000,hi=Math.max(...values)+1500,placements=[],index=buildIndex(segments);
  for(const t of region){
   const mark=String(t.str).trim();if(!(MARK.test(mark)||wordMarks.has(mark))||skipMark(mark,aMarks)||axisNames.has(cyrAxis(mark)))continue;
   // A label on a shelf with a slanted leader names the member at the leader's end — at each end, when it has several
   // (ГПЭС М1.19, ось А: «К21» on the post of axis 2, «К3» on both rails of a window). Others lie along their member.
   // A leader is one line: a slanted line with another along it a few points off is an edge of a brace drawn behind the
   // member the label stands on (ГПЭС М1.18, ось 1: «К100» on its crossbar between two posts, the brace behind it).
   const tg=Math.abs(Number(t.angle)||0)<5?leaderTarget(t,segments,index,skip,lines):null;
   const led=tg&&tg.leader&&tg.diagonal&&tg.shelf&&!edgeOf(tg.segment,segments,lines),found=[];
   for(const target of led?[tg,...(tg.more||[]).filter(m=>!edgeOf(m.segment,segments,lines)).map(m=>({...tg,...m}))]:[{leader:false}]){
    const line=memberLine(t,target,segments,lines,skip);if(!line)continue;
    const a={u:along(line.a.x),z:toZ(line.a.y)},b={u:along(line.b.x),z:toZ(line.b.y)};
    // A rail drawn as one continuous line spans only the bay of its mark.
    if(Math.abs(line.a.y-line.b.y)<1.5){
     const c=along(target.leader?target.x:textFrame(t).c.x),lowAxis=axes.filter(x=>x.mm<=c).at(-1),highAxis=axes.find(x=>x.mm>c);
     const [s0,s1]=a.u<=b.u?[a,b]:[b,a];
     if(lowAxis&&s0.u<lowAxis.mm)s0.u=lowAxis.mm;
     if(highAxis&&s1.u>highAxis.mm)s1.u=highAxis.mm
    }
    if([a.z,b.z].some(z=>z<lo||z>hi))continue;
    const vertical=Math.abs(line.a.x-line.b.x)<1.5,flat=Math.abs(line.a.y-line.b.y)<1.5;
    if(vertical&&Math.abs(a.z-b.z)<300||!vertical&&Math.abs(a.u-b.u)<200&&Math.abs(a.z-b.z)<200)continue;
    if(!found.some(f=>f.line.a.x===line.a.x&&f.line.a.y===line.a.y&&f.line.b.x===line.b.x&&f.line.b.y===line.b.y))found.push({line,a,b,vertical,flat})
   }
   const at=u=>numbered(title.name)?{x:0,y:u}:{x:u,y:0};
   const base={mark,page,sheet_point_pt:{x:Math.round(t.x),y:Math.round(t.y)},axis_x:numbered(title.name)?title.name:"",axis_y:numbered(title.name)?"":title.name,confidence:"medium"};
   // The leaders of one label ending on members joined to one another (rails and the post between them): one welded
   // frame (ГПЭС М1.19, ось А: «К3» — the window frame of л. 1, two rails and two posts), not a piece at each leader.
   const frame=found.length>=2?frameOf(found,segments,raw,toZ):null;
   if(frame){
    const p0=at(frame.u0),p1=at(frame.u1);
    placements.push({...base,geometry_type:"beam",kind_label:"Рама",x_mm:p0.x,y_mm:p0.y,x2_mm:p1.x,y2_mm:p1.y,z0_mm:frame.z0,z1_mm:frame.z0,
     truss:{kind:"frame",span_mm:frame.u1-frame.u0,base_mm:frame.z0,members:frame.members},
     notes:["Развёртка по оси "+title.name+": рама "+frame.members.length+" эл., "+(frame.u1-frame.u0)+"×"+(frame.z1-frame.z0)+" мм, положение и отметки с чертежа"]});
    continue
   }
   for(const {line,a,b,vertical,flat} of found){
    const geometry=vertical?"column":flat?"beam":"brace";
    const p0=at(a.u),p1=at(b.u);
    placements.push({...base,geometry_type:geometry,kind_label:geometry==="column"?"Колонна/стойка":geometry==="brace"?"Связь":"Балка/ригель/прогон",
     x_mm:p0.x,y_mm:p0.y,...(vertical?{}:{x2_mm:p1.x,y2_mm:p1.y}),
     z0_mm:vertical?Math.min(a.z,b.z):a.z,z1_mm:vertical?Math.max(a.z,b.z):b.z,
     notes:["Развёртка по оси "+title.name+": положение и отметки с чертежа"]})
   }
  }
  if(!placements.length)continue;
  const names=axes.map(a=>a.name),spans=axes.slice(1).map((a,i)=>a.mm-axes[i].mm),byX=numbered(title.name);
  schemes.push({kind:"elevation",title:title.str,bbox:{x0:row.x0-260,x1:row.x1+260,y0:title.y,y1:row.y},scaleMmPerPt:Math.round(scale*1000)/1000,
   axesX:byX?[title.name]:names,axesY:byX?names:[title.name],spansX:byX?[]:spans,spansY:byX?spans:[],
   sizeX:byX?0:axes[axes.length-1].mm,sizeY:byX?axes[axes.length-1].mm:0,placements,warnings:[]})
 }
 return schemes
}
module.exports={extractSections,extractElevations,schemeNotes,elevationTitles,bubbleRows,levelOf,levelOffset,placeLevels,fit};
