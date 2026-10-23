"use strict";
/* IR Project: read stroked line segments and text items of one PDF page in top-down points, page rotation applied. */
const MAX_SEGMENTS=400000,MAX_TEXTS=20000,MAX_GLYPHS=200000,GLYPH_PT=20;
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
// Text items only — fast enough to list the sheets of a large PDF.
async function readPageTexts(page,viewport=page.getViewport({scale:1})){
 const vt=viewport.transform,content=await page.getTextContent(),texts=[];
 for(const item of content.items){
  if(texts.length>=MAX_TEXTS)break;
  const str=typeof item.str==="string"?item.str.trim():"";if(!str)continue;
  const m=mul(vt,item.transform||[1,0,0,1,0,0]);
  // In y-down space an upward-reading text has a negative y direction; angle +90 means "up".
  texts.push({str:str.slice(0,200),x:m[4],y:m[5],width:Number(item.width)||0,
   size:Math.hypot(m[2],m[3])||Number(item.height)||10,angle:-Math.atan2(m[1],m[0])*180/Math.PI})
 }
 return{texts:joinProfiles(texts.map(t=>({...t,str:plainText(t.str)})).filter(t=>t.str)),widthPt:viewport.width,heightPt:viewport.height}
}
// AutoCAD sheets write profile signs with a ГОСТ symbol font whose glyphs come out as private-use characters:
// U+F056 angle, U+F058 I-beam, U+F059 channel, U+F04D box tube. A shipping mark written with a space «К 1»,
// «Рп 1», «Свк 1», «Св 4-1» is one mark; steel «С 345» and words («Лист 7», «Поз 2») are not joined.
const GLYPH={"\uf056":"∟","\uf058":"I","\uf059":"[","\uf04d":"□"};
const SPACED_MARK=/^([А-ЯЁ]{1,3}|[А-ЯЁ][а-яё]{1,2})\s+(\d{1,3}(?:\s*[-.]\s*\d{1,3})?)$/u;
const NOT_SPACED=/^(?:С|C|Поз|Ось|См|Изм|Кол|Отм|Шаг|Вид|Тип|Ряд|Лит|Ст|Бк|КМ|КЖ|АР|ТХ|Гр|Кл|Кат|Ед|Шт|Ф)$/u;
function plainText(str){
 let s=String(str).replace(/[\uf056\uf058\uf059\uf04d]/g,c=>GLYPH[c]).trim();
 const m=SPACED_MARK.exec(s);
 if(m&&!NOT_SPACED.test(m[1]))s=m[1]+m[2].replace(/\s+/g,"");
 return s
}
// A profile sign is its own text item before the size: «2» «∟» «180х11» → «2∟180х11», «I» «30Ш1» → «I30Ш1».
// The sign may come with the first size: «2» «∟ 125» «х10» → «2∟125х10».
function joinProfiles(texts){
 const sign=/^[∟I\[□](?:\s*\d{2,3})?$/u,used=new Set(),out=texts.map(t=>({...t}));
 out.forEach((a,i)=>{
  if(used.has(i)||!sign.test(a.str)||Math.abs(a.angle)>5)return;
  const sized=/\d$/.test(a.str),reach=sized?a.width+a.size*1.2:a.size*2.2;
  const line=k=>k!==i&&!used.has(k)&&Math.abs(out[k].y-a.y)<=a.size*.35&&Math.abs(out[k].angle)<=5;
  const after=out.map((b,k)=>[b,k]).filter(([b,k])=>line(k)&&b.x>=a.x&&b.x-a.x<=reach&&(sized?/^[хx×]\s*\d/u:/^\d/).test(b.str)).sort((p,q)=>p[0].x-q[0].x)[0];
  if(!after)return;
  const before=out.map((b,k)=>[b,k]).filter(([b,k])=>line(k)&&b.x<a.x&&a.x-b.x<=a.size*1.4&&/^2$/.test(b.str)).sort((p,q)=>q[0].x-p[0].x)[0];
  const start=before?before[0]:a;
  out[i]={...a,x:start.x,str:(before?"2":"")+a.str.replace(/\s+/g,"")+after[0].str.replace(/\s+/g,""),width:after[0].x+after[0].width-start.x};
  used.add(after[1]);if(before)used.add(before[1])
 });
 return out.filter((_,k)=>!used.has(k))
}
// Some CAD exports split one label into pieces: "К" + "36", "10-10 (" + "М1.2)". Pieces on one baseline
// that touch are joined when the result is a shipping mark or a section name.
const JOINED=/^(?:[А-ЯЁA-Z]{1,3}\d{1,4}(?:[-.]\d{1,3})?[а-я]?|(?:\d{1,2}|[А-ЯЁ])\s*-\s*(?:\d{1,2}|[А-ЯЁ])\s*\(\s*[А-ЯЁA-Z]?\d+(?:\.\d+)?\s*\))$/u;
function joinSplitTexts(texts){
 const out=[...texts],used=new Set();
 const order=[...texts.keys()].sort((a,b)=>texts[a].y-texts[b].y||texts[a].x-texts[b].x);
 for(const i of order){
  if(used.has(i))continue;
  const a=texts[i];if(Math.abs(a.angle)>5)continue;
  for(const j of order){
   if(j===i||used.has(j))continue;
   const b=texts[j];
   if(Math.abs(b.angle)>5||Math.abs(b.y-a.y)>Math.max(1,a.size*.12)||Math.abs(b.size-a.size)>a.size*.25)continue;
   const gap=b.x-(a.x+a.width);if(gap<-a.size*.2||gap>a.size*.45)continue;
   const str=a.str+(gap>a.size*.15?" ":"")+b.str;
   if(!JOINED.test(str.replace(/\s+/g," ").trim()))continue;
   out[i]={...a,str,width:b.x+b.width-a.x};used.add(j);break
  }
 }
 return out.filter((_,k)=>!used.has(k))
}
async function readPageGeometry(pdfjs,page){
 // The viewport transform maps PDF space to the page as it is shown: y down, /Rotate applied.
 const viewport=page.getViewport({scale:1}),vt=viewport.transform;
 const OPS=pdfjs.OPS,list=await page.getOperatorList();
 // Filled paths are glyph outlines and hatching; drawing lines are stroked.
 const stroked=new Set([OPS.stroke,OPS.closeStroke]);
 const filled=new Set([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke]);
 // Small filled shapes: letters of lettering exported as curves (OCR reads their areas later).
 const segments=[],glyphs=[],images=[];
 const images_=new Set([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat].filter(v=>v!==undefined));let ctm=[1,0,0,1,0,0];const stack=[];
 const point=(x,y)=>{const ux=ctm[0]*x+ctm[2]*y+ctm[4],uy=ctm[1]*x+ctm[3]*y+ctm[5];return{x:vt[0]*ux+vt[2]*uy+vt[4],y:vt[1]*ux+vt[3]*uy+vt[5]}};
 for(let i=0;i<list.fnArray.length&&segments.length<MAX_SEGMENTS;i++){
  const fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===OPS.save)stack.push(ctm);
  else if(fn===OPS.restore)ctm=stack.pop()||[1,0,0,1,0,0];
  else if(fn===OPS.transform)ctm=mul(ctm,args);
  // A picture pasted into the drawing (often a scanned table): its place on the sheet, for OCR.
  else if(images_.has(fn)){
   const c=[point(0,0),point(1,0),point(0,1),point(1,1)];
   const box={x0:Math.min(...c.map(p=>p.x)),y0:Math.min(...c.map(p=>p.y)),x1:Math.max(...c.map(p=>p.x)),y1:Math.max(...c.map(p=>p.y))};
   if(box.x1-box.x0>=30&&box.y1-box.y0>=20)images.push(box)
  }
  else if(fn===OPS.constructPath){
   const [paint,[data]]=args;if(!data)continue;
   if(filled.has(paint)){
    if(glyphs.length>=MAX_GLYPHS)continue;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let j=0;j<data.length;){
     const op=data[j],n=op===0||op===1?2:op===2?6:op===3?4:0;
     for(let k=0;k<n;k+=2){const p=point(data[j+1+k],data[j+2+k]);if(p.x<x0)x0=p.x;if(p.x>x1)x1=p.x;if(p.y<y0)y0=p.y;if(p.y>y1)y1=p.y}
     j+=1+n
    }
    if(x1-x0<=GLYPH_PT&&y1-y0<=GLYPH_PT&&x1>x0)glyphs.push({x0,y0,x1,y1});
    continue
   }
   if(!stroked.has(paint))continue;
   const d=Array.from(data);let start=null,last=null,startRaw=null,lastRaw=null;
   for(let j=0;j<d.length;){
    const op=d[j];
    if(op===0){start=last=point(d[j+1],d[j+2]);startRaw=lastRaw=[d[j+1],d[j+2]];j+=3}
    else if(op===1){const p=point(d[j+1],d[j+2]);if(last)segments.push({a:last,b:p});last=p;lastRaw=[d[j+1],d[j+2]];j+=3}
    // Curves become short chords: an axis bubble drawn as four arcs must still look like a ring of short segments.
    else if(op===2||op===3){
     // A quadratic curve is the cubic with control points 2/3 of the way to its one control point.
     const n=op===2?6:4,q=[d[j+1],d[j+2]],end=op===2?[d[j+5],d[j+6]]:[d[j+3],d[j+4]];
     if(last&&lastRaw){
      const c=op===2?[d[j+1],d[j+2],d[j+3],d[j+4]]:[lastRaw[0]+(q[0]-lastRaw[0])*2/3,lastRaw[1]+(q[1]-lastRaw[1])*2/3,end[0]+(q[0]-end[0])*2/3,end[1]+(q[1]-end[1])*2/3];
      let prev=last;
      for(let k=1;k<=n;k++){
       const t=k/n,u=1-t,b0=u*u*u,b1=3*u*u*t,b2=3*u*t*t,b3=t*t*t;
       const p=point(b0*lastRaw[0]+b1*c[0]+b2*c[2]+b3*end[0],b0*lastRaw[1]+b1*c[1]+b2*c[3]+b3*end[1]);
       segments.push({a:prev,b:p});prev=p
      }
      last=prev
     }else last=point(end[0],end[1]);
     lastRaw=end;j+=op===2?7:5;continue
    }
    else{if(last&&start&&(last.x!==start.x||last.y!==start.y))segments.push({a:last,b:start});last=start;lastRaw=startRaw;j+=1}
   }
  }
 }
 const {texts}=await readPageTexts(page,viewport);
 return{segments,glyphs,images,texts:joinSplitTexts(texts),widthPt:viewport.width,heightPt:viewport.height}
}
module.exports={readPageGeometry,readPageTexts,joinSplitTexts,plainText,joinProfiles};
