"use strict";
/*
 * IR Project: the montage scheme as a USDZ file — the 3D format the iPhone and iPad open by themselves (Files, Mail,
 * messengers: rotate, zoom, put it on the table in AR). An HTML file is shown there without its scripts, so the
 * exported HTML scheme stays empty on a phone. What is drawn on the screen now goes in: the members with their colours,
 * the base plates and other details; no grid, labels or dimensions (USDZ has no text).
 * window.irSchemeUsdz.build({root,material}) → Uint8Array; root — the Three.js group of the members (scheme-three-view
 * model()), material(mesh) — the material it is shown with when not selected.
 * The layout follows the Three.js USDZExporter (MIT), which opens on iOS: one model.usda with an Xform per mesh that
 * references its geometry from geometries/*.usda, all stored without compression and aligned to 64 bytes.
 */
(function(root){
 var utf8=function(s){return new TextEncoder().encode(s)};
 // Numbers: 7 significant digits; points to 0.1 mm and normals to 0.001 (the model is in metres) keep the file small.
 var n=function(v,fixed){var x=Number(v);if(!Number.isFinite(x)||Math.abs(x)<1e-9)return"0";return String(Number(fixed?x.toFixed(fixed):x.toPrecision(7)))};
 function header(defaultPrim){
  return'#usda 1.0\n(\n    customLayerData = {\n        string creator = "IR Project"\n    }\n'+(defaultPrim?'    defaultPrim = "'+defaultPrim+'"\n':"")+
   '    metersPerUnit = 1\n    upAxis = "Y"\n)\n\n'
 }
 function vectors(attr,fixed){
  var out=new Array(attr.count);
  for(var i=0;i<attr.count;i++)out[i]="("+n(attr.getX(i),fixed)+", "+n(attr.getY(i),fixed)+", "+n(attr.getZ(i),fixed)+")";
  return out.join(", ")
 }
 // One mesh of three.js as its own layer: triangles, points, normals by vertex; both faces drawn (open shells, plates).
 function geometryLayer(geometry){
  var g=geometry.attributes.normal?geometry:geometry.clone();if(!g.attributes.normal)g.computeVertexNormals();
  var pos=g.attributes.position,index=g.index,count=index?index.count:pos.count,ids=new Array(count),faces=new Array(Math.floor(count/3));
  for(var i=0;i<count;i++)ids[i]=index?index.getX(i):i;
  for(var f=0;f<faces.length;f++)faces[f]=3;
  return header("Geometry")+'def "Geometry"\n{\n    def Mesh "Geometry"\n    {\n'+
   '        int[] faceVertexCounts = ['+faces.join(", ")+']\n'+
   '        int[] faceVertexIndices = ['+ids.slice(0,faces.length*3).join(", ")+']\n'+
   '        normal3f[] normals = ['+vectors(g.attributes.normal,3)+'] (\n            interpolation = "vertex"\n        )\n'+
   '        point3f[] points = ['+vectors(pos,4)+']\n'+
   '        uniform bool doubleSided = 1\n        uniform token subdivisionScheme = "none"\n    }\n}\n'
 }
 var color=function(c){return"("+n(c.r)+", "+n(c.g)+", "+n(c.b)+")"};
 function material(name,m){
  var pad="            ",inputs=[pad+"color3f inputs:diffuseColor = "+color(m.color||{r:.6,g:.6,b:.6})];
  if(m.emissive&&m.emissive.getHex&&m.emissive.getHex()>0)inputs.push(pad+"color3f inputs:emissiveColor = "+color(m.emissive));
  inputs.push(pad+"float inputs:roughness = "+n(m.roughness==null?.6:m.roughness),pad+"float inputs:metallic = "+n(m.metalness||0),
   pad+"float inputs:opacity = "+n(m.transparent?m.opacity:1));
  return'        def Material "'+name+'"\n        {\n            def Shader "PreviewSurface"\n            {\n                uniform token info:id = "UsdPreviewSurface"\n'+
   inputs.map(function(s){return"    "+s}).join("\n")+'\n                int inputs:useSpecularWorkflow = 0\n                token outputs:surface\n            }\n\n'+
   '            token outputs:surface.connect = </Root/Materials/'+name+'/PreviewSurface.outputs:surface>\n        }\n'
 }
 // three.js keeps a matrix by columns; USD writes rows of the transposed one — the same numbers in the same order.
 function matrix(e){var r=function(o){return"("+n(e[o])+", "+n(e[o+1])+", "+n(e[o+2])+", "+n(e[o+3])+")"};return"( "+r(0)+", "+r(4)+", "+r(8)+", "+r(12)+" )"}
 function layers(model){
  var files=[{name:"model.usda",text:null}],geos=new Map(),mats=new Map(),xforms=[];
  var top=model.root;top.updateMatrixWorld(true);
  top.traverseVisible(function(o){
   if(!o.isMesh||o.isInstancedMesh||!o.geometry||!o.geometry.attributes||!o.geometry.attributes.position)return;
   var m=(model.material?model.material(o):null)||o.material;if(Array.isArray(m))m=m[0];if(!m||m.visible===false)return;
   var g=geos.get(o.geometry);
   if(!g){g="geometries/Geometry_"+geos.size+".usda";geos.set(o.geometry,g);files.push({name:g,text:geometryLayer(o.geometry)})}
   var mat=mats.get(m);if(!mat){mat="Material_"+mats.size;mats.set(m,mat)}
   xforms.push('    def Xform "Object_'+xforms.length+'" (\n        prepend references = @./'+g+'@</Geometry>\n        prepend apiSchemas = ["MaterialBindingAPI"]\n    )\n    {\n'+
    '        matrix4d xformOp:transform = '+matrix(o.matrixWorld.elements)+'\n        uniform token[] xformOpOrder = ["xformOp:transform"]\n\n'+
    '        rel material:binding = </Root/Materials/'+mat+'>\n    }\n\n')
  });
  if(!xforms.length)return null;
  var materials=[];mats.forEach(function(name,m){materials.push(material(name,m))});
  files[0].text=header("Root")+'def Xform "Root"\n{\n'+xforms.join("")+'    def Scope "Materials"\n    {\n'+materials.join("\n")+'    }\n}\n';
  return files
 }
 var CRC=(function(){var t=new Uint32Array(256);for(var i=0;i<256;i++){var c=i;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[i]=c>>>0}return t})();
 function crc32(u){var c=0xFFFFFFFF;for(var i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}
 // A zip without compression whose every file starts at a multiple of 64 bytes (the USDZ rule): the gap is an extra field.
 function zip(files){
  var parts=[],central=[],offset=0;
  files.forEach(function(f){
   var name=utf8(f.name),data=utf8(f.text),crc=crc32(data),head=30+name.length,extra=(64-(offset+head)%64)%64;
   if(extra&&extra<4)extra+=64;
   var h=new DataView(new ArrayBuffer(head+extra));
   [[0,0x04034b50,4],[4,20,2],[6,0,2],[8,0,2],[10,0,2],[12,0x21,2],[14,crc,4],[18,data.length,4],[22,data.length,4],[26,name.length,2],[28,extra,2]]
    .forEach(function(v){v[2]===4?h.setUint32(v[0],v[1],true):h.setUint16(v[0],v[1],true)});
   var hb=new Uint8Array(h.buffer);hb.set(name,30);
   if(extra){h.setUint16(30+name.length,0x1986,true);h.setUint16(32+name.length,extra-4,true)}
   var c=new DataView(new ArrayBuffer(46+name.length));
   [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0,2],[10,0,2],[12,0,2],[14,0x21,2],[16,crc,4],[20,data.length,4],[24,data.length,4],[28,name.length,2],[30,0,2],[32,0,2],
    [34,0,2],[36,0,2],[38,0,4],[42,offset,4]].forEach(function(v){v[2]===4?c.setUint32(v[0],v[1],true):c.setUint16(v[0],v[1],true)});
   var cb=new Uint8Array(c.buffer);cb.set(name,46);central.push(cb);
   parts.push(hb,data);offset+=hb.length+data.length
  });
  var size=central.reduce(function(a,b){return a+b.length},0),end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,size,true);end.setUint32(16,offset,true);
  var all=parts.concat(central,[new Uint8Array(end.buffer)]),out=new Uint8Array(offset+size+22),at=0;
  all.forEach(function(p){out.set(p,at);at+=p.length});
  return out
 }
 function build(model){var files=model&&model.root?layers(model):null;return files?zip(files):null}
 var api={build:build,layers:layers,zip:zip,crc32:crc32};
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.irSchemeUsdz=api;
})(typeof window!=="undefined"?window:null);
