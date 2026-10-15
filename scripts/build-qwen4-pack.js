"use strict";
/* Offline operator CLI. Private signing keys stay outside the repository. */
const {createQwenPack}=require("./ai-pack-publisher");
function parse(args){
 const out={};
 for(let i=0;i<args.length;i++){
  const key=args[i];if(!key.startsWith("--")||!/^--[a-z][a-z0-9-]*$/.test(key))throw Error("Неверный аргумент: "+key);
  if(Object.hasOwn(out,key))throw Error("Повторный аргумент: "+key);
  if(i+1>=args.length||args[i+1].startsWith("--"))throw Error("Нет значения: "+key);
  out[key]=args[++i]
 }
 const expected=["--version","--model","--mmproj","--runtime-dir","--model-sha256","--mmproj-sha256",
  "--binary-sha256","--key-file","--key-id","--out","--gpu-layers","--app-min","--model-revision","--llama-release"];
 for(const key of Object.keys(out))if(!expected.includes(key))throw Error("Неизвестный аргумент: "+key);
 for(const key of expected.slice(0,10))if(!out[key])throw Error("Обязательный аргумент: "+key);
 return out
}
async function main(args=process.argv.slice(2)){
 const a=parse(args);
 const result=await createQwenPack({
  version:a["--version"],modelFile:a["--model"],visionFile:a["--mmproj"],
  runtimeDir:a["--runtime-dir"],modelSha256:a["--model-sha256"],
  visionSha256:a["--mmproj-sha256"],binarySha256:a["--binary-sha256"],
  keyFile:a["--key-file"],keyId:a["--key-id"],output:a["--out"],
  gpuLayers:a["--gpu-layers"]?Number(a["--gpu-layers"]):0,
  minAppVersion:a["--app-min"]||"1.7.214",
  upstream:{modelRepository:"Qwen/Qwen3-VL-4B-Instruct-GGUF",
   modelRevision:a["--model-revision"]||"",
   runtimeRepository:"ggml-org/llama.cpp",runtimeRelease:a["--llama-release"]||""}
 });
 console.log("IR Project AI: проверенный офлайн-пакет готов");
 console.log("Файл:",result.path);
 console.log("Размер (байт):",result.bytes);
 console.log("SHA-256 ZIP:",result.sha256);
 console.log("Версия:",result.version,"издатель:",result.keyId);
 console.log("SHA-256 открытого ключа Ed25519:",result.publicKeyFingerprint);
 console.log("ВНИМАНИЕ: публичный ключ издателя должен быть отдельно утверждён и встроен в следующую подписанную версию IR Project. Без него пакет не установится.");
}
if(require.main===module)main().catch(err=>{console.error("Ошибка упаковки:",err.message);process.exitCode=1});
module.exports={parse,main};
