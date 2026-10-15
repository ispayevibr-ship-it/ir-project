"use strict";
/* Generate a publisher identity OFFLINE on the trusted operator computer.
 * Never commit the private key. The public key is reviewed separately before
 * embedding in src/ai-model-manager.js. No network or model execution. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function createPublisherIdentity(outputDir,keyId){
 if(!/^[A-Za-z0-9_.-]{1,70}$/.test(keyId||""))throw Error("Invalid key ID");
 const dir=path.resolve(outputDir||"");
 if(!outputDir||!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw Error("Existing private output directory required");
 const privatePath=path.join(dir,keyId+".private.pem");
 const publicPath=path.join(dir,keyId+".public.pem");
 const receiptPath=path.join(dir,keyId+".fingerprint.txt");
 for(const p of [privatePath,publicPath,receiptPath])if(fs.existsSync(p))throw Error("Refusing to overwrite: "+p);
 const {privateKey,publicKey}=crypto.generateKeyPairSync("ed25519");
 const priv=privateKey.export({format:"pem",type:"pkcs8"});
 const pub=publicKey.export({format:"pem",type:"spki"});
 const fingerprint=crypto.createHash("sha256").update(publicKey.export({format:"der",type:"spki"})).digest("hex");
 const created=[];
 try{
  fs.writeFileSync(privatePath,priv,{flag:"wx",mode:0o600});created.push(privatePath);
  fs.writeFileSync(publicPath,pub,{flag:"wx",mode:0o600});created.push(publicPath);
  fs.writeFileSync(receiptPath,"keyId="+keyId+"\nsha256-spki="+fingerprint+"\n",{flag:"wx",mode:0o600});created.push(receiptPath);
 }catch(e){for(const p of created)try{fs.rmSync(p,{force:true})}catch{}throw e}
 return{keyId,publicPath,fingerprint,privatePath};
}
if(require.main===module){
 try{
  if(process.argv.length!==4)throw Error("Usage: node scripts/ai-publisher-keygen.js <existing-private-dir> <key-id>");
  const result=createPublisherIdentity(process.argv[2],process.argv[3]);
  console.log("Public key:",result.publicPath);
  console.log("SHA-256 SPKI fingerprint:",result.fingerprint);
  console.log("Private key created outside the repository. NEVER upload, print, or commit it.");
 }catch(e){console.error(e.message);process.exitCode=1}
}
module.exports={createPublisherIdentity};
