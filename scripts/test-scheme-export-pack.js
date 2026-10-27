"use strict";
// The exported montage scheme packs its data, tables and 3D scripts (gzip, base64) and unpacks them in the page; the
// pictures and the list of elements stay plain for a viewer without scripts (the engineer, 27.10.2026: «монтажные
// схемы выгруженные слишком много весят»).
const assert=require("node:assert/strict"),fs=require("node:fs"),zlib=require("node:zlib"),vm=require("node:vm");
global.window={CompressionStream,Response,Blob,btoa:s=>Buffer.from(s,"binary").toString("base64")};global.document={scripts:[]};
global.btoa=window.btoa;
require("../src/scheme-export-html.js");
const X=window.irSchemeHtmlExport;
const el={id:"1",mark:"К1",title:"Колонна",type_name:"Колонна",profile:"I30К1",status:"planned",scheme_group:"columns",axisText:{x:"1",y:"А"},x:0,y:0,x2:0,y2:0,z0:0,z1:6000,z2:6000,geometryType:"column",
 param_sources:{position:"КМ, лист 3 · «Схема расположения колонн»".repeat(3)}};
const d={objectId:"1",object:{name:"Объект",address:""},title:"Весь каркас",axesX:["1","2"],axesY:["А","Б"],spanX:6000,spanY:6000,gridDirX:"ltr",gridDirY:"btt",gridX:{},gridY:{},
 elements:Array.from({length:400},(_,i)=>({...el,id:String(i+1),x:(i%20)*6000,y:Math.floor(i/20)*6000})),groups:[{key:"columns",label:"Колонны"}],
 summary:{total:0,mounted:0,placed:400,placedMounted:0,placedPartial:0},works:[],company:{name:"",logo:""},date:"27.10.2026",shots:[{title:"Общий вид",src:"data:image/jpeg;base64,AAAA"}]};
const libs={css:"",three:"window.THREE={};",orbit:"",types:"",view:"window.irThreeSchemeView={};",sections:[{id:"ibeam-57837-30К1",status:"confirmed",h_mm:296}],fasteners:[],jointKb:null};
(async()=>{
 const plain=X.page(d,libs);
 libs.packed=await X.gzip64(X.payload(d,libs));
 const packed=X.page(d,libs);
 // Lighter, the data no longer plain in the page, the pictures and the list of elements still there.
 assert.ok(packed.length<plain.length*.5,"packed "+packed.length+" of "+plain.length);
 assert.ok(!packed.includes('id="ir-scheme-data"')&&packed.includes('id="ir-pack"'));
 assert.ok(packed.includes('<img src="data:image/jpeg;base64,AAAA"')&&packed.includes("Элементы по видам"));
 // The pack is gzip of {data, sections, fasteners, jointKb, scripts}: three.js before the 3D module, the viewer last.
 const P=JSON.parse(zlib.gunzipSync(Buffer.from(packed.match(/id="ir-pack">([^<]*)</)[1],"base64")).toString("utf8"));
 assert.equal(P.data.elements.length,400);assert.equal(P.data.shots,undefined);
 assert.equal(P.sections[0].id,"ibeam-57837-30К1");
 assert.equal(P.scripts[0],"window.THREE={};");assert.equal(P.scripts[5],"window.irThreeSchemeView={};");
 assert.match(P.scripts[6],/^try\{\(function viewer\(\)/);
 // The viewer takes the unpacked data; the page unpacks with DecompressionStream and says so where there is none.
 assert.match(X.viewer.toString(),/var D=window\.__irSchemeData\|\|JSON\.parse/);
 const un=X.unpack.toString();
 assert.match(un,/new DecompressionStream\("gzip"\)/);assert.match(un,/W\.__irFail\("Этот браузер не открывает 3D-схему/);
 assert.match(un,/W\.irSchemeSections=P\.sections;W\.irSchemeFasteners=P\.fasteners;W\.irSchemeJointKb=P\.jointKb;W\.__irSchemeData=P\.data/);
 // Run the unpacking as a page would: the scripts are appended in order and run.
 const ran=[],page={DecompressionStream,Response,Blob,atob:s=>Buffer.from(s,"base64").toString("binary"),__irFail:e=>{throw Error(e)},
  document:{getElementById:()=>({textContent:packed.match(/id="ir-pack">([^<]*)</)[1]}),createElement:()=>({}),body:{appendChild:e=>{if(e.textContent)ran.push(e.textContent.slice(0,30))}}}};
 page.window=page;vm.createContext(page);vm.runInContext("("+un+")()",page);
 await new Promise(r=>setTimeout(r,300));
 assert.equal(page.__irSchemeData.elements.length,400);assert.equal(page.irSchemeSections.length,1);
 assert.deepEqual(ran.slice(0,2),["window.THREE={};","window.irThreeSchemeView={};"]);assert.match(ran[2],/^try\{\(function viewer/);
 // The pictures of the scheme for a viewer without scripts: 1280 × 800, JPEG 74 %.
 const view=fs.readFileSync(__dirname+"/../src/scheme-three-view.js","utf8");
 assert.match(view,/var W=1280,H=800,ratio=renderer\.getPixelRatio\(\)/);assert.match(view,/toDataURL\("image\/jpeg",\.74\)/);
 console.log("scheme export pack: ok ("+plain.length+" → "+packed.length+" bytes)");
})().catch(e=>{console.error(e);process.exit(1)});
