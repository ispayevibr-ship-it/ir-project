"use strict";
/* Developer-controlled, offline PaddleOCR package builder. No network calls. */
const {createPaddlePack}=require("./ai-paddleocr-pack-publisher");
function parse(args){
 const values={};
 const allowed=new Set(["--version","--worker","--worker-sha256","--layout-dir",
  "--layout-pins","--vision-dir","--vision-pins","--key-file","--key-id",
  "--out","--app-min","--paddleocr-version","--paddlepaddle-version","--model-revision"]);
 for(let i=0;i<args.length;i++){
  const key=args[i];
  if(!allowed.has(key)||Object.hasOwn(values,key)||i+1===args.length||args[i+1].startsWith("--"))
   throw Error("Неизвестный или повторяющийся аргумент: "+key);
  values[key]=args[++i]
 }
 for(const key of ["--version","--worker","--worker-sha256","--layout-dir",
  "--layout-pins","--vision-dir","--vision-pins","--key-file","--key-id","--out"])
  if(!values[key])throw Error("Обязательный аргумент: "+key);
 return values
}
async function main(args=process.argv.slice(2)){
 const o=parse(args);
 const result=await createPaddlePack({
  version:o["--version"],workerFile:o["--worker"],workerSha256:o["--worker-sha256"],
  layoutDir:o["--layout-dir"],layoutPinsFile:o["--layout-pins"],
  visionDir:o["--vision-dir"],visionPinsFile:o["--vision-pins"],
  keyFile:o["--key-file"],keyId:o["--key-id"],output:o["--out"],
  minAppVersion:o["--app-min"]||"1.7.214",
  upstream:{paddleocrVersion:o["--paddleocr-version"]||"",
   paddlepaddleVersion:o["--paddlepaddle-version"]||"",
   modelRevision:o["--model-revision"]||""}
 });
 console.log("Подписанный офлайн-пакет PaddleOCR подготовлен:",result.path);
 console.log("Размер, байт:",result.bytes);
 console.log("SHA-256 ZIP:",result.sha256);
 console.log("SHA-256 публичного ключа:",result.publicKeyFingerprint);
 console.log("Публикация запрещена до установки доверенного публичного ключа в IR Project и реальных испытаний.")
}
if(require.main===module)main().catch(e=>{console.error("PaddleOCR-пакет не создан:",e.message);process.exitCode=1});
module.exports={parse,main};
