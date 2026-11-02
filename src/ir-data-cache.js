"use strict";
/*
 * IR Project: one read of the program's data for all the pieces of a page.
 *
 * A page of an object is drawn by many independent parts (cards, charts, the sidebar, the filters…), and each of them
 * asked the main process for the same lists on its own: opening an object read the daily reports 6 times, the work
 * types 7 times, the marks 4 times. Every read stops the main process of the program (the database there answers
 * synchronously), and while it is stopped the window does not take clicks — the program «подвисает» at every change of
 * page (the engineer 02.11.2026). Here the reads made at the same moment are joined into one, and a list read a moment
 * ago is given again from memory. Any change made through the program (create, update, remove, recognition, import)
 * forgets what was kept, and nothing is kept longer than a few seconds, so a page never shows old data.
 * Every caller gets its own copy: a page may sort or change what it got without touching the others.
 */
(()=>{
 if(window.irProjectFast)return;
 let raw=null;try{raw=window.irProject||window.opener?.irProject||null}catch{raw=null}
 if(!raw?.data?.objects)return;
 const TTL=4000,IMAGE_LIMIT=48e6;
 const kept=new Map();
 const clone=v=>{if(v===null||typeof v!=="object")return v;try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))}};
 const stats={asked:0,read:0};
 function cached(key,read){
  stats.asked++;
  const now=Date.now(),hit=kept.get(key);
  if(hit&&(hit.pending||now-hit.at<TTL))return hit.promise.then(clone);
  stats.read++;
  const entry={at:now,pending:true,promise:null};
  entry.promise=Promise.resolve().then(read).then(v=>{entry.pending=false;entry.at=Date.now();return v},e=>{if(kept.get(key)===entry)kept.delete(key);throw e});
  kept.set(key,entry);
  return entry.promise.then(clone)
 }
 const forget=prefix=>{if(!prefix){kept.clear();return}for(const k of [...kept.keys()])if(k.startsWith(prefix))kept.delete(k)};
 // A change: what was kept of this part is forgotten before and after it (a read started meanwhile is not trusted).
 const changing=(prefixes,run)=>{prefixes.forEach(forget);const done=()=>prefixes.forEach(forget);return Promise.resolve().then(run).then(v=>{done();return v},e=>{done();throw e})};
 const objectPart=id=>"o:"+String(id)+":";
 const section=(oid,key)=>{
  const api=raw.data.forObject(oid).section(key),pre=objectPart(oid)+"s:"+key+":";
  // The object list shows figures of every section of an object: a change in one section forgets those too.
  const parts=[pre,"objects:"];
  return{
   list:()=>cached(pre+"list",()=>api.list()),
   get:id=>api.get(id),
   create:data=>changing(parts,()=>api.create(data)),
   update:(id,data)=>changing(parts,()=>api.update(id,data)),
   remove:id=>changing(parts,()=>api.remove(id))
  }
 };
 const objects={...raw.data.objects,
  list:()=>cached("objects:list",()=>raw.data.objects.list()),
  get:id=>cached("objects:get:"+String(id),()=>raw.data.objects.get(id)),
  create:data=>changing(["objects:"],()=>raw.data.objects.create(data)),
  update:(id,data)=>changing(["objects:",objectPart(id)],()=>raw.data.objects.update(id,data)),
  remove:id=>changing(["objects:",objectPart(id)],()=>raw.data.objects.remove(id))
 };
 const sections={...raw.data.sections,
  get:id=>cached(objectPart(id)+"sections",()=>raw.data.sections.get(id)),
  set:(objectId,key,enabled)=>changing([objectPart(objectId)+"sections"],()=>raw.data.sections.set(objectId,key,enabled)),
  create:(objectId,key,title,settings)=>changing([objectPart(objectId)+"sections"],()=>raw.data.sections.create(objectId,key,title,settings))
 };
 // Pictures are files that never change under the same name: kept while they fit, the oldest let go first.
 const images=new Map();let imageBytes=0;
 const imageApi={...raw.images,
  read:file=>{
   const k=String(file||"");if(!k)return raw.images.read(file);
   const hit=images.get(k);if(hit){images.delete(k);images.set(k,hit);return hit}
   const p=Promise.resolve(raw.images.read(file)).then(url=>{
    const size=typeof url==="string"?url.length:0;
    if(typeof url!=="string"||size>IMAGE_LIMIT/4){if(images.get(k)===p)images.delete(k);return url}
    imageBytes+=size;p.size=size;
    for(const [key,old] of images){if(imageBytes<=IMAGE_LIMIT)break;if(key===k)continue;imageBytes-=old.size||0;images.delete(key)}
    return url},e=>{if(images.get(k)===p)images.delete(k);throw e});
   images.set(k,p);return p
  },
  remove:file=>{const k=String(file||""),hit=images.get(k);if(hit){imageBytes-=hit.size||0;images.delete(k)}return raw.images.remove(file)},
  optimize:(file,type)=>{const k=String(file||""),hit=images.get(k);if(hit){imageBytes-=hit.size||0;images.delete(k)}return raw.images.optimize(file,type)}
 };
 // Calls that change data in the main process itself (recognition, placement, import, restore): everything is forgotten.
 const forgetAfter=fn=>typeof fn==="function"?(...a)=>changing([""],()=>fn(...a)):fn;
 const wrapAll=(group,keepReads=[])=>{if(!group||typeof group!=="object")return group;const out={};for(const k of Object.keys(group))out[k]=keepReads.includes(k)?group[k]:forgetAfter(group[k]);return out};
 const data={...raw.data,objects,sections,forObject:oid=>({section:key=>section(oid,key),records:key=>section(oid,key)})};
 const fast={...raw,objects,sections,data,images:imageApi,
  aiMontage:wrapAll(raw.aiMontage,["latest","onProgress"]),
  aiDocuments:wrapAll(raw.aiDocuments,["list","sheets","preview","open"]),
  ai:raw.ai?{...raw.ai,invoke:(channel,payload)=>/^ai-(montage|documents):(?!(element-card|control|chat-|journal-list|training)\b)/.test(String(channel))?changing([""],()=>raw.ai.invoke(channel,payload)):raw.ai.invoke(channel,payload)}:raw.ai,
  marksExcel:wrapAll(raw.marksExcel),
  backup:raw.backup?{...raw.backup,restore:forgetAfter(raw.backup.restore)}:raw.backup,
  dataCache:{forget:()=>forget(""),stats:()=>({...stats,kept:kept.size,images:images.size,imageBytes})}
 };
 window.irProjectFast=fast;
})();
