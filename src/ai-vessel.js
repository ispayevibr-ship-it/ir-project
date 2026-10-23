"use strict";
/*
 * IR Project: a vessel on supports (чан, сгуститель, бункер, ёмкость с конусом) built without a mounting scheme.
 * Such sets are often only КМД assembly sheets — one sheet per shipping mark («Сегмент 9 · А003855-а», «Опорная
 * стойка», «Нижняя часть конуса») and a general assembly drawing; there are no axes. The vessel is put on a
 * conditional grid round its centre:
 * - the wall of N segments as N sectors of a cylinder between the wall levels;
 * - the cone under the wall down to the outlet, its parts as rings (a part of several pieces — as sectors);
 * - posts under the wall on its circle, struts between the posts (V-shaped), the toothed weir at the top;
 * - the small parts of the segment joints (стяжки, петли, направляющие) along the joints.
 * Numbers come from Claude's answer or a checked set (vessel), else from the sheets; what is assumed is said.
 */
const ROLE={
 wall_segment:/сегмент|обечайк|стенк/iu,
 cone_part:/конус|днищ|воронк/iu,
 support_brace:/подкос|раскос/iu,
 support_post:/стойк|опор/iu,
 weir:/зубчат|перелив|водослив/iu,
 ring:/кольц/iu,
 detail:/стяжк|петл|направляющ|детал/iu
};
const TYPE={wall_segment:"vessel_shell",cone_part:"vessel_cone",support_post:"vessel_support",support_brace:"vessel_strut",weir:"vessel_weir",ring:"tank_ring",detail:"vessel_detail",roof_part:"tank_roof",other:""};
const GROUP={wall_segment:"tanks",cone_part:"bottom",support_post:"posts",support_brace:"ties",weir:"rings",ring:"rings",detail:"fasteners",roof_part:"roof",other:"other"};
const roleOf=name=>Object.keys(ROLE).find(r=>ROLE[r].test(String(name||"")))||"other";
// The words of a vessel set: in the object name or in the names of its sheets.
const VESSEL=/(?:^|[^а-яё])(?:чан|сгустител|бункер|ёмкост|емкост|силос|отстойник|флотатор)/iu;
const pos=v=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):0;
const round=v=>Math.round(v);

// Parts of the set from the sheets: one shipping mark per assembly sheet, its name from the stamp.
function partsFromSheets(pages,lookup){
 const parts=new Map();
 for(const p of pages||[]){
  const st=p.sheet?.stamp?.name||"";if(!st)continue;
  const bits=st.split(" · ").map(s=>s.trim()).filter(Boolean);
  for(const r of p.sheet?.required||[]){
   const name=bits.filter(b=>!b.includes(r.mark.replace(/^[AА]/u,""))&&!VESSEL.test(b)&&!/^(?:Сборочный|Вес|Дополнительн|М\d)/iu.test(b)).join(" ")||"";
   const k=r.mark.replace(/^A/u,"А");
   const e=parts.get(k)||{mark:k,name:"",count:null,mass_kg:null};
   if(!e.name&&name)e.name=name;if(e.count===null&&r.count>0)e.count=r.count;if(e.mass_kg===null&&r.mass_kg>0)e.mass_kg=r.mass_kg;
   parts.set(k,e)
  }
 }
 for(const e of parts.values()){
  const c=lookup?.(e.mark);
  if(e.count===null&&c?.count>0)e.count=c.count;
  e.length_mm=c?.length_mm||null
 }
 return[...parts.values()].map(e=>({...e,role:roleOf(e.name)}))
}

// What the sheets themselves say about the size: the radius of the segments («R6008»), the plate of a segment as
// bent («Предложение по форме изгиба 3307 2358 8» — height, arc width, thickness).
function sizeFromSheets(pages,parts){
 const num=p=>{const m=/(\d+)\s*$/u.exec(String(p.name||""));return m?Number(m[1]):1e6};
 const segs=parts.filter(p=>p.role==="wall_segment").sort((a,b)=>num(a)-num(b)),n=segs.reduce((a,p)=>a+(p.count||1),0);
 const radii=new Map(),plates=[];
 for(const p of pages||[]){
  const text=p.context?.text||"";
  if(!/сегмент|обечайк/iu.test(p.sheet?.stamp?.name||""))continue;
  // Each radius once per sheet: the sheets of all segments repeat the radius of the wall.
  for(const r of new Set([...text.matchAll(/(?:^|\s)R\s?(\d{4,5})(?=\s|$)/gu)].map(m=>Number(m[1]))))radii.set(r,(radii.get(r)||0)+1);
  const m=/форме\s+изгиба\s+(\d{3,5})\s+(\d{3,5})\s+(\d{1,2})(?=\s|$)/iu.exec(text);if(m)plates.push([Number(m[1]),Number(m[2])])
 }
 // N segments close the circle with their arc side: the radius written on the sheets that fits it, the other side
 // is the height of the wall.
 let R=0,height=0;
 const listed=[...radii].sort((a,b)=>b[1]-a[1]);
 const common=new Map();for(const [a,b] of plates)common.set(a+"x"+b,(common.get(a+"x"+b)||0)+1);
 const plate=[...common].sort((a,b)=>b[1]-a[1])[0]?.[0].split("x").map(Number);
 if(plate&&n)for(const [arc,side] of [[plate[1],plate[0]],[plate[0],plate[1]]]){
  const want=arc*n/(2*Math.PI),near=listed.map(([r])=>r).sort((a,b)=>Math.abs(a-want)-Math.abs(b-want))[0];
  if(near&&Math.abs(near-want)/want<0.03){R=near;height=side;break}
 }
 if(!R)R=listed[0]?.[0]||0;
 return{radius_mm:R,wall_height_mm:height,segments:n}
}

// The vessel as the program reads it from the sheets, for when Claude did not answer.
// lookup(mark) — the catalog entry of a КМД mark (count, length).
function vesselFromSheets(pages,lookup){
 const names=(pages||[]).map(p=>p.sheet?.stamp?.name||"").join(" | ");
 const parts=partsFromSheets(pages,lookup);
 if(!parts.some(p=>p.role==="wall_segment"||p.role==="cone_part"))return null;
 if(!VESSEL.test(names)&&!parts.some(p=>p.role==="cone_part"))return null;
 const size=sizeFromSheets(pages,parts);
 const title=((pages||[]).map(p=>(p.sheet?.stamp?.name||"").split(" · ")).flat().find(b=>VESSEL.test(b))||"Чан").trim();
 const post=parts.find(p=>p.role==="support_post"&&p.length_mm>0);
 return{is_vessel:true,name:title,diameter_mm:size.radius_mm*2,wall_z0_mm:post?post.length_mm:0,wall_z1_mm:0,wall_height_mm:size.wall_height_mm,
  bottom:parts.some(p=>p.role==="cone_part")?"cone":"flat",cone_z_mm:0,outlet_diameter_mm:0,
  parts:parts.map(p=>({mark:p.mark,name:p.name,role:p.role,count:p.count||0,z0_mm:0,z1_mm:0,radius_mm:0,note:p.count?"":"количество не прочитано"})),fromSheets:true}
}

// Placements of the vessel round its centre. v: {diameter_mm, wall_z0_mm, wall_z1_mm|wall_height_mm, bottom, cone_z_mm,
// outlet_diameter_mm, parts:[{mark,name,role,count,z0_mm,z1_mm,radius_mm,note}]}.
function buildVessel(v){
 if(!v||!(v.parts||[]).length&&!pos(v.diameter_mm))return null;
 const notes=[],assumed=[];
 let D=pos(v.diameter_mm);
 if(!D){D=10000;assumed.push("диаметр не найден — принят условно 10 000")}
 const R=D/2,M=1500,C=round(R+M),at=(deg,r)=>({x:round(C+Math.cos(deg*Math.PI/180)*r),y:round(C+Math.sin(deg*Math.PI/180)*r)});
 let z0=Number(v.wall_z0_mm)||0,h=pos(v.wall_z1_mm)>z0?v.wall_z1_mm-z0:pos(v.wall_height_mm);
 if(!h){h=3000;assumed.push("высота стенки не найдена — принята условно 3 000")}
 const parts=(v.parts||[]).map(p=>({...p,role:p.role&&TYPE[p.role]!==undefined?p.role:roleOf(p.name),count:Math.max(0,Math.round(Number(p.count)||0))}));
 const posts=parts.filter(p=>p.role==="support_post"),struts=parts.filter(p=>p.role==="support_brace");
 if(!(z0>0)&&posts.length){z0=4000;assumed.push("высота опор не найдена — низ стенки принят условно на +4,000")}
 const z1=z0+h;
 const placements=[];
 const add=(p,e,extra)=>placements.push({mark:p.mark,name:p.name||"",type_key:TYPE[p.role]||"",scheme_group:GROUP[p.role]||"other",confidence:"low",levels_from:v.fromSheets?"листы КМД (условно)":"Claude / база знаний",...e,notes:[...(p.note?[p.note]:[]),...(extra||[])]});
 // The wall: one sector per segment, in the order of the marks.
 const num=p=>{const m=/(\d+)\s*$/u.exec(String(p.name||""));return m?Number(m[1]):1e6};
 const segs=parts.filter(p=>p.role==="wall_segment").sort((a,b)=>num(a)-num(b)),n=segs.reduce((a,p)=>a+(p.count||1),0);
 let k=0;
 for(const p of segs)for(let j=0;j<(p.count||1);j++,k++)
  add(p,{geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:round(R),z0_mm:z0,z1_mm:z1,sector_start_deg:Math.round(360/n*k*10)/10,sector_deg:Math.round(360/n*10)/10},
   ["Сегмент стенки "+(k+1)+" из "+n+": порядок по кругу — по номерам сегментов, проверьте по сборочному чертежу"]);
 // The cone: from the wall bottom down to the outlet; parts top to bottom («верхняя», «средняя», «нижняя …»).
 const cone=parts.filter(p=>p.role==="cone_part");
 if(cone.length){
  const order=p=>/верх/iu.test(p.name)?0:/средн/iu.test(p.name)?1:/нижн/iu.test(p.name)?(/фланц/iu.test(p.name)?3:2):1.5;
  cone.sort((a,b)=>order(a)-order(b));
  let zb=Number(v.cone_z_mm)>0&&Number(v.cone_z_mm)<z0?Number(v.cone_z_mm):0;
  const rOut=pos(v.outlet_diameter_mm)/2||Math.max(150,round(R*0.05));
  if(!zb){zb=Math.max(300,round(z0-(R-rOut)*Math.tan(25*Math.PI/180)));assumed.push("низ конуса не найден — принят условно (уклон 25°)")}
  const slope=(z0-zb)/(R-rOut),rAt=z=>rOut+(z-zb)/slope;
  // Parts with their own levels keep them; the rest share the cone by height (the lower ones are the short ones).
  const free=cone.filter(p=>!(Number(p.z1_mm)>Number(p.z0_mm))),w=free.map(p=>order(p)>=2?0.1:1),sum=w.reduce((a,b)=>a+b,0)||1;
  if(free.length>1)assumed.push("отметки частей конуса на листах не даны — конус поделён между ними условно");
  let top=z0;
  cone.forEach(p=>{
   let a,b;
   if(Number(p.z1_mm)>Number(p.z0_mm)){a=Number(p.z0_mm);b=Number(p.z1_mm)}
   else{const i=free.indexOf(p),dz=(z0-zb)*w[i]/sum;b=top;a=i===free.length-1?zb:round(top-dz);top=a}
   const rb=pos(p.radius_mm)&&!(Number(p.z1_mm)>Number(p.z0_mm))?pos(p.radius_mm):round(rAt(a)),rt=round(rAt(b)),cnt=Math.max(1,p.count||1);
   for(let j=0;j<cnt;j++)add(p,{geometry_type:"shell",x_mm:C,y_mm:C,radius_mm:Math.max(50,rb),inner_radius_mm:Math.max(rb+10,rt),z0_mm:a,z1_mm:b,
    ...(cnt>1?{sector_start_deg:Math.round(360/cnt*j*10)/10,sector_deg:Math.round(360/cnt*10)/10}:{})},
    ["Часть конуса"+(cnt>1?" "+(j+1)+" из "+cnt:"")+": от R"+Math.max(50,rb)+" на "+a+" до R"+Math.max(rb+10,rt)+" на "+b])
  })
 }
 // Posts on the wall circle from the ground to the wall bottom; struts from the foot of a post up to the wall
 // between it and the next one.
 const nPost=posts.reduce((a,p)=>Math.max(a,p.count||0),0)||8;
 posts.forEach((p,t)=>{
  const cnt=p.count||nPost,r=pos(p.radius_mm)||round(R),shift=t*(360/cnt)/(posts.length+1);
  for(let j=0;j<cnt;j++){const q=at(360/cnt*j+shift,r);add(p,{geometry_type:"column",x_mm:q.x,y_mm:q.y,z0_mm:Number(p.z0_mm)||0,z1_mm:Number(p.z1_mm)>Number(p.z0_mm)?Number(p.z1_mm):z0},
   ["Опора "+(j+1)+" из "+cnt+(posts.length>1?" ("+(t+1)+"-й вид стоек — проверьте, рядом ли они)":"")])}
 });
 struts.forEach((p,t)=>{
  const cnt=p.count||nPost,dir=t%2?-1:1;
  for(let j=0;j<cnt;j++){const a=at(360/cnt*j,round(R)),b=at(360/cnt*j+dir*180/cnt,round(R));
   add(p,{geometry_type:"brace",x_mm:a.x,y_mm:a.y,x2_mm:b.x,y2_mm:b.y,z0_mm:Number(p.z0_mm)||0,z1_mm:Number(p.z1_mm)>Number(p.z0_mm)?Number(p.z1_mm):z0},
    ["Подкос "+(j+1)+" из "+cnt+": от низа стойки к стенке между стойками"])}
 });
 // The toothed weir (overflow) inside along the top of the wall; rings at their level or at the top.
 for(const p of parts.filter(p=>p.role==="weir"||p.role==="ring")){
  const cnt=Math.max(1,p.count||1),r=pos(p.radius_mm)||round(R-120),zt=Number(p.z1_mm)>Number(p.z0_mm)?Number(p.z1_mm):z1,zb=Number(p.z1_mm)>Number(p.z0_mm)?Number(p.z0_mm):z1-200;
  for(let j=0;j<cnt;j++)add(p,{geometry_type:"shell",shell_open:true,x_mm:C,y_mm:C,radius_mm:r,z0_mm:zb,z1_mm:zt,...(cnt>1?{sector_start_deg:Math.round(360/cnt*j*10)/10,sector_deg:Math.round(360/cnt*10)/10}:{})},
   [(p.role==="weir"?"Зубчатое ограждение (перелив) по верху стенки":"Кольцо")+(cnt>1?", часть "+(j+1)+" из "+cnt:"")])
 }
 // Small parts of the joints: along the vertical joints of the segments, spread over the wall height.
 const details=parts.filter(p=>p.role==="detail"||p.role==="other");
 details.forEach((p,t)=>{
  // Each kind a little apart along the joint, so that they do not hide one another.
  const cnt=Math.min(120,Math.max(1,p.count||1)),joints=Math.max(1,n||nPost),per=Math.ceil(cnt/joints);
  for(let j=0;j<cnt;j++){const jt=j%joints,row=Math.floor(j/joints),q=at(360/joints*jt+(t-(details.length-1)/2)*0.8,round(R+60)),z=round(z0+h*(row+1)/(per+1));
   add(p,{geometry_type:"column",x_mm:q.x,y_mm:q.y,z0_mm:z,z1_mm:z+100},[(p.role==="detail"?"Деталь стыка сегментов":"Элемент")+" "+(j+1)+" из "+(p.count||1)+": место условное — по стыку "+(jt+1)])}
  if((p.count||0)>cnt)notes.push(p.mark+": поставлено "+cnt+" из "+p.count)
 });
 const name=v.name||"Чан";
 if(v.fromSheets)notes.push("Монтажной схемы и осей в комплекте нет: схема собрана по сборочным листам КМД на условной сетке вокруг центра чана — проверьте отметки и порядок сегментов");
 if(assumed.length)notes.push("Условно: "+assumed.join("; "));
 return{page:0,docType:"КМД сборочные",sourceName:v.fromSheets?"Сборочные листы":"Claude",
  scheme:{kind:"tank",title:name+" Ø"+round(D)+" (схема по сборочным листам)",axesX:["1","2"],axesY:["А","Б"],spansX:[round(D+2*M)],spansY:[round(D+2*M)],placements,warnings:notes}}
}
module.exports={buildVessel,vesselFromSheets,partsFromSheets,sizeFromSheets,roleOf,VESSEL};
