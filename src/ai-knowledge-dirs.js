"use strict";
/*
 * IR Project AI: where the knowledge of the program lies.
 *  - knowledge/ next to src/ — comes with the update from the open repository: general standards (knowledge/global),
 *    the address of the chat;
 *  - userData/knowledge-data/ — the data of the drawings (sets, projects, rules, lessons, the journal of the chat),
 *    pulled from the closed repository with the program's GitHub key (pullData in src/ai-github-sync.js).
 * A file of the closed repository goes before the same file of the update; sets of both are read.
 */
const fs=require("node:fs"),path=require("node:path");
const APP=path.join(__dirname,"..","knowledge");
let dataDir=null;
function setDataDir(dir){dataDir=dir?String(dir):null}
// The folders to read, the closed one first.
function dirs(sub=""){return[dataDir&&path.join(dataDir,sub),path.join(APP,sub)].filter(Boolean)}
// One file: from the closed repository when it came, else from the update.
function file(rel){for(const d of dirs()){const f=path.join(d,rel);if(fs.existsSync(f))return f}return path.join(APP,rel)}
module.exports={APP,setDataDir,dirs,file,dataDir:()=>dataDir};
