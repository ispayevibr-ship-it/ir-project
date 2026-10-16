"use strict";
const assert=require("node:assert/strict");
const {createPage}=require("../src/ai-scheme-lite-page");
const SHA="f".repeat(64);
const doc={id:22,name:"План колонн.pdf",kind:"КМ",sha256:SHA,exists:true};
const index={id:23,documentId:22,sourceSha256:SHA,
 pages:[{page:1,hasTextLayer:true,uncertainEncoding:false}]};
const wait=async check=>{
 for(let i=0;i<100;i++){
  if(check())return;
  await new Promise(resolve=>setImmediate(resolve))
 }
 throw Error("UI geometry button never completed")
};
(async()=>{
 const scan={onclick:null,disabled:false},pageButton={onclick:null,dataset:{liteVectorPage:"0"}},
  geometryNode={textContent:"",innerHTML:"",dataset:{},scrollIntoView(){}},
  slot={innerHTML:"",
   querySelectorAll:selector=>{
    if(selector==="[data-lite-vector-page]"&&slot.innerHTML.includes('data-lite-vector-page="0"'))
     return[pageButton];
    return []
   },
   querySelector:selector=>selector==="[data-lite-vector-result]"?geometryNode:null
  },status={textContent:""},root={
   innerHTML:"",
   querySelector:selector=>({
    "[data-lite-results]":slot,"[data-lite-scan]":scan,
    "[data-lite-scheme]":{},"[data-lite-status]":status
   })[selector]||null
  };
 let calls=0,placements=0;
 const geometry={page:async(id,docId,page)=>{
  assert.equal(id,7);assert.equal(docId,22);assert.equal(page,1);calls++;
  return{objectId:7,documentId:22,page:1,sourceSha256:SHA,
   widthPt:300,heightPt:200,segments:[{x1:10,y1:50,x2:110,y2:50,
    direction:"horizontal",lengthPt:100}],
   stats:{storedSegments:1,truncated:false,horizontal:1,vertical:0,diagonal:0}}
 }};
 const sections={section:name=>({
  marks:{list:async()=>[]},scheme:{list:async()=>[]},
  "work-types":{list:async()=>[]}
 })[name]};
 const pdf={page:async()=>({source:{documentId:22,sha256:SHA},
  page:{text:"Колонна К62"}})};
 const page=createPage();
 await page.render(root,{objectId:7,documents:[doc],indexes:[index],
  canEdit:false,root:sections,pdf,geometry});
 scan.onclick();
 await wait(()=>slot.innerHTML.includes('data-lite-vector-page="0"'));
 assert.equal(typeof pageButton.onclick,"function");
 pageButton.onclick();
 await wait(()=>geometryNode.innerHTML.includes("Векторные линии PDF"));
 assert(geometryNode.innerHTML.includes('viewBox="0 0 300 200"'));
 assert(geometryNode.innerHTML.includes('x2="110"'));
 assert.match(geometryNode.innerHTML,/НЕ в миллиметрах здания/);
 assert.equal(calls,1);
 pageButton.onclick();
 await wait(()=>geometryNode.innerHTML.includes("Векторные линии PDF"));
 assert.equal(calls,1,"vector layer should be cached only for this page and SHA");
 assert.equal(placements,0,"vector analysis cannot place steel");
 page.dispose();
 console.log("Geometry UI: read-only per-sheet vector preview, SHA and caching PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
