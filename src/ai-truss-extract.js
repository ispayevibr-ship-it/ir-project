"use strict";
/*
 * Geometric schemes of trusses («Геометрическая схема фермы стропильной Фс 1»): the lattice of each truss in its own
 * plane — top and bottom chords, posts and diagonals — in millimetres from the bottom node of the left support, as
 * drawn. A member of such a scheme carries its force (±xx,xx tc) and its length written along it; the dimension lines
 * and the extension lines below carry neither, so only lines with a force label are taken. The scale comes from the
 * overall span written under the truss (24000). The marks at the supports (К1 … К2) tell which end is which.
 */
const FORCE=/^[+\-−]?\d{1,3},\d{1,2}$/u;
const TITLE=/^Геометрическ\S*\s+схем\S*\s+(?:фермы|ферм)(?=\s|$)(.*)$/iu;
const MARK=/^([А-ЯЁ][а-яё]{0,2})\s*-?\s*(\d{1,3}(?:[-.]\d{1,2})?)$/u;
const PROFILE=/^(?:\d\s*)?[∟L\[I□]?\s*\d{2,3}[хx×]\d{1,2}(?:[хx×]\d{1,2})?$|^\d{2}[БШКП]\d?$/u;
const SUPPORT=/^[А-ЯЁ][а-яё]{0,2}\s*-?\s*\d{1,3}$/u;
const deg=r=>r*180/Math.PI;
const near=(a,b,tol)=>{const d=Math.abs(((a-b)%180+180)%180);return Math.min(d,180-d)<=tol};

function trussTitles(texts){
 return texts.filter(t=>TITLE.test(t.str)&&Math.abs(Number(t.angle)||0)<2).map(t=>{
  const tail=TITLE.exec(t.str)[1].trim().split(/\s+/u),words=tail.join(" ");
  // The mark is the end of the title: «… стропильной Фс 1» → Фс1.
  const m=/([А-ЯЁ][а-яё]{0,2})\s*-?\s*(\d{1,3}(?:[-.]\d{1,2})?)\s*$/u.exec(words);
  return{t,mark:m?m[1]+m[2]:"",kind:/подстропильн/iu.test(words)?"подстропильная ферма":/стропильн/iu.test(words)?"стропильная ферма":"ферма"}
 }).filter(x=>x.mark)
}
// A line with a force label beside it, running along the label.
function memberFor(label,segments){
 const a=(Number(label.angle)||0)*Math.PI/180,dir={x:Math.cos(a),y:-Math.sin(a)},nrm={x:-dir.y,y:dir.x};
 const c={x:label.x+dir.x*label.width/2,y:label.y+dir.y*label.width/2};
 let best=null;
 for(let i=0;i<segments.length;i++){
  const s=segments[i],dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,len=Math.hypot(dx,dy);
  if(len<12||!near(deg(Math.atan2(-dy,dx)),Number(label.angle)||0,4))continue;
  const ux=dx/len,uy=dy/len,t=(c.x-s.a.x)*ux+(c.y-s.a.y)*uy,off=Math.abs((c.x-s.a.x)*uy-(c.y-s.a.y)*ux);
  if(t<-6||t>len+6||off>Math.max(14,label.size*1.4))continue;
  // A label stands beside its line (above or below it), never far along it.
  if(!best||off<best.off)best={i,off}
 }
 return best?best.i:-1
}
// Lines of a geometric scheme stop short of the nodes (a gap is drawn round each node): every end goes to the nearest
// crossing with another member's line within 0.4 m, so that the members meet as in the truss.
function snapNodes(members){
 const cross=(m,o)=>{
  const ax=m.x1-m.x0,az=m.z1-m.z0,bx=o.x1-o.x0,bz=o.z1-o.z0,d=ax*bz-az*bx;if(Math.abs(d)<1e-6)return null;
  const t=((o.x0-m.x0)*bz-(o.z0-m.z0)*bx)/d,u=((o.x0-m.x0)*az-(o.z0-m.z0)*ax)/d;
  return{x:m.x0+ax*t,z:m.z0+az*t,u}
 };
 const ends=members.map(m=>[{x:m.x0,z:m.z0},{x:m.x1,z:m.z1}]);
 members.forEach((m,i)=>[0,1].forEach(e=>{
  const p=ends[i][e];let best=null;
  members.forEach((o,j)=>{if(i===j)return;const c=cross(m,o);if(!c||c.u<-0.08||c.u>1.08)return;const d=Math.hypot(c.x-p.x,c.z-p.z);if(d<=400&&(!best||d<best.d))best={d,c}});
  if(best){if(e===0){m.x0=Math.round(best.c.x/5)*5;m.z0=Math.round(best.c.z/5)*5}else{m.x1=Math.round(best.c.x/5)*5;m.z1=Math.round(best.c.z/5)*5}}
 }))
}
function extractTrusses({texts=[],segments=[],widthPt=0,heightPt=0}={}){
 const titles=trussTitles(texts).sort((a,b)=>a.t.y-b.t.y||a.t.x-b.t.x),out=[];
 for(const ti of titles){
  const cx=ti.t.x+ti.t.width/2;
  // The scheme of a title: below it, down to the next title whose columns overlap; across half the sheet each way.
  const next=titles.filter(o=>o!==ti&&o.t.y>ti.t.y+20&&Math.abs(o.t.x+o.t.width/2-cx)<widthPt*0.45).map(o=>o.t.y);
  const y0=ti.t.y,y1=Math.min(heightPt-60,...next)-10;
  const others=titles.filter(o=>o!==ti&&Math.abs(o.t.y-ti.t.y)<40).map(o=>o.t.x+o.t.width/2);
  const x0=Math.max(0,...others.filter(x=>x<cx).map(x=>(x+cx)/2)),x1=Math.min(widthPt,...others.filter(x=>x>cx).map(x=>(x+cx)/2));
  const inside=t=>t.x>=x0&&t.x<=x1&&t.y>y0&&t.y<y1;
  const zone=texts.filter(inside),segs=segments.filter(s=>[s.a,s.b].every(p=>p.x>=x0-5&&p.x<=x1+5&&p.y>=y0-5&&p.y<=y1+5));
  // Labels of members: the force, the profile («160х10») or the length written turned along a sloping member. A
  // symmetric truss is often labelled by forces on one half and by profiles and lengths on the other.
  const labels=zone.filter(t=>FORCE.test(t.str)||PROFILE.test(t.str)||/^\d{3,5}$/u.test(t.str)&&Math.abs(Number(t.angle)||0)>=2&&Math.abs(Math.abs(Number(t.angle)||0)-90)>=2);
  const picked=new Map();
  for(const f of labels){const i=memberFor(f,segs);if(i<0)continue;if(!picked.has(i))picked.set(i,{s:segs[i],forces:[],profiles:[]});
   if(FORCE.test(f.str))picked.get(i).forces.push(Number(f.str.replace("−","-").replace(",",".")));else if(PROFILE.test(f.str))picked.get(i).profiles.push(f.str)}
  if(picked.size<5)continue;
  const lines=[...picked.values()].filter(l=>l.forces.length||l.profiles.length);
  const ys=lines.flatMap(l=>[l.s.a.y,l.s.b.y]),bottom=Math.max(...ys);
  // Span: the largest horizontal dimension under the lattice, measured by its own dimension line.
  const dimTexts=zone.filter(t=>Math.abs(Number(t.angle)||0)<2&&/^\d{4,5}$/u.test(t.str)&&t.y>bottom-4);
  const spanText=dimTexts.sort((a,b)=>Number(b.str)-Number(a.str))[0];if(!spanText)continue;
  const span=Number(spanText.str),sc=spanText.x+spanText.width/2;
  const dimLine=segs.filter(s=>Math.abs(s.a.y-s.b.y)<1&&s.a.y>spanText.y-spanText.size*1.6&&s.a.y<spanText.y+spanText.size*0.6&&Math.min(s.a.x,s.b.x)<sc&&Math.max(s.a.x,s.b.x)>sc)
   .sort((a,b)=>Math.abs(b.b.x-b.a.x)-Math.abs(a.b.x-a.a.x))[0];
  const xs=lines.flatMap(l=>[l.s.a.x,l.s.b.x]);
  const left=dimLine?Math.min(dimLine.a.x,dimLine.b.x):Math.min(...xs),right=dimLine?Math.max(dimLine.a.x,dimLine.b.x):Math.max(...xs);
  if(!span||right-left<40)continue;
  const k=span/(right-left);
  // Origin: the lowest node at the left end of the lattice.
  const leftNodes=lines.flatMap(l=>[l.s.a,l.s.b]).filter(p=>p.x-left<6),oy=leftNodes.length?Math.max(...leftNodes.map(p=>p.y)):bottom;
  const mm=p=>({x:Math.round((p.x-left)*k/5)*5,z:Math.round((oy-p.y)*k/5)*5});
  const members=lines.map(l=>{const a=mm(l.s.a),b=mm(l.s.b),f=l.forces.length?l.forces[0]:null,pr=l.profiles[0]||"";
   return a.x<=b.x?{x0:a.x,z0:a.z,x1:b.x,z1:b.z,force:f,profile:pr}:{x0:b.x,z0:b.z,x1:a.x,z1:a.z,force:f,profile:pr}})
   .filter(m=>Math.hypot(m.x1-m.x0,m.z1-m.z0)>=200);
  snapNodes(members);
  // Chords: long members along the span (a straight chord drawn as one line or panel by panel); the upper of them at
  // the same place along the span is the top chord.
  const flat=m=>Math.abs(m.z1-m.z0)<=Math.abs(m.x1-m.x0)*0.35&&m.x1-m.x0>=span*0.1;
  const zAt=(m,x)=>m.z0+(m.z1-m.z0)*(x-m.x0)/Math.max(1,m.x1-m.x0);
  for(const m of members){
   if(!flat(m)){m.role=Math.abs(m.x1-m.x0)<Math.abs(m.z1-m.z0)*0.15?"стойка":"раскос";continue}
   const mid=(m.x0+m.x1)/2,other=members.filter(o=>o!==m&&flat(o)&&o.x0<=mid&&o.x1>=mid);
   m.role=other.some(o=>zAt(o,mid)>zAt(m,mid)+100)?"нижний пояс":"верхний пояс"
  }
  // Supports: column marks written over the two ends.
  const ends=zone.filter(t=>SUPPORT.test(t.str)&&!FORCE.test(t.str)&&t.y<oy+20);
  const endMark=x=>{const c=ends.filter(t=>Math.abs(t.x+t.width/2-x)<60).sort((a,b)=>Math.abs(a.x+a.width/2-x)-Math.abs(b.x+b.width/2-x))[0];return c?c.str.replace(/\s|-/gu,""):""};
  const heights=x=>{const at=members.filter(m=>m.x0<=x+5&&m.x1>=x-5),z=at.map(m=>zAt(m,Math.max(m.x0,Math.min(m.x1,x))));return z.length?Math.round(Math.max(...z)-Math.min(...z)):null};
  out.push({mark:ti.mark,kind:ti.kind,title:ti.t.str,span_mm:span,height_left_mm:heights(Math.min(...members.map(m=>m.x0))+50),height_right_mm:heights(Math.max(...members.map(m=>m.x1))-50),
   left:endMark(left),right:endMark(right),members,box:{x0:Math.round(x0),y0:Math.round(y0),x1:Math.round(x1),y1:Math.round(y1)}})
 }
 return out
}
module.exports={extractTrusses,trussTitles};
