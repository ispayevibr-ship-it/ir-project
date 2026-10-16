"use strict";
/* Generate the small, content-addressed AI Beta hot manifest. Only explicit
 * src/ai-* JS/CSS is eligible; never ship main.js, preload.js or package files.
 * Publishing the manifest itself is done by a tested GitHub Actions workflow.
 */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const base=JSON.parse(fs.readFileSync("package.json","utf8")).version;
const serial=process.argv.includes("--version")?
 process.argv[process.argv.indexOf("--version")+1]:process.env.GITHUB_RUN_NUMBER;
if(!/^[1-9][0-9]*$/.test(String(serial||"")))throw Error("Provide positive beta hot build number");
const dir=path.join(__dirname,"..","src");
const files=fs.readdirSync(dir).filter(name=>/^ai-[a-z0-9-]+\.(?:js|css)$/.test(name))
 .sort().map(name=>{
  const source="src/"+name,data=fs.readFileSync(path.join(dir,name));
  if(data.length<1||data.length>=4*1024*1024)throw Error("Invalid hot file: "+source);
  return{source,target:source,size:data.length,
   sha256:crypto.createHash("sha256").update(data).digest("hex")}
 });
if(files.length<5||files.length>120)throw Error("Unexpected AI patch file count");
for(const required of ["src/ai-recognition-page.js","src/ai-recognition-page.css",
 "src/ai-scheme-lite-page.js"])
 if(!files.some(f=>f.target===required))throw Error("Required hot module missing: "+required);
const manifest={channel:"beta",baseVersion:base,version:base+"."+serial,
 branch:"feature/ir-project-ai-next",description:"IR Project Algorithmic KM/KMD fixes: no full EXE",
 files};
const output=path.join(__dirname,"..","hot","beta","latest.json");
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(manifest,null,2)+"\n");
console.log("AI Beta hot:",manifest.version,files.length,"files",
 Math.round(files.reduce((sum,f)=>sum+f.size,0)/1024)+"KB");
