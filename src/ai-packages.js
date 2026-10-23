"use strict";
/*
 * IR Project AI: installed packages for modules that arrive with a hot update. Those modules live in
 * userData/app-updates/current, outside the app's node_modules; main.js lists the installed folder in NODE_PATH.
 * Worker threads in Electron do not apply NODE_PATH, so the main process resolves the exact files and passes them on.
 */
const path=require("node:path");
function resolvePackage(spec){
 try{return require.resolve(spec)}catch(error){
  for(const dir of String(process.env.NODE_PATH||"").split(path.delimiter).filter(Boolean)){
   try{return require.resolve(path.join(dir,spec))}catch{}
  }
  throw error
 }
}
// Inside the installed app packages sit in app.asar; Tesseract starts its own worker from a script file,
// so it is shipped unpacked (package.json build.asarUnpack) and loaded from there.
const unpacked=file=>file.replace(/app\.asar([\\/])/,"app.asar.unpacked$1");
// Files the PDF workers load: PDF.js (ES module), the native canvas and the local text recognition.
function workerPackages(){
 const out={};
 for(const [key,spec] of [["pdfjs","pdfjs-dist/legacy/build/pdf.mjs"],["canvas","@napi-rs/canvas"]]){
  try{out[key]=resolvePackage(spec)}catch{}
 }
 // The decoders packed inside app.asar are copied out once by the main process (its fs reads the archive), so that a
 // worker reads plain files whatever its own fs can do.
 try{
  const fs=require("node:fs"),dir=pdfWasm(out);
  if(dir&&/app\.asar\//.test(dir)){
   const to=path.join(require("node:os").tmpdir(),"ir-project-pdfjs-wasm");fs.mkdirSync(to,{recursive:true});
   for(const f of fs.readdirSync(dir).filter(f=>/\.(wasm|js)$/.test(f))){const a=path.join(dir,f),b=path.join(to,f);
    if(!fs.existsSync(b)||fs.statSync(b).size!==fs.statSync(a).size)fs.writeFileSync(b,fs.readFileSync(a))}
   out.wasm=to.replace(/\\/g,"/").replace(/\/?$/,"/")
  }else if(dir)out.wasm=dir
 }catch{}
 try{
  out.ocr={tesseract:unpacked(resolvePackage("tesseract.js")),
   langPath:path.join(path.dirname(unpacked(resolvePackage("@tesseract.js-data/rus/package.json"))),"4.0.0_best_int")}
 }catch{}
 return out
}
// In a worker: the path given by the main process, otherwise the usual lookup.
async function importPdfjs(packages){
 const file=packages?.pdfjs||resolvePackage("pdfjs-dist/legacy/build/pdf.mjs");
 return import(require("node:url").pathToFileURL(file).href)
}
// Decoders PDF.js loads as WebAssembly: scanned sheets are JBIG2 / CCITT images, JPEG 2000 too — without them the page
// renders blank and OCR reads nothing. The folder depends on the PDF.js build (npm package or the release archive).
function pdfWasm(packages){
 if(packages?.wasm)return packages.wasm;
 try{
  const fs=require("node:fs"),file=packages?.pdfjs||resolvePackage("pdfjs-dist/legacy/build/pdf.mjs"),root=path.resolve(path.dirname(file),"..","..");
  for(const dir of [path.join(root,"wasm"),path.join(root,"legacy","web","wasm"),path.join(root,"web","wasm")].flatMap(d=>[unpacked(d),d]))
   // PDF.js wants the folder ending in "/" (a Windows "\" is refused: "Invalid factory url … must include trailing
   // slash"); Node reads "C:/…/wasm/jbig2.wasm" with forward slashes as well.
   if(fs.existsSync(path.join(dir,"jbig2.wasm")))return dir.replace(/\\/g,"/").replace(/\/?$/,"/")
 }catch{}
 return undefined
}
function requireCanvas(packages){return require(packages?.canvas||resolvePackage("@napi-rs/canvas"))}
module.exports={resolvePackage,workerPackages,importPdfjs,requireCanvas,pdfWasm};
