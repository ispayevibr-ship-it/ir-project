'use strict';
// Raw painted PDF paths, not recognised circles, axes or structural members.
// Control points stay exact in viewport coordinates: no curve-to-line guessing.
const MAX_COMMANDS=30000,MAX_CONTOURS=6000,MAX_OPERATORS=180000;
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e9;
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
 a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
 a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function extractContours(list,OPS,viewport){
 const contours=[],stack=[];
 let matrix=[1,0,0,1,0,0],commands=[],current=null,start=null,
  count=0,incomplete=false,pathInvalid=false,clipped=false,operatorIndex=0;
 const stroke=new Set([OPS.stroke,OPS.closeStroke,OPS.fillStroke,OPS.eoFillStroke,
  OPS.closeFillStroke,OPS.closeEOFillStroke].filter(Number.isInteger));
 const fill=new Set([OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,
  OPS.closeFillStroke,OPS.closeEOFillStroke].filter(Number.isInteger));
 const close=new Set([OPS.closeStroke,OPS.closeFillStroke,OPS.closeEOFillStroke].filter(Number.isInteger));
 function point(x,y){
  const m=mul(viewport.transform,matrix),p=[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  if(!p.every(finite)){pathInvalid=true;incomplete=true;return null}return p
 }
 function add(kind,points=[]){
  if(points.some(p=>!p)){pathInvalid=true;return}
  if(count>=MAX_COMMANDS){incomplete=true;pathInvalid=true;return}
  commands.push({kind,points});count++;
 }
 function move(p){add('M',[p]);current=start=p}
 function line(p){if(!current){pathInvalid=true;return}add('L',[p]);current=p}
 function curve(points){if(!current){pathInvalid=true;return}add(points.length===3?'C':'Q',points);current=points.at(-1)}
 function closing(){if(current&&start){add('Z');current=start}}
 function clear(){commands=[];current=start=null;pathInvalid=false}
 function paint(op){
  if(close.has(op))closing();
  if(commands.length&&!pathInvalid&&(stroke.has(op)||fill.has(op))){
   if(contours.length>=MAX_CONTOURS)incomplete=true;
   else contours.push({operatorIndex,stroke:stroke.has(op),fill:fill.has(op),
    fillRule:[OPS.eoFill,OPS.eoFillStroke,OPS.closeEOFillStroke].includes(op)?'evenodd':'nonzero',
    clipUnresolved:clipped,commands});
  }
  clear()
 }
 function decode(ops,coords,packed){
  let i=0,j=0;
  while(packed?i<coords.length:j<ops.length){
   if(count>=MAX_COMMANDS){incomplete=true;pathInvalid=true;break}
   const code=packed?coords[i++]:ops[j++];
   let n;
   if(code===(packed?0:OPS.moveTo)||code===(packed?1:OPS.lineTo))n=2;
   else if(code===(packed?2:OPS.curveTo))n=6;
   else if(packed&&code===3||!packed&&[OPS.curveTo2,OPS.curveTo3,OPS.rectangle].includes(code))n=4;
   else if(code===(packed?4:OPS.closePath)){closing();continue}
   else{incomplete=true;pathInvalid=true;break}
   const v=Array.from(coords.slice(i,i+n));i+=n;
   if(v.length!==n||!v.every(finite)){incomplete=true;pathInvalid=true;break}
   if(code===(packed?0:OPS.moveTo))move(point(...v));
   else if(code===(packed?1:OPS.lineTo))line(point(...v));
   else if(!packed&&code===OPS.rectangle){
    const [x,y,w,h]=v;move(point(x,y));line(point(x+w,y));line(point(x+w,y+h));line(point(x,y+h));closing()
   }else if(!packed&&code===OPS.curveTo2)curve([current,point(v[0],v[1]),point(v[2],v[3])]);
   else if(!packed&&code===OPS.curveTo3)curve([point(v[0],v[1]),point(v[2],v[3]),point(v[2],v[3])]);
   else curve(Array.from({length:n/2},(_,k)=>point(v[k*2],v[k*2+1])));
  }
 }
 for(let k=0;k<Math.min(list.fnArray.length,MAX_OPERATORS);k++){
  operatorIndex=k;const op=list.fnArray[k],args=list.argsArray[k];
  if(op===OPS.save)stack.push({matrix:matrix.slice(),clipped});
  else if(op===OPS.restore){const state=stack.pop();if(state){matrix=state.matrix;clipped=state.clipped}}
  else if(op===OPS.transform){if(args?.length===6&&Array.from(args).every(finite))matrix=mul(matrix,args);else incomplete=true}
  else if(op===OPS.clip||op===OPS.eoClip)clipped=true;
  else if(op===OPS.constructPath){
   if(Number.isInteger(args?.[0])&&args[1]?.[0]?.length!==undefined){
    decode(null,args[1][0],true);paint(args[0]);
   }else if(args?.[0]?.length!==undefined&&args[1]?.length!==undefined)decode(args[0],args[1],false);
   else{incomplete=true;clear()}
  }else if(stroke.has(op)||fill.has(op))paint(op);
  else if(op===OPS.endPath)clear();
 }
 if(list.fnArray.length>MAX_OPERATORS)incomplete=true;
 return{contours,contourStats:{stored:contours.length,commands:count,incomplete,
  maxContours:MAX_CONTOURS,maxCommands:MAX_COMMANDS},coordinateSystem:'viewport_points_top_left'};
}
module.exports={extractContours};
