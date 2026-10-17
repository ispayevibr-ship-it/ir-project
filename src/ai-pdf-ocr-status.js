"use strict";
/* Explicit offline OCR capability check. No network fetch, no implicit model install. */
const path=require("node:path");
const {localLanguages}=require("./ai-pdf-ocr");
function ocrStatus({languageDir,packageResolver=require.resolve}={}){
 let installed=false;
 try{packageResolver("tesseract.js");installed=true}catch{}
 const dir=typeof languageDir==="string"&&path.isAbsolute(languageDir)?languageDir:null;
 const languagesReady=dir?localLanguages(dir,["rus","eng"]):false;
 return{installed,languagesReady,ready:installed&&languagesReady,
  languageDir:dir,mode:"offline_only",languages:["rus","eng"],
  reason:!installed?"tesseract_not_installed":!languagesReady?"local_languages_missing":"ready"}
}
module.exports={ocrStatus};
