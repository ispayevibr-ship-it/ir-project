"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const code=fs.readFileSync("src/profile-ui.js","utf8");
const start=code.indexOf(" async function aboutDialog("),end=code.indexOf("\n function panel(){",start);
assert(start>=0&&end>start);
const menuSection=code.slice(code.indexOf(" function panel(){"),code.indexOf("\n function permissions(){"));
assert(menuSection.includes('id="programAboutButton"'));
assert(menuSection.includes("void aboutDialog(settingsMenu)"));
let dialog,versionRequests=0;
const dialogDocument={
 querySelector:()=>dialog?.isConnected?dialog:null,
 createElement:()=>({
  isConnected:false,innerHTML:"",setAttribute(){},className:"",
  addEventListener(name,callback){this.onClose=callback},
  showModal(){this.open=true},close(){this.open=false;this.onClose?.()},
  remove(){this.isConnected=false},
  querySelector(selector){
   if(selector===".ir-about-version")return this.versionEl||(this.versionEl={textContent:"Определяется…"});
   return {onclick:null}
  }
 }),
 body:{appendChild(el){dialog=el;el.isConnected=true}}
};
const scope={irProject:{updater:{async version(){versionRequests++;return "1.7.147"}}}};
const about=vm.runInNewContext(code.slice(start,end)+"\naboutDialog",scope);
(async()=>{
 await about({ownerDocument:dialogDocument});
 assert(dialog.isConnected&&dialog.open);
 const info=dialog.innerHTML;
 assert(info.indexOf("Авторское право")<info.indexOf("Версия программы"),"copyright must precede version");
 assert(info.includes("© 2026 ТОО «А-Темир Строй»"));
 assert.equal(dialog.versionEl.textContent,"1.7.147");
 await about({ownerDocument:dialogDocument});
 assert.equal(versionRequests,1,"duplicate dialogs should not open");
 dialog.close();assert.equal(dialog.isConnected,false);
 assert(fs.readFileSync("src/styles.css","utf8").includes(".ir-about-dialog"));
 assert(fs.readFileSync("src/tabs-shell.css","utf8").includes(".ir-about-dialog"),"tab-host dialog must be styled");
 assert(fs.readFileSync("src/ir-runtime.js","utf8").includes('id="programAboutButton"'));
 console.log("About dialog: copyright before dynamic version, tab-host DOM, close and duplicate guards OK");
})().catch(e=>{console.error(e);process.exitCode=1});
