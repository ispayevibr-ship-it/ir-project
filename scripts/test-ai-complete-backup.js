"use strict";
/* DEFERRED integration acceptance: real SQLite and synthetic files only.
 * Do not execute this script until the agreed final acceptance stage.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),
 os=require("node:os"),crypto=require("node:crypto"),{DatabaseSync}=require("node:sqlite");
const complete=require("../src/ai-complete-backup");
const sha=data=>crypto.createHash("sha256").update(data).digest("hex");
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"ir-ai-complete-backup-"));
 const data=path.join(root,"userdata"),archive=path.join(root,"complete.ir-backup");
 fs.mkdirSync(data);
 const databasePath=path.join(data,"ir-project.db");
 const docDir=path.join(data,"ir-project-ai","objects","1");
 const imageDir=path.join(data,"images","objects");
 const actDir=path.join(data,"report-documents");
 for(const dir of [docDir,imageDir,actDir])fs.mkdirSync(dir,{recursive:true});
 const stored="a".repeat(32)+".pdf",pdf=Buffer.from("%PDF-1.7\noriginal KMD fixture\n");
 fs.writeFileSync(path.join(docDir,stored),pdf);
 fs.writeFileSync(path.join(imageDir,"object.jpg"),Buffer.from("photo-fixture"));
 fs.writeFileSync(path.join(actDir,"signed-act.pdf"),Buffer.from("%PDF signed act fixture"));
 let db=null;
 const open=()=>{db=new DatabaseSync(databasePath)};
 const close=()=>{if(db){db.close();db=null}};
 open();
 db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);"+
  "INSERT INTO app_meta VALUES('schema_version','4');"+
  "CREATE TABLE object_records(object_id INTEGER,section_key TEXT,record_type TEXT,data_json TEXT);");
 db.prepare("INSERT INTO object_records VALUES (?,?,?,?)").run(
  1,"ai-documents","document",JSON.stringify({
   stored_name:stored,sha256:sha(pdf),size:pdf.length
  }));
 try{
  const created=await complete.pack({userData:data,destination:archive,closeDatabase:close,openDatabase:open});
  assert.equal(created.created,true);
  assert.equal(created.sourceDocuments,1);
  assert.equal(created.files,4,"SQLite, KMD PDF, photo, signed act");
  assert.equal(fs.existsSync(archive),true);
  assert.equal(db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").get().value,"4");
  const inspected=await complete.inspect({archive});
  assert.equal(inspected.sourceDocuments,1);
  assert.equal(inspected.manifest.files.length,4);
  const archiveNames=new Set(inspected.manifest.files.map(x=>x.path));
  assert(archiveNames.has("ir-project.db"));
  assert(archiveNames.has("ir-project-ai/objects/1/"+stored));
  assert(archiveNames.has("images/objects/object.jpg"));
  assert(archiveNames.has("report-documents/signed-act.pdf"));
  fs.writeFileSync(path.join(docDir,stored),Buffer.from("modified document"));
  fs.unlinkSync(path.join(imageDir,"object.jpg"));
  db.exec("DELETE FROM object_records");
  const restored=await complete.restore({
   archive,userData:data,closeDatabase:close,openDatabase:open
  });
  assert.equal(restored.restored,true);
  assert.deepEqual(fs.readFileSync(path.join(docDir,stored)),pdf);
  assert.equal(fs.readFileSync(path.join(imageDir,"object.jpg"),"utf8"),"photo-fixture");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM object_records").get().n,1);
  const corrupt=path.join(root,"corrupt.ir-backup");
  const broken=fs.readFileSync(archive);
  broken[Math.floor(broken.length/2)]^=0xff;
  fs.writeFileSync(corrupt,broken);
  await assert.rejects(complete.restore({
   archive:corrupt,userData:data,closeDatabase:close,openDatabase:open
  }),/SHA-256|ZIP|archive|Архив|архива|контроль|Повреждён|Invalid|invalid|crc|CRC/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM object_records").get().n,1,
   "a damaged archive must not overwrite the live database");
  fs.writeFileSync(path.join(docDir,stored),Buffer.from("tampered original"));
  await assert.rejects(complete.pack({
   userData:data,destination:path.join(root,"bad.ir-backup"),
   closeDatabase:close,openDatabase:open
  }),/отсутствует|SHA-256|оригинал|размер/i);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM object_records").get().n,1,
   "failed backup must reopen original SQLite");
  await assert.rejects(complete.pack({
   userData:data,destination:path.join(data,"inside.ir-backup"),
   closeDatabase:close,openDatabase:open
  }),/вне каталога/);
 }finally{close();fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
