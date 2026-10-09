"use strict";
/*
 * IR Project startup bundle builder.
 *
 * Usage:
 *   node scripts/build-runtime.js
 *   node scripts/build-runtime.js --check
 *
 * Bundled source filenames and execution order are embedded as numbered
 * markers in src/ir-runtime.js and src/ir-styles.css.  Keep both original
 * source files and generated bundles when editing hot-update releases.
 * Do not rearrange modules without reviewing their dependencies.
 */
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const verify=process.argv.includes("--check");
function sources(bundle,expected){
 const text=fs.readFileSync(path.join(root,bundle),"utf8");
 const found=[...text.matchAll(/\/\* #(\d+): (src\/[^*\r\n]+) \*\//g)]
  .map(m=>({index:Number(m[1]),file:m[2].trim()}));
 if(found.length!==expected||found.some((x,i)=>x.index!==i+1))throw Error("Bad module order in "+bundle);
 for(const x of found)if(!fs.existsSync(path.join(root,x.file)))throw Error("Missing source: "+x.file);
 return found;
}
function build(bundle,expected,size,kind){
 const list=sources(bundle,expected);
 const groups=[];
 for(let start=0;start<list.length;start+=size){
  const parts=list.slice(start,start+size).map(({index,file})=>{
   const original=fs.readFileSync(path.join(root,file),"utf8");
   return "/* #"+index+": "+file+" */\n"+original+"\n"+(kind==="js"?";\n":"");
  });
  groups.push(parts.join("\n"));
 }
 const output=groups.join(kind==="js"?"\n;\n":"\n\n");
 if(kind==="js")new vm.Script(output,{filename:bundle});
 const target=path.join(root,bundle);
 if(verify){
  if(fs.readFileSync(target,"utf8")!==output)throw Error(bundle+" is stale. Run node scripts/build-runtime.js");
  process.stdout.write("OK "+bundle+" ("+list.length+" files)\n");
 }else{
  fs.writeFileSync(target,output,"utf8");
  process.stdout.write("Rebuilt "+bundle+" ("+list.length+" files)\n");
 }
}
build("src/ir-runtime.js",58,10,"js");
build("src/ir-styles.css",43,10,"css");
