"use strict";
/* IR Project AI: deterministic, bounded PDF.js vector-path reader.
 * Output coordinates are IN PAGE VIEWPORT POINTS (top-left origin).
 * Vector strokes are graphic evidence only, never inferred building axes,
 * dimensions or precise X/Y/Z placements. */
const MAX_OPERATORS=180000,MAX_PATH_COMMANDS=350000,MAX_SEGMENTS=2400;
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<1e9;
const rounded=n=>Math.round(n*100)/100;
const multiply=(a,b)=>[
 a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
 a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
 a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]
];
const xy=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
function extractSegments(operatorList,OPS,viewport,{minLengthPt=12}={}){
 if(!Array.isArray(operatorList?.fnArray)||!Array.isArray(operatorList?.argsArray)||
  !Array.isArray(viewport?.transform)||viewport.transform.length!==6||
  !finite(viewport.width)||!finite(viewport.height)||
  viewport.width<=0||viewport.height<=0)
  throw Error("Некорректный список операций или размер страницы PDF");
 if(operatorList.fnArray.length!==operatorList.argsArray.length)
  throw Error("PDF операторов и аргументов разное количество");
 const stats={operatorCount:operatorList.fnArray.length,pathCommands:0,
  examinedSegments:0,storedSegments:0,truncated:false,skippedCurves:0,
  horizontal:0,vertical:0,diagonal:0,ignoredPaints:0};
 const segments=[],seen=new Set(),stack=[];
 // Extract dashed/fragmented axis evidence in parallel with the limited
 // longest-strokes preview, using bounded page-point histograms.
 const bandBins={horizontal:new Map(),vertical:new Map()};
 let bandIncomplete=false;
 function aggregate(direction,pos,lo,hi,length){
  if(length<2)return;
  const map=bandBins[direction],key=Math.round(pos);
  let band=map.get(key);
  if(!band){
   if(bandBins.horizontal.size+bandBins.vertical.size>=12000){
    bandIncomplete=true;return
   }
   band={pos:key,lo,hi,count:0,support:0};
   map.set(key,band)
  }
  band.lo=Math.min(lo,band.lo);band.hi=Math.max(hi,band.hi);
  band.count++;band.support+=length
 }
 // A heavy KMD page may contain tens of thousands of decorative strokes.
 // Keep the longest 2400 using a min-heap rather than the FIRST 2400,
 // so drawing order cannot hide long structural grid lines.
 const swap=(a,b)=>{const t=segments[a];segments[a]=segments[b];segments[b]=t};
 function heapUp(i){
  while(i>0){const p=(i-1)>>1;if(segments[p].lengthPt<=segments[i].lengthPt)break;
   swap(p,i);i=p}
 }
 function heapDown(i){
  for(;;){
   const l=i*2+1,r=l+1;
   if(l>=segments.length)break;
   let m=l;
   if(r<segments.length&&segments[r].lengthPt<segments[l].lengthPt)m=r;
   if(segments[i].lengthPt<=segments[m].lengthPt)break;
   swap(i,m);i=m
  }
 }
 let matrix=[1,0,0,1,0,0],path=[];
 const strokeOps=new Set([OPS.stroke,OPS.closeStroke,OPS.fillStroke,
  OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].filter(Number.isInteger));
 const clearOps=new Set([OPS.fill,OPS.eoFill,OPS.endPath,
  OPS.clip,OPS.eoClip].filter(Number.isInteger));
 const toPage=(x,y)=>{
  const v=xy(viewport.transform,...xy(matrix,x,y));
  return v.every(finite)?v:null
 };
 const store=(entry)=>{
  stats.examinedSegments++;
  const [x1,y1,x2,y2]=entry;
  if(!entry.every(finite))return;
  const len=Math.hypot(x2-x1,y2-y1);
  if(len<2||len>Math.max(viewport.width,viewport.height)*4)return;
  if(Math.min(x1,x2)<-10||Math.min(y1,y2)<-10||
   Math.max(x1,x2)>viewport.width+10||Math.max(y1,y2)>viewport.height+10)return;
  const direction=Math.abs(y2-y1)<=1?"horizontal":
   Math.abs(x2-x1)<=1?"vertical":"diagonal";
  if(direction==="vertical")aggregate(direction,(x1+x2)/2,Math.min(y1,y2),Math.max(y1,y2),len);
  if(direction==="horizontal")aggregate(direction,(y1+y2)/2,Math.min(x1,x2),Math.max(x1,x2),len);
  if(len<minLengthPt)return;
  const q=entry.map(rounded);
  const first=q.slice(0,2),second=q.slice(2);
  const signature=[...((first[0]<second[0]||(first[0]===second[0]&&first[1]<=second[1]))?
   [...first,...second]:[...second,...first])].join(":");
  if(seen.has(signature))return;
  const item={x1:q[0],y1:q[1],x2:q[2],y2:q[3],
   lengthPt:rounded(len),direction,signature};
  if(segments.length>=MAX_SEGMENTS){
   stats.truncated=true;
   if(item.lengthPt<=segments[0].lengthPt)return;
   seen.delete(segments[0].signature);segments[0]=item;heapDown(0)
  }else{segments.push(item);heapUp(segments.length-1)}
  seen.add(signature)
 };
 function pathOps(args){
  if(!Array.isArray(args)||args.length<2)return;
  const ops=args[0],coords=args[1];
  if(!ops||!coords||!Number.isFinite(ops.length)||!Number.isFinite(coords.length))return;
  let j=0,current=null,begin=null;
  const move=(x,y)=>{const point=toPage(x,y);current=point;begin=point};
  const line=(x,y)=>{
   const point=toPage(x,y);
   if(point&&current)path.push([...current,...point]);
   current=point
  };
  const param=n=>{
   if(j+n>coords.length)return null;
   const v=Array.from(coords.slice(j,j+n));j+=n;
   return v.every(finite)?v:null
  };
  for(let k=0;k<ops.length;k++){
   stats.pathCommands++;
   if(stats.pathCommands>MAX_PATH_COMMANDS){stats.truncated=true;bandIncomplete=true;return}
   const op=ops[k];
   if(op===OPS.moveTo){const v=param(2);if(!v)break;move(...v)}
   else if(op===OPS.lineTo){const v=param(2);if(!v)break;line(...v)}
   else if(op===OPS.rectangle){
    const v=param(4);if(!v)break;
    const [x,y,w,h]=v;move(x,y);line(x+w,y);line(x+w,y+h);line(x,y+h);
    if(current&&begin)path.push([...current,...begin]);
    current=begin
   }else if(op===OPS.closePath){
    if(current&&begin)path.push([...current,...begin]);
    current=begin
   }else if(op===OPS.curveTo||op===OPS.curveTo2||op===OPS.curveTo3){
    // A curve is not a straight building member. Retain its endpoint only
    // to avoid fabricating a straight segment across the curve.
    const count=op===OPS.curveTo?6:4,v=param(count);
    if(!v)break;stats.skippedCurves++;
    current=toPage(v[v.length-2],v[v.length-1])
   }else{stats.truncated=true;bandIncomplete=true;break}
  }
 }
 /* pdfjs-dist >= 5 uses packed DrawOPS inside a single constructPath:
  * [paintOperator, [Float32Array(0,x,y,1,x,y,...,4)], bbox].
  * Unlike v4, the paint op is embedded in constructPath. */
 function packedPath(args){
  const op=args?.[0],holder=args?.[1],data=holder?.[0];
  if(!Number.isInteger(op)||!data||typeof data.length!=="number")return false;
  // Packed drawing opcodes from pdf.js/shared/util.js v6.4.299:
  // moveTo=0, lineTo=1, curveTo=2, quadraticCurveTo=3, closePath=4.
  let i=0,current=null,begin=null;
  const read=n=>{
   if(i+n>data.length)return null;
   const values=Array.from(data.slice(i,i+n));i+=n;
   return values.every(finite)?values:null
  };
  const move=(x,y)=>{current=toPage(x,y);begin=current};
  const line=(x,y)=>{
   const next=toPage(x,y);
   if(next&&current)path.push([...current,...next]);
   current=next
  };
  while(i<data.length){
   stats.pathCommands++;
   if(stats.pathCommands>MAX_PATH_COMMANDS||path.length>10000){
    stats.truncated=true;bandIncomplete=true;path=[];return true
   }
   const kind=data[i++];
   if(kind===0){const p=read(2);if(!p)break;move(...p)}
   else if(kind===1){const p=read(2);if(!p)break;line(...p)}
   else if(kind===2){const p=read(6);if(!p)break;
    stats.skippedCurves++;current=toPage(p[4],p[5])}
   else if(kind===3){const p=read(4);if(!p)break;
    stats.skippedCurves++;current=toPage(p[2],p[3])}
   else if(kind===4){
    if(current&&begin)path.push([...current,...begin]);
    current=begin
   }else{stats.truncated=true;bandIncomplete=true;break}
  }
  if(strokeOps.has(op))for(const entry of path)store(entry);
  else stats.ignoredPaints++;
  path=[];
  return true
 }
 const max=Math.min(operatorList.fnArray.length,MAX_OPERATORS);
 for(let i=0;i<max;i++){
  const op=operatorList.fnArray[i],args=operatorList.argsArray[i];
  if(op===OPS.save){stack.push(matrix.slice())}
  else if(op===OPS.restore){matrix=stack.pop()||[1,0,0,1,0,0];path=[]}
  else if(op===OPS.transform){
   if(Array.isArray(args)&&args.length===6&&args.every(finite))
    matrix=multiply(matrix,args)
  }else if(op===OPS.constructPath){
   if(!packedPath(args))pathOps(args)
  }
  else if(strokeOps.has(op)){
   for(const seg of path)store(seg);
   path=[]
  }else if(clearOps.has(op)){
   // PDF clipping operations only change a clip mask; they do not paint.
   if(op===OPS.fill||op===OPS.eoFill||op===OPS.endPath)path=[];
  }
 }
 if(operatorList.fnArray.length>MAX_OPERATORS){
  stats.truncated=true;bandIncomplete=true
 }
 const axisBands={vertical:[],horizontal:[]};
 for(const direction of ["vertical","horizontal"]){
  for(const band of bandBins[direction].values()){
   const span=band.hi-band.lo;
   if(span<90||band.count<5||band.support<Math.max(35,span*.16))continue;
   const p=band.pos;
   axisBands[direction].push(direction==="vertical"?
    {x1:p,x2:p,y1:rounded(band.lo),y2:rounded(band.hi),direction,
     sampleCount:band.count,supportLengthPt:rounded(band.support),
     source:"aligned_stroke_evidence"}:
    {x1:rounded(band.lo),x2:rounded(band.hi),y1:p,y2:p,direction,
     sampleCount:band.count,supportLengthPt:rounded(band.support),
     source:"aligned_stroke_evidence"})
  }
  axisBands[direction].sort((a,b)=>b.supportLengthPt-a.supportLengthPt);
  // An A1 KMD plan commonly has 1200+ horizontal stroke bands.
  // Bounded 2500 bands per direction retain real grid evidence.
  if(axisBands[direction].length>2500){
   axisBands[direction].length=2500;bandIncomplete=true
  }
 }
 stats.axisEvidenceComplete=!bandIncomplete;
 stats.axisBandCount=axisBands.vertical.length+axisBands.horizontal.length;
 stats.storedSegments=segments.length;
 for(const item of segments)stats[item.direction]++;
 segments.sort((a,b)=>b.lengthPt-a.lengthPt);
 for(const item of segments)delete item.signature;
 return{segments,axisBands,stats,coordinateSystem:"viewport_points_top_left",
  widthPt:rounded(viewport.width),heightPt:rounded(viewport.height),
  note:"Векторные штрихи PDF, не оси и не подтверждённые координаты монтажа"}
}
module.exports={extractSegments,multiply};
