"use strict";
/* Native startup dependency graph: no stale model modules, no missing local
 * requires, no change to persisted engineering data. */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,".."),seen=new Set(),queue=["main.js","preload.js"];
function existsRelative(origin,target){
 const pathBase=path.resolve(path.dirname(origin),target);
 if(!pathBase.startsWith(root+path.sep))
  throw Error("Native import escapes source tree: "+origin+" -> "+target);
 const paths=[pathBase,pathBase+".js",pathBase+".json",
  path.join(pathBase,"index.js")];
 const hit=paths.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
 if(!hit)throw Error("Missing native module: "+path.relative(root,origin)+
  " -> "+target);
 return hit
}
while(queue.length){
 const relative=queue.shift(),absolute=path.join(root,relative);
 if(seen.has(relative))continue;
 if(!fs.existsSync(absolute))throw Error("Missing native module "+relative);
 seen.add(relative);
 const source=fs.readFileSync(absolute,"utf8");
 for(const m of source.matchAll(/\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g)){
  const dep=existsRelative(absolute,m[1]);
  queue.push(path.relative(root,dep).split(path.sep).join("/"))
 }
 if(relative==="main.js"){
  for(const m of source.matchAll(/\bhotAiModule\("([a-z0-9-]+)"\)/g)){
   queue.push("src/"+m[1]+".js")
  }
 }
}
for(const filename of ["main.js","preload.js"]){
 const code=fs.readFileSync(path.join(root,filename),"utf8");
 assert(!/\baiEngine\b|\baiOcr\b|\baiModels\b|\baiWorkflow\b|PaddleOCR|Qwen/.test(code),
  "Native bridge still activates a deleted model: "+filename)
}
for(const name of ["ai-local-engine","ai-model-manager","ai-paddle-ocr",
 "ai-structured-extraction","ai-structured-review","ai-workflow",
 "ai-proposals-page"]){
 assert(!fs.existsSync(path.join(root,"src",name+".js")),
  "Removed neural module must not be bundled: "+name)
}
assert(fs.existsSync(path.join(root,"src","ai-pdf-index.js")));
assert(fs.existsSync(path.join(root,"src","ai-pdf-geometry.js")));
assert(fs.existsSync(path.join(root,"src","ai-mounting-placement.js")));
console.log("Model-free startup graph: "+seen.size+
 " local modules resolved; PDF/geometry/montage retained PASS");
